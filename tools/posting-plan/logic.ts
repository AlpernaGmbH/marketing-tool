import { numberCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { PitchSpec } from "@/lib/pitch";
import type { Profile } from "@/lib/profile";
import { CSV_BOM, csvCell, kanaeleAusProfil, kanaeleVorschlag, normalizeKanaele, type KanalKey } from "@/tools/feiertagskalender/logic";

// Posting-Plan nach Zeitbudget: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Aus den Stunden pro Woche, den Kanälen und den Fähigkeiten entsteht ein Plan für vier Wochen: welche Beiträge pro Kanal
// und Woche in das Budget passen, welche Säule wann dran ist und was an einem festen Tag am Stück produziert wird.
// Der Aufwand je Format, der Planungsaufwand, die Reihenfolge, der Rhythmus und die Veröffentlichungstage sind Annahmen
// und Richtwerte von Alperna, keine Statistik. Es gibt keine Datei in data/ und keine Zahl aus einer fremden Quelle.
// Spec: specs/posting-plan.md

export const SLUG = "posting-plan";
export const WOCHEN = 4;
/** Planungsaufwand pro Woche in Stunden. Annahme von Alperna, keine Statistik; wird vom Zeitbudget abgezogen. */
export const PLANUNG = 0.25;
export const MIN_STUNDEN = 0.5;
export const MAX_STUNDEN = 20;
export const MAX_SAEULEN = 5;
export const MAX_SAEULE = 40;
export const MIN_AUFWAND = 0.1;
export const MAX_AUFWAND = 10;
/** Höchstens so viele Beiträge je Kanal und Woche (erster Beitrag plus ein zweiter bei Kanälen mit mehreren Formaten). Richtwert von Alperna. */
export const MAX_BEITRAEGE_PRO_KANAL = 2;
/** Ab so vielen freien Stunden pro Woche weist das Ergebnis auf die Reserve hin. Richtwert von Alperna. */
export const RESERVE_HINWEIS_AB = 1;

const EPS = 1e-9;
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---- Tabellen -----------------------------------------------------------------------------------------------------

export const TAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;
export type Tag = (typeof TAGE)[number];
export const isTag = (v: unknown): v is Tag => typeof v === "string" && (TAGE as readonly string[]).includes(v);

/** Veröffentlichungstage der Reihe nach, nie am Produktionstag. Richtwert von Alperna, keine Statistik. */
export const PUBLIKATIONSTAGE: readonly Tag[] = ["Dienstag", "Donnerstag", "Samstag"];

export const FAEHIGKEITEN = [
  { key: "text", label: "Text" },
  { key: "foto", label: "Foto" },
  { key: "video", label: "Video" },
  { key: "gestaltung", label: "Gestaltung" },
] as const;
export type Faehigkeit = (typeof FAEHIGKEITEN)[number]["key"];
export const FAEHIGKEIT_KEYS: readonly Faehigkeit[] = FAEHIGKEITEN.map((f) => f.key);
export const faehigkeitLabel = (key: Faehigkeit): string => FAEHIGKEITEN.find((f) => f.key === key)?.label ?? key;
const normalizeFaehigkeiten = (list: readonly unknown[]): Faehigkeit[] => FAEHIGKEIT_KEYS.filter((k) => list.includes(k));

export const FORMATE = [
  { key: "textbeitrag", label: "Textbeitrag" },
  { key: "fotobeitrag", label: "Fotobeitrag" },
  { key: "karussell", label: "Karussell" },
  { key: "kurzvideo", label: "Kurzvideo" },
  { key: "story", label: "Story" },
  { key: "googleBeitrag", label: "Google-Beitrag" },
  { key: "newsletter", label: "Newsletter" },
  { key: "websiteBeitrag", label: "Website-Beitrag" },
] as const;
export type FormatKey = (typeof FORMATE)[number]["key"];
export const FORMAT_KEYS: readonly FormatKey[] = FORMATE.map((f) => f.key);
export const formatLabel = (key: FormatKey): string => FORMATE.find((f) => f.key === key)?.label ?? key;

/** Aufwand je Format in Stunden pro Beitrag. Annahme von Alperna, keine Statistik; die Person kann jeden Wert überschreiben. */
export const AUFWAND: Readonly<Record<FormatKey, number>> = {
  textbeitrag: 0.5,
  fotobeitrag: 0.75,
  karussell: 1.5,
  kurzvideo: 2,
  story: 0.25,
  googleBeitrag: 0.25,
  newsletter: 1.5,
  websiteBeitrag: 1.5,
};

/** `label` für die Auswahl, `kurz` für Tabellen und Sätze. */
export const KANAELE = [
  { key: "instagram", label: "Instagram", kurz: "Instagram" },
  { key: "facebook", label: "Facebook", kurz: "Facebook" },
  { key: "linkedin", label: "LinkedIn", kurz: "LinkedIn" },
  { key: "google", label: "Google-Unternehmensprofil", kurz: "Google-Profil" },
  { key: "newsletter", label: "Newsletter", kurz: "Newsletter" },
  { key: "website", label: "Website (Blog oder Neuigkeiten)", kurz: "Website" },
] as const satisfies readonly { key: KanalKey; label: string; kurz: string }[];
export const kanalLabel = (key: KanalKey): string => KANAELE.find((k) => k.key === key)?.label ?? key;
export const kanalKurz = (key: KanalKey): string => KANAELE.find((k) => k.key === key)?.kurz ?? key;
export const kanaeleText = (list: readonly KanalKey[]): string => normalizeKanaele(list).map(kanalKurz).join(", ");

/** Reihenfolge der Wichtigkeit, wenn die Stunden knapp sind: zuerst das Google-Profil, dann die übrigen Kanäle. Richtwert von Alperna. */
export const WICHTIGKEIT: readonly KanalKey[] = ["google", "instagram", "facebook", "linkedin", "newsletter", "website"];

type KanalFormat = { format: FormatKey; braucht: readonly Faehigkeit[] };

/** Formate je Kanal und die Fähigkeiten, die sie brauchen. Text ist Pflicht und darum nicht aufgeführt. */
const KANAL_FORMATE: Readonly<Record<KanalKey, readonly KanalFormat[]>> = {
  instagram: [
    { format: "fotobeitrag", braucht: ["foto"] },
    { format: "karussell", braucht: ["foto", "gestaltung"] },
    { format: "kurzvideo", braucht: ["video"] },
    { format: "story", braucht: ["foto"] },
  ],
  facebook: [
    { format: "textbeitrag", braucht: [] },
    { format: "fotobeitrag", braucht: ["foto"] },
  ],
  linkedin: [{ format: "textbeitrag", braucht: [] }],
  google: [{ format: "googleBeitrag", braucht: [] }],
  newsletter: [{ format: "newsletter", braucht: [] }],
  website: [{ format: "websiteBeitrag", braucht: [] }],
};

/**
 * Formate eines Kanals, die mit den gewählten Fähigkeiten möglich sind, in der Reihenfolge der Tabelle.
 * Facebook und LinkedIn führen den Textbeitrag ohne Zusatzfähigkeit: Der Rückfall auf den Textbeitrag ist damit immer da.
 * Instagram hat keinen Textbeitrag; ohne Foto oder Video bleibt die Liste leer.
 */
export function availableFormats(kanal: KanalKey, faehigkeiten: readonly Faehigkeit[]): FormatKey[] {
  return (KANAL_FORMATE[kanal] ?? []).filter((f) => f.braucht.every((b) => faehigkeiten.includes(b))).map((f) => f.format);
}

/** Fähigkeiten, von denen schon eine genügt, damit der Kanal ein Format bekommt (ohne Text, der ist Pflicht). */
function freischalter(kanal: KanalKey): Faehigkeit[] {
  return FAEHIGKEIT_KEYS.filter((s) => s !== "text" && availableFormats(kanal, [s]).length > 0);
}

export function ohneFormatHinweis(kanal: KanalKey): string {
  const s = freischalter(kanal).map(faehigkeitLabel);
  const wahl = s.length === 0 ? "" : ` Wähle ${s.join(" oder ")} bei «Was könnt ihr gut?».`;
  return `${kanalKurz(kanal)}: Für diesen Kanal fehlt eine Fähigkeit.${wahl}`;
}

/** Aufwand je Format mit den überschriebenen Werten der Person; ungültige Werte gelten nicht. */
export function aufwandTabelle(aufwand?: Partial<Record<FormatKey, number>>): Record<FormatKey, number> {
  const out: Record<FormatKey, number> = { ...AUFWAND };
  for (const f of FORMAT_KEYS) {
    const v = aufwand?.[f];
    if (typeof v === "number" && Number.isFinite(v) && v >= MIN_AUFWAND - EPS && v <= MAX_AUFWAND + EPS) out[f] = round2(v);
  }
  return out;
}

// ---- Eingabe ------------------------------------------------------------------------------------------------------

export type Input = {
  stunden: number;
  kanaele: KanalKey[];
  faehigkeiten: Faehigkeit[];
  saeulen: string[];
  produktionstag: Tag;
  /** Nur Werte, die vom Standard abweichen. */
  aufwand: Partial<Record<FormatKey, number>>;
};

export const hoursText = (n: number): string => `${numberCH(round2(n), 2)} ${round2(n) === 1 ? "Stunde" : "Stunden"}`;
const hoursShort = (n: number): string => numberCH(round2(n), 2);

/** Stunden für Beiträge: das Budget minus Planung, nie unter 0. */
export const verfuegbar = (stunden: number): number => (Number.isFinite(stunden) ? Math.max(0, round2(stunden - PLANUNG)) : 0);

function saeulenProblem(list: readonly string[]): string | null {
  if (list.length === 0) return "Nenne mindestens eine Säule.";
  if (list.length > MAX_SAEULEN) return `Höchstens ${MAX_SAEULEN} Säulen.`;
  const seen = new Set<string>();
  for (const s of list) {
    if (s.length > MAX_SAEULE) return `Die Säule «${s.slice(0, 20)} …» ist zu lang (höchstens ${MAX_SAEULE} Zeichen).`;
    const key = s.toLowerCase();
    if (seen.has(key)) return `Die Säule «${s}» steht zweimal.`;
    seen.add(key);
  }
  return null;
}

/** Eine Meldung, wenn die Eingabe nicht reicht, sonst null. Prüft Angaben und, ob mindestens ein Beitrag in das Budget passt. */
export function validate(input: Input): string | null {
  const { stunden } = input;
  if (!Number.isFinite(stunden) || stunden < MIN_STUNDEN - EPS || stunden > MAX_STUNDEN + EPS) {
    return `Gib die Stunden pro Woche an, zwischen ${numberCH(MIN_STUNDEN)} und ${MAX_STUNDEN}.`;
  }
  if (normalizeKanaele(input.kanaele).length === 0) return "Wähle mindestens einen Kanal.";
  if (!input.faehigkeiten.includes("text")) return "Wähle bei «Was könnt ihr gut?» mindestens «Text».";
  const s = saeulenProblem(input.saeulen);
  if (s) return s;
  if (!isTag(input.produktionstag)) return "Wähle einen Produktionstag.";
  for (const f of FORMAT_KEYS) {
    const v = input.aufwand[f];
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < MIN_AUFWAND - EPS || v > MAX_AUFWAND + EPS) {
      return `Aufwand: ${formatLabel(f)}: Gib Stunden zwischen ${numberCH(MIN_AUFWAND)} und ${MAX_AUFWAND} an.`;
    }
  }
  const z = allocate(input);
  if (z.geplant.length === 0) {
    if (z.ohneFormat.length > 0 && z.gestrichen.length === 0) {
      return `Für die gewählten Kanäle fehlt eine Fähigkeit. ${z.ohneFormat.map(ohneFormatHinweis).join(" ")}`;
    }
    return `Mit ${hoursText(stunden)} pro Woche reicht es für keinen der gewählten Kanäle. Erhöhe die Stunden oder wähle einen Kanal mit weniger Aufwand.`;
  }
  return null;
}

