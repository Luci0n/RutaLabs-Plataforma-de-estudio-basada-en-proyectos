"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { PracticeCard, ReviewRating, ReviewState } from "@/lib/types/study";
import { startPracticeForGroup, submitReview } from "@/app/protected/projects/[projectId]/practice-actions";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type PracticeMode = "due" | "all";

function Markdown(props: { md: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-7 prose-a:break-words prose-code:break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.md}</ReactMarkdown>
    </div>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  groupId: string;
  groupTitle?: string;
  mode?: PracticeMode;
};

type SessionSnapshot = {
  v: 2;
  savedAt: number;
  projectId: string;
  groupId: string;
  mode: PracticeMode;
  idx: number;
  flipped: boolean;
  initialCount: number; // para distinguir "terminada" vs "no había nada"
  queue: PracticeCard[];
};

function sessionKey(projectId: string, groupId: string) {
  return `practice_session:v2:${projectId}:${groupId}`;
}

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isLearningState(s: ReviewState) {
  return s === "new" || s === "learning" || s === "relearning";
}

export function PracticeOverlay({ open, onClose, projectId, groupId, groupTitle, mode: modeProp }: Props) {
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<PracticeCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modo de práctica (agenda vs repaso libre)
  const [mode, setMode] = useState<PracticeMode>(modeProp ?? "due");

  // Cuenta inicial de la sesión, para diferenciar:
  // - "No había nada vencido" (initialCount=0, mode=due)
  // - "Sesión terminada" (initialCount>0 y ya no hay cola)
  const [initialCount, setInitialCount] = useState(0);

  // Para evitar que el “load al abrir” corra dos veces por re-render
  const didOpenRef = useRef(false);

  const current = idx < queue.length ? queue[idx] : null;

  const headerText = useMemo(() => {
    const total = initialCount > 0 ? initialCount : queue.length;
    const pos = initialCount > 0 ? Math.min(idx + 1, total) : (queue.length ? Math.min(idx + 1, queue.length) : 0);
    return `${pos}/${total || 0}`;
  }, [idx, queue.length, initialCount]);

  const isSessionFinished = initialCount > 0 && queue.length === 0 && !loading && !error;

  function saveSession(next?: Partial<SessionSnapshot>) {
    const snap: SessionSnapshot = {
      v: 2,
      savedAt: Date.now(),
      projectId,
      groupId,
      mode,
      idx,
      flipped,
      initialCount,
      queue,
      ...next,
    };
    try {
      localStorage.setItem(sessionKey(projectId, groupId), JSON.stringify(snap));
    } catch {
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(sessionKey(projectId, groupId));
    } catch {}
  }

  function tryRestoreSession(): boolean {
    const snap = safeParse<SessionSnapshot>(localStorage.getItem(sessionKey(projectId, groupId)));
    if (!snap) return false;
    if (snap.v !== 2) return false;
    if (snap.projectId !== projectId || snap.groupId !== groupId) return false;

    // Sesión “fresca”: 6 horas
    const ageMs = Date.now() - (snap.savedAt ?? 0);
    if (ageMs > 6 * 60 * 60 * 1000) return false;

    if (!Array.isArray(snap.queue)) return false;

    setMode(snap.mode ?? (modeProp ?? "due"));
    setQueue(snap.queue);
    setInitialCount(Number(snap.initialCount ?? snap.queue.length ?? 0));
    setIdx(Math.max(0, Math.min(snap.idx ?? 0, snap.queue.length)));
    setFlipped(Boolean(snap.flipped));
    return true;
  }

  async function loadFresh(nextMode: PracticeMode = mode) {
    setLoading(true);
    setError(null);

    try {
      // IMPORTANTE: backend idealmente soporta "mode"
    const res = await startPracticeForGroup({
    project_id: projectId,
    group_id: groupId,
    limit: 80,
    mode: nextMode,
    } as Omit<Parameters<typeof startPracticeForGroup>[0], "mode"> & { mode: string });
      if (!res.ok) throw new Error(res.error);

      const cards: PracticeCard[] = res.data.cards ?? [];

      setMode(nextMode);
      setQueue(cards);
      setInitialCount(cards.length);
      setIdx(0);
      setFlipped(false);

      saveSession({
        mode: nextMode,
        idx: 0,
        flipped: false,
        queue: cards,
        initialCount: cards.length,
        savedAt: Date.now(),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al iniciar práctica.");
    } finally {
      setLoading(false);
    }
  }

  async function rate(rating: ReviewRating) {
    if (!current) return;

    setLoading(true);
    setError(null);

    try {
      const res = await submitReview({ card_id: current.id, rating });
      if (!res.ok) throw new Error(res.error);

      const now = Date.now();
      const nextDueMs = new Date(res.data.next_due_at).getTime();
      const nextState = res.data.next_state as ReviewState;

      const dueSoon = Number.isFinite(nextDueMs) ? nextDueMs <= now + 30 * 60 * 1000 : false; // 30 min
      const shouldRequeue = rating === "again" || isLearningState(nextState) || dueSoon;

      const gap = rating === "again" ? 4 : rating === "hard" ? 8 : 0;

      setFlipped(false);

      setQueue((curQ) => {
        const curIdx = idx;
        const q = [...curQ];

        if (!q[curIdx] || q[curIdx].id !== current.id) {
          return curQ;
        }

        const [removed] = q.splice(curIdx, 1);

        if (shouldRequeue) {
          const reinsertAt = Math.min(curIdx + Math.max(1, gap), q.length);
          q.splice(reinsertAt, 0, {
            ...removed,
            due_at: res.data.next_due_at,
            state: nextState,
            interval_days: res.data.interval_days,
            ease: res.data.ease,
          });
        }

        const nextIdx = Math.min(curIdx, Math.max(0, q.length - 1));
        // Si q quedó vacío, nextIdx no importa, pero lo normalizamos a 0
        setIdx(q.length === 0 ? 0 : nextIdx);

        saveSession({
          queue: q,
          idx: q.length === 0 ? 0 : nextIdx,
          flipped: false,
          savedAt: Date.now(),
        });

        return q;
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al guardar el repaso.");
    } finally {
      setLoading(false);
    }
  }

  // Abrir: si cambia modeProp entre aperturas, lo respetamos en la nueva sesión.
  useEffect(() => {
    if (!open) return;
    setMode(modeProp ?? "due");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modeProp, projectId, groupId]);

  // Abrir: restaurar sesión si existe; si no, cargar fresh.
  useEffect(() => {
    if (!open) {
      didOpenRef.current = false;
      return;
    }

    if (didOpenRef.current) return;
    didOpenRef.current = true;

    const restored = tryRestoreSession();
    if (!restored) {
      void loadFresh(modeProp ?? "due");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, groupId]);

  // Guardar sesión en cambios relevantes
  useEffect(() => {
    if (!open) return;
    saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, flipped, queue.length, mode, initialCount]);

  // Atajos de teclado
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((x) => !x);
        return;
      }
      if (!flipped) return;

      if (e.key === "1") return void rate("again");
      if (e.key === "2") return void rate("hard");
      if (e.key === "3") return void rate("good");
      if (e.key === "4") return void rate("easy");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flipped, current?.id]);

  if (!open) return null;

  const showEmptyDue = !loading && !error && initialCount === 0 && mode === "due";
  const showEmptyAll = !loading && !error && initialCount === 0 && mode === "all";

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => {
            saveSession();
            onClose();
          }}
        />

        {/* Panel */}
        <div className="absolute inset-0 mx-auto flex max-w-3xl flex-col gap-3 p-4">
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Practicando{groupTitle ? `: ${groupTitle}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {headerText} · {mode === "due" ? "Agenda" : "Repaso"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" aria-label="Ayuda">
                      ?
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm text-xs">
                    <p className="font-medium">Cómo funciona</p>
                    <p className="mt-1">
                      Primero mira el <b>Frente</b>. Luego “Mostrar respuesta” para ver el <b>Reverso</b>.
                      Elige una opción:
                    </p>
                    <ul className="mt-2 list-disc pl-4 space-y-1">
                      <li><b>Otra vez</b>: no la recordaste. Volverá a salir pronto.</li>
                      <li><b>Difícil</b>: la recordaste con esfuerzo. Puede reaparecer antes.</li>
                      <li><b>Bien</b>: correcta normal. Se agenda para más adelante.</li>
                      <li><b>Fácil</b>: muy fácil. Se agenda para más adelante (más lejos).</li>
                    </ul>
                    <p className="mt-2">
                      <b>Recargar</b> reinicia la cola del modo actual (tu progreso queda guardado).
                    </p>
                    <p className="mt-1">
                      Atajos: <b>Espacio</b> voltear · <b>1-4</b> responder · <b>Esc</b> cerrar.
                    </p>
                  </TooltipContent>
                </Tooltip>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={loading}
                  onClick={() => {
                    clearSession();
                    void loadFresh(mode);
                  }}
                >
                  Recargar
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    saveSession();
                    onClose();
                  }}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-xl border bg-card p-4 shadow-sm overflow-auto">
            {error ? (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {loading && queue.length === 0 ? (
              <div className="h-60 animate-pulse rounded-lg border bg-muted/30" />
            ) : null}

            {/* Caso: modo agenda pero no hay vencidas */}
            {showEmptyDue ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">No hay tarjetas vencidas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este grupo no tiene tarjetas programadas para ahora. Puedes hacer un repaso extra si quieres.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => {
                      clearSession();
                      void loadFresh("all");
                    }}
                  >
                    Repasar todo (extra)
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Caso: modo all y aun así no hay cards */}
            {showEmptyAll ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Sin tarjetas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este grupo no tiene cartas.
                </p>
              </div>
            ) : null}

            {isSessionFinished ? (
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Sesión terminada</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ya no quedan tarjetas en la cola actual.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={loading}
                    onClick={() => {
                      clearSession();
                      void loadFresh(mode);
                    }}
                  >
                    Repetir sesión (recargar)
                  </Button>

                  {mode === "due" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={loading}
                      onClick={() => {
                        clearSession();
                        void loadFresh("all");
                      }}
                    >
                      Repasar todo (extra)
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {current ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Frente</p>
                  <div className="mt-2">
                    <Markdown md={current.front} />
                  </div>
                </div>

                {flipped ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Reverso</p>
                    <div className="mt-2">
                      <Markdown md={current.back} />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center pt-2">
                    <Button type="button" disabled={loading} onClick={() => setFlipped(true)}>
                      Mostrar respuesta (Espacio)
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Respuestas */}
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {flipped ? "Elige una respuesta:" : "Voltea la carta para responder."}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={!flipped || loading || !current} onClick={() => rate("again")}>
                  1 · Otra vez
                </Button>
                <Button type="button" variant="secondary" disabled={!flipped || loading || !current} onClick={() => rate("hard")}>
                  2 · Difícil
                </Button>
                <Button type="button" variant="secondary" disabled={!flipped || loading || !current} onClick={() => rate("good")}>
                  3 · Bien
                </Button>
                <Button type="button" variant="secondary" disabled={!flipped || loading || !current} onClick={() => rate("easy")}>
                  4 · Fácil
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
