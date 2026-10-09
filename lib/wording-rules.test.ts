import { describe, expect, it } from "vitest";
import { checkContentWord, checkNavigation, checkSlugs, checkVereinWording } from "@/lib/wording-rules";
import { CATEGORY_LABELS, CATEGORY_TAGLINES } from "@/lib/define-tool";

describe("Wortwahl", () => {
  it("lässt die vier Kategorien und ihre Sätze im Menü zu", () => {
    const entries = [
      ...Object.values(CATEGORY_LABELS).map((text) => ({ scope: "label", text })),
      ...Object.values(CATEGORY_TAGLINES).map((text) => ({ scope: "tagline", text })),
    ];
    expect(checkNavigation(entries)).toEqual([]);
  });
  it("meldet die alten Kategoriewörter im Menü, auch als Teil eines Satzes", () => {
    const issues = checkNavigation([
      { scope: "a", text: "KI" },
      { scope: "b", text: "Schweiz" },
      { scope: "c", text: "Für Vereine" },
      { scope: "d", text: "Alle Content-Werkzeuge" },
      { scope: "e", text: "Praktisches" },
      { scope: "f", text: "Inhalte für Schweizer KMU" },
      { scope: "g", text: "Marketingstrategie für KMU in der Schweiz" },
    ]);
    expect(issues.map((i) => i.scope)).toEqual(["a", "b", "c", "d"]);
  });
  it("meldet «Content» als Wort und als Kompositum, nicht aber technische Wörter wie «Kontext»", () => {
    expect(checkContentWord([{ scope: "x", text: "Content-Strategie und Content" }])[0].message).toContain("2×");
    expect(checkContentWord([{ scope: "x", text: "Inhaltsstrategie, Kontext, Contents" }])).toEqual([]);
  });
  it("lehnt Slugs mit den alten Kategoriewörtern ab", () => {
    expect(checkSlugs(["content-ideen", "ki-check", "vereine", "inhalte-ideen", "kinder"]).map((i) => i.scope)).toEqual(["content-ideen", "ki-check", "vereine"]);
  });
  it("zählt «Vereine» als Hinweis, nicht als Fehler", () => {
    const [i] = checkVereinWording("t", "Für Vereine und Vereinsvorstände, nicht für den Verein.");
    expect(i.level).toBe("warn");
    expect(i.message).toContain("2×");
    expect(checkVereinWording("t", "Ein Verein ist eine Rechtsform.")).toEqual([]);
  });
});
