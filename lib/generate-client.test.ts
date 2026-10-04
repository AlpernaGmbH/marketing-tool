import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseGenerateResponse, requestGenerate } from "@/lib/generate-client";

const output = z.object({ titel: z.string() });
const def = { slug: "probe", output };
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const asFetch = (f: unknown) => f as typeof fetch;

describe("requestGenerate", () => {
  it("schickt Werkzeug und Eingaben an /api/generate und liefert den geprüften Entwurf", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { ok: true, output: { titel: "Fassaden", extra: 1 } }));
    expect(await requestGenerate(def, { betrieb: "Keller" }, asFetch(f))).toEqual({ ok: true, output: { titel: "Fassaden" } });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/generate");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ tool: "probe", input: { betrieb: "Keller" } });
  });
  it("meldet Netzfehler, ohne zu werfen", async () => {
    expect(await requestGenerate(def, {}, asFetch(vi.fn().mockRejectedValue(new Error("offline"))))).toEqual({ ok: false, reason: "network" });
    expect(await requestGenerate(def, {}, asFetch(vi.fn().mockResolvedValue(new Response("kein json", { status: 200 }))))).toEqual({ ok: false, reason: "failed" });
  });
});

describe("parseGenerateResponse", () => {
  it("übersetzt Statuscodes in Gründe und verwirft Entwürfe in falscher Form", () => {
    expect(parseGenerateResponse(200, { ok: true, output: { titel: "x" } }, output)).toEqual({ ok: true, output: { titel: "x" } });
    expect(parseGenerateResponse(200, { ok: true, output: { falsch: 1 } }, output)).toEqual({ ok: false, reason: "failed" });
    expect(parseGenerateResponse(400, { error: "invalid" }, output)).toEqual({ ok: false, reason: "invalid" });
    expect(parseGenerateResponse(403, { error: "gate" }, output)).toEqual({ ok: false, reason: "gate" });
    expect(parseGenerateResponse(429, {}, output)).toEqual({ ok: false, reason: "rate" });
    expect(parseGenerateResponse(503, { error: "capacity" }, output)).toEqual({ ok: false, reason: "capacity" });
    expect(parseGenerateResponse(503, { error: "ai_disabled" }, output)).toEqual({ ok: false, reason: "failed" });
    expect(parseGenerateResponse(502, { error: "ai_rejected" }, output)).toEqual({ ok: false, reason: "failed" });
  });
});
