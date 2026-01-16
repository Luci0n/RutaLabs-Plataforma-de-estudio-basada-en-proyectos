// app/protected/projects/[projectId]/project-view.tsx
"use client";

import { useEffect, useMemo, useState} from "react";

import type {
  FlashcardGroupRow,
  FlashcardRow,
  ProjectBlockRow,
  ProjectVisibility,
  ProjectRole,
} from "@/lib/types/study";
import { PracticeLauncherClient } from "./practice-launcher-client";
import { leaveProjectAction } from "./actions";

import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/Markdown/MarkdownRenderer";
import { ReportButton } from "@/components/reports/ReportButton";

type BlockType = "text" | "flashcards";
type ViewMode = "full" | "preview";

/* ----------------------------- Modal local ----------------------------- */

function SimpleModal(props: {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { open, title, description, onClose, children } = props;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6">
        <div className="w-full max-w-3xl rounded-xl border bg-background shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0">
              {title ? (
                <h3 className="text-base font-semibold leading-6">{title}</h3>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>

            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>

          <div className="max-h-[75dvh] overflow-auto p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Markdown / helpers -------------------------- */

function getTextMd(block: ProjectBlockRow): string {
  const d = block.data;
  if (typeof d === "object" && d !== null && !Array.isArray(d)) {
    const rec = d as Record<string, unknown>;
    if (typeof rec.md === "string") return rec.md;
  }
  return "";
}

/**
 * FULL: permite “Mostrar reverso”
 * PREVIEW: muestra frente + reverso siempre (solo lectura)
 */
function FlashcardGrid(props: {
  groupCards: FlashcardRow[];
  mode: ViewMode;
  shownBack: Record<string, boolean>;
  onToggleBack: (cardId: string) => void;
}) {
  const { groupCards, mode, shownBack, onToggleBack } = props;
  const preview = mode === "preview";

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {groupCards.map((c) => {
        const backVisible = preview ? true : !!shownBack[c.id];

        return (
          <div key={c.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">Frente</p>

              {!preview ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onToggleBack(c.id)}
                >
                  {backVisible ? "Ocultar reverso" : "Mostrar reverso"}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Vista previa
                </span>
              )}
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              <MarkdownRenderer md={c.front} className="prose-sm" />
            </div>

            {backVisible ? (
              <>
                <p className="mt-3 text-xs font-medium">Reverso</p>
                <div className="mt-1 text-xs text-muted-foreground">
                  <MarkdownRenderer md={c.back} className="prose-sm" />
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-md border bg-muted/20 p-2">
                <p className="text-xs text-muted-foreground">
                  Reverso oculto. Presiona{" "}
                  <span className="font-medium">“Mostrar reverso”</span>.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Componente ------------------------------ */

export function ProjectView(props: {
  projectId: string;
  title: string;
  description_md: string | null;
  visibility: ProjectVisibility;
  published_at: string | null;
  updated_at: string;

  // moderación (para banner)
  is_hidden?: boolean;
  moderation_note?: string | null;
  moderated_at?: string | null;
  showModerationBanner?: boolean;

  blocks: ProjectBlockRow[];
  groups: FlashcardGroupRow[];
  cards: FlashcardRow[];

  mode?: ViewMode;
  currentUserRole?: ProjectRole | null;
}) {

  const mode: ViewMode = props.mode ?? "full";
  const preview = mode === "preview";

  const [shownBack, setShownBack] = useState<Record<string, boolean>>({});
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const blocksSorted = useMemo(
    () => props.blocks.slice().sort((a, b) => a.order_index - b.order_index),
    [props.blocks]
  );

  const groupsByBlock = useMemo(() => {
    const m = new Map<string, FlashcardGroupRow[]>();
    for (const g of props.groups) {
      const arr = m.get(g.block_id) ?? [];
      arr.push(g);
      m.set(g.block_id, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.order_index - b.order_index);
    return m;
  }, [props.groups]);

  const cardsByGroup = useMemo(() => {
    const m = new Map<string, FlashcardRow[]>();
    for (const c of props.cards) {
      if (!c.group_id) continue;
      const arr = m.get(c.group_id) ?? [];
      arr.push(c);
      m.set(c.group_id, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.order_index - b.order_index);
    return m;
  }, [props.cards]);

  const hasAnyContent = useMemo(() => {
    return (
      (props.description_md?.trim()?.length ?? 0) > 0 ||
      blocksSorted.some((b) => {
        const t = b.type as BlockType;
        if (t === "text") return getTextMd(b).trim().length > 0;
        const gs = groupsByBlock.get(b.id) ?? [];
        return gs.some((g) => (cardsByGroup.get(g.id)?.length ?? 0) > 0);
      })
    );
  }, [blocksSorted, cardsByGroup, groupsByBlock, props.description_md]);

  const canLeave =
    !preview &&
    (props.currentUserRole === "editor" || props.currentUserRole === "guest");

  function toggleBack(cardId: string) {
    if (preview) return;
    setShownBack((cur) => ({ ...cur, [cardId]: !cur[cardId] }));
  }

  function setGroupBackVisible(groupCardIds: string[], visible: boolean) {
    if (preview) return;
    if (groupCardIds.length === 0) return;
    setShownBack((cur) => {
      const next: Record<string, boolean> = { ...cur };
      for (const id of groupCardIds) next[id] = visible;
      return next;
    });
  }

  const SCROLL_THRESHOLD = 8;
  const GROUP_MAX_HEIGHT_CLASS = "max-h-[26rem]";

  const openGroup = useMemo(() => {
    if (!openGroupId) return null;
    const g = props.groups.find((x) => x.id === openGroupId) ?? null;
    if (!g) return null;
    const groupCards = cardsByGroup.get(g.id) ?? [];
    const groupCardIds = groupCards.map((c) => c.id);
    return { g, groupCards, groupCardIds };
  }, [openGroupId, props.groups, cardsByGroup]);
  
  const showBanner =
  !!props.is_hidden && !!props.showModerationBanner;
  return (
    <div className="space-y-10">
      {showBanner ? (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Proyecto oculto por moderación</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Este proyecto no es visible en Comunidad. Puedes seguir accediendo desde tu biblioteca.
            </p>

            {props.moderation_note?.trim() ? (
              <div className="mt-3 rounded-md border bg-background/60 p-3">
                <p className="text-xs font-medium">Mensaje del administrador</p>
                <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                  {props.moderation_note}
                </p>
              </div>
            ) : null}

            {props.moderated_at ? (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Moderado el {props.moderated_at}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    ) : null}
      {/* Header + acciones */}
      <header className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      

          <div className="shrink-0 flex flex-wrap items-center gap-2 justify-end">
            {/* Reportar siempre visible */}
            <ReportButton projectId={props.projectId} projectTitle={props.title} />

            {canLeave ? (
              <form
                action={leaveProjectAction}
                onSubmit={(e) => {
                  const ok = window.confirm(
                    "¿Retirarte del proyecto? Perderás acceso en tu biblioteca."
                  );
                  if (!ok) e.preventDefault();
                }}
              >
                <input type="hidden" name="project_id" value={props.projectId} />
                <Button type="submit" variant="destructive">
                  Retirarme
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      {/* Modal "Ver todas" (en preview también sirve solo para ver) */}
      <SimpleModal
        open={!!openGroup}
        title={openGroup?.g.title ?? ""}
        description={
          openGroup ? `${openGroup.groupCards.length} cartas en este grupo.` : ""
        }
        onClose={() => setOpenGroupId(null)}
      >
        {openGroup ? (
          <div className="space-y-3">
            {!preview ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setGroupBackVisible(openGroup.groupCardIds, true)}
                >
                  Mostrar todos
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setGroupBackVisible(openGroup.groupCardIds, false)}
                >
                  Ocultar todos
                </Button>

                <PracticeLauncherClient
                  projectId={props.projectId}
                  groupId={openGroup.g.id}
                  groupTitle={openGroup.g.title}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Vista previa: para practicar, importa el proyecto.
              </p>
            )}

            <FlashcardGrid
              groupCards={openGroup.groupCards}
              mode={mode}
              shownBack={shownBack}
              onToggleBack={toggleBack}
            />
          </div>
        ) : null}
      </SimpleModal>

      {/* Descripción */}
      {props.description_md?.trim() ? (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Descripción</h2>
          <MarkdownRenderer md={props.description_md ?? ""} />
        </section>
      ) : null}

      {/* Contenido */}
      <main className="space-y-8">
        {blocksSorted.map((b) => {
          const type = b.type as BlockType;

          if (type === "text") {
            const md = getTextMd(b).trim();
            if (!md) return null;

            return (
              <article key={b.id}>
                <MarkdownRenderer md={md} />
              </article>
            );
          }

          const blockGroups = groupsByBlock.get(b.id) ?? [];
          const groupsWithCards = blockGroups.filter(
            (g) => (cardsByGroup.get(g.id)?.length ?? 0) > 0
          );
          if (groupsWithCards.length === 0) return null;

          const totalCards = groupsWithCards.reduce(
            (acc, g) => acc + (cardsByGroup.get(g.id)?.length ?? 0),
            0
          );

          return (
            <section key={b.id} className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-base font-semibold">Flashcards</h2>
                <div className="text-xs text-muted-foreground">
                  {totalCards} cartas
                </div>
              </div>

              <div className="space-y-6">
                {groupsWithCards.map((g) => {
                  const groupCards = cardsByGroup.get(g.id) ?? [];
                  const groupCardIds = groupCards.map((c) => c.id);

                  const anyShown = groupCardIds.some((id) => !!shownBack[id]);
                  const allShown =
                    groupCardIds.length > 0 &&
                    groupCardIds.every((id) => !!shownBack[id]);

                  const showOverflowUI = groupCards.length > SCROLL_THRESHOLD;

                  return (
                    <div key={g.id} className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold">{g.title}</h3>
                          <span className="text-xs text-muted-foreground">
                            {groupCards.length} cartas
                          </span>
                        </div>

                        {!preview ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={groupCards.length === 0}
                              onClick={() =>
                                setGroupBackVisible(groupCardIds, true)
                              }
                            >
                              Mostrar todos
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={groupCards.length === 0}
                              onClick={() =>
                                setGroupBackVisible(groupCardIds, false)
                              }
                            >
                              Ocultar todos
                            </Button>

                            <PracticeLauncherClient
                              projectId={props.projectId}
                              groupId={g.id}
                              groupTitle={g.title}
                            />

                            {showOverflowUI ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setOpenGroupId(g.id)}
                              >
                                Ver todas
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            Vista previa: sin práctica.
                          </div>
                        )}
                      </div>

                      {!preview ? (
                        <div className="text-xs text-muted-foreground">
                          {allShown
                            ? "Reversos visibles."
                            : anyShown
                              ? "Algunos reversos visibles."
                              : "Reversos ocultos."}
                        </div>
                      ) : null}

                      <div className="relative">
                        <div
                          className={[
                            "rounded-lg border p-2",
                            showOverflowUI ? GROUP_MAX_HEIGHT_CLASS : "",
                            showOverflowUI ? "overflow-auto pr-2" : "",
                          ].join(" ")}
                        >
                          <FlashcardGrid
                            groupCards={groupCards}
                            mode={mode}
                            shownBack={shownBack}
                            onToggleBack={toggleBack}
                          />
                        </div>

                        {showOverflowUI ? (
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
                        ) : null}
                      </div>

                      {showOverflowUI ? (
                        <p className="text-xs text-muted-foreground">
                          Desliza dentro del bloque para ver más cartas.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {!hasAnyContent ? (
          <section className="rounded-lg border p-4">
            <p className="text-sm font-medium">Sin contenido</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Este proyecto aún no tiene contenido publicado.
            </p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
