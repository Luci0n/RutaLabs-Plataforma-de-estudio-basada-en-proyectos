"use server";

import { createClient } from "@/lib/supabase/server";
import type { ReviewRating, PracticeCard, ReviewState } from "@/lib/types/study";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function err<T>(message: string): ActionResult<T> {
  return { ok: false, error: message };
}
function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function addMinutes(d: Date, minutes: number) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + minutes);
  return x;
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Algoritmo SR (4 ratings) estilo Anki simplificado:
 * - again: 10 minutos, lapses++, state=learning/relearning
 * - hard/good/easy: pasan a review con intervalos y ajuste de ease
 */
function computeNext(input: {
  rating: ReviewRating;
  state: ReviewState;
  interval_days: number;
  ease: number;
  reps: number;
  lapses: number;
  now: Date;
}) {
  const { rating, state } = input;
  let interval_days = input.interval_days ?? 0;
  let ease = input.ease ?? 2.5;
  let reps = input.reps ?? 0;
  let lapses = input.lapses ?? 0;

  let nextState: ReviewState = state;
  let nextDue = new Date(input.now);

  const inLearning = state === "new" || state === "learning" || state === "relearning";

  if (rating === "again") {
    lapses += 1;
    // si venía de review, cae a relearning
    nextState = state === "review" ? "relearning" : "learning";
    interval_days = 0;
    ease = clamp(ease - 0.2, 1.3, 3.0);
    nextDue = addMinutes(input.now, 10);
    return { nextState, interval_days, ease, reps, lapses, nextDue };
  }

  if (inLearning) {
    // salida de learning hacia review (simple y consistente)
    if (rating === "hard") {
      nextState = "learning";
      nextDue = addMinutes(input.now, 60); // 1 hora
      return { nextState, interval_days: 0, ease: clamp(ease - 0.15, 1.3, 3.0), reps, lapses, nextDue };
    }
    if (rating === "good") {
      nextState = "review";
      reps += 1;
      interval_days = 1;
      nextDue = addDays(input.now, 1);
      return { nextState, interval_days, ease, reps, lapses, nextDue };
    }
    // easy
    nextState = "review";
    reps += 1;
    interval_days = 3;
    ease = clamp(ease + 0.15, 1.3, 3.0);
    nextDue = addDays(input.now, 3);
    return { nextState, interval_days, ease, reps, lapses, nextDue };
  }

  // state === 'review'
  nextState = "review";

  if (interval_days <= 0) interval_days = 1;

  if (rating === "hard") {
    ease = clamp(ease - 0.15, 1.3, 3.0);
    interval_days = Math.max(1, Math.floor(interval_days * 1.2));
    nextDue = addDays(input.now, interval_days);
    return { nextState, interval_days, ease, reps, lapses, nextDue };
  }

  if (rating === "good") {
    reps += 1;
    interval_days = Math.max(1, Math.floor(interval_days * ease));
    nextDue = addDays(input.now, interval_days);
    return { nextState, interval_days, ease, reps, lapses, nextDue };
  }

  // easy
  reps += 1;
  ease = clamp(ease + 0.15, 1.3, 3.0);
  interval_days = Math.max(1, Math.floor(interval_days * ease * 1.3));
  nextDue = addDays(input.now, interval_days);
  return { nextState, interval_days, ease, reps, lapses, nextDue };
}

/**
 * Inicia práctica por grupo:
 * - crea review_state faltantes (lazy init)
 * - retorna cola ordenada y contadores
 */
