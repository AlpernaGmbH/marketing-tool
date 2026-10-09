import { flattenBlocks } from "@/lib/export/model";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { safeFilename, toMarkdown } from "@/lib/export/model";
import {
  AUFWAND,
  CSV_HEADER,
  EMPTY_FORM,
  EMPTY_STATE,
  FORMAT_KEYS,
  HINWEISE,
  PLANUNG,
  PUBLIKATIONSTAGE,
  REGELMAESSIGKEIT_HINWEIS,
  TAGE,
  aktivInWoche,
  allocate,
  ausgabeText,
  availableFormats,
  aufwandTabelle,
  buildPlan,
  csvFilename,
  documentFilename,
  effectiveKanaele,
  effectiveSaeulen,
  eingabeText,
  formFromInput,
  hoursText,
  inputFromForm,
  kanaeleVomProfil,
  kanalMeldung,
  kontrolle,
  ohneFormatHinweis,
  parseDecimal,
  parseInput,
  parseState,
  productionBlock,
  saeulenAusProfil,
  toCsv,
  pitchFor,
  rasterTage,
  wochenraster,
  toDocument,
  validate,
  verfuegbar,
  type Faehigkeit,
  type Input,
  type Plan,
  type Tag,
} from "./logic";

const ALLE: Faehigkeit[] = ["text", "foto", "video", "gestaltung"];

const keller: Input = {
  stunden: 4,
  kanaele: ["instagram", "google"],
  faehigkeiten: ["text", "foto"],
  saeulen: ["Vorher und nachher", "Einblick in den Alltag", "Tipps vom Maler"],
  produktionstag: "Montag",
  aufwand: {},
};

/** Alle sechs Kanäle, alle Fähigkeiten, zwei Säulen. */
const voll = (stunden: number, extra: Partial<Input> = {}): Input => ({
  stunden,
  kanaele: ["instagram", "facebook", "linkedin", "google", "newsletter", "website"],
  faehigkeiten: ALLE,
  saeulen: ["A", "B"],
  produktionstag: "Montag",
  aufwand: {},
  ...extra,
});

const alleBeitraege = (p: Plan) => p.wochen.flatMap((w) => w.beitraege);

describe("posting-plan: Tabellen", () => {
  it("Aufwand je Format entspricht der Annahme von Alperna", () => {
    expect(AUFWAND).toEqual({
      textbeitrag: 0.5,
      fotobeitrag: 0.75,
      karussell: 1.5,
      kurzvideo: 2,
      story: 0.25,
      googleBeitrag: 0.25,
      newsletter: 1.5,
      websiteBeitrag: 1.5,
    });
    expect(Object.keys(AUFWAND)).toHaveLength(FORMAT_KEYS.length);
  });

  it("Formate richten sich nach den Fähigkeiten: Instagram braucht Foto, Video oder beides mit Gestaltung", () => {
    expect(availableFormats("instagram", ["text"])).toEqual([]);
    expect(availableFormats("instagram", ["text", "foto"])).toEqual(["fotobeitrag", "story"]);
    expect(availableFormats("instagram", ["text", "foto", "gestaltung"])).toEqual(["fotobeitrag", "karussell", "story"]);
    expect(availableFormats("instagram", ["text", "video"])).toEqual(["kurzvideo"]);
    expect(availableFormats("instagram", ALLE)).toEqual(["fotobeitrag", "karussell", "kurzvideo", "story"]);
  });

  it("Gestaltung allein schaltet das Karussell nicht frei", () => {
    expect(availableFormats("instagram", ["text", "gestaltung"])).toEqual([]);
  });

  it("Facebook und LinkedIn haben immer den Textbeitrag, Facebook mit Foto auch den Fotobeitrag", () => {
    expect(availableFormats("facebook", ["text"])).toEqual(["textbeitrag"]);
    expect(availableFormats("facebook", [])).toEqual(["textbeitrag"]);
    expect(availableFormats("facebook", ["text", "foto"])).toEqual(["textbeitrag", "fotobeitrag"]);
    expect(availableFormats("linkedin", ALLE)).toEqual(["textbeitrag"]);
  });

  it("Google-Profil, Newsletter und Website haben je ein festes Format", () => {
    expect(availableFormats("google", ["text"])).toEqual(["googleBeitrag"]);
    expect(availableFormats("newsletter", ["text"])).toEqual(["newsletter"]);
    expect(availableFormats("website", ["text"])).toEqual(["websiteBeitrag"]);
  });

  it("überschriebener Aufwand gilt, ungültiger fällt auf den Standard", () => {
    const t = aufwandTabelle({ kurzvideo: 3, story: 0, karussell: 99, textbeitrag: Number.NaN, fotobeitrag: 0.333 });
    expect(t.kurzvideo).toBe(3);
    expect(t.story).toBe(AUFWAND.story);
    expect(t.karussell).toBe(AUFWAND.karussell);
    expect(t.textbeitrag).toBe(AUFWAND.textbeitrag);
    expect(t.fotobeitrag).toBe(0.33);
    expect(aufwandTabelle()).toEqual(AUFWAND);
  });

  it("Stunden für Beiträge: Budget minus Planung, nie unter 0", () => {
    expect(PLANUNG).toBe(0.25);
    expect(verfuegbar(4)).toBe(3.75);
    expect(verfuegbar(0.25)).toBe(0);
    expect(verfuegbar(0)).toBe(0);
    expect(verfuegbar(Number.NaN)).toBe(0);
  });

  it("Rhythmus: Newsletter in den geraden Wochen, Website nur in Woche 3, alle anderen jede Woche", () => {
    expect([1, 2, 3, 4].filter((w) => aktivInWoche("newsletter", w))).toEqual([2, 4]);
    expect([1, 2, 3, 4].filter((w) => aktivInWoche("website", w))).toEqual([3]);
    expect([1, 2, 3, 4].filter((w) => aktivInWoche("instagram", w))).toEqual([1, 2, 3, 4]);
  });
});

