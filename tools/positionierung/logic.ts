import { z } from "zod";
import { KANTONE } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import type { PageRead } from "@/lib/read";
import { scoreBand } from "@/lib/score";
import { analyzeText } from "@/tools/textcheck/logic";
import { MAX_FREITEXT, MAX_FUNDE, MAX_HEADINGS, MAX_TEXT_CHARS, STIL_LABELS, positionierungInput, positionierungOutput, type PositionierungInput, type PositionierungOutput } from "./generator";

// Positionierungs-Check: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Teil 1 prüft den Text der Startseite im Browser (Floskeln über tools/textcheck/logic.ts, data/floskeln.json).
// Teil 2, der Entwurf, kommt über /api/generate aus generator.ts. Spec: specs/positionierung.md

export const SLUG = "positionierung";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";
export const RICHTWERT_HINWEIS = "Gewichte und Schwellen sind Richtwerte dieses Werkzeugs, keine Statistik. Geprüft wurde nur der Text der Startseite.";

// ---- Gruppen, Gewichte, Richtwerte ---------------------------------------------------------------

export const GRUPPEN = ["zielgruppe", "unterscheidung", "beweise", "kunde", "region", "floskeln"] as const;
export type Gruppe = (typeof GRUPPEN)[number];

/** Gewichte je Gruppe: Richtwerte dieses Werkzeugs, keine Statistik (specs/positionierung.md). Summe 100. */
export const GEWICHTE: Record<Gruppe, number> = {
  zielgruppe: 20,
  unterscheidung: 20,
  beweise: 20,
  kunde: 15,
  region: 15,
  floskeln: 10,
};

export const GRUPPEN_TITEL: Record<Gruppe, string> = {
  zielgruppe: "Für wen",
  unterscheidung: "Unterscheidung",
  beweise: "Beweise",
  kunde: "Kundenperspektive",
  region: "Ort und Region",
  floskeln: "Floskeln",
};

/** Schwellen: Richtwerte dieses Werkzeugs, keine Statistik. */
export const RICHTWERTE = {
  /** Anteil der Sätze an die Kundschaft (du, Sie) an allen Sätzen mit Anrede: ab hier volle Punkte. */
  kundenAnteilGut: 0.5,
  /** Ab hier die Hälfte der Punkte. */
  kundenAnteilTeil: 0.3,
  /** Ab so vielen Belegen volle Punkte; einer gibt die Hälfte. */
  beweiseGut: 2,
  /** Bis so viele Floskeln die Hälfte der Punkte, darüber keine. */
  floskelnTeil: 2,
  /** Ein Satz zählt für die Kundenperspektive erst ab so vielen Wörtern (Menüpunkte wie «Über uns» fallen weg). */
  satzMinWoerter: 3,
} as const;

const MAX_BEISPIELE = 4;

// ---- Typen ---------------------------------------------------------------------------------------

export type Status = "gut" | "teil" | "fehlt";

export type Fund = {
  /** Gruppe und Befund, zum Beispiel «zielgruppe-fehlt». */
  id: string;
  gruppe: Gruppe;
  titel: string;
  status: Status;
  punkte: number;
  max: number;
  hinweis: string;
  /** Stellen aus dem Text, mit etwas Umgebung. */
  beispiele: string[];
};

export type Kennzahlen = {
  woerter: number;
  saetze: number;
  wirSaetze: number;
  kundeSaetze: number;
  /** Anteil der Kundensätze an allen Sätzen mit Anrede; null ohne solche Sätze. */
  kundenAnteil: number | null;
  beweise: number;
  floskeln: number;
  /** Lesbarkeit nach Amstad aus dem Textcheck; null bei zu wenig Text. */
  lesbarkeit: { index: number; level: string } | null;
};

export type PositionierungCheck = { score: number; funde: Fund[]; kennzahlen: Kennzahlen };

export type CheckContext = { ort?: string; kanton?: string; firma?: string };

// ---- Muster --------------------------------------------------------------------------------------

