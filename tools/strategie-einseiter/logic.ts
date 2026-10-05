import { parseState as parseQuestionnaireState } from "@/components/tool/questionnaire";
import { chf, dateCH, pctCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { toolStateKey } from "@/lib/progress";
import { SLUG as BOTSCHAFTEN_SLUG, parseState as parseBotschaften } from "@/tools/botschaften/logic";
import { SLUG as SAEULEN_SLUG, kanalLabel, parseState as parseSaeulen } from "@/tools/content-saeulen/logic";
import { SLUG as CHECK_SLUG, host, parseCheckState } from "@/tools/digitaler-auftritt-check/logic";
import { SLUG as ICP_SLUG, parseState as parseIcp } from "@/tools/icp-builder/logic";
import { SLUG as MARKE_SLUG, parseState as parseMarke } from "@/tools/markenplattform/logic";
import { SLUG as NUTZEN_SLUG, parseState as parseNutzen } from "@/tools/nutzenversprechen/logic";
import { SLUG as PERSONA_SLUG, parseState as parsePersona } from "@/tools/persona/logic";
import { SLUG as POSITIONIERUNG_SLUG, parseState as parsePositionierung } from "@/tools/positionierung/logic";
import { SLUG as REIFEGRAD_SLUG, checkInfo, evaluate, type Stufe } from "@/tools/reifegrad-check/logic";
import { SLUG as SWOT_SLUG, parseState as parseSwot } from "@/tools/swot/logic";

// Strategie-Einseiter: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Das Werkzeug fragt nichts ab. Es liest das Firmenprofil und die Stände der anderen Strategie-Werkzeuge aus dem
// Browser (mt:<slug>) und setzt daraus eine Seite zusammen. Fehlende Bausteine stehen als Platzhalter mit dem Namen
// des Werkzeugs; sie werden nie abgefragt. Keine Zahlen ausser denen aus den Ständen, keine Bewertung «gut/schlecht».
// Spec: specs/strategie-einseiter.md

export const SLUG = "strategie-einseiter";
export const BUDGET_SLUG = "budget-planer";
export { BOTSCHAFTEN_SLUG, CHECK_SLUG, ICP_SLUG, MARKE_SLUG, NUTZEN_SLUG, PERSONA_SLUG, POSITIONIERUNG_SLUG, REIFEGRAD_SLUG, SAEULEN_SLUG, SWOT_SLUG };

export const TITEL = "Marketingstrategie auf einer Seite";

/** Woher ein Inhalt stammt, in Worten für Übersicht, Dokument und CRM. */
export const QUELLE_PROFIL = "Firmenprofil";
export const quelleWerkzeug = (name: string): string => `Werkzeug ${name}`;

/** Platzhalter für einen fehlenden Teil, im Dokument als Text, in der Übersicht mit Link. */
export const offen = (werkzeugName: string): string => `[Noch offen: ${werkzeugName}]`;

/** So viele Einträge höchstens je Liste auf der Seite (Merkmale, Nutzen, Botschaften, Budget-Kanäle). */
export const MAX_EINTRAEGE = 3;

// ---- Die acht Bausteine ------------------------------------------------------------------------------

export const BAUSTEIN_KEYS = ["positionierung", "zielgruppe", "nutzen", "marke", "botschaft", "kanaele", "budget", "lage"] as const;
export type BausteinKey = (typeof BAUSTEIN_KEYS)[number];

export type BausteinDef = {
  key: BausteinKey;
  label: string;
  /** Das Werkzeug, das den Baustein liefert; bei «fehlt» führt der Link dorthin. */
  werkzeugSlug: string;
  werkzeugName: string;
  link: string;
  /** Alle Quellen in Worten, für die Übersicht. */
  quelle: string;
};

export const WERKZEUG_NAMEN = {
  positionierung: "Positionierungs-Check",
  icp: "ICP-Builder",
  persona: "Persona-Generator",
  nutzen: "Nutzenversprechen",
  marke: "Markenplattform",
  botschaften: "Kernbotschaften",
  saeulen: "Content-Säulen",
  budget: "Marketing-Budget-Planer",
  swot: "SWOT-Analyse",
  reifegrad: "Reifegrad-Check",
  check: "Digitaler-Auftritt-Check",
  profil: "Firmenprofil",
} as const;

const def = (key: BausteinKey, label: string, werkzeugSlug: string, werkzeugName: string, quelle: string): BausteinDef => ({
  key,
  label,
  werkzeugSlug,
  werkzeugName,
  link: `/tools/${werkzeugSlug}`,
  quelle,
});

export const BAUSTEINE: readonly BausteinDef[] = [
  def("positionierung", "Positionierung", POSITIONIERUNG_SLUG, WERKZEUG_NAMEN.positionierung, "Firmenprofil (Positionierung) oder Positionierungs-Check"),
  def("zielgruppe", "Zielgruppe", ICP_SLUG, WERKZEUG_NAMEN.icp, "Firmenprofil (Primärsegment, Zielgruppen, Personas), ICP-Builder, Persona-Generator"),
  def("nutzen", "Nutzen", NUTZEN_SLUG, WERKZEUG_NAMEN.nutzen, "Nutzenversprechen"),
  def("marke", "Marke", MARKE_SLUG, WERKZEUG_NAMEN.marke, "Firmenprofil (Marke) oder Markenplattform"),
  def("botschaft", "Botschaft", BOTSCHAFTEN_SLUG, WERKZEUG_NAMEN.botschaften, "Kernbotschaften"),
  def("kanaele", "Kanäle und Säulen", SAEULEN_SLUG, WERKZEUG_NAMEN.saeulen, "Firmenprofil (Kanäle, Content-Säulen) oder Content-Säulen"),
  def("budget", "Budget", BUDGET_SLUG, WERKZEUG_NAMEN.budget, "Firmenprofil (Budget pro Jahr) oder Marketing-Budget-Planer"),
  def("lage", "Lage und Massnahmen", SWOT_SLUG, WERKZEUG_NAMEN.swot, "SWOT-Analyse, Reifegrad-Check, Digitaler-Auftritt-Check"),
];

export const TOTAL = BAUSTEINE.length;

export function bausteinDef(key: BausteinKey): BausteinDef {
  return BAUSTEINE.find((b) => b.key === key) as BausteinDef;
}

/** Alle Schlüssel im Browser, die das Werkzeug liest (ausser dem Profil). */
export const QUELLEN_SLUGS = [POSITIONIERUNG_SLUG, ICP_SLUG, PERSONA_SLUG, NUTZEN_SLUG, MARKE_SLUG, BOTSCHAFTEN_SLUG, SAEULEN_SLUG, BUDGET_SLUG, SWOT_SLUG, REIFEGRAD_SLUG, CHECK_SLUG] as const;
export const QUELLEN_KEYS: readonly string[] = QUELLEN_SLUGS.map(toolStateKey);

// ---- Inhalt je Baustein ---------------------------------------------------------------------------------

export type Persona = { name: string; kurz: string };
export type Saeule = { name: string; anteil: number | null };
export type BudgetKanal = { label: string; anteil: number; jahr: number };
export type Folgerung = { massnahme: string; nutzt: string; behebt: string; aufwand: string };
export type Dimension = { name: string; score: number; stufe: Stufe; schritte: string[] };
export type ReifegradKurz = { gesamt: number; stufe: Stufe; staerkste: Dimension; schwaechste: Dimension };
export type CheckKurz = { score: number; host: string; datum: string };

export type Inhalt =
  | { key: "positionierung"; kernsatz: string; fuerWen: string; wasAnders: string }
  | { key: "zielgruppe"; segment: string; merkmale: string[]; persona: Persona | null }
  | { key: "nutzen"; kurz: string; nutzen: string[] }
  | { key: "marke"; versprechen: string; werte: string[]; tonalitaet: string; woerter: string[] }
  | { key: "botschaft"; hauptbotschaft: string; botschaften: { fuer: string; satz: string }[] }
  | { key: "kanaele"; kanaele: string[]; saeulen: Saeule[]; rhythmus: string }
  | { key: "budget"; jahr: number | null; monat: number | null; kanaele: BudgetKanal[] }
  | { key: "lage"; einSatz: string; folgerungen: Folgerung[]; reifegrad: ReifegradKurz | null; check: CheckKurz | null };

export type InhaltVon<K extends BausteinKey> = Extract<Inhalt, { key: K }>;

export type Baustein = BausteinDef & {
  vorhanden: boolean;
  /** Woher der Inhalt kommt («Firmenprofil», «Werkzeug Persona-Generator»); leer, wenn er fehlt. */
  quellen: string[];
  inhalt: Inhalt;
};

export type Betrieb = { firma: string; ort: string; branche: string };

export type Einseiter = {
  betrieb: Betrieb;
  bausteine: Baustein[];
  /** Zahl der vorhandenen Bausteine, 0 bis TOTAL. */
  vorhanden: number;
  total: number;
};

export function inhaltOf<K extends BausteinKey>(einseiter: Einseiter, key: K): InhaltVon<K> {
  return (einseiter.bausteine.find((b) => b.key === key) as Baustein).inhalt as InhaltVon<K>;
}

// ---- Lesen -------------------------------------------------------------------------------------------

/** Liest den rohen Wert eines Schlüssels im Browser (zum Beispiel readLocal aus lib/storage.ts). */
export type Read = (key: string) => string | null | undefined;

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown, max = 10): string[] => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, max) : []);

