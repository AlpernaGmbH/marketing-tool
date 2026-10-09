import { z } from "zod";
import { brancheOf } from "@/lib/branchen";
import { KANTONE } from "@/lib/ch";
import { safeFilename, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";

// Feiertagskalender Schweiz: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Aus Kanton, Jahr, Branche und Kanälen entsteht eine sortierte Liste von Anlässen, Feiertagen, Schulferien und eigenen
// Terminen mit je einem Beitrags-Vorschlag. Daraus werden Monatsansicht, Kalenderdatei (.ics), CSV und ein Dokument für
// PDF und Word gebaut. Datensätze: data/anlaesse-ch.json, data/schulferien.json, data/feiertage.json (jeder mit meta.url,
// sonst verworfen). Datumsrechnung nur mit UTC-Teilen und als JJJJ-MM-TT, nie über die lokale Zeitzone.
// Spec: specs/feiertagskalender.md

export const SLUG = "feiertagskalender";
export const MAX_TERMINE = 20;
export const MAX_TITEL = 60;
/** Erinnerung vor einem Anlass in der Kalenderdatei (iCalendar-Dauer). Richtwert von Alperna, keine Statistik. */
export const ALARM_TRIGGER = "-P7D";
export const SUMMARY_PREFIX = "Beitrag: ";
export const CSV_HEADER = ["Datum", "Art", "Titel", "Vorschlag", "Variante 1", "Variante 2", "Variante 3", "Kanäle"] as const;
export const PRODID = "-//Alperna//Feiertagskalender Schweiz//DE";

export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;

// ---- Auswahl: Branchen und Kanäle --------------------------------------------------------------

export const BRANCHEN = [
  { key: "handwerk", label: "Handwerk" },
  { key: "gastronomie", label: "Gastronomie" },
  { key: "dienstleistung", label: "Dienstleistung" },
  { key: "detailhandel", label: "Detailhandel" },
  { key: "verein", label: "Verein" },
  { key: "andere", label: "Andere" },
] as const;
export type Branche = (typeof BRANCHEN)[number]["key"];
export const BRANCHE_KEYS: readonly Branche[] = BRANCHEN.map((b) => b.key);

export const KANAELE = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "google", label: "Google-Beitrag" },
  { key: "newsletter", label: "Newsletter" },
  { key: "website", label: "Website" },
] as const;
export type KanalKey = (typeof KANAELE)[number]["key"];
export const KANAL_KEYS: readonly KanalKey[] = KANAELE.map((k) => k.key);
/** Vorbelegung, wenn das Profil keine Kanäle nennt. */
export const DEFAULT_KANAELE: KanalKey[] = ["instagram", "google"];

export const isBranche = (v: unknown): v is Branche => typeof v === "string" && (BRANCHE_KEYS as readonly string[]).includes(v);
export const isKanal = (v: unknown): v is KanalKey => typeof v === "string" && (KANAL_KEYS as readonly string[]).includes(v);
export const brancheLabel = (key: Branche): string => BRANCHEN.find((b) => b.key === key)?.label ?? key;
export const kanalLabel = (key: KanalKey): string => KANAELE.find((k) => k.key === key)?.label ?? key;

/** Kanäle in fester Reihenfolge, ohne Doppel und ohne Unbekanntes. */
export function normalizeKanaele(list: readonly unknown[]): KanalKey[] {
  return KANAL_KEYS.filter((k) => list.includes(k));
}
export const kanaeleText = (list: readonly KanalKey[]): string => normalizeKanaele(list).map(kanalLabel).join(", ");

const KANAL_RE: [KanalKey, RegExp][] = [
  ["instagram", /instagram/i],
  ["facebook", /facebook/i],
  ["linkedin", /linkedin/i],
  // «Google Ads» ist kein Beitrag; das Unternehmensprofil schon.
  ["google", /^(?!.*(?:ads|adwords)).*(?:google|unternehmensprofil|business[- ]?profil|\bgbp\b)/i],
  ["newsletter", /newsletter|e-?mail|mailing/i],
  ["website", /website|webseite|homepage|blog/i],
];

/** Kanäle aus dem Profil (Einträge mit «name» oder «kanal», Wortvergleich), in fester Reihenfolge; leer, wenn keiner passt. */
export function kanaeleAusProfil(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const found: unknown[] = [];
  for (const k of profile.kanaele ?? []) {
    const r = (typeof k === "object" && k !== null ? k : {}) as Record<string, unknown>;
    const name = [r.name, r.kanal].find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (!name) continue;
    for (const [key, re] of KANAL_RE) if (re.test(name)) found.push(key);
  }
  return normalizeKanaele(found);
}

/** Vorbelegung: die Kanäle aus dem Profil, sonst Instagram und Google-Beitrag. */
export function kanaeleVorschlag(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const aus = kanaeleAusProfil(profile);
  return aus.length > 0 ? aus : [...DEFAULT_KANAELE];
}

/** Vorbelegung der Branche für die Vorschläge: Verein, sonst Wortvergleich mit dem Branchen-Freitext, sonst «Andere». */
export function brancheAusProfil(profile: Pick<Profile, "organisationstyp" | "branche">): Branche {
  if (profile.organisationstyp === "verein") return "verein";
  const text = profile.branche?.trim() ?? "";
  if (text === "") return "andere";
  if (/verein/i.test(text)) return "verein";
  // Die Zuordnung steht in der gemeinsamen Branchenliste (lib/branchen.ts).
  const key = brancheOf(text)?.kalender;
  return BRANCHE_KEYS.includes(key as Branche) ? (key as Branche) : "andere";
}

// ---- Kantone -----------------------------------------------------------------------------------

export const isKanton = (code: unknown): code is string => typeof code === "string" && KANTONE.some(([k]) => k === code);
export const kantonName = (code: string): string => KANTONE.find(([k]) => k === code)?.[1] ?? code;
/** «St. Gallen (SG)» */
export const kantonLabel = (code: string): string => (isKanton(code) ? `${kantonName(code)} (${code})` : code);

// ---- Datum -------------------------------------------------------------------------------------

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");

/** JJJJ-MM-TT aus den UTC-Teilen. */
export function toIso(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** JJJJ-MM-TT → Date (UTC, Mitternacht). null, wenn der Tag nicht existiert. */
export function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null;
  return d;
}

export const isIsoDate = (s: unknown): s is string => typeof s === "string" && parseIso(s) !== null;

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  if (!d) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Wochentag eines Datums, Montag = 0 bis Sonntag = 6. */
export function weekdayIndex(iso: string): number {
  const d = parseIso(iso);
  return d ? (d.getUTCDay() + 6) % 7 : 0;
}

