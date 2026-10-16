import { describe, expect, it, vi } from "vitest";
import type { FetchResult, Fetcher } from "@/lib/check/net";
import { CheckError } from "@/lib/check/types";
import { MIN_READ_CHARS, READ_MAX_CHARS, cleanHtml, dropCookieText, readPage, visibleText } from "@/lib/read";

const HTML = `<html><head><title> Malerei Keller &amp; Co </title><meta name="description" content="Maler in Gossau"></head>
<body><script>var x = "geheim";</script><style>.a{}</style><h1>Wir <em>streichen</em> Fassaden</h1><p>Seit Jahren in Gossau.</p>
<h2>Angebot</h2><ul><li>Fassaden</li><li>Innenräume</li></ul><noscript>nein</noscript></body></html>`;

const page = (url: string, body = HTML, status = 200): FetchResult => ({ url: new URL(url), status, ok: status < 300, headers: {}, body, ms: 10 });

describe("readPage", () => {
  it("liefert Host, Titel, Beschreibung, Überschriften und den sichtbaren Text ohne Skripte", async () => {
    const fetcher: Fetcher = async (url) => page(url);
    const out = await readPage("www.malerei-keller.ch", fetcher);
    expect(out).toMatchObject({ url: "https://www.malerei-keller.ch/", host: "malerei-keller.ch", title: "Malerei Keller & Co", description: "Maler in Gossau", truncated: false });
    expect(out.headings).toEqual(["Wir streichen Fassaden", "Angebot"]);
    expect(out.text).toContain("Seit Jahren in Gossau.");
    expect(out.text).toContain("Fassaden Innenräume");
    expect(out.text).not.toContain("geheim");
    expect(out.text).not.toContain("nein");
  });

  it("kürzt langen Text auf die Obergrenze und sagt es", async () => {
    const long = `<html><body><p>${"wort ".repeat(5000)}</p></body></html>`;
    const out = await readPage("keller.ch", async (url) => page(url, long));
    expect(out.text.length).toBe(READ_MAX_CHARS);
    expect(out.truncated).toBe(true);
  });

  it("versucht nach https noch http und meldet sonst «nicht erreichbar»", async () => {
    const tried: string[] = [];
    const fetcher: Fetcher = async (url) => {
      tried.push(url);
      if (url.startsWith("https://")) throw new Error("tls");
      return page(url);
    };
    expect((await readPage("alt.ch", fetcher)).url).toBe("http://alt.ch/");
    expect(tried).toEqual(["https://alt.ch/", "http://alt.ch/"]);
    await expect(readPage("alt.ch", vi.fn().mockRejectedValue(new Error("down")) as unknown as Fetcher)).rejects.toMatchObject({ code: "unreachable" });
    await expect(readPage("alt.ch", async (url) => page(url, "", 500))).rejects.toMatchObject({ code: "unreachable" });
  });

  it("gibt gesperrte und ungültige Adressen als CheckError weiter", async () => {
    await expect(readPage("http://127.0.0.1", async () => page("http://127.0.0.1"))).rejects.toMatchObject({ code: "invalid" });
    await expect(readPage("ftp://keller.ch")).rejects.toMatchObject({ code: "invalid" });
    const blocked: Fetcher = async () => {
      throw new CheckError("Interne Adressen sind nicht erlaubt.", "blocked");
    };
    await expect(readPage("intern.example", blocked)).rejects.toMatchObject({ code: "blocked" });
  });
});

// ---- Navigation, Cookie-Hinweis und Auszeichnungen im Text -------------------------------------------------------------

const COOKIE = `<div id="cookie-banner" class="cc"><h2>Cookie-Einstellungen</h2><p>Wir verwenden Cookies, um Ihnen die bestmögliche Nutzung unserer Website zu ermöglichen. Einige Cookies sind notwendig, andere helfen uns, die Website zu verbessern. Mit Klick auf Alle akzeptieren stimmen Sie der Verwendung zu.</p><div class="buttons"><button>Alle akzeptieren</button><button>Nur notwendige</button><button>Einstellungen</button></div></div>`;
const NAV = `<nav><ul><li><a href="/">Start</a></li><li><a href="/leistungen">Leistungen</a></li><li><a href="/team">Team</a></li><li><a href="/kontakt">Kontakt</a></li></ul></nav>`;
const INHALT = "Die Malerei Keller ist ein Familienbetrieb in Gossau SG. Wir streichen Fassaden, Treppenhäuser und Wohnungen im Fürstenland und im Appenzellerland. Wir messen vor dem ersten Strich die Feuchte im Putz.";
const seite = (body: string, head = "<title>Malerei Keller Gossau</title><meta name=\"description\" content=\"Maler in Gossau\">") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const lese = (html: string) => readPage("keller.ch", async (url) => page(url, html));