const WORT = "\\p{L}[\\p{L}'’-]*";
const ZIELGRUPPEN =
  "Privatkund(?:en|innen|schaft)|Privatpersonen|Privathaushalte|Hausbesitzer(?:innen)?|Hauseigentümer(?:innen)?|Wohneigentümer(?:innen)?|Stockwerkeigentümer(?:innen)?|Eigentümer(?:innen)?|Vermieter(?:innen)?|Mieter(?:innen)?|Familien|Eltern|Kinder|Jugendliche|Senior(?:en|innen)|Paare|Frauen|Männer|KMU|Unternehmen|Unternehmer(?:innen)?|Firmen|Betriebe|Gewerbe(?:betriebe)?|Handwerker(?:innen)?|Handwerksbetriebe|Vereine|Gemeinden|Verwaltungen|Schulen|Architekt(?:en|innen)|Bauherr(?:en|schaften)|Liegenschaftsverwaltungen|Immobilienverwaltungen|Hausverwaltungen|Generalunternehmer|Gastronomie|Restaurants|Hotels|Praxen|Ärzt(?:e|innen)|Treuhänder(?:innen)?|Selbst(?:st)?ändige|Start-?ups|Landwirt(?:e|innen)|Bauern|Sportler(?:innen)?|Einsteiger(?:innen)?|Profis|Geschäftskund(?:en|innen)|Geschäftsleute|Industrie(?:betriebe)?|Bauunternehmen|Genossenschaften|Stiftungen|Organisationen|Behörden|Berufstätige|Pendler(?:innen)?|Studierende|Lernende|Hundehalter(?:innen)?|Gäste|Einheimische|Touristen|Neuzuzüger(?:innen)?|Zuzüger(?:innen)?|Patient(?:en|innen)";
const ZIELGRUPPE_RE = new RegExp(`\\bfür\\s+(?:${WORT}\\s+){0,3}(?:${ZIELGRUPPEN})(?![\\p{L}])`, "giu");
const ZIELGRUPPE_SIGNAL_RE = /\brichtet sich an\b|\bwir arbeiten für\b|\bspeziell für\b/giu;
const BREIT_RE = /\bfür\s+(?:alle|jeden|jede|jedermann|jedes\s+budget|jeden\s+geldbeutel|gross\s+und\s+klein|jung\s+und\s+alt|privat(?:e|kund(?:en|schaft))?\s+und\s+(?:geschäftskund(?:en|schaft)|firmen|gewerbe|unternehmen))(?![\p{L}])/giu;

const UNTERSCHEIDUNG_RE =
  /\banders als\b|\bim unterschied\b|\bim gegensatz\b|\beinzig(?:e|er|es|en)?\b|\bals einzige[rs]?\b|\bnur bei uns\b|\bnur wir\b|\bspezialist(?:in|en|innen)?\s+für\b|\bspezialisiert\s+auf\b|\bwas uns unterscheidet\b|\bunser(?:e|en)?\s+unterschied\b|\bdarum\s+(?:wir|zu uns)\b|\bdeshalb\s+(?:wir|zu uns)\b|\bfokus\s+auf\b|\bkonzentrier(?:en|t)\s+(?:wir\s+)?uns\s+auf\b|\bausschliesslich\b|\bstatt\s+(?:wie\s+)?(?:andere|üblich)(?![\p{L}])/giu;

