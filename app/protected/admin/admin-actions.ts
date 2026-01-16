//app/protected/admin/admin-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";

type ReportStatus = "open" | "resolved" | "dismissed";

function assertUuid(id: string): string {
  const s = String(id ?? "").trim();
  // validación liviana
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) throw new Error("ID inválido.");
  return s;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw new Error("No autenticado.");

  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", userRes.user.id)
    .maybeSingle<{ global_role: string | null }>();

  if (pErr) throw new Error(pErr.message);
  if (!prof || prof.global_role !== "admin") throw new Error("No autorizado (admin).");

  return { supabase, adminId: userRes.user.id };
}

/** Cambiar estado del reporte */
export async function adminSetReportStatusAction(args: {
  report_id: string;
  status: ReportStatus;
  admin_note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, adminId } = await requireAdmin();

    const reportId = assertUuid(args.report_id);
    const status = args.status;

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("reports")
      .update({
        status,
        admin_note: args.admin_note ?? null,
        handled_by: adminId,
        handled_at: now,
        updated_at: now,
      })
      .eq("id", reportId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error." };
  }
}

/** Ocultar/mostrar proyecto (moderación) */
export async function adminSetProjectHiddenAction(args: {
  project_id: string;
  hidden: boolean;
  moderation_note?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase, adminId } = await requireAdmin();
    const projectId = assertUuid(args.project_id);

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("projects")
      .update({
        is_hidden: args.hidden,
        moderation_note: args.moderation_note ?? null,
        moderated_by: adminId,
        moderated_at: now,
        updated_at: now,
      })
      .eq("id", projectId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error." };
  }
}

/** Eliminar proyecto (moderación) */
export async function adminDeleteProjectAction(args: {
  project_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { supabase } = await requireAdmin();
    const projectId = assertUuid(args.project_id);

    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) return { ok: false, error: error.message };

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error." };
  }
}