/** 03.10.2026, ohne Zeitzone. */
export function formatIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Ostersonntag nach der Formel von Meeus, Jones und Butcher (gregorianisch), als UTC-Datum. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Der n-te Wochentag (Montag = 0) eines Monats (1 bis 12) als JJJJ-MM-TT; null, wenn es ihn in dem Monat nicht gibt. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): string | null {
  const first = `${pad(year, 4)}-${pad(month)}-01`;
  if (!parseIso(first)) return null;
  const shift = (weekday - weekdayIndex(first) + 7) % 7;
  const iso = `${pad(year, 4)}-${pad(month)}-${pad(1 + shift + 7 * (n - 1))}`;
  return parseIso(iso) ? iso : null;
}

// ---- Datensätze: Schemas -----------------------------------------------------------------------

const httpsUrl = z.string().url().startsWith("https://");
const isoDate = z.string().refine(isIsoDate, "Datum JJJJ-MM-TT");
const kantonCode = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .refine(isKanton, "unbekannter Kanton");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const metaSchema = z.object({
  source: z.string().min(10),
  url: httpsUrl,
  asOf: isoDate,
  note: z.string().min(10),
  links: z.array(z.object({ label: z.string().min(3), url: httpsUrl })).optional(),
});
export type DataMeta = z.infer<typeof metaSchema>;

const RULE_NAMES = ["2-sonntag-mai", "1-sonntag-juni", "black-friday", "schulbeginn", "sechselaeuten"] as const;
const DATUM_FIX = /^fix:(\d{2})-(\d{2})(?:\/(\d{2})-(\d{2}))?$/;
const DATUM_OSTERN = /^ostern:([+-]?\d{1,3})(?:\.\.([+-]?\d{1,3}))?$/;
const DATUM_JAHR = /^fix-jahr:(\d{4}-\d{2}-\d{2})(?:\/(\d{4}-\d{2}-\d{2}))?$/;
const DATUM_REGEL = /^regel:([a-z0-9-]+)$/;

/** Prüft die Schreibweise einer Datumsangabe und ob die Tage im Kalender vorkommen (siehe meta.note in data/anlaesse-ch.json). */
export function isValidDatum(datum: string): boolean {
  let m = DATUM_FIX.exec(datum);
  if (m) {
    // 2024 ist ein Schaltjahr: 02-29 ist erlaubt
    const von = `2024-${m[1]}-${m[2]}`;
    const bis = m[3] ? `2024-${m[3]}-${m[4]}` : von;
    return parseIso(von) !== null && parseIso(bis) !== null && bis >= von;
  }
  m = DATUM_OSTERN.exec(datum);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    return Math.abs(a) <= 100 && Math.abs(b) <= 100 && b >= a;
  }
  m = DATUM_JAHR.exec(datum);
  if (m) {
    const bis = m[2] ?? m[1];
    return parseIso(m[1]) !== null && parseIso(bis) !== null && bis >= m[1];
  }
  m = DATUM_REGEL.exec(datum);
  if (m) return (RULE_NAMES as readonly string[]).includes(m[1]);
  return false;
}

const datumString = z.string().refine(isValidDatum, "datum: fix:MM-TT, ostern:N, regel:<name> oder fix-jahr:JJJJ-MM-TT");

/** Anzahl Varianten je Vorschlag (Beschluss vom 09.10.2026: drei, mit je einem Format, einer Bildidee und einem Hook). */
export const VARIANTEN = 3;

/**
 * Die Formate der Varianten. «Foto mit kurzem Text» steht nicht darin: Es sagt weder, was zu sehen ist, noch, wie der Beitrag
 * aufgebaut ist (Rückmeldung vom 09.10.2026).
 */
export const FORMATE = ["Reel", "Karussell", "Story mit Umfrage", "Einzelbild mit Frage", "Beitrag mit Angebot", "Text-Beitrag", "Vorher-nachher"] as const;
export type Format = (typeof FORMATE)[number];

export const varianteSchema = z.object({
  format: z.enum(FORMATE),
  bildidee: z.string().min(10).max(160),
  hook: z.string().min(10).max(240),
});
export type Variante = z.infer<typeof varianteSchema>;

export const anlassSchema = z.object({
  id: slug,
  name: z.string().min(2).max(60),
  datum: z.union([datumString, z.array(datumString).min(1)]),
  region: z.union([z.literal("alle"), z.array(kantonCode).min(1)]),
  branchen: z.union([z.literal("alle"), z.array(z.enum(["handwerk", "gastronomie", "dienstleistung", "detailhandel", "verein"])).min(1)]),
  /** Kurzer Hinweis zum Anlass, zum Beispiel «Das Datum legt jede Gemeinde selbst fest». */
  hinweis: z.string().min(10).max(240).optional(),
  vorschlag: z.object({ titel: z.string().min(3).max(80), varianten: z.array(varianteSchema).length(VARIANTEN) }),
});
export type Anlass = z.infer<typeof anlassSchema>;
export type Vorschlag = Anlass["vorschlag"];

export const anlaesseDataSchema = z.object({ meta: metaSchema, anlaesse: z.array(anlassSchema).min(1) });
export type AnlaesseData = z.infer<typeof anlaesseDataSchema>;

export const ferienblockSchema = z
  .object({
    kanton: kantonCode,
    schuljahr: z.string().regex(/^\d{4}\/\d{2}$/),
    name: z.string().min(3).max(40),
    von: isoDate,
    bis: isoDate,
  })
  .refine((f) => f.bis >= f.von, "bis liegt vor von");
export type Ferienblock = z.infer<typeof ferienblockSchema>;

export const schulferienDataSchema = z.object({
  meta: metaSchema,
  hinweise: z.record(kantonCode, z.string().min(5)).optional(),
  ferien: z.array(ferienblockSchema).min(1),
});
export type SchulferienData = z.infer<typeof schulferienDataSchema>;

const quelleSchema = z.object({ titel: z.string().min(1), url: httpsUrl, stand: z.string().min(1) });
export type Quelle = z.infer<typeof quelleSchema>;

export const feiertagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  datum: z.string().refine(isValidDatum, "datum"),
  kantone: z.union([z.literal("alle"), z.array(kantonCode).min(1)]),
  art: z.enum(["gesetzlich", "ortsueblich"]),
  hinweis: z.string().optional(),
  bedingung: z.string().optional(),
});
export type Feiertag = z.infer<typeof feiertagSchema>;

/** Liest data/feiertage.json defensiv: nur die Felder, die dieses Werkzeug braucht. Weitere Felder stören nicht. */
const feiertageEnvelope = z.object({
  meta: metaSchema.pick({ source: true, url: true, asOf: true }),
  jahre: z.array(z.number().int()).min(1),
  bund: z.array(quelleSchema),
  quellen: z.record(kantonCode, quelleSchema),
  hinweise: z.record(kantonCode, z.string()).optional(),
  feiertage: z.array(z.unknown()).min(1),
});
export type FeiertageData = Omit<z.infer<typeof feiertageEnvelope>, "feiertage"> & { feiertage: Feiertag[] };

