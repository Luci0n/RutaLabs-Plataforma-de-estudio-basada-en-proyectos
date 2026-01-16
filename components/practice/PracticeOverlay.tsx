"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import { BookOpen, CalendarClock, PenLine, HelpCircle, RotateCcw, X, Undo2, Info } from "lucide-react";

import type { PracticeCard, ReviewRating, ReviewState } from "@/lib/types/study";
import { startPracticeForGroup, submitReview } from "@/app/protected/projects/[projectId]/practice-actions";

type PracticeMode = "due" | "all";
type Metodo = "clasico" | "escritura";

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

type UndoSnap = {
  queue: PracticeCard[];
  idx: number;
  flipped: boolean;
  reviewedCount: number;
};

type SessionSnapshot = {
  v: 5;
  savedAt: number;
  projectId: string;
  groupId: string;

  mode: PracticeMode;
  metodo: Metodo;

  idx: number;
  flipped: boolean;

  initialCount: number;
  reviewedCount: number;

  queue: PracticeCard[];

  // En agenda = true fijo. En repaso = opcional.
  guardarEnSrs: boolean;

  undo?: UndoSnap;
};

function sessionKey(projectId: string, groupId: string) {
  return `practice_session:v5:${projectId}:${groupId}`;
}

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function esAprendizaje(s: ReviewState) {
  return s === "new" || s === "learning" || s === "relearning";
}

function etiquetaEstado(state: string | null | undefined) {
  const s = (state ?? "").toLowerCase();
  if (s === "new") return "nueva";
  if (s === "learning") return "aprendiendo";
  if (s === "relearning") return "reaprendiendo";
  if (s === "review") return "repaso";
  return s ? s : "—";
}

