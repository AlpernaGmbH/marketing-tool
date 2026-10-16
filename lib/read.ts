import { normalizeUrl } from "@/lib/check/analyze";
import { MAX_ANALYZED_HTML, blocks, decode, metaContent, textOf } from "@/lib/check/html";
import { safeFetch, type FetchResult, type Fetcher } from "@/lib/check/net";
import { CheckError } from "@/lib/check/types";

// Liest den sichtbaren Text einer Website-Startseite für Werkzeuge, die daraus etwas machen (Ideen, Positionierung,
// Tonalität). Derselbe geschützte Abruf wie der Marketing-Check (lib/check/net.ts): keine internen Adressen, Grössen-
// und Zeitgrenzen. Es wird nur die eine Seite gelesen, nichts gespeichert. Navigation, Cookie-Hinweise, Kopf und Zierde
// zählen nicht zum Text (cleanHtml, dropCookieText): Sonst läse die KI «Wir verwenden Cookies» als Inhalt der Seite, und eine
// Seite, die ihren Inhalt erst im Browser lädt, sähe wegen des Hinweises nach genug Text aus.

/** Mehr Text braucht kein Generator; hält den Prompt und die Kosten klein. */
export const READ_MAX_CHARS = 8_000;
const MAX_HEADINGS = 20;
/**
 * Weniger lesbarer Text als das ist keine Grundlage für einen Entwurf: Die Seite lädt ihren Inhalt erst per JavaScript oder
 * versteckt ihn hinter einer Cookie-Wand. Die KI würde sonst aus Titel und Beschreibung Scheinwerte schreiben.
 */
export const MIN_READ_CHARS = 150;

export type PageRead = {
  url: string;
  /** Host ohne «www.». */
  host: string;
  title: string;
  description: string;
  headings: string[];
  /** Sichtbarer Text ohne Navigation, Cookie-Hinweis und Kopf (der Titel steht in `title`); Auszeichnungen im Wort sind zusammengesetzt. */
  text: string;
  /** true, wenn der Text auf READ_MAX_CHARS gekürzt wurde. */
  truncated: boolean;
  /** Das Ende des Seitentexts, wenn er gekürzt wurde (Fusszeile mit Adresse und Telefon); sonst leer. */
  tail?: string;
};

/** So viel vom Ende des Seitentexts bleibt erhalten, wenn der Text gekürzt wird. */
export const READ_TAIL_CHARS = 1_200;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

// ---- Sichtbarer Text ohne Navigation, Cookie-Hinweis und Zierde ----------------------------------------------------------
//
// Die Seite stammt von Fremden: Alles hier läuft in einem Durchgang über die Tags (linear, Tags höchstens TAG_MAX Zeichen), und
// jede Suche nach einem Schluss-Tag beginnt hinter dem letzten Fund. Der Abschnitt wird nie quadratisch (lib/check/redos.test.ts).

/** Tags, deren Inhalt nie zum Text der Seite gehört (Skripte, Stile, Kopf, Zierde, Auswahllisten). Ohne Schluss-Tag bleibt der Inhalt stehen, ausser bei Skripten und Stilen. */
const RAW_BLOCKS = new Set(["script", "style", "noscript", "head", "title", "svg", "template", "select", "iframe", "object", "canvas", "picture"]);
/** Bei diesen Tags nimmt ein fehlendes Schluss-Tag den Rest der Seite mit (wie im Browser und in textOf). */
const RAW_TO_END = new Set(["script", "style", "noscript"]);
/** Auszeichnungen innerhalb eines Wortes oder einer Zahl («Mal<span>erei</span>», «<b>14</b>.11.2026»): ohne Leerzeichen. */
const INLINE = new Set(["b", "strong", "i", "em", "u", "s", "small", "mark", "sub", "sup", "abbr", "cite", "code", "font", "span", "bdi", "bdo", "data", "time", "q", "ins", "del", "big", "tt", "kbd", "var", "samp", "dfn"]);
/** Tags, bei denen eine Kennung wie «cookie-banner» den ganzen Bereich zum Hinweis macht. */
const BEREICHE = new Set(["div", "section", "aside", "form"]);
/** Kennungen von Cookie-Hinweisen und Einwilligungsfenstern, in id, class oder aria-label. */
const BANNER_RE =
  /cookie|consent|gdpr|dsgvo|cmplz|borlabs|usercentrics|onetrust|cookiebot|klaro|iubenda|termly|didomi|trustarc|osano|qc-cmp|(?:^|[\s_-])(?:cky|rcb)(?:[\s_-]|$)|privacy-?(?:banner|notice|bar|popup)|datenschutz-?(?:banner|hinweis)/i;