// ---- Zuteilung ----------------------------------------------------------------------------------------------------

export type Posten = { kanal: KanalKey; format: FormatKey; aufwand: number };
export type Zuteilung = {
  /** Stunden für Beiträge pro Woche (Budget minus Planung). */
  verfuegbar: number;
  /** Eingeplante Kanäle in der Reihenfolge der Wichtigkeit. */
  geplant: KanalKey[];
  /** Kanäle, die das Budget nicht trägt (von hinten gestrichen). */
  gestrichen: KanalKey[];
  /** Kanäle, für die eine Fähigkeit fehlt. */
  ohneFormat: KanalKey[];
  /** Vier Wochen, je eine Liste von Posten in der Reihenfolge der Zuteilung. */
  wochen: Posten[][];
};

/** Newsletter in den geraden Wochen (alle zwei Wochen), Website-Beitrag einmal in vier Wochen (Woche 3), alle anderen jede Woche. */
export function aktivInWoche(kanal: KanalKey, woche: number): boolean {
  if (kanal === "newsletter") return woche % 2 === 0;
  if (kanal === "website") return woche === 3;
  return true;
}

function guenstigsterFormat(kanal: KanalKey, faehigkeiten: readonly Faehigkeit[], kosten: Readonly<Record<FormatKey, number>>): FormatKey | null {
  let best: FormatKey | null = null;
  for (const f of availableFormats(kanal, faehigkeiten)) if (best === null || kosten[f] < kosten[best] - EPS) best = f;
  return best;
}

