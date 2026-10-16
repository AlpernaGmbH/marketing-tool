import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { KI_HINWEIS } from "@/tools/post-generator/logic";
import { LONG_SENTENCE_WORDS, findingsOf } from "@/tools/textcheck/logic";
import { HEADLINE_MAX, LIMITS as GENERATOR_LIMITS, linkedinOutput, type LinkedinInput, type LinkedinOutput } from "./generator";

// LinkedIn-Profil-Score: reine Funktionen, kein React, kein DOM, kein Netz (CLAUDE.md, Harte Regel 3).
// LinkedIn lässt sich nicht auslesen. Die Person fügt Headline und Info-Text aus ihrem Profil ein. Der Punktwert kommt aus festen Regeln
// (zehn Kriterien, nur Form und Wortwahl der eingefügten Texte); die Vorschläge für Headline und Anfang des Info-Texts schreibt eine KI
// in einem Aufruf (generator.ts). Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von
// LinkedIn. Spec: specs/linkedin-profil.md

export const SLUG = "linkedin-profil";

/** Grenzen der Eingaben in Zeichen. Die Headline darf länger eingefügt werden als der Richtwert, damit das Kriterium «Länge» greift. */
export const LIMITS = GENERATOR_LIMITS;
/** Richtwert für die Länge einer Headline. Die Plattform ändert solche Grenzen. */
export const HEADLINE_RICHTWERT = HEADLINE_MAX;
/** So viele Zeichen vom Anfang des Info-Texts zählen bei der Prüfung auf eine Aussage über die Kundschaft (Richtwert). */
export const ABOUT_ANFANG = 210;
/** Info-Text unter dieser Länge gilt als leer, unter der nächsten als kurz (Zeichen, Richtwert). */
export const ABOUT_KURZ = 100;
export const ABOUT_KNAPP = 300;
export const MAX_VERBESSERUNGEN = 5;

export const RICHTWERT_HINWEIS = "Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn.";
export const REGEL_HINWEIS =
  "Der Punktwert beruht auf festen Regeln, die nur deine eingefügten Texte prüfen. Das Werkzeug hat dein LinkedIn-Profil nicht gelesen und bewertet weder Bild noch Banner noch Aktivität.";
export const KI_AUSFALL =
  "Die Vorschläge der KI sind gerade nicht erreichbar. Der Punktwert und die Verbesserungen beruhen auf festen Regeln und gelten trotzdem. Versuch es später noch einmal über «Angaben ändern».";
export { KI_HINWEIS };

// ---- Stufen ------------------------------------------------------------------------------------

export type StufeName = "Ausbaufähig" | "Solide Basis" | "Stark";

/** Stufen in Worten, Richtwert von Alperna: 0 bis 39, 40 bis 69, 70 bis 100. */
export const STUFEN: readonly { ab: number; name: StufeName }[] = [
  { ab: 70, name: "Stark" },
  { ab: 40, name: "Solide Basis" },
  { ab: 0, name: "Ausbaufähig" },
];
export const STUFEN_HINWEIS = "Stufen: 0 bis 39 Ausbaufähig, 40 bis 69 Solide Basis, 70 bis 100 Stark (Richtwert von Alperna, keine Statistik).";

export function stufe(punktwert: number): StufeName {
  const n = Number.isFinite(punktwert) ? Math.round(punktwert) : 0;
  return (STUFEN.find((s) => n >= s.ab) ?? STUFEN[STUFEN.length - 1]).name;
}

// ---- Wörter und Muster -------------------------------------------------------------------------

/** Gebeugte Formen von Verben, mit denen eine Headline sagt, was die Person tut. Ganze Wörter; Hauptwörter wie «Bauleiter» oder «Macher» zählen nicht. */
const VERBEN = [
  "helfe", "helfen", "hilft", "unterstütze", "unterstützen", "unterstützt", "schaffe", "schaffen", "schafft", "bringe", "bringen", "bringt",
  "mache", "machen", "macht", "begleite", "begleiten", "begleitet", "baue", "bauen", "baut", "sorge", "sorgen", "sorgt", "zeige", "zeigen",
  "zeigt", "löse", "lösen", "löst", "berate", "beraten", "berät", "verhelfe", "verhelfen", "verhilft", "entwickle", "entwickeln", "entwickelt",
  "gestalte", "gestalten", "gestaltet", "steigere", "steigern", "steigert", "spare", "sparen", "spart", "streiche", "streichen", "pflege",
  "pflegen", "plane", "planen", "betreue", "betreuen", "betreut", "repariere", "reparieren", "repariert", "liefere", "liefern", "liefert",
  "erstelle", "erstellen", "erstellt", "verkaufe", "verkaufen", "verkauft", "führe", "führen", "führt", "vertrete", "vertreten", "vertritt",
  "richte", "richten", "richtet", "biete", "bieten", "bietet", "vermittle", "vermitteln", "vermittelt", "übernehme", "übernehmen", "übernimmt",
  "optimiere", "optimieren", "optimiert", "realisiere", "realisieren", "realisiert", "konzipiere", "konzipieren", "konzipiert",
  "unterrichte", "unterrichten", "unterrichtet", "behandle", "behandeln", "behandelt", "coache", "coachen", "coacht", "trainiere", "trainieren",
  "trainiert", "fotografiere", "fotografieren", "fotografiert", "programmiere", "programmieren", "programmiert", "installiere", "installieren",
  "installiert", "saniere", "sanieren", "saniert", "renoviere", "renovieren", "renoviert", "kümmere", "kümmern", "kümmert", "vernetze",
  "vernetzen", "vernetzt", "finde", "finden", "findet",
  // englische Headlines
  "help", "helps", "helping", "build", "builds", "building", "create", "creates", "creating", "grow", "grows", "growing", "deliver", "delivers",
  "delivering", "empower", "empowers", "empowering", "advise", "advises", "advising",
];
const VERB_RE = new RegExp(`(?<![\\p{L}])(?:${VERBEN.join("|")})(?![\\p{L}])`, "iu");
const BEZUG_RE = /(?<![\p{L}])(?:für|bei|for)(?![\p{L}])/iu;
const FUER_RE = /(?<![\p{L}])(?:für|for)(?![\p{L}])/iu;

