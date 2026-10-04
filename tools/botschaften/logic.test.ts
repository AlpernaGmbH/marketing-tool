import { describe, expect, it } from "vitest";
import type { BotschaftenInput, BotschaftenOutput } from "./generator";
import {
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAELE,
  KI_HINWEIS,
  TELEFON,
  anredeLabel,
  charCount,
  eingabeText,
  hinweisNamen,
  inputProblem,
  isAnrede,
  isKanalKey,
  joinNamen,
  kanalLabel,
  parseState,
  personaNamen,
  profilHinweise,
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
  wirkung: "Die halten den Termin und erklären, was sie tun.",
  beweise: "Seit 1985 in Gossau, 5 Jahre Garantie auf Fassaden.",
  anrede: "du",
};

const fields = {
  firma: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  primaersegment: "Liegenschaftsverwaltungen in St. Gallen",
  personas: [{ name: "Ruth Brunner" }, { name: "Peter Egli" }],
  zielgruppen: [{ name: "Private" }],
};

const input: BotschaftenInput = {
  betrieb: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  zielgruppe: form.zielgruppe,
  angebot: form.angebot,
  wirkung: form.wirkung,
  beweise: form.beweise,
  anrede: "du",
  positionierung: fields.positionierung,
  primaersegment: fields.primaersegment,
  personas: ["Ruth Brunner", "Peter Egli"],
};

const output: BotschaftenOutput = {
  hauptbotschaft: "Die Malerei Keller streicht Fassaden in der Region Gossau, die halten, und hält den Termin, den sie nennt.",
  botschaften: [
    { fuer: "Hausbesitzer", satz: "Du bekommst eine Fassade, die hält, und eine Offerte innert einer Woche.", beleg: "Seit 1985 in Gossau, 5 Jahre Garantie auf Fassaden." },
    { fuer: "Liegenschaftsverwaltungen", satz: "Wir streichen das Treppenhaus, während die Mieter wohnen bleiben.", beleg: "[Zahl der Treppenhäuser seit der Gründung]" },
    { fuer: "Offerte", satz: "Die Offerte nennt den Termin, und der Termin hält.", beleg: "Aus der Positionierung: der Malerbetrieb, der Termine hält." },
  ],
  kanaele: {
    website: "Fassaden in der Region Gossau, die halten. Offerte innert einer Woche, Termin, der hält.",
    googleProfil: "Wir streichen Fassaden und renovieren Innenräume für Hausbesitzer in der Region Gossau. Seit 1985 halten wir Termine und erklären die Farbwahl vor Ort.",
    instagram: "Malerei Keller, Gossau. Fassaden, die halten. Termine, die halten.",
    offerteOderMail: "Danke für deine Anfrage. Du bekommst von uns eine Fassade, die hält, und einen Termin, der hält. Seit 1985 streichen wir Häuser in der Region Gossau.",
  },
  telefonsatz: "Wir sind die Malerei Keller aus Gossau, wir streichen Fassaden, die halten, und wir sind am Tag da, den wir dir sagen.",
  nichtSagen: ["Dass wir alles für alle machen", "Dass wir die Günstigsten in der Region sind", "Ein Preis am Telefon ohne Besichtigung"],
};