export const parseAnlaesse = (raw: unknown): AnlaesseData | null => {
  const r = anlaesseDataSchema.safeParse(raw);
  return r.success ? r.data : null;
};
export const parseSchulferien = (raw: unknown): SchulferienData | null => {
  const r = schulferienDataSchema.safeParse(raw);
  return r.success ? r.data : null;
};
/** Ein kaputter Eintrag fällt weg, die übrigen bleiben; ohne einen einzigen gültigen Eintrag oder ohne Quelle (meta.url) gilt der Datensatz als fehlend. */
export const parseFeiertage = (raw: unknown): FeiertageData | null => {
  const r = feiertageEnvelope.safeParse(raw);
  if (!r.success) return null;
  const feiertage: Feiertag[] = [];
  for (const f of r.data.feiertage) {
    const one = feiertagSchema.safeParse(f);
    if (one.success) feiertage.push(one.data);
  }
  return feiertage.length > 0 ? { ...r.data, feiertage } : null;
};

/** Die drei Datensätze; null heisst: fehlt oder verletzt das Schema (das Werkzeug sagt das dann im Hinweis). */
export type KalenderData = { anlaesse: AnlaesseData | null; ferien: SchulferienData | null; feiertage: FeiertageData | null };

/**
 * Kleine eigene Liste, falls data/feiertage.json fehlt oder kaputt ist. Quellen: Bundesamt für Justiz (Neujahr, Auffahrt und
 * Weihnachtstag haben alle Kantone als gesetzliche Feiertage bezeichnet, Stand 1. Januar 2011) und SECO (1. August).
 */
export const FALLBACK_FEIERTAGE: Feiertag[] = [
  { id: "neujahr", name: "Neujahrstag", datum: "fix:01-01", kantone: "alle", art: "gesetzlich" },
  { id: "auffahrt", name: "Auffahrt", datum: "ostern:+39", kantone: "alle", art: "gesetzlich" },
  { id: "bundesfeier", name: "Bundesfeiertag", datum: "fix:08-01", kantone: "alle", art: "gesetzlich" },
  { id: "weihnachten", name: "Weihnachtstag", datum: "fix:12-25", kantone: "alle", art: "gesetzlich" },
];
export const FALLBACK_QUELLEN: { label: string; url: string }[] = [
  { label: "Bundesamt für Justiz: Gesetzliche Feiertage (Stand 1. Januar 2011)", url: "https://www.bj.admin.ch/dam/de/sd-web/MW4dthCLc4Nv/kant-feiertage.pdf" },
  { label: "SECO: Freizeit und Feiertage", url: "https://www.seco.admin.ch/de/faq-freizeit-und-feiertage" },
];

// ---- Datumsangaben auflösen --------------------------------------------------------------------

export type Range = { von: string; bis: string };

/**
 * Löst eine Datumsangabe für ein Jahr auf: von und bis als JJJJ-MM-TT (bei einem Tag gleich). null, wenn die Angabe für das Jahr
 * nicht gilt (fix-jahr eines anderen Jahres, Schulbeginn ohne Sommerferien) oder kaputt ist. `ferien` sind die Blöcke des Kantons.
 */
export function resolveRule(datum: string, year: number, ferien: readonly Ferienblock[] = []): Range | null {
  if (!Number.isInteger(year) || year < 1583 || year > 9999) return null;
  let m = DATUM_FIX.exec(datum);
  if (m) {
    const von = `${pad(year, 4)}-${m[1]}-${m[2]}`;
    const bis = m[3] ? `${pad(year, 4)}-${m[3]}-${m[4]}` : von;
    return parseIso(von) && parseIso(bis) && bis >= von ? { von, bis } : null;
  }
  m = DATUM_OSTERN.exec(datum);
  if (m) {
    const ostern = toIso(easterSunday(year));
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    return b >= a ? { von: addDays(ostern, a), bis: addDays(ostern, b) } : null;
  }
  m = DATUM_JAHR.exec(datum);
  if (m) {
    const bis = m[2] ?? m[1];
    if (Number(m[1].slice(0, 4)) !== year || !parseIso(m[1]) || !parseIso(bis) || bis < m[1]) return null;
    return { von: m[1], bis };
  }
  m = DATUM_REGEL.exec(datum);
  if (m) {
    let iso: string | null = null;
    switch (m[1]) {
      case "2-sonntag-mai":
        iso = nthWeekday(year, 5, 6, 2);
        break;
      case "1-sonntag-juni":
        iso = nthWeekday(year, 6, 6, 1);
        break;
      case "black-friday": {
        const thanksgiving = nthWeekday(year, 11, 3, 4); // vierter Donnerstag im November
        iso = thanksgiving ? addDays(thanksgiving, 1) : null;
        break;
      }
      case "sechselaeuten": {
        // Dritter Montag im April; fällt er auf den Ostermontag, der vierte (Stadtratsbeschluss Nr. 1214 vom 13. Juni 1952).
        const dritter = nthWeekday(year, 4, 0, 3);
        iso = dritter === addDays(toIso(easterSunday(year)), 1) ? nthWeekday(year, 4, 0, 4) : dritter;
        break;
      }
      case "schulbeginn": {
        const sommer = ferien.find((f) => /sommer/i.test(f.name) && f.bis.startsWith(`${pad(year, 4)}-`));
        iso = sommer ? addDays(sommer.bis, 1) : null;
        break;
      }
    }
    return iso ? { von: iso, bis: iso } : null;
  }
  return null;
}

/** Wie resolveRule, für eine Angabe oder eine Liste von Angaben (die erste, die für das Jahr gilt). */
export function resolveDatum(datum: string | readonly string[], year: number, ferien: readonly Ferienblock[] = []): Range | null {
  for (const d of typeof datum === "string" ? [datum] : datum) {
    const r = resolveRule(d, year, ferien);
    if (r) return r;
  }
  return null;
}

// ---- Eingabe und eigene Termine ----------------------------------------------------------------

export type Termin = { datum: string; titel: string };
export type Input = { jahr: number; kanton: string; branche: Branche; kanaele: KanalKey[]; termine: Termin[] };

/** Das laufende und das nächste Jahr. */
export function yearOptions(now: Date): number[] {
  const y = now.getFullYear();
  return [y, y + 1];
}
export const defaultYear = (now: Date): number => yearOptions(now)[0];