const BEWEIS_RES: RegExp[] = [
  /\bseit\s+(?:dem\s+jahr\s+)?(?:19|20)\d{2}\b/giu,
  /\bseit\s+(?:über|mehr\s+als|rund|fast|gut)?\s*\d{1,3}\s+jahren\b/giu,
  /\b(?:gegründet|gründung|gründungsjahr)\s*(?::|im\s+jahr)?\s*(?:19|20)\d{2}\b/giu,
  /\b(?:19|20)\d{2}\s+gegründet\b/giu,
  /\bin\s+(?:\d+\.|zweiter|dritter|vierter|fünfter)\s+generation\b/giu,
  /\b(?:über|mehr\s+als|rund|ca\.?|etwa|fast|gut)?\s*\d[\d'’.]*\s*(?:projekte|aufträge|kund(?:en|innen)|mitarbeitenden?|mitarbeiter(?:innen)?|angestellte|jahren?(?:\s+erfahrung)?|objekte|fahrzeuge|standorte|filialen|lehrlinge|lernende|bewertungen|rezensionen|sterne|m2|m²|quadratmeter|fassaden|wohnungen|häuser|betriebe|firmen|teilnehmende|mitglieder|einsätze|installationen|hochzeiten|anlässe|behandlungen|patient(?:en|innen))(?![\p{L}])/giu,
  /\breferenz(?:en)?\b|\bkundenstimme(?:n)?\b|\bkundenmeinung(?:en)?\b|\bbewertung(?:en)?\b|\brezension(?:en)?\b/giu,
  /\bzertifikat(?:e)?\b|\bzertifiziert(?:e|er|es)?\b|\bzertifizierung(?:en)?\b|\bISO\s?\d{4,5}\b|\bminergie\b/giu,
  /\bmeisterbetrieb\b|\bmeisterprüfung\b|\bmeistertitel\b|\beidg\.?\s*(?:dipl\.?|diplom)|\beidgenössisch(?:e|er|es|en)?\s+(?:fachausweis|diplom|meister)|\bfachausweis\b/giu,
  /\bmitglied\s+(?:bei|im|des|der|von|beim)\b|\bverbandsmitglied\b/giu,
  /\bauszeichnung(?:en)?\b|\bausgezeichnet\s+(?:mit|als)\b|\bpreisträger(?:in)?\b|\bgarantie\b|\blehrbetrieb\b|\bausbildungsbetrieb\b/giu,
];

const WIR_RE = /\b(?:wir|uns|unser(?:e|er|es|en|em)?)\b/iu;
/** Ein Satz, der mit «Wir» oder «Unser» beginnt, redet über den Betrieb, auch wenn «Sie» darin vorkommt. */
const WIR_START_RE = /^[^\p{L}]*(?:wir|unser(?:e|er|es|en|em)?)\b/iu;
const DU_RE = /\b(?:du|dich|dir|dein(?:e|er|es|en|em)?)\b/iu;
/** Höflichkeitsform nur gross geschrieben, sonst wäre «sie» (die anderen) dabei. */
const SIE_RE = /\b(?:Sie|Ihnen|Ihr(?:e|er|es|en|em)?)\b/u;

const REGIONEN = [
  "Ostschweiz", "Zentralschweiz", "Innerschweiz", "Nordwestschweiz", "Westschweiz", "Romandie", "Südschweiz", "Bodensee", "Bodenseeregion",
  "Appenzellerland", "Appenzell", "Rheintal", "Toggenburg", "Fürstenland", "Linthgebiet", "Glarnerland", "Zürcher Oberland", "Zürcher Unterland",
  "Zürichsee", "Säuliamt", "Knonaueramt", "Weinland", "Berner Oberland", "Emmental", "Oberaargau", "Seeland", "Mittelland", "Bündnerland", "Engadin",
  "Prättigau", "Surselva", "Oberwallis", "Unterwallis", "Zugerland", "Hinterthurgau", "Oberthurgau", "Fricktal", "Freiamt", "Baselbiet", "Leimental",
  "Laufental", "Sarganserland", "Werdenberg", "Seetal", "Entlebuch", "Winterthur", "Basel", "Bern", "Luzern", "Chur", "Wil", "Frauenfeld", "Herisau",
  "Rapperswil",
];
const KANTON_NAMEN = KANTONE.map(([, name]) => name);
const SCHWEIZ_RE = /(?:^|[^\p{L}])(Schweiz(?:er(?:in|innen)?|erisch(?:e|er|es|en)?)?)(?![\p{L}])/giu;
/** Vierstellige Postleitzahl mit Ortsnamen; Zahlen, die wie Jahre aussehen (1900 bis 2099), zählen nur mit «CH-». */
const PLZ_RE = /(?:^|[^\p{L}\d])((?:CH-\d{4}|[1-9]\d{3})\s+\p{Lu}\p{L}+)/gu;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ein Muster für Namen: nicht mitten im Wort, Gross- und Kleinschreibung egal. `St. Gallen` auch als `St.Gallen` oder `Sankt Gallen`. */
function namesRe(names: string[]): RegExp | null {
  const alts = names
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => (n === "St. Gallen" ? "St\\.?\\s?Gallen|Sankt Gallen" : escapeRe(n).replace(/\s+/g, "\\s+")));
  if (alts.length === 0) return null;
  return new RegExp(`(?:^|[^\\p{L}])(${alts.join("|")})(?![\\p{L}])`, "giu");
}

const REGION_RE = namesRe([...REGIONEN, ...KANTON_NAMEN]) as RegExp;

// ---- Hilfen --------------------------------------------------------------------------------------

type Hit = { start: number; end: number };

/** Alle Stellen eines Musters. Mit `group` zählt nur diese Gruppe (das Zeichen davor gehört nicht zur Stelle). */
function hitsOf(re: RegExp, text: string, group = 0): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(re)) {
    const index = m.index ?? 0;
    const whole = m[0];
    if (!group) {
      out.push({ start: index, end: index + whole.length });
      continue;
    }
    const part = m[group] ?? "";
    if (!part) continue;
    const start = index + whole.indexOf(part);
    out.push({ start, end: start + part.length });
  }
  return out;
}

const flat = (s: string) => s.replace(/\s+/g, " ");

function excerptOf(text: string, h: Hit): string {
  const before = text.slice(Math.max(0, h.start - 24), h.start);
  const after = text.slice(h.end, h.end + 24);
  return `${h.start > 24 ? "…" : ""}${flat(before)}${flat(text.slice(h.start, h.end))}${flat(after)}${h.end + 24 < text.length ? "…" : ""}`.trim();
}

const examples = (text: string, hits: Hit[]) => hits.slice(0, MAX_BEISPIELE).map((h) => excerptOf(text, h));