describe("posting-plan: Zuteilung", () => {
  it("1 Stunde: nur Google-Profil und Instagram, die übrigen Kanäle von hinten gestrichen und gemeldet", () => {
    const z = allocate(voll(1));
    expect(z.verfuegbar).toBe(0.75);
    expect(z.geplant).toEqual(["google", "instagram"]);
    expect(z.gestrichen).toEqual(["facebook", "linkedin", "newsletter", "website"]);
    for (const w of z.wochen) expect(w.reduce((s, p) => s + p.aufwand, 0)).toBeLessThanOrEqual(0.75 + 1e-9);
    const plan = buildPlan(voll(1));
    expect(plan.kontrollen[0]).toBe("Mit 1 Stunde pro Woche reichen 2 Kanäle: Google-Profil, Instagram. Nicht eingeplant: Facebook, LinkedIn, Newsletter, Website.");
  });

  it("3 Stunden: Newsletter und Website passen nicht, vier Kanäle bleiben, Summe unter dem Budget", () => {
    const z = allocate(voll(3));
    expect(z.geplant).toEqual(["google", "instagram", "facebook", "linkedin"]);
    expect(z.gestrichen).toEqual(["newsletter", "website"]);
    for (const w of z.wochen) expect(w.reduce((s, p) => s + p.aufwand, 0)).toBeLessThanOrEqual(2.75 + 1e-9);
  });

  it("6 Stunden: alle sechs Kanäle, nichts gestrichen, Newsletter nur in Woche 2 und 4, Website nur in Woche 3", () => {
    const z = allocate(voll(6));
    expect(z.gestrichen).toEqual([]);
    const kanaeleJeWoche = z.wochen.map((w) => w.map((p) => p.kanal));
    expect(kanaeleJeWoche.map((k) => k.includes("newsletter"))).toEqual([false, true, false, true]);
    expect(kanaeleJeWoche.map((k) => k.includes("website"))).toEqual([false, false, true, false]);
    for (const w of z.wochen) expect(w.reduce((s, p) => s + p.aufwand, 0)).toBeLessThanOrEqual(5.75 + 1e-9);
  });

  it("20 Stunden: nie über das Budget, höchstens zwei Beiträge je Kanal und Woche", () => {
    const z = allocate(voll(20));
    for (const w of z.wochen) {
      expect(w.reduce((s, p) => s + p.aufwand, 0)).toBeLessThanOrEqual(19.75 + 1e-9);
      for (const k of z.geplant) expect(w.filter((p) => p.kanal === k).length).toBeLessThanOrEqual(2);
    }
    expect(buildPlan(voll(20)).wochen.every((w) => w.reserve > 0)).toBe(true);
  });

  it("Summe nie über dem Budget, für alle Stunden von 0,5 bis 20 und mehrere Fähigkeiten", () => {
    const faehigkeiten: Faehigkeit[][] = [["text"], ["text", "foto"], ["text", "video"], ALLE];
    for (let h = 0.5; h <= 20; h += 0.5) {
      for (const f of faehigkeiten) {
        const z = allocate(voll(h, { faehigkeiten: f }));
        for (const w of z.wochen) expect(w.reduce((s, p) => s + p.aufwand, 0)).toBeLessThanOrEqual(verfuegbar(h) + 1e-9);
      }
    }
  });

  it("Reihenfolge der Wichtigkeit: das Google-Profil kommt zuerst, dann Instagram, Facebook, LinkedIn", () => {
    const z = allocate(voll(3));
    expect(z.wochen[0].map((p) => p.kanal).slice(0, 4)).toEqual(["google", "instagram", "facebook", "linkedin"]);
    // Bei knapper Zeit bleibt Instagram vor dem Newsletter, auch wenn er später gewählt wurde.
    const knapp = allocate(voll(2, { kanaele: ["website", "newsletter", "instagram", "google"] }));
    expect(knapp.geplant).toEqual(["google", "instagram"]);
  });

  it("jeder Kanal bekommt zuerst das günstigste Format, der zweite Beitrag ist ein anderes, so teuer wie die übrigen Stunden erlauben", () => {
    const z = allocate(keller); // Foto: Fotobeitrag 0,75, Story 0,25
    expect(z.wochen[0]).toEqual([
      { kanal: "google", format: "googleBeitrag", aufwand: 0.25 },
      { kanal: "instagram", format: "story", aufwand: 0.25 },
      { kanal: "instagram", format: "fotobeitrag", aufwand: 0.75 },
    ]);
    // Mit Gestaltung steht das Karussell zur Wahl und ist das teuerste, das passt.
    const mitGestaltung = allocate({ ...keller, faehigkeiten: ["text", "foto", "gestaltung"] });
    expect(mitGestaltung.wochen[0].map((p) => p.format)).toEqual(["googleBeitrag", "story", "karussell"]);
    // Mit Video und genug Stunden ist es das Kurzvideo.
    const mitVideo = allocate({ ...keller, faehigkeiten: ALLE });
    expect(mitVideo.wochen[0].map((p) => p.format)).toEqual(["googleBeitrag", "story", "kurzvideo"]);
  });

  it("reichen die übrigen Stunden nicht für ein anderes Format, bleibt es beim ersten Beitrag", () => {
    const z = allocate({ ...keller, stunden: 1 }); // 0,75 verfügbar: Google 0,25 + Story 0,25, übrig 0,25
    expect(z.wochen[0].map((p) => p.format)).toEqual(["googleBeitrag", "story"]);
  });

  it("Kanäle mit nur einem Format bekommen keinen zweiten Beitrag", () => {
    const z = allocate({ ...keller, kanaele: ["linkedin", "google"], stunden: 10 });
    expect(z.wochen[0]).toHaveLength(2);
  });

  it("Instagram ohne Foto oder Video: kein Beitrag, Hinweis «Für diesen Kanal fehlt eine Fähigkeit»", () => {
    const input: Input = { ...keller, kanaele: ["instagram", "google"], faehigkeiten: ["text"] };
    const z = allocate(input);
    expect(z.ohneFormat).toEqual(["instagram"]);
    expect(z.geplant).toEqual(["google"]);
    const plan = buildPlan(input);
    expect(alleBeitraege(plan).some((b) => b.kanal === "instagram")).toBe(false);
    expect(plan.kontrollen).toContain("Instagram: Für diesen Kanal fehlt eine Fähigkeit. Wähle Foto oder Video bei «Was könnt ihr gut?».");
    expect(ohneFormatHinweis("instagram")).toContain("Für diesen Kanal fehlt eine Fähigkeit");
  });

  it("überschriebener Aufwand ändert die Wahl und bleibt im Budget", () => {
    const z = allocate({ ...keller, aufwand: { fotobeitrag: 0.1 } }); // Fotobeitrag ist jetzt das günstigste Format
    expect(z.wochen[0].find((p) => p.kanal === "instagram")?.format).toBe("fotobeitrag");
    expect(z.wochen[0].find((p) => p.kanal === "instagram")?.aufwand).toBe(0.1);
    const teuer = allocate({ ...keller, stunden: 1, aufwand: { googleBeitrag: 0.5, story: 0.5 } });
    expect(teuer.wochen[0].reduce((s, p) => s + p.aufwand, 0)).toBeLessThanOrEqual(0.75 + 1e-9);
    expect(teuer.geplant).toEqual(["google"]);
    expect(teuer.gestrichen).toEqual(["instagram"]);
  });

  it("Meldung über gestrichene Kanäle: Einzahl und Mehrzahl", () => {
    expect(kanalMeldung(1, ["google"], ["instagram"])).toBe("Mit 1 Stunde pro Woche reicht 1 Kanal: Google-Profil. Nicht eingeplant: Instagram.");
    expect(kanalMeldung(2.5, ["google", "instagram", "facebook"], ["website"])).toBe(
      "Mit 2,5 Stunden pro Woche reichen 3 Kanäle: Google-Profil, Instagram, Facebook. Nicht eingeplant: Website.",
    );
  });
});