/** Titel eines Termins: Leerraum zusammengefasst, Steuerzeichen entfernt, auf 60 Zeichen gekürzt. */
export function cleanTitel(s: string): string {
  return s
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITEL)
    .trim();
}

export function sortTermine(list: readonly Termin[]): Termin[] {
  return [...list].sort((a, b) => (a.datum === b.datum ? a.titel.localeCompare(b.titel, "de") : a.datum < b.datum ? -1 : 1));
}

/** Meldung, wenn der Termin nicht in die Liste passt; null, wenn er passt. */
export function terminProblem(list: readonly Termin[], datum: string, titel: string): string | null {
  if (list.length >= MAX_TERMINE) return `Du kannst höchstens ${MAX_TERMINE} eigene Termine eintragen.`;
  if (!isIsoDate(datum)) return "Wähle ein gültiges Datum für den Termin.";
  const t = cleanTitel(titel);
  if (t === "") return "Gib dem Termin einen Titel.";
  if (list.some((x) => x.datum === datum && x.titel.toLowerCase() === t.toLowerCase())) return "Diesen Termin gibt es schon.";
  return null;
}

/** Fügt einen Termin hinzu (sortiert). Bei einer Meldung bleibt die Liste, wie sie war. */
export function addTermin(list: readonly Termin[], datum: string, titel: string): { ok: true; list: Termin[] } | { ok: false; error: string } {
  const error = terminProblem(list, datum, titel);
  if (error) return { ok: false, error };
  return { ok: true, list: sortTermine([...list, { datum, titel: cleanTitel(titel) }]) };
}

export function removeTermin(list: readonly Termin[], index: number): Termin[] {
  return list.filter((_, i) => i !== index);
}

/** Meldung zum ersten Fehler im Formular; null, wenn alles passt. */
export function formProblem(f: { kanton: string; jahr: number | null; kanaele: readonly KanalKey[] }): string | null {
  if (!isKanton(f.kanton)) return "Wähle in den Grunddaten deinen Kanton. Er bestimmt Feiertage und Schulferien.";
  if (f.jahr === null || !Number.isInteger(f.jahr)) return "Wähle das Jahr.";
  if (normalizeKanaele(f.kanaele).length === 0) return "Wähle mindestens einen Kanal.";
  return null;
}

// ---- Feiertage je Kanton -----------------------------------------------------------------------

export type Holiday = { id: string; name: string; date: string; hinweis?: string };
export type HolidaysResult = {
  /** Gesetzliche Tage, die im Jahr gelten. */
  tage: Holiday[];
  /** Ortsübliche Tage: gelten nur in Teilen des Kantons, stehen nicht im Kalender. */
  ortsueblich: Holiday[];
  /** Tage, die im Jahr wegen einer Bedingung der Quelle nicht gelten, mit dem Grund. */
  entfallen: { name: string; grund: string }[];
  /** true: der Kanton hat in feiertage.json eine eigene Quelle; sonst nur die eidgenössischen Tage. */
  belegt: boolean;
};

/** Kantone, für die feiertage.json mindestens einen Tag mit Quelle nennt. */
export function feiertageKantone(data: FeiertageData | null): string[] {
  if (!data) return [];
  const out = new Set<string>();
  for (const f of data.feiertage) if (f.kantone !== "alle") for (const k of f.kantone) out.add(k);
  return KANTONE.map(([k]) => k as string).filter((k) => out.has(k) && k in data.quellen);
}

export function holidaysFor(kanton: string, year: number, data: FeiertageData | null): HolidaysResult {
  const belegt = feiertageKantone(data).includes(kanton);
  const list: Feiertag[] = data ? data.feiertage : FALLBACK_FEIERTAGE;
  const res: HolidaysResult = { tage: [], ortsueblich: [], entfallen: [], belegt };
  const seen = new Set<string>();
  for (const f of list) {
    const applies = f.kantone === "alle" || (belegt && f.kantone.includes(kanton));
    if (!applies || seen.has(f.id)) continue;
    const r = resolveRule(f.datum, year);
    if (!r) continue;
    seen.add(f.id);
    const h: Holiday = { id: f.id, name: f.name, date: r.von };
    if (f.hinweis) h.hinweis = f.hinweis;
    if (f.art === "ortsueblich") {
      res.ortsueblich.push(h);
      continue;
    }
    if (f.bedingung === "weihnachten-nicht-mo-fr") {
      const wd = weekdayIndex(`${pad(year, 4)}-12-25`);
      if (wd === 0 || wd === 4) {
        res.entfallen.push({ name: f.name, grund: `Der Weihnachtstag fällt ${year} auf einen ${WEEKDAYS[wd]}.` });
        continue;
      }
    }
    res.tage.push(h);
  }
  return res;
}

/** Kantone, für die schulferien.json Ferienblöcke nennt. */
export function ferienKantone(data: SchulferienData | null): string[] {
  if (!data) return [];
  const have = new Set(data.ferien.map((f) => f.kanton));
  return KANTONE.map(([k]) => k as string).filter((k) => have.has(k));
}

/** Die Ferienblöcke eines Kantons, die das Jahr berühren, nach Beginn sortiert. */
export function ferienFor(kanton: string, year: number, data: SchulferienData | null): Ferienblock[] {
  if (!data) return [];
  const start = `${pad(year, 4)}-01-01`;
  const end = `${pad(year, 4)}-12-31`;
  return data.ferien.filter((f) => f.kanton === kanton && f.bis >= start && f.von <= end).sort((a, b) => (a.von < b.von ? -1 : a.von > b.von ? 1 : 0));
}

// ---- Einträge ----------------------------------------------------------------------------------

export type EntryArt = "anlass" | "feiertag" | "ferien" | "termin";
const ART_ORDER: Record<EntryArt, number> = { anlass: 0, feiertag: 1, termin: 2, ferien: 3 };

export type Entry = {
  /** Eindeutig innerhalb des Kalenders; Grundlage der UID in der Kalenderdatei. */
  key: string;
  art: EntryArt;
  /** Nur bei Anlässen: der Tag ist zugleich gesetzlicher Feiertag des Kantons. */
  auchFeiertag: boolean;
  titel: string;
  /** Erster und letzter Tag im Jahr (bei Ferien über den Jahreswechsel gekürzt). */
  von: string;
  bis: string;
  /** Erster und letzter Tag ungekürzt, für die Anzeige. */
  vonOrig: string;
  bisOrig: string;
  vorschlag?: Vorschlag;
  hinweis?: string;
};

export function artLabel(e: Pick<Entry, "art" | "auchFeiertag">): string {
  switch (e.art) {
    case "anlass":
      return e.auchFeiertag ? "Anlass und Feiertag" : "Anlass";
    case "feiertag":
      return "Feiertag";
    case "ferien":
      return "Schulferien";
    case "termin":
      return "Eigener Termin";
  }
}

