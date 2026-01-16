//app/components/reports/ReportButton.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createReportAction } from "@/app/protected/reports/report-actions";

export function ReportButton(props: { projectId: string; projectTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null);
    setOk(null);
    setBusy(true);

    const res = await createReportAction({ project_id: props.projectId, description: desc });

    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }

    setOk("Reporte enviado. Gracias.");
    setDesc("");
    setTimeout(() => setOpen(false), 600);
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Reportar
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <Card className="w-full max-w-lg rounded-2xl border bg-card shadow-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Reportar proyecto</p>
                <p className="text-xs text-muted-foreground">
                  {props.projectTitle ? `Proyecto: ${props.projectTitle}` : "Describe el motivo del reporte."}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Descripción</label>
                <Input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Ej: contenido inapropiado / copyright / spam / información personal..."
                  className="h-10"
                />
                <p className="text-[11px] text-muted-foreground">
                  Debe ser claro y específico. Evita incluir datos personales.
                </p>
              </div>

              {err ? <p className="text-sm text-destructive">{err}</p> : null}
              {ok ? <p className="text-sm">{ok}</p> : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={submit} disabled={busy}>
                  Enviar
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
