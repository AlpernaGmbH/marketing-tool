import { parseState } from "@/components/tool/questionnaire";

// Fortschritt in einem Pfad: ein Werkzeug gilt als erledigt, wenn sein Zwischenstand
// (localStorage «mt:<slug>») die Phase «result» erreicht hat. Nichts davon verlässt den Browser.

export const toolStateKey = (slug: string) => `mt:${slug}`;

/** Roher Wert aus dem lokalen Speicher → hat das Werkzeug ein Ergebnis? Kaputte Daten zählen als «nein». */
export function isToolDone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return parseState(JSON.parse(raw)).phase === "result";
  } catch {
    return false;
  }
}

/** Die erledigten Slugs unter `slugs`, in der Reihenfolge von `slugs`. */
export function doneSlugs(slugs: readonly string[], read: (key: string) => string | null): string[] {
  return slugs.filter((s) => isToolDone(read(toolStateKey(s))));
}

export type PathSummary = {
  total: number;
  done: number;
  /** Erster noch nicht erledigter Schritt in Pfadreihenfolge, sonst null. */
  next: string | null;
  complete: boolean;
};

export function summarizePath(slugs: readonly string[], done: ReadonlySet<string>): PathSummary {
  const count = slugs.filter((s) => done.has(s)).length;
  return {
    total: slugs.length,
    done: count,
    next: slugs.find((s) => !done.has(s)) ?? null,
    complete: slugs.length > 0 && count === slugs.length,
  };
}