/** Einträge im Profil, die einen Namen tragen (Zielgruppen, Personas, Kanäle, Säulen). */
function namen(list: unknown, keys: string[] = ["name"]): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (!isObject(item)) continue;
    const name = keys.map((k) => str(item[k], 120)).find(Boolean);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Stand des Budget-Planers, defensiv gelesen: { v: 1, output: { jahr, monat, kanaele: [{ label, anteil, jahr }], summe } }. */
export function parseBudget(raw: unknown): { jahr: number; monat: number | null; kanaele: BudgetKanal[] } | null {
  if (!isObject(raw) || raw.v !== 1 || !isObject(raw.output)) return null;
  const o = raw.output;
  const jahr = num(o.jahr);
  if (jahr === null || jahr < 0) return null;
  const kanaele: BudgetKanal[] = [];
  if (Array.isArray(o.kanaele)) {
    for (const k of o.kanaele) {
      if (!isObject(k)) continue;
      const label = str(k.label, 80);
      const anteil = num(k.anteil);
      const betrag = num(k.jahr);
      if (label && anteil !== null && betrag !== null) kanaele.push({ label, anteil, jahr: betrag });
    }
  }
  return { jahr, monat: num(o.monat), kanaele };
}

function reifegradKurz(reifegradRaw: unknown, checkRaw: unknown): ReifegradKurz | null {
  const saved = parseQuestionnaireState(reifegradRaw);
  if (saved.phase !== "result") return null;
  const result = evaluate(saved.answers, checkInfo(parseCheckState(checkRaw)));
  let best = result.dimensionen[0];
  let worst = result.dimensionen[0];
  for (const d of result.dimensionen) {
    if (d.score > best.score) best = d;
    if (d.score < worst.score) worst = d;
  }
  const dim = (d: typeof best): Dimension => ({ name: d.name, score: d.score, stufe: d.stufe, schritte: [...d.schritte] });
  return { gesamt: result.gesamt, stufe: result.stufe, staerkste: dim(best), schwaechste: dim(worst) };
}

