"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/Markdown/MarkdownRenderer";

type Mode = "edit" | "preview" | "split";

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;

  // Opcionales
  defaultMode?: Mode; // por defecto: "split"
  minHeightClassName?: string; // por defecto: "min-h-40"
};

function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string
): { next: string; nextStart: number; nextEnd: number } {
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  return {
    next,
    nextStart: start + before.length,
    nextEnd: end + before.length,
  };
}

function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string
): { next: string; nextStart: number; nextEnd: number } {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIdx = value.indexOf("\n", end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;

  const chunk = value.slice(lineStart, lineEnd);
  const lines = chunk.split("\n");

  const allPrefixed = lines.every((l) => l.startsWith(prefix));
  const nextLines = lines.map((l) => (allPrefixed ? l.replace(prefix, "") : prefix + l));

  const nextChunk = nextLines.join("\n");
  const next = value.slice(0, lineStart) + nextChunk + value.slice(lineEnd);

  return {
    next,
    nextStart: start,
    nextEnd: end + (nextChunk.length - chunk.length),
  };
}

export function MarkdownEditor({
  value,
  onChange,
  disabled,
  defaultMode = "split",
  minHeightClassName = "min-h-40",
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<Mode>(defaultMode);

  const isEmpty = useMemo(() => (value ?? "").trim().length === 0, [value]);

  const canEditHere = !disabled && (mode === "edit" || mode === "split");

  function focusAndSelect(start: number, end: number) {
    queueMicrotask(() => {
      const t = ref.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(start, end);
    });
  }

  function applyWrap(before: string, after: string) {
    const ta = ref.current;
    if (!ta || !canEditHere) return;
    const { selectionStart, selectionEnd } = ta;

    const r = wrapSelection(value, selectionStart, selectionEnd, before, after);
    onChange(r.next);
    focusAndSelect(r.nextStart, r.nextEnd);
  }

  function applyPrefix(prefix: string) {
    const ta = ref.current;
    if (!ta || !canEditHere) return;
    const { selectionStart, selectionEnd } = ta;

    const r = prefixLines(value, selectionStart, selectionEnd, prefix);
    onChange(r.next);
    focusAndSelect(r.nextStart, r.nextEnd);
  }

  function insertLink() {
    const ta = ref.current;
    if (!ta || !canEditHere) return;
    const { selectionStart, selectionEnd } = ta;

    // Si no hay selección, ponemos un placeholder para que el usuario lo reemplace rápido.
    const selected = value.slice(selectionStart, selectionEnd);
    const text = selected.length ? selected : "texto";
    const before = "[";
    const after = `](${`https://`})`;

    // Wrap usando el texto seleccionado o "texto"
    const base =
      value.slice(0, selectionStart) + text + value.slice(selectionEnd);

    const r = wrapSelection(base, selectionStart, selectionStart + text.length, before, after);
    onChange(r.next);

    queueMicrotask(() => {
      const t = ref.current;
      if (!t) return;
      t.focus();

      // Selecciona el https:// para editar rápido
      const idx = r.next.indexOf("(https://", selectionStart);
      if (idx >= 0) {
        const s = idx + 1; // después del "("
        const e = s + "https://".length;
        t.setSelectionRange(s, e);
      }
    });
  }

  function insertCodeBlock() {
    const ta = ref.current;
    if (!ta || !canEditHere) return;
    const { selectionStart, selectionEnd } = ta;

    // Si hay selección, la envuelve; si no, crea un bloque vacío con cursor dentro.
    const hasSelection = selectionEnd > selectionStart;
    const before = "\n```" + "\n";
    const after = "\n```" + "\n";

    const r = wrapSelection(value, selectionStart, selectionEnd, before, after);
    onChange(r.next);

    // Si no había selección, deja el cursor dentro del bloque (línea vacía)
    const cursorPos = hasSelection ? r.nextEnd : r.nextStart;
    focusAndSelect(cursorPos, cursorPos);
  }

  const textarea = (
    <textarea
      ref={ref}
      value={value}
      disabled={!!disabled}
      onChange={(e) => onChange(e.target.value)}
      className={[
        minHeightClassName,
        "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
      ].join(" ")}
      placeholder="Escribe aquí (markdown)..."
    />
  );

  const preview = (
    <div
      className={[
        minHeightClassName,
        "w-full rounded-md border bg-card p-3",
      ].join(" ")}
    >
      {isEmpty ? (
        <p className="text-sm text-muted-foreground">
          No hay contenido para previsualizar.
        </p>
      ) : (
        <MarkdownRenderer md={value} />
      )}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* Toolbar + modo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border p-1">
          <Button
            type="button"
            variant={mode === "edit" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("edit")}
            disabled={!!disabled}
          >
            Editar
          </Button>
          <Button
            type="button"
            variant={mode === "preview" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("preview")}
            disabled={!!disabled}
          >
            Vista previa
          </Button>
          <Button
            type="button"
            variant={mode === "split" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setMode("split")}
            disabled={!!disabled}
          >
            Dividido
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyWrap("**", "**")}
          >
            B
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyWrap("_", "_")}
          >
            I
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyWrap("`", "`")}
          >
            {"</>"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={insertCodeBlock}
          >
            {"```"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyPrefix("# ")}
          >
            H1
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyPrefix("## ")}
          >
            H2
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyPrefix("- ")}
          >
            • Lista
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={() => applyPrefix("> ")}
          >
            &quot;Cita&quot;
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canEditHere}
            onClick={insertLink}
          >
            Link
          </Button>
        </div>

        <span className="text-xs text-muted-foreground">
          Markdown (GFM): tablas, listas, checkboxes.
        </span>
      </div>

      {/* Body */}
      {mode === "edit" ? textarea : null}
      {mode === "preview" ? preview : null}
      {mode === "split" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {textarea}
          {preview}
        </div>
      ) : null}
    </div>
  );
}
