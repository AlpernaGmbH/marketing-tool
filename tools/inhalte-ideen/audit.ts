import { foldText, type Idea } from "./logic";

// Redaktions-Audit der Beitragsideen (Charge C7, 09.10.2026): Schweiz-Bezug, Klone und Wortüberlappung.
// Reine Funktionen, kein React, kein DOM, kein fetch. Genutzt von den Tests und von scripts/ideen-audit.ts.
// Hintergrund: Die Bibliothek hatte nur bei etwa 12 % der Ideen einen erkennbaren Schweiz-Bezug; Ziel ist mindestens die Hälfte.
// «Schweiz-Bezug» heisst: Titel, Beschrieb oder Hook nennt etwas, das es so nur in der Schweiz oder in einer Schweizer Gemeinde gibt
// (Ort, Brauch, Anlass, Behörde, Einrichtung, Wort). Das Wort «Region» oder «Schweiz» allein zählt nicht; die Liste ist redaktionell
// (Alperna), keine Statistik, und wächst mit der Bibliothek.

/** Mindestanteil der Ideen mit Schweiz-Bezug. */
export const SCHWEIZ_ZIEL = 0.5;
/** Ab dieser Ähnlichkeit der Titel (Jaccard über Wortstämme) gelten zwei Ideen als Klone. */
export const TITEL_KLON = 0.6;
/** Ab dieser Ähnlichkeit der Beschriebe gelten zwei Ideen als Klone. */
export const TEXT_KLON = 0.55;
/** So oft darf derselbe Hook-Anfang (die ersten drei Wörter) höchstens vorkommen. */
export const HOOK_ANFANG_MAX = 3;

/**
 * Begriffe mit Schweiz-Bezug, als Wortanfänge ohne Umlaute und Akzente (foldText). Gruppiert nach Art, damit die Liste lesbar bleibt.
 * Ein Treffer gilt, wenn ein Wort im Text mit dem Begriff beginnt.
 */
export const CH_BEGRIFFE = {
  orte: [
    "gossau", "st. gallen", "st.gallen", "st gallen", "appenzell", "herisau", "trogen", "speicher$", "teufen", "heiden$", "walzenhausen", "urnasch",
    "ostschweiz", "thurgau", "frauenfeld", "bodensee", "rorschach", "wil$", "toggenburg", "rheintal", "fuerstenland", "saentis", "zuerich", "bern$",
    "basel", "luzern", "graubuenden", "engadin", "tessin", "wallis", "kanton", "gemeinde", "dorfplatz", "dorffest", "ortsbild", "quartierverein",
    "schweizer", "schweiz", "eidgenoess", "alpstein", "voralpen", "mittelland",
  ],
  brauch: [
    "fasnacht", "fastnacht", "raebeliechtli", "samichlaus", "chlaus", "sechselaeuten", "bundesfeier", "1. august", "hoehenfeuer", "chilbi", "olma",
    "schwingfest", "gruempelturnier", "aelpler", "alpabzug", "viehschau", "silvesterchlaeus", "adventsfenster", "landsgemeinde", "gemeindeversammlung",
    "gewerbeausstellung", "gewerbeverein", "gewerbe$", "wochenmarkt", "weihnachtsmarkt", "dorfmarkt", "turnverein", "musikverein", "schuetzenfest",
    "jodel", "alphorn", "mundart", "gruezi", "znueni", "zvieri", "zopf", "roesti", "fondue", "raclette", "bratwurst", "birchermues", "grittibaenz",
    "gruttibaenz", "grättimann", "graettimann", "nussgipfel", "stephanstag", "berchtoldstag", "auffahrt", "pfingstmontag", "karfreitag",
    "ostermontag", "fronleichnam", "bettag", "knabenschiessen", "banntag", "stammtisch", "beiz$", "dorfbeiz", "dorfladen", "ortsmuseum",
    "kirchgemeinde", "pfadi", "jubla", "frauenverein", "samariter", "vereinslokal", "gemeindehaus", "osterbrunnen", "bise$", "wanderweg", "aufrichte", "metzgete", "gartenbeiz", "leidmahl", "konfirmation", "hochstamm", "buendner",
    "gerstensuppe", "maturaball", "skilager", "schulzahnpflege", "badi$", "vita parcours", "o bis o", "gotthard", "simplon", "grimsel", "schnuppertraining", "schnupperkurs", "schnuppertag",
  ],
  woerter: [
    "storen", "velo$", "velos$", "trottoir", "estrich", "reduit", "cheminee", "lavabo", "glace", "natel", "billett", "rueebli", "parkieren", "znacht", "zmittag", "zmorge", "gipfeli", "sackmesser", "cafe creme", "hauswart", "guetzli", "pneu", "winterpneu", "occasion", "garagist", "fahrzeugausweis", "fuehrerausweis", "aktuar", "traktand", "festwirtschaft",
  ],
  einrichtung: [
    "lehre$", "lehrstelle", "lernende", "schnupperlehre", "berufsbildung", "berufsschule", "berufsmesse", "efz", "eba", "meisterpruefung", "lehrabschluss",
    "qualifikationsverfahren", "ahv", "mwst", "mehrwertsteuer", "handelsregister", "gesamtarbeitsvertrag", "suva", "spitex", "krankenkasse", "hausarzt",
    "sbb", "postauto", "ortsbus", "twint", "franken", "rappen", "chf", "qr rechnung", "einzahlungsschein", "baubewilligung", "baugesuch", "baubewilligungsverfahren", "stockwerkeigentum",
    "gebaeudeversicherung", "minergie", "gebaeudeprogramm", "grundbuch", "handaenderung", "motorfahrzeugkontrolle", "mfk", "vignette", "sommerpneu",
    "winterreifen", "strassenverkehrsamt", "zivilschutz", "feuerwehr", "gemeindekanzlei", "steuererklaerung", "steuerverwaltung", "pensionskasse",
    "saeule 3a", "3. saeule", "vorsorge", "ahv-", "betreibungsamt", "mieterverband", "hauseigentuemerverband", "kantonal", "eidgenoessisch", "bundes",
    "schulferien", "schulbeginn", "schulhaus", "kindergarten", "primarschule", "oberstufe", "gymnasium", "zivilstandsamt", "fachhochschule", "swissid", "bacs", "lohnausweis", "steuerfuss", "eigentuemerversammlung", "erneuerungsfonds",
  ],
} as const;

