// app/protected/home/home-client.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  BookOpen,
  CalendarClock,
  Compass,
  FolderKanban,
  HelpCircle,
  History,
  LayoutDashboard,
  ListTodo,
  Pencil,
  Plus,
  Sparkles,
  X,
  ArrowRight,
} from "lucide-react";

import { formatDateTimeCL } from "@/lib/datetime";

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

type HelpTabKey = "rutalabs" | "pomodoro" | "active_recall" | "projects" | "rules";

const TAB_META: Record<HelpTabKey, { label: string; icon: ReactNode; desc: string }> = {
  rutalabs: {
    label: "RutaLabs",
    icon: <Sparkles className="h-4 w-4" />,
    desc: "Qué es y cómo usar el dashboard.",
  },
  pomodoro: {
    label: "Pomodoro",
    icon: <CalendarClock className="h-4 w-4" />,
    desc: "Foco, descansos y consistencia.",
  },
  active_recall: {
    label: "Cómo se estudia",
    icon: <ListTodo className="h-4 w-4" />,
    desc: "Recuperación activa y repetición espaciada.",
  },
  projects: {
    label: "Proyectos / Comunidad",
    icon: <FolderKanban className="h-4 w-4" />,
    desc: "Bloques, roles y publicación.",
  },
  rules: {
    label: "Reglas",
    icon: <BookOpen className="h-4 w-4" />,
    desc: "Límites y buenas prácticas.",
  },
};

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

/* ---------- Modern surface primitives ---------- */

function FancyCard(props: { children: ReactNode; className?: string }) {
  return (
    <Card
      className={cx(
        "rounded-2xl border bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70",
        "ring-1 ring-black/5 dark:ring-white/5",
        "shadow-sm",
        "transition-all motion-safe:duration-200",
        "motion-safe:hover:-translate-y-[1px] motion-safe:hover:shadow-md",
        props.className
      )}
    >
      {props.children}
    </Card>
  );
}

function FancyButton(props: React.ComponentProps<typeof Button>) {
  const { className, ...rest } = props;
  return (
    <Button
      {...rest}
      className={cx(
        "rounded-2xl",
        "transition-all motion-safe:duration-200",
        "motion-safe:hover:-translate-y-[1px] motion-safe:hover:shadow-md",
        "active:translate-y-0",
        className
      )}
    />
  );
}

/* ---------- Page ---------- */

