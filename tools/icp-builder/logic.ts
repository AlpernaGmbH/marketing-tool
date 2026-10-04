import { KANTONE } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { GROESSEN, type Profile, type ProfileKey } from "@/lib/profile";
import { LIMITS, icpInput, icpOutput, punkteSumme, type IcpInput, type IcpOutput } from "./generator";

// ICP-Builder: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Eingabeprüfung, Eingabe für die KI, die Punktekarte
// im Browser, das Dokument, der Profil-Patch und der gespeicherte Stand.
// Spec: specs/icp-builder.md

export const SLUG = "icp-builder";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

/** Grenzen der Einordnung in Prozent der möglichen Punkte. Richtwert von Alperna, keine Statistik. */
export const BEWERTUNG = { passt: 50, sehrGut: 80 } as const;
export const BEWERTUNG_HINWEIS = `Richtwert dieses Werkzeugs, keine Statistik: unter ${BEWERTUNG.passt} % der Punkte passt eine Anfrage eher nicht, ab ${BEWERTUNG.passt} % passt sie, ab ${BEWERTUNG.sehrGut} % passt sie sehr gut.`;

// ---- Formular ----------------------------------------------------------------------------------

/** Die fünf eigenen Felder des Formulars; die Grunddaten kommen aus dem Firmenprofil. */
export type FormFields = {
  angebot: string;
  besteKunden: string;
  einzugsgebiet: string;
  auftrag: string;
  nichtPassend: string;
};

export const EMPTY_FORM: FormFields = { angebot: "", besteKunden: "", einzugsgebiet: "", auftrag: "", nichtPassend: "" };

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort" | "kanton" | "groesse" | "organisationstyp">;

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clipText = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** Name des Kantons aus dem Kürzel («SG» → «St. Gallen»); unbekannte Werte bleiben, wie sie sind. */
export function kantonName(code?: string): string {
  const c = (code ?? "").trim();
  if (!c) return "";
  return KANTONE.find(([k]) => k === c)?.[1] ?? c;
}

/** Label-Text der Grösse («1-9» → «1 bis 9 Mitarbeitende»); unbekannte Werte bleiben, wie sie sind. */
export function groesseLabel(value?: string, type: "kmu" | "verein" = "kmu"): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const lists = type === "verein" ? [GROESSEN.verein, GROESSEN.kmu] : [GROESSEN.kmu, GROESSEN.verein];
  for (const list of lists) {
    const hit = (list as readonly { value: string; label: string }[]).find((g) => g.value === v);
    if (hit) return hit.label;
  }
  return v;
}