const ATTR_RE = /(?<![\w-])(id|class|role|aria-label|aria-modal)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/gi;
/** Ein Bereich (Navigation, Hinweis), der nicht nach spätestens so vielen Zeichen schliesst, gilt als Hülle der ganzen Seite und bleibt. */
const BEREICH_MAX = 60_000;
/** So viele Bereiche entfernt eine Seite höchstens; bei weiteren bleibt der Text stehen (schützt vor Seiten mit Tausenden Treffern). */
const BEREICHE_MAX = 40;

function isNoise(name: string, attrs: string): boolean {
  if (name === "nav" || name === "dialog") return true;
  if (!BEREICHE.has(name)) return false;
  for (const m of attrs.matchAll(ATTR_RE)) {
    const key = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (key === "role" && /^(?:dialog|alertdialog|navigation)$/i.test(value)) return true;
    if (key === "aria-modal" && value.toLowerCase() === "true") return true;
    if ((key === "id" || key === "class" || key === "aria-label") && BANNER_RE.test(value)) return true;
  }
  return false;
}

/** Soll zwischen dem Text davor und danach ein Auszeichnungs-Tag ohne Leerzeichen verschwinden? Ja mitten im Wort, vor Satzzeichen und in Zahlen. */
function glue(prev: string, next: string): boolean {
  if (!prev || /\s/.test(prev) || !next || /\s/.test(next)) return true; // Leerraum ist schon da, oder es gibt nichts zu trennen
  if (next === "<") return true; // entscheidet das nächste Tag
  if (/[.,;:!?)%\]»'’/-]/.test(next)) return true; // «<b>14</b>.11.»
  if (/[(\[«„"'‹]/.test(prev)) return true; // «(<b>Bild</b>)»
  if (/[\p{L}\p{N}]/u.test(prev) && /\p{Ll}/u.test(next)) return true; // «Mal<span>erei»
  return /\p{N}/u.test(prev) && /\p{N}/u.test(next);
}

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]{0,30})([^<>]{0,1500})>/g;

/** Ende eines Bereichs, der bei `from` beginnt (hinter dem öffnenden Tag): Position hinter dem Schluss-Tag, oder -1 (nicht geschlossen, zu gross oder mit einer Überschrift der Seite). */
function bereichEnde(html: string, from: number, name: string): number {
  const re = new RegExp(TAG_RE.source, "g");
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index - from > BEREICH_MAX) return -1;
    const tag = m[2].toLowerCase();
    if (m[1] === "" && RAW_TO_END.has(tag)) {
      // Skripte im Hinweis dürfen Tags als Text enthalten: bis zum Schluss überspringen
      const close = new RegExp(`</${tag}\\s*>`, "gi");
      close.lastIndex = re.lastIndex;
      const c = close.exec(html);
      if (!c) return -1;
      re.lastIndex = c.index + c[0].length;
      continue;
    }
    if (m[1] === "" && tag === "h1") return -1; // Der Hinweis hat keine Hauptüberschrift; eine Hülle der Seite hat sie.
    if (tag !== name) continue;
    if (m[1] === "") depth++;
    else if (--depth === 0) return re.lastIndex;
  }
  return -1;
}

/** Entfernt Kommentare (auch bedingte); ein nicht geschlossener nimmt den Rest mit, wie im Browser. Linear. */
function stripComments(html: string): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const start = html.indexOf("<!--", pos);
    if (start < 0) return out + html.slice(pos);
    out += `${html.slice(pos, start)} `;
    const end = html.indexOf("-->", start + 4);
    if (end < 0) return out;
    pos = end + 3;
  }
}

/**
 * Das HTML ohne Kopf, Skripte, Zierde, Navigation und Cookie-Hinweise. Auszeichnungen im Wort («Mal<span>erei</span>», «<b>14</b>.11.2026»)
 * verlieren ihr Tag ohne Leerzeichen, alle anderen Tags bleiben für textOf, das sie als Leerzeichen liest.
 */
