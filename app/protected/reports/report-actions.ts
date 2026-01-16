"use server";

import { createClient } from "@/lib/supabase/server";

function assertUuid(id: string): string {
  const s = String(id ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) throw new Error("ID inválido.");
  return s;
}

type ProjectRowMin = {
  id: string;
  visibility: "private" | "unlisted" | "public";
  is_hidden: boolean;
  published_at: string | null;
};

export async function createReportAction(args: {
  project_id: string; // projects.id
  description: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();

    // Auth
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) return { ok: false, error: "No autenticado." };

    const projectId = assertUuid(args.project_id);
    const desc = String(args.description ?? "").trim();

    if (desc.length < 10) {
      return { ok: false, error: "Describe el problema (mín. 10 caracteres)." };
    }
    if (desc.length > 2000) {
      return { ok: false, error: "Descripción demasiado larga (máx. 2000)." };
    }

    // (1) Validar proyecto base desde projects (fuente de verdad)
    const { data: p, error: pErr } = await supabase
      .from("projects")
      .select("id,visibility,is_hidden,published_at")
      .eq("id", projectId)
      .maybeSingle<ProjectRowMin>();

    if (pErr) return { ok: false, error: pErr.message };
    if (!p) return { ok: false, error: "Proyecto no encontrado." };

    // Regla: solo reportable si está visible en comunidad (public/unlisted + publicado + no hidden)
    const isCommunityVisible =
      !p.is_hidden &&
      (p.visibility === "public" || p.visibility === "unlisted") &&
      !!p.published_at;

    if (!isCommunityVisible) {
      // Este mensaje reemplaza el de "publicación válida" (ya no dependemos de published_projects)
      return { ok: false, error: "Este proyecto no está disponible para ser reportado." };
    }

    const now = new Date().toISOString();

    // (2) Insert en reports usando project_id (coherente con tu admin)
    // Nota: incluimos updated_at porque en tu schema/admin lo usas.
    const { error: insErr } = await supabase.from("reports").insert({
      project_id: projectId,
      reporter_user_id: userRes.user.id,
      description: desc,
      status: "open",
      created_at: now,
      updated_at: now,
      // admin_note: null (default)
    });

    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Error." };
  }
}
