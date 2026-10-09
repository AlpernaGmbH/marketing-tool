import spamData from "@/data/spamwoerter.json";
import { TAG_MAX, attr, blocks, tagsOf, textOf } from "@/lib/check/html";
import { toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { scoreBand } from "@/lib/score";
import { MIN_WORDS_FOR_INDEX, analyzeText, type Readability, type TextReport } from "@/tools/textcheck/logic";

// Newsletter-Check: reine Funktionen, kein React, kein DOM (CLAUDE.md, Harte Regel 3). Der Text verlässt den Browser nur
// mit dem Ergebnis ins CRM (Zugang v3). Zehn Prüfgruppen mit Gewicht; die Punktzahl ist der gewichtete Anteil erfüllter Punkte.
// Floskeln, Schweizer Schreibweise, Formfehler, Satzlänge und Lesbarkeit kommen aus tools/textcheck/logic.ts (analyzeText),
// HTML wird vorher mit textOf aus lib/check/html.ts in Text gewandelt. Keine Rechtsaussagen (Harte Regel 8): Funde sind
// als Praxis formuliert, nie als Pflicht.

export const SLUG = "newsletter-check";
export const MAX_CHARS = 20_000;

/** Richtwerte von Alperna, keine Statistik. Im UI und im Seitentext so gekennzeichnet (TOOL-BAUEN.md, Abschnitt 5). */
export const RICHTWERT = {
  betreffMin: 30,
  betreffMax: 60,
  /** Verschiedene Linkziele ohne Fusszeile (Abmelden, Impressum, Browseransicht). */
  linksMax: 5,
  ctaMax: 3,
  wordsMin: 50,
  wordsMax: 400,
  /** Höchstens ein Bild je so viele Wörter (nur bei HTML). */
  wordsPerImage: 40,
} as const;
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";

const MAX_EXAMPLES = 4;
const ANREDE_WINDOW = 800;
const SIGNATUR_WINDOW = 600;

// ---- Daten -----------------------------------------------------------------------------------------

export type SpamGroup = "dringlichkeit" | "versprechen" | "preis" | "form";
export type SpamItem = {
  id: string;
  pattern: string;
  label: string;
  hint: string;
  group: SpamGroup;
  /** Muster, die Gross- und Kleinschreibung unterscheiden müssen (Grossbuchstaben). */
  caseSensitive?: boolean;
  /** Erst ab so vielen Stellen ein Fund (Ausrufezeichen, Grossbuchstaben). Standard 1. */
  minCount?: number;
};
export type Spam = SpamItem & { re: RegExp; minCount: number };

/** Kaputte Muster in der Datei legen nie das Werkzeug lahm: Sie fallen einzeln weg. */
export function loadSpamwoerter(items: SpamItem[]): Spam[] {
  const out: Spam[] = [];
  for (const item of items) {
    try {
      out.push({ ...item, re: new RegExp(item.pattern, item.caseSensitive ? "gu" : "giu"), minCount: Math.max(1, item.minCount ?? 1) });
    } catch {
      /* Eintrag überspringen */
    }
  }
  return out;
}

export const SPAMWOERTER: Spam[] = loadSpamwoerter(spamData.items as SpamItem[]);
export const SPAMWOERTER_META = spamData.meta;

// ---- Typen -----------------------------------------------------------------------------------------

/** Was der Besucher eingefügt hat: nur den Text der Mail oder den HTML-Quelltext aus dem Versandprogramm. Ohne Angabe erkennt das Werkzeug es selbst. */
export type Modus = "text" | "html";

export type NewsletterInput = { betreff: string; absender: string; text: string; modus?: Modus };

export const GROUPS = ["betreff", "absender", "anrede", "ziel", "abmeldung", "adresse", "bilder", "spam", "sprache", "laenge"] as const;
export type Group = (typeof GROUPS)[number];

const GROUP_TITLES: Record<Group, string> = {
  betreff: "Betreff",
  absender: "Absender",
  anrede: "Anrede",
  ziel: "Ziel und Links",
  abmeldung: "Abmeldung",
  adresse: "Postadresse",
  bilder: "Bilder",
  spam: "Spam-Signale",
  sprache: "Sprache",
  laenge: "Länge",
};
export const groupTitle = (g: Group): string => GROUP_TITLES[g];

export type Check = {
  id: string;
  group: Group;
  label: string;
  /** Anteil der Punkte dieses Prüfpunkts, 0 bis 1. */
  pass: number;
  weight: number;
  /** pass === 1 */
  ok: boolean;
  /** Was gefunden wurde. */
  detail: string;
  /** Was zu tun ist; leer, wenn erfüllt. */
  hint: string;
  examples: string[];
  /** Der Prüfpunkt stützt sich auf einen Richtwert von Alperna. */
  richtwert: boolean;
};

export type GroupScore = { group: Group; title: string; score: number; weight: number };

export type NewsletterReport = {
  v: 1;
  betreff: string;
  absender: string;
  html: boolean;
  /** Der geprüfte Text (bei HTML der sichtbare Text). */
  plain: string;
  score: number;
  words: number;
  sentences: number;
  /** Verschiedene Linkziele ohne Fusszeile. */
  links: number;
  ctas: number;
  /** null: kein HTML, Bilder nicht prüfbar. */
  images: number | null;
  readability: Readability | null;
  checks: Check[];
  groups: GroupScore[];
};

// ---- Text aus HTML ---------------------------------------------------------------------------------

const HTML_RE = new RegExp(
  `<(?:!doctype|html|head|body|table|tbody|tr|td|th|div|p|span|a|img|br|h[1-6]|ul|ol|li|strong|b|em|i|center|font|style|meta|title)\\b[^<>]{0,${TAG_MAX}}>|</(?:p|a|td|tr|table|div|span|body|html|h[1-6]|li|ul|ol|strong|b|em)\\s*>`,
  "i",
);
const BLOCK_TAG_RE = new RegExp(
  `<(?:br|hr)\\b[^<>]{0,${TAG_MAX}}>|</?(?:p|div|tr|td|th|li|h[1-6]|table|ul|ol|blockquote|center|header|footer|section|article|pre|title)\\b[^<>]{0,${TAG_MAX}}>`,
  "gi",
);
const SENTINEL = "";

export function isHtml(text: string): boolean {
  return HTML_RE.test(text);
}

/** Entfernt den ersten head-Block (Titel, Stile) in linearer Zeit. */
function stripHead(html: string): string {
  const start = html.search(/<head\b/i);
  if (start < 0) return html;
  const end = html.toLowerCase().indexOf("</head>", start);
  return end < 0 ? html.slice(0, start) : html.slice(0, start) + html.slice(end + 7);
}

/** Sichtbarer Text; bei HTML werden Blockgrenzen zu Zeilenumbrüchen, damit Sätze und Zeilen erhalten bleiben. */
export function toPlainText(input: string, modus?: Modus): { text: string; html: boolean } {
  const normalized = input.replace(/\r\n?/g, "\n");
  if (modus === "text" || (modus === undefined && !isHtml(normalized))) return { text: normalized, html: false };
  const marked = stripHead(normalized).replace(BLOCK_TAG_RE, (m) => `${SENTINEL}${m}`);
  const text = textOf(marked)
    .split(SENTINEL)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
  return { text, html: true };
}

// ---- Hilfen ----------------------------------------------------------------------------------------

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu;
const hasWords = (text: string): boolean => (text.match(WORD_RE) ?? []).some((w) => /\p{L}/u.test(w));

function excerptOf(text: string, start: number, end: number, around = 24): string {
  const before = text.slice(Math.max(0, start - around), start);
  const after = text.slice(end, end + around);
  const flat = (s: string) => s.replace(/\s+/g, " ");
  return `${start > around ? "…" : ""}${flat(before)}${flat(text.slice(start, end))}${flat(after)}${end + around < text.length ? "…" : ""}`.trim();
}

const flat = (s: string): string => s.replace(/\s+/g, " ").trim();
const cut = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const quote = (s: string): string => `«${cut(flat(s))}»`;
const list = (items: string[]): string => items.map((i) => `«${i}»`).join(", ");

type Hit = { start: number; end: number };

function hitsOf(re: RegExp, text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(re)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return out;
}

/** Erfüllt (pass 1) oder nicht; alle Texte an einer Stelle. */
function check(
  base: Omit<Check, "ok" | "examples" | "richtwert" | "hint"> & { hint?: string; examples?: string[]; richtwert?: boolean },
): Check {
  const pass = Math.min(1, Math.max(0, base.pass));
  return { ...base, pass, ok: pass === 1, hint: pass === 1 ? "" : (base.hint ?? ""), examples: base.examples ?? [], richtwert: base.richtwert ?? false };
}

// ---- Links und Ziele -------------------------------------------------------------------------------

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'«»()[\]]+/gi;
/** Links der Fusszeile zählen nicht als Ziel. */
const FOOTER_RE = /unsubscribe|abmeld|abbestell|opt-?out|austragen|impressum|datenschutz|privacy|webversion|browser|online (?:ansehen|anzeigen|lesen)|im browser/i;
const BAD_LINKTEXT_RE = /^(?:hier|hier klicken|klick(?:e)? hier|klicken sie hier|mehr|link|weiter|hier entlang|hier geht'?s|hier gehts|klick|click here|read more)[.!]?$/i;
const BAD_LINKTEXT_PLAIN_RE = /hier klicken|klick(?:e)? hier|klicken sie hier/giu;
const CTA_RE =
  /\b(?:(?:jetzt|gleich|sofort|heute)\s+)?(?:anmelden|buchen|bestellen|reservieren|registrieren|mitmachen|teilnehmen|vorbeikommen|weiterlesen|mehr erfahren|mehr lesen|mehr dazu|mehr infos?|alle infos|zum (?:angebot|shop|artikel|beitrag|formular|kalender|programm|anmeldeformular|video|blog|bericht)|zur (?:anmeldung|website|aktion|übersicht|umfrage)|termin (?:buchen|vereinbaren|anfragen|sichern)|offerte (?:anfordern|einholen|verlangen|anfragen)|melde dich|melden sie sich|ruf(?:e)? (?:uns )?an|rufen sie (?:uns )?an|schreib(?:e)? (?:uns|mir)|schreiben sie (?:uns|mir)|antworte(?: einfach)? auf diese (?:mail|e-mail|nachricht)|antworten sie(?: einfach)? auf diese (?:mail|e-mail|nachricht)|hier (?:geht'?s|gehts|entlang)|klick(?:e)? hier|hier klicken|klicken sie hier|tickets? (?:sichern|kaufen|bestellen)|folg(?:e|en sie) uns|bewerte(?:n sie)? uns|zugreifen|sichern|entdecken)\b/giu;

/** Ein Linkziel ohne Anker, Abfrage (Tracking-Parameter) und Schrägstrich am Ende. null: kein Ziel im Sinn des Checks. */
function normalizeTarget(href: string): string | null {
  const h = href.trim();
  if (!h || /^(?:mailto:|tel:|sms:|#|javascript:)/i.test(h)) return null;
  return h.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase() || null;
}

type LinkInfo = { href: string; text: string };

function linksOfHtml(html: string): LinkInfo[] {
  return blocks(html, "a").map((b) => ({ href: attr(b.open, "href") ?? "", text: flat(textOf(b.inner)) }));
}

/** Handlungsaufforderungen ohne Vorsatz («jetzt anmelden» und «anmelden» sind dieselbe). */
function ctasOf(plain: string): string[] {
  const seen = new Set<string>();
  for (const m of plain.matchAll(CTA_RE)) {
    const phrase = flat(m[0].toLowerCase()).replace(/^(?:jetzt|gleich|sofort|heute)\s+/, "");
    seen.add(phrase);
  }
  return [...seen];
}

// ---- Absender, Anrede, Abmeldung, Adresse ----------------------------------------------------------

const GRUSS_RE =
  /\b(?:freundliche|liebe|herzliche|beste|sportliche|sonnige|härzliche|viele|schöne|frohe|en guete|mit freundlichen|mit besten|mit lieben|mit herzlichen|bis bald und liebe)\s+gr(?:ü|ue|üe)ss(?:e|li|en)?\b/iu;
const LEGAL_RE = /\p{Lu}[\p{L}&'.-]*(?:\s+\p{Lu}?[\p{L}&'.-]+){0,4}\s+(?:GmbH|AG|S[àa]rl|SA|Genossenschaft|Stiftung|Verein|KlG|KmG)(?![\p{L}])/u;
const TEAM_RE = /\b(?:[Dd]eine?|[Ee]u(?:er|re)|[Ii]hre?)\s+(?:[Tt]eam\s+)?\p{Lu}[\p{L}'-]{1,30}(?:\s+\p{Lu}[\p{L}'-]{1,30})?|\b[Tt]eam\s+\p{Lu}[\p{L}'-]{1,30}/u;

/** Signatur am Ende: Grussformel mit folgendem Namen, Rechtsform oder «Dein Team …». */
export function signatureOf(plain: string): string | null {
  const tail = plain.slice(-SIGNATUR_WINDOW);
  const g = GRUSS_RE.exec(tail);
  if (g) {
    const rest = tail.slice(g.index + g[0].length);
    const sameLine = rest.split("\n")[0].replace(/^[\s,.:;-]+/, "").trim();
    const nextLine = rest
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .find((l) => /\p{L}{2,}/u.test(l));
    const name = /\p{L}{2,}/u.test(sameLine) ? sameLine : nextLine;
    if (name) return cut(name, 80);
  }
  const l = LEGAL_RE.exec(tail);
  if (l) return cut(flat(l[0]), 80);
  const t = TEAM_RE.exec(tail);
  if (t) return cut(flat(t[0]), 80);
  return null;
}

const ANREDE_RE = /\b(?:hallo|hoi|grüezi|grüessech|guten tag|guten morgen|guten abend|salü|sali|liebe[rs]?|sehr geehrte[rs]?|werte[rs]?|geschätzte[rs]?)\b([^\n.!?;:]{0,60})/giu;
const GENERIC_RE =
  /^(?:zusammen|alle\b|miteinander|mitenand|zäme|kund(?:e|en|in|innen|schaft)\b|leser(?:in|innen|schaft)?\b|mitglieder|freund(?:e|innen)\b|interessierte|damen und herren|abonnent|newsletter|gäste|vereinsmitglieder|sportfreund|eltern|team\b|partner|geschäftsfreund|fans|nachbar|besucher|gönner|sponsor|familie|community|kolleg)/iu;

export type AnredeKind = "persoenlich" | "allgemein" | "keine";

export function anredeOf(plain: string): { kind: AnredeKind; text: string } {
  const head = plain.slice(0, ANREDE_WINDOW);
  for (const m of head.matchAll(ANREDE_RE)) {
    const rest = (m[1] ?? "").replace(/^[\s,]+/, "").trim();
    if (/^gr(?:ü|ue|üe)ss/i.test(rest)) continue; // «Liebe Grüsse» ist der Schluss, keine Anrede
    const text = cut(flat(m[0]), 60);
    if (!rest) return { kind: "allgemein", text };
    if (/[[{%*|]/.test(rest)) return { kind: "persoenlich", text }; // Platzhalter des Versandprogramms
    if (GENERIC_RE.test(rest)) return { kind: "allgemein", text };
    if (/^(?:(?:herr|frau)\s+)?\p{Lu}/u.test(rest)) return { kind: "persoenlich", text };
    return { kind: "allgemein", text };
  }
  return { kind: "keine", text: "" };
}

const ABMELDE_RE =
  /\babmelden\b|\babbestellen\b|\bunsubscribe\b|\babmeldung\b|\babmeldelink\b|newsletter (?:beenden|kündigen|abbestellen|abmelden|nicht mehr)|keine weiteren (?:e-?mails|newsletter|nachrichten|mails)|\baustragen\b|\bopt-?out\b|désinscri|désabonn|disiscri/iu;
const ABMELDE_HREF_RE = /unsubscribe|abmeld|abbestell|opt-?out|austragen/i;

const STREET_RE =
  /(?:\p{L}[\p{L}'.-]{0,40}?)?(?:strasse|str\.|gasse|weg|platz|allee|ring|quai|rain|halde|matte|steig|bühl|hof|promenade|postfach)\s+\d{1,4}\s?[a-z]?(?![\p{L}\d])/giu;
const PLZ_RE =
  /(?<![\d.'’,-])(?:CH-?)?[1-9]\d{3}[  ]+(?!(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Uhr|Jahr|Franken|CHF|Stück|Personen|Mitglieder|Prozent)\b)\p{Lu}[\p{L}.-]+(?: \p{Lu}[\p{L}.-]+)?/gu;

// ---- Bilder ----------------------------------------------------------------------------------------

type ImageStats = { count: number; withAlt: number };

function imagesOf(html: string): ImageStats {
  let count = 0;
  let withAlt = 0;
  for (const tag of tagsOf(html, "img")) {
    // Zählpixel (1 × 1) sind keine Bilder.
    if (attr(tag, "width") === "1" || attr(tag, "height") === "1") continue;
    count++;
    if ((attr(tag, "alt") ?? "").trim() !== "") withAlt++;
  }
  return { count, withAlt };
}

// ---- Spam ------------------------------------------------------------------------------------------

export type SpamHit = { item: Spam; count: number; excerpts: string[] };

export function spamHits(text: string): SpamHit[] {
  const out: SpamHit[] = [];
  for (const item of SPAMWOERTER) {
    const hits = hitsOf(item.re, text);
    if (hits.length < item.minCount) continue;
    out.push({ item, count: hits.length, excerpts: hits.slice(0, 2).map((h) => excerptOf(text, h.start, h.end)) });
  }
  return out.sort((a, b) => b.count - a.count);
}

// ---- Prüfung ---------------------------------------------------------------------------------------

/** Meldet, warum ein Newsletter nicht geprüft werden kann. null: in Ordnung. */
export function inputProblem(text: string, modus?: Modus): string | null {
  if (text.length > MAX_CHARS) return `Der Text ist zu lang. Es sind höchstens ${MAX_CHARS.toLocaleString("en-US").replace(/,/g, "'")} Zeichen möglich.`;
  const { text: plain, html } = toPlainText(text, modus);
  if (!hasWords(plain)) {
    return html ? "Aus dem HTML liess sich kein Text lesen. Füge den Newsletter als reinen Text ein." : "Füge zuerst den Text deines Newsletters ein.";
  }
  return null;
}

const fraction = (n: number, step: number): number => Math.max(0, 1 - step * n);

export function analyzeNewsletter(input: NewsletterInput): NewsletterReport {
  const betreff = flat(input.betreff ?? "");
  const absender = flat(input.absender ?? "");
  const raw = (input.text ?? "").slice(0, MAX_CHARS);
  const { text: plain, html } = toPlainText(raw, input.modus);
  const tc: TextReport = analyzeText(plain);
  const words = tc.words;
  const checks: Check[] = [];

  // 1. Betreff
  const bl = betreff.length;
  checks.push(
    check({
      id: "betreff",
      group: "betreff",
      label: "Betreff",
      weight: 14,
      richtwert: true,
      pass: bl === 0 ? 0 : bl < RICHTWERT.betreffMin || bl > RICHTWERT.betreffMax ? 0.5 : 1,
      detail:
        bl === 0
          ? "Kein Betreff angegeben."
          : bl < RICHTWERT.betreffMin
            ? `Der Betreff hat ${bl} Zeichen, das ist kurz.`
            : bl > RICHTWERT.betreffMax
              ? `Der Betreff hat ${bl} Zeichen. Auf dem Handy wird ein langer Betreff abgeschnitten.`
              : `${bl} Zeichen, im Richtwert von ${RICHTWERT.betreffMin} bis ${RICHTWERT.betreffMax}.`,
      hint:
        bl === 0
          ? `Schreib einen Betreff mit dem konkreten Nutzen, zum Beispiel «Fassade streichen: freie Termine im November». Richtwert von Alperna: ${RICHTWERT.betreffMin} bis ${RICHTWERT.betreffMax} Zeichen.`
          : `Sag im Betreff, was drin ist, und nicht mehr. Richtwert von Alperna: ${RICHTWERT.betreffMin} bis ${RICHTWERT.betreffMax} Zeichen, keine Statistik.`,
      examples: bl > 0 ? [quote(betreff)] : [],
    }),
  );

  // 2. Absender
  const signature = absender ? null : signatureOf(plain);
  checks.push(
    check({
      id: "absender",
      group: "absender",
      label: "Absender erkennbar",
      weight: 8,
      pass: absender || signature ? 1 : 0,
      detail: absender ? `Absender: ${quote(absender)}.` : signature ? `Im Text erkannt: ${quote(signature)}.` : "Weder im Feld noch im Text ist ein Absender erkennbar (Name, Betrieb, Grussformel).",
      hint: "Unterschreibe mit Name und Betrieb und trag den Absendernamen ein, wie er im Postfach stehen soll. Wer dich nicht erkennt, öffnet nicht.",
    }),
  );

  // 3. Anrede
  const anrede = anredeOf(plain);
  checks.push(
    check({
      id: "anrede",
      group: "anrede",
      label: "Anrede",
      weight: 8,
      pass: anrede.kind === "persoenlich" ? 1 : anrede.kind === "allgemein" ? 0.75 : 0,
      detail:
        anrede.kind === "persoenlich"
          ? `Persönliche Anrede: ${quote(anrede.text)}.`
          : anrede.kind === "allgemein"
            ? `Allgemeine Anrede: ${quote(anrede.text)}.`
            : "In den ersten Zeilen steht keine Anrede.",
      hint:
        anrede.kind === "allgemein"
          ? "Eine Anrede mit Namen wirkt persönlicher. Die meisten Versandprogramme setzen den Vornamen aus der Adressliste ein."
          : "Beginne mit einer Anrede, am besten mit dem Namen aus deiner Adressliste.",
    }),
  );

  // 4. Ziel: Links, Aufforderungen, Linktexte
  const htmlLinks = html ? linksOfHtml(raw) : [];
  const targets = new Set<string>();
  const badLinktexts: string[] = [];
  if (html) {
    for (const l of htmlLinks) {
      const footer = FOOTER_RE.test(l.href) || FOOTER_RE.test(l.text);
      if (BAD_LINKTEXT_RE.test(l.text)) badLinktexts.push(l.text);
      const t = normalizeTarget(l.href);
      if (t && !footer) targets.add(t);
    }
  } else {
    for (const m of plain.matchAll(URL_RE)) {
      if (FOOTER_RE.test(m[0])) continue;
      const t = normalizeTarget(m[0]);
      if (t) targets.add(t);
    }
  }
  for (const m of plain.matchAll(BAD_LINKTEXT_PLAIN_RE)) badLinktexts.push(m[0]);
  const links = targets.size;
  checks.push(
    check({
      id: "ziel-links",
      group: "ziel",
      label: "Linkziele",
      weight: 10,
      richtwert: true,
      pass: links === 0 ? 0.5 : links <= RICHTWERT.linksMax ? 1 : links <= RICHTWERT.linksMax * 2 ? 0.5 : 0,
      detail:
        links === 0
          ? "Kein Link gefunden."
          : `${links} ${links === 1 ? "Linkziel" : "verschiedene Linkziele"} (Fusszeile ausgenommen).`,
      hint:
        links === 0
          ? "Ein Newsletter braucht ein Ziel: einen Link zu Termin, Angebot oder Beitrag. Hast du den Text ohne Links kopiert, füge den HTML-Quelltext ein."
          : `Entscheide dich für ein Hauptziel und streiche die übrigen Links oder verschiebe sie in die Fusszeile. Richtwert von Alperna: höchstens ${RICHTWERT.linksMax} verschiedene Ziele.`,
    }),
  );
  const ctas = ctasOf(plain);
  checks.push(
    check({
      id: "ziel-cta",
      group: "ziel",
      label: "Handlungsaufforderung",
      weight: 8,
      richtwert: true,
      pass: ctas.length === 0 ? 0.5 : ctas.length <= RICHTWERT.ctaMax ? 1 : 0.5,
      detail: ctas.length === 0 ? "Keine Handlungsaufforderung erkannt." : `${ctas.length} ${ctas.length === 1 ? "Aufforderung" : "verschiedene Aufforderungen"}: ${list(ctas.slice(0, 6))}.`,
      hint:
        ctas.length === 0
          ? "Sag am Ende, was die Leserin tun soll: «Termin buchen», «Antworte auf diese Mail»."
          : `Eine Aufforderung je Newsletter reicht. Richtwert von Alperna: höchstens ${RICHTWERT.ctaMax} verschiedene, keine Statistik.`,
    }),
  );
  checks.push(
    check({
      id: "ziel-linktext",
      group: "ziel",
      label: "Linktexte",
      weight: 6,
      pass: badLinktexts.length === 0 ? 1 : 0,
      detail: badLinktexts.length === 0 ? "Keine nichtssagenden Linktexte wie «hier klicken»." : `Nichtssagender Linktext ${list([...new Set(badLinktexts.map((t) => t.toLowerCase()))])} (${badLinktexts.length}).`,
      hint: "Benenne das Ziel im Link: «Termin buchen» statt «hier klicken». So weiss die Leserin, was sie erwartet, und Vorleseprogramme lesen den Link sinnvoll vor.",
    }),
  );

  // 5. Abmeldung
  const abmeldeText = ABMELDE_RE.exec(plain);
  const abmeldeHref = htmlLinks.find((l) => ABMELDE_HREF_RE.test(l.href));
  checks.push(
    check({
      id: "abmeldung",
      group: "abmeldung",
      label: "Abmeldemöglichkeit",
      weight: 12,
      pass: abmeldeText || abmeldeHref ? 1 : 0,
      detail: abmeldeText
        ? `Erkannt: ${quote(excerptOf(plain, abmeldeText.index, abmeldeText.index + abmeldeText[0].length))}.`
        : abmeldeHref
          ? `Abmeldelink erkannt: ${quote(abmeldeHref.href)}.`
          : "Keine Abmeldemöglichkeit erkannt (abmelden, abbestellen, unsubscribe).",
      hint: "Eine sichtbare Abmeldemöglichkeit gehört in jeden Newsletter, meist als Link in der Fusszeile. Viele Versandprogramme fügen sie erst beim Versand ein; dann steht sie nicht im Entwurf.",
    }),
  );

  // 6. Postadresse
  const street = STREET_RE.exec(plain);
  STREET_RE.lastIndex = 0;
  const plz = PLZ_RE.exec(plain);
  PLZ_RE.lastIndex = 0;
  const found = [street && quote(street[0]), plz && quote(plz[0])].filter((s): s is string => Boolean(s));
  checks.push(
    check({
      id: "adresse",
      group: "adresse",
      label: "Postadresse",
      weight: 10,
      pass: street && plz ? 1 : street || plz ? 0.5 : 0,
      detail: found.length === 2 ? `Erkannt: ${found.join(" und ")}.` : found.length === 1 ? `Nur teilweise erkannt: ${found[0]}.` : "Keine Postadresse erkannt (Strasse mit Nummer, Postleitzahl und Ort).",
      hint: "Eine vollständige Postadresse des Absenders gehört in jeden Newsletter: Strasse, Hausnummer, Postleitzahl und Ort, in der Fusszeile neben der Abmeldemöglichkeit.",
    }),
  );

  // 7. Bilder (nur HTML)
  let images: number | null = null;
  if (html) {
    const img = imagesOf(raw);
    images = img.count;
    const perImage = img.count === 0 ? Infinity : words / img.count;
    checks.push(
      check({
        id: "bilder-verhaeltnis",
        group: "bilder",
        label: "Bild und Text",
        weight: 6,
        richtwert: true,
        pass: img.count === 0 ? 1 : words === 0 ? 0 : perImage >= RICHTWERT.wordsPerImage ? 1 : 0.5,
        detail:
          img.count === 0
            ? "Keine Bilder."
            : words === 0
              ? `${img.count} ${img.count === 1 ? "Bild" : "Bilder"}, kein Text.`
              : `${img.count} ${img.count === 1 ? "Bild" : "Bilder"} auf ${words} Wörter.`,
        hint:
          words === 0
            ? "Schreib den Inhalt als Text. Ein Newsletter nur aus Bildern zeigt nichts, solange die Bilder nicht geladen sind."
            : `Mehr Text oder weniger Bilder. Richtwert von Alperna: höchstens ein Bild je ${RICHTWERT.wordsPerImage} Wörter, keine Statistik.`,
      }),
    );
    const missing = img.count - img.withAlt;
    checks.push(
      check({
        id: "bilder-alt",
        group: "bilder",
        label: "Alt-Texte",
        weight: 4,
        pass: img.count === 0 ? 1 : img.withAlt / img.count,
        detail: img.count === 0 ? "Keine Bilder." : missing === 0 ? `Alle ${img.count} Bilder haben einen Alt-Text.` : `${missing} von ${img.count} Bildern ohne Alt-Text.`,
        hint: "Gib jedem Bild einen Alt-Text, der sagt, was darauf ist. Er erscheint, solange Bilder nicht geladen sind, und Vorleseprogramme lesen ihn vor.",
      }),
    );
  }

  // 8. Spam-Signale (Betreff und Text)
  const spam = spamHits(`${betreff}\n${plain}`);
  checks.push(
    check({
      id: "spam",
      group: "spam",
      label: "Spam-Signale",
      weight: 12,
      pass: fraction(spam.length, 0.25),
      detail: spam.length === 0 ? "Keine Wörter aus der Liste." : `${spam.length} ${spam.length === 1 ? "Muster" : "Muster"} aus der Liste: ${list(spam.map((h) => h.item.label).slice(0, 6))}.`,
      hint: "Ersetze Druck und Übertreibung durch das Konkrete: Datum, Preis, Nutzen. Die Liste ist eine redaktionelle Liste von Alperna, kein Spamfilter.",
      examples: spam.slice(0, MAX_EXAMPLES).map((h) => `${h.item.label} (${h.count}): ${h.item.hint} Zum Beispiel: ${quote(h.excerpts[0] ?? "")}`),
    }),
  );

  // 9. Sprache (aus dem Textcheck): Form und Schreibweise, Floskeln
  const form = tc.findings.filter((f) => f.kind === "fehler" || f.kind === "schreibweise");
  checks.push(
    check({
      id: "sprache-form",
      group: "sprache",
      label: "Form und Schweizer Schreibweise",
      weight: 6,
      pass: fraction(form.length, 0.25),
      detail: form.length === 0 ? "Keine Formfehler, Schreibweise in Ordnung." : `${form.length} ${form.length === 1 ? "Punkt" : "Punkte"}: ${list(form.map((f) => f.title))}.`,
      hint: "Der Textcheck bereinigt die sicheren Fälle von selbst (Eszett, Anführungszeichen, Leerzeichen, Prozent).",
      examples: form.slice(0, MAX_EXAMPLES).map((f) => `${f.title} (${f.count}): ${f.hint} Zum Beispiel: ${quote(f.examples[0]?.excerpt ?? "")}`),
    }),
  );
  const floskeln = tc.findings.filter((f) => f.kind === "floskel");
  checks.push(
    check({
      id: "sprache-floskeln",
      group: "sprache",
      label: "Floskeln",
      weight: 6,
      pass: fraction(floskeln.length, 0.25),
      detail: floskeln.length === 0 ? "Keine Floskeln aus der Liste." : `${floskeln.length} ${floskeln.length === 1 ? "Floskel" : "Floskeln"}: ${list(floskeln.map((f) => f.title))}.`,
      hint: "Streiche die Floskel oder setze etwas Konkretes an die Stelle: einen Termin, ein Material, eine Antwortzeit.",
      examples: floskeln.slice(0, MAX_EXAMPLES).map((f) => `${f.title} (${f.count}): ${f.hint}`),
    }),
  );

  // 10. Länge: Wörter und Sätze
  checks.push(
    check({
      id: "laenge-woerter",
      group: "laenge",
      label: "Umfang",
      weight: 6,
      richtwert: true,
      pass: words < RICHTWERT.wordsMin || words > RICHTWERT.wordsMax ? 0.5 : 1,
      detail: `${words} ${words === 1 ? "Wort" : "Wörter"}${words < RICHTWERT.wordsMin ? ", das ist kurz" : words > RICHTWERT.wordsMax ? ", das ist lang" : ""}.`,
      hint:
        words < RICHTWERT.wordsMin
          ? `Ein kurzer Newsletter ist in Ordnung, wenn er ein Ziel hat. Prüfe, ob Anrede, Nutzen und nächster Schritt drin sind. Richtwert von Alperna: ${RICHTWERT.wordsMin} bis ${RICHTWERT.wordsMax} Wörter.`
          : `Kürze auf ein Thema und verlinke den Rest. Richtwert von Alperna: ${RICHTWERT.wordsMin} bis ${RICHTWERT.wordsMax} Wörter, keine Statistik.`,
    }),
  );
  const long = tc.findings.find((f) => f.id === "lange-saetze");
  const longCount = long?.count ?? 0;
  checks.push(
    check({
      id: "laenge-saetze",
      group: "laenge",
      label: "Satzlänge",
      weight: 4,
      richtwert: true,
      pass: longCount === 0 ? 1 : longCount <= 2 ? 0.5 : 0,
      detail: longCount === 0 ? "Keine langen Sätze." : `${longCount} ${longCount === 1 ? "langer Satz" : "lange Sätze"} mit mehr als 25 Wörtern.`,
      hint: "Teile den Satz an einem Komma oder einem «und» in zwei. Als lang gilt hier ein Satz ab 26 Wörtern, ein Richtwert, keine Norm.",
      examples: long ? long.examples.slice(0, MAX_EXAMPLES).map((e) => e.excerpt) : [],
    }),
  );

  // Punktzahl: gewichteter Anteil erfüllter Punkte, 0 bis 100.
  const totalWeight = checks.reduce((n, c) => n + c.weight, 0);
  const score = Math.round((checks.reduce((n, c) => n + c.weight * c.pass, 0) / totalWeight) * 100);
  const groups: GroupScore[] = GROUPS.flatMap((g) => {
    const own = checks.filter((c) => c.group === g);
    if (own.length === 0) return [];
    const w = own.reduce((n, c) => n + c.weight, 0);
    return [{ group: g, title: groupTitle(g), score: Math.round((own.reduce((n, c) => n + c.weight * c.pass, 0) / w) * 100), weight: w }];
  });

  return {
    v: 1,
    betreff,
    absender,
    html,
    plain,
    score,
    words,
    sentences: tc.sentences,
    links,
    ctas: ctas.length,
    images,
    readability: tc.readability,
    checks,
    groups,
  };
}

// ---- Bericht ---------------------------------------------------------------------------------------

/** Stufe in Worten, wie im ScoreBadge. */
export const stufe = (score: number): string => scoreBand(score / 100).text;

export function findingsOf(report: NewsletterReport): Check[] {
  return report.checks.filter((c) => !c.ok);
}

export function toDocument(report: NewsletterReport): DocumentModel {
  const findings = findingsOf(report);
  const passed = report.checks.filter((c) => c.ok);
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betreff", value: report.betreff || "(keiner)" },
        { label: "Absender", value: report.absender || "(nicht angegeben)" },
        { label: "Format", value: report.html ? "HTML" : "reiner Text" },
        { label: "Wörter", value: String(report.words) },
        { label: "Linkziele", value: String(report.links) },
        { label: "Bilder", value: report.images === null ? "nur bei HTML prüfbar" : String(report.images) },
      ],
    },
    { type: "heading", level: 1, text: "Ergebnis" },
    {
      type: "paragraph",
      text: `${report.score} von 100 Punkten (${stufe(report.score)}). ${passed.length} von ${report.checks.length} Prüfpunkten erfüllt.`,
    },
    {
      type: "table",
      header: ["Bereich", "Punkte", "Gewicht"],
      widths: [3, 1.4, 1],
      rows: report.groups.map((g) => [g.title, `${g.score} von 100`, String(g.weight)]),
    },
    { type: "heading", level: 1, text: "Das fällt auf" },
  ];
  if (findings.length === 0) {
    blocks.push({ type: "paragraph", text: "Zu den geprüften Punkten ist nichts aufgefallen." });
  }
  for (const c of findings) {
    blocks.push({ type: "heading", level: 2, text: `${groupTitle(c.group)}: ${c.label}` });
    blocks.push({ type: "paragraph", text: `${c.detail} ${c.hint}`.trim() });
    if (c.examples.length > 0) blocks.push({ type: "list", items: c.examples });
  }
  if (passed.length > 0) {
    blocks.push({ type: "heading", level: 1, text: "Erfüllt" }, { type: "list", items: passed.map((c) => `${c.label}: ${c.detail}`) });
  }
  blocks.push(
    { type: "heading", level: 1, text: "Hinweise zur Prüfung" },
    {
      type: "list",
      items: [
        `Richtwerte von Alperna, keine Statistik: Betreff ${RICHTWERT.betreffMin} bis ${RICHTWERT.betreffMax} Zeichen, höchstens ${RICHTWERT.linksMax} Linkziele, höchstens ${RICHTWERT.ctaMax} Aufforderungen, ${RICHTWERT.wordsMin} bis ${RICHTWERT.wordsMax} Wörter, ein Bild je ${RICHTWERT.wordsPerImage} Wörter.`,
        "Geprüft wird der eingefügte Text. Abmeldelink und Adresse, die das Versandprogramm erst beim Versand einfügt, sieht der Check nicht.",
        "Form, Schweizer Schreibweise, Floskeln und Satzlänge prüft derselbe Regelsatz wie der Textcheck auf tools.alperna.ch.",
        report.readability
          ? `Lesbarkeit nach Amstad: ${report.readability.index} (${report.readability.level}); Quelle: Lesbarkeitsindex nach Toni Amstad, Universität Zürich 1978.`
          : `Lesbarkeitsindex erst ab ${MIN_WORDS_FOR_INDEX} Wörtern.`,
        "Ob der Newsletter rechtlich in Ordnung ist, prüft dieses Werkzeug nicht.",
      ],
    },
  );
  return {
    title: "Newsletter-Check",
    subtitle: report.betreff ? `Betreff: ${report.betreff}` : "Ohne Betreff",
    blocks,
    filename: "newsletter-check",
  };
}

/** Der Bericht als Text (Markdown), fürs Kopieren und fürs CRM. */
export function reportMarkdown(report: NewsletterReport): string {
  return toMarkdown(toDocument(report)).trimEnd();
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type NewsletterState = { v: 1; phase: "edit" | "result"; betreff: string; absender: string; text: string; modus: Modus };
export const EMPTY_STATE: NewsletterState = { v: 1, phase: "edit", betreff: "", absender: "", text: "", modus: "text" };

/** Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. */
export function parseNewsletterState(raw: unknown): NewsletterState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<NewsletterState>;
  if (r.v !== 1 || typeof r.text !== "string") return EMPTY_STATE;
  const text = r.text.slice(0, MAX_CHARS);
  // Ältere Stände kennen die Wahl noch nicht: HTML bleibt HTML, alles andere ist Text.
  const modus: Modus = r.modus === "html" || r.modus === "text" ? r.modus : isHtml(text) ? "html" : "text";
  return {
    v: 1,
    modus,
    phase: r.phase === "result" && inputProblem(text, modus) === null ? "result" : "edit",
    betreff: typeof r.betreff === "string" ? r.betreff.slice(0, 300) : "",
    absender: typeof r.absender === "string" ? r.absender.slice(0, 120) : "",
    text,
  };
}

// ---- Beispiel --------------------------------------------------------------------------------------

/** Fiktiver Newsletter der Malerei Keller, Gossau, mit absichtlichen Schwächen. */
export const SAMPLE: NewsletterInput = {
  betreff: "GRATIS Farbberatung nur heute und 20% Rabatt auf alle Fassadenarbeiten!!!",
  absender: "",
  text: `Liebe Kundinnen und Kunden

Der Herbst ist da und wir haben in der heutigen Zeit so viele Aufträge wie noch nie, deshalb möchten wir uns bei Ihnen bedanken und Ihnen ein Angebot machen, das Sie nicht verpassen sollten, denn es gilt nur bis Ende Oktober. NUR HEUTE erhalten Sie 20% Rabatt auf alle Fassadenarbeiten!!! Hier klicken: https://www.malerei-keller.ch/aktion

Neu im Angebot: Wir streichen auch Zäune, Gartenhäuser und Garagentore. Mehr erfahren: https://www.malerei-keller.ch/aussen
Unsere neuen Farbtrends für den Winter finden Sie hier: https://www.malerei-keller.ch/trends
Bewerten Sie uns auf Google: https://g.page/malerei-keller/review
Folgen Sie uns auf Instagram: https://www.instagram.com/malereikeller
Jetzt Termin buchen: https://www.malerei-keller.ch/termin

Wir freuen uns auf Ihre Anfrage.

Freundliche Grüsse
Peter Keller, Malerei Keller GmbH, Gossau`,
};
