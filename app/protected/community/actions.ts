//app/protected/community/actions.ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseProjectIdValue } from "@/lib/project-id";
import type { ProjectId, ProjectRole, ProjectVisibility } from "@/lib/types/study";

type ProjectMin = {
  id: ProjectId;
  owner_user_id: string;
  visibility: ProjectVisibility;
  is_hidden: boolean;
};

export async function importProjectAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("project_id") ?? "").trim();
  const projectIdValue = parseProjectIdValue(raw);

  if (!projectIdValue) {
    redirect("/protected/community?error=ID%20de%20proyecto%20inv%C3%A1lido");
  }

  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");

  // Confirmar que sea público y no hidden
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id, owner_user_id, visibility, is_hidden")
    .eq("id", projectIdValue)
    .single<ProjectMin>();

  if (pErr || !project || project.is_hidden || project.visibility !== "public") {
    redirect("/protected/community?error=Proyecto%20no%20disponible%20para%20importar");
  }

  if (project.owner_user_id === userRes.user.id) {
    redirect("/protected/community?error=No%20puedes%20importar%20tu%20propio%20proyecto");
  }

  // Insert idempotente: si ya existe, no rompe
  const { error } = await supabase
    .from("project_members")
    .upsert(
      {
        project_id: project.id,
        user_id: userRes.user.id,
        role: "guest" as ProjectRole,
      },
      { onConflict: "project_id,user_id" },
    );

  if (error) {
    redirect(`/protected/community?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/protected/projects/${String(project.id)}`);
}
