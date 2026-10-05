import { chf, numberCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";

// Ziel- und KPI-Baum: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Alles rechnet im Browser (Klasse C), ohne KI. Das heutige Datum kommt immer als Parameter (ISO «JJJJ-MM-TT»),
// nie aus new Date() in diesen Funktionen. Quoten der Rückwärtsrechnung sind Annahmen der Person, keine Statistik;
// der Rhythmus im Messplan ist ein Richtwert von Alperna. Spec: specs/kpi-baum.md

export const SLUG = "kpi-baum";
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
export const ANNAHME_NOTE = "Das ist deine Annahme, keine Statistik.";
export const NICHT_GEPRUEFT = "Nicht geprüft werden «attraktiv» und «realistisch»: Das beurteilst nur du, am besten zusammen mit deinem Team.";
export const PLAUSIBEL_NOTE =
  "Plausibel prüft das Werkzeug nur, wenn Unternehmensziel und Kennzahl dieselbe Einheit haben, zum Beispiel neue Kundschaft. Sonst steht «nicht prüfbar».";

export const LIMITS = {
  maxZiele: 3,
  maxKpis: 2,
  textMin: 10,
  textMax: 140,
  andereMax: 80,
  zielwertMax: 1_000_000_000,
  /** Ein Enddatum, das weiter als zehn Jahre entfernt liegt, lehnt das Werkzeug ab. */
  maxMonate: 120,
  quoteMax: 10,
} as const;

export type Typ = "kmu" | "verein";

// ---- Datum -------------------------------------------------------------------------------------

export type Ymd = { y: number; m: number; d: number };

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number, len = 2) => String(n).padStart(len, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Liest «JJJJ-MM-TT»; ungültige Daten (30. Februar, falsches Format) ergeben null. */
export function parseIso(value: unknown): Ymd | null {
  if (typeof value !== "string") return null;
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
  return { y, m: mo, d };
}

export const isIso = (value: unknown): value is string => parseIso(value) !== null;

const toIso = ({ y, m, d }: Ymd) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Das heutige Datum in Schweizer Zeit als ISO-Text. `now` kommt vom Aufrufer (Browser). */
export function heuteIso(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** «2026-10-05» → «05.10.2026»; ungültig → «–». */
export function isoToCH(iso: string): string {
  const p = parseIso(iso);
  return p ? `${pad(p.d)}.${pad(p.m)}.${pad(p.y, 4)}` : "–";
}

/** Addiert Monate; fällt der Tag nicht in den Zielmonat, gilt dessen letzter Tag (31.01. + 1 Monat = 28.02.). */
export function addMonths(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const idx = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (((idx % 12) + 12) % 12) + 1;
  return toIso({ y, m, d: Math.min(p.d, daysIn(y, m)) });
}

/**
 * Anzahl Monate von heute bis zum Enddatum, mindestens 1. Gezählt werden Monatsschritte ab heute, bis das Enddatum
 * erreicht ist: Ein angebrochener Monat zählt voll (05.10.2026 bis 31.12.2026 = 3, bis 05.01.2027 = 3, bis 06.01.2027 = 4).
 * Liegt das Enddatum nicht nach heute oder ist ein Datum ungültig, ist das Ergebnis 1.
 */
export function monateBis(heute: string, ende: string): number {
  const h = parseIso(heute);
  const e = parseIso(ende);
  if (!h || !e || ende <= heute) return 1;
  const d = (e.y - h.y) * 12 + (e.m - h.m);
  const n = addMonths(heute, d) >= ende ? d : d + 1;
  return Math.max(1, n);
}

// ---- Zahlen ------------------------------------------------------------------------------------

const NUM_RE = /^-?\d+(?:\.\d+)?$/;

/** Text aus einem Zahlenfeld → Zahl. Leer: null. Keine Zahl: NaN. Komma, Hochkomma und Leerzeichen sind erlaubt. */
export function parseNum(value: string): number | null {
  const t = value.trim().replace(/['’\s]/g, "").replace(",", ".");
  if (t === "") return null;
  if (!NUM_RE.test(t)) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number, decimals = 2) => numberCH(n, decimals);

// ---- Arten, Kanäle, Kennzahlen, Zeiträume ------------------------------------------------------

export const ART_KEYS = ["umsatz", "kunden", "auftraege", "mitglieder", "anmeldungen"] as const;
export type ArtKey = (typeof ART_KEYS)[number];

export type ArtDef = {
  key: ArtKey;
  label: string;
  fuer: Typ;
  /** Einheit, mit der Kennzahlen verglichen werden (Plausibilität). */
  einheit: string;
  /** «40 Aufträge», «CHF 500'000.-» */
  wert: (n: number) => string;
  /** «40 Aufträge erhalten» */
  ziel: (n: number) => string;
};

const count = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

export const ZIEL_ARTEN: ArtDef[] = [
  { key: "umsatz", label: "Umsatz in CHF", fuer: "kmu", einheit: "chf", wert: (n) => chf(n), ziel: (n) => `einen Umsatz von ${chf(n)} erreichen` },
  {
    key: "kunden",
    label: "Neue Kundinnen und Kunden",
    fuer: "kmu",
    einheit: "kunden",
    wert: (n) => count(n, "neue Kundin oder neuer Kunde", "neue Kundinnen und Kunden"),
    ziel: (n) => `${count(n, "neue Kundin oder neuen Kunden", "neue Kundinnen und Kunden")} gewinnen`,
  },
  {
    key: "auftraege",
    label: "Aufträge",
    fuer: "kmu",
    einheit: "auftraege",
    wert: (n) => count(n, "Auftrag", "Aufträge"),
    ziel: (n) => `${count(n, "Auftrag", "Aufträge")} erhalten`,
  },
  {
    key: "mitglieder",
    label: "Neue Mitglieder",
    fuer: "verein",
    einheit: "mitglieder",
    wert: (n) => count(n, "neues Mitglied", "neue Mitglieder"),
    ziel: (n) => `${count(n, "neues Mitglied", "neue Mitglieder")} gewinnen`,
  },
  {
    key: "anmeldungen",
    label: "Anmeldungen zum Anlass",
    fuer: "verein",
    einheit: "anmeldungen",
    wert: (n) => count(n, "Anmeldung zum Anlass", "Anmeldungen zum Anlass"),
    ziel: (n) => `${count(n, "Anmeldung zum Anlass", "Anmeldungen zum Anlass")} erhalten`,
  },
];

export const artDef = (key: string): ArtDef | undefined => ZIEL_ARTEN.find((a) => a.key === key);
export const artenFuer = (typ: Typ): ArtDef[] => ZIEL_ARTEN.filter((a) => a.fuer === typ);
export const isArtKey = (value: unknown): value is ArtKey => typeof value === "string" && ART_KEYS.some((k) => k === value);

/** Die Rückwärtsrechnung gibt es nur bei neuer Kundschaft und bei Aufträgen. */
export const rueckwaertsGilt = (art: ArtKey | ""): boolean => art === "kunden" || art === "auftraege";

export const KANAL_KEYS = ["website", "gbp", "instagram", "facebook", "linkedin", "newsletter", "empfehlungen", "anlaesse", "print"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];
export const KANAELE: { key: KanalKey; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "gbp", label: "Google-Unternehmensprofil" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "newsletter", label: "Newsletter" },
  { key: "empfehlungen", label: "Empfehlungen" },
  { key: "anlaesse", label: "Anlässe" },
  { key: "print", label: "Print" },
];
export const kanalLabel = (key: string): string => KANAELE.find((k) => k.key === key)?.label ?? "";
export const isKanalKey = (value: unknown): value is KanalKey => typeof value === "string" && KANAL_KEYS.some((k) => k === value);

export const KPI_KEYS = [
  "anfragen",
  "profilaufrufe",
  "bewertungen",
  "newsletter",
  "besuche",
  "termine",
  "anrufe",
  "offerten",
  "neukunden",
  "neumitglieder",
  "anmeldungen",
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

/** Richtwert von Alperna, keine Statistik: monatlich, Website-Besuche wöchentlich. */
export type Rhythmus = "monatlich" | "wöchentlich";

export type KpiDef = {
  key: KpiKey;
  label: string;
  einheit: string;
  /** Sachliche Vorschläge für die Messquelle, ohne Produktversprechen. */
  quellen: string[];
  rhythmus: Rhythmus;
  fuer: Typ[];
};

const eintrag = (key: KpiKey, label: string, einheit: string, quellen: string[], fuer: Typ[] = ["kmu", "verein"], rhythmus: Rhythmus = "monatlich"): KpiDef => ({
  key,
  label,
  einheit,
  quellen,
  rhythmus,
  fuer,
});

export const KPIS: KpiDef[] = [
  eintrag("anfragen", "Anfragen", "anfragen", ["Postfach und Telefonnotiz", "Kontaktformular", "CRM oder Excel"]),
  eintrag("profilaufrufe", "Profilaufrufe", "profilaufrufe", ["Statistik im Google-Unternehmensprofil", "Instagram Insights"]),
  eintrag("bewertungen", "Bewertungen", "bewertungen", ["Google-Unternehmensprofil"]),
  eintrag("newsletter", "Newsletter-Abos", "newsletter", ["Newsletter-Werkzeug"]),
  eintrag("besuche", "Website-Besuche", "besuche", ["Statistik des Hosters", "Umami oder ein anderes Statistikwerkzeug"], ["kmu", "verein"], "wöchentlich"),
  eintrag("termine", "Termine", "termine", ["Kalender oder Buchungswerkzeug"]),
  eintrag("anrufe", "Anrufe", "anrufe", ["Telefonnotiz", "Anrufliste des Telefons"]),
  eintrag("offerten", "Offerten", "offerten", ["Ablage der Offerten", "CRM oder Excel"], ["kmu"]),
  eintrag("neukunden", "Neukunden", "kunden", ["Rechnungsliste", "CRM oder Excel"], ["kmu"]),
  eintrag("neumitglieder", "Neumitglieder", "mitglieder", ["Mitgliederliste", "Excel-Liste"], ["verein"]),
  eintrag("anmeldungen", "Anmeldungen", "anmeldungen", ["Anmeldeformular", "Teilnehmerliste"], ["verein"]),
];

export const kpiDef = (key: string): KpiDef | undefined => KPIS.find((k) => k.key === key);
export const kpisFuer = (typ: Typ): KpiDef[] => KPIS.filter((k) => k.fuer.includes(typ));
export const isKpiKey = (value: unknown): value is KpiKey => typeof value === "string" && KPI_KEYS.some((k) => k === value);

/** Wert der Messquelle, wenn die Person eine eigene eingibt. */
export const ANDERE = "andere";

export const ZEITRAUM_KEYS = ["monat", "quartal", "gesamt"] as const;
export type ZeitraumKey = (typeof ZEITRAUM_KEYS)[number];
export const ZEITRAEUME: { key: ZeitraumKey; label: string }[] = [
  { key: "monat", label: "pro Monat" },
  { key: "quartal", label: "pro Quartal" },
  { key: "gesamt", label: "gesamt bis zum Enddatum" },
];
export const isZeitraumKey = (value: unknown): value is ZeitraumKey => typeof value === "string" && ZEITRAUM_KEYS.some((k) => k === value);
const zeitraumLabel = (key: ZeitraumKey) => ZEITRAEUME.find((z) => z.key === key)!.label;

// ---- Formular und Stand ------------------------------------------------------------------------

export type ZielForm = { art: ArtKey | ""; zielwert: string; ausgangswert: string; ende: string };
export type KpiForm = { kpi: KpiKey | ""; zielwert: string; zeitraum: ZeitraumKey; quelle: string; andere: string };
export type MarketingZielForm = { text: string; kanal: KanalKey | ""; kpis: KpiForm[] };
export type RueckwaertsForm = { anfragenZuOfferten: string; offertenZuAuftraegen: string };
export type FormState = { ziel: ZielForm; ziele: MarketingZielForm[]; rueckwaerts: RueckwaertsForm };

/** Was beim Erstellen des Baums feststand: Datum und Angaben aus dem Profil. Das Ergebnis rechnet nur damit. */
export type Output = { datum: string; typ: Typ; firma: string; branche: string };
export type KpiBaumState = FormState & { v: 1; phase: "edit" | "result"; output?: Output };

export const emptyKpi = (): KpiForm => ({ kpi: "", zielwert: "", zeitraum: "monat", quelle: "", andere: "" });
export const emptyMarketingZiel = (): MarketingZielForm => ({ text: "", kanal: "", kpis: [emptyKpi()] });
export const emptyZiel = (): ZielForm => ({ art: "", zielwert: "", ausgangswert: "", ende: "" });
export const emptyRueckwaerts = (): RueckwaertsForm => ({ anfragenZuOfferten: "", offertenZuAuftraegen: "" });
export const emptyForm = (): FormState => ({ ziel: emptyZiel(), ziele: [emptyMarketingZiel()], rueckwaerts: emptyRueckwaerts() });
export const EMPTY_STATE: KpiBaumState = { v: 1, phase: "edit", ...emptyForm() };

export const kpiLeer = (k: KpiForm): boolean => !k.kpi && k.zielwert.trim() === "" && k.quelle === "" && k.andere.trim() === "";
export const marketingZielLeer = (z: MarketingZielForm): boolean => z.text.trim() === "" && !z.kanal && z.kpis.every(kpiLeer);

/** Die Messquelle, die gilt: ein Vorschlag der Kennzahl oder der eigene Text bei «Andere»; sonst leer. */
export function effektiveQuelle(k: Pick<KpiForm, "kpi" | "quelle" | "andere">): string {
  if (k.quelle === ANDERE) return k.andere.trim().slice(0, LIMITS.andereMax);
  const def = k.kpi ? kpiDef(k.kpi) : undefined;
  return def && def.quellen.includes(k.quelle) ? k.quelle : "";
}

// ---- Prüfung der Eingabe -----------------------------------------------------------------------

const invalidNumber = (n: number | null) => n !== null && (Number.isNaN(n) || n <= 0);

/**
 * Prüft das Formular und gibt die erste Meldung zurück, sonst null. Blockiert wird nur, was keine Rechnung zulässt.
 * Lücken, die der SMART-Check zeigt (kurzer Text, kein Kanal, Kennzahl ohne Zielwert oder Messquelle, Enddatum in der
 * Vergangenheit), blockieren nicht: Das Ergebnis ist trotzdem sichtbar. Die Nummern der Meldungen folgen dem Formular.
 */
export function validate(state: FormState, typ: Typ, heute: string): string | null {
  if (!isIso(heute)) return "Das heutige Datum fehlt.";
  const { ziel, ziele, rueckwaerts } = state;
  if (!artenFuer(typ).some((a) => a.key === ziel.art)) return "Wähl, was du erreichen willst.";
  const zw = parseNum(ziel.zielwert);
  if (zw === null || invalidNumber(zw)) return "Der Zielwert muss eine Zahl über 0 sein.";
  if (zw > LIMITS.zielwertMax) return `Der Zielwert ist zu gross. Höchstens ${numberCH(LIMITS.zielwertMax, 0)}.`;
  const aw = parseNum(ziel.ausgangswert);
  if (aw !== null && (Number.isNaN(aw) || aw < 0)) return "Der Ausgangswert muss eine Zahl ab 0 sein. Lass das Feld leer, wenn du bei 0 startest.";
  if (aw !== null && aw > LIMITS.zielwertMax) return `Der Ausgangswert ist zu gross. Höchstens ${numberCH(LIMITS.zielwertMax, 0)}.`;
  if (!isIso(ziel.ende)) return "Gib an, bis wann du das Ziel erreichen willst.";
  if (monateBis(heute, ziel.ende) > LIMITS.maxMonate) return "Das Enddatum liegt mehr als zehn Jahre entfernt. Wähl einen näheren Termin.";

  const aktiv = ziele.map((z, i) => ({ z, nr: i + 1 })).filter(({ z }) => !marketingZielLeer(z));
  if (aktiv.length === 0) return "Nenne mindestens ein Marketingziel.";
  if (aktiv.length > LIMITS.maxZiele) return `Du kannst höchstens ${LIMITS.maxZiele} Marketingziele angeben.`;
  for (const { z, nr } of aktiv) {
    const text = z.text.trim();
    if (text === "") return `Marketingziel ${nr}: Schreib auf, was du erreichen willst.`;
    if (text.length > LIMITS.textMax) return `Marketingziel ${nr}: Der Text ist länger als ${LIMITS.textMax} Zeichen.`;
    const kpis = z.kpis.map((k, j) => ({ k, nr: j + 1 })).filter(({ k }) => !kpiLeer(k));
    if (kpis.length > LIMITS.maxKpis) return `Marketingziel ${nr}: Höchstens ${LIMITS.maxKpis} Kennzahlen.`;
    for (const { k, nr: knr } of kpis) {
      const wo = `Marketingziel ${nr}, Kennzahl ${knr}`;
      if (!k.kpi || !kpisFuer(typ).some((d) => d.key === k.kpi)) return `${wo}: Wähl eine Kennzahl.`;
      const w = parseNum(k.zielwert);
      if (invalidNumber(w)) return `${wo}: Der Zielwert muss eine Zahl über 0 sein. Lass das Feld leer, wenn du ihn noch nicht kennst.`;
      if (w !== null && w > LIMITS.zielwertMax) return `${wo}: Der Zielwert ist zu gross.`;
    }
  }

  const q1 = parseNum(rueckwaerts.anfragenZuOfferten);
  const q2 = parseNum(rueckwaerts.offertenZuAuftraegen);
  for (const q of [q1, q2]) {
    if (q !== null && (Number.isNaN(q) || !Number.isInteger(q) || q < 0 || q > LIMITS.quoteMax)) return "Wähl die Quoten als ganze Zahl von 0 bis 10.";
  }
  if (rueckwaertsGilt(ziel.art) && q1 !== null && q2 !== null && (q1 === 0 || q2 === 0)) {
    return "Eine Quote von 0 von 10 lässt sich nicht zurückrechnen. Wähl mindestens 1 von 10 oder lass die Rückwärtsrechnung leer.";
  }
  return null;
}

// ---- Rechnen -----------------------------------------------------------------------------------

export type Umrechnung = { proMonat: number; proQuartal: number; gesamt: number };

/** Rechnet den Zielwert einer Kennzahl auf Monat, Quartal (3 Monate) und gesamt (Monate bis zum Enddatum) um; auf zwei Stellen gerundet. */
export function kpiProZeitraum(zielwert: number, zeitraum: ZeitraumKey, monate: number): Umrechnung {
  const m = Math.max(1, Math.floor(monate));
  const proMonat = zeitraum === "monat" ? zielwert : zeitraum === "quartal" ? zielwert / 3 : zielwert / m;
  return { proMonat: round2(proMonat), proQuartal: round2(proMonat * 3), gesamt: round2(proMonat * m) };
}

export type RueckwaertsOk = {
  ok: true;
  /** Das Ziel ist mit dem Ausgangswert schon erreicht. */
  erreicht: boolean;
  auftraege: number;
  offerten: number;
  anfragen: number;
  monate: number;
  proMonat: { auftraege: number; offerten: number; anfragen: number };
  /** Annahmen der Person, je «von 10». */
  anfragenZuOfferten: number;
  offertenZuAuftraegen: number;
};
export type RueckwaertsFehler = { ok: false; fehler: string };
export type Rueckwaerts = RueckwaertsOk | RueckwaertsFehler;

const isQuote = (q: number) => Number.isInteger(q) && q >= 0 && q <= LIMITS.quoteMax;

/**
 * Rückwärtsrechnung in ganzen Zahlen, aufgerundet:
 * Aufträge = Zielwert minus Ausgangswert (mindestens 0), Offerten = Aufträge × 10 / Quote, Anfragen = Offerten × 10 / Quote,
 * je pro Monat bis zum Enddatum (aufgerundet). Eine Quote von 0 ergibt einen Fehler statt einer Division durch 0.
 */
export function rueckwaerts(zielwert: number, ausgangswert: number | null, anfragenZuOfferten: number, offertenZuAuftraegen: number, monate: number): Rueckwaerts {
  if (!Number.isFinite(zielwert) || zielwert < 0) return { ok: false, fehler: "Der Zielwert muss eine Zahl ab 0 sein." };
  if (!isQuote(anfragenZuOfferten) || !isQuote(offertenZuAuftraegen)) return { ok: false, fehler: "Die Quoten müssen ganze Zahlen von 0 bis 10 sein." };
  const m = Math.max(1, Math.floor(monate));
  const start = ausgangswert !== null && Number.isFinite(ausgangswert) ? ausgangswert : 0;
  const auftraege = Math.max(0, Math.ceil(round2(zielwert - start)));
  const proMonat = (n: number) => Math.ceil(n / m);
  const base = { monate: m, anfragenZuOfferten, offertenZuAuftraegen };
  if (auftraege === 0) {
    return { ok: true, erreicht: true, auftraege: 0, offerten: 0, anfragen: 0, proMonat: { auftraege: 0, offerten: 0, anfragen: 0 }, ...base };
  }
  if (offertenZuAuftraegen === 0 || anfragenZuOfferten === 0) {
    return { ok: false, fehler: "Eine Quote von 0 von 10 lässt sich nicht zurückrechnen. Wähl mindestens 1 von 10." };
  }
  const offerten = Math.ceil((auftraege * 10) / offertenZuAuftraegen);
  const anfragen = Math.ceil((offerten * 10) / anfragenZuOfferten);
  return {
    ok: true,
    erreicht: false,
    auftraege,
    offerten,
    anfragen,
    proMonat: { auftraege: proMonat(auftraege), offerten: proMonat(offerten), anfragen: proMonat(anfragen) },
    ...base,
  };
}

// ---- Normalisierte Werte -----------------------------------------------------------------------

export type Kontext = { heute: string; typ: Typ; firma: string; branche: string };

export type ZielWerte = {
  art: ArtKey;
  label: string;
  einheit: string;
  zielwert: number;
  ausgangswert: number | null;
  ende: string;
  monate: number;
};

export type KpiWerte = {
  key: KpiKey;
  label: string;
  einheit: string;
  /** null: noch offen. */
  zielwert: number | null;
  zeitraum: ZeitraumKey;
  /** Leer: noch offen. */
  quelle: string;
  rhythmus: Rhythmus;
  umrechnung: Umrechnung | null;
};

export type MarketingZielWerte = {
  /** Nummer im Ergebnis, ab 1 und ohne Lücken. */
  nr: number;
  text: string;
  kanal: KanalKey | "";
  kpis: KpiWerte[];
};

// ---- SMART-Check -------------------------------------------------------------------------------

export const CHECK_KEYS = ["spezifisch", "messbar", "terminiert", "plausibel"] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];
export const CHECK_LABELS: Record<CheckKey, string> = { spezifisch: "Spezifisch", messbar: "Messbar", terminiert: "Terminiert", plausibel: "Plausibel" };

/** ok: erfüllt. fehlt: Lücke, die du schliessen kannst. offen: nicht prüfbar (nur bei «plausibel»). */
export type CheckStatus = "ok" | "fehlt" | "offen";
export type Check = { key: CheckKey; status: CheckStatus; /** Ein Satz «Das fehlt noch»; leer bei «ok». */ hinweis: string };

const STATUS_TEXT: Record<CheckStatus, string> = { ok: "erfüllt", fehlt: "fehlt", offen: "nicht prüfbar" };
export const statusText = (s: CheckStatus): string => STATUS_TEXT[s];

const missingPhrase = (parts: string[]): string => {
  if (parts.length === 1) return parts[0] === "Zielwert" ? "fehlt der Zielwert" : "fehlt die Messquelle";
  return "fehlen Zielwert und Messquelle";
};

/** Die vier Prüfungen für ein Marketingziel. «Attraktiv» und «realistisch» lassen sich nicht prüfen. */
export function smartCheck(mz: Pick<MarketingZielWerte, "text" | "kanal" | "kpis">, ziel: Pick<ZielWerte, "einheit" | "zielwert" | "ende">, heute: string): Check[] {
  // spezifisch: Text mit mindestens 10 Zeichen und ein Kanal
  const len = mz.text.trim().length;
  const kurz = len < LIMITS.textMin;
  const spezifischTeile: string[] = [];
  if (kurz) spezifischTeile.push(`Der Text hat nur ${len} Zeichen (mindestens ${LIMITS.textMin})`);
  if (!mz.kanal) spezifischTeile.push("es fehlt ein Kanal");
  const spezifisch: Check = {
    key: "spezifisch",
    status: spezifischTeile.length === 0 ? "ok" : "fehlt",
    hinweis: spezifischTeile.length === 0 ? "" : `${spezifischTeile.join(" und ").replace(/^./, (c) => c.toUpperCase())}.`,
  };

  // messbar: mindestens eine Kennzahl mit Zielwert und Messquelle
  const vollstaendig = mz.kpis.some((k) => k.zielwert !== null && k.quelle !== "");
  let messbarHinweis = "";
  if (!vollstaendig) {
    if (mz.kpis.length === 0) messbarHinweis = "Es fehlt eine Kennzahl mit Zielwert und Messquelle.";
    else {
      messbarHinweis = mz.kpis
        .map((k) => {
          const fehlt: string[] = [];
          if (k.zielwert === null) fehlt.push("Zielwert");
          if (k.quelle === "") fehlt.push("Messquelle");
          return `Bei «${k.label}» ${missingPhrase(fehlt)}.`;
        })
        .join(" ");
    }
  }
  const messbar: Check = { key: "messbar", status: vollstaendig ? "ok" : "fehlt", hinweis: messbarHinweis };

  // terminiert: das Enddatum liegt nach heute (bei «gesamt bis zum Enddatum» ist es die einzige Frist)
  const zukunft = ziel.ende > heute;
  const terminiert: Check = {
    key: "terminiert",
    status: zukunft ? "ok" : "fehlt",
    hinweis: zukunft ? "" : `Das Enddatum ${isoToCH(ziel.ende)} liegt nicht nach heute (${isoToCH(heute)}); wähl ein Datum in der Zukunft.`,
  };

  // plausibel: Zielwert der Kennzahl, auf «gesamt» umgerechnet, ist nicht grösser als das Unternehmensziel, wenn dieselbe Einheit
  const gleich = mz.kpis.filter((k) => k.einheit === ziel.einheit && k.umrechnung !== null);
  let plausibel: Check;
  if (gleich.length === 0) {
    plausibel = { key: "plausibel", status: "offen", hinweis: "Nicht prüfbar: Keine Kennzahl mit Zielwert hat dieselbe Einheit wie dein Unternehmensziel." };
  } else {
    const zuGross = gleich.filter((k) => k.umrechnung!.gesamt > ziel.zielwert);
    plausibel = {
      key: "plausibel",
      status: zuGross.length === 0 ? "ok" : "fehlt",
      hinweis: zuGross
        .map((k) => `Die Kennzahl «${k.label}» ergibt bis zum Enddatum ${fmt(k.umrechnung!.gesamt)}, mehr als dein Unternehmensziel (${fmt(ziel.zielwert)}).`)
        .join(" "),
    };
  }
  return [spezifisch, messbar, terminiert, plausibel];
}

// ---- Auswertung --------------------------------------------------------------------------------

export type ZielErgebnis = MarketingZielWerte & { kanalLabel: string; checks: Check[]; /** Anzahl Prüfungen mit Status «fehlt». */ luecken: number };

export type MessplanZeile = { kpi: string; zielwert: string; zeitraum: string; ist: string; quelle: string; rhythmus: string };

export type Ergebnis = {
  kontext: Kontext;
  ziel: ZielWerte & { wertText: string; ausgangText: string | null; endeText: string; satz: string };
  ziele: ZielErgebnis[];
  /** null: gilt nicht oder die beiden Quoten fehlen (dann `rueckwaertsOffen`). */
  rueckwaerts: Rueckwaerts | null;
  rueckwaertsOffen: boolean;
  messplan: MessplanZeile[];
  /** Marketingziele mit mindestens einer Lücke. */
  luecken: number;
};

const zeitraumKurz = (z: ZeitraumKey) => (z === "gesamt" ? "gesamt" : zeitraumLabel(z));

function zeitraumText(zeitraum: ZeitraumKey, ende: string): string {
  return zeitraum === "gesamt" ? `gesamt bis ${isoToCH(ende)}` : zeitraumLabel(zeitraum);
}

function umrechnungText(zeitraum: ZeitraumKey, u: Umrechnung, ende: string): string {
  if (zeitraum === "monat") return `${fmt(u.proQuartal, 1)} pro Quartal, ${fmt(u.gesamt, 1)} bis ${isoToCH(ende)}`;
  if (zeitraum === "quartal") return `${fmt(u.proMonat, 1)} pro Monat, ${fmt(u.gesamt, 1)} bis ${isoToCH(ende)}`;
  return `${fmt(u.proMonat, 1)} pro Monat, ${fmt(u.proQuartal, 1)} pro Quartal`;
}

/** Zeilen des Messplans: KPI | Zielwert | Zeitraum | Ist (leer) | Messquelle | Rhythmus. */
export function messplan(ziele: Pick<MarketingZielWerte, "nr" | "kpis">[], ende: string): MessplanZeile[] {
  const mehrere = ziele.length > 1;
  return ziele.flatMap((z) =>
    z.kpis.map((k) => ({
      kpi: mehrere ? `${k.label} (Ziel ${z.nr})` : k.label,
      zielwert: k.zielwert === null ? "offen" : fmt(k.zielwert),
      zeitraum: k.umrechnung ? `${zeitraumText(k.zeitraum, ende)} (= ${umrechnungText(k.zeitraum, k.umrechnung, ende)})` : zeitraumText(k.zeitraum, ende),
      ist: "",
      quelle: k.quelle || "offen",
      rhythmus: k.rhythmus,
    })),
  );
}

/** Rechnet das Formular aus. Gibt null zurück, wenn die Eingabe die Prüfung nicht besteht. */
export function auswerten(state: FormState, kontext: Kontext): Ergebnis | null {
  if (validate(state, kontext.typ, kontext.heute) !== null) return null;
  const art = artDef(state.ziel.art)!;
  const zielwert = parseNum(state.ziel.zielwert)!;
  const ausgangswert = parseNum(state.ziel.ausgangswert);
  const ende = state.ziel.ende;
  const monate = monateBis(kontext.heute, ende);
  const ziel: ZielWerte = { art: art.key, label: art.label, einheit: art.einheit, zielwert, ausgangswert, ende, monate };

  const ziele: ZielErgebnis[] = state.ziele
    .filter((z) => !marketingZielLeer(z))
    .map((z, i) => {
      const kpis: KpiWerte[] = z.kpis
        .filter((k) => !kpiLeer(k))
        .map((k) => {
          const def = kpiDef(k.kpi)!;
          const w = parseNum(k.zielwert);
          return {
            key: def.key,
            label: def.label,
            einheit: def.einheit,
            zielwert: w,
            zeitraum: k.zeitraum,
            quelle: effektiveQuelle(k),
            rhythmus: def.rhythmus,
            umrechnung: w === null ? null : kpiProZeitraum(w, k.zeitraum, monate),
          };
        });
      const werte: MarketingZielWerte = { nr: i + 1, text: z.text.trim(), kanal: z.kanal, kpis };
      const checks = smartCheck(werte, ziel, kontext.heute);
      return { ...werte, kanalLabel: kanalLabel(z.kanal), checks, luecken: checks.filter((c) => c.status === "fehlt").length };
    });

  const q1 = parseNum(state.rueckwaerts.anfragenZuOfferten);
  const q2 = parseNum(state.rueckwaerts.offertenZuAuftraegen);
  const gilt = rueckwaertsGilt(ziel.art);
  const beide = gilt && q1 !== null && q2 !== null;
  return {
    kontext,
    ziel: {
      ...ziel,
      wertText: art.wert(zielwert),
      ausgangText: ausgangswert === null ? null : art.wert(ausgangswert),
      endeText: isoToCH(ende),
      satz: zielSatz(art, zielwert, ausgangswert, ende),
    },
    ziele,
    rueckwaerts: beide ? rueckwaerts(zielwert, ausgangswert, q1, q2, monate) : null,
    rueckwaertsOffen: gilt && !beide,
    messplan: messplan(ziele, ende),
    luecken: ziele.filter((z) => z.luecken > 0).length,
  };
}

/** Das Ziel in einem Satz: «Bis 31.12.2026 willst du 30 Aufträge erhalten (Ausgangswert: 18 Aufträge).» */
export function zielSatz(art: ArtDef, zielwert: number, ausgangswert: number | null, ende: string): string {
  const basis = `Bis ${isoToCH(ende)} willst du ${art.ziel(zielwert)}`;
  return ausgangswert === null ? `${basis}.` : `${basis} (Ausgangswert: ${art.wert(ausgangswert)}).`;
}

// ---- Baum --------------------------------------------------------------------------------------

export type BaumKnoten = { titel: string; text: string; detail: string | null };
export type BaumModell = {
  ziel: BaumKnoten;
  ziele: (BaumKnoten & { kpis: BaumKnoten[] })[];
};

export function baumModell(e: Ergebnis): BaumModell {
  return {
    ziel: {
      titel: "Unternehmensziel",
      text: `${e.ziel.wertText} bis ${e.ziel.endeText}`,
      detail: e.ziel.ausgangText === null ? null : `Ausgangswert: ${e.ziel.ausgangText}`,
    },
    ziele: e.ziele.map((z) => ({
      titel: `Marketingziel ${z.nr}`,
      text: z.text,
      detail: z.kanalLabel ? `Kanal: ${z.kanalLabel}` : "Kanal fehlt",
      kpis: z.kpis.map((k) => ({
        titel: k.label,
        text: k.zielwert === null ? "Zielwert offen" : `${fmt(k.zielwert)} ${zeitraumKurz(k.zeitraum)}`,
        detail: `Quelle: ${k.quelle || "offen"}`,
      })),
    })),
  };
}

/** Eine Zeile der Baumliste: «Anfragen: 17 pro Monat (Quelle: Kontaktformular)». */
export const baumZeile = (n: BaumKnoten): string => `${n.titel}: ${n.text}${n.detail ? ` (${n.detail})` : ""}`;

/** Bricht Text nach Zeichenzahl um; lange Wörter werden zerlegt. */
export function wrapText(text: string, max: number): string[] {
  const limit = Math.max(1, Math.floor(max));
  const lines: string[] = [];
  let line = "";
  for (let word of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (word === "") continue;
    while (word.length > limit) {
      if (line) {
        lines.push(line);
        line = "";
      }
      // Lieber nach einem Bindestrich trennen als mitten im Wort («Google-» und «Unternehmensprofil»).
      const hyphen = word.lastIndexOf("-", limit - 1);
      const at = hyphen > 0 ? hyphen + 1 : limit;
      lines.push(word.slice(0, at));
      word = word.slice(at);
    }
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= limit) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const r1 = (n: number) => Math.round(n * 10) / 10;

// Maße im Koordinatensystem der viewBox. Bei 16 Einheiten Schrift und einer Anzeigebreite ab 600 Pixel sind es mindestens 12 Pixel.
const SVG = {
  width: 760,
  font: 16,
  line: 21,
  pad: 12,
  /** Durchschnittliche Zeichenbreite (Geist, 16 Einheiten) mit Reserve. */
  char: 9.4,
  gapGroup: 20,
  gapKpi: 12,
  cols: [
    { x: 0, w: 210 },
    { x: 255, w: 240 },
    { x: 540, w: 220 },
  ],
} as const;

type SvgLine = { t: string; kind: "titel" | "text" | "detail" };
type SvgBox = { node: BaumKnoten; x: number; w: number; h: number; lines: SvgLine[]; y: number };

function layoutBox(node: BaumKnoten, col: { x: number; w: number }): SvgBox {
  const chars = Math.max(8, Math.floor((col.w - 2 * SVG.pad) / SVG.char));
  const lines: SvgLine[] = [
    ...wrapText(node.titel, chars - 2).map((t) => ({ t, kind: "titel" as const })),
    ...wrapText(node.text, chars).map((t) => ({ t, kind: "text" as const })),
    ...(node.detail ? wrapText(node.detail, chars).map((t) => ({ t, kind: "detail" as const })) : []),
  ];
  return { node, x: col.x, w: col.w, h: 2 * SVG.pad + lines.length * SVG.line, lines, y: 0 };
}

const NODE_STYLE = {
  ziel: { fill: "var(--ink,#0f0f0e)", stroke: "var(--ink,#0f0f0e)", text: "var(--page,#f3f1ec)", detail: "var(--page,#f3f1ec)" },
  marketingziel: { fill: "var(--surface,#eae7e0)", stroke: "var(--line-strong,rgba(15,15,14,0.32))", text: "var(--ink,#0f0f0e)", detail: "var(--muted,#65645f)" },
  kpi: { fill: "var(--paper,#fffdf8)", stroke: "var(--ink,#0f0f0e)", text: "var(--ink,#0f0f0e)", detail: "var(--muted,#65645f)" },
} as const;

function drawBox(kind: keyof typeof NODE_STYLE, b: SvgBox): string {
  const s = NODE_STYLE[kind];
  const out: string[] = [
    `<g data-node="${kind}">`,
    `<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${b.w}" height="${r1(b.h)}" rx="14" style="fill:${s.fill};stroke:${s.stroke};stroke-width:1.25"/>`,
  ];
  if (kind === "ziel") out.push(`<circle cx="${r1(b.x + b.w - SVG.pad - 4)}" cy="${r1(b.y + SVG.pad + 6)}" r="4" style="fill:var(--yellow,#ffd700)"/>`);
  b.lines.forEach((l, i) => {
    const y = r1(b.y + SVG.pad + (i + 1) * SVG.line - 5);
    const fill = l.kind === "detail" ? s.detail : s.text;
    const weight = l.kind === "titel" ? ' font-weight="600"' : "";
    out.push(`<text x="${r1(b.x + SVG.pad)}" y="${y}" font-size="${SVG.font}"${weight} style="fill:${fill}">${esc(l.t)}</text>`);
  });
  out.push("</g>");
  return out.join("");
}

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const xm = r1((x1 + x2) / 2);
  return `<path data-line="" d="M${r1(x1)} ${r1(y1)} C${xm} ${r1(y1)} ${xm} ${r1(y2)} ${r1(x2)} ${r1(y2)}" fill="none" style="stroke:var(--muted,#65645f);stroke-width:1.5"/>`;
};

/** Beschriftung des Baums für Screenreader. */
export function baumBeschriftung(m: BaumModell): string {
  const k = m.ziele.reduce((n, z) => n + z.kpis.length, 0);
  const z = m.ziele.length;
  return `Baum: Unternehmensziel ${m.ziel.text}; ${z} ${z === 1 ? "Marketingziel" : "Marketingziele"}; ${k} ${k === 1 ? "Kennzahl" : "Kennzahlen"}.`;
}

/**
 * Der Baum als SVG-Text: links das Unternehmensziel, in der Mitte die Marketingziele, rechts die Kennzahlen mit Zielwert und
 * Quelle, Linien dazwischen. Farben aus den Design-Tokens (mit Rückfallwert), keine Verläufe. Alle Texte sind maskiert.
 */
export function treeSvg(m: BaumModell): string {
  const [c0, c1, c2] = SVG.cols;
  const zielBox = layoutBox(m.ziel, c0);
  const groups = m.ziele.map((z) => {
    const goal = layoutBox(z, c1);
    const kpis = z.kpis.map((k) => layoutBox(k, c2));
    const kpiH = kpis.reduce((s, b) => s + b.h, 0) + Math.max(0, kpis.length - 1) * SVG.gapKpi;
    return { goal, kpis, kpiH, h: Math.max(goal.h, kpiH) };
  });
  const groupsH = groups.reduce((s, g) => s + g.h, 0) + Math.max(0, groups.length - 1) * SVG.gapGroup;
  const height = Math.max(groupsH, zielBox.h);

  let y = (height - groupsH) / 2;
  for (const g of groups) {
    g.goal.y = y + (g.h - g.goal.h) / 2;
    let ky = y + (g.h - g.kpiH) / 2;
    for (const k of g.kpis) {
      k.y = ky;
      ky += k.h + SVG.gapKpi;
    }
    y += g.h + SVG.gapGroup;
  }
  zielBox.y = (height - zielBox.h) / 2;

  const lines: string[] = [];
  for (const g of groups) {
    lines.push(curve(zielBox.x + zielBox.w, zielBox.y + zielBox.h / 2, g.goal.x, g.goal.y + g.goal.h / 2));
    for (const k of g.kpis) lines.push(curve(g.goal.x + g.goal.w, g.goal.y + g.goal.h / 2, k.x, k.y + k.h / 2));
  }
  const nodes = [drawBox("ziel", zielBox), ...groups.flatMap((g) => [drawBox("marketingziel", g.goal), ...g.kpis.map((k) => drawBox("kpi", k))])];
  const label = esc(baumBeschriftung(m));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}" viewBox="-2 -2 ${SVG.width + 4} ${r1(height + 4)}" ` +
    `preserveAspectRatio="xMidYMin meet" style="display:block;width:100%;height:auto">` +
    lines.join("") +
    nodes.join("") +
    "</svg>"
  );
}

// ---- Dokument ----------------------------------------------------------------------------------

export const HINWEISE: string[] = [
  "Weniger Kennzahlen sind besser: Behalte nur die, die du jeden Monat wirklich ansiehst und die eine Entscheidung auslösen.",
  "Eine Zahl, die du nicht erhebst, ist keine Kennzahl: Trag bei jeder Zeile ein, wo du sie holst und wer sie notiert.",
  "Notiere die Ist-Werte immer am gleichen Tag des Monats, zum Beispiel am ersten Arbeitstag; sonst vergleichst du verschieden lange Zeiträume.",
];

export type DocParts = { kopf: DocBlock[]; baum: DocBlock[]; rest: DocBlock[] };

/** Der Hinweis über dem Ergebnis, wenn bei einem Marketingziel etwas fehlt; sonst null. */
export function hinweisOben(e: Ergebnis): string | null {
  if (e.luecken === 0) return null;
  const n = e.ziele.length;
  const wo = n === 1 ? "Beim Marketingziel" : e.luecken === n ? `Bei allen ${n} Marketingzielen` : `Bei ${e.luecken} von ${n} Marketingzielen`;
  return `Hinweis: ${wo} fehlt noch etwas. Der Baum steht trotzdem; die Lücken stehen im SMART-Check.`;
}

function rueckwaertsBlocks(e: Ergebnis): DocBlock[] {
  const art = e.ziel.art;
  const r = e.rueckwaerts;
  if (!rueckwaertsGilt(art)) return [];
  const head: DocBlock = { type: "heading", level: 1, text: "Rückwärtsrechnung" };
  if (r === null) {
    return [
      head,
      {
        type: "paragraph",
        text: "Du hast die beiden Quoten nicht angegeben. Sag beim nächsten Mal, wie viele von 10 Anfragen zu Offerten und wie viele von 10 Offerten zu Aufträgen werden, dann rechnet das Werkzeug dir die nötigen Anfragen aus.",
      },
    ];
  }
  if (!r.ok) return [head, { type: "paragraph", text: r.fehler }];
  const monate = `${r.monate} ${r.monate === 1 ? "Monat" : "Monate"}`;
  const annahme = `${ANNAHME_NOTE} Von 10 Anfragen werden ${r.anfragenZuOfferten} zu Offerten, von 10 Offerten werden ${r.offertenZuAuftraegen} zu Aufträgen. Bis zum ${e.ziel.endeText} sind es ${monate}.${art === "kunden" ? " Annahme: Jede neue Kundin und jeder neue Kunde bringt einen Auftrag." : ""}`;
  if (r.erreicht) {
    return [head, { type: "paragraph", text: `${annahme} Dein Ausgangswert erreicht das Ziel schon: Es braucht keine weiteren Aufträge, Offerten und Anfragen.` }];
  }
  const start = e.ziel.ausgangswert ?? 0;
  return [
    head,
    { type: "paragraph", text: annahme },
    {
      type: "table",
      header: ["Schritt", "Gesamt", `Pro Monat (${monate})`],
      rows: [
        ["Aufträge (Zielwert minus Ausgangswert)", fmt(r.auftraege, 0), fmt(r.proMonat.auftraege, 0)],
        [`Offerten (${r.offertenZuAuftraegen} von 10 werden zum Auftrag)`, fmt(r.offerten, 0), fmt(r.proMonat.offerten, 0)],
        [`Anfragen (${r.anfragenZuOfferten} von 10 werden zur Offerte)`, fmt(r.anfragen, 0), fmt(r.proMonat.anfragen, 0)],
      ],
      widths: [4, 1.2, 2],
    },
    {
      type: "paragraph",
      text: `Rechnung: ${fmt(e.ziel.zielwert)} minus ${fmt(start)} = ${fmt(r.auftraege, 0)} Aufträge. ${fmt(r.auftraege, 0)} Aufträge bei ${r.offertenZuAuftraegen} von 10 ergeben ${fmt(r.offerten, 0)} Offerten. ${fmt(r.offerten, 0)} Offerten bei ${r.anfragenZuOfferten} von 10 ergeben ${fmt(r.anfragen, 0)} Anfragen. Alles auf ganze Zahlen aufgerundet.`,
    },
  ];
}

/** Das Dokument in drei Teilen: Kopf, Baum, Rest. Am Bildschirm steht zwischen Kopf und Rest der Baum als Grafik und Liste. */
export function documentParts(e: Ergebnis): DocParts {
  const verein = e.kontext.typ === "verein";
  const modell = baumModell(e);
  const monate = e.ziel.monate;
  const facts: { label: string; value: string }[] = [
    { label: verein ? "Verein" : "Betrieb", value: e.kontext.firma || "keine Angabe" },
    ...(e.kontext.branche ? [{ label: verein ? "Tätigkeit" : "Branche", value: e.kontext.branche }] : []),
    {
      label: "Zeitraum",
      value: `${isoToCH(e.kontext.heute)} bis ${e.ziel.endeText}, ${monate} ${monate === 1 ? "Monat" : "Monate"} (ein angebrochener Monat zählt voll)`,
    },
  ];
  const oben = hinweisOben(e);
  const kopf: DocBlock[] = [
    ...(oben ? [{ type: "paragraph", text: oben } as DocBlock] : []),
    { type: "facts", items: facts },
    { type: "heading", level: 1, text: "Das Ziel in einem Satz" },
    { type: "paragraph", text: e.ziel.satz },
  ];

  const baum: DocBlock[] = [
    { type: "heading", level: 1, text: "Der Baum" },
    { type: "paragraph", text: baumZeile(modell.ziel) },
    ...(modell.ziele.length === 0
      ? []
      : [
          {
            type: "list",
            items: modell.ziele.map((z) => [baumZeile(z), ...z.kpis.map((k) => `  - ${baumZeile(k)}`)].join("\n")),
          } as DocBlock,
        ]),
  ];

  const tabelle: DocBlock = {
    type: "table",
    header: ["Marketingziel", ...CHECK_KEYS.map((k) => CHECK_LABELS[k]), "Hinweis"],
    rows: e.ziele.map((z) => [
      `${z.nr}. ${z.text}`,
      ...z.checks.map((c) => statusText(c.status)),
      z.checks
        .filter((c) => c.status === "fehlt")
        .map((c) => `${CHECK_LABELS[c.key]}: ${c.hinweis}`)
        .join(" ") || "Nichts offen.",
    ]),
    widths: [3, 1.3, 1.2, 1.4, 1.3, 4],
  };

  const plan: DocBlock = {
    type: "table",
    header: ["KPI", "Zielwert", "Zeitraum", "Ist", "Messquelle", "Rhythmus"],
    rows: e.messplan.map((r) => [r.kpi, r.zielwert, r.zeitraum, r.ist, r.quelle, r.rhythmus]),
    widths: [2, 1.2, 3.2, 1, 2.4, 1.4],
  };

  const rest: DocBlock[] = [
    { type: "heading", level: 1, text: "SMART-Check" },
    { type: "paragraph", text: `Der Check prüft, ob jedes Marketingziel spezifisch, messbar und terminiert ist und ob die Zahlen zusammenpassen. ${NICHT_GEPRUEFT}` },
    tabelle,
    { type: "paragraph", text: PLAUSIBEL_NOTE },
    ...rueckwaertsBlocks(e),
    { type: "heading", level: 1, text: "Messplan" },
    ...(e.messplan.length === 0
      ? [{ type: "paragraph", text: "Noch keine Kennzahl angegeben. Ergänze mindestens eine je Marketingziel, dann steht sie hier mit Zielwert, Quelle und Rhythmus." } as DocBlock]
      : [
          plan,
          { type: "paragraph", text: `Die Spalte «Ist» füllst du aus. Der Rhythmus ist ein ${RICHTWERT_NOTE}: monatlich, bei Website-Besuchen wöchentlich.` } as DocBlock,
        ]),
    { type: "heading", level: 1, text: "Drei Hinweise" },
    { type: "list", ordered: true, items: HINWEISE },
  ];
  return { kopf, baum, rest };
}

export function toDocument(e: Ergebnis): DocumentModel {
  const { kopf, baum, rest } = documentParts(e);
  return {
    title: "Ziel- und KPI-Baum",
    subtitle: `${e.ziel.wertText} bis ${e.ziel.endeText}`,
    firma: e.kontext.firma || undefined,
    datum: isoToCH(e.kontext.heute),
    filename: `kpi-baum-${safeFilename(e.kontext.firma, "betrieb")}`,
    blocks: [...kopf, ...baum, ...rest],
  };
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(e: Ergebnis): string {
  return toMarkdown(toDocument(e)).trimEnd();
}

/** Die Angaben fürs CRM, eine je Zeile; der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(e: Ergebnis): string {
  const verein = e.kontext.typ === "verein";
  const lines: string[] = [`${verein ? "Verein" : "Betrieb"}: ${e.kontext.firma || "keine Angabe"}`];
  if (e.kontext.branche) lines.push(`${verein ? "Tätigkeit" : "Branche"}: ${e.kontext.branche}`);
  lines.push(`Unternehmensziel: ${e.ziel.wertText} bis ${e.ziel.endeText}${e.ziel.ausgangText ? ` (Ausgangswert: ${e.ziel.ausgangText})` : ""}`);
  for (const z of e.ziele) {
    lines.push(`Marketingziel ${z.nr}: ${z.text} | Kanal: ${z.kanalLabel || "offen"}`);
    for (const k of z.kpis) {
      const wert = k.zielwert === null ? "Zielwert offen" : `${fmt(k.zielwert)} ${zeitraumText(k.zeitraum, e.ziel.ende)}`;
      lines.push(`  Kennzahl: ${k.label}, ${wert}, Messquelle: ${k.quelle || "offen"}`);
    }
  }
  const r = e.rueckwaerts;
  if (r && r.ok) {
    lines.push(`Rückwärtsrechnung (Annahmen): ${r.anfragenZuOfferten} von 10 Anfragen werden zu Offerten, ${r.offertenZuAuftraegen} von 10 Offerten werden zu Aufträgen`);
  }
  return lines.join("\n");
}

// ---- CSV ---------------------------------------------------------------------------------------

export const CSV_BOM = "﻿";
export const MONATS_KUERZEL = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"] as const;

/** Zwölf Monatskürzel ab dem Monat des heutigen Datums, über den Jahreswechsel: 05.10. → Okt, Nov, Dez, Jan, … Sep. */
export function monatsSpalten(heute: string): string[] {
  const p = parseIso(heute);
  const start = p ? p.m - 1 : 0;
  return Array.from({ length: 12 }, (_, i) => MONATS_KUERZEL[(start + i) % 12]);
}

const csvCell = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * CSV-Vorlage für die monatliche Erfassung: Semikolon, UTF-8 mit BOM, Zeilenende CRLF. Spalten KPI;Zielwert;Quelle und zwölf
 * leere Monatsspalten ab dem Monat des heutigen Datums; eine Zeile je Kennzahl.
 */
export function toCsv(e: Ergebnis): string {
  const header = ["KPI", "Zielwert", "Quelle", ...monatsSpalten(e.kontext.heute)];
  const kpis = e.ziele.flatMap((z) => z.kpis);
  const rows = e.messplan.map((r, i) => {
    const k = kpis[i];
    const ziel = k && k.zielwert !== null ? `${fmt(k.zielwert)} ${zeitraumText(k.zeitraum, e.ziel.ende)}` : "offen";
    return [r.kpi, ziel, r.quelle === "offen" ? "" : r.quelle, ...Array<string>(12).fill("")];
  });
  return CSV_BOM + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function csvFilename(firma: string): string {
  return `kpi-messplan-${safeFilename(firma, "betrieb")}.csv`;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

const asText = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function parseKpiForm(raw: unknown): KpiForm {
  if (typeof raw !== "object" || raw === null) return emptyKpi();
  const r = raw as Record<string, unknown>;
  return {
    kpi: isKpiKey(r.kpi) ? r.kpi : "",
    zielwert: asText(r.zielwert, 20),
    zeitraum: isZeitraumKey(r.zeitraum) ? r.zeitraum : "monat",
    quelle: asText(r.quelle, 120),
    andere: asText(r.andere, LIMITS.andereMax),
  };
}

function parseMarketingZiel(raw: unknown): MarketingZielForm {
  if (typeof raw !== "object" || raw === null) return emptyMarketingZiel();
  const r = raw as Record<string, unknown>;
  const kpis = Array.isArray(r.kpis) ? r.kpis.slice(0, LIMITS.maxKpis).map(parseKpiForm) : [emptyKpi()];
  return { text: asText(r.text, LIMITS.textMax), kanal: isKanalKey(r.kanal) ? r.kanal : "", kpis };
}

function parseOutput(raw: unknown): Output | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isIso(r.datum) || (r.typ !== "kmu" && r.typ !== "verein")) return null;
  return { datum: r.datum, typ: r.typ, firma: asText(r.firma, 200), branche: asText(r.branche, 200) };
}

/**
 * Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Mehr als drei Marketingziele und mehr als zwei
 * Kennzahlen je Ziel werden abgeschnitten. Ohne gültige Eingabe oder ohne gültiges `output` bleibt die Phase «edit»,
 * damit nie ein halbes Ergebnis erscheint.
 */
export function parseState(raw: unknown): KpiBaumState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const z = typeof r.ziel === "object" && r.ziel !== null ? (r.ziel as Record<string, unknown>) : {};
  const rw = typeof r.rueckwaerts === "object" && r.rueckwaerts !== null ? (r.rueckwaerts as Record<string, unknown>) : {};
  const ziele = Array.isArray(r.ziele) ? r.ziele.slice(0, LIMITS.maxZiele).map(parseMarketingZiel) : [];
  const form: FormState = {
    ziel: {
      art: isArtKey(z.art) ? z.art : "",
      zielwert: asText(z.zielwert, 20),
      ausgangswert: asText(z.ausgangswert, 20),
      ende: isIso(z.ende) ? z.ende : "",
    },
    ziele: ziele.length > 0 ? ziele : [emptyMarketingZiel()],
    rueckwaerts: { anfragenZuOfferten: asText(rw.anfragenZuOfferten, 4), offertenZuAuftraegen: asText(rw.offertenZuAuftraegen, 4) },
  };
  const output = parseOutput(r.output);
  if (r.phase === "result" && output && validate(form, output.typ, output.datum) === null) return { v: 1, phase: "result", ...form, output };
  return { v: 1, phase: "edit", ...form };
}
