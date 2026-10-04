import floskelnData from "@/data/floskeln.json";

// Textcheck: reine Funktionen, kein React, kein DOM (CLAUDE.md, Harte Regel 3). Der Text verlässt den Browser nie.
// Vier Prüfungen: Fehler (doppelte Wörter, Leerzeichen), Schweizer Schreibweise, Floskeln (data/floskeln.json), Lesbarkeit.
// Die Lesbarkeit folgt der Formel von Toni Amstad für Deutsch (Quelle: Dissertation Universität Zürich 1978, Zusammenfassung
// auf de.wikipedia.org/wiki/Lesbarkeitsindex, abgerufen am 04.10.2026): 180 − ASL − 58,5 × ASW. Die Silben schätzt die
// Funktion aus Selbstlautgruppen; das ist eine Näherung, kein Wörterbuch.

export const SLUG = "textcheck";
export const MAX_CHARS = 20_000;
/** Ab so vielen Wörtern zeigt das Werkzeug einen Lesbarkeitsindex (Regel dieses Werkzeugs: darunter ist die Zahl zu unsicher). */
export const MIN_WORDS_FOR_INDEX = 30;
/** Ein Satz gilt hier ab so vielen Wörtern als lang (Richtwert dieses Werkzeugs, keine Norm). */
export const LONG_SENTENCE_WORDS = 25;
const MAX_EXAMPLES = 4;

// ---- Daten -----------------------------------------------------------------------------------------

type FloskelGroup = "fuellwort" | "schwurbel" | "abgenutzt";
type FloskelItem = { id: string; pattern: string; label: string; alternative: string; group: FloskelGroup };
type Floskel = FloskelItem & { re: RegExp };

/** Kaputte Muster in der Datei dürfen nie das Werkzeug lahmlegen: Sie fallen einzeln weg. */
function loadFloskeln(items: FloskelItem[]): Floskel[] {
  const out: Floskel[] = [];
  for (const item of items) {
    try {
      out.push({ ...item, re: new RegExp(item.pattern, "giu") });
    } catch {
      /* Eintrag überspringen */
    }
  }
  return out;
}

export const FLOSKELN: Floskel[] = loadFloskeln(floskelnData.items as FloskelItem[]);
export const FLOSKELN_META = floskelnData.meta;

// ---- Typen -----------------------------------------------------------------------------------------

export type FindingKind = "fehler" | "schreibweise" | "floskel" | "satz";
export type Example = { start: number; end: number; excerpt: string };
export type Finding = {
  id: string;
  kind: FindingKind;
  title: string;
  hint: string;
  /** Anzahl Stellen im ganzen Text. */
  count: number;
  /** Die ersten Stellen mit etwas Umgebung. */
  examples: Example[];
  /** «Text bereinigen» behebt diese Stellen von selbst. */
  fix: boolean;
};

export type Readability = { avgSentenceLength: number; avgSyllables: number; index: number; level: string };

export type TextReport = {
  chars: number;
  words: number;
  sentences: number;
  /** null: zu wenig Text für eine verlässliche Zahl. */
  readability: Readability | null;
  findings: Finding[];
  /** Der Text mit allen automatischen Korrekturen. */
  cleaned: string;
  /** Wie viele Stellen die Bereinigung ändert. */
  fixedCount: number;
};

// ---- Wörter, Sätze, Silben -------------------------------------------------------------------------

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu;

function wordsOf(text: string): string[] {
  return (text.match(WORD_RE) ?? []).filter((w) => /\p{L}/u.test(w));
}

/** Schätzt die Silben eines deutschen Wortes aus Selbstlautgruppen. Kürzel ohne Selbstlaut (CHF, SBB) zählen je Buchstabe. */
export function syllables(word: string): number {
  const lower = word.toLowerCase();
  const groups = lower.match(/[aeiouyäöüéèàâêîôû]+/g);
  if (groups) return groups.length;
  const letters = (word.match(/\p{L}/gu) ?? []).length;
  return /^\p{Lu}+$/u.test(word) ? Math.max(1, letters) : 1;
}

const ABBREVIATIONS =
  /\b(?:z\.\s?B|u\.\s?a|d\.\s?h|i\.\s?d\.\s?R|v\.\s?a|o\.\s?ä|ca|bzw|usw|etc|inkl|ggf|evtl|nr|tel|dr|prof|resp|vgl|max|min|mind|sog|std|mio|mrd|str|fr|hr|fa)\./gi;
