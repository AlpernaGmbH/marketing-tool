import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { WEEKDAYS, addDays, foldLine, formatIso, isIsoDate, parseIso, weekdayIndex } from "@/tools/feiertagskalender/logic";
import { KANAL_KEYS, TYP_KEYS, vorlagenFor, type KanalKey, type TypKey, type Vorlage, type VorlagenKanal } from "./data";

// Anlass-Rückwärtsplaner: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Aus Art, Name, Datum und Kanälen des Anlasses entsteht ein Zeitplan, der rückwärts vom Anlass läuft: Aufgaben von zehn
// Wochen davor bis eine Woche danach. Datum immer als JJJJ-MM-TT, gerechnet mit UTC-Teilen (Funktionen des Feiertagskalenders),
// das heutige Datum kommt als Parameter. Die Vorlagen (data.ts) sind ein Richtwert von Alperna, keine Statistik und keine Vorschrift.
// Spec: specs/anlass-planer.md

export { KANAL_KEYS, TYP_KEYS } from "./data";
export type { KanalKey, TypKey } from "./data";

export const SLUG = "anlass-planer";
export const NAME_MIN = 3;
export const NAME_MAX = 80;
/** Mehr Haken merkt sich der Stand nicht (es gibt weniger Aufgaben). */
export const ERLEDIGT_MAX = 200;
export const ID_MAX = 80;
export const ICS_PRODID = "-//Alperna//Anlass-Planer//DE";
export const ICS_BASE_URL = "https://tools.alperna.ch";
export const TABLE_HEADER = ["Datum", "Aufgabe", "Kanal", "Erledigt"] as const;
export const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export const RICHTWERT_HINWEIS =
  "Die Aufgaben und ihre Vorlaufzeiten sind eine Arbeitshilfe von Alperna (Richtwert von Alperna, keine Statistik), keine Vorschrift. Ob du eine Bewilligung brauchst und welche Fristen gelten, klärst du bei der Gemeinde, beim Anzeiger und in den Statuten.";
export const FAELLIG_HINWEIS = "Der Plan wird nicht verschoben. Hak ab, was schon erledigt ist.";

export type Organisation = "kmu" | "verein";

// ---- Arten und Kanäle ----------------------------------------------------------------------------

export type Typ = { key: TypKey; label: string; vereinFirst: boolean };

/** Die sechs Arten. `vereinFirst`: für Vereine stehen sie zuerst, für KMU zuletzt. Alle sind immer wählbar. */
export const TYPEN: readonly Typ[] = [
  { key: "tag-der-offenen-tuer", label: "Tag der offenen Tür", vereinFirst: false },
  { key: "eroeffnung", label: "Eröffnung", vereinFirst: false },
  { key: "jubilaeum", label: "Jubiläum", vereinFirst: false },
  { key: "messe", label: "Messe oder Marktstand", vereinFirst: false },
  { key: "dorffest", label: "Dorffest oder Vereinsfest", vereinFirst: true },
  { key: "generalversammlung", label: "Generalversammlung", vereinFirst: true },
];

export const isTyp = (v: unknown): v is TypKey => typeof v === "string" && (TYP_KEYS as readonly string[]).includes(v);
export const typLabel = (key: TypKey): string => TYPEN.find((t) => t.key === key)?.label ?? key;

/** Die Arten in der Reihenfolge für die Auswahl: Vereine sehen Dorffest und Generalversammlung zuerst, KMU zuletzt. */
export function typenFor(org: Organisation): Typ[] {
  const first = TYPEN.filter((t) => t.vereinFirst === (org === "verein"));
  const rest = TYPEN.filter((t) => t.vereinFirst !== (org === "verein"));
  return [...first, ...rest];
}

export type Kanal = { key: KanalKey; label: string; re: RegExp };