/**
 * Ein Ort, den die Headline nennt: «in Gossau», «in St. Gallen», «in der Ostschweiz», «im Appenzellerland», «aus Herisau»,
 * «Region Toggenburg», «Raum Gossau». Hauptwörter, die kein Ort sind («in Zukunft», «in Ihrem Alltag», «aus Leidenschaft»), zählen nicht.
 */
const NICHT_ORT =
  "(?:Ihr|Dein|Euer|Sie\\b|Zukunft|Zusammenarbeit|Ruhe|Auftrag|Alltag|Teilzeit|Vollzeit|Leidenschaft|Überzeugung|Erfahrung|Tradition|Liebe|Freude|Berufung|Verantwortung|Qualität)";
const ORT_RE = new RegExp(`(?<![\\p{L}])(?:in|im|aus|rund um|Raum|Region)\\s+(?:der\\s+|dem\\s+)?(?!${NICHT_ORT}\\p{L}*)(?:St\\.\\s?)?[A-ZÄÖÜ]\\p{L}{2,}`, "u");

/** Wörter, die zeigen, dass ein Text seine Kundschaft anspricht (kleingeschrieben verglichen). */
const KUNDSCHAFT_WOERTER = new Set([
  "du", "dich", "dir", "dein", "deine", "deiner", "deinen", "deinem", "deines", "euch", "euer", "eure", "kundschaft", "kunde", "kundin", "kunden", "kundinnen",
  "betriebe", "kmu", "vereine", "mitglieder", "publikum", "sponsoren", "familien", "hausbesitzer", "eigentümer", "eltern", "gäste", "unternehmen", "firmen",
  "gemeinden", "praxen", "arztpraxen", "menschen", "selbständige", "selbstständige", "gewerbe", "landwirte", "mandanten", "patienten", "lernende",
  // englische Headlines
  "sme", "smes", "clients", "customers", "businesses", "founders", "startups", "companies", "teams", "owners", "brands",
]);
/** Wortstämme der Kundschaft, auch in Zusammensetzungen und gebeugt: «Privatkunden», «Hausbesitzern», «Handwerksbetriebe», «Arbeitnehmende». */
const KUNDSCHAFT_STAMM = /^(?:\p{L}*kund\p{L}*|\p{L}*besitzer\p{L}*|eigentümer\p{L}*|\p{L}*mitglied\p{L}*|\p{L}*betriebe[n]?|\p{L}*landwirt\p{L}*|\p{L}*handwerker\p{L}*|patient\p{L}*|mandant\p{L}*|selbständig\p{L}*|selbstständig\p{L}*|familie\p{L}*|sponsor\p{L}*|schüler\p{L}*|\p{L}*nehmende|\p{L}*gebende)$/u;
/** Gross geschrieben ist es die Anrede («Sie», «Ihr Zuhause»); klein ist «sie» ein Pronomen im Plural, «ihr» ein Possessivpronomen. */
const ANREDE_GROSS = new Set(["Sie", "Ihnen", "Ihr", "Ihre", "Ihren", "Ihrem", "Ihrer", "Ihres"]);

/** Ob ein Text seine Kundschaft anspricht (Heuristik über Wörter, kein Urteil über den Inhalt). */
export function sprichtKundschaftAn(text: string): boolean {
  return (text.match(/\p{L}+/gu) ?? []).some((w) => ANREDE_GROSS.has(w) || KUNDSCHAFT_WOERTER.has(w.toLowerCase()) || KUNDSCHAFT_STAMM.test(w.toLowerCase()));
}

/**
 * Aufforderung oder Kontaktweg am Ende des Info-Texts: eine Bitte («Schreib mir», «Sprich mich an», «Ruf mich an», «Melde dich», «Nimm Kontakt auf»,
 * «Kommt vorbei», «Termin vereinbaren», «Offerte anfordern»), ein Satz wie «Gerne berate ich Sie» oder «Ich freue mich auf deine Nachricht»,
 * eine englische Bitte («Let's connect», «DM me») oder ein Weg zu der Person (Adresse, Link, Domain, Telefonnummer).
 * Hauptwörter wie «Buchhaltung», «Kommunikation», «Termine» oder «Ruf in der Region» sind keine Aufforderung.
 */
