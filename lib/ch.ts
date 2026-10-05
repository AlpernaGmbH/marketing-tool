// Schweizer Schreibweisen (CLAUDE.md, Harte Regel 2): CHF 1'000.-, Datum 03.10.2026,
// Prozent mit Leerzeichen (8,1 %), «» als Anführungszeichen, ss statt ß.

const APOSTROPHE = "'";

/** Tausendertrennung mit Apostroph: 1234567 → 1'234'567 */
function group(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, APOSTROPHE);
}

/**
 * Betrag in Franken: chf(1000) → «CHF 1'000.-», chf(1000.5) → «CHF 1'000.50».
 * Nicht endliche Werte ergeben «CHF –», damit eine Fehleingabe nie die Seite zum Absturz bringt.
 */
export function chf(amount: number): string {
  if (!Number.isFinite(amount)) return "CHF –";
  const cents = Math.round(Math.abs(amount) * 100);
  const sign = amount < 0 && cents > 0 ? "-" : "";
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  const tail = rest === 0 ? ".-" : `.${String(rest).padStart(2, "0")}`;
  return `CHF ${sign}${group(String(whole))}${tail}`;
}

/** Zahl mit Apostroph als Tausendertrenner und Komma als Dezimalzeichen: 1234.5 → 1'234,5 */
export function numberCH(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return "–";
  const raw = Math.abs(value).toFixed(maxDecimals);
  // Nur Nachkomma-Nullen entfernen; bei ganzen Zahlen (maxDecimals 0) bleibt «100» eine 100.
  const fixed = raw.includes(".") ? raw.replace(/\.?0+$/, "") : raw;
  const [int, dec] = fixed.split(".");
  const sign = value < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${sign}${group(int)}${dec ? `,${dec}` : ""}`;
}

/** Prozent mit Leerzeichen und Komma: pctCH(8.1) → «8,1 %» */
export function pctCH(value: number, maxDecimals = 1): string {
  return `${numberCH(value, maxDecimals)} %`;
}

/** Datum als TT.MM.JJJJ in Schweizer Zeit: dateCH(new Date("2026-10-03")) → «03.10.2026» */
export function dateCH(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "–";
  const parts = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

/**
 * Bringt Text in Schweizer Rechtschreibung und Typografie.
 * Konservativ: nur eindeutige Fälle (ß, Anführungszeichen, Prozent, CHF-Beträge, Datum).
 */
export function typoCH(text: string): string {
  let t = text.replace(/ß/g, "ss").replace(/ẞ/g, "SS");

  // Anführungszeichen: "x", “x”, „x“, ”x” → «x»; einfache ‘x’ → ‹x› (nur mit Wortgrenze)
  t = t.replace(/"([^"\n]*)"/g, "«$1»").replace(/[“„”]([^“„”\n]*)[“„”]/g, "«$1»");
  t = t.replace(/(^|[\s(«])[‘‚]([^‘’‚\n]+)’(?=$|[\s.,;:!?)»])/g, "$1‹$2›");

  // Typografischer Apostroph zwischen Ziffern: 1’000 → 1'000
  t = t.replace(/(\d)[’‘´`](?=\d{3}\b)/g, `$1${APOSTROPHE}`);

  // CHF-Beträge ab 1000 mit Tausenderapostroph: CHF 1000 → CHF 1'000
  t = t.replace(/\bCHF\s?(-?)(\d{4,})(?![\d'])/g, (_m, minus: string, digits: string) => `CHF ${minus}${group(digits)}`);

  // Prozent mit (geschütztem) Leerzeichen: 8% / 8,1% → 8 % / 8,1 %
  t = t.replace(/(\d)\s?%/g, "$1 %");

  // Datum mit führenden Nullen: 3.10.2026 → 03.10.2026
  t = t.replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g, (_m, d: string, mo: string, y: string) =>
    `${d.padStart(2, "0")}.${mo.padStart(2, "0")}.${y}`,
  );
  return t;
}

/**
 * Prüft eine Unternehmens-Identifikationsnummer (UID): CHE-123.456.789, auch ohne Trennzeichen
 * und mit Zusatz MWST/TVA/IVA/HR. Prüfziffer nach Modulo 11 (Gewichte 5 4 3 2 7 6 5 4).
 */
export function uidValid(input: string): boolean {
  const m = /^CHE[-\s]?(\d{3})\.?(\d{3})\.?(\d{3})(?:\s?(?:MWST|TVA|IVA|HR))?$/i.exec(input.trim());
  if (!m) return false;
  const digits = `${m[1]}${m[2]}${m[3]}`.split("").map(Number);
  const weights = [5, 4, 3, 2, 7, 6, 5, 4];
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) return false; // gibt es nicht als Prüfziffer
  return check === digits[8];
}

/** «1 Minute», «8 Minuten» */
export function minutesLabel(n: number): string {
  return `${n} ${n === 1 ? "Minute" : "Minuten"}`;
}

/** Die 26 Kantone mit Kürzel, für Profil und Tools. */
export const KANTONE = [
  ["AG", "Aargau"],
  ["AI", "Appenzell Innerrhoden"],
  ["AR", "Appenzell Ausserrhoden"],
  ["BE", "Bern"],
  ["BL", "Basel-Landschaft"],
  ["BS", "Basel-Stadt"],
  ["FR", "Freiburg"],
  ["GE", "Genf"],
  ["GL", "Glarus"],
  ["GR", "Graubünden"],
  ["JU", "Jura"],
  ["LU", "Luzern"],
  ["NE", "Neuenburg"],
  ["NW", "Nidwalden"],
  ["OW", "Obwalden"],
  ["SG", "St. Gallen"],
  ["SH", "Schaffhausen"],
  ["SO", "Solothurn"],
  ["SZ", "Schwyz"],
  ["TG", "Thurgau"],
  ["TI", "Tessin"],
  ["UR", "Uri"],
  ["VD", "Waadt"],
  ["VS", "Wallis"],
  ["ZG", "Zug"],
  ["ZH", "Zürich"],
] as const;

export type KantonCode = (typeof KANTONE)[number][0];