export const isMultiDay = (e: Pick<Entry, "vonOrig" | "bisOrig">): boolean => e.bisOrig > e.vonOrig;

/** «10.05.2026, Sonntag» oder, bei mehreren Tagen, «04.07.2026 bis 09.08.2026». */
export function dateLabel(e: Pick<Entry, "vonOrig" | "bisOrig">): string {
  return isMultiDay(e) ? `${formatIso(e.vonOrig)} bis ${formatIso(e.bisOrig)}` : `${formatIso(e.vonOrig)}, ${WEEKDAYS[weekdayIndex(e.vonOrig)]}`;
}

/** «10.05.2026, Sonntag: Muttertag» */
export const entryLine = (e: Entry): string => `${dateLabel(e)}: ${e.titel}`;

export type KalenderEingabe = Pick<Input, "jahr" | "kanton" | "branche" | "termine">;

/** Wählt je Anlass (gleiche id) die Variante der Branche, sonst die Variante «alle»; gibt es keine von beiden, fehlt der Anlass. */
export function selectAnlaesse(anlaesse: readonly Anlass[], kanton: string, branche: Branche): Anlass[] {
  const groups = new Map<string, Anlass[]>();
  for (const a of anlaesse) {
    if (a.region !== "alle" && !a.region.includes(kanton)) continue;
    const g = groups.get(a.id);
    if (g) g.push(a);
    else groups.set(a.id, [a]);
  }
  const out: Anlass[] = [];
  for (const g of groups.values()) {
    const exact = g.find((a) => a.branchen !== "alle" && (a.branchen as readonly string[]).includes(branche));
    const common = g.find((a) => a.branchen === "alle");
    const pick = exact ?? common;
    if (pick) out.push(pick);
  }
  return out;
}

function sortEntries(list: Entry[]): Entry[] {
  return list.sort((a, b) => {
    if (a.von !== b.von) return a.von < b.von ? -1 : 1;
    if (a.art !== b.art) return ART_ORDER[a.art] - ART_ORDER[b.art];
    return a.titel.localeCompare(b.titel, "de");
  });
}

/** Macht die Schlüssel eindeutig (zwei gleiche Titel am gleichen Tag bekommen -2, -3 …). */
function uniqueKeys(list: Entry[]): Entry[] {
  const seen = new Map<string, number>();
  for (const e of list) {
    const n = (seen.get(e.key) ?? 0) + 1;
    seen.set(e.key, n);
    if (n > 1) e.key = `${e.key}-${n}`;
  }
  return list;
}

const keyOf = (art: EntryArt, name: string, von: string): string => `${art}-${safeFilename(name, "eintrag").slice(0, 40)}-${von}`;

/**
 * Alle Einträge des Jahres, nach Datum sortiert: Anlässe (Region und Branche gefiltert), gesetzliche Feiertage, Schulferien des
 * Kantons und eigene Termine. Fehlt ein Datensatz (null), arbeitet das Werkzeug ohne ihn.
 */
export function entriesFor(input: KalenderEingabe, data: KalenderData): Entry[] {
  const { jahr, kanton } = input;
  const start = `${pad(jahr, 4)}-01-01`;
  const end = `${pad(jahr, 4)}-12-31`;
  const blocks = ferienFor(kanton, jahr, data.ferien);
  // Für Schulbeginn zählt der Sommer, der im Jahr endet.
  const alleBloecke = data.ferien ? data.ferien.ferien.filter((f) => f.kanton === kanton) : [];
  const out: Entry[] = [];
  const anlassById = new Map<string, Entry>();

  if (data.anlaesse) {
    for (const a of selectAnlaesse(data.anlaesse.anlaesse, kanton, input.branche)) {
      const r = resolveDatum(a.datum, jahr, alleBloecke);
      if (!r || r.von < start || r.von > end) continue;
      const entry: Entry = {
        key: keyOf("anlass", a.id, r.von),
        art: "anlass",
        auchFeiertag: false,
        titel: a.name,
        von: r.von,
        bis: r.bis,
        vonOrig: r.von,
        bisOrig: r.bis,
        vorschlag: a.vorschlag,
        ...(a.hinweis ? { hinweis: a.hinweis } : {}),
      };
      out.push(entry);
      anlassById.set(a.id, entry);
    }
  }

  const hol = holidaysFor(kanton, jahr, data.feiertage);
  for (const h of hol.tage) {
    // Gleicher Tag und gleiche id wie ein Anlass (Neujahr, 1. August, Weihnachten): ein Eintrag, als Anlass und Feiertag.
    const same = anlassById.get(h.id);
    if (same && same.von === h.date && same.bis === h.date) {
      same.auchFeiertag = true;
      if (h.hinweis) same.hinweis = same.hinweis ? `${same.hinweis} ${h.hinweis}` : h.hinweis;
      continue;
    }
    out.push({
      key: keyOf("feiertag", h.id, h.date),
      art: "feiertag",
      auchFeiertag: false,
      titel: h.name,
      von: h.date,
      bis: h.date,
      vonOrig: h.date,
      bisOrig: h.date,
      ...(h.hinweis ? { hinweis: h.hinweis } : {}),
    });
  }

  for (const f of blocks) {
    const von = f.von < start ? start : f.von;
    const bis = f.bis > end ? end : f.bis;
    out.push({ key: keyOf("ferien", f.name, f.von), art: "ferien", auchFeiertag: false, titel: f.name, von, bis, vonOrig: f.von, bisOrig: f.bis });
  }

  for (const t of input.termine) {
    if (!isIsoDate(t.datum) || t.datum < start || t.datum > end) continue;
    out.push({ key: keyOf("termin", t.titel, t.datum), art: "termin", auchFeiertag: false, titel: cleanTitel(t.titel) || "Termin", von: t.datum, bis: t.datum, vonOrig: t.datum, bisOrig: t.datum });
  }

  return uniqueKeys(sortEntries(out));
}

/** Eigene Termine, die nicht im gewählten Jahr liegen und darum im Kalender fehlen. */
export const termineAusserhalb = (input: Pick<Input, "jahr" | "termine">): Termin[] =>
  input.termine.filter((t) => !isIsoDate(t.datum) || !t.datum.startsWith(`${pad(input.jahr, 4)}-`));

export type MonthGroup = { month: number; name: string; label: string; entries: Entry[] };

/** Zwölf Monate, immer alle, auch leere. Ein Eintrag steht in dem Monat, in dem er im Jahr beginnt. */
export function byMonth(entries: readonly Entry[], year: number): MonthGroup[] {
  return MONATE.map((name, i) => ({
    month: i + 1,
    name,
    label: `${name} ${year}`,
    entries: entries.filter((e) => e.von.startsWith(`${pad(year, 4)}-${pad(i + 1)}-`)),
  }));
}