describe("posting-plan: Plan", () => {
  it("vier Wochen, jede Säule gleich oft (±1)", () => {
    const configs: Input[] = [keller, voll(6), voll(3), voll(20, { saeulen: ["A", "B", "C", "D", "E"] }), { ...keller, saeulen: ["Nur eine"] }, { ...keller, stunden: 1 }];
    for (const c of configs) {
      const plan = buildPlan(c);
      expect(plan.wochen).toHaveLength(4);
      const zahlen = plan.saeulen.map((s) => s.anzahl);
      expect(Math.max(...zahlen) - Math.min(...zahlen)).toBeLessThanOrEqual(1);
      expect(zahlen.reduce((a, b) => a + b, 0)).toBe(alleBeitraege(plan).length);
      expect(kontrolle(plan)).toEqual({ summeOk: true, saeulenOk: true });
    }
  });

  it("Säulen wechseln: ein Kanal bekommt in aufeinanderfolgenden Wochen nicht dieselbe Säule, wenn es mehrere gibt", () => {
    const plan = buildPlan({ ...keller, kanaele: ["google"], saeulen: ["A", "B"] });
    const google = alleBeitraege(plan).filter((b) => b.kanal === "google").map((b) => b.saeule);
    expect(google).toEqual(["A", "B", "A", "B"]);
  });

  it("Veröffentlichungstage: Dienstag, Donnerstag, Samstag der Reihe nach, nie am Produktionstag", () => {
    for (const tag of TAGE) {
      const plan = buildPlan(voll(6, { produktionstag: tag }));
      const erlaubt: readonly Tag[] = PUBLIKATIONSTAGE.filter((t) => t !== tag);
      for (const b of alleBeitraege(plan)) {
        expect(b.tag).not.toBe(tag);
        expect(erlaubt).toContain(b.tag);
      }
    }
    const plan = buildPlan(keller);
    expect(plan.wochen[0].beitraege.map((b) => b.tag)).toEqual(["Dienstag", "Donnerstag", "Samstag"]);
    // Produktionstag Dienstag: nur Donnerstag und Samstag
    const di = buildPlan({ ...keller, produktionstag: "Dienstag" });
    expect(di.wochen[0].beitraege.map((b) => b.tag)).toEqual(["Donnerstag", "Donnerstag", "Samstag"]);
  });

  it("Beiträge einer Woche sind nach Wochentag sortiert, kein Kanal postet zweimal am selben Tag", () => {
    const plan = buildPlan(voll(20, { produktionstag: "Samstag" }));
    for (const w of plan.wochen) {
      const idx = w.beitraege.map((b) => TAGE.indexOf(b.tag));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      const paare = w.beitraege.map((b) => `${b.kanal}|${b.tag}`);
      expect(new Set(paare).size).toBe(paare.length);
    }
  });

  it("Produktionsblock: Summe der Aufwände der Woche am Produktionstag", () => {
    const plan = buildPlan(keller);
    const block = productionBlock(plan);
    expect(block).toHaveLength(4);
    expect(block[0]).toMatchObject({ woche: 1, tag: "Montag", stunden: 1.25, anzahl: 3 });
    expect(block[0].text).toBe("Montag: 1,25 Stunden für 3 Beiträge am Stück");
    for (const [i, p] of block.entries()) expect(p.stunden).toBe(plan.wochen[i].aufwand);
    // anderer Tag
    expect(productionBlock(plan, "Freitag")[0].text).toBe("Freitag: 1,25 Stunden für 3 Beiträge am Stück");
  });

  it("Produktionsblock: ganze Zahlen, Einzahl und eine Woche ohne Beitrag", () => {
    const eins = buildPlan({ ...keller, kanaele: ["linkedin"], aufwand: { textbeitrag: 1 }, stunden: 2 });
    expect(productionBlock(eins)[0].text).toBe("Montag: 1 Stunde für 1 Beitrag am Stück");
    const nl = buildPlan({ ...keller, kanaele: ["newsletter"], stunden: 3 });
    expect(productionBlock(nl)[0]).toMatchObject({ anzahl: 0, stunden: 0 });
    expect(productionBlock(nl)[0].text).toBe("Montag: In dieser Woche ist nichts zu produzieren");
    expect(productionBlock(nl)[1].text).toBe("Montag: 1,5 Stunden für 1 Beitrag am Stück");
  });

  it("weniger als 2 Beiträge pro Woche: Hinweis, dass Regelmässigkeit wichtiger ist als Menge", () => {
    const plan = buildPlan({ ...keller, kanaele: ["linkedin"], stunden: 1 });
    expect(plan.wochen.every((w) => w.beitraege.length === 1)).toBe(true);
    expect(plan.kontrollen).toContain(REGELMAESSIGKEIT_HINWEIS);
    expect(REGELMAESSIGKEIT_HINWEIS).toContain("Regelmässigkeit ist wichtiger als Menge");
    expect(REGELMAESSIGKEIT_HINWEIS).toContain("Richtwert von Alperna");
    // Bei zwei Beiträgen oder mehr fehlt der Hinweis.
    expect(buildPlan(keller).kontrollen).not.toContain(REGELMAESSIGKEIT_HINWEIS);
  });

  it("Video gewählt, aber keine Zeit: Hinweis; mit genug Stunden entfällt er", () => {
    const knapp = buildPlan({ ...keller, faehigkeiten: ALLE, stunden: 2 });
    expect(alleBeitraege(knapp).some((b) => b.format === "kurzvideo")).toBe(false);
    expect(knapp.kontrollen.some((k) => k.startsWith("Video gewählt, aber im Plan fehlt die Zeit"))).toBe(true);
    const genug = buildPlan({ ...keller, faehigkeiten: ALLE, stunden: 4 });
    expect(alleBeitraege(genug).some((b) => b.format === "kurzvideo")).toBe(true);
    expect(genug.kontrollen.some((k) => k.startsWith("Video gewählt"))).toBe(false);
    // Ohne Video in den Fähigkeiten kein Hinweis
    expect(buildPlan({ ...keller, stunden: 2 }).kontrollen.some((k) => k.startsWith("Video gewählt"))).toBe(false);
  });

  it("Reserve ab einer Stunde pro Woche wird genannt, Richtwert und Plan-Obergrenze stehen im Hinweis", () => {
    const plan = buildPlan(keller);
    const hinweis = plan.kontrollen.find((k) => k.startsWith("Pro Woche bleiben mindestens"));
    expect(hinweis).toContain("2,5 Stunden Reserve");
    expect(hinweis).toContain("Richtwert von Alperna");
    expect(buildPlan({ ...keller, stunden: 1.5 }).kontrollen.some((k) => k.startsWith("Pro Woche bleiben"))).toBe(false);
  });

  it("Kontrolle erkennt einen Plan über dem Budget und ungleiche Säulen", () => {
    const plan = buildPlan(keller);
    const kaputt: Plan = {
      ...plan,
      wochen: plan.wochen.map((w, i) => (i === 0 ? { ...w, aufwand: 99 } : w)),
      saeulen: [
        { name: "A", anzahl: 5 },
        { name: "B", anzahl: 2 },
      ],
    };
    expect(kontrolle(kaputt)).toEqual({ summeOk: false, saeulenOk: false });
  });
});