/** Begriffe mit «$» am Ende gelten nur als ganzes Wort («lehre$» findet «Lehre», nicht «Lehren»), alle anderen als Wortanfang. */
const ALLE_BEGRIFFE: readonly string[] = Object.values(CH_BEGRIFFE).flat().map((b) => foldText(b));

/** Der Text einer Idee, auf den sich die Prüfungen beziehen. */
export const ideenText = (i: Pick<Idea, "titel" | "beschrieb" | "hook">): string => `${i.titel}\n${i.beschrieb}\n${i.hook}`;

/** Wortanfänge, die im Text vorkommen. Leere Liste: kein Schweiz-Bezug. */
export function schweizBezug(i: Pick<Idea, "titel" | "beschrieb" | "hook">): string[] {
  const text = ` ${foldText(ideenText(i))
    .replace(/[^\p{L}\p{N}. ]+/gu, " ")
    .replace(/\s+/g, " ")} `;
  const found = new Set<string>();
  for (const b of ALLE_BEGRIFFE) {
    const ganz = b.endsWith("$");
    const wort = ganz ? b.slice(0, -1) : b;
    if (text.includes(ganz ? ` ${wort} ` : ` ${wort}`)) found.add(wort);
  }
  return [...found];
}

/** Anteil der Ideen mit Schweiz-Bezug (0 bis 1); 0 bei leerer Liste. */
export function schweizAnteil(ideen: readonly Idea[]): number {
  if (ideen.length === 0) return 0;
  return ideen.filter((i) => schweizBezug(i).length > 0).length / ideen.length;
}

const STOP = new Set([
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "und", "oder", "mit", "von", "vom", "zum", "zur", "im", "in", "am",
  "an", "auf", "aus", "bei", "fuer", "ist", "sind", "wir", "du", "dir", "dich", "dein", "deine", "deiner", "unser", "unsere", "euch", "ihr", "sie", "es",
  "als", "wie", "was", "wer", "so", "zu", "nach", "vor", "ueber", "um", "nicht", "auch", "nur", "noch", "mehr", "wenn", "dann", "kurz", "pro", "jede", "jeder",
  "jedes", "sich", "hier", "dass", "hat", "haben", "wird", "werden", "kann", "kannst", "zeig", "zeigt", "zeige", "erklaer", "erklaere", "stell", "stelle",
]);