/** «10.05.» aus einem Datum JJJJ-MM-TT. */
const dayMonth = (iso: string): string => `${formatIso(iso).slice(0, 5)}.`;

const RASTER_SPALTEN: readonly [EntryArt, string][] = [
  ["anlass", "Anlässe"],
  ["feiertag", "Feiertage"],
  ["ferien", "Schulferien"],
  ["termin", "Eigene Termine"],
];

/**
 * Das Jahr auf einen Blick: zwölf Monate als Zeilen, je Art eine Spalte (Anlässe, Feiertage, Schulferien, eigene Termine).
 * Spalten ohne Eintrag entfallen; ohne jeden Eintrag gibt es kein Raster. Ferien stehen im Monat, in dem sie beginnen.
 */
export function jahresRaster(cal: Pick<Calendar, "months">): DocBlock | null {
  const used = RASTER_SPALTEN.filter(([art]) => cal.months.some((m) => m.entries.some((e) => e.art === art)));
  if (used.length === 0) return null;
  return {
    type: "grid",
    title: "Dein Jahr auf einen Blick",
    columns: used.map(([, label]) => label),
    rows: cal.months.map((m) => ({
      label: m.name,
      cells: used.map(([art]) =>
        m.entries
          .filter((e) => e.art === art)
          .map((e) => `${art === "ferien" ? "ab " : ""}${dayMonth(e.vonOrig)} ${e.titel}`)
          .join("\n"),
      ),
    })),
  };
}

// ---- Hinweis mit Quellen -----------------------------------------------------------------------

export type SourceLink = { label: string; url: string };
export type SourceGroup = { titel: string; text: string; stand: string | null; links: SourceLink[] };
export type SourceNote = {
  gruppen: SourceGroup[];
  /** Die Sätze dazu, welche Kantone belegt sind. */
  kantone: string[];
  /** Hinweise zu diesem Kanton und Jahr: Lücken, ortsübliche Tage, ausgefallene Tage, Termine ausserhalb. */
  hinweise: string[];
};

const codes = (list: readonly string[]): string => list.join(", ");

/** Quellen mit Links aus den Datensätzen und die Sätze, was belegt ist und was fehlt. */
export function quellenHinweis(input: Pick<Input, "kanton" | "jahr" | "termine">, data: KalenderData): SourceNote {
  const { kanton, jahr } = input;
  const name = kantonName(kanton);
  const gruppen: SourceGroup[] = [];
  const hinweise: string[] = [];
  const kantone: string[] = [];

  if (data.anlaesse) {
    const m = data.anlaesse.meta;
    gruppen.push({ titel: "Anlässe", text: m.source, stand: m.asOf, links: m.links ?? [{ label: m.source, url: m.url }] });
  } else {
    hinweise.push("Die Liste der Anlässe konnte nicht gelesen werden. Der Kalender zeigt nur Feiertage, Schulferien und deine Termine.");
  }

  if (data.ferien) {
    const m = data.ferien.meta;
    gruppen.push({ titel: "Schulferien", text: m.source, stand: m.asOf, links: m.links ?? [{ label: m.source, url: m.url }] });
    const have = ferienKantone(data.ferien);
    const missing = KANTONE.map(([k]) => k as string).filter((k) => !have.includes(k));
    kantone.push(`Schulferien sind für ${have.length} Kantone belegt (${codes(have)}).${missing.length ? ` Es fehlen ${codes(missing)}.` : ""}`);
    if (!have.includes(kanton)) hinweise.push(`Für ${name} haben wir keine geprüften Schulferien. Sie fehlen im Kalender; trag sie bei Bedarf als eigene Termine ein.`);
    else {
      if (ferienFor(kanton, jahr, data.ferien).length === 0) hinweise.push(`Für ${jahr} liegen für ${name} keine Schulferien vor.`);
      const h = data.ferien.hinweise?.[kanton];
      if (h) hinweise.push(`Schulferien ${name}: ${h}`);
    }
  } else {
    hinweise.push("Die Schulferien konnten nicht gelesen werden und fehlen im Kalender.");
  }

  if (data.feiertage) {
    const m = data.feiertage.meta;
    const links: SourceLink[] = [];
    const q = data.feiertage.quellen[kanton];
    if (q) links.push({ label: `${name}: ${q.titel} (${q.stand})`, url: q.url });
    for (const b of data.feiertage.bund) links.push({ label: `Bund: ${b.titel} (${b.stand})`, url: b.url });
    gruppen.push({ titel: "Feiertage", text: m.source, stand: m.asOf, links });
    const have = feiertageKantone(data.feiertage);
    kantone.push(
      have.length === KANTONE.length
        ? `Feiertage sind für alle ${have.length} Kantone belegt.`
        : `Feiertage sind für ${have.length} Kantone belegt (${codes(have)}). Für alle anderen zeigt das Werkzeug nur Neujahr, Auffahrt, den 1. August und Weihnachten.`,
    );
    if (!data.feiertage.jahre.includes(jahr)) {
      hinweise.push(`Die Feiertage sind für ${data.feiertage.jahre.join(" und ")} geprüft. Für ${jahr} sind sie nach denselben Regeln gerechnet, aber nicht geprüft.`);
    }
    const fh = data.feiertage.hinweise?.[kanton];
    if (fh) hinweise.push(`Feiertage ${name}: ${fh}`);
  } else {
    gruppen.push({
      titel: "Feiertage",
      text: "Die Liste der Kantone konnte nicht gelesen werden. Es gelten nur Neujahr, Auffahrt, der 1. August und Weihnachten.",
      stand: null,
      links: FALLBACK_QUELLEN,
    });
  }
  const hol = holidaysFor(kanton, jahr, data.feiertage);
  if (!hol.belegt) hinweise.push(`Für ${name} haben wir keine geprüfte Feiertagsliste. Angezeigt sind nur Neujahr, Auffahrt, der 1. August und Weihnachten.`);
  if (hol.ortsueblich.length > 0) {
    hinweise.push(`Ortsübliche Feiertage gelten nur in Teilen von ${name} und stehen nicht im Kalender: ${hol.ortsueblich.map((h) => h.name).join(", ")}. Frag bei deiner Gemeinde nach.`);
  }
  for (const e of hol.entfallen) hinweise.push(`${e.name} gilt ${jahr} nicht. ${e.grund}`);

  const aus = termineAusserhalb({ jahr, termine: input.termine });
  if (aus.length > 0) hinweise.push(`${aus.length === 1 ? "Ein eigener Termin liegt" : `${aus.length} eigene Termine liegen`} nicht in ${jahr} und fehlt${aus.length === 1 ? "" : "en"} im Kalender.`);
  return { gruppen, kantone, hinweise };
}