describe("posting-plan: Prüfung der Eingabe", () => {
  it("gültige Eingabe ergibt keine Meldung", () => {
    expect(validate(keller)).toBeNull();
    expect(validate({ ...keller, stunden: 0.5 })).toBeNull();
    expect(validate({ ...keller, stunden: 20 })).toBeNull();
  });

  it("0 Stunden, zu viele Stunden und keine Zahl", () => {
    const msg = "Gib die Stunden pro Woche an, zwischen 0,5 und 20.";
    expect(validate({ ...keller, stunden: 0 })).toBe(msg);
    expect(validate({ ...keller, stunden: 0.4 })).toBe(msg);
    expect(validate({ ...keller, stunden: 20.5 })).toBe(msg);
    expect(validate({ ...keller, stunden: Number.NaN })).toBe(msg);
    expect(validate({ ...keller, stunden: -3 })).toBe(msg);
  });

  it("kein Kanal, kein Text, keine Säule", () => {
    expect(validate({ ...keller, kanaele: [] })).toBe("Wähle mindestens einen Kanal.");
    expect(validate({ ...keller, faehigkeiten: ["foto"] })).toBe("Wähle bei «Was könnt ihr gut?» mindestens «Text».");
    expect(validate({ ...keller, saeulen: [] })).toBe("Nenne mindestens eine Säule.");
  });

  it("Säulen: höchstens fünf, höchstens 40 Zeichen, keine doppelte", () => {
    expect(validate({ ...keller, saeulen: ["A", "B", "C", "D", "E", "F"] })).toBe("Höchstens 5 Säulen.");
    expect(validate({ ...keller, saeulen: ["x".repeat(41)] })).toContain("zu lang");
    expect(validate({ ...keller, saeulen: ["x".repeat(40)] })).toBeNull();
    expect(validate({ ...keller, saeulen: ["Team", "team"] })).toBe("Die Säule «team» steht zweimal.");
  });

  it("ungültiger Produktionstag und ungültiger Aufwand", () => {
    expect(validate({ ...keller, produktionstag: "Funtag" as Tag })).toBe("Wähle einen Produktionstag.");
    expect(validate({ ...keller, aufwand: { kurzvideo: 0 } })).toBe("Aufwand: Kurzvideo: Gib Stunden zwischen 0,1 und 10 an.");
    expect(validate({ ...keller, aufwand: { karussell: 11 } })).toContain("Aufwand: Karussell");
  });

  it("kein Beitrag möglich: zu wenig Stunden oder keine Fähigkeit für die gewählten Kanäle", () => {
    expect(validate({ ...keller, kanaele: ["newsletter"], stunden: 1 })).toBe(
      "Mit 1 Stunde pro Woche reicht es für keinen der gewählten Kanäle. Erhöhe die Stunden oder wähle einen Kanal mit weniger Aufwand.",
    );
    expect(validate({ ...keller, kanaele: ["instagram"], faehigkeiten: ["text"] })).toBe(
      "Für die gewählten Kanäle fehlt eine Fähigkeit. Instagram: Für diesen Kanal fehlt eine Fähigkeit. Wähle Foto oder Video bei «Was könnt ihr gut?».",
    );
    expect(validate({ ...keller, kanaele: ["newsletter"], stunden: 2 })).toBeNull();
  });
});

