import { chf, pctCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import {
  DEFAULT_KANAELE,
  KANAELE,
  KANAL_KEYS,
  diffDays,
  icsEscape,
  isKanal,
  kanaeleAusProfil,
  kanaeleText,
  kanaeleVorschlag,
  kanalLabel,
  normalizeKanaele,
  organisationOf,
  todayIso,
  werkzeugHref,
  type KanalKey,
  type Organisation,
} from "@/tools/anlass-planer/logic";
import { parseState as parseBotschaften } from "@/tools/botschaften/logic";
import { addDays, foldLine, formatIso, isIsoDate } from "@/tools/feiertagskalender/logic";
import { kpiDef, type KpiKey } from "@/tools/kpi-baum/logic";
import { MUSTER, PHASEN, PHASE_KEYS, phaseInfo, type Muster, type MusterKanal, type PhaseKey } from "./data";

// Kampagnen-Planer: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Aus Ziel, Zielgruppe, Kernbotschaft, Kanälen, Zeitraum und Budget entsteht ein Plan in vier Phasen: Wochenplan mit Massnahmen
// je Kanal, Budget je Woche und Kennzahlen-Vorschläge. Daraus werden Bildschirm, Kampagnenbrief (PDF, Word, Text) und eine
// Kalenderdatei (.ics) gebaut. Datum immer als JJJJ-MM-TT, gerechnet mit UTC-Teilen (Funktionen des Feiertagskalenders); das
// heutige Datum kommt als Parameter. Phasen, Massnahmen und Budgetverteilung sind ein Richtwert von Alperna, keine Statistik.
// Spec: specs/kampagnen-planer.md

export { DEFAULT_KANAELE, KANAELE, KANAL_KEYS, isKanal, kanaeleAusProfil, kanaeleText, kanaeleVorschlag, kanalLabel, normalizeKanaele, organisationOf, todayIso, werkzeugHref };
export { PHASEN, PHASE_KEYS, phaseInfo };
export type { KanalKey, Organisation, PhaseKey };

export const SLUG = "kampagnen-planer";
export const ZIELGRUPPE_MIN = 3;
export const ZIELGRUPPE_MAX = 160;
export const BOTSCHAFT_MIN = 10;
export const BOTSCHAFT_MAX = 200;
export const ANGEBOT_MAX = 160;
export const BUDGET_MAX = 1_000_000;
export const WOCHEN_MIN = 2;
export const WOCHEN_MAX = 16;
/** Der Stand «Kernbotschaften» im Browser (tools/botschaften). */
export const BOTSCHAFTEN_KEY = "mt:botschaften";
export const ICS_PRODID = "-//Alperna//Kampagnen-Planer//DE";

export const RICHTWERT_HINWEIS =
  "Phasen, Massnahmen und Budgetverteilung sind ein Richtwert von Alperna, keine Statistik und keine Vorschrift. Passe den Plan an deinen Betrieb an.";
export const KPI_HINWEIS = "Zielwerte setzt du im Ziel- und KPI-Baum.";
export const MATERIAL_HINWEIS = "Für die Vorbereitung plant der Richtwert kein Budget ein. Kosten für Material, zum Beispiel für den Druck, zählst du selbst dazu.";
export const HINWEISE: readonly string[] = [
  "Wähle lieber wenige Kanäle und bespiele sie regelmässig, als überall ein wenig zu veröffentlichen.",
  "Lass das Nachfassen nicht aus: Anfragen beantworten, danken und Bewertungen anfragen gehören zur Kampagne.",
  "Werte das Ergebnis nach dem Ende aus: Vergleiche die Kennzahlen mit deinem Ziel und halte fest, was du beim nächsten Mal änderst.",
];

// ---- Ziele --------------------------------------------------------------------------------------

export const ZIEL_KEYS = ["anfragen", "anmeldungen", "kundschaft", "bekanntheit", "angebot"] as const;
export type ZielKey = (typeof ZIEL_KEYS)[number];

export type Ziel = { key: ZielKey; label: string };

export const ZIELE: readonly Ziel[] = [
  { key: "anfragen", label: "Anfragen gewinnen" },
  { key: "anmeldungen", label: "Anmeldungen zu einem Anlass" },
  { key: "kundschaft", label: "Neue Kundschaft oder Mitglieder gewinnen" },
  { key: "bekanntheit", label: "Bekannter werden in der Region" },
  { key: "angebot", label: "Ein Angebot bewerben" },
];

export const isZiel = (v: unknown): v is ZielKey => typeof v === "string" && (ZIEL_KEYS as readonly string[]).includes(v);
export const zielLabel = (key: ZielKey): string => ZIELE.find((z) => z.key === key)?.label ?? key;

// ---- Kennzahlen-Vorschläge ----------------------------------------------------------------------

export type Kennzahl = { key: KpiKey; label: string };

const KPI_NACH_ZIEL: Record<ZielKey, Record<Organisation, KpiKey[]>> = {
  anfragen: { kmu: ["anfragen", "besuche", "profilaufrufe"], verein: ["anfragen", "besuche", "profilaufrufe"] },
  anmeldungen: { kmu: ["termine"], verein: ["anmeldungen"] },
  kundschaft: { kmu: ["neukunden", "offerten"], verein: ["neumitglieder", "anfragen"] },
  bekanntheit: { kmu: ["profilaufrufe", "besuche"], verein: ["profilaufrufe", "besuche"] },
  angebot: { kmu: ["anfragen", "termine"], verein: ["anfragen", "termine"] },
};

/** Kennzahlen, die zum Ziel passen, mit den Bezeichnungen des Ziel- und KPI-Baums. Ohne Zielwerte. */
export function kpiVorschlaege(ziel: ZielKey, organisation: Organisation = "kmu"): Kennzahl[] {
  const keys = isZiel(ziel) ? KPI_NACH_ZIEL[ziel][organisation === "verein" ? "verein" : "kmu"] : [];
  return keys.flatMap((key) => {
    const def = kpiDef(key);
    return def ? [{ key, label: def.label }] : [];
  });
}

// ---- Eingabe und Prüfung ------------------------------------------------------------------------

export type PlanInput = {
  ziel: ZielKey;
  zielgruppe: string;
  botschaft: string;
  /** Leer, wenn keines angegeben ist. */
  angebot: string;
  kanaele: KanalKey[];
  /** JJJJ-MM-TT */
  start: string;
  /** JJJJ-MM-TT, der Tag zählt mit. */
  ende: string;
  /** Ganze Franken; 0: kein Budget. */
  budget: number;
  organisation: Organisation;
};

/** Eingabe, wie sie aus Formular oder Speicher kommt: noch nicht geprüft. */
export type RawInput = {
  ziel?: unknown;
  zielgruppe?: unknown;
  botschaft?: unknown;
  angebot?: unknown;
  kanaele?: unknown;
  start?: unknown;
  ende?: unknown;
  budget?: unknown;
  organisation?: unknown;
};

export type Problem = { feld: "ziel" | "zielgruppe" | "botschaft" | "angebot" | "kanaele" | "start" | "ende" | "budget"; text: string };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Wochen von Start bis Ende, aufgerundet. Das Ende zählt mit: 12.10. bis 06.12.2026 sind 56 Tage, also 8 Wochen;
 * mit 07.12.2026 sind es 57 Tage, also 9 Wochen. Liegt das Ende vor dem Start oder fehlt ein Datum, ist das Ergebnis 0.
 */
export function weeksBetween(start: string, ende: string): number {
  if (!isIsoDate(start) || !isIsoDate(ende)) return 0;
  const tage = diffDays(start, ende) + 1;
  return tage < 1 ? 0 : Math.ceil(tage / 7);
}

/** Budget aus einem Feld: leer ist 0 (kein Budget), ganze Franken von 0 bis 1'000'000; sonst null. Apostroph und Leerzeichen sind erlaubt. */
export function parseBudget(raw: unknown): number | null {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === "number") return Number.isInteger(raw) && raw >= 0 && raw <= BUDGET_MAX ? raw : null;
  if (typeof raw !== "string") return null;
  const t = raw.replace(/['’\s]/g, "");
  if (t === "") return 0;
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n <= BUDGET_MAX ? n : null;
}

/** Alle Probleme der Eingabe; leer, wenn sie stimmt. `heute` als JJJJ-MM-TT: der Start darf heute sein, nicht davor. */
export function validate(input: RawInput, heute: string): Problem[] {
  const out: Problem[] = [];
  if (!isZiel(input.ziel)) out.push({ feld: "ziel", text: "Wähle, was die Kampagne bringen soll." });

  const gruppe = str(input.zielgruppe).length;
  if (gruppe < ZIELGRUPPE_MIN) out.push({ feld: "zielgruppe", text: "Schreib auf, für wen die Kampagne ist." });
  else if (gruppe > ZIELGRUPPE_MAX) out.push({ feld: "zielgruppe", text: `Die Zielgruppe darf höchstens ${ZIELGRUPPE_MAX} Zeichen lang sein.` });

  const botschaft = str(input.botschaft).length;
  if (botschaft < BOTSCHAFT_MIN) out.push({ feld: "botschaft", text: `Schreib die Kernbotschaft in einem Satz mit mindestens ${BOTSCHAFT_MIN} Zeichen.` });
  else if (botschaft > BOTSCHAFT_MAX) out.push({ feld: "botschaft", text: `Die Kernbotschaft darf höchstens ${BOTSCHAFT_MAX} Zeichen lang sein.` });

  if (str(input.angebot).length > ANGEBOT_MAX) out.push({ feld: "angebot", text: `Angebot oder Anreiz: höchstens ${ANGEBOT_MAX} Zeichen.` });

  const kanaele = Array.isArray(input.kanaele) ? input.kanaele : [];
  if (normalizeKanaele(kanaele).length === 0) out.push({ feld: "kanaele", text: "Wähle mindestens einen Kanal." });

  const start = input.start;
  const ende = input.ende;
  const startOk = isIsoDate(start);
  const endeOk = isIsoDate(ende);
  if (!startOk) out.push({ feld: "start", text: "Wähle das Startdatum." });
  else if (start < heute) out.push({ feld: "start", text: "Der Start liegt in der Vergangenheit. Wähle ein Datum ab heute." });
  if (!endeOk) out.push({ feld: "ende", text: "Wähle das Enddatum." });
  else if (startOk) {
    const wochen = weeksBetween(start, ende);
    if (ende < start) out.push({ feld: "ende", text: "Das Ende liegt vor dem Start." });
    else if (wochen < WOCHEN_MIN) out.push({ feld: "ende", text: `Die Kampagne dauert weniger als ${WOCHEN_MIN} Wochen. Plane mindestens ${WOCHEN_MIN} Wochen ein.` });
    else if (wochen > WOCHEN_MAX) out.push({ feld: "ende", text: `Die Kampagne dauert mehr als ${WOCHEN_MAX} Wochen. Teile sie in zwei Kampagnen auf.` });
  }

  if (parseBudget(input.budget) === null) out.push({ feld: "budget", text: "Gib das Budget in ganzen Franken an, von 0 bis 1'000'000, oder lass das Feld leer." });
  return out;
}

/** Liest eine Eingabe aus Formular oder Speicher. Null, wenn etwas fehlt oder nicht stimmt. Ein vergangener Start ist hier erlaubt. */
export function sanitizeInput(raw: unknown): PlanInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as RawInput;
  if (!isZiel(r.ziel)) return null;
  const zielgruppe = str(r.zielgruppe);
  if (zielgruppe.length < ZIELGRUPPE_MIN || zielgruppe.length > ZIELGRUPPE_MAX) return null;
  const botschaft = str(r.botschaft);
  if (botschaft.length < BOTSCHAFT_MIN || botschaft.length > BOTSCHAFT_MAX) return null;
  const angebot = str(r.angebot);
  if (angebot.length > ANGEBOT_MAX) return null;
  const kanaele = normalizeKanaele(Array.isArray(r.kanaele) ? r.kanaele : []);
  if (kanaele.length === 0) return null;
  if (!isIsoDate(r.start) || !isIsoDate(r.ende)) return null;
  const wochen = weeksBetween(r.start, r.ende);
  if (wochen < WOCHEN_MIN || wochen > WOCHEN_MAX) return null;
  const budget = parseBudget(r.budget);
  if (budget === null) return null;
  return { ziel: r.ziel, zielgruppe, botschaft, angebot, kanaele, start: r.start, ende: r.ende, budget, organisation: r.organisation === "verein" ? "verein" : "kmu" };
}

/**
 * Was die Person im Formular angibt. Null bei Zielgruppe, Kernbotschaft, Ziel und Kanälen heisst: noch nicht angefasst, es gilt die
 * Vorbelegung (Profil, «Kernbotschaften» oder die erste Option). Budget bleibt ein Text, damit eine Fehleingabe sichtbar bleibt.
 */
export type FormFields = {
  ziel: ZielKey | null;
  zielgruppe: string | null;
  botschaft: string | null;
  angebot: string;
  kanaele: KanalKey[] | null;
  start: string;
  ende: string;
  budget: string;
};

export const EMPTY_FORM: FormFields = { ziel: null, zielgruppe: null, botschaft: null, angebot: "", kanaele: null, start: "", ende: "", budget: "" };

export function formFrom(input: PlanInput | null): FormFields {
  if (!input) return { ...EMPTY_FORM };
  return {
    ziel: input.ziel,
    zielgruppe: input.zielgruppe,
    botschaft: input.botschaft,
    angebot: input.angebot,
    kanaele: [...input.kanaele],
    start: input.start,
    ende: input.ende,
    budget: input.budget > 0 ? String(input.budget) : "",
  };
}

/** Die Zielgruppe, die gilt: die Eingabe, sonst das Primärsegment aus dem Profil, sonst leer. */
export const zielgruppeVorschlag = (profile: Pick<Profile, "primaersegment">): string => profile.primaersegment?.trim() ?? "";

/**
 * Die Hauptbotschaft aus dem gespeicherten Stand von «Kernbotschaften» (Inhalt von `mt:botschaften`, schon als JSON gelesen).
 * Leer, wenn der Stand fehlt, die Form nicht passt oder der Satz nicht in die Grenzen des Feldes passt: Es wird nichts angenommen.
 */
export function botschaftVorschlag(raw: unknown): string {
  const text = parseBotschaften(raw).output?.hauptbotschaft?.trim() ?? "";
  return text.length >= BOTSCHAFT_MIN && text.length <= BOTSCHAFT_MAX ? text : "";
}

/** Formular und Profil → Eingabe für `validate` und `sanitizeInput`. Ohne Wahl gilt die erste Option, bei den Kanälen die Vorbelegung. */
export function formToRaw(form: FormFields, profile: Pick<Profile, "organisationstyp" | "kanaele" | "primaersegment">, botschaft: string): RawInput {
  return {
    ziel: form.ziel ?? ZIELE[0].key,
    zielgruppe: form.zielgruppe ?? zielgruppeVorschlag(profile),
    botschaft: form.botschaft ?? botschaft,
    angebot: form.angebot,
    kanaele: normalizeKanaele(form.kanaele ?? kanaeleVorschlag(profile)),
    start: form.start,
    ende: form.ende,
    budget: form.budget,
    organisation: organisationOf(profile),
  };
}

// ---- Phasen -------------------------------------------------------------------------------------

export type PhaseRow = {
  key: PhaseKey;
  label: string;
  wochen: number;
  /** Erste Woche der Phase (Nummer ab 1). */
  ersteWoche: number;
  /** Letzte Woche der Phase. */
  letzteWoche: number;
};

const runde = (wochen: number, prozent: number): number => Math.max(1, Math.round((wochen * prozent) / 100));

/** Wochen je Phase (Richtwert von Alperna): bei 4 und mehr Wochen 15 % Vorbereitung, 20 % Anlauf, 15 % Nachfassen, der Rest Hauptphase. */
export function phaseWochen(weeks: number): Record<PhaseKey, number> {
  const w = Number.isFinite(weeks) ? Math.floor(weeks) : 0;
  if (w < 1) return { vorbereitung: 0, anlauf: 0, haupt: 0, nachfassen: 0 };
  if (w === 1) return { vorbereitung: 0, anlauf: 0, haupt: 1, nachfassen: 0 };
  if (w === 2) return { vorbereitung: 1, anlauf: 0, haupt: 1, nachfassen: 0 };
  if (w === 3) return { vorbereitung: 1, anlauf: 0, haupt: 1, nachfassen: 1 };
  const vorbereitung = runde(w, 15);
  const nachfassen = runde(w, 15);
  const anlauf = runde(w, 20);
  return { vorbereitung, anlauf, haupt: Math.max(1, w - vorbereitung - nachfassen - anlauf), nachfassen };
}

/** Die Phasen in Reihenfolge, nur die mit mindestens einer Woche; die Summe der Wochen ist `weeks`. */
export function phasePlan(weeks: number): PhaseRow[] {
  const n = phaseWochen(weeks);
  const out: PhaseRow[] = [];
  let next = 1;
  for (const info of PHASEN) {
    const wochen = n[info.key];
    if (wochen < 1) continue;
    out.push({ key: info.key, label: info.label, wochen, ersteWoche: next, letzteWoche: next + wochen - 1 });
    next += wochen;
  }
  return out;
}

// ---- Budget -------------------------------------------------------------------------------------

export type BudgetPlan = {
  total: number;
  /** Betrag je Woche, Index 0 ist Woche 1. */
  proWoche: number[];
  proPhase: Record<PhaseKey, number>;
  /** Anteil je Phase in Prozent nach dem Zuschlag fehlender Phasen an die Hauptphase. */
  anteile: Record<PhaseKey, number>;
};

/** Anteile in Prozent je Phase. Phasen, die es nicht gibt, schlägt der Richtwert der Hauptphase zu. */
export function budgetAnteile(phasen: readonly PhaseRow[]): Record<PhaseKey, number> {
  const out: Record<PhaseKey, number> = { vorbereitung: 0, anlauf: 0, haupt: 0, nachfassen: 0 };
  for (const info of PHASEN) {
    const vorhanden = phasen.some((p) => p.key === info.key);
    out[vorhanden ? info.key : "haupt"] += info.anteil;
  }
  return out;
}

/**
 * Verteilt das Budget auf die Wochen: je Phase gleich auf ihre Wochen, abgerundet auf ganze Franken; der Rundungsrest kommt in die letzte
 * Woche der Hauptphase. Die Summe ist exakt das Budget. Ohne Budget (0, negativ, keine ganze Zahl) oder ohne Hauptphase: null.
 */
export function budgetPlan(budget: number, phasen: readonly PhaseRow[]): BudgetPlan | null {
  if (!Number.isInteger(budget) || budget <= 0) return null;
  const haupt = phasen.find((p) => p.key === "haupt");
  if (!haupt) return null;
  const anteile = budgetAnteile(phasen);
  const wochen = phasen.reduce((max, p) => Math.max(max, p.letzteWoche), 0);
  const proWoche = Array.from({ length: wochen }, () => 0);
  for (const p of phasen) {
    const base = Math.floor((budget * anteile[p.key]) / (100 * p.wochen));
    for (let nr = p.ersteWoche; nr <= p.letzteWoche; nr++) proWoche[nr - 1] = base;
  }
  proWoche[haupt.letzteWoche - 1] += budget - proWoche.reduce((sum, x) => sum + x, 0);
  const proPhase: Record<PhaseKey, number> = { vorbereitung: 0, anlauf: 0, haupt: 0, nachfassen: 0 };
  for (const p of phasen) for (let nr = p.ersteWoche; nr <= p.letzteWoche; nr++) proPhase[p.key] += proWoche[nr - 1];
  return { total: budget, proWoche, proPhase, anteile };
}

// ---- Massnahmen ---------------------------------------------------------------------------------

export type Massnahme = {
  /** Eindeutig je Woche: ID des Musters. */
  id: string;
  titel: string;
  hinweis?: string;
  kanal: MusterKanal;
  werkzeug?: string;
};

export const kanalName = (kanal: MusterKanal): string => (kanal === "intern" ? "Intern" : kanalLabel(kanal));

/** Nummer der Woche in der Phase (ab 1), in der ein Muster steht; null bei «jede». */
function wocheInPhase(position: Exclude<Muster["position"], "jede">, wochen: number): number {
  if (position === "erste") return 1;
  if (position === "letzte") return wochen;
  return Math.ceil(wochen / 2);
}

const KANAL_RANG = new Map<MusterKanal, number>([["intern", -1], ...KANAL_KEYS.map((k, i): [MusterKanal, number] => [k, i])]);

/**
 * Massnahmen je Woche (Index 0 ist Woche 1). Muster mit Kanal gelten nur für gewählte Kanäle, interne immer. In der Woche stehen
 * zuerst die internen, dann die Kanäle in der festen Reihenfolge der Auswahl.
 */
export function measures(input: Pick<PlanInput, "kanaele">, phasen: readonly PhaseRow[]): Massnahme[][] {
  const gewaehlt = new Set<MusterKanal>(["intern", ...normalizeKanaele(input.kanaele)]);
  const wochen = phasen.reduce((max, p) => Math.max(max, p.letzteWoche), 0);
  const out: Massnahme[][] = Array.from({ length: wochen }, () => []);
  for (const p of phasen) {
    for (const mu of MUSTER) {
      if (mu.phase !== p.key || !gewaehlt.has(mu.kanal)) continue;
      const nrs = mu.position === "jede" ? Array.from({ length: p.wochen }, (_, i) => p.ersteWoche + i) : [p.ersteWoche + wocheInPhase(mu.position, p.wochen) - 1];
      for (const nr of nrs) {
        out[nr - 1].push({ id: mu.id, titel: mu.titel, ...(mu.hinweis ? { hinweis: mu.hinweis } : {}), kanal: mu.kanal, ...(mu.werkzeug ? { werkzeug: mu.werkzeug } : {}) });
      }
    }
  }
  for (const liste of out) liste.sort((a, b) => (KANAL_RANG.get(a.kanal) ?? 99) - (KANAL_RANG.get(b.kanal) ?? 99));
  return out;
}

// ---- Plan ---------------------------------------------------------------------------------------

export type WochenStatus = "vorbei" | "laeuft" | "folgt";

export type WochenZeile = {
  /** Nummer ab 1 */
  nr: number;
  phase: PhaseKey;
  phaseLabel: string;
  von: string;
  bis: string;
  massnahmen: Massnahme[];
  /** null: kein Budget angegeben. */
  budget: number | null;
  status: WochenStatus;
};

export type PhaseZeile = PhaseRow & { von: string; bis: string; budget: number | null };

export type MeilensteinKey = PhaseKey | "ende" | "auswertung";

export type Meilenstein = { key: MeilensteinKey; datum: string; titel: string; beschreibung: string };

export type Plan = {
  wochen: number;
  tage: number;
  phasen: PhaseZeile[];
  zeilen: WochenZeile[];
  budget: BudgetPlan | null;
  kennzahlen: Kennzahl[];
  meilensteine: Meilenstein[];
};

/** Von und bis des Wochenblocks `nr` (ab 1); der letzte Block endet am Ende. */
export function weekRange(start: string, ende: string, nr: number): { von: string; bis: string } {
  const von = addDays(start, 7 * (nr - 1));
  const bis = addDays(von, 6);
  return { von, bis: bis > ende ? ende : bis };
}

const statusVon = (von: string, bis: string, heute: string): WochenStatus => (heute < von ? "folgt" : heute > bis ? "vorbei" : "laeuft");

const MEILENSTEIN_TITEL: Record<PhaseKey, string> = {
  vorbereitung: "Start der Vorbereitung",
  anlauf: "Start des Anlaufs",
  haupt: "Start der Hauptphase",
  nachfassen: "Start des Nachfassens",
};

/** Name der Kampagne in Brief und Kalender: das Angebot, sonst die Bezeichnung des Ziels. */
export const kampagnenName = (input: Pick<PlanInput, "angebot" | "ziel">): string => input.angebot.trim() || zielLabel(input.ziel);

/** Der Plan. `heute` (JJJJ-MM-TT) bestimmt nur den Status der Wochen; der Plan wird nie verschoben. */
export function buildPlan(input: PlanInput, heute: string): Plan {
  const wochen = weeksBetween(input.start, input.ende);
  const phasen = phasePlan(wochen);
  const budget = budgetPlan(input.budget, phasen);
  const massnahmen = measures(input, phasen);
  const zeilen: WochenZeile[] = [];
  for (const p of phasen) {
    for (let nr = p.ersteWoche; nr <= p.letzteWoche; nr++) {
      const { von, bis } = weekRange(input.start, input.ende, nr);
      zeilen.push({ nr, phase: p.key, phaseLabel: p.label, von, bis, massnahmen: massnahmen[nr - 1], budget: budget ? budget.proWoche[nr - 1] : null, status: statusVon(von, bis, heute) });
    }
  }
  const phasenZeilen: PhaseZeile[] = phasen.map((p) => ({ ...p, von: zeilen[p.ersteWoche - 1].von, bis: zeilen[p.letzteWoche - 1].bis, budget: budget ? budget.proPhase[p.key] : null }));
  const name = kampagnenName(input);
  const meilensteine: Meilenstein[] = phasenZeilen.map((p) => {
    const erste = zeilen[p.ersteWoche - 1].massnahmen;
    const zeilenText = [
      `Kampagne: ${name}`,
      `Phase: ${p.label}, ${p.wochen} ${p.wochen === 1 ? "Woche" : "Wochen"}`,
      `Zeitraum: ${formatIso(p.von)} bis ${formatIso(p.bis)}`,
      ...(erste.length > 0 ? ["Massnahmen in der ersten Woche:", ...erste.map((x) => `- ${kanalName(x.kanal)}: ${x.titel}`)] : []),
    ];
    return { key: p.key, datum: p.von, titel: MEILENSTEIN_TITEL[p.key], beschreibung: zeilenText.join("\n") };
  });
  if (phasenZeilen.length > 0) {
    meilensteine.push({ key: "ende", datum: input.ende, titel: "Ende der Kampagne", beschreibung: `Kampagne: ${name}\nLetzter Tag der Kampagne.` });
    meilensteine.push({
      key: "auswertung",
      datum: addDays(input.ende, 7),
      titel: "Auswertung",
      beschreibung: `Kampagne: ${name}\nKennzahlen mit dem Ziel vergleichen und festhalten, was du beim nächsten Mal änderst.`,
    });
  }
  return {
    wochen,
    tage: wochen > 0 ? diffDays(input.start, input.ende) + 1 : 0,
    phasen: phasenZeilen,
    zeilen,
    budget,
    kennzahlen: kpiVorschlaege(input.ziel, input.organisation),
    meilensteine,
  };
}

// ---- Anzeige ------------------------------------------------------------------------------------

const wochenText = (n: number): string => `${n} ${n === 1 ? "Woche" : "Wochen"}`;
const tagMonat = (iso: string): string => formatIso(iso).slice(0, 6);

/** «12.10.2026 bis 18.10.2026» */
export const zeitraumLang = (von: string, bis: string): string => `${formatIso(von)} bis ${formatIso(bis)}`;

/** «12.10. bis 18.10.»; ein einzelner Tag als «06.12.». */
export const zeitraumKurz = (von: string, bis: string): string => (von === bis ? tagMonat(von) : `${tagMonat(von)} bis ${tagMonat(bis)}`);

/** Betrag für Tabellen: «CHF 150.-», für 0 ein Strich. */
export const betragText = (n: number): string => (n > 0 ? chf(n) : "–");

/** «Anlauf 25 %, Hauptphase 60 %, Nachfassen 15 %»: die Phasen mit Anteil, wie sie im Plan stehen. */
export function verteilungText(plan: Pick<Plan, "budget" | "phasen">): string {
  const b = plan.budget;
  if (!b) return "";
  return plan.phasen
    .filter((p) => b.anteile[p.key] > 0)
    .map((p) => `${p.label} ${pctCH(b.anteile[p.key], 0)}`)
    .join(", ");
}

export function massnahmeText(m: Massnahme): string {
  return `${kanalName(m.kanal)}: ${m.titel}${m.hinweis ? ` (${m.hinweis.replace(/\.$/, "")})` : ""}`;
}

// ---- Dokument, Eingabe und Ausgabe fürs CRM -----------------------------------------------------

export const dateiName = (input: Pick<PlanInput, "angebot" | "ziel">): string => safeFilename(kampagnenName(input), "kampagne");

/**
 * Kampagnenbrief für Markdown-Copy, Word und PDF: Steckbrief (Ziel, Zielgruppe, Kernbotschaft, Angebot, Zeitraum, Kanäle, Budget,
 * Verteilung, Kennzahlen), Tabelle der Phasen, Tabelle des Wochenplans, drei Hinweise und der Hinweis zum Richtwert. Ohne Budget
 * fehlen die Zeilen Budget und Verteilung und die Budget-Spalten.
 */
export function toDocument(plan: Plan, input: PlanInput, opts: { firma?: string } = {}): DocumentModel {
  const mitBudget = plan.budget !== null;
  const facts: { label: string; value: string }[] = [
    { label: "Ziel", value: zielLabel(input.ziel) },
    { label: "Zielgruppe", value: input.zielgruppe },
    { label: "Kernbotschaft", value: input.botschaft },
    ...(input.angebot ? [{ label: "Angebot", value: input.angebot }] : []),
    { label: "Zeitraum", value: `${zeitraumLang(input.start, input.ende)} (${wochenText(plan.wochen)})` },
    { label: "Kanäle", value: kanaeleText(input.kanaele) },
    ...(mitBudget
      ? [
          { label: "Budget", value: chf(input.budget) },
          { label: "Verteilung", value: `${verteilungText(plan)} (Richtwert von Alperna, keine Statistik)` },
        ]
      : []),
    { label: "Kennzahlen", value: `${plan.kennzahlen.map((k) => k.label).join(", ")}. ${KPI_HINWEIS}` },
  ];
  const phasenKopf = ["Phase", "Wochen", "Zeitraum", ...(mitBudget ? ["Budget"] : [])];
  const phasenZeilen = plan.phasen.map((p) => [
    p.label,
    p.wochen === 1 ? `Woche ${p.ersteWoche}` : `Woche ${p.ersteWoche} bis ${p.letzteWoche}`,
    zeitraumLang(p.von, p.bis),
    ...(mitBudget ? [betragText(p.budget ?? 0)] : []),
  ]);
  const wochenKopf = ["Woche", "Phase", "Zeitraum", "Massnahmen", ...(mitBudget ? ["Budget"] : [])];
  const wochenZeilen = plan.zeilen.map((z) => [
    String(z.nr),
    z.phaseLabel,
    zeitraumKurz(z.von, z.bis),
    z.massnahmen.length > 0 ? z.massnahmen.map((m) => `• ${massnahmeText(m)}`).join("\n") : "–",
    ...(mitBudget ? [betragText(z.budget ?? 0)] : []),
  ]);
  const blocks: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "heading", level: 1, text: "Phasen" },
    { type: "table", header: phasenKopf, rows: phasenZeilen, widths: mitBudget ? [2, 2, 4, 1.6] : [2, 2, 4] },
    { type: "heading", level: 1, text: "Wochenplan" },
    { type: "table", header: wochenKopf, rows: wochenZeilen, widths: mitBudget ? [1.5, 2.5, 2.8, 5.9, 2.2] : [1.5, 2.5, 2.8, 8.1] },
    { type: "heading", level: 1, text: "Hinweise" },
    { type: "list", items: [...HINWEISE] },
    { type: "paragraph", text: mitBudget ? `${RICHTWERT_HINWEIS} ${MATERIAL_HINWEIS}` : RICHTWERT_HINWEIS },
  ];
  return {
    title: "Kampagnenbrief",
    subtitle: `${kampagnenName(input)}, ${zeitraumLang(input.start, input.ende)}`,
    firma: opts.firma?.trim() || undefined,
    blocks,
    filename: `kampagnenbrief-${dateiName(input)}`,
  };
}

