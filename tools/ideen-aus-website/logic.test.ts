import { describe, expect, it } from "vitest";
import type { Idee, IdeenOutput } from "./generator";
import {
  ALL_KANAELE,
  EMPTY_STATE,
  KANAELE,
  eingabeText,
  hostOf,
  inputProblem,
  isKanalKey,
  kanalLabel,
  looksLikeWebsite,
  normalizeKanaele,
  pageSummary,
  parseState,
  reportMarkdown,
  toDocument,
  toInput,
  usedKanaele,
  type PageLike,
} from "./logic";

const page: PageLike = {
  host: "malerei-keller.ch",
  title: "  Malerei Keller   Gossau ",
  description: "Fassaden und Innenräume",
  headings: ["Fassaden", " Innenräume ", "", "Lehre"],
  text: "Wir streichen Fassaden in Gossau. ",
};

const idee = (over: Partial<Idee> = {}): Idee => ({
  titel: "Vorher und nachher an der Fassade",
  kanal: "instagram",
  format: "karussell",
  worum: "Eine Fassade in Gossau in drei Bildern: vor dem Gerüst, mit dem Gerüst und nach dem Abbau, mit dem Team.",
  hook: "Diese Fassade in Gossau hat drei Wochen gebraucht.",
  ...over,
});

const output: IdeenOutput = {
  themen: ["Fassaden im Appenzellerland", "Lehre im Malerberuf", "Innenräume und Farben"],
  ideen: [
    idee({ titel: "Idee eins" }),
    idee({ titel: "Idee zwei", kanal: "linkedin", format: "text" }),
    idee({ titel: "Idee drei", kanal: "google", format: "foto" }),
    idee({ titel: "Idee vier" }),
    idee({ titel: "Idee fünf" }),
    idee({ titel: "Idee sechs" }),
    idee({ titel: "Idee sieben" }),
    idee({ titel: "Idee acht", hook: "Der Betrieb am [Anlass in deiner Gemeinde]." }),
  ],
};

describe("ideen-aus-website: Kanäle", () => {
  it("kennt fünf Kanäle mit Labels und erkennt Schlüssel", () => {
    expect(KANAELE.map((k) => k.key)).toEqual(["instagram", "linkedin", "google", "newsletter", "website"]);
    expect(kanalLabel("google")).toBe("Google-Beitrag");
    expect(kanalLabel("website")).toBe("Website-Beitrag");
    expect(isKanalKey("linkedin")).toBe(true);
    expect(isKanalKey("tiktok")).toBe(false);
    expect(normalizeKanaele(["website", "instagram", "instagram", "tiktok"])).toEqual(["instagram", "website"]);
  });
});

describe("ideen-aus-website: Eingabeprüfung", () => {
  it("meldet fehlende oder unbrauchbare Website und fehlende Kanäle", () => {
    expect(inputProblem("", ALL_KANAELE)).toMatch(/Adresse deiner Website/);
    expect(inputProblem("   ", ALL_KANAELE)).toMatch(/Adresse deiner Website/);
    expect(inputProblem("malerei keller", ALL_KANAELE)).toMatch(/Website-Adresse/);
    expect(inputProblem("malerei-keller", ALL_KANAELE)).toMatch(/Website-Adresse/);
    expect(inputProblem("malerei-keller.ch", [])).toBe("Wähle mindestens einen Kanal.");
    expect(inputProblem("malerei-keller.ch", ["instagram"])).toBeNull();
    expect(inputProblem("https://www.malerei-keller.ch/ueber-uns", ["instagram"])).toBeNull();
  });
  it("looksLikeWebsite erlaubt Hosts mit Punkt, Pfad, Port und Umlaut, nicht aber andere Schemas oder Zugangsdaten", () => {
    expect(looksLikeWebsite("malerei-keller.ch")).toBe(true);
    expect(looksLikeWebsite("http://malerei-keller.ch:8080/pfad?x=1")).toBe(true);
    expect(looksLikeWebsite("bäckerei-müller.ch")).toBe(true);
    expect(looksLikeWebsite("ftp://malerei-keller.ch")).toBe(false);
    expect(looksLikeWebsite("anna:geheim@malerei-keller.ch")).toBe(false);
    expect(looksLikeWebsite("keller.")).toBe(false);
    expect(looksLikeWebsite("x".repeat(301))).toBe(false);
  });
  it("hostOf liefert den Host ohne www, bei Müll die Eingabe", () => {
    expect(hostOf("https://www.malerei-keller.ch/ueber-uns")).toBe("malerei-keller.ch");
    expect(hostOf("malerei-keller.ch")).toBe("malerei-keller.ch");
    expect(hostOf("nicht gültig")).toBe("nicht gültig");
  });
});

