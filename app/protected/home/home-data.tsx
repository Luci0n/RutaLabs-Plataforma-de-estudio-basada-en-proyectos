// app/protected/home/home-data.tsx
import { createClient } from "@/lib/supabase/server";

export type HomeDashboardData = {
  stats: {
    dueToday: number;
    activeProjects: number;
  };
  agendaToday: Array<{
    project_id: string;
    project_title: string;
    due_total: number;
    next_due_at: string | null;
  }>;
  recentProjects: Array<{
    project_id: string;
    title: string;
    updated_at: string;
    role: "owner" | "editor" | "guest";
  }>;
  recentActivity: Array<{
    created_at: string;
    label: string;
    rating?: string | null;
  }>;
};

type ProjectRowLite = {
  id: string | number;
  title: string | null;
  updated_at: string;
  owner_user_id: string;
  is_hidden: boolean;
};

type ProjectMemberJoinRow = {
  role: "editor" | "guest" | "owner" | string;
  project: ProjectRowLite | null;
};

type AgendaProjectSummaryRow = {
  user_id: string;
  project_id: string | number;
  project_title: string | null;
  due_total: number | string | null;
  next_due_at: string | null;
};

type FlashcardReviewRowLite = {
  user_id: string;
  created_at: string;
  rating: string | null;
  group_title: string | null;
  project_title: string | null;
};

function safeNum(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toRole(value: unknown): "owner" | "editor" | "guest" {
  const v = String(value ?? "").toLowerCase();
  if (v === "owner") return "owner";
  if (v === "editor") return "editor";
  return "guest";
}

export async function loadHomeDashboardData(args: {
  userId: string;
}): Promise<HomeDashboardData> {
  const supabase = await createClient();
  const userId = args.userId;

  /**
   * 1) Proyectos recientes (owner + memberships)
   */
  const ownedPromise = supabase
    .from("projects")
    .select("id,title,updated_at,owner_user_id,is_hidden")
    .eq("owner_user_id", userId)
    .eq("is_hidden", false)
    .order("updated_at", { ascending: false })
    .limit(6)
    .returns<ProjectRowLite[]>();

  const memberPromise = supabase
    .from("project_members")
    // Requiere FK project_members.project_id -> projects.id
    .select("role, project:projects(id,title,updated_at,owner_user_id,is_hidden)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12)
    .returns<ProjectMemberJoinRow[]>();

  const [ownedRes, memberRes] = await Promise.all([ownedPromise, memberPromise]);

  const owned = (ownedRes.data ?? [])
    .filter((p) => !p.is_hidden)
    .map((p) => ({
      project_id: String(p.id),
      title: String(p.title ?? "Sin título"),
      updated_at: String(p.updated_at ?? new Date().toISOString()),
      role: "owner" as const,
    }));

  const memberRows = memberRes.data ?? [];

  const member = memberRows
    .map((row) => row.project)
    .filter((p): p is ProjectRowLite => Boolean(p))
    .filter((p) => !p.is_hidden && String(p.owner_user_id ?? "") !== userId)
    .map((p) => {
      const match = memberRows.find((r) => String(r.project?.id) === String(p.id));
      const role = toRole(match?.role);

      return {
        project_id: String(p.id),
        title: String(p.title ?? "Sin título"),
        updated_at: String(p.updated_at ?? new Date().toISOString()),
        role: role === "owner" ? ("guest" as const) : role, // seguridad: membership no debería ser owner
      };
    });

  // Merge + dedupe
  const seen = new Set<string>();
  const recentProjects = [...owned, ...member]
    .filter((p) => {
      if (seen.has(p.project_id)) return false;
      seen.add(p.project_id);
      return true;
    })
    .slice(0, 6);

  /**
   * 2) Agenda de hoy (top items)
   */
  let agendaToday: HomeDashboardData["agendaToday"] = [];
  try {
    const aRes = await supabase
      .from("agenda_project_summary")
      .select("user_id,project_id,project_title,due_total,next_due_at")
      .eq("user_id", userId)
      .order("due_total", { ascending: false })
      .limit(6)
      .returns<AgendaProjectSummaryRow[]>();

    agendaToday = (aRes.data ?? []).map((r) => ({
      project_id: String(r.project_id),
      project_title: String(r.project_title ?? "Proyecto"),
      due_total: safeNum(r.due_total),
      next_due_at: r.next_due_at ? String(r.next_due_at) : null,
    }));
  } catch {
    agendaToday = [];
  }

  const dueToday = agendaToday.reduce((acc, x) => acc + safeNum(x.due_total), 0);

  /**
   * 3) Actividad reciente (flashcard_reviews)
   */
  let recentActivity: HomeDashboardData["recentActivity"] = [];
  try {
    const rRes = await supabase
      .from("flashcard_reviews")
      .select("user_id,created_at,rating,group_title,project_title")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<FlashcardReviewRowLite[]>();

    recentActivity = (rRes.data ?? []).map((r) => {
      const hasNames =
        Boolean(String(r.project_title ?? "").trim()) ||
        Boolean(String(r.group_title ?? "").trim());

      const label = hasNames
        ? `${String(r.project_title ?? "Proyecto")} · ${String(r.group_title ?? "Grupo")}`
        : "Repaso";

      return {
        created_at: String(r.created_at),
        label,
        rating: r.rating ? String(r.rating) : null,
      };
    });
  } catch {
    recentActivity = [];
  }

  const activeProjects = recentProjects.length;

  return {
    stats: {
      dueToday,
      activeProjects,
    },
    agendaToday,
    recentProjects,
    recentActivity,
  };
}