describe("botschaften: Vorschlag aus dem Profil", () => {
  it("nimmt das Primärsegment, sonst die erste Zielgruppe, sonst nichts", () => {
    expect(zielgruppeVorschlag({ primaersegment: " Hausbesitzer in Gossau ", zielgruppen: [{ name: "Verwaltungen" }] })).toBe("Hausbesitzer in Gossau");
    expect(zielgruppeVorschlag({ zielgruppen: [{ name: " Verwaltungen " }, { name: "Private" }] })).toBe("Verwaltungen");
    expect(zielgruppeVorschlag({ primaersegment: "  ", zielgruppen: [] })).toBe("");
    expect(zielgruppeVorschlag({})).toBe("");
    expect(zielgruppeVorschlag({ primaersegment: "x".repeat(250) })).toHaveLength(200);
  });
  it("liest die Namen der Personas ohne Leere, ohne Doppel und höchstens fünf", () => {
    expect(personaNamen(fields)).toEqual(["Ruth Brunner", "Peter Egli"]);
    expect(personaNamen({ personas: [{ name: " Ruth  Brunner " }, { name: "ruth brunner" }, { name: "  " }, { name: "Peter Egli" }] })).toEqual(["Ruth Brunner", "Peter Egli"]);
    expect(personaNamen({ personas: Array.from({ length: 8 }, (_, i) => ({ name: `Persona ${i + 1}` })) })).toHaveLength(5);
    expect(personaNamen({ personas: [{ name: "x".repeat(80) }] })[0]).toHaveLength(60);
    expect(personaNamen({})).toEqual([]);
  });
  it("liefert Positionierung, Primärsegment und Personas als Hinweise, gekürzt und leer, wo nichts da ist", () => {
    expect(profilHinweise(fields)).toEqual({ positionierung: fields.positionierung, primaersegment: fields.primaersegment, personas: ["Ruth Brunner", "Peter Egli"] });
    expect(profilHinweise({})).toEqual({ positionierung: "", primaersegment: "", personas: [] });
    const lang = profilHinweise({ positionierung: "p".repeat(700), primaersegment: "s".repeat(300) });
    expect(lang.positionierung).toHaveLength(600);
    expect(lang.primaersegment).toHaveLength(200);
  });
  it("nennt die Profil-Teile für den Satz vor dem Knopf, ohne das Primärsegment, wenn es schon in «Für wen?» steht", () => {
    const h = profilHinweise(fields);
    expect(hinweisNamen(h, form.zielgruppe)).toEqual(["Positionierung", "Primärsegment", "Persona-Namen"]);
    expect(hinweisNamen(h, " liegenschaftsverwaltungen in st. gallen ")).toEqual(["Positionierung", "Persona-Namen"]);
    expect(hinweisNamen(profilHinweise({}))).toEqual([]);
    expect(hinweisNamen(profilHinweise({ personas: [{ name: "Ruth" }] }))).toEqual(["Persona-Namen"]);
    expect(joinNamen([])).toBe("");
    expect(joinNamen(["Positionierung"])).toBe("Positionierung");
    expect(joinNamen(["Positionierung", "Persona-Namen"])).toBe("Positionierung und Persona-Namen");
    expect(joinNamen(["Positionierung", "Primärsegment", "Persona-Namen"])).toBe("Positionierung, Primärsegment und Persona-Namen");
  });
});

