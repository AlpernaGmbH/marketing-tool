import { describe, expect, it } from "vitest";
import { serializeJsonLd, toolJsonLd } from "@/lib/jsonld";
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
