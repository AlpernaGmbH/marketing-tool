import { KANTONE, chf, numberCH } from "@/lib/ch";
import type { CheckResult } from "@/lib/check/types";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { PitchSpec } from "@/lib/pitch";
import type { Profile } from "@/lib/profile";
import { parseState as parseAnspruchsgruppenState } from "@/tools/anspruchsgruppen/logic";
import {
  ENTWICKLUNG_KEYS,
  ENTWICKLUNG_LABELS,
  KANAELE_FUER,
  KANAL_KEYS,
  KANAL_LABELS,
  LIMITS,
  MONATE,
  NEU_RE,
  ZIELE_FUER,
  ZIEL_LABELS,
  istGewaehlterKanal,
  konzeptInput,
  konzeptOutput,
  stundenSumme,
  type EntwicklungKey,
  type Gruppe,
  type KalenderEintrag,
  type KanalKey,
  type KonzeptInput,
  type KonzeptOutput,
  type TypKey,
  type ZielKey,
} from "./generator";

// Kommunikationskonzept für Betriebe (KMU) und Vereine: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Wortlaut je Typ, Labels, Vorschläge aus dem Profil und der
// Website-Prüfung, die Gruppen aus der Anspruchsgruppen-Analyse, Eingabeprüfung, Dokument, CRM-Texte, Hinweis auf Alperna,
// Profil-Ergänzung und der gespeicherte Stand. Spec: specs/kommunikationskonzept.md

export const SLUG = "kommunikationskonzept";
/** Stand der Anspruchsgruppen-Analyse im Browser (tools/anspruchsgruppen). */
export const ANSPRUCHSGRUPPEN_SLUG = "anspruchsgruppen";
/** Stand der Website-Prüfung (Marketing-Check) im Browser (tools/digitaler-auftritt-check). */
export const SCAN_SLUG = "digitaler-auftritt-check";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

// ---- Typ und Wortlaut ---------------------------------------------------------------------------

/** Verein oder Betrieb: folgt der Rechtsform im Firmenprofil (ProfileFieldsForm); ohne Wahl gilt der Betrieb. */
export function typOf(profile: Pick<Profile, "organisationstyp">): TypKey {
  return profile.organisationstyp === "verein" ? "verein" : "kmu";
}

/** Die Wörter, die sich zwischen Verein und Betrieb ändern: Formular, Meldungen, Dokument. Das Konzept selbst schreibt die KI nach «typ». */
export type Worte = {
  /** «Verein» oder «Betrieb»: Kopf der Angaben, Zeile im CRM und im Dokument. */
  nomen: string;
  legend: string;
  intro: string;
  nameFehler: string;
  zweckLabel: string;
  zweckHilfe: string;
  zweckZuKurz: string;
  zweckZuLang: string;
  anzahlLabel: string;
  anzahlHilfe: string;
  anzahlFehler: string;
  /** Zeile im Dokument und im CRM: «Mitglieder» oder «Mitarbeitende». */
  anzahlFakt: string;
  /** «Zahl wächst» oder «Nachfrage wächst». */
  entwicklungFakt: string;
  entwicklungLabel: string;
  entwicklungFehler: string;
  anlaesseHilfe: string;
  anlassBeispiel: string;
  kanaeleHilfe: string;
  werHilfe: string;
  /** Satzteil nach «Dafür gehen …»: Was an die KI geht, Name bis Entwicklung. */
  serverAngaben: string;
  vertraulich: string;
  ergebnisHinweis: string;
  untertitel: string;
  messung: string;
};

