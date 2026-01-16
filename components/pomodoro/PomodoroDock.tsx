// PomodoroDock.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  getPomodoroSettingsAction,
  insertPomodoroFocusSessionAction,
  savePomodoroSettingsAction,
  type PomodoroSettings,
} from "@/app/protected/pomodoro/pomodoro-actions";

import {
  AlarmClock,
  Bell,
  BookOpen,
  Brain,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  HelpCircle,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

/* ----------------- Constantes (sin magia) ----------------- */

const MIN_FOCUS_MINUTES = 1;
const MAX_FOCUS_MINUTES = 180;

const MIN_SHORT_BREAK_MINUTES = 1;
const MAX_SHORT_BREAK_MINUTES = 60;

const MIN_LONG_BREAK_MINUTES = 1;
const MAX_LONG_BREAK_MINUTES = 120;

const MIN_CYCLES_BEFORE_LONG = 1;
const MAX_CYCLES_BEFORE_LONG = 12;

const MAX_PLANNED_SEC = 24 * 60 * 60;

const TICK_INTERVAL_MS = 250;
const BROADCAST_DEBOUNCE_MS = 100;

const LAST_USER_KEY = "rutalabs:lastUserId";
const LS_KEY_OLD = "rutalabs:pomodoro:v1"; // legado (global, inseguro)
const BC_NAME = "rutalabs:pomodoro:bc";

/* ----------------- Dominio ----------------- */

type Phase = "focus" | "short_break" | "long_break";

/**
 * Status local estricto.
 * Si tu DB usa enum, idealmente alinea esos valores a: running | paused | idle.
 */
type PomodoroStatus = "running" | "paused" | "idle";

/** En DB puede venir un string legacy; lo toleramos sin perder type-safety local. */
type PomodoroStatusDb = PomodoroStatus | (string & {});

type PomodoroStateRow = {
  user_id: string;

  status: PomodoroStatusDb | null;
  phase: Phase | null;

  started_at: string | null; // timestamptz
  ends_at: string | null; // timestamptz

  completed_work_cycles: number | null;
  selected_project_id: string | null;

  paused_remaining_sec: number | null;
  phase_planned_sec: number | null;

  rev: number | null;
  client_id: string | null;

  updated_at: string | null; // timestamptz
};

type LocalStateV2 = {
  v: 2;

  // Persistencia por usuario
  userId: string;

  // Resolución de conflictos (CAS + LWW)
  rev: number;
  updatedAtMs: number;

  // Identidad de pestaña
  clientId: string;

  // Datos
  settings: PomodoroSettings;
  phase: Phase;
  cycleIndex: number;

  running: boolean;

  // Si corre: remaining se deriva de ends
  phaseEndsAtMs: number | null;

  // Si no corre: remaining se guarda aquí
  pausedRemainingSec: number;

  // Duración “bloqueada” de la fase actual
  phasePlannedSec: number;

  // Para insertar sesión de foco
  focusStartedAtIso: string | null;
};

/* ----------------- Utils ----------------- */

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function defaultSettings(): PomodoroSettings {
  return {
    focus_minutes: 25,
    short_break_minutes: 5,
    long_break_minutes: 15,
    cycles_before_long_break: 4,
    enable_notifications: false,
    enable_sound: true,
    dock_is_open: true,
  };
}

function normalizeSettings(s: PomodoroSettings): PomodoroSettings {
  return {
    focus_minutes: clampInt(s.focus_minutes, MIN_FOCUS_MINUTES, MAX_FOCUS_MINUTES, 25),
    short_break_minutes: clampInt(s.short_break_minutes, MIN_SHORT_BREAK_MINUTES, MAX_SHORT_BREAK_MINUTES, 5),
    long_break_minutes: clampInt(s.long_break_minutes, MIN_LONG_BREAK_MINUTES, MAX_LONG_BREAK_MINUTES, 15),
    cycles_before_long_break: clampInt(s.cycles_before_long_break, MIN_CYCLES_BEFORE_LONG, MAX_CYCLES_BEFORE_LONG, 4),
    enable_notifications: Boolean(s.enable_notifications),
    enable_sound: Boolean(s.enable_sound ?? true),
    dock_is_open: Boolean(s.dock_is_open ?? true),
  };
}

function phaseToSeconds(phase: Phase, s: PomodoroSettings): number {
  if (phase === "focus") return Math.max(1, s.focus_minutes) * 60;
  if (phase === "short_break") return Math.max(1, s.short_break_minutes) * 60;
  return Math.max(1, s.long_break_minutes) * 60;
}

function formatMMSS(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function phaseLabel(p: Phase) {
  if (p === "focus") return "Foco";
  if (p === "short_break") return "Descanso";
  return "Largo";
}

function cyclesUntilLongBreak(cycleIndex: number, every: number): number {
  const e = Math.max(1, every);
  const next = cycleIndex + 1;
  const mod = next % e;
  if (mod === 0) return 0;
  return e - mod;
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseIsoMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ensurePhase(p: unknown): Phase {
  return p === "short_break" || p === "long_break" || p === "focus" ? p : "focus";
}

/* ----------------- Persistencia local por usuario ----------------- */

function lsKeyForUser(userId: string) {
  return `rutalabs:pomodoro:v2:${userId}`;
}

function getClientId(): string {
  const key = "rutalabs:pomodoro:clientId";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `c_${Math.random().toString(16).slice(2)}_${Date.now()}`;

    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return `c_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

function createDefaultState(userId: string, clientId: string): LocalStateV2 {
  const s = defaultSettings();
  const planned = phaseToSeconds("focus", s);

  return {
    v: 2,
    userId,
    rev: 0,
    updatedAtMs: Date.now(),
    clientId,
    settings: s,
    phase: "focus",
    cycleIndex: 0,
    running: false,
    phaseEndsAtMs: null,
    pausedRemainingSec: planned,
    phasePlannedSec: planned,
    focusStartedAtIso: null,
  };
}

function sanitizeLoadedV2(raw: LocalStateV2, userId: string, clientId: string): LocalStateV2 {
  const settings = normalizeSettings(raw.settings);
  const phase = ensurePhase(raw.phase);

  const plannedFallback = phaseToSeconds(phase, settings);
  const planned = clampInt(raw.phasePlannedSec, 1, MAX_PLANNED_SEC, plannedFallback);

  const running = Boolean(raw.running);
  const ends =
    typeof raw.phaseEndsAtMs === "number" && Number.isFinite(raw.phaseEndsAtMs) ? raw.phaseEndsAtMs : null;

  const pausedRemaining = clampInt(raw.pausedRemainingSec, 0, MAX_PLANNED_SEC, planned);

  const rev = clampInt(raw.rev, 0, 1_000_000_000, 0);
  const updatedAtMs =
    typeof raw.updatedAtMs === "number" && Number.isFinite(raw.updatedAtMs) ? raw.updatedAtMs : Date.now();

  return {
    v: 2,
    userId,
    rev,
    updatedAtMs,
    clientId, // mantenemos el clientId de esta pestaña
    settings,
    phase,
    cycleIndex: clampInt(raw.cycleIndex, 0, 999, 0),
    running,
    phaseEndsAtMs: running ? ends : null,
    pausedRemainingSec: pausedRemaining,
    phasePlannedSec: planned,
    focusStartedAtIso: typeof raw.focusStartedAtIso === "string" ? raw.focusStartedAtIso : null,
  };
}

/**
 * Importante: NO migramos v1 global, porque no tiene userId y contamina cuentas.
 */
function loadLocalStateForUser(userId: string, clientId: string): LocalStateV2 | null {
  const key = lsKeyForUser(userId);
  const v2 = safeParseJson<unknown>(localStorage.getItem(key));

  if (v2 && typeof v2 === "object") {
    const o = v2 as Partial<LocalStateV2>;
    if (o.v === 2 && o.settings && o.userId === userId) {
      return sanitizeLoadedV2(o as LocalStateV2, userId, clientId);
    }
  }
  return null;
}

function saveLocalStateForUser(userId: string, st: LocalStateV2) {
  const key = lsKeyForUser(userId);
  try {
    localStorage.setItem(key, JSON.stringify(st));
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    // no-op
  }
}

function lwwNewer(a: LocalStateV2, b: LocalStateV2): boolean {
  if (a.rev !== b.rev) return a.rev > b.rev;
  return a.updatedAtMs > b.updatedAtMs;
}

function stateFocusStartIso(st: LocalStateV2): string | null {
  if (st.phase !== "focus") return null;
  if (st.focusStartedAtIso) return st.focusStartedAtIso;

  // Si falta, pero está corriendo, lo derivamos de ends - planned
  if (st.running && st.phaseEndsAtMs) {
    const startedMs = st.phaseEndsAtMs - st.phasePlannedSec * 1000;
    if (Number.isFinite(startedMs)) return new Date(startedMs).toISOString();
  }
  return null;
}

/* ----------------- Notificaciones + sonido (con limpieza) ----------------- */

async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

type BeepKind = "focus_end" | "short_end" | "long_end";

function beepParams(kind: BeepKind) {
  if (kind === "focus_end") return { freq: 880, dur: 160 };
  if (kind === "short_end") return { freq: 660, dur: 140 };
  return { freq: 520, dur: 220 };
}

/* ----------------- Mensajes entre pestañas ----------------- */

type WireMessage = { type: "state"; state: LocalStateV2 };

/* ----------------- DB mapping ----------------- */

const STATUS_RUNNING: PomodoroStatus = "running";
const STATUS_PAUSED: PomodoroStatus = "paused";

function statusFromDb(row: PomodoroStateRow, endsAtMs: number | null): PomodoroStatus {
  // Preferimos el status; pero si el enum no calza, inferimos por ends_at
  const raw = String(row.status ?? "").toLowerCase();
  if (raw === "running") return "running";
  if (raw === "paused") return "paused";
  if (raw === "idle") return "idle";

  if (endsAtMs !== null && endsAtMs > Date.now()) return "running";
  // si no corre, asumimos paused (idle lo usarías si agregas ese estado explícito)
  return "paused";
}

function rowToLocalState(row: PomodoroStateRow, settings: PomodoroSettings, clientId: string): LocalStateV2 {
  const phase = ensurePhase(row.phase ?? "focus");

  const plannedFallback = phaseToSeconds(phase, settings);
  const planned = clampInt(row.phase_planned_sec, 1, MAX_PLANNED_SEC, plannedFallback);

  const endsAtMs = parseIsoMs(row.ends_at);
  const status = statusFromDb(row, endsAtMs);
  const running = status === "running";

  const computedRemaining = running && endsAtMs ? Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)) : null;

  const pausedRemaining =
    computedRemaining !== null ? computedRemaining : clampInt(row.paused_remaining_sec, 0, MAX_PLANNED_SEC, planned);

  const updatedAtMs = parseIsoMs(row.updated_at) ?? Date.now();
  const rev = clampInt(row.rev, 0, 1_000_000_000, 0);

  return {
    v: 2,
    userId: row.user_id,
    rev,
    updatedAtMs,
    clientId,
    settings,
    phase,
    cycleIndex: clampInt(row.completed_work_cycles, 0, 999, 0),
    running,
    phaseEndsAtMs: running ? endsAtMs : null,
    pausedRemainingSec: pausedRemaining,
    phasePlannedSec: planned,
    focusStartedAtIso: phase === "focus" ? row.started_at : null,
  };
}

function localToDbPatch(st: LocalStateV2): Partial<PomodoroStateRow> {
  const endsAtIso = st.running && st.phaseEndsAtMs ? new Date(st.phaseEndsAtMs).toISOString() : null;

  // started_at: derivado de ends - planned si corre; en foco preferimos focusStartedAtIso
  let startedAtIso: string | null = null;

  if (st.running && st.phaseEndsAtMs) {
    startedAtIso = new Date(st.phaseEndsAtMs - st.phasePlannedSec * 1000).toISOString();
  }

  if (st.phase === "focus") {
    startedAtIso = stateFocusStartIso(st) ?? startedAtIso;
  }

  const status: PomodoroStatus = st.running ? STATUS_RUNNING : STATUS_PAUSED;

  return {
    status,
    phase: st.phase,
    started_at: startedAtIso,
    ends_at: endsAtIso,
    completed_work_cycles: st.cycleIndex,
    paused_remaining_sec: st.pausedRemainingSec,
    phase_planned_sec: st.phasePlannedSec,
    rev: st.rev,
    client_id: st.clientId,
  };
}

/* ----------------- Transiciones declarativas ----------------- */

function computeNextPhaseFromFocus(nextCycleIndex: number, settings: PomodoroSettings): Phase {
  const every = Math.max(1, settings.cycles_before_long_break);
  const goLong = nextCycleIndex % every === 0;
  return goLong ? "long_break" : "short_break";
}

function isPhaseComplete(cur: LocalStateV2): boolean {
  if (!cur.running) return false;
  const ends = cur.phaseEndsAtMs;
  const remNow = ends ? Math.max(0, Math.ceil((ends - Date.now()) / 1000)) : cur.pausedRemainingSec;
  return remNow === 0;
}

/* ----------------- UI meta (clases Tailwind) ----------------- */

const PHASE_META: Record<
  Phase,
  {
    label: string;
    subtitle: string;
    Icon: typeof Brain;
    ringRunningClass: string; // ej: "stroke-emerald-500"
    ringPausedClass: string; // ej: "stroke-emerald-400"
    hint: string;
  }
> = {
  focus: {
    label: "Foco",
    subtitle: "Concentración",
    Icon: Brain,
    ringRunningClass: "stroke-primary",
    ringPausedClass: "stroke-primary/50",
    hint: "Trabajo sin distracciones.",
  },
  short_break: {
    label: "Descanso",
    subtitle: "Recuperación",
    Icon: Coffee,
    ringRunningClass: "stroke-emerald-500",
    ringPausedClass: "stroke-emerald-400",
    hint: "Pausa breve: respira, camina, hidrátate.",
  },
  long_break: {
    label: "Largo",
    subtitle: "Recuperación larga",
    Icon: AlarmClock,
    ringRunningClass: "stroke-violet-500",
    ringPausedClass: "stroke-violet-300",
    hint: "Pausa larga para resetear energía.",
  },
};

/* ----------------- Componente ----------------- */

export function PomodoroDock() {
  const clientIdRef = useRef<string>(getClientId());

  const [booted, setBooted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Fuente de verdad en cliente
  const [st, setSt] = useState<LocalStateV2 | null>(null);
  const stRef = useRef<LocalStateV2 | null>(null);

  useEffect(() => {
    stRef.current = st;
  }, [st]);

  // “Clock” liviano solo mientras corre
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const tickRef = useRef<number | null>(null);

  // Evita loops de fin de fase
  const phaseEndInFlightRef = useRef(false);

  // BroadcastChannel
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Realtime channel
  const rtRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Debounce de broadcast (reduce spam)
  const broadcastQueueRef = useRef<LocalStateV2 | null>(null);
  const broadcastTimerRef = useRef<number | null>(null);

  // AudioContext (se cierra al desmontar)
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Accesibilidad / focus management
  const dockRef = useRef<HTMLDivElement | null>(null);

  const open = st?.settings.dock_is_open ?? true;

  // Hover micro-interactions
  const [isHovering, setIsHovering] = useState(false);

  const remainingSec = useMemo(() => {
    if (!st) return 0;

    if (!st.running) return Math.max(0, st.pausedRemainingSec);

    const ends = st.phaseEndsAtMs;
    if (!ends) return Math.max(0, st.pausedRemainingSec);

    const diffMs = ends - nowMs;
    return Math.max(0, Math.ceil(diffMs / 1000));
  }, [st, nowMs]);

  const progress = useMemo(() => {
    if (!st) return 0;
    const total = Math.max(1, st.phasePlannedSec);
    const done = 1 - remainingSec / total;
    return Math.max(0, Math.min(1, done));
  }, [st, remainingSec]);

  const statusLabel = useMemo(() => {
    if (!st) return "Pausado";
    if (st.running) return "En curso";
    if (remainingSec === 0) return "Listo";
    return "Pausado";
  }, [st, remainingSec]);

  const longEvery = Math.max(1, st?.settings.cycles_before_long_break ?? 4);
  const longIn = useMemo(() => {
    if (!st) return 0;
    return cyclesUntilLongBreak(st.cycleIndex, longEvery);
  }, [st, longEvery]);

  const collapsedLine2 = useMemo(() => {
    if (!st) return "";
    if (st.phase === "long_break") return "Descanso largo";
    if (longIn === 0) return "Largo: próximo";
    return `Largo en ${longIn}`;
  }, [st, longIn]);

  const meta = useMemo(() => (st ? PHASE_META[st.phase] : PHASE_META.focus), [st?.phase]);
  const ringRunningClass = meta.ringRunningClass;
  const ringPausedClass = meta.ringPausedClass;

  /* ----------------- Helpers: beep limpio ----------------- */

  const playBeep = useCallback((kind: BeepKind) => {
    try {
      const { freq, dur } = beepParams(kind);

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) return;

      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.06;

      o.connect(g);
      g.connect(ctx.destination);

      o.start();

      window.setTimeout(() => {
        try {
          o.stop();
          o.disconnect();
          g.disconnect();
        } catch {
          // no-op
        }
      }, dur);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    // Limpieza del audio context para evitar leaks
    return () => {
      try {
        void audioCtxRef.current?.close();
      } catch {
        // no-op
      }
      audioCtxRef.current = null;
    };
  }, []);

  /* ----------------- Broadcast debounced ----------------- */

  const queueBroadcast = useCallback((next: LocalStateV2) => {
    if (!bcRef.current) return;

    broadcastQueueRef.current = next;

    if (broadcastTimerRef.current) window.clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = window.setTimeout(() => {
      const queued = broadcastQueueRef.current;
      broadcastQueueRef.current = null;
      if (!queued) return;

      try {
        const msg: WireMessage = { type: "state", state: queued };
        bcRef.current?.postMessage(msg);
      } catch {
        // no-op
      }
    }, BROADCAST_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    // Limpieza del debounce
    return () => {
      if (broadcastTimerRef.current) window.clearTimeout(broadcastTimerRef.current);
      broadcastTimerRef.current = null;
      broadcastQueueRef.current = null;
    };
  }, []);

  /* ----------------- Local apply/broadcast ----------------- */

  function applyLocal(next: LocalStateV2) {
    setSt(next);
    if (userId) saveLocalStateForUser(userId, next);
    queueBroadcast(next);
  }

  function applyRemote(incoming: LocalStateV2) {
    if (!userId) return;
    if (incoming.userId !== userId) return;

    setSt((cur) => {
      if (!cur) {
        const sanitized = sanitizeLoadedV2(incoming, userId, clientIdRef.current);
        saveLocalStateForUser(userId, sanitized);
        return sanitized;
      }

      if (!lwwNewer(incoming, cur)) return cur;

      // Preservamos settings locales (se sincronizan por pomodoro_settings)
      const mergedIncoming = sanitizeLoadedV2(
        { ...incoming, settings: cur.settings, clientId: cur.clientId } as LocalStateV2,
        userId,
        cur.clientId
      );

      saveLocalStateForUser(userId, mergedIncoming);
      return mergedIncoming;
    });
  }

  /* ----------------- DB sync (CAS) ----------------- */

  async function fetchServerState(
    supabase: ReturnType<typeof createClient>,
    uid: string
  ): Promise<PomodoroStateRow | null> {
    const { data, error } = await supabase
      .from("pomodoro_state")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();

    if (error) return null;
    return (data as PomodoroStateRow | null) ?? null;
  }

  async function ensureServerRowExists(supabase: ReturnType<typeof createClient>, base: LocalStateV2) {
    const existing = await fetchServerState(supabase, base.userId);
    if (existing) return;

    // Insert inicial. Si hay carrera, ignoramos.
    const patch = localToDbPatch(base);
    try {
      await supabase.from("pomodoro_state").insert({
        user_id: base.userId,
        ...patch,
      });
    } catch {
      // ignore
    }
  }

  async function pushStateCAS(
    supabase: ReturnType<typeof createClient>,
    uid: string,
    expectedPrevRev: number,
    nextState: LocalStateV2
  ): Promise<{ ok: true; row: PomodoroStateRow } | { ok: false; conflict: boolean }> {
    const patch = localToDbPatch(nextState);

    const { data, error } = await supabase
      .from("pomodoro_state")
      .update(patch)
      .eq("user_id", uid)
      .eq("rev", expectedPrevRev)
      .select("*");

    if (error) return { ok: false, conflict: true };

    const rows = (data as PomodoroStateRow[]) ?? [];
    if (rows.length !== 1) return { ok: false, conflict: true };

    return { ok: true, row: rows[0] };
  }

  async function commitWithServer(
    producer: (prev: LocalStateV2) => LocalStateV2,
    opts?: {
      onLeaderCommit?: (prev: LocalStateV2, committed: LocalStateV2) => Promise<void> | void;
    }
  ) {
    const uid = userId;
    const prev = stRef.current;
    if (!uid || !prev) return;

    const supabase = createClient();

    const nextUnstamped = producer(prev);
    const stamped: LocalStateV2 = {
      ...nextUnstamped,
      userId: uid,
      clientId: prev.clientId,
      rev: prev.rev + 1,
      updatedAtMs: Date.now(),
      settings: prev.settings, // settings se manejan aparte
    };

    // Optimista
    applyLocal(stamped);

    // CAS
    const res = await pushStateCAS(supabase, uid, prev.rev, stamped);

    if (res.ok) {
      const committedLocal = rowToLocalState(res.row, stamped.settings, stamped.clientId);

      // Preservamos settings actuales
      const committedFinal: LocalStateV2 = {
        ...committedLocal,
        settings: stamped.settings,
        clientId: stamped.clientId,
      };

      applyLocal(committedFinal);

      if (opts?.onLeaderCommit) {
        try {
          await opts.onLeaderCommit(prev, committedFinal);
        } catch {
          // no-op
        }
      }
      return;
    }

    // Conflicto => refetch
    const latest = await fetchServerState(supabase, uid);
    if (latest) {
      const remote = rowToLocalState(latest, prev.settings, prev.clientId);
      applyRemote(remote);
    }
  }

  /* ----------------- Bootstrap ----------------- */

  async function bootstrapForCurrentUser() {
    const supabase = createClient();

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      setBooted(true);
      setUserId(null);
      setSt(null);
      return undefined;
    }

    const uid = data.user.id;

    // Si cambió el usuario, limpiamos v1 global para evitar contaminación
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      if (last && last !== uid) {
        localStorage.removeItem(LS_KEY_OLD);
      }
      localStorage.setItem(LAST_USER_KEY, uid);
    } catch {
      // no-op
    }

    setUserId(uid);

    // Base local (con defaults)
    const local = loadLocalStateForUser(uid, clientIdRef.current);
    const base = local ?? createDefaultState(uid, clientIdRef.current);

    // Recalcular remaining si venía corriendo
    const computedRemaining =
      base.running && base.phaseEndsAtMs
        ? Math.max(0, Math.ceil((base.phaseEndsAtMs - Date.now()) / 1000))
        : base.pausedRemainingSec;

    const normalizedBase: LocalStateV2 = {
      ...base,
      pausedRemainingSec: computedRemaining,
    };

    // BroadcastChannel (sincronía entre pestañas del mismo navegador)
    try {
      bcRef.current = "BroadcastChannel" in window ? new BroadcastChannel(BC_NAME) : null;
    } catch {
      bcRef.current = null;
    }

    if (bcRef.current) {
      bcRef.current.onmessage = (ev: MessageEvent) => {
        const d = ev.data as unknown;
        if (!d || typeof d !== "object") return;
        const msg = d as Partial<WireMessage>;
        if (msg.type !== "state" || !msg.state) return;
        if (msg.state.v !== 2) return;
        applyRemote(msg.state);
      };
    }

    // Storage fallback (otras pestañas)
    const userKey = lsKeyForUser(uid);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== userKey) return;
      const parsed = safeParseJson<LocalStateV2>(e.newValue);
      if (!parsed || parsed.v !== 2) return;
      applyRemote(parsed);
    };
    window.addEventListener("storage", onStorage);

    // 1) Settings desde server
    const settingsRes = await getPomodoroSettingsAction();
    const mergedSettings = settingsRes.ok
      ? normalizeSettings(settingsRes.data)
      : normalizeSettings(normalizedBase.settings);

    // 2) Aplicar base inmediata con settings
    const baseWithSettings: LocalStateV2 = {
      ...normalizedBase,
      settings: mergedSettings,
      userId: uid,
      clientId: clientIdRef.current,
    };

    applyLocal(baseWithSettings);

    // 3) Asegurar row y traer state (multi-browser)
    await ensureServerRowExists(supabase, baseWithSettings);

    const serverRow = await fetchServerState(supabase, uid);
    if (serverRow) {
      const serverState = rowToLocalState(serverRow, mergedSettings, clientIdRef.current);
      const winner = lwwNewer(serverState, baseWithSettings) ? serverState : baseWithSettings;

      applyLocal({
        ...winner,
        settings: mergedSettings,
        clientId: clientIdRef.current,
      });
    }

    // 4) Realtime: escuchar cambios
    try {
      if (rtRef.current) {
        try {
          await rtRef.current.unsubscribe();
        } catch {
          // no-op
        }
        rtRef.current = null;
      }

      rtRef.current = supabase
        .channel(`pomodoro_state:${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pomodoro_state", filter: `user_id=eq.${uid}` },
          (payload) => {
            const row = payload.new as PomodoroStateRow;
            if (!row || row.user_id !== uid) return;

            const remote = rowToLocalState(row, mergedSettings, clientIdRef.current);
            applyRemote(remote);
          }
        )
        .subscribe();
    } catch {
      // no-op
    }

    setBooted(true);

    // Cleanup garantizado (previene leaks)
    return () => {
      window.removeEventListener("storage", onStorage);

      if (bcRef.current) {
        try {
          bcRef.current.close();
        } catch {
          // no-op
        }
        bcRef.current = null;
      }

      if (rtRef.current) {
        try {
          void rtRef.current.unsubscribe();
        } catch {
          // no-op
        }
        rtRef.current = null;
      }
    };
  }

  // Boot + cambios auth (switch de cuenta)
  useEffect(() => {
    const supabase = createClient();

    let cleanup: void | (() => void);

    void (async () => {
      cleanup = await bootstrapForCurrentUser();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;

      setUserId(uid);
      setSt(null);

      if (!uid) {
        setBooted(true);
        return;
      }

      void (async () => {
        cleanup = await bootstrapForCurrentUser();
      })();
    });

    return () => {
      if (cleanup) cleanup();

      try {
        sub.subscription.unsubscribe();
      } catch {
        // no-op
      }

      if (bcRef.current) {
        try {
          bcRef.current.close();
        } catch {
          // no-op
        }
        bcRef.current = null;
      }

      if (rtRef.current) {
        try {
          void rtRef.current.unsubscribe();
        } catch {
          // no-op
        }
        rtRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------- Tick solo si corre (sin leaks) ----------------- */

  useEffect(() => {
    if (!booted) return;

    if (!st?.running) {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }

    if (tickRef.current) window.clearInterval(tickRef.current);

    tickRef.current = window.setInterval(() => {
      setNowMs(Date.now());
    }, TICK_INTERVAL_MS);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [booted, st?.running]);

  /* ----------------- Focus al abrir panel (A11y) ----------------- */

  useEffect(() => {
    if (!booted) return;
    if (open) dockRef.current?.focus();
  }, [booted, open]);

  /* ----------------- Fin de fase (líder vía CAS) ----------------- */

  useEffect(() => {
    if (!booted) return;
    if (!st) return;
    if (!st.running) return;

    if (remainingSec !== 0) {
      phaseEndInFlightRef.current = false;
      return;
    }
    if (phaseEndInFlightRef.current) return;
    phaseEndInFlightRef.current = true;

    void (async () => {
      const prev = stRef.current;
      if (!prev) return;

      // Sonido + notificación (permitimos en cada navegador)
      if (prev.settings.enable_sound) {
        const kind: BeepKind =
          prev.phase === "focus" ? "focus_end" : prev.phase === "short_break" ? "short_end" : "long_end";
        playBeep(kind);
      }

      if (prev.settings.enable_notifications) {
        const ok = await ensureNotificationPermission();
        if (ok) new Notification("RutaLabs Pomodoro", { body: `Terminó: ${phaseLabel(prev.phase)}` });
      }

      // Precomputo para inserción (solo líder)
      const focusStartIso = stateFocusStartIso(prev);
      const endedAtIso = new Date().toISOString();

      await commitWithServer(
        (cur) => {
          // Si ya no está completo, no hacemos nada
          if (!isPhaseComplete(cur)) return cur;

          const s = cur.settings;

          if (cur.phase === "focus") {
            const nextCycle = cur.cycleIndex + 1;
            const nextPhase = computeNextPhaseFromFocus(nextCycle, s);

            const nextTotal = phaseToSeconds(nextPhase, s);
            const nextEndsAt = Date.now() + nextTotal * 1000;

            return {
              ...cur,
              phase: nextPhase,
              cycleIndex: nextCycle,
              running: true,
              phasePlannedSec: nextTotal,
              phaseEndsAtMs: nextEndsAt,
              pausedRemainingSec: nextTotal,
              focusStartedAtIso: null,
            };
          }

          // Descansos vuelven a foco
          const focusTotal = phaseToSeconds("focus", s);
          const nextEndsAt = Date.now() + focusTotal * 1000;
          const startedAtIso = new Date().toISOString();

          return {
            ...cur,
            phase: "focus",
            running: true,
            phasePlannedSec: focusTotal,
            phaseEndsAtMs: nextEndsAt,
            pausedRemainingSec: focusTotal,
            focusStartedAtIso: startedAtIso,
          };
        },
        {
          onLeaderCommit: async (prevLocal) => {
            // Insertamos sesión solo si terminó foco y teníamos start
            if (prevLocal.phase === "focus" && focusStartIso) {
              const startedMs = new Date(focusStartIso).getTime();
              const endedMs = new Date(endedAtIso).getTime();

              const elapsedSec =
                Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs
                  ? Math.max(1, Math.round((endedMs - startedMs) / 1000))
                  : Math.max(1, prevLocal.phasePlannedSec);

              await insertPomodoroFocusSessionAction({
                started_at: focusStartIso,
                ended_at: endedAtIso,
                focus_seconds: elapsedSec,
                project_id: null,
              });
            }
          },
        }
      );
    })().catch(() => {
      // Si explota, detenemos para no entrar en loop
      const cur = stRef.current;
      if (!cur || !userId) return;

      const stopped: LocalStateV2 = {
        ...cur,
        running: false,
        phaseEndsAtMs: null,
        pausedRemainingSec: 0,
        rev: cur.rev + 1,
        updatedAtMs: Date.now(),
      };
      applyLocal(stopped);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, remainingSec, playBeep]);

  /* ----------------- Acciones ----------------- */

  async function persistSettings(next: PomodoroSettings, dockOpen = st?.settings.dock_is_open ?? true) {
    if (!st) return;

    const normalized = normalizeSettings({ ...next, dock_is_open: dockOpen });

    // Local inmediato
    setSt((cur) => {
      if (!cur) return cur;
      const updated: LocalStateV2 = { ...cur, settings: normalized, updatedAtMs: Date.now() };
      saveLocalStateForUser(cur.userId, updated);
      return updated;
    });

    const res = await savePomodoroSettingsAction(normalized);
    if (res.ok) {
      const saved = normalizeSettings(res.data);
      setSt((cur) => {
        if (!cur) return cur;
        const updated: LocalStateV2 = { ...cur, settings: saved, updatedAtMs: Date.now() };
        saveLocalStateForUser(cur.userId, updated);
        return updated;
      });
    }
  }

  function start() {
    void commitWithServer((cur) => {
      if (cur.running) return cur;

      const baseRemaining = cur.pausedRemainingSec <= 0 ? cur.phasePlannedSec : cur.pausedRemainingSec;
      const endsAt = Date.now() + Math.max(1, baseRemaining) * 1000;

      const startedAtIso =
        cur.phase === "focus" && !cur.focusStartedAtIso ? new Date().toISOString() : cur.focusStartedAtIso;

      return {
        ...cur,
        running: true,
        phaseEndsAtMs: endsAt,
        pausedRemainingSec: baseRemaining,
        focusStartedAtIso: startedAtIso ?? null,
      };
    });
  }

  function pause() {
    void commitWithServer((cur) => {
      if (!cur.running) return cur;

      const ends = cur.phaseEndsAtMs;
      const rem = ends ? Math.max(0, Math.ceil((ends - Date.now()) / 1000)) : cur.pausedRemainingSec;

      return {
        ...cur,
        running: false,
        phaseEndsAtMs: null,
        pausedRemainingSec: rem,
      };
    });
  }

  function restartPhase(p: Phase) {
    void commitWithServer((cur) => {
      const planned = phaseToSeconds(p, cur.settings);
      return {
        ...cur,
        running: false,
        phase: p,
        phaseEndsAtMs: null,
        phasePlannedSec: planned,
        pausedRemainingSec: planned,
        focusStartedAtIso: null,
      };
    });
  }

  function switchPhase(p: Phase) {
    void commitWithServer((cur) => {
      const planned = phaseToSeconds(p, cur.settings);

      if (!cur.running) {
        return {
          ...cur,
          phase: p,
          phasePlannedSec: planned,
          pausedRemainingSec: planned,
          phaseEndsAtMs: null,
          focusStartedAtIso: p === "focus" ? cur.focusStartedAtIso : null,
        };
      }

      const endsAt = Date.now() + planned * 1000;
      const startedAtIso = p === "focus" ? new Date().toISOString() : null;

      return {
        ...cur,
        phase: p,
        phasePlannedSec: planned,
        pausedRemainingSec: planned,
        phaseEndsAtMs: endsAt,
        focusStartedAtIso: startedAtIso,
      };
    });
  }

  function restartAll() {
    void commitWithServer((cur) => {
      const planned = phaseToSeconds("focus", cur.settings);
      return {
        ...cur,
        running: false,
        phase: "focus",
        cycleIndex: 0,
        phaseEndsAtMs: null,
        phasePlannedSec: planned,
        pausedRemainingSec: planned,
        focusStartedAtIso: null,
      };
    });
  }

  function toggleOpen() {
    if (!st) return;
    void persistSettings(st.settings, !(st.settings.dock_is_open ?? true));
  }

  /* ----------------- Render ----------------- */

  if (!booted) return null;
  if (!st || !userId) return null;

  return (
    <div
      ref={dockRef}
      tabIndex={-1}
      className="fixed bottom-4 right-4 z-50 outline-none"
      aria-label="Dock Pomodoro"
    >
      {!open ? (
        <div className="w-[312px] max-w-[92vw]">
          <Card
            className={cn(
              "rounded-2xl border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 overflow-hidden cursor-pointer",
              "transition-all duration-300",
              isHovering && "scale-[1.01] shadow-md"
            )}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onClick={toggleOpen}
            role="button"
            aria-label="Abrir Pomodoro"
          >
            <div className="p-3">
              <div className="flex items-center gap-3">
                <MiniTimerCircle
                  progress={progress}
                  text={formatMMSS(remainingSec)}
                  running={st.running}
                  ringRunningClass={ringRunningClass}
                  ringPausedClass={ringPausedClass}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border bg-muted/30">
                        <meta.Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-none truncate">Pomodoro</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                          {meta.subtitle} · {collapsedLine2}
                        </p>
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge>{statusLabel}</Badge>
                      <HelpPopover />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Badge subtle>
                        {phaseLabel(st.phase)} · Ciclo {Math.max(1, st.cycleIndex + 1)}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1">
                      <IconButton
                        title={st.running ? "Pausar" : "Iniciar"}
                        ariaLabel={st.running ? "Pausar" : "Iniciar"}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (st.running) pause();
                          else start();
                        }}
                        variant="secondary"
                        size="sm"
                        className="h-9 w-9 rounded-xl"
                      >
                        {st.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </IconButton>

                      <IconButton
                        title="Abrir panel"
                        ariaLabel="Abrir panel"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleOpen();
                        }}
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 rounded-xl"
                      >
                        <PanelRightOpen className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border bg-gradient-to-r from-muted/10 to-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span className="truncate">{meta.hint}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Largo: {longIn === 0 ? "próximo" : `en ${longIn}`}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="w-[420px] max-w-[92vw]">
          <Card className="rounded-2xl border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/30">
                      <meta.Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">Pomodoro</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {meta.subtitle} · Ciclo {Math.max(1, st.cycleIndex + 1)}
                        {st.phase !== "long_break"
                          ? ` · Largo ${longIn === 0 ? "próximo" : `en ${longIn}`}`
                          : ""}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge>{statusLabel}</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <HelpPopover />
                  <IconButton
                    title="Ocultar panel"
                    ariaLabel="Ocultar panel"
                    onClick={toggleOpen}
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 rounded-xl"
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-4 py-4 space-y-4">
              <div className="flex items-center justify-center pt-1">
                <TimerCircle
                  progress={progress}
                  time={formatMMSS(remainingSec)}
                  subtitle={`${phaseLabel(st.phase)} · ${statusLabel}`}
                  running={st.running}
                  ringRunningClass={ringRunningClass}
                  ringPausedClass={ringPausedClass}
                  ariaLabel={`${formatMMSS(remainingSec)} restantes en ${phaseLabel(st.phase)}. Estado: ${statusLabel}.`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={start} disabled={st.running} className="h-11 gap-2">
                  <Play className="h-4 w-4" />
                  Iniciar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pause}
                  disabled={!st.running}
                  className="h-11 gap-2"
                >
                  <Pause className="h-4 w-4" />
                  Pausar
                </Button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => restartPhase(st.phase)}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reiniciar fase
                </Button>

                <Button type="button" variant="ghost" size="sm" className="gap-2" onClick={restartAll}>
                  <RotateCcw className="h-4 w-4" />
                  Reiniciar todo
                </Button>
              </div>

              <div className="rounded-2xl border bg-muted/15 p-1 grid grid-cols-3 gap-1">
                <PhaseSegment
                  active={st.phase === "focus"}
                  label="Foco"
                  icon={<Brain className="h-4 w-4" />}
                  onClick={() => switchPhase("focus")}
                />
                <PhaseSegment
                  active={st.phase === "short_break"}
                  label="Descanso"
                  icon={<Coffee className="h-4 w-4" />}
                  onClick={() => switchPhase("short_break")}
                />
                <PhaseSegment
                  active={st.phase === "long_break"}
                  label="Largo"
                  icon={<AlarmClock className="h-4 w-4" />}
                  onClick={() => switchPhase("long_break")}
                />
              </div>

              <SettingsPanel settings={st.settings} onChange={(next, dockOpen) => void persistSettings(next, dockOpen)} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ----------------- UI helpers ----------------- */

/**
 * Indicador circular basado en SVG.
 * Ventajas:
 * - Animación suave vía transición CSS (stroke-dashoffset)
 * - Colores con clases Tailwind (ej: stroke-emerald-500)
 * - Mejor accesibilidad (aria-live)
 */
function CircleProgress(props: {
  size: number;
  stroke: number;
  progress: number; // 0..1
  running: boolean;
  ringRunningClass: string;
  ringPausedClass: string;
  children: ReactNode;
  ariaLabel?: string;
  ariaLive?: "off" | "polite";
}) {
  const r = (props.size - props.stroke) / 2;
  const c = 2 * Math.PI * r;

  const clamped = Math.max(0, Math.min(1, props.progress));
  const offset = c * (1 - clamped);

  const ringClass = props.running ? props.ringRunningClass : props.ringPausedClass;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: props.size, height: props.size }}
      aria-label={props.ariaLabel}
      aria-live={props.ariaLive ?? "off"}
    >
      <svg width={props.size} height={props.size} className="absolute inset-0 -rotate-90">
        {/* Track */}
        <circle
          cx={props.size / 2}
          cy={props.size / 2}
          r={r}
          fill="none"
          className="stroke-muted"
          strokeWidth={props.stroke}
          opacity={0.5}
        />
        {/* Progress */}
        <circle
          cx={props.size / 2}
          cy={props.size / 2}
          r={r}
          fill="none"
          className={cn(ringClass)}
          strokeWidth={props.stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 220ms ease" }}
        />
      </svg>

      <div className="relative grid place-items-center rounded-full bg-card border w-[calc(100%-20px)] h-[calc(100%-20px)] shadow-inner">
        {props.children}
      </div>

      {props.running ? (
        <div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.06), 0 0 28px rgba(0,0,0,0.18)" }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function TimerCircle(props: {
  progress: number;
  time: string;
  subtitle: string;
  running: boolean;
  ringRunningClass: string;
  ringPausedClass: string;
  ariaLabel: string;
}) {
  return (
    <CircleProgress
      size={184}
      stroke={10}
      progress={props.progress}
      running={props.running}
      ringRunningClass={props.ringRunningClass}
      ringPausedClass={props.ringPausedClass}
      ariaLabel={props.ariaLabel}
      ariaLive={props.running ? "polite" : "off"}
    >
      <div className="text-center px-4">
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{props.time}</div>
        <div className="mt-1 text-xs text-muted-foreground">{props.subtitle}</div>
      </div>
    </CircleProgress>
  );
}

function MiniTimerCircle(props: {
  progress: number;
  text: string;
  running: boolean;
  ringRunningClass: string;
  ringPausedClass: string;
}) {
  const size = 46;

  // Mini: usamos el mismo componente, pero un contenido más compacto
  return (
    <div className="relative">
      <CircleProgress
        size={size}
        stroke={6}
        progress={props.progress}
        running={props.running}
        ringRunningClass={props.ringRunningClass}
        ringPausedClass={props.ringPausedClass}
        ariaLabel={`Mini temporizador: ${props.text}`}
      >
        <div className="text-[11px] font-semibold tabular-nums">{props.text}</div>
      </CircleProgress>

      <div
        className={cn("absolute -bottom-1 -right-1 h-3 w-3 rounded-full border bg-card", props.running && "animate-pulse")}
        aria-hidden="true"
      />
    </div>
  );
}

function PhaseSegment(props: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant={props.active ? "secondary" : "ghost"}
      size="sm"
      className="h-10 rounded-xl justify-center gap-2"
      onClick={props.onClick}
      aria-pressed={props.active}
    >
      {props.icon}
      <span className="text-sm">{props.label}</span>
    </Button>
  );
}

function TogglePill(props: {
  label: string;
  value: boolean;
  onToggle: () => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={props.value ? "secondary" : "ghost"}
      size="sm"
      className="rounded-full h-9 gap-2"
      onClick={props.onToggle}
      aria-pressed={props.value}
    >
      {props.value ? props.iconOn : props.iconOff}
      <span className="text-sm">{props.label}</span>
      <span className="text-xs text-muted-foreground">{props.value ? "Sí" : "No"}</span>
    </Button>
  );
}

function Badge(props: { children: ReactNode; subtle?: boolean }) {
  return (
    <span
      className={cn(
        "text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap",
        props.subtle ? "bg-muted/15 text-muted-foreground" : "bg-muted/35 text-muted-foreground"
      )}
    >
      {props.children}
    </span>
  );
}

function IconButton(props: {
  children: ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title: string;
  ariaLabel: string;
  variant?: "default" | "secondary" | "ghost";
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={props.variant ?? "ghost"}
      size={props.size ?? "sm"}
      className={props.className}
      onClick={props.onClick}
      title={props.title}
      aria-label={props.ariaLabel}
    >
      {props.children}
    </Button>
  );
}

function HelpPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 rounded-xl" aria-label="Ayuda Pomodoro">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80">
        <PomodoroHelp />
      </PopoverContent>
    </Popover>
  );
}

function PomodoroHelp() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4" />
        <p className="text-sm font-semibold">Cómo usar el Pomodoro</p>
      </div>

      <ul className="text-xs text-muted-foreground space-y-2">
        <li className="flex gap-2">
          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border bg-muted/30">
            <Play className="h-3 w-3" />
          </span>
          <span>
            <b className="text-foreground">Iniciar</b> comienza el temporizador.{" "}
            <b className="text-foreground">Pausar</b> lo detiene.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border bg-muted/30">
            <Coffee className="h-3 w-3" />
          </span>
          <span>
            Al terminar un <b className="text-foreground">Foco</b>, pasas a{" "}
            <b className="text-foreground">Descanso</b> (y a <b className="text-foreground">Largo</b> cada N ciclos).
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border bg-muted/30">
            <RotateCcw className="h-3 w-3" />
          </span>
          <span>
            <b className="text-foreground">Reiniciar fase</b> reinicia la fase actual.{" "}
            <b className="text-foreground">Reiniciar todo</b> vuelve al ciclo 1.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border bg-muted/30">
            <Settings2 className="h-3 w-3" />
          </span>
          <span>
            Este widget se <b className="text-foreground">sincroniza</b> entre pestañas y navegadores (si estás conectado).
          </span>
        </li>
      </ul>

      <div className="rounded-xl border bg-muted/15 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Sugerencia: durante el foco, define 1 objetivo pequeño y medible. Al iniciar el descanso, aléjate de la pantalla.
        </p>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  icon: ReactNode;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs text-muted-foreground flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg border bg-muted/20">{props.icon}</span>
        <span className="font-medium text-foreground/90">{props.label}</span>
        {props.suffix ? <span className="opacity-70">({props.suffix})</span> : null}
      </label>
      <Input
        id={id}
        type="number"
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="h-10 rounded-xl"
      />
    </div>
  );
}

function SettingsPanel(props: {
  settings: PomodoroSettings;
  onChange: (next: PomodoroSettings, dockOpen: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border overflow-hidden">
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center justify-between bg-muted/10 hover:bg-muted/15 transition"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          <span className="text-sm font-semibold">Ajustes</span>
          <span className="text-xs text-muted-foreground">Personaliza tiempos y alertas</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="px-3 pb-3 pt-3 space-y-3 bg-card">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Foco"
              suffix="min"
              icon={<Brain className="h-4 w-4" />}
              value={props.settings.focus_minutes}
              onChange={(v) =>
                props.onChange(
                  { ...props.settings, focus_minutes: clampInt(v, MIN_FOCUS_MINUTES, MAX_FOCUS_MINUTES, props.settings.focus_minutes) },
                  props.settings.dock_is_open ?? true
                )
              }
            />
            <Field
              label="Descanso"
              suffix="min"
              icon={<Coffee className="h-4 w-4" />}
              value={props.settings.short_break_minutes}
              onChange={(v) =>
                props.onChange(
                  {
                    ...props.settings,
                    short_break_minutes: clampInt(v, MIN_SHORT_BREAK_MINUTES, MAX_SHORT_BREAK_MINUTES, props.settings.short_break_minutes),
                  },
                  props.settings.dock_is_open ?? true
                )
              }
            />
            <Field
              label="Largo"
              suffix="min"
              icon={<AlarmClock className="h-4 w-4" />}
              value={props.settings.long_break_minutes}
              onChange={(v) =>
                props.onChange(
                  {
                    ...props.settings,
                    long_break_minutes: clampInt(v, MIN_LONG_BREAK_MINUTES, MAX_LONG_BREAK_MINUTES, props.settings.long_break_minutes),
                  },
                  props.settings.dock_is_open ?? true
                )
              }
            />
            <Field
              label="Largo cada"
              suffix="ciclos"
              icon={<Clock className="h-4 w-4" />}
              value={props.settings.cycles_before_long_break}
              onChange={(v) =>
                props.onChange(
                  {
                    ...props.settings,
                    cycles_before_long_break: clampInt(v, MIN_CYCLES_BEFORE_LONG, MAX_CYCLES_BEFORE_LONG, props.settings.cycles_before_long_break),
                  },
                  props.settings.dock_is_open ?? true
                )
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <TogglePill
              label="Notificaciones"
              value={props.settings.enable_notifications}
              iconOn={<Bell className="h-4 w-4" />}
              iconOff={<Bell className="h-4 w-4 opacity-60" />}
              onToggle={() => {
                void (async () => {
                  if (!props.settings.enable_notifications) await ensureNotificationPermission();
                  props.onChange(
                    { ...props.settings, enable_notifications: !props.settings.enable_notifications },
                    props.settings.dock_is_open ?? true
                  );
                })();
              }}
            />
            <TogglePill
              label="Sonido"
              value={props.settings.enable_sound}
              iconOn={<Volume2 className="h-4 w-4" />}
              iconOff={<VolumeX className="h-4 w-4" />}
              onToggle={() =>
                props.onChange(
                  { ...props.settings, enable_sound: !props.settings.enable_sound },
                  props.settings.dock_is_open ?? true
                )
              }
            />
          </div>

          <div className="rounded-xl border bg-muted/10 px-3 py-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Los cambios se guardan automáticamente. Si estás en medio de un conteo, los nuevos minutos aplican al
              reiniciar/cambiar de fase.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
