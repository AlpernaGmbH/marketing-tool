import { z } from "zod";
import { dataPrompt, defineGenerator, findIssue, numbersIn } from "@/lib/generator";

// Generator des Textchecks «Mit KI prüfen» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4): Ein Aufruf liefert eine Liste einzelner Änderungen
// (Original, Vorschlag, Grund) statt eines neu geschriebenen Textes. Jedes Original muss im Text der Person stehen; die korrigierte
// Fassung setzt das Werkzeug selbst aus den geprüften Änderungen zusammen. Läuft im Browser und auf dem Server: nur zod, Strings und
// reine Funktionen. Die Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

/** Länge des Textes, den die KI prüft (wie im Text-Umschreiber). Längere Texte prüft die Person abschnittsweise. */
export const TEXT_MAX = 3000;
export const LIMITS = { original: 200, vorschlag: 240, grund: 120, gesamt: 300, aenderungen: 14, stil: 5 } as const;

export const checkInput = z.object({ text: z.string().trim().min(1).max(TEXT_MAX) });
export type CheckInput = z.infer<typeof checkInput>;

export const ARTEN = ["fehler", "stil"] as const;
export type Art = (typeof ARTEN)[number];

const aenderungSchema = z.object({
  art: z.enum(ARTEN),
  original: z.string().trim().min(1).max(LIMITS.original),
  vorschlag: z.string().trim().min(1).max(LIMITS.vorschlag),
  grund: z.string().trim().min(5).max(LIMITS.grund),
});
export type Aenderung = z.infer<typeof aenderungSchema>;

export const checkOutput = z.object({
  gesamt: z.string().trim().min(10).max(LIMITS.gesamt),
  aenderungen: z.array(aenderungSchema).max(LIMITS.aenderungen),
});
export type CheckOutput = z.infer<typeof checkOutput>;

// ---- Stellen im Text finden und anwenden -------------------------------------------------------

export type Span = { start: number; end: number };

const DOPPELT = '"“”„«»';
const EINFACH = "'’‘´";
const escapeChar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Muster für ein Original: Leerraum passt auf jeden Leerraum, jedes Anführungszeichen auf jedes andere derselben Art. */
function patternOf(original: string): RegExp {
  const parts = [...original.normalize("NFC").trim()].map((c) => (/\s/.test(c) ? "\\s+" : DOPPELT.includes(c) ? `[${DOPPELT}]` : EINFACH.includes(c) ? `[${EINFACH}]` : escapeChar(c)));
  // Aufeinanderfolgende Leerraum-Muster zu einem zusammenfassen
  return new RegExp(parts.join("").replace(/(?:\\s\+)+/g, "\\s+"), "g");
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Die erste Stelle im Text, an der das Original steht und die noch nicht belegt ist; null, wenn es keine gibt. */
export function locate(text: string, original: string, taken: readonly Span[] = []): Span | null {
  if (original.trim() === "") return null;
  for (const m of text.normalize("NFC").matchAll(patternOf(original))) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length };
    if (!taken.some((t) => overlaps(t, span))) return span;
  }
  return null;
}

/** Findet für jede Änderung ihre Stelle, der Reihe nach, ohne dass sich zwei Stellen überdecken. `null` an der Stelle einer Änderung ohne Treffer. */
export function locateAll(text: string, list: readonly Aenderung[]): (Span | null)[] {
  const taken: Span[] = [];
  return list.map((a) => {
    const span = locate(text, a.original, taken);
    if (span) taken.push(span);
    return span;
  });
}

/** Der Text mit den Änderungen einer Art (Standard: Fehler). Änderungen ohne Stelle im Text bleiben weg. `angewendet` zählt die ersetzten Stellen. */
export function anwenden(text: string, list: readonly Aenderung[], art: Art | "alle" = "fehler"): { text: string; angewendet: number } {
  const source = text.normalize("NFC");
  const spans = locateAll(source, list);
  const chosen = list
    .map((a, i) => ({ a, span: spans[i] }))
    .filter((x): x is { a: Aenderung; span: Span } => x.span !== null && (art === "alle" || x.a.art === art))
    .sort((x, y) => x.span.start - y.span.start);
  let out = "";
  let pos = 0;
  for (const { a, span } of chosen) {
    out += source.slice(pos, span.start) + a.vorschlag;
    pos = span.end;
  }
  return { text: out + source.slice(pos), angewendet: chosen.length };
}

