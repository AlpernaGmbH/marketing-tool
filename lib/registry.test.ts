import { describe, expect, it, vi } from "vitest";
import { fixtureTool } from "@/tests/fixtures";

const list = vi.hoisted(() => ({ tools: [] as unknown[] }));
vi.mock("@/tools", () => ({
  get tools() {
    return list.tools;
  },
}));

import { defineTool } from "@/lib/define-tool";
import { getFeatured, getNextStep, getPath, getRelated, getTool, getTools, getToolsByCategory } from "@/lib/registry";

const t = fixtureTool;
const icp = t();
const pos = t({ slug: "positionierung", name: "Positionierung", keyword: "Positionierung", pathStep: { path: "strategie", order: 4 }, related: [] });
const persona = t({ slug: "persona", name: "Persona", keyword: "Persona", pathStep: { path: "strategie", order: 3 }, related: [], featured: true });
const verein = t({ slug: "sponsoring", name: "Sponsoring", keyword: "Sponsoring", audience: "verein", category: "inhalte", pathStep: { path: "inhalte", order: 2 }, related: [] });
const content = t({ slug: "caption", name: "Caption", keyword: "Caption", category: "inhalte", pathStep: { path: "inhalte", order: 1 }, related: [] });

describe("defineTool", () => {
  it("lehnt ungültige Slugs, zu lange Taglines und mehr als drei verwandte Tools ab", () => {
    expect(() => t({ slug: "Icp Builder" })).toThrow();
    expect(() => t({ tagline: "x".repeat(111) })).toThrow();
    expect(() => t({ related: ["a", "b", "c", "d"] })).toThrow();
    expect(() => t({ outputs: [] })).toThrow();
  });
  it("lehnt unbekannte Profilfelder ab", () => {
    expect(() => defineTool({ ...icp, usesProfile: ["gibtsnicht" as never] })).toThrow();
  });
});

describe("Registry", () => {
  list.tools = [icp, pos, persona, verein, content];

  it("findet Tools per Slug und nach Kategorie", () => {
    expect(getTools()).toHaveLength(5);
    expect(getTool("persona")?.name).toBe("Persona");
    expect(getTool("gibt-es-nicht")).toBeUndefined();
    expect(getToolsByCategory("inhalte").map((x) => x.slug)).toEqual(["sponsoring", "caption"]);
  });
  it("kennt keine Kategorie nach Zielgruppe mehr", () => {
    expect(getToolsByCategory("praktisches")).toEqual([]);
  });
  it("sortiert Pfade nach pathStep.order", () => {
    expect(getPath("strategie").map((x) => x.slug)).toEqual(["icp-builder", "persona", "positionierung"]);
  });
  it("liefert verwandte Tools und überspringt noch nicht gebaute", () => {
    // icp verweist auf positionierung, zielgruppen-segmente (fehlt), persona
    expect(getRelated("icp-builder").map((x) => x.slug)).toEqual(["positionierung", "persona"]);
    expect(getRelated("gibt-es-nicht")).toEqual([]);
  });
  it("liefert den nächsten Schritt im Pfad, am Ende nichts", () => {
    expect(getNextStep("icp-builder")?.slug).toBe("persona");
    expect(getNextStep("positionierung")).toBeUndefined();
  });
  it("liefert «featured» als Fallback für Meistgenutzt", () => {
    expect(getFeatured().map((x) => x.slug)).toEqual(["persona"]);
  });
  it("wirft bei doppeltem Slug", () => {
    list.tools = [icp, icp];
    expect(() => getTools()).toThrow(/Doppelter Tool-Slug/);
    list.tools = [icp, pos, persona, verein, content];
  });
});