const wordCount = (s: string) => (s.match(/\p{L}[\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Sätze für die Kundenperspektive: Satzzeichen oder Zeilenumbruch trennen, kurze Brocken (Menü, Titel) fallen weg. */
export function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?…\n]+[.!?…]*/gu) ?? []).map((s) => s.trim()).filter((s) => wordCount(s) >= RICHTWERTE.satzMinWoerter);
}

const half = (n: number) => Math.round(n / 2);

/** Name des Kantons zu einem Code, zum Beispiel «SG» → «St. Gallen»; leer, wenn unbekannt. */
export function kantonName(code: string | undefined): string {
  if (!code) return "";
  return KANTONE.find(([c]) => c === code.trim().toUpperCase())?.[1] ?? "";
}

// ---- Prüfung -------------------------------------------------------------------------------------

type Teil = { id: string; status: Status; punkte: number; hinweis: string; beispiele: string[] };

function fund(gruppe: Gruppe, t: Teil): Fund {
  return { id: `${gruppe}-${t.id}`, gruppe, titel: GRUPPEN_TITEL[gruppe], status: t.status, punkte: t.punkte, max: GEWICHTE[gruppe], hinweis: t.hinweis, beispiele: t.beispiele };
}

function pruefeZielgruppe(text: string): Fund {
  const max = GEWICHTE.zielgruppe;
  const konkret = [...hitsOf(ZIELGRUPPE_RE, text), ...hitsOf(ZIELGRUPPE_SIGNAL_RE, text)].sort((a, b) => a.start - b.start);
  const breit = hitsOf(BREIT_RE, text);
  if (konkret.length > 0) {
    return fund("zielgruppe", { id: "ok", status: "gut", punkte: max, hinweis: "Die Startseite nennt, für wen du arbeitest. Prüfe, ob diese Gruppe wirklich deine beste Kundschaft ist.", beispiele: examples(text, konkret) });
  }
  if (breit.length > 0) {
    return fund("zielgruppe", { id: "breit", status: "teil", punkte: Math.round(max / 4), hinweis: "«Für alle» ist für niemanden. Nenne die Gruppe, die dir am meisten bringt, zum Beispiel «für Hausbesitzer in Gossau».", beispiele: examples(text, breit) });
  }
  return fund("zielgruppe", { id: "fehlt", status: "fehlt", punkte: 0, hinweis: "Die Startseite sagt nicht, für wen du da bist. Ein Satz wie «für Hausbesitzer im Appenzellerland» reicht.", beispiele: [] });
}

function pruefeUnterscheidung(text: string): Fund {
  const max = GEWICHTE.unterscheidung;
  const hits = hitsOf(UNTERSCHEIDUNG_RE, text);
  if (hits.length > 0) {
    return fund("unterscheidung", { id: "ok", status: "gut", punkte: max, hinweis: "Die Startseite sagt, was dich unterscheidet. Prüfe, ob der Unterschied auch für die Kundschaft zählt.", beispiele: examples(text, hits) });
  }
  return fund("unterscheidung", { id: "fehlt", status: "fehlt", punkte: 0, hinweis: "Kein Satz sagt, was du anders machst als andere Betriebe. Ein «anders als», «spezialisiert auf» oder «nur bei uns» fehlt.", beispiele: [] });
}

function pruefeBeweise(text: string): { fund: Fund; anzahl: number } {
  const max = GEWICHTE.beweise;
  const unique = dedupe(BEWEIS_RES.flatMap((re) => hitsOf(re, text)));
  const n = unique.length;
  if (n >= RICHTWERTE.beweiseGut) {
    return { anzahl: n, fund: fund("beweise", { id: "ok", status: "gut", punkte: max, hinweis: "Die Startseite belegt, was sie behauptet: Jahre, Zahlen, Referenzen oder Ausbildungen.", beispiele: examples(text, unique) }) };
  }
  if (n === 1) {
    return { anzahl: n, fund: fund("beweise", { id: "einer", status: "teil", punkte: half(max), hinweis: "Ein Beleg steht da. Ein zweiter (Jahre, Zahl mit Einheit, Referenz, Ausbildung) macht die Aussage glaubwürdiger.", beispiele: examples(text, unique) }) };
  }
  return { anzahl: 0, fund: fund("beweise", { id: "fehlt", status: "fehlt", punkte: 0, hinweis: "Kein Beleg: keine Jahreszahl, keine Zahl mit Einheit, keine Referenz, keine Ausbildung. Behauptungen ohne Beleg glaubt niemand.", beispiele: [] }) };
}