/**
 * Verteilt das Budget auf vier Wochen. Reihenfolge: je ein Beitrag pro Kanal im günstigsten Format (Google-Profil zuerst, dann Instagram,
 * Facebook, LinkedIn, Newsletter, Website), danach ein zweiter Beitrag für Kanäle mit mehreren Formaten im teuersten Format, das noch in die
 * übrigen Stunden passt. Reicht das Budget schon für die ersten Beiträge nicht, werden Kanäle von hinten gestrichen. Nie über das Budget.
 */
export function allocate(input: Input): Zuteilung {
  const budget = verfuegbar(input.stunden);
  const kosten = aufwandTabelle(input.aufwand);
  const gewaehlt = WICHTIGKEIT.filter((k) => input.kanaele.includes(k));
  const ohneFormat = gewaehlt.filter((k) => availableFormats(k, input.faehigkeiten).length === 0);
  const geplant = gewaehlt.filter((k) => !ohneFormat.includes(k));

  const guenstig = (k: KanalKey): number => {
    const f = guenstigsterFormat(k, input.faehigkeiten, kosten);
    return f === null ? 0 : kosten[f];
  };
  const mindestens = (kanaele: readonly KanalKey[], woche: number): number =>
    round2(kanaele.filter((k) => aktivInWoche(k, woche)).reduce((s, k) => s + guenstig(k), 0));
  const passt = (kanaele: readonly KanalKey[]): boolean => Array.from({ length: WOCHEN }, (_, i) => mindestens(kanaele, i + 1)).every((m) => m <= budget + EPS);

  const gestrichen: KanalKey[] = [];
  while (geplant.length > 0 && !passt(geplant)) gestrichen.unshift(geplant.pop() as KanalKey);

  const wochen: Posten[][] = [];
  for (let woche = 1; woche <= WOCHEN; woche++) {
    const posten: Posten[] = [];
    let rest = budget;
    for (const k of geplant) {
      if (!aktivInWoche(k, woche)) continue;
      const f = guenstigsterFormat(k, input.faehigkeiten, kosten);
      if (f === null) continue;
      posten.push({ kanal: k, format: f, aufwand: kosten[f] });
      rest = round2(rest - kosten[f]);
    }
    // Zweiter Beitrag: nur Kanäle mit mehreren Formaten, ein anderes Format als der erste Beitrag, das teuerste, das noch passt.
    for (const k of geplant) {
      const erster = posten.find((p) => p.kanal === k);
      if (!erster) continue;
      let pick: FormatKey | null = null;
      for (const f of availableFormats(k, input.faehigkeiten)) {
        if (f === erster.format || kosten[f] > rest + EPS) continue;
        if (pick === null || kosten[f] > kosten[pick] + EPS) pick = f;
      }
      if (pick === null) continue;
      posten.push({ kanal: k, format: pick, aufwand: kosten[pick] });
      rest = round2(rest - kosten[pick]);
    }
    wochen.push(posten);
  }
  return { verfuegbar: budget, geplant, gestrichen, ohneFormat, wochen };
}

// ---- Plan ---------------------------------------------------------------------------------------------------------

