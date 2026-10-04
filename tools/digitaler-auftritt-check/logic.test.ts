import { describe, expect, it } from "vitest";
import { sampleResult } from "@/lib/check/fixtures";
import type { CheckResult } from "@/lib/check/types";
import { toMarkdown } from "@/lib/export/model";
import {
  EMPTY_FORM,
  EMPTY_SAVED,
  buildInput,
  countItems,
  formProblem,
  host,
  industryFor,
  measurementNotes,
  parseCheckState,
  profilePatch,
  stufe,
  toDocument,
  type FormState,
} from "./logic";

let result: CheckResult;
const form = (over: Partial<FormState> = {}): FormState => ({ ...EMPTY_FORM, ...over });

describe("parseCheckState", () => {
  it("fällt bei Müll auf den Start zurück", () => {
    for (const bad of [null, undefined, "x", 3, [], {}]) expect(parseCheckState(bad)).toEqual(EMPTY_SAVED);
  });

  it("behält ein gültiges Ergebnis und zählt den Durchlauf als gezählt", async () => {
    result = await sampleResult();
    const saved = parseCheckState(JSON.parse(JSON.stringify({ v: 1, phase: "result", counted: true, form: EMPTY_FORM, result })));
    expect(saved.phase).toBe("result");
    expect(saved.counted).toBe(true);
    expect(saved.result?.score).toBe(result.score);
  });

  it("verwirft ein beschädigtes Ergebnis und behält die Formulardaten", () => {
    const saved = parseCheckState({ phase: "result", counted: true, result: { v: 1, score: "viel" }, form: { industry: "gastro" } });
    expect(saved.phase).toBe("intro");
    expect(saved.result).toBeUndefined();
    expect(saved.form.industry).toBe("gastro");
  });

  it("ignoriert den Zwischenstand der früheren Fragebogen-Version", () => {
    const saved = parseCheckState({ v: 1, phase: "result", step: 0, answers: { bausteine: ["website"] }, counted: true });
    expect(saved.phase).toBe("intro");
    expect(saved.counted).toBe(true);
  });

  it("säubert das Formular: unbekannte Branche und Häufigkeit fallen weg, lange Adressen werden gekürzt", () => {
    const saved = parseCheckState({
      form: { industry: "raumschiff", socials: { instagram: { url: "x".repeat(500), freq: "täglich" }, tiktok: { url: "tiktok.com/@a", freq: "weekly" }, myspace: { url: "x" } } },
    });
    expect(saved.form.industry).toBe("");
    expect(saved.form.socials.instagram.url).toHaveLength(300);
    expect(saved.form.socials.instagram.freq).toBe("");
    expect(saved.form.socials.tiktok).toEqual({ url: "tiktok.com/@a", freq: "weekly" });
    expect(Object.keys(saved.form.socials)).not.toContain("myspace");
  });
});

describe("Eingabe", () => {
  it("nimmt Firma, Ort und Website aus dem Profil", () => {
    const input = buildInput({ firma: " Malerei Keller ", ort: "Gossau", website: "malerei-keller.ch", branche: "Malerei" }, form());
    expect(input).toMatchObject({ company: "Malerei Keller", city: "Gossau", website: "malerei-keller.ch", industry: "craft" });
    expect(input.socials).toBeUndefined();
  });

  it("schlägt die Branche aus dem Profil vor, die Wahl des Besuchers geht vor", () => {
    expect(industryFor({ branche: "Restaurant" }, form())).toBe("gastro");
    expect(industryFor({ branche: "Restaurant" }, form({ industry: "hotel" }))).toBe("hotel");
    expect(industryFor({}, form())).toBe("");
  });

  it("übernimmt nur Kanäle mit Adresse und lässt eine leere Häufigkeit weg", () => {
    const f = form({ industry: "gastro" });
    f.socials = { ...f.socials, instagram: { url: " instagram.com/x ", freq: "weekly" }, facebook: { url: "facebook.com/x", freq: "" }, tiktok: { url: "  ", freq: "several" } };
    const input = buildInput({ firma: "A", website: "a.ch" }, f);
    expect(input.socials).toEqual({ instagram: { url: "instagram.com/x", freq: "weekly" }, facebook: { url: "facebook.com/x" } });
  });

  it("meldet fehlende Angaben der Reihe nach", () => {
    expect(formProblem(buildInput({}, form()))).toBe("Bitte gib den Firmennamen an.");
    expect(formProblem(buildInput({ firma: "A" }, form()))).toBe("Bitte gib eine Website an.");
    expect(formProblem(buildInput({ firma: "A", website: "a.ch" }, form()))).toContain("Branche");
    expect(formProblem(buildInput({ firma: "A", website: "a.ch" }, form({ industry: "other" })))).toBeNull();
  });
});

