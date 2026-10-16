import { z } from "zod";
import { fold } from "@/lib/branchen";
import { KANTONE } from "@/lib/ch";
import { dataPrompt, defineGenerator, numbersIn, placeholdersIn } from "@/lib/generator";
import type { Profile } from "@/lib/profile";
import type { PageRead } from "@/lib/read";

// Website lesen, Profil vorschlagen (Beschluss vom 09.10.2026: wiederkehrende Fragen nur einmal, beim ersten Mal aus der Website).
// Die KI sieht nur den Text der Startseite, nie das Profil und nie die E-Mail-Adresse. Sie trägt nur ein, was im Text steht; jede
// Angabe wird danach gegen den Text geprüft (check), und der Besucher bestätigt sie in einer Vorschau, bevor etwas ins Profil kommt.
// Läuft über /api/generate wie ein Werkzeug (Zugang v3, Tagesbudget, Prüfung); steht in tools/generators.ts.

export const SCAN_SLUG = "profil-scan";

const inputSchema = z.object({
  website: z.string().max(300),
  titel: z.string().max(200),
  beschreibung: z.string().max(400),
  ueberschriften: z.array(z.string().max(200)).max(20),
  text: z.string().max(6_000),
  /** Ende des Seitentexts (Fusszeile mit Adresse), wenn die Seite lang ist. */
  ende: z.string().max(1_500),
});
export type ScanInput = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  firma: z.string().max(120),
  ort: z.string().max(80),
  kanton: z.string().max(2),
  branche: z.string().max(80),
  beschreibung: z.string().max(400),
});
export type ScanOutput = z.infer<typeof outputSchema>;

/** So viel vom Seitentext geht an die KI; der Rest zählt als «Ende» (Fusszeile mit Adresse und Telefon). */
const TEXT_MAX = 6_000;
const ENDE_MAX = 1_500;

/**
 * Das Ende des Seitentexts: lib/read.ts liefert es als `tail`, wenn die Seite gekürzt wurde (über 8'000 Zeichen). Ist der Text 6'001 bis
 * 8'000 Zeichen lang, fehlt `tail`, und die Fusszeile läge hinter der Grenze; dann kommt das Ende aus dem Text selbst (der Rest hinter
 * 6'000 Zeichen, höchstens die letzten 1'500).
 */
function endeOf(page: PageRead): string {
  if (page.tail) return page.tail.slice(0, ENDE_MAX);
  if (page.text.length <= TEXT_MAX) return "";
  return page.text.slice(Math.max(TEXT_MAX, page.text.length - ENDE_MAX), page.text.length);
}

/** Was der Generator aus der gelesenen Seite bekommt. Der Text wird gekürzt, damit die Anfrage klein und billig bleibt. */
export function scanInput(page: PageRead): ScanInput {
  return {
    website: page.host,
    titel: page.title.slice(0, 200),
    beschreibung: page.description.slice(0, 400),
    ueberschriften: page.headings.slice(0, 20).map((h) => h.slice(0, 200)),
    text: page.text.slice(0, TEXT_MAX),
    ende: endeOf(page),
  };
}

const kantonCodes = new Set<string>(KANTONE.map(([code]) => code));

/** Nur Buchstaben und Ziffern, klein und ohne Akzente: «Beiz "Zum Löwen"» und «Beiz «Zum Löwen»» (typoCH der Prüfung) sind dieselbe Firma. */
const plain = (text: string): string => fold(text).replace(/[^a-z0-9]+/g, "");
const haystack = (i: ScanInput) => plain([i.titel, i.beschreibung, ...i.ueberschriften, i.text, i.ende].join("\n"));
/** Zahlen aus dem Text der Seite, in der Form von numbersIn. */
const haystackText = (i: ScanInput) => fold([i.titel, i.beschreibung, ...i.ueberschriften, i.text, i.ende].join("\n"));

const FELDER_TEXT = ["firma", "ort", "kanton", "branche", "beschreibung"] as const;
const kantonNamen = new Map<string, string>(KANTONE.map(([code, name]) => [plain(name), code]));

/**
 * Das Kantonskürzel in Form: «sg» und «SG.» werden «SG», ausgeschriebene Namen («St. Gallen», «Kanton Zürich», «Zurich») das Kürzel.
 * Ein zweibuchstabiges Kürzel, das kein Kanton ist («XX»), bleibt, wie es ist (dann lehnt die Prüfung es ab); ein längerer Text, der kein Kantonsname
 * ist, wird leer.
 */
export function normalKanton(raw: string): string {
  const value = raw.trim();
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (/^[a-z]{2}$/i.test(letters)) return letters.toUpperCase();
  const name = plain(value.replace(/^kanton\s+/i, ""));
  const code = kantonNamen.get(name) ?? kantonNamen.get(name.replace(/^sankt/, "st"));
  if (code) return code;
  // Kein Kürzel und kein Kantonsname («Schweiz», «Ostschweiz»): Das Feld bleibt leer, statt die Antwort an der Länge scheitern zu lassen.
  return value.length <= 2 ? value : "";
}