export function HomeClient(props: { data: HomeDashboardData }) {
  const d = props.data;

  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState<HelpTabKey>("rutalabs");

  const dueToday = d.stats.dueToday ?? 0;
  const activeProjects = d.stats.activeProjects ?? 0;

  const header = useMemo(() => {
    if (dueToday === 0) return "No tienes repasos listos ahora.";
    if (dueToday === 1) return "Tienes 1 repaso listo para hoy.";
    return `Tienes ${dueToday} repasos listos para hoy.`;
  }, [dueToday]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-muted/20">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">Inicio / Dashboard</h1>
              <p className="text-sm text-muted-foreground truncate">{header}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Intro / RutaLabs */}
      <FancyCard className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/25">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">RutaLabs</CardTitle>
                <CardDescription className="truncate">
                  Proyectos + tarjetas + agenda: decide qué estudiar hoy, sin fricción.
                </CardDescription>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HelpTip
              label="Ayuda: RutaLabs"
              title="¿Qué ves en esta página?"
              body={
                <div className="space-y-2">
                  <p>
                    Este dashboard es un resumen rápido: crea proyectos, ve lo que toca hoy y retoma lo último
                    que estabas trabajando.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Para una explicación completa, abre la guía por pestañas.
                  </p>
                </div>
              }
            />

            <FancyButton
              type="button"
              size="lg"
              className="h-11 px-5 gap-2"
              onClick={() => {
                setHelpTab("rutalabs");
                setHelpOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
            >
              <BookOpen className="h-4 w-4" />
              Abrir guía
            </FancyButton>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <FancyButton asChild className="justify-between gap-2 h-11">
              <Link href="/protected/projects/new">
                <span className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Crear proyecto
                </span>
                <ArrowRight className="h-4 w-4 opacity-70" />
              </Link>
            </FancyButton>

            <FancyButton asChild variant="secondary" className="justify-between gap-2 h-11">
              <Link href="/protected/agenda">
                <span className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4" />
                  Estudiar ahora
                </span>
                <ArrowRight className="h-4 w-4 opacity-70" />
              </Link>
            </FancyButton>

            <FancyButton asChild variant="ghost" className="justify-between gap-2 h-11 hover:bg-muted/25">
              <Link href="/protected/community">
                <span className="flex items-center gap-2">
                  <Compass className="h-4 w-4" />
                  Explorar comunidad
                </span>
                <ArrowRight className="h-4 w-4 opacity-60" />
              </Link>
            </FancyButton>
          </div>

          <div className="rounded-2xl border bg-muted/10 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Regla rápida: <b className="text-foreground">Proyectos</b> para construir,{" "}
                <b className="text-foreground">Agenda</b> para priorizar,{" "}
                <b className="text-foreground">Tarjetas</b> para entrenar memoria.
              </p>
              <span className="text-xs text-muted-foreground">Consejo: convierte una idea por tarjeta.</span>
            </div>
          </div>
        </CardContent>
      </FancyCard>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-3">
          {/* Proyectos recientes */}
          <FancyCard>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/25">
                    <History className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="truncate">Proyectos recientes</CardTitle>
                    <CardDescription className="truncate">Retoma lo último que tocaste.</CardDescription>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <HelpTip
                  label="Ayuda: Proyectos recientes"
                  title="¿Qué aparece aquí?"
                  body={
                    <div className="space-y-2">
                      <p>
                        Lista de proyectos usados recientemente. Puedes abrirlos o editarlos según tu rol
                        (Dueño/Editor/Invitado).
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Si no ves nada, crea un proyecto o explora Comunidad.
                      </p>
                    </div>
                  }
                />
                <FancyButton asChild variant="ghost" className="gap-2 hover:bg-muted/25">
                  <Link href="/protected/projects">
                    Ver todos
                    <ArrowRight className="h-4 w-4 opacity-60" />
                  </Link>
                </FancyButton>
              </div>
            </CardHeader>

            <CardContent className="space-y-2">
              {d.recentProjects.length === 0 ? (
                <Empty
                  title="Aún no hay proyectos"
                  desc="Crea uno o importa desde Comunidad."
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <FancyButton asChild className="gap-2">
                        <Link href="/protected/projects/new">
                          <Plus className="h-4 w-4" />
                          Crear proyecto
                        </Link>
                      </FancyButton>
                      <FancyButton asChild variant="secondary" className="gap-2">
                        <Link href="/protected/community">
                          <Compass className="h-4 w-4" />
                          Ir a Comunidad
                        </Link>
                      </FancyButton>
                    </div>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {d.recentProjects.map((p) => (
                    <div
                      key={p.project_id}
                      className={cx(
                        "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3",
                        "bg-muted/5 transition-colors",
                        "hover:bg-muted/10"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate">{p.title}</p>
                          <Chip subtle>{roleLabel(p.role)}</Chip>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground truncate">
                          Última actualización: {formatDateTimeCL(p.updated_at)}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <FancyButton asChild variant="secondary" className="gap-2">
                          <Link href={`/protected/projects/${encodeURIComponent(p.project_id)}?tab=view`}>
                            Abrir
                            <ArrowRight className="h-4 w-4 opacity-70" />
                          </Link>
                        </FancyButton>
                        <FancyButton asChild variant="ghost" className="gap-2 hover:bg-muted/25">
                          <Link href={`/protected/projects/${encodeURIComponent(p.project_id)}?tab=edit`}>
                            <Pencil className="h-4 w-4" />
                            Editar
                          </Link>
                        </FancyButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </FancyCard>
        </div>
      </div>

      {/* Resumen de hoy */}
      <FancyCard>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle>Resumen de hoy</CardTitle>
            <CardDescription>Repasos listos y proyectos activos.</CardDescription>
          </div>

          <HelpTip
            label="Ayuda: Resumen"
            title="¿Qué significa este resumen?"
            body={
              <div className="space-y-2">
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <b>Repasos listos</b>: tarjetas que la agenda considera prioritarias ahora.
                  </li>
                  <li>
                    <b>Proyectos activos</b>: proyectos en los que tienes acceso (según tu rol).
                  </li>
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Puedes ir directo a Agenda o Proyectos con los botones de abajo.
                </p>
              </div>
            }
          />
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <StatTile
              icon={<ListTodo className="h-4 w-4" />}
              label="Repasos listos hoy"
              value={String(dueToday)}
              hint="Tarjetas listas para estudiar."
            />
            <StatTile
              icon={<FolderKanban className="h-4 w-4" />}
              label="Proyectos activos"
              value={String(activeProjects)}
              hint="Tus proyectos disponibles."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FancyButton asChild variant="secondary" className="gap-2">
              <Link href="/protected/agenda">
                <CalendarClock className="h-4 w-4" />
                Abrir agenda
              </Link>
            </FancyButton>
            <FancyButton asChild variant="secondary" className="gap-2">
              <Link href="/protected/projects">
                <FolderKanban className="h-4 w-4" />
                Abrir proyectos
              </Link>
            </FancyButton>
          </div>
        </CardContent>
      </FancyCard>

      {/* Overlay de ayuda (tabs) */}
      <HelpOverlay
        open={helpOpen}
        tab={helpTab}
        onClose={() => setHelpOpen(false)}
        onTab={(t) => setHelpTab(t)}
      />
    </div>
  );
}

/* ---------- Help Tooltip (Popover) ---------- */

function HelpTip(props: { label: string; title: string; body: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 rounded-xl hover:bg-muted/25"
          aria-label={props.label}
          title={props.label}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className={cx(
          "w-80 rounded-2xl border",
          "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
          "shadow-md"
        )}
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold">{props.title}</p>
          <div className="text-xs text-muted-foreground leading-relaxed">{props.body}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Stat tile ---------- */

function StatTile(props: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <div
      className={cx(
        "rounded-2xl border p-4",
        "bg-muted/5",
        "shadow-sm",
        "transition-all motion-safe:duration-200",
        "motion-safe:hover:-translate-y-[1px] motion-safe:hover:shadow-md",
        "hover:bg-muted/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{props.label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{props.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{props.hint}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-muted/20">
          {props.icon}
        </span>
      </div>
    </div>
  );
}

/* ---------- Chips ---------- */

function Chip(props: { children: ReactNode; subtle?: boolean }) {
  return (
    <span
      className={cx(
        "text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap",
        props.subtle ? "bg-muted/10 text-muted-foreground" : "bg-muted/25 text-muted-foreground"
      )}
    >
      {props.children}
    </span>
  );
}

/* ---------- Help Overlay (clean, not flashy) ---------- */

function HelpOverlay(props: {
  open: boolean;
  tab: HelpTabKey;
  onClose: () => void;
  onTab: (t: HelpTabKey) => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!props.open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  const meta = TAB_META[props.tab];

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={props.onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ayuda de RutaLabs"
          className="w-full max-w-4xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Card className="rounded-2xl border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shadow-lg overflow-hidden">
            {/* Top bar */}
            <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/25">
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">Ayuda de RutaLabs</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {meta.label} · {meta.desc}
                    </p>
                  </div>
                </div>
              </div>

              <Button ref={closeBtnRef} type="button" variant="ghost" onClick={props.onClose} className="gap-2">
                <X className="h-4 w-4" />
                Cerrar
              </Button>
            </div>

            {/* Tabs */}
            <div className="px-4">
              <div className="sticky top-0 z-10 -mx-4 border-b bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                <div className="flex flex-wrap gap-2">
                  <TabBtn cur={props.tab} v="rutalabs" onClick={props.onTab} icon={TAB_META.rutalabs.icon}>
                    RutaLabs
                  </TabBtn>
                  <TabBtn cur={props.tab} v="pomodoro" onClick={props.onTab} icon={TAB_META.pomodoro.icon}>
                    Pomodoro
                  </TabBtn>
                  <TabBtn cur={props.tab} v="active_recall" onClick={props.onTab} icon={TAB_META.active_recall.icon}>
                    Cómo se estudia
                  </TabBtn>
                  <TabBtn cur={props.tab} v="projects" onClick={props.onTab} icon={TAB_META.projects.icon}>
                    Proyectos / Comunidad
                  </TabBtn>
                  <TabBtn cur={props.tab} v="rules" onClick={props.onTab} icon={TAB_META.rules.icon}>
                    Reglas
                  </TabBtn>
                </div>
              </div>

              <div className="max-h-[78vh] overflow-y-auto pb-4 pt-4">
                <div className="space-y-3">
                  {props.tab === "rutalabs" ? <HelpRutaLabs /> : null}
                  {props.tab === "pomodoro" ? <HelpPomodoro /> : null}
                  {props.tab === "active_recall" ? <HelpActiveRecall /> : null}
                  {props.tab === "projects" ? <HelpProjects /> : null}
                  {props.tab === "rules" ? <HelpRules /> : null}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TabBtn(props: {
  cur: HelpTabKey;
  v: HelpTabKey;
  onClick: (t: HelpTabKey) => void;
  children: ReactNode;
  icon: ReactNode;
}) {
  const active = props.cur === props.v;
  return (
    <Button
      type="button"
      variant={active ? "default" : "secondary"}
      size="sm"
      onClick={() => props.onClick(props.v)}
      className={cx("gap-2 rounded-xl", !active && "hover:bg-muted/25")}
    >
      {props.icon}
      {props.children}
    </Button>
  );
}

/* ---------- Help content---------- */

function HelpRutaLabs() {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <p className="text-sm font-semibold">¿Qué es RutaLabs?</p>

      <p className="mt-2 text-sm text-muted-foreground">
        RutaLabs es un sistema de estudio que combina <b>organización</b> y <b>entrenamiento de memoria</b>{" "}
        en un solo lugar. Construyes tu material (apuntes + tarjetas) y luego lo estudias con prioridad clara
        y progreso registrado.
      </p>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Para qué sirve</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Ordenar temas grandes en proyectos claros y mantenibles.</li>
            <li>Estudiar con foco: saber qué toca hoy sin improvisar.</li>
            <li>Evitar olvidar: registrar progreso real en tarjetas.</li>
            <li>Compartir o reutilizar material mediante Comunidad.</li>
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Qué incluye (en simple)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <b>Proyectos</b>: donde construyes y organizas tu contenido.
            </li>
            <li>
              <b>Agenda</b>: una vista que prioriza qué tarjetas estudiar hoy.
            </li>
            <li>
              <b>Comunidad</b>: para explorar proyectos públicos y publicar los tuyos.
            </li>
            <li>
              <b>Pomodoro</b>: un widget global opcional para manejar foco y descansos.
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Regla rápida: <b>Proyectos</b> es donde construyes, <b>Agenda</b> es donde priorizas, y{" "}
        <b>las tarjetas</b> es donde entrenas.
      </p>
    </div>
  );
}

function HelpPomodoro() {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <p className="text-sm font-semibold">Pomodoro</p>

      <p className="mt-2 text-sm text-muted-foreground">
        El método Pomodoro divide el trabajo en <b>bloques cortos de atención completa</b> separados por
        descansos. Sirve para sostener foco sin agotarte.
      </p>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Cómo funciona</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Eliges una tarea concreta.</li>
            <li>Inicias un período de foco sin distracciones.</li>
            <li>Trabajas hasta que termina.</li>
            <li>Descansas unos minutos.</li>
            <li>Repites el ciclo.</li>
          </ol>
        </div>

        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Configuración típica</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Trabajo: 25 min</li>
            <li>Descanso corto: 5 min</li>
            <li>Descanso largo: 15–20 min</li>
            <li>Largo cada 4 ciclos</li>
          </ul>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        En RutaLabs, el Pomodoro es un <b>widget global</b> porque acompaña cualquier sesión de estudio.
      </p>
    </div>
  );
}

function HelpActiveRecall() {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <p className="text-sm font-semibold">Cómo funciona el estudio en RutaLabs</p>

      <p className="mt-2 text-sm text-muted-foreground">
        RutaLabs combina <b>recuperación activa</b> (intentar recordar antes de mirar) y{" "}
        <b>repetición espaciada</b> (repasar en el momento adecuado).
      </p>

      <div className="mt-4 space-y-2">
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Recuperación activa</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Las tarjetas te obligan a traer la respuesta desde memoria. Eso fortalece el recuerdo más que releer.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Repetición espaciada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            La Agenda prioriza lo que toca hoy. Si te cuesta, vuelve antes; si lo dominas, se espacía.
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Resultado: estudias con intención, y el progreso se construye con respuestas reales.
      </p>
    </div>
  );
}

function HelpProjects() {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <p className="text-sm font-medium">Proyectos y Comunidad</p>

      <div className="mt-3 space-y-4 text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">Qué es un proyecto</p>
          <p className="mt-1">
            Un proyecto es un <b>espacio de estudio</b> (por ejemplo: “Neurociencia”, “Cálculo”, “Japonés”).
            La idea es que tengas todo el contenido del tema organizado y listo para estudiar con agenda.
          </p>
          <p className="mt-1">
            Un proyecto se construye usando <b>bloques</b>. Los bloques son piezas que puedes ordenar y
            editar: algunos sirven para explicar (texto) y otros para practicar (tarjetas).
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Bloques: texto y flashcards</p>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Bloque de texto (Markdown)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sirve para escribir apuntes: definiciones, explicaciones, ejemplos, listas y enlaces.
                Markdown te permite dar formato (títulos, negrita, listas, citas, código, etc.).
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Úsalo para <b>entender</b> el tema (la parte “teórica” y estructurada).
              </p>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Bloque de flashcards (tarjetas)</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sirve para crear tarjetas de estudio (pregunta → respuesta). Las tarjetas son lo que
                se usa en <b>Práctica</b> y lo que la <b>Agenda</b> programa para repasar.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Dentro del bloque, organizas tarjetas por <b>grupos</b> (por ejemplo: “Introducción”,
                “Neuroanatomía”, “Memoria”, etc.).
              </p>
            </div>
          </div>

          <div className="mt-2 rounded-lg border bg-card p-3">
            <p className="text-sm font-medium">Cómo se agregan y editan los bloques</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>
                En la sección <b>Bloques</b>, usa los botones <b>+ Texto</b> o <b>+ Flashcards</b>.
              </li>
              <li>
                Cada bloque queda en una lista y tiene un <b>orden</b>. Puedes reordenarlos para que el
                proyecto se lea como un “capítulo”.
              </li>
              <li>
                Cuando editas, normalmente estás en <b>modo borrador</b>: haces cambios libremente y se
                guardan <b>todos juntos</b> al final con <b>“Guardar cambios”</b>.
              </li>
              <li>
                En texto: escribes/formatéas tu contenido. En flashcards: creas un grupo y luego agregas
                tarjetas dentro de ese grupo.
              </li>
            </ol>
          </div>
        </div>

        <div>
          <p className="font-medium text-foreground">Estudiar un proyecto</p>
          <ol className="mt-1 list-decimal pl-5 space-y-1">
            <li>Lees y mejoras tus apuntes en bloques de texto (para comprender).</li>
            <li>Conviertes ideas importantes en tarjetas (para practicar sin mirar).</li>
            <li>Vas a <b>Agenda</b> para ver qué tarjetas tocan hoy.</li>
            <li>En <b>Práctica</b> respondes tarjetas y el sistema guarda tu progreso.</li>
          </ol>
        </div>

        <div>
          <p className="font-medium text-foreground">Comunidad</p>
          <p className="mt-1">
            Puedes publicar un proyecto para que otras personas lo exploren. Dependiendo de la visibilidad,
            otros usuarios pueden ver el contenido y, si el sistema lo permite, guardar una copia para adaptarla a su estudio.
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Miembros y roles (permisos)</p>
          <p className="mt-1">
            Si un proyecto es <b>público</b>, el dueño puede invitar o asignar roles a miembros externos.
            Los roles definen qué puede hacer cada persona dentro del proyecto:
          </p>

          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Invitado</p>
              <p className="mt-1 text-sm text-muted-foreground">Puede <b>ver</b> el proyecto, pero <b>no</b> puede editar contenido.</p>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Editor</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Puede <b>editar</b> el contenido del proyecto (bloques de texto, grupos y tarjetas), según lo permitido por el proyecto.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-3">
              <p className="text-sm font-medium">Dueño</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tiene <b>control total</b>: puede administrar miembros/roles, cambiar visibilidad, y gestionar el proyecto completo.
              </p>
            </div>
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            Importante: el rol de <b>dueño</b> se puede <b>transferir</b> a otro miembro del proyecto si se necesita.
          </p>
        </div>

        <div>
          <p className="font-medium text-foreground">Acciones comunes</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li><b>Ver</b>: modo lectura para estudiar sin distracciones.</li>
            <li><b>Editar</b>: modificar bloques de texto y tarjetas (según tu rol).</li>
            <li><b>Miembros</b>: ver y administrar permisos (principalmente el dueño).</li>
            <li><b>Eliminar</b>: borrar el proyecto de forma permanente (normalmente solo el dueño).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function HelpRules() {
  return (
    <div className="rounded-2xl border bg-muted/15 p-4">
      <p className="text-sm font-semibold">Reglas y límites</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Para mantener Comunidad útil y segura, evita información sensible, contenido ilegal, material con copyright sin permiso y acoso.
      </p>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Contenido no permitido</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Información personal sensible (tuya o de terceros).</li>
            <li>Instrucciones para actividades peligrosas o ilegales.</li>
            <li>Libros/PDFs privados completos sin permiso.</li>
            <li>Acoso, amenazas o violencia explícita.</li>
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-3">
          <p className="text-sm font-semibold">Buenas prácticas</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Tarjetas atómicas: una idea por tarjeta.</li>
            <li>Define títulos claros por bloque/grupo.</li>
            <li>Evita spam o contenido sin valor educativo.</li>
            <li>Si algo es dudoso, mejor no publicarlo.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- UI helpers ---------- */

function Empty(props: { title: string; desc: string; actions?: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-muted/5 p-4">
      <p className="text-sm font-semibold">{props.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{props.desc}</p>
      {props.actions ? <div className="mt-3">{props.actions}</div> : null}
    </div>
  );
}

function roleLabel(role: "owner" | "editor" | "guest") {
  if (role === "owner") return "Dueño";
  if (role === "editor") return "Editor";
  return "Invitado";
}
