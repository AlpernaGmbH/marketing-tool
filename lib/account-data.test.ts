import { describe, expect, it } from "vitest";
import { checkEntries, dropOldTombstones, mergeEntries, redisDataStore, totalChars } from "@/lib/account-data";
import { LIMITS, isSyncKey } from "@/lib/sync-keys";

describe("isSyncKey", () => {
  it("lässt Profil, Merkliste und Werkzeuge zu, nichts Technisches", () => {
    for (const k of ["mt:profile", "mt:merkliste", "mt:digitaler-auftritt-check", "mt:icp-builder"]) expect(isSyncKey(k), k).toBe(true);
    for (const k of ["mt:_konto", "mt:_sync", "mt:__probe", "mt:", "profile", "mt:Gross", "mt:a/b", "mt:ai-tried:abc", `mt:${"a".repeat(80)}`, "xx:profile"]) {
      expect(isSyncKey(k), k).toBe(false);
    }
  });
});

describe("checkEntries", () => {
  const ok = { "mt:profile": { value: '{"firma":"Keller"}', at: 5 } };

  it("nimmt gültige Einträge an, auch Löschungen (value null)", () => {
    expect(checkEntries(ok)).toEqual({ ok: true, entries: ok });
    expect(checkEntries({ "mt:profile": { value: null, at: 5 } }).ok).toBe(true);
    expect(checkEntries({}).ok).toBe(true);
  });

  it("lehnt falsche Schlüssel, Typen, Zeiten und kein JSON ab", () => {
    const bad: unknown[] = [
      null,
      [],
      "x",
      { "mt:_konto": { value: "{}", at: 1 } },
      { "mt:profile": null },
      { "mt:profile": { value: 3, at: 1 } },
      { "mt:profile": { value: "{}", at: "jetzt" } },
      { "mt:profile": { value: "{}", at: -1 } },
      { "mt:profile": { value: "{}", at: Number.NaN } },
      { "mt:profile": { value: "kein json", at: 1 } },
    ];
    for (const b of bad) expect(checkEntries(b), JSON.stringify(b)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("begrenzt Anzahl, Wertgrösse und Gesamtgrösse", () => {
    const many = Object.fromEntries(Array.from({ length: LIMITS.maxKeys + 1 }, (_, i) => [`mt:t${i}`, { value: "{}", at: 1 }]));
    expect(checkEntries(many)).toEqual({ ok: false, reason: "too_large" });
    const big = JSON.stringify({ x: "a".repeat(LIMITS.maxValueChars) });
    expect(checkEntries({ "mt:profile": { value: big, at: 1 } })).toEqual({ ok: false, reason: "too_large" });
    const half = JSON.stringify({ x: "a".repeat(LIMITS.maxValueChars - 20) });
    const total = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`mt:t${i}`, { value: half, at: 1 }]));
    expect(checkEntries(total)).toEqual({ ok: false, reason: "too_large" });
  });

  it("rundet Zeiten ab", () => {
    expect(checkEntries({ "mt:profile": { value: "{}", at: 5.9 } })).toMatchObject({ ok: true, entries: { "mt:profile": { at: 5 } } });
  });
});

describe("mergeEntries", () => {
  it("nimmt je Schlüssel den neueren Zeitpunkt, bei Gleichstand den Server", () => {
    const server = { "mt:a": { value: '"server"', at: 10 }, "mt:b": { value: '"alt"', at: 1 }, "mt:c": { value: '"gleich"', at: 5 } };
    const incoming = { "mt:a": { value: '"client"', at: 9 }, "mt:b": { value: '"neu"', at: 2 }, "mt:c": { value: '"anders"', at: 5 }, "mt:d": { value: '"neu"', at: 1 } };
    expect(mergeEntries(server, incoming)).toEqual({
      "mt:a": { value: '"server"', at: 10 },
      "mt:b": { value: '"neu"', at: 2 },
      "mt:c": { value: '"gleich"', at: 5 },
      "mt:d": { value: '"neu"', at: 1 },
    });
  });

  it("lässt eine neuere Löschung gewinnen und eine ältere nicht", () => {
    const server = { "mt:a": { value: '"x"', at: 10 } };
    expect(mergeEntries(server, { "mt:a": { value: null, at: 11 } })["mt:a"]).toEqual({ value: null, at: 11 });
    expect(mergeEntries(server, { "mt:a": { value: null, at: 9 } })["mt:a"]).toEqual({ value: '"x"', at: 10 });
  });
});

describe("dropOldTombstones", () => {
  it("entfernt Löschmarken nach 60 Tagen, Werte nie", () => {
    const now = Date.UTC(2026, 9, 4);
    const old = now - 61 * 86_400_000;
    const entries = { "mt:a": { value: null, at: old }, "mt:b": { value: null, at: now - 1000 }, "mt:c": { value: '"x"', at: old } };
    expect(Object.keys(dropOldTombstones(entries, now)).sort()).toEqual(["mt:b", "mt:c"]);
  });
});

describe("totalChars", () => {
  it("zählt Zeichen der Werte, Löschmarken nicht", () => {
    expect(totalChars({ "mt:a": { value: "12345", at: 1 }, "mt:b": { value: null, at: 1 } })).toBe(5);
  });
});

describe("redisDataStore", () => {
  function fake() {
    const data = new Map<string, unknown>();
    const redis = {
      get: async (k: string) => {
        const v = data.get(k);
        // Der echte Client gibt JSON-Texte als Objekte zurück.
        return typeof v === "string" ? JSON.parse(v) : (v ?? null);
      },
      set: async (k: string, v: unknown) => (data.set(k, v), "OK"),
      del: async (k: string) => (data.delete(k), 1),
    };
    return { redis: redis as unknown as Parameters<typeof redisDataStore>[0], data };
  }

  it("speichert ein Dokument je Konto unter data:<hash> und liest es wieder", async () => {
    const { redis, data } = fake();
    const store = redisDataStore(redis);
    expect(await store.get("h1")).toEqual({});
    await store.set("h1", { "mt:profile": { value: '{"firma":"Keller"}', at: 5 } });
    expect([...data.keys()]).toEqual(["data:h1"]);
    expect(await store.get("h1")).toEqual({ "mt:profile": { value: '{"firma":"Keller"}', at: 5 } });
    expect(await store.get("h2")).toEqual({});
    await store.del("h1");
    expect(await store.get("h1")).toEqual({});
  });

  it("liest auch Text statt Objekt und ignoriert beschädigte Dokumente", async () => {
    const { redis } = fake();
    const asText = { get: async () => JSON.stringify({ v: 1, entries: { "mt:profile": { value: "{}", at: 1 } } }) } as unknown as Parameters<typeof redisDataStore>[0];
    expect(await redisDataStore(asText).get("h")).toEqual({ "mt:profile": { value: "{}", at: 1 } });
    const broken = { get: async () => "kein json {" } as unknown as Parameters<typeof redisDataStore>[0];
    expect(await redisDataStore(broken).get("h")).toEqual({});
    const wrong = { get: async () => ({ entries: { "mt:_konto": { value: "{}", at: 1 } } }) } as unknown as Parameters<typeof redisDataStore>[0];
    expect(await redisDataStore(wrong).get("h")).toEqual({});
    void redis;
  });
});