function checkKurz(checkRaw: unknown): CheckKurz | null {
  const saved = parseCheckState(checkRaw);
  if (saved.phase !== "result" || !saved.result) return null;
  return { score: Math.round(saved.result.score), host: host(saved.result.url), datum: dateCH(saved.result.checkedAt) };
}

/**
 * Zieht alles zusammen: Firmenprofil zuerst, dann die Stände der Werkzeuge. Kaputte Stände zählen als «fehlt», nie als
 * Fehler. `read` liefert den rohen Wert zu einem Schlüssel im Browser.
 */
export function collect(read: Read, profile: Profile): Einseiter {
  const state = (slug: string) => parseJson(read(toolStateKey(slug)));
  const marke = isObject(profile.marke) ? profile.marke : {};

  // 1. Positionierung
  const pos = parsePositionierung(state(POSITIONIERUNG_SLUG));
  const posProfil = str(profile.positionierung);
  const positionierung: InhaltVon<"positionierung"> = {
    key: "positionierung",
    kernsatz: posProfil || str(pos.output?.kernsatz),
    fuerWen: str(pos.output?.fuerWen),
    wasAnders: str(pos.output?.wasAnders),
  };
  const posQuellen = [posProfil ? QUELLE_PROFIL : "", !posProfil && pos.output ? quelleWerkzeug(WERKZEUG_NAMEN.positionierung) : ""].filter(Boolean);

  // 2. Zielgruppe
  const icp = parseIcp(state(ICP_SLUG));
  const personaState = parsePersona(state(PERSONA_SLUG));
  const segmentProfil = str(profile.primaersegment, 200) || namen(profile.zielgruppen)[0] || "";
  const segment = segmentProfil || str(icp.output?.segmentName, 200);
  const personaProfil = (Array.isArray(profile.personas) ? profile.personas : []).map((p) => (isObject(p) ? { name: str(p.name, 60), kurz: str(p.kurz, 300) } : null)).find((p) => p?.name);
  const persona: Persona | null = personaProfil ? personaProfil : personaState.output ? { name: str(personaState.output.name, 60), kurz: str(personaState.output.kurz, 300) } : null;
  const zielgruppe: InhaltVon<"zielgruppe"> = { key: "zielgruppe", segment, merkmale: strings(icp.output?.merkmale, MAX_EINTRAEGE), persona };
  const zielQuellen = [
    segmentProfil || personaProfil ? QUELLE_PROFIL : "",
    !segmentProfil && icp.output ? quelleWerkzeug(WERKZEUG_NAMEN.icp) : "",
    !personaProfil && personaState.output ? quelleWerkzeug(WERKZEUG_NAMEN.persona) : "",
  ].filter(Boolean);

  // 3. Nutzen
  const nutzenState = parseNutzen(state(NUTZEN_SLUG));
  const nutzen: InhaltVon<"nutzen"> = { key: "nutzen", kurz: str(nutzenState.output?.kurz, 200), nutzen: strings(nutzenState.output?.nutzen, MAX_EINTRAEGE) };
  const nutzenQuellen = nutzenState.output ? [quelleWerkzeug(WERKZEUG_NAMEN.nutzen)] : [];

  // 4. Marke
  const markeState = parseMarke(state(MARKE_SLUG));
  const werteProfil = strings(marke.werte, MAX_EINTRAEGE);
  const tonProfil = isObject(marke.tonalitaet) ? str(marke.tonalitaet.so, 400) : "";
  const woerterProfil = isObject(marke.woerter) ? strings(marke.woerter.verwenden, 5) : [];
  const hatMarkeProfil = werteProfil.length > 0 || tonProfil !== "" || woerterProfil.length > 0;
  const markeInhalt: InhaltVon<"marke"> = {
    key: "marke",
    versprechen: str(markeState.output?.versprechen, 300),
    werte: werteProfil.length > 0 ? werteProfil : strings(markeState.output?.werte.map((w) => w.name), MAX_EINTRAEGE),
    tonalitaet: tonProfil || str(markeState.output?.tonalitaet.so, 400),
    woerter: woerterProfil.length > 0 ? woerterProfil : strings(markeState.output?.woerter.verwenden, 5),
  };
  const markeQuellen = [hatMarkeProfil ? QUELLE_PROFIL : "", markeState.output ? quelleWerkzeug(WERKZEUG_NAMEN.marke) : ""].filter(Boolean);

  // 5. Botschaft
  const bot = parseBotschaften(state(BOTSCHAFTEN_SLUG));
  const botschaft: InhaltVon<"botschaft"> = {
    key: "botschaft",
    hauptbotschaft: str(bot.output?.hauptbotschaft, 300),
    botschaften: (bot.output?.botschaften ?? []).slice(0, MAX_EINTRAEGE).map((b) => ({ fuer: str(b.fuer, 80), satz: str(b.satz, 200) })),
  };
  const botQuellen = bot.output ? [quelleWerkzeug(WERKZEUG_NAMEN.botschaften)] : [];

  // 6. Kanäle und Säulen
  const saeulenState = parseSaeulen(state(SAEULEN_SLUG));
  const kanaeleProfil = namen(profile.kanaele, ["name", "kanal"]);
  const saeulenProfil: Saeule[] = (Array.isArray(profile.contentSaeulen) ? profile.contentSaeulen : [])
    .map((s) => (isObject(s) ? { name: str(s.name, 60), anteil: num(s.anteil) } : null))
    .filter((s): s is Saeule => Boolean(s?.name))
    .slice(0, 5);
  const saeulenWerkzeug: Saeule[] = (saeulenState.output?.saeulen ?? []).map((s) => ({ name: str(s.name, 60), anteil: s.anteil }));
  const kanaele: InhaltVon<"kanaele"> = {
    key: "kanaele",
    // Die gewählten Kanäle zählen nur mit einem fertigen Entwurf; eine Eingabe ohne Ergebnis ist kein Baustein.
    kanaele: kanaeleProfil.length > 0 ? kanaeleProfil : saeulenState.output ? (saeulenState.input?.kanaele ?? []).map(kanalLabel) : [],
    saeulen: saeulenProfil.length > 0 ? saeulenProfil : saeulenWerkzeug,
    rhythmus: str(saeulenState.output?.rhythmus.satz, 300),
  };
  const kanaeleQuellen = [kanaeleProfil.length > 0 || saeulenProfil.length > 0 ? QUELLE_PROFIL : "", saeulenState.output ? quelleWerkzeug(WERKZEUG_NAMEN.saeulen) : ""].filter(Boolean);

  // 7. Budget
  const budgetState = parseBudget(state(BUDGET_SLUG));
  const jahrProfil = num(profile.budgetJahr);
  const budget: InhaltVon<"budget"> = {
    key: "budget",
    jahr: jahrProfil ?? budgetState?.jahr ?? null,
    monat: budgetState?.monat ?? null,
    kanaele: [...(budgetState?.kanaele ?? [])].sort((a, b) => b.jahr - a.jahr).slice(0, MAX_EINTRAEGE),
  };
  const budgetQuellen = [jahrProfil !== null ? QUELLE_PROFIL : "", budgetState ? quelleWerkzeug(WERKZEUG_NAMEN.budget) : ""].filter(Boolean);

  // 8. Lage und Massnahmen
  const swot = parseSwot(state(SWOT_SLUG));
  const checkRaw = state(CHECK_SLUG);
  const reifegrad = reifegradKurz(state(REIFEGRAD_SLUG), checkRaw);
  const check = checkKurz(checkRaw);
  const lage: InhaltVon<"lage"> = {
    key: "lage",
    einSatz: str(swot.output?.einSatz, 300),
    folgerungen: (swot.output?.folgerungen ?? []).map((f) => ({ massnahme: str(f.massnahme, 200), nutzt: str(f.nutzt, 80), behebt: str(f.behebt, 80), aufwand: f.aufwand })),
    reifegrad,
    check,
  };
  const lageQuellen = [
    swot.output ? quelleWerkzeug(WERKZEUG_NAMEN.swot) : "",
    reifegrad ? quelleWerkzeug(WERKZEUG_NAMEN.reifegrad) : "",
    check ? quelleWerkzeug(WERKZEUG_NAMEN.check) : "",
  ].filter(Boolean);

  const rows: { inhalt: Inhalt; vorhanden: boolean; quellen: string[] }[] = [
    { inhalt: positionierung, vorhanden: positionierung.kernsatz !== "", quellen: posQuellen },
    { inhalt: zielgruppe, vorhanden: zielgruppe.segment !== "" || zielgruppe.persona !== null, quellen: zielQuellen },
    { inhalt: nutzen, vorhanden: nutzen.kurz !== "", quellen: nutzenQuellen },
    { inhalt: markeInhalt, vorhanden: markeInhalt.versprechen !== "" || markeInhalt.werte.length > 0, quellen: markeQuellen },
    { inhalt: botschaft, vorhanden: botschaft.hauptbotschaft !== "", quellen: botQuellen },
    { inhalt: kanaele, vorhanden: kanaele.kanaele.length > 0 || kanaele.saeulen.length > 0, quellen: kanaeleQuellen },
    { inhalt: budget, vorhanden: budget.jahr !== null, quellen: budgetQuellen },
    { inhalt: lage, vorhanden: lage.einSatz !== "" || reifegrad !== null || check !== null, quellen: lageQuellen },
  ];

  const bausteine: Baustein[] = rows.map((r) => ({ ...bausteinDef(r.inhalt.key), vorhanden: r.vorhanden, quellen: r.vorhanden ? r.quellen : [], inhalt: r.inhalt }));
  return {
    betrieb: { firma: str(profile.firma, 120), ort: str(profile.ort, 80), branche: str(profile.branche, 120) },
    bausteine,
    vorhanden: bausteine.filter((b) => b.vorhanden).length,
    total: TOTAL,
  };
}

