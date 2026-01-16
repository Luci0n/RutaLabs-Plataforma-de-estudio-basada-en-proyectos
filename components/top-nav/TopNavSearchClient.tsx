"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatDateTimeCL } from "@/lib/datetime";

type ProjectHit = {
  id: string;
  title: string;
  visibility: string;
  is_hidden: boolean;
  updated_at: string;
  role?: "owner" | "editor" | "guest";
};

type ApiResp = { my: ProjectHit[]; community: ProjectHit[] } | { error: string };

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function roleLabel(role?: ProjectHit["role"]) {
  if (!role) return null;
  if (role === "owner") return "Dueño";
  if (role === "editor") return "Editor";
  return "Invitado";
}

function projHref(id: string) {
  return `/protected/projects/${encodeURIComponent(id)}?tab=view`;
}

export function TopNavSearchClient() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [my, setMy] = useState<ProjectHit[]>([]);
  const [community, setCommunity] = useState<ProjectHit[]>([]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const trimmed = query.trim();
  const canSearch = trimmed.length >= 2;

  const flatItems = useMemo(() => {
    const items: Array<{ key: string; kind: "my" | "community"; item: ProjectHit }> = [];
    for (const x of my) items.push({ key: `my:${x.id}`, kind: "my", item: x });
    for (const x of community) items.push({ key: `c:${x.id}`, kind: "community", item: x });
    return items;
  }, [my, community]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    setErr(null);

    if (!canSearch) {
      setMy([]);
      setCommunity([]);
      setActiveKey(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          method: "GET",
          headers: { "Accept": "application/json" },
        });

        const data = (await res.json()) as ApiResp;

        if (!res.ok) {
          const msg = "error" in data ? data.error : "Error.";
          setErr(msg);
          setMy([]);
          setCommunity([]);
          setActiveKey(null);
          setLoading(false);
          return;
        }

        if ("error" in data) {
          setErr(data.error);
          setMy([]);
          setCommunity([]);
          setActiveKey(null);
          setLoading(false);
          return;
        }

        setMy(data.my ?? []);
        setCommunity(data.community ?? []);

        const first = (data.my?.[0] ? `my:${data.my[0].id}` : null)
          ?? (data.community?.[0] ? `c:${data.community[0].id}` : null);

        setActiveKey(first);
        setLoading(false);
        setOpen(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error.");
        setMy([]);
        setCommunity([]);
        setActiveKey(null);
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(t);
  }, [trimmed, canSearch]);

  function goFullSearch() {
    if (!canSearch) return;
    setOpen(false);
    router.push(`/protected/search?q=${encodeURIComponent(trimmed)}`);
  }

  function goActive() {
    if (!activeKey) return goFullSearch();
    const found = flatItems.find((x) => x.key === activeKey);
    if (!found) return goFullSearch();
    setOpen(false);
    router.push(projHref(found.item.id));
  }

  function step(delta: number) {
    if (!flatItems.length) return;

    const idx = activeKey ? flatItems.findIndex((x) => x.key === activeKey) : -1;
    const next = idx < 0 ? 0 : (idx + delta + flatItems.length) % flatItems.length;
    setActiveKey(flatItems[next]?.key ?? null);
  }

  return (
    <div ref={rootRef} className="relative hidden w-[220px] sm:block sm:w-[260px] md:w-[320px]">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <SearchIcon />
      </span>

      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        placeholder="Buscar proyectos..."
        className="pl-9"
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && (my.length || community.length)) goActive();
            else goFullSearch();
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            step(+1);
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            step(-1);
            return;
          }
        }}
      />

      {open && canSearch ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50">
          <Card className="overflow-hidden">
            <div className="border-b px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">
                  {loading ? "Buscando..." : "Resultados rápidos"}
                </p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:underline"
                  onClick={goFullSearch}
                >
                  Ver todo
                </button>
              </div>
              {err ? (
                <p className="mt-1 text-xs text-destructive">{err}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Enter abre el seleccionado · Esc cierra
                </p>
              )}
            </div>

            <div className="max-h-[22rem] overflow-auto">
              {my.length ? (
                <div className="px-3 pt-3">
                  <p className="text-[11px] font-medium text-muted-foreground">Mis proyectos</p>
                  <div className="mt-2 space-y-1 pb-2">
                    {my.map((p) => {
                      const key = `my:${p.id}`;
                      const active = key === activeKey;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={[
                            "w-full rounded-md px-2 py-2 text-left",
                            "hover:bg-muted/60",
                            active ? "bg-muted" : "",
                          ].join(" ")}
                          onMouseEnter={() => setActiveKey(key)}
                          onClick={() => {
                            setOpen(false);
                            router.push(projHref(p.id));
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{p.title}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {roleLabel(p.role) ?? ""}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {p.visibility} · {formatDateTimeCL(p.updated_at)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {community.length ? (
                <div className="px-3 pb-3">
                  <p className="text-[11px] font-medium text-muted-foreground">Comunidad</p>
                  <div className="mt-2 space-y-1">
                    {community.map((p) => {
                      const key = `c:${p.id}`;
                      const active = key === activeKey;

                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={[
                            "w-full rounded-md px-2 py-2 text-left",
                            "hover:bg-muted/60",
                            active ? "bg-muted" : "",
                          ].join(" ")}
                          onMouseEnter={() => setActiveKey(key)}
                          onClick={() => {
                            setOpen(false);
                            router.push(projHref(p.id));
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{p.title}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {p.visibility}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatDateTimeCL(p.updated_at)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!loading && !err && my.length === 0 && community.length === 0 ? (
                <div className="px-3 py-6">
                  <p className="text-sm font-medium">Sin coincidencias</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prueba con otro término o usa “Ver todo”.
                  </p>
                  <div className="mt-3">
                    <Link
                      href={`/protected/search?q=${encodeURIComponent(trimmed)}`}
                      className="text-sm underline"
                      onClick={() => setOpen(false)}
                    >
                      Ver resultados completos
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
