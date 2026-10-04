import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, post } from "@/tests/helpers";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));

vi.mock("@/lib/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/access")>()),
  defaultStore: () => store,
}));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));

import { POST as access } from "@/app/api/access/route";
import { POST as complete } from "@/app/api/access/complete/route";
import { POST as lead } from "@/app/api/lead/route";

const TOOL = "digitaler-auftritt-check";
const form = { name: "Anna Keller", firma: "Malerei Keller", email: "anna@keller.ch", consent: true, tool: TOOL };
const IP = "198.51.100.20";

/** Cookie aus der Antwort als Request-Header-Wert. */
function cookieOf(res: Response): string {
  const set = res.headers.get("set-cookie") ?? "";
  return set.split(";")[0];
}

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  delete process.env.N8N_WEBHOOK_URL;
  store.runs.clear();
  store.unlockedSet.clear();
  store.popular.clear();
  store.leads.length = 0;
  store.failing = false;
  limit.allow = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/access", () => {
  it("erlaubt eine frische IP", async () => {
    const res = await access(post("/api/access", { tool: TOOL }, { ip: IP }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowed: true, unlocked: false, reason: "free_run", login: null, signedIn: false });
  });
  it("lehnt unbekannte Tools und kaputte Bodies mit 400 ab", async () => {
    expect((await access(post("/api/access", { tool: "gibt-es-nicht" }, { ip: IP }))).status).toBe(400);
    expect((await access(post("/api/access", {}, { ip: IP }))).status).toBe(400);
    expect((await access(post("/api/access", "kein json", { ip: IP }))).status).toBe(400);
  });
  it("antwortet 429 bei überschrittenem Limit", async () => {
    limit.allow = false;
    expect((await access(post("/api/access", { tool: TOOL }, { ip: IP }))).status).toBe(429);
  });
  it("sperrt niemanden aus, wenn GATE_SECRET fehlt", async () => {
    delete process.env.GATE_SECRET;
    const body = await (await access(post("/api/access", { tool: TOOL }, { ip: IP }))).json();
    expect(body).toEqual({ allowed: true, unlocked: true, reason: "gate_disabled", login: null, signedIn: false });
  });
});

describe("Zugangsfolge: frei, gebraucht, Formular, offen", () => {
  it("läuft wie in CLAUDE.md beschrieben", async () => {
    // 1. frisch: erlaubt
    expect((await (await access(post("/api/access", { tool: TOOL }, { ip: IP }))).json()).allowed).toBe(true);

    // 2. Durchlauf abgeschlossen: gezählt, Cookie gesetzt
    const done = await complete(post("/api/access/complete", { tool: TOOL }, { ip: IP }));
    expect(done.status).toBe(200);
    expect(store.popular.get(TOOL)).toBe(1);
    const gate = cookieOf(done);
    expect(gate).toMatch(/^mt_gate=/);
    expect(done.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(done.headers.get("set-cookie")).toMatch(/SameSite=lax/i);

    // 3. zweiter Start: gesperrt, mit IP (Redis) und mit Cookie
    expect((await (await access(post("/api/access", { tool: TOOL }, { ip: IP }))).json()).allowed).toBe(false);
    const otherIpWithCookie = await access(post("/api/access", { tool: TOOL }, { ip: "203.0.113.99", cookie: gate }));
    expect((await otherIpWithCookie.json()).reason).toBe("free_run_used");

    // 4. Lead: Redis-Pfad, ohne n8n -> in lead_queue, trotzdem freigeschaltet
    const leadRes = await lead(post("/api/lead", form, { ip: IP, cookie: gate }));
    expect(leadRes.status).toBe(200);
    expect(store.leads).toHaveLength(1);
    const unlockedCookie = cookieOf(leadRes);

    // 5. danach offen, über IP und über Cookie
    expect((await (await access(post("/api/access", { tool: TOOL }, { ip: IP }))).json()).unlocked).toBe(true);
    const viaCookie = await access(post("/api/access", { tool: TOOL }, { ip: "203.0.113.55", cookie: unlockedCookie }));
    expect((await viaCookie.json()).unlocked).toBe(true);
  });

  it("funktioniert bei Redis-Ausfall nur mit dem Cookie", async () => {
    store.failing = true;
    const done = await complete(post("/api/access/complete", { tool: TOOL }, { ip: IP }));
    expect(done.status).toBe(200);
    const gate = cookieOf(done);
    expect((await (await access(post("/api/access", { tool: TOOL }, { ip: IP, cookie: gate }))).json()).allowed).toBe(false);
    expect((await (await access(post("/api/access", { tool: TOOL }, { ip: IP }))).json()).allowed).toBe(true);
    const leadRes = await lead(post("/api/lead", form, { ip: IP, cookie: gate }));
    expect(leadRes.status).toBe(200);
    const unlocked = cookieOf(leadRes);
    expect((await (await access(post("/api/access", { tool: TOOL }, { ip: IP, cookie: unlocked }))).json()).unlocked).toBe(true);
  });

  it("ignoriert ein gefälschtes Cookie", async () => {
    const forged = `mt_gate=${Buffer.from(JSON.stringify({ runs: 0, unlocked: true, iat: 1 })).toString("base64url")}.AAAA`;
    const res = await access(post("/api/access", { tool: TOOL }, { ip: IP, cookie: forged }));
    expect((await res.json()).unlocked).toBe(false);
  });
});

describe("POST /api/lead", () => {
  it("leitet nur die erlaubten Felder an n8n weiter und schaltet frei", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    const f = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", f);
    const res = await lead(post("/api/lead", { ...form, telefon: "071 123 45 67" }, { ip: IP }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(Object.keys(sent).sort()).toEqual(
      ["email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"].sort(),
    );
    expect(sent).toMatchObject({ tool: TOOL, kategorie: "strategie", quelle: "tools.alperna.ch" });
    expect(store.leads).toHaveLength(0); // n8n hat geantwortet: keine Queue
    expect(store.unlockedSet.size).toBe(1);
  });
  it("legt den Lead bei n8n-Fehler in lead_queue ab und schaltet trotzdem frei", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const res = await lead(post("/api/lead", form, { ip: IP }));
    expect(res.status).toBe(200);
    expect(store.leads).toHaveLength(1);
    expect(JSON.parse(store.leads[0]).email).toBe("anna@keller.ch");
    expect(store.unlockedSet.size).toBe(1);
  });
  it("antwortet 400 nur bei Validierungsfehlern", async () => {
    for (const bad of [
      { ...form, consent: false },
      { ...form, email: "keller" },
      { ...form, honeypot: "spam" },
      { ...form, tool: "gibt-es-nicht" },
    ]) {
      expect((await lead(post("/api/lead", bad, { ip: IP }))).status).toBe(400);
    }
    expect(store.unlockedSet.size).toBe(0);
    expect(store.leads).toHaveLength(0);
  });
  it("antwortet 429 bei überschrittenem Stundenlimit", async () => {
    limit.allow = false;
    expect((await lead(post("/api/lead", form, { ip: IP }))).status).toBe(429);
  });
  it("loggt weder Inhalte noch Klartext-IP", async () => {
    const log = vi.spyOn(console, "log");
    await lead(post("/api/lead", form, { ip: IP }));
    const out = log.mock.calls.flat().join("\n");
    expect(out).not.toContain(IP);
    expect(out).not.toContain("anna@keller.ch");
    expect(out).not.toContain("Malerei Keller");
  });
});
