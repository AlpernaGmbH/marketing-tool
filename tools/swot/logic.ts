import { parseState as parseQuestionnaireState } from "@/components/tool/questionnaire";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { SLUG as CHECK_SLUG, parseCheckState, type SavedCheck } from "@/tools/digitaler-auftritt-check/logic";
import { SLUG as REIFEGRAD_SLUG, checkInfo, evaluate, groesseLabel, type CheckInfo } from "@/tools/reifegrad-check/logic";
import { MAX_FAKTEN, MAX_FAKT_CHARS, MAX_FELD_CHARS, MAX_ZIEL_CHARS, swotInput, swotOutput, type Punkt, type SwotInput, type SwotOutput } from "./generator";

// SWOT-Analyse: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Der deterministische Teil sammelt Fakten aus den gespeicherten Ergebnissen des Marketing-Checks
// (mt:digitaler-auftritt-check) und des Reifegrad-Checks (mt:reifegrad-check). Den Entwurf macht /api/generate
// über generator.ts. Spec: specs/swot.md

export const SLUG = "swot";
export { CHECK_SLUG, REIFEGRAD_SLUG };

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

// ---- Die vier Felder -------------------------------------------------------------------------------

export const FELDER = [
  { key: "staerken", label: "Stärken", frage: "Was läuft gut?", help: "Im Betrieb: Angebot, Team, Stammkundschaft, Ruf in der Region, was Kundschaft lobt." },
  { key: "schwaechen", label: "Schwächen", frage: "Was fehlt oder nervt?", help: "Im Betrieb: keine Zeit fürs Marketing, Website veraltet, wenig Bewertungen, Auftritt nicht einheitlich." },
  { key: "chancen", label: "Chancen", frage: "Was verändert sich um dich herum?", help: "Neue Quartiere, Bauprojekte, Wegfall eines Mitbewerbers, Trends in der Region." },
  { key: "risiken", label: "Risiken", frage: "Was könnte dir schaden?", help: "Von aussen: neue Mitbewerber, Preisdruck, weniger Nachfrage, neue Vorschriften, Abhängigkeit von einem Kanal." },
] as const;
export type FeldKey = (typeof FELDER)[number]["key"];

export function feldLabel(key: FeldKey): string {
  return FELDER.find((f) => f.key === key)?.label ?? key;
}

/** Zeichen je Schriftzeichen (nicht je Code-Einheit), für die Anzeige «n von 600 Zeichen». */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Fakten aus den gespeicherten Checks ------------------------------------------------------------

export type Fakt = { text: string; quelle: string; feld: "staerken" | "schwaechen" };

export const QUELLE_CHECK = "aus deinem Marketing-Check";
export const QUELLE_REIFEGRAD = "aus deinem Reifegrad-Check";

/** Schwellen (Annahme dieses Werkzeugs, keine Statistik): ab 0,75 stark, unter 0,4 schwach; dazwischen kein Fakt. */
export const CHECK_STARK = 0.75;
export const CHECK_SCHWACH = 0.4;

/** Ab dieser Punktzahl gilt ein Gleichstand aller Dimensionen als Stärke, darunter als Schwäche (Mitte der Skala). */
export const REIFEGRAD_MITTE = 50;

