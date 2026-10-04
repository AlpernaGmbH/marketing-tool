import { dateCH } from "@/lib/ch";
import { guessIndustry, isIndustryKey } from "@/lib/check/industries";
import { INDUSTRY_LABELS, type Aufwand, type CheckCategoryId, type CheckInput, type CheckResult, type IndustryKey, type Wirkung } from "@/lib/check/types";
import { safeFilename, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";

// Reine Funktionen, kein React, kein DOM, kein fetch. Spec: specs/wettbewerbsvergleich.md
// Die Prüfung je Website macht lib/check/ (Route /api/check); hier entstehen Eingabeprüfung, Zusammenfassung,
// Vergleich und das Dokument.

export const SLUG = "wettbewerbsvergleich";
export const MAX_COMPETITORS = 3;
/** Grenze von /api/check (app/api/check/route.ts): Prüfungen pro Stunde und Adresse. Eine Tatsache dieses Dienstes, keine Statistik. */
export const CHECKS_PER_HOUR = 8;

// ---- Formular und Zwischenstand -------------------------------------------------------------------

export type FormState = { industry: IndustryKey | ""; competitors: string[] };

export const EMPTY_FORM: FormState = { industry: "", competitors: Array<string>(MAX_COMPETITORS).fill("") };

export type CategorySummary = {
  id: CheckCategoryId;
  title: string;
  /** 0 bis 100 */
  score: number;
  weight: number;
  /** false: Google-Profil nicht automatisch bestätigt. */
  verified?: boolean;
};

export type StepSummary = { itemId: string; titel: string; wirkung: Wirkung; aufwand: Aufwand };

/** Kompakte Zusammenfassung je Website. Kein ganzes CheckResult: zu gross für Browser-Speicher und CRM. */
export type SiteSummary = {
  host: string;
  name: string;
  own: boolean;
  /** null: nicht erreichbar, siehe `error`. */
  score: number | null;
  categories: CategorySummary[];
  /** Nur bei der eigenen Website: die ersten Schritte aus dem Check. */
  massnahmen?: StepSummary[];
  error?: string;
};

export type ComparisonResult = { checkedAt: string; industry: IndustryKey; sites: SiteSummary[] };

/**
 * Zwischenstand unter mt:<slug>. `phase`, `step` und `answers` entsprechen dem Format der
 * Fragebogen-Tools, damit der Fortschritt im Pfad («phase» = «result») unverändert funktioniert.
 */
export type SavedComparison = {
  v: 1;
  phase: "intro" | "result";
  step: 0;
  answers: Record<string, never>;
  form: FormState;
  result?: ComparisonResult;
};

export const EMPTY_SAVED: SavedComparison = { v: 1, phase: "intro", step: 0, answers: {}, form: EMPTY_FORM };

const WIRKUNGEN: readonly string[] = ["hoch", "mittel", "gering"];
const AUFWAENDE: readonly string[] = ["klein", "mittel", "gross"];
const CATEGORY_IDS: readonly string[] = ["seo", "gbp", "social", "sea", "newsletter", "shop", "booking"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isScore = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;

function parseForm(raw: unknown): FormState {
  if (!isObj(raw)) return EMPTY_FORM;
  const competitors = [...EMPTY_FORM.competitors];
  if (Array.isArray(raw.competitors)) {
    raw.competitors.slice(0, MAX_COMPETITORS).forEach((c, i) => {
      competitors[i] = typeof c === "string" ? c.slice(0, 300) : "";
    });
  }
  return { industry: isIndustryKey(raw.industry) ? raw.industry : "", competitors };
}

function parseCategory(raw: unknown): CategorySummary | null {
  if (!isObj(raw)) return null;
  const { id, title, score, weight, verified } = raw;
  if (typeof id !== "string" || !CATEGORY_IDS.includes(id) || typeof title !== "string" || !isScore(score)) return null;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) return null;
  return { id: id as CheckCategoryId, title, score, weight, ...(verified === false ? { verified: false } : {}) };
}

function parseStep(raw: unknown): StepSummary | null {
  if (!isObj(raw)) return null;
  const { itemId, titel, wirkung, aufwand } = raw;
  if (typeof itemId !== "string" || typeof titel !== "string" || !titel) return null;
  if (typeof wirkung !== "string" || !WIRKUNGEN.includes(wirkung) || typeof aufwand !== "string" || !AUFWAENDE.includes(aufwand)) return null;
  return { itemId, titel, wirkung: wirkung as Wirkung, aufwand: aufwand as Aufwand };
}

function parseSite(raw: unknown): SiteSummary | null {
  if (!isObj(raw)) return null;
  const { host, name, own, score, categories, massnahmen, error } = raw;
  if (typeof host !== "string" || !host.trim() || typeof own !== "boolean") return null;
  const site: SiteSummary = { host: host.trim(), name: typeof name === "string" && name.trim() ? name.trim() : host.trim(), own, score: null, categories: [] };
  if (score === null) {
    site.error = typeof error === "string" && error.trim() ? error.trim() : "nicht erreichbar";
    return site;
  }
  if (!isScore(score) || !Array.isArray(categories)) return null;
  const cats = categories.map(parseCategory);
  if (cats.some((c) => c === null) || cats.length === 0) return null;
  site.score = score;
  site.categories = cats as CategorySummary[];
  if (own && Array.isArray(massnahmen)) {
    const steps = massnahmen.map(parseStep).filter((s): s is StepSummary => s !== null);
    site.massnahmen = steps.slice(0, 5);
  }
  return site;
}

function parseResult(raw: unknown): ComparisonResult | null {
  if (!isObj(raw)) return null;
  const { checkedAt, industry, sites } = raw;
  if (typeof checkedAt !== "string" || Number.isNaN(new Date(checkedAt).getTime()) || !isIndustryKey(industry)) return null;
  if (!Array.isArray(sites)) return null;
  const parsed = sites.map(parseSite);
  if (parsed.some((s) => s === null)) return null;
  const list = parsed as SiteSummary[];
  const own = list.filter((s) => s.own);
  if (own.length !== 1 || list.length < 2) return null;
  // Eigene Website immer zuerst.
  return { checkedAt, industry, sites: [own[0], ...list.filter((s) => !s.own)] };
}

/** Liest den Zwischenstand. Kaputte oder fremde Daten fallen auf den Start zurück; gültige Mitbewerber im Formular bleiben. */
export function parseState(raw: unknown): SavedComparison {
  if (!isObj(raw)) return EMPTY_SAVED;
  const form = parseForm(raw.form);
  if (raw.phase === "result") {
    const result = parseResult(raw.result);
    if (result) return { ...EMPTY_SAVED, phase: "result", form, result };
  }
  return { ...EMPTY_SAVED, form };
}

// ---- Eingabe -----------------------------------------------------------------------------------

export type HostCheck = { ok: true; host: string; url: string } | { ok: false; message: string };

/**
 * Macht aus «www.Keller.ch/» den Host «keller.ch» und die Adresse «https://www.keller.ch/».
 * Dieselben Regeln wie normalizeUrl in lib/check/analyze.ts, ohne Node-Abhängigkeit, damit sie im Browser laufen.
 */
export function normalizeHost(raw: string): HostCheck {
  let s = (raw ?? "").trim();
  if (!s) return { ok: false, message: "Bitte gib eine Website an." };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^https?:\/\//i.test(s)) {
    return { ok: false, message: "Es sind nur Adressen mit http oder https erlaubt." };
  }
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, message: "Das ist keine gültige Website-Adresse." };
  }
  const hostname = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) {
    return { ok: false, message: "Bitte gib den Domainnamen an, nicht eine IP-Adresse." };
  }
  if (!hostname.includes(".") || hostname.endsWith(".")) return { ok: false, message: "Bitte gib eine gültige Website-Adresse an." };
  if (u.username || u.password) return { ok: false, message: "Bitte gib die Adresse ohne Zugangsdaten an." };
  return { ok: true, host: hostname.replace(/^www\./, ""), url: u.toString() };
}