export const WORTE: Record<TypKey, Worte> = {
  verein: {
    nomen: "Verein",
    legend: "Dein Verein",
    intro:
      "Sag, wofür dein Verein da ist, wie viele Mitglieder er hat, was er erreichen will und wann die Anlässe sind. Eine KI schreibt daraus ein Kommunikationskonzept: Ausgangslage, Ziele, Zielgruppen, Kernbotschaft, Kanalplan, Jahreskalender, Rollen und Erfolgsmessung. Du kannst es dem Vorstand vorlegen und als Vorlage für die Generalversammlung nutzen.",
    nameFehler: "Gib den Namen deines Vereins an.",
    zweckLabel: "Vereinszweck",
    zweckHilfe:
      "Ein bis drei Sätze: Was tut der Verein, für wen, und was verbindet die Mitglieder? Zum Beispiel: «Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren, Heimspiele auf dem Sportplatz».",
    zweckZuKurz: `Beschreib den Zweck deines Vereins in mindestens ${LIMITS.zweckMin} Zeichen, zum Beispiel wer mitmacht und was ihr zusammen tut.`,
    zweckZuLang: `Der Vereinszweck ist zu lang. Es sind höchstens ${LIMITS.zweck} Zeichen möglich.`,
    anzahlLabel: "Mitgliederzahl",
    anzahlHilfe: "Aktive und Passive zusammen, ganze Zahl.",
    anzahlFehler: `Gib die Zahl der Mitglieder an: eine ganze Zahl von 1 bis ${numberCH(LIMITS.anzahlMax, 0)}.`,
    anzahlFakt: "Mitglieder",
    entwicklungFakt: "Zahl",
    entwicklungLabel: "Entwicklung der Mitgliederzahl",
    entwicklungFehler: "Wähle, wie sich die Mitgliederzahl entwickelt.",
    anlaesseHilfe: `Bis zu ${LIMITS.anlaesse} Anlässe mit Monat, zum Beispiel Generalversammlung, Dorffest, Turnier oder Vereinsreise. Sie bilden den Jahreskalender.`,
    anlassBeispiel: "«Generalversammlung» statt «GV»",
    kanaeleHilfe: "Wähle die Kanäle, auf denen dein Verein heute Neuigkeiten verbreitet. Der Kanalplan nutzt sie und schlägt höchstens zwei neue vor.",
    werHilfe: "Zum Beispiel: zwei Vorstandsmitglieder.",
    serverAngaben: "Name, Ort und Kanton des Vereins, Zweck, Mitgliederzahl und Entwicklung",
    vertraulich: "Gib nichts Vertrauliches ein, zum Beispiel keine Namen von Mitgliedern.",
    ergebnisHinweis: "Das Konzept ist eine Vorlage. Der Vorstand prüft und ergänzt es, bevor es an die Generalversammlung geht.",
    untertitel: "Vorlage für die Generalversammlung",
    messung: "Gemessen wird nur, was der Verein selbst zählt. Vergleichswerte von aussen gehören nicht in dieses Konzept.",
  },
  kmu: {
    nomen: "Betrieb",
    legend: "Dein Betrieb",
    intro:
      "Sag, was dein Betrieb tut, wie gross er ist, was er erreichen will und wann die Anlässe im Jahr sind. Eine KI schreibt daraus ein Kommunikationskonzept: Ausgangslage, Ziele, Zielgruppen, Kernbotschaft, Kanalplan, Jahreskalender, Rollen und Erfolgsmessung. Du kannst es als Grundlage für die Jahresplanung nutzen.",
    nameFehler: "Gib den Namen deines Betriebs an.",
    zweckLabel: "Was dein Betrieb tut",
    zweckHilfe:
      "Ein bis drei Sätze: Was bietet dein Betrieb an, für wen, und was zeichnet ihn aus? Zum Beispiel: «Malerei mit acht Mitarbeitenden, Fassaden und Innenräume für Privatkundschaft und Verwaltungen in Gossau und Umgebung».",
    zweckZuKurz: `Beschreib deinen Betrieb in mindestens ${LIMITS.zweckMin} Zeichen, zum Beispiel was ihr anbietet und für wen.`,
    zweckZuLang: `Die Beschreibung des Betriebs ist zu lang. Es sind höchstens ${LIMITS.zweck} Zeichen möglich.`,
    anzahlLabel: "Mitarbeitende",
    anzahlHilfe: "Alle zusammen, du selbst eingerechnet, ganze Zahl.",
    anzahlFehler: `Gib die Zahl der Mitarbeitenden an: eine ganze Zahl von 1 bis ${numberCH(LIMITS.anzahlMax, 0)}. Bist du selbständig, ist es 1.`,
    anzahlFakt: "Mitarbeitende",
    entwicklungFakt: "Nachfrage",
    entwicklungLabel: "Entwicklung der Nachfrage",
    entwicklungFehler: "Wähle, wie sich die Nachfrage entwickelt.",
    anlaesseHilfe: `Bis zu ${LIMITS.anlaesse} Anlässe mit Monat, zum Beispiel Tag der offenen Tür, Messe, Saisonstart oder Jubiläum. Sie bilden den Jahreskalender.`,
    anlassBeispiel: "«Tag der offenen Tür» statt «TdoT»",
    kanaeleHilfe: "Wähle die Kanäle, auf denen dein Betrieb heute zu finden ist. Der Kanalplan nutzt sie und schlägt höchstens zwei neue vor.",
    werHilfe: "Zum Beispiel: die Inhaberin und eine Mitarbeiterin im Büro.",
    serverAngaben: "Name, Ort und Kanton des Betriebs, Beschreibung, Zahl der Mitarbeitenden und Entwicklung der Nachfrage",
    vertraulich: "Gib nichts Vertrauliches ein, zum Beispiel keine Namen von Kundschaft.",
    ergebnisHinweis: "Das Konzept ist eine Vorlage. Die Geschäftsleitung prüft und ergänzt es, bevor es in die Jahresplanung geht.",
    untertitel: "Konzept für die Jahresplanung",
    messung: "Gemessen wird nur, was der Betrieb selbst zählt. Vergleichswerte von aussen gehören nicht in dieses Konzept.",
  },
};

