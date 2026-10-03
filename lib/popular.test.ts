import { describe, expect, it, vi } from "vitest";
import { defineTool } from "@/lib/define-tool";
import { rankPopular } from "@/lib/popular";

const make = (slug: string, featured = false) =>
  defineTool({
    slug,
    name: `Werkzeug ${slug}`,
    category: "strategie",
    audience: "kmu",
    tagline: "Eine Zeile, die lang genug ist.",
    keyword: "Stichwort",
    related: [],
    needsServer: false,
    usesProfile: [],
    writesProfile: [],
    outputs: ["copy"],
    estimatedMinutes: 5,
    pathStep: { path: "strategie", order: 1 },
    featured,
  });

const names = (list: { slug: string }[]) => list.map((t) => t.slug);

describe("rankPopular", () => {
  const tools = [make("a"), make("b", true), make("c"), make("d", true), make("e")];

  it("ohne Zähler zuerst featured, dann der Rest in Registry-Reihenfolge", () => {
    expect(names(rankPopular(tools, {}))).toEqual(["b", "d", "a", "c", "e"]);
  });
  it("sortiert nach Durchläufen absteigend, Gleichstand nach Registry-Reihenfolge", () => {
    expect(names(rankPopular(tools, { c: 9, a: 9, e: 2 }, 3))).toEqual(["a", "c", "e"]);
  });
  it("füllt nach den genutzten mit featured auf", () => {
    expect(names(rankPopular(tools, { e: 4 }, 3))).toEqual(["e", "b", "d"]);
  });
  it("liefert höchstens `limit` und nennt kein Werkzeug doppelt", () => {
    const r = names(rankPopular(tools, { b: 5, a: 1 }, 4));
    expect(r).toHaveLength(4);
    expect(new Set(r).size).toBe(4);
  });
  it("kommt mit weniger Werkzeugen als `limit` und mit leerer Liste zurecht", () => {
    expect(rankPopular(tools.slice(0, 2), {}, 6)).toHaveLength(2);
    expect(rankPopular([], { a: 1 })).toEqual([]);
  });
  it("ignoriert Zähler für unbekannte Slugs", () => {
    expect(names(rankPopular(tools.slice(0, 2), { zzz: 99 }))).toEqual(["b", "a"]);
  });
});

describe("loadPopularCounts", () => {
  it("liefert ohne Redis ein leeres Objekt", async () => {
    vi.resetModules();
    vi.doMock("@/lib/redis", () => ({ getRedis: () => null, keys: { popular: (s: string) => `popular:${s}` }, withTimeout: (p: Promise<unknown>) => p }));
    const { loadPopularCounts } = await import("@/lib/popular");
    expect(await loadPopularCounts([make("a")])).toEqual({});
    vi.doUnmock("@/lib/redis");
  });
  it("liest popular:<slug> per mget und lässt 0, null und Müll weg", async () => {
    vi.resetModules();
    const mget = vi.fn().mockResolvedValue([5, null, "7", "kaputt"]);
    vi.doMock("@/lib/redis", () => ({ getRedis: () => ({ mget }), keys: { popular: (s: string) => `popular:${s}` }, withTimeout: (p: Promise<unknown>) => p }));
    const { loadPopularCounts } = await import("@/lib/popular");
    const out = await loadPopularCounts([make("a"), make("b"), make("c"), make("d")]);
    expect(mget).toHaveBeenCalledWith("popular:a", "popular:b", "popular:c", "popular:d");
    expect(out).toEqual({ a: 5, c: 7 });
    vi.doUnmock("@/lib/redis");
  });
  it("fängt Redis-Fehler ab", async () => {
    vi.resetModules();
    vi.doMock("@/lib/redis", () => ({ getRedis: () => ({ mget: vi.fn().mockRejectedValue(new Error("down")) }), keys: { popular: (s: string) => `popular:${s}` }, withTimeout: (p: Promise<unknown>) => p }));
    const { loadPopularCounts } = await import("@/lib/popular");
    expect(await loadPopularCounts([make("a")])).toEqual({});
    vi.doUnmock("@/lib/redis");
  });
});