describe("readPage: Navigation und Cookie-Hinweis gehören nicht zum Text", () => {
  it("lässt den Cookie-Hinweis, die Navigation, den Kopf und Kommentare weg und behält den Inhalt samt Fusszeile", async () => {
    const html = seite(`<!-- <div class="cookie">Kommentar</div> -->${COOKIE}${NAV}<main><h1>Malerei Keller in Gossau</h1><p>${INHALT}</p></main><footer><p>Malerei Keller, Feldstrasse 12, 9200 Gossau, Telefon 071 123 45 67</p></footer>`);
    const out = await lese(html);
    expect(out.text).toContain("Familienbetrieb in Gossau SG");
    expect(out.text).toContain("Feldstrasse 12, 9200 Gossau");
    for (const weg of ["Cookie", "akzeptieren", "notwendige", "Leistungen Team Kontakt", "Kommentar", "description", "Malerei Keller Gossau Malerei"]) expect(out.text, weg).not.toContain(weg);
    // Titel und Beschreibung bleiben eigene Felder, stehen aber nicht noch einmal im Text
    expect(out.title).toBe("Malerei Keller Gossau");
    expect(out.description).toBe("Maler in Gossau");
    expect(out.text.startsWith("Malerei Keller in Gossau")).toBe(true);
    expect(out.headings).toEqual(["Malerei Keller in Gossau"]);
  });

  it("zählt bei einer Seite, die ihren Inhalt erst im Browser lädt, den Hinweis nicht als Text (die Route meldet «zu wenig Text»)", async () => {
    const out = await lese(seite(`${COOKIE}${NAV}<div id="root"></div><noscript>Bitte aktivieren Sie JavaScript.</noscript>`));
    expect(out.text.length).toBeLessThan(MIN_READ_CHARS);
    expect(out.text).toBe("");
    expect(out.headings).toEqual([]); // auch die Überschrift des Hinweises nicht
  });

  it("erkennt den Hinweis an role, aria-modal, dialog und gängigen Kennungen und liest geschachtelte Bereiche bis zum richtigen Schluss", () => {
    for (const hinweis of [
      `<div role="dialog" aria-label="Datenschutz"><div><div>Hinweis zum Datenschutz mit Auswahl</div></div></div>`,
      `<section aria-modal="true"><p>Hinweis zum Datenschutz mit Auswahl</p></section>`,
      `<dialog open><p>Hinweis zum Datenschutz mit Auswahl</p></dialog>`,
      `<div class="cmplz-cookiebanner"><div><div>Hinweis zum Datenschutz mit Auswahl</div></div></div>`,
      `<aside id="usercentrics-root"><p>Hinweis zum Datenschutz mit Auswahl</p></aside>`,
      `<div class='site CookieNotice'><div>Hinweis zum Datenschutz mit Auswahl</div></div>`,
      `<div role="navigation"><a>Start</a><a>Leistungen</a><a>Hinweis zum Datenschutz mit Auswahl</a></div>`,
    ]) {
      const text = visibleText(seite(`${hinweis}<p>${INHALT}</p>`));
      expect(text, hinweis).toBe(INHALT);
    }
  });

  it("lässt eine Hülle der ganzen Seite stehen, auch wenn ihre Kennung nach Cookie klingt (Hauptüberschrift, kein Schluss, zu gross)", () => {
    const huelle = visibleText(seite(`<div id="page" class="cookie-banner-open"><h1>Malerei Keller</h1><p>${INHALT}</p></div>`));
    expect(huelle).toContain("Familienbetrieb in Gossau SG");
    const offen = visibleText(seite(`<div class="cookie-banner"><p>${INHALT}</p>`));
    expect(offen).toContain("Familienbetrieb in Gossau SG");
    const gross = visibleText(seite(`<div class="cookie-banner"><p>${INHALT}</p>${"<span>x</span>".repeat(10_000)}</div>`));
    expect(gross).toContain("Familienbetrieb in Gossau SG");
    expect(visibleText(seite(`<nav><p>${INHALT}</p></nav>`))).toBe("");
  });

  it("lässt eine Rezeptseite mit «Cookies» stehen, solange sie nichts mit Einwilligung sagt, und entfernt Cookie-Sätze ohne erkennbare Kennung", () => {
    expect(dropCookieText("Unsere Cookies sind knusprig. Dazu gibt es Kaffee.")).toBe("Unsere Cookies sind knusprig. Dazu gibt es Kaffee.");
    expect(dropCookieText("Malerei Keller in Gossau. Diese Website verwendet Cookies, damit wir Ihr Erlebnis verbessern. Wir streichen Fassaden. Alle akzeptieren Nur notwendige Einstellungen speichern")).toBe(
      "Malerei Keller in Gossau. Wir streichen Fassaden.",
    );
    expect(dropCookieText("Wir nutzen Cookies nur für die Statistik, wenn Sie zustimmen. Kaffee gibt es auch.")).toBe("Kaffee gibt es auch.");
  });

  it("setzt Auszeichnungen im Wort, in Zahlen und vor Satzzeichen ohne Leerzeichen zusammen und trennt Zellen und Links", () => {
    const text = (body: string) => visibleText(seite(body));
    expect(text("<p>Mal<span>erei</span> <b>Keller</b></p>")).toBe("Malerei Keller");
    expect(text("<p>am <b>14</b>.11.2026 ab <b>18</b>.00 Uhr, Preis <em>CHF 1'200</em>.-</p>")).toBe("am 14.11.2026 ab 18.00 Uhr, Preis CHF 1'200.-");
    expect(text("<p>Telefon <span>071</span> <span>123 45 67</span>, (<b>Bild</b>)</p>")).toBe("Telefon 071 123 45 67, (Bild)");
    expect(text("<p><span>W</span><span>i</span><span>r</span> streichen</p>")).toBe("Wir streichen");
    expect(text("<p>Haus<b>keller</b> und Fass<i>aden</i></p>")).toBe("Hauskeller und Fassaden");
    // Zellen und Links: getrennt
    expect(text("<p><span>Montag</span><span>08:00</span> <span>Dienstag</span><span>Mittwoch</span></p>")).toBe("Montag 08:00 Dienstag Mittwoch");
    expect(text("<p><a href='/a'>Start</a><a href='/b'>Leistungen</a></p>")).toBe("Start Leistungen");
    expect(text("<ul><li>Fassaden</li><li>Innenräume</li></ul><p>eins<br>zwei</p>")).toBe("Fassaden Innenräume eins zwei");
    // Skripte, Stile und Zierde bleiben draussen
    expect(text("<p>Text</p><script>var a = '<div class=\"cookie\">';</script><style>.a{}</style><svg><title>Logo</title></svg><select><option>Schweiz</option></select><p>Ende</p>")).toBe("Text Ende");
  });

  it("bleibt auch bei Seiten voller Fallen schnell und lässt den Text bei unklaren Tags stehen", () => {
    const LIMIT_MS = 1500;
    const timed = (fn: () => unknown) => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    };
    const attacks: [string, string][] = [
      ["offene Cookie-Hinweise", '<div class="cookie">text '.repeat(40_000)],
      ["offene nav", "<nav>".repeat(180_000)],
      ["offene span", "a<span>".repeat(150_000)],
      ["offene title", "<title>".repeat(120_000)],
      ["offene head", "<head>x".repeat(120_000)],
      ["offene Kommentare", "<!-- ".repeat(200_000)],
      ["offene Tags", "<div ".repeat(200_000)],
      ["lauter <", "<".repeat(1_000_000)],
      ["Cookie-Wörter", "cookie ".repeat(140_000)],
      ["Cookie-Sätze", "Wir verwenden Cookies. ".repeat(40_000)],
      ["Skripte ohne Ende", "<script>".repeat(120_000)],
    ];
    for (const [name, html] of attacks) {
      const body = html.slice(0, 1_000_000);
      expect(timed(() => cleanHtml(body)), `cleanHtml: ${name}`).toBeLessThan(LIMIT_MS);
      expect(timed(() => visibleText(body)), `visibleText: ${name}`).toBeLessThan(LIMIT_MS);
    }
  });
});
