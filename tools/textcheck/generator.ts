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
/** Binde- und Gedankenstriche: Die KI schreibt oft «-» für «–» oder umgekehrt. */
const STRICHE = "-‐‑‒–—―−";
const escapeChar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Muster für ein Original: Leerraum passt auf jeden Leerraum, jedes Anführungszeichen auf jedes andere derselben Art, jeder Strich auf
 * jeden anderen Strich, und «…» passt auf «...». Sonst gilt Buchstabe für Buchstabe.
 */
function patternOf(original: string): RegExp {
  const chars = [...original.normalize("NFC").trim()];
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "…" || (c === "." && chars[i + 1] === "." && chars[i + 2] === ".")) {
      parts.push("(?:…|\\.\\.\\.)");
      if (c === ".") i += 2;
    } else if (/\s/.test(c)) parts.push("\\s+");
    else if (DOPPELT.includes(c)) parts.push(`[${DOPPELT}]`);
    else if (EINFACH.includes(c)) parts.push(`[${EINFACH}]`);
    else if (STRICHE.includes(c)) parts.push(`[${STRICHE}]`);
    else parts.push(escapeChar(c));
  }
  // Aufeinanderfolgende Leerraum-Muster zu einem zusammenfassen
  return new RegExp(parts.join("").replace(/(?:\\s\+)+/g, "\\s+"), "g");
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** Alle Stellen im Text, an denen das Original steht (auch überdeckte). */
export function locateEvery(text: string, original: string): Span[] {
  if (original.trim() === "") return [];
  return [...text.normalize("NFC").matchAll(patternOf(original))].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}

