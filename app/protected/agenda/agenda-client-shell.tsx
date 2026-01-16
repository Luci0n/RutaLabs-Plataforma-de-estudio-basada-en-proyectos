// app/protected/agenda/agenda-client-shell.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PracticeOverlay } from "@/components/practice/PracticeOverlay";
import { StudyAgendaClient } from "@/components/agenda/StudyAgendaClient";

type ProjectPick = { id: string; title: string };

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
  day: string;
  due_learning: number;
  due_review: number;
};

export function AgendaClientShell(props: {
  projects: ProjectPick[];
  selectedProjectId: string;
  groups: AgendaGroupRow[];
  week: AgendaDayRow[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [practiceOpen, setPracticeOpen] = useState(false);
  const [practiceGroupId, setPracticeGroupId] = useState<string | null>(null);
  const [practiceGroupTitle, setPracticeGroupTitle] = useState<string | undefined>(undefined);

  const selectedTitle = useMemo(() => {
    return props.projects.find((p) => p.id === props.selectedProjectId)?.title ?? "Proyecto";
  }, [props.projects, props.selectedProjectId]);

  function setProject(projectId: string) {
    const next = new URLSearchParams(sp?.toString() ?? "");
    next.set("project", projectId);
    router.push(`/protected/agenda?${next.toString()}`);
    router.refresh();
  }

  function openPractice(groupId: string, title?: string) {
    setPracticeGroupId(groupId);
    setPracticeGroupTitle(title);
    setPracticeOpen(true);
  }

  function closePractice() {
    setPracticeOpen(false);
    setPracticeGroupId(null);
    setPracticeGroupTitle(undefined);
  }

  return (
    <div className="space-y-3">
      {practiceGroupId ? (
        <PracticeOverlay
          open={practiceOpen}
          onClose={closePractice}
          projectId={props.selectedProjectId}
          groupId={practiceGroupId}
          groupTitle={practiceGroupTitle}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{selectedTitle}</p>
          <p className="text-xs text-muted-foreground">
            Elige un proyecto para ver sus vencimientos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 max-w-[18rem] rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            value={props.selectedProjectId}
            onChange={(e) => setProject(e.target.value)}
          >
            {props.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            Actualizar
          </Button>
        </div>
      </div>

      <StudyAgendaClient
        projectId={props.selectedProjectId}
        groups={props.groups}
        week={props.week}
        onPracticeGroup={openPractice}
      />
    </div>
  );
}