describe("Auswertung", () => {
  it("ordnet Stufen mit denselben Grenzen wie die übrigen Werkzeuge zu", () => {
    expect(stufe(80)).toBe("stark");
    expect(stufe(40)).toBe("ausbaufähig");
    expect(stufe(39)).toBe("Handlungsbedarf");
  });

  it("zählt gewertete Prüfpunkte ohne Hinweise und ohne Bereiche mit Gewicht 0", async () => {
    result = await sampleResult();
    const { ok, total } = countItems(result);
    expect(total).toBeGreaterThan(ok);
    expect(ok).toBeGreaterThan(0);
    const all = result.categories.flatMap((c) => c.items).length;
    expect(total).toBeLessThan(all); // Shop (Gewicht 0) und Hinweise fehlen
  });

  it("nennt Host ohne www", () => {
    expect(host("https://www.malerei-keller.ch/")).toBe("malerei-keller.ch");
    expect(host("kaputt")).toBe("kaputt");
  });

  it("sagt, was nicht gemessen ist", async () => {
    result = await sampleResult();
    const notes = measurementNotes(result).join("\n");
    expect(notes).toContain("nicht automatisch bestätigt");
    expect(notes).toContain("Social Media");
    expect(notes).toContain("Einschätzung von Alperna");
  });
});

describe("Profil", () => {
  it("ergänzt Branche und Kanäle nur, wo das Profil leer ist", async () => {
    result = await sampleResult();
    const patch = profilePatch({}, result);
    expect(patch.branche).toBe("Handwerk / Bau / Garten");
    expect(patch.kanaele).toEqual([{ name: "Instagram", url: "instagram.com/malereikeller" }]);
    expect(profilePatch({ branche: "Malerei", kanaele: [{ name: "Facebook" }] }, result)).toEqual({});
  });
});

describe("toDocument", () => {
  it("baut ein vollständiges Dokument mit Kopf, Tabellen und Hinweisen", async () => {
    result = await sampleResult();
    const doc = toDocument(result);
    expect(doc.title).toBe("Marketing-Check: Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.datum).toBe("04.10.2026");
    expect(doc.filename).toBe("marketing-check-malerei-keller");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(expect.arrayContaining(["Ergebnis", "Nächste Schritte", "Alle Prüfpunkte", "Hinweise zur Messung", "Website und SEO"]));
    const steps = doc.blocks.find((b) => b.type === "table" && b.header[0] === "Nr.");
    expect(steps && steps.type === "table" ? steps.rows.length : 0).toBe(result.massnahmen.length);
  });

  it("erzeugt Markdown ohne «undefined» und ohne Verbotenes", async () => {
    result = await sampleResult();
    const md = toMarkdown(toDocument(result));
    expect(md).not.toMatch(/undefined|NaN|\[object/);
    expect(md).not.toContain("—");
    expect(md).toContain(`${result.score} von 100 Punkten`);
  });

  it("meldet in der Gesamtzeile den Bereich ohne Gewicht nicht als Bereich der Punktetabelle", async () => {
    result = await sampleResult({ industry: "craft" });
    const table = toDocument(result).blocks.find((b) => b.type === "table" && b.header[0] === "Bereich");
    const rows = table && table.type === "table" ? table.rows.map((r) => r[0]) : [];
    expect(rows).not.toContain("Online-Shop");
    expect(rows).toContain("Website und SEO");
  });

  it("schreibt bei leerer Massnahmenliste einen Satz statt einer Tabelle", async () => {
    result = await sampleResult();
    const doc = toDocument({ ...result, massnahmen: [] });
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text.includes("nichts Dringendes"))).toBe(true);
  });
});
