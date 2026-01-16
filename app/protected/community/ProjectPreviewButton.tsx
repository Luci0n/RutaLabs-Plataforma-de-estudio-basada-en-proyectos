// app/protected/community/ProjectPreviewButton.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProjectPreviewAction } from "@/app/protected/community/preview-actions";
import { importProjectAction } from "@/app/protected/community/actions";
import { ProjectView } from "@/app/protected/projects/[projectId]/project-view";
import type { PreviewPayload } from "@/app/protected/community/preview-actions";

export function ProjectPreviewButton(props: {
  projectId: string;
  title: string;
  isOwner: boolean;
  alreadyImported: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payload, setPayload] = useState<PreviewPayload | null>(null);

  async function openPreview() {
    setErr(null);
    setOpen(true);

    // lazy load
    if (payload) return;

    setBusy(true);
    const res = await getProjectPreviewAction(props.projectId);
    setBusy(false);

    if (!res.ok) {
      setErr(res.error);
      return;
    }

    setPayload(res.data);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={openPreview}>
        Vista previa
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />

          <div className="fixed inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <Card className="w-full max-w-4xl rounded-2xl border bg-card shadow-lg overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Vista previa</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {props.title}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Acciones contextuales */}
                  {props.isOwner || props.alreadyImported ? (
                    <Button asChild variant="secondary">
                      <Link href={`/protected/projects/${props.projectId}`}>Abrir</Link>
                    </Button>
                  ) : (
                    <form action={importProjectAction}>
                      <input type="hidden" name="project_id" value={props.projectId} />
                      <Button type="submit">Importar</Button>
                    </form>
                  )}

                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cerrar
                  </Button>
                </div>
              </div>

              <div className="max-h-[80dvh] overflow-auto p-4">
                {busy ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : err ? (
                  <p className="text-sm text-destructive">{err}</p>
                ) : payload ? (
                  <ProjectView
                    mode="preview"
                    projectId={String(payload.project.id)}
                    title={payload.project.title}
                    description_md={payload.project.description_md}
                    visibility={payload.project.visibility}
                    published_at={payload.project.published_at}
                    updated_at={payload.project.updated_at}
                    blocks={payload.blocks}
                    groups={payload.groups}
                    cards={payload.cards}
                  />
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}