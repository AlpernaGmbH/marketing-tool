import { z } from "zod";
import budgetData from "@/data/budget-richtwerte.json";
import { chf, numberCH, pctCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile, ProfileKey } from "@/lib/profile";

// Marketing-Budget-Planer: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Alles rechnet im Browser (Klasse C). Die Aufteilung auf Kanäle, die Trennung in Fremdkosten und Werbebudget und
// der Startwert des Anteils sind Richtwerte von Alperna, keine Statistik; der einzige Wert mit Quelle ist der Vergleich
// aus data/budget-richtwerte.json. Spec: specs/budget-planer.md

export const SLUG = "budget-planer";
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";

/** Startwert des Anteils, wenn keine Spanne aus Daten vorliegt. Kein Richtwert. */
export const START_ANTEIL = 3;
export const START_ANTEIL_SATZ = "Startwert, kein Richtwert; passe ihn an.";

export const LIMITS = {
  umsatz: { min: 1_000, max: 100_000_000 },
  anteil: { min: 0.5, max: 30, step: 0.5 },
  stunden: { min: 0, max: 400 },
  stundensatz: { min: 0, max: 500 },
} as const;

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;

// ---- Phasen, Ziele, Kanäle ---------------------------------------------------------------------

export const PHASE_KEYS = ["start", "wachstum", "etabliert"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];
export const PHASEN: { key: PhaseKey; label: string }[] = [
  { key: "start", label: "Start: unter zwei Jahren" },
  { key: "wachstum", label: "Wachstum: wir wollen deutlich mehr Aufträge" },
  { key: "etabliert", label: "Etabliert: Auslastung halten" },
];

export const ZIEL_KEYS = ["halten", "leicht", "stark"] as const;
export type ZielKey = (typeof ZIEL_KEYS)[number];
export const ZIELE: { key: ZielKey; label: string }[] = [
  { key: "halten", label: "Halten" },
  { key: "leicht", label: "Leicht wachsen" },
  { key: "stark", label: "Stark wachsen" },
];

export type Rolle = "fundament" | "reichweite" | "pflege" | "anlass";
/** Gewicht je Rolle (Richtwert von Alperna, keine Statistik): Fundament zuerst, dann Reichweite und Anlass, dann Pflege. */
export const ROLLEN: Record<Rolle, { label: string; gewicht: number }> = {
  fundament: { label: "Fundament", gewicht: 3 },
  reichweite: { label: "Reichweite", gewicht: 2 },
  pflege: { label: "Pflege", gewicht: 1 },
  anlass: { label: "Anlass", gewicht: 2 },
};