export type Beitrag = { woche: number; tag: Tag; kanal: KanalKey; format: FormatKey; saeule: string; aufwand: number };
export type Woche = {
  nummer: number;
  beitraege: Beitrag[];
  /** Summe der Beitragsaufwände. */
  aufwand: number;
  /** Budget für Beiträge minus Aufwand. */
  reserve: number;
};
export type Plan = {
  input: Input;
  verfuegbar: number;
  geplant: KanalKey[];
  gestrichen: KanalKey[];
  ohneFormat: KanalKey[];
  wochen: Woche[];
  /** Wie oft jede Säule vorkommt, in der Reihenfolge der Eingabe. */
  saeulen: { name: string; anzahl: number }[];
  /** Hinweise zum Plan, nur was zutrifft. */
  kontrollen: string[];
};

/** Veröffentlichungstage: der Reihe nach, nie am Produktionstag, nie zwei Beiträge desselben Kanals am selben Tag. */
function tageVergeben(posten: readonly Posten[], produktionstag: Tag): Tag[] {
  const zyklus = PUBLIKATIONSTAGE.filter((t) => t !== produktionstag);
  const belegt = new Map<KanalKey, Set<Tag>>();
  const out: Tag[] = [];
  let zeiger = 0;
  for (const p of posten) {
    let n = zeiger;
    for (let i = 0; i < zyklus.length; i++) {
      const t = zyklus[(zeiger + i) % zyklus.length];
      if (!belegt.get(p.kanal)?.has(t)) {
        n = (zeiger + i) % zyklus.length;
        break;
      }
    }
    const tag = zyklus[n];
    out.push(tag);
    belegt.set(p.kanal, (belegt.get(p.kanal) ?? new Set<Tag>()).add(tag));
    zeiger = (n + 1) % zyklus.length;
  }
  return out;
}

/**
 * Säulen der Reihe nach über alle Beiträge der vier Wochen: Jeder Beitrag bekommt eine Säule mit der bisher kleinsten Zahl an Beiträgen,
 * bei Gleichstand die, die dieser Kanal am längsten nicht hatte. So kommt jede Säule gleich oft vor (±1) und ein Kanal wechselt die Säule.
 */
function saeulenVergeben(beitraege: { kanal: KanalKey }[], saeulen: readonly string[]): string[] {
  const zahl = saeulen.map(() => 0);
  const zuletzt = new Map<KanalKey, number[]>();
  return beitraege.map((b, i) => {
    const last = zuletzt.get(b.kanal) ?? saeulen.map(() => -1);
    const kleinste = Math.min(...zahl);
    let wahl = -1;
    for (let s = 0; s < saeulen.length; s++) {
      if (zahl[s] !== kleinste) continue;
      if (wahl === -1 || last[s] < last[wahl]) wahl = s;
    }
    zahl[wahl]++;
    last[wahl] = i;
    zuletzt.set(b.kanal, last);
    return saeulen[wahl];
  });
}

export function kanalMeldung(stunden: number, geplant: readonly KanalKey[], gestrichen: readonly KanalKey[]): string {
  const n = geplant.length;
  const liste = n === 0 ? "keiner" : geplant.map(kanalKurz).join(", ");
  return `Mit ${hoursText(stunden)} pro Woche ${n === 1 ? "reicht" : "reichen"} ${n} ${n === 1 ? "Kanal" : "Kanäle"}: ${liste}. Nicht eingeplant: ${gestrichen.map(kanalKurz).join(", ")}.`;
}

export const REGELMAESSIGKEIT_HINWEIS =
  "Weniger als 2 Beiträge pro Woche sind in Ordnung: Regelmässigkeit ist wichtiger als Menge. Lieber wenige Beiträge, die du durchhältst, als viele, die nach zwei Wochen enden (Richtwert von Alperna, keine Statistik).";

/** Baut den Plan: Zuteilung, Veröffentlichungstage, Säulen und Hinweise. Erwartet eine gültige Eingabe (validate); sonst bleibt er leer. */
export function buildPlan(input: Input): Plan {
  const z = allocate(input);
  const saeulen = input.saeulen.length > 0 ? input.saeulen : ["Beitrag"];

  const wochen: Woche[] = z.wochen.map((posten, i) => {
    const tage = tageVergeben(posten, input.produktionstag);
    // Sortiert nach Wochentag; bei gleichem Tag bleibt die Reihenfolge der Zuteilung (stabile Sortierung).
    const beitraege: Beitrag[] = posten
      .map((p, j) => ({ nr: j, b: { woche: i + 1, tag: tage[j], kanal: p.kanal, format: p.format, saeule: "", aufwand: p.aufwand } satisfies Beitrag }))
      .sort((x, y) => TAGE.indexOf(x.b.tag) - TAGE.indexOf(y.b.tag) || x.nr - y.nr)
      .map((x) => x.b);
    const aufwand = round2(beitraege.reduce((s, b) => s + b.aufwand, 0));
    return { nummer: i + 1, beitraege, aufwand, reserve: round2(z.verfuegbar - aufwand) };
  });

  // Säulen in zeitlicher Reihenfolge über alle vier Wochen
  const alle = wochen.flatMap((w) => w.beitraege);
  const namen = saeulenVergeben(alle, saeulen);
  alle.forEach((b, i) => (b.saeule = namen[i]));
  const zaehler = saeulen.map((name) => ({ name, anzahl: alle.filter((b) => b.saeule === name).length }));

  const plan: Plan = { input, verfuegbar: z.verfuegbar, geplant: z.geplant, gestrichen: z.gestrichen, ohneFormat: z.ohneFormat, wochen, saeulen: zaehler, kontrollen: [] };
  plan.kontrollen = kontrollTexte(plan);
  return plan;
}

