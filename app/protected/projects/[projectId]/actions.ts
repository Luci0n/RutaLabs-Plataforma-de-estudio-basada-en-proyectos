// app/protected/projects/[projectId]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseProjectIdValue } from "@/lib/project-id";
import type {
  FlashcardGroupRow,
  FlashcardRow,
  ProjectBlockRow,
  ProjectId,
  ProjectRole,
} from "@/lib/types/study";

type BlockType = "text" | "flashcards";
type Visibility = "private" | "unlisted" | "public";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function enc(v: string): string {
  return encodeURIComponent(v);
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function isVisibility(v: string): v is Visibility {
  return v === "private" || v === "unlisted" || v === "public";
}

function isBlockType(v: string): v is BlockType {
  return v === "text" || v === "flashcards";
}

function isMemberRole(v: string): v is Exclude<ProjectRole, "owner"> {
  return v === "guest" || v === "editor";
}

function tabFrom(formData: FormData, fallback: string | null): string | null {
  const t = String(formData.get("tab") ?? "").trim();
  return t || fallback;
}

function mustProjectId(raw: string): ProjectId {
  const v = parseProjectIdValue(raw);
  if (!v) redirect("/protected/projects?error=ID%20inv%C3%A1lido");
  return v;
}

function mustProjectIdNoRedirect(raw: string): ActionResult<ProjectId> {
  const v = parseProjectIdValue(raw);
  if (!v) return { ok: false, error: "ID inválido" };
  return { ok: true, data: v };
}

async function requireUser(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/auth/login");
  return { userId: data.user.id };
}

async function getAuthedSupabase(): Promise<
  ActionResult<{ supabase: SupabaseClient; userId: string }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: "No autenticado" };
  return { ok: true, data: { supabase, userId: data.user.id } };
}

/* ======================================================================================
   AUTHZ HELPERS
   - Owner: control total del proyecto
   - Editor: puede ver y editar contenido (bloques + flashcards), NO meta/visibilidad/roles/eliminar
====================================================================================== */

async function assertOwner(projectIdValue: ProjectId, userId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("owner_user_id,is_hidden")
    .eq("id", projectIdValue)
    .single<{ owner_user_id: string; is_hidden: boolean }>();

  if (error || !data) throw new Error(error?.message ?? "Proyecto no encontrado");
  if (data.is_hidden) throw new Error("Proyecto no disponible.");
  if (data.owner_user_id !== userId) throw new Error("No autorizado (solo dueño).");
}

async function assertOwnerWith(
  supabase: SupabaseClient,
  projectIdValue: ProjectId,
  userId: string
): Promise<ActionResult<true>> {
  const { data, error } = await supabase
    .from("projects")
    .select("owner_user_id,is_hidden")
    .eq("id", projectIdValue)
    .single<{ owner_user_id: string; is_hidden: boolean }>();

  if (error || !data) return { ok: false, error: error?.message ?? "Proyecto no encontrado" };
  if (data.is_hidden) return { ok: false, error: "Proyecto no disponible." };
  if (data.owner_user_id !== userId) return { ok: false, error: "No autorizado (solo dueño)." };
  return { ok: true, data: true };
}

async function assertCanEditContent(projectIdValue: ProjectId, userId: string): Promise<void> {
  const supabase = await createClient();

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("owner_user_id,is_hidden")
    .eq("id", projectIdValue)
    .single<{ owner_user_id: string; is_hidden: boolean }>();

  if (pErr || !proj) throw new Error(pErr?.message ?? "Proyecto no encontrado");
  if (proj.is_hidden) throw new Error("Proyecto no disponible.");

  // Dueño: siempre puede
  if (proj.owner_user_id === userId) return;

  // Editor: puede editar contenido
  const { data: mem, error: mErr } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectIdValue)
    .eq("user_id", userId)
    .maybeSingle<{ role: ProjectRole }>();

  if (mErr) throw new Error(mErr.message);

  if (!mem || mem.role !== "editor") {
    throw new Error("No autorizado (solo dueño o editor).");
  }
}