describe("posting-plan: Dokument, CSV und CRM", () => {
  const plan = buildPlan(keller);

  it("Dokument: Überblick, Zu beachten, vier Wochen, Produktionsblock, Annahmen und genau drei Hinweise", () => {
    const doc = toDocument(plan, "Malerei Keller");
    expect(doc.title).toBe("Posting-Plan für vier Wochen");
    expect(doc.subtitle).toBe("Malerei Keller, 4 Stunden pro Woche");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("posting-plan-malerei-keller");
    // Am Bildschirm stehen die Wochen und die Annahmen zugeklappt in zwei «details»-Blöcken; die Datei (flattenBlocks) zeigt alles offen.
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Überblick", "Zu beachten", "Produktionsblock"]);
    const details = doc.blocks.filter((b) => b.type === "details");
    expect(details.map((d) => (d.type === "details" ? d.title : ""))).toEqual(["Alle Beiträge, Woche für Woche", "Annahmen und Hinweise"]);
    const flat = flattenBlocks(doc.blocks);
    expect(flat.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""))).toEqual([
      "Überblick",
      "Die vier Wochen im Überblick",
      "Verteilung auf die Säulen",
      "Zu beachten",
      "Alle Beiträge, Woche für Woche",
      "Woche 1",
      "Woche 2",
      "Woche 3",
      "Woche 4",
      "Produktionsblock",
      "Annahmen und Hinweise",
      "Annahmen",
      "Hinweise",
    ]);
    const wochen = details[0].type === "details" ? details[0].blocks.filter((b) => b.type === "table") : [];
    expect(wochen).toHaveLength(4);
    expect(wochen[0]).toMatchObject({ header: ["Tag", "Kanal", "Format", "Säule", "Aufwand"] });
    expect(wochen[0].type === "table" && wochen[0].rows[1]).toEqual(["Donnerstag", "Instagram", "Story", "Einblick in den Alltag", "0,25 Stunden"]);
    const annahmen = details[1].type === "details" ? details[1].blocks : [];
    expect(annahmen.filter((b) => b.type === "table")).toHaveLength(1);
    expect(annahmen[annahmen.length - 1]).toEqual({ type: "list", items: [...HINWEISE] });
    expect(HINWEISE).toHaveLength(3);
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts?.type === "facts" && facts.items.map((f) => f.label)).toEqual([
      "Stunden pro Woche",
      "Beiträge",
      "Kanäle",
      "Fähigkeiten",
      "Säulen",
      "Produktionstag",
      "Reserve",
      "Kontrolle",
    ]);
    expect(facts?.type === "facts" && facts.items.find((f) => f.label === "Beiträge")?.value).toBe("3 pro Woche, 12 in vier Wochen");
  });

  it("Dokument: Annahmen nennen alle acht Formate und markieren angepassten Aufwand; ohne Firma kein Firmenname", () => {
    const angepasst = buildPlan({ ...keller, aufwand: { fotobeitrag: 1 } });
    const md = toMarkdown(toDocument(angepasst));
    expect(md).toContain("| Fotobeitrag | 1 Stunde (angepasst) |");
    expect(md).toContain("| Kurzvideo | 2 Stunden |");
    expect(md).toContain("Annahme von Alperna, keine Statistik");
    const doc = toDocument(plan);
    expect(doc.firma).toBeUndefined();
    expect(doc.subtitle).toBe("4 Stunden pro Woche");
    expect(doc.filename).toBe("posting-plan");
    expect(documentFilename("  ")).toBe("posting-plan");
    expect(csvFilename("Malerei Keller, Gossau")).toBe(`posting-plan-${safeFilename("Malerei Keller, Gossau")}.csv`);
  });

  it("Dokument: Woche ohne Beitrag bekommt einen Satz statt einer Tabelle", () => {
    const nl = toMarkdown(toDocument(buildPlan({ ...keller, kanaele: ["newsletter"], stunden: 3 })));
    expect(nl).toContain("In dieser Woche steht kein Beitrag im Plan.");
  });

  it("CSV: BOM, Semikolon, CRLF, Kopfzeile und eine Zeile je Beitrag mit Dezimalkomma", () => {
    const csv = toCsv(plan);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(CSV_HEADER.join(";"));
    expect(lines[0]).toBe("Woche;Tag;Kanal;Format;Säule;Aufwand in Stunden");
    expect(lines[1]).toBe("1;Dienstag;Google-Profil;Google-Beitrag;Vorher und nachher;0,25");
    expect(lines.filter((l) => l !== "")).toHaveLength(1 + 12);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).not.toContain("\n\n");
  });

  it("CSV: Säulen mit Semikolon oder Formelzeichen sind geschützt", () => {
    const csv = toCsv(buildPlan({ ...keller, saeulen: ["=SUMME(A1)", 'Tipps; "gratis"'] }));
    expect(csv).toContain("'=SUMME(A1)");
    expect(csv).toContain('"Tipps; ""gratis"""');
  });

  it("eingabeText: eine Angabe je Zeile, angepasster Aufwand genannt", () => {
    expect(eingabeText(keller)).toBe(
      [
        "Stunden pro Woche: 4",
        "Kanäle: Instagram, Google-Profil",
        "Fähigkeiten: Text, Foto",
        "Säulen: Vorher und nachher, Einblick in den Alltag, Tipps vom Maler",
        "Produktionstag: Montag",
        "Aufwand angepasst: nein",
      ].join("\n"),
    );
    expect(eingabeText({ ...keller, stunden: 3.5, aufwand: { kurzvideo: 3, story: 0.5 } })).toContain("Stunden pro Woche: 3,5");
    expect(eingabeText({ ...keller, aufwand: { kurzvideo: 3, story: 0.5 } })).toContain("Aufwand angepasst: Kurzvideo 3 Stunden; Story 0,5 Stunden");
  });

  it("ausgabeText ist das Markdown des Dokuments mit dem Überblick oben", () => {
    const md = ausgabeText(plan, "Malerei Keller");
    expect(md).toBe(toMarkdown(toDocument(plan, "Malerei Keller")));
    expect(md.startsWith("# Posting-Plan für vier Wochen\n")).toBe(true);
    expect(md.indexOf("Überblick")).toBeLessThan(md.indexOf("Woche 1"));
    expect(md.slice(0, 1900)).toContain("**Beiträge:** 3 pro Woche, 12 in vier Wochen");
  });

  it("hoursText: Einzahl, Komma und ganze Zahlen", () => {
    expect(hoursText(1)).toBe("1 Stunde");
    expect(hoursText(2)).toBe("2 Stunden");
    expect(hoursText(0.25)).toBe("0,25 Stunden");
    expect(hoursText(3.5)).toBe("3,5 Stunden");
    expect(hoursText(0)).toBe("0 Stunden");
  });
});

