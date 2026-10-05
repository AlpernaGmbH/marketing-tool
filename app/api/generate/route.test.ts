import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MemoryStore, SECRET, gateCookie, post } from "@/tests/helpers";
import type { AiStore } from "@/lib/ai-quota";
import { defineGenerator } from "@/lib/generator";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));
const gen = vi.hoisted(() => ({ fn: vi.fn() }));

class MemoryAi implements AiStore {
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
const ai = new MemoryAi();

const probe = defineGenerator({
  slug: "probe",
  input: z.object({ betrieb: z.string().min(1).max(80) }),
  output: z.object({ titel: z.string().min(5), punkte: z.array(z.string()).min(1) }),
  instruction: "Schreib einen Titel und Punkte.",
  prompt: (i) => `Betrieb: ${i.betrieb}`,
  maxTokens: 300,
});

vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), defaultStore: () => store }));
vi.mock("@/lib/ai-quota", async (orig) => ({ ...(await orig<typeof import("@/lib/ai-quota")>()), defaultAiStore: () => ai }));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), generateJson: (...a: unknown[]) => gen.fn(...a) }));
vi.mock("@/tools/generators", () => ({ getGenerator: (slug: string) => (slug === "probe" ? probe : undefined) }));

import { POST } from "@/app/api/generate/route";

const COOKIE = gateCookie("anna@keller.ch");
const IP = "198.51.100.77";
const body = (over: Record<string, unknown> = {}) => ({ tool: "probe", input: { betrieb: "Malerei Keller" }, ...over });
/** `cookie: null` heisst: ohne Cookie (undefined würde den Standard ziehen). */
const call = (b: unknown = body(), cookie: string | null = COOKIE) => POST(post("/api/generate", b, { ip: IP, cookie: cookie ?? undefined }));
let logs: string[];

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  delete process.env.AI_DAILY_CAP;
  ai.counters.clear();
  limit.allow = true;
  gen.fn.mockReset();
  gen.fn.mockResolvedValue({ titel: "Fassaden in Gossau", punkte: ["Termine ab [Datum]"] });
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/generate", () => {
  it("liefert den geprüften Entwurf und gibt Regeln, Aufgabe und Eingaben an die KI weiter", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, output: { titel: "Fassaden in Gossau", punkte: ["Termine ab [Datum]"] } });
    const args = gen.fn.mock.calls[0][0] as { system: string; prompt: string; maxOutputTokens: number };
    expect(args.system).toContain("Schreib einen Titel und Punkte.");
    expect(args.system).toContain("Antworte ausschliesslich mit einem JSON-Objekt");
    expect(args.system).not.toContain("Malerei Keller"); // Eingaben nur in der Nutzernachricht
    expect(args.prompt).toBe("Betrieb: Malerei Keller");
    expect(args.maxOutputTokens).toBe(300);
  });

  it("verlangt ein bekanntes Werkzeug und gültige Eingaben", async () => {
    expect((await call(body({ tool: "gibt-es-nicht" }))).status).toBe(400);
    expect((await call(body({ input: { betrieb: "" } }))).status).toBe(400);
    expect((await call(body({ input: "kein objekt" }))).status).toBe(400);
    expect((await call("kein json")).status).toBe(400);
    expect(gen.fn).not.toHaveBeenCalled();
  });

  it("verlangt die Adresse (Cookie mt_gate): ohne 403, nichts wird erzeugt", async () => {
    const res = await call(body(), null);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "gate" });
    expect(gen.fn).not.toHaveBeenCalled();
  });

  it("antwortet 429 beim Limit, 503 ohne GATE_SECRET und 503 bei erschöpfter Tagesgrenze", async () => {
    limit.allow = false;
    expect((await call()).status).toBe(429);
    limit.allow = true;
    process.env.AI_DAILY_CAP = "1";
    expect((await call()).status).toBe(200);
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "capacity" });
    delete process.env.GATE_SECRET;
    expect((await call()).status).toBe(503);
  });

  it("verwirft eine Antwort gegen die Regeln (502) und gibt den Platz zurück", async () => {
    gen.fn.mockResolvedValue({ titel: "Jetzt zugreifen bei unserer Agentur", punkte: ["a"] });
    process.env.AI_DAILY_CAP = "1";
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "ai_rejected", detail: expect.stringMatching(/^(regel|stimme)$/) });
    gen.fn.mockResolvedValue({ titel: "Fassaden in Gossau", punkte: ["a"] });
    expect((await call()).status).toBe(200); // der Platz war nicht verbraucht
  });

  it("übergibt der KI eine Prüfung, damit bei einem abgelehnten Entwurf das nächste Modell antwortet", async () => {
    await call();
    const accept = (gen.fn.mock.calls[0][0] as { accept: (v: unknown) => true | string }).accept;
    expect(accept({ titel: "Fassaden in Gossau", punkte: ["a"] })).toBe(true);
    const rejected = accept({ titel: "Jetzt zugreifen bei unserer Agentur", punkte: ["a"] });
    expect(rejected).toEqual(expect.stringContaining("Dein Entwurf hat die Prüfung nicht bestanden."));
    expect(rejected).not.toContain("Agentur zugreifen"); // die Rückmeldung enthält nie Teile des Entwurfs
    expect(accept({ titel: "x" })).toEqual(expect.stringContaining("Form oder Längen"));
  });

  it("nennt den Grund der letzten Ablehnung, wenn kein Modell einen gültigen Entwurf lieferte", async () => {
    gen.fn.mockImplementation(async (args: { accept: (v: unknown) => true | string }) => {
      args.accept({ titel: "Fassaden in Gossau" }); // Form falsch
      throw Object.assign(new Error("Meldung"), { name: "AiBadJson" });
    });
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_rejected", detail: "schema" });
    expect(logs.join("\n")).toContain("rejected:schema");
  });

  it("meldet 502 bei einem Ausfall der KI und loggt die Fehlerart, nie Eingaben", async () => {
    gen.fn.mockRejectedValue(Object.assign(new Error("Meldung mit Malerei Keller"), { name: "MistralHttpError", statusCode: 500 }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "ai_failed", detail: "MistralHttpError:500" });
    const all = logs.join("\n");
    expect(all).toContain("MistralHttpError:500");
    expect(all).not.toContain("Malerei");
    expect(all).not.toContain(IP);
  });
});
