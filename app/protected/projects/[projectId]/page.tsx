// app/protected/projects/[projectId]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeCL } from "@/lib/datetime";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { parseProjectIdValue } from "@/lib/project-id";
import type {
  ProjectRole,
  ProjectVisibility,
  ProjectRow,
  ProjectBlockRow,
  FlashcardGroupRow,
  FlashcardRow,
} from "@/lib/types/study";

import { ProjectSettingsClient } from "./project-settings-client";
import { BlocksClient } from "./blocks-client";
import { MembersClient } from "./members-client";
import { ProjectView } from "./project-view";

type SearchParams = { tab?: string; error?: string };

function tabVariant(current: string, value: string): "default" | "ghost" {
  return current === value ? "default" : "ghost";
}

function roleLabel(role: ProjectRole): string {
  if (role === "owner") return "Dueño";
  if (role === "guest") return "Invitado";
  return "Editor";
}

function visLabel(v: ProjectVisibility): string {
  if (v === "public") return "Público";
  if (v === "unlisted") return "No listado";
  return "Privado";
}

function formatEsClDate(value: string): string {
  return formatDateTimeCL(value);
}

function shortId(id: string): string {
  if (!id) return "—";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function initialsFromUsername(username: string | null): string {
  const u = (username ?? "").trim();
  if (!u) return "U";
  const parts = u.split(/[.\s_-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function ErrorCard(props: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>{props.message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function PageSkeleton() {
  return <div className="h-80 rounded-xl border bg-card animate-pulse" />;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 w-44 rounded-md bg-muted animate-pulse" />
      <div className="h-28 rounded-xl border bg-card animate-pulse" />
      <div className="h-28 rounded-xl border bg-card animate-pulse" />
    </div>
  );
}

function AuthorLine(props: {
  username: string | null;
  avatar_url: string | null;
  owner_user_id: string;
}) {
  const usernameShown =
    (props.username ?? "").trim() || shortId(props.owner_user_id);
  const initials = initialsFromUsername(props.username);
  const avatar = (props.avatar_url ?? "").trim();

  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-7 w-7 rounded-full border bg-muted/30 overflow-hidden grid place-items-center">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-medium">{initials}</span>
        )}
      </div>
      <span className="truncate">{usernameShown}</span>
    </div>
  );
}

/**
 * Wrapper con Suspense para evitar "blocking navigation" en rutas dinámicas.
 */
export default function ProjectDetailPage(props: {
  params: { projectId: string } | Promise<{ projectId: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectDetailPageInner {...props} />
    </Suspense>
  );
}

async function ProjectDetailPageInner({
  params,
  searchParams,
}: {
  params: { projectId: string } | Promise<{ projectId: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);
  const resolvedParams = await Promise.resolve(params);

  const rawId = resolvedParams.projectId;
  const projectIdValue = parseProjectIdValue(rawId);

  if (!projectIdValue) {
    return (
      <ErrorCard title="Proyecto no encontrado" message="ID inválido en la URL." />
    );
  }

  const requestedTab = String(sp?.tab ?? "view").toLowerCase();
  const supabase = await createClient();

  // Auth
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", userId)
    .maybeSingle<{ global_role: string | null }>();

  const isAdmin = prof?.global_role === "admin";

  // Proyecto + membership
  const projectPromise = supabase
    .from("projects")
    .select(
      "id,owner_user_id,title,description_md,visibility,is_hidden,moderation_note,moderated_at,updated_at,published_at"
    )
    .eq("id", projectIdValue)
    .single<ProjectRow & { moderation_note: string | null; moderated_at: string | null }>();

  const memPromise = supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectIdValue)
    .eq("user_id", userId)
    .maybeSingle<{ role: ProjectRole }>();

  const [{ data: project, error: pErr }, { data: mem }] = await Promise.all([
    projectPromise,
    memPromise,
  ]);

  if (pErr || !project) {
    return (
      <ErrorCard
        title="Proyecto no encontrado"
        message={pErr?.message ?? "No existe o no tienes acceso."}
      />
    );
  }

  const isOwner = project.owner_user_id === userId;
  const showModerationBanner =
  (isOwner || isAdmin) && (!!project.is_hidden || !!project.moderation_note?.trim());

  // Si está oculto, solo dueño o admin pueden entrar
  if (project.is_hidden && !(isOwner || isAdmin)) {
    return (
      <ErrorCard
        title="Proyecto no disponible"
        message="Este proyecto fue oculto por moderación."
      />
    );
  }

  // Autor (perfil del dueño)
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("id,username,avatar_url")
    .eq("id", project.owner_user_id)
    .maybeSingle<{ id: string; username: string | null; avatar_url: string | null }>();

  const role: ProjectRole =
    project.owner_user_id === userId ? "owner" : mem?.role ?? "guest";

  const canEdit = role === "owner" || role === "editor";

  // Accesos por tab
  const canOpenEdit = canEdit; // dueño/editor
  const canOpenSettings = canEdit; // dueño/editor (si quieres SOLO dueño: role === "owner")
  const canOpenMembers = canEdit; // dueño/editor (si quieres SOLO dueño: role === "owner")

  // Si intentan entrar por URL a tabs no permitidos, forzamos a view
  let tab: "view" | "edit" | "members" | "settings" = "view";
  if (requestedTab === "edit" && canOpenEdit) tab = "edit";
  else if (requestedTab === "settings" && canOpenSettings) tab = "settings";
  else if (requestedTab === "members" && canOpenMembers) tab = "members";
  else tab = "view";

  const visibility = project.visibility as ProjectVisibility;
  const projectHrefId = encodeURIComponent(String(project.id));

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold truncate">{project.title}</h1>

          {/* Autor debajo del título */}
          <AuthorLine
            username={ownerProfile?.username ?? null}
            avatar_url={ownerProfile?.avatar_url ?? null}
            owner_user_id={project.owner_user_id}
          />

          <p className="mt-2 text-sm text-muted-foreground">
            {roleLabel(role)} · {visLabel(visibility)}
            {visibility === "private" ? (
              <span className="ml-2 text-xs text-muted-foreground">
                No publicado
              </span>
            ) : (
              <span className="ml-2 text-xs text-muted-foreground">
                {project.published_at
                  ? `Publicado: ${formatEsClDate(project.published_at)}`
                  : "Publicado"}
              </span>
            )}
          </p>

          <p className="text-xs text-muted-foreground">
            Última actualización: {formatEsClDate(project.updated_at)}
          </p>
        </div>

        <Button asChild variant="ghost">
          <Link href="/protected/projects">Volver</Link>
        </Button>
      </div>

      {/* Tabs (mostrar solo lo accesible) */}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={tabVariant(tab, "view")}>
          <Link href={`/protected/projects/${projectHrefId}?tab=view`}>Ver</Link>
        </Button>

        {canOpenEdit ? (
          <Button asChild variant={tabVariant(tab, "edit")}>
            <Link href={`/protected/projects/${projectHrefId}?tab=edit`}>
              Editar
            </Link>
          </Button>
        ) : null}

        {canOpenMembers ? (
          <Button asChild variant={tabVariant(tab, "members")}>
            <Link href={`/protected/projects/${projectHrefId}?tab=members`}>
              Miembros
            </Link>
          </Button>
        ) : null}

        {canOpenSettings ? (
          <Button asChild variant={tabVariant(tab, "settings")}>
            <Link href={`/protected/projects/${projectHrefId}?tab=settings`}>
              Ajustes
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Content */}
      {tab === "view" ? (
        <Suspense fallback={<SectionSkeleton />}>
          <ContentTab
            mode="view"
            projectId={String(project.id)}
            title={project.title}
            description_md={project.description_md}
            visibility={visibility}
            published_at={project.published_at ?? null}
            updated_at={project.updated_at}
            showModerationBanner={showModerationBanner}
            is_hidden={project.is_hidden}
            moderation_note={project.moderation_note}
            canEdit={canEdit}
            currentUserRole={role} // <-- CLAVE para "Retirarme" en ProjectView
          />
        </Suspense>
      ) : null}

      {tab === "edit" ? (
        <Suspense fallback={<SectionSkeleton />}>
          <ContentTab
            mode="edit"
            projectId={String(project.id)}
            title={project.title}
            description_md={project.description_md}
            visibility={visibility}
            published_at={project.published_at ?? null}
            updated_at={project.updated_at}
            showModerationBanner={!!isAdmin}
            is_hidden={project.is_hidden}
            moderation_note={project.moderation_note} 
            canEdit={canEdit}
            currentUserRole={role}
          />
        </Suspense>
      ) : null}

      {tab === "members" ? (
        <Suspense fallback={<SectionSkeleton />}>
          <MembersTab
            projectId={String(project.id)}
            canEdit={canEdit}
            currentUserId={userId}
            ownerUserId={project.owner_user_id}
          />
        </Suspense>
      ) : null}

      {tab === "settings" ? (
        <ProjectSettingsClient
          projectId={String(project.id)}
          role={role}
          visibility={visibility}
          title={project.title}
          description_md={project.description_md}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );
}


/**
 * VIEW / EDIT
 */
async function ContentTab(props: {
  mode: "view" | "edit";
  projectId: string;
  title: string;
  description_md: string | null;
  visibility: ProjectVisibility;
  published_at: string | null;
  updated_at: string;
  is_hidden: boolean;
  moderation_note: string | null;
  showModerationBanner: boolean;
  canEdit: boolean;
  currentUserRole: ProjectRole;
}) {

  const supabase = await createClient();

  const { data: blocks, error: bErr } = await supabase
    .from("project_blocks")
    .select("id,project_id,type,order_index,data,created_at,updated_at")
    .eq("project_id", props.projectId)
    .order("order_index", { ascending: true })
    .returns<ProjectBlockRow[]>();

  if (bErr) return <ErrorCard title="Error" message={bErr.message} />;

  const blockIds = (blocks ?? []).map((b) => b.id);

  let groups: FlashcardGroupRow[] = [];
  let cards: FlashcardRow[] = [];

  if (blockIds.length) {
    const groupsPromise = supabase
      .from("flashcard_groups")
      .select("id,block_id,title,order_index,created_at")
      .in("block_id", blockIds)
      .order("order_index", { ascending: true })
      .returns<FlashcardGroupRow[]>();

    const cardsPromise = supabase
      .from("flashcards")
      .select("id,project_id,group_id,front,back,order_index,created_at,updated_at")
      .eq("project_id", props.projectId)
      .order("group_id", { ascending: true })
      .order("order_index", { ascending: true })
      .returns<FlashcardRow[]>();

    const [{ data: g, error: gErr }, { data: cAll, error: cErr }] =
      await Promise.all([groupsPromise, cardsPromise]);

    if (gErr) return <ErrorCard title="Error" message={gErr.message} />;
    if (cErr) return <ErrorCard title="Error" message={cErr.message} />;

    groups = g ?? [];
    const groupIdSet = new Set(groups.map((x) => x.id));
    cards = (cAll ?? []).filter(
      (c) => !!c.group_id && groupIdSet.has(c.group_id)
    );
  }

  if (props.mode === "view") {
    return (
    <ProjectView
      projectId={props.projectId}
      title={props.title}
      description_md={props.description_md}
      visibility={props.visibility}
      published_at={props.published_at}
      updated_at={props.updated_at}
      is_hidden={props.is_hidden}
      moderation_note={props.moderation_note}
      showModerationBanner={props.showModerationBanner}
      blocks={blocks ?? []}
      groups={groups}
      cards={cards}
      currentUserRole={props.currentUserRole}
    />
    );
  }

  return (
    <BlocksClient
      projectId={props.projectId}
      blocks={blocks ?? []}
      groups={groups}
      cards={cards}
      canEdit={props.canEdit}
    />
  );
}

/**
 * MEMBERS
 * - Enriquecemos members con username/avatar (y email opcional) antes de pasar al client.
 */
async function MembersTab(props: {
  projectId: string;
  canEdit: boolean;
  currentUserId: string;
  ownerUserId: string;
}) {
  const supabase = await createClient();

  // 1) members base
  const { data: baseMembers, error: mErr } = await supabase
    .from("project_members")
    .select("user_id,role,created_at")
    .eq("project_id", props.projectId)
    .order("created_at", { ascending: true })
    .returns<{ user_id: string; role: ProjectRole; created_at: string }[]>();

  if (mErr) return <ErrorCard title="Error" message={mErr.message} />;

  const normalizedBase = baseMembers ?? [];

  // 2) asegurar dueño en lista (si tu tabla no lo incluye)
  const hasOwner = normalizedBase.some((m) => m.user_id === props.ownerUserId);
  const membersWithOwner = hasOwner
    ? normalizedBase
    : [
        {
          user_id: props.ownerUserId,
          role: "owner" as ProjectRole,
          created_at: new Date().toISOString(),
        },
        ...normalizedBase,
      ];

  // 3) perfiles
  const userIds = Array.from(new Set(membersWithOwner.map((m) => m.user_id)));

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id,username,avatar_url,email")
    .in("id", userIds)
    .returns<
      { id: string; username: string | null; avatar_url: string | null; email: string | null }[]
    >();

  if (pErr) return <ErrorCard title="Error" message={pErr.message} />;

  const byId = new Map<
    string,
    { username: string | null; avatar_url: string | null; email: string | null }
  >();

  for (const p of profiles ?? []) {
    byId.set(p.id, {
      username: p.username ?? null,
      avatar_url: p.avatar_url ?? null,
      email: p.email ?? null,
    });
  }

  // 4) merge final para el client
  const members = membersWithOwner.map((m) => {
    const p = byId.get(m.user_id) ?? {
      username: null,
      avatar_url: null,
      email: null,
    };

    return {
      user_id: m.user_id,
      role: m.user_id === props.ownerUserId ? ("owner" as ProjectRole) : m.role,
      created_at: m.created_at,

      // extras para la nueva UI
      email: p.email,
      username: p.username,
      avatar_url: p.avatar_url,
    };
  });

  return (
    <MembersClient
      projectId={props.projectId}
      canEdit={props.canEdit}
      currentUserId={props.currentUserId}
      ownerUserId={props.ownerUserId}
      members={members}
    />
  );
}
