import { describe, expect, it } from "vitest";
import { limitsFromEnv, releaseSlot, takeSlot, type AiStore, type Limits } from "@/lib/ai-quota";

class Memory implements AiStore {
  counters = new Map<string, number>();
  async incr(key: string) {
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

const limits: Limits = { perAccount: 2, perAccountText: 3, global: 4 };
const NOW = new Date("2026-10-04T10:00:00Z");

describe("limitsFromEnv", () => {
  it("hat Standardwerte und liest Zahlen aus der Umgebung", () => {
    expect(limitsFromEnv({})).toEqual({ perAccount: 5, perAccountText: 10, global: 200 });
    expect(limitsFromEnv({ AI_ACCOUNT_DAILY: "2", AI_TEXT_DAILY: "7", AI_DAILY_CAP: "50" })).toEqual({ perAccount: 2, perAccountText: 7, global: 50 });
    expect(limitsFromEnv({ AI_TEXT_DAILY: "viele" }).perAccountText).toBe(10);
  });
});

describe("takeSlot und releaseSlot mit Art", () => {
  it("zählt Einordnungen und Texte getrennt je Konto", async () => {
    const store = new Memory();
    const wide: Limits = { ...limits, global: 100 };
    expect(await takeSlot(store, "a", wide, NOW, "einordnung")).toBe("ok");
    expect(await takeSlot(store, "a", wide, NOW, "einordnung")).toBe("ok");
    expect(await takeSlot(store, "a", wide, NOW, "einordnung")).toBe("account_limit");
    // Texte haben ihr eigenes Limit (3), auch wenn die Einordnungen aufgebraucht sind
    expect(await takeSlot(store, "a", wide, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, "a", wide, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, "a", wide, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, "a", wide, NOW, "text")).toBe("account_limit");
    // ein anderes Konto ist unberührt
    expect(await takeSlot(store, "b", wide, NOW, "text")).toBe("ok");
  });

  it("teilt die globale Grenze zwischen beiden Arten und bucht bei Ablehnung zurück", async () => {
    const store = new Memory();
    const tight: Limits = { perAccount: 5, perAccountText: 5, global: 2 };
    expect(await takeSlot(store, "a", tight, NOW, "einordnung")).toBe("ok");
    expect(await takeSlot(store, "b", tight, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, "c", tight, NOW, "text")).toBe("capacity");
    // abgelehnt: weder der globale noch der Zähler des Kontos bleibt belegt
    const values = [...store.counters.entries()];
    expect(values.find(([k]) => k.startsWith("aitext:c:"))?.[1]).toBe(0);
    expect(values.find(([k]) => k.startsWith("ai:global:"))?.[1]).toBe(2);
  });

  it("gibt einen Platz der richtigen Art zurück", async () => {
    const store = new Memory();
    await takeSlot(store, "a", limits, NOW, "text");
    await releaseSlot(store, "a", NOW, "text");
    expect([...store.counters.values()].every((n) => n === 0)).toBe(true);
    await takeSlot(store, "a", limits, NOW, "einordnung");
    await releaseSlot(store, "a", NOW); // Standard: Einordnung
    expect([...store.counters.values()].every((n) => n === 0)).toBe(true);
  });

  it("lässt alles durch, wenn der Speicher fehlt oder ausfällt", async () => {
    expect(await takeSlot(null, "a", limits, NOW, "text")).toBe("ok");
    const broken: AiStore = { ...new Memory(), incr: async () => Promise.reject(new Error("down")), decr: async () => {}, getCache: async () => null, setCache: async () => {} };
    expect(await takeSlot(broken, "a", limits, NOW, "text")).toBe("ok");
  });
});
