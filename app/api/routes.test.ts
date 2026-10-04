import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, gateCookie, post } from "@/tests/helpers";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));

vi.mock("@/lib/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/access")>()),
  defaultStore: () => store,
}));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));

import { POST as lead } from "@/app/api/lead/route";
import { POST as result } from "@/app/api/result/route";

const TOOL = "digitaler-auftritt-check";
const IP = "198.51.100.20";
const form = { email: "Anna@Keller.ch", consent: true, tool: TOOL, honeypot: "" };
const ergebnis = { tool: TOOL, eingabe: "Website: keller.ch\nBranche: Handwerk", ausgabe: "# Ergebnis\n\n38 von 100", firma: "Malerei Keller" };

/** Cookie aus der Antwort als Request-Header-Wert. */
function cookieOf(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

let logs: string[];

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  delete process.env.N8N_WEBHOOK_URL;
  store.popular.clear();
  store.leads.length = 0;
  store.failing = false;
  limit.allow = true;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/lead (Adresse angeben)", () => {
  it("setzt das signierte Cookie mit der Adresse und schickt noch nichts ins CRM", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await lead(post("/api/lead", form, { ip: IP }));
    expect(res.status).toBe(200);
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toMatch(/^mt_gate=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=lax/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(store.leads).toHaveLength(0);
  });
  it("antwortet 400 bei fehlender Einwilligung, ungültiger Adresse, Honeypot und unbekanntem Werkzeug", async () => {
    for (const bad of [{ ...form, consent: false }, { ...form, email: "keller" }, { ...form, honeypot: "spam" }, { ...form, tool: "gibt-es-nicht" }, "kein json"]) {
      const res = await lead(post("/api/lead", bad, { ip: IP }));
      expect(res.status).toBe(400);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
  it("antwortet 429 beim Stundenlimit und 503 ohne GATE_SECRET", async () => {
    limit.allow = false;
    expect((await lead(post("/api/lead", form, { ip: IP }))).status).toBe(429);
    limit.allow = true;
    delete process.env.GATE_SECRET;
    expect((await lead(post("/api/lead", form, { ip: IP }))).status).toBe(503);
  });
});

describe("POST /api/result (Ergebnis ins CRM)", () => {
  it("verlangt das Cookie: ohne Adresse 403, mit gefälschtem Cookie 403", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const none = await result(post("/api/result", ergebnis, { ip: IP }));
    expect(none.status).toBe(403);
    expect(await none.json()).toEqual({ error: "gate" });
    const forged = `mt_gate=${Buffer.from(JSON.stringify({ email: "chef@konkurrenz.ch", iat: 1 })).toString("base64url")}.AAAA`;
    expect((await result(post("/api/result", ergebnis, { ip: IP, cookie: forged }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(store.leads).toHaveLength(0);
  });

  it("schickt Adresse aus dem Cookie, Werkzeug, Eingabe und Ausgabe an n8n und zählt das Werkzeug", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    const f = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", f);
    const cookie = cookieOf(await lead(post("/api/lead", form, { ip: IP })));
    const res = await result(post("/api/result", ergebnis, { ip: IP, cookie }));
    expect(res.status).toBe(200);
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(Object.keys(sent).sort()).toEqual(["ausgabe", "eingabe", "email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"].sort());
    expect(sent).toMatchObject({ email: "anna@keller.ch", firma: "Malerei Keller", tool: TOOL, kategorie: "strategie", quelle: "tools.alperna.ch", eingabe: ergebnis.eingabe, ausgabe: ergebnis.ausgabe, name: "", telefon: "" });
    expect(store.leads).toHaveLength(0); // n8n hat geantwortet: keine Queue
    expect(store.popular.get(TOOL)).toBe(1);
  });

  it("nimmt die Adresse nur aus dem Cookie, nie aus dem Body", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    const f = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", f);
    await result(post("/api/result", { ...ergebnis, email: "fremd@example.ch" }, { ip: IP, cookie: gateCookie("anna@keller.ch") }));
    expect(JSON.parse(f.mock.calls[0][1].body).email).toBe("anna@keller.ch");
  });

  it("legt das Ergebnis bei n8n-Fehler in lead_queue ab und antwortet trotzdem 200", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const res = await result(post("/api/result", ergebnis, { ip: IP, cookie: gateCookie() }));
    expect(res.status).toBe(200);
    expect(store.leads).toHaveLength(1);
    expect(JSON.parse(store.leads[0])).toMatchObject({ email: "anna@keller.ch", eingabe: ergebnis.eingabe });
  });

  it("kürzt Eingabe und Ausgabe auf 1'900 Zeichen für das CRM", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    const f = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", f);
    await result(post("/api/result", { ...ergebnis, ausgabe: "x".repeat(5000) }, { ip: IP, cookie: gateCookie() }));
    const sent = JSON.parse(f.mock.calls[0][1].body);
    expect(sent.ausgabe.length).toBeLessThanOrEqual(1900);
    expect(sent.ausgabe.endsWith("…")).toBe(true);
  });

  it("antwortet 400 bei kaputtem Body und unbekanntem Werkzeug, 429 beim Limit, 503 ohne GATE_SECRET", async () => {
    const cookie = gateCookie();
    expect((await result(post("/api/result", { tool: TOOL }, { ip: IP, cookie }))).status).toBe(400);
    expect((await result(post("/api/result", { ...ergebnis, tool: "gibt-es-nicht" }, { ip: IP, cookie }))).status).toBe(400);
    expect((await result(post("/api/result", { ...ergebnis, ausgabe: "x".repeat(20_001) }, { ip: IP, cookie }))).status).toBe(400);
    limit.allow = false;
    expect((await result(post("/api/result", ergebnis, { ip: IP, cookie }))).status).toBe(429);
    limit.allow = true;
    delete process.env.GATE_SECRET;
    expect((await result(post("/api/result", ergebnis, { ip: IP, cookie }))).status).toBe(503);
  });

  it("läuft ohne Redis weiter und loggt weder Inhalte noch Adresse noch IP", async () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/tools-lead";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    store.failing = true;
    expect((await result(post("/api/result", ergebnis, { ip: IP, cookie: gateCookie() }))).status).toBe(200);
    const all = logs.join("\n");
    expect(all).toContain('"route":"/api/result"');
    expect(all).not.toContain(IP);
    expect(all).not.toContain("anna@keller.ch");
    expect(all).not.toContain("Malerei");
    expect(all).not.toContain("38 von 100");
  });
});
