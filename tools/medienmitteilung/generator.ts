import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn } from "@/lib/generator";

// Generator des Werkzeugs «Medienmitteilung» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf dem
// Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular und dem Firmenprofil; die Route
// /api/generate prüft Eingabe und Antwort mit denselben Schemas. Die Kontaktdaten für Rückfragen gehören nicht zur
// Eingabe: Sie bleiben im Browser und werden erst im Dokument angehängt (logic.ts).

export const ANLASS_KEYS = ["eroeffnung", "jubilaeum", "auszeichnung", "anlass", "angebot", "personelles", "anderes"] as const;
export type AnlassKey = (typeof ANLASS_KEYS)[number];

/** Namen der Anlässe, wie sie im Formular und im Dokument stehen. */
export const ANLASS_LABELS: Record<AnlassKey, string> = {
  eroeffnung: "Eröffnung",
  jubilaeum: "Jubiläum",
  auszeichnung: "Auszeichnung",
  anlass: "Anlass oder Veranstaltung",
  angebot: "Neues Angebot",
  personelles: "Personelles",
  anderes: "Anderes",
};

export const LIMITS = {
  betrieb: 120,
  ort: 120,
  kanton: 40,
  website: 200,
  positionierung: 600,
  wasMin: 20,
  was: 600,
  wann: 80,
  wo: 120,
  wer: 300,
  warumMin: 10,
  warum: 400,
  zitat: 300,
  zitatVon: 80,
  bild: 200,
  /** Nur im Browser (Kontakt und Empfänger gehen nie an den Server). */
  kontaktName: 120,
  kontaktTelefon: 40,
  kontaktEmail: 120,
  empfaengerMax: 20,
  empfaengerZeile: 120,
} as const;

/** Richtwerte von Alperna, keine Statistik: Lead und Gesamtlänge einer Medienmitteilung. */
export const LEAD_MAX_WORDS = 40;
/** Höchste Untergrenze der Gesamtlänge: Sie gilt bei ausführlichen Angaben. Bei knappen Angaben gilt `mindestWoerter`. */
export const LAENGE_MIN_WORDS = 150;
/** Niedrigste Untergrenze: Titel, Lead, zwei Absätze und Boilerplate ergeben auch bei wenigen Fakten gut 80 Wörter. */
export const LAENGE_FLOOR_WORDS = 80;
/** So viele Wörter kommen zu den Wörtern der Angaben dazu (Titel, Lead, Boilerplate und Verbindendes). */
export const LAENGE_PLUS_WORDS = 50;
export const LAENGE_MAX_WORDS = 400;

export const medienInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  ort: z.string().trim().max(LIMITS.ort),
  kanton: z.string().trim().max(LIMITS.kanton),
  website: z.string().trim().max(LIMITS.website),
  positionierung: z.string().trim().max(LIMITS.positionierung),
  anlass: z.enum(ANLASS_KEYS),
  was: z.string().trim().min(LIMITS.wasMin).max(LIMITS.was),
  wann: z.string().trim().min(1).max(LIMITS.wann),
  wo: z.string().trim().max(LIMITS.wo),
  wer: z.string().trim().max(LIMITS.wer),
  warum: z.string().trim().min(LIMITS.warumMin).max(LIMITS.warum),
  zitat: z.string().trim().max(LIMITS.zitat),
  zitatVon: z.string().trim().max(LIMITS.zitatVon),
  bild: z.string().trim().max(LIMITS.bild),
});
export type MedienInput = z.infer<typeof medienInput>;

export const medienOutput = z.object({
  titel: z.string().min(20).max(90),
  /** Höchstens LEAD_MAX_WORDS Wörter; die Zahl der Wörter prüft checkMitteilung. */
  lead: z.string().min(40).max(320),
  text: z.array(z.string().min(80).max(600)).min(2).max(5),
  /** Nur, wenn die Eingabe ein Zitat hat, sonst leer. */
  zitat: z.string().max(320),
  /** Beginnt mit dem Namen des Betriebs. */
  boilerplate: z.string().min(80).max(400),
  /** Nur, wenn die Eingabe ein Bildangebot hat, sonst leer. */
  bildzeile: z.string().max(200),
});
export type MedienOutput = z.infer<typeof medienOutput>;

