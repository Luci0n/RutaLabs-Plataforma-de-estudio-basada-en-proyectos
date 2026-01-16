// app/protected/pomodoro/pomodoro-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export type PomodoroSettings = {
  focus_minutes: number;
  short_break_minutes: number;
  long_break_minutes: number;
  cycles_before_long_break: number;
  enable_notifications: boolean;
  enable_sound: boolean;
  dock_is_open: boolean;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

export async function getPomodoroSettingsAction(): Promise<ActionResult<PomodoroSettings>> {
  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return { ok: false, error: "No autenticado." };

  // Defaults si no existe fila
  const defaults: PomodoroSettings = {
    focus_minutes: 25,
    short_break_minutes: 5,
    long_break_minutes: 15,
    cycles_before_long_break: 4,
    enable_notifications: false,
    enable_sound: true,
    dock_is_open: true,
  };

  try {
    const { data, error } = await supabase
      .from("pomodoro_settings")
      .select(
        "focus_minutes,short_break_minutes,long_break_minutes,cycles_before_long_break,enable_notifications,enable_sound,dock_is_open"
      )
      .eq("user_id", userRes.user.id)
      .maybeSingle<PomodoroSettings>();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: true, data: defaults };

    return {
      ok: true,
      data: {
        focus_minutes: clampInt(data.focus_minutes, 1, 180, defaults.focus_minutes),
        short_break_minutes: clampInt(data.short_break_minutes, 1, 60, defaults.short_break_minutes),
        long_break_minutes: clampInt(data.long_break_minutes, 1, 120, defaults.long_break_minutes),
        cycles_before_long_break: clampInt(data.cycles_before_long_break, 1, 12, defaults.cycles_before_long_break),
        enable_notifications: Boolean(data.enable_notifications),
        enable_sound: Boolean(data.enable_sound),
        dock_is_open: Boolean(data.dock_is_open),
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error leyendo settings." };
  }
}

export async function savePomodoroSettingsAction(
  input: Partial<PomodoroSettings>
): Promise<ActionResult<PomodoroSettings>> {
  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return { ok: false, error: "No autenticado." };

  const safe: PomodoroSettings = {
    focus_minutes: clampInt(input.focus_minutes, 1, 180, 25),
    short_break_minutes: clampInt(input.short_break_minutes, 1, 60, 5),
    long_break_minutes: clampInt(input.long_break_minutes, 1, 120, 15),
    cycles_before_long_break: clampInt(input.cycles_before_long_break, 1, 12, 4),
    enable_notifications: Boolean(input.enable_notifications),
    enable_sound: Boolean(input.enable_sound ?? true),
    dock_is_open: Boolean(input.dock_is_open ?? true),
  };

  try {
    const { data, error } = await supabase
      .from("pomodoro_settings")
      .upsert(
        {
          user_id: userRes.user.id,
          ...safe,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select(
        "focus_minutes,short_break_minutes,long_break_minutes,cycles_before_long_break,enable_notifications,enable_sound,dock_is_open"
      )
      .single<PomodoroSettings>();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error guardando settings." };
  }
}

/**
 * Registra una sesión de foco en pomodoro_sessions (BD ya existe)
 * Nota: ajusta nombres si tu schema difiere.
 */
export async function insertPomodoroFocusSessionAction(args: {
  started_at: string; // ISO
  ended_at: string; // ISO
  focus_seconds: number;
  project_id?: string | null;
}): Promise<ActionResult<true>> {
  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return { ok: false, error: "No autenticado." };

  const focusSeconds = clampInt(args.focus_seconds, 1, 24 * 60 * 60, 25 * 60);

  try {
    const { error } = await supabase.from("pomodoro_sessions").insert({
      user_id: userRes.user.id,
      started_at: args.started_at,
      ended_at: args.ended_at,
      focus_seconds: focusSeconds,
      project_id: args.project_id ?? null,
      created_at: new Date().toISOString(),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error insertando sesión." };
  }
}
