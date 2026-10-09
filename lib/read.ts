import { normalizeUrl } from "@/lib/check/analyze";
import { MAX_ANALYZED_HTML, blocks, decode, metaContent, textOf } from "@/lib/check/html";
import { safeFetch, type FetchResult, type Fetcher } from "@/lib/check/net";
import { CheckError } from "@/lib/check/types";

// Liest den sichtbaren Text einer Website-Startseite für Werkzeuge, die daraus etwas machen (Ideen, Positionierung,
// Tonalität). Derselbe geschützte Abruf wie der Marketing-Check (lib/check/net.ts): keine internen Adressen, Grössen-
// und Zeitgrenzen. Es wird nur die eine Seite gelesen, nichts gespeichert.

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
  text: string;
  /** true, wenn der Text auf READ_MAX_CHARS gekürzt wurde. */
  truncated: boolean;
};

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

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
  const headings = [...blocks(html, "h1"), ...blocks(html, "h2")]
    .map((b) => collapse(decode(b.inner.replace(/<[^<>]+>/g, " "))))
    .filter(Boolean)
    .slice(0, MAX_HEADINGS);
  const full = collapse(textOf(html));
  return {
    url: page.url.toString(),
    host: page.url.hostname.replace(/^www\./, ""),
    title: collapse(decode(blocks(html, "title")[0]?.inner ?? "")).slice(0, 200),
    description: collapse(metaContent(html, "description") ?? "").slice(0, 400),
    headings,
    text: full.slice(0, READ_MAX_CHARS),
    truncated: full.length > READ_MAX_CHARS,
  };
}