/** Eine zu prüfende Website: Host zum Vergleichen, Adresse für den Abruf, Name für das Dokument. */
export type Site = { host: string; url: string; name: string; own: boolean };

export type Validation = { ok: true; sites: Site[]; industry: IndustryKey } | { ok: false; message: string };

/** Branche für die Bewertung: Wahl der Person, sonst Vorschlag aus der Branche im Firmenprofil. */
export function industryFor(profile: Profile, form: FormState): IndustryKey | "" {
  if (form.industry) return form.industry;
  return profile.branche?.trim() ? guessIndustry(profile.branche) : "";
}

/** Prüft alle Angaben und liefert die Websites in Prüfreihenfolge (eigene zuerst) oder die erste Meldung. */
export function validate(profile: Profile, form: FormState): Validation {
  const own = normalizeHost(profile.website ?? "");
  if (!own.ok) return { ok: false, message: `Deine Website: ${own.message}` };
  const industry = industryFor(profile, form);
  if (!industry) return { ok: false, message: "Bitte wähle deine Branche. Sie entscheidet, ob Online-Shop und Online-Buchung zählen." };

  const given = form.competitors.map((c, i) => ({ raw: c.trim(), nr: i + 1 })).filter((c) => c.raw);
  if (given.length === 0) return { ok: false, message: "Bitte gib mindestens einen Mitbewerber an." };
  if (given.length > MAX_COMPETITORS) return { ok: false, message: `Bitte gib höchstens ${MAX_COMPETITORS} Mitbewerber an.` };

  const sites: Site[] = [{ host: own.host, url: own.url, name: profile.firma?.trim() || own.host, own: true }];
  const seen = new Set([own.host]);
  for (const { raw, nr } of given) {
    const c = normalizeHost(raw);
    if (!c.ok) return { ok: false, message: `Mitbewerber ${nr}: ${c.message}` };
    if (c.host === own.host) return { ok: false, message: `Mitbewerber ${nr}: Das ist deine eigene Website.` };
    if (seen.has(c.host)) return { ok: false, message: `Mitbewerber ${nr}: ${c.host} steht schon in der Liste.` };
    seen.add(c.host);
    sites.push({ host: c.host, url: c.url, name: c.host, own: false });
  }
  return { ok: true, sites, industry };
}