/** Kundensatz: spricht die Leserin an (du, Sie) und beginnt nicht mit «Wir» oder «Unser». Wir-Satz: alle anderen mit «wir», «uns», «unser». */
export function perspektiveOf(satz: string): "kunde" | "wir" | null {
  if ((DU_RE.test(satz) || SIE_RE.test(satz)) && !WIR_START_RE.test(satz)) return "kunde";
  if (WIR_RE.test(satz)) return "wir";
  return null;
}

function pruefeKunde(text: string): { fund: Fund; wir: number; kunde: number; anteil: number | null } {
  const max = GEWICHTE.kunde;
  const saetze = sentencesOf(text);
  const wirSaetze = saetze.filter((s) => perspektiveOf(s) === "wir");
  const kundeSaetze = saetze.filter((s) => perspektiveOf(s) === "kunde");
  const wir = wirSaetze.length;
  const kunde = kundeSaetze.length;
  const total = wir + kunde;
  const kurz = (list: string[]) => list.slice(0, MAX_BEISPIELE).map((s) => flat(s).slice(0, 90) + (s.length > 90 ? "…" : ""));
  if (total === 0) {
    return { wir, kunde, anteil: null, fund: fund("kunde", { id: "keine", status: "fehlt", punkte: 0, hinweis: "Kein Satz spricht jemanden an, weder «wir» noch «du» oder «Sie». Rede mit der Kundschaft: Was hat sie davon?", beispiele: [] }) };
  }
  const anteil = kunde / total;
  if (anteil >= RICHTWERTE.kundenAnteilGut) {
    return { wir, kunde, anteil, fund: fund("kunde", { id: "ok", status: "gut", punkte: max, hinweis: "Die Startseite spricht die Kundschaft öfter an als sich selbst.", beispiele: kurz(kundeSaetze) }) };
  }
  if (anteil >= RICHTWERTE.kundenAnteilTeil) {
    return { wir, kunde, anteil, fund: fund("kunde", { id: "teil", status: "teil", punkte: half(max), hinweis: "Mehr Sätze reden über «uns» als über die Kundschaft. Dreh jeden zweiten «Wir»-Satz um: Was hat die Leserin davon?", beispiele: kurz(wirSaetze) }) };
  }
  return { wir, kunde, anteil, fund: fund("kunde", { id: "wir", status: "fehlt", punkte: 0, hinweis: "Die Startseite redet fast nur über «uns». Sätze, die mit «Wir» beginnen, zählen dazu, auch mit «Sie» darin. Beginne mit dem Problem der Kundschaft, nicht mit dem Betrieb.", beispiele: kurz(wirSaetze) }) };
}

/** Überlappende Stellen (zum Beispiel «9200 Gossau» und «Gossau») zählen einmal. */
function dedupe(hits: Hit[]): Hit[] {
  const unique: Hit[] = [];
  for (const h of [...hits].sort((a, b) => a.start - b.start || b.end - a.end)) if (!unique.some((u) => h.start < u.end && u.start < h.end)) unique.push(h);
  return unique;
}

function pruefeRegion(text: string, context: CheckContext): Fund {
  const max = GEWICHTE.region;
  const ortRe = namesRe([context.ort ?? "", kantonName(context.kanton)]);
  // Jahreszahlen sind keine Postleitzahlen, ausser mit «CH-».
  const plz = hitsOf(PLZ_RE, text, 1).filter((h) => !/^(?:19|20)\d{2}\s/.test(text.slice(h.start, h.end)));
  const hits = dedupe([...(ortRe ? hitsOf(ortRe, text, 1) : []), ...hitsOf(REGION_RE, text, 1), ...plz]);
  if (hits.length > 0) {
    return fund("region", { id: "ok", status: "gut", punkte: max, hinweis: "Ort oder Region stehen auf der Startseite. So findet dich, wer in der Nähe sucht.", beispiele: examples(text, hits) });
  }
  const schweiz = hitsOf(SCHWEIZ_RE, text, 1);
  if (schweiz.length > 0) {
    return fund("region", { id: "schweiz", status: "teil", punkte: Math.round(max / 3), hinweis: "Nur «Schweiz» steht da. Nenne Gemeinde, Kanton oder Region, zum Beispiel «Gossau» oder «Ostschweiz».", beispiele: examples(text, schweiz) });
  }
  return fund("region", { id: "fehlt", status: "fehlt", punkte: 0, hinweis: "Kein Ort, kein Kanton, keine Region. Wer «Maler Gossau» sucht, bekommt diese Seite nicht zu sehen.", beispiele: [] });
}