async function assertCanEditContentWith(
  supabase: SupabaseClient,
  projectIdValue: ProjectId,
  userId: string
): Promise<ActionResult<true>> {
  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("owner_user_id,is_hidden")
    .eq("id", projectIdValue)
    .single<{ owner_user_id: string; is_hidden: boolean }>();

  if (pErr || !proj) return { ok: false, error: pErr?.message ?? "Proyecto no encontrado" };
  if (proj.is_hidden) return { ok: false, error: "Proyecto no disponible." };

  if (proj.owner_user_id === userId) return { ok: true, data: true };

  const { data: mem, error: mErr } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectIdValue)
    .eq("user_id", userId)
    .maybeSingle<{ role: ProjectRole }>();

  if (mErr) return { ok: false, error: mErr.message };
  if (!mem || mem.role !== "editor") return { ok: false, error: "No autorizado (solo dueño o editor)." };

  return { ok: true, data: true };
}

function rev(projectIdStr: string): void {
  revalidatePath(`/protected/projects/${projectIdStr}`);
  revalidatePath(`/protected/projects/${projectIdStr}/`);
  revalidatePath("/protected/projects");
  revalidatePath("/protected/community");
}

function redirectBackToProject(projectIdStr: string, tab: string | null, err?: string): never {
  const base = `/protected/projects/${enc(projectIdStr)}`;
  const qp: string[] = [];
  if (tab) qp.push(`tab=${enc(tab)}`);
  if (err) qp.push(`error=${enc(err)}`);
  const url = qp.length ? `${base}?${qp.join("&")}` : base;
  redirect(url);
}

/* ---------------------------------------
   MEMBERSHIP: LEAVE PROJECT
----------------------------------------*/

export async function leaveProjectAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const projectId = mustProjectId(raw);

  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");
  const userId = userRes.user.id;

  const { data: project } = await supabase
    .from("projects")
    .select("id,owner_user_id,is_hidden")
    .eq("id", projectId)
    .single<{ id: string | number; owner_user_id: string; is_hidden: boolean }>();

  if (!project || project.is_hidden) redirect("/protected/projects?error=Proyecto%20no%20encontrado");

  if (project.owner_user_id === userId) {
    redirectBackToProject(String(project.id), tab, "El dueño no puede retirarse del proyecto.");
  }

  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) redirectBackToProject(String(projectId), tab, error.message);

  revalidatePath("/protected/projects");
  redirect("/protected/projects");
}

/* ---------------------------------------
   PROJECT SETTINGS (SOLO DUEÑO)
----------------------------------------*/

export async function updateProjectMetaAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("description_md") ?? "").trim();
  const description_md = descriptionRaw.length ? descriptionRaw : null;

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !title) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      title,
      description_md,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectIdValue);

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function setProjectVisibilityAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const visibilityStr = String(formData.get("visibility") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isVisibility(visibilityStr)) {
    redirectBackToProject(projectIdStr, tab, "Datos inválidos");
  }

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data: cur } = await supabase
    .from("projects")
    .select("published_at")
    .eq("id", projectIdValue)
    .maybeSingle<{ published_at: string | null }>();

  const published_at = visibilityStr === "private" ? null : cur?.published_at ?? nowIso;

  const { error } = await supabase
    .from("projects")
    .update({
      visibility: visibilityStr,
      published_at,
      updated_at: nowIso,
    })
    .eq("id", projectIdValue);

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue) redirect("/protected/projects?error=ID%20inv%C3%A1lido");

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  await supabase.from("flashcards").delete().eq("project_id", projectIdValue);

  const { data: blocks } = await supabase
    .from("project_blocks")
    .select("id,type")
    .eq("project_id", projectIdValue)
    .returns<{ id: string; type: BlockType }[]>();

  const flashBlockIds = (blocks ?? []).filter((b) => b.type === "flashcards").map((b) => b.id);

  if (flashBlockIds.length) {
    await supabase.from("flashcard_groups").delete().in("block_id", flashBlockIds);
  }

  await supabase.from("project_blocks").delete().eq("project_id", projectIdValue);
  await supabase.from("project_members").delete().eq("project_id", projectIdValue);

  const { error } = await supabase.from("projects").delete().eq("id", projectIdValue);
  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  revalidatePath("/protected/projects");
  revalidatePath("/protected/community");
  redirect("/protected/projects");
}

/* ---------------------------------------
   BLOCKS: add/move/update/delete
   - Estructura del proyecto: SOLO DUEÑO
----------------------------------------*/

