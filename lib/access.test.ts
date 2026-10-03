import { describe, expect, it } from "vitest";
import {
  canStart,
  clientIp,
  ipHash,
  markComplete,
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