export const KANAELE: readonly Kanal[] = [
  { key: "website", label: "Website", re: /website|webseite|homepage|blog/i },
  { key: "gbp", label: "Google-Unternehmensprofil", re: /unternehmensprofil|business[- ]?profil|google[- ]?(?:business|maps|profil|my business|unternehmen)|\bgbp\b/i },
  { key: "instagram", label: "Instagram", re: /instagram/i },
  { key: "facebook", label: "Facebook", re: /facebook/i },
  { key: "linkedin", label: "LinkedIn", re: /linkedin/i },
  { key: "newsletter", label: "Newsletter", re: /newsletter|e-?mail|mailing/i },
  { key: "aushang", label: "Aushang und Flyer", re: /aushang|flyer|plakat|prospekt|print/i },
  { key: "presse", label: "Lokalzeitung und Anzeiger", re: /zeitung|anzeiger|inserat|presse|print/i },
  { key: "whatsapp", label: "WhatsApp", re: /whatsapp/i },
];

/** Vorbelegung, wenn das Profil keine Kanäle nennt. */
export const DEFAULT_KANAELE: KanalKey[] = ["website", "instagram", "aushang"];

export const isKanal = (v: unknown): v is KanalKey => typeof v === "string" && (KANAL_KEYS as readonly string[]).includes(v);
export const kanalLabel = (key: VorlagenKanal): string => (key === "intern" ? "intern" : (KANAELE.find((k) => k.key === key)?.label ?? key));

/** Kanäle in fester Reihenfolge, ohne Doppel und ohne Unbekanntes. */
export function normalizeKanaele(list: readonly unknown[]): KanalKey[] {
  return KANAL_KEYS.filter((k) => list.includes(k));
}
export const kanaeleText = (list: readonly unknown[]): string => normalizeKanaele(list).map(kanalLabel).join(", ");

/** Kanäle aus dem Profil (Einträge mit «name» oder «kanal», Vergleich über den Namen), in fester Reihenfolge; leer, wenn keiner passt. */
export function kanaeleAusProfil(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const found: KanalKey[] = [];
  for (const entry of profile.kanaele ?? []) {
    const r = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const name = [r.name, r.kanal].find((x): x is string => typeof x === "string" && x.trim() !== "");
    if (!name) continue;
    for (const k of KANAELE) if (k.re.test(name)) found.push(k.key);
  }
  return normalizeKanaele(found);
}

/** Vorbelegung: die Kanäle aus dem Profil, sonst Website, Instagram, Aushang und Flyer. */
export function kanaeleVorschlag(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const aus = kanaeleAusProfil(profile);
  return aus.length > 0 ? aus : [...DEFAULT_KANAELE];
}

export const organisationOf = (profile: Pick<Profile, "organisationstyp">): Organisation => (profile.organisationstyp === "verein" ? "verein" : "kmu");

// ---- Eingabe und Prüfung ---------------------------------------------------------------------------

export type PlanInput = {
  typ: TypKey;
  name: string;
  /** JJJJ-MM-TT */
  datum: string;
  kanaele: KanalKey[];
  inserate: boolean;
  organisation: Organisation;
};

export type Problem = { feld: "typ" | "name" | "datum" | "kanaele"; text: string };

/** Alle Probleme der Eingabe; leer, wenn sie stimmt. `heute` als JJJJ-MM-TT: der Anlass darf heute stattfinden, nicht davor. */
export function validate(input: { typ: unknown; name: string; datum: string; kanaele: readonly unknown[] }, heute: string): Problem[] {
  const out: Problem[] = [];
  if (!isTyp(input.typ)) out.push({ feld: "typ", text: "Wähle, was du planst." });
  const len = input.name.trim().length;
  if (len < NAME_MIN) out.push({ feld: "name", text: `Gib dem Anlass einen Namen mit mindestens ${NAME_MIN} Zeichen.` });
  else if (len > NAME_MAX) out.push({ feld: "name", text: `Der Name des Anlasses darf höchstens ${NAME_MAX} Zeichen lang sein.` });
  if (!isIsoDate(input.datum)) out.push({ feld: "datum", text: "Wähle das Datum des Anlasses." });
  else if (input.datum < heute) out.push({ feld: "datum", text: "Das Datum liegt in der Vergangenheit. Wähle ein Datum ab heute." });
  if (normalizeKanaele(input.kanaele).length === 0) out.push({ feld: "kanaele", text: "Wähle mindestens einen Kanal." });
  return out;
}

/** Was die Person im Formular angibt. `kanaele` null: noch nicht angefasst, es gilt die Vorbelegung aus dem Profil. */
export type FormFields = { typ: TypKey | null; name: string; datum: string; kanaele: KanalKey[] | null; inserate: boolean };
export const EMPTY_FORM: FormFields = { typ: null, name: "", datum: "", kanaele: null, inserate: false };

