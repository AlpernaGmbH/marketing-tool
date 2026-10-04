import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MemoryStore } from "@/tests/helpers";

const store = new MemoryStore();
const present = vi.hoisted(() => ({ redis: true }));
vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), defaultStore: () => (present.redis ? store : null) }));

import { GET } from "@/app/api/cron/leads/route";

const SECRET = "cron-secret-0123456789abcdef";
const lead = JSON.stringify({ name: "Anna Keller", firma: "Keller", email: "anna@keller.ch", telefon: "", tool: "x", kategorie: "strategie", quelle: "tools.alperna.ch", zeit: "2026-10-04T10:00:00.000Z" });
const call = (auth?: string) => GET(new NextRequest("http://localhost/api/cron/leads", { headers: auth ? { authorization: auth } : {} }));

let logs: string[];
let sent: number;

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.N8N_WEBHOOK_URL = "https://n8n.example/webhook/geheim";
  present.redis = true;
  store.leads.length = 0;
  store.failing = false;
  sent = 0;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      sent++;
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/leads", () => {
  it("verlangt das Secret von Vercel und fasst ohne es nichts an", async () => {
    store.leads.push(lead);
    for (const auth of [undefined, "", "Bearer falsch", `Bearer ${SECRET}x`, SECRET, `bearer ${SECRET}`]) {
      expect((await call(auth)).status, String(auth)).toBe(401);
    }
    expect(store.leads).toHaveLength(1);
    expect(sent).toBe(0);
  });

  it("sagt 401, wenn CRON_SECRET gar nicht gesetzt oder zu kurz ist (nie offen)", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer ")).status).toBe(401);
    expect((await call("Bearer undefined")).status).toBe(401);
    process.env.CRON_SECRET = "kurz";
    expect((await call("Bearer kurz")).status).toBe(401);
  });

  it("schickt wartende Leads an n8n und meldet nur Zahlen", async () => {
    store.leads.push(lead, lead);
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 2, waiting: 0, invalid: 0 });
    expect(store.leads).toHaveLength(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("lässt Leads liegen, wenn n8n noch nicht antwortet", async () => {
    store.leads.push(lead);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kaputt", { status: 500 })));
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, sent: 0, waiting: 1, invalid: 0 });
    expect(store.leads).toHaveLength(1);
  });

  it("läuft ohne Redis leer durch und bei Redis-Ausfall ohne Absturz", async () => {
    present.redis = false;
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ ok: true, skipped: "redis" });
    present.redis = true;
    store.failing = true;
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false });
  });

  it("loggt weder Namen noch E-Mail noch Adresse des Webhooks", async () => {
    store.leads.push(lead);
    await call(`Bearer ${SECRET}`);
    const all = logs.join("\n");
    expect(all).toContain('"route":"/api/cron/leads"');
    expect(all).not.toContain("anna@keller.ch");
    expect(all).not.toContain("Anna");
    expect(all).not.toContain("geheim");
    expect(all).not.toContain(SECRET);
  });
});
