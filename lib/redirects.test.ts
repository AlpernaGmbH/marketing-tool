import { describe, expect, it } from "vitest";
import { CATEGORY_PAGES } from "@/lib/define-tool";
import { OLD_CATEGORY_PAGES, OLD_TOOL_SLUGS, redirects } from "@/lib/redirects";
import { getTools } from "@/lib/registry";

describe("Weiterleitungen alter Adressen", () => {
  it("führen alte Kategorieseiten auf eine bestehende Seite oder die Startseite", () => {
    for (const [from, to] of Object.entries(OLD_CATEGORY_PAGES)) {
      expect(CATEGORY_PAGES as readonly string[], `${from} ist noch eine Kategorie`).not.toContain(from);
      expect(to === "/" || (CATEGORY_PAGES as readonly string[]).includes(to.slice(1)), `${from} → ${to}`).toBe(true);
    }
  });

  it("führen alte Werkzeug-Slugs auf ein bestehendes Werkzeug", () => {
    const slugs = new Set(getTools().map((t) => t.slug));
    for (const [from, to] of Object.entries(OLD_TOOL_SLUGS)) {
      expect(slugs.has(from), `${from} existiert noch`).toBe(false);
      expect(slugs.has(to), `${to} fehlt`).toBe(true);
    }
  });

  it("bilden keine Ketten und keine doppelten Quellen", () => {
    const list = redirects();
    const sources = list.map((r) => r.source);
    expect(new Set(sources).size).toBe(sources.length);
    for (const r of list) expect(sources, `Kette bei ${r.source}`).not.toContain(r.destination);
    expect(list.every((r) => r.statusCode === 301)).toBe(true);
  });
});