export type Fakten = {
  fakten: Fakt[];
  /** Ein Ergebnis des Marketing-Checks ist gespeichert. */
  hatCheck: boolean;
  /** Ein Ergebnis des Reifegrad-Checks ist gespeichert. */
  hatReifegrad: boolean;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Fakten aus dem Marketing-Check: Bereiche mit Gewicht, die klar stark oder klar schwach sind. */
export function faktenAusCheck(saved: SavedCheck): Fakt[] {
  if (saved.phase !== "result" || !saved.result) return [];
  const out: Fakt[] = [];
  for (const c of saved.result.categories) {
    if (typeof c !== "object" || c === null) continue;
    const { title, score, weight } = c as { title?: unknown; score?: unknown; weight?: unknown };
    if (typeof title !== "string" || !title.trim()) continue;
    if (typeof weight !== "number" || !(weight > 0)) continue;
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    const n = Math.round(clamp01(score) * 100);
    if (score >= CHECK_STARK) out.push({ text: `Bereich «${title}» ist stark (${n} von 100)`, quelle: QUELLE_CHECK, feld: "staerken" });
    else if (score < CHECK_SCHWACH) out.push({ text: `Bereich «${title}» ist schwach (${n} von 100)`, quelle: QUELLE_CHECK, feld: "schwaechen" });
  }
  return out;
}

const ZAHLWORT: Record<number, string> = { 3: "drei", 4: "vier", 5: "fünf" };

/**
 * Fakten aus dem Reifegrad-Check: stärkste Dimension als Stärke, schwächste als Schwäche. Gerechnet wie im Werkzeug selbst
 * (evaluate mit dem gespeicherten Website-Scan); Dimensionen ohne Wert (kein Scan) zählen nicht. Liegen alle bewerteten
 * Dimensionen gleichauf, gibt es einen Fakt.
 */
export function faktenAusReifegrad(raw: unknown, check: CheckInfo | null): Fakt[] {
  const saved = parseQuestionnaireState(raw);
  if (saved.phase !== "result") return [];
  const result = evaluate(saved.answers, check);
  const bewertet = result.dimensionen.filter((d): d is typeof d & { score: number; stufe: NonNullable<typeof d.stufe> } => d.score !== null && d.stufe !== null);
  let best = bewertet[0];
  let worst = bewertet[0];
  for (const d of bewertet) {
    if (d.score > best.score) best = d;
    if (d.score < worst.score) worst = d;
  }
  if (best.score === worst.score) {
    return [
      {
        text: `Reifegrad: alle ${ZAHLWORT[bewertet.length] ?? bewertet.length} Dimensionen liegen bei ${best.score} von 100 (Stufe «${result.stufe}»)`,
        quelle: QUELLE_REIFEGRAD,
        feld: best.score >= REIFEGRAD_MITTE ? "staerken" : "schwaechen",
      },
    ];
  }
  return [
    { text: `Reifegrad: «${best.name}» ist die stärkste Dimension (${best.score} von 100, Stufe «${best.stufe}»)`, quelle: QUELLE_REIFEGRAD, feld: "staerken" },
    { text: `Reifegrad: «${worst.name}» ist die schwächste Dimension (${worst.score} von 100, Stufe «${worst.stufe}»)`, quelle: QUELLE_REIFEGRAD, feld: "schwaechen" },
  ];
}

/** Alle Fakten aus beiden gespeicherten Ständen (roh aus dem Browser). Kaputte Stände ergeben keine Fakten. */
export function faktenAus(checkRaw: unknown, reifegradRaw: unknown): Fakten {
  const check = parseCheckState(checkRaw);
  const hatCheck = check.phase === "result" && Boolean(check.result);
  const hatReifegrad = parseQuestionnaireState(reifegradRaw).phase === "result";
  const fakten = [...faktenAusCheck(check), ...faktenAusReifegrad(reifegradRaw, checkInfo(check))]
    .map((f) => ({ ...f, text: f.text.slice(0, MAX_FAKT_CHARS) }))
    .slice(0, MAX_FAKTEN);
  return { fakten, hatCheck, hatReifegrad };
}

// ---- Eingabe -----------------------------------------------------------------------------------

export type FormValues = Record<FeldKey, string> & { ziel: string };
export const EMPTY_FORM: FormValues = { staerken: "", schwaechen: "", chancen: "", risiken: "", ziel: "" };

export type ProfileFields = { firma?: string; branche?: string; ort?: string; groesse?: string; positionierung?: string };

/** Einzeilig, ohne doppelte Leerzeichen, gekürzt. */
export function clipLine(s: string | undefined, max: number): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

/** Mehrzeilig (Zeilenumbrüche bleiben), ohne doppelte Leerzeichen, gekürzt. */
export function clipText(s: string | undefined, max: number): string {
  return (s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. */
export function inputProblem(fields: ProfileFields, form: FormValues): string | null {
  if (!clipLine(fields.firma, 120)) return "Gib den Namen deiner Firma oder deines Vereins an.";
  if (FELDER.every((f) => form[f.key].trim() === "")) return "Fülle mindestens eines der vier Felder aus: Stärken, Schwächen, Chancen oder Risiken.";
  for (const f of FELDER) {
    if (form[f.key].length > MAX_FELD_CHARS) return `«${f.label}» hat mehr als ${MAX_FELD_CHARS} Zeichen. Kürze den Text.`;
  }
  if (form.ziel.length > MAX_ZIEL_CHARS) return `Das Ziel hat mehr als ${MAX_ZIEL_CHARS} Zeichen. Kürze den Text.`;
  return null;
}

/** Eingabe des Generators aus Profil, Formular und Fakten. Die Grösse geht als Wort («10 bis 49 Mitarbeitende»). */
export function toInput(fields: ProfileFields, form: FormValues, fakten: readonly Fakt[]): SwotInput {
  const groesse = clipLine(fields.groesse, 60);
  return {
    betrieb: clipLine(fields.firma, 120),
    branche: clipLine(fields.branche, 120),
    ort: clipLine(fields.ort, 80),
    groesse: groesse ? clipLine(groesseLabel(groesse), 60) : "",
    positionierung: clipText(fields.positionierung, MAX_FELD_CHARS),
    ziel: clipText(form.ziel, MAX_ZIEL_CHARS),
    staerken: clipText(form.staerken, MAX_FELD_CHARS),
    schwaechen: clipText(form.schwaechen, MAX_FELD_CHARS),
    chancen: clipText(form.chancen, MAX_FELD_CHARS),
    risiken: clipText(form.risiken, MAX_FELD_CHARS),
    fakten: fakten.map((f) => clipLine(f.text, MAX_FAKT_CHARS)).filter(Boolean).slice(0, MAX_FAKTEN),
  };
}

const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " · ");

/** Die Angaben fürs CRM, eine je Zeile. Das Wichtigste steht oben; der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: SwotInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    input.groesse ? `Grösse: ${input.groesse}` : "",
    input.ziel ? `Ziel (zwölf Monate): ${oneLine(input.ziel)}` : "",
    ...FELDER.map((f) => (input[f.key] ? `${f.label}: ${oneLine(input[f.key])}` : "")),
    input.positionierung ? `Positionierung: ${oneLine(input.positionierung)}` : "",
    input.fakten.length > 0 ? `Fakten aus Checks: ${input.fakten.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ----------------------------------------------------------------------------------

/** «Punkt: Warum», ohne doppelten Punkt am Ende des ersten Teils. */
export function punktZeile(p: Punkt): string {
  return `${p.punkt.trim().replace(/[.:;]+$/, "")}: ${p.warum.trim()}`;
}

/** Die Folgerungen als Tabelle, für Anzeige und Export gleich. */
export function folgerungenTabelle(output: SwotOutput): DocBlock {
  return {
    type: "table",
    header: ["Massnahme", "Nutzt", "Behebt", "Aufwand"],
    widths: [3, 1.6, 1.6, 0.9],
    rows: output.folgerungen.map((f) => [f.massnahme, f.nutzt, f.behebt.trim() || "–", f.aufwand]),
  };
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: SwotOutput, input: SwotInput): DocumentModel {
  const facts: { label: string; value: string }[] = [{ label: "Betrieb", value: input.ort ? `${input.betrieb}, ${input.ort}` : input.betrieb }];
  if (input.branche) facts.push({ label: "Branche", value: input.branche });
  if (input.ziel) facts.push({ label: "Ziel (zwölf Monate)", value: input.ziel });

  const blocks: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: "Die Lage in einem Satz" },
    { type: "paragraph", text: output.einSatz },
  ];
  for (const f of FELDER) {
    blocks.push({ type: "heading", level: 1, text: f.label }, { type: "list", items: output[f.key].map(punktZeile) });
  }
  blocks.push({ type: "heading", level: 1, text: "Daraus folgt" }, folgerungenTabelle(output));
  if (input.fakten.length > 0) {
    blocks.push({ type: "heading", level: 1, text: "Fakten aus deinen Checks" }, { type: "list", items: input.fakten });
  }
  return {
    title: "SWOT-Analyse",
    subtitle: `Marketing von ${input.betrieb}`,
    firma: input.betrieb,
    filename: `swot-${safeFilename(input.betrieb, "betrieb")}`,
    blocks,
  };
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: SwotOutput, input: SwotInput): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type SwotState = { v: 1; form: FormValues; input: SwotInput | null; output: SwotOutput | null };

export const EMPTY_STATE: SwotState = { v: 1, form: EMPTY_FORM, input: null, output: null };

function parseForm(raw: unknown): FormValues {
  if (typeof raw !== "object" || raw === null) return EMPTY_FORM;
  const r = raw as Partial<Record<keyof FormValues, unknown>>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return {
    staerken: text(r.staerken, MAX_FELD_CHARS),
    schwaechen: text(r.schwaechen, MAX_FELD_CHARS),
    chancen: text(r.chancen, MAX_FELD_CHARS),
    risiken: text(r.risiken, MAX_FELD_CHARS),
    ziel: text(r.ziel, MAX_ZIEL_CHARS),
  };
}

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Entwurf und Eingabe fallen nur zusammen weg. */
export function parseState(raw: unknown): SwotState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<SwotState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = swotInput.safeParse(r.input);
  const output = swotOutput.safeParse(r.output);
  const ok = input.success && output.success;
  return { v: 1, form: parseForm(r.form), input: ok ? input.data : null, output: ok ? output.data : null };
}
