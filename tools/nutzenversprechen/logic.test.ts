import { describe, expect, it } from "vitest";
import type { NutzenInput, NutzenOutput } from "./generator";
import {
  BAUSTEINE,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  bausteinLabel,
  charCount,
  eingabeText,
  inputProblem,
  parseState,
  reportMarkdown,
  toDocument,
  toForm,
  toInput,
  viewBlocks,
  zeichenLabel,
  zielgruppeVorschlag,
  type FormValues,
} from "./logic";

const form: FormValues = {
  zielgruppe: "Hausbesitzer in der Region Gossau",
  angebot: "Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.",
  problem: "Die Fassade blättert, Offerten kommen spät, und niemand erklärt die Farbwahl.",
  ergebnis: "Eine Fassade, die zwanzig Jahre hält, und eine Rechnung ohne Überraschung.",
  beweise: "Seit 1985 in Gossau, 5 Jahre Garantie auf Fassaden.",
};

const fields = { firma: "Malerei Keller", branche: "Malerei", ort: "Gossau", positionierung: "Der Malerbetrieb in Gossau, der Termine hält." };

const input: NutzenInput = { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", positionierung: fields.positionierung, ...form };

const output: NutzenOutput = {
  kurz: "Fassaden in Gossau, die zwanzig Jahre halten.",
  mittel: "Du bekommst eine Fassade, die zwanzig Jahre hält, und eine Offerte innert einer Woche. Die Farbwahl erklären wir dir vor Ort.",
  lang: "Hausbesitzer in der Region Gossau bekommen von der Malerei Keller eine Fassade, die zwanzig Jahre hält. Die Offerte kommt innert einer Woche, die Farbwahl erklären wir vor Ort, und die Rechnung hält, was die Offerte verspricht. Seit 1985 streichen wir Häuser im Fürstenland.",
  nutzen: ["Du bekommst eine Fassade, die zwanzig Jahre hält.", "Du hast eine Offerte innert einer Woche.", "Du bekommst eine Rechnung ohne Überraschung."],
  beweise: ["Seit 1985 in Gossau.", "[Zahl der Projekte]"],
  bausteine: {
    websiteTitel: "Malerei Keller: Fassaden in Gossau, die halten",
    websiteUntertitel: "Fassaden, Innenräume und Farbberatung für Hausbesitzer in der Region Gossau.",
    googleBeschreibung:
      "Wir streichen Fassaden und renovieren Innenräume für Hausbesitzer in der Region Gossau. Seit 1985 halten wir Termine und erklären die Farbwahl vor Ort. Auf Fassaden geben wir 5 Jahre Garantie.",
    instagramBio: "Malerei Keller, Gossau\nFassaden, die halten\nFarbberatung vor Ort",
    einSatzAmTelefon: "Wir streichen Fassaden in der Region Gossau so, dass sie zwanzig Jahre halten.",
  },
};

describe("nutzenversprechen: Vorschlag aus dem Profil", () => {
  it("nimmt das Primärsegment, sonst die erste Zielgruppe, sonst nichts", () => {
    expect(zielgruppeVorschlag({ primaersegment: " Hausbesitzer in Gossau ", zielgruppen: [{ name: "Verwaltungen" }] })).toBe("Hausbesitzer in Gossau");
    expect(zielgruppeVorschlag({ zielgruppen: [{ name: " Verwaltungen " }, { name: "Private" }] })).toBe("Verwaltungen");
    expect(zielgruppeVorschlag({ primaersegment: "  ", zielgruppen: [] })).toBe("");
    expect(zielgruppeVorschlag({})).toBe("");
    expect(zielgruppeVorschlag({ primaersegment: "x".repeat(250) })).toHaveLength(200);
  });
});

describe("nutzenversprechen: Eingabeprüfung", () => {
  it("meldet fehlenden Betrieb, fehlende Zielgruppe und zu kurze Pflichtfelder in dieser Reihenfolge", () => {
    expect(inputProblem({}, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem({ firma: "  " }, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem(fields, { ...form, zielgruppe: " " })).toMatch(/für wen/);
    expect(inputProblem(fields, { ...form, angebot: "Fassaden" })).toMatch(/Angebot in mindestens 20 Zeichen/);
    expect(inputProblem(fields, { ...form, problem: "   zu kurz   " })).toMatch(/Problem deiner Kundschaft/);
    expect(inputProblem(fields, { ...form, ergebnis: "Ruhe" })).toMatch(/was die Kundschaft danach hat/);
    expect(inputProblem(fields, { ...form, beweise: "x".repeat(601) })).toMatch(/Kürze die Beweise/);
  });
  it("lässt eine vollständige Eingabe durch, auch ohne Beweise", () => {
    expect(inputProblem(fields, form)).toBeNull();
    expect(inputProblem(fields, { ...form, beweise: "" })).toBeNull();
    expect(inputProblem(fields, { ...EMPTY_FORM, zielgruppe: "Private", angebot: "x".repeat(20), problem: "y".repeat(20), ergebnis: "z".repeat(10) })).toBeNull();
  });
});

describe("nutzenversprechen: toInput und eingabeText", () => {
  it("übernimmt Profil und Formular, bereinigt Leerraum und kürzt auf die Grenzen", () => {
    const i = toInput({ ...fields, firma: " Malerei   Keller " }, { ...form, angebot: `  ${form.angebot}  \n\n  zweite   Zeile ` });
    expect(i.betrieb).toBe("Malerei Keller");
    expect(i.angebot).toBe(`${form.angebot}\nzweite Zeile`);
    expect(i.positionierung).toBe(fields.positionierung);
    const lang = toInput({ firma: "x".repeat(200), positionierung: "p".repeat(700) }, { ...form, beweise: "b".repeat(700) });
    expect(lang.betrieb).toHaveLength(120);
    expect(lang.positionierung).toHaveLength(600);
    expect(lang.beweise).toHaveLength(600);
    expect(lang.branche).toBe("");
    expect(lang.ort).toBe("");
    expect(toForm(input)).toEqual(form);
  });
  it("eingabeText nennt die Angaben je Zeile und lässt leere Felder weg", () => {
    expect(eingabeText(input).split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Ort: Gossau",
      "Für wen: Hausbesitzer in der Region Gossau",
      `Angebot: ${form.angebot}`,
      `Problem: ${form.problem}`,
      `Ergebnis: ${form.ergebnis}`,
      `Beweise: ${form.beweise}`,
      `Positionierung: ${fields.positionierung}`,
    ]);
    const ohne = eingabeText({ ...input, branche: "", ort: "", beweise: "", positionierung: "" });
    expect(ohne).not.toContain("Branche:");
    expect(ohne).not.toContain("Beweise:");
    expect(ohne).not.toContain("Positionierung:");
  });
});

describe("nutzenversprechen: Bausteine und Zeichen", () => {
  it("kennt fünf Bausteine mit Grenzen und zählt Zeichen je Zeichen", () => {
    expect(BAUSTEINE.map((b) => b.key)).toEqual(["websiteTitel", "websiteUntertitel", "googleBeschreibung", "instagramBio", "einSatzAmTelefon"]);
    expect(BAUSTEINE.find((b) => b.key === "googleBeschreibung")).toMatchObject({ max: 750, hint: "Feldgrenze bei Google", copyLabel: "Google-Beschreibung kopieren" });
    expect(bausteinLabel("einSatzAmTelefon")).toBe("Telefonsatz");
    expect(charCount("Gossau")).toBe(6);
    expect(charCount("Zürich")).toBe(6);
    expect(zeichenLabel("Malerei Keller, Gossau", 70)).toBe("22 von 70 Zeichen");
  });
});

describe("nutzenversprechen: Dokument", () => {
  it("enthält Facts, alle drei Längen, Nutzen, Beweise, den KI-Hinweis und die Bausteine mit Zeichenzahl", () => {
    const doc = toDocument(output, input);
    const text = JSON.stringify(doc.blocks);
    expect(doc.title).toBe("Nutzenversprechen");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.filename).toBe("nutzenversprechen-malerei-keller");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Für wen", value: "Hausbesitzer in der Region Gossau" },
      ],
    });
    for (const t of ["Kurz", "Mittel", "Lang", "Was die Kundschaft bekommt", "Beweise", "Textbausteine je Kanal"]) expect(text).toContain(`"text":"${t}"`);
    for (const s of [output.kurz, output.mittel, output.lang, ...output.nutzen, ...output.beweise]) expect(text).toContain(JSON.stringify(s).slice(1, -1));
    expect(text).toContain(KI_HINWEIS);
    const bausteine = doc.blocks[doc.blocks.length - 1];
    expect(bausteine.type).toBe("facts");
    if (bausteine.type === "facts") {
      expect(bausteine.items.map((f) => f.label)).toEqual([
        `Website-Titel (${output.bausteine.websiteTitel.length} Zeichen)`,
        `Website-Untertitel (${output.bausteine.websiteUntertitel.length} Zeichen)`,
        `Google-Beschreibung (${output.bausteine.googleBeschreibung.length} Zeichen)`,
        `Instagram-Bio (${output.bausteine.instagramBio.length} Zeichen)`,
        `Telefonsatz (${output.bausteine.einSatzAmTelefon.length} Zeichen)`,
      ]);
      expect(bausteine.items[2].value).toBe(output.bausteine.googleBeschreibung);
    }
  });
  it("kommt ohne Ort aus, und viewBlocks lässt nur den KI-Hinweis weg", () => {
    const doc = toDocument(output, { ...input, ort: "" });
    expect(doc.blocks[0]).toMatchObject({ items: [{ label: "Betrieb", value: "Malerei Keller" }, { label: "Für wen", value: "Hausbesitzer in der Region Gossau" }] });
    const shown = viewBlocks(doc);
    expect(shown).toHaveLength(doc.blocks.length - 1);
    expect(JSON.stringify(shown)).not.toContain(KI_HINWEIS);
  });
  it("reportMarkdown beginnt mit dem Titel und listet Abschnitte, Nutzen und Bausteine", () => {
    const md = reportMarkdown(output, input);
    expect(md.startsWith("# Nutzenversprechen\n\n_Für Malerei Keller_")).toBe(true);
    expect(md).toContain("- **Betrieb:** Malerei Keller, Gossau");
    expect(md).toContain("## Kurz\n\nFassaden in Gossau, die zwanzig Jahre halten.");
    expect(md).toContain("- Du bekommst eine Fassade, die zwanzig Jahre hält.");
    expect(md).toContain("- [Zahl der Projekte]");
    expect(md).toContain(`- **Google-Beschreibung (${output.bausteine.googleBeschreibung.length} Zeichen):** Wir streichen`);
  });
});

describe("nutzenversprechen: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, input, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1 })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { betrieb: "" }, output })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE).toEqual({ v: 1, input: null, output: null });
  });
  it("lässt einen kaputten Entwurf allein wegfallen und behält die Eingabe", () => {
    expect(parseState({ v: 1, input, output: { kurz: "x" } })).toEqual({ v: 1, input, output: null });
    expect(parseState({ v: 1, input, output: null })).toEqual({ v: 1, input, output: null });
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, input, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
