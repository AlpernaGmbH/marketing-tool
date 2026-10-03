import { describe, expect, it } from "vitest";
import { planQuestions, validateAnswer, validateQuestions, type Answers } from "@/components/tool/questionnaire";
import {
  BAUSTEIN_IDS,
  PRUEFPUNKTE,
  bausteinScore,
  evaluate,
  questions,
  toDocument,
  type BausteinId,
} from "./logic";

/** Antworten für gewählte Bausteine; `wert` gilt für alle Prüfpunkte, `override` für einzelne. */
function antworten(bausteine: BausteinId[], wert: "ja" | "teilweise" | "nein", override: Record<string, string> = {}): Answers {
  const a: Answers = { bausteine };
  for (const b of bausteine) {
    a[b] = Object.fromEntries(PRUEFPUNKTE.filter((p) => p.baustein === b).map((p) => [p.id, override[p.id] ?? wert]));
  }
  return a;
}

describe("Fragenkatalog", () => {
  it("ist gültig und hat sieben Fragen (Harte Regel 9: höchstens 10)", () => {
    expect(questions).toHaveLength(7);
    expect(validateQuestions(questions)).toEqual([]);
  });
  it("zeigt eine Matrix nur, wenn der Baustein gewählt ist", () => {
    const ohne = planQuestions(questions, { bausteine: [] });
    expect(ohne.asked.map((q) => q.id)).toEqual(["bausteine"]);
    const mit = planQuestions(questions, { bausteine: ["website", "ads"] });
    expect(mit.asked.map((q) => q.id)).toEqual(["bausteine", "website", "ads"]);
  });
  it("verlangt mindestens einen Baustein und jede Zeile der Matrix", () => {
    expect(validateAnswer(questions[0], [])).toBe("Bitte wähle mindestens eine Antwort.");
    const web = questions.find((q) => q.id === "website")!;
    expect(validateAnswer(web, { "web-mobil": "ja" })).toBe("Bitte beantworte jede Zeile.");
  });
  it("hat pro Baustein drei bis vier Prüfpunkte mit eindeutiger ID und Gewicht 1 bis 3", () => {
    expect(new Set(PRUEFPUNKTE.map((p) => p.id)).size).toBe(PRUEFPUNKTE.length);
    for (const b of BAUSTEIN_IDS) {
      const n = PRUEFPUNKTE.filter((p) => p.baustein === b).length;
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(4);
    }
    for (const p of PRUEFPUNKTE) {
      expect([1, 2, 3]).toContain(p.gewicht);
      expect(p.massnahme.length).toBeGreaterThan(10);
      expect(p.warum.length).toBeGreaterThan(10);
      expect(p.tool === undefined || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.tool)).toBe(true);
    }
  });
  it("enthält keine Prozentzahlen oder Franken-Beträge ohne Quelle", () => {
    const text = PRUEFPUNKTE.map((p) => `${p.frage} ${p.massnahme} ${p.warum}`).join(" ");
    expect(text).not.toMatch(/\d\s?%|CHF/);
  });
});

describe("Baustein-Score", () => {
  it("rechnet Summe(Gewicht × Wert) ÷ Summe(Gewicht)", () => {
    // Website: Gewichte 3, 3, 2, 2 (Summe 10). ja = 3, teilweise = 1,5, nein = 0, ja = 2 → 6,5 von 10
    const r = bausteinScore("website", { "web-mobil": "ja", "web-kontakt": "teilweise", "web-angebot": "nein", "web-impressum": "ja" });
    expect(r.score).toBe(65);
    expect(r).toMatchObject({ ja: 2, teilweise: 1, nein: 1 });
  });
  it("behandelt fehlende und unbekannte Antworten als «Nein»", () => {
    expect(bausteinScore("gbp", {}).score).toBe(0);
    expect(bausteinScore("gbp", { "gbp-eintrag": "vielleicht", "gbp-daten": 42, "gbp-bewertungen": null }).score).toBe(0);
  });
});