const AUFRUF_RE = new RegExp(
  [
    // Bitte an die Leserin oder den Leser: Befehlsform mit Gegenüber («Schreib mir», «Melde dich», «Sprich mich an»), nie das Hauptwort («Frage», «Ruf in der Region»)
    "(?<![\\p{L}])(?:schreibe?|schreibt|meld(?:e|et)?|kontaktiere?|kontaktiert|sprich|sprecht|frag(?:e|t)?|vernetze?|vernetzt|bestelle?|bestellt|ruf(?:e|t)?)\\s+(?:mir|uns|mich|dich|dir|euch|deine|deinen|doch|einfach|gerne|mal|eine|ein|gleich|direkt|kurz|jederzeit)(?![\\p{L}])",
    "(?<![\\p{L}])(?:sprechen|fragen|kontaktieren|schreiben|melden|bestellen|buchen|rufen|nehmen)\\s+sie(?![\\p{L}])|(?<![\\p{L}])vernetzen\\s+wir(?![\\p{L}])",
    "(?<![\\p{L}])(?:nimm|nimmt|nehmt)\\s+kontakt|kontakt\\s+aufnehmen",
    "(?<![\\p{L}])komm(?:e|en|t)?\\s+(?:\\p{L}+\\s+){0,3}vorbei(?![\\p{L}])|(?<![\\p{L}])komm(?:e|en|t)?\\s+zu\\s+(?:dir|ihnen|euch)(?![\\p{L}])",
    "(?<![\\p{L}])(?:vereinbar(?:e|en|t)?|buch(?:e|en|t)?|fixier(?:e|en|t)?)\\s+(?:sie\\s+|dir\\s+|euch\\s+)?(?:einen\\s+|ein\\s+|jetzt\\s+)?(?:termin|gespräch|erstgespräch|besichtigung)",
    "(?<![\\p{L}])(?:termine?|erstgespräche?|gespräche?|besichtigung(?:en)?)\\s+(?:jetzt\\s+)?(?:vereinbaren|buchen|ausmachen)",
    "(?<![\\p{L}])(?:fordere?n?|hol(?:e|en|t)?)\\s+(?:dir\\s+|sie\\s+|euch\\s+)?(?:eine\\s+)?(?:offerte|offerten)|offerte\\s+(?:anfordern|einholen|anfragen)",
    "(?<![\\p{L}])(?:anfragen?|nachrichten?|offerten?|anrufe?)\\s+(?:sind\\s+)?(?:jederzeit\\s+|gerne\\s+)?willkommen",
    "(?<![\\p{L}])bei\\s+fragen(?![\\p{L}])|(?<![\\p{L}])wenn\\s+(?:sie|du|ihr)\\s+(?:\\p{L}+\\s+){0,3}fragen?\\s+(?:haben|hast|habt)(?![\\p{L}])",
    // Sätze in der Ich- und Wir-Form
    "(?<![\\p{L}])(?:berate|beraten)\\s+(?:ich|wir)\\s+(?:sie|dich|euch)|(?<![\\p{L}])(?:ich|wir)\\s+(?:berate|beraten)\\s+(?:sie|dich|euch)",
    "freue(?:n)?\\s+(?:mich|uns)\\s+auf\\s+(?:ihre|deine|eure|ihren|deinen|euren)",
    "(?<![\\p{L}])(?:erreichst\\s+du|erreichen\\s+sie|erreicht\\s+ihr)\\s+(?:mich|uns)|(?<![\\p{L}])lass(?:t)?\\s+uns",
    // englisch
    "let['’]s|let\\s+us\\s+connect|get\\s+in\\s+touch|dm\\s+me|(?:write|message|call|contact)\\s+(?:me|us)|reach\\s+out|connect\\s+with\\s+(?:me|us)",
    // Weg zur Person: Adresse, Link, Domain, Telefonnummer
    "@|https?:|www\\.|[a-z0-9-]+\\.(?:ch|com|de|net|org)(?![\\p{L}])|\\+?\\d[\\d ]{7,}\\d",
  ].join("|"),
  "iu",
);
const AUFRUF_ENDE = 300;

const compact = (s: string) => s.replace(/\s+/g, " ").trim();
const compactMultiline = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** Floskeln und lange Sätze kommen aus dem Regelsatz des Textchecks (tools/textcheck/logic.ts). */
function floskeln(text: string): { titel: string; text: string; hinweis: string }[] {
  return findingsOf(text)
    .filter((f) => f.kind === "floskel")
    .map((f) => {
      const e = f.examples[0];
      const treffer = e ? compact(text.slice(e.start, e.end)) : f.title;
      return { titel: f.title, text: `«${treffer}» ist eine Floskel${f.count > 1 ? ` (${f.count} Mal)` : ""}.`, hinweis: f.hint };
    });
}

function langeSaetze(about: string): { anzahl: number; laengster: number } {
  const f = findingsOf(about).find((x) => x.id === "lange-saetze");
  if (!f) return { anzahl: 0, laengster: 0 };
  const woerter = Number(/^(\d+) Wörter/.exec(f.examples[0]?.excerpt ?? "")?.[1] ?? LONG_SENTENCE_WORDS + 1);
  return { anzahl: f.count, laengster: woerter };
}