/** «3 von 8 Bausteinen» für Zähler, Dokument und CRM. */
export function vollstaendigkeit(einseiter: Pick<Einseiter, "vorhanden" | "total">): string {
  return `${einseiter.vorhanden} von ${einseiter.total} Bausteinen`;
}

export function fehlende(einseiter: Einseiter): Baustein[] {
  return einseiter.bausteine.filter((b) => !b.vorhanden);
}

// ---- Massnahmen ----------------------------------------------------------------------------------------

export type Massnahme = { massnahme: string; woher: string; aufwand: string };

/** Aufwand der Reifegrad-Schritte kennt das Werkzeug nicht; ohne Grundlage keine Bewertung. */
export const AUFWAND_UNBEKANNT = "keine Angabe";

/** Massnahmen aus den Folgerungen der SWOT und den zwei nächsten Schritten der schwächsten Reifegrad-Dimension. */
export function massnahmen(einseiter: Einseiter): Massnahme[] {
  const lage = inhaltOf(einseiter, "lage");
  const out: Massnahme[] = lage.folgerungen.map((f) => ({ massnahme: f.massnahme, woher: WERKZEUG_NAMEN.swot, aufwand: f.aufwand }));
  if (lage.reifegrad) {
    const d = lage.reifegrad.schwaechste;
    for (const text of d.schritte.slice(0, 2)) out.push({ massnahme: text, woher: `${WERKZEUG_NAMEN.reifegrad}, Dimension «${d.name}»`, aufwand: AUFWAND_UNBEKANNT });
  }
  return out;
}