export function formFrom(input: PlanInput | null): FormFields {
  return input ? { typ: input.typ, name: input.name, datum: input.datum, kanaele: [...input.kanaele], inserate: input.inserate } : { ...EMPTY_FORM };
}

/** Formular und Profil → Eingabe für den Plan (noch nicht geprüft). Ohne Wahl gilt die erste Art der Liste. */
export function toInput(form: FormFields, profile: Pick<Profile, "organisationstyp" | "kanaele">): PlanInput {
  const organisation = organisationOf(profile);
  return {
    typ: form.typ ?? typenFor(organisation)[0].key,
    name: form.name.trim(),
    datum: form.datum,
    kanaele: normalizeKanaele(form.kanaele ?? kanaeleVorschlag(profile)),
    inserate: form.inserate,
    organisation,
  };
}

// ---- Datum ---------------------------------------------------------------------------------------

/** Heutiges Datum in der Schweiz als JJJJ-MM-TT, unabhängig von der Zeitzone des Geräts. */
export function todayIso(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Ganze Tage von `von` bis `bis` (negativ, wenn `bis` früher liegt). Ungültige Daten ergeben 0. */
export function diffDays(von: string, bis: string): number {
  const a = parseIso(von);
  const b = parseIso(bis);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86_400_000) : 0;
}

/** Tage vor dem Anlass: `tageVorher` der Vorlage, sonst 7 mal die Wochen. Negativ: nach dem Anlass. */
export const tageVor = (v: Pick<Vorlage, "wochenVorher" | "tageVorher">): number => v.tageVorher ?? 7 * v.wochenVorher;

const isWeekend = (iso: string): boolean => weekdayIndex(iso) >= 5;

/**
 * Datum einer Aufgabe: Anlassdatum minus Tage. Ein Wochenende bleibt (Anlässe finden am Wochenende statt), ausser bei Aufgaben
 * mit Kanal «intern»: Sie rutschen auf den Freitag davor. Aufgaben am Anlasstag selbst bleiben stehen. Läge der Freitag einer
 * Aufgabe nach dem Anlass vor oder auf dem Anlass, gilt der folgende Montag.
 */
export function aufgabenDatum(anlass: string, v: Pick<Vorlage, "wochenVorher" | "tageVorher" | "kanal">): string {
  const tage = tageVor(v);
  const roh = addDays(anlass, -tage);
  if (v.kanal !== "intern" || tage === 0 || !isWeekend(roh)) return roh;
  const samstag = weekdayIndex(roh) === 5;
  const freitag = addDays(roh, samstag ? -1 : -2);
  if (tage < 0 && freitag <= anlass) return addDays(roh, samstag ? 2 : 1);
  return freitag;
}

/** «Sa 14.11.2026» */
export function datumKurz(iso: string): string {
  return `${WOCHENTAG_KURZ[weekdayIndex(iso)]} ${formatIso(iso)}`;
}