function kontrollTexte(plan: Plan): string[] {
  const out: string[] = [];
  const { input } = plan;
  if (plan.gestrichen.length > 0) out.push(kanalMeldung(input.stunden, plan.geplant, plan.gestrichen));
  for (const k of plan.ohneFormat) out.push(ohneFormatHinweis(k));
  if (plan.geplant.length > 0 && Math.min(...plan.wochen.map((w) => w.beitraege.length)) < 2) out.push(REGELMAESSIGKEIT_HINWEIS);
  const alle = plan.wochen.flatMap((w) => w.beitraege);
  if (input.faehigkeiten.includes("video") && plan.geplant.includes("instagram") && !alle.some((b) => b.format === "kurzvideo")) {
    const kosten = aufwandTabelle(input.aufwand);
    out.push(
      `Video gewählt, aber im Plan fehlt die Zeit für ein Kurzvideo: Es braucht ${hoursText(kosten.kurzvideo)} pro Beitrag (Annahme von Alperna, keine Statistik). Mit mehr Stunden pro Woche rückt es in den Plan.`,
    );
  }
  const reserve = plan.wochen.length > 0 ? Math.min(...plan.wochen.map((w) => w.reserve)) : 0;
  if (plan.geplant.length > 0 && reserve >= RESERVE_HINWEIS_AB - EPS) {
    out.push(
      `Pro Woche bleiben mindestens ${hoursText(reserve)} Reserve. Der Plan nimmt höchstens ${MAX_BEITRAEGE_PRO_KANAL} Beiträge je Kanal und Woche (Richtwert von Alperna). Wähle einen weiteren Kanal oder eine weitere Fähigkeit, wenn du die Stunden nutzen willst.`,
    );
  }
  return out;
}

export type Kontrolle = { summeOk: boolean; saeulenOk: boolean };

/** Prüft den fertigen Plan: jede Woche im Budget (Beiträge plus Planung ≤ Stunden), jede Säule gleich oft (±1). */
export function kontrolle(plan: Plan): Kontrolle {
  const summeOk = plan.wochen.every((w) => w.aufwand <= plan.verfuegbar + EPS);
  const zahlen = plan.saeulen.map((s) => s.anzahl);
  const saeulenOk = zahlen.length === 0 || Math.max(...zahlen) - Math.min(...zahlen) <= 1;
  return { summeOk, saeulenOk };
}

// ---- Produktionsblock ---------------------------------------------------------------------------------------------

export type Produktion = { woche: number; tag: Tag; stunden: number; anzahl: number; text: string };

/** Pro Woche ein Satz: «Montag: 3,5 Stunden für 5 Beiträge am Stück». Die Planung steht nicht darin. */
export function productionBlock(plan: Plan, tag: Tag = plan.input.produktionstag): Produktion[] {
  return plan.wochen.map((w) => {
    const anzahl = w.beitraege.length;
    const text =
      anzahl === 0
        ? `${tag}: In dieser Woche ist nichts zu produzieren`
        : `${tag}: ${hoursText(w.aufwand)} für ${anzahl} ${anzahl === 1 ? "Beitrag" : "Beiträge"} am Stück`;
    return { woche: w.nummer, tag, stunden: w.aufwand, anzahl, text };
  });
}

// ---- Dokument, CSV, CRM -------------------------------------------------------------------------------------------

export const HINWEISE: readonly string[] = [
  "Der Aufwand je Format ist eine Annahme von Alperna, keine Statistik. Miss deine Zeiten in der ersten Woche und passe sie an.",
  "Regelmässigkeit ist wichtiger als Menge (Richtwert von Alperna, keine Statistik). Starte lieber mit weniger und halte den Rhythmus.",
  "Prüfe den Plan nach vier Wochen: Was lief, was hat Zeit gekostet? Passe Stunden, Kanäle und Säulen an.",
];

const countText = (n: number): string => `${n} ${n === 1 ? "Beitrag" : "Beiträge"}`;

export function beitraegeProWocheText(plan: Plan): string {
  const n = plan.wochen.map((w) => w.beitraege.length);
  const total = n.reduce((s, v) => s + v, 0);
  const lo = Math.min(...n);
  const hi = Math.max(...n);
  const pro = lo === hi ? String(lo) : `${lo} bis ${hi}`;
  return `${pro} pro Woche, ${total} in vier Wochen`;
}

export const documentFilename = (firma?: string): string => `posting-plan${firma?.trim() ? `-${safeFilename(firma, "betrieb")}` : ""}`;
export const csvFilename = (firma?: string): string => `${documentFilename(firma)}.csv`;

const KONTROLLE_OK = "Jede Woche liegt im Budget, jede Säule kommt gleich oft vor (±1).";

/** Wochentage im Raster: die mit einem Beitrag und der Produktionstag, in der Reihenfolge der Woche. */
export function rasterTage(plan: Plan): Tag[] {
  const used = new Set<Tag>([plan.input.produktionstag, ...plan.wochen.flatMap((w) => w.beitraege.map((b) => b.tag))]);
  return TAGE.filter((t) => used.has(t));
}