function pruefeFloskeln(floskeln: { title: string; count: number; excerpt: string }[], woerter: number): { fund: Fund; anzahl: number } {
  const max = GEWICHTE.floskeln;
  const anzahl = floskeln.reduce((n, f) => n + f.count, 0);
  const beispiele = floskeln.slice(0, MAX_BEISPIELE).map((f) => `${f.title}: ${f.excerpt}`);
  if (woerter === 0) {
    return { anzahl, fund: fund("floskeln", { id: "kein-text", status: "fehlt", punkte: 0, hinweis: "Die Startseite hat keinen lesbaren Text. Steht alles im Bild, sieht es weder Google noch dieser Check.", beispiele: [] }) };
  }
  if (anzahl === 0) {
    return { anzahl, fund: fund("floskeln", { id: "ok", status: "gut", punkte: max, hinweis: "Keine Floskel aus unserer Liste. Der Platz gehört den Belegen.", beispiele: [] }) };
  }
  if (anzahl <= RICHTWERTE.floskelnTeil) {
    return { anzahl, fund: fund("floskeln", { id: "wenige", status: "teil", punkte: half(max), hinweis: "Eine oder zwei Floskeln. Ersetze sie durch einen Beleg oder streiche sie.", beispiele }) };
  }
  return { anzahl, fund: fund("floskeln", { id: "viele", status: "fehlt", punkte: 0, hinweis: "Drei oder mehr Floskeln. Jede nimmt Platz, den ein Beleg besser füllt.", beispiele }) };
}

/** Prüft den Text einer Startseite. Punktzahl 0 bis 100 aus sechs Gruppen (Gewichte in GEWICHTE). */
export function checkPositionierung(text: string, context: CheckContext = {}): PositionierungCheck {
  const t = text.slice(0, 20_000);
  const report = analyzeText(t);
  const floskeln = report.findings.filter((f) => f.kind === "floskel").map((f) => ({ title: f.title, count: f.count, excerpt: f.examples[0]?.excerpt ?? "" }));

  const zielgruppe = pruefeZielgruppe(t);
  const unterscheidung = pruefeUnterscheidung(t);
  const beweise = pruefeBeweise(t);
  const kunde = pruefeKunde(t);
  const region = pruefeRegion(t, context);
  const flosk = pruefeFloskeln(floskeln, report.words);

  const funde: Fund[] = [zielgruppe, unterscheidung, beweise.fund, kunde.fund, region, flosk.fund];
  const score = Math.min(100, Math.max(0, Math.round(funde.reduce((n, f) => n + f.punkte, 0))));
  return {
    score,
    funde,
    kennzahlen: {
      woerter: report.words,
      saetze: sentencesOf(t).length,
      wirSaetze: kunde.wir,
      kundeSaetze: kunde.kunde,
      kundenAnteil: kunde.anteil,
      beweise: beweise.anzahl,
      floskeln: flosk.anzahl,
      lesbarkeit: report.readability ? { index: report.readability.index, level: report.readability.level } : null,
    },
  };
}

export const stufe = (score: number): string => scoreBand(score / 100).text;

/** Prozent mit Leerzeichen (Harte Regel 2), zum Beispiel «40 %». */
export const prozent = (anteil: number): string => `${Math.round(anteil * 100)} %`;

/** Die Lücken des Checks als kurze Zeilen für die KI (höchstens MAX_FUNDE à 160 Zeichen). */
export function fundeKurz(check: PositionierungCheck): string[] {
  return check.funde
    .filter((f) => f.status !== "gut")
    .map((f) => `${f.titel} (${f.punkte} von ${f.max}): ${f.hinweis}`.slice(0, 160))
    .slice(0, MAX_FUNDE);
}

// ---- Eingabe -------------------------------------------------------------------------------------

/** Grobe Prüfung im Browser; der Server prüft mit normalizeUrl noch einmal (keine IP, kein internes Netz). */
export function looksLikeWebsite(website: string): boolean {
  const s = website.trim();
  if (!s || s.length > 300 || /\s/.test(s)) return false;
  const host = s.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  return /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?::\d{1,5})?$/u.test(host);
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. Die Website ist Pflicht. */
export function inputProblem(website: string): string | null {
  const w = website.trim();
  if (!w) return "Gib die Adresse deiner Website an, zum Beispiel malerei-keller.ch. Ohne Website gibt es keinen Check.";
  if (!looksLikeWebsite(w)) return "Das sieht nicht nach einer Website-Adresse aus. Prüfe die Schreibweise.";
  return null;
}

/** Host ohne «www.» für die Anzeige; bei kaputter Adresse die Eingabe selbst. */
export function hostOf(website: string): string {
  const s = website.trim();
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s;
  }
}

