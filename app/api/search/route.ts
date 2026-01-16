import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ProjectHit = {
  id: string;
  title: string;
  visibility: "private" | "unlisted" | "public" | string;
  is_hidden: boolean;
  updated_at: string;
  role?: "owner" | "editor" | "guest";
};

function normQ(q: string | null): string {
  return String(q ?? "").trim().slice(0, 120);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = normQ(url.searchParams.get("q"));

    if (!q || q.length < 2) {
      return NextResponse.json({ my: [], community: [] });
    }

    const supabase = await createClient();

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const userId = userRes.user.id;
    const needle = `%${q}%`;

    // Mis proyectos (owner)
    const ownedPromise = supabase
      .from("projects")
      .select("id,title,visibility,is_hidden,updated_at,owner_user_id")
      .eq("owner_user_id", userId)
      .or(`title.ilike.${needle},description_md.ilike.${needle}`)
      .order("updated_at", { ascending: false })
      .limit(6);

    // Mis proyectos (member)
    // Nota: requiere FK project_members.project_id -> projects.id
    const memberPromise = supabase
      .from("project_members")
      .select("role, projects!inner(id,title,visibility,is_hidden,updated_at)")
      .eq("user_id", userId)
      .or(`projects.title.ilike.${needle},projects.description_md.ilike.${needle}`)
      .order("created_at", { ascending: false })
      .limit(8);

    // Comunidad
    const communityPromise = supabase
      .from("projects")
      .select("id,title,visibility,is_hidden,updated_at,published_at")
      .eq("is_hidden", false)
      .not("published_at", "is", null)
      .in("visibility", ["public", "unlisted"])
      .or(`title.ilike.${needle},description_md.ilike.${needle}`)
      .order("updated_at", { ascending: false })
      .limit(8);

    const [{ data: owned, error: ownedErr }, { data: member, error: memErr }, { data: comm, error: commErr }] =
      await Promise.all([ownedPromise, memberPromise, communityPromise]);

    if (ownedErr) return NextResponse.json({ error: ownedErr.message }, { status: 400 });
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
    if (commErr) return NextResponse.json({ error: commErr.message }, { status: 400 });

    const myMap = new Map<string, ProjectHit>();

    for (const p of owned ?? []) {
      myMap.set(p.id, {
        id: p.id,
        title: p.title,
        visibility: p.visibility ?? "private",
        is_hidden: !!p.is_hidden,
        updated_at: p.updated_at,
        role: "owner",
      });
    }
    
    type MemberRow = {
    role: "owner" | "editor" | "guest" | null;
    projects: Array<{
        id: string;
        title: string;
        visibility: string | null;
        is_hidden: boolean | null;
        updated_at: string;
    }>;
    };

    type CommunityProjectRow = {
    id: string;
    title: string;
    visibility: "private" | "unlisted" | "public" | string | null;
    is_hidden: boolean | null;
    updated_at: string;
    published_at: string | null;
    };
    
    for (const row of (member ?? []) as MemberRow[]) {
        const p = row.projects[0];
        if (!p) continue;

        if (!myMap.has(p.id)) {
            myMap.set(p.id, {
            id: p.id,
            title: p.title,
            visibility: p.visibility ?? "private",
            is_hidden: !!p.is_hidden,
            updated_at: p.updated_at,
            role: row.role ?? "guest",
            });
        }
    }

    const my = Array.from(myMap.values()).slice(0, 8);
    const community: ProjectHit[] = (comm ?? []).map((p: CommunityProjectRow) => ({
    id: p.id,
    title: p.title,
    visibility: p.visibility ?? "public",
    is_hidden: !!p.is_hidden,
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
