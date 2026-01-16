// app/protected/community/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { createClient } from "@/lib/supabase/server";
import { ProjectPreviewButton } from "./ProjectPreviewButton";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Search,
  SlidersHorizontal,
  Filter,
  ArrowUpDown,
  User,
  X,
  BookOpen,
} from "lucide-react";

import { importProjectAction } from "./actions";
import type { ProjectRow, ProjectId } from "@/lib/types/study";
import { formatDateTimeCL } from "@/lib/datetime";

type SearchParams = {
  error?: string;
  q?: string;
  show?: "all" | "not_imported" | "imported" | "mine";
  sort?: "updated_desc" | "updated_asc" | "published_desc" | "title_asc";
  author?: string;
  filters?: "1";
  page?: string;
};

const PAGE_SIZE = 24;

function idToString(id: ProjectId): string {
  return String(id);
}

function safeLike(raw: string): string {
  // PostgREST + ilike: evitamos comas que rompen la sintaxis de .or(...)
  return raw.replace(/,/g, " ").trim();
}

function normalizeShow(v: unknown): SearchParams["show"] {
  return v === "not_imported" || v === "imported" || v === "mine" ? v : "all";
}

function normalizeSort(v: unknown): NonNullable<SearchParams["sort"]> {
  if (v === "updated_asc" || v === "published_desc" || v === "title_asc") return v;
  return "updated_desc";
}

function normalizePage(v: unknown): number {
  const n = Number(String(v ?? "1"));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function initialsFromUsername(username: string | null): string {
  const u = (username ?? "").trim();
  if (!u) return "U";
  const parts = u.split(/[.\s_-]+/g).filter(Boolean);
  const a = parts[0]?.[0] ?? "U";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

function AvatarCircle(props: { url: string | null; fallback: string; size?: number }) {
  const size = props.size ?? 28;
  const u = (props.url ?? "").trim();
  return (
    <div
      className="rounded-full border bg-muted/30 overflow-hidden grid place-items-center"
      style={{ width: size, height: size }}
      aria-label="Avatar"
    >
      {u ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u} alt="Avatar" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-medium text-muted-foreground">
          {props.fallback}
        </span>
      )}
    </div>
  );
}

type PublicProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

type ProjectWithOwner = ProjectRow & {
  owner?: PublicProfile | null;
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);

  return (
    <div className="space-y-4">
      <Header />
      <Filters sp={sp} />
      {sp.error ? <p className="text-sm text-destructive">{sp.error}</p> : null}
      <Suspense fallback={<ResultsSkeleton />}>
        <CommunityResults sp={sp} />
      </Suspense>
    </div>
  );
}