export async function addBlockAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const typeStr = String(formData.get("type") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isBlockType(typeStr)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("project_blocks")
    .select("order_index")
    .eq("project_id", projectIdValue)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  const dataPayload: Record<string, unknown> = typeStr === "text" ? { md: "" } : { note: "flashcards_block" };

  const { error } = await supabase.from("project_blocks").insert({
    project_id: projectIdValue,
    type: typeStr,
    order_index: nextIndex,
    data: dataPayload,
  });

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

/* ---------------------------------------
   TEXT BLOCK SAVE
   - Contenido: DUEÑO o EDITOR
----------------------------------------*/

export async function updateTextBlockAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const blockId = String(formData.get("block_id") ?? "").trim();
  const md = String(formData.get("md") ?? "");

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(blockId)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", blockId)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(projectIdValue) || blk.type !== "text") {
    redirectBackToProject(projectIdStr, tab, "Bloque inválido");
  }

  const { error } = await supabase
    .from("project_blocks")
    .update({ data: { md }, updated_at: new Date().toISOString() })
    .eq("id", blockId);

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function moveBlockAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const blockId = String(formData.get("block_id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(blockId) || (direction !== "up" && direction !== "down")) {
    redirectBackToProject(projectIdStr, tab, "Datos inválidos");
  }

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: blocks, error } = await supabase
    .from("project_blocks")
    .select("id,order_index")
    .eq("project_id", projectIdValue)
    .order("order_index", { ascending: true })
    .returns<{ id: string; order_index: number }[]>();

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  const list = blocks ?? [];
  const idx = list.findIndex((b) => b.id === blockId);
  if (idx < 0) redirectBackToProject(projectIdStr, tab, "Bloque no encontrado");

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) {
    rev(projectIdStr);
    redirectBackToProject(projectIdStr, tab);
  }

  const a = list[idx];
  const b = list[swapWith];

  const { error: e1 } = await supabase.from("project_blocks").update({ order_index: b.order_index }).eq("id", a.id);
  const { error: e2 } = await supabase.from("project_blocks").update({ order_index: a.order_index }).eq("id", b.id);

  if (e1 || e2) {
    redirectBackToProject(projectIdStr, tab, (e1 ?? e2)?.message ?? "Error reordenando");
  }

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const blockId = String(formData.get("block_id") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(blockId)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", blockId)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(projectIdValue)) {
    redirectBackToProject(projectIdStr, tab, "Bloque inválido");
  }

  if (blk.type === "flashcards") {
    const { data: groups } = await supabase
      .from("flashcard_groups")
      .select("id")
      .eq("block_id", blockId)
      .returns<{ id: string }[]>();

    const groupIds = (groups ?? []).map((g) => g.id);
    if (groupIds.length) {
      await supabase.from("flashcards").delete().eq("project_id", projectIdValue).in("group_id", groupIds);
      await supabase.from("flashcard_groups").delete().eq("block_id", blockId);
    }
  }

  const { error } = await supabase.from("project_blocks").delete().eq("id", blockId);
  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}
/* ---------------------------------------
   GROUPS: ensure default + add/rename/delete
   - Contenido flashcards: DUEÑO o EDITOR
----------------------------------------*/