export { numbersIn };

// ---- Regeln, die Generator und Anzeige teilen ---------------------------------------------------------

/** Wörter eines Textes: Zeichenfolgen mit mindestens einem Buchstaben oder einer Ziffer. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Alle Texte, die zur Länge zählen: Titel, Lead, Haupttext, Zitat und Boilerplate. */
export function laengeText(output: MedienOutput): string {
  return [output.titel, output.lead, ...output.text, output.zitat, output.boilerplate].join("\n");
}

export function gesamtWoerter(output: MedienOutput): number {
  return wordCount(laengeText(output));
}

/**
 * Untergrenze der Gesamtlänge in Wörtern: Wörter der Angaben (was, wo, wer, warum, Zitat, Bild) plus 50, aber höchstens 150 und
 * mindestens 80. Eine gute Mitteilung zu drei Fakten ist kurz; ohne diese Staffelung würde sie abgelehnt oder mit Füllsätzen gestreckt.
 */
export function mindestWoerter(input: Pick<MedienInput, "was" | "wo" | "wer" | "warum" | "zitat" | "bild">): number {
  const angaben = wordCount([input.was, input.wo, input.wer, input.warum, input.zitat, input.bild].join(" "));
  return Math.min(LAENGE_MIN_WORDS, Math.max(LAENGE_FLOOR_WORDS, angaben + LAENGE_PLUS_WORDS));
}

/** Der Satz zu den Grenzen für Lead und Länge, mit der Untergrenze, die zu diesen Angaben gehört. */
export function richtwertHinweis(input: Pick<MedienInput, "was" | "wo" | "wer" | "warum" | "zitat" | "bild">): string {
  return `Lead höchstens ${LEAD_MAX_WORDS} Wörter, Gesamtlänge ${mindestWoerter(input)} bis ${LAENGE_MAX_WORDS} Wörter: Richtwert von Alperna, keine Statistik.`;
}

const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Name des Betriebs für den Vergleich im Lead: klein geschrieben, ohne Ortszusatz nach dem Komma («Malerei Keller, Gossau»)
 * und ohne Rechtsform am Ende («Malerei Keller GmbH»).
 */
export function betriebKern(betrieb: string): string {
  const full = norm(betrieb);
  let s = norm(betrieb.split(",")[0] ?? "");
  for (let i = 0; i < 2; i++) s = s.replace(/[\s,]+(?:ag|gmbh|sàrl|sarl|sa|kg)\.?$/, "").trim();
  return s || full;
}

/** Wörter ohne Aussage über den Ort («beim», «unserem», «vorort»). */
const ORT_STOP = new Set([
  "beim", "dort", "hier", "dieser", "diesem", "diesen", "einer", "einem", "einen", "gegenüber", "neben",
  "unser", "unsere", "unserem", "unseren", "unserer", "vorort", "zuhause", "direkt", "kanton",
]);

/** Ortsbegriffe eines Textes («Gossau SG» → gossau): Wörter ab vier Buchstaben, ohne Füllwörter. */
export function ortSchluessel(text: string): string[] {
  return norm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4 && !ORT_STOP.has(t));
}

/** Begriffe der Zeitangabe: Ziffernfolgen und Wörter ab vier Buchstaben («Samstag, 14. November» → samstag, 14, november). */
export function wannSchluessel(text: string): string[] {
  return norm(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => /\d/.test(t) || t.length >= 4);
}

/** Der Lead nennt den Betrieb (wer). */
export function leadNenntBetrieb(lead: string, input: Pick<MedienInput, "betrieb">): boolean {
  return norm(lead).includes(betriebKern(input.betrieb));
}