describe("posting-plan: Ton", () => {
  it("Dokument, Hinweise und Meldungen enthalten nichts von der Sperrliste, kein Ausrufezeichen, kein «jetzt»", () => {
    const configs: Input[] = [keller, voll(1), voll(3), voll(6), voll(20), { ...keller, kanaele: ["instagram"], faehigkeiten: ["text"], stunden: 2 }, { ...keller, faehigkeiten: ALLE, stunden: 2 }];
    const texte: string[] = [];
    for (const c of configs) {
      const plan = buildPlan(c);
      texte.push(toMarkdown(toDocument(plan, "Malerei Keller, Gossau")), ausgabeText(plan), eingabeText(c), ...productionBlock(plan).map((p) => p.text));
    }
    texte.push(
      validate({ ...keller, stunden: 0 }) ?? "",
      validate({ ...keller, kanaele: ["newsletter"], stunden: 1 }) ?? "",
      validate({ ...keller, kanaele: ["instagram"], faehigkeiten: ["text"] }) ?? "",
      ...HINWEISE,
      REGELMAESSIGKEIT_HINWEIS,
    );
    for (const t of texte) {
      expect(brandHits(t)).toEqual([]);
      expect(t).not.toMatch(/!|—|ß|\bjetzt\b|\bnur noch\b|\bgarantiert\b/i);
    }
  });
});

