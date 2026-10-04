import { describe, expect, it, vi } from "vitest";
import { parseReadResponse, readWebsite } from "@/lib/read-client";

const PAGE = { url: "https://keller.ch/", host: "keller.ch", title: "Keller", description: "", headings: [], text: "Hallo", truncated: false };
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const asFetch = (f: unknown) => f as typeof fetch;

describe("readWebsite", () => {
  it("schickt die Adresse an /api/read und liefert die Seite", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { ok: true, page: PAGE }));
    expect(await readWebsite("keller.ch", asFetch(f))).toEqual({ ok: true, page: PAGE });
    expect(f.mock.calls[0][0]).toBe("/api/read");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ website: "keller.ch" });
  });
  it("meldet Netzfehler mit Satz, ohne zu werfen", async () => {
    const out = await readWebsite("keller.ch", asFetch(vi.fn().mockRejectedValue(new Error("offline"))));
    expect(out).toMatchObject({ ok: false, reason: "network" });
  });
});

describe("parseReadResponse", () => {
  it("übersetzt Statuscodes und nimmt die Meldung des Servers, wenn es eine gibt", () => {
    expect(parseReadResponse(403, { error: "gate" })).toMatchObject({ reason: "gate" });
    expect(parseReadResponse(429, {})).toMatchObject({ reason: "rate" });
    expect(parseReadResponse(400, { error: "invalid", message: "Keine IP-Adresse." })).toEqual({ ok: false, reason: "invalid", message: "Keine IP-Adresse." });
    expect(parseReadResponse(400, { error: "blocked", message: "Intern." })).toMatchObject({ reason: "unreachable", message: "Intern." });
    expect(parseReadResponse(502, { error: "unreachable", message: "Fehler 503." })).toMatchObject({ reason: "unreachable", message: "Fehler 503." });
    expect(parseReadResponse(502, { error: "failed" })).toMatchObject({ reason: "failed" });
    expect(parseReadResponse(200, { ok: true, page: { kaputt: true } })).toMatchObject({ reason: "failed" });
  });
});