// ---- Kalender als Ganzes -----------------------------------------------------------------------

export type Calendar = { input: Input; entries: Entry[]; months: MonthGroup[]; note: SourceNote };

export function buildCalendar(input: Input, data: KalenderData): Calendar {
  const entries = entriesFor(input, data);
  return { input, entries, months: byMonth(entries, input.jahr), note: quellenHinweis(input, data) };
}

export function counts(entries: readonly Entry[]): { anlaesse: number; feiertage: number; ferien: number; termine: number } {
  return {
    anlaesse: entries.filter((e) => e.art === "anlass").length,
    feiertage: entries.filter((e) => e.art === "feiertag" || (e.art === "anlass" && e.auchFeiertag)).length,
    ferien: entries.filter((e) => e.art === "ferien").length,
    termine: entries.filter((e) => e.art === "termin").length,
  };
}

/** «12 Anlässe, 9 Feiertage, 4 Schulferien, 2 eigene Termine» */
export function countsText(entries: readonly Entry[]): string {
  const c = counts(entries);
  const one = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
  return [one(c.anlaesse, "Anlass", "Anlässe"), one(c.feiertage, "Feiertag", "Feiertage"), one(c.ferien, "Schulferienblock", "Schulferienblöcke"), one(c.termine, "eigener Termin", "eigene Termine")].join(", ");
}

// ---- Kalenderdatei (.ics) ----------------------------------------------------------------------

const icsEscape = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Faltet eine Zeile nach RFC 5545 auf höchstens 75 Oktette, ohne ein UTF-8-Zeichen zu trennen. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // das führende Leerzeichen der Folgezeile zählt mit
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const icsDate = (iso: string): string => iso.replace(/-/g, "");

function icsStamp(now: Date): string {
  const d = now;
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Eine Variante als Textblock: Format, Bildidee, Hook. */
export const varianteText = (v: Variante, nr: number): string => `Variante ${nr}, ${v.format}\nBild: ${v.bildidee}\nHook: ${v.hook}`;

/** Text für DESCRIPTION: Vorschlag mit den drei Varianten, Kanäle; bei Ferien und Feiertagen eine Zeile zur Art. */
export function entryDescription(e: Entry, input: Pick<Input, "kanton" | "kanaele">): string {
  const lines: string[] = [];
  if (e.vorschlag) {
    lines.push(`Vorschlag: ${e.vorschlag.titel}`);
    e.vorschlag.varianten.forEach((v, i) => lines.push("", varianteText(v, i + 1)));
    lines.push("", `Kanäle: ${kanaeleText(input.kanaele)}`);
  }
  if (e.art === "ferien") lines.push(`Schulferien ${kantonName(input.kanton)}: ${dateLabel(e)}`);
  if (e.art === "feiertag" || e.auchFeiertag) lines.push(`Gesetzlicher Feiertag in ${kantonName(input.kanton)}.`);
  if (e.art === "termin") lines.push("Eigener Termin");
  if (e.hinweis) lines.push(e.hinweis);
  return lines.join("\n");
}

/** Kalenderdatei: ein Ganztagstermin je Eintrag, Mehrtägiges als mehrtägiger Termin, bei Anlässen eine Erinnerung 7 Tage vorher. */
export function buildIcs(cal: Calendar, opts: { firma?: string; now: Date }): string {
  const { input } = cal;
  const firma = opts.firma?.trim();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(`Feiertagskalender ${input.jahr}${firma ? ` ${firma}` : ""}`)}`,
  ];
  const stamp = icsStamp(opts.now);
  for (const e of cal.entries) {
    const summary = `${SUMMARY_PREFIX}${e.titel}`;
    const description = entryDescription(e, input);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.key}@tools.alperna.ch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.von)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.bis, 1))}`,
      `SUMMARY:${icsEscape(summary)}`,
    );
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push("TRANSP:TRANSPARENT");
    if (e.art === "anlass") {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(summary)}`, `TRIGGER:${ALARM_TRIGGER}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ---- CSV ---------------------------------------------------------------------------------------

export const CSV_BOM = "\uFEFF";

/** Eine Zelle: einzeilig, mit Anführungszeichen bei Semikolon, Anführungszeichen oder Zeilenumbruch. Beginnt sie mit «=», «+», «-» oder «@», steht ein Apostroph davor, damit Excel keine Formel ausführt. */
export function csvCell(value: string): string {
  let v = value.replace(/\s*[\r\n]+\s*/g, " ");
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Eine Variante in einer Zelle: «Reel. Bild: … Hook: …». */
export const varianteZelle = (v: Variante): string => `${v.format}. Bild: ${v.bildidee}. Hook: ${v.hook}`;

/** Datum;Art;Titel;Vorschlag;Variante 1 bis 3;Kanäle, UTF-8 mit BOM, Semikolon, CRLF. Das Datum ist der erste Tag im Jahr; Mehrtägiges trägt das Ende im Titel. */
export function buildCsv(cal: Calendar): string {
  const kanaele = kanaeleText(cal.input.kanaele);
  const rows = cal.entries.map((e) => {
    const titel = isMultiDay(e) ? `${e.titel} (bis ${formatIso(e.bisOrig)})` : e.titel;
    return [
      formatIso(e.von),
      artLabel(e),
      titel,
      e.vorschlag ? e.vorschlag.titel : "",
      ...Array.from({ length: VARIANTEN }, (_, i) => (e.vorschlag?.varianten[i] ? varianteZelle(e.vorschlag.varianten[i]) : "")),
      e.vorschlag ? kanaele : "",
    ];
  });
  return CSV_BOM + [CSV_HEADER as readonly string[], ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

// ---- Dokument für PDF und Word -----------------------------------------------------------------

export const READING_HINWEIS =
  "Die Vorschläge sind Entwürfe von Alperna, keine Vorgaben. Du musst nicht zu jedem Anlass etwas posten; wähl, was zu deinem Betrieb passt.";

/** Zelle der Jahresübersicht: Titel, dann je Variante eine Zeile mit Format, Bildidee und Hook. */
const vorschlagZelle = (v: Vorschlag): string => [v.titel, ...v.varianten.map((x, i) => `${i + 1}. ${x.format}: ${x.bildidee}. Hook: ${x.hook}`)].join("\n");

/** Jahresübersicht: Steckbrief, ein Abschnitt mit Tabelle je Monat, dann Quellen und Hinweise. */
export function toDocument(cal: Calendar, firma?: string): DocumentModel {
  const { input } = cal;
  const f = firma?.trim() ?? "";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Kanton", value: kantonLabel(input.kanton) },
        { label: "Jahr", value: String(input.jahr) },
        { label: "Branche für Vorschläge", value: brancheLabel(input.branche) },
        { label: "Kanäle", value: kanaeleText(input.kanaele) },
        { label: "Einträge", value: countsText(cal.entries) },
      ],
    },
    { type: "paragraph", text: READING_HINWEIS },
  ];
  const raster = jahresRaster(cal);
  if (raster) blocks.push(raster);
  for (const m of cal.months) {
    blocks.push({ type: "heading", level: 2, text: m.label });
    if (m.entries.length === 0) {
      blocks.push({ type: "paragraph", text: "Keine Einträge in diesem Monat." });
      continue;
    }
    blocks.push({
      type: "table",
      header: ["Datum", "Art", "Anlass", "Vorschlag oder Hinweis"],
      widths: [1.8, 1.4, 2.1, 4.2],
      rows: m.entries.map((e) => [dateLabel(e), artLabel(e), e.titel, e.vorschlag ? vorschlagZelle(e.vorschlag) : (e.hinweis ?? "")]),
    });
  }
  blocks.push({ type: "heading", level: 2, text: "Quellen und Hinweise" });
  blocks.push({ type: "list", items: [...cal.note.kantone, ...cal.note.hinweise] });
  blocks.push({
    type: "list",
    items: cal.note.gruppen.map((g) => `${g.titel}: ${g.text}${g.stand ? ` (Stand ${formatIso(g.stand)})` : ""}. ${g.links[0] ? g.links[0].url : ""}`.trim()),
  });
  return {
    title: `Feiertagskalender ${input.jahr}`,
    subtitle: [f, kantonName(input.kanton), brancheLabel(input.branche)].filter(Boolean).join(", "),
    ...(f ? { firma: f } : {}),
    blocks,
    filename: documentFilename(input.jahr, f),
  };
}

