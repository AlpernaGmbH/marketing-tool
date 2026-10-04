import { describe, expect, it, vi } from "vitest";
import { sendResult, submitEmail } from "@/lib/access-client";

const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const asFetch = (f: unknown) => f as typeof fetch;

describe("submitEmail", () => {
  it("schickt Adresse, Einwilligung und Werkzeug an /api/lead und meldet Erfolg", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { ok: true }));
    expect(await submitEmail({ email: "anna@keller.ch", consent: true, tool: "x", honeypot: "" }, asFetch(f))).toEqual({ ok: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/lead");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ email: "anna@keller.ch", consent: true, tool: "x", honeypot: "" });
  });
  it("übersetzt 400, 429 und Netzfehler in Gründe, ohne zu werfen", async () => {
    const input = { email: "anna@keller.ch", consent: true as const, tool: "x" };
    expect(await submitEmail(input, asFetch(vi.fn().mockResolvedValue(res(400))))).toEqual({ ok: false, reason: "invalid" });
    expect(await submitEmail(input, asFetch(vi.fn().mockResolvedValue(res(429))))).toEqual({ ok: false, reason: "rate_limited" });
    expect(await submitEmail(input, asFetch(vi.fn().mockResolvedValue(res(503))))).toEqual({ ok: false, reason: "network" });
    expect(await submitEmail(input, asFetch(vi.fn().mockRejectedValue(new Error("offline"))))).toEqual({ ok: false, reason: "network" });
  });
});

describe("sendResult", () => {
  const body = { tool: "x", eingabe: "Ein Text.", ausgabe: "Ein Ergebnis.", firma: "Malerei Keller" };
  it("schickt Werkzeug, Eingabe, Ausgabe und Firma an /api/result", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { ok: true }));
    expect(await sendResult(body, asFetch(f))).toBe("ok");
    expect(f.mock.calls[0][0]).toBe("/api/result");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual(body);
  });
  it("meldet «gate», wenn der Server keine Adresse kennt (403), sonst «failed»", async () => {
    expect(await sendResult(body, asFetch(vi.fn().mockResolvedValue(res(403))))).toBe("gate");
    expect(await sendResult(body, asFetch(vi.fn().mockResolvedValue(res(500))))).toBe("failed");
    expect(await sendResult(body, asFetch(vi.fn().mockRejectedValue(new Error("offline"))))).toBe("failed");
  });
});
