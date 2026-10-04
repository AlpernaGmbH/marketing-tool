import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SECRET, gateCookie, post } from "@/tests/helpers";
import { CheckError } from "@/lib/check/types";

const limit = vi.hoisted(() => ({ allow: true }));
const read = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/read", () => ({ readPage: (...a: unknown[]) => read.fn(...a) }));

import { POST } from "@/app/api/read/route";

const COOKIE = gateCookie("anna@keller.ch");
const IP = "198.51.100.44";
const PAGE = { url: "https://geheim-keller.ch/", host: "geheim-keller.ch", title: "Malerei Keller", description: "", headings: ["Wir streichen"], text: "Seit Jahren in Gossau.", truncated: false };
const call = (body: unknown = { website: "geheim-keller.ch" }, cookie: string | null = COOKIE) => POST(post("/api/read", body, { ip: IP, cookie: cookie ?? undefined }));
let logs: string[];

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  limit.allow = true;
  read.fn.mockReset();
  read.fn.mockResolvedValue(PAGE);
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/read", () => {
  it("liefert die gelesene Seite", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, page: PAGE });
    expect(read.fn).toHaveBeenCalledWith("geheim-keller.ch");
  });
  it("verlangt eine gültige Adresse (400) und ruft dann nichts ab", async () => {
    for (const bad of [{}, { website: "" }, { website: "ftp://keller.ch" }, { website: "http://127.0.0.1" }, "kein json"]) {
      expect((await call(bad)).status).toBe(400);
    }
    expect(read.fn).not.toHaveBeenCalled();
  });
  it("verlangt die Adresse (Cookie): ohne 403; 429 beim Limit; 503 ohne GATE_SECRET", async () => {
    expect((await call(undefined, null)).status).toBe(403);
    limit.allow = false;
    expect((await call()).status).toBe(429);
    limit.allow = true;
    delete process.env.GATE_SECRET;
    expect((await call()).status).toBe(503);
    expect(read.fn).not.toHaveBeenCalled();
  });
  it("übersetzt Fehler des Abrufs: gesperrt 400, nicht erreichbar 502, sonst 502 ohne Details", async () => {
    read.fn.mockRejectedValue(new CheckError("Interne Adressen sind nicht erlaubt.", "blocked"));
    let res = await call();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "blocked", message: "Interne Adressen sind nicht erlaubt." });
    read.fn.mockRejectedValue(new CheckError("Die Website antwortet mit Fehler 503.", "unreachable"));
    res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("unreachable");
    read.fn.mockRejectedValue(new Error("ECONNRESET 10.0.0.5"));
    res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.5");
  });
  it("loggt weder Adresse noch Text noch IP", async () => {
    await call();
    const all = logs.join("\n");
    expect(all).toContain('"route":"/api/read"');
    expect(all).not.toContain("geheim-keller");
    expect(all).not.toContain("Gossau");
    expect(all).not.toContain(IP);
  });
});