export async function ensureDefaultGroupAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const blockId = String(formData.get("block_id") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(blockId)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", blockId)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(projectIdValue) || blk.type !== "flashcards") {
    redirectBackToProject(projectIdStr, tab, "Bloque inválido");
  }

  const { data: existing } = await supabase
    .from("flashcard_groups")
    .select("id")
    .eq("block_id", blockId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    rev(projectIdStr);
    redirectBackToProject(projectIdStr, tab);
  }

  const { data: last } = await supabase
    .from("flashcard_groups")
    .select("order_index")
    .eq("block_id", blockId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  const { error } = await supabase.from("flashcard_groups").insert({
    block_id: blockId,
    title: "General",
    order_index: nextIndex,
  });

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function addGroupAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const blockId = String(formData.get("block_id") ?? "").trim();
  const titleRaw = String(formData.get("title") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(blockId)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", blockId)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(projectIdValue) || blk.type !== "flashcards") {
    redirectBackToProject(projectIdStr, tab, "Bloque inválido");
  }

  const { data: last } = await supabase
    .from("flashcard_groups")
    .select("order_index")
    .eq("block_id", blockId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  let title = titleRaw;
  if (!title) {
    const { count } = await supabase
      .from("flashcard_groups")
      .select("*", { count: "exact", head: true })
      .eq("block_id", blockId);

    title = (count ?? 0) === 0 ? "General" : `Grupo ${nextIndex + 1}`;
  }

  const { error } = await supabase.from("flashcard_groups").insert({
    block_id: blockId,
    title,
    order_index: nextIndex,
  });

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function renameGroupAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const groupId = String(formData.get("group_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(groupId) || !title) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: g, error: gErr } = await supabase
    .from("flashcard_groups")
    .select("id,block_id")
    .eq("id", groupId)
    .single<{ id: string; block_id: string }>();

  if (gErr || !g) redirectBackToProject(projectIdStr, tab, "Grupo no encontrado");

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id")
    .eq("id", g.block_id)
    .single<{ project_id: ProjectId }>();

  if (bErr || !blk || String(blk.project_id) !== String(projectIdValue)) {
    redirectBackToProject(projectIdStr, tab, "Grupo inválido");
  }

  const { error } = await supabase.from("flashcard_groups").update({ title }).eq("id", groupId);
  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const groupId = String(formData.get("group_id") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(groupId)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  await supabase.from("flashcards").delete().eq("project_id", projectIdValue).eq("group_id", groupId);

  const { error } = await supabase.from("flashcard_groups").delete().eq("id", groupId);
  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

/* ---------------------------------------
   CARDS: add/update/delete
   - Contenido flashcards: DUEÑO o EDITOR
----------------------------------------*/

export async function addCardAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const groupId = String(formData.get("group_id") ?? "").trim();
  const front = String(formData.get("front") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(groupId) || !front || !back) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("flashcards")
    .select("order_index")
    .eq("project_id", projectIdValue)
    .eq("group_id", groupId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  const { error } = await supabase.from("flashcards").insert({
    project_id: projectIdValue,
    group_id: groupId,
    front,
    back,
    order_index: nextIndex,
  });

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function updateCardAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const cardId = String(formData.get("card_id") ?? "").trim();
  const front = String(formData.get("front") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(cardId) || !front || !back) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("flashcards")
    .update({ front, back, updated_at: new Date().toISOString() })
    .eq("id", cardId)
    .eq("project_id", projectIdValue);

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function deleteCardAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "edit");
  const cardId = String(formData.get("card_id") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !isUuid(cardId)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertCanEditContent(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("flashcards").delete().eq("id", cardId).eq("project_id", projectIdValue);

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

/* ---------------------------------------
   MEMBERS: role + transfer owner (SOLO DUEÑO)
----------------------------------------*/

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "members");
  const targetUserId = String(formData.get("user_id") ?? "").trim();
  const roleStr = String(formData.get("role") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !targetUserId || !isMemberRole(roleStr)) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId } = await requireUser();
  try {
    await assertOwner(projectIdValue, userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_members")
    .update({ role: roleStr })
    .eq("project_id", projectIdValue)
    .eq("user_id", targetUserId);

  if (error) redirectBackToProject(projectIdStr, tab, error.message);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

export async function transferOwnershipAction(formData: FormData): Promise<void> {
  const projectIdStr = String(formData.get("project_id") ?? "").trim();
  const tab = tabFrom(formData, "members");
  const newOwnerId = String(formData.get("new_owner_user_id") ?? "").trim();

  const projectIdValue = parseProjectIdValue(projectIdStr);
  if (!projectIdValue || !newOwnerId) redirectBackToProject(projectIdStr, tab, "Datos inválidos");

  const { userId: currentOwnerId } = await requireUser();
  try {
    await assertOwner(projectIdValue, currentOwnerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No autorizado";
    redirectBackToProject(projectIdStr, tab, msg);
  }

  const supabase = await createClient();

  const { error: e1 } = await supabase
    .from("projects")
    .update({ owner_user_id: newOwnerId, updated_at: new Date().toISOString() })
    .eq("id", projectIdValue);

  if (e1) redirectBackToProject(projectIdStr, tab, e1.message);

  await supabase.from("project_members").upsert(
    { project_id: projectIdValue, user_id: newOwnerId, role: "owner" as ProjectRole },
    { onConflict: "project_id,user_id" }
  );

  await supabase.from("project_members").upsert(
    { project_id: projectIdValue, user_id: currentOwnerId, role: "editor" as ProjectRole },
    { onConflict: "project_id,user_id" }
  );

  await supabase
    .from("project_members")
    .update({ role: "guest" as ProjectRole })
    .eq("project_id", projectIdValue)
    .eq("role", "owner")
    .neq("user_id", newOwnerId);

  await supabase
    .from("project_members")
    .update({ role: "owner" as ProjectRole })
    .eq("project_id", projectIdValue)
    .eq("user_id", newOwnerId);

  rev(projectIdStr);
  redirectBackToProject(projectIdStr, tab);
}

/* ======================================================================================
   RPC ACTIONS (SIN redirect) PARA UI EN CLIENTE
====================================================================================== */

/* ---------------------------
   BLOCKS RPC
   - Estructura: SOLO DUEÑO
----------------------------*/

export async function addBlockRpc(input: {
  project_id: string;
  type: BlockType;
}): Promise<ActionResult<ProjectBlockRow>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isBlockType(input.type)) return { ok: false, error: "Tipo inválido" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const own = await assertOwnerWith(supabase, pid.data, userId);
  if (!own.ok) return own;

  const { data: last } = await supabase
    .from("project_blocks")
    .select("order_index")
    .eq("project_id", pid.data)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  const dataPayload: Record<string, unknown> =
    input.type === "text" ? { md: "" } : { note: "flashcards_block" };
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("project_blocks")
    .insert({
      project_id: pid.data,
      type: input.type,
      order_index: nextIndex,
      data: dataPayload,
      updated_at: nowIso,
    })
    .select("id,project_id,type,order_index,data,created_at,updated_at")
    .single<ProjectBlockRow>();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear el bloque" };

  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data };
}

/* ---------------------------
   TEXT BLOCK RPC
   - Contenido: DUEÑO o EDITOR
----------------------------*/

export async function updateTextBlockRpc(input: {
  project_id: string;
  block_id: string;
  md: string;
}): Promise<ActionResult<{ id: string; updated_at: string; data: { md: string } }>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.block_id)) return { ok: false, error: "Block inválido" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", input.block_id)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(pid.data) || blk.type !== "text") {
    return { ok: false, error: "Bloque inválido" };
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("project_blocks")
    .update({ data: { md: input.md ?? "" }, updated_at: nowIso })
    .eq("id", input.block_id)
    .select("id,updated_at,data")
    .single<{ id: string; updated_at: string; data: { md: string } }>();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar" };

  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return {
    ok: true,
    data: { id: data.id, updated_at: data.updated_at, data: { md: data.data?.md ?? "" } },
  };
}

/* ---------------------------
   MOVE/DELETE BLOCK RPC
   - Estructura: SOLO DUEÑO
----------------------------*/

export async function moveBlockRpc(input: {
  project_id: string;
  block_id: string;
  direction: "up" | "down";
}): Promise<
  ActionResult<{
    a: { id: string; order_index: number };
    b: { id: string; order_index: number };
  }>
> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.block_id)) return { ok: false, error: "Block inválido" };
  if (input.direction !== "up" && input.direction !== "down")
    return { ok: false, error: "Dirección inválida" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const own = await assertOwnerWith(supabase, pid.data, userId);
  if (!own.ok) return own;

  const { data: blocks, error } = await supabase
    .from("project_blocks")
    .select("id,order_index")
    .eq("project_id", pid.data)
    .order("order_index", { ascending: true })
    .returns<{ id: string; order_index: number }[]>();

  if (error) return { ok: false, error: error.message };

  const list = blocks ?? [];
  const idx = list.findIndex((b) => b.id === input.block_id);
  if (idx < 0) return { ok: false, error: "Bloque no encontrado" };

  const swapWith = input.direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) {
    return {
      ok: true,
      data: {
        a: { id: list[idx].id, order_index: list[idx].order_index },
        b: { id: list[idx].id, order_index: list[idx].order_index },
      },
    };
  }

  const a = list[idx];
  const b = list[swapWith];
  const nowIso = new Date().toISOString();

  const { error: e1 } = await supabase
    .from("project_blocks")
    .update({ order_index: b.order_index, updated_at: nowIso })
    .eq("id", a.id);

  const { error: e2 } = await supabase
    .from("project_blocks")
    .update({ order_index: a.order_index, updated_at: nowIso })
    .eq("id", b.id);

  if (e1 || e2) return { ok: false, error: (e1 ?? e2)?.message ?? "Error reordenando" };

  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return {
    ok: true,
    data: {
      a: { id: a.id, order_index: b.order_index },
      b: { id: b.id, order_index: a.order_index },
    },
  };
}

export async function deleteBlockRpc(input: {
  project_id: string;
  block_id: string;
}): Promise<ActionResult<true>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.block_id)) return { ok: false, error: "Block inválido" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const own = await assertOwnerWith(supabase, pid.data, userId);
  if (!own.ok) return own;

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", input.block_id)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(pid.data))
    return { ok: false, error: "Bloque inválido" };

  if (blk.type === "flashcards") {
    const { data: groups } = await supabase
      .from("flashcard_groups")
      .select("id")
      .eq("block_id", input.block_id)
      .returns<{ id: string }[]>();

    const groupIds = (groups ?? []).map((g) => g.id);
    if (groupIds.length) {
      await supabase.from("flashcards").delete().eq("project_id", pid.data).in("group_id", groupIds);
      await supabase.from("flashcard_groups").delete().eq("block_id", input.block_id);
    }
  }

  const { error } = await supabase.from("project_blocks").delete().eq("id", input.block_id);
  if (error) return { ok: false, error: error.message };

  const nowIso = new Date().toISOString();
  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data: true };
}