const MONTHS = "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember";

/**
 * Setzt Punkte, die keinen Satz beenden (Kürzel, Zahlen, Datum, Ordnungszahlen, Adressen), auf ein Platzhalterzeichen.
 * Die Länge bleibt gleich, damit Stellen im maskierten Text auch im Original stimmen.
 */
function maskDots(text: string): string {
  const MASK = "\u0001";
  const dots = (s: string) => s.replace(/\./g, MASK);
  return text
    .replace(/(?:https?:\/\/|www\.)\S+|[\w.+-]{1,64}@[\w-]{1,64}(?:\.[\w-]{1,64}){1,8}/gi, dots)
    .replace(ABBREVIATIONS, dots)
    .replace(/(\d)\.(?=\d)/g, `$1${MASK}`)
    .replace(new RegExp(`(\\d)\\.(?=\\s+(?:[a-zäöü]|${MONTHS}))`, "g"), `$1${MASK}`);
}

type Span = { start: number; end: number };

/** Enden von Sätzen im (maskierten) Text. Ein einziger Durchlauf, damit lange Ketten von Satzzeichen nichts verlangsamen. */
function boundaryEnds(masked: string): number[] {
  const ends: number[] = [];
  const n = masked.length;
  const isEnd = (c: string) => c === "." || c === "!" || c === "?" || c === "…";
  const isClose = (c: string) => c === '"' || c === "»" || c === "«" || c === "”" || c === ")" || c === "]";
  let i = 0;
  while (i < n) {
    const c = masked[i];
    if (c === "\n") {
      let j = i;
      while (j < n && masked[j] === "\n") j++;
      ends.push(j);
      i = j;
    } else if (isEnd(c)) {
      let j = i;
      while (j < n && isEnd(masked[j])) j++;
      let k = j;
      while (k < n && isClose(masked[k])) k++;
      // Ein Satz endet nur vor Leerraum oder am Textende («3.5» oder «ab.bc» beenden nichts).
      if (k >= n || /\s/.test(masked[k])) {
        ends.push(k);
        i = k;
      } else {
        i = j;
      }
    } else {
      i++;
    }
  }
  return ends;
}

/** Sätze als Stellen im Text. Zeilenumbrüche beenden ebenfalls einen Satz (Überschriften, Listen). */
function sentenceSpans(text: string): Span[] {
  const masked = maskDots(text);
  const spans: Span[] = [];
  let last = 0;
  for (const end of boundaryEnds(masked)) {
    spans.push({ start: last, end });
    last = end;
  }
  spans.push({ start: last, end: text.length });
  return spans.filter((sp) => /\p{L}/u.test(text.slice(sp.start, sp.end)));
}

const LEVELS: Array<[number, string]> = [
  [30, "sehr schwer"],
  [50, "schwer"],
  [60, "mittelschwer"],
  [70, "mittel"],
  [80, "mittelleicht"],
  [90, "leicht"],
];

/** Stufe nach Amstad (Von … bis unter …): 0–30 sehr schwer, 30–50 schwer, 50–60 mittelschwer, 60–70 mittel, 70–80 mittelleicht, 80–90 leicht, ab 90 sehr leicht. */
export function levelOf(index: number): string {
  for (const [limit, label] of LEVELS) if (index < limit) return label;
  return "sehr leicht";
}

export function readability(text: string): Readability | null {
  const words = wordsOf(text);
  if (words.length < MIN_WORDS_FOR_INDEX) return null;
  const sentences = sentenceSpans(text).length || 1;
  const avgSentenceLength = words.length / sentences;
  const avgSyllables = words.reduce((n, w) => n + syllables(w), 0) / words.length;
  const index = Math.round(180 - avgSentenceLength - 58.5 * avgSyllables);
  return { avgSentenceLength, avgSyllables, index, level: levelOf(index) };
}

// ---- Prüfregeln ------------------------------------------------------------------------------------

