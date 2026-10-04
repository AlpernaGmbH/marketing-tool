// Fortschritt in einem Pfad: ein Werkzeug gilt als erledigt, wenn sein Zwischenstand (localStorage «mt:<slug>»)
// ein Ergebnis trägt. Nichts davon verlässt den Browser. Die Werkzeuge speichern verschieden (docs/TOOL-BAUEN.md):
// - Fragebogen, Marketing-Check, Wettbewerbsvergleich, Textcheck, Newsletter-Check: `phase: "result"`
// - Generator-Werkzeuge (useGenerator): `output` ist ein Objekt
// - Text-Umschreiber: `result` ist ein nicht leerer Text

export const toolStateKey = (slug: string) => `mt:${slug}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Roher Wert aus dem lokalen Speicher → hat das Werkzeug ein Ergebnis? Kaputte Daten zählen als «nein». */
export function isToolDone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const s: unknown = JSON.parse(raw);
    if (!isObject(s)) return false;
    // Trägt der Stand eine Phase, entscheidet nur sie (ein altes Ergebnis neben «edit» zählt nicht).
    if (typeof s.phase === "string") return s.phase === "result";
    if (isObject(s.output)) return true;
    return typeof s.result === "string" ? s.result.trim() !== "" : isObject(s.result);
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