/**
 * Der Lead nennt den Ort oder einen Begriff aus «wo» (wo). Wörter aus dem Namen des Betriebs zählen bei «wo» nicht
 * («Werkstatt der Malerei Keller» darf nicht schon der Name allein erfüllen). Gibt es weder Ort noch einen Begriff aus
 * «wo», lässt sich nichts prüfen, dann gilt die Regel als erfüllt.
 */
export function leadNenntOrt(lead: string, input: Pick<MedienInput, "betrieb" | "ort" | "wo">): boolean {
  const ort = ortSchluessel(input.ort);
  const name = new Set(ortSchluessel(input.betrieb));
  const wo = ortSchluessel(input.wo).filter((k) => !name.has(k) && !ort.includes(k));
  const keys = [...new Set([...ort, ...wo])];
  if (keys.length === 0) return true;
  const l = norm(lead);
  return keys.some((k) => l.includes(k));
}

/** Der Lead nennt einen Begriff der Zeitangabe (wann). Ohne verwertbare Zeitangabe gilt die Regel als erfüllt. */
export function leadNenntWann(lead: string, input: Pick<MedienInput, "wann">): boolean {
  const keys = wannSchluessel(input.wann);
  if (keys.length === 0) return true;
  const l = norm(lead);
  return keys.some((k) => l.includes(k));
}

/**
 * Ziffernfolgen im Entwurf, die nicht in den Angaben stehen. `numbersIn` gleicht Schreibweisen von Datum und Uhrzeit aus
 * («14.11.2026» und «14. November 2026», «10.00 Uhr» und «10 Uhr») und zählt Zahlwörter ab «zwanzig» wie Ziffern.
 */
export function fremdeZahlen(output: MedienOutput, input: MedienInput): string[] {
  // Jeder Text für sich und mit einem Wort davor: «14. November» am Anfang eines Textes gilt für numbersIn sonst als Listenmarke.
  const zahlen = (text: string) => numbersIn(`x ${text}`);
  const known = new Set(Object.values(input).flatMap(zahlen));
  return [...new Set(collectStrings(output).flatMap(zahlen).filter((n) => !known.has(n)))];
}

