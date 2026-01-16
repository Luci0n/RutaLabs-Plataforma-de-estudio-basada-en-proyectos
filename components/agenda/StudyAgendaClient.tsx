"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getAgendaHistory,
  getAgendaRecentReviews,
  type AgendaHistoryDay,
  type AgendaRecentReviewRow,
} from "@/app/protected/agenda/agenda-actions";
import { formatDateTimeCL, formatDayLabelCL } from "@/lib/datetime";

type AgendaGroupRow = {
  group_id: string;
  group_title: string;
  total_cards: number;
  new_count: number;
  due_learning: number;
  due_review: number;
  next_due_at: string | null;
};

type AgendaDayRow = {
  day: string; // YYYY-MM-DD
  due_learning: number;
  due_review: number;
};

export type PracticeMode = "due" | "all";

type Props = {
  projectId: string;
  groups: AgendaGroupRow[];
  week: AgendaDayRow[];
  onPracticeGroup: (groupId: string, title?: string, mode?: PracticeMode) => void;
};

type TabKey = "hoy" | "semana" | "grupos" | "historial";

function tabVariant(cur: TabKey, v: TabKey): "default" | "secondary" {
  return cur === v ? "default" : "secondary";
}

function ratingLabel(r: string) {
  if (r === "again") return "Otra vez";
  if (r === "hard") return "Difícil";
  if (r === "good") return "Bien";
  if (r === "easy") return "Fácil";
  return r;
}

