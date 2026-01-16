import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTimeCL } from "@/lib/datetime";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SearchParams = { q?: string };

type ProjectRole = "owner" | "editor" | "guest";

type ProjectHit = {
  id: string;
  title: string;
  visibility: string | null;
  is_hidden: boolean;
  updated_at: string;
  role?: ProjectRole;
};

type ProjectRowLite = {
  id: string;
  title: string;
  visibility: string | null;
  is_hidden: boolean | null;
  updated_at: string;
};

type MembershipRow = {
  project_id: string;
  role: ProjectRole | null;
};

type CommunityRow = {
  id: string;
  title: string;
  visibility: string | null;
  is_hidden: boolean | null;
  updated_at: string;
};

function roleLabel(role?: ProjectHit["role"]) {
  if (!role) return null;
  if (role === "owner") return "Dueño";
  if (role === "editor") return "Editor";
  return "Invitado";
}

function isProjectRole(v: unknown): v is ProjectRole {
  return v === "owner" || v === "editor" || v === "guest";
}

function safeLike(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

function projHref(id: string) {
  return `/protected/projects/${encodeURIComponent(id)}?tab=view`;
}

export default async function SearchPage(props: { searchParams?: SearchParams }) {
  const qRaw = String(props.searchParams?.q ?? "");
  const q = safeLike(qRaw).trim();

  const supabase = await createClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) redirect("/auth/login");
  const userId = userRes.user.id;

  if (!q || q.length < 2) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Buscar</h1>
          <p className="text-sm text-muted-foreground">Escribe al menos 2 caracteres.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sin búsqueda</CardTitle>
            <CardDescription>Ingresa un término en la barra superior.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const like = `*${q}*`;
  const orClause = `title.ilike.${like},description_md.ilike.${like}`;

  const ownedPromise = supabase
    .from("projects")
    .select("id,title,visibility,is_hidden,updated_at")
    .eq("owner_user_id", userId)
    .or(orClause)
    .order("updated_at", { ascending: false })
    .limit(30)
    .returns<ProjectRowLite[]>();

  const membershipsPromise = supabase
    .from("project_members")
    .select("project_id,role")
    .eq("user_id", userId)
    .limit(300)
    .returns<MembershipRow[]>();

  const communityPromise = supabase
    .from("projects")
    .select("id,title,visibility,is_hidden,updated_at")
    .eq("is_hidden", false)
    .not("published_at", "is", null)
    .in("visibility", ["public", "unlisted"])
    .or(orClause)
    .order("updated_at", { ascending: false })
    .limit(40)
    .returns<CommunityRow[]>();

  const [
    { data: owned, error: ownedErr },
    { data: memberships, error: memErr },
    { data: comm, error: commErr },
  ] = await Promise.all([ownedPromise, membershipsPromise, communityPromise]);

  const errorMsg = ownedErr?.message ?? memErr?.message ?? commErr?.message ?? null;

  if (errorMsg) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Resultados</h1>
            <p className="text-sm text-muted-foreground">
              Búsqueda: <span className="font-medium">{q}</span>
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/protected/home">Volver</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{errorMsg}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const ownedList = owned ?? [];
  const ownedSet = new Set(ownedList.map((p) => p.id));

  const roleById = new Map<string, ProjectRole>();
  const memberIds: string[] = [];

  for (const m of memberships ?? []) {
    if (ownedSet.has(m.project_id)) continue;
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
      .limit(60)
      .returns<ProjectRowLite[]>();

    if (!impErr) imported = imp ?? [];
  }

  const myMap = new Map<string, ProjectHit>();

  for (const p of ownedList) {
    myMap.set(p.id, {
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      is_hidden: Boolean(p.is_hidden),
      updated_at: p.updated_at,
      role: "owner",
    });
  }

  for (const p of imported) {
    if (myMap.has(p.id)) continue;
    myMap.set(p.id, {
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      is_hidden: Boolean(p.is_hidden),
      updated_at: p.updated_at,
      role: roleById.get(p.id) ?? "guest",
    });
  }

  const my = Array.from(myMap.values()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const community = (comm ?? []).filter((p) => !myMap.has(p.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Resultados</h1>
          <p className="text-sm text-muted-foreground">
            Búsqueda: <span className="font-medium">{q}</span>
          </p>
        </div>

        <Button asChild variant="ghost">
          <Link href="/protected/home">Volver</Link>
        </Button>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Mis proyectos</h2>
        {my.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {my.map((p) => (
              <Card key={p.id}>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base truncate">{p.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {roleLabel(p.role)} · {p.visibility ?? "—"} · Actualizado:{" "}
                    {formatDateTimeCL(p.updated_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={projHref(p.id)}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sin coincidencias</CardTitle>
              <CardDescription>No se encontraron proyectos tuyos con ese término.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Comunidad</h2>
        {community.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {community.map((p) => (
              <Card key={p.id}>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base truncate">{p.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {p.visibility ?? "—"} · Actualizado: {formatDateTimeCL(p.updated_at)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={projHref(p.id)}>Abrir</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sin coincidencias</CardTitle>
              <CardDescription>
                No se encontraron proyectos públicos/unlisted con ese término.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