/** Die erste Stelle im Text, an der das Original steht und die noch nicht belegt ist; null, wenn es keine gibt. */
export function locate(text: string, original: string, taken: readonly Span[] = []): Span | null {
  return locateEvery(text, original).find((span) => !taken.some((t) => overlaps(t, span))) ?? null;
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

/**
 * Die Änderungen, die sich anwenden und anzeigen lassen: Eine Änderung, deren Stelle schon eine frühere derselben Art belegt (oder die gar
 * nicht im Text steht), fällt weg. Eine Verbesserung darf eine Fehler-Stelle überdecken: Verbesserungen setzt die Person selbst ein, nur
 * Fehler setzt das Werkzeug in den korrigierten Text. Die KI darf die Stellen also überdecken, ohne dass die Antwort durchfällt.
 */
export function ohneUeberdeckung(text: string, list: readonly Aenderung[]): Aenderung[] {
  const taken: Record<Art, Span[]> = { fehler: [], stil: [] };
  return list.filter((a) => {
    const span = locate(text, a.original, taken[a.art]);
    if (span) taken[a.art].push(span);
    return span !== null;
  });
}

/** Der Text mit den Änderungen einer Art (Standard: Fehler). Änderungen ohne freie Stelle im Text bleiben weg. `angewendet` zählt die ersetzten Stellen. */
export function anwenden(text: string, list: readonly Aenderung[], art: Art | "alle" = "fehler"): { text: string; angewendet: number } {
  const source = text.normalize("NFC");
  // Nur die gewählten Änderungen belegen Stellen: Eine Verbesserung nimmt einem Fehler nie den Platz.
  const pool = list.filter((a) => art === "alle" || a.art === art);
  const spans = locateAll(source, pool);
  const chosen = pool
    .map((a, i) => ({ a, span: spans[i] }))
    .filter((x): x is { a: Aenderung; span: Span } => x.span !== null)
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

const nfc = (s: string) => s.normalize("NFC").trim();

/** Ziffernblöcke ohne führende Nullen: «07.11.» und «7.11.», «18:30» und «18.30», «12 500» und «12'500» haben dieselben Blöcke. */
const ziffernbloecke = (s: string) => (s.match(/\d+/g) ?? []).map((d) => d.replace(/^0+(?=\d)/, ""));

/** Alle Regeln, die ein Text verletzt (nicht nur die erste): Zeichen, Wörter der Stimme, Absichtssätze. Ohne Rücksicht darauf, was im Text der Person steht. */
function regelnVon(text: string): Set<string> {
  const found = findIssue([text], "");
  return new Set(found ? found.what.split("; ") : []);
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «nichtimtext» (ein Original steht nirgends im Text der Person),
 * «stil» (mehr als fünf Verbesserungen),
 * «gleich» (der Vorschlag ändert nichts: er ist gleich jeder Stelle, die das Original meint; anderer Leerraum zählt als Änderung),
 * «zahl» (der Vorschlag nennt eine Zahl, die im Original nicht steht; Datum, Uhrzeit, Tausendertrenner und führende Nullen sind keine neue Zahl),
 * «vorschlag» (der Vorschlag verletzt eine Regel, die das Original nicht verletzt, oder nennt einen Link, der nicht im Text steht).
 * Überdecken sich zwei Änderungen, fällt die Antwort nicht durch: Die spätere fällt weg (ohneUeberdeckung).
 * Originale und Vorschläge sind wörtliche Texte der Person (verbatimKeys) und werden darum nicht bereinigt.
 */
export function checkTextcheck(output: CheckOutput, input: CheckInput): string | null {
  const source = input.text.normalize("NFC");
  const stellen = output.aenderungen.map((a) => locateEvery(source, a.original));
  if (stellen.some((s) => s.length === 0)) return "nichtimtext";
  if (output.aenderungen.filter((a) => a.art === "stil").length > LIMITS.stil) return "stil";
  for (const [i, a] of output.aenderungen.entries()) {
    const vorschlag = nfc(a.vorschlag);
    if (stellen[i].every((sp) => nfc(source.slice(sp.start, sp.end)) === vorschlag)) return "gleich";
    const bekannt = new Set(numbersIn(a.original));
    if (numbersIn(a.vorschlag).some((n) => !bekannt.has(n))) {
      const bloecke = new Set(ziffernbloecke(a.original));
      if (ziffernbloecke(a.vorschlag).some((b) => !bloecke.has(b))) return "zahl";
    }
    const alt = regelnVon(a.original);
    if ([...regelnVon(a.vorschlag)].some((r) => !alt.has(r))) return "vorschlag";
    if (findIssue([a.vorschlag], input.text)?.what.split("; ").includes("Link oder Adresse")) return "vorschlag";
  }
  return null;
}

// ---- Texte für Ausgabe und CRM -------------------------------------------------------------------

export const ART_TITEL: Record<Art, string> = { fehler: "Fehler", stil: "Verbesserungen" };

/** Die Prüfung als Text für das CRM und zum Kopieren: Gesamteindruck, Fehler, Verbesserungen, korrigierter Text. */
export function kiReport(text: string, out: CheckOutput): string {
  const lines: string[] = ["# Textcheck mit KI", "", `Gesamteindruck: ${out.gesamt}`];
  const list = ohneUeberdeckung(text, out.aenderungen);
  for (const art of ARTEN) {
    const items = list.filter((a) => a.art === art);
    lines.push("", `## ${ART_TITEL[art]}`, "");
    if (items.length === 0) lines.push(art === "fehler" ? "Keine gefunden." : "Keine.");
    else for (const [i, a] of items.entries()) lines.push(`${i + 1}. «${a.original}» → «${a.vorschlag}» (${a.grund})`);
  }
  const korrigiert = anwenden(text, list);
  if (korrigiert.angewendet > 0) lines.push("", "## Korrigierter Text", "", korrigiert.text);
  return lines.join("\n");
}

// ---- Aufgabe -----------------------------------------------------------------------------------

const INSTRUCTION = `Du prüfst den Text einer Person wie eine Lektorin und listest einzelne Änderungen auf. Du schreibst den Text nicht neu. «text» ist der Text der Person.
- «gesamt»: ein bis zwei Sätze Gesamteindruck, ohne Lob und ohne Floskeln (nicht «grundsätzlich», nicht «im Wesentlichen»). Gibt es keine Fehler, sag das.
- «aenderungen»: höchstens 14 Einträge, die wichtigsten zuerst; gibt es nichts zu ändern, eine leere Liste. Jeder Eintrag hat «art», «original», «vorschlag» und «grund».
- «art»: «fehler» für Rechtschreibung, Grammatik, Zeichensetzung, ein falsches oder fehlendes Wort; «stil» für eine klarere oder kürzere Formulierung (höchstens fünf Einträge «stil»).
- «original»: die kleinste Stelle, die sich ändert (ein Wort bis etwa acht Wörter). Kopiere sie Buchstabe für Buchstabe aus dem Text, auch mit Fehlern und Sonderzeichen, ohne Auslassungen. Es muss eine Stelle sein, die so im Text steht.
- Jede Stelle nur einmal: Zwei Einträge dürfen sich nicht überdecken. Gehören zwei Fehler zur selben Stelle, fasse sie in einem Eintrag mit dem längeren «original» zusammen.
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
  // «grund» erklärt, was an der Stelle falsch ist («Prozent», «führende Null», eine Floskel): Dort gelten nur die Zeichenregeln, nicht die Wortlisten der Stimme.
  negativeKeys: ["grund"],
});

export { textcheckGenerator as generator };
export default textcheckGenerator;