describe("posting-plan: Formular", () => {
  const leer = { kanaele: undefined, contentSaeulen: undefined };

  it("parseDecimal liest Komma und Punkt und lehnt Unsinn ab", () => {
    expect(parseDecimal("3,5")).toBe(3.5);
    expect(parseDecimal(" 3.5 ")).toBe(3.5);
    expect(parseDecimal("4")).toBe(4);
    for (const bad of ["", "abc", "-1", "1e3", "3,5,2", "1'000", "."]) expect(parseDecimal(bad)).toBeNull();
  });

  it("Säulen aus dem Profil: bereinigt, ohne Doppel, höchstens fünf; kaputte Einträge fallen weg", () => {
    const r = saeulenAusProfil({
      contentSaeulen: [{ name: " Vorher  und nachher " }, { name: "vorher und nachher" }, { name: "" }, { beschreibung: "ohne Name" }, { name: 5 as unknown as string }, { name: "x".repeat(60) }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }],
    });
    expect(r.namen).toEqual(["Vorher und nachher", "x".repeat(40), "B", "C", "D"]);
    expect(r.total).toBe(6);
    expect(saeulenAusProfil(leer)).toEqual({ namen: [], total: 0 });
  });

  it("Säulen aus dem Profil haben Vorrang vor den Zeilen im Formular", () => {
    const form = { saeulen: ["Eigene", "  ", "Zweite  Säule"] };
    expect(effectiveSaeulen(form, leer)).toEqual(["Eigene", "Zweite Säule"]);
    expect(effectiveSaeulen(form, { contentSaeulen: [{ name: "Aus dem Profil" }] })).toEqual(["Aus dem Profil"]);
  });

  it("Kanäle: gewählte, sonst aus dem Profil, sonst Instagram und Google-Profil", () => {
    expect(effectiveKanaele({ kanaele: ["linkedin"] }, { kanaele: [{ name: "Instagram" }] })).toEqual(["linkedin"]);
    expect(effectiveKanaele({ kanaele: null }, { kanaele: [{ name: "Instagram" }, { name: "Newsletter" }] })).toEqual(["instagram", "newsletter"]);
    expect(effectiveKanaele({ kanaele: null }, leer)).toEqual(["instagram", "google"]);
  });

  it("Kanäle stammen nur dann «aus dem Profil», wenn ein Kanal erkannt wurde und noch nichts gewählt ist", () => {
    expect(kanaeleVomProfil({ kanaele: null }, { kanaele: [{ name: "Instagram" }] })).toBe(true);
    expect(kanaeleVomProfil({ kanaele: null }, { kanaele: [{ name: "TikTok" }] })).toBe(false);
    expect(kanaeleVomProfil({ kanaele: null }, leer)).toBe(false);
    expect(kanaeleVomProfil({ kanaele: ["linkedin"] }, { kanaele: [{ name: "Instagram" }] })).toBe(false);
  });

  it("Formular → Eingabe: Komma, Standardwerte beim Aufwand zählen nicht als Änderung", () => {
    const r = inputFromForm(
      { ...EMPTY_FORM, stunden: "3,5", faehigkeiten: ["foto", "text"], saeulen: ["A", "B"], aufwand: { kurzvideo: "3", story: "0,25", karussell: "" } },
      leer,
    );
    expect(r).toEqual({
      ok: true,
      input: { stunden: 3.5, kanaele: ["instagram", "google"], faehigkeiten: ["text", "foto"], saeulen: ["A", "B"], produktionstag: "Montag", aufwand: { kurzvideo: 3 } },
    });
  });

  it("Formular → Eingabe: Meldungen für leere und ungültige Angaben", () => {
    const base = { ...EMPTY_FORM, stunden: "4", saeulen: ["A", ""] };
    expect(inputFromForm({ ...EMPTY_FORM }, leer)).toMatchObject({ ok: false, error: expect.stringContaining("Gib die Stunden pro Woche als Zahl an") });
    expect(inputFromForm({ ...base, stunden: "0" }, leer)).toEqual({ ok: false, error: "Gib die Stunden pro Woche an, zwischen 0,5 und 20." });
    expect(inputFromForm({ ...base, saeulen: ["", " "] }, leer)).toEqual({ ok: false, error: "Nenne mindestens eine Säule." });
    expect(inputFromForm({ ...base, kanaele: [] }, leer)).toEqual({ ok: false, error: "Wähle mindestens einen Kanal." });
    expect(inputFromForm({ ...base, faehigkeiten: [] }, leer)).toEqual({ ok: false, error: "Wähle bei «Was könnt ihr gut?» mindestens «Text»." });
    expect(inputFromForm({ ...base, aufwand: { karussell: "viel" } }, leer)).toEqual({ ok: false, error: "Aufwand: Karussell: Gib die Stunden als Zahl an, zum Beispiel 0,5." });
  });

  it("Eingabe → Formular und zurück", () => {
    const form = formFromInput({ ...keller, aufwand: { kurzvideo: 3 } });
    expect(form).toMatchObject({ stunden: "4", kanaele: ["instagram", "google"], faehigkeiten: ["text", "foto"], produktionstag: "Montag", aufwand: { kurzvideo: "3" } });
    const back = inputFromForm(form, leer);
    expect(back).toMatchObject({ ok: true, input: { ...keller, aufwand: { kurzvideo: 3 } } });
    // eine Säule: zwei Zeilen im Formular
    expect(formFromInput({ ...keller, saeulen: ["Nur eine"] }).saeulen).toEqual(["Nur eine", ""]);
    expect(formFromInput(null)).toEqual(EMPTY_FORM);
  });
});