export const profilScanGenerator = defineGenerator<ScanInput, ScanOutput>({
  slug: SCAN_SLUG,
  input: inputSchema,
  output: outputSchema,
  maxTokens: 450,
  temperature: 0.2,
  // Fehlende oder leere Felder sind kein Fehler der Antwort (unklar heisst leer); das Kürzel des Kantons kommt in Form.
  normalize: (value) => {
    const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    const out = Object.fromEntries(FELDER_TEXT.map((k) => [k, text(value[k])])) as Record<(typeof FELDER_TEXT)[number], string>;
    out.kanton = normalKanton(out.kanton);
    return out;
  },
  instruction: `Du liest den Text der Startseite eines Schweizer Betriebs und schlägst Angaben für sein Firmenprofil vor. Trage nur ein, was im Text steht.
Antworte mit genau diesem JSON-Objekt: {"firma": "…", "ort": "…", "kanton": "…", "branche": "…", "beschreibung": "…"}.
- firma: Name des Betriebs, genau so geschrieben wie im Text, mit denselben Buchstaben und Zeichen (ohne Slogan und ohne Rechtsform-Zusatz, wenn er ohne ihn vorkommt). Unklar: leere Zeichenkette.
- ort: Ort des Betriebs (Gemeinde), genau so geschrieben wie im Text, aus Adresse, Fusszeile oder Kontakt. Mehrere Orte: der Hauptsitz. Unklar: leere Zeichenkette.
- kanton: Kürzel des Kantons aus zwei Grossbuchstaben (SG, AR, ZH), nie ausgeschrieben und nie klein, nur wenn er aus dem Ort oder der Postleitzahl sicher folgt. Sonst leere Zeichenkette.
- branche: Tätigkeit in ein bis drei Wörtern, so wie Kundschaft sie nennt (zum Beispiel Malerei, Schreinerei, Restaurant, Treuhand). Unklar: leere Zeichenkette.
- beschreibung: ein bis zwei Sätze (höchstens 300 Zeichen), was der Betrieb für wen macht, in eigenen nüchternen Worten und nur mit Aussagen aus dem Text. Übernimm keine Werbesprache der Seite («massgeschneidert», «ganzheitlich», «Leidenschaft»). Unklar: leere Zeichenkette.
- Zahlen in der Beschreibung nur, wenn sie wörtlich im Text stehen. Rechne nichts aus: Aus «seit 1987» wird nicht «über 35 Jahre». Streich die Zahl, wenn du unsicher bist.
Für dieses Werkzeug gilt: Ein unklares Feld bleibt eine leere Zeichenkette (""), schreibe dafür nie einen Platzhalter in eckigen Klammern. Die allgemeine Regel «Fehlt etwas, schreib einen Platzhalter» gilt hier nicht.`,
  prompt: (i) => dataPrompt("Startseite des Betriebs", i),
  check: (out, input) => {
    if (placeholdersIn(out).length > 0) return "platzhalter";
    // Firma und Ort stehen so im Text: verglichen werden nur Buchstaben und Ziffern, damit typoCH der Prüfung («» statt "") nichts ändert.
    const hay = haystack(input);
    if (out.firma && !hay.includes(plain(out.firma))) return "firma-nicht-im-text";
    if (out.ort && !hay.includes(plain(out.ort))) return "ort-nicht-im-text";
    if (out.kanton && !kantonCodes.has(out.kanton)) return "kanton-unbekannt";
    const known = new Set(numbersIn(haystackText(input)));
    if (numbersIn(out.beschreibung).some((n) => !known.has(n))) return "zahl-nicht-im-text";
    return null;
  },
});

/** Felder, die der Scan vorschlägt, in der Reihenfolge der Vorschau. */
export const SCAN_FIELDS = [
  { key: "firma", label: "Firma" },
  { key: "branche", label: "Branche" },
  { key: "ort", label: "Ort" },
  { key: "kanton", label: "Kanton" },
  { key: "beschreibung", label: "Kurzbeschreibung" },
] as const;
export type ScanField = (typeof SCAN_FIELDS)[number]["key"];

export type ScanProposal = { key: ScanField; label: string; current: string; proposed: string; /** Vorgewählt: nur wo das Profil noch leer ist, nie ein vorhandener Eintrag. */ preselected: boolean };

/** Vorschlag je Feld: nur Felder mit Inhalt; vorgewählt sind die, die im Profil noch leer sind (nie still überschreiben). */
export function scanProposals(output: ScanOutput, profile: Profile): ScanProposal[] {
  const out: ScanProposal[] = [];
  for (const { key, label } of SCAN_FIELDS) {
    const proposed = output[key].trim();
    if (!proposed) continue;
    const current = String(profile[key] ?? "").trim();
    if (current === proposed) continue;
    out.push({ key, label, current, proposed, preselected: current === "" });
  }
  return out;
}

/** Die angehakten Vorschläge als Änderung für das Profil. */
export function scanPatch(proposals: ScanProposal[], chosen: ReadonlySet<ScanField>): Partial<Record<ScanField, string>> {
  const patch: Partial<Record<ScanField, string>> = {};
  for (const p of proposals) if (chosen.has(p.key)) patch[p.key] = p.proposed;
  return patch;
}