// ---- Dokument --------------------------------------------------------------------------------------------

const oder = (value: string, werkzeugName: string): string => value || offen(werkzeugName);

function reifegradText(r: ReifegradKurz): string {
  const gesamt = `${r.gesamt} von 100, Stufe «${r.stufe}»`;
  if (r.staerkste.name === r.schwaechste.name) return `${gesamt}; alle fünf Dimensionen liegen bei ${r.staerkste.score} von 100`;
  return `${gesamt}; stärkste Dimension «${r.staerkste.name}» (${r.staerkste.score}), schwächste «${r.schwaechste.name}» (${r.schwaechste.score})`;
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Seite 1 kompakt in Blöcken, Seite 2 die Massnahmen. */
export function toDocument(einseiter: Einseiter, now: Date = new Date()): DocumentModel {
  const { betrieb } = einseiter;
  const datum = dateCH(now);
  const pos = inhaltOf(einseiter, "positionierung");
  const ziel = inhaltOf(einseiter, "zielgruppe");
  const nutzen = inhaltOf(einseiter, "nutzen");
  const marke = inhaltOf(einseiter, "marke");
  const bot = inhaltOf(einseiter, "botschaft");
  const kan = inhaltOf(einseiter, "kanaele");
  const bud = inhaltOf(einseiter, "budget");
  const lage = inhaltOf(einseiter, "lage");
  const fehlt = fehlende(einseiter);

  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Firma", value: oder(betrieb.firma, WERKZEUG_NAMEN.profil) },
        { label: "Ort", value: oder(betrieb.ort, WERKZEUG_NAMEN.profil) },
        { label: "Branche", value: oder(betrieb.branche, WERKZEUG_NAMEN.profil) },
      ],
    },
    {
      type: "paragraph",
      text: `${vollstaendigkeit(einseiter)} vorhanden.${fehlt.length > 0 ? ` Noch offen: ${fehlt.map((b) => b.werkzeugName).join(", ")}.` : ""}`,
    },
    { type: "heading", level: 1, text: "Positionierung" },
    { type: "paragraph", text: oder(pos.kernsatz, WERKZEUG_NAMEN.positionierung) },
    { type: "heading", level: 1, text: "Für wen" },
    {
      type: "facts",
      items: [
        { label: "Segment", value: oder(ziel.segment, WERKZEUG_NAMEN.icp) },
        { label: "Persona", value: ziel.persona ? [ziel.persona.name, ziel.persona.kurz].filter(Boolean).join(": ") : offen(WERKZEUG_NAMEN.persona) },
      ],
    },
  ];
  if (ziel.merkmale.length > 0) blocks.push({ type: "list", items: ziel.merkmale });

  blocks.push({ type: "heading", level: 1, text: "Nutzen" }, { type: "paragraph", text: oder(nutzen.kurz, WERKZEUG_NAMEN.nutzen) });
  if (nutzen.nutzen.length > 0) blocks.push({ type: "list", items: nutzen.nutzen });

  blocks.push(
    { type: "heading", level: 1, text: "Marke" },
    {
      type: "facts",
      items: [
        { label: "Versprechen", value: oder(marke.versprechen, WERKZEUG_NAMEN.marke) },
        { label: "Werte", value: oder(marke.werte.join(", "), WERKZEUG_NAMEN.marke) },
        ...(marke.tonalitaet ? [{ label: "Tonalität", value: marke.tonalitaet }] : []),
        ...(marke.woerter.length > 0 ? [{ label: "Wörter", value: marke.woerter.join(", ") }] : []),
      ],
    },
    { type: "heading", level: 1, text: "Botschaft" },
    { type: "paragraph", text: oder(bot.hauptbotschaft, WERKZEUG_NAMEN.botschaften) },
  );
  if (bot.botschaften.length > 0) blocks.push({ type: "list", items: bot.botschaften.map((b) => `${b.fuer}: ${b.satz}`) });

  blocks.push({ type: "heading", level: 1, text: "Kanäle und Säulen" });
  const kanalZeilen = [
    kan.kanaele.length > 0 ? `Kanäle: ${kan.kanaele.join(", ")}` : "",
    ...kan.saeulen.map((s) => `Säule ${s.name}${s.anteil !== null ? ` (${pctCH(s.anteil)} der Beiträge)` : ""}`),
    kan.rhythmus ? `Rhythmus: ${kan.rhythmus}` : "",
  ].filter(Boolean);
  blocks.push(kanalZeilen.length > 0 ? { type: "list", items: kanalZeilen } : { type: "paragraph", text: offen(WERKZEUG_NAMEN.saeulen) });

  blocks.push({ type: "heading", level: 1, text: "Budget" });
  if (bud.jahr === null) blocks.push({ type: "paragraph", text: offen(WERKZEUG_NAMEN.budget) });
  else {
    blocks.push({
      type: "facts",
      items: [
        { label: "Pro Jahr", value: chf(bud.jahr) },
        { label: "Pro Monat", value: bud.monat !== null ? chf(bud.monat) : offen(WERKZEUG_NAMEN.budget) },
        {
          label: "Grösste Kanäle",
          value: bud.kanaele.length > 0 ? bud.kanaele.map((k) => `${k.label} ${chf(k.jahr)} (${pctCH(k.anteil)})`).join(", ") : offen(WERKZEUG_NAMEN.budget),
        },
      ],
    });
  }

  blocks.push(
    { type: "heading", level: 1, text: "Lage" },
    {
      type: "facts",
      items: [
        { label: "SWOT in einem Satz", value: oder(lage.einSatz, WERKZEUG_NAMEN.swot) },
        { label: "Reifegrad", value: lage.reifegrad ? reifegradText(lage.reifegrad) : offen(WERKZEUG_NAMEN.reifegrad) },
        { label: "Digitaler Auftritt", value: lage.check ? `${lage.check.score} von 100 (${lage.check.host}, geprüft am ${lage.check.datum})` : offen(WERKZEUG_NAMEN.check) },
      ],
    },
  );

  const liste = massnahmen(einseiter);
  blocks.push({ type: "heading", level: 1, text: "Massnahmen" });
  if (liste.length === 0) {
    blocks.push({ type: "paragraph", text: `Noch keine Massnahmen. ${offen(WERKZEUG_NAMEN.swot)} ${offen(WERKZEUG_NAMEN.reifegrad)}` });
  } else {
    blocks.push(
      { type: "paragraph", text: "Aus den Folgerungen der SWOT-Analyse und den zwei nächsten Schritten der schwächsten Dimension im Reifegrad-Check." },
      { type: "table", header: ["Massnahme", "Woher", "Aufwand"], widths: [4, 2, 1], rows: liste.map((m) => [m.massnahme, m.woher, m.aufwand]) },
    );
  }
  blocks.push({
    type: "paragraph",
    text: "Alle Inhalte stammen aus deinem Firmenprofil und den Ergebnissen deiner Werkzeuge; nichts ist neu bewertet. Was fehlt, steht als «Noch offen» mit dem Namen des Werkzeugs.",
  });

  return {
    title: TITEL,
    subtitle: `${betrieb.firma || "Dein Betrieb"}, ${datum}`,
    firma: betrieb.firma || undefined,
    datum,
    filename: `strategie-einseiter-${safeFilename(betrieb.firma, "betrieb")}`,
    blocks,
  };
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(einseiter: Einseiter, now: Date = new Date()): string {
  return toMarkdown(toDocument(einseiter, now));
}

