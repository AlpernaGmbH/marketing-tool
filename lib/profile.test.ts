import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_BYTES,
  exportFilename,
  exportProfile,
  importProfile,
  isProfileEmpty,
  mergeProfile,
  profileLabel,
  sanitizeProfile,
} from "@/lib/profile";

describe("sanitizeProfile", () => {
  it("behält gültige Felder", () => {
    const p = sanitizeProfile({ organisationstyp: "kmu", firma: "Malerei Keller", ort: "Gossau", kanton: "SG" });
    expect(p).toEqual({ organisationstyp: "kmu", firma: "Malerei Keller", ort: "Gossau", kanton: "SG" });
  });
  it("wirft ungültige Felder einzeln weg, nicht das ganze Profil", () => {
    const p = sanitizeProfile({ firma: "Keller", kanton: "St. Gallen", organisationstyp: "firma", budgetJahr: -5 });
    expect(p).toEqual({ firma: "Keller" });
  });
  it("entfernt unbekannte Felder (kein Einschleusen fremder Daten)", () => {
    const p = sanitizeProfile({ firma: "Keller", __proto__: { x: 1 }, admin: true, constructor: "x" });
    expect(Object.keys(p)).toEqual(["firma"]);
  });
  it("liefert bei Müll ein leeres Profil", () => {
    for (const bad of [null, undefined, "text", 42, [], [{ firma: "x" }]]) expect(sanitizeProfile(bad)).toEqual({});
  });
  it("prüft Listen und verschachtelte Felder", () => {
    const ok = sanitizeProfile({ zielgruppen: [{ name: "Hausbesitzer", kriterien: ["a"] }], marke: { werte: ["Handwerk"] } });
    expect(ok.zielgruppen?.[0].name).toBe("Hausbesitzer");
    expect(ok.marke?.werte).toEqual(["Handwerk"]);
    expect(sanitizeProfile({ zielgruppen: [{ beschreibung: "ohne Name" }] })).toEqual({});
    expect(sanitizeProfile({ personas: Array.from({ length: 11 }, () => ({ name: "x" })) })).toEqual({});
  });
  it("lehnt überlange Texte ab", () => {
    expect(sanitizeProfile({ firma: "x".repeat(201) })).toEqual({});
  });
});

describe("isProfileEmpty", () => {
  it("erkennt leere Profile", () => {
    expect(isProfileEmpty({})).toBe(true);
    expect(isProfileEmpty({ firma: "  ", zielgruppen: [] })).toBe(true);
    expect(isProfileEmpty({ firma: "Keller" })).toBe(false);
    expect(isProfileEmpty({ budgetJahr: 0 })).toBe(false);
  });
});

describe("mergeProfile", () => {
  it("setzt, überschreibt und entfernt Felder", () => {
    const a = mergeProfile({ firma: "A", ort: "Gossau" }, { firma: "B", kanton: "SG" });
    expect(a).toEqual({ firma: "B", ort: "Gossau", kanton: "SG" });
    expect(mergeProfile(a, { ort: undefined })).toEqual({ firma: "B", kanton: "SG" });
  });
  it("lässt ungültige Änderungen nicht durch", () => {
    expect(mergeProfile({ firma: "A" }, { kanton: "xx" })).toEqual({ firma: "A" });
  });
});

describe("Export und Import", () => {
  const profile = { organisationstyp: "verein" as const, firma: "FC Trogen", ort: "Trogen", kanton: "AR" };

  it("macht aus Export und Import denselben Stand", () => {
    const text = exportProfile(profile, new Date("2026-10-03T08:00:00Z"));
    expect(JSON.parse(text).version).toBe(1);
    const r = importProfile(text);
    expect(r).toEqual({ ok: true, profile, ignored: 0 });
  });
  it("akzeptiert auch ein nacktes Profil ohne Wrapper", () => {
    const r = importProfile(JSON.stringify(profile));
    expect(r.ok && r.profile).toEqual(profile);
  });
  it("zählt ignorierte Felder", () => {
    const r = importProfile(JSON.stringify({ ...profile, kanton: "xx", schrott: 1 }));
    expect(r.ok && r.ignored).toBe(2);
  });
  it("gibt verständliche Fehler bei kaputten Dateien", () => {
    expect(importProfile("{kaputt")).toEqual({ ok: false, error: "Das ist keine gültige JSON-Datei." });
    expect(importProfile("[]")).toEqual({ ok: false, error: "In der Datei steht kein Firmenprofil." });
    expect(importProfile("{}")).toEqual({ ok: false, error: "In der Datei steht kein Firmenprofil." });
    expect(importProfile(JSON.stringify({ profile: { schrott: 1 } }))).toEqual({ ok: false, error: "In der Datei steht kein Firmenprofil." });
  });
  it("lehnt zu grosse Dateien ab, ohne sie zu parsen", () => {
    const r = importProfile(" ".repeat(MAX_IMPORT_BYTES + 1));
    expect(r.ok).toBe(false);
  });
  it("benennt die Datei mit Datum", () => {
    expect(exportFilename(new Date("2026-10-03T08:00:00Z"))).toBe("alperna-firmenprofil-2026-10-03.json");
  });
});

describe("profileLabel", () => {
  it("kombiniert Firma und Ort", () => {
    expect(profileLabel({ firma: "Malerei Keller", ort: "Gossau" })).toBe("Malerei Keller, Gossau");
    expect(profileLabel({ firma: "Malerei Keller" })).toBe("Malerei Keller");
    expect(profileLabel({ ort: "Gossau" })).toBeNull();
    expect(profileLabel({})).toBeNull();
  });
});