export const documentFilename = (jahr: number, firma?: string): string => `feiertagskalender-${jahr}${firma?.trim() ? `-${safeFilename(firma, "betrieb")}` : ""}`;
export const icsFilename = (jahr: number, firma?: string): string => `${documentFilename(jahr, firma)}.ics`;
export const csvFilename = (jahr: number, firma?: string): string => `${documentFilename(jahr, firma)}.csv`;

// ---- CRM ---------------------------------------------------------------------------------------

/** Die Angaben fürs CRM, eine je Zeile. */
export function eingabeText(input: Input): string {
  const termine = input.termine.length > 0 ? input.termine.map((t) => `${formatIso(t.datum)} ${t.titel}`).join("; ") : "keine";
  return [
    `Kanton: ${kantonLabel(input.kanton)}`,
    `Jahr: ${input.jahr}`,
    `Branche: ${brancheLabel(input.branche)}`,
    `Kanäle: ${kanaeleText(input.kanaele)}`,
    `Eigene Termine: ${termine}`,
  ].join("\n");
}

/** Die Jahresübersicht als kompaktes Markdown fürs CRM: Kopf, Zählung, dann je Monat eine Zeile je Eintrag. Das Wichtigste steht oben (Kürzung auf 1'900 Zeichen). */
export function ausgabeText(cal: Calendar, firma?: string): string {
  const { input } = cal;
  const out: string[] = [
    `# Feiertagskalender ${input.jahr}${firma?.trim() ? `, ${firma.trim()}` : ""}`,
    `${kantonName(input.kanton)}, ${brancheLabel(input.branche)}, ${kanaeleText(input.kanaele)}`,
    countsText(cal.entries),
  ];
  for (const m of cal.months) {
    if (m.entries.length === 0) continue;
    out.push("", `## ${m.name}`);
    for (const e of m.entries) {
      const d = isMultiDay(e) ? `${formatIso(e.vonOrig).slice(0, 5)}. bis ${formatIso(e.bisOrig).slice(0, 5)}.` : `${formatIso(e.vonOrig).slice(0, 5)}.`;
      out.push(`- ${d} ${e.titel} (${artLabel(e)})`);
    }
  }
  return out.join("\n");
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type CkState = {
  v: 1;
  phase: "edit" | "result";
  /** null: noch nicht gewählt, es gilt das laufende Jahr. */
  jahr: number | null;
  /** Der Kanton, mit dem das Ergebnis gerechnet wurde. In der Eingabe gilt der Kanton aus dem Profil. */
  kanton: string;
  /** null: noch nicht gewählt, es gilt die Vorbelegung aus dem Profil. */
  branche: Branche | null;
  /** null: noch nicht gewählt, es gilt die Vorbelegung aus dem Profil. */
  kanaele: KanalKey[] | null;
  termine: Termin[];
};

export const EMPTY_STATE: CkState = { v: 1, phase: "edit", jahr: null, kanton: "", branche: null, kanaele: null, termine: [] };

function parseTermine(raw: unknown): Termin[] {
  if (!Array.isArray(raw)) return [];
  const out: Termin[] = [];
  for (const t of raw) {
    if (typeof t !== "object" || t === null) continue;
    const r = t as Record<string, unknown>;
    if (!isIsoDate(r.datum) || typeof r.titel !== "string") continue;
    const titel = cleanTitel(r.titel);
    if (titel === "") continue;
    out.push({ datum: r.datum, titel });
    if (out.length >= MAX_TERMINE) break;
  }
  return sortTermine(out);
}

/** Liest den gespeicherten Stand; kaputte Daten ergeben den leeren Stand. «result» gilt nur, wenn alle Angaben des Ergebnisses stimmen. */
export function parseState(raw: unknown): CkState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const jahr = typeof r.jahr === "number" && Number.isInteger(r.jahr) && r.jahr >= 2000 && r.jahr <= 2100 ? r.jahr : null;
  const kanton = isKanton(r.kanton) ? r.kanton : "";
  const branche = isBranche(r.branche) ? r.branche : null;
  const kanaele = Array.isArray(r.kanaele) ? normalizeKanaele(r.kanaele) : null;
  const termine = parseTermine(r.termine);
  const complete = jahr !== null && kanton !== "" && branche !== null && kanaele !== null && kanaele.length > 0;
  const phase = r.phase === "result" && complete ? "result" : "edit";
  return { v: 1, phase, jahr, kanton, branche, kanaele, termine };
}

/** Das Ergebnis lässt sich nur zeigen, wenn der Stand vollständig ist. */
export function inputFromState(s: CkState): Input | null {
  if (s.phase !== "result" || s.jahr === null || s.kanton === "" || s.branche === null || !s.kanaele || s.kanaele.length === 0) return null;
  return { jahr: s.jahr, kanton: s.kanton, branche: s.branche, kanaele: s.kanaele, termine: s.termine };
}
