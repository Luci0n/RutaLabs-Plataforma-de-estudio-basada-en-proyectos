// components/help/HelpTip.tsx
"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HelpCircle } from "lucide-react";

function cx(...v: Array<string | false | null | undefined>) {
  return v.filter(Boolean).join(" ");
}

export function HelpTip(props: {
  label: string;
  title: string;
  body: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cx("h-9 w-9 p-0 rounded-xl hover:bg-muted/25", props.className)}
          aria-label={props.label}
          title={props.label}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side={props.side ?? "top"}
        align={props.align ?? "end"}
        className={cx(
          "w-80 rounded-2xl border",
          "bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
          "shadow-md"
        )}
      >
        <div className="space-y-2">
          <p className="text-sm font-semibold">{props.title}</p>
          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {props.body}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