export async function startPracticeForGroup(args: {
  project_id: string;
  group_id: string;
  limit?: number;
}): Promise<ActionResult<{ cards: PracticeCard[]; dueCount: number; newCount: number }>> {
  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return err("No autenticado.");
  const userId = userRes.user.id;

  const limit = Math.max(1, Math.min(args.limit ?? 50, 200));

  // 1) cards del grupo
  const { data: cards, error: cErr } = await supabase
    .from("flashcards")
    .select("id,group_id,front,back,order_index")
    .eq("group_id", args.group_id)
    .eq("project_id", args.project_id)
    .order("order_index", { ascending: true });

  if (cErr) return err(cErr.message);
  const cardRows = cards ?? [];
  if (cardRows.length === 0) return ok({ cards: [], dueCount: 0, newCount: 0 });

  // 2) lazy init review_state
  // Insert masivo con on conflict do nothing
  const payload = cardRows.map((c) => ({
    user_id: userId,
    card_id: c.id,
    // defaults (due ahora, state new)
    due_at: new Date().toISOString(),
    state: "new",
    interval_days: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  }));

  const { error: insErr } = await supabase
    .from("flashcard_review_state")
    .upsert(payload, { onConflict: "user_id,card_id", ignoreDuplicates: true });

  if (insErr) return err(insErr.message);

  // 3) traemos estados + cards (join manual)
  const { data: st, error: stErr } = await supabase
    .from("flashcard_review_state")
    .select("card_id,due_at,state,interval_days,ease,reps,lapses")
    .eq("user_id", userId)
    .in("card_id", cardRows.map((x) => x.id));

  if (stErr) return err(stErr.message);

    const stateByCard = new Map<string, typeof st[0]>();
    for (const s of st ?? []) stateByCard.set(s.card_id, s);

  const now = new Date();

  const merged: PracticeCard[] = cardRows.map((c) => {
    const s = stateByCard.get(c.id);
    return {
      id: c.id,
      group_id: c.group_id,
      front: c.front,
      back: c.back,
      order_index: c.order_index,

      due_at: s?.due_at ?? new Date().toISOString(),
      state: (s?.state ?? "new") as ReviewState,
      interval_days: s?.interval_days ?? 0,
      ease: Number(s?.ease ?? 2.5),
    };
  });

  const due = merged.filter((x) => new Date(x.due_at) <= now);
  const newOnes = merged.filter((x) => x.state === "new");

  // Orden:
  // 1) vencidas primero (due_at asc)
  // 2) luego no vencidas (due_at asc)
  // 3) y como desempate order_index
  merged.sort((a, b) => {
    const ad = new Date(a.due_at).getTime();
    const bd = new Date(b.due_at).getTime();

    const aDue = ad <= now.getTime();
    const bDue = bd <= now.getTime();
    if (aDue !== bDue) return aDue ? -1 : 1;

    if (ad !== bd) return ad - bd;
    return a.order_index - b.order_index;
  });

  return ok({
    cards: merged.slice(0, limit),
    dueCount: due.length,
    newCount: newOnes.length,
  });
}

/**
 * Envía respuesta de repaso (rating) y devuelve el nuevo estado.
 */
export async function submitReview(args: {
  card_id: string;
  rating: ReviewRating;
}): Promise<ActionResult<{ next_due_at: string; next_state: ReviewState; interval_days: number; ease: number }>> {
  const supabase = await createClient();

  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return err("No autenticado.");
  const userId = userRes.user.id;

  // Estado actual
  const { data: cur, error: curErr } = await supabase
    .from("flashcard_review_state")
    .select("user_id,card_id,due_at,state,interval_days,ease,reps,lapses")
    .eq("user_id", userId)
    .eq("card_id", args.card_id)
    .maybeSingle();

  if (curErr) return err(curErr.message);
  if (!cur) return err("Estado de repaso no encontrado (¿faltó init?).");

  const now = new Date();

  const next = computeNext({
    rating: args.rating,
    state: cur.state as ReviewState,
    interval_days: cur.interval_days ?? 0,
    ease: Number(cur.ease ?? 2.5),
    reps: cur.reps ?? 0,
    lapses: cur.lapses ?? 0,
    now,
  });

  // Update estado
  const { error: upErr } = await supabase
    .from("flashcard_review_state")
    .update({
      due_at: next.nextDue.toISOString(),
      state: next.nextState,
      interval_days: next.interval_days,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      last_review_at: now.toISOString(),
    })
    .eq("user_id", userId)
    .eq("card_id", args.card_id);

  if (upErr) return err(upErr.message);

  // Log (opcional, pero recomendado)
  const { error: logErr } = await supabase.from("flashcard_review_log").insert({
    user_id: userId,
    card_id: args.card_id,
    rating: args.rating,
    prev_state: cur.state,
    next_state: next.nextState,
    prev_due_at: cur.due_at,
    next_due_at: next.nextDue.toISOString(),
    prev_interval_days: cur.interval_days,
    next_interval_days: next.interval_days,
    prev_ease: cur.ease,
    next_ease: next.ease,
  });

  // Si falla el log, no rompemos UX
  void logErr;

  return ok({
    next_due_at: next.nextDue.toISOString(),
    next_state: next.nextState,
    interval_days: next.interval_days,
    ease: next.ease,
  });
}