// ---- Kriterien ---------------------------------------------------------------------------------

export type Stelle = "Headline" | "Info-Text";
export type Punkte = 0 | 1 | 2;
export type KriteriumId = "h-laenge" | "h-aussage" | "h-beleg" | "h-floskel" | "i-nutzen" | "i-kundschaft" | "i-saetze" | "i-umfang" | "i-floskel" | "i-aufruf";

export type Kriterium = {
  id: KriteriumId;
  stelle: Stelle;
  /** Kurzname für Tabelle und Balken. */
  kurz: string;
  /** Gewicht in Punkten; alle zusammen ergeben 100 (Richtwert von Alperna). */
  gewicht: number;
  /** Was auffällt bei 0 und bei 1 Punkt. */
  fehlt: readonly [string, string];
  /** Ein Satz, wie es besser geht. */
  wie: string;
};

export const KRITERIEN: readonly Kriterium[] = [
  {
    id: "h-laenge",
    stelle: "Headline",
    kurz: "Länge der Headline",
    gewicht: 6,
    fehlt: [`Die Headline fehlt oder ist länger als der Richtwert von ${HEADLINE_RICHTWERT} Zeichen.`, "Die Headline ist sehr kurz und nutzt den Platz nicht."],
    wie: "Nutze die Zeichen für einen Satz, der sagt, wem du wobei hilfst.",
  },
  {
    id: "h-aussage",
    stelle: "Headline",
    kurz: "Sagt, wem du wobei hilfst",
    gewicht: 18,
    fehlt: [
      "Die Headline enthält weder ein Verb wie «helfe» noch einen Bezug wie «für» oder «bei». Sie nennt vermutlich nur einen Titel.",
      "Die Headline zeigt ein Verb oder einen Bezug auf die Kundschaft, aber nicht beides.",
    ],
    wie: "Schreib zum Beispiel «Ich helfe … bei …» oder «… für …» und nenne die Kundschaft.",
  },
  {
    id: "h-beleg",
    stelle: "Headline",
    kurz: "Beleg in der Headline",
    gewicht: 6,
    fehlt: ["Die Headline enthält weder eine Zahl noch einen Ort.", "Die Headline nennt einen Ort, aber keine Zahl."],
    wie: "Ein Beleg macht die Aussage glaubhaft: eine Zahl, ein Ort oder eine Referenz. Nenne nur, was du belegen kannst.",
  },
  {
    id: "h-floskel",
    stelle: "Headline",
    kurz: "Headline ohne Floskeln",
    gewicht: 8,
    fehlt: ["Die Headline fehlt oder enthält eine Floskel.", "Die Headline enthält eine Floskel."],
    wie: "Ersetze die Floskel durch eine Tatsache aus deinem Alltag.",
  },
  {
    id: "i-nutzen",
    stelle: "Info-Text",
    kurz: "Beginnt mit dem Nutzen",
    gewicht: 16,
    fehlt: ["Der Info-Text fehlt oder beginnt mit «Ich bin» oder «Mein Name».", "Der Info-Text beginnt mit «Ich» und stellt dich vor, bevor er den Nutzen nennt."],
    wie: "Beginne mit dem, was deine Kundschaft von dir hat, und stell dich danach vor.",
  },
  {
    id: "i-kundschaft",
    stelle: "Info-Text",
    kurz: "Spricht die Kundschaft an",
    gewicht: 12,
    fehlt: [
      `Die ersten ${ABOUT_ANFANG} Zeichen und auch der Rest des Anfangs sagen nichts über deine Kundschaft.`,
      `Die Kundschaft kommt erst nach den ersten ${ABOUT_ANFANG} Zeichen vor.`,
    ],
    wie: "Sprich deine Kundschaft in den ersten Zeilen direkt an: Wem hilfst du, und wobei?",
  },
  {
    id: "i-saetze",
    stelle: "Info-Text",
    kurz: "Kurze Sätze",
    gewicht: 8,
    fehlt: [`Mehrere Sätze sind länger als ${LONG_SENTENCE_WORDS} Wörter.`, `Ein Satz ist länger als ${LONG_SENTENCE_WORDS} Wörter.`],
    wie: "Teile lange Sätze an einem Komma oder einem «und» in zwei.",
  },
  {
    id: "i-umfang",
    stelle: "Info-Text",
    kurz: "Genug Text",
    gewicht: 8,
    fehlt: [`Der Info-Text fehlt oder hat unter ${ABOUT_KURZ} Zeichen.`, `Der Info-Text ist knapp (unter ${ABOUT_KNAPP} Zeichen).`],
    wie: "Nutze den Platz: Angebot, Ort, ein Beleg und der nächste Schritt gehören hinein.",
  },
  {
    id: "i-floskel",
    stelle: "Info-Text",
    kurz: "Info-Text ohne Floskeln",
    gewicht: 8,
    fehlt: ["Der Info-Text fehlt oder enthält mehrere Floskeln.", "Der Info-Text enthält eine Floskel."],
    wie: "Ersetze Floskeln durch Tatsachen: Was machst du, für wen, mit welchem Ergebnis?",
  },
  {
    id: "i-aufruf",
    stelle: "Info-Text",
    kurz: "Nächster Schritt am Ende",
    gewicht: 10,
    fehlt: ["Am Ende des Info-Texts steht weder ein nächster Schritt noch ein Weg zu dir.", "Am Ende des Info-Texts steht kein klarer nächster Schritt."],
    wie: "Schliesse mit einem Satz wie «Schreib mir, wenn …» und nenne einen Weg zu dir.",
  },
];

