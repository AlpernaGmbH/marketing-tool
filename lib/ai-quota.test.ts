import { describe, expect, it } from "vitest";
import { limitsFromEnv, releaseSlot, takeSlot, type AiStore, type Limits } from "@/lib/ai-quota";

class Memory implements AiStore {
  counters = new Map<string, number>();
  failing = false;
  async incr(key: string) {
    if (this.failing) throw new Error("redis down");
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    return this.counters.get(key)!;
  }
  async decr(key: string) {
    this.counters.set(key, (this.counters.get(key) ?? 0) - 1);
  }
  async getCache() {
    return null;
  }
  async setCache() {}
}

const NOW = new Date("2026-10-04T10:00:00Z");
const keysOf = (s: Memory) => [...s.counters.keys()];

describe("limitsFromEnv", () => {
  it("hat Standardwerte und liest Zahlen aus der Umgebung", () => {
    expect(limitsFromEnv({})).toEqual({ perAccount: 5, global: 2000 });
    expect(limitsFromEnv({ AI_ACCOUNT_DAILY: "2", AI_DAILY_CAP: "50" })).toEqual({ perAccount: 2, global: 50 });
    expect(limitsFromEnv({ AI_DAILY_CAP: "viele" }).global).toBe(2000);
  });
});

describe("takeSlot für die Einordnung (mit Konto)", () => {
  const limits: Limits = { perAccount: 2, global: 4 };

  it("begrenzt je Konto und je Tag, andere Konten bleiben unberührt", async () => {
    const store = new Memory();
    expect(await takeSlot(store, "a", limits, NOW)).toBe("ok");
    expect(await takeSlot(store, "a", limits, NOW)).toBe("ok");
    expect(await takeSlot(store, "a", limits, NOW)).toBe("account_limit");
    expect(await takeSlot(store, "b", limits, NOW)).toBe("ok");
    // am nächsten Tag ist es wieder frei
    expect(await takeSlot(store, "a", limits, new Date("2026-10-05T10:00:00Z"))).toBe("ok");
  });

  it("bucht bei Ablehnung durch die globale Grenze auch das Konto zurück", async () => {
    const store = new Memory();
    const tight: Limits = { perAccount: 5, global: 1 };
    expect(await takeSlot(store, "a", tight, NOW)).toBe("ok");
    expect(await takeSlot(store, "b", tight, NOW)).toBe("capacity");
    expect([...store.counters.entries()].find(([k]) => k.startsWith("ai:b:"))?.[1]).toBe(0);
  });

  it("gibt einen reservierten Platz zurück", async () => {
    const store = new Memory();
    const limits1: Limits = { perAccount: 1, global: 10 };
    await takeSlot(store, "a", limits1, NOW);
    await releaseSlot(store, "a", NOW);
    expect(await takeSlot(store, "a", limits1, NOW)).toBe("ok");
  });
});

describe("takeSlot für Texte (ohne Konto, ohne Limit pro Person)", () => {
  const limits: Limits = { perAccount: 1, global: 3 };

  it("zählt nur die globale Tagesgrenze und kennt weder Konto noch Person", async () => {
    const store = new Memory();
    for (let i = 0; i < 3; i++) expect(await takeSlot(store, null, limits, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, null, limits, NOW, "text")).toBe("capacity");
    expect(keysOf(store).every((k) => k.startsWith("ai:global:"))).toBe(true);
    expect(store.counters.get(keysOf(store)[0])).toBe(3); // die abgelehnte Anfrage ist zurückgebucht
  });

  it("ignoriert ein übergebenes Konto: kein Limit pro Person", async () => {
    const store = new Memory();
    const wide: Limits = { perAccount: 1, global: 100 };
    for (let i = 0; i < 5; i++) expect(await takeSlot(store, "a", wide, NOW, "text")).toBe("ok");
    expect(keysOf(store).some((k) => k.startsWith("ai:a:"))).toBe(false);
  });

  it("teilt die globale Grenze mit den Einordnungen", async () => {
    const store = new Memory();
    const tight: Limits = { perAccount: 5, global: 2 };
    expect(await takeSlot(store, "a", tight, NOW, "einordnung")).toBe("ok");
    expect(await takeSlot(store, null, tight, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, null, tight, NOW, "text")).toBe("capacity");
  });

  it("gibt einen Platz zurück und lässt die Anfrage bei Ausfall von Redis durch", async () => {
    const store = new Memory();
    await takeSlot(store, null, limits, NOW, "text");
    await releaseSlot(store, null, NOW, "text");
    expect(store.counters.get(keysOf(store)[0])).toBe(0);
    store.failing = true;
    expect(await takeSlot(store, null, limits, NOW, "text")).toBe("ok");
    expect(await takeSlot(null, null, limits, NOW, "text")).toBe("ok");
  });
});
