import { describe, expect, it } from "vitest";
import { categoryJsonLd, homeJsonLd, serializeJsonLd, stripMarkdown, toolJsonLd } from "@/lib/jsonld";
import { fixtureTool } from "@/tests/fixtures";

describe("serializeJsonLd", () => {
  it("maskiert «<», damit kein </script> entstehen kann", () => {
    const s = serializeJsonLd({ text: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s).text).toContain("</script>");
  });
});

describe("toolJsonLd", () => {
  const faq = [{ question: "Was kostet es?", answer: "Nichts. **Wirklich** nichts, siehe [Hinweis](/ueber)." }];
  type Block = {
    "@type": string;
    offers?: unknown;
    url?: string;
    inLanguage?: string;
    mainEntity?: { name: string; acceptedAnswer: { text: string } }[];
    itemListElement?: { name: string }[];
  };
  const [app, faqPage, crumbs] = toolJsonLd(
    fixtureTool(),
    { h1: "ICP-Builder für Schweizer KMU", description: "Beschreibung" },
    faq,
  ) as unknown as Block[];

  it("beschreibt die Software als kostenlos in CHF", () => {
    expect(app["@type"]).toBe("SoftwareApplication");
    expect(app.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "CHF" });
    expect(app.url!).toMatch(/\/tools\/icp-builder$/);
    expect(app.inLanguage).toBe("de-CH");
  });
  it("gibt die FAQ als FAQPage ohne Markdown-Zeichen aus", () => {
    expect(faqPage["@type"]).toBe("FAQPage");
    expect(faqPage.mainEntity![0].name).toBe("Was kostet es?");
    expect(faqPage.mainEntity![0].acceptedAnswer.text).toBe("Nichts. Wirklich nichts, siehe Hinweis.");
  });
  it("baut die Brotkrumen Start, Kategorie, Tool", () => {
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement!.map((i) => i.name)).toEqual(["Start", "Strategie", "ICP-Builder"]);
  });
});

describe("stripMarkdown", () => {
  it("entfernt Hervorhebungen, Links und überzählige Leerzeichen", () => {
    expect(stripMarkdown("## Titel\n\n**fett** und `code`,  [Link](/x)")).toBe("Titel fett und code, Link");
  });
});

describe("homeJsonLd", () => {
  const faq = [{ question: "Was kostet es?", answer: "Nichts." }];
  const blocks = homeJsonLd(faq) as unknown as { "@type": string; address?: Record<string, string>; mainEntity?: unknown[] }[];
  it("enthält Organisation, Website und FAQPage", () => {
    expect(blocks.map((b) => b["@type"])).toEqual(["Organization", "WebSite", "FAQPage"]);
  });
  it("nennt Speicher AR als Sitz", () => {
    expect(blocks[0].address).toMatchObject({ addressLocality: "Speicher", addressRegion: "AR", addressCountry: "CH" });
  });
  it("gibt jede Frage aus", () => {
    expect(blocks[2].mainEntity).toHaveLength(1);
  });
});

describe("categoryJsonLd", () => {
  type Block = { "@type": string; url?: string; mainEntity?: { itemListElement: { position: number; name: string; url: string }[] } | unknown[]; itemListElement?: { name: string; item: string }[] };
  const blocks = categoryJsonLd(
    "strategie",
    { h1: "Marketingstrategie für Schweizer KMU", description: "Beschreibung" },
    [{ question: "Frage?", answer: "Antwort." }],
    [
      { slug: "a-tool", name: "A-Tool" },
      { slug: "b-tool", name: "B-Tool" },
    ],
  ) as unknown as Block[];
  it("listet die Werkzeuge der Reihe nach mit URL", () => {
    expect(blocks[0]["@type"]).toBe("CollectionPage");
    expect(blocks[0].url).toMatch(/\/strategie$/);
    const list = (blocks[0].mainEntity as { itemListElement: { position: number; name: string; url: string }[] }).itemListElement;
    expect(list.map((i) => [i.position, i.name])).toEqual([[1, "A-Tool"], [2, "B-Tool"]]);
    expect(list[1].url).toMatch(/\/tools\/b-tool$/);
  });
  it("baut FAQPage und Brotkrumen Start → Kategorie", () => {
    expect(blocks[1]["@type"]).toBe("FAQPage");
    expect(blocks[2].itemListElement!.map((i) => i.name)).toEqual(["Start", "Strategie"]);
  });
  it("kommt mit einer leeren Werkzeugliste zurecht", () => {
    const empty = categoryJsonLd("vereine", { h1: "x", description: "y" }, [], []) as unknown as Block[];
    expect((empty[0].mainEntity as { itemListElement: unknown[] }).itemListElement).toEqual([]);
  });
});
