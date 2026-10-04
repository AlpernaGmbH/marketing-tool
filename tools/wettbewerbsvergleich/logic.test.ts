import { describe, expect, it } from "vitest";
import { sampleResult } from "@/lib/check/fixtures";
import type { CheckResult } from "@/lib/check/types";
import { toMarkdown } from "@/lib/export/model";
import {
  CHECKS_PER_HOUR,
  EMPTY_FORM,
  EMPTY_SAVED,
  MAX_COMPETITORS,
  checkInputFor,
  compare,
  diffText,
  eingabeText,
  failedSite,
  industryFor,
  measurementNotes,
  normalizeHost,
  parseState,
  summarize,
  toDocument,
  validate,
  type ComparisonResult,
  type FormState,
  type SiteSummary,
} from "./logic";

const form = (over: Partial<FormState> = {}): FormState => ({ ...EMPTY_FORM, ...over });
const profile = { firma: "Malerei Keller", website: "malerei-keller.ch", ort: "Gossau", branche: "Malerei" };

let own: CheckResult;
const ownSummary = async () => summarize(own ?? (own = await sampleResult({ socials: undefined })), true);

/** Mitbewerber mit frei gesetzten Punkten je Bereich (Beispielwerte für Tests). */
function competitor(host: string, scores: Partial<Record<string, number>>, base: SiteSummary): SiteSummary {
  const total = base.categories.reduce((s, c) => s + c.weight, 0);
  const categories = base.categories.map((c) => ({ ...c, score: scores[c.id] ?? c.score }));
  const score = Math.round(categories.reduce((s, c) => s + (c.score / 100) * c.weight, 0) / total * 100);
  return { host, name: host, own: false, score, categories };
}

async function sampleComparison(): Promise<ComparisonResult> {
  const me = await ownSummary();
  return {
    checkedAt: "2026-10-04T10:00:00Z",
    industry: "craft",
    sites: [
      me,
      competitor("malerei-brunner.ch", { seo: 90, gbp: 25, social: 0, sea: 40 }, me),
      failedSite({ host: "maler-steiner.ch", url: "https://maler-steiner.ch/", name: "maler-steiner.ch", own: false }, "Die Website konnte nicht geladen werden. Stimmt die Adresse?"),
    ],
  };
}

describe("normalizeHost", () => {
  it("ergänzt https, schneidet www ab und schreibt den Host klein", () => {
    expect(normalizeHost(" www.Malerei-Keller.ch/ ")).toEqual({ ok: true, host: "malerei-keller.ch", url: "https://www.malerei-keller.ch/" });
    expect(normalizeHost("http://keller.ch/kontakt")).toMatchObject({ ok: true, host: "keller.ch" });
  });

  it("lehnt leere, fremde, IP- und Zugangsdaten-Adressen ab", () => {
    expect(normalizeHost("")).toMatchObject({ ok: false, message: "Bitte gib eine Website an." });
    expect(normalizeHost("ftp://keller.ch")).toMatchObject({ ok: false, message: expect.stringContaining("http") });
    expect(normalizeHost("192.168.1.1")).toMatchObject({ ok: false, message: expect.stringContaining("IP-Adresse") });
    expect(normalizeHost("[::1]")).toMatchObject({ ok: false, message: expect.stringContaining("IP-Adresse") });
    expect(normalizeHost("https://user:pw@keller.ch")).toMatchObject({ ok: false, message: expect.stringContaining("Zugangsdaten") });
    expect(normalizeHost("localhost")).toMatchObject({ ok: false });
    expect(normalizeHost("keller.")).toMatchObject({ ok: false });
    expect(normalizeHost("https://")).toMatchObject({ ok: false });
  });
});