/** Eingabe fürs CRM, eine Angabe je Zeile. */
export function eingabeText(input: PlanInput): string {
  return [
    `Ziel: ${zielLabel(input.ziel)}`,
    `Zielgruppe: ${input.zielgruppe}`,
    `Kernbotschaft: ${input.botschaft}`,
    `Angebot: ${input.angebot || "keines angegeben"}`,
    `Kanäle: ${kanaeleText(input.kanaele)}`,
    `Zeitraum: ${zeitraumLang(input.start, input.ende)} (${wochenText(weeksBetween(input.start, input.ende))})`,
    `Budget: ${input.budget > 0 ? chf(input.budget) : "kein Budget angegeben"}`,
  ].join("\n");
}

/** Ausgabe fürs CRM: der Kampagnenbrief als Markdown. Der Server kürzt auf 1'900 Zeichen; der Steckbrief mit Ziel und Zeitraum steht oben, dahinter Phasen und Wochenplan. */
export function ausgabeText(plan: Plan, input: PlanInput, opts: { firma?: string } = {}): string {
  return toMarkdown(toDocument(plan, input, opts));
}

// ---- Kalenderdatei (.ics) -----------------------------------------------------------------------

const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
const icsDate = (iso: string): string => iso.replace(/-/g, "");

function icsStamp(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Kalenderdatei: ein ganztägiges Ereignis je Meilenstein (Start jeder Phase, Ende, Auswertung). UTF-8, Zeilen auf höchstens
 * 75 Oktette gefaltet, Zeilenende CRLF. `now` als Zeitstempel (DTSTAMP).
 */
export function buildIcs(plan: Plan, input: PlanInput, opts: { now: Date }): string {
  const name = kampagnenName(input);
  const stamp = icsStamp(opts.now);
  const uidBase = `${icsDate(input.start)}-${safeFilename(name, "kampagne").slice(0, 40)}`;
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:${ICS_PRODID}`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(`Kampagne: ${name}`)}`];
  for (const m of plan.meilensteine) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidBase}-${m.key}@tools.alperna.ch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(m.datum)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(m.datum, 1))}`,
      `SUMMARY:${icsEscape(`${name}: ${m.titel}`)}`,
      `DESCRIPTION:${icsEscape(m.beschreibung)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export const icsFilename = (input: Pick<PlanInput, "angebot" | "ziel">): string => `kampagne-${dateiName(input)}.ics`;

// ---- Stand im Browser (mt:kampagnen-planer) -----------------------------------------------------

export type PlannerState = {
  v: 1;
  phase: "edit" | "result";
  /** Die letzte gültige Eingabe; null, solange noch kein Plan erstellt wurde. */
  input: PlanInput | null;
  /** Wann der Plan erstellt wurde (JJJJ-MM-TT). */
  output?: { erstellt: string };
};

export const EMPTY_STATE: PlannerState = { v: 1, phase: "edit", input: null };

/** Liest den gespeicherten Stand; bei kaputten Daten der leere Stand. Ein Ergebnis ohne gültige Eingabe wird zum Formular. */
export function parseState(raw: unknown): PlannerState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = sanitizeInput(r.input);
  const o = typeof r.output === "object" && r.output !== null ? (r.output as Record<string, unknown>) : null;
  const erstellt = o && isIsoDate(o.erstellt) ? o.erstellt : null;
  return { v: 1, phase: r.phase === "result" && input ? "result" : "edit", input, ...(erstellt ? { output: { erstellt } } : {}) };
}