/* ---------------------------
   GROUPS RPC
   - Contenido: DUEÑO o EDITOR
----------------------------*/

export async function addGroupRpc(input: {
  project_id: string;
  block_id: string;
  title: string;
}): Promise<ActionResult<FlashcardGroupRow>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.block_id)) return { ok: false, error: "Block inválido" };

  const titleRaw = (input.title ?? "").trim();

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id,type")
    .eq("id", input.block_id)
    .single<{ project_id: ProjectId; type: BlockType }>();

  if (bErr || !blk || String(blk.project_id) !== String(pid.data) || blk.type !== "flashcards") {
    return { ok: false, error: "Bloque inválido" };
  }

  const { data: last } = await supabase
    .from("flashcard_groups")
    .select("order_index")
    .eq("block_id", input.block_id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  let title = titleRaw;
  if (!title) {
    const { count } = await supabase
      .from("flashcard_groups")
      .select("*", { count: "exact", head: true })
      .eq("block_id", input.block_id);

    title = (count ?? 0) === 0 ? "General" : `Grupo ${nextIndex + 1}`;
  }

  const { data, error } = await supabase
    .from("flashcard_groups")
    .insert({
      block_id: input.block_id,
      title,
      order_index: nextIndex,
    })
    .select("id,block_id,title,order_index,created_at")
    .single<FlashcardGroupRow>();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear el grupo" };

  const nowIso = new Date().toISOString();
  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data };
}