describe("validate", () => {
  it("verlangt die eigene Website zuerst", () => {
    expect(validate({}, form({ competitors: ["a.ch", "", ""] }))).toEqual({ ok: false, message: "Deine Website: Bitte gib eine Website an." });
    expect(validate({ website: "10.0.0.1" }, form({ competitors: ["a.ch", "", ""] }))).toMatchObject({ ok: false, message: expect.stringContaining("Deine Website") });
  });

  it("verlangt die Branche, schlägt sie aber aus dem Profil vor", () => {
    expect(validate({ website: "keller.ch" }, form({ competitors: ["a.ch", "", ""] }))).toMatchObject({ ok: false, message: expect.stringContaining("Branche") });
    expect(industryFor(profile, form())).toBe("craft");
    expect(industryFor(profile, form({ industry: "gastro" }))).toBe("gastro");
    expect(industryFor({}, form())).toBe("");
    expect(validate(profile, form({ competitors: ["a.ch", "", ""] }))).toMatchObject({ ok: true, industry: "craft" });
  });

  it("verlangt mindestens einen und höchstens drei Mitbewerber", () => {
    expect(validate(profile, form())).toEqual({ ok: false, message: "Bitte gib mindestens einen Mitbewerber an." });
    expect(validate(profile, form({ competitors: ["  ", "", ""] }))).toMatchObject({ ok: false, message: expect.stringContaining("mindestens") });
    expect(validate(profile, form({ competitors: ["a.ch", "b.ch", "c.ch", "d.ch"] }))).toMatchObject({ ok: false, message: expect.stringContaining(String(MAX_COMPETITORS)) });
  });

  it("meldet doppelte Hosts und die eigene Website unter den Mitbewerbern mit der Feldnummer", () => {
    expect(validate(profile, form({ competitors: ["a.ch", "https://www.A.ch/", ""] }))).toEqual({ ok: false, message: "Mitbewerber 2: a.ch steht schon in der Liste." });
    expect(validate(profile, form({ competitors: ["", "www.malerei-keller.ch", ""] }))).toEqual({ ok: false, message: "Mitbewerber 2: Das ist deine eigene Website." });
    expect(validate(profile, form({ competitors: ["a.ch", "kaputt", ""] }))).toMatchObject({ ok: false, message: expect.stringMatching(/^Mitbewerber 2: /) });
  });

  it("liefert die Websites in Prüfreihenfolge, eigene zuerst, leere Felder übersprungen", () => {
    const v = validate(profile, form({ competitors: ["", "www.brunner.ch", "steiner.ch/"] }));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.sites.map((s) => [s.host, s.own, s.name])).toEqual([
      ["malerei-keller.ch", true, "Malerei Keller"],
      ["brunner.ch", false, "brunner.ch"],
      ["steiner.ch", false, "steiner.ch"],
    ]);
    const input = checkInputFor(v.sites[1], v.industry, profile);
    // Fremde Websites beachten robots.txt (respectRobots), die eigene nicht.
    expect(input).toEqual({ company: "brunner.ch", city: "Gossau", industry: "craft", website: "https://www.brunner.ch/", socials: {}, respectRobots: true });
    expect(checkInputFor(v.sites[0], v.industry, profile).respectRobots).toBe(false);
    // Ohne Firma im Profil steht der Host als Name.
    const noName = validate({ website: "keller.ch" }, form({ industry: "craft", competitors: ["a.ch", "", ""] }));
    expect(noName.ok && noName.sites[0].name).toBe("keller.ch");
  });
});

