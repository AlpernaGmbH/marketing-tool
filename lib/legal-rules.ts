import matter from "gray-matter";
import type { Issue } from "@/lib/content-rules";

// Regeln für content/legal/*.md (CLAUDE.md, Harte Regel 8): Rechtstexte schreibt und prüft ein Mensch.
// Jede Datei trägt im Kopf stand, quelle, status (entwurf | geprueft) und geprueft (ja | nein). Ein Entwurf ist ein Hinweis, nie ein Fehler;
// eine Datei, die als geprüft gilt, darf keine offenen Fragen (`PRÜFEN:`), keine fehlenden Tatsachen (`[OFFEN`) und keinen Entwurfs-Vermerk mehr enthalten.

const err = (code: string, message: string): Issue => ({ level: "error", code, message });
const warn = (code: string, message: string): Issue => ({ level: "warn", code, message });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DRAFT_NOTE = "ENTWURF, NICHT GEPRÜFT";

/** Dateien, die keine Rechtstexte sind. */
export const LEGAL_IGNORED = new Set(["README.md"]);

export type LegalMeta = { stand: string; geprueft: boolean };

/** Kopf einer Rechtsdatei; null, wenn er unbrauchbar ist (die Gründe liefert checkLegalFile). */
export function parseLegalMeta(raw: string): LegalMeta | null {
  const { data } = matter(raw);
  const stand = typeof data.stand === "string" ? data.stand : data.stand instanceof Date ? data.stand.toISOString().slice(0, 10) : "";
  if (!ISO_DATE.test(stand)) return null;
  return { stand, geprueft: data.geprueft === "ja" && data.status === "geprueft" };
}

export function checkLegalFile(name: string, raw: string): Issue[] {
  const { data, content } = matter(raw);
  const issues: Issue[] = [];
  const stand = data.stand instanceof Date ? data.stand.toISOString().slice(0, 10) : data.stand;

  if (typeof stand !== "string" || !ISO_DATE.test(stand)) issues.push(err("legal-stand", `content/legal/${name}: «stand» fehlt oder ist kein Datum (JJJJ-MM-TT)`));
  if (typeof data.quelle !== "string" || !data.quelle.trim()) issues.push(err("legal-quelle", `content/legal/${name}: «quelle» fehlt`));
  if (data.status !== "entwurf" && data.status !== "geprueft") issues.push(err("legal-status", `content/legal/${name}: «status» muss «entwurf» oder «geprueft» sein`));
  if (data.geprueft !== "ja" && data.geprueft !== "nein") issues.push(err("legal-geprueft", `content/legal/${name}: «geprueft» muss «ja» oder «nein» sein`));
  if (issues.length > 0) return issues;

  const open = (content.match(/PRÜFEN:/g) ?? []).length;
  const missing = (content.match(/\[OFFEN/g) ?? []).length;
  const marked = content.includes(DRAFT_NOTE);

  if (data.status === "geprueft" || data.geprueft === "ja") {
    if (data.status !== "geprueft" || data.geprueft !== "ja") issues.push(err("legal-widerspruch", `content/legal/${name}: «status» und «geprueft» widersprechen sich`));
    for (const field of ["geprueft_von", "geprueft_am"] as const) {
      const value = data[field] instanceof Date ? data[field].toISOString().slice(0, 10) : data[field];
      if (typeof value !== "string" || !value.trim()) issues.push(err("legal-pruefer", `content/legal/${name}: «${field}» fehlt bei einer geprüften Datei`));
    }
    if (open > 0) issues.push(err("legal-offen", `content/legal/${name}: ${open} offene Prüffrage(n) (PRÜFEN:) in einer geprüften Datei`));
    if (missing > 0) issues.push(err("legal-fehlt", `content/legal/${name}: ${missing} fehlende Tatsache(n) ([OFFEN) in einer geprüften Datei`));
    if (marked) issues.push(err("legal-entwurf", `content/legal/${name}: trägt noch den Vermerk «${DRAFT_NOTE}»`));
    return issues;
  }

  if (!marked) issues.push(err("legal-vermerk", `content/legal/${name}: Entwurf ohne den Vermerk «${DRAFT_NOTE}» im Text`));
  issues.push(warn("legal-entwurf", `content/legal/${name}: Entwurf, nicht geprüft (${open} Prüffrage(n), ${missing} fehlende Tatsache(n)). Darf in keinem Werkzeug und auf keiner Seite erscheinen.`));
  return issues;
}
