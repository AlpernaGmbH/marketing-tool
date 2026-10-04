import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, post } from "@/tests/helpers";
import { accountHash } from "@/lib/access";
import type { AiStore } from "@/lib/ai-quota";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));
const who = vi.hoisted(() => ({ account: null as null | { email: string; name: string } }));
const gen = vi.hoisted(() => ({ fn: vi.fn() }));

class MemoryAi implements AiStore {
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
const ai = new MemoryAi();

vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), defaultStore: () => store }));
vi.mock("@/lib/ai-quota", async (orig) => ({ ...(await orig<typeof import("@/lib/ai-quota")>()), defaultAiStore: () => ai }));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getAccount: async () => who.account }));
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), generateFreeText: (...a: unknown[]) => gen.fn(...a) }));

import { POST } from "@/app/api/text/route";

const ME = { email: "anna@keller.ch", name: "Anna Keller" };
const IP = "198.51.100.77";
const TEXT = "Wir streichen Wände und Fassaden in Gossau. Termine gibt es ab Montag, 3 Zimmer in einem Tag.";
let logs: string[];

const body = (over: Record<string, unknown> = {}) => ({ text: TEXT, style: "linkedin", anrede: "du", ...over });
const call = (b: unknown = body(), ip = IP) => POST(post("/api/text", b, { ip }));

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  delete process.env.AI_TEXT_DAILY;
  delete process.env.AI_DAILY_CAP;
  store.runs.clear();
  store.unlockedSet.clear();
  store.accounts.clear();
  store.accounts.add(accountHash(ME.email, SECRET));
  store.failing = false;
  ai.counters.clear();
  ai.failing = false;
  who.account = ME;
  limit.allow = true;
  gen.fn.mockReset();
  gen.fn.mockResolvedValue("Wir streichen Wände und Fassaden in Gossau.\n\nTermine gibt es ab Montag.");
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/text", () => {
  it("liefert den umgeschriebenen Text und gibt Text, Stil und Anrede an die KI weiter", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, text: "Wir streichen Wände und Fassaden in Gossau.\n\nTermine gibt es ab Montag.", warnings: [] });
    const args = gen.fn.mock.calls[0][0] as { system: string; prompt: string; maxOutputTokens: number };
    expect(args.prompt).toContain(TEXT);
    expect(args.system).toContain("LinkedIn-Post");
    expect(args.system).toContain("«du»");
    expect(args.system).not.toContain(TEXT); // der Text des Besuchers steht nur in der Nutzernachricht
    expect(args.maxOutputTokens).toBeGreaterThan(100);
  });

  it("wandelt die Antwort in Schweizer Schreibweise um und warnt vor erfundenen Zahlen", async () => {
    gen.fn.mockResolvedValue('Wir streichen seit 25 Jahren in der Straße. Er sagte "gut" und das 5% mehr.');
    const data = await (await call()).json();
    expect(data.text).toBe("Wir streichen seit 25 Jahren in der Strasse. Er sagte «gut» und das 5 % mehr.");
    expect(data.warnings.join(" ")).toMatch(/Zahlen.*25.*5/);
  });

  it("verlangt gültige Eingaben: Stil, Anrede, Länge, JSON", async () => {
    expect((await call(body({ style: "gibt-es-nicht" }))).status).toBe(400);
    expect((await call(body({ anrede: "ihr" }))).status).toBe(400);
    expect((await call(body({ text: "zu kurz" }))).status).toBe(400);
    expect((await call(body({ text: "a".repeat(3001) }))).status).toBe(400);
    expect((await POST(post("/api/text", "kein json", { ip: IP }))).status).toBe(400);
    expect(gen.fn).not.toHaveBeenCalled();
  });

  it("verlangt eine Anmeldung", async () => {
    who.account = null;
    expect((await call()).status).toBe(401);
    expect(gen.fn).not.toHaveBeenCalled();
  });

  it("verlangt die Freischaltung (Anmeldung allein genügt nicht)", async () => {
    store.accounts.clear();
    expect((await call()).status).toBe(403);
    expect(gen.fn).not.toHaveBeenCalled();
  });

  it("ist ohne GATE_SECRET aus", async () => {
    delete process.env.GATE_SECRET;
    expect((await call()).status).toBe(503);
  });

  it("antwortet 429 beim Limit pro Stunde und pro Tag (Standard 10) und 503 bei der globalen Grenze", async () => {
    limit.allow = false;
    expect((await call()).status).toBe(429);
    limit.allow = true;
    process.env.AI_TEXT_DAILY = "2";
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const third = await call();
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "account_limit" });
    process.env.AI_TEXT_DAILY = "50";
    process.env.AI_DAILY_CAP = "2";
    ai.counters.clear();
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const cap = await call();
    expect(cap.status).toBe(503);
    expect(await cap.json()).toEqual({ error: "capacity" });
  });

  it("zählt die Texte getrennt von den Einordnungen des Checks", async () => {
    await call();
    const keys = [...ai.counters.keys()];
    expect(keys.some((k) => k.startsWith("aitext:"))).toBe(true);
    expect(keys.some((k) => k.startsWith("ai:") && !k.startsWith("ai:global"))).toBe(false);
  });

  it("meldet 502, wenn die KI ausfällt, bucht den Platz zurück und loggt die Fehlerart ohne Text", async () => {
    gen.fn.mockRejectedValue(Object.assign(new Error(`Meldung mit ${TEXT}`), { name: "GatewayRateLimitError", statusCode: 429 }));
    process.env.AI_TEXT_DAILY = "1";
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_failed" });
    expect([...ai.counters.values()].every((n) => n === 0)).toBe(true);
    const all = logs.join("\n");
    expect(all).toContain('"detail":"GatewayRateLimitError:429"');
    expect(all).not.toContain("Gossau");
    gen.fn.mockResolvedValue("Wir streichen Wände in Gossau.");
    expect((await call()).status).toBe(200); // das Limit von 1 ist noch frei
  });

  it("verwirft leere und überlange Antworten", async () => {
    gen.fn.mockResolvedValue("   ");
    expect((await call()).status).toBe(502);
    gen.fn.mockResolvedValue("x".repeat(5000));
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_rejected" });
    expect(logs.join("\n")).toContain('"detail":"rejected:zu_lang"');
    expect([...ai.counters.values()].every((n) => n === 0)).toBe(true);
  });

  it("läuft ohne Redis weiter (das Gratisguthaben begrenzt dann die Kosten)", async () => {
    ai.failing = true;
    expect((await call()).status).toBe(200);
  });

  it("loggt weder Text noch Antwort noch IP", async () => {
    await call();
    const all = logs.join("\n");
    expect(all).toContain('"route":"/api/text"');
    expect(all).not.toContain("Gossau");
    expect(all).not.toContain("Termine");
    expect(all).not.toContain(IP);
  });
});