export type PageLike = Pick<PageRead, "host" | "title" | "headings" | "text">;
export type ProfileFields = { firma?: string; branche?: string; ort?: string; kanton?: string };
export type FormFields = { unterscheidung: string; beweise: string };

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Eingabe des Generators aus Profil, Formular, gelesener Seite und Check. Ohne Firma gilt der Host als Betrieb. */
export function toInput(fields: ProfileFields, form: FormFields, page: PageLike, check: PositionierungCheck): PositionierungInput {
  const host = clip(page.host, 200);
  return {
    betrieb: clip(fields.firma, 120) || host,
    branche: clip(fields.branche, 120),
    ort: clip(fields.ort, 80),
    kanton: clip(kantonName(fields.kanton), 40),
    host,
    title: clip(page.title, 200),
    headings: page.headings
      .map((h) => clip(h, 200))
      .filter(Boolean)
      .slice(0, MAX_HEADINGS),
    text: page.text.trim().slice(0, MAX_TEXT_CHARS),
    funde: fundeKurz(check),
    unterscheidung: form.unterscheidung.trim().slice(0, MAX_FREITEXT),
    beweise: form.beweise.trim().slice(0, MAX_FREITEXT),
  };
}

/** Was vom Eingabe-Objekt im Browser bleibt: alles ausser dem Text der Seite. */
export type StoredInput = Omit<PositionierungInput, "text">;

export function stripText(input: PositionierungInput): StoredInput {
  return {
    betrieb: input.betrieb,
    branche: input.branche,
    ort: input.ort,
    kanton: input.kanton,
    host: input.host,
    title: input.title,
    headings: input.headings,
    funde: input.funde,
    unterscheidung: input.unterscheidung,
    beweise: input.beweise,
  };
}

