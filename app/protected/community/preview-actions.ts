// app/protected/community/preview-actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { 
  FlashcardGroupRow, 
  FlashcardRow, 
  ProjectBlockRow, 
  ProjectRow,
  ProjectVisibility 
} from "@/lib/types/study";

export type PreviewPayload = {
  project: Pick<ProjectRow, "id" | "owner_user_id" | "title" | "description_md" | "visibility" | "published_at" | "updated_at">;
  blocks: ProjectBlockRow[];
  groups: FlashcardGroupRow[];
  cards: FlashcardRow[];
};

export async function getProjectPreviewAction(projectId: string): Promise<
  { ok: true; data: PreviewPayload } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) return { ok: false, error: "No autenticado." };

  // Proyecto público + publicado + no hidden (igual que comunidad)
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id,owner_user_id,title,description_md,visibility,published_at,updated_at,is_hidden")
    .eq("id", projectId)
    .eq("visibility", "public")
    .eq("is_hidden", false)
    .not("published_at", "is", null)
    .maybeSingle();

  if (pErr) return { ok: false, error: pErr.message };
  if (!project) return { ok: false, error: "Proyecto no disponible." };

  // Validar que los tipos sean correctos
  const typedProject = project as {
    id: string;
    owner_user_id: string;
    title: string;
    description_md: string | null;
    visibility: ProjectVisibility;
    published_at: string | null;
    updated_at: string;
    is_hidden: boolean;
  };

  const { data: blocks, error: bErr } = await supabase
    .from("project_blocks")
    .select("id,project_id,type,order_index,data,created_at,updated_at")
    .eq("project_id", typedProject.id)
    .order("order_index", { ascending: true })
    .returns<ProjectBlockRow[]>();

  if (bErr) return { ok: false, error: bErr.message };

  const blockIds = (blocks ?? []).map((b) => b.id);

  let groups: FlashcardGroupRow[] = [];
  if (blockIds.length) {
    const { data: g, error: gErr } = await supabase
      .from("flashcard_groups")
      .select("id,block_id,title,order_index,created_at")
      .in("block_id", blockIds)
      .order("order_index", { ascending: true })
      .returns<FlashcardGroupRow[]>();

    if (gErr) return { ok: false, error: gErr.message };
    groups = g ?? [];
  }

  const { data: cards, error: cErr } = await supabase
    .from("flashcards")
    .select("id,project_id,group_id,front,back,order_index,created_at,updated_at")
    .eq("project_id", typedProject.id)
    .order("order_index", { ascending: true })
    .returns<FlashcardRow[]>();

  if (cErr) return { ok: false, error: cErr.message };

  return {
    ok: true,
    data: {
      project: {
        id: typedProject.id,
        owner_user_id: typedProject.owner_user_id,
        title: typedProject.title,
        description_md: typedProject.description_md,
        visibility: typedProject.visibility,
        published_at: typedProject.published_at,
        updated_at: typedProject.updated_at,
      },
      blocks: blocks ?? [],
      groups,
      cards: cards ?? [],
    },
  };
}