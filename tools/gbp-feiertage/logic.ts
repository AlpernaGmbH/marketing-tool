import { z } from "zod";
import feiertageJson from "@/data/feiertage.json";
import { KANTONE } from "@/lib/ch";
import { safeFilename, type DocBlock } from "@/lib/export/model";

// Öffnungszeiten an Feiertagen fürs Google-Unternehmensprofil: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Aus Kanton, Jahr, normalen Öffnungszeiten und einer Regel je Feiertag entstehen die Zeilen zum Abtippen, ein Kalender (.ics)
// und eine CSV. Die Feiertage je Kanton stehen in data/feiertage.json, jeder Kanton mit eigener Quelle; bewegliche Tage rechnet
// easterSunday(). Datumsrechnung nur mit UTC-Teilen und als JJJJ-MM-TT, nie über die lokale Zeitzone. Spec: specs/gbp-feiertage.md

export const SLUG = "gbp-feiertage";
export const HELP_URL = "https://support.google.com/business/answer/6303076?hl=de";
export const HELP_TITLE = "Spezielle Öffnungszeiten festlegen";
export const ICS_HINT = "Sonderöffnungszeiten im Google-Unternehmensprofil eintragen";
export const ALARM_DAYS = 10;
export const CSV_HEADER = ["Datum", "Feiertag", "Regel", "von", "bis"] as const;

export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
/** Index des Sonntags in WEEKDAYS (Montag ist 0). */
export const SUNDAY = 6;

// ---- Datensatz ---------------------------------------------------------------------------------

const DATUM_FIX = /^fix:(\d{2})-(\d{2})$/;
const DATUM_OSTERN = /^ostern:([+-]\d{1,3})$/;
const DATUM_JAHR = /^fix-jahr:(\d{4})-(\d{2})-(\d{2})$/;

/** Prüft die Schreibweise von `datum` und ob der Tag im Kalender vorkommt. */
export function isValidDatum(datum: string): boolean {
  let m = DATUM_FIX.exec(datum);
  if (m) return parseIso(`2024-${m[1]}-${m[2]}`) !== null; // 2024 ist ein Schaltjahr: 02-29 ist erlaubt
  m = DATUM_OSTERN.exec(datum);
  if (m) return Math.abs(Number(m[1])) <= 100;
  m = DATUM_JAHR.exec(datum);
  if (m) return parseIso(`${m[1]}-${m[2]}-${m[3]}`) !== null;
  return false;
}

const kantonCode = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .refine((c) => KANTONE.some(([k]) => k === c), "unbekannter Kanton");
const httpsUrl = z.string().url().startsWith("https://");

export const feiertagSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(60),
  datum: z.string().refine(isValidDatum, "datum: fix:MM-TT, ostern:+N oder fix-jahr:JJJJ-MM-TT"),
  kantone: z.union([z.literal("alle"), z.array(kantonCode).min(1)]),
  art: z.enum(["gesetzlich", "ortsueblich"]),
  hinweis: z.string().min(5).max(400).optional(),
  bedingung: z.enum(["weihnachten-nicht-mo-fr"]).optional(),
});

const einzelQuelle = z.object({ titel: z.string().min(5), url: httpsUrl, stand: z.string().min(3) });
/** Eine Quelle mit Adresse und Stand; `weitere` nennt Seiten, die dieselbe Aussage ergänzen (zum Beispiel das Datum eines kantonalen Feiertags). */
const quelleSchema = einzelQuelle.extend({ weitere: z.array(einzelQuelle).max(3).optional() });

export const feiertageDataSchema = z.object({
  meta: z.object({
    source: z.string().min(10),
    url: httpsUrl,
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().min(10),
  }),
  jahre: z.array(z.number().int().min(2000).max(2100)).min(1),
  bund: z.array(quelleSchema).min(1),
  quellen: z.record(kantonCode, quelleSchema),
  hinweise: z.record(kantonCode, z.string().min(5)).optional(),
  feiertage: z.array(feiertagSchema).min(1),
});

export type Feiertag = z.infer<typeof feiertagSchema>;
export type FeiertageData = z.infer<typeof feiertageDataSchema>;
export type Quelle = z.infer<typeof quelleSchema>;
export type Art = Feiertag["art"];