export function StudyAgendaClient({ projectId, groups, week, onPracticeGroup }: Props) {
  const [tab, setTab] = useState<TabKey>("hoy");

  // Historial (lazy)
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);
  const [histDays, setHistDays] = useState<AgendaHistoryDay[]>([]);
  const [recent, setRecent] = useState<AgendaRecentReviewRow[]>([]);

  const dueToday = useMemo(() => {
    const today = week[0];
    if (!today) return 0;
    return (today.due_learning ?? 0) + (today.due_review ?? 0);
  }, [week]);

  const dueByGroup = useMemo(() => {
    return [...groups].sort((a, b) => {
      const ad = (a.due_learning ?? 0) + (a.due_review ?? 0);
      const bd = (b.due_learning ?? 0) + (b.due_review ?? 0);
      if (bd !== ad) return bd - ad;
      return (b.new_count ?? 0) - (a.new_count ?? 0);
    });
  }, [groups]);

  async function loadHistory() {
    setHistLoading(true);
    setHistError(null);
    try {
      const [h, r] = await Promise.all([
        getAgendaHistory({ project_id: projectId, days: 30 }),
        getAgendaRecentReviews({ project_id: projectId, limit: 50 }),
      ]);

      if (!h.ok) throw new Error(h.error);
      if (!r.ok) throw new Error(r.error);

      setHistDays(h.data.days);
      setRecent(r.data.rows);
    } catch (e: unknown) {
      setHistError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    } finally {
      setHistLoading(false);
    }
  }

  function openTab(next: TabKey) {
    setTab(next);
    if (next === "historial" && histDays.length === 0 && !histLoading) {
      void loadHistory();
    }
  }

  function practiceForGroup(g: AgendaGroupRow) {
    const due = (g.due_learning ?? 0) + (g.due_review ?? 0);
    const hasWork = due > 0 || (g.new_count ?? 0) > 0;

    // Si hay vencidas o nuevas -> modo agenda (due)
    // Si no -> modo libre (all) para que nunca quede inaccesible
    const mode: PracticeMode = hasWork ? "due" : "all";
    onPracticeGroup(g.group_id, g.group_title, mode);
  }

  return (
    <div className="space-y-3">
      {/* 4 botones */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={tabVariant(tab, "hoy")} onClick={() => openTab("hoy")}>
          Hoy
        </Button>
        <Button type="button" variant={tabVariant(tab, "semana")} onClick={() => openTab("semana")}>
          Semana
        </Button>
        <Button type="button" variant={tabVariant(tab, "grupos")} onClick={() => openTab("grupos")}>
          Grupos
        </Button>
        <Button type="button" variant={tabVariant(tab, "historial")} onClick={() => openTab("historial")}>
          Historial
        </Button>
      </div>

      {/* HOY */}
      {tab === "hoy" ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Para hoy</p>
          <p className="text-xs text-muted-foreground">
            Tienes <span className="font-medium">{dueToday}</span> tarjetas vencidas para repasar.
          </p>

          <div className="space-y-2">
            {dueByGroup.slice(0, 8).map((g) => {
              const due = (g.due_learning ?? 0) + (g.due_review ?? 0);
              const hasWork = due > 0 || (g.new_count ?? 0) > 0;

              return (
                <div
                  key={g.group_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.group_title}</p>
                    <p className="text-xs text-muted-foreground">
                      Vencidas: {due} · Nuevas: {g.new_count ?? 0} · Total: {g.total_cards ?? 0}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant={hasWork ? "default" : "secondary"}
                    onClick={() => practiceForGroup(g)}
                    title={hasWork ? "Practicar vencidas/nuevas" : "Repaso extra (todas)"}
                  >
                    {hasWork ? "Practicar" : "Repasar"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* SEMANA */}
      {tab === "semana" ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Próximos 7 días</p>
          <div className="space-y-2">
            {week.map((d) => {
              const total = (d.due_learning ?? 0) + (d.due_review ?? 0);
              return (
                <div key={d.day} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="text-sm">{formatDayLabelCL(d.day)}</div>
                  <div className="text-xs text-muted-foreground">
                    Aprendizaje: {d.due_learning ?? 0} · Repaso: {d.due_review ?? 0} · Total:{" "}
                    <span className="font-medium">{total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* GRUPOS */}
      {tab === "grupos" ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Todos los grupos</p>

          <div className="space-y-2">
            {dueByGroup.map((g) => {
              const due = (g.due_learning ?? 0) + (g.due_review ?? 0);
              const hasWork = due > 0 || (g.new_count ?? 0) > 0;

              return (
                <div
                  key={g.group_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{g.group_title}</p>
                    <p className="text-xs text-muted-foreground">
                      Vencidas: {due} · Nuevas: {g.new_count ?? 0} · Total: {g.total_cards ?? 0}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant={hasWork ? "default" : "secondary"}
                    onClick={() => practiceForGroup(g)}
                    title={hasWork ? "Practicar vencidas/nuevas" : "Repaso extra (todas)"}
                  >
                    {hasWork ? "Practicar" : "Repasar"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* HISTORIAL */}
      {tab === "historial" ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Historial (últimos 30 días)</p>
            <Button type="button" variant="secondary" disabled={histLoading} onClick={loadHistory}>
              Recargar
            </Button>
          </div>

          {histError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {histError}
            </div>
          ) : null}

          {histLoading && histDays.length === 0 ? (
            <div className="h-40 animate-pulse rounded-lg border bg-muted/30" />
          ) : null}

          {histDays.length > 0 ? (
            <div className="space-y-2">
              {histDays.map((d) => (
                <div key={d.day} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="text-sm">{formatDayLabelCL(d.day)}</div>
                  <div className="text-xs text-muted-foreground">
                    Total: <span className="font-medium">{d.total}</span> · Otra vez: {d.again} · Difícil: {d.hard} · Bien:{" "}
                    {d.good} · Fácil: {d.easy}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="pt-2">
            <p className="text-sm font-medium">Actividad reciente</p>
            <div className="mt-2 space-y-2">
              {recent.length === 0 && !histLoading ? (
                <p className="text-xs text-muted-foreground">Aún no hay actividad registrada.</p>
              ) : null}

              {recent.slice(0, 12).map((r) => (
                <div
                  key={`${r.created_at}_${r.card_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDateTimeCL(r.created_at)}</p>
                    <p className="text-sm font-medium truncate">{r.group_title ?? "Sin grupo"}</p>
                  </div>
                  <div className="text-xs">
                    Respuesta: <span className="font-medium">{ratingLabel(r.rating)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
