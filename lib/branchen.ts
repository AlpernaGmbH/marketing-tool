import data from "@/data/branchen.json";
import type { IndustryKey } from "@/lib/check/types";

// Eine Branchenliste für alle Werkzeuge (Beschluss vom 09.10.2026). Vorher kannte der Marketing-Check 12 Branchen, die Ideen-Bibliothek 12
// andere und der Content-Kalender 6; im Profil stand ein Freitext. Jetzt wählt der Besucher einmal aus dieser Liste (oder tippt eine
// eigene Bezeichnung wie «Malerei»), und jedes Werkzeug übersetzt den Eintrag in seine Schlüssel.

export type BrancheEntry = {
  key: string;
  label: string;
  /** Schlüssel im Marketing-Check (lib/check/types.ts). */
  check: IndustryKey;
  /** Schlüssel in data/branchen-ideen.json; «alle», wenn es keine eigene Branche gibt. */
  ideen: string;
  /** Schlüssel im Content-Kalender. */
  kalender: string;
  /** Typische Bezeichnungen; sie erscheinen als Vorschläge beim Tippen und helfen beim Erkennen. */
  beispiele: string[];
};

export const BRANCHEN_LISTE: readonly BrancheEntry[] = data.branchen as BrancheEntry[];
export const BRANCHE_ANDERE = "andere";

/** Kleinschreibung ohne Umlaute und Akzente, damit «Sanitär», «Sanitaer» und «SANITAR» gleich sind («ä» und «ae» werden beide zu «a»). */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ae|oe|ue/g, (m) => m[0]);
}

const STOP = new Set(["und", "oder", "der", "die", "das", "fur", "mit", "von", "zur", "zum", "im", "am", "in", "an", "bei", "ag", "gmbh", "sa", "sarl"]);
const words = (s: string): string[] => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));

/** Der Eintrag zu einer Bezeichnung: genauer Treffer auf die Bezeichnung zuerst, sonst der Eintrag mit den meisten gemeinsamen Wörtern. null: kein Treffer. */
export function brancheOf(text: string | undefined | null, liste: readonly BrancheEntry[] = BRANCHEN_LISTE): BrancheEntry | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const exact = liste.find((b) => fold(b.label) === fold(raw) || b.key === raw);
  if (exact) return exact;
  const tokens = words(raw);
  if (tokens.length === 0) return null;
  let best: { entry: BrancheEntry; score: number } | null = null;
  for (const entry of liste) {
    const terms = new Set(words([entry.label, ...entry.beispiele].join(" ")));
    let score = 0;
    for (const t of tokens) {
      let own = 0;
      for (const term of terms) {
        if (t === term) own = Math.max(own, 3);
        // gemeinsamer Wortanfang ab fünf Buchstaben («Maler» und «Malerei»)
        else if (term.length >= 5 && t.length >= 5 && (t.startsWith(term) || term.startsWith(t))) own = Math.max(own, 2);
      }
      score += own;
    }
    if (score > (best?.score ?? 0)) best = { entry, score };
  }
  return best?.entry ?? null;
}

/** Anzeige im Profil: «Erkannt: Handwerk» oder null, wenn die Bezeichnung zu keinem Eintrag passt. */
export function brancheHinweis(text: string | undefined | null): string | null {
  const entry = brancheOf(text);
  return entry && entry.key !== BRANCHE_ANDERE ? entry.label : null;
}