/** Prüft die Rohdaten gegen das Schema; null, wenn sie fehlen, kaputt sind oder ohne Quelle (meta.url). */
export function loadData(raw: unknown): FeiertageData | null {
  const r = feiertageDataSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Der Datensatz aus data/feiertage.json; null, wenn er das Schema verletzt (das Werkzeug sagt das dann). */
export const DATA: FeiertageData | null = loadData(feiertageJson);

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

/** 03.04.2026, wie dateCH(), aber ohne Zeitzone. */
export function formatIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Ostersonntag nach der Gauss-Osterformel (gregorianisch), als UTC-Datum. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = year % 4;
  const c = year % 7;
  const k = Math.floor(year / 100);
  const p = Math.floor((8 * k + 13) / 25);
  const q = Math.floor(k / 4);
  const M = (15 + k - p - q) % 30;
  const N = (4 + k - q) % 7;
  const d = (19 * a + M) % 30;
  const e = (2 * b + 4 * c + 6 * d + N) % 7;
  let day = 22 + d + e; // gezählt ab 1. März
  if (d === 29 && e === 6) day = 50; // Ausnahme der Formel: 19. April statt 26. April
  else if (d === 28 && e === 6 && (11 * M + 11) % 30 < 19) day = 49; // Ausnahme: 18. April statt 25. April
  return new Date(Date.UTC(year, 2, day));
}

/** Datum eines Feiertags im Jahr als JJJJ-MM-TT; null, wenn die Angabe für dieses Jahr nicht gilt. */
export function resolveDate(f: Pick<Feiertag, "datum">, year: number): string | null {
  if (!Number.isInteger(year)) return null;
  let m = DATUM_FIX.exec(f.datum);
  if (m) {
    const iso = `${pad(year, 4)}-${m[1]}-${m[2]}`;
    return parseIso(iso) ? iso : null;
  }
  m = DATUM_OSTERN.exec(f.datum);
  if (m) return addDays(toIso(easterSunday(year)), Number(m[1]));
  m = DATUM_JAHR.exec(f.datum);
  if (m) {
    if (Number(m[1]) !== year) return null;
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return parseIso(iso) ? iso : null;
  }
  return null;
}

// ---- Feiertage je Kanton -----------------------------------------------------------------------

export type Holiday = {
  id: string;
  name: string;
  /** JJJJ-MM-TT */
  date: string;
  /** Montag = 0 bis Sonntag = 6 */
  weekday: number;
  art: Art;
  hinweis?: string;
  /** Gesetzt, wenn der Tag in diesem Jahr nicht gilt (Bedingung der Quelle), mit dem Grund. */
  entfaellt?: string;
};

export function kantonName(code: string): string {
  return KANTONE.find(([k]) => k === code)?.[1] ?? code;
}

/** «St. Gallen (SG)» */
export function kantonLabel(code: string): string {
  const known = KANTONE.some(([k]) => k === code);
  return known ? `${kantonName(code)} (${code})` : code;
}

export const isKanton = (code: unknown): code is string => typeof code === "string" && KANTONE.some(([k]) => k === code);

/** Kantone, für die der Datensatz mindestens einen Feiertag mit Quelle nennt. */
export function checkedCantons(data: FeiertageData): string[] {
  const out = new Set<string>();
  for (const f of data.feiertage) if (f.kantone !== "alle") for (const k of f.kantone) out.add(k);
  return KANTONE.map(([k]) => k as string).filter((k) => out.has(k) && k in data.quellen);
}

export const isChecked = (code: string, data: FeiertageData): boolean => checkedCantons(data).includes(code);

export const noListMessage = (code: string): string =>
  `Für ${kantonName(code)} haben wir noch keine geprüfte Liste. Prüfe die Feiertage bei deinem Kanton.`;

export const NATIONAL_NOTE = "Angezeigt sind nur Neujahr, Auffahrt, der 1. August und Weihnachten.";

/**
 * Feiertage eines Kantons im Jahr, nach Datum sortiert. Ohne Quelle für den Kanton nur die eidgenössischen Tage
 * (Eintrag «alle»). Tage mit einer Bedingung, die in diesem Jahr nicht erfüllt ist, tragen `entfaellt`.
 */
export function holidaysFor(kanton: string, year: number, data: FeiertageData): Holiday[] {
  const checked = isChecked(kanton, data);
  const out: Holiday[] = [];
  const seen = new Set<string>();
  for (const f of data.feiertage) {
    const applies = f.kantone === "alle" || (checked && f.kantone.includes(kanton));
    if (!applies || seen.has(f.id)) continue;
    const date = resolveDate(f, year);
    if (!date) continue;
    seen.add(f.id);
    const h: Holiday = { id: f.id, name: f.name, date, weekday: weekdayIndex(date), art: f.art };
    if (f.hinweis) h.hinweis = f.hinweis;
    if (f.bedingung === "weihnachten-nicht-mo-fr") {
      const wd = weekdayIndex(`${pad(year, 4)}-12-25`);
      if (wd === 0 || wd === 4) h.entfaellt = `Entfällt ${year}: Der Weihnachtstag fällt auf einen ${WEEKDAYS[wd]}.`;
    }
    out.push(h);
  }
  return out.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name, "de") : a.date < b.date ? -1 : 1));
}

