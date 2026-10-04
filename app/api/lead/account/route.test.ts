import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, post } from "@/tests/helpers";
import { accountHash, ipHash } from "@/lib/access";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));
const session = vi.hoisted(() => ({ account: null as null | { email: string; name: string }, configured: true }));

vi.mock("@/lib/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/access")>()),
  defaultStore: () => store,
}));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getAccount: async () => session.account,
  authConfigured: () => session.configured,
}));

import { POST as accessRoute } from "@/app/api/access/route";
import { POST as accountLead } from "@/app/api/lead/account/route";

const TOOL = "digitaler-auftritt-check";
const IP = "198.51.100.60";
const OTHER_IP = "203.0.113.9";
const ME = { email: "anna@keller.ch", name: "Anna Keller" };
const body = { tool: TOOL, consent: true, firma: "Malerei Keller" };

let sent: Record<string, string>[];
let logs: string[];

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/geheim";
  store.runs.clear();
  store.unlockedSet.clear();
  store.accounts.clear();
  store.leads.length = 0;
  store.failing = false;
  limit.allow = true;
  session.account = ME;
  session.configured = true;
  sent = [];
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/lead/account", () => {
  it("verlangt eine Anmeldung", async () => {
    session.account = null;
    const res = await accountLead(post("/api/lead/account", body, { ip: IP }));
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
    expect(store.accounts.size).toBe(0);
  });

  it("verlangt die Einwilligung und ein bekanntes Werkzeug", async () => {
    expect((await accountLead(post("/api/lead/account", { ...body, consent: false }, { ip: IP }))).status).toBe(400);
    expect((await accountLead(post("/api/lead/account", { tool: TOOL }, { ip: IP }))).status).toBe(400);
    expect((await accountLead(post("/api/lead/account", { ...body, tool: "gibt-es-nicht" }, { ip: IP }))).status).toBe(400);
    expect((await accountLead(post("/api/lead/account", "kein json", { ip: IP }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("schaltet frei und schickt Name und E-Mail aus dem Konto an n8n, nicht aus dem Browser", async () => {
    const res = await accountLead(post("/api/lead/account", { ...body, name: "Fremder", email: "fremd@example.ch" }, { ip: IP }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, known: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ name: "Anna Keller", email: "anna@keller.ch", firma: "Malerei Keller", tool: TOOL, quelle: "tools.alperna.ch" });
    expect(Object.keys(sent[0]).sort()).toEqual(["email", "firma", "kategorie", "name", "quelle", "telefon", "tool", "zeit"]);
    expect(store.accounts.has(accountHash(ME.email, SECRET))).toBe(true);
    expect(store.unlockedSet.has(ipHash(IP, SECRET))).toBe(true);
    expect(res.headers.get("set-cookie")).toMatch(/mt_gate=.*HttpOnly/i);
  });

  it("legt für ein schon freigeschaltetes Konto keinen zweiten Lead an", async () => {
    await accountLead(post("/api/lead/account", body, { ip: IP }));
    const again = await accountLead(post("/api/lead/account", body, { ip: OTHER_IP }));
    expect(await again.json()).toEqual({ ok: true, known: true });
    expect(sent).toHaveLength(1);
    expect(store.unlockedSet.has(ipHash(OTHER_IP, SECRET))).toBe(true);
  });

  it("legt bei gleichzeitigen Aufrufen (Doppelklick, zwei Tabs) genau einen Lead an", async () => {
    const [a, b] = await Promise.all([
      accountLead(post("/api/lead/account", body, { ip: IP })),
      accountLead(post("/api/lead/account", body, { ip: IP })),
    ]);
    const known = [(await a.json()).known, (await b.json()).known].sort();
    expect(known).toEqual([false, true]);
    expect(sent).toHaveLength(1);
  });

  it("nimmt eine Firma bis 200 Zeichen an (so lang darf sie im Firmenprofil sein), mehr nicht", async () => {
    expect((await accountLead(post("/api/lead/account", { ...body, firma: "F".repeat(200) }, { ip: IP }))).status).toBe(200);
    store.accounts.clear();
    expect((await accountLead(post("/api/lead/account", { ...body, firma: "F".repeat(201) }, { ip: IP }))).status).toBe(400);
  });

  it("legt den Lead in lead_queue, wenn n8n nicht antwortet, und schaltet trotzdem frei", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kaputt", { status: 500 })));
    const res = await accountLead(post("/api/lead/account", body, { ip: IP }));
    expect(res.status).toBe(200);
    expect(store.leads).toHaveLength(1);
    expect(JSON.parse(store.leads[0])).toMatchObject({ email: "anna@keller.ch" });
    expect(store.accounts.size).toBe(1);
  });

  it("schaltet auch frei, wenn Redis ausfällt (Cookie genügt)", async () => {
    store.failing = true;
    const res = await accountLead(post("/api/lead/account", body, { ip: IP }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("mt_gate=");
    expect(sent).toHaveLength(1);
  });

  it("antwortet 429 bei überschrittenem Limit", async () => {
    limit.allow = false;
    expect((await accountLead(post("/api/lead/account", body, { ip: IP }))).status).toBe(429);
  });

  it("loggt weder E-Mail noch Namen noch IP", async () => {
    await accountLead(post("/api/lead/account", body, { ip: IP }));
    const all = logs.join("\n");
    expect(all).not.toContain("anna@keller.ch");
    expect(all).not.toContain("Anna");
    expect(all).not.toContain("Keller");
    expect(all).not.toContain(IP);
  });
});

describe("Konto und Zugang", () => {
  it("ein freigeschaltetes Konto ist auf einem neuen Gerät offen, auch nach dem freien Durchlauf", async () => {
    await accountLead(post("/api/lead/account", body, { ip: IP }));
    store.runs.set(ipHash(OTHER_IP, SECRET), 1); // dort ist der freie Durchlauf verbraucht
    const res = await accessRoute(post("/api/access", { tool: TOOL }, { ip: OTHER_IP }));
    expect(await res.json()).toEqual({ allowed: true, unlocked: true, reason: "unlocked", login: "clerk", signedIn: true });
  });

  it("eine Anmeldung allein schaltet nicht frei (Einwilligung fehlt)", async () => {
    store.runs.set(ipHash(IP, SECRET), 1);
    const res = await accessRoute(post("/api/access", { tool: TOOL }, { ip: IP }));
    expect(await res.json()).toEqual({ allowed: false, unlocked: false, reason: "free_run_used", login: "clerk", signedIn: true });
  });

  it("bietet die Anmeldung nur an, wenn sie eingerichtet ist", async () => {
    session.configured = false;
    session.account = null;
    const res = await accessRoute(post("/api/access", { tool: TOOL }, { ip: IP }));
    expect(await res.json()).toMatchObject({ login: null, signedIn: false });
  });
});
