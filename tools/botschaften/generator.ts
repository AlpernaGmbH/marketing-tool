import { z } from "zod";
import { collectStrings, dataPrompt, defineGenerator, numbersIn, withoutKeys } from "@/lib/generator";

// Generator des Werkzeugs «Kernbotschaften» (Klasse B, docs/TOOL-BAUEN.md Abschnitt 4). Läuft im Browser und auf
// dem Server: nur zod, Strings und reine Funktionen. Die Angaben kommen aus dem Formular und dem Firmenprofil; die
// Route /api/generate prüft Eingabe und Antwort mit denselben Schemas.

export const ANREDE_KEYS = ["du", "sie"] as const;
export type AnredeKey = (typeof ANREDE_KEYS)[number];

export const KANAL_KEYS = ["website", "googleProfil", "instagram", "offerteOderMail"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

export const LIMITS = {
  betrieb: 120,
  branche: 120,
  ort: 80,
  zielgruppe: 200,
  angebotMin: 20,
  angebot: 600,
  wirkungMin: 10,
  wirkung: 300,
  beweise: 600,
  positionierung: 600,
  primaersegment: 200,
  personaName: 60,
  personas: 5,
  botschaftenMin: 3,
  botschaftenMax: 5,
} as const;

export const botschaftenInput = z.object({
  betrieb: z.string().trim().min(1).max(LIMITS.betrieb),
  branche: z.string().trim().max(LIMITS.branche),
  ort: z.string().trim().max(LIMITS.ort),
  zielgruppe: z.string().trim().min(1).max(LIMITS.zielgruppe),
  angebot: z.string().trim().min(LIMITS.angebotMin).max(LIMITS.angebot),
  wirkung: z.string().trim().min(LIMITS.wirkungMin).max(LIMITS.wirkung),
  beweise: z.string().trim().max(LIMITS.beweise),
  anrede: z.enum(ANREDE_KEYS),
  positionierung: z.string().trim().max(LIMITS.positionierung),
  primaersegment: z.string().trim().max(LIMITS.primaersegment),
  personas: z.array(z.string().trim().min(1).max(LIMITS.personaName)).max(LIMITS.personas),
});
export type BotschaftenInput = z.infer<typeof botschaftenInput>;

export const botschaftSchema = z.object({
  /** Zielgruppe oder Anlass, je Botschaft verschieden. */
  fuer: z.string().min(3).max(80),
  satz: z.string().min(20).max(200),
  /** Nur aus den Angaben; fehlt der Beleg, steht ein Platzhalter in eckigen Klammern. */
  beleg: z.string().min(10).max(200),
});
export type Botschaft = z.infer<typeof botschaftSchema>;

export const kanaeleSchema = z.object({
  website: z.string().min(40).max(240),
  googleProfil: z.string().min(40).max(300),
  instagram: z.string().min(30).max(200),
  offerteOderMail: z.string().min(60).max(400),
});
export type Kanaele = z.infer<typeof kanaeleSchema>;

export const botschaftenOutput = z.object({
  hauptbotschaft: z.string().min(30).max(200),
  botschaften: z.array(botschaftSchema).min(LIMITS.botschaftenMin).max(LIMITS.botschaftenMax),
  kanaele: kanaeleSchema,
  telefonsatz: z.string().min(30).max(200),
  nichtSagen: z.array(z.string().min(3).max(80)).min(3).max(6),
});
export type BotschaftenOutput = z.infer<typeof botschaftenOutput>;

export { numbersIn };

/** Unter diesem Schlüssel nennt die KI Aussagen, die der Betrieb nicht mehr macht («Dass wir die Günstigsten sind»): Beispiele, kein Text des Betriebs. */
export const NEGATIVE_KEYS = ["nichtSagen"] as const;

/** «fuer» einer Botschaft als Schlüssel für den Vergleich: ohne Leerraum am Rand, ohne Gross- und Kleinschreibung. */
const fuerKey = (fuer: string) => fuer.replace(/\s+/g, " ").trim().toLowerCase();

/** Die Du-Formen als Anrede an die Kundschaft (mit Endungen), ohne Gross/Klein, an Wortgrenzen. */
const DU_RE = /(?:^|[^\p{L}])(?:du|dich|dir|dein(?:e|em|en|er|es)?)(?=$|[^\p{L}])/iu;
/**
 * Die Sie-Form: gross geschrieben mitten im Satz («für Sie», «mit Ihrem Haus») oder «Ihnen», «Ihr», «Ihre» am Satzanfang.
 * Ein «Sie» am Satzanfang zählt nicht, es kann auch «sie» im Sinn von «die Leute» sein.
 */
const SIE_RE = /[\p{Ll},;:]\s+(?:Sie|Ihnen|Ihr(?:e[mnrs]?)?)(?![\p{L}])|(?:^|[.!?»]\s+|\n)(?:Ihnen|Ihr(?:e[mnrs]?)?)(?![\p{L}])/u;

/** true, wenn der Satz die Kundschaft mit «du», «dich», «dir» oder «dein» anspricht. */
export function hasDuForm(text: string): boolean {
  return DU_RE.test(text);
}

/** true, wenn der Satz die Kundschaft mit «Sie», «Ihnen» oder «Ihr» anspricht. */
export function hasSieForm(text: string): boolean {
  return SIE_RE.test(text);
}

/** Hashtag: ein «#» vor einem Buchstaben, am Anfang oder nach einem Leerzeichen. */
const HASHTAG_RE = /(?:^|[\s(])#\p{L}/u;
/** Superlative, mit denen der Betrieb von sich spricht («der beste und günstigste Malerbetrieb»). Steht die Wendung in den Angaben, ist sie erlaubt. */
const SUPERLATIV_RE = /\b(?:der|die|das|den|dem)\s+(?:beste|günstigste|billigste|schnellste|erfahrenste|beliebteste)[nrms]?\b/giu;
/** Personen mit Titel oder Rolle («Familie Meier», «Gründerin Frieda»): Der Name muss in den Angaben stehen, sonst ist er erfunden. */
const PERSON_RE = /\b(?:Familie|Herr|Herrn|Frau|Gründer|Gründerin|Inhaber|Inhaberin|Geschäftsführer|Geschäftsführerin)\s+(\p{Lu}[\p{Ll}-]+)/gu;

/** Texte, die die Kundschaft anspricht: «kanaele», «telefonsatz» und die Sätze in «botschaften» (Anweisung). */
function anspracheTexte(output: BotschaftenOutput): string[] {
  return [...Object.values(output.kanaele), output.telefonsatz, ...output.botschaften.map((b) => b.satz)];
}

/**
 * Prüfung, die nur dieses Werkzeug kennt: keine Ziffer und kein Zahlwort ab «zwanzig» in einem Text des Entwurfs, die nicht in
 * den Angaben stehen (Betrieb, Branche, Ort, Zielgruppe, Angebot, Wirkung, Beweise, Positionierung, Primärsegment, Personas;
 * «zahl»), «fuer» je Botschaft verschieden («fuer»), die gewählte Anrede in den Texten an die Kundschaft («anrede»: bei «Sie»
 * kein «du», bei «Du» kein «Sie»), kein Hashtag («hashtag»), kein Superlativ über den Betrieb («wertung») und kein Name einer
 * Person mit Titel, der nicht in den Angaben steht («erfunden»).
 * «nichtSagen» zählt nicht: Die Liste nennt Aussagen, die der Betrieb nicht macht; Zahlen, Superlative und Wörter sind dort Beispiele.
 * Gibt den Grund zurück oder null.
 */
export function checkBotschaften(output: BotschaftenOutput, input: BotschaftenInput): string | null {
  const angaben = collectStrings(input).join("\n");
  const known = new Set(numbersIn(angaben));
  const eigene = collectStrings(withoutKeys(output, NEGATIVE_KEYS)).join("\n");
  for (const n of numbersIn(eigene)) if (!known.has(n)) return "zahl";
  const seen = new Set<string>();
  for (const b of output.botschaften) {
    const key = fuerKey(b.fuer);
    if (seen.has(key)) return "fuer";
    seen.add(key);
  }
  // Der Name des Betriebs gehört nicht zur Anrede («Dein Gartenbau», «Ihr Partner AG»).
  const ohneBetrieb = (t: string) => (input.betrieb ? t.split(input.betrieb).join(" ") : t);
  const ansprache = anspracheTexte(output).map(ohneBetrieb);
  if (input.anrede === "sie" && ansprache.some(hasDuForm)) return "anrede";
  if (input.anrede === "du" && ansprache.some(hasSieForm)) return "anrede";
  if (HASHTAG_RE.test(eigene)) return "hashtag";
  const allowed = angaben.toLowerCase();
  for (const m of eigene.matchAll(SUPERLATIV_RE)) if (!allowed.includes(m[0].toLowerCase())) return "wertung";
  for (const m of eigene.matchAll(PERSON_RE)) if (!allowed.includes(m[1].toLowerCase())) return "erfunden";
  return null;
}

const INSTRUCTION = `Schreib die Kernbotschaften eines Schweizer KMU aus den Angaben.
- Aus Kundensicht: Jede Botschaft sagt, was die Kundschaft («zielgruppe») vom Betrieb hat, konkret und belegbar. Keine Superlative, keine Werbesprache, keine Fachwörter aus dem Marketing.
- «wirkung» ist das, was die Kundschaft nach dem Kontakt denken soll. Die Hauptbotschaft führt genau dorthin.
- Anrede der Kundschaft nach «anrede»: du = Du-Form (du, dir, dein), sie = Sie-Form (Sie, Ihnen, Ihr). Das gilt für «kanaele», «telefonsatz» und die Sätze in «botschaften». Der Betrieb spricht von sich in der Wir-Form.
- Nenne Ort und Region des Betriebs («ort»), wo es passt. Fehlt der Ort, schreib den Platzhalter [Ort].
- Zahlen nur, wenn sie wörtlich in den Angaben stehen; auch Zahlwörter wie «zwanzig», «hundert» oder «tausend» zählen dazu. Fehlt eine Zahl, lass sie weg oder setz einen Platzhalter in eckigen Klammern.
- Keine Namen von Personen oder Referenzen, die nicht in den Angaben stehen. Keine Superlative über den Betrieb («der beste», «der günstigste»), ausser sie stehen wörtlich in den Angaben.
- «hauptbotschaft»: ein Satz, 30 bis 200 Zeichen, der Kern, den alle anderen Sätze tragen.
- «botschaften»: ${LIMITS.botschaftenMin} bis ${LIMITS.botschaftenMax} Einträge. «fuer» nennt eine Zielgruppe oder einen Anlass aus den Angaben: die Kundschaft aus «zielgruppe», eine Gruppe aus «primaersegment», eine Persona aus «personas» oder einen Anlass wie Offerte, Reklamation oder Dorffest. «fuer» ist ein kurzer Name mit höchstens 80 Zeichen: Ist die «zielgruppe» länger, kürze sie, zum Beispiel auf «Hausbesitzer in Gossau». Jedes «fuer» ist verschieden. «satz» ist die Botschaft für diese Gruppe oder diesen Anlass, 20 bis 200 Zeichen. «beleg» begründet den Satz ausschliesslich mit Angaben aus «beweise», «angebot» oder «positionierung», 10 bis 200 Zeichen; gibt es keinen Beleg, schreib einen Platzhalter in eckigen Klammern, zum Beispiel [Zahl der Fassaden seit der Gründung].
- «kanaele»: die Hauptbotschaft je Kanal ausformuliert. «website»: ein bis zwei Sätze für die Startseite, 40 bis 240 Zeichen. «googleProfil»: Beschreibung für das Google-Unternehmensprofil in der Wir-Form, 40 bis 300 Zeichen, ohne Link. «instagram»: kurzer Text für die Bio oder einen festen Beitrag, 30 bis 200 Zeichen, ohne Hashtags, ohne Emojis. «offerteOderMail»: ein Absatz für den Anfang einer Offerte oder einer Antwort auf eine Anfrage, 60 bis 400 Zeichen.
- «telefonsatz»: ein gesprochener Satz für das Telefon oder den Stand am Dorffest, 30 bis 200 Zeichen, so, wie die Inhaberin ihn sagen würde.
- «nichtSagen»: 3 bis 6 Aussagen, die der Hauptbotschaft widersprechen oder sie verwässern (Floskeln, Behauptungen ohne Beleg, Versprechen, die der Betrieb nicht hält), je 3 bis 80 Zeichen. Beschreib die Aussage ruhig, statt den Werbesatz zu wiederholen, zum Beispiel «Dass wir alles für alle machen», «Dass wir die Günstigsten in der Region sind», «Ein Preis am Telefon ohne Besichtigung». Hier dürfen auch Wörter stehen, die du selbst nicht verwenden darfst («Marktführer», «ganzheitlich», «Nr. 1»), und Zahlen; keine Ausrufezeichen.
- Nimm «positionierung» als Hintergrund, wenn sie da ist; wiederhole sie nicht wörtlich.
Form: {"hauptbotschaft": "…", "botschaften": [{"fuer": "…", "satz": "…", "beleg": "…"}], "kanaele": {"website": "…", "googleProfil": "…", "instagram": "…", "offerteOderMail": "…"}, "telefonsatz": "…", "nichtSagen": ["…"]}`;

export const botschaftenGenerator = defineGenerator({
  slug: "botschaften",
  input: botschaftenInput,
  output: botschaftenOutput,
  instruction: INSTRUCTION,
  prompt: (i) => dataPrompt("Angaben zum Betrieb", i),
  // Eine Antwort an der Obergrenze des Schemas hat rund 1'350 bis 1'600 Token, eine typische 510 bis 600: 1'400 trägt mehr als drei Viertel davon.
  maxTokens: 1400,
  temperature: 0.5,
  // «nichtSagen» zählt Aussagen auf, die der Betrieb nicht macht; die Wörter der Sperrliste sind dort Beispiele.
  negativeKeys: NEGATIVE_KEYS,
  // Das Ergebnis der Kundschaft («möchte mehr Sichtbarkeit») ist kein Absichtssatz des Textes.
  purposeRules: false,
  check: checkBotschaften,
});

export { botschaftenGenerator as generator };
export default botschaftenGenerator;
