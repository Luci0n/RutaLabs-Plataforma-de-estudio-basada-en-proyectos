import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { ProjectId, ProjectRole, ProjectVisibility } from "@/lib/types/study";
import { BookTemplate } from "lucide-react";
import { formatDateTimeCL } from "@/lib/datetime";

type ProjectLite = {
  id: ProjectId;
  owner_user_id: string;
  title: string;
  description_md: string | null;
  updated_at: string;
  visibility: ProjectVisibility;
};

type MemberWithProject = {
  project_id: ProjectId;
  role: ProjectRole;
  project?: ProjectLite | null;
};

type LibraryItem = {
  id: string;
  title: string;
  description_md: string | null;
  updated_at: string;
  visibility: ProjectVisibility;
  role: ProjectRole;
};

function idToString(id: ProjectId): string {
  return String(id);
}

function isProjectRole(v: unknown): v is ProjectRole {
  return v === "owner" || v === "editor" || v === "guest";
}

const MAX_OWNED = 120;
const MAX_MEMBERSHIPS = 240;

export default async function ProjectsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/30">
              <BookTemplate className="h-5 w-5 text-muted-foreground" />
            </span>
            <h1 className="text-xl font-semibold">Proyectos</h1>
          </div>
          <p className="text-sm text-muted-foreground">Tu biblioteca (propios e importados).</p>
        </div>

        <Button asChild>
          <Link href="/protected/projects/new">Nuevo</Link>
        </Button>
      </div>

      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsList />
      </Suspense>
    </div>
  );
}

async function ProjectsList() {
  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");

  const userId = userRes.user.id;

  const ownedPromise = supabase
    .from("projects")
    .select("id,owner_user_id,title,description_md,updated_at,visibility")
    .eq("owner_user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_OWNED)
    .returns<ProjectLite[]>();

  const membersPromise = supabase
    .from("project_members")
    .select(
      [
        "project_id",
        "role",
        "project:projects!project_members_project_id_fkey(id,owner_user_id,title,description_md,updated_at,visibility)",
      ].join(",")
    )
    .eq("user_id", userId)
    .limit(MAX_MEMBERSHIPS)
    .returns<MemberWithProject[]>();

  const [
    { data: owned, error: ownedErr },
    { data: members, error: memErr },
  ] = await Promise.all([ownedPromise, membersPromise]);

  const errorMsg = ownedErr?.message ?? memErr?.message ?? null;

  if (errorMsg) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{errorMsg}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const ownedList = owned ?? [];
  const memberList = members ?? [];

  const ownedIdSet = new Set(ownedList.map((p) => idToString(p.id)));

  const importedItems: LibraryItem[] = memberList
    .map((m): { key: string; role: ProjectRole; project: ProjectLite | null } => {
      const key = idToString(m.project_id);
      const role = isProjectRole(m.role) ? m.role : "guest";
      const project = m.project ?? null;
      return { key, role, project };
    })
    .filter((x) => x.project && !ownedIdSet.has(x.key))
    .map((x): LibraryItem => ({
      id: x.key,
      title: x.project!.title,
      description_md: x.project!.description_md,
      updated_at: x.project!.updated_at,
      visibility: x.project!.visibility,
      role: x.role,
    }));

  const items: LibraryItem[] = [
    ...ownedList.map((p): LibraryItem => ({
      id: idToString(p.id),
      title: p.title,
      description_md: p.description_md,
      updated_at: p.updated_at,
      visibility: p.visibility,
      role: "owner",
    })),
    ...importedItems,
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((p) => {
        const roleLabel = p.role === "owner" ? "Dueño" : p.role === "guest" ? "Invitado" : "Editor";
        const visLabel =
          p.visibility === "public"
            ? "Público"
            : p.visibility === "unlisted"
              ? "No listado"
              : "Privado";

        return (
          <Link key={p.id} href={`/protected/projects/${p.id}`} prefetch={false} className="block">
            <Card className="hover:border-foreground/30">
              <CardHeader>
                <CardTitle className="text-base">{p.title}</CardTitle>
                <CardDescription className="line-clamp-2">{p.description_md ?? ""}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {roleLabel} · {visLabel}
                </span>
                <span>{formatDateTimeCL(p.updated_at)}</span>
              </CardContent>
            </Card>
          </Link>
        );
      })}

      {!items.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sin proyectos aún</CardTitle>
            <CardDescription>
              Crea uno con “Nuevo” o importa desde la pestaña Comunidad del nav.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}

function ProjectsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="h-[140px]">
          <CardHeader className="space-y-2">
            <div className="h-4 w-2/3 rounded bg-muted/40" />
            <div className="h-3 w-full rounded bg-muted/20" />
            <div className="h-3 w-5/6 rounded bg-muted/20" />
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="h-3 w-24 rounded bg-muted/20" />
            <div className="h-3 w-20 rounded bg-muted/20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