describe("summarize", () => {
  it("fasst ein Check-Ergebnis kompakt zusammen, mit höchstens fünf Schritten nur bei der eigenen Website", async () => {
    const me = await ownSummary();
    expect(me.host).toBe("malerei-keller.ch");
    expect(me.name).toBe("Malerei Keller");
    expect(me.own).toBe(true);
    expect(me.score).toBe(own.score);
    expect(me.categories.map((c) => c.id)).toEqual(["seo", "gbp", "social", "sea", "newsletter", "shop", "booking"]);
    for (const c of me.categories) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(c.score)).toBe(true);
    }
    expect(me.categories.find((c) => c.id === "gbp")?.verified).toBe(false);
    expect(me.massnahmen?.length).toBeLessThanOrEqual(5);
    expect(me.massnahmen?.[0]).toEqual({ itemId: own.massnahmen[0].itemId, titel: own.massnahmen[0].titel, wirkung: own.massnahmen[0].wirkung, aufwand: own.massnahmen[0].aufwand });
    expect(summarize(own, false).massnahmen).toBeUndefined();
    expect(JSON.stringify(me).length).toBeLessThan(JSON.stringify(own).length / 3);
  });
});

describe("compare", () => {
  it("findet Vorsprung, Rückstand und Gleichstand je Bereich mit Gewicht, gegen den besten Mitbewerber", async () => {
    const me = await ownSummary();
    // Die Beispielseite verlinkt Instagram (Social > 0) und hat kein Tracking (Werbung 0).
    const social = me.categories.find((c) => c.id === "social")!.score;
    expect(social).toBeGreaterThan(0);
    const a = competitor("a.ch", { seo: 90, gbp: 10, social: 0, sea: 0 }, me);
    const b = competitor("b.ch", { seo: 50, gbp: 60, social: social - 1, sea: 0 }, me);
    const cmp = compare([me, a, b]);
    expect(cmp.possible).toBe(true);
    const by = (list: typeof cmp.ahead, id: string) => list.find((d) => d.id === id);
    expect(by(cmp.behind, "seo")).toMatchObject({ best: 90, bestHost: "a.ch", delta: me.categories[0].score - 90 });
    expect(by(cmp.behind, "gbp")).toMatchObject({ best: 60, bestHost: "b.ch" });
    expect(by(cmp.ahead, "social")).toMatchObject({ own: social, best: social - 1, bestHost: "b.ch", delta: 1 });
    expect(by(cmp.even, "sea")).toMatchObject({ own: 0, best: 0 });
    expect(by(cmp.even, "newsletter")).toBeDefined();
    // Online-Shop zählt im Handwerk nicht (Gewicht 0) und erscheint nirgends.
    expect([...cmp.ahead, ...cmp.behind, ...cmp.even].map((d) => d.id)).not.toContain("shop");
    // Grösster Rückstand zuerst.
    expect(cmp.behind.map((d) => d.delta)).toEqual([...cmp.behind.map((d) => d.delta)].sort((x, y) => x - y));
    expect(cmp.bestHost).toBe([a, b].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0].host);
  });

  it("gibt ohne eigenes Ergebnis oder ohne erreichbaren Mitbewerber keinen Vergleich", async () => {
    const me = await ownSummary();
    const down = failedSite({ host: "a.ch", url: "https://a.ch/", name: "a.ch", own: false }, "weg");
    expect(compare([me, down])).toMatchObject({ possible: false, ahead: [], behind: [], ownScore: me.score, bestScore: null, bestHost: null });
    const meDown = failedSite({ host: "keller.ch", url: "https://keller.ch/", name: "Keller", own: true }, "weg");
    const a = competitor("a.ch", { seo: 90 }, me);
    expect(compare([meDown, a])).toMatchObject({ possible: false, ownScore: null, bestScore: a.score, bestHost: "a.ch" });
  });

  it("formuliert Vorsprung und Rückstand als feste Sätze", () => {
    const d = { id: "seo" as const, title: "Website und SEO", own: 76, best: 58, bestHost: "a.ch", delta: 18 };
    expect(diffText(d)).toBe("Website und SEO: du 76, bester Mitbewerber 58 (a.ch). Vorsprung 18 Punkte.");
    expect(diffText({ ...d, own: 57, delta: -1 })).toBe("Website und SEO: du 57, bester Mitbewerber 58 (a.ch). Rückstand 1 Punkt.");
  });
});

