// app/protected/admin/reports-client.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  adminDeleteProjectAction,
  adminSetProjectHiddenAction,
  adminSetReportStatusAction,
} from "./admin-actions";

import { formatDateTimeCL } from "@/lib/datetime";

type ProfileMin = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
};

type ProjectMin = {
  id: string;
  title: string;
  owner_user_id: string;
  is_hidden: boolean;
  visibility: string | null;

  // opcional (si lo agregaste en page.tsx)
  moderation_note?: string | null;
  moderated_at?: string | null;
};

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

type Row = {
  report: ReportRow;
  project: ProjectMin | null;
  reporter: ProfileMin | null;
  owner: ProfileMin | null;
};

type StatusFilter = "all" | ReportRow["status"];
type SortMode = "newest" | "oldest";

function statusLabel(s: ReportRow["status"]): string {
  if (s === "open") return "Abierto";
  if (s === "resolved") return "Resuelto";
  return "Descartado";
}

function statusPillClass(s: ReportRow["status"]): string {
  if (s === "open") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  if (s === "resolved") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

function projectStatePillClass(hidden: boolean): string {
  return hidden
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-border bg-muted/30 text-muted-foreground";
}

function displayUser(p: ProfileMin | null): string {
  const u = (p?.username ?? "").trim();
  if (u) return u;
  const e = (p?.email ?? "").trim();
  if (e) return e;
  return "—";
}

export default function AdminReportsClient(props: { rows: Row[] }) {
  // estado local (para evitar reload y mejorar UX)
  const [items, setItems] = useState<Row[]>(props.rows);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Dialog
  const [openId, setOpenId] = useState<string | null>(null);
  const openRow = useMemo(() => items.find((x) => x.report.id === openId) ?? null, [items, openId]);

  const [noteModeration, setNoteModeration] = useState("");
  const [noteReport, setNoteReport] = useState("");

  const stats = useMemo(() => {
    let open = 0, resolved = 0, dismissed = 0;
    for (const x of items) {
      if (x.report.status === "open") open++;
      else if (x.report.status === "resolved") resolved++;
      else dismissed++;
    }
    return { total: items.length, open, resolved, dismissed };
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    let base = items;

    if (statusFilter !== "all") {
      base = base.filter((x) => x.report.status === statusFilter);
    }

    if (needle) {
      base = base.filter((x) => {
        const parts = [
          x.report.description,
          x.report.status,
          x.project?.title ?? "",
          x.project?.visibility ?? "",
          x.reporter?.username ?? "",
          x.reporter?.email ?? "",
          x.owner?.username ?? "",
          x.owner?.email ?? "",
          x.report.admin_note ?? "",
          x.project?.moderation_note ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return parts.includes(needle);
      });
    }

    base = base.slice().sort((a, b) => {
      const da = new Date(a.report.created_at).getTime();
      const db = new Date(b.report.created_at).getTime();
      return sortMode === "newest" ? db - da : da - db;
    });

    return base;
  }, [items, q, statusFilter, sortMode]);

  function openDetails(reportId: string) {
    const row = items.find((x) => x.report.id === reportId) ?? null;
    setErr(null);
    setOpenId(reportId);

    // precargar notas (mejor UX que prompt)
    setNoteReport(row?.report.admin_note ?? "");
    setNoteModeration(row?.project?.moderation_note ?? "");
  }

  async function setProjectHidden(projectId: string, hidden: boolean, note: string | null) {
    setErr(null);
    setBusy(`hide:${projectId}`);

    const res = await adminSetProjectHiddenAction({
      project_id: projectId,
      hidden,
      moderation_note: note ?? null,
    });

    setBusy(null);
    if (!res.ok) return setErr(res.error);

    // update local
    setItems((cur) =>
      cur.map((x) => {
        if (x.project?.id !== projectId) return x;
        return {
          ...x,
          project: x.project
            ? {
                ...x.project,
                is_hidden: hidden,
                moderation_note: note ?? null,
                moderated_at: new Date().toISOString(),
              }
            : x.project,
        };
      })
    );
  }

  async function setReportStatus(reportId: string, status: ReportRow["status"], adminNote: string | null) {
    setErr(null);
    setBusy(`status:${reportId}`);

    const res = await adminSetReportStatusAction({
      report_id: reportId,
      status,
      admin_note: adminNote ?? null,
    });

    setBusy(null);
    if (!res.ok) return setErr(res.error);

    setItems((cur) =>
      cur.map((x) => {
        if (x.report.id !== reportId) return x;
        return {
          ...x,
          report: {
            ...x.report,
            status,
            admin_note: adminNote ?? null,
            updated_at: new Date().toISOString(),
          },
        };
      })
    );
  }

  async function deleteProject(projectId: string) {
    const ok = confirm("¿Eliminar este proyecto? Esto es permanente.");
    if (!ok) return;

    setErr(null);
    setBusy(`del:${projectId}`);

    const res = await adminDeleteProjectAction({ project_id: projectId });

    setBusy(null);
    if (!res.ok) return setErr(res.error);

    // marcamos proyecto como null en rows asociados
    setItems((cur) =>
      cur.map((x) => {
        if (x.project?.id !== projectId) return x;
        return { ...x, project: null, owner: null };
      })
    );

    // si estabas viendo el detalle de ese proyecto, cerramos el modal
    if (openRow?.project?.id === projectId) setOpenId(null);
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por proyecto, descripción, usuario, estado..."
              className="w-full md:w-[420px]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={statusFilter === "all" ? "default" : "secondary"}
                onClick={() => setStatusFilter("all")}
              >
                Todos ({stats.total})
              </Button>
              <Button
                type="button"
                variant={statusFilter === "open" ? "default" : "secondary"}
                onClick={() => setStatusFilter("open")}
              >
                Abiertos ({stats.open})
              </Button>
              <Button
                type="button"
                variant={statusFilter === "resolved" ? "default" : "secondary"}
                onClick={() => setStatusFilter("resolved")}
              >
                Resueltos ({stats.resolved})
              </Button>
              <Button
                type="button"
                variant={statusFilter === "dismissed" ? "default" : "secondary"}
                onClick={() => setStatusFilter("dismissed")}
              >
                Descartados ({stats.dismissed})
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSortMode((s) => (s === "newest" ? "oldest" : "newest"))}
              title="Cambiar orden"
            >
              Orden: {sortMode === "newest" ? "Más nuevos" : "Más antiguos"}
            </Button>
          </div>
        </div>

        {err ? <p className="text-sm text-destructive">{err}</p> : null}

        {/* Lista compacta */}
        <div className="space-y-2">
          {filtered.map((x) => {
            const r = x.report;
            const p = x.project;

            const projUrl = p ? `/protected/projects/${encodeURIComponent(p.id)}?tab=view` : null;

            return (
              <Card key={r.id} className="overflow-hidden">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    {/* Left */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            statusPillClass(r.status),
                          ].join(" ")}
                        >
                          {statusLabel(r.status)}
                        </span>

                        {p ? (
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                              projectStatePillClass(p.is_hidden),
                            ].join(" ")}
                          >
                            {p.is_hidden ? "Proyecto oculto" : "Proyecto visible"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            Proyecto no encontrado
                          </span>
                        )}

                        <span className="text-xs text-muted-foreground">
                          {formatDateTimeCL(r.created_at)}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {p?.title ?? `Proyecto: ${r.project_id}`}
                        </p>

                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground whitespace-pre-wrap">
                          {r.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Reportó: <span className="font-medium text-foreground/80">{displayUser(x.reporter)}</span>
                        </span>
                        <span>
                          Dueño: <span className="font-medium text-foreground/80">{displayUser(x.owner)}</span>
                        </span>
                        {p?.visibility ? (
                          <span>
                            Visibilidad: <span className="font-medium text-foreground/80">{p.visibility}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: acciones rápidas + abrir */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                      {projUrl ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild size="sm" variant="secondary">
                              <Link href={projUrl}>Abrir proyecto</Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir el proyecto en una pestaña aparte</TooltipContent>
                        </Tooltip>
                      ) : null}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" size="sm" onClick={() => openDetails(r.id)}>
                            Ver detalles
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Revisar información completa y acciones de moderación</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filtered.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sin resultados</CardTitle>
                <CardDescription>No hay reportes que coincidan con la búsqueda/filtros.</CardDescription>
              </CardHeader>
            </Card>
          ) : null}
        </div>

        {/* Dialog detalle */}
        <Dialog open={!!openRow} onOpenChange={(v) => (v ? null : setOpenId(null))}>
          <DialogContent className="max-w-3xl">
            {openRow ? (
              <>
                <DialogHeader>
                  <DialogTitle>Detalle del reporte</DialogTitle>
                  <DialogDescription className="text-xs">
                    {formatDateTimeCL(openRow.report.created_at)} · ID: {openRow.report.id}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* Summary */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        statusPillClass(openRow.report.status),
                      ].join(" ")}
                    >
                      {statusLabel(openRow.report.status)}
                    </span>

                    {openRow.project ? (
                      <span
                        className={[
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          projectStatePillClass(openRow.project.is_hidden),
                        ].join(" ")}
                      >
                        {openRow.project.is_hidden ? "Proyecto oculto" : "Proyecto visible"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Proyecto no encontrado
                      </span>
                    )}
                  </div>

                  {/* Descripción */}
                  <div className="rounded-xl border p-3">
                    <p className="text-sm font-medium">Descripción del reporte</p>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {openRow.report.description}
                    </p>
                  </div>

                  {/* Personas */}
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <p className="text-sm font-medium">Usuario que reportó</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {displayUser(openRow.reporter)}
                        {openRow.reporter?.email ? ` (${openRow.reporter.email})` : ""}
                      </p>
                    </div>

                    <div className="rounded-xl border p-3">
                      <p className="text-sm font-medium">Creador del proyecto</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {displayUser(openRow.owner)}
                        {openRow.owner?.email ? ` (${openRow.owner.email})` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Proyecto */}
                  <div className="rounded-xl border p-3">
                    <p className="text-sm font-medium">Proyecto reportado</p>
                    {openRow.project ? (
                      <div className="mt-1 space-y-1">
                        <p className="text-sm">{openRow.project.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Estado: {openRow.project.is_hidden ? "OCULTO" : "VISIBLE"} · Visibilidad:{" "}
                          {openRow.project.visibility ?? "—"}
                        </p>

                        {(openRow.project.moderation_note ?? "").trim() ? (
                          <div className="mt-2 rounded-md border bg-muted/20 p-2">
                            <p className="text-xs font-medium">Nota de moderación actual</p>
                            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                              {openRow.project.moderation_note}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Proyecto no encontrado (quizás eliminado).
                      </p>
                    )}
                  </div>

                  {/* Notas (sin prompts) */}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border p-3 space-y-2">
                      <p className="text-sm font-medium">Nota para el dueño (moderación)</p>
                      <p className="text-xs text-muted-foreground">
                        Se muestra al dueño cuando el proyecto está moderado/oculto.
                      </p>
                      <textarea
                        value={noteModeration}
                        onChange={(e) => setNoteModeration(e.target.value)}
                        placeholder="Ej: Contenido sensible. Por favor ajusta X y vuelve a publicar."
                        rows={5}
                      />
                    </div>

                    <div className="rounded-xl border p-3 space-y-2">
                      <p className="text-sm font-medium">Nota interna del reporte</p>
                      <p className="text-xs text-muted-foreground">
                        Queda asociada al reporte (para seguimiento del equipo).
                      </p>
                      <textarea
                        value={noteReport}
                        onChange={(e) => setNoteReport(e.target.value)}
                        placeholder="Ej: Revisado, corresponde a spam / o requiere cambios."
                        rows={5}
                      />
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="rounded-xl border p-3 space-y-2">
                    <p className="text-sm font-medium">Acciones</p>

                    <div className="flex flex-wrap gap-2">
                      {/* Ocultar/Revelar: contextuales */}
                      {openRow.project ? (
                        openRow.project.is_hidden ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy === `hide:${openRow.project.id}`}
                                onClick={() =>
                                  void setProjectHidden(openRow.project!.id, false, (noteModeration ?? "").trim() || null)
                                }
                              >
                                Revelar proyecto
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Hace visible el proyecto nuevamente (sale de moderación)</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={busy === `hide:${openRow.project.id}`}
                                onClick={() =>
                                  void setProjectHidden(openRow.project!.id, true, (noteModeration ?? "").trim() || null)
                                }
                              >
                                Ocultar proyecto
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Oculta el proyecto (moderación). El dueño verá tu nota.</TooltipContent>
                          </Tooltip>
                        )
                      ) : null}

                      {/* Estado del reporte: contextuales */}
                      {openRow.report.status === "open" ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy === `status:${openRow.report.id}`}
                                onClick={() =>
                                  void setReportStatus(openRow.report.id, "resolved", (noteReport ?? "").trim() || null)
                                }
                              >
                                Marcar resuelto
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Cierra el reporte como atendido/resuelto</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                disabled={busy === `status:${openRow.report.id}`}
                                onClick={() =>
                                  void setReportStatus(openRow.report.id, "dismissed", (noteReport ?? "").trim() || null)
                                }
                              >
                                Descartar
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Marca el reporte como no procedente (ej: falso positivo)</TooltipContent>
                          </Tooltip>
                        </>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={busy === `status:${openRow.report.id}`}
                              onClick={() =>
                                void setReportStatus(openRow.report.id, "open", (noteReport ?? "").trim() || null)
                              }
                            >
                              Reabrir
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Devuelve el reporte a estado abierto para continuar revisión</TooltipContent>
                        </Tooltip>
                      )}

                      {/* Eliminar: siempre peligroso */}
                      {openRow.project ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={busy === `del:${openRow.project.id}`}
                              onClick={() => void deleteProject(openRow.project!.id)}
                            >
                              Eliminar proyecto
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Elimina el proyecto permanentemente (acción irreversible)</TooltipContent>
                        </Tooltip>
                      ) : null}

                      {/* Ir al proyecto */}
                      {openRow.project ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="secondary">
                              <Link href={`/protected/projects/${encodeURIComponent(openRow.project.id)}?tab=view`}>
                                Abrir proyecto
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Abrir el proyecto para inspección directa</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>

                    {openRow.report.admin_note ? (
                      <div className="text-xs text-muted-foreground">
                        Nota admin (reporte):{" "}
                        <span className="font-medium text-foreground/80">
                          {openRow.report.admin_note}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={() => setOpenId(null)}>
                      Cerrar
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
