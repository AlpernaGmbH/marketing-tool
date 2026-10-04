import { describe, expect, it } from "vitest";
import {
  accountHash,
  canStart,
  clientIp,
  ipHash,
  markComplete,
  redisStore,
  signGate,
  unlock,
  verifyGate,
  type GateState,
} from "@/lib/access";
import { MemoryStore, SECRET } from "@/tests/helpers";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const iat = Math.floor(NOW / 1000);
const cookie = (over: Partial<GateState> = {}): GateState => ({ runs: 0, unlocked: false, iat, ...over });

describe("ipHash", () => {
  it("liefert 16 Byte als 32 Hex-Zeichen und enthält die IP nicht im Klartext", () => {
    const h = ipHash("203.0.113.7", SECRET);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("203");
  });
  it("ist pro IP und pro Secret verschieden, aber stabil", () => {
    expect(ipHash("203.0.113.7", SECRET)).toBe(ipHash("203.0.113.7", SECRET));
    expect(ipHash("203.0.113.7", SECRET)).not.toBe(ipHash("203.0.113.8", SECRET));
    expect(ipHash("203.0.113.7", SECRET)).not.toBe(ipHash("203.0.113.7", `${SECRET}x`));
  });
});

describe("clientIp", () => {
  it("nimmt das erste Element von x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.2, 10.0.0.3" });
    expect(clientIp(h)).toBe("198.51.100.1");
  });
  it("fällt auf x-real-ip und dann auf «unknown» zurück", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("Cookie mt_gate", () => {
  it("überlebt Signieren und Prüfen", () => {
    const s = cookie({ runs: 2, unlocked: true });
    expect(verifyGate(signGate(s, SECRET), SECRET, NOW)).toEqual(s);
  });
  it("ist ungültig bei falschem Secret", () => {
    expect(verifyGate(signGate(cookie(), SECRET), `${SECRET}x`, NOW)).toBeNull();
  });
  it("ist ungültig bei verändertem Inhalt (unlocked von Hand gesetzt)", () => {
    const [, sig] = signGate(cookie(), SECRET).split(".");
    const forged = Buffer.from(JSON.stringify(cookie({ unlocked: true }))).toString("base64url");
    expect(verifyGate(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });
  it("ist ungültig bei Müll, leerem Wert und zu vielen Teilen", () => {
    for (const bad of [undefined, "", "abc", "a.b.c", ".", "x."]) {
      expect(verifyGate(bad, SECRET, NOW)).toBeNull();
    }
  });
  it("läuft nach 365 Tagen ab", () => {
    const v = signGate(cookie(), SECRET);
    expect(verifyGate(v, SECRET, NOW + 364 * 86400_000)).not.toBeNull();
    expect(verifyGate(v, SECRET, NOW + 366 * 86400_000)).toBeNull();
  });
  it("ist ungültig bei falsch typisiertem Inhalt", () => {
    const payload = Buffer.from(JSON.stringify({ runs: "1", unlocked: false, iat })).toString("base64url");
    // gültige Signatur über falsch typisierten Payload
    const v = signGate({ runs: "1" as unknown as number, unlocked: false, iat }, SECRET);
    expect(payload).toBeTruthy();
    expect(verifyGate(v, SECRET, NOW)).toBeNull();
  });
});

describe("canStart", () => {
  it("erlaubt den ersten Durchlauf eines frischen Besuchers", async () => {
    const d = await canStart(new MemoryStore(), "h1", null);
    expect(d).toEqual({ allowed: true, unlocked: false, reason: "free_run" });
  });
  it("sperrt, wenn das Cookie einen Durchlauf zählt", async () => {
    const d = await canStart(new MemoryStore(), "h1", cookie({ runs: 1 }));
    expect(d).toEqual({ allowed: false, unlocked: false, reason: "free_run_used" });
  });
  it("sperrt, wenn Redis einen Durchlauf zählt, auch ohne Cookie", async () => {
    const store = new MemoryStore();
    store.runs.set("h1", 1);
    expect((await canStart(store, "h1", null)).allowed).toBe(false);
  });
  it("schaltet frei, wenn Redis ODER Cookie freigeschaltet sind", async () => {
    const store = new MemoryStore();
    store.unlockedSet.add("h1");
    expect((await canStart(store, "h1", cookie({ runs: 3 }))).unlocked).toBe(true);
    expect((await canStart(new MemoryStore(), "h2", cookie({ runs: 3, unlocked: true }))).allowed).toBe(true);
  });
  it("wertet bei Redis-Ausfall nur das Cookie, ohne zu werfen", async () => {
    const store = new MemoryStore();
    store.failing = true;
    expect((await canStart(store, "h1", null)).allowed).toBe(true);
    expect((await canStart(store, "h1", cookie({ runs: 1 }))).allowed).toBe(false);
    expect((await canStart(store, "h1", cookie({ unlocked: true }))).unlocked).toBe(true);
  });
  it("funktioniert ganz ohne Redis (nicht konfiguriert)", async () => {
    expect((await canStart(null, "h1", null)).allowed).toBe(true);
    expect((await canStart(null, "h1", cookie({ runs: 1 }))).allowed).toBe(false);
  });
});

describe("markComplete", () => {
  it("zählt run und popular und erhöht runs im Cookie", async () => {
    const store = new MemoryStore();
    const s = await markComplete(store, "h1", "icp-builder", null, NOW);
    expect(store.runs.get("h1")).toBe(1);
    expect(store.popular.get("icp-builder")).toBe(1);
    expect(s).toEqual({ runs: 1, unlocked: false, iat });
    expect((await canStart(store, "h1", s)).allowed).toBe(false);
  });
  it("zählt run für Freigeschaltete nicht, popular aber schon", async () => {
    const store = new MemoryStore();
    store.unlockedSet.add("h1");
    const s = await markComplete(store, "h1", "persona", null, NOW);
    expect(store.runs.has("h1")).toBe(false);
    expect(store.popular.get("persona")).toBe(1);
    expect(s.unlocked).toBe(true);
  });
  it("liefert bei Redis-Ausfall trotzdem den Cookie-Zustand", async () => {
    const store = new MemoryStore();
    store.failing = true;
    const s = await markComplete(store, "h1", "persona", cookie({ runs: 1 }), NOW);
    expect(s.runs).toBe(2);
  });
});

describe("unlock", () => {
  it("setzt unlocked in Redis und im Cookie, behält runs", async () => {
    const store = new MemoryStore();
    const s = await unlock(store, "h1", cookie({ runs: 1 }), NOW);
    expect(store.unlockedSet.has("h1")).toBe(true);
    expect(s).toEqual({ runs: 1, unlocked: true, iat });
  });
  it("schaltet auch bei Redis-Ausfall über das Cookie frei", async () => {
    const store = new MemoryStore();
    store.failing = true;
    expect((await unlock(store, "h1", null, NOW)).unlocked).toBe(true);
  });
});

describe("Konto (acct:<hash>)", () => {
  it("accountHash ist stabil, unabhängig von Gross- und Kleinschreibung, 32 Hex-Zeichen und nie die Adresse", () => {
    const h = accountHash("Anna@Keller.ch ", SECRET);
    expect(h).toBe(accountHash("anna@keller.ch", SECRET));
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("anna");
    expect(h).not.toBe(accountHash("anna@keller.ch", SECRET + "x"));
  });

  it("accountHash und ipHash kollidieren nicht, auch bei gleichem Text", () => {
    expect(accountHash("1.2.3.4", SECRET)).not.toBe(ipHash("1.2.3.4", SECRET));
  });

  it("canStart: ein freigeschaltetes Konto öffnet, auch wenn IP und Cookie als gebraucht gelten", async () => {
    const store = new MemoryStore();
    store.runs.set("h1", 2);
    store.accounts.add("acc1");
    expect(await canStart(store, "h1", cookie({ runs: 2 }), "acc1")).toEqual({ allowed: true, unlocked: true, reason: "unlocked" });
    expect((await canStart(store, "h1", cookie({ runs: 2 }), "anderes-konto")).allowed).toBe(false);
    expect((await canStart(store, "h1", cookie({ runs: 2 }), null)).allowed).toBe(false);
  });

  it("canStart: fällt Redis aus, gilt nur das Cookie (das Konto allein öffnet dann nicht)", async () => {
    const store = new MemoryStore();
    store.accounts.add("acc1");
    store.failing = true;
    expect((await canStart(store, "h1", cookie({ runs: 1 }), "acc1")).allowed).toBe(false);
  });

  it("unlock mit Konto schaltet IP und Konto frei", async () => {
    const store = new MemoryStore();
    const s = await unlock(store, "h1", null, NOW, "acc1");
    expect(s.unlocked).toBe(true);
    expect(store.unlockedSet.has("h1")).toBe(true);
    expect(store.accounts.has("acc1")).toBe(true);
  });
});

describe("redisStore", () => {
  /** Kleines Double für den Upstash-Client: nur, was redisStore braucht. */
  function fakeRedis() {
    const data = new Map<string, unknown>();
    const calls: string[] = [];
    const redis = {
      mget: async (...ks: string[]) => (calls.push(`mget ${ks.join(",")}`), ks.map((k) => data.get(k) ?? null)),
      exists: async (k: string) => (calls.push(`exists ${k}`), data.has(k) ? 1 : 0),
      pipeline: () => {
        const ops: (() => void)[] = [];
        const p = {
          set: (k: string, v: unknown) => (ops.push(() => data.set(k, v)), p),
          incr: (k: string) => (ops.push(() => data.set(k, Number(data.get(k) ?? 0) + 1)), p),
          expire: () => p,
          exec: async () => (ops.forEach((f) => f()), []),
        };
        return p;
      },
      rpush: async (k: string, v: string) => (data.set(k, [...((data.get(k) as string[]) ?? []), v]), 1),
    };
    return { redis: redis as unknown as Parameters<typeof redisStore>[0], data, calls };
  }

  it("liest mit Konto drei Schlüssel auf einmal und wertet die Freischaltung des Kontos mit", async () => {
    const { redis, calls } = fakeRedis();
    const store = redisStore(redis);
    await store.setUnlocked("ip1", "acc1");
    expect(await store.getState("ip2", "acc1")).toEqual({ runs: 0, unlocked: true });
    expect(await store.getState("ip2", null)).toEqual({ runs: 0, unlocked: false });
    expect(await store.isAccountUnlocked("acc1")).toBe(true);
    expect(await store.isAccountUnlocked("acc2")).toBe(false);
    expect(calls[0]).toBe("mget run:ip2,unlocked:ip2,acct:acc1");
  });

  it("setUnlocked ohne Konto setzt nur die IP", async () => {
    const { redis, data } = fakeRedis();
    await redisStore(redis).setUnlocked("ip1");
    expect([...data.keys()]).toEqual(["unlocked:ip1"]);
  });
});