describe("botschaften: Eingabeprüfung", () => {
  it("meldet fehlenden Betrieb, fehlende Zielgruppe, zu kurze Pflichtfelder, zu lange Beweise und fehlende Anrede in dieser Reihenfolge", () => {
    expect(inputProblem({}, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem({ firma: "  " }, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem(fields, { ...form, zielgruppe: " " })).toMatch(/für wen/);
    expect(inputProblem(fields, { ...form, angebot: "Fassaden" })).toMatch(/Angebot in mindestens 20 Zeichen/);
    expect(inputProblem(fields, { ...form, wirkung: "   kurz   " })).toMatch(/mindestens 10 Zeichen, was die Kundschaft/);
    expect(inputProblem(fields, { ...form, beweise: "x".repeat(601) })).toMatch(/Kürze die Beweise/);
    expect(inputProblem(fields, { ...form, anrede: "" })).toMatch(/duzt oder siezt/);
    // Reihenfolge: die Zielgruppe kommt vor der Anrede.
    expect(inputProblem(fields, { ...form, zielgruppe: "", anrede: "" })).toMatch(/für wen/);
  });
  it("lässt eine vollständige Eingabe durch, auch ohne Beweise und mit Sie-Form", () => {
    expect(inputProblem(fields, form)).toBeNull();
    expect(inputProblem(fields, { ...form, beweise: "", anrede: "sie" })).toBeNull();
    expect(inputProblem(fields, { ...EMPTY_FORM, zielgruppe: "Private", angebot: "x".repeat(20), wirkung: "y".repeat(10), anrede: "du" })).toBeNull();
    expect(isAnrede("du")).toBe(true);
    expect(isAnrede("sie")).toBe(true);
    expect(isAnrede("")).toBe(false);
    expect(isAnrede("ihr")).toBe(false);
    expect(isAnrede(null)).toBe(false);
  });
});

describe("botschaften: toInput, toForm und eingabeText", () => {
  it("übernimmt Profil und Formular, bereinigt Leerraum, kürzt auf die Grenzen und nimmt die Personas mit", () => {
    const i = toInput({ ...fields, firma: " Malerei   Keller " }, { ...form, angebot: `  ${form.angebot}  \n\n  zweite   Zeile ` });
    expect(i.betrieb).toBe("Malerei Keller");
    expect(i.angebot).toBe(`${form.angebot}\nzweite Zeile`);
    expect(i.anrede).toBe("du");
    expect(i.positionierung).toBe(fields.positionierung);
    expect(i.primaersegment).toBe(fields.primaersegment);
    expect(i.personas).toEqual(["Ruth Brunner", "Peter Egli"]);
    const lang = toInput({ firma: "x".repeat(200), positionierung: "p".repeat(700) }, { ...form, beweise: "b".repeat(700) });
    expect(lang.betrieb).toHaveLength(120);
    expect(lang.positionierung).toHaveLength(600);
    expect(lang.beweise).toHaveLength(600);
    expect(lang.branche).toBe("");
    expect(lang.ort).toBe("");
    expect(lang.primaersegment).toBe("");
    expect(lang.personas).toEqual([]);
    expect(toForm(input)).toEqual(form);
  });
  it("lässt das Primärsegment weg, wenn es wörtlich im Feld «Für wen?» steht, und fällt ohne Anrede auf Sie zurück", () => {
    const gleich = toInput(fields, { ...form, zielgruppe: " liegenschaftsverwaltungen in St. Gallen " });
    expect(gleich.zielgruppe).toBe("liegenschaftsverwaltungen in St. Gallen");
    expect(gleich.primaersegment).toBe("");
    expect(toInput(fields, form).primaersegment).toBe(fields.primaersegment);
    expect(toInput(fields, { ...form, anrede: "" }).anrede).toBe("sie");
  });
  it("eingabeText nennt die Angaben je Zeile und lässt leere Felder weg", () => {
    expect(eingabeText(input).split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Ort: Gossau",
      "Für wen: Hausbesitzer in der Region Gossau",
      "Anrede: Du",
      `Angebot: ${form.angebot}`,
      `Soll denken: ${form.wirkung}`,
      `Beweise: ${form.beweise}`,
      `Positionierung: ${fields.positionierung}`,
      `Primärsegment: ${fields.primaersegment}`,
      "Personas: Ruth Brunner, Peter Egli",
    ]);
    const ohne = eingabeText({ ...input, branche: "", ort: "", beweise: "", positionierung: "", primaersegment: "", personas: [], anrede: "sie" });
    expect(ohne).toContain("Anrede: Sie");
    for (const feld of ["Branche:", "Ort:", "Beweise:", "Positionierung:", "Primärsegment:", "Personas:"]) expect(ohne).not.toContain(feld);
  });
});

describe("botschaften: Anrede, Kanäle und Zeichen", () => {
  it("kennt zwei Anreden, vier Kanäle mit Grenzen, den Telefonsatz und zählt Zeichen je Zeichen", () => {
    expect(ANREDEN.map((a) => a.key)).toEqual(["du", "sie"]);
    expect(anredeLabel("du")).toBe("Du");
    expect(anredeLabel("sie")).toBe("Sie");
    expect(KANAELE.map((k) => k.key)).toEqual(["website", "googleProfil", "instagram", "offerteOderMail"]);
    expect(KANAELE.map((k) => k.copyLabel)).toEqual(["Website-Text kopieren", "Google-Text kopieren", "Instagram-Text kopieren", "Offerten-Text kopieren"]);
    expect(KANAELE.map((k) => k.max)).toEqual([240, 300, 200, 400]);
    expect(TELEFON).toEqual({ label: "Telefonsatz", copyLabel: "Telefonsatz kopieren", max: 200 });
    expect(kanalLabel("googleProfil")).toBe("Google-Unternehmensprofil");
    expect(isKanalKey("instagram")).toBe(true);
    expect(isKanalKey("tiktok")).toBe(false);
    expect(charCount("Gossau")).toBe(6);
    expect(charCount("Zürich")).toBe(6);
    expect(zeichenLabel("Malerei Keller, Gossau", 240)).toBe("22 von 240 Zeichen");
  });
});

describe("botschaften: Dokument", () => {
  it("enthält Facts, die Hauptbotschaft, die Tabelle mit allen Botschaften, alle Kanäle, den Telefonsatz, die Liste und den KI-Hinweis", () => {
    const doc = toDocument(output, input);
    const text = JSON.stringify(doc.blocks);
    expect(doc.title).toBe("Kernbotschaften");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.filename).toBe("botschaften-malerei-keller");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Für wen", value: "Hausbesitzer in der Region Gossau" },
        { label: "Anrede", value: "Du" },
      ],
    });
    expect(text).toContain(KI_HINWEIS);
    for (const t of ["Hauptbotschaft", "Botschaften je Zielgruppe oder Anlass", "Fassung je Kanal", "Am Telefon oder am Stand", "Das sagen wir nicht"]) {
      expect(text).toContain(`"text":"${t}"`);
    }
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table).toBeDefined();
    if (table?.type === "table") {
      expect(table.header).toEqual(["Für", "Botschaft", "Beleg"]);
      expect(table.rows).toEqual(output.botschaften.map((b) => [b.fuer, b.satz, b.beleg]));
      expect(table.widths).toEqual([1, 2, 2]);
    }
    const kanaele = doc.blocks.filter((b) => b.type === "facts")[1];
    expect(kanaele.type).toBe("facts");
    if (kanaele.type === "facts") {
      expect(kanaele.items).toEqual([
        { label: "Website", value: output.kanaele.website },
        { label: "Google-Unternehmensprofil", value: output.kanaele.googleProfil },
        { label: "Instagram", value: output.kanaele.instagram },
        { label: "Offerte oder Mail", value: output.kanaele.offerteOderMail },
      ]);
    }
    expect(text).toContain(JSON.stringify(output.hauptbotschaft).slice(1, -1));
    expect(text).toContain(JSON.stringify(output.telefonsatz).slice(1, -1));
    const liste = doc.blocks[doc.blocks.length - 1];
    expect(liste).toEqual({ type: "list", items: output.nichtSagen });
  });
  it("kommt ohne Ort aus, und viewBlocks lässt nur den KI-Hinweis weg", () => {
    const doc = toDocument(output, { ...input, ort: "", anrede: "sie" });
    expect(doc.blocks[0]).toMatchObject({ items: [{ label: "Betrieb", value: "Malerei Keller" }, { label: "Für wen", value: input.zielgruppe }, { label: "Anrede", value: "Sie" }] });
    const shown = viewBlocks(doc);
    expect(shown).toHaveLength(doc.blocks.length - 1);
    expect(JSON.stringify(shown)).not.toContain(KI_HINWEIS);
  });
  it("reportMarkdown beginnt mit dem Titel und listet Hauptbotschaft, Tabelle, Kanäle, Telefonsatz und Liste", () => {
    const md = reportMarkdown(output, input);
    expect(md.startsWith("# Kernbotschaften\n\n_Für Malerei Keller_")).toBe(true);
    expect(md).toContain("- **Betrieb:** Malerei Keller, Gossau");
    expect(md).toContain(`## Hauptbotschaft\n\n${output.hauptbotschaft}`);
    expect(md).toContain("| Für | Botschaft | Beleg |");
    expect(md).toContain("| Hausbesitzer | Du bekommst eine Fassade, die hält, und eine Offerte innert einer Woche. | Seit 1985 in Gossau, 5 Jahre Garantie auf Fassaden. |");
    expect(md).toContain("| Liegenschaftsverwaltungen | ");
    expect(md).toContain(`- **Website:** ${output.kanaele.website}`);
    expect(md).toContain(`- **Offerte oder Mail:** ${output.kanaele.offerteOderMail}`);
    expect(md).toContain(`## Am Telefon oder am Stand\n\n${output.telefonsatz}`);
    expect(md).toContain("- Dass wir alles für alle machen");
  });
});

describe("botschaften: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState([])).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, input, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1 })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { betrieb: "" }, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { ...input, anrede: "ihr" }, output })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE).toEqual({ v: 1, input: null, output: null });
  });
  it("lässt einen kaputten Entwurf allein wegfallen und behält die Eingabe", () => {
    expect(parseState({ v: 1, input, output: { hauptbotschaft: "x" } })).toEqual({ v: 1, input, output: null });
    expect(parseState({ v: 1, input, output: { ...output, botschaften: [] } })).toEqual({ v: 1, input, output: null });
    expect(parseState({ v: 1, input, output: null })).toEqual({ v: 1, input, output: null });
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, input, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