/** Vorschlag für das Einzugsgebiet aus Ort und Kanton: «Gossau und Umgebung, Kanton St. Gallen». */
export function einzugsgebietVorschlag(ort?: string, kanton?: string): string {
  const o = clip(ort, 80);
  const k = kantonName(kanton);
  if (o && k) return `${o} und Umgebung, Kanton ${k}`;
  if (o) return `${o} und Umgebung`;
  if (k) return `Kanton ${k}`;
  return "";
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. */
export function formProblem(fields: FormFields, profile: ProfileFields): string | null {
  if (!clip(profile.firma, 120)) return "Gib den Namen deines Betriebs an.";
  const angebot = fields.angebot.trim();
  if (angebot.length < LIMITS.angebot.min) return `Beschreib dein Angebot mit mindestens ${LIMITS.angebot.min} Zeichen.`;
  if (angebot.length > LIMITS.angebot.max) return `Das Angebot ist zu lang. Es sind höchstens ${LIMITS.angebot.max} Zeichen möglich.`;
  const kunden = fields.besteKunden.trim();
  if (kunden.length < LIMITS.besteKunden.min) return `Beschreib deine besten Kunden mit mindestens ${LIMITS.besteKunden.min} Zeichen.`;
  if (kunden.length > LIMITS.besteKunden.max) return `Die Beschreibung deiner besten Kunden ist zu lang. Es sind höchstens ${LIMITS.besteKunden.max} Zeichen möglich.`;
  if (fields.einzugsgebiet.trim().length > LIMITS.einzugsgebiet.max) return `Das Einzugsgebiet ist zu lang. Es sind höchstens ${LIMITS.einzugsgebiet.max} Zeichen möglich.`;
  if (fields.auftrag.trim().length > LIMITS.auftrag.max) return `Der typische Auftrag ist zu lang. Es sind höchstens ${LIMITS.auftrag.max} Zeichen möglich.`;
  if (fields.nichtPassend.trim().length > LIMITS.nichtPassend.max) return `Die Angabe zu unpassenden Anfragen ist zu lang. Es sind höchstens ${LIMITS.nichtPassend.max} Zeichen möglich.`;
  return null;
}

/** Eingabe des Generators aus Profil und Formular. Leeres Einzugsgebiet: der Vorschlag aus Ort und Kanton. */
export function toInput(profile: ProfileFields, fields: FormFields): IcpInput {
  const ort = clip(profile.ort, 120);
  return {
    betrieb: clip(profile.firma, 120),
    branche: clip(profile.branche, 120),
    ort,
    kanton: clip(kantonName(profile.kanton), 120),
    groesse: clip(groesseLabel(profile.groesse, profile.organisationstyp ?? "kmu"), 120),
    angebot: clipText(fields.angebot, LIMITS.angebot.max),
    besteKunden: clipText(fields.besteKunden, LIMITS.besteKunden.max),
    einzugsgebiet: clip(fields.einzugsgebiet, LIMITS.einzugsgebiet.max) || clip(einzugsgebietVorschlag(profile.ort, profile.kanton), LIMITS.einzugsgebiet.max),
    auftrag: clip(fields.auftrag, LIMITS.auftrag.max),
    nichtPassend: clipText(fields.nichtPassend, LIMITS.nichtPassend.max),
  };
}

/** Die fünf Felder aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function formFrom(input: IcpInput | null): FormFields {
  if (!input) return EMPTY_FORM;
  return { angebot: input.angebot, besteKunden: input.besteKunden, einzugsgebiet: input.einzugsgebiet, auftrag: input.auftrag, nichtPassend: input.nichtPassend };
}

/** Die Angaben fürs CRM, eine je Zeile. Der Server kürzt auf 1'900 Zeichen; das Wichtigste steht darum oben. */
export function eingabeText(input: IcpInput): string {
  const line = (label: string, value: string) => (value ? `${label}: ${value.replace(/\s*\n\s*/g, " ")}` : "");
  return [
    line("Betrieb", input.betrieb),
    line("Branche", input.branche),
    line("Ort", input.ort),
    line("Kanton", input.kanton),
    line("Grösse", input.groesse),
    line("Einzugsgebiet", input.einzugsgebiet),
    line("Typischer Auftrag", input.auftrag),
    line("Angebot", input.angebot),
    line("Beste Kunden", input.besteKunden),
    line("Nicht passende Anfragen", input.nichtPassend),
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Punktekarte -------------------------------------------------------------------------------

/** Die Punktzahl, die eine Anfrage höchstens erreicht. */
export function maxPunkte(output: Pick<IcpOutput, "punktekarte">): number {
  return punkteSumme(output);
}

export type Stufe = "nein" | "passt" | "sehr";

export const STUFEN: Record<Stufe, string> = {
  nein: "passt eher nicht",
  passt: "passt",
  sehr: "passt sehr gut",
};

export type Bewertung = { punkte: number; max: number; prozent: number; stufe: Stufe; text: string };

/** Einordnung nach Anteil der Punkte; mit ganzen Zahlen gerechnet, damit keine Rundung die Stufe verschiebt. */
export function einordnung(punkte: number, max: number): Stufe {
  if (max <= 0 || punkte <= 0) return "nein";
  if (punkte * 100 >= max * BEWERTUNG.sehrGut) return "sehr";
  if (punkte * 100 >= max * BEWERTUNG.passt) return "passt";
  return "nein";
}

/**
 * «Anfrage bewerten»: zählt die Punkte der angekreuzten Kriterien (ein Eintrag je Kriterium, in der Reihenfolge der
 * Punktekarte) und ordnet die Summe ein. Die Kreuze leben nur im Browser.
 */
export function bewerten(output: Pick<IcpOutput, "punktekarte">, angekreuzt: readonly boolean[]): Bewertung {
  const max = maxPunkte(output);
  const punkte = output.punktekarte.reduce((sum, k, i) => sum + (angekreuzt[i] ? k.punkte : 0), 0);
  const prozent = max > 0 ? Math.round((punkte * 100) / max) : 0;
  const stufe = einordnung(punkte, max);
  return { punkte, max, prozent, stufe, text: STUFEN[stufe] };
}

/** «3 Punkte» / «1 Punkt». */
export function punkteText(n: number): string {
  return `${n} ${n === 1 ? "Punkt" : "Punkte"}`;
}

// ---- Dokument ----------------------------------------------------------------------------------

export const ABSCHNITTE: { key: keyof Pick<IcpOutput, "merkmale" | "ausloeser" | "einwaende" | "signale" | "nichtIdeal">; titel: string }[] = [
  { key: "merkmale", titel: "Wer sie sind" },
  { key: "ausloeser", titel: "Wann sie kaufen" },
  { key: "einwaende", titel: "Was sie zögern lässt" },
  { key: "signale", titel: "Woran du eine passende Anfrage erkennst" },
  { key: "nichtIdeal", titel: "Anfragen, die nicht passen" },
];

export const PUNKTEKARTE_TITEL = "Punktekarte: neue Anfragen bewerten";

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: IcpOutput, input: Pick<IcpInput, "betrieb" | "branche" | "einzugsgebiet">): DocumentModel {
  const facts: { label: string; value: string }[] = [{ label: "Betrieb", value: input.betrieb || "keine Angabe" }];
  if (input.branche) facts.push({ label: "Branche", value: input.branche });
  if (input.einzugsgebiet) facts.push({ label: "Einzugsgebiet", value: input.einzugsgebiet });

  const blocks: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: output.segmentName },
    { type: "paragraph", text: output.beschreibung },
  ];
  for (const a of ABSCHNITTE) {
    blocks.push({ type: "heading", level: 2, text: a.titel }, { type: "list", items: output[a.key] });
  }
  const max = maxPunkte(output);
  blocks.push(
    { type: "heading", level: 1, text: PUNKTEKARTE_TITEL },
    {
      type: "paragraph",
      text: `Geh jede neue Anfrage durch und zähle die Punkte der Kriterien, die zutreffen. Höchstens ${punkteText(max)}.`,
    },
    {
      type: "table",
      header: ["Kriterium", "Punkte", "Warum"],
      rows: output.punktekarte.map((k) => [k.kriterium, String(k.punkte), k.warum]),
      widths: [3, 1, 4],
    },
    { type: "paragraph", text: BEWERTUNG_HINWEIS },
  );
  return {
    title: "Idealkundenprofil",
    subtitle: output.segmentName,
    firma: input.betrieb || undefined,
    filename: `icp-${safeFilename(input.betrieb, "betrieb")}`,
    blocks,
  };
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: IcpOutput, input: Pick<IcpInput, "betrieb" | "branche" | "einzugsgebiet">): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil ------------------------------------------------------------------------------------

export type ProfilePatch = Partial<Record<ProfileKey, unknown>>;

/** Schreibt Segment und Beschreibung ins Profil, aber nur in leere Felder (Harte Regel 10; writesProfile in tool.config.ts). */
export function profilePatch(profile: Pick<Profile, "zielgruppen" | "primaersegment">, output: Pick<IcpOutput, "segmentName" | "beschreibung">): ProfilePatch {
  const patch: ProfilePatch = {};
  if (!profile.zielgruppen?.length) patch.zielgruppen = [{ name: output.segmentName, beschreibung: output.beschreibung }];
  if (!profile.primaersegment?.trim()) patch.primaersegment = output.segmentName;
  return patch;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type IcpState = { v: 1; input: IcpInput | null; output: IcpOutput | null };

export const EMPTY_STATE: IcpState = { v: 1, input: null, output: null };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ohne gültige Eingabe gibt es kein Dokument, darum fällt dann auch der Entwurf weg. */
export function parseState(raw: unknown): IcpState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<IcpState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = icpInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = icpOutput.safeParse(r.output);
  return { v: 1, input: input.data, output: output.success ? output.data : null };
}
