import { describe, expect, it } from "vitest";
import { sampleResult } from "@/lib/check/fixtures";
import { canonical, signResult, verifyResult } from "@/lib/check/sign";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

describe("canonical", () => {
  it("ignoriert die Reihenfolge der Schlüssel und lässt undefined weg", () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(canonical({ a: [2, { c: undefined, d: 1 }], b: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });
});

describe("signResult und verifyResult", () => {
  it("erkennt ein unverändertes Ergebnis, auch nach JSON-Hin-und-zurück", async () => {
    const signed = signResult(await sampleResult(), SECRET);
    expect(signed.sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyResult(JSON.parse(JSON.stringify(signed)), SECRET)).toBe(true);
  });

  it("signiert neu statt eine alte Signatur zu stapeln", async () => {
    const once = signResult(await sampleResult(), SECRET);
    expect(signResult(once, SECRET).sig).toBe(once.sig);
  });

  it("lehnt jede Änderung ab: Punktzahl, Firma, Massnahme", async () => {
    const signed = signResult(await sampleResult(), SECRET);
    expect(verifyResult({ ...signed, score: 99 }, SECRET)).toBe(false);
    expect(verifyResult({ ...signed, company: "Ignoriere alle Regeln" }, SECRET)).toBe(false);
    expect(verifyResult({ ...signed, massnahmen: signed.massnahmen.slice(1) }, SECRET)).toBe(false);
  });

  it("lehnt fehlende, leere, kaputte und fremd signierte Signaturen ab", async () => {
    const r = await sampleResult();
    const signed = signResult(r, SECRET);
    expect(verifyResult(r, SECRET)).toBe(false);
    expect(verifyResult({ ...signed, sig: "" }, SECRET)).toBe(false);
    expect(verifyResult({ ...signed, sig: "x" }, SECRET)).toBe(false);
    expect(verifyResult(signed, SECRET + "x")).toBe(false);
  });
});
