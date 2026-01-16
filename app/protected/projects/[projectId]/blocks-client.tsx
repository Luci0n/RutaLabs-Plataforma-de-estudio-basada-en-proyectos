// app/protected/projects/[projectId]/blocks-client.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/Markdown/MarkdownEditor";
import type { FlashcardGroupRow, FlashcardRow, ProjectBlockRow } from "@/lib/types/study";
import type { ActionResult } from "./actions";
import {
  addBlockRpc,
  moveBlockRpc,
  deleteBlockRpc,
  updateTextBlockRpc,
  addGroupRpc,
  renameGroupRpc,
  deleteGroupRpc,
  addCardRpc,
  updateCardRpc,
  deleteCardRpc,
} from "./actions";

type BlockType = "text" | "flashcards";
type PendingMove = { blockId: string; direction: "up" | "down" };

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function tmpId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function getTextMd(block: ProjectBlockRow): string {
  const d = block.data;
  if (typeof d === "object" && d !== null && !Array.isArray(d)) {
    const rec = d as Record<string, unknown>;
    if (typeof rec.md === "string") return rec.md;
  }
  return "";
}

function normalizeBlockOrder(list: ProjectBlockRow[]): ProjectBlockRow[] {
  const sorted = [...list].sort((a, b) => a.order_index - b.order_index);
  return sorted.map((b, i) => ({ ...b, order_index: i }));
}

function asErrorMessage(x: unknown): string {
  if (typeof x === "string") return x;
  if (x instanceof Error) return x.message;
  return "Error inesperado.";
}

function isOk<T>(r: ActionResult<T>): r is { ok: true; data: T } {
  return r.ok === true;
}
function isErr<T>(r: ActionResult<T>): r is { ok: false; error: string } {
  return r.ok === false;
}