// ---- Listen und Labels -------------------------------------------------------------------------

export const ENTWICKLUNGEN: { key: EntwicklungKey; label: string }[] = ENTWICKLUNG_KEYS.map((key) => ({ key, label: ENTWICKLUNG_LABELS[key] }));
/** Die Ziele, die zum Typ passen, in der Reihenfolge des Formulars. */
export const zieleFuer = (typ: TypKey): { key: ZielKey; label: string }[] => ZIELE_FUER[typ].map((key) => ({ key, label: ZIEL_LABELS[key] }));
/** Die Kanäle, die zum Typ passen, in der Reihenfolge des Formulars. */
export const kanaeleFuer = (typ: TypKey): { key: KanalKey; label: string }[] => KANAELE_FUER[typ].map((key) => ({ key, label: KANAL_LABELS[key] }));
export const MONAT_OPTIONEN: { value: string; label: string }[] = MONATE.map((label, i) => ({ value: String(i + 1), label }));

export const isEntwicklung = (v: unknown): v is EntwicklungKey => typeof v === "string" && (ENTWICKLUNG_KEYS as readonly string[]).includes(v);

export const entwicklungLabel = (key: EntwicklungKey): string => ENTWICKLUNG_LABELS[key];
export const zielLabel = (key: ZielKey): string => ZIEL_LABELS[key];
export const kanalLabel = (key: KanalKey): string => KANAL_LABELS[key];
/** «Juni» für 6; für Zahlen ausserhalb von 1 bis 12 der Wert selbst. */
export const monatName = (monat: number): string => MONATE[monat - 1] ?? String(monat);

/** Bekannte Ziele des Typs in der Reihenfolge des Formulars, ohne Doppel; Ziele des anderen Typs fallen weg. */
export function normalizeZiele(ziele: readonly unknown[], typ: TypKey): ZielKey[] {
  return ZIELE_FUER[typ].filter((k) => ziele.includes(k));
}