describe("posting-plan: gespeicherter Stand", () => {
  it("kaputte Daten ergeben den leeren Stand", () => {
    for (const bad of [null, undefined, "x", 5, [], {}, { v: 2, phase: "result" }, { v: "1" }]) expect(parseState(bad)).toEqual(EMPTY_STATE);
  });

  it("Ergebnis mit gültiger Eingabe: der Plan wird neu gerechnet", () => {
    const s = parseState({ v: 1, phase: "result", input: keller, output: { wochen: "kaputt" } });
    expect(s.phase).toBe("result");
    expect(s.input).toEqual(keller);
    expect(s.output).toEqual(buildPlan(keller));
  });

  it("Ergebnis mit ungültiger oder fehlender Eingabe wird zur Eingabe", () => {
    expect(parseState({ v: 1, phase: "result", input: { ...keller, saeulen: [] } })).toMatchObject({ phase: "edit" });
    expect(parseState({ v: 1, phase: "result", input: null })).toEqual({ v: 1, phase: "edit", input: null });
    expect(parseState({ v: 1, phase: "result" })).toEqual({ v: 1, phase: "edit", input: null });
    expect(parseState({ v: 1, phase: "edit", input: keller })).toEqual({ v: 1, phase: "edit", input: keller });
  });

  it("Unbrauchbares in der Eingabe fällt weg, der Rest bleibt", () => {
    const input = parseInput({
      stunden: "4",
      kanaele: ["instagram", "tiktok", "instagram", 5],
      faehigkeiten: ["foto", "magie", "text"],
      saeulen: ["A", "a", 7, "  ", "B", "C", "D", "E", "F"],
      produktionstag: "Funtag",
      aufwand: { kurzvideo: 3, story: "viel", unbekannt: 1, karussell: -2 },
    });
    expect(input).toEqual({
      stunden: 0,
      kanaele: ["instagram"],
      faehigkeiten: ["text", "foto"],
      saeulen: ["A", "B", "C", "D", "E"],
      produktionstag: "Montag",
      aufwand: { kurzvideo: 3 },
    });
    expect(parseInput("kaputt")).toBeNull();
    expect(parseInput([1, 2])).toBeNull();
  });

  it("der Stand lässt sich als JSON speichern und wieder lesen", () => {
    const s = parseState({ v: 1, phase: "result", input: voll(6) });
    const again = parseState(JSON.parse(JSON.stringify(s)));
    expect(again).toEqual(s);
    expect(again.phase).toBe("result");
  });
});

describe("posting-plan: Wochenansicht und Hinweis auf Alperna", () => {
  it("zeigt die vier Wochen als Raster mit den Tagen, an denen etwas passiert, und der Produktion", () => {
    const plan = buildPlan(keller);
    const raster = wochenraster(plan);
    expect(raster.rows.map((r) => r.label)).toEqual(["Woche 1", "Woche 2", "Woche 3", "Woche 4"]);
    const tage = rasterTage(plan);
    expect(tage).toContain(plan.input.produktionstag);
    expect(raster.columns).toEqual(tage.map((t) => t.slice(0, 2)));
    // Jeder Beitrag steht genau einmal im Raster, am richtigen Tag
    const total = raster.rows.reduce((n, r) => n + r.cells.flatMap((c) => c.split("\n")).filter((l) => l && l !== "Produktion").length, 0);
    expect(total).toBe(plan.wochen.reduce((n, w) => n + w.beitraege.length, 0));
    const pi = tage.indexOf(plan.input.produktionstag);
    for (const r of raster.rows) expect(r.cells[pi].split("\n")[0]).toBe("Produktion");
  });

  it("legt das Raster ins Dokument und macht daraus in der Datei eine Tabelle", () => {
    const doc = toDocument(buildPlan(keller));
    expect(doc.blocks.some((b) => b.type === "grid")).toBe(true);
    expect(doc.blocks.some((b) => b.type === "split")).toBe(buildPlan(keller).saeulen.length > 1);
    const md = toMarkdown(doc);
    expect(md).toContain("Die vier Wochen im Überblick");
    expect(md).toContain("| Woche 1 |");
    expect(md).not.toContain("\n;"); // Zeilenumbrüche der Zellen sind in der Datei Semikolon
  });

  it("nennt Alperna mit dem Aufwand aus dem Plan, ohne Preis", () => {
    const plan = buildPlan(keller);
    const spec = pitchFor(plan)!;
    expect(spec.baustein).toBe("Social Media");
    expect(spec.satz).toMatch(/^Dein Plan hat \d+ Beiträge in vier Wochen und braucht rund [\d,.]+ Stunden pro Woche\.$/);
    expect(spec.satz).not.toMatch(/CHF|Gratis|garantiert/);
  });

  it("sagt nichts, wenn der Plan keinen Beitrag hat", () => {
    const leer = buildPlan({ ...keller, stunden: PLANUNG });
    expect(leer.wochen.every((w) => w.beitraege.length === 0)).toBe(true);
    expect(pitchFor(leer)).toBeNull();
  });
});
