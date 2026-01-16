// app/protected/admin/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AdminReportsClient from "./reports-client";

type ReportRow = {
  id: string;
  project_id: string;
  reporter_user_id: string;
  description: string;
  status: "open" | "resolved" | "dismissed";
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

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/auth/login");

  // Verificar admin
  const { data: prof } = await supabase
    .from("profiles")
    .select("global_role")
    .eq("id", userRes.user.id)
    .maybeSingle<{ global_role: string | null }>();

  if (!prof || prof.global_role !== "admin") redirect("/protected/home");

  // Reportes (últimos primero)
  const { data: reports, error: rErr } = await supabase
    .from("reports")
    .select("id,project_id,reporter_user_id,description,status,admin_note,created_at,updated_at")
    .order("created_at", { ascending: false })
    .returns<ReportRow[]>();

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

  const rep = reports ?? [];
  const projectIds = Array.from(new Set(rep.map((x) => x.project_id)));
  const reporterIds = Array.from(new Set(rep.map((x) => x.reporter_user_id)));

  // Proyectos
  const { data: projects } = projectIds.length
    ? await supabase
        .from("projects")
        .select("id,title,owner_user_id,is_hidden,visibility,moderation_note,moderated_at")
        .in("id", projectIds)
        .returns<ProjectMin[]>()
    : { data: [] as ProjectMin[] };

  const ownerIds = Array.from(new Set((projects ?? []).map((p) => p.owner_user_id)));

  // Perfiles (reporter + owner)
  const allProfileIds = Array.from(new Set([...reporterIds, ...ownerIds]));
  const { data: profiles } = allProfileIds.length
    ? await supabase
        .from("profiles")
        .select("id,username,avatar_url,email")
        .in("id", allProfileIds)
        .returns<ProfileMin[]>()
    : { data: [] as ProfileMin[] };

  const projMap = new Map((projects ?? []).map((p) => [p.id, p]));
  const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows = rep.map((r) => {
    const p = projMap.get(r.project_id) ?? null;
    const reporter = profMap.get(r.reporter_user_id) ?? null;
    const owner = p ? profMap.get(p.owner_user_id) ?? null : null;
    return { report: r, project: p, reporter, owner };
  });

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

      <AdminReportsClient rows={rows} />
    </div>
  );
}
