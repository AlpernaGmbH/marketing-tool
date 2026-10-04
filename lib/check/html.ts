// Kleine HTML-Helfer ohne Abhängigkeiten (Regex genügt für die Prüfungen des Checks).
//
// Die Seite stammt von Fremden. Jedes Muster hier muss auch auf böswilligem HTML in linearer Zeit laufen:
// keine unbegrenzten `[^>]*` oder lazy `[\s\S]*?` über viele offene Tags (das wird quadratisch und hält den
// Server minutenlang fest). Tags sind deshalb auf höchstens TAG_MAX Zeichen begrenzt, Blöcke werden per
// Suche nach dem Schluss-Tag ab der Fundstelle gelesen, und die Analyse sieht höchstens MAX_ANALYZED_HTML Zeichen.

/** So viel HTML liest die Analyse. Echte Seiten liegen weit darunter. */
export const MAX_ANALYZED_HTML = 1_000_000;
/** Längster zulässiger Tag (mit allen Attributen). */
export const TAG_MAX = 1500;

// Zeichen, die in XML 1.0 und damit in DOCX verboten sind.
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const NAMED: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

export function decode(s = ""): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    })
    .replace(XML_FORBIDDEN, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? "") : null;
}

/**
 * Alle öffnenden Tags `<name ...>` (je höchstens TAG_MAX Zeichen). Das nächste `>` wird einmal gesucht und für alle
 * Fundstellen davor wiederverwendet; ein Tag, das nie schliesst, beendet die Suche. Daher linear, auch bei
 * Hunderttausenden offenen Tags.
 */
export function tagsOf(html: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b`, "gi");
  const out: string[] = [];
  let gt = -1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (gt < m.index) {
      gt = html.indexOf(">", m.index);
      if (gt < 0) break;
    }
    const end = gt + 1;
    if (end - m.index > TAG_MAX) continue;
    out.push(html.slice(m.index, end));
    re.lastIndex = end; // was zwischen < und > steht, gehört zu diesem Tag
  }
  return out;
}

export function metaContent(html: string, key: string): string | null {
  for (const tag of tagsOf(html, "meta")) {
    const n = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (n === key) return attr(tag, "content");
  }
  return null;
}

/**
 * Alle Blöcke `<tag ...>innen</tag>` in einem Durchlauf. Ein nicht geschlossener Block reicht bis zum Ende,
 * wie im Browser. Jede Suche beginnt hinter dem letzten Fund, daher ist der Aufwand linear.
 */
export function blocks(html: string, tag: string): { open: string; inner: string }[] {
  const open = new RegExp(`<${tag}\\b[^<>]{0,${TAG_MAX}}>`, "gi");
  const close = new RegExp(`</${tag}\\s*>`, "gi");
  const out: { open: string; inner: string }[] = [];
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(html);
    if (!o) break;
    const start = o.index + o[0].length;
    close.lastIndex = start;
    const c = close.exec(html);
    out.push({ open: o[0], inner: html.slice(start, c ? c.index : html.length) });
    if (!c) break;
    pos = c.index + c[0].length;
  }
  return out;
}

/** Entfernt ganze Blöcke (zum Beispiel script) samt Inhalt; ein offener Block nimmt den Rest mit. Linear. */
function stripBlocks(html: string, tag: string): string {
  const open = new RegExp(`<${tag}\\b`, "gi");
  const close = new RegExp(`</${tag}\\s*>`, "gi");
  let out = "";
  let pos = 0;
  for (;;) {
    open.lastIndex = pos;
    const o = open.exec(html);
    if (!o) return out + html.slice(pos);
    out += html.slice(pos, o.index) + " ";
    close.lastIndex = o.index + o[0].length;
    const c = close.exec(html);
    if (!c) return out;
    pos = c.index + c[0].length;
  }
}

/** Sichtbarer Text ohne Skripte, Stile und Tags. */
export function textOf(html: string): string {
  return decode(stripBlocks(stripBlocks(stripBlocks(html, "script"), "style"), "noscript").replace(/<[^<>]+>/g, " "));
}