export const KRITERIEN_IDS: readonly KriteriumId[] = KRITERIEN.map((k) => k.id);
export const GEWICHT_SUMME = KRITERIEN.reduce((n, k) => n + k.gewicht, 0);
/** So viele der 100 Punkte hängen an der Headline und am Info-Text. Wer nur einen der beiden Texte einfügt, kann den Rest nicht erreichen. */
export const GEWICHT_STELLE: Record<Stelle, number> = {
  Headline: KRITERIEN.filter((k) => k.stelle === "Headline").reduce((n, k) => n + k.gewicht, 0),
  "Info-Text": KRITERIEN.filter((k) => k.stelle === "Info-Text").reduce((n, k) => n + k.gewicht, 0),
};

/** Ein Satz, wenn nur einer der beiden Texte eingefügt ist: Mehr als der Anteil dieser Stelle ist nicht möglich, die Stufe bleibt darum tiefer. Sonst null. */
export function nurEinText(headline: string, about: string): string | null {
  const h = headline.trim() !== "";
  const a = about.trim() !== "";
  if (h === a) return null;
  const da = h ? "Headline" : "Info-Text";
  const fehlt = h ? "Info-Text" : "Headline";
  return `Du hast nur ${h ? "die Headline" : "den Info-Text"} eingefügt. ${h ? "Sie" : "Er"} kann höchstens ${GEWICHT_STELLE[da]} von 100 Punkten bringen, darum bleibt die Stufe tief. Füge ${h ? "auch den" : "auch die"} ${fehlt} ein, dann zählt das ganze Profil.`;
}

export function kriteriumOf(id: KriteriumId): Kriterium {
  return KRITERIEN.find((k) => k.id === id) ?? KRITERIEN[0];
}