// ---- Prüfung -----------------------------------------------------------------------------------

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «nichtimtext» (ein Original steht nicht im Text der Person oder deckt eine schon belegte Stelle),
 * «gleich» (der Vorschlag ändert nichts),
 * «zahl» (der Vorschlag nennt eine Ziffernfolge, die im Original nicht steht),
 * «vorschlag» (der Vorschlag bringt ein verbotenes Zeichen, Wort oder einen Link mit, den das Original nicht hat).
 * Originale und Vorschläge sind wörtliche Texte der Person (verbatimKeys) und werden darum nicht bereinigt.
 */
export function checkTextcheck(output: CheckOutput, input: CheckInput): string | null {
  const spans = locateAll(input.text, output.aenderungen);
  if (spans.some((s) => s === null)) return "nichtimtext";
  if (output.aenderungen.filter((a) => a.art === "stil").length > LIMITS.stil) return "stil";
  for (const a of output.aenderungen) {
    if (norm(a.vorschlag) === norm(a.original)) return "gleich";
    const bekannt = new Set(numbersIn(a.original));
    if (numbersIn(a.vorschlag).some((n) => !bekannt.has(n))) return "zahl";
    const neu = findIssue([a.vorschlag], input.text);
    if (neu && findIssue([a.original], input.text)?.what !== neu.what) return "vorschlag";
  }
  return null;
}

// ---- Texte für Ausgabe und CRM -------------------------------------------------------------------

export const ART_TITEL: Record<Art, string> = { fehler: "Fehler", stil: "Verbesserungen" };

/** Die Prüfung als Text für das CRM und zum Kopieren: Gesamteindruck, Fehler, Verbesserungen, korrigierter Text. */
export function kiReport(text: string, out: CheckOutput): string {
  const lines: string[] = ["# Textcheck mit KI", "", `Gesamteindruck: ${out.gesamt}`];
  for (const art of ARTEN) {
    const items = out.aenderungen.filter((a) => a.art === art);
    lines.push("", `## ${ART_TITEL[art]}`, "");
    if (items.length === 0) lines.push(art === "fehler" ? "Keine gefunden." : "Keine.");
    else for (const [i, a] of items.entries()) lines.push(`${i + 1}. «${a.original}» → «${a.vorschlag}» (${a.grund})`);
  }
  const korrigiert = anwenden(text, out.aenderungen);
  if (korrigiert.angewendet > 0) lines.push("", "## Korrigierter Text", "", korrigiert.text);
  return lines.join("\n");
}

// ---- Aufgabe -----------------------------------------------------------------------------------

const INSTRUCTION = `Du prüfst den Text einer Person wie eine Lektorin und listest einzelne Änderungen auf. Du schreibst den Text nicht neu. «text» ist der Text der Person.
- «gesamt»: ein bis zwei Sätze Gesamteindruck, ohne Lob und ohne Floskeln. Gibt es keine Fehler, sag das.
- «aenderungen»: höchstens 14 Einträge, die wichtigsten zuerst; gibt es nichts zu ändern, eine leere Liste. Jeder Eintrag hat «art», «original», «vorschlag» und «grund».
- «art»: «fehler» für Rechtschreibung, Grammatik, Zeichensetzung, ein falsches oder fehlendes Wort; «stil» für eine klarere oder kürzere Formulierung (höchstens fünf Einträge «stil»).
- «original»: die kleinste Stelle, die sich ändert (ein Wort bis etwa acht Wörter). Kopiere sie Buchstabe für Buchstabe aus dem Text, auch mit Fehlern und Sonderzeichen, ohne Auslassungen. Es muss eine Stelle sein, die so im Text steht.
- «vorschlag»: der Ersatz für genau diese Stelle. Ändere nur, was nötig ist. Erfinde keine Zahlen, Namen, Links oder Fakten.
- «grund»: ein kurzer Satz (höchstens 100 Zeichen), was falsch ist oder warum es besser ist. Zitiere darin keine Wörter aus dem Text.
- Es gilt die Schweizer Schreibweise: «ss» statt «ß». Mach aus Schweizer Wörtern keine deutschen (Velo, Trottoir, Znüni, Perron bleiben).
- Kein Eintrag für etwas, das richtig ist, und keiner, dessen Vorschlag gleich dem Original ist.
Form: {"gesamt": "…", "aenderungen": [{"art": "fehler", "original": "…", "vorschlag": "…", "grund": "…"}]}`;

export const textcheckGenerator = defineGenerator({
  slug: "textcheck",
  input: checkInput,
  output: checkOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Text der Person", i),
  maxTokens: 2600,
  temperature: 0.2,
  check: checkTextcheck,
  verbatimKeys: ["original", "vorschlag"],
});

export { textcheckGenerator as generator };
export default textcheckGenerator;
