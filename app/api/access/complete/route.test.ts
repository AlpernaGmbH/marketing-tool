import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, post } from "@/tests/helpers";
import { accountHash, ipHash } from "@/lib/access";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));
const session = vi.hoisted(() => ({ account: null as null | { email: string; name: string } }));

vi.mock("@/lib/access", async (orig) => ({ ...(await orig<typeof import("@/lib/access")>()), defaultStore: () => store }));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<typeof import("@/lib/auth")>()), getAccount: async () => session.account }));

import { POST } from "@/app/api/access/complete/route";

const TOOL = "digitaler-auftritt-check";
const IP = "198.51.100.70";

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  store.runs.clear();
  store.unlockedSet.clear();
  store.accounts.clear();
  store.popular.clear();
  store.failing = false;
  limit.allow = true;
  session.account = null;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/access/complete", () => {
  it("zählt den freien Durchlauf und das Werkzeug", async () => {
    const res = await POST(post("/api/access/complete", { tool: TOOL }, { ip: IP }));
    expect(await res.json()).toEqual({ ok: true, unlocked: false });
    expect(store.runs.get(ipHash(IP, SECRET))).toBe(1);
    expect(store.popular.get(TOOL)).toBe(1);
    expect(res.headers.get("set-cookie")).toContain("mt_gate=");
  });

  it("zählt für ein freigeschaltetes Konto keinen freien Durchlauf, auch auf einem neuen Gerät", async () => {
    session.account = { email: "anna@keller.ch", name: "Anna" };
    store.accounts.add(accountHash("anna@keller.ch", SECRET));
    const res = await POST(post("/api/access/complete", { tool: TOOL }, { ip: IP }));
    expect(await res.json()).toEqual({ ok: true, unlocked: true });
    expect(store.runs.size).toBe(0); // sonst wäre jeder andere Besucher hinter dieser IP gesperrt
    expect(store.popular.get(TOOL)).toBe(1);
  });

  it("eine Anmeldung ohne Freischaltung zählt wie ein freier Durchlauf", async () => {
    session.account = { email: "anna@keller.ch", name: "Anna" };
    const res = await POST(post("/api/access/complete", { tool: TOOL }, { ip: IP }));
    expect(await res.json()).toEqual({ ok: true, unlocked: false });
    expect(store.runs.get(ipHash(IP, SECRET))).toBe(1);
  });

  it("lehnt unbekannte Werkzeuge, kaputte Bodies und fremde Content-Types ab", async () => {
    expect((await POST(post("/api/access/complete", { tool: "gibt-es-nicht" }, { ip: IP }))).status).toBe(400);
    expect((await POST(post("/api/access/complete", "kein json", { ip: IP }))).status).toBe(400);
    const req = post("/api/access/complete", { tool: TOOL }, { ip: IP });
    const plain = new Request(req.url, { method: "POST", headers: { "content-type": "text/plain", "x-forwarded-for": IP }, body: JSON.stringify({ tool: TOOL }) });
    expect((await POST(plain as never)).status).toBe(400);
    expect(store.runs.size).toBe(0);
  });

  it("antwortet 429 bei überschrittenem Limit und zählt dann nichts", async () => {
    limit.allow = false;
    expect((await POST(post("/api/access/complete", { tool: TOOL }, { ip: IP }))).status).toBe(429);
    expect(store.runs.size).toBe(0);
  });
});
