// app/protected/projects/[projectId]/practice-launcher-client.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PracticeOverlay } from "@/components/practice/PracticeOverlay";

// shadcn/ui tooltip
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// iconos (lucide)
import { CircleHelp, Play } from "lucide-react";

export function PracticeLauncherClient(props: {
  projectId: string;
  groupId: string;
  groupTitle?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const helpText = useMemo(() => {
    return (
      "Cómo funciona:\n" +
      "• Presiona “Practicar” para iniciar una sesión.\n" +
      "• Espacio: voltear (mostrar/ocultar respuesta).\n" +
      "• Luego responde con 1–4:\n" +
      "  1 = Otra vez (vuelve pronto)\n" +
      "  2 = Difícil\n" +
      "  3 = Bien\n" +
      "  4 = Fácil (se programa más lejos)\n" +
      "• Las tarjetas vencidas aparecen primero."
    );
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={props.disabled}
          onClick={() => setOpen(true)}
          className={[
            // más llamativo que "secondary"
            "font-semibold shadow-sm",
            "ring-1 ring-primary/25 hover:ring-primary/40",
          ].join(" ")}
        >
          <Play className="mr-2 h-4 w-4" />
          Practicar
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Ayuda sobre práctica"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-transparent text-muted-foreground shadow-sm hover:text-foreground"
            >
              <CircleHelp className="h-4 w-4" />
            </button>
          </TooltipTrigger>

          <TooltipContent className="max-w-xs whitespace-pre-wrap text-xs leading-5">
            {helpText}
          </TooltipContent>
        </Tooltip>

        <PracticeOverlay
          open={open}
          onClose={() => setOpen(false)}
          projectId={props.projectId}
          groupId={props.groupId}
          groupTitle={props.groupTitle}
        />
      </div>
    </TooltipProvider>
  );
}