/** Die Angaben fürs CRM, eine je Zeile. Nicht der Text der Seite: Der Server kürzt ohnehin auf 1'900 Zeichen. */
export function eingabeText(input: StoredInput): string {
  return [
    `Website: ${input.host}`,
    `Betrieb: ${input.betrieb}`,
    input.branche ? `Branche: ${input.branche}` : "",
    input.ort ? `Ort: ${input.ort}` : "",
    input.kanton ? `Kanton: ${input.kanton}` : "",
    input.title ? `Titel der Startseite: ${input.title}` : "",
    input.headings.length > 0 ? `Überschriften: ${input.headings.join(" · ")}` : "",
    input.unterscheidung ? `Was dich unterscheidet: ${input.unterscheidung}` : "",
    input.beweise ? `Beweise: ${input.beweise}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ------------------------------------------------------------------------------------

export type Angaben = Pick<StoredInput, "betrieb" | "host" | "title" | "ort" | "branche" | "kanton">;

/** Die Blöcke des Checks: Punktzahl, Funde je Gruppe, Kennzahlen. */
export function checkBlocks(check: PositionierungCheck): DocBlock[] {
  const k = check.kennzahlen;
  const blocks: DocBlock[] = [
    { type: "heading", level: 1, text: `Positionierung auf der Startseite: ${check.score} von 100 (${stufe(check.score)})` },
    { type: "paragraph", text: RICHTWERT_HINWEIS },
  ];
  for (const f of check.funde) {
    blocks.push({ type: "heading", level: 2, text: `${f.titel}: ${f.punkte} von ${f.max}` }, { type: "paragraph", text: f.hinweis });
    if (f.beispiele.length > 0) blocks.push({ type: "list", items: f.beispiele });
  }
  blocks.push({ type: "heading", level: 2, text: "Kennzahlen" });
  blocks.push({
    type: "facts",
    items: [
      { label: "Wörter", value: String(k.woerter) },
      { label: "Sätze", value: String(k.saetze) },
      { label: "Sätze an die Kundschaft", value: k.kundenAnteil === null ? "keine Anrede gefunden" : `${k.kundeSaetze} von ${k.kundeSaetze + k.wirSaetze} (${prozent(k.kundenAnteil)})` },
      { label: "Belege", value: String(k.beweise) },
      { label: "Floskeln", value: String(k.floskeln) },
      { label: "Lesbarkeit nach Amstad", value: k.lesbarkeit ? `${k.lesbarkeit.index} (${k.lesbarkeit.level})` : "zu wenig Text" },
    ],
  });
  return blocks;
}

/** Die Blöcke des Entwurfs mit Überschrift und KI-Hinweis (Dokument und Export). */
export function entwurfBlocks(output: PositionierungOutput): DocBlock[] {
  return [{ type: "heading", level: 1, text: "Dein Entwurf" }, { type: "paragraph", text: KI_HINWEIS }, ...entwurfBodyBlocks(output)];
}

/** Der Inhalt des Entwurfs: Kernsatz, Für wen, Was anders, Beweise, drei Varianten, Streichliste, nächster Schritt. */
export function entwurfBodyBlocks(output: PositionierungOutput): DocBlock[] {
  return [
    { type: "heading", level: 2, text: "Kernsatz" },
    { type: "paragraph", text: output.kernsatz },
    { type: "heading", level: 2, text: "Für wen" },
    { type: "paragraph", text: output.fuerWen },
    { type: "heading", level: 2, text: "Was anders ist" },
    { type: "paragraph", text: output.wasAnders },
    { type: "heading", level: 2, text: "Beweise" },
    { type: "list", items: output.beweise },
    { type: "heading", level: 2, text: "Drei Varianten" },
    { type: "list", items: output.varianten.map((v) => `${STIL_LABELS[v.stil]}: ${v.satz}`) },
    { type: "heading", level: 2, text: "Streichen" },
    { type: "list", items: output.streichen },
    { type: "heading", level: 2, text: "Nächster Schritt" },
    { type: "paragraph", text: output.naechsterSchritt },
  ];
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Ohne Entwurf steht nur der Check drin. */
export function toDocument(check: PositionierungCheck, output: PositionierungOutput | null, angaben: Angaben): DocumentModel {
  const facts: { label: string; value: string }[] = [
    { label: "Website", value: angaben.host || "keine Angabe" },
    { label: "Betrieb", value: angaben.betrieb || "keine Angabe" },
  ];
  if (angaben.branche) facts.push({ label: "Branche", value: angaben.branche });
  if (angaben.ort || angaben.kanton) facts.push({ label: "Ort", value: [angaben.ort, angaben.kanton].filter(Boolean).join(", ") });
  const blocks: DocBlock[] = [{ type: "facts", items: facts }, ...checkBlocks(check), ...(output ? entwurfBlocks(output) : [])];
  return {
    title: "Positionierungs-Check",
    subtitle: angaben.host ? `Startseite von ${angaben.host}` : undefined,
    filename: `positionierung-${safeFilename(angaben.host, "website")}`,
    blocks,
  };
}

/** Check und Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(check: PositionierungCheck, output: PositionierungOutput | null, angaben: Angaben): string {
  return toMarkdown(toDocument(check, output, angaben));
}

// ---- Profil --------------------------------------------------------------------------------------

/** Was der Entwurf ins Firmenprofil schreibt: die Positionierung (Kernsatz), nur wenn das Feld leer ist. */
export function profilePatch(profile: Pick<Profile, "positionierung">, output: PositionierungOutput): { positionierung?: string } {
  if (profile.positionierung?.trim()) return {};
  return { positionierung: output.kernsatz };
}

// ---- Gespeicherter Stand -------------------------------------------------------------------------

export type PositionierungState = {
  v: 1;
  form: FormFields;
  input: StoredInput | null;
  check: PositionierungCheck | null;
  output: PositionierungOutput | null;
};

export const EMPTY_STATE: PositionierungState = { v: 1, form: { unterscheidung: "", beweise: "" }, input: null, check: null, output: null };

const fundSchema = z.object({
  id: z.string().max(60),
  gruppe: z.enum(GRUPPEN),
  titel: z.string().max(80),
  status: z.enum(["gut", "teil", "fehlt"]),
  punkte: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  hinweis: z.string().max(400),
  beispiele: z.array(z.string().max(300)).max(MAX_BEISPIELE),
});

const checkSchema = z.object({
  score: z.number().min(0).max(100),
  funde: z.array(fundSchema).min(1).max(GRUPPEN.length),
  kennzahlen: z.object({
    woerter: z.number().min(0),
    saetze: z.number().min(0),
    wirSaetze: z.number().min(0),
    kundeSaetze: z.number().min(0),
    kundenAnteil: z.number().min(0).max(1).nullable(),
    beweise: z.number().min(0),
    floskeln: z.number().min(0),
    lesbarkeit: z.object({ index: z.number(), level: z.string().max(40) }).nullable(),
  }),
});

const storedInputSchema = positionierungInput.omit({ text: true });

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ohne gültigen Check fällt das Ergebnis weg, ein kaputter Entwurf allein. */
export function parseState(raw: unknown): PositionierungState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<PositionierungState>;
  if (r.v !== 1) return EMPTY_STATE;
  const f = (typeof r.form === "object" && r.form !== null ? r.form : {}) as Partial<FormFields>;
  const form: FormFields = {
    unterscheidung: typeof f.unterscheidung === "string" ? f.unterscheidung.slice(0, MAX_FREITEXT) : "",
    beweise: typeof f.beweise === "string" ? f.beweise.slice(0, MAX_FREITEXT) : "",
  };
  const input = storedInputSchema.safeParse(r.input);
  const check = checkSchema.safeParse(r.check);
  if (!input.success || !check.success) return { v: 1, form, input: null, check: null, output: null };
  const output = positionierungOutput.safeParse(r.output);
  return { v: 1, form, input: input.data, check: check.data, output: output.success ? output.data : null };
}