/** Wochenansicht: vier Zeilen (Wochen), Spalten sind die Wochentage; in jeder Zelle stehen Kanal und Format, am Produktionstag zuerst «Produktion». */
export function wochenraster(plan: Plan): Extract<DocBlock, { type: "grid" }> {
  const tage = rasterTage(plan);
  return {
    type: "grid",
    title: "Die vier Wochen im Überblick",
    columns: tage.map((t) => t.slice(0, 2)),
    rows: plan.wochen.map((w) => ({
      label: `Woche ${w.nummer}`,
      cells: tage.map((t) =>
        [t === plan.input.produktionstag ? "Produktion" : "", ...w.beitraege.filter((b) => b.tag === t).map((b) => `${kanalKurz(b.kanal)}, ${formatLabel(b.format)}`)].filter(Boolean).join("\n"),
      ),
    })),
  };
}

/** Hinweis auf Alperna aus dem Plan: Aufwand pro Woche und Zahl der Beiträge. Ohne Beiträge kein Hinweis. */
export function pitchFor(plan: Plan): PitchSpec | null {
  const n = plan.wochen.reduce((s, w) => s + w.beitraege.length, 0);
  if (n === 0) return null;
  const pro = plan.wochen.reduce((s, w) => s + w.aufwand + PLANUNG, 0) / plan.wochen.length;
  return { baustein: "Social Media", satz: `Dein Plan hat ${countText(n)} in vier Wochen und braucht rund ${hoursText(pro)} pro Woche.` };
}

/** Plan als Dokument für Bildschirm, PDF, Word und Markdown: Überblick, Zu beachten, vier Wochen, Produktionsblock, Annahmen, Hinweise. */
export function toDocument(plan: Plan, firma?: string): DocumentModel {
  const { input } = plan;
  const f = firma?.trim() ?? "";
  const kosten = aufwandTabelle(input.aufwand);
  const k = kontrolle(plan);
  const reserve = plan.wochen.length > 0 ? Math.min(...plan.wochen.map((w) => w.reserve)) : 0;
  const kontrolleText = k.summeOk && k.saeulenOk ? KONTROLLE_OK : [k.summeOk ? "" : "Eine Woche liegt über dem Budget.", k.saeulenOk ? "" : "Die Säulen sind ungleich verteilt."].filter(Boolean).join(" ");

  const blocks: DocBlock[] = [
    { type: "heading", level: 2, text: "Überblick" },
    {
      type: "facts",
      items: [
        { label: "Stunden pro Woche", value: `${hoursText(input.stunden)}, davon ${hoursText(PLANUNG)} Planung` },
        { label: "Beiträge", value: beitraegeProWocheText(plan) },
        { label: "Kanäle", value: plan.geplant.length > 0 ? kanaeleText(plan.geplant) : "keiner" },
        { label: "Fähigkeiten", value: normalizeFaehigkeiten(input.faehigkeiten).map(faehigkeitLabel).join(", ") },
        { label: "Säulen", value: plan.saeulen.map((s) => `${s.name} (${s.anzahl})`).join(", ") },
        { label: "Produktionstag", value: input.produktionstag },
        ...(reserve > EPS ? [{ label: "Reserve", value: `mindestens ${hoursText(reserve)} pro Woche` }] : []),
        { label: "Kontrolle", value: kontrolleText },
      ],
    },
  ];
  // Bildschirm: Wochenansicht und Verteilung der Säulen. In PDF, Word und Markdown werden sie zu Tabellen.
  if (plan.wochen.some((w) => w.beitraege.length > 0)) blocks.push(wochenraster(plan));
  if (plan.saeulen.length > 1 && plan.saeulen.some((s) => s.anzahl > 0)) {
    blocks.push({ type: "split", title: "Verteilung auf die Säulen", items: plan.saeulen.map((s) => ({ label: s.name, value: s.anzahl })) });
  }
  if (plan.kontrollen.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Zu beachten" }, { type: "list", items: plan.kontrollen });
  }
  // Die Beiträge je Woche und die Annahmen sind Nachschlagewerk: am Bildschirm zugeklappt, in PDF, Word und Markdown offen.
  const wochenBlocks: DocBlock[] = [];
  for (const w of plan.wochen) {
    wochenBlocks.push({ type: "heading", level: 3, text: `Woche ${w.nummer}` });
    if (w.beitraege.length === 0) {
      wochenBlocks.push({ type: "paragraph", text: "In dieser Woche steht kein Beitrag im Plan." });
      continue;
    }
    wochenBlocks.push({
      type: "table",
      header: ["Tag", "Kanal", "Format", "Säule", "Aufwand"],
      widths: [1.3, 1.5, 1.5, 2.6, 1.3],
      rows: w.beitraege.map((b) => [b.tag, kanalKurz(b.kanal), formatLabel(b.format), b.saeule, hoursText(b.aufwand)]),
    });
    wochenBlocks.push({
      type: "paragraph",
      text: `${countText(w.beitraege.length)}: ${hoursText(w.aufwand)}, dazu ${hoursText(PLANUNG)} Planung. Reserve: ${hoursText(w.reserve)}.`,
    });
  }
  blocks.push({ type: "details", title: "Alle Beiträge, Woche für Woche", summary: "Tag, Kanal, Format, Säule und Aufwand für jede der vier Wochen.", blocks: wochenBlocks });
  blocks.push(
    { type: "heading", level: 2, text: "Produktionsblock" },
    {
      type: "paragraph",
      text: "Produziere alle Beiträge einer Woche an einem Tag am Stück. An den übrigen Tagen veröffentlichst du, ohne neu anzufangen.",
    },
    { type: "list", items: productionBlock(plan).map((p) => `Woche ${p.woche}, ${p.text}`) },
    {
      type: "details",
      title: "Annahmen und Hinweise",
      summary: "Aufwand je Format, Rhythmus und was du beachten solltest.",
      blocks: [
        { type: "heading", level: 3, text: "Annahmen" },
        {
          type: "table",
          header: ["Format", "Aufwand pro Beitrag"],
          widths: [3, 2],
          rows: FORMATE.map((fo) => [fo.label, `${hoursText(kosten[fo.key])}${input.aufwand[fo.key] !== undefined && Math.abs(kosten[fo.key] - AUFWAND[fo.key]) > EPS ? " (angepasst)" : ""}`]),
        },
        {
          type: "list",
          items: [
            `Planung: ${hoursText(PLANUNG)} pro Woche, vom Zeitbudget abgezogen.`,
            `Veröffentlichungstage: ${PUBLIKATIONSTAGE.join(", ")} der Reihe nach, nie am Produktionstag (Richtwert von Alperna).`,
            `Rhythmus: Newsletter in Woche 2 und 4, Website-Beitrag in Woche 3, höchstens ${MAX_BEITRAEGE_PRO_KANAL} Beiträge je Kanal und Woche (Richtwert von Alperna).`,
            `Reihenfolge, wenn die Stunden knapp sind: ${WICHTIGKEIT.map(kanalKurz).join(", ")} (Richtwert von Alperna).`,
          ],
        },
        { type: "heading", level: 3, text: "Hinweise" },
        { type: "list", items: [...HINWEISE] },
      ],
    },
  );

  return {
    title: "Posting-Plan für vier Wochen",
    subtitle: [f, `${hoursText(input.stunden)} pro Woche`].filter(Boolean).join(", "),
    ...(f ? { firma: f } : {}),
    blocks,
    filename: documentFilename(f),
  };
}

