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

/** Was der Generator aus der gelesenen Seite bekommt. Der Text wird gekürzt, damit die Anfrage klein und billig bleibt. */
export function scanInput(page: PageRead): ScanInput {
  return {
    website: page.host,
    titel: page.title.slice(0, 200),
    beschreibung: page.description.slice(0, 400),
    ueberschriften: page.headings.slice(0, 20).map((h) => h.slice(0, 200)),
    text: page.text.slice(0, 6_000),
    ende: (page.tail ?? "").slice(0, 1_500),
  };
}

const kantonCodes = new Set<string>(KANTONE.map(([code]) => code));

const haystack = (i: ScanInput) => fold([i.titel, i.beschreibung, ...i.ueberschriften, i.text, i.ende].join("\n"));

export const profilScanGenerator = defineGenerator<ScanInput, ScanOutput>({
  slug: SCAN_SLUG,
  input: inputSchema,
  output: outputSchema,
  maxTokens: 450,
  temperature: 0.2,
  instruction: `Du liest den Text der Startseite eines Schweizer Betriebs und schlägst Angaben für sein Firmenprofil vor. Trage nur ein, was im Text steht.
Antworte mit genau diesem JSON-Objekt: {"firma": "…", "ort": "…", "kanton": "…", "branche": "…", "beschreibung": "…"}.
- firma: Name des Betriebs, wie er im Text steht (ohne Slogan und ohne Rechtsform-Zusatz, wenn er ohne ihn vorkommt). Unklar: leere Zeichenkette.
- ort: Ort des Betriebs (Gemeinde), aus Adresse, Fusszeile oder Kontakt. Mehrere Orte: der Hauptsitz. Unklar: leere Zeichenkette.
- kanton: Kürzel des Kantons aus zwei Grossbuchstaben (zum Beispiel SG, AR, ZH), nur wenn er aus dem Ort oder der Postleitzahl sicher folgt. Sonst leere Zeichenkette.
- branche: Tätigkeit in ein bis drei Wörtern, so wie Kundschaft sie nennt (zum Beispiel Malerei, Schreinerei, Restaurant, Treuhand). Unklar: leere Zeichenkette.
- beschreibung: ein bis zwei Sätze (höchstens 300 Zeichen), was der Betrieb für wen macht, in eigenen nüchternen Worten und nur mit Aussagen aus dem Text. Keine Zahlen, die nicht im Text stehen. Unklar: leere Zeichenkette.
Für dieses Werkzeug gilt: Ein unklares Feld bleibt eine leere Zeichenkette, schreibe dafür nie einen Platzhalter in eckigen Klammern.`,
  prompt: (i) => dataPrompt("Startseite des Betriebs", i),
  check: (out, input) => {
    if (placeholdersIn(out).length > 0) return "platzhalter";
    const hay = haystack(input);
    if (out.firma && !hay.includes(fold(out.firma))) return "firma-nicht-im-text";
    if (out.ort && !hay.includes(fold(out.ort))) return "ort-nicht-im-text";
    if (out.kanton && !kantonCodes.has(out.kanton)) return "kanton-unbekannt";
    const known = new Set(numbersIn(hay));
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
