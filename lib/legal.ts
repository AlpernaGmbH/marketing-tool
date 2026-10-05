import fs from "node:fs";
import path from "node:path";
import { dateCH } from "@/lib/ch";
import { CONTENT_DIR, markdownToHtml } from "@/lib/content";
import { checkLegalFile, parseLegalMeta } from "@/lib/legal-rules";

// Die Seiten /impressum und /datenschutz zeigen den Text aus content/legal/eigene-*.md, sobald ein Mensch ihn freigegeben hat
// (geprueft: ja, Prüfer und Datum im Kopf, keine offenen Fragen). Bis dahin bleibt der Platzhalter stehen (Harte Regel 8).
// Der Seitentext ist der erste Codeblock ```text der Datei, in Markdown (## Überschrift, - Aufzählung).

export const LEGAL_PAGES = { impressum: "eigene-impressum", datenschutz: "eigene-datenschutz" } as const;
export type LegalPage = keyof typeof LEGAL_PAGES;

/** Der Seitentext einer Rechtsdatei: Inhalt des ersten Codeblocks ```text, sonst null. */
export function pageTextOf(raw: string): string | null {
  const match = /^```text\r?\n([\s\S]*?)\r?\n```[ \t]*$/m.exec(raw);
  const text = match?.[1].trim();
  return text ? text : null;
}

/**
 * Markdown der Seite, wenn die Datei freigegeben ist, sonst null. Freigegeben heisst: Kopf vollständig, `geprueft: ja`,
 * Prüfer und Datum eingetragen, keine `PRÜFEN:`-Fragen und keine `[OFFEN`-Lücken im Text (checkLegalFile), ein Seitentext vorhanden.
 * `{{datum}}` wird durch das Stand-Datum der Datei ersetzt (TT.MM.JJJJ).
 */
export function legalPageSource(name: string, raw: string): { markdown: string; stand: string } | null {
  if (checkLegalFile(name, raw).some((i) => i.level === "error")) return null;
  const meta = parseLegalMeta(raw);
  if (!meta || !meta.geprueft) return null;
  const text = pageTextOf(raw);
  if (!text || /\{\{(?!datum\}\})/.test(text)) return null; // unbekannte Platzhalter: nicht veröffentlichen
  return { markdown: text.replaceAll("{{datum}}", dateCH(meta.stand)), stand: meta.stand };
}

/** Seite für /impressum oder /datenschutz als HTML; null, solange die Datei nicht freigegeben ist. */
export async function loadLegalPage(page: LegalPage): Promise<{ html: string; stand: string } | null> {
  const name = `${LEGAL_PAGES[page]}.md`;
  const file = path.join(CONTENT_DIR, "legal", name);
  if (!fs.existsSync(file)) return null;
  const source = legalPageSource(name, fs.readFileSync(file, "utf8"));
  return source ? { html: await markdownToHtml(source.markdown), stand: source.stand } : null;
}
