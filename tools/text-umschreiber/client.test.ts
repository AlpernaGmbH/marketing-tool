import { describe, expect, it, vi } from "vitest";
import { requestRewrite } from "./client";

const INPUT = { text: "Malerei Keller in Gossau streicht Wände und Fassaden.", styleId: "linkedin", anrede: "du" as const };

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("text-umschreiber: Aufruf von /api/text", () => {
  it("schickt Text, Stil und Anrede an die Route und liefert die geprüfte Fassung", async () => {
    const fetchImpl = reply(200, { ok: true, text: "Fertig.", warnings: ["Platzhalter ausfüllen: [Datum]."] });
    const outcome = await requestRewrite(INPUT, fetchImpl);
    expect(outcome).toEqual({ ok: true, text: "Fertig.", warnings: ["Platzhalter ausfüllen: [Datum]."] });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/text");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: INPUT.text, style: "linkedin", anrede: "du" });
    expect(init.credentials).toBe("same-origin");
  });

  it("übersetzt die Statuscodes der Route in Gründe", async () => {
    expect(await requestRewrite(INPUT, reply(401, { error: "not_signed_in" }))).toEqual({ ok: false, reason: "not_signed_in" });
    expect(await requestRewrite(INPUT, reply(403, { error: "gate" }))).toEqual({ ok: false, reason: "gate" });
    expect(await requestRewrite(INPUT, reply(429, { error: "account_limit" }))).toEqual({ ok: false, reason: "limit" });
    expect(await requestRewrite(INPUT, reply(429, { error: "rate_limited" }))).toEqual({ ok: false, reason: "rate" });
    expect(await requestRewrite(INPUT, reply(503, { error: "capacity" }))).toEqual({ ok: false, reason: "capacity" });
    expect(await requestRewrite(INPUT, reply(502, { error: "ai_failed" }))).toEqual({ ok: false, reason: "failed" });
  });

  it("wirft nie: Netzfehler und kaputte Antworten werden zu einem Grund", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await requestRewrite(INPUT, offline)).toEqual({ ok: false, reason: "network" });

    const broken = vi.fn(async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
    expect(await requestRewrite(INPUT, broken)).toEqual({ ok: false, reason: "failed" });
  });
});