/** Quellen für die Anzeige: die des Kantons (falls belegt) und die des Bundes. */
export function sourcesFor(kanton: string, data: FeiertageData): { kanton: Quelle | null; bund: Quelle[]; hinweis: string | null } {
  return { kanton: data.quellen[kanton] ?? null, bund: data.bund, hinweis: data.hinweise?.[kanton] ?? null };
}

/** Die Jahre, aus denen die Person wählt: laufendes und nächstes Jahr aus dem Datensatz; sonst die letzten zwei Jahre des Datensatzes. */
export function yearOptions(data: FeiertageData, now: Date): number[] {
  const current = now.getFullYear();
  const upcoming = data.jahre.filter((y) => y >= current).slice(0, 2);
  return upcoming.length > 0 ? upcoming : data.jahre.slice(-2);
}

export const defaultYear = (data: FeiertageData, now: Date): number => yearOptions(data, now)[0];

// ---- Öffnungszeiten ----------------------------------------------------------------------------

export type Window = { von: string; bis: string };
export type DayHours = { offen: boolean; f1: Window; f2: Window };
/** Sieben Tage, Montag = 0 bis Sonntag = 6. */
export type WeekHours = DayHours[];

export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

const emptyWindow = (): Window => ({ von: "", bis: "" });

/** Standard: Montag bis Freitag 08:00 bis 12:00 und 13:30 bis 17:30, Samstag und Sonntag geschlossen. */
export function defaultHours(): WeekHours {
  return WEEKDAYS.map((_, i) => ({
    offen: i < 5,
    f1: { von: "08:00", bis: "12:00" },
    f2: i < 5 ? { von: "13:30", bis: "17:30" } : emptyWindow(),
  }));
}

const windowFilled = (w: Window): boolean => w.von !== "" || w.bis !== "";
const windowValid = (w: Window): boolean => isTime(w.von) && isTime(w.bis) && w.von < w.bis;

/** Die gültigen Zeitfenster eines Tages in Reihenfolge; leer, wenn der Tag geschlossen ist. */
export function windowsOf(day: DayHours): Window[] {
  if (!day.offen) return [];
  return [day.f1, day.f2].filter(windowValid).map((w) => ({ von: w.von, bis: w.bis }));
}

/** «geschlossen» oder «08:00 bis 12:00 und 13:30 bis 17:30». */
export function windowsText(ws: Window[]): string {
  return ws.length === 0 ? "geschlossen" : ws.map((w) => `${w.von} bis ${w.bis}`).join(" und ");
}

/** Die normale Woche als Raster: je Tag die beiden Zeitfenster, geschlossene Tage mit dem Wort «geschlossen». */
export function weekGrid(hours: WeekHours): DocBlock {
  return {
    type: "grid",
    title: "Deine normale Woche",
    columns: ["Zeitfenster 1", "Zeitfenster 2"],
    rows: hours.map((d, i) => {
      const ws = windowsOf(d);
      return { label: WEEKDAYS[i], cells: ws.length === 0 ? ["geschlossen"] : ws.map((w) => `${w.von} bis ${w.bis}`) };
    }),
  };
}

/** Meldung zur ersten fehlerhaften Angabe der Öffnungszeiten; null, wenn alles passt. */
export function hoursProblem(hours: WeekHours): string | null {
  for (let i = 0; i < 7; i++) {
    const d = hours[i];
    const day = WEEKDAYS[i];
    if (!d) return `${day}: Die Zeiten fehlen.`;
    if (!d.offen) continue;
    if (!windowValid(d.f1)) return `${day}: Trag bei «von» und «bis» eine Uhrzeit ein, «von» vor «bis».`;
    if (windowFilled(d.f2)) {
      if (!windowValid(d.f2)) return `${day}: Das zweite Zeitfenster braucht «von» und «bis», «von» vor «bis». Oder lass beide Felder leer.`;
      if (d.f2.von < d.f1.bis) return `${day}: Das zweite Zeitfenster beginnt vor dem Ende des ersten.`;
    }
  }
  return null;
}