function normAnswer(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function PracticeOverlay({ open, onClose, projectId, groupId, groupTitle, mode: modeProp }: Props) {
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<PracticeCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<PracticeMode>(modeProp ?? "due");
  const [metodo, setMetodo] = useState<Metodo>("clasico");

  const [guardarEnSrs, setGuardarEnSrs] = useState(true);

  const [initialCount, setInitialCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);

  const [respuesta, setRespuesta] = useState("");
  const respuestaNorm = useMemo(() => normAnswer(respuesta), [respuesta]);

  const [undo, setUndo] = useState<UndoSnap | null>(null);

  const didOpenRef = useRef(false);

  const current = idx < queue.length ? queue[idx] : null;

  const cardKey = useMemo(() => current?.id ?? "none", [current?.id]);

  const total = initialCount || 0;
  const hecho = clamp(reviewedCount, 0, total);
  const pct = total > 0 ? Math.round((hecho / total) * 100) : 0;

  const headerText = useMemo(() => {
    if (!total) return "0/0";
    const pos = clamp(hecho + 1, 1, total);
    return `${pos}/${total}`;
  }, [hecho, total]);

  const showEmptyDue = !loading && !error && initialCount === 0 && mode === "due";
  const showEmptyAll = !loading && !error && initialCount === 0 && mode === "all";

  const isSessionFinished = initialCount > 0 && queue.length === 0 && !loading && !error;

  const contextoModo = useMemo(() => {
    if (mode === "due") {
      return "Agenda: tarjetas vencidas (esto sí afecta tu programación).";
    }
    return guardarEnSrs
      ? "Repaso: práctica extra guardando en agenda (afecta tu programación)."
      : "Repaso: práctica extra sin guardar (no afecta tu agenda).";
  }, [mode, guardarEnSrs]);

  function saveSession(next?: Partial<SessionSnapshot>) {
    const snap: SessionSnapshot = {
      v: 5,
      savedAt: Date.now(),
      projectId,
      groupId,
      mode,
      metodo,
      idx,
      flipped,
      initialCount,
      reviewedCount,
      queue,
      guardarEnSrs,
      undo: undo ?? undefined,
      ...next,
    };
    try {
      localStorage.setItem(sessionKey(projectId, groupId), JSON.stringify(snap));
    } catch {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(sessionKey(projectId, groupId));
    } catch {}
  }

  function tryRestoreSession(): boolean {
    const snap = safeParse<SessionSnapshot>(localStorage.getItem(sessionKey(projectId, groupId)));
    if (!snap) return false;
    if (snap.v !== 5) return false;
    if (snap.projectId !== projectId || snap.groupId !== groupId) return false;

    const ageMs = Date.now() - (snap.savedAt ?? 0);
    if (ageMs > 6 * 60 * 60 * 1000) return false;

    if (!Array.isArray(snap.queue)) return false;

    const restoredMode = snap.mode ?? (modeProp ?? "due");
    setMode(restoredMode);
    setMetodo(snap.metodo ?? "clasico");

    setQueue(snap.queue);
    setInitialCount(Number(snap.initialCount ?? snap.queue.length ?? 0));
    setReviewedCount(Number(snap.reviewedCount ?? 0));

    const nextIdx = snap.queue.length === 0 ? 0 : clamp(snap.idx ?? 0, 0, snap.queue.length - 1);
    setIdx(nextIdx);
    setFlipped(Boolean(snap.flipped));

    // Agenda: fuerza guardado
    const g = restoredMode === "due" ? true : Boolean(snap.guardarEnSrs);
    setGuardarEnSrs(g);

    setUndo(snap.undo ?? null);
    setRespuesta("");

    return true;
  }

  async function loadFresh(nextMode: PracticeMode = mode) {
    setLoading(true);
    setError(null);

    try {
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
      setReviewedCount(0);
      setIdx(0);

      setFlipped(false);
      setRespuesta("");

      // Agenda: siempre. Repaso: por defecto NO guardar (más seguro/entendible).
      const g = nextMode === "due" ? true : false;
      setGuardarEnSrs(g);

      setUndo(null);

      saveSession({
        mode: nextMode,
        idx: 0,
        flipped: false,
        queue: cards,
        initialCount: cards.length,
        reviewedCount: 0,
        guardarEnSrs: g,
        undo: undefined,
        savedAt: Date.now(),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al iniciar práctica.");
    } finally {
      setLoading(false);
    }
  }

  function pushUndo(snap: UndoSnap) {
    setUndo(snap);
    saveSession({ undo: snap, savedAt: Date.now() });
  }

  function undoLast() {
    const snap = safeParse<SessionSnapshot>(localStorage.getItem(sessionKey(projectId, groupId)));
    const u = snap?.undo;
    if (!u) return;

    setQueue(u.queue);
    setIdx(u.idx);
    setFlipped(u.flipped);
    setReviewedCount(u.reviewedCount);
    setRespuesta("");
    setUndo(null);

    saveSession({ undo: undefined, savedAt: Date.now() });
  }

  function aplicarRespuestaLocal(cardId: string, rating: ReviewRating) {
    setQueue((curQ) => {
      const q = [...curQ];
      const at = q.findIndex((c) => c.id === cardId);
      if (at === -1) return curQ;

      const [removed] = q.splice(at, 1);

      // Repaso sin guardar: requeue simple y entendible
      if (rating === "again") {
        q.splice(clamp(at + 3, 0, q.length), 0, removed);
      } else if (rating === "hard") {
        q.splice(clamp(at + 6, 0, q.length), 0, removed);
      }

      const nextIdx = q.length === 0 ? 0 : clamp(at, 0, q.length - 1);
      setIdx(nextIdx);
      return q;
    });
  }

  async function responder(rating: ReviewRating) {
    if (!current) return;

    const cardId = current.id;

    pushUndo({ queue: [...queue], idx, flipped, reviewedCount });

    setLoading(true);
    setError(null);

    try {
      setReviewedCount((x) => x + 1);
      setFlipped(false);
      setRespuesta("");

      // Repaso sin guardar: no backend
      if (mode === "all" && !guardarEnSrs) {
        aplicarRespuestaLocal(cardId, rating);
        saveSession({ savedAt: Date.now() });
        return;
      }

      // Guardado real (agenda o repaso guardando)
      const res = await submitReview({ card_id: cardId, rating });
      if (!res.ok) throw new Error(res.error);

      const nextDueAt = res.data.next_due_at as string;
      const nextState = res.data.next_state as ReviewState;

      setQueue((curQ) => {
        const q = [...curQ];
        const at = q.findIndex((c) => c.id === cardId);
        if (at === -1) return curQ;

        const [removed] = q.splice(at, 1);

        const now = Date.now();
        const nextDueMs = new Date(nextDueAt).getTime();
        const dueSoon = Number.isFinite(nextDueMs) ? nextDueMs <= now + 30 * 60 * 1000 : false;

        const shouldRequeue = rating === "again" || esAprendizaje(nextState) || dueSoon;
        const gap = rating === "again" ? 4 : rating === "hard" ? 8 : 0;

        if (shouldRequeue) {
          q.splice(clamp(at + Math.max(1, gap), 0, q.length), 0, {
            ...removed,
            due_at: nextDueAt,
            state: nextState,
            interval_days: res.data.interval_days,
            ease: res.data.ease,
          });
        }

        const nextIdx = q.length === 0 ? 0 : clamp(at, 0, q.length - 1);
        setIdx(nextIdx);
        return q;
      });

      saveSession({ savedAt: Date.now() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al guardar el repaso.");
      setReviewedCount((x) => Math.max(0, x - 1));
    } finally {
      setLoading(false);
    }
  }

  // Open lifecycle
  useEffect(() => {
    if (!open) return;
    setMode(modeProp ?? "due");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modeProp, projectId, groupId]);

  useEffect(() => {
    if (!open) {
      didOpenRef.current = false;
      return;
    }
    if (didOpenRef.current) return;
    didOpenRef.current = true;

    const restored = tryRestoreSession();
    if (!restored) void loadFresh(modeProp ?? "due");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, groupId]);

  // Forzar guardado en agenda
  useEffect(() => {
    if (!open) return;
    if (mode === "due" && !guardarEnSrs) setGuardarEnSrs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open]);

  // Persistir
  useEffect(() => {
    if (!open) return;
    saveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idx, flipped, queue.length, mode, metodo, guardarEnSrs, initialCount, reviewedCount]);

  // Atajos
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
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        undoLast();
        return;
      }

      if (!flipped) return;

      if (e.key === "1") return void responder("again");
      if (e.key === "2") return void responder("hard");
      if (e.key === "3") return void responder("good");
      if (e.key === "4") return void responder("easy");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flipped, current?.id, mode, guardarEnSrs]);

  if (!open) return null;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => {
            saveSession();
            onClose();
          }}
        />

        {/* Modal: estable (min + height fijo) */}
        <div className="relative w-full max-w-2xl min-h-[620px] h-[min(85vh,720px)] overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Practicando{groupTitle ? `: ${groupTitle}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {headerText} · {mode === "due" ? "Agenda" : "Repaso"} · {metodo === "escritura" ? "Escritura" : "Clásico"}
                    </span>
                    <span>Progreso: {pct}%</span>
                  </div>

                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>

                  {/* Contexto corto para el usuario */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    <span>{contextoModo}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Dialog de ayuda */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" aria-label="Guía">
                        <HelpCircle className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                      <DialogContent className="w-[min(92vw,540px)] max-h-[80vh] overflow-hidden p-0">
                        <div className="flex max-h-[80vh] flex-col">
                          {/* Header fijo */}
                          <div className="shrink-0 border-b p-4">
                            <DialogHeader>
                              <DialogTitle>Cómo funciona la práctica</DialogTitle>
                              <DialogDescription>
                                Responde tarjetas y el sistema decide cuándo volverán a aparecer.
                              </DialogDescription>
                            </DialogHeader>
                          </div>

                          {/* Cuerpo scrolleable */}
                          <div className="min-h-0 flex-1 overflow-auto p-4 pb-8">
                            <div className="space-y-4 text-sm">
                              {/* Modos */}
                              <div className="rounded-xl border bg-muted/20 p-4">
                                <p className="text-sm font-semibold">Elige una fuente</p>

                                <div className="mt-3 space-y-3 text-muted-foreground">
                                  <div className="flex items-start gap-3">
                                    <div>
                                      <p className="font-medium text-foreground">Agenda</p>
                                      <p className="mt-1 text-xs leading-relaxed">
                                        Te muestra lo que <b className="text-foreground">ya toca</b> repasar. Recomendado para avanzar de forma ordenada.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-3">
                                    <div>
                                      <p className="font-medium text-foreground">Repaso</p>
                                      <p className="mt-1 text-xs leading-relaxed">
                                        Práctica extra cuando quieras. Útil para calentar o entrenar sin presión.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Respuestas */}
                              <div className="rounded-xl border p-4">
                                <p className="text-sm font-semibold">Qué significan las respuestas</p>
                                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                                  Después de ver la respuesta, elige cómo te fue. Eso define cuándo vuelve a aparecer.
                                </p>

                                <div className="mt-3 grid gap-2">
                                  <div className="rounded-lg bg-muted/30 p-3">
                                    <p className="font-medium text-foreground">Otra vez</p>
                                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                      No la recordaste. Volverá a salir pronto.
                                    </p>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Normalmente: <b className="text-foreground">10 minutos</b>.
                                    </p>
                                  </div>

                                  <div className="rounded-lg bg-muted/30 p-3">
                                    <p className="font-medium text-foreground">Difícil</p>
                                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                      La recordaste con esfuerzo. Puede reaparecer antes que una normal.
                                    </p>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      En aprendizaje: <b className="text-foreground">60 minutos</b>.
                                    </p>
                                  </div>

                                  <div className="rounded-lg bg-muted/30 p-3">
                                    <p className="font-medium text-foreground">Bien</p>
                                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                      La recordaste normal. Se agenda para más adelante.
                                    </p>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Si es nueva: <b className="text-foreground">1 día</b>.
                                    </p>
                                  </div>

                                  <div className="rounded-lg bg-muted/30 p-3">
                                    <p className="font-medium text-foreground">Fácil</p>
                                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                      Te salió muy fácil. Se aleja más que “Bien”.
                                    </p>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Si es nueva: <b className="text-foreground">3 días</b>.
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Método escritura */}
                              <div className="rounded-xl border p-4">
                                <p className="text-sm font-semibold">Método “Escritura”</p>
                                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                                  En escritura, primero escribes tu respuesta y recién después revelas. Ideal para definiciones, vocabulario y fórmulas.
                                </p>
                              </div>

                              {/* Atajos */}
                              <div className="rounded-xl border bg-muted/20 p-4">
                                <p className="text-sm font-semibold">Atajos</p>

                                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Voltear tarjeta</span>
                                    <kbd className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground">Espacio</kbd>
                                  </div>

                                  <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Responder</span>
                                    <kbd className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground">1–4</kbd>
                                  </div>

                                  <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Deshacer</span>
                                    <kbd className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground">U</kbd>
                                  </div>

                                  <div className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2">
                                    <span className="text-xs text-muted-foreground">Cerrar</span>
                                    <kbd className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground">Esc</kbd>
                                  </div>
                                </div>

                                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                                  Nota: “Recargar” reinicia la lista, pero no adelanta el tiempo. Las tarjetas vuelven cuando les corresponde.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                  </Dialog>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={loading}
                        onClick={() => {
                          clearSession();
                          void loadFresh(mode);
                        }}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Recargar
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Recarga la cola del modo actual. Tu progreso se guarda.</TooltipContent>
                  </Tooltip>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      saveSession();
                      onClose();
                    }}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cerrar
                  </Button>
                </div>
              </div>

              {/* Controles: más pequeños + segmentados */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Fuente</span>

                  <div className="flex overflow-hidden rounded-xl border bg-muted/40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={mode === "due" ? "default" : "ghost"}
                          size="sm"
                          className="h-8 rounded-none px-3"
                          disabled={loading}
                          onClick={() => {
                            clearSession();
                            void loadFresh("due");
                          }}
                        >
                          <CalendarClock className="mr-2 h-4 w-4" />
                          Agenda
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Tarjetas vencidas. Recomendado para progresar.</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={mode === "all" ? "default" : "ghost"}
                          size="sm"
                          className="h-8 rounded-none px-3"
                          disabled={loading}
                          onClick={() => {
                            clearSession();
                            void loadFresh("all");
                          }}
                        >
                          <BookOpen className="mr-2 h-4 w-4" />
                          Repaso
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Práctica extra. Puedes guardar o no.</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Método</span>

                  <div className="flex overflow-hidden rounded-xl border bg-muted/40">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={metodo === "clasico" ? "default" : "ghost"}
                          size="sm"
                          className="h-8 rounded-none px-3"
                          disabled={loading}
                          onClick={() => {
                            setMetodo("clasico");
                            setRespuesta("");
                            setFlipped(false);
                            saveSession({ metodo: "clasico", flipped: false, savedAt: Date.now() });
                          }}
                        >
                          Clásico
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">El flujo clásico: ver → revelar → calificar.</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={metodo === "escritura" ? "default" : "ghost"}
                          size="sm"
                          className="h-8 rounded-none px-3"
                          disabled={loading}
                          onClick={() => {
                            setMetodo("escritura");
                            setFlipped(false);
                            saveSession({ metodo: "escritura", flipped: false, savedAt: Date.now() });
                          }}
                        >
                          <PenLine className="mr-2 h-4 w-4" />
                          Escritura
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Escribe tu respuesta antes de revelar.</TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Guardar en SRS: solo en Repaso */}
                  {mode === "all" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={guardarEnSrs ? "default" : "secondary"}
                          size="sm"
                          className={guardarEnSrs ? "h-8 bg-emerald-600 px-3 hover:bg-emerald-600/90" : "h-8 px-3"}
                          disabled={loading}
                          onClick={() => {
                            const next = !guardarEnSrs;
                            setGuardarEnSrs(next);
                            saveSession({ guardarEnSrs: next, savedAt: Date.now() });
                          }}
                        >
                          {guardarEnSrs ? "Guardar" : "No guardar"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        En repaso, decide si afecta tu agenda. (En agenda siempre guarda.)
                      </TooltipContent>
                    </Tooltip>
                  ) : null}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3"
                        disabled={loading || !undo}
                        onClick={undoLast}
                      >
                        <Undo2 className="mr-2 h-4 w-4" />
                        Deshacer
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Deshace la última respuesta (U).</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Body: NO se aplasta (min-h-0) y el scroll es interno */}
            <div className="flex-1 min-h-0 overflow-hidden p-4">
              {error ? (
                <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}

              {loading && queue.length === 0 ? (
                <div className="h-56 animate-pulse rounded-xl border bg-muted/30" />
              ) : null}

              {showEmptyDue ? (
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium">No hay tarjetas vencidas</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prueba “Repaso” si quieres practicar igual (sin afectar agenda).
                  </p>
                </div>
              ) : null}

              {showEmptyAll ? (
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium">Sin tarjetas</p>
                  <p className="mt-1 text-xs text-muted-foreground">Este grupo no tiene cartas.</p>
                </div>
              ) : null}

              {isSessionFinished ? (
                <div className="rounded-xl border p-4">
                  <p className="text-sm font-medium">Sesión terminada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Ya no quedan tarjetas en la cola actual.</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={loading}
                      onClick={() => {
                        clearSession();
                        void loadFresh(mode);
                      }}
                    >
                      Repetir
                    </Button>
                  </div>
                </div>
              ) : null}

              {current ? (
                <div key={cardKey} className="h-full min-h-0 flex flex-col">
                  {/* Tarjeta: ocupa el alto disponible (NO max-h fijo) */}
                  <div
                    className="mx-auto flex w-full flex-1 min-h-0 rounded-2xl border bg-muted/10 p-4 shadow-sm
                               animate-in fade-in-0 zoom-in-95 duration-200"
                    style={{ perspective: "1100px" }}
                  >
                    <div
                      className="relative w-full flex-1 min-h-0 transition-transform duration-500"
                      style={{
                        transformStyle: "preserve-3d",
                        transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                      }}
                    >
                      {/* Frente */}
                      <div className="absolute inset-0 flex flex-col min-h-0" style={{ backfaceVisibility: "hidden" }}>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Frente</p>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                            {etiquetaEstado(current.state ?? null)}
                          </span>
                        </div>

                        {/* El contenido crece y scrollea si es necesario */}
                        <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1">
                          <Markdown md={current.front} />
                        </div>

                        {metodo === "escritura" ? (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Tu respuesta</p>
                            <Input
                              value={respuesta}
                              onChange={(e) => setRespuesta(e.target.value)}
                              placeholder="Escribe tu respuesta aquí…"
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Escribe primero, luego revela con <b>Espacio</b>.
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-4 flex justify-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                disabled={loading}
                                onClick={() => setFlipped(true)}
                                className="h-9 bg-emerald-600 px-4 hover:bg-emerald-600/90"
                              >
                                Mostrar respuesta (Espacio)
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Atajo: tecla Espacio</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>

                      {/* Reverso */}
                      <div
                        className="absolute inset-0 flex flex-col min-h-0"
                        style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Reverso</p>
                          <span className="text-[11px] text-muted-foreground">1-4 para responder · U deshacer</span>
                        </div>

                        {metodo === "escritura" ? (
                          <div className="mt-3 rounded-lg border bg-background/60 p-3">
                            <p className="text-xs font-medium">Tu respuesta</p>
                            <p className="mt-1 text-sm">
                              {respuesta ? respuesta : <span className="text-muted-foreground">—</span>}
                            </p>
                            {respuestaNorm ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Coincidencia aproximada:{" "}
                                <b>{normAnswer(current.back).includes(respuestaNorm) ? "sí" : "no / parcial"}</b>
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="mt-3 flex-1 min-h-0 overflow-auto pr-1">
                          <Markdown md={current.back} />
                        </div>

                        <div className="mt-3 flex justify-center">
                          <Button type="button" size="sm" variant="secondary" onClick={() => setFlipped(false)}>
                            Volver al frente
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Micro-hint debajo (más “entretenido” y útil) */}
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Consejo: “Otra vez” vuelve pronto; “Fácil” se aleja.</span>
                    <span>{mode === "due" ? "Guardado activo" : guardarEnSrs ? "Guardando" : "Sin guardar"}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Footer: fijo */}
            <div className="border-t p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {flipped ? "Elige una respuesta:" : "Voltea la tarjeta para responder."}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!flipped || loading || !current}
                    onClick={() => responder("again")}
                  >
                    1 · Otra vez
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!flipped || loading || !current}
                    onClick={() => responder("hard")}
                  >
                    2 · Difícil
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!flipped || loading || !current}
                    onClick={() => responder("good")}
                  >
                    3 · Bien
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!flipped || loading || !current}
                    onClick={() => responder("easy")}
                  >
                    4 · Fácil
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Click fuera: ya lo maneja backdrop */}
        </div>
      </div>
    </TooltipProvider>
  );
}