/** Punkte eines Kriteriums (0, 1 oder 2) für die eingefügten Texte. Ein leerer Text ergibt 0 für alle seine Kriterien. */
export function punkteFuer(id: KriteriumId, headline: string, about: string): Punkte {
  const h = compact(headline ?? "");
  const a = compactMultiline(about ?? "");
  const headlineKriterium = id.startsWith("h-");
  if (headlineKriterium ? h === "" : a === "") return 0;

  switch (id) {
    case "h-laenge":
      return h.length > HEADLINE_RICHTWERT ? 0 : h.length < 25 ? 1 : 2;
    case "h-aussage": {
      const verb = VERB_RE.test(h);
      const bezug = BEZUG_RE.test(h) || sprichtKundschaftAn(h);
      return verb && bezug ? 2 : verb || FUER_RE.test(h) || sprichtKundschaftAn(h) ? 1 : 0;
    }
    case "h-beleg":
      return /\d/.test(h) ? 2 : ORT_RE.test(h) ? 1 : 0;
    case "h-floskel":
      return floskeln(h).length === 0 ? 2 : 0;
    case "i-nutzen":
      return /^[\s"«»'„“”]*(?:ich bin|mein name)(?![\p{L}])/iu.test(a) ? 0 : /^[\s"«»'„“”]*ich(?![\p{L}])/iu.test(a) ? 1 : 2;
    case "i-kundschaft":
      return sprichtKundschaftAn(a.slice(0, ABOUT_ANFANG)) ? 2 : sprichtKundschaftAn(a.slice(0, 600)) ? 1 : 0;
    case "i-saetze": {
      const n = langeSaetze(a).anzahl;
      return n === 0 ? 2 : n === 1 ? 1 : 0;
    }
    case "i-umfang":
      return a.length < ABOUT_KURZ ? 0 : a.length < ABOUT_KNAPP ? 1 : 2;
    case "i-floskel": {
      const n = floskeln(a).length;
      return n === 0 ? 2 : n === 1 ? 1 : 0;
    }
    case "i-aufruf":
      return AUFRUF_RE.test(a.slice(-AUFRUF_ENDE)) ? 2 : 0;
  }
}

export type Zeile = { id: KriteriumId; stelle: Stelle; kurz: string; punkte: Punkte; gewicht: number; erreicht: number; offen: number };
export type Bewertung = { score: number; stufe: StufeName; zeilen: Zeile[] };

/** Der Punktwert: Summe über alle Kriterien von Gewicht × Punkte ÷ 2. Alle Gewichte sind gerade, darum ist jede Summe ganzzahlig. */
export function bewerten(headline: string, about: string): Bewertung {
  const zeilen = KRITERIEN.map((k): Zeile => {
    const punkte = punkteFuer(k.id, headline, about);
    const erreicht = (k.gewicht * punkte) / 2;
    return { id: k.id, stelle: k.stelle, kurz: k.kurz, punkte, gewicht: k.gewicht, erreicht, offen: k.gewicht - erreicht };
  });
  const score = Math.round(zeilen.reduce((n, z) => n + z.erreicht, 0));
  return { score, stufe: stufe(score), zeilen };
}

// ---- Verbesserungen ----------------------------------------------------------------------------

export type Verbesserung = {
  id: KriteriumId;
  stelle: Stelle;
  titel: string;
  offen: number;
  /** Was auffällt. */
  fehlt: string;
  /** Wie es besser geht. */
  wie: string;
  /** Konkrete Stellen (zum Beispiel die gefundene Floskel). */
  funde: string[];
};

function fundeFuer(id: KriteriumId, headline: string, about: string): string[] {
  const h = compact(headline ?? "");
  const a = compactMultiline(about ?? "");
  switch (id) {
    case "h-laenge":
      return h.length > HEADLINE_RICHTWERT ? [`Die Headline hat ${h.length} Zeichen. Der Richtwert liegt bei ${HEADLINE_RICHTWERT}.`] : [];
    case "h-floskel":
      return floskeln(h).map((f) => f.text);
    case "i-floskel":
      return floskeln(a).map((f) => f.text);
    case "i-saetze": {
      const s = langeSaetze(a);
      return s.anzahl === 0 ? [] : [s.anzahl > 1 ? `${s.anzahl} Sätze sind lang, der längste hat ${s.laengster} Wörter.` : `Ein Satz hat ${s.laengster} Wörter.`];
    }
    default:
      return [];
  }
}

/** Die Kriterien mit offenen Punkten, absteigend nach offenen Punkten, bei Gleichstand in der Reihenfolge der Kriterien; höchstens `max`. */
export function verbesserungen(headline: string, about: string, max: number = MAX_VERBESSERUNGEN): Verbesserung[] {
  const bew = bewerten(headline, about);
  return bew.zeilen
    .map((z, index) => ({ z, index }))
    .filter(({ z }) => z.punkte < 2)
    .sort((x, y) => y.z.offen - x.z.offen || x.index - y.index)
    .slice(0, Math.max(0, max))
    .map(({ z }) => {
      const k = kriteriumOf(z.id);
      return {
        id: z.id,
        stelle: z.stelle,
        titel: k.kurz,
        offen: z.offen,
        fehlt: k.fehlt[z.punkte === 0 ? 0 : 1],
        wie: k.wie,
        funde: fundeFuer(z.id, headline, about),
      };
    });
}

export const punkteWort = (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkte"}`;

/** Eine Verbesserung als Satz für Liste, PDF und Markdown. */
export function verbesserungText(v: Verbesserung): string {
  const funde = v.funde.length > 0 ? ` ${v.funde.join(" ")}` : "";
  return `${v.titel} (${v.stelle}, ${punkteWort(v.offen)} offen): ${v.fehlt}${funde} So geht es: ${v.wie}`;
}

/** Die Hinweise der Regeln als kurze Sätze für die KI (höchstens acht, je höchstens 160 Zeichen). */
export function hinweiseFuerKi(headline: string, about: string): string[] {
  return verbesserungen(headline, about, LIMITS.hinweise).map((v) => `${v.stelle}: ${v.fehlt}`.slice(0, LIMITS.hinweis));
}

// ---- Der Rest des Profils ----------------------------------------------------------------------

/** Was sich nicht einfügen lässt, steht als Liste ohne Punkte. Bereichsnamen von LinkedIn: nur «Im Fokus» ist gesichert (Hilfeseite von LinkedIn). */
export const REST_PROFIL: readonly { titel: string; text: string }[] = [
  { titel: "Profilbild", text: "Ein gut erkennbares Gesicht oder Logo auf ruhigem Hintergrund." },
  { titel: "Banner", text: "Ein eigenes Banner mit einer Aussage statt des Standardbilds." },
  { titel: "Im Fokus", text: "Mehrere Verlinkungen auf Beispiele, Angebote oder Referenzen." },
  { titel: "Erfahrung", text: "Stationen mit Ergebnissen statt nur Titel und Daten." },
  { titel: "Empfehlungen", text: "Mehrere Empfehlungen von Kundinnen und Kunden." },
  { titel: "Aktivität", text: "Regelmässig Beiträge oder Kommentare statt Funkstille." },
  { titel: "Adresse des Profils", text: "Eine Adresse mit deinem Namen (linkedin.com/in/vorname-nachname) statt der Standardadresse." },
];

// ---- Stand -------------------------------------------------------------------------------------

export type LinkedinState = {
  v: 2;
  phase: "edit" | "result";
  headline: string;
  about: string;
  zielgruppe: string;
  /** Momentaufnahme aus dem Profil beim Auswerten, damit das Ergebnis stabil bleibt. */
  firma: string;
  branche: string;
  /** Vorschläge der KI; null, wenn es keine gibt. */
  ki: LinkedinOutput | null;
  /** true: Die KI war beim Auswerten nicht erreichbar; das Ergebnis zeigt nur die Regeln. */
  kiAusfall: boolean;
  /** Punktwert und Stufe, damit lib/progress.ts das Werkzeug als erledigt zählt. Wird beim Lesen neu berechnet. */
  output?: { score: number; stufe: StufeName };
};

export const EMPTY_STATE: LinkedinState = { v: 2, phase: "edit", headline: "", about: "", zielgruppe: "", firma: "", branche: "", ki: null, kiAusfall: false };

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export function outputOf(headline: string, about: string): { score: number; stufe: StufeName } {
  const b = bewerten(headline, about);
  return { score: b.score, stufe: b.stufe };
}

/** Meldet, warum es nicht losgehen kann; null: in Ordnung. Mindestens Headline oder Info-Text. */
export function validate(s: Pick<LinkedinState, "headline" | "about">): string | null {
  if (s.headline.trim() === "" && s.about.trim() === "") return "Füge die Headline oder den Info-Text deines Profils ein. Beides ist besser.";
  if (s.headline.length > LIMITS.headline) return `Die Headline darf höchstens ${LIMITS.headline} Zeichen lang sein.`;
  if (s.about.length > LIMITS.about) return `Der Info-Text darf höchstens ${LIMITS.about} Zeichen lang sein.`;
  return null;
}

/** Liest den Stand aus dem Browser. Kaputte Daten und Stände einer früheren Fassung ergeben den leeren Stand. */
export function parseState(raw: unknown): LinkedinState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 2) return EMPTY_STATE;
  const base = {
    headline: text(r.headline, LIMITS.headline),
    about: text(r.about, LIMITS.about),
    zielgruppe: text(r.zielgruppe, LIMITS.zielgruppe),
    firma: text(r.firma, LIMITS.betrieb),
    branche: text(r.branche, LIMITS.branche),
  };
  const ki = linkedinOutput.safeParse(r.ki);
  const kiOk = ki.success ? ki.data : null;
  const kiAusfall = kiOk === null && r.kiAusfall === true;
  if (r.phase === "result" && validate(base) === null) {
    return { v: 2, phase: "result", ...base, ki: kiOk, kiAusfall, output: outputOf(base.headline, base.about) };
  }
  return { v: 2, phase: "edit", ...base, ki: kiOk, kiAusfall };
}