/** Eine Zeile für ein Zeitfenster-Paar der Person: «Mo: 08:00 bis 12:00 und 13:30 bis 17:30». */
export function dayText(day: DayHours): string {
  return windowsText(windowsOf(day));
}

// ---- Regeln ------------------------------------------------------------------------------------

export const RULE_KINDS = ["geschlossen", "sonntag", "zeiten", "normal"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export const RULE_LABELS: Record<RuleKind, string> = {
  geschlossen: "geschlossen",
  sonntag: "wie Sonntag",
  zeiten: "Sonderzeiten",
  normal: "nicht eintragen",
};

export type Rule = { kind: RuleKind; von: string; bis: string };

export const isRuleKind = (v: unknown): v is RuleKind => typeof v === "string" && (RULE_KINDS as readonly string[]).includes(v);

/** Gesetzliche Tage starten auf «geschlossen», ortsübliche auf «nicht eintragen», weil sie nur in Teilen des Kantons gelten. */
export function defaultRule(h: Pick<Holiday, "art">): Rule {
  return { kind: h.art === "gesetzlich" ? "geschlossen" : "normal", von: "", bis: "" };
}

export const ruleFor = (h: Holiday, regeln: Record<string, Rule>): Rule => regeln[h.id] ?? defaultRule(h);

export function ruleProblem(h: Holiday, rule: Rule): string | null {
  if (h.entfaellt || rule.kind !== "zeiten") return null;
  if (!isTime(rule.von) || !isTime(rule.bis) || rule.von >= rule.bis) {
    return `${h.name}: Trag bei Sonderzeiten «von» und «bis» ein, «von» vor «bis».`;
  }
  return null;
}

/** Erste Meldung zu Öffnungszeiten oder Regeln; null, wenn das Formular stimmt. */
export function formProblem(holidays: Holiday[], regeln: Record<string, Rule>, hours: WeekHours): string | null {
  const hp = hoursProblem(hours);
  if (hp) return hp;
  for (const h of holidays) {
    const p = ruleProblem(h, ruleFor(h, regeln));
    if (p) return p;
  }
  return null;
}

/** Die Zeitfenster, die für den Tag gelten; null bei «nicht eintragen». */
export function effectiveWindows(rule: Rule, hours: WeekHours): Window[] | null {
  switch (rule.kind) {
    case "geschlossen":
      return [];
    case "sonntag":
      return windowsOf(hours[SUNDAY] ?? { offen: false, f1: emptyWindow(), f2: emptyWindow() });
    case "zeiten":
      return isTime(rule.von) && isTime(rule.bis) && rule.von < rule.bis ? [{ von: rule.von, bis: rule.bis }] : [];
    default:
      return null;
  }
}

/** «fällt auf einen Sonntag» bzw. «… an dem du ohnehin geschlossen hast», wenn an diesem Wochentag sonst zu ist; sonst null. */
export function closedHint(h: Pick<Holiday, "weekday">, hours: WeekHours): string | null {
  const day = hours[h.weekday];
  if (!day || windowsOf(day).length > 0) return null;
  if (h.weekday === SUNDAY) return "fällt auf einen Sonntag";
  return `fällt auf einen ${WEEKDAYS[h.weekday]}, an dem du ohnehin geschlossen hast`;
}

/** Zeile zum Abtippen: «Fr 03.04.2026, Karfreitag: geschlossen». null bei «nicht eintragen». */
export function lineFor(h: Pick<Holiday, "name" | "date" | "weekday">, rule: Rule, hours: WeekHours): string | null {
  const w = effectiveWindows(rule, hours);
  if (w === null) return null;
  return `${WEEKDAYS_SHORT[h.weekday]} ${formatIso(h.date)}, ${h.name}: ${windowsText(w)}`;
}

export type Entry = { holiday: Holiday; rule: RuleKind; windows: Window[]; text: string; line: string };
export type Skipped = { holiday: Holiday; grund: string };
export type Plan = {
  /** Was in das Profil gehört. */
  entries: Entry[];
  /** Tage, an denen ohnehin geschlossen ist: nichts einzutragen. */
  unnoetig: Skipped[];
  /** Tage, die in diesem Jahr nicht gelten. */
  entfallen: Skipped[];
};

export function buildPlan(holidays: Holiday[], regeln: Record<string, Rule>, hours: WeekHours): Plan {
  const plan: Plan = { entries: [], unnoetig: [], entfallen: [] };
  for (const h of holidays) {
    if (h.entfaellt) {
      plan.entfallen.push({ holiday: h, grund: h.entfaellt });
      continue;
    }
    const rule = ruleFor(h, regeln);
    const windows = effectiveWindows(rule, hours);
    if (windows === null) continue;
    const closed = closedHint(h, hours);
    if (windows.length === 0 && closed) {
      plan.unnoetig.push({ holiday: h, grund: closed });
      continue;
    }
    plan.entries.push({ holiday: h, rule: rule.kind, windows, text: windowsText(windows), line: lineFor(h, rule, hours) ?? "" });
  }
  return plan;
}

// ---- Kalender (.ics) ---------------------------------------------------------------------------

const utf8Length = (ch: string): number => {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
};

/** Text für ICS-Werte: Backslash, Semikolon, Komma und Zeilenumbruch maskieren. */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Faltet eine Zeile nach 75 Oktetten (UTF-8); Fortsetzungszeilen beginnen mit einem Leerzeichen. Gibt die Teile zurück. */
export function foldIcsLine(line: string, limit = 75): string[] {
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = utf8Length(ch);
    if (bytes + n > limit) {
      parts.push(cur);
      cur = " ";
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts;
}

const icsDate = (iso: string): string => iso.replace(/-/g, "");

/** DTSTAMP: UTC-Zeitpunkt als JJJJMMTTThhmmssZ. */
export function icsStamp(now: Date): string {
  return `${pad(now.getUTCFullYear(), 4)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

export const icsUid = (year: number, id: string): string => `${year}-${id}@tools.alperna.ch`;

/**
 * Kalender mit einem Ganztagstermin je Eintrag: SUMMARY «<Name>: <Regel>», Hinweis in der Beschreibung, Erinnerung zehn Tage vorher.
 * Zeilen mit CRLF, gefaltet bei 75 Oktetten. `now` nur für DTSTAMP (Standard: die aktuelle Zeit).
 */
export function buildIcs(entries: Entry[], year: number, opts: { now?: Date; firma?: string } = {}): string {
  const stamp = icsStamp(opts.now ?? new Date());
  const firma = (opts.firma ?? "").replace(/\s+/g, " ").trim();
  const calName = firma ? `Sonderöffnungszeiten ${year}, ${firma}` : `Sonderöffnungszeiten ${year}`;
  const description = `${ICS_HINT}. Anleitung: ${HELP_URL}`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alperna//tools.alperna.ch//Feiertagsplaner//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];
  for (const e of entries) {
    const next = addDays(e.holiday.date, 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsUid(year, e.holiday.id)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.holiday.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${escapeIcsText(`${e.holiday.name}: ${e.text}`)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(ICS_HINT)}`,
      `TRIGGER:-P${ALARM_DAYS}D`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap((l) => foldIcsLine(l)).join("\r\n") + "\r\n";
}

// ---- CSV ---------------------------------------------------------------------------------------

export const CSV_BOM = "\uFEFF";

function csvCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV mit Semikolon und UTF-8-BOM (öffnet sich in Excel richtig): Datum;Feiertag;Regel;von;bis.
 * Hat ein Tag zwei Zeitfenster, steht er in zwei Zeilen. «geschlossen» hat leere Felder von und bis.
 */
export function buildCsv(entries: Entry[]): string {
  const rows: string[][] = [[...CSV_HEADER]];
  for (const e of entries) {
    const base = [formatIso(e.holiday.date), e.holiday.name, RULE_LABELS[e.rule]];
    if (e.windows.length === 0) rows.push([...base, "", ""]);
    else for (const w of e.windows) rows.push([...base, w.von, w.bis]);
  }
  return CSV_BOM + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

// ---- Dateinamen --------------------------------------------------------------------------------

const baseName = (kanton: string, year: number): string => `sonderoeffnungszeiten-${safeFilename(kanton, "kanton")}-${year}`;
export const icsFilename = (kanton: string, year: number): string => `${baseName(kanton, year)}.ics`;
export const csvFilename = (kanton: string, year: number): string => `${baseName(kanton, year)}.csv`;

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type GfState = {
  v: 1;
  phase: "edit" | "result";
  kanton: string;
  /** 0, solange noch kein Jahr gewählt ist; dann gilt defaultYear(). */
  jahr: number;
  zeiten: WeekHours;
  regeln: Record<string, Rule>;
};

export const EMPTY_STATE: GfState = { v: 1, phase: "edit", kanton: "", jahr: 0, zeiten: defaultHours(), regeln: {} };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const timeOrEmpty = (v: unknown, fallback: string): string => (v === "" || isTime(v) ? (v as string) : fallback);

function parseWindow(raw: unknown, fallback: Window): Window {
  if (!isObj(raw)) return { ...fallback };
  return { von: timeOrEmpty(raw.von, fallback.von), bis: timeOrEmpty(raw.bis, fallback.bis) };
}

function parseDay(raw: unknown, fallback: DayHours): DayHours {
  if (!isObj(raw)) return { offen: fallback.offen, f1: { ...fallback.f1 }, f2: { ...fallback.f2 } };
  return {
    offen: typeof raw.offen === "boolean" ? raw.offen : fallback.offen,
    f1: parseWindow(raw.f1, fallback.f1),
    f2: parseWindow(raw.f2, fallback.f2),
  };
}

function parseRules(raw: unknown): Record<string, Rule> {
  const out: Record<string, Rule> = {};
  if (!isObj(raw)) return out;
  for (const [id, v] of Object.entries(raw).slice(0, 60)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 40 || !isObj(v) || !isRuleKind(v.kind)) continue;
    out[id] = { kind: v.kind, von: timeOrEmpty(v.von, ""), bis: timeOrEmpty(v.bis, "") };
  }
  return out;
}

/** Liest den gespeicherten Stand; kaputte Daten ergeben den leeren Stand. «result» gilt nur mit Kanton, Jahr und stimmigen Zeiten. */
export function parseState(raw: unknown): GfState {
  if (!isObj(raw) || raw.v !== 1) return { ...EMPTY_STATE, zeiten: defaultHours(), regeln: {} };
  const kanton = isKanton(raw.kanton) ? raw.kanton : "";
  const jahr = typeof raw.jahr === "number" && Number.isInteger(raw.jahr) && raw.jahr >= 2000 && raw.jahr <= 2100 ? raw.jahr : 0;
  const base = defaultHours();
  const src = Array.isArray(raw.zeiten) ? raw.zeiten : [];
  const zeiten = base.map((d, i) => parseDay(src[i], d));
  const phase = raw.phase === "result" && kanton !== "" && jahr !== 0 && hoursProblem(zeiten) === null ? "result" : "edit";
  return { v: 1, phase, kanton, jahr, zeiten, regeln: parseRules(raw.regeln) };
}

// ---- Texte fürs CRM ----------------------------------------------------------------------------

export function ruleText(h: Holiday, rule: Rule): string {
  if (h.entfaellt) return "entfällt in diesem Jahr";
  if (rule.kind === "zeiten") return `Sonderzeiten ${rule.von} bis ${rule.bis}`;
  return RULE_LABELS[rule.kind];
}

/** Die Angaben fürs CRM, eine je Zeile: Kanton, Jahr, Öffnungszeiten je Tag, Regel je Feiertag. */
export function eingabeText(s: Pick<GfState, "kanton" | "jahr" | "zeiten" | "regeln">, holidays: Holiday[]): string {
  const lines = [`Kanton: ${kantonLabel(s.kanton)}`, `Jahr: ${s.jahr}`, "Normale Öffnungszeiten:"];
  WEEKDAYS_SHORT.forEach((d, i) => lines.push(`${d}: ${s.zeiten[i] ? dayText(s.zeiten[i]) : "geschlossen"}`));
  lines.push("Regel je Feiertag:");
  for (const h of holidays) {
    lines.push(`${h.name} (${WEEKDAYS_SHORT[h.weekday]} ${formatIso(h.date)}): ${ruleText(h, ruleFor(h, s.regeln))}`);
  }
  return lines.join("\n");
}

/** Das Ergebnis fürs CRM: die Liste zum Abtippen, dann was nicht einzutragen ist. */
export function ausgabeText(plan: Plan, kanton: string, year: number): string {
  const lines = [`Sonderöffnungszeiten ${kantonLabel(kanton)} ${year}`, ...plan.entries.map((e) => e.line)];
  for (const s of plan.unnoetig) {
    lines.push(`Nichts einzutragen: ${s.holiday.name} (${WEEKDAYS_SHORT[s.holiday.weekday]} ${formatIso(s.holiday.date)}), ${s.grund}`);
  }
  for (const s of plan.entfallen) lines.push(`${s.holiday.name}: ${s.grund}`);
  return lines.join("\n");
}

/** Der Text zum Kopieren: nur die Zeilen zum Abtippen. */
export const copyText = (plan: Plan): string => plan.entries.map((e) => e.line).join("\n");