async function CommunityResults(props: { sp: SearchParams }) {
  const sp = props.sp;

  const qRaw = typeof sp.q === "string" ? sp.q : "";
  const q = safeLike(qRaw);

  const show = normalizeShow(sp.show);
  const sort = normalizeSort(sp.sort);

  const authorRaw = typeof sp.author === "string" ? sp.author : "";
  const author = safeLike(authorRaw);

  const page = normalizePage(sp.page);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  type DbError = { message: string };
  type AuthorRow = { id: string };
  type AuthorLookupResult = { data: AuthorRow[] | null; error: DbError | null };

  const userPromise = supabase.auth.getUser();

  const authorPromise: PromiseLike<AuthorLookupResult> = author.trim()
    ? supabase
        .from("profiles")
        .select("id")
        .ilike("username", `%${author.trim()}%`)
        .limit(50)
        .returns<AuthorRow[]>()
    : Promise.resolve({ data: null, error: null });

  const [{ data: userRes, error: userErr }, { data: authorProfiles, error: aErr }] =
    await Promise.all([userPromise, authorPromise]);

  if (userErr || !userRes.user) redirect("/auth/login");
  const userId = userRes.user.id;

  // Author -> ids
  let authorIds: string[] | null = null;
  if (author.trim()) {
    if (aErr) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{aErr.message}</CardDescription>
          </CardHeader>
        </Card>
      );
    }

    authorIds = (authorProfiles ?? []).map((x) => x.id);

    if (authorIds.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sin resultados</CardTitle>
            <CardDescription>
              No se encontraron autores que coincidan con “{author.trim()}”.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }
  }

  let query = supabase
    .from("projects")
    .select(
      [
        "id",
        "owner_user_id",
        "title",
        "description_md",
        "visibility",
        "is_hidden",
        "updated_at",
        "published_at",
        "owner:profiles!projects_owner_user_id_fkey(id,username,avatar_url)",
      ].join(",")
    )
    .eq("visibility", "public")
    .eq("is_hidden", false)
    .range(from, to);

  if (q.trim()) {
    const like = `%${q.trim()}%`;
    query = query.or(`title.ilike.${like},description_md.ilike.${like}`);
  }

  if (authorIds && authorIds.length) {
    query = query.in("owner_user_id", authorIds);
  }

  if (sort === "updated_desc") query = query.order("updated_at", { ascending: false });
  if (sort === "updated_asc") query = query.order("updated_at", { ascending: true });
  if (sort === "published_desc") {
    query = query.order("published_at", { ascending: false, nullsFirst: false });
  }
  if (sort === "title_asc") query = query.order("title", { ascending: true });

  const { data: projectsRaw, error } = await query.returns<ProjectWithOwner[]>();

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error.message}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const projects = projectsRaw ?? [];
  const ids: ProjectId[] = projects.map((p) => p.id);

  const importedSet = new Set<string>();
  if (ids.length) {
    const { data: memberships } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .in("project_id", ids)
      .returns<{ project_id: ProjectId }[]>();

    for (const m of memberships ?? []) importedSet.add(idToString(m.project_id));
  }

  const filtered = projects.filter((p) => {
    const pid = idToString(p.id);
    const isOwner = p.owner_user_id === userId;
    const already = importedSet.has(pid);

    if (show === "mine") return isOwner;
    if (show === "imported") return already || isOwner;
    if (show === "not_imported") return !already && !isOwner;
    return true;
  });

  const hasNextPage = projects.length === PAGE_SIZE;
  const hasPrevPage = page > 1;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((p) => {
          const pid = idToString(p.id);
          const isOwner = p.owner_user_id === userId;
          const already = importedSet.has(pid);

          const authorProfile = p.owner ?? null;
          const authorUsername = authorProfile?.username ?? "usuario";
          const authorAvatar = authorProfile?.avatar_url ?? null;
          const authorInitials = initialsFromUsername(authorProfile?.username ?? null);

          return (
            <Card key={pid} className="h-full">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base flex items-start justify-between gap-2">
                  <span className="truncate">{p.title}</span>
                </CardTitle>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AvatarCircle url={authorAvatar} fallback={authorInitials} size={22} />
                  <span className="truncate">{authorUsername}</span>
                </div>

                <CardDescription className="line-clamp-2">
                  {p.description_md ?? ""}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Actualizado: {formatDateTimeCL(p.updated_at)}
                </p>

                <div className="flex items-center gap-2">
                  <ProjectPreviewButton
                    projectId={pid}
                    title={p.title}
                    isOwner={isOwner}
                    alreadyImported={already}
                  />

                  {isOwner || already ? (
                    <Button asChild variant="secondary">
                      <Link href={`/protected/projects/${pid}`}>Abrir</Link>
                    </Button>
                  ) : (
                    <form action={importProjectAction}>
                      <input type="hidden" name="project_id" value={pid} />
                      <Button type="submit">Importar</Button>
                    </form>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!filtered.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sin resultados</CardTitle>
              <CardDescription>
                No hay proyectos que coincidan con tu búsqueda/filtros.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>

      {/* Simple pagination */}
      {(hasPrevPage || hasNextPage) && (
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" disabled={!hasPrevPage}>
            <Link href={buildHref(sp, { page: String(page - 1) })} aria-disabled={!hasPrevPage}>
              Anterior
            </Link>
          </Button>

          <p className="text-xs text-muted-foreground">Página {page}</p>

          <Button asChild variant="ghost" disabled={!hasNextPage}>
            <Link href={buildHref(sp, { page: String(page + 1) })} aria-disabled={!hasNextPage}>
              Siguiente
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function buildHref(sp: SearchParams, overrides: Partial<SearchParams>): string {
  const params = new URLSearchParams();

  const next: SearchParams = { ...sp, ...overrides };

  if (typeof next.q === "string" && next.q.trim()) params.set("q", next.q);
  if (typeof next.show === "string" && next.show !== "all") params.set("show", next.show);
  if (typeof next.sort === "string" && next.sort !== "updated_desc") params.set("sort", next.sort);
  if (typeof next.author === "string" && next.author.trim()) params.set("author", next.author);
  if (next.filters === "1") params.set("filters", "1");

  const page = normalizePage(next.page);
  if (page > 1) params.set("page", String(page));

  const qs = params.toString();
  return qs ? `/protected/community?${qs}` : "/protected/community";
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="h-[152px]">
          <CardHeader className="space-y-2">
            <div className="h-4 w-2/3 rounded bg-muted/40" />
            <div className="h-3 w-1/3 rounded bg-muted/30" />
            <div className="h-3 w-full rounded bg-muted/20" />
            <div className="h-3 w-5/6 rounded bg-muted/20" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/* ------------------- UI subcomponents (server-safe) ------------------- */

function Header() {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/30">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
          </span>
          <h1 className="text-xl font-semibold">Comunidad</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Proyectos públicos que puedes importar a tu biblioteca.
        </p>
      </div>

      <Button asChild variant="ghost">
        <Link href="/protected/projects">Mi biblioteca</Link>
      </Button>
    </div>
  );
}

function Chip(props: { icon?: React.ReactNode; text: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-muted bg-transparent px-2 py-0.5 text-xs text-muted-foreground"
      title={props.text}
    >
      {props.icon ? <span className="opacity-80">{props.icon}</span> : null}
      <span className="max-w-[240px] truncate">{props.text}</span>
    </span>
  );
}

function Filters(props: { sp: SearchParams }) {
  const q = typeof props.sp.q === "string" ? props.sp.q : "";
  const author = typeof props.sp.author === "string" ? props.sp.author : "";
  const show = (props.sp.show ?? "all") as SearchParams["show"];
  const sort = (props.sp.sort ?? "updated_desc") as NonNullable<SearchParams["sort"]>;

  const hasQ = q.trim().length > 0;
  const hasAuthor = author.trim().length > 0;
  const hasShow = (show ?? "all") !== "all";
  const hasSort = (sort ?? "updated_desc") !== "updated_desc";

  const open = props.sp.filters === "1" || hasAuthor || hasShow || hasSort;

  const chips: Array<React.ReactNode> = [];

  if (hasShow) {
    const label =
      show === "mine"
        ? "Mis proyectos"
        : show === "imported"
          ? "Ya importados"
          : show === "not_imported"
            ? "Sin importar"
            : "Todos";
    chips.push(<Chip key="show" icon={<Filter className="h-3.5 w-3.5" />} text={label} />);
  }

  if (hasSort) {
    const label =
      sort === "updated_asc"
        ? "Actualización: antiguos"
        : sort === "published_desc"
          ? "Publicación: recientes"
          : sort === "title_asc"
            ? "Título: A → Z"
            : "Actualización: recientes";
    chips.push(<Chip key="sort" icon={<ArrowUpDown className="h-3.5 w-3.5" />} text={label} />);
  }

  if (hasAuthor) {
    chips.push(
      <Chip key="author" icon={<User className="h-3.5 w-3.5" />} text={`Autor: ${author.trim()}`} />
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          Buscar proyectos
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <form method="get" className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Buscar por título o descripción…"
                className="pl-9 h-11 text-base"
              />
            </div>

            <div className="flex gap-2">
              <input type="hidden" name="page" value="1" />

              <Button type="submit" className="h-11 px-4">
                <Search className="mr-2 h-4 w-4" />
                Buscar
              </Button>

              <Button asChild type="button" variant="secondary" className="h-11 px-4">
                <Link href="/protected/community">
                  <X className="mr-2 h-4 w-4" />
                  Limpiar
                </Link>
              </Button>
            </div>
          </div>

          {(chips.length > 0 || hasQ) && (
            <div className="flex flex-wrap gap-2">
              {hasQ ? (
                <Chip icon={<Search className="h-3.5 w-3.5" />} text={`“${q.trim()}”`} />
              ) : null}
              {chips}
            </div>
          )}

          <details className="group" open={open}>
            <summary className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground select-none">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
            </summary>

            <div className="mt-3 grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4 space-y-1">
                <Label htmlFor="show" className="flex items-center gap-2 text-sm">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  Mostrar
                </Label>
                <select
                  id="show"
                  name="show"
                  defaultValue={show ?? "all"}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="not_imported">Sin importar</option>
                  <option value="imported">Ya importados</option>
                  <option value="mine">Mis proyectos</option>
                </select>
              </div>

              <div className="sm:col-span-4 space-y-1">
                <Label htmlFor="sort" className="flex items-center gap-2 text-sm">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  Orden
                </Label>
                <select
                  id="sort"
                  name="sort"
                  defaultValue={sort ?? "updated_desc"}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="updated_desc">Actualización (recientes primero)</option>
                  <option value="updated_asc">Actualización (antiguos primero)</option>
                  <option value="published_desc">Publicación (recientes primero)</option>
                  <option value="title_asc">Título (A → Z)</option>
                </select>
              </div>

              <div className="sm:col-span-4 space-y-1">
                <Label
                  htmlFor="author"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Autor
                </Label>
                <Input
                  id="author"
                  name="author"
                  defaultValue={author}
                  placeholder="filtrar por autor…"
                  className="h-9"
                />
              </div>

              <input type="hidden" name="filters" value="1" />
            </div>
          </details>
        </form>
      </CardContent>
    </Card>
  );
}