/** Die Zielgruppe aus dem Profil, auf 80 Zeichen am letzten Leerzeichen gekürzt; leer ohne Angabe. */
export function zielgruppeVorschlag(primaersegment: string | undefined): string {
  const t = clip(primaersegment, 400);
  if (t.length <= LIMITS.zielgruppe) return t;
  const cut = t.slice(0, LIMITS.zielgruppe);
  const i = cut.lastIndexOf(" ");
  return (i > 20 ? cut.slice(0, i) : cut).replace(/[\s,;:.–-]+$/, "");
}

/** Füllt die Zielgruppe aus dem Profil ein, wenn die Person noch keine getippt hat. Eine getippte Zielgruppe wird nie überschrieben. */
export function vorbefuellt<T extends Pick<LinkedinState, "zielgruppe">>(s: T, profile: { primaersegment?: string }): T {
  return s.zielgruppe.trim() === "" ? { ...s, zielgruppe: zielgruppeVorschlag(profile.primaersegment) } : s;
}

/** Die Eingabe für den KI-Aufruf aus den Angaben der Person und den Hinweisen der Regeln. */
export function kiInput(s: Pick<LinkedinState, "headline" | "about" | "zielgruppe" | "firma" | "branche">): LinkedinInput {
  return {
    betrieb: clip(s.firma, LIMITS.betrieb),
    branche: clip(s.branche, LIMITS.branche),
    zielgruppe: clip(s.zielgruppe, LIMITS.zielgruppe),
    headline: compact(s.headline).slice(0, LIMITS.headline),
    about: compactMultiline(s.about).slice(0, LIMITS.about),
    hinweise: hinweiseFuerKi(s.headline, s.about),
  };
}

// ---- Dokument und Texte fürs CRM ---------------------------------------------------------------

const SECTION_VERBESSERUNGEN = "Verbesserungen";
export const SECTION_KI = "Vorschläge der KI";
export const SECTION_INFO = "Neuer Anfang für den Info-Text";
const SECTION_REST = "Der Rest deines Profils";
const SECTION_HINWEISE = "Hinweise";

export const HINWEISE: readonly [string, string, string] = [
  `${RICHTWERT_HINWEIS} ${STUFEN_HINWEIS}`,
  "Der Punktwert folgt festen Regeln für Form und Wortwahl, nicht einer Bewertung durch eine KI. Die Vorschläge der KI sind Entwürfe: Prüfe Namen, Zahlen und Aussagen, bevor du einen übernimmst.",
  `Die Plattform ändert Funktionen und Grenzen, auch die Länge der Headline (Richtwert ${HEADLINE_RICHTWERT} Zeichen). Prüfe in deinem Profil, was gerade möglich ist.`,
];

export type DokumentTeile = { vor: DocBlock[]; ki: DocBlock[]; nach: DocBlock[] };