export function cleanHtml(raw: string): string {
  const html = stripComments(raw);
  const out: string[] = [];
  let last = " ";
  let pos = 0;
  let bereiche = 0;
  const kein = new Set<string>(); // Tags, deren Schluss-Tag nicht mehr kommt: nicht noch einmal suchen
  const push = (s: string) => {
    if (!s) return;
    out.push(s);
    last = s.charAt(s.length - 1);
  };
  const re = new RegExp(TAG_RE.source, "g");
  for (let m = re.exec(html); m; m = re.exec(html)) {
    push(html.slice(pos, m.index));
    pos = re.lastIndex;
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    if (!closing && RAW_BLOCKS.has(name) && !kein.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, "gi");
      close.lastIndex = pos;
      const c = close.exec(html);
      if (c) {
        pos = c.index + c[0].length;
        re.lastIndex = pos;
        push(" ");
        continue;
      }
      kein.add(name);
      if (RAW_TO_END.has(name)) {
        pos = html.length;
        break;
      }
    }
    if (!closing && bereiche < BEREICHE_MAX && isNoise(name, m[3])) {
      const end = bereichEnde(html, pos, name);
      bereiche++;
      if (end >= 0) {
        pos = end;
        re.lastIndex = end;
        push(" ");
        continue;
      }
    }
    if (INLINE.has(name)) {
      if (!glue(last, html.charAt(pos))) push(" ");
      continue;
    }
    push(m[0]);
    last = " "; // textOf liest jedes weitere Tag als Leerzeichen
  }
  push(html.slice(pos));
  return out.join("");
}

/**
 * Sätze und Beschriftungen von Cookie-Hinweisen, die als einfacher Text auf der Seite stehen (ohne erkennbare Kennung). Ein Satz, der
 * «Cookies» und ein Verb der Einwilligung nennt, gilt als Hinweis; die Knöpfe («Alle akzeptieren») fallen einzeln weg. Zwei einfache
 * Muster statt eines mit Abstand dazwischen: Auf böswilligem Text bleibt die Prüfung linear. Längere Sätze sind kein Hinweis.
 */
const COOKIE_WORT = /cookie/i;
const COOKIE_VERB = /verwend|nutz|einsetz|setz|speicher|akzeptier|zustimm|einwillig|ablehn|erlaub/i;
const COOKIE_KNOEPFE = /\b(?:alle (?:cookies )?akzeptieren|alle ablehnen|nur (?:notwendige|erforderliche|essenzielle|essentielle)(?: cookies)?|cookie-?einstellungen|datenschutzeinstellungen|einstellungen (?:speichern|anpassen|verwalten)|auswahl speichern)\b/gi;
const COOKIE_SATZ_MAX = 1_000;

export function dropCookieText(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > COOKIE_SATZ_MAX || !(COOKIE_WORT.test(s) && COOKIE_VERB.test(s)));
  return collapse(sentences.join(" ").replace(COOKIE_KNOEPFE, " "));
}

/** Der sichtbare Text einer Seite: ohne Kopf, Skripte, Navigation und Cookie-Hinweise; Leerraum zusammengezogen. */
export function visibleText(html: string): string {
  return dropCookieText(collapse(textOf(cleanHtml(html))));
}

async function loadPage(website: string, fetcher: Fetcher): Promise<FetchResult> {
  let page: FetchResult | undefined;
  try {
    page = await fetcher(website);
  } catch (e) {
    if (e instanceof CheckError && e.code === "blocked") throw e;
    // https fehlgeschlagen: noch einmal mit http versuchen (alte Websites ohne Zertifikat).
    if (website.startsWith("https://")) {
      try {
        page = await fetcher(website.replace("https://", "http://"));
      } catch {
        /* unten */
      }
    }
    if (!page) throw new CheckError("Die Website konnte nicht geladen werden. Stimmt die Adresse?", "unreachable");
  }
  if (!page.ok) throw new CheckError(`Die Website antwortet mit Fehler ${page.status}.`, "unreachable");
  return page;
}

/** Liest Titel, Beschreibung, Überschriften und Text der Startseite. Wirft CheckError (invalid, blocked, unreachable). */
export async function readPage(rawUrl: string, fetcher: Fetcher = safeFetch): Promise<PageRead> {
  const website = normalizeUrl(rawUrl);
  const page = await loadPage(website, fetcher);
  const html = page.body.slice(0, MAX_ANALYZED_HTML);
  // Titel und Beschreibung stehen im Kopf; Überschriften und Text kommen aus dem gereinigten HTML (ohne Navigation und Cookie-Hinweis).
  const clean = cleanHtml(html);
  const headings = [...blocks(clean, "h1"), ...blocks(clean, "h2")]
    .map((b) => collapse(decode(b.inner.replace(/<[^<>]+>/g, " "))))
    .filter(Boolean)
    .slice(0, MAX_HEADINGS);
  const full = dropCookieText(collapse(textOf(clean)));
  return {
    url: page.url.toString(),
    host: page.url.hostname.replace(/^www\./, ""),
    title: collapse(decode(blocks(html, "title")[0]?.inner ?? "")).slice(0, 200),
    description: collapse(metaContent(html, "description") ?? "").slice(0, 400),
    headings,
    text: full.slice(0, READ_MAX_CHARS),
    truncated: full.length > READ_MAX_CHARS,
    tail: full.length > READ_MAX_CHARS ? full.slice(-READ_TAIL_CHARS) : "",
  };
}