describe("toDocument", () => {
  it("baut Tabelle und Markdown mit allen Websites und Bereichen; eine ausgefallene Website steht als «nicht erreichbar»", async () => {
    const result = await sampleComparison();
    const doc = toDocument(result);
    expect(doc.title).toBe("Wettbewerbsvergleich: Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.datum).toBe("04.10.2026");
    expect(doc.filename).toBe("wettbewerbsvergleich-malerei-keller");

    const table = doc.blocks.find((b) => b.type === "table");
    expect(table?.type).toBe("table");
    if (table?.type !== "table") return;
    expect(table.header).toEqual(["Bereich", "malerei-keller.ch (du)", "malerei-brunner.ch", "maler-steiner.ch"]);
    expect(table.rows[0]).toEqual(["Gesamt", String(result.sites[0].score), String(result.sites[1].score), "nicht erreichbar"]);
    const weighted = result.sites[0].categories.filter((c) => c.weight > 0).map((c) => c.title);
    expect(table.rows.slice(1).map((r) => r[0])).toEqual(weighted);
    expect(table.rows.map((r) => r[0])).not.toContain("Online-Shop");
    for (const row of table.rows) expect(row[3]).toBe("nicht erreichbar");

    const md = toMarkdown(doc);
    expect(md).not.toMatch(/undefined|NaN|\[object/);
    expect(md).not.toContain("—");
    for (const s of result.sites) expect(md).toContain(s.host);
    for (const title of weighted) expect(md).toContain(title);
    expect(md).toContain("maler-steiner.ch: nicht erreichbar. Die Website konnte nicht geladen werden.");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Punkte im Vergleich", "Wo du vorne liegst", "Wo die anderen vorne liegen", "Deine ersten Schritte", "Was der Vergleich sieht und was nicht"]);
    expect(md).toContain("Website und SEO: du");
    expect(md).toContain(`bester Mitbewerber malerei-brunner.ch mit ${result.sites[1].score} von 100`);
    expect(md).toContain("(Wirkung ");
    expect(md).toContain("AlpernaCheck");
  });

  it("sagt es, wenn die eigene Website ausfällt oder kein Mitbewerber erreichbar war", async () => {
    const me = await ownSummary();
    const meDown = failedSite({ host: "malerei-keller.ch", url: "https://malerei-keller.ch/", name: "Malerei Keller", own: true }, "Die Website antwortet mit Fehler 500.");
    const a = competitor("a.ch", {}, me);
    const md1 = toMarkdown(toDocument({ checkedAt: "2026-10-04T10:00:00Z", industry: "craft", sites: [meDown, a] }));
    expect(md1).toContain("konnte nicht geprüft werden: Die Website antwortet mit Fehler 500.");
    expect(md1).toContain("keine Schritte");
    expect(md1).toContain("| Gesamt | nicht erreichbar |");

    const down = failedSite({ host: "a.ch", url: "https://a.ch/", name: "a.ch", own: false }, "weg");
    const md2 = toMarkdown(toDocument({ checkedAt: "2026-10-04T10:00:00Z", industry: "craft", sites: [me, down] }));
    expect(md2).toContain("Kein Mitbewerber war erreichbar");
    expect(md2).toContain("gibt es keinen Vergleich");
  });

  it("nennt die Grenzen der Messung und die Branche", async () => {
    const result = await sampleComparison();
    const notes = measurementNotes(result).join("\n");
    expect(notes).toContain("nur die öffentlichen Startseiten am 04.10.2026");
    expect(notes).toContain("nicht automatisch bestätigt");
    expect(notes).toContain("Handwerk / Bau / Garten");
    expect(notes).toContain("Einschätzung von Alperna");
    expect(notes).toContain("AlpernaCheck");
    expect(CHECKS_PER_HOUR).toBe(8);
  });

  it("schreibt die Eingabe fürs CRM mit einer Angabe je Zeile", async () => {
    const result = await sampleComparison();
    expect(eingabeText(result)).toBe(
      "Website: malerei-keller.ch\nBetrieb: Malerei Keller\nMitbewerber: malerei-brunner.ch, maler-steiner.ch\nBranche: Handwerk / Bau / Garten",
    );
  });
});

describe("parseState", () => {
  it("fällt bei Müll auf den Start zurück", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { phase: "result" }, { phase: "result", result: { sites: "x" } }]) {
      expect(parseState(bad)).toEqual(EMPTY_SAVED);
    }
  });

  it("behält ein gültiges Ergebnis nach dem Neuladen, mit der eigenen Website zuerst", async () => {
    const result = await sampleComparison();
    const stored = JSON.parse(JSON.stringify({ v: 1, phase: "result", step: 0, answers: {}, form: { industry: "craft", competitors: ["malerei-brunner.ch", "maler-steiner.ch", ""] }, result }));
    const saved = parseState(stored);
    expect(saved.phase).toBe("result");
    expect(saved.result).toEqual(result);
    expect(saved.form).toEqual({ industry: "craft", competitors: ["malerei-brunner.ch", "maler-steiner.ch", ""] });
    // Reihenfolge wird hergestellt, wenn die eigene Website hinten steht.
    const swapped = parseState({ ...stored, result: { ...result, sites: [result.sites[1], result.sites[0], result.sites[2]] } });
    expect(swapped.result?.sites[0].own).toBe(true);
  });

  it("verwirft ein beschädigtes Ergebnis und behält die Mitbewerber im Formular", async () => {
    const result = await sampleComparison();
    const broken = [
      { ...result, sites: [result.sites[0]] }, // nur eine Website
      { ...result, sites: result.sites.map((s) => ({ ...s, own: false })) }, // keine eigene
      { ...result, industry: "raumschiff" },
      { ...result, checkedAt: "irgendwann" },
      { ...result, sites: [{ ...result.sites[0], score: "viel" }, result.sites[1]] },
      { ...result, sites: [{ ...result.sites[0], categories: [{ id: "seo", title: "x", score: 101, weight: 1 }] }, result.sites[1]] },
    ];
    for (const r of broken) {
      const saved = parseState({ phase: "result", form: { industry: "gastro", competitors: ["a.ch"] }, result: r });
      expect(saved.phase).toBe("intro");
      expect(saved.result).toBeUndefined();
      expect(saved.form).toEqual({ industry: "gastro", competitors: ["a.ch", "", ""] });
    }
  });

  it("säubert das Formular: unbekannte Branche fällt weg, lange und zu viele Adressen werden gekürzt", () => {
    const saved = parseState({ form: { industry: "raumschiff", competitors: ["x".repeat(500), 7, "b.ch", "c.ch", "d.ch"] } });
    expect(saved.form.industry).toBe("");
    expect(saved.form.competitors).toHaveLength(MAX_COMPETITORS);
    expect(saved.form.competitors[0]).toHaveLength(300);
    expect(saved.form.competitors[1]).toBe("");
    expect(saved.form.competitors[2]).toBe("b.ch");
  });

  it("ignoriert den Zwischenstand eines Fragebogens und unbekannte Schritte", async () => {
    expect(parseState({ v: 1, phase: "result", step: 0, answers: { "frage-1": "x" } })).toEqual(EMPTY_SAVED);
    const result = await sampleComparison();
    const withBadSteps = { ...result, sites: [{ ...result.sites[0], massnahmen: [{ itemId: "seo.og", titel: "Bild", wirkung: "riesig", aufwand: "klein" }, ...(result.sites[0].massnahmen ?? [])] }, result.sites[1]] };
    const saved = parseState({ phase: "result", form: EMPTY_FORM, result: withBadSteps });
    expect(saved.result?.sites[0].massnahmen?.some((m) => m.titel === "Bild")).toBe(false);
    expect(saved.result?.sites[0].massnahmen?.length).toBe(result.sites[0].massnahmen?.length);
  });
});
