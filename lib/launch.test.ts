import { describe, expect, it } from "vitest";
import { isIndexable, robotsFor } from "@/lib/launch";

describe("isIndexable", () => {
  it("ist nur mit NEXT_PUBLIC_INDEXABLE=true offen", () => {
    expect(isIndexable({})).toBe(false);
    expect(isIndexable({ NEXT_PUBLIC_INDEXABLE: "" })).toBe(false);
    expect(isIndexable({ NEXT_PUBLIC_INDEXABLE: "1" })).toBe(false);
    expect(isIndexable({ NEXT_PUBLIC_INDEXABLE: "TRUE" })).toBe(false);
    expect(isIndexable({ NEXT_PUBLIC_INDEXABLE: "true" })).toBe(true);
  });
});

describe("robotsFor", () => {
  it("sperrt vor dem Launch alles und nennt keine Sitemap", () => {
    expect(robotsFor(false, "https://tools.alperna.ch")).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });
  it("öffnet nach dem Launch alles ausser /api und /profil und nennt die Sitemap", () => {
    expect(robotsFor(true, "https://tools.alperna.ch")).toEqual({
      rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/profil"] }],
      sitemap: "https://tools.alperna.ch/sitemap.xml",
    });
  });
});
