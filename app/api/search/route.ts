import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ProjectRole = "owner" | "editor" | "guest";

type ProjectVisibility = "private" | "unlisted" | "public" | string;

type ProjectHit = {
  id: string;
  title: string;
  visibility: ProjectVisibility;
  is_hidden: boolean;
  updated_at: string;
  role?: ProjectRole;
};

type OwnedRow = {
  id: string;
  title: string;
  visibility: ProjectVisibility | null;
  is_hidden: boolean | null;
  updated_at: string;
};

type MembershipRow = {
  project_id: string;
  role: ProjectRole | null;
};

type ProjectRowLite = {
  id: string;
  title: string;
  visibility: ProjectVisibility | null;
  is_hidden: boolean | null;
  updated_at: string;
};

type CommunityProjectRow = {
  id: string;
  title: string;
  visibility: ProjectVisibility | null;
  is_hidden: boolean | null;
  updated_at: string;
};

function normQ(q: string | null): string {
  return String(q ?? "").trim().slice(0, 120);
}

function safeLike(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

function isProjectRole(v: unknown): v is ProjectRole {
  return v === "owner" || v === "editor" || v === "guest";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = safeLike(normQ(url.searchParams.get("q")));

    if (!q || q.length < 2) {
      return NextResponse.json({ my: [], community: [] });
    }

    const supabase = await createClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const userId = userRes.user.id;

    const like = `*${q}*`;
    const orClause = `title.ilike.${like},description_md.ilike.${like}`;

    const ownedPromise = supabase
      .from("projects")
      .select("id,title,visibility,is_hidden,updated_at")
      .eq("owner_user_id", userId)
      .or(orClause)
      .order("updated_at", { ascending: false })
      .limit(6)
      .returns<OwnedRow[]>();

    const membershipsPromise = supabase
      .from("project_members")
      .select("project_id,role")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<MembershipRow[]>();

    const communityPromise = supabase
      .from("projects")
      .select("id,title,visibility,is_hidden,updated_at")
      .eq("is_hidden", false)
      .not("published_at", "is", null)
      .in("visibility", ["public", "unlisted"])
      .or(orClause)
      .order("updated_at", { ascending: false })
      .limit(8)
      .returns<CommunityProjectRow[]>();

    const [
      { data: owned, error: ownedErr },
      { data: memberships, error: memErr },
      { data: comm, error: commErr },
    ] = await Promise.all([ownedPromise, membershipsPromise, communityPromise]);

    if (ownedErr) return NextResponse.json({ error: ownedErr.message }, { status: 400 });
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
    if (commErr) return NextResponse.json({ error: commErr.message }, { status: 400 });

    const myMap = new Map<string, ProjectHit>();

    for (const p of owned ?? []) {
      myMap.set(p.id, {
        id: p.id,
        title: p.title,
        visibility: p.visibility ?? "private",
        is_hidden: Boolean(p.is_hidden),
        updated_at: p.updated_at,
        role: "owner",
      });
    }

    const memberIds: string[] = [];
    const roleById = new Map<string, ProjectRole>();

    for (const m of memberships ?? []) {
      if (myMap.has(m.project_id)) continue;
      memberIds.push(m.project_id);
      roleById.set(m.project_id, isProjectRole(m.role) ? m.role : "guest");
    }

    let imported: ProjectRowLite[] = [];
    if (memberIds.length) {
      const { data: imp, error: impErr } = await supabase
        .from("projects")
        .select("id,title,visibility,is_hidden,updated_at")
        .in("id", memberIds)
        .or(orClause)
        .order("updated_at", { ascending: false })
        .limit(8)
        .returns<ProjectRowLite[]>();

      if (impErr) return NextResponse.json({ error: impErr.message }, { status: 400 });
      imported = imp ?? [];
    }

    for (const p of imported) {
      if (myMap.has(p.id)) continue;
      myMap.set(p.id, {
        id: p.id,
        title: p.title,
        visibility: p.visibility ?? "private",
        is_hidden: Boolean(p.is_hidden),
        updated_at: p.updated_at,
        role: roleById.get(p.id) ?? "guest",
      });
    }

    const my = Array.from(myMap.values())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 8);

    const community: ProjectHit[] = (comm ?? [])
      .filter((p) => !myMap.has(p.id))
      .map((p) => ({
        id: p.id,
        title: p.title,
        visibility: p.visibility ?? "public",
        is_hidden: Boolean(p.is_hidden),
        updated_at: p.updated_at,
      }));

    return NextResponse.json({ my, community });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error." },
      { status: 500 }
    );
  }
}