/** Eingabe für /api/check. Für alle Websites dieselbe Branche und keine Social-Angaben, damit die Punkte vergleichbar sind. */
export function checkInputFor(site: Site, industry: IndustryKey, profile: Profile): CheckInput {
  // Fremde Websites nur, wenn ihre robots.txt den Abruf erlaubt (lib/check/robots.ts); die eigene prüft die Person selbst.
  return { company: site.name, city: profile.ort?.trim() ?? "", industry, website: site.url, socials: {}, respectRobots: !site.own };
}

// ---- Zusammenfassung und Vergleich ----------------------------------------------------------------

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

export const percent = (score: number): number => Math.round(score * 100);

/** Zusammenfassung eines Check-Ergebnisses. Schritte nur bei der eigenen Website, höchstens fünf. */
export function summarize(result: CheckResult, own: boolean): SiteSummary {
  return {
    host: hostOf(result.url),
    name: result.company,
    own,
    score: result.score,
    categories: result.categories.map((c) => ({
      id: c.id,
      title: c.title,
      score: percent(c.score),
      weight: c.weight,
      ...(c.verified === false ? { verified: false } : {}),
    })),
    ...(own ? { massnahmen: result.massnahmen.slice(0, 5).map((m) => ({ itemId: m.itemId, titel: m.titel, wirkung: m.wirkung, aufwand: m.aufwand })) } : {}),
  };
}

/** Eintrag für eine Website, die nicht geprüft werden konnte. Sie bleibt in der Tabelle als «nicht erreichbar». */
export function failedSite(site: Site, message: string): SiteSummary {
  return { host: site.host, name: site.name, own: site.own, score: null, categories: [], error: message };
}

export type Diff = { id: CheckCategoryId; title: string; own: number; best: number; bestHost: string; delta: number };

export type Comparison = {
  /** Vergleich möglich: eigenes Ergebnis und mindestens ein erreichbarer Mitbewerber. */
  possible: boolean;
  ahead: Diff[];
  behind: Diff[];
  even: Diff[];
  ownScore: number | null;
  bestScore: number | null;
  bestHost: string | null;
};

const ownOf = (sites: SiteSummary[]) => sites.find((s) => s.own);
const othersOf = (sites: SiteSummary[]) => sites.filter((s) => !s.own);