/** Bekannte Kanäle des Typs in der Reihenfolge des Formulars, ohne Doppel; Kanäle des anderen Typs fallen weg. */
export function normalizeKanaele(kanaele: readonly unknown[], typ: TypKey): KanalKey[] {
  return KANAELE_FUER[typ].filter((k) => kanaele.includes(k));
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

export type ProfileFields = Pick<Profile, "firma" | "ort" | "kanton" | "organisationstyp">;

/** Name des Kantons zum Kürzel im Profil («AR» → «Appenzell Ausserrhoden»); leer, wenn das Kürzel unbekannt ist. */
export function kantonName(code: string | undefined): string {
  return KANTONE.find(([c]) => c === code)?.[1] ?? "";
}

/** Wörter, an denen ein Eintrag im Profil als Kanal erkannt wird (Einträge heissen «name» oder «kanal»). */
const KANAL_WOERTER: { key: KanalKey; re: RegExp }[] = [
  { key: "website", re: /website|webseite|homepage|blog/i },
  { key: "google", re: /google|unternehmensprofil|business\s*profil|\bgbp\b/i },
  { key: "instagram", re: /instagram/i },
  { key: "facebook", re: /facebook/i },
  { key: "linkedin", re: /linkedin/i },
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

// ---- Website-Prüfung lesen ---------------------------------------------------------------------

const SCAN_NETZE: readonly KanalKey[] = ["instagram", "facebook", "linkedin"];

/**
 * Kanäle, die die Website-Prüfung (Marketing-Check) gefunden hat: die Website selbst, Instagram, Facebook und LinkedIn aus den
 * verlinkten Kanälen, eine Newsletter-Anmeldung und ein Google-Profil (auch der Hinweis «wahrscheinlich», weil die Website auf
 * Google Maps verlinkt). Ohne Ergebnis keine Kanäle. Der Besucher bestätigt die Auswahl im Formular.
 */
export function kanaeleAusScan(result: Pick<CheckResult, "categories" | "facts"> | null | undefined): KanalKey[] {
  if (!result) return [];
  const found = new Set<KanalKey>(["website"]);
  const social = result.categories.find((c) => c.id === "social");
  for (const channel of social?.channels ?? []) {
    const net = SCAN_NETZE.find((k) => k === channel.network);
    if (net) found.add(net);
  }
  if (result.facts.hasNewsletter === true) found.add("newsletter");
  if (result.facts.gbpFound === true || result.facts.gbpFound === "wahrscheinlich") found.add("google");
  return KANAL_KEYS.filter((k) => found.has(k));
}

export type Vorbelegung = { kanaele: KanalKey[]; profil: boolean; scan: boolean };

/** Die vorgeschlagenen Kanäle heute: Profil und Website-Prüfung zusammen, nur die des Typs, und woher sie stammen (Harte Regel 10). */
export function vorbelegung(profile: Pick<Profile, "kanaele">, result: Pick<CheckResult, "categories" | "facts"> | null | undefined, typ: TypKey): Vorbelegung {
  const ausProfil = normalizeKanaele(kanaeleAusProfil(profile), typ);
  const ausScan = normalizeKanaele(kanaeleAusScan(result), typ);
  return { kanaele: normalizeKanaele([...ausProfil, ...ausScan], typ), profil: ausProfil.length > 0, scan: ausScan.length > 0 };
}

/** «Vorbelegt aus deinem Firmenprofil und der Website-Prüfung. »; leer, wenn nichts vorbelegt ist. */
export function vorbelegungText(v: Vorbelegung): string {
  if (v.profil && v.scan) return "Vorbelegt aus deinem Firmenprofil und der Website-Prüfung. ";
  if (v.profil) return "Vorbelegt aus deinem Firmenprofil. ";
  if (v.scan) return "Vorbelegt aus der Website-Prüfung. ";
  return "";
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
 * dann gilt der Vorschlag aus Profil und Website-Prüfung.
 */
export type KonzeptForm = {
  zweck: string;
  anzahl: string;
  entwicklung: EntwicklungKey | "";
  ziele: ZielKey[];
  anlaesse: AnlassRow[];
  kanaele: KanalKey[] | null;
  wer: string;
  stunden: string;
  budget: string;
};

export const EMPTY_FORM: KonzeptForm = {
  zweck: "",
  anzahl: "",
  entwicklung: "",
  ziele: [],
  anlaesse: [{ id: "a1", name: "", monat: "" }],
  kanaele: null,
  wer: "",
  stunden: "",
  budget: "",
};

/** Die Kanäle, die im Formular gelten: die gewählten, sonst der Vorschlag aus Profil und Website-Prüfung; immer nur die des Typs. */
export function effectiveKanaele(form: Pick<KonzeptForm, "kanaele">, vorgeschlagen: readonly KanalKey[], typ: TypKey): KanalKey[] {
  return normalizeKanaele(form.kanaele ?? vorgeschlagen, typ);
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
  const t = s.replace(/[\s'’ ]/g, "");
  return /^\d{1,9}$/.test(t) ? Number(t) : null;
}

// ---- Eingabe prüfen ----------------------------------------------------------------------------

export type Problem = { message: string; fieldId: string };

export const FIELD_IDS = {
  firma: "vk-firma",
  zweck: "vk-zweck",
  anzahl: "vk-anzahl",
  entwicklung: "vk-entwicklung",
  anlassAdd: "vk-anlass-add",
  wer: "vk-wer",
  stunden: "vk-stunden",
  budget: "vk-budget",
} as const;
export const zielFieldId = (key: ZielKey): string => `vk-ziel-${key}`;
export const kanalFieldId = (key: KanalKey): string => `vk-kanal-${key}`;
export const anlassFieldId = (id: string, feld: "name" | "monat"): string => `vk-anlass-${id}-${feld}`;

const BUDGET_MAX_TEXT = numberCH(LIMITS.budgetMax, 0);

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<ProfileFields, "firma" | "organisationstyp">, form: KonzeptForm): Problem | null {
  const typ = typOf(fields);
  const w = WORTE[typ];
  if (!oneLine(fields.firma, LIMITS.betrieb)) return { message: w.nameFehler, fieldId: FIELD_IDS.firma };

  const zweck = multiLine(form.zweck, LIMITS.zweck + 1);
  if (zweck.length < LIMITS.zweckMin) return { message: w.zweckZuKurz, fieldId: FIELD_IDS.zweck };
  if (zweck.length > LIMITS.zweck) return { message: w.zweckZuLang, fieldId: FIELD_IDS.zweck };

  const anzahl = parseZahl(form.anzahl);
  if (anzahl === null || anzahl < 1 || anzahl > LIMITS.anzahlMax) return { message: w.anzahlFehler, fieldId: FIELD_IDS.anzahl };
  if (!isEntwicklung(form.entwicklung)) return { message: w.entwicklungFehler, fieldId: FIELD_IDS.entwicklung };
  if (normalizeZiele(form.ziele, typ).length === 0) return { message: "Wähle mindestens ein Ziel.", fieldId: zielFieldId(ZIELE_FUER[typ][0]) };

  const gefuellt = form.anlaesse.filter((a) => !blank(a));
  if (gefuellt.length > LIMITS.anlaesse) return { message: `Du kannst höchstens ${LIMITS.anlaesse} Anlässe angeben.`, fieldId: FIELD_IDS.anlassAdd };
  for (const a of gefuellt) {
    const name = oneLine(a.name, LIMITS.anlass + 1);
    const monat = a.monat === "" ? null : Number(a.monat);
    if (!name) return { message: `Gib dem Anlass im ${monatName(monat ?? 0)} einen Namen.`, fieldId: anlassFieldId(a.id, "name") };
    if (name.length < LIMITS.anlassMin) {
      return { message: `Der Name «${name}» ist zu kurz. Schreib den Anlass mit mindestens ${LIMITS.anlassMin} Zeichen aus, zum Beispiel ${w.anlassBeispiel}.`, fieldId: anlassFieldId(a.id, "name") };
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
 * ausserhalb der Grenzen liegt (vorher `inputProblem`). Zeilen der Anlassliste ohne Namen und Monat fallen weg. Ziele und
 * Kanäle des anderen Typs fallen weg.
 */
export function toInput(fields: ProfileFields, form: KonzeptForm, gruppen: readonly Gruppe[] = [], kanaele: readonly KanalKey[] = form.kanaele ?? []): KonzeptInput | null {
  const typ = typOf(fields);
  const candidate = {
    typ,
    betrieb: oneLine(fields.firma, LIMITS.betrieb),
    ort: oneLine(fields.ort, LIMITS.ort),
    kanton: kantonName(fields.kanton),
    zweck: multiLine(form.zweck, LIMITS.zweck),
    anzahl: parseZahl(form.anzahl) ?? 0,
    entwicklung: form.entwicklung,
    ziele: normalizeZiele(form.ziele, typ),
    anlaesse: form.anlaesse.filter((a) => !blank(a)).map((a) => ({ name: oneLine(a.name, LIMITS.anlass), monat: a.monat === "" ? 0 : Number(a.monat) })),
    kanaele: normalizeKanaele(kanaele, typ),
    wer: oneLine(form.wer, LIMITS.wer),
    stundenProMonat: parseZahl(form.stunden) ?? -1,
    budget: form.budget.trim() === "" ? 0 : (parseZahl(form.budget) ?? -1),
    gruppen: gruppen.slice(0, LIMITS.gruppen).map((g) => ({ name: oneLine(g.name, LIMITS.gruppe), interesse: g.interesse, einfluss: g.einfluss })),
  };
  const parsed = konzeptInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function formFromInput(input: KonzeptInput): KonzeptForm {
  const rows = input.anlaesse.map((a, i): AnlassRow => ({ id: `a${i + 1}`, name: a.name, monat: String(a.monat) }));
  return {
    zweck: input.zweck,
    anzahl: String(input.anzahl),
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
export function betriebZeile(input: Pick<KonzeptInput, "betrieb" | "ort" | "kanton">): string {
  return `${input.betrieb}${input.ort ? `, ${input.ort}` : ""}${input.kanton ? ` (${input.kanton})` : ""}`;
}

/** «Mitglieder: 180, Zahl wächst» oder «Mitarbeitende: 8, Nachfrage wächst». */
export function anzahlZeile(input: Pick<KonzeptInput, "typ" | "anzahl" | "entwicklung">): string {
  const w = WORTE[input.typ];
  return `${numberCH(input.anzahl, 0)}, ${w.entwicklungFakt} ${ENTWICKLUNG_LABELS[input.entwicklung]}`;
}

/** Die Angaben fürs CRM, eine je Zeile; das Wichtigste zuerst, der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: KonzeptInput): string {
  const w = WORTE[input.typ];
  return [
    `${w.nomen}: ${betriebZeile(input)}`,
    `${w.anzahlFakt}: ${anzahlZeile(input)}`,
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
export function neueKanaele(output: Pick<KonzeptOutput, "kanalplan">): number {
  return output.kanalplan.filter((k) => NEU_RE.test(k.kanal)).length;
}

const orOffen = (s: string) => s.trim() || "noch offen";

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: KonzeptOutput, input: KonzeptInput): DocumentModel {
  const w = WORTE[input.typ];
  const summe = stundenSumme(output.rollen);
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: w.nomen, value: betriebZeile(input) },
        { label: w.anzahlFakt, value: anzahlZeile(input) },
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
    { type: "paragraph", text: w.messung },
    { type: "list", items: output.erfolgsmessung },
  );
  return {
    title: "Kommunikationskonzept",
    subtitle: `${input.betrieb}, ${w.untertitel}`,
    firma: input.betrieb,
    filename: `kommunikationskonzept-${safeFilename(input.betrieb, w.nomen.toLowerCase())}`,
    blocks,
  };
}

/** Die Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst zeigt. PDF, Word und Copy behalten ihn. */
export function screenBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: KonzeptOutput, input: KonzeptInput): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Hinweis auf Alperna -----------------------------------------------------------------------

const SOCIAL_KEYS: readonly KanalKey[] = ["instagram", "facebook", "linkedin"];

/**
 * Bis zu dieser Zahl von Stunden pro Monat und Social-Media-Kanal gilt die Zeit im Konzept als knapp. Das ist eine Annahme von Alperna
 * für den Hinweis, keine Statistik; sie steht nicht im Text.
 */
export const KNAPP_STUNDEN_JE_KANAL = 4;

/** Wie viele Social-Media-Kanäle (Instagram, Facebook, LinkedIn) der Kanalplan enthält, auch als Vorschlag mit «(neu)». */
export function socialKanaele(output: Pick<KonzeptOutput, "kanalplan">): number {
  return output.kanalplan.filter((k) => istGewaehlterKanal(k.kanal.replace(NEU_RE, ""), SOCIAL_KEYS)).length;
}

/**
 * Hinweis auf Alperna aus dem Ergebnis: Plant das Konzept zwei oder mehr Social-Media-Kanäle und reicht die Zeit nicht (weniger als
 * vier Stunden je Kanal und Monat), oder steht ein Budget dafür bereit, nennt der Hinweis den Baustein «Social Media». Sonst kein Hinweis.
 * Der Satz nennt nur Zahlen aus dem Ergebnis und aus den Angaben, nie einen Preis.
 */
export function pitchFor(output: Pick<KonzeptOutput, "kanalplan">, input: Pick<KonzeptInput, "stundenProMonat" | "budget">): PitchSpec | null {
  const n = socialKanaele(output);
  if (n < 2) return null;
  if (input.stundenProMonat < n * KNAPP_STUNDEN_JE_KANAL) {
    const zeit = input.stundenProMonat === 0 ? "ohne eingeplante Stunden" : `bei ${input.stundenProMonat} ${input.stundenProMonat === 1 ? "Stunde" : "Stunden"} im Monat`;
    return { baustein: "Social Media", satz: `Dein Konzept plant ${n} Social-Media-Kanäle ${zeit}.` };
  }
  if (input.budget > 0) return { baustein: "Social Media", satz: `Dein Konzept plant ${n} Social-Media-Kanäle und ${chf(input.budget)} Budget im Jahr.` };
  return null;
}

// ---- Profil schreiben --------------------------------------------------------------------------

export type ProfilePatch = { kanaele?: { name: string }[] };

/**
 * Was das Werkzeug ins Firmenprofil schreibt (writesProfile: kanaele), nur, wenn das Feld dort noch leer ist (TOOL-BAUEN.md,
 * Abschnitt 2): die Kanäle heute nach einem frisch erzeugten Entwurf. Steht schon etwas im Profil, bleibt es, wie es ist.
 * Verein oder Betrieb bestimmt die Rechtsform im Profil; das Werkzeug ändert sie nie.
 */
export function profilePatch(profile: Pick<Profile, "organisationstyp" | "kanaele">, kanaele: readonly KanalKey[] = []): ProfilePatch {
  const patch: ProfilePatch = {};
  const keys = normalizeKanaele(kanaele, typOf(profile));
  if (keys.length > 0 && !profile.kanaele?.length) patch.kanaele = keys.map((k) => ({ name: KANAL_LABELS[k] }));
  return patch;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type KonzeptState = { v: 1; input: KonzeptInput | null; output: KonzeptOutput | null };

export const EMPTY_STATE: KonzeptState = { v: 1, input: null, output: null };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Entwurf ohne gültige Eingabe fällt weg, ein kaputter Entwurf allein. */
export function parseState(raw: unknown): KonzeptState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<KonzeptState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = konzeptInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = konzeptOutput.safeParse(r.output);
  return { v: 1, input: input.data, output: output.success ? output.data : null };
}
