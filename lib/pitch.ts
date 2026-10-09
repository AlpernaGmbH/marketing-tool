import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { CONTENT_DIR, splitH2 } from "@/lib/content";

// content/pitch/bausteine.md liefert Alperna (nicht Claude Code): sechs Bausteine mit
// je zwei Sätzen und einem Beweis, dazu das aktuelle Einstiegsangebot.

export const BAUSTEIN_NAMES = [
  "Website",
  "Google Business Profil",
  "Social Media",
  "Online-Shop",
  "Buchungstool",
  "Google Ads",
] as const;
export type BausteinName = (typeof BAUSTEIN_NAMES)[number];

export type Baustein = { name: BausteinName; text: string; beweis: string };

/**
 * Was ein Werkzeug aus seinem Ergebnis über Alperna sagt (components/tool/ResultPitch.tsx): `satz` stammt aus dem Ergebnis, `baustein` wählt
 * den Text aus dieser Datei. Das Werkzeug berechnet beides in seiner logic.ts, mit Test, und nennt nie einen Preis.
 */
export type PitchSpec = { baustein: BausteinName; satz: string };

export type Bausteine = {
  einstiegsangebot: string;
  items: Baustein[];
  /** Strukturfehler (fehlender Abschnitt oder fehlendes Feld). */
  issues: string[];
  /** Felder, die noch «TODO» enthalten oder leer sind. */
  open: string[];
};

/** Ein Wert ist erst verwendbar, wenn er gefüllt ist und nicht mit TODO beginnt. */
export function usable(value: string | undefined): value is string {
  return Boolean(value && value.trim() !== "" && !/^todo\b/i.test(value.trim()));
}

export function parseBausteine(raw: string): Bausteine {
  const { data, content } = matter(raw);
  const issues: string[] = [];
  const open: string[] = [];

  const angebot = typeof data.einstiegsangebot === "string" ? data.einstiegsangebot.trim() : "";
  if (!angebot) issues.push("Kopfdaten: «einstiegsangebot» fehlt");
  else if (!usable(angebot)) open.push("einstiegsangebot");

  const sections = new Map(splitH2(content).map((s) => [s.title, s.content]));
  const items: Baustein[] = [];
  for (const name of BAUSTEIN_NAMES) {
    const section = sections.get(name);
    if (section === undefined) {
      issues.push(`Abschnitt «${name}» fehlt`);
      continue;
    }
    const field = (key: "text" | "beweis") =>
      new RegExp(`^${key}:\\s*(.*)$`, "im").exec(section)?.[1]?.trim() ?? "";
    const text = field("text");
    const beweis = field("beweis");
    if (!text) issues.push(`«${name}»: «text» fehlt`);
    else if (!usable(text)) open.push(`${name}.text`);
    if (!beweis) issues.push(`«${name}»: «beweis» fehlt`);
    else if (!usable(beweis)) open.push(`${name}.beweis`);
    items.push({ name, text, beweis });
  }
  return { einstiegsangebot: angebot, items, issues, open };
}

export function loadBausteine(): Bausteine | null {
  const file = path.join(CONTENT_DIR, "pitch", "bausteine.md");
  if (!fs.existsSync(file)) return null;
  return parseBausteine(fs.readFileSync(file, "utf8"));
}
