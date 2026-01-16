// app/protected/agenda/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { AgendaClientShell } from "./agenda-client-shell";

import { NotebookPen } from "lucide-react";

type SearchParams = { project?: string; error?: string };

type ProjectRowLite = {
  id: string;
  title: string;
  owner_user_id: string;
  is_hidden: boolean;
  updated_at: string;
};

type ProjectMemberRow = {
  project_id: string;
  role: "owner" | "editor" | "guest";
};

type AgendaGroupRow = {
  group_id: string;
  group_title: string;
  total_cards: number;
  new_count: number;
  due_learning: number;
  due_review: number;
  next_due_at: string | null;
};

type AgendaDayRow = {
  day: string; // YYYY-MM-DD
  due_learning: number;
  due_review: number;
};

function PageSkeleton() {
  return <div className="h-80 rounded-xl border bg-card animate-pulse" />;
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

export default function AgendaPage(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AgendaPageInner {...props} />
    </Suspense>
  );
}

async function AgendaPageInner(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const sp = await Promise.resolve(props.searchParams);

  const supabase = await createClient();

  // Auth
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");
  const userId = userRes.user.id;

  // 1) Proyectos accesibles (dueño + miembro)
  const ownedPromise = supabase
    .from("projects")
    .select("id,title,owner_user_id,is_hidden,updated_at")
    .eq("owner_user_id", userId)
    .eq("is_hidden", false)
    .order("updated_at", { ascending: false })
    .returns<ProjectRowLite[]>();

  const memberPromise = supabase
    .from("project_members")
    .select("project_id,role")
    .eq("user_id", userId)
    .returns<ProjectMemberRow[]>();

  const [{ data: owned, error: ownedErr }, { data: mem, error: memErr }] = await Promise.all([
    ownedPromise,
    memberPromise,
  ]);

  if (ownedErr) return <ErrorCard title="Error" message={ownedErr.message} />;
  if (memErr) return <ErrorCard title="Error" message={memErr.message} />;

  const memberProjectIds = Array.from(new Set((mem ?? []).map((m) => m.project_id)));

  let memberProjects: ProjectRowLite[] = [];
  if (memberProjectIds.length) {
    const { data: mp, error: mpErr } = await supabase
      .from("projects")
      .select("id,title,owner_user_id,is_hidden,updated_at")
      .in("id", memberProjectIds)
      .eq("is_hidden", false)
      .order("updated_at", { ascending: false })
      .returns<ProjectRowLite[]>();

    if (mpErr) return <ErrorCard title="Error" message={mpErr.message} />;
    memberProjects = mp ?? [];
  }

  const byId = new Map<string, ProjectRowLite>();
  for (const p of owned ?? []) byId.set(p.id, p);
  for (const p of memberProjects ?? []) byId.set(p.id, p);

  const projects = Array.from(byId.values()).sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        {sp?.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {sp.error}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">Agenda</h1>
          <Button asChild variant="ghost">
            <Link href="/protected/projects">Volver a proyectos</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sin proyectos</CardTitle>
            <CardDescription>
              Crea un proyecto con flashcards o únete a uno para ver tu agenda de estudio.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // 2) Proyecto seleccionado
  const selectedProjectId = String(sp?.project ?? projects[0].id);
  const selected = projects.find((p) => p.id === selectedProjectId) ?? projects[0];

  // 3) Datos de agenda (por grupo + por día)
  const groupsPromise = supabase.rpc("agenda_group_counts", {
    p_user_id: userId,
    p_project_id: selected.id,
  });

  const weekPromise = supabase.rpc("agenda_due_by_day", {
    p_user_id: userId,
    p_project_id: selected.id,
    p_days: 7,
  });

  const [{ data: gData, error: gErr }, { data: wData, error: wErr }] = await Promise.all([
    groupsPromise,
    weekPromise,
  ]);

  if (gErr) return <ErrorCard title="Error" message={gErr.message} />;
  if (wErr) return <ErrorCard title="Error" message={wErr.message} />;

  const groups = (gData ?? []) as AgendaGroupRow[];
  const week = (wData ?? []) as AgendaDayRow[];

  return (
    <div className="space-y-4">
      {sp?.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {sp.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
            <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/30">
                <NotebookPen className="h-5 w-5 text-muted-foreground" />
                </span>
                <h1 className="text-2xl font-semibold">Agenda</h1>
            </div>
          <p className="text-xs text-muted-foreground">
            Revisa lo vencido y practica sin perder tu progreso.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/protected/projects">Proyectos</Link>
          </Button>
        </div>
      </div>

      <AgendaClientShell
        projects={projects.map((p) => ({ id: p.id, title: p.title }))}
        selectedProjectId={selected.id}
        groups={groups}
        week={week}
      />
    </div>
  );
}