export function BlocksClient(props: {
  projectId: string;
  blocks: ProjectBlockRow[];
  groups: FlashcardGroupRow[];
  cards: FlashcardRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estado local editable (borrador)
  const [blocks, setBlocks] = useState<ProjectBlockRow[]>(props.blocks);
  const [groups, setGroups] = useState<FlashcardGroupRow[]>(props.groups);
  const [cards, setCards] = useState<FlashcardRow[]>(props.cards);

  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Draft markdown por bloque de texto
  const [textDraft, setTextDraft] = useState<Record<string, string>>({});

  // Inputs auxiliares
  const [newGroupTitle, setNewGroupTitle] = useState<Record<string, string>>({});
  const [newCardDraft, setNewCardDraft] = useState<Record<string, { front: string; back: string }>>({});

  // Movimientos pendientes (persistidos al final)
  const [pendingMoves, setPendingMoves] = useState<PendingMove[]>([]);

  // Baselines (estado del servidor al último refresh exitoso)
  const initializedRef = useRef(false);

  const baselineTextRef = useRef<Record<string, string>>({});
  const baselineGroupTitleRef = useRef<Record<string, string>>({});
  const baselineCardRef = useRef<Record<string, { front: string; back: string }>>({});
  const baselineGroupToBlockRef = useRef<Record<string, string>>({});
  const baselineCardToGroupRef = useRef<Record<string, string>>({});
  const baselineBlockIdsRef = useRef<Set<string>>(new Set());
  const baselineGroupIdsRef = useRef<Set<string>>(new Set());
  const baselineCardIdsRef = useRef<Set<string>>(new Set());

  const showError = useCallback((msg: string) => {
    setError(msg);
    window.setTimeout(() => setError(null), 4500);
  }, []);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const groupsByBlock = useMemo(() => {
    const m = new Map<string, FlashcardGroupRow[]>();
    for (const g of groups) {
      const arr = m.get(g.block_id) ?? [];
      arr.push(g);
      m.set(g.block_id, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.order_index - b.order_index);
    return m;
  }, [groups]);

  const cardsByGroup = useMemo(() => {
    const m = new Map<string, FlashcardRow[]>();
    for (const c of cards) {
      if (!c.group_id) continue;
      const arr = m.get(c.group_id) ?? [];
      arr.push(c);
      m.set(c.group_id, arr);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.order_index - b.order_index);
    return m;
  }, [cards]);

  const hasUnsavedChanges = useMemo(() => {
    // IMPORTANT: antes de inicializar baselines, NO marques como dirty (evita ciclo que rompe deletes)
    if (!initializedRef.current) return false;

    // 1) temp entities (no UUID) => no guardado
    if (blocks.some((b) => !isUuid(b.id))) return true;
    if (groups.some((g) => !isUuid(g.id))) return true;
    if (cards.some((c) => !isUuid(c.id))) return true;

    // 2) moves pendientes
    if (pendingMoves.length > 0) return true;

    // 3) text diffs (existentes)
    for (const b of blocks) {
      if (b.type !== "text") continue;
      if (!isUuid(b.id)) continue;
      const baseline = baselineTextRef.current[b.id] ?? "";
      const draft = textDraft[b.id] ?? getTextMd(b);
      if (draft !== baseline) return true;
    }

    // 4) group title diffs (existentes)
    for (const g of groups) {
      if (!isUuid(g.id)) continue;
      const baseline = baselineGroupTitleRef.current[g.id];
      if (baseline !== undefined && g.title !== baseline) return true;
    }

    // 5) card diffs (existentes)
    for (const c of cards) {
      if (!isUuid(c.id)) continue;
      const baseline = baselineCardRef.current[c.id];
      if (!baseline) continue;
      if (c.front !== baseline.front || c.back !== baseline.back) return true;
    }

    // 6) deletions derivables por diff (baseline ids vs current ids)
    const curBlockIds = new Set(blocks.filter((b) => isUuid(b.id)).map((b) => b.id));
    for (const id of baselineBlockIdsRef.current) {
      if (!curBlockIds.has(id)) return true;
    }

    const curGroupIds = new Set(groups.filter((g) => isUuid(g.id)).map((g) => g.id));
    for (const id of baselineGroupIdsRef.current) {
      if (!curGroupIds.has(id)) return true;
    }

    const curCardIds = new Set(cards.filter((c) => isUuid(c.id)).map((c) => c.id));
    for (const id of baselineCardIdsRef.current) {
      if (!curCardIds.has(id)) return true;
    }

    return false;
  }, [blocks, cards, groups, pendingMoves.length, textDraft]);

  // Warning estándar: cerrar/recargar pestaña con cambios sin guardar
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // eslint-disable-next-line no-param-reassign
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  function initFromServer(nextBlocks: ProjectBlockRow[], nextGroups: FlashcardGroupRow[], nextCards: FlashcardRow[]) {
    // baselines
    const textBase: Record<string, string> = {};
    const blockIds = new Set<string>();
    for (const b of nextBlocks) {
      if (isUuid(b.id)) blockIds.add(b.id);
      if (b.type === "text" && isUuid(b.id)) textBase[b.id] = getTextMd(b);
    }
    baselineTextRef.current = textBase;
    baselineBlockIdsRef.current = blockIds;

    const groupTitleBase: Record<string, string> = {};
    const groupIds = new Set<string>();
    const groupToBlock: Record<string, string> = {};
    for (const g of nextGroups) {
      if (!isUuid(g.id)) continue;
      groupIds.add(g.id);
      groupTitleBase[g.id] = g.title;
      groupToBlock[g.id] = g.block_id;
    }
    baselineGroupTitleRef.current = groupTitleBase;
    baselineGroupIdsRef.current = groupIds;
    baselineGroupToBlockRef.current = groupToBlock;

    const cardBase: Record<string, { front: string; back: string }> = {};
    const cardIds = new Set<string>();
    const cardToGroup: Record<string, string> = {};
    for (const c of nextCards) {
      if (!isUuid(c.id)) continue;
      cardIds.add(c.id);
      cardBase[c.id] = { front: c.front, back: c.back };
      if (c.group_id) cardToGroup[c.id] = c.group_id;
    }
    baselineCardRef.current = cardBase;
    baselineCardIdsRef.current = cardIds;
    baselineCardToGroupRef.current = cardToGroup;

    // draft text
    const draft: Record<string, string> = {};
    for (const b of nextBlocks) {
      if (b.type !== "text") continue;
      draft[b.id] = getTextMd(b);
    }
    setTextDraft(draft);
  }

  // Sync props -> estado local
  useEffect(() => {
    const forceInit = !initializedRef.current;
    if (!forceInit && hasUnsavedChanges) return;

    setBlocks(props.blocks);
    setGroups(props.groups);
    setCards(props.cards);

    setEditingCardId(null);
    setNewGroupTitle({});
    setNewCardDraft({});
    setPendingMoves([]);

    initFromServer(props.blocks, props.groups, props.cards);

    initializedRef.current = true;
  }, [hasUnsavedChanges, props.blocks, props.cards, props.groups]); // intencional

  // Si se agregan bloques de texto nuevos localmente, asegura draft
  useEffect(() => {
    setTextDraft((cur) => {
      const next: Record<string, string> = { ...cur };
      for (const b of blocks) {
        if (b.type !== "text") continue;
        if (next[b.id] === undefined) next[b.id] = getTextMd(b);
      }
      return next;
    });
  }, [blocks]);

  /* -------------------------
     BLOCKS (borrador)
  ------------------------- */

  const addBlock = useCallback(
    (type: BlockType) => {
      if (!props.canEdit || isPending) return;

      setError(null);
      setNotice(null);

      const nextIndex = blocks.length ? Math.max(...blocks.map((b) => b.order_index)) + 1 : 0;
      const now = new Date().toISOString();

      const optimistic: ProjectBlockRow = {
        id: tmpId("blk"),
        project_id: props.projectId as ProjectBlockRow["project_id"],
        type,
        order_index: nextIndex,
        data: type === "text" ? ({ md: "" } as ProjectBlockRow["data"]) : ({ note: "flashcards_block" } as ProjectBlockRow["data"]),
        created_at: now,
        updated_at: now,
      };

      setBlocks((cur) => normalizeBlockOrder([...cur, optimistic]));
      if (type === "text") setTextDraft((cur) => ({ ...cur, [optimistic.id]: "" }));
    },
    [blocks, isPending, props.canEdit, props.projectId]
  );

  const moveBlock = useCallback(
    (blockId: string, direction: "up" | "down") => {
      if (!props.canEdit || isPending) return;

      setError(null);
      setNotice(null);

      const sorted = [...blocks].sort((a, b) => a.order_index - b.order_index);
      const idx = sorted.findIndex((b) => b.id === blockId);
      if (idx < 0) return;

      const swapWith = direction === "up" ? idx - 1 : idx + 1;
      if (swapWith < 0 || swapWith >= sorted.length) return;

      const a = sorted[idx];
      const b = sorted[swapWith];

      const swapped = sorted.map((x) => {
        if (x.id === a.id) return { ...x, order_index: b.order_index };
        if (x.id === b.id) return { ...x, order_index: a.order_index };
        return x;
      });

      setBlocks(normalizeBlockOrder(swapped));
      setPendingMoves((cur) => [...cur, { blockId, direction }]);
    },
    [blocks, isPending, props.canEdit]
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      if (!props.canEdit || isPending) return;

      const ok = window.confirm("¿Eliminar este bloque?");
      if (!ok) return;

      setError(null);
      setNotice(null);

      const blk = blocks.find((b) => b.id === blockId);
      const isFlash = blk?.type === "flashcards";

      setBlocks((cur) => normalizeBlockOrder(cur.filter((b) => b.id !== blockId)));
      setPendingMoves((cur) => cur.filter((m) => m.blockId !== blockId));

      if (blk?.type === "text") {
        setTextDraft((cur) => {
          const next = { ...cur };
          delete next[blockId];
          return next;
        });
      }

      if (isFlash) {
        const removedGroupIds = new Set(groups.filter((g) => g.block_id === blockId).map((g) => g.id));
        setGroups((cur) => cur.filter((g) => g.block_id !== blockId));
        setCards((cur) => cur.filter((c) => !c.group_id || !removedGroupIds.has(c.group_id)));
      }
    },
    [blocks, groups, isPending, props.canEdit]
  );

  /* -------------------------
     GROUPS (borrador)
  ------------------------- */

  const addGroup = useCallback(
    (blockId: string, titleRaw: string) => {
      if (!props.canEdit || isPending) return;

      setError(null);
      setNotice(null);

      const blockGroups = groups.filter((g) => g.block_id === blockId);
      const nextIndex = blockGroups.length ? Math.max(...blockGroups.map((g) => g.order_index)) + 1 : 0;

      const now = new Date().toISOString();
      const optimistic: FlashcardGroupRow = {
        id: tmpId("grp"),
        block_id: blockId,
        title: titleRaw.trim() || `Grupo ${nextIndex + 1}`,
        order_index: nextIndex,
        created_at: now,
        updated_at: now,
      } as FlashcardGroupRow;

      setGroups((cur) => [...cur, optimistic]);
    },
    [groups, isPending, props.canEdit]
  );

  const renameGroupLocal = useCallback((groupId: string, title: string) => {
    setGroups((cur) => cur.map((g) => (g.id === groupId ? { ...g, title } : g)));
  }, []);

  const deleteGroupLocal = useCallback(
    (groupId: string) => {
      if (!props.canEdit || isPending) return;

      const ok = window.confirm("¿Eliminar este grupo y todas sus cartas?");
      if (!ok) return;

      setError(null);
      setNotice(null);

      setGroups((cur) => cur.filter((g) => g.id !== groupId));
      setCards((cur) => cur.filter((c) => c.group_id !== groupId));
    },
    [isPending, props.canEdit]
  );

  /* -------------------------
     CARDS (borrador)
  ------------------------- */

  const addCardLocal = useCallback(
    (groupId: string, front: string, back: string) => {
      if (!props.canEdit || isPending) return;

      setError(null);
      setNotice(null);

      const groupCards = cards.filter((c) => c.group_id === groupId);
      const nextIndex = groupCards.length ? Math.max(...groupCards.map((c) => c.order_index)) + 1 : 0;

      const now = new Date().toISOString();
      const optimistic: FlashcardRow = {
        id: tmpId("crd"),
        project_id: props.projectId as FlashcardRow["project_id"],
        group_id: groupId,
        front,
        back,
        order_index: nextIndex,
        created_at: now,
        updated_at: now,
      } as FlashcardRow;

      setCards((cur) => [...cur, optimistic]);
    },
    [cards, isPending, props.canEdit, props.projectId]
  );

  const deleteCardLocal = useCallback(
    (cardId: string) => {
      if (!props.canEdit || isPending) return;

      const ok = window.confirm("¿Eliminar esta carta?");
      if (!ok) return;

      setError(null);
      setNotice(null);

      setCards((cur) => cur.filter((c) => c.id !== cardId));
      if (editingCardId === cardId) setEditingCardId(null);
    },
    [editingCardId, isPending, props.canEdit]
  );

  const applyCardEditLocal = useCallback((cardId: string, front: string, back: string) => {
    setCards((cur) => cur.map((c) => (c.id === cardId ? { ...c, front, back } : c)));
  }, []);

  /* -------------------------
     GUARDAR TODO (persistencia final)
  ------------------------- */

  const saveAllChanges = useCallback(() => {
    if (!props.canEdit || isPending) return;

    setError(null);
    setNotice(null);

    startTransition(async () => {
      try {
        // Snapshots mutables (evita depender de setState async durante el mismo guardado)
        let blocksSnap = normalizeBlockOrder([...blocks]);
        let groupsSnap = [...groups];
        let cardsSnap = [...cards];
        let textDraftSnap = { ...textDraft };
        const pendingMovesSnap = [...pendingMoves];

        // tempId -> realId (bloques/grupos/cards creados)
        const idMap = new Map<string, string>();
        const resolveId = (id: string): string => idMap.get(id) ?? id;

        const replaceIdInSnaps = (fromId: string, toId: string) => {
          blocksSnap = blocksSnap.map((b) => (b.id === fromId ? { ...b, id: toId } : b));
          groupsSnap = groupsSnap.map((g) => {
            if (g.id === fromId) return { ...g, id: toId };
            if (g.block_id === fromId) return { ...g, block_id: toId };
            return g;
          });
          cardsSnap = cardsSnap.map((c) => {
            if (c.id === fromId) return { ...c, id: toId };
            if (c.group_id === fromId) return { ...c, group_id: toId };
            return c;
          });

          if (fromId in textDraftSnap) {
            textDraftSnap = { ...textDraftSnap, [toId]: textDraftSnap[fromId] };
            delete textDraftSnap[fromId];
          }
        };

        // 1) Crear bloques temporales (en orden)
        const tempBlocks = blocksSnap.filter((b) => !isUuid(b.id)).sort((a, b) => a.order_index - b.order_index);
        for (const b of tempBlocks) {
          const raw = await addBlockRpc({ project_id: props.projectId, type: b.type as BlockType });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
          idMap.set(b.id, raw.data.id);
          replaceIdInSnaps(b.id, raw.data.id);
        }

        // 2) Crear grupos temporales
        const tempGroups = groupsSnap
          .filter((g) => !isUuid(g.id))
          .sort((a, b) => {
            const ab = a.block_id.localeCompare(b.block_id);
            if (ab !== 0) return ab;
            return a.order_index - b.order_index;
          });

        for (const g of tempGroups) {
          const blockId = resolveId(g.block_id);
          const raw = await addGroupRpc({ project_id: props.projectId, block_id: blockId, title: g.title });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
          idMap.set(g.id, raw.data.id);
          replaceIdInSnaps(g.id, raw.data.id);
        }

        // 3) Crear cards temporales
        const tempCards = cardsSnap
          .filter((c) => !isUuid(c.id))
          .sort((a, b) => {
            const ag = (a.group_id ?? "").localeCompare(b.group_id ?? "");
            if (ag !== 0) return ag;
            return a.order_index - b.order_index;
          });

        for (const c of tempCards) {
          const groupId = c.group_id ? resolveId(c.group_id) : null;
          if (!groupId) continue;

          const raw = await addCardRpc({
            project_id: props.projectId,
            group_id: groupId,
            front: c.front,
            back: c.back,
          });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
          idMap.set(c.id, raw.data.id);
          replaceIdInSnaps(c.id, raw.data.id);
        }

        // 4) DELETES por diff (baseline vs snapshot actual)
        const curBlockIds = new Set(blocksSnap.filter((b) => isUuid(resolveId(b.id))).map((b) => resolveId(b.id)));
        const deletedBlockIds: string[] = [];
        for (const id of baselineBlockIdsRef.current) {
          if (!curBlockIds.has(id)) deletedBlockIds.push(id);
        }

        for (const blockId of deletedBlockIds) {
          const raw = await deleteBlockRpc({ project_id: props.projectId, block_id: blockId });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        const curGroupIds = new Set(groupsSnap.filter((g) => isUuid(resolveId(g.id))).map((g) => resolveId(g.id)));
        const deletedGroupIds: string[] = [];
        for (const id of baselineGroupIdsRef.current) {
          if (curGroupIds.has(id)) continue;
          const blockId = baselineGroupToBlockRef.current[id];
          if (blockId && deletedBlockIds.includes(blockId)) continue;
          deletedGroupIds.push(id);
        }

        for (const groupId of deletedGroupIds) {
          const raw = await deleteGroupRpc({ project_id: props.projectId, group_id: groupId });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        const curCardIds = new Set(cardsSnap.filter((c) => isUuid(resolveId(c.id))).map((c) => resolveId(c.id)));
        const deletedCardIds: string[] = [];
        for (const id of baselineCardIdsRef.current) {
          if (curCardIds.has(id)) continue;

          const groupId = baselineCardToGroupRef.current[id];
          if (groupId && deletedGroupIds.includes(groupId)) continue;

          const blockId = groupId ? baselineGroupToBlockRef.current[groupId] : undefined;
          if (blockId && deletedBlockIds.includes(blockId)) continue;

          deletedCardIds.push(id);
        }

        for (const cardId of deletedCardIds) {
          const raw = await deleteCardRpc({ project_id: props.projectId, card_id: cardId });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        // 5) MOVES (en el orden que el usuario movió)
        for (const m of pendingMovesSnap) {
          const realId = resolveId(m.blockId);
          if (!isUuid(realId)) continue;
          if (deletedBlockIds.includes(realId)) continue;

          const raw = await moveBlockRpc({ project_id: props.projectId, block_id: realId, direction: m.direction });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        // 6) UPDATES: textos
        for (const b of blocksSnap) {
          if (b.type !== "text") continue;
          const id = resolveId(b.id);
          if (!isUuid(id)) continue;
          if (deletedBlockIds.includes(id)) continue;

          const baseline = baselineTextRef.current[id] ?? "";
          const draft = textDraftSnap[id] ?? getTextMd(b);
          if (draft === baseline) continue;

          const raw = await updateTextBlockRpc({ project_id: props.projectId, block_id: id, md: draft });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        // 7) UPDATES: títulos de grupos (solo existentes; los nuevos ya vienen con title correcto)
        for (const g of groupsSnap) {
          const id = resolveId(g.id);
          if (!isUuid(id)) continue;
          if (deletedGroupIds.includes(id)) continue;

          const baseline = baselineGroupTitleRef.current[id];
          if (baseline === undefined) continue; // era nuevo
          if (g.title === baseline) continue;

          const raw = await renameGroupRpc({ project_id: props.projectId, group_id: id, title: g.title });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        // 8) UPDATES: cards (solo existentes; las nuevas ya vienen con front/back correcto)
        for (const c of cardsSnap) {
          const id = resolveId(c.id);
          if (!isUuid(id)) continue;
          if (deletedCardIds.includes(id)) continue;

          const baseline = baselineCardRef.current[id];
          if (!baseline) continue; // era nuevo
          if (c.front === baseline.front && c.back === baseline.back) continue;

          const raw = await updateCardRpc({ project_id: props.projectId, card_id: id, front: c.front, back: c.back });
          if (isErr(raw)) throw new Error(raw.error);
          if (!isOk(raw)) throw new Error("Respuesta inválida del servidor.");
        }

        // Éxito: consolida UI local + baselines
        setBlocks(blocksSnap);
        setGroups(groupsSnap);
        setCards(cardsSnap);
        setTextDraft(textDraftSnap);
        setPendingMoves([]);

        initFromServer(blocksSnap, groupsSnap, cardsSnap);
        initializedRef.current = true;

        showNotice("Cambios guardados.");
        router.refresh();
      } catch (e) {
        showError(asErrorMessage(e));
      }
    });
  }, [
    blocks,
    cards,
    groups,
    isPending,
    pendingMoves,
    props.canEdit,
    props.projectId,
    router,
    showError,
    showNotice,
    startTransition,
    textDraft,
  ]);

  /* -------------------------
     RENDER
  ------------------------- */

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bloques</CardTitle>
        <CardDescription>Modo borrador: editas libremente y se guarda todo al final con “Guardar cambios”.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
        ) : null}

        {notice ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">{notice}</div> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" disabled={!props.canEdit || isPending} onClick={() => addBlock("text")}>
            + Texto
          </Button>

          <Button type="button" variant="secondary" disabled={!props.canEdit || isPending} onClick={() => addBlock("flashcards")}>
            + Flashcards
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {hasUnsavedChanges ? <span className="text-xs text-muted-foreground">Cambios sin guardar</span> : <span className="text-xs text-muted-foreground">Sin cambios</span>}

            <Button type="button" disabled={!props.canEdit || isPending || !hasUnsavedChanges} onClick={saveAllChanges}>
              Guardar cambios
            </Button>
          </div>

          {!props.canEdit ? <span className="text-xs text-muted-foreground">Solo lectura (invitado).</span> : null}
          {isPending ? <span className="text-xs text-muted-foreground">Guardando…</span> : null}
        </div>

        {blocks.length === 0 ? (
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium">Sin bloques</p>
            <p className="text-xs text-muted-foreground">Agrega un bloque de texto o flashcards.</p>
          </div>
        ) : null}

        <div className="space-y-3">
          {blocks
            .slice()
            .sort((a, b) => a.order_index - b.order_index)
            .map((b, idx) => {
              const type = b.type as BlockType;
              const blockGroups = groupsByBlock.get(b.id) ?? [];

              const textDirty =
                type === "text" && isUuid(b.id)
                  ? (textDraft[b.id] ?? getTextMd(b)) !== (baselineTextRef.current[b.id] ?? "")
                  : type === "text" && !isUuid(b.id);

              return (
                <div key={b.id} className="rounded-xl border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {type === "text" ? "Bloque de texto" : "Bloque de flashcards"}
                        {textDirty ? <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Sin guardar</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">Orden: {b.order_index}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" disabled={!props.canEdit || idx === 0 || isPending} onClick={() => moveBlock(b.id, "up")}>
                        ↑
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!props.canEdit || idx === blocks.length - 1 || isPending}
                        onClick={() => moveBlock(b.id, "down")}
                      >
                        ↓
                      </Button>

                      <Button type="button" variant="ghost" disabled={!props.canEdit || isPending} onClick={() => deleteBlock(b.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </div>

                  <div className="p-3">
                    {type === "text" ? (
                      <MarkdownEditor
                        value={textDraft[b.id] ?? getTextMd(b)}
                        disabled={!props.canEdit || isPending}
                        onChange={(md) => setTextDraft((cur) => ({ ...cur, [b.id]: md }))}
                      />
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">Grupos</p>

                          <div className="flex items-center gap-2">
                            <input
                              value={newGroupTitle[b.id] ?? ""}
                              onChange={(e) => setNewGroupTitle((cur) => ({ ...cur, [b.id]: e.target.value }))}
                              placeholder="Nuevo grupo..."
                              className="h-9 w-44 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
                              disabled={!props.canEdit || isPending}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={!props.canEdit || isPending}
                              onClick={() => {
                                const t = (newGroupTitle[b.id] ?? "").trim();
                                setNewGroupTitle((cur) => ({ ...cur, [b.id]: "" }));
                                addGroup(b.id, t);
                              }}
                            >
                              +
                            </Button>
                          </div>
                        </div>

                        {blockGroups.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay grupos. Crea uno arriba.</p> : null}

                        {blockGroups.map((g) => (
                          <GroupCard
                            key={g.id}
                            canEdit={props.canEdit}
                            isPending={isPending}
                            group={g}
                            cards={cardsByGroup.get(g.id) ?? []}
                            editingCardId={editingCardId}
                            setEditingCardId={setEditingCardId}
                            onRename={(groupId, title) => renameGroupLocal(groupId, title)}
                            onDeleteGroup={(groupId) => deleteGroupLocal(groupId)}
                            newCard={newCardDraft[g.id] ?? { front: "", back: "" }}
                            setNewCard={(v) => setNewCardDraft((cur) => ({ ...cur, [g.id]: v }))}
                            onAddCard={(front, back) => {
                              addCardLocal(g.id, front, back);
                              setNewCardDraft((cur) => ({ ...cur, [g.id]: { front: "", back: "" } }));
                            }}
                            onApplyCardEdit={(cardId, front, back) => applyCardEditLocal(cardId, front, back)}
                            onDeleteCard={(cardId) => deleteCardLocal(cardId)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}

function GroupCard(props: {
  canEdit: boolean;
  isPending: boolean;
  group: FlashcardGroupRow;
  cards: FlashcardRow[];
  editingCardId: string | null;
  setEditingCardId: (id: string | null) => void;

  onRename: (groupId: string, title: string) => void;
  onDeleteGroup: (groupId: string) => void;

  newCard: { front: string; back: string };
  setNewCard: (v: { front: string; back: string }) => void;
  onAddCard: (front: string, back: string) => void;

  onApplyCardEdit: (cardId: string, front: string, back: string) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  const [title, setTitle] = useState<string>(props.group.title);

  useEffect(() => setTitle(props.group.title), [props.group.title]);

  const canMutate = props.canEdit && !props.isPending;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            disabled={!canMutate}
          />
          <Button type="button" variant="secondary" disabled={!canMutate || !title.trim()} onClick={() => props.onRename(props.group.id, title.trim())}>
            Aplicar
          </Button>
        </div>

        <Button type="button" variant="ghost" disabled={!props.canEdit || props.isPending} onClick={() => props.onDeleteGroup(props.group.id)}>
          Eliminar grupo
        </Button>
      </div>

      {props.cards.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {props.cards.map((c) => {
            const isEditing = props.editingCardId === c.id;

            return (
              <div key={c.id} className="rounded-md border p-2 space-y-2">
                {!isEditing ? (
                  <>
                    <div className="text-xs">
                      <p className="font-medium">Front</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{c.front}</p>
                    </div>

                    <div className="text-xs">
                      <p className="font-medium">Back</p>
                      <p className="text-muted-foreground whitespace-pre-wrap">{c.back}</p>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" disabled={!props.canEdit || props.isPending} onClick={() => props.setEditingCardId(c.id)}>
                        Editar
                      </Button>

                      <Button type="button" variant="ghost" size="sm" disabled={!props.canEdit || props.isPending} onClick={() => props.onDeleteCard(c.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </>
                ) : (
                  <CardEditorDraft
                    canEdit={props.canEdit}
                    isPending={props.isPending}
                    card={c}
                    onCancel={() => props.setEditingCardId(null)}
                    onApply={(front, back) => {
                      props.onApplyCardEdit(c.id, front, back);
                      props.setEditingCardId(null);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin cartas en este grupo.</p>
      )}

      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={props.newCard.front}
            onChange={(e) => props.setNewCard({ ...props.newCard, front: e.target.value })}
            placeholder="Front..."
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            disabled={!canMutate}
          />
          <input
            value={props.newCard.back}
            onChange={(e) => props.setNewCard({ ...props.newCard, back: e.target.value })}
            placeholder="Back..."
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            disabled={!canMutate}
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={!canMutate || !props.newCard.front.trim() || !props.newCard.back.trim()}
            onClick={() => props.onAddCard(props.newCard.front.trim(), props.newCard.back.trim())}
          >
            Agregar carta
          </Button>
        </div>
      </div>
    </div>
  );
}

function CardEditorDraft(props: {
  canEdit: boolean;
  isPending: boolean;
  card: FlashcardRow;
  onCancel: () => void;
  onApply: (front: string, back: string) => void;
}) {
  const [front, setFront] = useState<string>(props.card.front);
  const [back, setBack] = useState<string>(props.card.back);

  useEffect(() => {
    setFront(props.card.front);
    setBack(props.card.back);
  }, [props.card.front, props.card.back]);

  const canMutate = props.canEdit && !props.isPending;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-xs font-medium">Front</label>
        <textarea
          value={front}
          onChange={(e) => setFront(e.target.value)}
          className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={!canMutate}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium">Back</label>
        <textarea
          value={back}
          onChange={(e) => setBack(e.target.value)}
          className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          disabled={!canMutate}
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={props.onCancel}>
          Cancelar
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={!canMutate || !front.trim() || !back.trim()} onClick={() => props.onApply(front.trim(), back.trim())}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}