/** Wortstämme eines Textes: klein, ohne Umlaute, ohne Füllwörter, auf fünf Buchstaben gekürzt («Fassaden» und «Fassade» sind dasselbe). */
export function stamm(text: string): Set<string> {
  return new Set(
    foldText(text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => w.slice(0, 5)),
  );
}

/** Jaccard-Ähnlichkeit zweier Mengen, 0 bis 1. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let gemeinsam = 0;
  for (const x of a) if (b.has(x)) gemeinsam++;
  return gemeinsam / (a.size + b.size - gemeinsam);
}

export type Klon = { a: string; b: string; art: "titel" | "text"; wert: number };

/**
 * Paare von Ideen, die sich zu ähnlich sind: Titel (ab TITEL_KLON) oder Beschrieb (ab TEXT_KLON). Verglichen wird innerhalb einer
 * Branche und mit den Ideen für alle Betriebe; verschiedene Branchen vergleichen sich nicht (dieselbe Frage darf in zwei Branchen stehen,
 * wenn der Inhalt zur Branche passt).
 */
export function klone(ideen: readonly Idea[]): Klon[] {
  const out: Klon[] = [];
  const titel = ideen.map((i) => stamm(i.titel));
  const text = ideen.map((i) => stamm(i.beschrieb));
  for (let x = 0; x < ideen.length; x++) {
    for (let y = x + 1; y < ideen.length; y++) {
      const a = ideen[x];
      const b = ideen[y];
      if (a.branche !== b.branche && a.branche !== "alle" && b.branche !== "alle") continue;
      const t = jaccard(titel[x], titel[y]);
      if (t >= TITEL_KLON) out.push({ a: a.id, b: b.id, art: "titel", wert: Math.round(t * 100) / 100 });
      const s = jaccard(text[x], text[y]);
      if (s >= TEXT_KLON) out.push({ a: a.id, b: b.id, art: "text", wert: Math.round(s * 100) / 100 });
    }
  }
  return out;
}

/** Die ersten drei Wörter des Hooks, klein; dient dem Zählen gleicher Anfänge. */
export function hookAnfang(hook: string): string {
  return foldText(hook)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

/** Hook-Anfänge, die öfter als HOOK_ANFANG_MAX vorkommen, mit Zahl und IDs. */
export function wiederholteHookAnfaenge(ideen: readonly Idea[]): { anfang: string; anzahl: number; ids: string[] }[] {
  const map = new Map<string, string[]>();
  for (const i of ideen) {
    const a = hookAnfang(i.hook);
    if (!a) continue;
    map.set(a, [...(map.get(a) ?? []), i.id]);
  }
  return [...map.entries()].filter(([, ids]) => ids.length > HOOK_ANFANG_MAX).map(([anfang, ids]) => ({ anfang, anzahl: ids.length, ids }));
}

export type AuditBericht = {
  anzahl: number;
  schweiz: number;
  anteil: number;
  ohneBezug: string[];
  klone: Klon[];
  hookAnfaenge: { anfang: string; anzahl: number; ids: string[] }[];
  jeBranche: Record<string, { anzahl: number; schweiz: number }>;
};

export function audit(ideen: readonly Idea[]): AuditBericht {
  const jeBranche: AuditBericht["jeBranche"] = {};
  const ohneBezug: string[] = [];
  let schweiz = 0;
  for (const i of ideen) {
    const hat = schweizBezug(i).length > 0;
    if (hat) schweiz++;
    else ohneBezug.push(i.id);
    const b = (jeBranche[i.branche] ??= { anzahl: 0, schweiz: 0 });
    b.anzahl++;
    if (hat) b.schweiz++;
  }
  return { anzahl: ideen.length, schweiz, anteil: ideen.length ? schweiz / ideen.length : 0, ohneBezug, klone: klone(ideen), hookAnfaenge: wiederholteHookAnfaenge(ideen), jeBranche };
}