/** Das Dokument in drei Teilen: Die Oberfläche setzt zwischen `vor` und `nach` die Vorschläge der KI mit Kopieren-Knöpfen. */
export function documentParts(s: LinkedinState): DokumentTeile {
  const bew = bewerten(s.headline, s.about);
  const liste = verbesserungen(s.headline, s.about);
  const facts: { label: string; value: string }[] = [];
  if (s.firma.trim()) facts.push({ label: "Betrieb", value: s.firma.trim() });
  if (s.branche.trim()) facts.push({ label: "Branche", value: s.branche.trim() });

  const schwach = bew.zeilen.reduce((best, z) => (z.offen > best.offen ? z : best), bew.zeilen[0]);
  const vor: DocBlock[] = [];
  if (facts.length > 0) vor.push({ type: "facts", items: facts });
  vor.push(
    { type: "stat", label: "LinkedIn-Profil-Score", value: String(bew.score), of: "100", band: bew.stufe, note: "Richtwert von Alperna, keine Statistik" },
    { type: "paragraph", text: REGEL_HINWEIS },
    ...(nurEinText(s.headline, s.about) ? [{ type: "paragraph" as const, text: nurEinText(s.headline, s.about) as string }] : []),
    {
      type: "bars",
      title: "Erreichte Punkte je Kriterium, in Prozent des Gewichts",
      unit: "%",
      max: 100,
      items: bew.zeilen.map((z) => ({
        label: `${z.stelle}: ${z.kurz}`,
        value: Math.round((z.erreicht / z.gewicht) * 100),
        note: `${z.erreicht} von ${z.gewicht} Punkten`,
        highlight: schwach.offen > 0 && z.id === schwach.id,
      })),
    },
    { type: "heading", level: 1, text: SECTION_VERBESSERUNGEN },
  );
  if (liste.length > 0) vor.push({ type: "list", ordered: true, items: liste.map(verbesserungText) });
  else vor.push({ type: "paragraph", text: "Nach den festen Regeln gibt es nichts zu verbessern. Prüfe alle paar Monate, ob deine Texte noch zu deinem Angebot passen." });

  const ki: DocBlock[] = [{ type: "heading", level: 1, text: SECTION_KI }];
  if (s.ki) {
    ki.push(
      { type: "paragraph", text: KI_HINWEIS },
      { type: "list", ordered: true, items: s.ki.headlines.map((h) => `${h.text} (${h.grund})`) },
      { type: "heading", level: 2, text: SECTION_INFO },
      { type: "paragraph", text: s.ki.infoAnfang },
    );
  } else {
    ki.push({ type: "paragraph", text: s.kiAusfall ? KI_AUSFALL : "Zu diesem Stand gibt es keine Vorschläge der KI." });
  }

  const nach: DocBlock[] = [
    { type: "heading", level: 1, text: SECTION_REST },
    { type: "paragraph", text: "Diese Teile lassen sich nicht einfügen und zählen darum nicht im Punktwert. Prüfe sie in deinem Profil." },
    { type: "cards", items: REST_PROFIL.map((r) => ({ title: r.titel, text: r.text })) },
    { type: "heading", level: 1, text: SECTION_HINWEISE },
    { type: "list", items: [...HINWEISE] },
  ];
  return { vor, ki, nach };
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(s: LinkedinState): DocumentModel {
  const b = bewerten(s.headline, s.about);
  const teile = documentParts(s);
  return {
    title: "LinkedIn-Profil-Score",
    subtitle: `Punktwert ${b.score} von 100, Stufe «${b.stufe}»`,
    firma: s.firma.trim() || undefined,
    filename: `linkedin-profil-${safeFilename(s.firma, "betrieb")}`,
    blocks: [...teile.vor, ...teile.ki, ...teile.nach],
  };
}

/** Die Angaben fürs CRM, eine je Zeile. Der Server kürzt auf 1'900 Zeichen; Betrieb und Headline stehen darum oben. */
export function eingabeText(s: Pick<LinkedinState, "firma" | "branche" | "zielgruppe" | "headline" | "about">): string {
  const line = (label: string, value: string) => (value.trim() ? `${label}: ${value.replace(/\s*\n\s*/g, " ").trim()}` : "");
  return [
    line("Betrieb", s.firma),
    line("Branche", s.branche),
    line("Zielgruppe", s.zielgruppe),
    line("Eingefügte Headline", s.headline),
    line("Eingefügter Info-Text", s.about),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(s: LinkedinState): string {
  return toMarkdown(toDocument(s));
}

/** Der Text fürs CRM: Das Wichtigste (die Vorschläge der KI) steht vorn, weil der Server auf 1'900 Zeichen kürzt. Ansicht und Dateien bleiben, wie sie sind. */
export function ausgabeText(s: LinkedinState): string {
  const doc = toDocument(s);
  const teile = documentParts(s);
  return toMarkdown({ ...doc, blocks: teile.ki.length > 0 ? [...teile.ki, ...teile.vor, ...teile.nach] : doc.blocks });
}

// ---- Beispiel ----------------------------------------------------------------------------------

/** Beispiel «Malerei Keller, Gossau»: eine knappe Headline und ein Info-Text, der mit «Ich bin» beginnt. Firma und Branche kommen aus dem Profil. */
export const SAMPLE: Pick<LinkedinState, "headline" | "about" | "zielgruppe"> = {
  headline: "Malermeister bei Malerei Keller",
  about:
    "Ich bin Malermeister und führe die Malerei Keller in dritter Generation. Wir streichen Fassaden und Innenräume in Gossau, Flawil und Herisau und beraten bei der Farbwahl.",
  zielgruppe: "Familien in Gossau",
};
