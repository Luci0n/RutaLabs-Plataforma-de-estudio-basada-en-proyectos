// app/protected/projects/actions.ts
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createProjectAction(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description_md") ?? "").trim();
  const description_md = descriptionRaw.length ? descriptionRaw : null;

  if (!title) {
    redirect("/protected/projects/new?error=El%20t%C3%ADtulo%20es%20obligatorio");
  }

  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");

  const userId = userRes.user.id;

  const { data: project, error: insErr } = await supabase
    .from("projects")
    .insert({
      owner_user_id: userId,
      title,
      description_md,
      visibility: "private",
    })
    .select("id")
    .single<{ id: string }>();

  if (insErr || !project?.id) {
    redirect(
      `/protected/projects/new?error=${encodeURIComponent(
        insErr?.message ?? "Error creando proyecto"
      )}`
    );
  }

  // Asegurar membership owner (idempotente)
  await supabase
    .from("project_members")
    .upsert(
      { project_id: project.id, user_id: userId, role: "owner" },
      { onConflict: "project_id,user_id" }
    );

  revalidatePath("/protected/projects");
  redirect(`/protected/projects/${project.id}`);
}