/** Je Bereich mit Gewicht: Abstand der eigenen Punkte zum besten erreichbaren Mitbewerber. */
export function compare(sites: SiteSummary[]): Comparison {
  const own = ownOf(sites);
  const reached = othersOf(sites).filter((s) => s.score !== null);
  const bestSite = reached.reduce<SiteSummary | null>((b, s) => (b === null || (s.score ?? 0) > (b.score ?? 0) ? s : b), null);
  const base: Comparison = {
    possible: false,
    ahead: [],
    behind: [],
    even: [],
    ownScore: own?.score ?? null,
    bestScore: bestSite?.score ?? null,
    bestHost: bestSite?.host ?? null,
  };
  if (!own || own.score === null || reached.length === 0) return base;

  const diffs: Diff[] = [];
  for (const cat of own.categories) {
    if (cat.weight <= 0) continue;
    let best: { score: number; host: string } | null = null;
    for (const s of reached) {
      const c = s.categories.find((x) => x.id === cat.id);
      if (!c) continue;
      if (best === null || c.score > best.score) best = { score: c.score, host: s.host };
    }
    if (!best) continue;
    diffs.push({ id: cat.id, title: cat.title, own: cat.score, best: best.score, bestHost: best.host, delta: cat.score - best.score });
  }
  return {
    ...base,
    possible: true,
    ahead: diffs.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta),
    behind: diffs.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta),
    even: diffs.filter((d) => d.delta === 0),
  };
}