export const KANAL_KEYS = ["website", "gbp", "instagram", "facebook", "linkedin", "newsletter", "print", "anlaesse", "googleads", "empfehlungen"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

export type Kanal = {
  key: KanalKey;
  label: string;
  rolle: Rolle;
  gewicht: number;
  /** Anteil des Kanalbudgets, der bezahlte Reichweite ist (0 bis 1); der Rest sind Fremdkosten. */
  werbeanteil: number;
  /** Wörter, an denen ein Eintrag in profile.kanaele diesem Kanal zugeordnet wird. */
  re: RegExp;
};

const kanal = (key: KanalKey, label: string, rolle: Rolle, werbeanteil: number, re: RegExp): Kanal => ({ key, label, rolle, gewicht: ROLLEN[rolle].gewicht, werbeanteil, re });

/** Google Ads steht in der Liste, wird aber nicht empfohlen (docs/MARKE.md). */
export const KANAELE: Kanal[] = [
  kanal("website", "Website", "fundament", 0, /website|webseite|homepage|blog/i),
  kanal("gbp", "Google-Unternehmensprofil", "fundament", 0, /unternehmensprofil|business[- ]?profil|google[- ]?(?:business|maps|profil|my business|unternehmen)|\bgbp\b/i),
  kanal("instagram", "Instagram", "reichweite", 0.5, /instagram/i),
  kanal("facebook", "Facebook", "reichweite", 0.5, /facebook/i),
  kanal("linkedin", "LinkedIn", "reichweite", 0.5, /linkedin/i),
  kanal("newsletter", "Newsletter", "pflege", 0, /newsletter|e-?mail|mailing/i),
  kanal("print", "Print und Anzeiger", "reichweite", 1, /print|anzeiger|inserat|flyer|plakat|zeitung/i),
  kanal("anlaesse", "Anlässe und Sponsoring", "anlass", 0, /anlass|anlässe|anlaesse|event|sponsoring|messe/i),
  kanal("googleads", "Google Ads", "reichweite", 1, /google[- ]?ads|adwords|\bsea\b/i),
  kanal("empfehlungen", "Empfehlungen und Bewertungen", "pflege", 0, /empfehlung|bewertung|rezension|review/i),
];

/** Vorbelegung der Kanäle, wenn das Profil keine nennt. */
export const DEFAULT_KANAELE: KanalKey[] = ["website", "gbp", "instagram"];

export const kanalByKey = (key: KanalKey): Kanal => KANAELE.find((k) => k.key === key)!;
export const kanalLabel = (key: KanalKey): string => kanalByKey(key).label;
export const phaseLabel = (key: PhaseKey): string => PHASEN.find((p) => p.key === key)!.label;
export const zielLabel = (key: ZielKey): string => ZIELE.find((z) => z.key === key)!.label;

export function isPhaseKey(value: unknown): value is PhaseKey {
  return typeof value === "string" && (PHASE_KEYS as readonly string[]).includes(value);
}
export function isZielKey(value: unknown): value is ZielKey {
  return typeof value === "string" && (ZIEL_KEYS as readonly string[]).includes(value);
}

/** Bekannte Kanäle in fester Reihenfolge, ohne Doppel. */
export function normalizeKanaele(kanaele: readonly unknown[]): KanalKey[] {
  return KANAL_KEYS.filter((k) => kanaele.includes(k));
}

/** Kanäle aus dem Profil (Einträge mit «name» oder «kanal», Wortvergleich), in fester Reihenfolge; leer, wenn keiner passt. */
export function kanaeleAusProfil(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const namen = (profile.kanaele ?? [])
    .map((k) => {
      const r = (typeof k === "object" && k !== null ? k : {}) as Record<string, unknown>;
      return [r.name, r.kanal].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "";
    })
    .filter(Boolean);
  const found = new Set<KanalKey>();
  for (const name of namen) {
    // Google Ads vor dem Unternehmensprofil prüfen, damit «Google Ads» nicht als Profil zählt.
    const ads = kanalByKey("googleads");
    if (ads.re.test(name)) {
      found.add("googleads");
      continue;
    }
    for (const k of KANAELE) if (k.key !== "googleads" && k.re.test(name)) found.add(k.key);
  }
  return KANAL_KEYS.filter((k) => found.has(k));
}

/** Vorbelegung: die Kanäle aus dem Profil, sonst Website, Google-Unternehmensprofil und Instagram. */
export function kanaeleVorschlag(profile: Pick<Profile, "kanaele">): KanalKey[] {
  const aus = kanaeleAusProfil(profile);
  return aus.length > 0 ? aus : DEFAULT_KANAELE;
}

// ---- Daten: Rahmen und Vergleich ---------------------------------------------------------------

export type Spanne = { min: number; max: number };
export type BudgetData = {
  meta: { source: string; url: string | null; asOf: string; note?: string };
  /** Spannen in Prozent vom Umsatz je Phase; leer, wenn keine Quelle vorliegt. */
  phasen: Partial<Record<PhaseKey, Spanne>>;
  /** Vergleichswerte in Prozent vom Umsatz (Mittelwerte), nur als Text, nie als Vorbelegung. */
  vergleich?: { jahr?: number; gesamt?: number; unter50Mitarbeitende?: number; umsatzUnter10MioUsd?: number };
};

export const DATA: BudgetData = budgetData as BudgetData;

export type Rahmen = { min: number; max: number; source: string };

const pct = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100;

/** Spanne aus den Daten für eine Phase; null ohne Quelle oder bei unbrauchbaren Werten (min > max, ausserhalb 0 bis 100). */
export function rahmen(phase: PhaseKey, data: BudgetData = DATA): Rahmen | null {
  const s = data.phasen?.[phase];
  if (!s || !pct(s.min) || !pct(s.max) || s.min > s.max) return null;
  const source = typeof data.meta?.source === "string" ? data.meta.source.trim() : "";
  if (!source) return null;
  return { min: s.min, max: s.max, source };
}

/** Auf den Schritt des Anteils (0,5) gerundet und auf die Grenzen gebracht. */
export function clampAnteil(value: number): number {
  if (!Number.isFinite(value)) return START_ANTEIL;
  const step = LIMITS.anteil.step;
  const rounded = Math.round(value / step) * step;
  return Math.min(LIMITS.anteil.max, Math.max(LIMITS.anteil.min, rounded));
}

/**
 * Vorbelegung des Anteils: mit Spanne die Mitte des unteren Drittels (Halten), die Mitte (Leicht wachsen) oder die Mitte
 * des oberen Drittels (Stark wachsen); Richtwert von Alperna, keine Statistik. Ohne Spanne der Startwert 3 %.
 */
export function anteilVorschlag(phase: PhaseKey, ziel: ZielKey, data: BudgetData = DATA): number {
  const r = rahmen(phase, data);
  if (!r) return START_ANTEIL;
  const breite = r.max - r.min;
  const lage = ziel === "halten" ? 1 / 6 : ziel === "leicht" ? 1 / 2 : 5 / 6;
  return clampAnteil(r.min + breite * lage);
}

/** Satz mit den Vergleichswerten aus den Daten; leer, wenn die Daten keinen tragen. */
export function vergleichText(data: BudgetData = DATA): string {
  const v = data.vergleich;
  if (!v || !pct(v.gesamt)) return "";
  const teile = [`alle befragten Firmen ${pctCH(v.gesamt)}`];
  if (pct(v.unter50Mitarbeitende)) teile.push(`Firmen mit weniger als 50 Mitarbeitenden ${pctCH(v.unter50Mitarbeitende)}`);
  if (pct(v.umsatzUnter10MioUsd)) teile.push(`Firmen mit weniger als 10 Mio. US-Dollar Umsatz ${pctCH(v.umsatzUnter10MioUsd)}`);
  const jahr = typeof v.jahr === "number" ? ` ${v.jahr}` : "";
  return `Zum Vergleich, als Durchschnitt von US-Firmen und nicht als Empfehlung: ${teile.join(", ")} des Umsatzes für Marketing (Quelle: The CMO Survey${jahr}, 308 Antworten, überwiegend grosse Unternehmen).`;
}

// ---- Eingabe -----------------------------------------------------------------------------------

export const kanalKeySchema = z.enum(KANAL_KEYS);

export const budgetInputSchema = z.object({
  firma: z.string().max(200),
  organisationstyp: z.enum(["kmu", "verein"]),
  umsatz: z.number().finite().min(LIMITS.umsatz.min).max(LIMITS.umsatz.max),
  phase: z.enum(PHASE_KEYS),
  ziel: z.enum(ZIEL_KEYS),
  anteil: z.number().finite().min(LIMITS.anteil.min).max(LIMITS.anteil.max),
  kanaele: z.array(kanalKeySchema).min(1).max(KANAL_KEYS.length),
  stunden: z.number().finite().min(LIMITS.stunden.min).max(LIMITS.stunden.max),
  stundensatz: z.number().finite().min(LIMITS.stundensatz.min).max(LIMITS.stundensatz.max).nullable(),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

/** Was die Person im Formular tippt. `kanaele` null: noch nicht angefasst, dann gilt der Vorschlag aus dem Profil. `anteil` null: Vorschlag. */
export type FormFields = {
  umsatz: string;
  phase: PhaseKey | "";
  ziel: ZielKey | "";
  anteil: string | null;
  kanaele: KanalKey[] | null;
  stunden: string;
  stundensatz: string;
};

export const EMPTY_FORM: FormFields = { umsatz: "", phase: "", ziel: "", anteil: null, kanaele: null, stunden: "", stundensatz: "" };

/** Liest eine Zahl aus einem Feld: Apostrophe und Leerzeichen als Tausendertrenner, Komma als Dezimalzeichen. null, wenn leer oder keine Zahl. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/['’\s]/g, "").replace(",", ".").trim();
  if (s === "") return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return Number.NaN;
  return Number(s);
}

/** Der Anteil, der im Formular gilt: der getippte, sonst der Vorschlag aus Phase und Ziel. */
export function effectiveAnteil(form: Pick<FormFields, "anteil" | "phase" | "ziel">, data: BudgetData = DATA): number {
  if (form.anteil !== null) {
    const n = parseNumber(form.anteil);
    return n === null || Number.isNaN(n) ? Number.NaN : n;
  }
  return anteilVorschlag(isPhaseKey(form.phase) ? form.phase : "etabliert", isZielKey(form.ziel) ? form.ziel : "leicht", data);
}

/** Die Kanäle, die im Formular gelten: die gewählten, sonst der Vorschlag aus dem Profil. */
export function effectiveKanaele(form: Pick<FormFields, "kanaele">, profile: Pick<Profile, "kanaele">): KanalKey[] {
  return form.kanaele ?? kanaeleVorschlag(profile);
}

export type ProfileFields = Pick<Profile, "firma" | "organisationstyp" | "kanaele" | "budgetJahr">;

const umsatzLabel = (typ: "kmu" | "verein") => (typ === "verein" ? "Jahresbudget" : "Jahresumsatz");

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars. null: in Ordnung. */
export function formProblem(form: FormFields, profile: ProfileFields, data: BudgetData = DATA): string | null {
  const typ = profile.organisationstyp ?? "kmu";
  if (!(profile.firma ?? "").trim()) return typ === "verein" ? "Gib den Namen deines Vereins an." : "Gib den Namen deines Betriebs an.";
  const umsatz = parseNumber(form.umsatz);
  if (umsatz === null || Number.isNaN(umsatz)) return `Gib den ${umsatzLabel(typ)} in Franken an, ungefähr reicht.`;
  if (umsatz < LIMITS.umsatz.min || umsatz > LIMITS.umsatz.max) {
    return `Der ${umsatzLabel(typ)} muss zwischen ${chf(LIMITS.umsatz.min)} und ${chf(LIMITS.umsatz.max)} liegen.`;
  }
  if (!isPhaseKey(form.phase)) return "Wähle die Phase deines Betriebs.";
  if (!isZielKey(form.ziel)) return "Wähle das Ziel für dieses Jahr.";
  const anteil = effectiveAnteil(form, data);
  if (Number.isNaN(anteil) || anteil < LIMITS.anteil.min || anteil > LIMITS.anteil.max) {
    return `Der Anteil vom Umsatz muss zwischen ${pctCH(LIMITS.anteil.min)} und ${pctCH(LIMITS.anteil.max)} liegen.`;
  }
  if (normalizeKanaele(effectiveKanaele(form, profile)).length === 0) return "Wähle mindestens einen Kanal.";
  const stunden = form.stunden.trim() === "" ? 0 : parseNumber(form.stunden);
  if (stunden === null || Number.isNaN(stunden) || stunden < LIMITS.stunden.min || stunden > LIMITS.stunden.max) {
    return `Die Stunden pro Monat müssen zwischen ${LIMITS.stunden.min} und ${LIMITS.stunden.max} liegen.`;
  }
  if (form.stundensatz.trim() !== "") {
    const satz = parseNumber(form.stundensatz);
    if (satz === null || Number.isNaN(satz) || satz < LIMITS.stundensatz.min || satz > LIMITS.stundensatz.max) {
      return `Der interne Stundensatz muss zwischen ${chf(LIMITS.stundensatz.min)} und ${chf(LIMITS.stundensatz.max)} liegen.`;
    }
  }
  return null;
}

/** Eingabe der Rechnung aus Profil und Formular. null, wenn etwas fehlt (vorher formProblem). */
export function toInput(form: FormFields, profile: ProfileFields, data: BudgetData = DATA): BudgetInput | null {
  const umsatz = parseNumber(form.umsatz);
  const stunden = form.stunden.trim() === "" ? 0 : parseNumber(form.stunden);
  const satz = form.stundensatz.trim() === "" ? null : parseNumber(form.stundensatz);
  const candidate = {
    firma: (profile.firma ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    organisationstyp: profile.organisationstyp ?? "kmu",
    umsatz: umsatz === null ? Number.NaN : Math.round(umsatz),
    phase: form.phase,
    ziel: form.ziel,
    anteil: clampAnteil(effectiveAnteil(form, data)),
    kanaele: normalizeKanaele(effectiveKanaele(form, profile)),
    stunden: stunden === null ? Number.NaN : Math.round(stunden * 2) / 2,
    stundensatz: satz === null ? null : Math.round(satz),
  };
  if (Number.isNaN(candidate.umsatz) || Number.isNaN(candidate.stunden) || Number.isNaN(candidate.anteil)) return null;
  const parsed = budgetInputSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function formFromInput(input: BudgetInput): FormFields {
  return {
    umsatz: String(input.umsatz),
    phase: input.phase,
    ziel: input.ziel,
    anteil: String(input.anteil),
    kanaele: input.kanaele,
    stunden: input.stunden === 0 ? "" : String(input.stunden),
    stundensatz: input.stundensatz === null ? "" : String(input.stundensatz),
  };
}

// ---- Rechnung ----------------------------------------------------------------------------------

export type KanalBudget = {
  key: KanalKey;
  label: string;
  rolle: Rolle;
  gewicht: number;
  /** Anteil am Geldbudget in ganzen Prozent; alle zusammen 100. */
  anteil: number;
  /** Franken pro Jahr; alle Kanäle zusammen ergeben das Jahresbudget. */
  jahr: number;
  /** Franken pro Monat (Januar bis November), auf Franken gerundet. */
  monat: number;
  /** Die zwölf Monatsbeträge; der Dezember gleicht die Rundung aus. */
  monate: number[];
  fremd: number;
  werbe: number;
};

export type Eigenleistung = {
  stunden: number;
  satz: number | null;
  /** Franken pro Monat und Jahr; null ohne Stundensatz. */
  monat: number | null;
  jahr: number | null;
};

export type BudgetResult = {
  umsatz: number;
  anteil: number;
  /** Geldbudget pro Jahr und pro Monat (Januar bis November), auf Franken gerundet. */
  jahr: number;
  monat: number;
  /** Die zwölf Monatsbeträge aller Kanäle; der Dezember gleicht die Rundung aus. */
  monate: number[];
  kanaele: KanalBudget[];
  summe: { anteil: number; jahr: number; monat: number; fremd: number; werbe: number };
  eigenleistung: Eigenleistung;
  rahmen: Rahmen | null;
};

/** Verteilt `total` auf zwölf Monate: elf gleiche, auf Franken gerundete Beträge, der Dezember trägt den Rest. */
export function zwoelfMonate(total: number): number[] {
  const monat = Math.round(total / 12);
  return [...Array<number>(11).fill(monat), total - 11 * monat];
}

/** Ganze Prozent je gewähltem Kanal nach Gewicht, Summe 100; der Rundungsrest geht zum Kanal mit dem grössten Gewicht. */
export function anteile(keys: readonly KanalKey[]): { key: KanalKey; anteil: number }[] {
  const chosen = normalizeKanaele(keys).map(kanalByKey);
  if (chosen.length === 0) return [];
  const total = chosen.reduce((s, k) => s + k.gewicht, 0);
  const out = chosen.map((k) => ({ key: k.key, anteil: Math.round((k.gewicht * 100) / total) }));
  const diff = 100 - out.reduce((s, k) => s + k.anteil, 0);
  const biggest = chosen.reduce((best, k, i) => (k.gewicht > chosen[best].gewicht ? i : best), 0);
  out[biggest].anteil += diff;
  return out;
}

/** Die ganze Rechnung. Richtwert von Alperna, keine Statistik, ausser dem Rahmen aus den Daten. */
export function budget(input: BudgetInput, data: BudgetData = DATA): BudgetResult {
  const jahr = Math.round((input.umsatz * input.anteil) / 100);
  const monate = zwoelfMonate(jahr);
  const parts = anteile(input.kanaele);

  const kanaele: KanalBudget[] = parts.map(({ key, anteil }) => {
    const k = kanalByKey(key);
    return { key, label: k.label, rolle: k.rolle, gewicht: k.gewicht, anteil, jahr: Math.round((jahr * anteil) / 100), monat: 0, monate: [], fremd: 0, werbe: 0 };
  });
  // Rundungsrest der Jahresbeträge zum grössten Kanal, damit die Summe das Jahresbudget ist.
  const biggest = kanaele.reduce((best, k, i) => (k.gewicht > kanaele[best].gewicht ? i : best), 0);
  if (kanaele.length > 0) kanaele[biggest].jahr += jahr - kanaele.reduce((s, k) => s + k.jahr, 0);
  for (const k of kanaele) {
    k.monate = zwoelfMonate(k.jahr);
    k.monat = k.monate[0];
    k.werbe = Math.round(k.jahr * kanalByKey(k.key).werbeanteil);
    k.fremd = k.jahr - k.werbe;
  }

  const summe = {
    anteil: kanaele.reduce((s, k) => s + k.anteil, 0),
    jahr,
    monat: kanaele.reduce((s, k) => s + k.monat, 0),
    fremd: kanaele.reduce((s, k) => s + k.fremd, 0),
    werbe: kanaele.reduce((s, k) => s + k.werbe, 0),
  };
  const satz = input.stundensatz;
  const eigenMonat = satz === null ? null : Math.round(input.stunden * satz);
  const eigenleistung: Eigenleistung = { stunden: input.stunden, satz, monat: eigenMonat, jahr: eigenMonat === null ? null : eigenMonat * 12 };

  return { umsatz: input.umsatz, anteil: input.anteil, jahr, monat: monate[0], monate, kanaele, summe, eigenleistung, rahmen: rahmen(input.phase, data) };
}

export type MonatZeile = { monat: string; betrag: number; kumuliert: number };

/** Zwölf Zeilen mit deutschem Monatsnamen, Betrag aller Kanäle und laufender Summe. */
export function monatsplan(result: Pick<BudgetResult, "kanaele" | "monate">): MonatZeile[] {
  let kumuliert = 0;
  return MONATE.map((monat, i) => {
    const betrag = result.kanaele.length > 0 ? result.kanaele.reduce((s, k) => s + (k.monate[i] ?? 0), 0) : (result.monate[i] ?? 0);
    kumuliert += betrag;
    return { monat, betrag, kumuliert };
  });
}

// ---- Texte und Dokument ------------------------------------------------------------------------

const stundenText = (n: number) => `${numberCH(n)} ${n === 1 ? "Stunde" : "Stunden"}`;

/** Absatz zur Eigenleistung. */
export function eigenleistungText(e: Eigenleistung): string {
  if (e.stunden === 0) return "Keine Eigenleistung angegeben. Zähl die Stunden, die ihr selbst für Marketing einsetzt, beim nächsten Mal mit; sie sind meist der grösste Posten.";
  if (e.satz === null || e.monat === null || e.jahr === null) {
    return `${stundenText(e.stunden)} pro Monat, das sind ${stundenText(e.stunden * 12)} im Jahr. Ohne internen Stundensatz bleibt der Betrag offen; mit Stundensatz siehst du, was die eigene Zeit kostet.`;
  }
  return `${stundenText(e.stunden)} pro Monat zu ${chf(e.satz)}: ${chf(e.monat)} pro Monat, ${chf(e.jahr)} im Jahr. Dieser Betrag ist Information, nicht Teil des Geldbudgets.`;
}

/** Absatz zum Rahmen: Spanne aus den Daten mit Quelle oder «ohne Richtwert, eigener Anteil», dazu der Vergleich. */
export function rahmenText(result: Pick<BudgetResult, "rahmen" | "anteil" | "umsatz" | "jahr">, phase: PhaseKey, data: BudgetData = DATA): string {
  const anteil = `Dein Anteil: ${pctCH(result.anteil)} von ${chf(result.umsatz)}, also ${chf(result.jahr)} im Jahr.`;
  const r = result.rahmen;
  const erster = r
    ? `Für die Phase «${phaseLabel(phase)}» liegt die Spanne bei ${pctCH(r.min)} bis ${pctCH(r.max)} vom Umsatz (Quelle: ${r.source}).`
    : "Ohne Richtwert, eigener Anteil: Für Schweizer KMU gibt es keine belastbare Zahl, welcher Anteil vom Umsatz üblich ist. Darum rechnet dieses Werkzeug mit deiner Angabe.";
  return [erster, anteil, vergleichText(data)].filter(Boolean).join(" ");
}

export const HINWEISE: string[] = [
  "Fundament zuerst: Website und Google-Unternehmensprofil bringen Anfragen, wenn jemand nach dir sucht; kürze dort zuletzt.",
  "Anteil jedes Quartal prüfen: Vergleich den Plan mit den Rechnungen und mit den Anfragen, die gekommen sind, und passe den Anteil an.",
  "Eigenleistung ehrlich zählen: Die Stunden des Teams sind meist der grösste Posten; wer sie kennt, entscheidet besser, was er abgibt.",
];

const kanalLine = (k: KanalBudget) => [k.label, pctCH(k.anteil, 0), chf(k.monat), chf(k.jahr), chf(k.fremd), chf(k.werbe)];

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(result: BudgetResult, input: BudgetInput, data: BudgetData = DATA): DocumentModel {
  const verein = input.organisationstyp === "verein";
  const firma = input.firma || "keine Angabe";
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: verein ? "Verein" : "Betrieb", value: firma },
        { label: verein ? "Jahresbudget des Vereins" : "Jahresumsatz (ungefähr)", value: chf(result.umsatz) },
        { label: "Phase", value: phaseLabel(input.phase) },
        { label: "Ziel für dieses Jahr", value: zielLabel(input.ziel) },
        { label: "Anteil vom Umsatz", value: pctCH(result.anteil) },
        { label: "Geldbudget pro Jahr", value: chf(result.jahr) },
        { label: "Geldbudget pro Monat", value: chf(result.monat) },
      ],
    },
    { type: "heading", level: 1, text: "Rahmen" },
    { type: "paragraph", text: rahmenText(result, input.phase, data) },
    { type: "heading", level: 1, text: "Aufteilung auf Kanäle" },
    {
      type: "paragraph",
      text: `${RICHTWERT_NOTE}: Jeder Kanal hat eine Rolle mit Gewicht. Fundament (Website, Google-Unternehmensprofil) wiegt 3, Reichweite (Instagram, Facebook, LinkedIn, Print, Google Ads) 2, Anlass (Anlässe und Sponsoring) 2, Pflege (Newsletter, Empfehlungen) 1. Das Geldbudget verteilt sich nach diesen Gewichten auf die gewählten Kanäle. Fremdkosten sind Dienstleister und Werkzeuge, Werbebudget ist bezahlte Reichweite: Google Ads und Print ganz, Instagram, Facebook und LinkedIn je zur Hälfte, alle anderen Kanäle ganz Fremdkosten.`,
    },
    {
      type: "table",
      header: ["Kanal", "Anteil", "pro Monat", "pro Jahr", "Fremdkosten", "Werbebudget"],
      rows: [...result.kanaele.map(kanalLine), ["Summe", pctCH(result.summe.anteil, 0), chf(result.summe.monat), chf(result.summe.jahr), chf(result.summe.fremd), chf(result.summe.werbe)]],
      widths: [3, 1, 1.5, 1.5, 1.5, 1.5],
    },
    { type: "heading", level: 1, text: "Eigenleistung" },
    { type: "paragraph", text: eigenleistungText(result.eigenleistung) },
    { type: "heading", level: 1, text: "Monatsübersicht" },
    {
      type: "table",
      header: ["Monat", "Geldbudget", "Kumuliert"],
      rows: monatsplan(result).map((z) => [z.monat, chf(z.betrag), chf(z.kumuliert)]),
      widths: [2, 1.5, 1.5],
    },
    { type: "paragraph", text: "Elf gleiche Monatsbeträge, auf Franken gerundet; der Dezember gleicht die Rundung aus, damit die Summe das Jahresbudget ist. Saisonale Schwankungen sind nicht eingerechnet." },
    { type: "heading", level: 1, text: "Drei Hinweise" },
    { type: "list", ordered: true, items: HINWEISE },
  ];
  return {
    title: "Marketing-Budget für zwölf Monate",
    subtitle: `${chf(result.jahr)} im Jahr, ${pctCH(result.anteil)} vom ${verein ? "Jahresbudget" : "Umsatz"}`,
    firma: input.firma || undefined,
    filename: `marketing-budget-${safeFilename(input.firma, "betrieb")}`,
    blocks,
  };
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(result: BudgetResult, input: BudgetInput, data: BudgetData = DATA): string {
  return toMarkdown(toDocument(result, input, data));
}

/** Die Angaben fürs CRM, eine je Zeile; der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: BudgetInput): string {
  const verein = input.organisationstyp === "verein";
  const eigen =
    input.stunden === 0
      ? "keine Angabe"
      : `${stundenText(input.stunden)} pro Monat${input.stundensatz === null ? ", ohne Stundensatz" : `, Stundensatz ${chf(input.stundensatz)}`}`;
  return [
    `${verein ? "Verein" : "Betrieb"}: ${input.firma || "keine Angabe"}`,
    `${verein ? "Jahresbudget" : "Jahresumsatz"}: ${chf(input.umsatz)}`,
    `Phase: ${phaseLabel(input.phase)}`,
    `Ziel: ${zielLabel(input.ziel)}`,
    `Anteil vom Umsatz: ${pctCH(input.anteil)}`,
    `Kanäle: ${input.kanaele.map(kanalLabel).join(", ")}`,
    `Eigenleistung: ${eigen}`,
  ].join("\n");
}

// ---- CSV ---------------------------------------------------------------------------------------

export const CSV_BOM = "﻿";
export const CSV_HEADER = ["Kanal", "Rolle", "Monat", "Betrag CHF", "Fremdkosten CHF", "Werbebudget CHF"];

const csvCell = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * CSV mit Semikolon, UTF-8 mit BOM, Zeilenende CRLF, Zahlen ohne Tausendertrennzeichen und mit Dezimalpunkt (hier ganze
 * Franken). Eine Zeile je Kanal und Monat, danach eine Summenzeile je Monat.
 */
export function toCsv(result: Pick<BudgetResult, "kanaele">): string {
  const rows: string[][] = [CSV_HEADER];
  const summen = MONATE.map(() => ({ betrag: 0, fremd: 0, werbe: 0 }));
  for (const k of result.kanaele) {
    const werbeanteil = kanalByKey(k.key).werbeanteil;
    k.monate.forEach((betrag, i) => {
      const werbe = Math.round(betrag * werbeanteil);
      const fremd = betrag - werbe;
      summen[i].betrag += betrag;
      summen[i].fremd += fremd;
      summen[i].werbe += werbe;
      rows.push([k.label, ROLLEN[k.rolle].label, MONATE[i], String(betrag), String(fremd), String(werbe)]);
    });
  }
  summen.forEach((s, i) => rows.push(["Summe", "", MONATE[i], String(s.betrag), String(s.fremd), String(s.werbe)]));
  return CSV_BOM + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function csvFilename(input: Pick<BudgetInput, "firma">): string {
  return `marketing-budget-${safeFilename(input.firma, "betrieb")}.csv`;
}

// ---- Profil ------------------------------------------------------------------------------------

export type ProfilePatch = Partial<Record<ProfileKey, unknown>>;

/** Schreibt das Geldbudget pro Jahr ins Profil, aber nur, wenn dort nichts steht (Harte Regel 10; writesProfile). */
export function profilePatch(profile: Pick<Profile, "budgetJahr">, result: Pick<BudgetResult, "jahr">): ProfilePatch {
  if (typeof profile.budgetJahr === "number" && Number.isFinite(profile.budgetJahr)) return {};
  return { budgetJahr: Math.round(result.jahr) };
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type BudgetState = { v: 1; input: BudgetInput | null; output: BudgetResult | null };

export const EMPTY_STATE: BudgetState = { v: 1, input: null, output: null };

/**
 * Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Das Ergebnis wird aus der Eingabe neu gerechnet
 * (deterministisch), damit veränderte Zahlen im Speicher nie die Anzeige stören; ohne gültige Eingabe gibt es kein Ergebnis.
 */
export function parseState(raw: unknown, data: BudgetData = DATA): BudgetState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Partial<BudgetState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = budgetInputSchema.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const hasOutput = typeof r.output === "object" && r.output !== null && !Array.isArray(r.output);
  return { v: 1, input: input.data, output: hasOutput ? budget(input.data, data) : null };
}
