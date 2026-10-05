import { typoCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { LONG_SENTENCE_WORDS, findingsOf } from "@/tools/textcheck/logic";

// LinkedIn-Profil-Score: reine Funktionen, kein React, kein DOM, kein Netz (CLAUDE.md, Harte Regel 3).
// LinkedIn lässt sich nicht auslesen. Die Person beantwortet acht Fragen zu ihrem Profil (Selbsteinschätzung) und fügt auf Wunsch
// Headline und Anfang des Info-Texts ein. Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine
// Vorgabe von LinkedIn. Die Funde in den eingefügten Texten sind regelbasiert und ändern den Punktwert nicht.
// Spec: specs/linkedin-profil.md

export const SLUG = "linkedin-profil";

/** Grenzen der Eingaben in Zeichen. Die Headline darf länger eingefügt werden als der Richtwert, damit der Fund «zu lang» greift. */
export const LIMITS = { headline: 300, about: 600, zielgruppe: 80, ergebnis: 80, beweis: 80, firma: 120, branche: 120 } as const;
/** Richtwert für die Länge einer Headline. Die Plattform ändert solche Grenzen. */
export const HEADLINE_RICHTWERT = 220;
/** So viele Zeichen vom Anfang des Info-Texts zählen bei der Prüfung auf eine Aussage über die Kundschaft (Richtwert). */
export const ABOUT_ANFANG = 210;
export const MAX_VERBESSERUNGEN_FRAGEN = 5;

export const RICHTWERT_HINWEIS =
  "Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn.";
export const SELBSTEINSCHAETZUNG_HINWEIS = "Der Punktwert beruht auf deinen Antworten. Das Werkzeug hat dein LinkedIn-Profil nicht gelesen.";

// ---- Fragen ------------------------------------------------------------------------------------

export type FrageId = "headline" | "profilbild" | "banner" | "info" | "fokus" | "erfahrung" | "empfehlungen" | "aktivitaet";
export type Punkte = 0 | 1 | 2;
export type Antworten = Partial<Record<FrageId, Punkte>>;

export type Antwort = {
  punkte: Punkte;
  label: string;
  /** Was auf dem Profil fehlt. Bei der vollen Punktzahl leer. */
  fehlt: string;
  /** Eine kurze Anleitung. Bei der vollen Punktzahl leer. */
  anleitung: string;
};

export type Frage = {
  id: FrageId;
  /** Kurzer Name für Tabelle, Fehlermeldungen und Verbesserungen. */
  kurz: string;
  text: string;
  /** Gewicht an den 100 Punkten. Richtwert von Alperna. */
  gewicht: number;
  /** Genau drei Antworten, in der Reihenfolge 0, 1, 2 Punkte. */
  antworten: readonly [Antwort, Antwort, Antwort];
  hilfe?: string;
};

export const FRAGEN: readonly Frage[] = [
  {
    id: "headline",
    kurz: "Headline",
    text: "Was steht in deiner Headline?",
    gewicht: 20,
    antworten: [
      {
        punkte: 0,
        label: "Nur der Standardtext, den ich nie angepasst habe",
        fehlt: "Deine Headline sagt nichts darüber, wem du hilfst.",
        anleitung: "Schreib in einem Satz, wem du wobei hilfst, und nenne wenn möglich einen Beleg. Die Vorschläge weiter unten helfen beim Formulieren.",
      },
      {
        punkte: 1,
        label: "Nur Jobtitel und Firma",
        fehlt: "Deine Headline nennt, was du bist, aber nicht, was deine Kundschaft von dir hat.",
        anleitung: "Ergänze nach dem Jobtitel, wem du hilfst und was sich für sie ändert, zum Beispiel mit «Ich helfe … bei …».",
      },
      { punkte: 2, label: "Sie nennt, wem du wobei hilfst", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "profilbild",
    kurz: "Profilbild",
    text: "Wie gut ist dein Profilbild?",
    gewicht: 8,
    antworten: [
      {
        punkte: 0,
        label: "Ich habe kein Profilbild",
        fehlt: "Ohne Profilbild wirkt dein Profil leer und ist schwer wiederzuerkennen.",
        anleitung: "Lade ein Bild hoch, auf dem man dein Gesicht gut sieht. Bei einem Betrieb ohne Person davor passt das Logo. Ein ruhiger Hintergrund und Tageslicht genügen.",
      },
      {
        punkte: 1,
        label: "Vorhanden, aber unklar (klein, dunkel oder unscharf)",
        fehlt: "Dein Bild ist da, aber auf dem Handy erkennt man zu wenig.",
        anleitung: "Wähle einen engeren Ausschnitt, ein helleres Foto oder ein schärferes Logo. Schau dir das Ergebnis auf dem Handy an.",
      },
      { punkte: 2, label: "Gut erkennbares Gesicht oder Logo, ruhiger Hintergrund", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "banner",
    kurz: "Banner",
    text: "Was zeigt dein Banner, das Bild hinter deinem Profilbild?",
    gewicht: 8,
    antworten: [
      {
        punkte: 0,
        label: "Kein Banner",
        fehlt: "Der Platz hinter deinem Namen bleibt leer.",
        anleitung: "Lade ein eigenes Banner hoch. Eine Zeile, die sagt, was du für wen tust, und dein Logo oder ein Bild deiner Arbeit genügen.",
      },
      {
        punkte: 1,
        label: "Das Standardbild",
        fehlt: "Dein Banner ist das Standardbild und sagt nichts über dich.",
        anleitung: "Ersetze es durch ein eigenes Banner mit einer Aussage: ein Satz zum Nutzen, dein Logo oder ein Foto aus deinem Alltag. Prüfe, wie es auf dem Handy aussieht.",
      },
      { punkte: 2, label: "Ein eigenes Banner mit einer Aussage", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "info",
    kurz: "Info-Text",
    text: "Wie beginnt dein Info-Text?",
    gewicht: 18,
    antworten: [
      {
        punkte: 0,
        label: "Der Info-Text ist leer",
        fehlt: "Dein Info-Text ist leer.",
        anleitung: "Schreib drei bis fünf kurze Sätze: wem du hilfst, wobei, woran man das erkennt und wie man dich erreicht. Beginne mit dem Nutzen, nicht mit deinem Namen.",
      },
      {
        punkte: 1,
        label: "Mit meinem Lebenslauf",
        fehlt: "Dein Info-Text beginnt mit deinem Lebenslauf. Die ersten Zeilen liest man zuerst.",
        anleitung: "Stell den Nutzen für deine Kundschaft an den Anfang. Den Lebenslauf lieferst du danach, in Stichworten.",
      },
      { punkte: 2, label: "Mit dem Nutzen für meine Kundschaft", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "fokus",
    kurz: "Im Fokus",
    text: "Was hast du im Bereich «Im Fokus» oder an einer anderen Stelle oben im Profil verlinkt?",
    gewicht: 10,
    antworten: [
      {
        punkte: 0,
        label: "Nichts verlinkt",
        fehlt: "Oben im Profil gibt es nichts, das deine Arbeit zeigt.",
        anleitung: "Verlinke ein bis drei Dinge: ein Projekt, ein Angebot oder eine Referenz mit Link auf deine Website.",
      },
      {
        punkte: 1,
        label: "Eine Verlinkung",
        fehlt: "Es gibt eine Verlinkung, aber sie steht allein.",
        anleitung: "Ergänze mindestens eine zweite: ein weiteres Beispiel, dein Angebot oder eine Stimme aus der Kundschaft.",
      },
      { punkte: 2, label: "Mehrere Verlinkungen auf Beispiele, Angebote oder Referenzen", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "erfahrung",
    kurz: "Erfahrung",
    text: "Wie beschreibst du deine Stationen im Bereich Erfahrung?",
    gewicht: 14,
    antworten: [
      {
        punkte: 0,
        label: "Unvollständig oder leer",
        fehlt: "Deine Stationen sind unvollständig.",
        anleitung: "Trag die letzten zwei bis drei Stationen mit Titel, Firma und Zeitraum ein. Schreib zu jeder einen Satz mit dem, was du geliefert hast.",
      },
      {
        punkte: 1,
        label: "Nur Titel und Daten",
        fehlt: "Bei deinen Stationen stehen nur Titel und Daten.",
        anleitung: "Schreib unter jede Station ein bis zwei Sätze mit einem Ergebnis: was du gebaut, verbessert oder gewonnen hast. Nenne Zahlen nur, wenn du sie belegen kannst.",
      },
      { punkte: 2, label: "Stationen mit Ergebnissen", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "empfehlungen",
    kurz: "Empfehlungen",
    text: "Wie viele Empfehlungen hast du auf deinem Profil?",
    gewicht: 8,
    antworten: [
      {
        punkte: 0,
        label: "Keine Empfehlungen",
        fehlt: "Auf deinem Profil spricht niemand für dich.",
        anleitung: "Bitte zwei bis drei Menschen, mit denen du gearbeitet hast, um eine Empfehlung. Schreib ihnen, woran sie sich erinnern sollen, zum Beispiel an ein bestimmtes Projekt.",
      },
      {
        punkte: 1,
        label: "Eine oder zwei Empfehlungen",
        fehlt: "Es gibt erst eine oder zwei Empfehlungen.",
        anleitung: "Bitte um eine weitere, am besten von einer Kundin oder einem Kunden. Gib ein Stichwort vor, damit die Empfehlung konkret wird.",
      },
      { punkte: 2, label: "Drei oder mehr Empfehlungen", fehlt: "", anleitung: "" },
    ],
  },
  {
    id: "aktivitaet",
    kurz: "Aktivität",
    text: "Wie aktiv warst du in den letzten 30 Tagen?",
    gewicht: 14,
    antworten: [
      {
        punkte: 0,
        label: "Gar nicht",
        fehlt: "In den letzten 30 Tagen war auf deinem Profil nichts los.",
        anleitung: "Fang klein an: einmal pro Woche ein Kommentar unter dem Beitrag einer Person aus deiner Kundschaft, alle zwei Wochen ein eigener Beitrag mit einem Beispiel aus deiner Arbeit.",
      },
      {
        punkte: 1,
        label: "Selten",
        fehlt: "Du bist nur selten sichtbar.",
        anleitung: "Lege feste Zeiten fest, etwa zehn Minuten am Dienstag für Kommentare. Ein Beispiel aus deiner Arbeit alle zwei Wochen genügt als Beitrag.",
      },
      { punkte: 2, label: "Regelmässig Beiträge oder Kommentare", fehlt: "", anleitung: "" },
    ],
  },
];

export const FRAGEN_IDS: readonly FrageId[] = FRAGEN.map((f) => f.id);
export const GEWICHT_SUMME = FRAGEN.reduce((n, f) => n + f.gewicht, 0);

export const URL_LABEL = "Die Adresse meines Profils trägt meinen Namen (linkedin.com/in/vorname-nachname)";
const URL_VERBESSERUNG = {
  titel: "Profil-Adresse",
  fehlt: "Die Adresse deines Profils trägt noch nicht deinen Namen.",
  anleitung:
    "Passe die öffentliche Adresse deines Profils an, zum Beispiel auf linkedin.com/in/vorname-nachname. Eine kurze Adresse mit Namen lässt sich auf Visitenkarten, in E-Mail-Signaturen und auf deiner Website besser verwenden.",
} as const;

export function frageOf(id: FrageId): Frage {
  return FRAGEN.find((f) => f.id === id) as Frage;
}

export function isPunkte(v: unknown): v is Punkte {
  return v === 0 || v === 1 || v === 2;
}

/** Namen der Fragen ohne Antwort, in der Reihenfolge der Fragen. */
export function offeneFragen(antworten: Antworten): string[] {
  return FRAGEN.filter((f) => !isPunkte(antworten[f.id])).map((f) => f.kurz);
}

export function istVollstaendig(antworten: Antworten): boolean {
  return offeneFragen(antworten).length === 0;
}

// ---- Punktwert und Stufe -----------------------------------------------------------------------

/** Verlorene Punkte einer Frage: Gewicht × (2 − Punkte) / 2. Unbeantwortete Fragen verlieren nichts, weil nichts bekannt ist. */
export function verloren(frage: Frage, punkte: Punkte | undefined): number {
  return isPunkte(punkte) ? (frage.gewicht * (2 - punkte)) / 2 : 0;
}

/** Punktwert von 0 bis 100: Summe der Gewichte × (Punkte / 2), gerundet. Unbeantwortete Fragen zählen 0. */
export function score(antworten: Antworten): number {
  let summe = 0;
  for (const f of FRAGEN) {
    const p = antworten[f.id];
    summe += isPunkte(p) ? (f.gewicht * p) / 2 : 0;
  }
  return Math.round(summe);
}

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

// ---- Funde in den eingefügten Texten -----------------------------------------------------------

export type Stelle = "Headline" | "Info-Text";
export type Fund = {
  id: string;
  stelle: Stelle;
  titel: string;
  /** Was auffällt. */
  text: string;
  /** Ein Satz, wie es besser geht. */
  vorschlag: string;
};

const VERBEN = [
  "helfe", "helfen", "hilft", "unterstütze", "unterstützen", "unterstützt", "schaffe", "schaffen", "schafft", "bringe", "bringen", "bringt",
  "mache", "machen", "macht", "begleite", "begleiten", "begleitet", "baue", "bauen", "baut", "sorge", "sorgen", "sorgt", "zeige", "zeigen",
  "zeigt", "löse", "lösen", "löst", "berate", "beraten", "berät", "verhelfe", "verhelfen", "verhilft", "entwickle", "entwickeln", "entwickelt",
  "gestalte", "gestalten", "gestaltet", "steigere", "steigern", "steigert", "spare", "sparen", "spart",
];
const VERB_RE = new RegExp(`(?<![\\p{L}])(?:${VERBEN.join("|")})(?![\\p{L}])`, "iu");

/** Wörter, die zeigen, dass ein Text seine Kundschaft anspricht. «Sie» gilt nur gross geschrieben (klein ist es «sie» im Plural). */
const KUNDSCHAFT_WOERTER = new Set([
  "du", "dich", "dir", "dein", "deine", "deiner", "deinen", "deinem", "deines", "kundschaft", "kunde", "kundin", "kunden", "kundinnen",
  "betriebe", "kmu", "vereine", "mitglieder", "publikum", "sponsoren",
]);

function sprichtKundschaftAn(anfang: string): boolean {
  return (anfang.match(/\p{L}+/gu) ?? []).some((w) => w === "Sie" || KUNDSCHAFT_WOERTER.has(w.toLowerCase()));
}

const compact = (s: string) => s.replace(/\s+/g, " ").trim();
const compactMultiline = (s: string) => s.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** Floskeln und lange Sätze kommen aus dem Regelsatz des Textchecks (tools/textcheck/logic.ts). */
function floskelFunde(text: string, stelle: Stelle): Fund[] {
  return findingsOf(text)
    .filter((f) => f.kind === "floskel")
    .map((f) => {
      const e = f.examples[0];
      const treffer = e ? compact(text.slice(e.start, e.end)) : f.title;
      return {
        id: `${stelle === "Headline" ? "headline" : "about"}-${f.id}`,
        stelle,
        titel: "Floskel",
        text: `«${treffer}» ist eine Floskel${f.count > 1 ? ` (${f.count} Mal)` : ""}.`,
        vorschlag: f.hint,
      };
    });
}

function langeSaetzeFund(about: string): Fund | null {
  const f = findingsOf(about).find((x) => x.id === "lange-saetze");
  if (!f) return null;
  const woerter = Number(/^(\d+) Wörter/.exec(f.examples[0]?.excerpt ?? "")?.[1] ?? LONG_SENTENCE_WORDS + 1);
  return {
    id: "about-lange-saetze",
    stelle: "Info-Text",
    titel: "Langer Satz",
    text:
      f.count > 1
        ? `${f.count} Sätze sind lang, der längste hat ${woerter} Wörter. Richtwert: höchstens ${LONG_SENTENCE_WORDS}.`
        : `Ein Satz hat ${woerter} Wörter. Richtwert: höchstens ${LONG_SENTENCE_WORDS}.`,
    vorschlag: "Teile den Satz an einem Komma oder einem «und» in zwei.",
  };
}

/**
 * Regelbasierte Funde in Headline und Anfang des Info-Texts. Leere Texte ergeben keine Funde. Die Funde ändern den Punktwert nicht;
 * sie ergänzen die Liste der Verbesserungen.
 */
export function funde(headline: string, about: string): Fund[] {
  const out: Fund[] = [];
  const h = compact(headline ?? "");
  const a = compactMultiline(about ?? "");

  if (h) {
    if (h.length > HEADLINE_RICHTWERT) {
      out.push({
        id: "headline-lang",
        stelle: "Headline",
        titel: "Zu lang",
        text: `Die Headline hat ${h.length} Zeichen. Der Richtwert liegt bei ${HEADLINE_RICHTWERT}.`,
        vorschlag: "Streich alles nach dem ersten Satz, der Zielgruppe und Nutzen nennt, und prüfe, was deine Plattform zulässt.",
      });
    }
    if (!VERB_RE.test(h) && !/\d/.test(h)) {
      out.push({
        id: "headline-jobtitel",
        stelle: "Headline",
        titel: "Nur ein Titel",
        text: "Die Headline enthält weder ein Verb wie «helfe» noch eine Zahl. Sie nennt vermutlich nur einen Titel.",
        vorschlag: "Sag, wem du wobei hilfst, zum Beispiel mit «Ich helfe … bei …», und nenne wenn möglich einen Beleg mit Zahl oder Ort.",
      });
    }
    out.push(...floskelFunde(h, "Headline"));
  }

  if (a) {
    if (/^[\s"«»'„“”]*(?:ich bin|mein name)\b/i.test(a)) {
      out.push({
        id: "about-ich-bin",
        stelle: "Info-Text",
        titel: "Beginnt mit «Ich bin»",
        text: "Der Info-Text beginnt mit «Ich bin» oder «Mein Name».",
        vorschlag: "Der Nutzen gehört nach vorn: Beginne mit dem, was deine Kundschaft von dir hat, und stell dich danach vor.",
      });
    }
    if (!sprichtKundschaftAn(a.slice(0, ABOUT_ANFANG))) {
      out.push({
        id: "about-ohne-kundschaft",
        stelle: "Info-Text",
        titel: "Keine Aussage zur Kundschaft",
        text: `Die ersten ${ABOUT_ANFANG} Zeichen sagen nichts über deine Kundschaft.`,
        vorschlag: "Sprich deine Kundschaft in den ersten Zeilen direkt an: Wem hilfst du, und wobei?",
      });
    }
    out.push(...floskelFunde(a, "Info-Text"));
    const lang = langeSaetzeFund(a);
    if (lang) out.push(lang);
  }
  return out;
}

// ---- Verbesserungen ----------------------------------------------------------------------------

export type Verbesserung = {
  quelle: "frage" | "fund" | "url";
  titel: string;
  fehlt: string;
  anleitung: string;
  /** Nur bei Fragen: so viele der 100 Punkte sind noch offen. */
  offen?: number;
};

/**
 * Priorisierte Verbesserungen: die fünf Fragen mit den meisten offenen Punkten (Gewicht × (2 − Punkte) / 2, absteigend; bei Gleichstand
 * gilt die Reihenfolge der Fragen), danach die Funde aus den eingefügten Texten, zuletzt der Hinweis auf die Profil-Adresse.
 * Ohne Angabe zur Adresse gibt es keinen Hinweis.
 */
export function verbesserungen(antworten: Antworten, fundeListe: readonly Fund[] = [], urlAngepasst: boolean = true): Verbesserung[] {
  const fragen = FRAGEN.map((f, index) => ({ f, index, p: antworten[f.id], offen: verloren(f, antworten[f.id]) }))
    .filter((x) => x.offen > 0 && isPunkte(x.p))
    .sort((a, b) => b.offen - a.offen || a.index - b.index)
    .slice(0, MAX_VERBESSERUNGEN_FRAGEN)
    .map<Verbesserung>(({ f, p, offen }) => {
      const a = f.antworten[p as Punkte];
      return { quelle: "frage", titel: f.kurz, fehlt: a.fehlt, anleitung: a.anleitung, offen };
    });
  const ausTexten = fundeListe.map<Verbesserung>((x) => ({ quelle: "fund", titel: `${x.stelle}: ${x.titel}`, fehlt: x.text, anleitung: x.vorschlag }));
  const url: Verbesserung[] = urlAngepasst ? [] : [{ quelle: "url", ...URL_VERBESSERUNG }];
  return [...fragen, ...ausTexten, ...url];
}

export const punkteWort = (n: number) => `${n} ${n === 1 ? "Punkt" : "Punkte"}`;

/** Eine Verbesserung als Zeile für Liste, Dokument und Kopie. */
export function verbesserungText(v: Verbesserung): string {
  const kopf = v.offen !== undefined ? `${v.titel} (${punkteWort(v.offen)} offen)` : v.titel;
  return `${kopf}. Was fehlt: ${v.fehlt} So geht es: ${v.anleitung}`;
}

// ---- Headline-Vorschläge -----------------------------------------------------------------------

export type HeadlineInput = {
  zielgruppe: string;
  ergebnis: string;
  beweis: string;
  firma?: string;
  branche?: string;
};

export type HeadlineVorschlag = {
  muster: 1 | 2 | 3;
  text: string;
  zeichen: number;
  /** true: der Vorschlag war länger als der Richtwert und wurde am letzten Leerzeichen gekürzt. */
  gekuerzt: boolean;
};

/** Ein Teil des Vorschlags: Schweizer Schreibweise, ohne Satzzeichen am Rand, damit beim Zusammensetzen nichts doppelt steht. */
function teil(s: string | undefined, max: number): string {
  return typoCH(compact(s ?? ""))
    .slice(0, max)
    .replace(/^[\s.,;:!?–-]+/u, "")
    .replace(/[\s.,;:!?–-]+$/u, "");
}

/** Räumt das Ergebnis auf: ein Leerzeichen, kein Leerzeichen vor Satzzeichen, kein Satzzeichen doppelt, kein doppelter Gedankenstrich. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:!?])(?:\s*[.,;:!?])+/g, "$1")
    .replace(/(\s–)(?:\s–)+/g, "$1")
    .trim();
}

const gross = (s: string) => (s ? s.charAt(0).toLocaleUpperCase("de-CH") + s.slice(1) : s);

/** Kürzt auf `max` Zeichen am letzten Leerzeichen und entfernt Trenner am Ende. */
export function kuerzen(text: string, max: number = HEADLINE_RICHTWERT): { text: string; gekuerzt: boolean } {
  if (text.length <= max) return { text, gekuerzt: false };
  let cut = text.slice(0, max);
  const naechstesZeichen = text.charAt(max);
  if (naechstesZeichen !== "" && !/[\s.,;:!?–-]/u.test(naechstesZeichen) && cut.includes(" ")) cut = cut.slice(0, cut.lastIndexOf(" "));
  return { text: cut.replace(/[\s.,;:!?–-]+$/u, ""), gekuerzt: true };
}

/**
 * Drei Muster, nur aus den Wörtern der Person. Ohne Zielgruppe oder ohne Ergebnis gibt es keine Vorschläge (siehe `headlineHinweis`).
 *  1: Ich helfe {Zielgruppe} bei {Ergebnis} – {Beweis}
 *  2: {Ergebnis} für {Zielgruppe}: {Firma, sonst Branche}
 *  3: {Zielgruppe}: {Ergebnis}. {Beweis} (der Beweis beginnt als neuer Satz gross)
 * Ohne Beweis entfällt der Beweisteil mit seinem Trenner. Höchstens 220 Zeichen (Richtwert), sonst am letzten Leerzeichen gekürzt.
 * Die Vorschläge beugen kein Wort: Die Person prüft Fall und Grammatik.
 */
export function headlines(input: HeadlineInput): HeadlineVorschlag[] {
  const z = teil(input.zielgruppe, LIMITS.zielgruppe);
  const e = teil(input.ergebnis, LIMITS.ergebnis);
  const b = teil(input.beweis, LIMITS.beweis);
  if (!z || !e) return [];
  const name = teil(input.firma, LIMITS.firma) || teil(input.branche, LIMITS.branche);

  const roh: [1 | 2 | 3, string][] = [
    [1, `Ich helfe ${z} bei ${e}${b ? ` – ${b}` : ""}`],
    [2, `${gross(e)} für ${z}${name ? `: ${name}` : ""}`],
    [3, `${gross(z)}: ${e}${b ? `. ${gross(b)}` : ""}`],
  ];
  return roh.map(([muster, text]) => {
    const k = kuerzen(tidy(text));
    return { muster, text: k.text, zeichen: k.text.length, gekuerzt: k.gekuerzt };
  });
}

/** Warum es keine Vorschläge gibt. null: Es gibt welche. */
export function headlineHinweis(input: Pick<HeadlineInput, "zielgruppe" | "ergebnis">): string | null {
  const z = teil(input.zielgruppe, LIMITS.zielgruppe);
  const e = teil(input.ergebnis, LIMITS.ergebnis);
  if (z && e) return null;
  if (!z && !e) return "Für Headline-Vorschläge fehlen Zielgruppe und Ergebnis.";
  return z ? "Für Headline-Vorschläge fehlt das Ergebnis für deine Kundschaft." : "Für Headline-Vorschläge fehlt die Zielgruppe.";
}

/** Zielgruppe aus dem Profil (primaersegment), höchstens 80 Zeichen, am letzten Leerzeichen gekürzt. */
export function zielgruppeVorschlag(primaersegment: string | undefined): string {
  const s = compact(primaersegment ?? "");
  return kuerzen(s, LIMITS.zielgruppe).text;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type LinkedinState = {
  v: 1;
  phase: "edit" | "result";
  antworten: Antworten;
  urlAngepasst: boolean;
  headline: string;
  about: string;
  zielgruppe: string;
  ergebnis: string;
  beweis: string;
  /** Firma und Branche zum Zeitpunkt der Auswertung (aus dem Firmenprofil), damit das Ergebnis stabil bleibt. */
  firma: string;
  branche: string;
  /** Kurzfassung des Ergebnisses; wird beim Lesen aus den Antworten neu berechnet. */
  output?: { score: number; stufe: StufeName };
};

export const EMPTY_STATE: LinkedinState = {
  v: 1,
  phase: "edit",
  antworten: {},
  urlAngepasst: false,
  headline: "",
  about: "",
  zielgruppe: "",
  ergebnis: "",
  beweis: "",
  firma: "",
  branche: "",
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Kurzfassung des Ergebnisses für den gespeicherten Stand. */
export function outputOf(antworten: Antworten): { score: number; stufe: StufeName } {
  const s = score(antworten);
  return { score: s, stufe: stufe(s) };
}

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Ergebnis gibt es nur bei acht Antworten. */
export function parseState(raw: unknown): LinkedinState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const antworten: Antworten = {};
  const roh = typeof r.antworten === "object" && r.antworten !== null && !Array.isArray(r.antworten) ? (r.antworten as Record<string, unknown>) : {};
  for (const id of FRAGEN_IDS) {
    if (isPunkte(roh[id])) antworten[id] = roh[id];
  }
  const base: LinkedinState = {
    v: 1,
    phase: "edit",
    antworten,
    urlAngepasst: r.urlAngepasst === true,
    headline: str(r.headline, LIMITS.headline),
    about: str(r.about, LIMITS.about),
    zielgruppe: str(r.zielgruppe, LIMITS.zielgruppe),
    ergebnis: str(r.ergebnis, LIMITS.ergebnis),
    beweis: str(r.beweis, LIMITS.beweis),
    firma: str(r.firma, LIMITS.firma),
    branche: str(r.branche, LIMITS.branche),
  };
  if (r.phase === "result" && istVollstaendig(antworten)) return { ...base, phase: "result", output: outputOf(antworten) };
  return base;
}

/** Zielgruppe aus dem Profil einsetzen, solange die Person noch keine eigene getippt hat (Harte Regel 10). */
export function vorbefuellt(s: LinkedinState, profile: Pick<Profile, "primaersegment">): LinkedinState {
  if (s.zielgruppe.trim()) return s;
  return { ...s, zielgruppe: zielgruppeVorschlag(profile.primaersegment) };
}

/** Meldet, warum noch nicht ausgewertet werden kann. null: in Ordnung. */
export function validate(s: Pick<LinkedinState, "antworten" | "headline" | "about" | "zielgruppe" | "ergebnis" | "beweis">): string | null {
  const offen = offeneFragen(s.antworten);
  if (offen.length > 0) {
    return offen.length === FRAGEN.length
      ? `Beantworte die acht Fragen zu deinem Profil.`
      : `Beantworte alle acht Fragen. Es fehlt noch: ${offen.join(", ")}.`;
  }
  if (s.headline.length > LIMITS.headline) return `Die Headline ist zu lang. Es sind höchstens ${LIMITS.headline} Zeichen möglich.`;
  if (s.about.length > LIMITS.about) return `Der Anfang des Info-Texts ist zu lang. Es sind höchstens ${LIMITS.about} Zeichen möglich.`;
  if (s.zielgruppe.length > LIMITS.zielgruppe) return `Die Zielgruppe ist zu lang. Es sind höchstens ${LIMITS.zielgruppe} Zeichen möglich.`;
  if (s.ergebnis.length > LIMITS.ergebnis) return `Das Ergebnis für deine Kundschaft ist zu lang. Es sind höchstens ${LIMITS.ergebnis} Zeichen möglich.`;
  if (s.beweis.length > LIMITS.beweis) return `Der Beleg ist zu lang. Es sind höchstens ${LIMITS.beweis} Zeichen möglich.`;
  return null;
}

// ---- Auswertung --------------------------------------------------------------------------------

export type Zeile = { id: FrageId; kurz: string; frage: string; antwort: string; punkte: Punkte; gewicht: number; offen: number };

export type Auswertung = {
  score: number;
  stufe: StufeName;
  zeilen: Zeile[];
  funde: Fund[];
  verbesserungen: Verbesserung[];
  vorschlaege: HeadlineVorschlag[];
  /** Warum es keine Headline-Vorschläge gibt; null, wenn es welche gibt. */
  headlineHinweis: string | null;
};

export function auswerten(s: LinkedinState): Auswertung {
  const zeilen: Zeile[] = [];
  for (const f of FRAGEN) {
    const p = s.antworten[f.id];
    if (!isPunkte(p)) continue;
    zeilen.push({ id: f.id, kurz: f.kurz, frage: f.text, antwort: f.antworten[p].label, punkte: p, gewicht: f.gewicht, offen: verloren(f, p) });
  }
  const gefunden = funde(s.headline, s.about);
  const punktwert = score(s.antworten);
  const eingabe: HeadlineInput = { zielgruppe: s.zielgruppe, ergebnis: s.ergebnis, beweis: s.beweis, firma: s.firma, branche: s.branche };
  return {
    score: punktwert,
    stufe: stufe(punktwert),
    zeilen,
    funde: gefunden,
    verbesserungen: verbesserungen(s.antworten, gefunden, s.urlAngepasst),
    vorschlaege: headlines(eingabe),
    headlineHinweis: headlineHinweis(eingabe),
  };
}

// ---- Dokument und Texte fürs CRM ---------------------------------------------------------------

const SECTION_ANTWORTEN = "Deine Antworten";
const SECTION_VERBESSERUNGEN = "Verbesserungen";
export const SECTION_HEADLINES = "Headline-Vorschläge";
const SECTION_HINWEISE = "Hinweise";

export const HINWEISE: readonly [string, string, string] = [
  `${RICHTWERT_HINWEIS} ${STUFEN_HINWEIS}`,
  "Funde und Headline-Vorschläge folgen festen Regeln, nicht einer Bewertung durch eine KI. Die Vorschläge setzen deine Wörter unverändert ein: Prüfe Fall und Grammatik, bevor du einen übernimmst.",
  `Die Plattform ändert Funktionen und Grenzen, auch die Länge der Headline (Richtwert ${HEADLINE_RICHTWERT} Zeichen). Prüfe in deinem Profil, was gerade möglich ist.`,
];

function pruefung(s: LinkedinState, anzahl: number): string {
  const h = s.headline.trim() !== "";
  const a = s.about.trim() !== "";
  if (!h && !a) return "Du hast keine Texte eingefügt. Die Verbesserungen beruhen nur auf deinen Antworten, die Fragen mit den meisten offenen Punkten stehen zuerst.";
  const was = h && a ? "Headline und Info-Text" : h ? "Headline" : "Info-Text";
  const funde = anzahl === 0 ? "Es ist nichts aufgefallen" : anzahl === 1 ? "Ein Fund" : `${anzahl} Funde`;
  return `Die Fragen mit den meisten offenen Punkten stehen zuerst, danach die Funde aus deinen Texten. Geprüft wurde: ${was}. ${funde}. Die Funde ändern den Punktwert nicht.`;
}

export type DokumentTeile = { vor: DocBlock[]; headlines: DocBlock[]; nach: DocBlock[] };

/** Das Dokument in drei Teilen: Die Oberfläche setzt zwischen `vor` und `nach` die Headline-Vorschläge mit Kopieren-Knöpfen. */
export function documentParts(s: LinkedinState): DokumentTeile {
  const a = auswerten(s);
  const facts: { label: string; value: string }[] = [];
  if (s.firma.trim()) facts.push({ label: "Betrieb", value: s.firma.trim() });
  if (s.branche.trim()) facts.push({ label: "Branche", value: s.branche.trim() });
  facts.push({ label: "Punktwert", value: `${a.score} von 100` }, { label: "Stufe", value: `${a.stufe} (Richtwert von Alperna)` });

  const vor: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "paragraph", text: SELBSTEINSCHAETZUNG_HINWEIS },
    { type: "heading", level: 1, text: SECTION_ANTWORTEN },
    {
      type: "table",
      header: ["Frage", "Antwort", "Punkte", "Gewicht"],
      rows: a.zeilen.map((z) => [z.kurz, z.antwort, `${z.punkte} von 2`, String(z.gewicht)]),
      widths: [2, 5, 1, 1],
    },
    { type: "heading", level: 1, text: SECTION_VERBESSERUNGEN },
    { type: "paragraph", text: pruefung(s, a.funde.length) },
  ];
  if (a.verbesserungen.length > 0) vor.push({ type: "list", ordered: true, items: a.verbesserungen.map(verbesserungText) });
  else vor.push({ type: "paragraph", text: "Du hast bei allen acht Fragen die volle Punktzahl. Prüfe alle paar Monate, ob dein Profil noch zu deinem Angebot passt." });

  const hl: DocBlock[] = [{ type: "heading", level: 1, text: SECTION_HEADLINES }];
  if (a.vorschlaege.length > 0) hl.push({ type: "list", ordered: true, items: a.vorschlaege.map((v) => v.text) });
  else hl.push({ type: "paragraph", text: a.headlineHinweis ?? "" });

  const nach: DocBlock[] = [
    { type: "heading", level: 1, text: SECTION_HINWEISE },
    { type: "list", items: [...HINWEISE] },
  ];
  return { vor, headlines: hl, nach };
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(s: LinkedinState): DocumentModel {
  const a = auswerten(s);
  const teile = documentParts(s);
  return {
    title: "LinkedIn-Profil-Score",
    subtitle: `Punktwert ${a.score} von 100, Stufe «${a.stufe}»`,
    firma: s.firma.trim() || undefined,
    filename: `linkedin-profil-${safeFilename(s.firma, "betrieb")}`,
    blocks: [...teile.vor, ...teile.headlines, ...teile.nach],
  };
}

/** Die Angaben fürs CRM, eine je Zeile. Der Server kürzt auf 1'900 Zeichen; die Antworten stehen darum oben. */
export function eingabeText(s: LinkedinState): string {
  const line = (label: string, value: string) => (value.trim() ? `${label}: ${value.replace(/\s*\n\s*/g, " ").trim()}` : "");
  const antworten = FRAGEN.map((f) => {
    const p = s.antworten[f.id];
    return isPunkte(p) ? `${f.kurz}: ${f.antworten[p].label} (${p} von 2)` : "";
  });
  return [
    line("Betrieb", s.firma),
    line("Branche", s.branche),
    ...antworten,
    `Profil-Adresse mit Namen: ${s.urlAngepasst ? "ja" : "nein"}`,
    line("Eingefügte Headline", s.headline),
    line("Eingefügter Anfang des Info-Texts", s.about),
    line("Zielgruppe", s.zielgruppe),
    line("Ergebnis für die Kundschaft", s.ergebnis),
    line("Beleg", s.beweis),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(s: LinkedinState): string {
  return toMarkdown(toDocument(s));
}

// ---- Beispiel ----------------------------------------------------------------------------------

/** Beispiel «Malerei Keller, Gossau»: Antworten, Texte und Angaben für die Headline. Firma und Branche kommen aus dem Profil. */
export const SAMPLE: Pick<LinkedinState, "antworten" | "urlAngepasst" | "headline" | "about" | "zielgruppe" | "ergebnis" | "beweis"> = {
  antworten: { headline: 1, profilbild: 2, banner: 1, info: 1, fokus: 0, erfahrung: 1, empfehlungen: 1, aktivitaet: 0 },
  urlAngepasst: false,
  headline: "Malermeister bei Malerei Keller",
  about:
    "Ich bin Malermeister und führe die Malerei Keller in dritter Generation. Wir streichen Fassaden und Innenräume in Gossau, Flawil und Herisau und beraten bei der Farbwahl.",
  zielgruppe: "Familien in Gossau",
  ergebnis: "Fassadenanstrich und Farbberatung",
  beweis: "Referenzen in Gossau, Flawil und Herisau",
};