const punkte = (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkte"}`;

/** Feste Sätze für Vorsprung und Rückstand, ohne Erfindung. */
export const diffText = (d: Diff): string =>
  d.delta > 0
    ? `${d.title}: du ${d.own}, bester Mitbewerber ${d.best} (${d.bestHost}). Vorsprung ${punkte(d.delta)}.`
    : `${d.title}: du ${d.own}, bester Mitbewerber ${d.best} (${d.bestHost}). Rückstand ${punkte(-d.delta)}.`;

export const stepText = (s: StepSummary): string => `${s.titel} (Wirkung ${s.wirkung}, Aufwand ${s.aufwand})`;

/** Hinweise, was der Vergleich sieht und was nicht. Stehen im Ergebnis und im Export. */
export function measurementNotes(result: ComparisonResult): string[] {
  const notes = [
    `Verglichen wurden nur die öffentlichen Startseiten am ${dateCH(result.checkedAt)}. Unterseiten, Inhalte, die erst im Browser laden, Preise und die Qualität der Arbeit sieht der Vergleich nicht.`,
    "Social Media zählt bei allen Websites nur, was auf der Startseite verlinkt ist. Wie oft jemand dort veröffentlicht, ist unbekannt; jeder verlinkte Kanal zählt mit demselben Mittelwert.",
  ];
  if (result.sites.some((s) => s.categories.some((c) => c.id === "gbp" && c.verified === false))) {
    notes.push("Das Google-Business-Profil wurde nicht automatisch bestätigt. Die Punkte dieses Bereichs sind eine Annahme, keine Messung.");
  }
  notes.push(
    `Die Branche «${INDUSTRY_LABELS[result.industry]}» gilt für alle Websites. Sie entscheidet, ob Online-Shop und Online-Buchung zählen.`,
    "Wirkung und Aufwand der Schritte sind eine Einschätzung von Alperna, keine Messung und keine Statistik.",
    "Die Startseiten der Mitbewerber wurden je einmal abgerufen (Kennung AlpernaCheck). Unser Server speichert sie nicht; im Ergebnis bleiben nur Adresse und Punkte.",
  );
  return notes;
}

// ---- Dokument ----------------------------------------------------------------------------------

const cell = (s: SiteSummary, value: number | undefined): string => (s.score === null ? "nicht erreichbar" : value === undefined ? "–" : String(value));

/** Eingabe fürs CRM: eine Angabe je Zeile. */
export function eingabeText(result: ComparisonResult): string {
  const own = ownOf(result.sites);
  return [
    `Website: ${own?.host ?? "–"}`,
    `Betrieb: ${own?.name ?? "–"}`,
    `Mitbewerber: ${othersOf(result.sites).map((s) => s.host).join(", ")}`,
    `Branche: ${INDUSTRY_LABELS[result.industry]}`,
  ].join("\n");
}

/** DocumentModel für Anzeige (DocView), PDF, Word und Markdown. */
export function toDocument(result: ComparisonResult): DocumentModel {
  const datum = dateCH(result.checkedAt);
  const own = ownOf(result.sites) ?? result.sites[0];
  const others = othersOf(result.sites);
  const sites = [own, ...others];
  const cmp = compare(sites);
  // Bereiche in der Reihenfolge des ersten erreichbaren Ergebnisses (eigene Website zuerst), nur mit Gewicht.
  const reference = sites.find((s) => s.score !== null)?.categories.filter((c) => c.weight > 0) ?? [];
  const failed = sites.filter((s) => s.score === null);

  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: own.name },
        { label: "Website", value: own.host },
        { label: "Branche", value: INDUSTRY_LABELS[result.industry] },
        { label: "Mitbewerber", value: others.map((s) => s.host).join(", ") },
        { label: "Verglichen am", value: datum },
      ],
    },
    { type: "heading", level: 1, text: "Punkte im Vergleich" },
  ];

  if (own.score === null) {
    blocks.push({ type: "paragraph", text: `Deine Website ${own.host} konnte nicht geprüft werden: ${own.error ?? "nicht erreichbar"}. Die Tabelle zeigt nur die Mitbewerber.` });
  } else if (cmp.bestScore !== null && cmp.bestHost) {
    blocks.push({
      type: "paragraph",
      text: `Gesamt: ${own.name} ${own.score} von 100, bester Mitbewerber ${cmp.bestHost} mit ${cmp.bestScore} von 100.`,
    });
  } else {
    blocks.push({ type: "paragraph", text: `Gesamt: ${own.name} ${own.score} von 100. Kein Mitbewerber war erreichbar, darum gibt es keinen Vergleich.` });
  }

  blocks.push({
    type: "table",
    header: ["Bereich", ...sites.map((s) => (s.own ? `${s.host} (du)` : s.host))],
    widths: [2.2, ...sites.map(() => 1)],
    rows: [
      ["Gesamt", ...sites.map((s) => cell(s, s.score ?? undefined))],
      ...reference.map((ref) => [ref.title, ...sites.map((s) => cell(s, s.categories.find((c) => c.id === ref.id)?.score))]),
    ],
  });

  if (failed.length > 0) {
    blocks.push({ type: "list", items: failed.map((s) => `${s.host}: nicht erreichbar. ${s.error ?? ""}`.trim()) });
  }

  blocks.push({ type: "heading", level: 1, text: "Wo du vorne liegst" });
  if (!cmp.possible) {
    blocks.push({ type: "paragraph", text: "Ohne Ergebnis für deine Website und mindestens einen Mitbewerber gibt es keinen Vergleich." });
  } else if (cmp.ahead.length === 0) {
    blocks.push({ type: "paragraph", text: "In keinem Bereich. Der beste Mitbewerber liegt überall mindestens gleichauf." });
  } else {
    blocks.push({ type: "list", items: cmp.ahead.map(diffText) });
  }

  blocks.push({ type: "heading", level: 1, text: "Wo die anderen vorne liegen" });
  if (!cmp.possible) {
    blocks.push({ type: "paragraph", text: "Kein Vergleich möglich." });
  } else if (cmp.behind.length === 0) {
    blocks.push({ type: "paragraph", text: "In keinem Bereich. Du liegst überall mindestens gleichauf." });
  } else {
    blocks.push({ type: "list", items: cmp.behind.map(diffText) });
  }
  if (cmp.even.length > 0) {
    blocks.push({ type: "paragraph", text: `Gleichstand: ${cmp.even.map((d) => d.title).join(", ")}.` });
  }

  blocks.push({ type: "heading", level: 1, text: "Deine ersten Schritte" });
  if (own.score === null) {
    blocks.push({ type: "paragraph", text: "Ohne Ergebnis für deine Website gibt es keine Schritte. Prüfe die Adresse und vergleiche noch einmal." });
  } else if (!own.massnahmen || own.massnahmen.length === 0) {
    blocks.push({ type: "paragraph", text: "Für deine Website gibt es nichts Dringendes. Prüfe die Punkte in einigen Monaten erneut." });
  } else {
    blocks.push({ type: "list", ordered: true, items: own.massnahmen.map(stepText) });
  }

  blocks.push({ type: "heading", level: 1, text: "Was der Vergleich sieht und was nicht" }, { type: "list", items: measurementNotes(result) });

  return {
    title: `Wettbewerbsvergleich: ${own.name}`,
    subtitle: `${own.host} gegen ${others.map((s) => s.host).join(", ")}, verglichen am ${datum}`,
    firma: own.name,
    datum,
    filename: `wettbewerbsvergleich-${safeFilename(own.name, "betrieb")}`,
    blocks,
  };
}
