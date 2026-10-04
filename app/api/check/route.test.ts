import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, SECRET, gateCookie, post } from "@/tests/helpers";

const store = new MemoryStore();
const limit = vi.hoisted(() => ({ allow: true }));
const net = vi.hoisted(() => ({ fetch: null as null | ((url: string) => Promise<unknown>) }));

vi.mock("@/lib/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/access")>()),
  defaultStore: () => store,
}));
vi.mock("@/lib/ratelimit", () => ({ withinLimit: async () => limit.allow }));
vi.mock("@/lib/check/net", async (orig) => ({
  ...(await orig<typeof import("@/lib/check/net")>()),
  safeFetch: (url: string) => net.fetch!(url),
}));

import { POST } from "@/app/api/check/route";
import { CheckError, type CheckEvent } from "@/lib/check/types";

const IP = "198.51.100.40";
const COOKIE = gateCookie();
const HTML = `<html lang="de"><head><title>Malerei Keller Gossau</title></head><body><h1>Malerei</h1></body></html>`;
const body = { company: "Malerei Keller", city: "Gossau", industry: "craft", website: "geheim-keller.ch" };

function page(url: string, html = HTML, status = 200) {
  return { url: new URL(url), status, ok: status < 300, headers: {}, body: html, ms: 200 };
}

async function events(res: Response): Promise<CheckEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CheckEvent);
}

let logs: string[];

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  delete process.env.GOOGLE_PLACES_API_KEY;
  store.failing = false;
  limit.allow = true;
  net.fetch = async (url) => (url.endsWith("/robots.txt") || url.endsWith("/sitemap.xml") ? page(url, "", 404) : page(url));
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/check", () => {
  it("streamt Schritte und Ergebnis als NDJSON", async () => {
    const res = await POST(post("/api/check", body, { ip: IP, cookie: COOKIE }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toBe("no-store");

    const ev = await events(res);
    const steps = ev.filter((e) => e.type === "step").map((e) => (e.type === "step" ? `${e.id}:${e.state}` : ""));
    expect(steps[0]).toBe("fetch:start");
    expect(steps.at(-1)).toBe("score:done");
    const last = ev.at(-1)!;
    expect(last.type).toBe("result");
    if (last.type === "result") {
      expect(last.result.v).toBe(1);
      expect(last.result.company).toBe("Malerei Keller");
      expect(last.result.categories.length).toBe(7);
    }
  });

  it("lehnt kaputte Eingaben mit 400 ab, bevor irgendetwas abgerufen wird", async () => {
    let fetched = 0;
    net.fetch = async (u) => (fetched++, page(u));
    for (const bad of [{}, { company: "A" }, { company: "", website: "keller.ch" }, "kein json", { company: "A", website: "ftp://keller.ch" }, { company: "A", website: "http://127.0.0.1" }]) {
      const res = await POST(post("/api/check", bad, { ip: IP, cookie: COOKIE }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid");
    }
    expect(fetched).toBe(0);
  });

  it("antwortet 429 bei überschrittenem Limit", async () => {
    limit.allow = false;
    const res = await POST(post("/api/check", body, { ip: IP, cookie: COOKIE }));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("rate_limited");
  });

  it("verlangt die Adresse (Cookie mt_gate): ohne 403, mit gefälschtem Cookie 403, mit gültigem 200", async () => {
    let fetched = 0;
    net.fetch = async (u) => (fetched++, page(u));
    const none = await POST(post("/api/check", body, { ip: IP }));
    expect(none.status).toBe(403);
    expect((await none.json()).error).toBe("gate");
    const forged = `mt_gate=${Buffer.from(JSON.stringify({ email: "x@y.ch", iat: 1 })).toString("base64url")}.AAAA`;
    expect((await POST(post("/api/check", body, { ip: IP, cookie: forged }))).status).toBe(403);
    expect(fetched).toBe(0);
    const ok = await POST(post("/api/check", body, { ip: IP, cookie: COOKIE }));
    expect(ok.status).toBe(200);
    await ok.text();
  });

  it("sperrt niemanden aus, wenn GATE_SECRET fehlt", async () => {
    delete process.env.GATE_SECRET;
    expect((await POST(post("/api/check", body, { ip: IP }))).status).toBe(200);
  });

  it("meldet nicht erreichbare Websites als Fehler-Ereignis im Stream", async () => {
    net.fetch = async () => {
      throw new CheckError("Die Website konnte nicht geladen werden.", "unreachable");
    };
    const ev = await events(await POST(post("/api/check", body, { ip: IP, cookie: COOKIE })));
    expect(ev.at(-1)).toMatchObject({ type: "error", code: "unreachable" });
  });

  it("meldet blockierte Adressen im Stream und verrät nichts Internes", async () => {
    net.fetch = async () => {
      throw new CheckError("Interne Adressen sind nicht erlaubt.", "blocked");
    };
    const last = (await events(await POST(post("/api/check", body, { ip: IP, cookie: COOKIE })))).at(-1);
    expect(last).toMatchObject({ type: "error", code: "blocked" });
  });

  it("macht aus unerwarteten Fehlern eine allgemeine Meldung ohne Details", async () => {
    net.fetch = async () => {
      throw new Error("ECONNRESET 10.0.0.5:5432");
    };
    const last = (await events(await POST(post("/api/check", body, { ip: IP, cookie: COOKIE })))).at(-1);
    // loadPage fängt jeden Abruf-Fehler und meldet «nicht erreichbar»; die interne Meldung gelangt nie nach aussen.
    expect(JSON.stringify(last)).not.toContain("10.0.0.5");
  });

  it("loggt nie Adresse, Firma oder IP", async () => {
    await (await POST(post("/api/check", body, { ip: IP, cookie: COOKIE }))).text();
    net.fetch = async () => {
      throw new CheckError("x", "unreachable");
    };
    await (await POST(post("/api/check", body, { ip: IP, cookie: COOKIE }))).text();
    const all = logs.join("\n");
    expect(all).not.toContain("geheim-keller");
    expect(all).not.toContain("Malerei");
    expect(all).not.toContain(IP);
    expect(all).toContain('"route":"/api/check"');
  });
});
