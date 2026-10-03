"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Kopiert Text in die Zwischenablage; fällt auf execCommand zurück, wo die Clipboard-API fehlt. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* weiter mit Rückfall */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

type Props = {
  /** Text oder Funktion, die den Text erst beim Klick erzeugt. */
  text: string | (() => string);
  label?: string;
  variant?: "default" | "outline" | "ghost";
  className?: string;
};

export function CopyButton({ text, label = "Text kopieren", variant = "outline", className }: Props) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(typeof text === "function" ? text() : text);
    setState(ok ? "done" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2500);
  }

  return (
    <>
      <Button type="button" variant={variant} onClick={onClick} className={className} data-umami-event="copy_text">
        {state === "done" ? "Kopiert" : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === "done" ? "In die Zwischenablage kopiert." : state === "failed" ? "Kopieren hat nicht geklappt." : ""}
      </span>
      {state === "failed" && (
        <span className="text-sm text-destructive">Kopieren hat nicht geklappt. Markiere den Text und kopiere ihn von Hand.</span>
      )}
    </>
  );
}