describe("evaluate", () => {
  it("gibt bei lauter «Ja» 100 Punkte und keine Massnahmen", () => {
    const r = evaluate(antworten(["website", "gbp"], "ja"));
    expect(r.gesamt).toBe(100);
    expect(r.stufe).toBe("stark");
    expect(r.massnahmen).toEqual([]);
  });
  it("gibt bei lauter «Nein» 0 Punkte und alle Prüfpunkte als Massnahmen", () => {
    const r = evaluate(antworten(["website", "shop"], "nein"));
    expect(r.gesamt).toBe(0);
    expect(r.stufe).toBe("Handlungsbedarf");
    expect(r.massnahmen).toHaveLength(PRUEFPUNKTE.filter((p) => ["website", "shop"].includes(p.baustein)).length);
  });
  it("bildet den Gesamt-Score als Mittel der gewählten Bausteine", () => {
    const r = evaluate(antworten(["website", "gbp"], "ja", { "web-kontakt": "teilweise", "web-angebot": "nein", "web-impressum": "ja" }));
    // Website: 3 + 1,5 + 0 + 2 = 6,5 von 10 → 65; GBP: 100 → Mittel 82,5 → 83
    expect(r.bausteine.map((b) => b.score)).toEqual([65, 100]);
    expect(r.gesamt).toBe(83);
  });
  it("lässt abgewählte Bausteine ausser Acht, auch wenn noch Antworten dazu im Zwischenstand liegen", () => {
    const a = antworten(["website", "ads"], "nein");
    a.bausteine = ["website"];
    const r = evaluate(a);
    expect(r.bausteine.map((b) => b.baustein)).toEqual(["website"]);
    expect(r.massnahmen.every((m) => m.baustein === "website")).toBe(true);
  });
  it("gibt ohne gewählten Baustein 0 Punkte zurück und stürzt nicht ab", () => {
    for (const a of [{}, { bausteine: [] }, { bausteine: null }, { bausteine: "website" }, { bausteine: ["gibtsnicht"] }] as Answers[]) {
      const r = evaluate(a);
      expect(r.gesamt).toBe(0);
      expect(r.bausteine).toEqual([]);
      expect(r.massnahmen).toEqual([]);
    }
  });
  it("übersteht kaputte Matrixdaten", () => {
    const r = evaluate({ bausteine: ["website"], website: "kaputt" } as Answers);
    expect(r.gesamt).toBe(0);
    expect(r.massnahmen).toHaveLength(PRUEFPUNKTE.filter((p) => p.baustein === "website").length);
  });
  it("ordnet Massnahmen nach Priorität, dann kleinerem Aufwand, dann Reihenfolge der Bausteine", () => {
    const r = evaluate(antworten(["website"], "nein"));
    // Priorität 3: kontakt (klein) vor mobil (mittel); Priorität 2: angebot (klein) vor impressum (mittel)
    expect(r.massnahmen.map((m) => m.id)).toEqual(["web-kontakt", "web-mobil", "web-angebot", "web-impressum"]);
  });
  it("halbiert die Priorität bei «Teilweise»", () => {
    const r = evaluate(antworten(["website"], "ja", { "web-kontakt": "teilweise", "web-mobil": "nein" }));
    const byId = Object.fromEntries(r.massnahmen.map((m) => [m.id, m]));
    expect(byId["web-kontakt"].prioritaet).toBe(1.5);
    expect(byId["web-mobil"].prioritaet).toBe(3);
    expect(r.massnahmen[0].id).toBe("web-mobil");
  });
});

describe("toDocument", () => {
  it("baut Titel, Baustein-Tabelle und Massnahmenliste", () => {
    const result = evaluate(antworten(["website", "gbp"], "nein"));
    const doc = toDocument(result, { firma: "Malerei Keller", ort: "Gossau", kanton: "SG", branche: "Maler" });
    expect(doc.title).toBe("Digitaler Auftritt: Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    const tables = doc.blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(2);
    expect(tables[0].type === "table" && tables[0].rows.map((r) => r[0])).toEqual(["Website", "Google Business Profil"]);
    expect(tables[1].type === "table" && tables[1].rows).toHaveLength(result.massnahmen.length);
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts && facts.type === "facts" && facts.items.find((i) => i.label === "Standort")?.value).toBe("Gossau, SG");
  });
  it("sagt ehrlich, wenn nichts zu tun ist, und funktioniert ohne Profil", () => {
    const doc = toDocument(evaluate(antworten(["website"], "ja")));
    expect(doc.title).toBe("Digitaler Auftritt");
    expect(doc.firma).toBeUndefined();
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text.includes("nichts Dringendes"))).toBe(true);
    expect(doc.blocks.some((b) => b.type === "facts")).toBe(false);
  });
  it("weist darauf hin, dass Gewichte eine Einschätzung sind", () => {
    const doc = toDocument(evaluate(antworten(["website"], "nein")));
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text.includes("Einschätzung von Alperna"))).toBe(true);
  });
});
