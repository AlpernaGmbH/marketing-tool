import { describe, expect, it } from "vitest";
import { fetchEinordnung, parseEinordnung } from "@/lib/check/ai-client";
import type { CheckResult } from "@/lib/check/types";

const result = { v: 1, score: 61, sig: "abc" } as unknown as CheckResult;
const einordnung = {
  zusammenfassung: "Die Grundlagen stehen, die grösste Lücke liegt beim Google-Profil.",
  prioritaeten: [{ schritt: "gbp-claimed", titel: "Google-Profil beanspruchen", text: "Das Profil ist die erste Anlaufstelle für lokale Suchen." }],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchOf = (res: Response | Error) => (async () => (res instanceof Error ? Promise.reject(res) : res)) as unknown as typeof fetch;

describe("parseEinordnung", () => {
  it("akzeptiert die Form des Servers", () => {
    expect(parseEinordnung(einordnung)).toEqual(einordnung);
  });

  it("verwirft Müll, leere Texte und falsche Typen", () => {
    for (const bad of [null, "x", 3, {}, { zusammenfassung: "", prioritaeten: [] }, { zusammenfassung: "ok", prioritaeten: "nein" }, { zusammenfassung: "ok", prioritaeten: [null] }, { zusammenfassung: "ok", prioritaeten: [{ schritt: "a", titel: "b", text: " " }] }]) {
      expect(parseEinordnung(bad)).toBeNull();
    }
  });

  it("kappt auf drei Prioritäten", () => {
    const p = einordnung.prioritaeten[0];
    expect(parseEinordnung({ ...einordnung, prioritaeten: [p, p, p, p, p] })?.prioritaeten).toHaveLength(3);
  });
});

describe("fetchEinordnung", () => {
  it("schickt das Ergebnis und liefert die Einordnung", async () => {
    let sent: { url: string; body: string } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      sent = { url, body: String(init.body) };
      return json({ ok: true, einordnung, cached: false });
    }) as unknown as typeof fetch;
    expect(await fetchEinordnung(result, f)).toEqual({ ok: true, einordnung });
    expect(sent).toMatchObject({ url: "/api/ai" });
    expect(JSON.parse(sent!.body)).toEqual({ result });
  });

  it("übersetzt Statuscodes in Gründe", async () => {
    expect(await fetchEinordnung(result, fetchOf(json({ error: "not_signed_in" }, 401)))).toEqual({ ok: false, reason: "not_signed_in" });
    expect(await fetchEinordnung(result, fetchOf(json({ error: "account_limit" }, 429)))).toEqual({ ok: false, reason: "limit" });
    expect(await fetchEinordnung(result, fetchOf(json({ error: "rate_limited" }, 429)))).toEqual({ ok: false, reason: "failed" });
    expect(await fetchEinordnung(result, fetchOf(json({ error: "capacity" }, 503)))).toEqual({ ok: false, reason: "capacity" });
    expect(await fetchEinordnung(result, fetchOf(json({ error: "ai_rejected" }, 502)))).toEqual({ ok: false, reason: "failed" });
    // Zugang v3: ohne Cookie antwortet die Route 403 «gate»; das heisst für den Browser «Adresse fehlt».
    expect(await fetchEinordnung(result, fetchOf(json({ error: "gate" }, 403)))).toEqual({ ok: false, reason: "not_signed_in" });
  });

  it("wirft nie: Netzfehler, kaputtes JSON und unbrauchbare Antworten werden zu «failed»", async () => {
    expect(await fetchEinordnung(result, fetchOf(new Error("offline")))).toEqual({ ok: false, reason: "failed" });
    expect(await fetchEinordnung(result, fetchOf(new Response("<html>", { status: 500 })))).toEqual({ ok: false, reason: "failed" });
    expect(await fetchEinordnung(result, fetchOf(json({ ok: true, einordnung: { zusammenfassung: 1 } })))).toEqual({ ok: false, reason: "failed" });
    expect(await fetchEinordnung(result, fetchOf(new Response("kein json", { status: 200 })))).toEqual({ ok: false, reason: "failed" });
  });
});