const DOUBLE_WORD = /(^|[^\p{L}\p{N}])(\p{L}{2,40})(\s+)\2(?![\p{L}\p{N}])/giu;
const SPACE_BEFORE_PUNCT = /([\p{L}\p{N}»)])([ \t]+)([,;!?]|[.:](?=\s|$))/gu;
const COMMA_NO_SPACE = /(\p{L})([,;])(?=\p{L})/gu;
const DOUBLE_SPACE = /(\S)([ \t]{2,})(?=\S)/g;
const PERCENT = /(\d)%/g;
const QUOTE_CHARS = /["„“”]/g;
const CHF_AFTER = /\d[\d'’.,]{0,20}\s?CHF\b/g;
const THOUSANDS = /(^|[^\d.,'’])(\d{1,3}(?:\.\d{3})+)(?!\d|[.,]\d)/g;
const REPEATED_PUNCT = /[!?]{2,}|\.{4,}/g;

function excerptOf(text: string, start: number, end: number): string {
  const before = text.slice(Math.max(0, start - 24), start);
  const after = text.slice(end, end + 24);
  const flat = (s: string) => s.replace(/\s+/g, " ");
  return `${start > 24 ? "…" : ""}${flat(before)}${flat(text.slice(start, end))}${flat(after)}${end + 24 < text.length ? "…" : ""}`.trim();
}

type Hit = { start: number; end: number };

function finding(
  text: string,
  base: Omit<Finding, "count" | "examples">,
  hits: Hit[],
): Finding | null {
  if (hits.length === 0) return null;
  return {
    ...base,
    count: hits.length,
    examples: hits.slice(0, MAX_EXAMPLES).map((h) => ({ start: h.start, end: h.end, excerpt: excerptOf(text, h.start, h.end) })),
  };
}

function hitsOf(re: RegExp, text: string, prefixGroup = 0): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(re)) {
    const index = m.index ?? 0;
    const skip = prefixGroup ? (m[prefixGroup] ?? "").length : 0;
    out.push({ start: index + skip, end: index + m[0].length });
  }
  return out;
}

/** Stellen mit zwei zusammenhängenden Teilen: Treffer ohne die führende Gruppe 1 (Zeichen davor). */
function hitsWithPrefix(re: RegExp, text: string): Hit[] {
  return hitsOf(re, text, 1);
}

function longSentenceHits(text: string): Array<Hit & { words: number }> {
  return sentenceSpans(text)
    .map((s) => ({ ...s, words: wordsOf(text.slice(s.start, s.end)).length }))
    .filter((s) => s.words > LONG_SENTENCE_WORDS)
    .sort((a, b) => b.words - a.words);
}

const ORDER: FindingKind[] = ["fehler", "schreibweise", "floskel", "satz"];

export function findingsOf(text: string): Finding[] {
  const out: Array<Finding | null> = [];

  out.push(
    finding(
      text,
      { id: "doppeltes-wort", kind: "fehler", title: "Wort doppelt", hint: "Ein Wort steht zweimal hintereinander. Meist ist eines davon ein Tippfehler.", fix: false },
      hitsWithPrefix(DOUBLE_WORD, text),
    ),
    finding(
      text,
      { id: "leerzeichen-vor-satzzeichen", kind: "fehler", title: "Leerzeichen vor einem Satzzeichen", hint: "Vor Komma, Punkt, Strichpunkt, Doppelpunkt, Ausrufe- und Fragezeichen steht kein Leerzeichen.", fix: true },
      hitsOf(SPACE_BEFORE_PUNCT, text),
    ),
    finding(
      text,
      { id: "komma-ohne-leerzeichen", kind: "fehler", title: "Leerzeichen nach Komma fehlt", hint: "Nach Komma und Strichpunkt folgt ein Leerzeichen.", fix: true },
      hitsOf(COMMA_NO_SPACE, text),
    ),
    finding(
      text,
      { id: "doppeltes-leerzeichen", kind: "fehler", title: "Mehrere Leerzeichen hintereinander", hint: "Ein Leerzeichen reicht.", fix: true },
      hitsOf(DOUBLE_SPACE, text),
    ),
    finding(
      text,
      { id: "mehrfach-satzzeichen", kind: "fehler", title: "Satzzeichen mehrfach", hint: "Ein Ausrufe- oder Fragezeichen genügt, und drei Punkte sind genug.", fix: false },
      hitsOf(REPEATED_PUNCT, text),
    ),
    finding(
      text,
      { id: "eszett", kind: "schreibweise", title: "Eszett (ß)", hint: "In der Schweiz schreibt man ss: «Strasse», «gross».", fix: true },
      hitsOf(/ß/g, text),
    ),
    finding(
      text,
      { id: "anfuehrungszeichen", kind: "schreibweise", title: "Anführungszeichen", hint: "Üblich sind Guillemets: «Text». Gerade oder deutsche Anführungszeichen (unten beginnend) wirken importiert. Nicht gepaarte Zeichen lässt die Bereinigung stehen.", fix: true },
      hitsOf(QUOTE_CHARS, text),
    ),
    finding(
      text,
      { id: "prozent", kind: "schreibweise", title: "Prozent ohne Leerzeichen", hint: "Mit Leerzeichen: 8 %.", fix: true },
      hitsOf(PERCENT, text),
    ),
    finding(
      text,
      { id: "chf-nachgestellt", kind: "schreibweise", title: "CHF nach dem Betrag", hint: "Üblich ist CHF vor dem Betrag: CHF 100.", fix: false },
      hitsOf(CHF_AFTER, text),
    ),
    finding(
      text,
      { id: "tausender", kind: "schreibweise", title: "Tausender mit Punkt", hint: "In der Schweiz trennt der Apostroph die Tausender: 1'000.", fix: false },
      hitsWithPrefix(THOUSANDS, text),
    ),
  );

  for (const f of FLOSKELN) {
    out.push(
      finding(
        text,
        { id: `floskel-${f.id}`, kind: "floskel", title: f.label, hint: f.alternative, fix: false },
        hitsOf(f.re, text),
      ),
    );
  }

  const long = longSentenceHits(text);
  if (long.length > 0) {
    out.push({
      id: "lange-saetze",
      kind: "satz",
      title: `Lange Sätze (mehr als ${LONG_SENTENCE_WORDS} Wörter)`,
      hint: "Teile den Satz an einem Komma oder einem «und» in zwei.",
      fix: false,
      count: long.length,
      examples: long.slice(0, MAX_EXAMPLES).map((s) => ({
        start: s.start,
        end: s.end,
        excerpt: `${s.words} Wörter: ${text.slice(s.start, s.end).trim().replace(/\s+/g, " ").slice(0, 70)}…`,
      })),
    });
  }

  return out
    .filter((f): f is Finding => f !== null)
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || b.count - a.count);
}

// ---- Bereinigen ------------------------------------------------------------------------------------

/**
 * Wandelt Anführungszeichen zeilenweise in Guillemets um.
 *  - Mit «„» in der Zeile: „ öffnet, “ oder ” schliesst (deutsche Schreibweise).
 *  - Mit “ und ” ohne „: englische Schreibweise, “ öffnet, ” schliesst.
 *  - Gerade Zeichen: abwechselnd öffnen und schliessen, aber nur bei gerader Anzahl in der Zeile. Bei ungerader Anzahl bleibt die Zeile unverändert.
 */
function swissQuotes(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!/["„“”]/.test(line)) return line;
      let out = line;
      if (out.includes("„")) {
        out = out.replace(/„/g, "«").replace(/[“”]/g, "»");
      } else if (out.includes("“") && out.includes("”")) {
        out = out.replace(/“/g, "«").replace(/”/g, "»");
      }
      const straight = (out.match(/"/g) ?? []).length;
      if (straight > 0 && straight % 2 === 0) {
        let open = true;
        out = out.replace(/"/g, () => {
          const q = open ? "«" : "»";
          open = !open;
          return q;
        });
      }
      return out;
    })
    .join("\n");
}

/** Wendet alle automatischen Korrekturen an. Gleiche Regeln wie die Treffer mit `fix: true`. */
export function cleanText(text: string): string {
  let t = text.replace(/ß/g, "ss");
  t = swissQuotes(t);
  t = t.replace(SPACE_BEFORE_PUNCT, "$1$3");
  t = t.replace(COMMA_NO_SPACE, "$1$2 ");
  t = t.replace(DOUBLE_SPACE, "$1 ");
  t = t.replace(PERCENT, "$1 %");
  return t;
}

// ---- Gesamtbericht ---------------------------------------------------------------------------------

/** Meldet, warum ein Text nicht geprüft werden kann. null: in Ordnung. */
export function inputProblem(text: string): string | null {
  if (wordsOf(text).length === 0) return "Füge zuerst einen Text ein.";
  if (text.length > MAX_CHARS) return `Der Text ist zu lang. Es sind höchstens ${MAX_CHARS.toLocaleString("en-US").replace(/,/g, "'")} Zeichen möglich.`;
  return null;
}

export function analyzeText(text: string): TextReport {
  const words = wordsOf(text).length;
  const findings = findingsOf(text);
  return {
    chars: text.length,
    words,
    sentences: sentenceSpans(text).length,
    readability: readability(text),
    findings,
    cleaned: cleanText(text),
    fixedCount: findings.filter((f) => f.fix).reduce((n, f) => n + f.count, 0),
  };
}

/** Zahl mit Komma als Dezimalzeichen (Harte Regel 2). */
export function num(n: number, digits = 1): string {
  return n.toFixed(digits).replace(".", ",");
}

const KIND_TITLES: Record<FindingKind, string> = {
  fehler: "Fehler",
  schreibweise: "Schweizer Schreibweise",
  floskel: "Floskeln",
  satz: "Satzlänge",
};
export const kindTitle = (k: FindingKind): string => KIND_TITLES[k];

/** Der Bericht als Text zum Kopieren (Markdown). */
export function reportMarkdown(report: TextReport): string {
  const lines: string[] = ["# Textcheck", ""];
  lines.push(`- Wörter: ${report.words}`);
  lines.push(`- Sätze: ${report.sentences}`);
  if (report.readability) {
    lines.push(`- Durchschnittliche Satzlänge: ${num(report.readability.avgSentenceLength)} Wörter`);
    lines.push(`- Lesbarkeitsindex nach Amstad: ${report.readability.index} (${report.readability.level})`);
  } else {
    lines.push(`- Lesbarkeitsindex: erst ab ${MIN_WORDS_FOR_INDEX} Wörtern`);
  }
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("Es ist nichts aufgefallen.");
    return lines.join("\n");
  }
  lines.push("## Das fällt auf", "");
  for (const kind of ORDER) {
    const group = report.findings.filter((f) => f.kind === kind);
    if (group.length === 0) continue;
    lines.push(`### ${kindTitle(kind)}`);
    for (const f of group) {
      lines.push(`- ${f.title} (${f.count}): ${f.hint}`);
      for (const e of f.examples) lines.push(`  - ${e.excerpt}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type TextcheckState = { v: 1; phase: "edit" | "result"; text: string; counted: boolean };
export const EMPTY_STATE: TextcheckState = { v: 1, phase: "edit", text: "", counted: false };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. */
export function parseTextcheckState(raw: unknown): TextcheckState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<TextcheckState>;
  if (r.v !== 1 || typeof r.text !== "string") return EMPTY_STATE;
  return {
    v: 1,
    phase: r.phase === "result" && wordsOf(r.text).length > 0 ? "result" : "edit",
    text: r.text.slice(0, MAX_CHARS),
    counted: r.counted === true,
  };
}

/** Beispieltext mit typischen Stolperstellen, um das Werkzeug auszuprobieren. */
export const SAMPLE_TEXT = `Willkommen bei der Malerei Keller in Gossau!  In der heutigen Zeit ist ein schöner Anstrich wichtiger denn je. Wir sind Ihr kompetenter Ansprechpartner für Innen- und Aussenarbeiten ,und wir arbeiten qualitativ hochwertig.

Unsere Preise: Ein Zimmer streichen kostet ab 450 CHF, die Fassade eines Einfamilienhauses ab 12.500 Franken. Bei Aufträgen im Winter geben wir 5% Rabatt. Unser Motto: "Sauber gestrichen, sauber gerechnet".

Die Straße zum Atelier ist leicht zu finden, und die Parkplätze vor dem Haus sind kostenlos, wenn Sie bei uns einen Termin haben und uns vorher anrufen und uns mitteilen, wie viele Zimmer gestrichen werden sollen, damit wir die Farbe zeitnah bestellen können. Wir freuen uns auf Ihre Anfrage. Gerne beraten wir Sie, auch am Samstag, bei der der Wahl der Farbe für das Wohnzimmer.`;
