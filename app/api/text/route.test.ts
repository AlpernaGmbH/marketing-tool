import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, gateCookie, post } from "@/tests/helpers";
import type { AiStore } from "@/lib/ai-quota";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));
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
const ai = new MemoryAi();

vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), defaultStore: () => store }));
vi.mock("@/lib/ai-quota", async (orig) => ({ ...(await orig<typeof import("@/lib/ai-quota")>()), defaultAiStore: () => ai }));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), generateFreeText: (...a: unknown[]) => gen.fn(...a) }));

import { POST } from "@/app/api/text/route";

const COOKIE = gateCookie("anna@keller.ch");
const IP = "198.51.100.77";
const TEXT = "Wir streichen Wände und Fassaden in Gossau. Termine gibt es ab Montag, 3 Zimmer in einem Tag.";
let logs: string[];

const body = (over: Record<string, unknown> = {}) => ({ text: TEXT, style: "linkedin", anrede: "du", ...over });
/** `cookie: null` heisst: ohne Cookie (undefined würde den Standard ziehen). */
const call = (b: unknown = body(), ip = IP, cookie: string | null = COOKIE) => POST(post("/api/text", b, { ip, cookie: cookie ?? undefined }));

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  delete process.env.AI_DAILY_CAP;
  store.failing = false;
  ai.counters.clear();
  ai.failing = false;
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

  it("gibt der KI eine Prüfung mit: leere, abgelehnte und unveränderte Antworten gehen als Hinweis zurück, brauchbare werden angenommen", async () => {
    await call();
    const { accept } = gen.fn.mock.calls[0][0] as { accept: (t: string) => true | string };
    expect(accept("Wir streichen Wände und Fassaden in Gossau.\n\nTermine gibt es ab Montag.")).toBe(true);
    expect(accept("Es tut mir leid, das kann ich nicht.")).toContain("Material");
    expect(accept("   ")).toContain("leer");
    expect(accept(TEXT)).toContain("identisch");
  });

  it("bucht die Kosten der Antwort und wechselt danach aufs Gratismodell", async () => {
    gen.fn.mockImplementation(async (args: { onUsage?: (u: { costUsd: number }) => void }) => {
      args.onUsage?.({ costUsd: 0.4 }); // 32 Rappen
      return "Wir streichen Wände und Fassaden in Gossau.\n\nTermine gibt es ab Montag.";
    });
    expect((await call()).status).toBe(200);
    expect((gen.fn.mock.calls[0][0] as { freeOnly: boolean }).freeOnly).toBe(false);
    expect((await call()).status).toBe(200);
    expect((gen.fn.mock.calls[1][0] as { freeOnly: boolean }).freeOnly).toBe(true);
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

  it("verlangt die Adresse (Cookie mt_gate): ohne 403, mit 200", async () => {
    const none = await call(body(), IP, null);
    expect(none.status).toBe(403);
    expect(await none.json()).toEqual({ error: "gate" });
    expect(gen.fn).not.toHaveBeenCalled();
    expect((await call()).status).toBe(200);
  });

  it("ist ohne GATE_SECRET aus", async () => {
    delete process.env.GATE_SECRET;
    expect((await call()).status).toBe(503);
  });

  it("antwortet 429 bei zu vielen Anfragen pro Stunde und 503 bei der globalen Tagesgrenze, aber nie wegen einer Grenze pro Person", async () => {
    limit.allow = false;
    expect((await call()).status).toBe(429);
    limit.allow = true;
    for (let i = 0; i < 12; i++) expect((await call()).status).toBe(200); // kein Limit pro Person
    process.env.AI_DAILY_CAP = "2";
    ai.counters.clear();
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const cap = await call();
    expect(cap.status).toBe(503);
    expect(await cap.json()).toEqual({ error: "capacity" });
  });

  it("zählt nur die globale Tagesgrenze, nichts pro Person", async () => {
    await call();
    expect([...ai.counters.keys()].every((k) => k.startsWith("ai:global:"))).toBe(true);
  });

  it("meldet 502, wenn die KI ausfällt, bucht den Platz zurück und loggt die Fehlerart ohne Text", async () => {
    gen.fn.mockRejectedValue(Object.assign(new Error(`Meldung mit ${TEXT}`), { name: "GatewayRateLimitError", statusCode: 429 }));
    process.env.AI_DAILY_CAP = "1";
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_failed" });
    expect([...ai.counters.values()].every((n) => n === 0)).toBe(true);
    const all = logs.join("\n");
    expect(all).toContain('"detail":"GatewayRateLimitError:429"');
    expect(all).not.toContain("Gossau");
    gen.fn.mockResolvedValue("Wir streichen Wände in Gossau.");
    expect((await call()).status).toBe(200); // der Platz wurde zurückgebucht, die Grenze von 1 ist noch frei
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

  it("läuft ohne Redis weiter (dann begrenzt nur der Anbieter)", async () => {
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
