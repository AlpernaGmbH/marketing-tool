import { describe, expect, it, vi } from "vitest";
import { checkAccess, completeRun, submitLead, unlockWithAccount } from "@/lib/access-client";

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const asFetch = (f: unknown) => f as typeof fetch;

describe("checkAccess", () => {
  it("gibt die Antwort der Route weiter", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { allowed: false, unlocked: false, reason: "free_run_used" }));
    expect(await checkAccess("x", asFetch(f))).toEqual({ allowed: false, unlocked: false, reason: "free_run_used", login: null, signedIn: false });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tool: "x" });
  });
  it("erlaubt bei Netzwerkfehler, 429, 500 und kaputter Antwort (nie wegen Technik blockieren)", async () => {
    for (const f of [
      vi.fn().mockRejectedValue(new Error("offline")),
      vi.fn().mockResolvedValue(res(429)),
      vi.fn().mockResolvedValue(res(500)),
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => Promise.reject(new Error("kein json")) }),
    ]) {
      expect((await checkAccess("x", asFetch(f))).allowed).toBe(true);
    }
  });
});

describe("completeRun", () => {
  it("gibt zurück, ob der Besucher freigeschaltet ist", async () => {
    expect(await completeRun("x", asFetch(vi.fn().mockResolvedValue(res(200, { ok: true, unlocked: true }))))).toBe(true);
    expect(await completeRun("x", asFetch(vi.fn().mockResolvedValue(res(200, { ok: true, unlocked: false }))))).toBe(false);
  });
  it("wirft nie", async () => {
    expect(await completeRun("x", asFetch(vi.fn().mockRejectedValue(new Error("offline"))))).toBe(false);
    expect(await completeRun("x", asFetch(vi.fn().mockResolvedValue(res(500))))).toBe(false);
  });
});

describe("submitLead", () => {
  it("unterscheidet Erfolg, Validierung, Limit und Netzwerk", async () => {
    expect(await submitLead({}, asFetch(vi.fn().mockResolvedValue(res(200))))).toEqual({ ok: true });
    expect(await submitLead({}, asFetch(vi.fn().mockResolvedValue(res(400))))).toEqual({ ok: false, reason: "invalid" });
    expect(await submitLead({}, asFetch(vi.fn().mockResolvedValue(res(429))))).toEqual({ ok: false, reason: "rate_limited" });
    expect(await submitLead({}, asFetch(vi.fn().mockResolvedValue(res(502))))).toEqual({ ok: false, reason: "network" });
    expect(await submitLead({}, asFetch(vi.fn().mockRejectedValue(new Error("offline"))))).toEqual({ ok: false, reason: "network" });
  });
});

describe("checkAccess mit Konto", () => {
  it("übernimmt Anmeldeweg und Sitzung, kennt aber nur «clerk»", async () => {
    const ok = vi.fn().mockResolvedValue(res(200, { allowed: false, unlocked: false, reason: "free_run_used", login: "clerk", signedIn: true }));
    expect(await checkAccess("x", asFetch(ok))).toMatchObject({ login: "clerk", signedIn: true });
    const other = vi.fn().mockResolvedValue(res(200, { allowed: true, unlocked: false, reason: "free_run", login: "apple", signedIn: "ja" }));
    expect(await checkAccess("x", asFetch(other))).toMatchObject({ login: null, signedIn: false });
  });
});

describe("unlockWithAccount", () => {
  it("sendet Werkzeug, Einwilligung und Firma an die Konto-Route", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { ok: true }));
    expect(await unlockWithAccount("x", "Malerei Keller", asFetch(f))).toBe("ok");
    expect(f.mock.calls[0][0]).toBe("/api/lead/account");
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tool: "x", consent: true, firma: "Malerei Keller" });
  });
  it("lässt die Firma weg, wenn sie fehlt", async () => {
    const f = vi.fn().mockResolvedValue(res(200, { ok: true }));
    await unlockWithAccount("x", undefined, asFetch(f));
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ tool: "x", consent: true });
  });
  it("unterscheidet «nicht angemeldet» von Fehlern", async () => {
    expect(await unlockWithAccount("x", undefined, asFetch(vi.fn().mockResolvedValue(res(401))))).toBe("not_signed_in");
    expect(await unlockWithAccount("x", undefined, asFetch(vi.fn().mockResolvedValue(res(500))))).toBe("failed");
    expect(await unlockWithAccount("x", undefined, asFetch(vi.fn().mockRejectedValue(new Error("offline"))))).toBe("failed");
  });
});