/** «Samstag, 14.11.2026» */
export function datumLang(iso: string): string {
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${formatIso(iso)}`;
}

// ---- Plan ----------------------------------------------------------------------------------------

export type Aufgabe = {
  id: string;
  titel: string;
  hinweis?: string;
  /** JJJJ-MM-TT */
  datum: string;
  wochenVorher: number;
  kanal: VorlagenKanal;
  werkzeug?: string;
  faellig: boolean;
};

export type Plan = {
  aufgaben: Aufgabe[];
  faelligAnzahl: number;
  /** Ganze Wochen von heute bis zum Anlass (abgerundet, nie negativ). */
  wochenBis: number;
  /** Tage von heute bis zum Anlass; negativ, wenn der Anlass vorbei ist. */
  tageBis: number;
};

function gilt(v: Vorlage, kanaele: ReadonlySet<KanalKey>, input: Pick<PlanInput, "inserate" | "organisation">): boolean {
  if (v.vereinsTyp !== "beide" && v.vereinsTyp !== (input.organisation === "verein")) return false;
  if (v.nurWenn !== undefined) return v.nurWenn === "inserate" ? input.inserate : kanaele.has(v.nurWenn);
  // Aufgaben für Kanäle, die nicht gewählt sind, entfallen.
  return v.kanal === "intern" || kanaele.has(v.kanal);
}

/** Der Zeitplan: alle Aufgaben, die zu Art, Kanälen, Inseraten und Organisation passen, nach Datum und Titel sortiert. `heute` als JJJJ-MM-TT. */
export function buildPlan(input: PlanInput, heute: string): Plan {
  const kanaele = new Set(normalizeKanaele(input.kanaele));
  const aufgaben: Aufgabe[] = [];
  for (const v of isTyp(input.typ) ? vorlagenFor(input.typ) : []) {
    if (!gilt(v, kanaele, input)) continue;
    const datum = aufgabenDatum(input.datum, v);
    aufgaben.push({
      id: v.id,
      titel: v.titel,
      ...(v.hinweis ? { hinweis: v.hinweis } : {}),
      datum,
      wochenVorher: v.wochenVorher,
      kanal: v.kanal,
      ...(v.werkzeug ? { werkzeug: v.werkzeug } : {}),
      faellig: datum < heute,
    });
  }
  aufgaben.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.titel.localeCompare(b.titel, "de-CH")));
  const tageBis = diffDays(heute, input.datum);
  return {
    aufgaben,
    faelligAnzahl: aufgaben.filter((a) => a.faellig).length,
    wochenBis: Math.max(0, Math.floor(tageBis / 7)),
    tageBis,
  };
}

/** «3 Aufgaben sind schon fällig, weil bis zum Anlass 5 Wochen bleiben.» Null, wenn nichts fällig ist. */
export function faelligMeldung(plan: Pick<Plan, "faelligAnzahl" | "wochenBis" | "tageBis">): string | null {
  const n = plan.faelligAnzahl;
  if (n <= 0) return null;
  const kopf = n === 1 ? "1 Aufgabe ist schon fällig" : `${n} Aufgaben sind schon fällig`;
  if (plan.tageBis < 0) return `${kopf}, weil der Anlass vorbei ist.`;
  if (plan.tageBis === 0) return `${kopf}, weil der Anlass heute ist.`;
  if (plan.wochenBis < 1) return `${kopf}, weil bis zum Anlass weniger als eine Woche bleibt.`;
  if (plan.wochenBis === 1) return `${kopf}, weil bis zum Anlass 1 Woche bleibt.`;
  return `${kopf}, weil bis zum Anlass ${plan.wochenBis} Wochen bleiben.`;
}

export type Gruppe = { woche: number; label: string; aufgaben: Aufgabe[] };

/** «10 Wochen vorher», «1 Woche vorher», «Anlasstag», «1 Woche danach» */
export function wochenLabel(woche: number): string {
  if (woche === 0) return "Anlasstag";
  const n = Math.abs(woche);
  return `${n} ${n === 1 ? "Woche" : "Wochen"} ${woche > 0 ? "vorher" : "danach"}`;
}

/** Aufgaben nach Woche gruppiert, früheste Woche zuerst; innerhalb einer Woche bleibt die Reihenfolge des Plans. */
export function groupByWeek(aufgaben: readonly Aufgabe[]): Gruppe[] {
  const map = new Map<number, Aufgabe[]>();
  for (const a of aufgaben) map.set(a.wochenVorher, [...(map.get(a.wochenVorher) ?? []), a]);
  return [...map.entries()].sort((x, y) => y[0] - x[0]).map(([woche, list]) => ({ woche, label: wochenLabel(woche), aufgaben: list }));
}

export const werkzeugHref = (slug: string): string => `/tools/${slug}`;

// ---- Abhaken -------------------------------------------------------------------------------------

/** Die Haken, die zu Aufgaben des Plans gehören; unbekannte IDs fallen weg. */
export function cleanErledigt(plan: Pick<Plan, "aufgaben">, erledigt: readonly string[]): string[] {
  const known = new Set(plan.aufgaben.map((a) => a.id));
  return [...new Set(erledigt)].filter((id) => known.has(id));
}

/** Zahl der erledigten Aufgaben; unbekannte IDs zählen nicht. */
export const erledigtCount = (plan: Pick<Plan, "aufgaben">, erledigt: readonly string[]): number => cleanErledigt(plan, erledigt).length;

/** Haken setzen oder entfernen, ohne Doppel. Ändert die Liste nicht. */
export function toggleErledigt(erledigt: readonly string[], id: string, on: boolean): string[] {
  const rest = erledigt.filter((x) => x !== id);
  return on ? [...rest, id] : rest;
}

// ---- Dokument, Eingabe und Ausgabe fürs CRM ------------------------------------------------------

function aufgabeText(a: Aufgabe): string {
  const notes = [a.hinweis?.replace(/\.$/, ""), a.faellig ? "schon fällig" : undefined].filter(Boolean);
  return notes.length > 0 ? `${a.titel} (${notes.join("; ")})` : a.titel;
}

/**
 * Zeitplan als Dokument für Markdown-Copy, Word und PDF: Steckbrief, Hinweis zu fälligen Aufgaben, Tabelle, Hinweis zur Vorlage.
 * `kompakt` (fürs CRM, das nach 1'900 Zeichen kürzt): ohne Steckbrief, Wochentage, Hinweise, Erledigt-Spalte und Fusshinweis; Art und Datum
 * des Anlasses stehen im Untertitel, die Zahl der fälligen Aufgaben in der Meldung darunter.
 */
export function toDocument(plan: Plan, input: PlanInput, opts: { firma?: string; erledigt?: readonly string[]; kompakt?: boolean } = {}): DocumentModel {
  const done = new Set(opts.erledigt ?? []);
  const meldung = faelligMeldung(plan);
  const blocks: DocBlock[] = [];
  if (!opts.kompakt) {
    blocks.push({
      type: "facts",
      items: [
        { label: "Anlass", value: input.name },
        { label: "Art", value: typLabel(input.typ) },
        { label: "Datum", value: datumLang(input.datum) },
        { label: "Kanäle", value: kanaeleText(input.kanaele) },
        { label: "Bezahlte Inserate", value: input.inserate ? "ja" : "nein" },
        { label: "Aufgaben", value: String(plan.aufgaben.length) },
      ],
    });
  }
  if (meldung) blocks.push({ type: "paragraph", text: opts.kompakt ? meldung : `${meldung} ${FAELLIG_HINWEIS}` });
  blocks.push(
    opts.kompakt
      ? {
          type: "table",
          header: [TABLE_HEADER[0], TABLE_HEADER[1], TABLE_HEADER[2]],
          rows: plan.aufgaben.map((a) => [formatIso(a.datum), a.titel, kanalLabel(a.kanal)]),
        }
      : {
          type: "table",
          header: [...TABLE_HEADER],
          rows: plan.aufgaben.map((a) => [datumKurz(a.datum), aufgabeText(a), kanalLabel(a.kanal), done.has(a.id) ? "[x]" : "[ ]"]),
          widths: [1.7, 5, 2.4, 1.3],
        },
  );
  if (!opts.kompakt) blocks.push({ type: "paragraph", text: RICHTWERT_HINWEIS });
  return {
    title: `Zeitplan: ${input.name}`,
    subtitle: `${typLabel(input.typ)}, ${datumLang(input.datum)}`,
    firma: opts.firma?.trim() || undefined,
    blocks,
    filename: `zeitplan-${safeFilename(input.name)}`,
  };
}

/** Eingabe fürs CRM, eine Angabe je Zeile. */
export function eingabeText(input: PlanInput): string {
  return [
    `Art: ${typLabel(input.typ)}`,
    `Name: ${input.name}`,
    `Datum: ${formatIso(input.datum)}`,
    `Kanäle: ${kanaeleText(input.kanaele)}`,
    `Bezahlte Inserate: ${input.inserate ? "ja" : "nein"}`,
  ].join("\n");
}

/** Ausgabe fürs CRM: der Zeitplan als kompaktes Markdown. Der Server kürzt auf 1'900 Zeichen; Titel, Art, Datum und fällige Aufgaben stehen oben. */
export function ausgabeText(plan: Plan, input: PlanInput, opts: { firma?: string } = {}): string {
  return toMarkdown(toDocument(plan, input, { firma: opts.firma, kompakt: true }));
}

// ---- Kalenderdatei (.ics) ------------------------------------------------------------------------

/** Text für ein iCalendar-Feld: Backslash, Semikolon, Komma und Zeilenumbruch maskiert (RFC 5545, 3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n|\r/g, "\\n");
}

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
const icsDate = (iso: string): string => iso.replace(/-/g, "");

function icsStamp(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Kalenderdatei: ein ganztägiges Ereignis je Aufgabe und eines für den Anlass. UTF-8, Zeilen auf höchstens 75 Oktette gefaltet,
 * Zeilenende CRLF. `now` als Zeitstempel (DTSTAMP).
 */
export function buildIcs(plan: Plan, input: PlanInput, opts: { now: Date; baseUrl?: string }): string {
  const base = (opts.baseUrl ?? ICS_BASE_URL).replace(/\/$/, "");
  const stamp = icsStamp(opts.now);
  const uidBase = `${icsDate(input.datum)}-${safeFilename(input.name).slice(0, 40)}`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${ICS_PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(`Zeitplan: ${input.name}`)}`,
  ];
  const event = (uid: string, datum: string, summary: string, description: string) => {
    lines.push("BEGIN:VEVENT", `UID:${uid}@tools.alperna.ch`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(datum)}`, `DTEND;VALUE=DATE:${icsDate(addDays(datum, 1))}`, `SUMMARY:${icsEscape(summary)}`);
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  };
  event(`${uidBase}-anlass`, input.datum, input.name, `Art: ${typLabel(input.typ)}\nKanäle: ${kanaeleText(input.kanaele)}`);
  for (const a of plan.aufgaben) {
    const description = [`Anlass: ${input.name}`, `Kanal: ${kanalLabel(a.kanal)}`, a.hinweis, a.werkzeug ? `Werkzeug: ${base}${werkzeugHref(a.werkzeug)}` : undefined]
      .filter(Boolean)
      .join("\n");
    event(`${uidBase}-${a.id}`, a.datum, `${a.titel} (${input.name})`, description);
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export const icsFilename = (input: Pick<PlanInput, "name">): string => `zeitplan-${safeFilename(input.name)}.ics`;
export const pdfFilename = (input: Pick<PlanInput, "name">): string => `zeitplan-${safeFilename(input.name)}.pdf`;

// ---- Stand im Browser (mt:anlass-planer) -------------------------------------------------------

export type PlannerState = {
  v: 1;
  phase: "edit" | "result";
  /** Die letzte gültige Eingabe; null, solange noch kein Zeitplan erstellt wurde. */
  input: PlanInput | null;
  /** IDs der abgehakten Aufgaben. */
  erledigt: string[];
  /** Wann der Zeitplan erstellt wurde (JJJJ-MM-TT). */
  output?: { erstellt: string };
};

export const EMPTY_STATE: PlannerState = { v: 1, phase: "edit", input: null, erledigt: [] };

/** Liest eine gespeicherte Eingabe. Null, wenn etwas fehlt oder nicht stimmt. Ein vergangenes Datum ist hier erlaubt. */
export function sanitizeInput(raw: unknown): PlanInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isTyp(r.typ)) return null;
  if (typeof r.name !== "string") return null;
  const name = r.name.trim().slice(0, NAME_MAX);
  if (name.length < NAME_MIN) return null;
  if (!isIsoDate(r.datum)) return null;
  const kanaele = normalizeKanaele(Array.isArray(r.kanaele) ? r.kanaele : []);
  if (kanaele.length === 0) return null;
  return { typ: r.typ, name, datum: r.datum, kanaele, inserate: r.inserate === true, organisation: r.organisation === "verein" ? "verein" : "kmu" };
}

/** Liest den gespeicherten Stand; bei kaputten Daten der leere Stand. Ein Ergebnis ohne gültige Eingabe wird zum Formular. */
export function parseState(raw: unknown): PlannerState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = sanitizeInput(r.input);
  const erledigt = Array.isArray(r.erledigt)
    ? [...new Set(r.erledigt.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= ID_MAX))].slice(0, ERLEDIGT_MAX)
    : [];
  const o = typeof r.output === "object" && r.output !== null ? (r.output as Record<string, unknown>) : null;
  const erstellt = o && isIsoDate(o.erstellt) ? o.erstellt : null;
  return {
    v: 1,
    phase: r.phase === "result" && input ? "result" : "edit",
    input,
    erledigt,
    ...(erstellt ? { output: { erstellt } } : {}),
  };
}
