// app/protected/projects/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
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

type MemberRow = {
  project_id: ProjectId;
  role: ProjectRole;
};

type LibraryItem = {
  id: string; // UI normalized
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

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  const userId = userRes.user.id;

  const { data: owned, error: ownedErr } = await supabase
    .from("projects")
    .select("id,owner_user_id,title,description_md,updated_at,visibility")
    .eq("owner_user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<ProjectLite[]>();

  const { data: members, error: memErr } = await supabase
    .from("project_members")
    .select("project_id,role")
    .eq("user_id", userId)
    .returns<MemberRow[]>();

  // Normalizamos a string para comparar/set
  const ownedIdSet = new Set((owned ?? []).map((p) => idToString(p.id)));

  const memberIds: ProjectId[] = Array.from(
    new Set((members ?? []).map((m) => m.project_id).filter((id) => !ownedIdSet.has(idToString(id))))
  );

  let imported: ProjectLite[] = [];
  if (memberIds.length) {
    const { data: imp, error: impErr } = await supabase
      .from("projects")
      .select("id,owner_user_id,title,description_md,updated_at,visibility")
      .in("id", memberIds)
      .returns<ProjectLite[]>();

    if (!impErr) imported = imp ?? [];
  }

  const roleByProject = new Map<string, ProjectRole>();
  for (const m of members ?? []) {
    roleByProject.set(idToString(m.project_id), m.role);
  }

  const items: LibraryItem[] = [
    ...(owned ?? []).map((p): LibraryItem => ({
      id: idToString(p.id),
      title: p.title,
      description_md: p.description_md,
      updated_at: p.updated_at,
      visibility: p.visibility,
      role: "owner",
    })),
    ...imported.map((p): LibraryItem => {
      const key = idToString(p.id);
      const r = roleByProject.get(key);
      return {
        id: key,
        title: p.title,
        description_md: p.description_md,
        updated_at: p.updated_at,
        visibility: p.visibility,
        role: isProjectRole(r) ? r : "guest",
      };
    }),
  ].sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const errorMsg = ownedErr?.message ?? memErr?.message ?? null;

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

      {errorMsg ? (
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{errorMsg}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((p) => {
          const roleLabel =
            p.role === "owner" ? "Dueño" : p.role === "guest" ? "Invitado" : "Editor";
          const visLabel =
            p.visibility === "public" ? "Público" : p.visibility === "unlisted" ? "No listado" : "Privado";

          return (
            <Link key={p.id} href={`/protected/projects/${p.id}`}>
              <Card className="hover:border-foreground/30">
                <CardHeader>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {p.description_md ?? ""}
                  </CardDescription>
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
    </div>
  );
}