describe("ideen-aus-website: toInput", () => {
  it("übernimmt Profil und Seite, bereinigt Leerraum und ordnet die Kanäle", () => {
    const input = toInput({ firma: " Malerei Keller ", branche: "Malerei", ort: "Gossau" }, ["website", "instagram", "instagram"], page);
    expect(input).toEqual({
      betrieb: "Malerei Keller",
      branche: "Malerei",
      ort: "Gossau",
      kanaele: ["instagram", "website"],
      host: "malerei-keller.ch",
      title: "Malerei Keller Gossau",
      description: "Fassaden und Innenräume",
      headings: ["Fassaden", "Innenräume", "Lehre"],
      text: "Wir streichen Fassaden in Gossau.",
    });
  });
  it("kürzt Text auf 8'000 Zeichen und Überschriften auf 20, und nimmt ohne Firma den Host als Betrieb", () => {
    const input = toInput({}, ALL_KANAELE, { ...page, text: "x".repeat(9000), headings: Array.from({ length: 25 }, (_, i) => `H${i}`) });
    expect(input.text).toHaveLength(8000);
    expect(input.headings).toHaveLength(20);
    expect(input.betrieb).toBe("malerei-keller.ch");
    expect(input.branche).toBe("");
    expect(input.ort).toBe("");
  });
  it("eingabeText nennt die Angaben je Zeile, aber nicht den Text der Seite", () => {
    const text = eingabeText(toInput({ firma: "Malerei Keller", ort: "Gossau" }, ["google"], page));
    expect(text.split("\n")).toEqual([
      "Website: malerei-keller.ch",
      "Betrieb: Malerei Keller",
      "Ort: Gossau",
      "Kanäle: Google-Beitrag",
      "Titel der Startseite: Malerei Keller Gossau",
      "Überschriften: Fassaden · Innenräume · Lehre",
    ]);
    expect(text).not.toContain("Wir streichen");
  });
});

describe("ideen-aus-website: Dokument", () => {
  it("enthält jede Idee mit Kanal und Format, die Themen, die Facts und den KI-Hinweis", () => {
    const doc = toDocument(output, "https://www.malerei-keller.ch");
    const text = JSON.stringify(doc.blocks);
    for (const i of output.ideen) {
      expect(text).toContain(i.titel);
      expect(text).toContain(i.worum);
      expect(text).toContain(`«${i.hook}»`);
    }
    expect(text).toContain("2. Idee zwei (LinkedIn, Text)");
    expect(text).toContain("3. Idee drei (Google-Beitrag, Foto)");
    for (const t of output.themen) expect(text).toContain(t);
    expect(doc.title).toBe("Ideen aus deiner Website");
    expect(doc.subtitle).toBe("Aus der Startseite von malerei-keller.ch");
    expect(doc.filename).toBe("ideen-malerei-keller-ch");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Website", value: "malerei-keller.ch" },
        { label: "Kanäle", value: "Instagram, LinkedIn, Google-Beitrag" },
      ],
    });
    expect(text).toContain("Von einer KI formuliert");
    expect(usedKanaele(output)).toEqual(["instagram", "linkedin", "google"]);
  });
  it("nimmt die gewählten Kanäle, wenn sie übergeben werden, und kommt ohne Website aus", () => {
    const doc = toDocument(output, "", ALL_KANAELE);
    expect(doc.subtitle).toBeUndefined();
    expect(doc.filename).toBe("ideen-website");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Website", value: "keine Angabe" },
        { label: "Kanäle", value: "Instagram, LinkedIn, Google-Beitrag, Newsletter, Website-Beitrag" },
      ],
    });
  });
  it("reportMarkdown beginnt mit dem Titel und listet die Ideen", () => {
    const md = reportMarkdown(output, "malerei-keller.ch");
    expect(md.startsWith("# Ideen aus deiner Website\n")).toBe(true);
    expect(md).toContain("### 1. Idee eins (Instagram, Karussell)");
    expect(md).toContain("- **Website:** malerei-keller.ch");
    expect(md).toContain("## 8 Ideen für Beiträge");
  });
});

describe("ideen-aus-website: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand mit allen Kanälen", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, website: "a.ch" })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE.kanaele).toEqual(ALL_KANAELE);
  });
  it("lässt einen kaputten Entwurf allein wegfallen und behält Website, Kanäle und Seitenauszug", () => {
    const state = parseState({ v: 1, website: "malerei-keller.ch", kanaele: ["google", "tiktok", "instagram"], page: { host: "malerei-keller.ch", title: "T", headings: ["a", 3] }, output: { themen: [], ideen: [] } });
    expect(state).toEqual({ v: 1, website: "malerei-keller.ch", kanaele: ["instagram", "google"], page: { host: "malerei-keller.ch", title: "T", headings: ["a"] }, output: null });
    expect(parseState({ v: 1, kanaele: [] }).kanaele).toEqual([]);
    expect(parseState({ v: 1 }).kanaele).toEqual(ALL_KANAELE);
    expect(parseState({ v: 1, page: { title: "ohne host" } }).page).toBeNull();
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, website: "malerei-keller.ch", kanaele: ["instagram" as const], page: pageSummary(page), output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(pageSummary(page)).toEqual({ host: "malerei-keller.ch", title: "Malerei Keller Gossau", headings: ["Fassaden", "Innenräume", "Lehre"] });
  });
});