export const CSV_HEADER = ["Woche", "Tag", "Kanal", "Format", "Säule", "Aufwand in Stunden"] as const;

/** Alle Beiträge als Tabelle: Woche;Tag;Kanal;Format;Säule;Aufwand in Stunden. UTF-8 mit BOM, Semikolon, CRLF. */
export function toCsv(plan: Plan): string {
  const rows = plan.wochen.flatMap((w) => w.beitraege.map((b) => [String(b.woche), b.tag, kanalKurz(b.kanal), formatLabel(b.format), b.saeule, numberCH(b.aufwand, 2)]));
  return CSV_BOM + [CSV_HEADER as readonly string[], ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Die Angaben fürs CRM, eine je Zeile. */
export function eingabeText(input: Input): string {
  const geaendert = FORMAT_KEYS.filter((f) => input.aufwand[f] !== undefined).map((f) => `${formatLabel(f)} ${hoursText(input.aufwand[f] as number)}`);
  return [
    `Stunden pro Woche: ${hoursShort(input.stunden)}`,
    `Kanäle: ${kanaeleText(input.kanaele)}`,
    `Fähigkeiten: ${normalizeFaehigkeiten(input.faehigkeiten).map(faehigkeitLabel).join(", ")}`,
    `Säulen: ${input.saeulen.join(", ")}`,
    `Produktionstag: ${input.produktionstag}`,
    `Aufwand angepasst: ${geaendert.length > 0 ? geaendert.join("; ") : "nein"}`,
  ].join("\n");
}

/** Das Ergebnis fürs CRM: das Markdown des Dokuments. Der Überblick steht oben (Kürzung auf 1'900 Zeichen). */
export function ausgabeText(plan: Plan, firma?: string): string {
  return toMarkdown(toDocument(plan, firma));
}

// ---- Formular -----------------------------------------------------------------------------------------------------

export type PlanForm = {
  stunden: string;
  /** null: noch nicht gewählt, es gilt die Vorbelegung aus dem Profil. */
  kanaele: KanalKey[] | null;
  faehigkeiten: Faehigkeit[];
  /** Zeilen für die Säulen; gelten nur, wenn das Profil keine Säulen nennt. */
  saeulen: string[];
  produktionstag: Tag;
  /** Eingaben in Stunden als Text; leer oder gleich dem Standard heisst: kein Wert überschrieben. */
  aufwand: Partial<Record<FormatKey, string>>;
};

export const EMPTY_FORM: PlanForm = { stunden: "", kanaele: null, faehigkeiten: ["text"], saeulen: ["", ""], produktionstag: "Montag", aufwand: {} };

/** Zahl aus einem Eingabefeld: Komma oder Punkt als Dezimalzeichen; null, wenn es keine Zahl ist. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const cleanName = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Säulen aus dem Firmenprofil: Namen, bereinigt, höchstens fünf, jeder höchstens 40 Zeichen. `total` ist die Zahl im Profil. */
export function saeulenAusProfil(profile: Pick<Profile, "contentSaeulen">): { namen: string[]; total: number } {
  const alle: string[] = [];
  for (const s of profile.contentSaeulen ?? []) {
    const name = typeof s === "object" && s !== null && typeof (s as Record<string, unknown>).name === "string" ? cleanName((s as Record<string, string>).name).slice(0, MAX_SAEULE).trim() : "";
    if (name && !alle.some((a) => a.toLowerCase() === name.toLowerCase())) alle.push(name);
  }
  return { namen: alle.slice(0, MAX_SAEULEN), total: alle.length };
}

/** Kanäle des Formulars: gewählte, sonst aus dem Profil, sonst Instagram und Google-Unternehmensprofil. */
export function effectiveKanaele(form: Pick<PlanForm, "kanaele">, profile: Pick<Profile, "kanaele">): KanalKey[] {
  return form.kanaele ?? kanaeleVorschlag(profile);
}

/** true, wenn die angezeigten Kanäle aus dem Firmenprofil stammen (noch nicht selbst gewählt und mindestens ein Kanal erkannt). */
export function kanaeleVomProfil(form: Pick<PlanForm, "kanaele">, profile: Pick<Profile, "kanaele">): boolean {
  return form.kanaele === null && kanaeleAusProfil(profile).length > 0;
}

/** Säulen, mit denen geplant wird: die aus dem Profil, sonst die ausgefüllten Zeilen. */
export function effectiveSaeulen(form: Pick<PlanForm, "saeulen">, profile: Pick<Profile, "contentSaeulen">): string[] {
  const aus = saeulenAusProfil(profile).namen;
  if (aus.length > 0) return aus;
  return form.saeulen.map(cleanName).filter((s) => s !== "");
}

export type FormResult = { ok: true; input: Input } | { ok: false; error: string };

/** Formular → Eingabe. Gibt eine Meldung zurück, wenn etwas fehlt; sie erscheint vor dem Fenster für die E-Mail-Adresse. */
export function inputFromForm(form: PlanForm, profile: Pick<Profile, "kanaele" | "contentSaeulen">): FormResult {
  const stunden = parseDecimal(form.stunden);
  if (stunden === null) return { ok: false, error: `Gib die Stunden pro Woche als Zahl an, zum Beispiel 3,5 (zwischen ${numberCH(MIN_STUNDEN)} und ${MAX_STUNDEN}).` };
  const aufwand: Partial<Record<FormatKey, number>> = {};
  for (const f of FORMAT_KEYS) {
    const text = form.aufwand[f]?.trim() ?? "";
    if (text === "") continue;
    const v = parseDecimal(text);
    if (v === null) return { ok: false, error: `Aufwand: ${formatLabel(f)}: Gib die Stunden als Zahl an, zum Beispiel 0,5.` };
    if (Math.abs(round2(v) - AUFWAND[f]) > EPS) aufwand[f] = round2(v);
  }
  const input: Input = {
    stunden: round2(stunden),
    kanaele: normalizeKanaele(effectiveKanaele(form, profile)),
    faehigkeiten: normalizeFaehigkeiten(form.faehigkeiten),
    saeulen: effectiveSaeulen(form, profile),
    produktionstag: form.produktionstag,
    aufwand,
  };
  const problem = validate(input);
  return problem ? { ok: false, error: problem } : { ok: true, input };
}

/** Gespeicherte Eingabe → Formular. Die Zeilen für die Säulen haben immer mindestens zwei Felder. */
export function formFromInput(input: Input | null): PlanForm {
  if (!input) return { ...EMPTY_FORM, saeulen: [...EMPTY_FORM.saeulen], aufwand: {} };
  const saeulen = [...input.saeulen];
  while (saeulen.length < 2) saeulen.push("");
  const aufwand: Partial<Record<FormatKey, string>> = {};
  for (const f of FORMAT_KEYS) if (input.aufwand[f] !== undefined) aufwand[f] = String(input.aufwand[f]);
  return {
    stunden: input.stunden > 0 ? String(input.stunden) : "",
    kanaele: input.kanaele.length > 0 ? [...input.kanaele] : null,
    faehigkeiten: input.faehigkeiten.length > 0 ? [...input.faehigkeiten] : ["text"],
    saeulen,
    produktionstag: input.produktionstag,
    aufwand,
  };
}

// ---- Gespeicherter Stand ------------------------------------------------------------------------------------------

export type State = { v: 1; phase: "edit" | "result"; input: Input | null; output?: Plan };

export const EMPTY_STATE: State = { v: 1, phase: "edit", input: null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Liest eine gespeicherte Eingabe tolerant: Unbrauchbares fällt weg, ob sie gültig ist, sagt validate. */
export function parseInput(raw: unknown): Input | null {
  if (!isRecord(raw)) return null;
  const saeulen: string[] = [];
  if (Array.isArray(raw.saeulen)) {
    for (const s of raw.saeulen) {
      const name = typeof s === "string" ? cleanName(s).slice(0, MAX_SAEULE).trim() : "";
      if (name && !saeulen.some((a) => a.toLowerCase() === name.toLowerCase())) saeulen.push(name);
      if (saeulen.length >= MAX_SAEULEN) break;
    }
  }
  const aufwand: Partial<Record<FormatKey, number>> = {};
  if (isRecord(raw.aufwand)) {
    for (const f of FORMAT_KEYS) {
      const v = raw.aufwand[f];
      if (typeof v === "number" && Number.isFinite(v) && v >= MIN_AUFWAND - EPS && v <= MAX_AUFWAND + EPS) aufwand[f] = round2(v);
    }
  }
  return {
    stunden: typeof raw.stunden === "number" && Number.isFinite(raw.stunden) ? round2(raw.stunden) : 0,
    kanaele: Array.isArray(raw.kanaele) ? normalizeKanaele(raw.kanaele) : [],
    faehigkeiten: Array.isArray(raw.faehigkeiten) ? normalizeFaehigkeiten(raw.faehigkeiten) : [],
    saeulen,
    produktionstag: isTag(raw.produktionstag) ? raw.produktionstag : "Montag",
    aufwand,
  };
}

/**
 * Liest den gespeicherten Stand; kaputte Daten ergeben den leeren Stand. «result» gilt nur, wenn die Eingabe gültig ist;
 * der Plan wird aus der Eingabe neu gerechnet, ein gespeicherter Plan zählt nicht.
 */
export function parseState(raw: unknown): State {
  if (!isRecord(raw) || raw.v !== 1) return EMPTY_STATE;
  const input = parseInput(raw.input);
  if (raw.phase === "result" && input && validate(input) === null) return { v: 1, phase: "result", input, output: buildPlan(input) };
  return { v: 1, phase: "edit", input };
}
