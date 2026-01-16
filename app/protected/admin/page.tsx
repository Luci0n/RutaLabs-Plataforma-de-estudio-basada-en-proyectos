// app/protected/admin/page.tsx
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AdminReportsClient from "./reports-client";

import type { PostgrestError } from "@supabase/supabase-js";

type ReportStatus = "open" | "resolved" | "dismissed";

type ReportRow = {
  id: string;
  project_id: string;
  reporter_user_id: string;
  description: string;
  status: ReportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectMin = {
  id: string;
  title: string;
  owner_user_id: string;
  is_hidden: boolean;
  visibility: string | null;
  moderation_note: string | null;
  moderated_at: string | null;
};

type ProfileMin = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
};

type GlobalRoleRow = { global_role: string | null };

type ReportJoined = ReportRow & {
  project?: (ProjectMin & { owner?: ProfileMin | null }) | null;
  reporter?: ProfileMin | null;
};

export type AdminRow = {
  report: ReportRow;
  project: ProjectMin | null;
  reporter: ProfileMin | null;
  owner: ProfileMin | null;
};

export default async function AdminPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Administración</h1>
          <p className="text-sm text-muted-foreground">
            Revisión de reportes y moderación de proyectos públicos.
          </p>
        </div>
      </div>

      <Suspense fallback={<AdminSkeleton />}>
        <AdminReportsLoader />
      </Suspense>
    </div>
  );
}

async function AdminReportsLoader() {
  const supabase = await createClient();

  const userPromise = supabase.auth.getUser();

  const rolePromise: Promise<{ data: GlobalRoleRow | null; error: PostgrestError | null }> =
    (async () => {
      const { data: userData } = await userPromise;
      const uid = userData.user?.id ?? null;

      if (!uid) return { data: null, error: null };

      const res = await supabase
        .from("profiles")
        .select("global_role")
        .eq("id", uid)
        .maybeSingle<GlobalRoleRow>();

      return { data: res.data ?? null, error: res.error ?? null };
    })();

  const [{ data: userData, error: userErr }, { data: prof, error: profErr }] =
    await Promise.all([userPromise, rolePromise]);

  if (userErr || !userData.user) redirect("/auth/login");

  if (profErr) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{profErr.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!prof || prof.global_role !== "admin") redirect("/protected/home");

  // One query: reports + project + reporter + project owner
  // IMPORTANT: adjust FK names if your schema differs.
  const { data: joined, error: rErr } = await supabase
    .from("reports")
    .select(
      [
        "id",
        "project_id",
        "reporter_user_id",
        "description",
        "status",
        "admin_note",
        "created_at",
        "updated_at",
        "project:projects!reports_project_id_fkey(id,title,owner_user_id,is_hidden,visibility,moderation_note,moderated_at,owner:profiles!projects_owner_user_id_fkey(id,username,avatar_url,email))",
        "reporter:profiles!reports_reporter_user_id_fkey(id,username,avatar_url,email)",
      ].join(",")
    )
    .order("created_at", { ascending: false })
    .returns<ReportJoined[]>();

  if (rErr) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{rErr.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const rows: AdminRow[] = (joined ?? []).map((r) => {
    const project = r.project ?? null;
    const reporter = r.reporter ?? null;
    const owner = project?.owner ?? null;

    const report: ReportRow = {
      id: r.id,
      project_id: r.project_id,
      reporter_user_id: r.reporter_user_id,
      description: r.description,
      status: r.status,
      admin_note: r.admin_note,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };

    return { report, project, reporter, owner };
  });

  return <AdminReportsClient rows={rows} />;
}

function AdminSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cargando reportes…</CardTitle>
        <CardDescription>Obteniendo datos para moderación.</CardDescription>
      </CardHeader>
    </Card>
  );
}
