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
export const LAENGE_MIN_WORDS = 150;
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
 * Trennt Datum und Uhrzeit in einzelne Zahlen («14.11.2026» → «14 11 2026», «10.00 Uhr» → «10 00 Uhr»), damit eine
 * andere Schreibweise desselben Datums (14. November 2026) keine fremde Zahl ergibt.
 */
function splitDatum(text: string): string {
  return text
    .replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?![\d])/g, "$1 $2 $3")
    .replace(/(\d{1,2})[.:](\d{2})(?=\s*(?:Uhr|h)\b)/g, "$1 $2");
}

/** Ziffernfolgen im Entwurf, die nicht in den Angaben stehen (ohne Nullen wie die «00» in «10.00 Uhr»). */
export function fremdeZahlen(output: MedienOutput, input: MedienInput): string[] {
  // Jede Angabe für sich und mit einem Wort davor: «14. November» am Zeilenanfang gilt für numbersIn sonst als Listenmarke.
  const known = new Set(Object.values(input).flatMap((value) => numbersIn(splitDatum(`x ${value}`))));
  const found = numbersIn(splitDatum(collectStrings(output).join("\n"))).filter((n) => !/^0+$/.test(n) && !known.has(n));
  return [...new Set(found)];
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

/** Erste Fundstelle eines Musters, die nicht wörtlich in den Angaben steht (was die Person selbst schreibt, ist kein Fehler des Entwurfs). */
function ersteFundstelle(output: MedienOutput, muster: { re: RegExp; was: string }[], input?: MedienInput): string | null {
  const angaben = input ? norm(Object.values(input).join("\n")) : "";
  for (const t of berichtsTexte(output)) {
    for (const m of muster) {
      const hit = m.re.exec(t);
      if (hit && !(angaben && angaben.includes(norm(hit[0])))) return m.was;
    }
  }
  return null;
}

/** Bezeichnung des ersten Metasatzes im Entwurf; null, wenn keiner da ist. */
export function metaSatz(output: MedienOutput, input?: MedienInput): string | null {
  return ersteFundstelle(output, META_MUSTER, input);
}

/** Bezeichnung des ersten Füllsatzes im Entwurf; null, wenn keiner da ist. */
export function fuellSatz(output: MedienOutput, input?: MedienInput): string | null {
  return ersteFundstelle(output, FUELL_MUSTER, input);
}

/** Wertende Wörter im Entwurf, die in den Angaben nicht stehen (Wortanfang, ohne Gross- und Kleinschreibung). */
export function fremdeWertungen(output: MedienOutput, input: MedienInput): string[] {
  const angaben = norm(Object.values(input).join("\n"));
  const text = norm(berichtsTexte(output).join("\n"));
  return WERTUNG_STAEMME.filter((stamm) => new RegExp(`(?<![\\p{L}])${stamm}`, "u").test(text) && !new RegExp(`(?<![\\p{L}])${stamm}`, "u").test(angaben));
}

/**
 * Prüfung, die nur dieses Werkzeug kennt. Gibt den Grund zurück oder null:
 * «lead» (mehr als 40 Wörter), «w-fragen» (Betrieb oder Ort fehlt im Lead), «zahl» (Ziffer ohne Angabe),
 * «meta» (Satz über die Mitteilung selbst, die Redaktion oder Rückfragen), «fuell» (Füllsatz oder Werbesprache),
 * «wertung» (wertendes Wort, das nicht in den Angaben steht),
 * «laenge» (Gesamtlänge ausserhalb von 150 bis 400 Wörtern), «zitat» (Zitat nicht aus den Angaben).
 */
export function checkMitteilung(output: MedienOutput, input: MedienInput): string | null {
  if (wordCount(output.lead) > LEAD_MAX_WORDS) return "lead";
  if (!leadNenntBetrieb(output.lead, input) || !leadNenntOrt(output.lead, input)) return "w-fragen";
  if (fremdeZahlen(output, input).length > 0) return "zahl";
  if (metaSatz(output, input)) return "meta";
  if (fuellSatz(output, input)) return "fuell";
  if (fremdeWertungen(output, input).length > 0) return "wertung";
  const n = gesamtWoerter(output);
  if (n < LAENGE_MIN_WORDS || n > LAENGE_MAX_WORDS) return "laenge";
  if (!zitatStimmt(output, input)) return "zitat";
  return null;
}

const INSTRUCTION = `Schreib eine Medienmitteilung für Schweizer Lokalmedien aus den Angaben.
- Nachrichtenstil: sachlich, in der dritten Person, das Wichtigste zuerst, ohne Werbesprache und ohne Superlative (kein «beste», «grösste», «schönste», «einzigartig»). Das ersetzt die Du-Form der allgemeinen Regeln: «du» und «wir» stehen höchstens im Zitat.
- «anlass» ist die Art der Meldung: eroeffnung = Eröffnung, jubilaeum = Jubiläum, auszeichnung = Auszeichnung, anlass = Anlass oder Veranstaltung, angebot = neues Angebot, personelles = Personelles, anderes = Anderes.
- «titel»: eine Schlagzeile, 20 bis 90 Zeichen, die sagt, was passiert; ohne Doppelpunkt-Kette und ohne Wertung.
- «lead»: höchstens ${LEAD_MAX_WORDS} Wörter, 40 bis 320 Zeichen. Er beantwortet wer (Betrieb aus «betrieb», mit seinem Namen), was, wann («wann», so geschrieben, wie angegeben) und wo (Ort aus «ort» oder «wo»).
- «text»: 2 bis 5 Absätze, je 80 bis 600 Zeichen. Absatz 1: Einzelheiten zu was, wann, wo und wer («wer»). Absatz 2: warum es für die Region von Bedeutung ist («warum»). Weitere Absätze: Hintergrund, ausschliesslich aus den Angaben. Nenne Ort und Kanton, wo es passt.
- Nur Fakten aus den Angaben. Schreib keine Sätze über die Mitteilung selbst («Diese Medienmitteilung informiert …», «Wir freuen uns auf Ihre Berichterstattung», «Bei Rückfragen …», «Bildmaterial steht zur Verfügung»): Kontakt und Bildangebot setzt das Dokument selbst ein. Schreib keine Füllsätze und keine Werbesprache («stösst auf grosses Interesse», «für jeden etwas dabei», «verspricht ein Highlight», «bietet Raum für Begegnungen»). Schreib keine wertenden Wörter («beliebt», «traditionsreich», «erfolgreich», «bekannt», «wichtig», «spannend»), die nicht wörtlich in den Angaben stehen. Behauptungen über Nachfrage, Publikum oder Wirkung gibt es nur, wenn die Angaben sie nennen.
- Gesamtlänge: «titel», «lead», «text», «zitat» und «boilerplate» zusammen ${LAENGE_MIN_WORDS + 30} bis ${LAENGE_MAX_WORDS - 40} Wörter. Fehlt der Stoff dafür, schreib keine Füllsätze und erfinde keine Einzelheiten; setz stattdessen einen Platzhalter in eckigen Klammern, zum Beispiel [Zahl der Gäste].
- Ziffern nur, wenn sie wörtlich in den Angaben stehen. Datum und Uhrzeit schreib genau so, wie sie in «wann» stehen. Sonst schreib die Zahl als Wort oder lass sie weg.
- «zitat»: nur, wenn «zitat» in den Angaben nicht leer ist: der Wortlaut aus den Angaben, höchstens leicht geglättet (Gross- und Kleinschreibung, Satzzeichen, offensichtliche Tippfehler), ohne Anführungszeichen, ohne Namen der Person. Nicht erfinden und nicht umformulieren. Das Zitat steht nur in «zitat», nicht im Haupttext. Ist «zitat» leer, ist auch dieses Feld ein leerer String.
- «boilerplate»: drei Sätze über den Betrieb, der erste beginnt mit dem Namen des Betriebs (ohne Artikel). Nimm «positionierung» als Grundlage, wenn sie da ist. Fehlt sie, schreib die Sätze aus «betrieb», «ort», «website» und dem, was die Angaben über das Angebot sagen. Ohne erfundene Zahlen.
- «bildzeile»: nur, wenn «bild» nicht leer ist: eine Zeile, die das Bildangebot nennt (was zu sehen ist, wer fotografiert hat, dass es zur Verfügung steht), ausschliesslich aus «bild». Ist «bild» leer, ist dieses Feld ein leerer String.
Form: {"titel": "…", "lead": "…", "text": ["…"], "zitat": "…", "boilerplate": "…", "bildzeile": "…"}`;

export const medienGenerator = defineGenerator({
  slug: "medienmitteilung",
  input: medienInput,
  output: medienOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zur Mitteilung", i),
  maxTokens: 1400,
  temperature: 0.4,
  check: checkMitteilung,
});

export { medienGenerator as generator };
export default medienGenerator;
