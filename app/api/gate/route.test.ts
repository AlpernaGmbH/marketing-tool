import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { SECRET, gateCookie } from "@/tests/helpers";
import { DELETE, GET } from "@/app/api/gate/route";

const get = (cookie?: string) => GET(new NextRequest("http://localhost/api/gate", { headers: cookie ? { cookie } : {} }));
let logs: string[];

beforeEach(() => {
  process.env.GATE_SECRET = SECRET;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/gate", () => {
  it("nennt die Adresse aus dem gültigen Cookie, nie zwischengespeichert", async () => {
    const res = await get(gateCookie("anna@keller.ch"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "anna@keller.ch" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("antwortet ohne Cookie, mit gefälschtem Cookie und ohne GATE_SECRET mit email: null", async () => {
    expect(await (await get()).json()).toEqual({ email: null });
    expect(await (await get("mt_gate=e30.AAAA")).json()).toEqual({ email: null });
    delete process.env.GATE_SECRET;
    expect(await (await get(gateCookie("anna@keller.ch"))).json()).toEqual({ email: null });
  });
  it("loggt nur Route und Statuscode, nie die Adresse", async () => {
    await get(gateCookie("geheim@keller.ch"));
    expect(logs.join("\n")).toContain("/api/gate");
    expect(logs.join("\n")).not.toContain("geheim");
  });
});

describe("DELETE /api/gate", () => {
  it("entfernt das Cookie (Max-Age 0)", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("mt_gate=;");
    expect(cookie.toLowerCase()).toContain("max-age=0");
    expect(cookie.toLowerCase()).toContain("httponly");
  });
});