// ---- CRM --------------------------------------------------------------------------------------------------

/** Die Angaben fürs CRM: Betrieb, Vollständigkeit und je Baustein Status mit Quelle, eine Zeile je Baustein. */
export function eingabeText(einseiter: Einseiter): string {
  const { betrieb } = einseiter;
  const betriebText = betrieb.firma ? [betrieb.firma, betrieb.ort].filter(Boolean).join(", ") : "fehlt";
  return [
    `Betrieb: ${betriebText} (${QUELLE_PROFIL})`,
    `Vollständigkeit: ${vollstaendigkeit(einseiter)}`,
    ...einseiter.bausteine.map((b) => (b.vorhanden ? `${b.label}: vorhanden (${b.quellen.join(", ")})` : `${b.label}: fehlt (${quelleWerkzeug(b.werkzeugName)})`)),
  ].join("\n");
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------------

export type SavedBaustein = { key: BausteinKey; vorhanden: boolean };
export type EinseiterOutput = { bausteine: SavedBaustein[]; erstelltAm: string };
/** `output` ist ein Objekt, sobald der Einseiter einmal erstellt wurde; so zählt der Pfad das Werkzeug als erledigt (lib/progress.ts). */
export type EinseiterState = { v: 1; output: EinseiterOutput | null };

export const EMPTY_STATE: EinseiterState = { v: 1, output: null };

export function toState(einseiter: Einseiter, now: Date = new Date()): EinseiterState {
  return { v: 1, output: { bausteine: einseiter.bausteine.map((b) => ({ key: b.key, vorhanden: b.vorhanden })), erstelltAm: now.toISOString() } };
}

/** Liest den gespeicherten Stand; bei kaputten Daten oder falscher Version gilt der leere Stand. */
export function parseState(raw: unknown): EinseiterState {
  if (!isObject(raw) || raw.v !== 1 || !isObject(raw.output)) return EMPTY_STATE;
  const o = raw.output;
  if (typeof o.erstelltAm !== "string" || Number.isNaN(new Date(o.erstelltAm).getTime()) || !Array.isArray(o.bausteine)) return EMPTY_STATE;
  const bausteine: SavedBaustein[] = [];
  for (const b of o.bausteine) {
    if (!isObject(b) || typeof b.vorhanden !== "boolean" || !(BAUSTEIN_KEYS as readonly unknown[]).includes(b.key)) return EMPTY_STATE;
    bausteine.push({ key: b.key as BausteinKey, vorhanden: b.vorhanden });
  }
  return { v: 1, output: { bausteine, erstelltAm: o.erstelltAm } };
}