export async function renameGroupRpc(input: {
  project_id: string;
  group_id: string;
  title: string;
}): Promise<ActionResult<{ id: string; title: string }>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.group_id)) return { ok: false, error: "Grupo inválido" };

  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Nombre inválido" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const { data: g, error: gErr } = await supabase
    .from("flashcard_groups")
    .select("id,block_id")
    .eq("id", input.group_id)
    .single<{ id: string; block_id: string }>();

  if (gErr || !g) return { ok: false, error: "Grupo no encontrado" };

  const { data: blk, error: bErr } = await supabase
    .from("project_blocks")
    .select("project_id")
    .eq("id", g.block_id)
    .single<{ project_id: ProjectId }>();

  if (bErr || !blk || String(blk.project_id) !== String(pid.data)) {
    return { ok: false, error: "Grupo inválido" };
  }

  const { error } = await supabase.from("flashcard_groups").update({ title }).eq("id", input.group_id);
  if (error) return { ok: false, error: error.message };

  const nowIso = new Date().toISOString();
  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data: { id: input.group_id, title } };
}

export async function deleteGroupRpc(input: {
  project_id: string;
  group_id: string;
}): Promise<ActionResult<true>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.group_id)) return { ok: false, error: "Grupo inválido" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  await supabase.from("flashcards").delete().eq("project_id", pid.data).eq("group_id", input.group_id);

  const { error } = await supabase.from("flashcard_groups").delete().eq("id", input.group_id);
  if (error) return { ok: false, error: error.message };

  const nowIso = new Date().toISOString();
  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data: true };
}

/* ---------------------------
   CARDS RPC
   - Contenido: DUEÑO o EDITOR
----------------------------*/

