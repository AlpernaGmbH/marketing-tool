import { KANTONE, chf, numberCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { parseState as parseAnspruchsgruppenState } from "@/tools/anspruchsgruppen/logic";
import {
  ENTWICKLUNG_KEYS,
  ENTWICKLUNG_LABELS,
  KANAL_KEYS,
  KANAL_LABELS,
  LIMITS,
  MONATE,
  NEU_RE,
  ZIEL_KEYS,
  ZIEL_LABELS,
  stundenSumme,
  vereinInput,
  vereinOutput,
  type EntwicklungKey,
  type Gruppe,
  type KalenderEintrag,
  type KanalKey,
  type VereinInput,
  type VereinOutput,
  type ZielKey,
} from "./generator";

// Vereins-Kommunikationskonzept: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Labels, Vorschläge aus dem Profil, die Gruppen aus der
// Anspruchsgruppen-Analyse, Eingabeprüfung, Dokument, CRM-Texte, Profil-Ergänzung und der gespeicherte Stand.
// Spec: specs/vereins-kommunikation.md

export const SLUG = "vereins-kommunikation";
/** Stand der Anspruchsgruppen-Analyse im Browser (tools/anspruchsgruppen). */
export const ANSPRUCHSGRUPPEN_SLUG = "anspruchsgruppen";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

// ---- Listen und Labels -------------------------------------------------------------------------

export const ENTWICKLUNGEN: { key: EntwicklungKey; label: string }[] = ENTWICKLUNG_KEYS.map((key) => ({ key, label: ENTWICKLUNG_LABELS[key] }));
export const ZIELE: { key: ZielKey; label: string }[] = ZIEL_KEYS.map((key) => ({ key, label: ZIEL_LABELS[key] }));
export const KANAELE: { key: KanalKey; label: string }[] = KANAL_KEYS.map((key) => ({ key, label: KANAL_LABELS[key] }));
export const MONAT_OPTIONEN: { value: string; label: string }[] = MONATE.map((label, i) => ({ value: String(i + 1), label }));

export const isEntwicklung = (v: unknown): v is EntwicklungKey => typeof v === "string" && (ENTWICKLUNG_KEYS as readonly string[]).includes(v);
export const isZielKey = (v: unknown): v is ZielKey => typeof v === "string" && (ZIEL_KEYS as readonly string[]).includes(v);
export const isKanalKey = (v: unknown): v is KanalKey => typeof v === "string" && (KANAL_KEYS as readonly string[]).includes(v);

export const entwicklungLabel = (key: EntwicklungKey): string => ENTWICKLUNG_LABELS[key];
export const zielLabel = (key: ZielKey): string => ZIEL_LABELS[key];
export const kanalLabel = (key: KanalKey): string => KANAL_LABELS[key];
/** «Juni» für 6; für Zahlen ausserhalb von 1 bis 12 der Wert selbst. */
export const monatName = (monat: number): string => MONATE[monat - 1] ?? String(monat);

/** Bekannte Ziele in fester Reihenfolge, ohne Doppel. */
export function normalizeZiele(ziele: readonly unknown[]): ZielKey[] {
  return ZIEL_KEYS.filter((k) => ziele.includes(k));
}

/** Bekannte Kanäle in fester Reihenfolge, ohne Doppel. */
export function normalizeKanaele(kanaele: readonly unknown[]): KanalKey[] {
  return KANAL_KEYS.filter((k) => kanaele.includes(k));
}

const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const multiLine = (s: string | undefined, max: number) =>
  (s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();

/** Zeichen je Schriftzeichen (nicht je Code-Einheit), für die Anzeige «n von 400 Zeichen». */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Profil lesen ------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "ort" | "kanton">;

/** Name des Kantons zum Kürzel im Profil («AR» → «Appenzell Ausserrhoden»); leer, wenn das Kürzel unbekannt ist. */
export function kantonName(code: string | undefined): string {
  return KANTONE.find(([c]) => c === code)?.[1] ?? "";
}

/** Wörter, an denen ein Eintrag im Profil als Kanal erkannt wird (Einträge heissen «name» oder «kanal»). */
const KANAL_WOERTER: { key: KanalKey; re: RegExp }[] = [
  { key: "website", re: /website|webseite|homepage|blog/i },
  { key: "instagram", re: /instagram/i },
  { key: "facebook", re: /facebook/i },
  { key: "whatsapp", re: /whatsapp/i },
  { key: "newsletter", re: /newsletter|e-?mail|\bmail\b/i },
  { key: "gemeindeblatt", re: /gemeindeblatt|anzeiger/i },
  { key: "aushang", re: /aushang|anschlag/i },
  { key: "lokalpresse", re: /lokalpresse|lokalzeitung|zeitung/i },
];

/** Kanäle aus dem Profil (Einträge mit «name» oder «kanal»), als Schlüssel in fester Reihenfolge; leer, wenn keiner passt. */
export function kanaeleAusProfil(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const namen = (profile.kanaele ?? [])
    .map((k) => {
      const r = k as Record<string, unknown>;
      return [r.name, r.kanal].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "";
    })
    .filter(Boolean);
  const found = new Set<KanalKey>();
  for (const name of namen) for (const { key, re } of KANAL_WOERTER) if (re.test(name)) found.add(key);
  return KANAL_KEYS.filter((k) => found.has(k));
}

// ---- Anspruchsgruppen lesen --------------------------------------------------------------------

const istWert = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

/**
 * Die bewerteten Gruppen aus dem gespeicherten Stand der Anspruchsgruppen-Analyse (roh aus dem Browser): Name und
 * Interesse und Einfluss von 1 bis 5, höchstens `LIMITS.gruppen`. Gruppen ohne Namen oder ohne beide Werte zählen nicht.
 * Kaputte oder fehlende Stände ergeben keine Gruppen.
 */
export function gruppenAus(raw: unknown): Gruppe[] {
  const out: Gruppe[] = [];
  for (const g of parseAnspruchsgruppenState(raw).gruppen) {
    const name = oneLine(g.name, LIMITS.gruppe);
    if (!name || !istWert(g.interesse) || !istWert(g.einfluss)) continue;
    out.push({ name, interesse: g.interesse, einfluss: g.einfluss });
    if (out.length === LIMITS.gruppen) break;
  }
  return out;
}

/** «Deine Anspruchsgruppen gehen mit: Mitglieder, Sponsoren.»; leer, wenn es keine Gruppen gibt. */
export function gruppenHinweis(gruppen: readonly Pick<Gruppe, "name">[]): string {
  return gruppen.length === 0 ? "" : `Deine Anspruchsgruppen gehen mit: ${gruppen.map((g) => g.name).join(", ")}.`;
}

// ---- Formular ----------------------------------------------------------------------------------

/** Eine Zeile der Liste «Anlässe im Jahr». `monat` ist leer oder «1» bis «12». */
export type AnlassRow = { id: string; name: string; monat: string };

/**
 * Was die Person im Formular angibt. Zahlen bleiben Text, bis `toInput` sie liest. `kanaele` null: noch nicht angefasst,
 * dann gilt der Vorschlag aus dem Profil.
 */
export type VereinForm = {
  zweck: string;
  mitglieder: string;
  entwicklung: EntwicklungKey | "";
  ziele: ZielKey[];
  anlaesse: AnlassRow[];
  kanaele: KanalKey[] | null;
  wer: string;
  stunden: string;
  budget: string;
};

export const EMPTY_FORM: VereinForm = {
  zweck: "",
  mitglieder: "",
  entwicklung: "",
  ziele: [],
  anlaesse: [{ id: "a1", name: "", monat: "" }],
  kanaele: null,
  wer: "",
  stunden: "",
  budget: "",
};

/** Die Kanäle, die im Formular gelten: die gewählten, sonst der Vorschlag aus dem Profil (Harte Regel 10). */
export function effectiveKanaele(form: Pick<VereinForm, "kanaele">, profile: Pick<Profile, "kanaele">): KanalKey[] {
  return form.kanaele ?? kanaeleAusProfil(profile);
}

const blank = (a: AnlassRow) => a.name.trim() === "" && a.monat === "";

function nextId(rows: readonly Pick<AnlassRow, "id">[]): string {
  let max = 0;
  for (const r of rows) {
    const m = /^a(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `a${max + 1}`;
}

/** Hängt eine leere Zeile an; ab `LIMITS.anlaesse` Zeilen bleibt die Liste, wie sie ist. */
export function addAnlass(rows: readonly AnlassRow[]): AnlassRow[] {
  if (rows.length >= LIMITS.anlaesse) return [...rows];
  return [...rows, { id: nextId(rows), name: "", monat: "" }];
}

export function removeAnlass(rows: readonly AnlassRow[], id: string): AnlassRow[] {
  return rows.filter((r) => r.id !== id);
}

export function setAnlass(rows: readonly AnlassRow[], id: string, patch: Partial<Pick<AnlassRow, "name" | "monat">>): AnlassRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

/** Eine ganze Zahl aus dem Feld; Leerzeichen und Apostrophe als Tausendertrenner sind erlaubt. null bei allem anderen. */
export function parseZahl(s: string): number | null {
  const t = s.replace(/[\s'’ ]/g, "");
  return /^\d{1,9}$/.test(t) ? Number(t) : null;
}

// ---- Eingabe prüfen ----------------------------------------------------------------------------

export type Problem = { message: string; fieldId: string };

export const FIELD_IDS = {
  firma: "vk-firma",
  zweck: "vk-zweck",
  mitglieder: "vk-mitglieder",
  entwicklung: "vk-entwicklung",
  anlassAdd: "vk-anlass-add",
  wer: "vk-wer",
  stunden: "vk-stunden",
  budget: "vk-budget",
} as const;
export const zielFieldId = (key: ZielKey): string => `vk-ziel-${key}`;
export const kanalFieldId = (key: KanalKey): string => `vk-kanal-${key}`;
export const anlassFieldId = (id: string, feld: "name" | "monat"): string => `vk-anlass-${id}-${feld}`;

const MITGLIEDER_MAX_TEXT = numberCH(LIMITS.mitgliederMax, 0);
const BUDGET_MAX_TEXT = numberCH(LIMITS.budgetMax, 0);

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<ProfileFields, "firma">, form: VereinForm): Problem | null {
  if (!oneLine(fields.firma, LIMITS.verein)) return { message: "Gib den Namen deines Vereins an.", fieldId: FIELD_IDS.firma };

  const zweck = multiLine(form.zweck, LIMITS.zweck + 1);
  if (zweck.length < LIMITS.zweckMin) {
    return { message: `Beschreib den Zweck deines Vereins in mindestens ${LIMITS.zweckMin} Zeichen, zum Beispiel wer mitmacht und was ihr zusammen tut.`, fieldId: FIELD_IDS.zweck };
  }
  if (zweck.length > LIMITS.zweck) return { message: `Der Vereinszweck ist zu lang. Es sind höchstens ${LIMITS.zweck} Zeichen möglich.`, fieldId: FIELD_IDS.zweck };

  const mitglieder = parseZahl(form.mitglieder);
  if (mitglieder === null || mitglieder < 1 || mitglieder > LIMITS.mitgliederMax) {
    return { message: `Gib die Zahl der Mitglieder an: eine ganze Zahl von 1 bis ${MITGLIEDER_MAX_TEXT}.`, fieldId: FIELD_IDS.mitglieder };
  }
  if (!isEntwicklung(form.entwicklung)) return { message: "Wähle, wie sich die Mitgliederzahl entwickelt.", fieldId: FIELD_IDS.entwicklung };
  if (normalizeZiele(form.ziele).length === 0) return { message: "Wähle mindestens ein Ziel.", fieldId: zielFieldId(ZIEL_KEYS[0]) };

  const gefuellt = form.anlaesse.filter((a) => !blank(a));
  if (gefuellt.length > LIMITS.anlaesse) return { message: `Du kannst höchstens ${LIMITS.anlaesse} Anlässe angeben.`, fieldId: FIELD_IDS.anlassAdd };
  for (const a of gefuellt) {
    const name = oneLine(a.name, LIMITS.anlass + 1);
    const monat = a.monat === "" ? null : Number(a.monat);
    if (!name) return { message: `Gib dem Anlass im ${monatName(monat ?? 0)} einen Namen.`, fieldId: anlassFieldId(a.id, "name") };
    if (name.length < LIMITS.anlassMin) {
      return { message: `Der Name «${name}» ist zu kurz. Schreib den Anlass mit mindestens ${LIMITS.anlassMin} Zeichen aus, zum Beispiel «Generalversammlung» statt «GV».`, fieldId: anlassFieldId(a.id, "name") };
    }
    if (name.length > LIMITS.anlass) return { message: `Der Name «${name.slice(0, 20)} …» ist zu lang. Es sind höchstens ${LIMITS.anlass} Zeichen möglich.`, fieldId: anlassFieldId(a.id, "name") };
    if (monat === null || !Number.isInteger(monat) || monat < 1 || monat > 12) return { message: `Wähle den Monat für «${name}».`, fieldId: anlassFieldId(a.id, "monat") };
  }

  if (oneLine(form.wer, LIMITS.wer + 1).length > LIMITS.wer) return { message: `Die Angabe, wer die Kommunikation macht, ist zu lang. Es sind höchstens ${LIMITS.wer} Zeichen möglich.`, fieldId: FIELD_IDS.wer };

  const stunden = parseZahl(form.stunden);
  if (stunden === null) return { message: "Gib an, wie viele Stunden pro Monat für die Kommunikation zur Verfügung stehen. Null ist erlaubt.", fieldId: FIELD_IDS.stunden };
  if (stunden > LIMITS.stundenMax) return { message: `Die Stunden pro Monat gehen von 0 bis ${LIMITS.stundenMax}.`, fieldId: FIELD_IDS.stunden };

  if (form.budget.trim() !== "") {
    const budget = parseZahl(form.budget);
    if (budget === null || budget > LIMITS.budgetMax) {
      return { message: `Das Budget ist eine ganze Zahl in CHF von 0 bis ${BUDGET_MAX_TEXT}. Lass das Feld leer, wenn es kein Budget gibt.`, fieldId: FIELD_IDS.budget };
    }
  }
  return null;
}

/**
 * Eingabe des Generators aus Profil, Formular und Anspruchsgruppen, bereinigt und gekürzt. null, wenn etwas fehlt oder
 * ausserhalb der Grenzen liegt (vorher `inputProblem`). Zeilen der Anlassliste ohne Namen und Monat fallen weg.
 */
export function toInput(fields: ProfileFields, form: VereinForm, gruppen: readonly Gruppe[] = [], kanaele: readonly KanalKey[] = form.kanaele ?? []): VereinInput | null {
  const candidate = {
    verein: oneLine(fields.firma, LIMITS.verein),
    ort: oneLine(fields.ort, LIMITS.ort),
    kanton: kantonName(fields.kanton),
    zweck: multiLine(form.zweck, LIMITS.zweck),
    mitglieder: parseZahl(form.mitglieder) ?? 0,
    entwicklung: form.entwicklung,
    ziele: normalizeZiele(form.ziele),
    anlaesse: form.anlaesse.filter((a) => !blank(a)).map((a) => ({ name: oneLine(a.name, LIMITS.anlass), monat: a.monat === "" ? 0 : Number(a.monat) })),
    kanaele: normalizeKanaele(kanaele),
    wer: oneLine(form.wer, LIMITS.wer),
    stundenProMonat: parseZahl(form.stunden) ?? -1,
    budget: form.budget.trim() === "" ? 0 : (parseZahl(form.budget) ?? -1),
    gruppen: gruppen.slice(0, LIMITS.gruppen).map((g) => ({ name: oneLine(g.name, LIMITS.gruppe), interesse: g.interesse, einfluss: g.einfluss })),
  };
  const parsed = vereinInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function formFromInput(input: VereinInput): VereinForm {
  const rows = input.anlaesse.map((a, i): AnlassRow => ({ id: `a${i + 1}`, name: a.name, monat: String(a.monat) }));
  return {
    zweck: input.zweck,
    mitglieder: String(input.mitglieder),
    entwicklung: input.entwicklung,
    ziele: [...input.ziele],
    anlaesse: rows.length > 0 ? rows : [{ id: "a1", name: "", monat: "" }],
    kanaele: [...input.kanaele],
    wer: input.wer,
    stunden: String(input.stundenProMonat),
    budget: input.budget > 0 ? String(input.budget) : "",
  };
}

// ---- Texte fürs CRM ----------------------------------------------------------------------------

/** Freitext mit Absätzen auf eine Zeile: Zeilenumbrüche werden zu « / ». */
const flat = (s: string) => s.replace(/\s*\n+\s*/g, " / ");

/** «FC Trogen, Trogen (Appenzell Ausserrhoden)» */
export function vereinZeile(input: Pick<VereinInput, "verein" | "ort" | "kanton">): string {
  return `${input.verein}${input.ort ? `, ${input.ort}` : ""}${input.kanton ? ` (${input.kanton})` : ""}`;
}

/** Die Angaben fürs CRM, eine je Zeile; das Wichtigste zuerst, der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: VereinInput): string {
  return [
    `Verein: ${vereinZeile(input)}`,
    `Mitglieder: ${numberCH(input.mitglieder, 0)}, Zahl ${ENTWICKLUNG_LABELS[input.entwicklung]}`,
    `Ziele: ${input.ziele.map(zielLabel).join(", ")}`,
    `Anlässe im Jahr: ${input.anlaesse.length > 0 ? input.anlaesse.map((a) => `${a.name} (${monatName(a.monat)})`).join(", ") : "keine angegeben"}`,
    `Kanäle heute: ${input.kanaele.length > 0 ? input.kanaele.map(kanalLabel).join(", ") : "keine"}`,
    `Kommunikation macht: ${input.wer || "keine Angabe"}, ${input.stundenProMonat} Stunden pro Monat`,
    `Budget pro Jahr: ${input.budget > 0 ? chf(input.budget) : "keines angegeben"}`,
    input.gruppen.length > 0 ? `Anspruchsgruppen: ${input.gruppen.map((g) => `${g.name} (Interesse ${g.interesse}, Einfluss ${g.einfluss})`).join("; ")}` : "",
    `Zweck: ${flat(input.zweck)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ----------------------------------------------------------------------------------

/** Der Jahreskalender nach Monat sortiert; innerhalb eines Monats bleibt die Reihenfolge der Antwort. */
export function kalenderSortiert(kalender: readonly KalenderEintrag[]): KalenderEintrag[] {
  return kalender.map((e, i) => ({ e, i })).sort((a, b) => a.e.monat - b.e.monat || a.i - b.i).map(({ e }) => e);
}

/** Wie viele Kanäle im Plan neu vorgeschlagen sind (Zusatz «(neu)»). */
export function neueKanaele(output: Pick<VereinOutput, "kanalplan">): number {
  return output.kanalplan.filter((k) => NEU_RE.test(k.kanal)).length;
}

const orOffen = (s: string) => s.trim() || "noch offen";

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: VereinOutput, input: VereinInput): DocumentModel {
  const summe = stundenSumme(output.rollen);
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Verein", value: vereinZeile(input) },
        { label: "Mitglieder", value: `${numberCH(input.mitglieder, 0)}, Zahl ${ENTWICKLUNG_LABELS[input.entwicklung]}` },
        { label: "Zeit für die Kommunikation", value: `${input.wer ? `${input.wer}, ` : ""}${input.stundenProMonat} Stunden pro Monat` },
        { label: "Budget pro Jahr", value: input.budget > 0 ? chf(input.budget) : "kein Budget angegeben" },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: "1. Ausgangslage" },
    { type: "paragraph", text: output.ausgangslage },
    { type: "heading", level: 1, text: "2. Ziele" },
    { type: "table", header: ["Ziel", "Messgrösse"], widths: [3, 2], rows: output.ziele.map((z) => [z.ziel, z.messgroesse]) },
    { type: "heading", level: 1, text: "3. Zielgruppen" },
    { type: "table", header: ["Zielgruppe", "Erwartung"], widths: [1.6, 3.4], rows: output.zielgruppen.map((z) => [z.name, z.erwartung]) },
    { type: "heading", level: 1, text: "4. Kernbotschaft" },
    { type: "paragraph", text: output.kernbotschaft },
    { type: "heading", level: 1, text: "5. Kanalplan" },
    {
      type: "table",
      header: ["Kanal", "Zweck", "Rhythmus", "Verantwortlich"],
      widths: [1.7, 3, 1.6, 1.7],
      rows: output.kanalplan.map((k) => [k.kanal, k.zweck, k.rhythmus, orOffen(k.verantwortlich)]),
    },
  ];
  if (neueKanaele(output) > 0) {
    blocks.push({ type: "paragraph", text: "Kanäle mit dem Zusatz «(neu)» sind Vorschläge. Sie laufen heute noch nicht." });
  }
  blocks.push({ type: "heading", level: 1, text: "6. Jahreskalender" });
  if (output.jahreskalender.length > 0) {
    blocks.push({
      type: "table",
      header: ["Monat", "Anlass", "Kommunikation"],
      widths: [1.2, 2, 4],
      rows: kalenderSortiert(output.jahreskalender).map((e) => [monatName(e.monat), e.anlass, e.kommunikation]),
    });
  } else {
    blocks.push({ type: "paragraph", text: "Es sind keine Anlässe angegeben. Trag die Anlässe ein und erstelle das Konzept neu, dann entsteht ein Kalender." });
  }
  blocks.push(
    { type: "heading", level: 1, text: "7. Rollenverteilung" },
    {
      type: "table",
      header: ["Rolle", "Aufgaben", "Stunden pro Monat"],
      widths: [2, 4, 1.3],
      rows: output.rollen.map((r) => [r.rolle, r.aufgaben, String(r.stundenProMonat)]),
    },
    { type: "paragraph", text: `Zusammen ${summe} von ${input.stundenProMonat} Stunden pro Monat.` },
    { type: "heading", level: 1, text: "8. Erfolgsmessung" },
    { type: "paragraph", text: "Gemessen wird nur, was der Verein selbst zählt. Vergleichswerte von aussen gehören nicht in dieses Konzept." },
    { type: "list", items: output.erfolgsmessung },
  );
  return {
    title: "Kommunikationskonzept",
    subtitle: `${input.verein}, Vorlage für die Generalversammlung`,
    firma: input.verein,
    filename: `kommunikationskonzept-${safeFilename(input.verein, "verein")}`,
    blocks,
  };
}

/** Die Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst zeigt. PDF, Word und Copy behalten ihn. */
export function screenBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: VereinOutput, input: VereinInput): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil schreiben --------------------------------------------------------------------------

export type ProfilePatch = { organisationstyp?: "verein"; kanaele?: { name: string }[] };

/**
 * Was das Werkzeug ins Firmenprofil schreibt (writesProfile: organisationstyp, kanaele), jeweils nur, wenn das Feld dort
 * noch leer ist (TOOL-BAUEN.md, Abschnitt 2). Der Typ «verein» beim ersten Laden (ohne Kanäle), die Kanäle heute nach
 * einem frisch erzeugten Entwurf. Steht schon etwas im Profil, bleibt es, wie es ist.
 */
export function profilePatch(profile: Pick<Profile, "organisationstyp" | "kanaele">, kanaele: readonly KanalKey[] = []): ProfilePatch {
  const patch: ProfilePatch = {};
  if (!profile.organisationstyp) patch.organisationstyp = "verein";
  const keys = normalizeKanaele(kanaele);
  if (keys.length > 0 && !profile.kanaele?.length) patch.kanaele = keys.map((k) => ({ name: KANAL_LABELS[k] }));
  return patch;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type VereinState = { v: 1; input: VereinInput | null; output: VereinOutput | null };

export const EMPTY_STATE: VereinState = { v: 1, input: null, output: null };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Entwurf ohne gültige Eingabe fällt weg, ein kaputter Entwurf allein. */
export function parseState(raw: unknown): VereinState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<VereinState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = vereinInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = vereinOutput.safeParse(r.output);
  return { v: 1, input: input.data, output: output.success ? output.data : null };
}

