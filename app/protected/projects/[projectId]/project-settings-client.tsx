// app/protected/projects/[projectId]/project-settings-client.tsx
"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRole, ProjectVisibility } from "@/lib/types/study";
import { updateProjectMetaAction, setProjectVisibilityAction, deleteProjectAction } from "./actions";

function roleLabel(role: ProjectRole): string {
  if (role === "owner") return "Dueño";
  if (role === "guest") return "Invitado";
  return "Editor";
}

function visLabel(v: ProjectVisibility): string {
  if (v === "public") return "Público";
  if (v === "unlisted") return "No listado";
  return "Privado";
}

export function ProjectSettingsClient(props: {
  projectId: string;
  role: ProjectRole;
  visibility: ProjectVisibility;
  title: string;
  description_md: string | null;
  canEdit: boolean; // owner || editor
}) {
  const header = useMemo(() => {
    return `${roleLabel(props.role)} · ${visLabel(props.visibility)}`;
  }, [props.role, props.visibility]);

  const isOwner = props.role === "owner";
  const canEditSettings = props.canEdit; // dueño o editor
  const canDeleteProject = isOwner; // SOLO DUEÑO

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes del proyecto</CardTitle>
        <CardDescription>{header}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form action={updateProjectMetaAction} className="space-y-3">
          <input type="hidden" name="project_id" value={props.projectId} />

          <div className="space-y-1">
            <label className="text-sm">Título</label>
            <Input name="title" defaultValue={props.title} required disabled={!canEditSettings} />
          </div>

          <div className="space-y-1">
            <label className="text-sm">Descripción</label>
            <textarea
              name="description_md"
              defaultValue={props.description_md ?? ""}
              disabled={!canEditSettings}
              className="min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Objetivo, recursos, temas..."
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {canEditSettings
                ? "Los cambios se guardan en el proyecto."
                : "No tienes permisos para modificar este proyecto."}
            </p>

            <Button type="submit" disabled={!canEditSettings}>
              Guardar
            </Button>
          </div>
        </form>

        <div className="rounded-lg border p-4">
          <div className="mb-3">
            <p className="text-sm font-medium">Visibilidad</p>
            <p className="text-xs text-muted-foreground">
              Público aparece en Comunidad. No listado solo con link. Privado solo miembros.
            </p>
          </div>

          <form action={setProjectVisibilityAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="project_id" value={props.projectId} />

            <select
              name="visibility"
              defaultValue={props.visibility}
              disabled={!canEditSettings}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="private">Privado</option>
              <option value="unlisted">No listado</option>
              <option value="public">Público</option>
            </select>

            <Button type="submit" variant="secondary" disabled={!canEditSettings}>
              Aplicar
            </Button>
          </form>
        </div>

        {/* ZONA PELIGROSA: solo dueño, ni siquiera mostrar al editor */}
        {canDeleteProject ? (
          <div className="rounded-lg border border-destructive/30 p-4">
            <p className="text-sm font-medium">Zona peligrosa</p>
            <p className="text-xs text-muted-foreground">
              Eliminar borra proyecto, bloques, grupos, cartas y miembros.
            </p>

            <form
              action={deleteProjectAction}
              className="mt-3"
              onSubmit={(e) => {
                const ok = window.confirm(
                  "¿Eliminar este proyecto definitivamente? Esta acción no se puede deshacer."
                );
                if (!ok) e.preventDefault();
              }}
            >
              <input type="hidden" name="project_id" value={props.projectId} />
              <Button type="submit" variant="destructive">
                Eliminar proyecto
              </Button>
            </form>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
