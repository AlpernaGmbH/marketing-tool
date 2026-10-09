import { describe, expect, it, vi } from "vitest";
import { RP_PER_USD, budgetMode, limitsFromEnv, notifyCapacity, recordSpend, releaseSlot, spendCollector, spendLimitsFromEnv, takeSlot, type AiStore, type Limits } from "@/lib/ai-quota";

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
  async add(key: string, amount: number) {
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
    return this.counters.get(key)!;
  }
  async read(key: string) {
    return this.counters.get(key) ?? 0;
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
  it("setzt mit OpenRouter (1'000 Anfragen am Tag mit gekauftem Guthaben) die Grenze auf 1000, sofern nichts anderes steht", () => {
    expect(limitsFromEnv({ OPENROUTER_API_KEY: "k" }).global).toBe(1000);
    expect(limitsFromEnv({ OPENROUTER_API_KEY: "k", AI_DAILY_CAP: "900" }).global).toBe(900);
    expect(limitsFromEnv({ OPENROUTER_API_KEY: "k", AI_PROVIDER: "gateway" }).global).toBe(2000);
  });
});

describe("takeSlot für die Einordnung (pro E-Mail-Adresse)", () => {
  const limits: Limits = { perAccount: 2, global: 4 };

  it("begrenzt je Adresse und je Tag, andere Adressen bleiben unberührt", async () => {
    const store = new Memory();
    expect(await takeSlot(store, "a", limits, NOW)).toBe("ok");
    expect(await takeSlot(store, "a", limits, NOW)).toBe("ok");
    expect(await takeSlot(store, "a", limits, NOW)).toBe("account_limit");
    expect(await takeSlot(store, "b", limits, NOW)).toBe("ok");
    // am nächsten Tag ist es wieder frei
    expect(await takeSlot(store, "a", limits, new Date("2026-10-05T10:00:00Z"))).toBe("ok");
  });

  it("bucht bei Ablehnung durch die globale Grenze auch die Adresse zurück", async () => {
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

describe("takeSlot für Texte (ohne Limit pro Person)", () => {
  const limits: Limits = { perAccount: 1, global: 3 };

  it("zählt nur die globale Tagesgrenze und kennt keine Person", async () => {
    const store = new Memory();
    for (let i = 0; i < 3; i++) expect(await takeSlot(store, null, limits, NOW, "text")).toBe("ok");
    expect(await takeSlot(store, null, limits, NOW, "text")).toBe("capacity");
    expect(keysOf(store).every((k) => k.startsWith("ai:global:"))).toBe(true);
    expect(store.counters.get(keysOf(store)[0])).toBe(3); // die abgelehnte Anfrage ist zurückgebucht
  });

  it("ignoriert eine übergebene Adresse: kein Limit pro Person", async () => {
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

describe("notifyCapacity", () => {
  const limits: Limits = { perAccount: 5, global: 40 };
  const ENV = { ALERT_WEBHOOK_URL: "https://n8n.example/webhook/alarm", OPENROUTER_API_KEY: "k" };
  const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 }));
  const asFetch = (fn: ReturnType<typeof vi.fn>) => fn as unknown as typeof fetch;

  it("meldet einmal am Tag, mit Datum, Grenze und Anbieter, sonst nichts", async () => {
    const store = new Memory();
    const fetchFn = okFetch();
    expect(await notifyCapacity(store, limits, NOW, asFetch(fetchFn), ENV)).toBe(true);
    expect(await notifyCapacity(store, limits, NOW, asFetch(fetchFn), ENV)).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENV.ALERT_WEBHOOK_URL);
    expect(JSON.parse(init.body as string)).toEqual({ event: "ki_tageslimit", datum: "2026-10-04", limit: 40, anbieter: "openrouter" });
    // am nächsten Tag wieder
    expect(await notifyCapacity(store, limits, new Date("2026-10-05T10:00:00Z"), asFetch(fetchFn), ENV)).toBe(true);
  });

  it("tut ohne Adresse, ohne Redis oder bei Fehlern nichts und wirft nie", async () => {
    const fetchFn = okFetch();
    expect(await notifyCapacity(new Memory(), limits, NOW, asFetch(fetchFn), {})).toBe(false);
    expect(await notifyCapacity(null, limits, NOW, asFetch(fetchFn), ENV)).toBe(false);
    const down = new Memory();
    down.failing = true;
    expect(await notifyCapacity(down, limits, NOW, asFetch(fetchFn), ENV)).toBe(false);
    const broken = vi.fn(async () => {
      throw new Error("n8n down");
    });
    expect(await notifyCapacity(new Memory(), limits, NOW, asFetch(broken), ENV)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Tagesbudget in Rappen", () => {
  const LIMITS = { perAddressRp: 30, globalRp: 500 };
  const usd = (rp: number) => rp / RP_PER_USD;

  it("liest Standard 30 Rappen je Adresse und CHF 5.- global, überschreibbar mit AI_ADDRESS_DAILY_RP und AI_GLOBAL_DAILY_RP", () => {
    expect(spendLimitsFromEnv({})).toEqual({ perAddressRp: 30, globalRp: 500 });
    expect(spendLimitsFromEnv({ AI_ADDRESS_DAILY_RP: "10", AI_GLOBAL_DAILY_RP: "200" })).toEqual({ perAddressRp: 10, globalRp: 200 });
    expect(spendLimitsFromEnv({ AI_ADDRESS_DAILY_RP: "viel" }).perAddressRp).toBe(30);
  });

  it("antwortet bezahlt, bis eine Adresse 30 Rappen verbraucht hat, dann nur noch kostenlos; andere Adressen bleiben bezahlt", async () => {
    const store = new Memory();
    expect(await budgetMode(store, "a", LIMITS, NOW)).toBe("paid");
    await recordSpend(store, "a", usd(29), NOW);
    expect(await budgetMode(store, "a", LIMITS, NOW)).toBe("paid");
    await recordSpend(store, "a", usd(1), NOW);
    expect(await budgetMode(store, "a", LIMITS, NOW)).toBe("address");
    expect(await budgetMode(store, "b", LIMITS, NOW)).toBe("paid");
    // am nächsten Tag ist wieder alles bezahlt
    expect(await budgetMode(store, "a", LIMITS, new Date("2026-10-05T10:00:00Z"))).toBe("paid");
  });

  it("schaltet alle auf kostenlos, wenn das globale Budget erreicht ist", async () => {
    const store = new Memory();
    for (const who of ["a", "b", "c", "d"]) await recordSpend(store, who, usd(125), NOW);
    expect(await budgetMode(store, "e", LIMITS, NOW)).toBe("global");
  });

  it("ignoriert Kosten von 0 und negative, ohne Redis und bei einem Ausfall gilt bezahlt", async () => {
    const store = new Memory();
    await recordSpend(store, "a", 0, NOW);
    await recordSpend(store, "a", -1, NOW);
    expect(store.counters.size).toBe(0);
    expect(await budgetMode(null, "a", LIMITS, NOW)).toBe("paid");
    await recordSpend(null, "a", 1, NOW); // wirft nicht
    store.failing = true;
    store.read = async () => {
      throw new Error("redis down");
    };
    expect(await budgetMode(store, "a", LIMITS, NOW)).toBe("paid");
  });

  it("zählt mehrere Antworten eines Aufrufs zusammen", () => {
    const c = spendCollector();
    c.onUsage({ costUsd: 0.004 });
    c.onUsage({ costUsd: 0.006 });
    expect(c.total()).toBeCloseTo(0.01, 6);
  });
});