export async function addCardRpc(input: {
  project_id: string;
  group_id: string;
  front: string;
  back: string;
}): Promise<ActionResult<FlashcardRow>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.group_id)) return { ok: false, error: "Grupo inválido" };

  const front = (input.front ?? "").trim();
  const back = (input.back ?? "").trim();
  if (!front || !back) return { ok: false, error: "Front y Back son obligatorios" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const { data: last } = await supabase
    .from("flashcards")
    .select("order_index")
    .eq("project_id", pid.data)
    .eq("group_id", input.group_id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle<{ order_index: number }>();

  const nextIndex = (last?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("flashcards")
    .insert({
      project_id: pid.data,
      group_id: input.group_id,
      front,
      back,
      order_index: nextIndex,
    })
    .select("id,project_id,group_id,front,back,order_index,created_at,updated_at")
    .single<FlashcardRow>();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear la carta" };

  const nowIso = new Date().toISOString();
  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data };
}

export async function updateCardRpc(input: {
  project_id: string;
  card_id: string;
  front: string;
  back: string;
}): Promise<ActionResult<{ id: string; front: string; back: string; updated_at: string }>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.card_id)) return { ok: false, error: "Carta inválida" };

  const front = (input.front ?? "").trim();
  const back = (input.back ?? "").trim();
  if (!front || !back) return { ok: false, error: "Front y Back son obligatorios" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("flashcards")
    .update({ front, back, updated_at: nowIso })
    .eq("id", input.card_id)
    .eq("project_id", pid.data)
    .select("id,front,back,updated_at")
    .single<{ id: string; front: string; back: string; updated_at: string }>();

  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo guardar" };

  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data };
}

export async function deleteCardRpc(input: {
  project_id: string;
  card_id: string;
}): Promise<ActionResult<true>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;
  if (!isUuid(input.card_id)) return { ok: false, error: "Carta inválida" };

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const { error } = await supabase
    .from("flashcards")
    .delete()
    .eq("id", input.card_id)
    .eq("project_id", pid.data);

  if (error) return { ok: false, error: error.message };

  const nowIso = new Date().toISOString();
  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data: true };
}

/* ---------------------------
   BATCH SAVE (NO AUTOSAVE): TEXT BLOCKS RPC
   - Contenido: DUEÑO o EDITOR
----------------------------*/

export async function saveTextBlocksRpc(input: {
  project_id: string;
  updates: Array<{ block_id: string; md: string }>;
}): Promise<ActionResult<true>> {
  const pid = mustProjectIdNoRedirect(input.project_id);
  if (!pid.ok) return pid;

  const updates = Array.isArray(input.updates) ? input.updates : [];
  if (updates.length === 0) return { ok: true, data: true };

  for (const u of updates) {
    if (!isUuid(u.block_id)) return { ok: false, error: "Bloque inválido" };
    if (typeof u.md !== "string") return { ok: false, error: "Contenido inválido" };
  }

  const auth = await getAuthedSupabase();
  if (!auth.ok) return auth;
  const { supabase, userId } = auth.data;

  const can = await assertCanEditContentWith(supabase, pid.data, userId);
  if (!can.ok) return can;

  const blockIds = updates.map((u) => u.block_id);

  const { data: rows, error: chkErr } = await supabase
    .from("project_blocks")
    .select("id,project_id,type")
    .in("id", blockIds)
    .returns<{ id: string; project_id: ProjectId; type: BlockType }[]>();

  if (chkErr) return { ok: false, error: chkErr.message };

  const valid = new Map<string, { project_id: ProjectId; type: BlockType }>();
  for (const r of rows ?? []) valid.set(r.id, { project_id: r.project_id, type: r.type });

  for (const id of blockIds) {
    const v = valid.get(id);
    if (!v) return { ok: false, error: "Bloque inválido" };
    if (String(v.project_id) !== String(pid.data)) return { ok: false, error: "Bloque inválido" };
    if (v.type !== "text") return { ok: false, error: "Solo se pueden guardar bloques de texto" };
  }

  const nowIso = new Date().toISOString();

  for (const u of updates) {
    const { error } = await supabase
      .from("project_blocks")
      .update({ data: { md: u.md }, updated_at: nowIso })
      .eq("id", u.block_id)
      .eq("project_id", pid.data);

    if (error) return { ok: false, error: error.message };
  }

  await supabase.from("projects").update({ updated_at: nowIso }).eq("id", pid.data);

  rev(String(pid.data));
  return { ok: true, data: true };
}
