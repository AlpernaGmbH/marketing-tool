import { describe, expect, it } from "vitest";
import { MAX_ANALYZED_HTML, blocks, decode, metaContent, textOf } from "@/lib/check/html";
import { detectAll, detectTracking, findSocialLinks } from "@/lib/check/detect";
import { checkSeo } from "@/lib/check/seo";

// Böswilliges HTML darf den Server nicht festhalten. Vor der Korrektur brauchten diese Eingaben mit 160 KB Sekunden
// und mit 2,5 MB Minuten bis Stunden (quadratisch). Die Grenzen hier sind grosszügig, damit der Test auf langsamen
// Rechnern nicht wackelt: linear heisst Millisekunden.
const LIMIT_MS = 1500;
const BIG = "x".repeat(0);

function timed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}
const seo = (body: string) => checkSeo({ url: new URL("https://a.ch/"), body, headers: {}, ms: 100 }, { robots: true, sitemap: true });

describe("HTML-Analyse auf böswilligen Seiten", () => {
  const attacks: [string, string][] = [
    ["offene <script", "<script ".repeat(125_000)],
    ["offene <style", "<style ".repeat(125_000)],
    ["offene <meta", "<meta ".repeat(160_000)],
    ["offene <img", "<img ".repeat(200_000)],
    ["offene <title", "<title>".repeat(120_000)],
    ["offene <h1", "<h1>".repeat(250_000)],
    ["offene <input", "<input ".repeat(125_000)],
    ["offene <link", "<link ".repeat(160_000)],
    ["offene <html", "<html ".repeat(160_000)],
    ["lauter <", "<".repeat(1_000_000)],
    ["jimdo", "jimdo".repeat(200_000)],
    ["squarespace", "static.squarespace.com/".repeat(40_000)],
    ["JSON-LD-Skripte ohne Ende", '<script type="application/ld+json">'.repeat(30_000)],
  ];

  for (const [name, html] of attacks) {
    it(`bleibt bei ${name} schnell (${Math.round(html.length / 1000)} KB)`, () => {
      const body = html.slice(0, MAX_ANALYZED_HTML);
      expect(timed(() => textOf(body))).toBeLessThan(LIMIT_MS);
      expect(timed(() => metaContent(body, "description"))).toBeLessThan(LIMIT_MS);
      expect(timed(() => seo(body))).toBeLessThan(LIMIT_MS);
      expect(timed(() => detectAll(body))).toBeLessThan(LIMIT_MS);
      expect(timed(() => findSocialLinks(body))).toBeLessThan(LIMIT_MS);
    });
  }
  void BIG;
});

describe("blocks", () => {
  it("liest mehrere Blöcke, auch geschachtelte Attribute und Gross-/Kleinschreibung", () => {
    const out = blocks('<TITLE lang="de">Eins</TITLE> text <title>Zwei</title>', "title");
    expect(out.map((b) => b.inner)).toEqual(["Eins", "Zwei"]);
  });

  it("lässt einen nicht geschlossenen Block bis zum Ende reichen und liest danach nichts mehr", () => {
    expect(blocks("<h1>Titel<h1>Noch einer", "h1").map((b) => b.inner)).toEqual(["Titel<h1>Noch einer"]);
  });

  it("verwechselt kein anderes Tag mit demselben Anfang", () => {
    expect(blocks("<titlefoo>x</titlefoo>", "title")).toEqual([]);
    expect(blocks("<h10>x</h10>", "h1")).toEqual([]);
  });
});

describe("textOf", () => {
  it("entfernt Skripte, Stile und Tags und lässt den Text stehen", () => {
    expect(textOf("<p>Hallo <b>Welt</b></p><script>var a='<p>nein</p>';</script><style>p{}</style><noscript>aus</noscript> Ende")).toBe("Hallo Welt Ende");
  });

  it("schneidet bei einem offenen Skript den Rest ab, wie der Browser", () => {
    expect(textOf("Text <script>alert(1) mehr Text")).toBe("Text");
  });
});

describe("decode", () => {
  it("entfernt Steuerzeichen, die in XML (DOCX) verboten sind, und halbe Zeichenpaare", () => {
    expect(decode("a&#8;b\u0001c&#xD800;d￿e")).toBe("abc&#xD800;de");
  });
});

describe("Erkennung ohne Fehlalarme", () => {
  it("hält Grossbuchstaben-Wörter nicht für Google Analytics oder Ads", () => {
    const t = detectTracking("<h2>TRAINING-CENTER und MARKETING-AGENTUR, SAW-1234567</h2>");
    expect(t.ga4).toBe(false);
    expect(t.gads).toBe(false);
  });

  it("erkennt echte Kennungen", () => {
    const t = detectTracking(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123DEF4"></script><script>gtag('config','AW-1234567890')</script>GTM-ABCD123`);
    expect(t).toMatchObject({ ga4: true, gads: true, gtm: true });
  });

  it("verankert Profile am Anfang der Adresse und lässt Beitragslinks weg", () => {
    const found = findSocialLinks(
      `<a href="https://evil.example/r?u=https://www.facebook.com/seite">x</a><a href="https://www.instagram.com/p/ABC123/">x</a><a href="https://www.instagram.com/dialogtreuhand">x</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">x</a>`,
    );
    expect(found).toEqual({ instagram: "https://www.instagram.com/dialogtreuhand" });
  });

  it("liest Schema.org auch als Liste von Typen", () => {
    const page = (ld: string) => `<html lang="de"><script type="application/ld+json">${ld}</script>`;
    const detail = (ld: string) => seo(page(ld)).items.find((i) => i.id === "seo.schema")!;
    expect(detail('{"@type":["Store","LocalBusiness"],"name":"x"}').ok).toBe(true);
    expect(detail('{"@type":"LocalBusiness","name":"x"}').ok).toBe(true);
    expect(detail('{"@type":"Article"}').ok).toBe(false);
  });
});