const SATZZEICHEN = /[«»"„“”'‹›.,;:!?()[\]]/g;
const wordsOf = (s: string) => norm(s).replace(SATZZEICHEN, " ").split(/\s+/).filter(Boolean);

/**
 * Das Zitat stammt aus den Angaben. Ohne Zitat in den Angaben darf der Entwurf keins haben; mit Zitat müssen
 * mindestens drei Viertel der Wörter des Entwurfs in der Angabe stehen (leichte Glättung ist erlaubt, Umformulieren nicht).
 * Lässt der Entwurf das Zitat weg, gilt die Regel als erfüllt: Das Dokument setzt dann die Angabe ein (logic.ts).
 */
export function zitatStimmt(output: Pick<MedienOutput, "zitat">, input: Pick<MedienInput, "zitat">): boolean {
  const gegeben = input.zitat.trim();
  const entwurf = output.zitat.trim();
  if (!gegeben) return entwurf === "";
  if (!entwurf) return true;
  const known = new Set(wordsOf(gegeben));
  const words = wordsOf(entwurf);
  if (words.length === 0) return true;
  return words.filter((w) => known.has(w)).length / words.length >= 0.75;
}

// ---- Metasätze, Füllsätze und Wertungen (Beschluss vom 09.10.2026, Rückmeldung zur Medienmitteilung) ------------------

/**
 * Metasätze reden über die Mitteilung, ihren Zweck oder die Redaktion statt über die Sache («Diese Medienmitteilung informiert
 * über …», «Wir freuen uns auf Ihre Berichterstattung», «Bei Rückfragen …»). Kontakt und Bildangebot setzt das Dokument selbst ein
 * (logic.ts, Feld «bildzeile»); im Haupttext haben solche Sätze nichts verloren.
 */
export const META_MUSTER: { re: RegExp; was: string }[] = [
  {
    re: /\b(?:diese[rnms]?|die vorliegende|die) (?:medien|presse)?mitteilung\b|\b(?:diese|die) meldung\b|\bmit diesem schreiben\b|\bdie redaktion\b|\bmedienschaffende\b|\bjournalist(?:en|innen)?\b/i,
    was: "Satz über die Mitteilung oder die Redaktion",
  },
  {
    re: /\bwir freuen uns (?:auf|über) (?:ihre|eure|die) (?:berichterstattung|veröffentlichung)\b|\bberichterstattung\b|\bveröffentlichung dieser\b/i,
    was: "Bitte um Berichterstattung",
  },
  {
    re: /\b(?:bei|für) rückfragen\b|\bweitere (?:informationen|auskünfte|details)\b[^.!?\n]{0,40}\b(?:erhalten|finden|gibt es|unter|auf anfrage)\b|\bstehe[n]? (?:ihnen|euch|gerne|gern)\b[^.!?\n]{0,40}\bzur verfügung\b/i,
    was: "Hinweis auf Rückfragen oder weitere Informationen",
  },
  {
    re: /\b(?:bild|foto)(?:material)?\b[^.!?\n]{0,40}\b(?:zur verfügung|auf anfrage|erhältlich)\b/i,
    was: "Bildangebot im Haupttext",
  },
];

/**
 * Füllsätze und Werbesprache in einer Meldung: sie klingen nach Nachricht, sagen aber nichts, was in den Angaben steht
 * («stösst auf grosses Interesse», «für jeden Geschmack etwas dabei», «verspricht ein Highlight»).
 */
export const FUELL_MUSTER: { re: RegExp; was: string }[] = [
  { re: /\b(?:grossen|riesigen|regen|breiten|starken|hohen) (?:anklang|zuspruch|interesse|andrang|nachfrage|beliebtheit)\b|\bstösst auf (?:grosses|reges|breites|viel\w*|positive\w*)\b|\berfreut sich (?:grosser|reger)\b/i, was: "behauptete Nachfrage" },
  { re: /\bverspricht\b|\bhighlight\b|\bhöhepunkt\b|\bpublikumsmagnet\b|\bmuss man (?:gesehen|erlebt)\b/i, was: "Werbesprache («verspricht», «Highlight»)" },
  { re: /\bfür (?:jeden|jede|jedes|alle)\b[^.!?\n]{0,40}\b(?:etwas|geschmack|alter|generation)\b|\bfür jung und alt\b/i, was: "«für jeden etwas»" },
  { re: /\b(?:unvergessliche[rnms]?|einzigartige[rnms]?|unvergleichliche[rnms]?|einmalige[rnms]?|besondere[rnms]?) (?:erlebnis|moment|abend|tag|atmosphäre|gelegenheit|chance)\w*\b/i, was: "wertendes Beiwort («unvergesslich», «einzigartig»)" },
  { re: /\bbietet (?:raum|platz|gelegenheit) für\b|\bsorgt für (?:begeisterung|stimmung|freude|abwechslung)\b|\bbereichert (?:die|das|den)\b|\bwir freuen uns auf (?:viele|zahlreiche|alle)\b|\bzahlreiche (?:gäste|besucher)\b/i, was: "Füllsatz («bietet Raum für», «sorgt für Stimmung»)" },
];

/** Wertende Wörter (Wortanfang): Sie dürfen nur vorkommen, wenn die Angaben sie selbst enthalten. */
export const WERTUNG_STAEMME = [
  "beliebt", "traditionsreich", "renommiert", "langjährig", "etabliert", "hochwertig", "bewährt", "attraktiv",
  "spannend", "vielfältig", "abwechslungsreich", "hochkarätig", "namhaft", "gemütlich", "herzlich", "wegweisend",
] as const;

/** Die Texte der Mitteilung ohne Zitat und Bildzeile; nur dort gelten die Regeln gegen Meta- und Füllsätze. */
const berichtsTexte = (o: MedienOutput): string[] => [o.titel, o.lead, ...o.text, o.boilerplate];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Der Verweis auf die eigene Website am Ende der Boilerplate («Mehr unter malerei-keller.ch.», «Weitere Informationen unter …») ist
 * üblich und kein Metasatz, solange die Adresse aus «website» stammt. Der Satz fällt hier aus dem Text, bevor die Metasätze
 * geprüft werden; ob die Adresse erlaubt ist, prüft der Link-Vergleich in lib/generator.ts.
 */
export function ohneWebsiteVerweis(text: string, website: string): string {
  const host = website.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#\s]/)[0];
  if (!host) return text;
  const re = new RegExp(
    `\\b(?:mehr|weitere (?:informationen|infos|details))(?: (?:gibt es|finden (?:sie|interessierte)|erhalten sie))? unter (?:https?://)?(?:www\\.)?${escapeRe(host)}\\S*`,
    "gi",
  );
  return text.replace(re, " ");
}

/** Erste Fundstelle eines Musters, die nicht wörtlich in den Angaben steht (was die Person selbst schreibt, ist kein Fehler des Entwurfs). */
function ersteFundstelle(output: MedienOutput, muster: { re: RegExp; was: string }[], input?: MedienInput, texte: string[] = berichtsTexte(output)): string | null {
  const angaben = input ? norm(Object.values(input).join("\n")) : "";
  for (const t of texte) {
    for (const m of muster) {
      const hit = m.re.exec(t);
      if (hit && !(angaben && angaben.includes(norm(hit[0])))) return m.was;
    }
  }
  return null;
}

/** Bezeichnung des ersten Metasatzes im Entwurf; null, wenn keiner da ist. */
export function metaSatz(output: MedienOutput, input?: MedienInput): string | null {
  const texte = berichtsTexte(output);
  if (input?.website) texte[texte.length - 1] = ohneWebsiteVerweis(output.boilerplate, input.website);
  return ersteFundstelle(output, META_MUSTER, input, texte);
}

/** Bezeichnung des ersten Füllsatzes im Entwurf; null, wenn keiner da ist. */
export function fuellSatz(output: MedienOutput, input?: MedienInput): string | null {
  return ersteFundstelle(output, FUELL_MUSTER, input);
}

/** Höflichkeitsformeln mit «herzlich»: «Alle sind herzlich eingeladen» wertet den Betrieb nicht. */
const HOEFLICHKEIT_RE = /(?<![\p{L}])herzlich(?=\s+(?:eingeladen|willkommen)(?![\p{L}]))/gu;

/** Superlative und Werbewörter im Bericht. «einmalig» fehlt hier: «einmalig am Samstag» ist eine Zeitangabe. */
const SUPERLATIV_RE =
  /(?<![\p{L}])(?:beste[nrms]?|grösste[nrms]?|schönste[nrms]?|günstigste[nrms]?|modernste[nrms]?|erfolgreichste[nrms]?|einzigartig\p{L}*|sensationell\p{L}*|revolutionär\p{L}*|unschlagbar\p{L}*|beispiellos\p{L}*|spektakulär\p{L}*|erstklassig\p{L}*|weltklasse|spitzenklasse)(?![\p{L}])/giu;

/**
 * Wertende Wörter und Superlative im Entwurf, die in den Angaben nicht stehen (Wortanfang bei den Wertungen, ganze Wörter bei
 * den Superlativen, ohne Gross- und Kleinschreibung). Was die Person selbst schreibt, ist kein Fehler des Entwurfs.
 */
export function fremdeWertungen(output: MedienOutput, input: MedienInput): string[] {
  const angaben = norm(Object.values(input).join("\n"));
  const text = norm(berichtsTexte(output).join("\n")).replace(HOEFLICHKEIT_RE, " ");
  const stamm = WERTUNG_STAEMME.filter((s) => new RegExp(`(?<![\\p{L}])${s}`, "u").test(text) && !new RegExp(`(?<![\\p{L}])${s}`, "u").test(angaben));
  const superlative = [...new Set(Array.from(text.matchAll(SUPERLATIV_RE), (m) => m[0]))].filter((w) => !new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, "u").test(angaben));
  return [...stamm, ...superlative];
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «lead» (mehr als 40 Wörter), «w-fragen» (Betrieb oder Ort fehlt im Lead), «zahl» (Zahl ohne Angabe: Ziffer oder Zahlwort ab «zwanzig»),
 * «meta» (Satz über die Mitteilung selbst, die Redaktion oder Rückfragen), «fuell» (Füllsatz oder Werbesprache),
 * «wertung» (wertendes Wort oder Superlativ, das nicht in den Angaben steht),
 * «laenge» (Gesamtlänge ausserhalb von `mindestWoerter` (80 bis 150, je nach Angaben) und 400 Wörtern), «zitat» (Zitat nicht aus den Angaben).
 */
export function checkMitteilung(output: MedienOutput, input: MedienInput): string | null {
  if (wordCount(output.lead) > LEAD_MAX_WORDS) return "lead";
  if (!leadNenntBetrieb(output.lead, input) || !leadNenntOrt(output.lead, input)) return "w-fragen";
  if (fremdeZahlen(output, input).length > 0) return "zahl";
  if (metaSatz(output, input)) return "meta";
  if (fuellSatz(output, input)) return "fuell";
  if (fremdeWertungen(output, input).length > 0) return "wertung";
  const n = gesamtWoerter(output);
  if (n < mindestWoerter(input) || n > LAENGE_MAX_WORDS) return "laenge";
  if (!zitatStimmt(output, input)) return "zitat";
  return null;
}

/** Die wertenden Wörter, die die Prüfung ablehnt, als Aufzählung für die Anweisung («beliebt», «traditionsreich», …). */
const WERTUNG_LISTE = WERTUNG_STAEMME.map((w) => `«${w}»`).join(", ");

/** Gesamtlänge, die die Nutzernachricht der KI nennt: etwas über der Untergrenze der Prüfung, bis 40 Wörter unter dem Höchstwert. */
export function laengeZiel(input: Pick<MedienInput, "was" | "wo" | "wer" | "warum" | "zitat" | "bild">): { von: number; bis: number } {
  return { von: mindestWoerter(input) + 30, bis: LAENGE_MAX_WORDS - 40 };
}

const INSTRUCTION = `Schreib eine Medienmitteilung für Schweizer Lokalmedien aus den Angaben.
- Nachrichtenstil: sachlich, in der dritten Person, das Wichtigste zuerst, ohne Werbesprache und ohne Superlative (kein «beste», «grösste», «schönste», «einzigartig»). Das ersetzt die Du-Form der allgemeinen Regeln: «du» und «wir» stehen höchstens im Zitat.
- «anlass» ist die Art der Meldung: eroeffnung = Eröffnung, jubilaeum = Jubiläum, auszeichnung = Auszeichnung, anlass = Anlass oder Veranstaltung, angebot = neues Angebot, personelles = Personelles, anderes = Anderes.
- «titel»: eine Schlagzeile, 20 bis 90 Zeichen, die sagt, was passiert; ohne Doppelpunkt-Kette und ohne Wertung.
- «lead»: höchstens ${LEAD_MAX_WORDS} Wörter, 40 bis 320 Zeichen. Er beantwortet wer (Betrieb aus «betrieb», mit seinem Namen), was, wann («wann», so geschrieben, wie angegeben) und wo (Ort aus «ort» oder «wo»).
- «text»: 2 bis 5 Absätze, je 80 bis 600 Zeichen. Absatz 1: Einzelheiten zu was, wann, wo und wer («wer»). Absatz 2: warum es für die Region von Bedeutung ist («warum»). Weitere Absätze: Hintergrund, ausschliesslich aus den Angaben. Nenne Ort und Kanton, wo es passt.
- Nur Fakten aus den Angaben. Schreib keine Sätze über die Mitteilung selbst («Diese Medienmitteilung informiert …», «Wir freuen uns auf Ihre Berichterstattung», «Bei Rückfragen …», «Bildmaterial steht zur Verfügung»): Kontakt und Bildangebot setzt das Dokument selbst ein. Schreib keine Füllsätze und keine Werbesprache («stösst auf grosses Interesse», «für jeden etwas dabei», «verspricht ein Highlight», «bietet Raum für Begegnungen»). Schreib keine wertenden Wörter und keine Superlative, die nicht wörtlich in den Angaben stehen: ${WERTUNG_LISTE} (auch mit Endungen, etwa «beliebte» oder «spannendes») und «beste», «grösste», «schönste», «einzigartig»; meide auch «erfolgreich», «bekannt» und «wichtig». Erlaubt sind «herzlich eingeladen» und «herzlich willkommen». Behauptungen über Nachfrage, Publikum oder Wirkung gibt es nur, wenn die Angaben sie nennen.
- Gesamtlänge: «titel», «lead», «text», «zitat» und «boilerplate» zusammen so viele Wörter, wie die Nutzernachricht unter «Gesamtlänge» nennt. Sie richtet sich nach dem Umfang der Angaben: Wenige Fakten ergeben eine kurze Mitteilung. Fehlt der Stoff dafür, schreib keine Füllsätze und erfinde keine Einzelheiten; setz stattdessen einen Platzhalter in eckigen Klammern, zum Beispiel [Zahl der Gäste].
- Zahlen nur, wenn sie in den Angaben stehen, als Ziffer oder als Wort («fünfzig», «hundert» zählen auch). Rechne nichts aus und runde nichts. Datum und Uhrzeit schreib so, wie sie in «wann» stehen. Sonst lass die Zahl weg oder setz einen Platzhalter.
- «zitat»: nur, wenn «zitat» in den Angaben nicht leer ist: der Wortlaut aus den Angaben, höchstens leicht geglättet (Gross- und Kleinschreibung, Satzzeichen, offensichtliche Tippfehler), ohne Anführungszeichen, ohne Namen der Person. Nicht erfinden und nicht umformulieren. Das Zitat steht nur in «zitat», nicht im Haupttext. Ist «zitat» leer, ist auch dieses Feld ein leerer String.
- «boilerplate»: drei Sätze über den Betrieb, der erste beginnt mit dem Namen des Betriebs (ohne Artikel). Nimm «positionierung» als Grundlage, wenn sie da ist. Fehlt sie, schreib die Sätze aus «betrieb», «ort», «website» und dem, was die Angaben über das Angebot sagen. Ohne erfundene Zahlen. Steht «website» in den Angaben, folgt nach den drei Sätzen ein vierter, kurzer Satz: «Mehr unter <Adresse aus website>.» Schreib die Adresse genau so, wie sie in «website» steht. Ist «website» leer, gibt es diesen Satz nicht.
- «bildzeile»: nur, wenn «bild» nicht leer ist: eine Zeile, die das Bildangebot nennt (was zu sehen ist, wer fotografiert hat, dass es zur Verfügung steht), ausschliesslich aus «bild». Ist «bild» leer, ist dieses Feld ein leerer String.
Form: {"titel": "…", "lead": "…", "text": ["…"], "zitat": "…", "boilerplate": "…", "bildzeile": "…"}`;

export const medienGenerator = defineGenerator({
  slug: "medienmitteilung",
  input: medienInput,
  output: medienOutput,
  instruction: INSTRUCTION,
  prompt: (i) => {
    const ziel = laengeZiel(i);
    return `${dataPrompt("Angaben zur Mitteilung", i)}\n\nGesamtlänge: ${ziel.von} bis ${ziel.bis} Wörter.`;
  },
  maxTokens: 1400,
  temperature: 0.4,
  check: checkMitteilung,
});

export { medienGenerator as generator };
export default medienGenerator;
