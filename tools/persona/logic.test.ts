import { describe, expect, it } from "vitest";
import type { PersonaInput, PersonaOutput } from "./generator";
import {
  ALTERSGRUPPEN,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  MAX_PERSONAS,
  ROLLEN,
  altersgruppeLabel,
  eingabeText,
  formFromInput,
  inputProblem,
  isAltersgruppe,
  isRolle,
  parseState,
  profilePatch,
  reportMarkdown,
  rolleLabel,
  screenBlocks,
  toDocument,
  toInput,
  withVorschlag,
  zielgruppeVorschlag,
  type PersonaForm,
} from "./logic";

const fields = { firma: " Malerei Keller ", branche: "Malerei", ort: "Gossau" };

const form: PersonaForm = {
  zielgruppe: "Hausbesitzer in Gossau und Umgebung",
  angebot: "Fassaden und Innenräume streichen, Beratung vor Ort,   Offerte innert drei Arbeitstagen.",
  altersgruppe: "45-60",
  rolle: "privatperson",
  situation: "Die Fassade blättert.\n\n\n\nIm Frühling soll es fertig sein.",
  fragen: "",
};

const input: PersonaInput = {
  betrieb: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  zielgruppe: "Hausbesitzer in Gossau und Umgebung",
  angebot: "Fassaden und Innenräume streichen, Beratung vor Ort, Offerte innert drei Arbeitstagen.",
  altersgruppe: "45-60",
  rolle: "privatperson",
  situation: "Die Fassade blättert.\n\nIm Frühling soll es fertig sein.",
  fragen: "",
};

const output: PersonaOutput = {
  name: "Ruth Hungerbühler",
  kurz: "Ruth Hungerbühler, zwischen 45 und 60, wohnt mit ihrem Mann in einem Einfamilienhaus am Hang von Gossau.",
  alltag: "Sie arbeitet drei Tage pro Woche in der Gemeindeverwaltung in Flawil und pendelt mit dem Zug. Am Samstag ist sie im Garten, und dort fällt ihr die Fassade auf.",
  ziele: ["Die Fassade soll vor dem Sommer wieder sauber aussehen.", "Ein Betrieb aus der Nähe, der auch danach erreichbar ist.", "Eine Offerte, die sie ihrem Mann zeigen kann."],
  sorgen: ["Dass das Gerüst wochenlang vor dem Haus steht.", "Dass der Preis am Ende höher ist als die Offerte.", "Dass sie die falsche Farbe wählt."],
  informationswege: ["Google, wenn sie «Maler Gossau» sucht.", "Empfehlung aus der Nachbarschaft.", "Das Gemeindeblatt und der Anzeiger."],
  einwaende: ["Wir haben vor Jahren schon einmal streichen lassen, das hält doch noch.", "Ich will zuerst zwei Offerten vergleichen."],
  soSprichstDuSieAn: {
    ton: "Per Sie, ruhig und konkret, ohne Fachwörter, mit klaren Angaben zu Ablauf und Dauer.",
    woerter: ["sauber", "in der Nähe", "verlässlich", "Termin", "Festpreis"],
    vermeiden: ["Premium", "exklusiv", "Lösung"],
  },
  zitat: "Ich will einfach wissen, wann ihr kommt und wann ihr wieder weg seid.",
};

describe("persona: Labels", () => {
  it("liefert Labels für Altersgruppe und Rolle und erkennt die Schlüssel", () => {
    expect(ALTERSGRUPPEN.map((a) => a.key)).toEqual(["unter-30", "30-45", "45-60", "ueber-60", "gemischt"]);
    expect(ROLLEN.map((r) => r.key)).toEqual(["privatperson", "kmu-inhaber", "fachperson", "verwaltung", "vereinsvorstand"]);
    expect(altersgruppeLabel("30-45")).toBe("30 bis 45");
    expect(rolleLabel("verwaltung")).toBe("Verwaltung oder Gemeinde");
    expect(isAltersgruppe("45-60")).toBe(true);
    expect(isAltersgruppe("50-70")).toBe(false);
    expect(isAltersgruppe(45)).toBe(false);
    expect(isRolle("fachperson")).toBe(true);
    expect(isRolle("")).toBe(false);
  });
});

describe("persona: Vorschlag aus dem Profil", () => {
  it("nimmt das Primärsegment, sonst die erste Zielgruppe, sonst nichts", () => {
    expect(zielgruppeVorschlag({ primaersegment: " Hausbesitzer ", zielgruppen: [{ name: "Verwaltungen" }] })).toBe("Hausbesitzer");
    expect(zielgruppeVorschlag({ zielgruppen: [{ name: "Verwaltungen" }, { name: "Private" }] })).toBe("Verwaltungen");
    expect(zielgruppeVorschlag({ primaersegment: "   ", zielgruppen: [] })).toBe("");
    expect(zielgruppeVorschlag({})).toBe("");
  });
  it("füllt die Zielgruppe im Formular nur, wenn sie leer ist", () => {
    expect(withVorschlag(EMPTY_FORM, { primaersegment: "Hausbesitzer" }).zielgruppe).toBe("Hausbesitzer");
    expect(withVorschlag({ ...EMPTY_FORM, zielgruppe: "Vereine" }, { primaersegment: "Hausbesitzer" }).zielgruppe).toBe("Vereine");
    expect(withVorschlag(EMPTY_FORM, {})).toEqual(EMPTY_FORM);
  });
});

describe("persona: Eingabeprüfung", () => {
  it("meldet, was fehlt oder zu lang ist, in der Reihenfolge des Formulars", () => {
    expect(inputProblem({ ...fields, firma: "  " }, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem(fields, { ...form, zielgruppe: " " })).toMatch(/für wen das Angebot ist/);
    expect(inputProblem(fields, { ...form, zielgruppe: "x".repeat(201) })).toMatch(/Zielgruppe ist zu lang/);
    expect(inputProblem(fields, { ...form, angebot: "zu kurz" })).toMatch(/mindestens 20 Zeichen/);
    expect(inputProblem(fields, { ...form, angebot: "x".repeat(601) })).toMatch(/Angebot ist zu lang/);
    expect(inputProblem(fields, { ...form, altersgruppe: "" })).toBe("Wähle eine Altersgruppe.");
    expect(inputProblem(fields, { ...form, rolle: "" })).toBe("Wähle eine Rolle.");
    expect(inputProblem(fields, { ...form, situation: "x".repeat(601) })).toMatch(/Situation ist zu lang/);
    expect(inputProblem(fields, { ...form, fragen: "x".repeat(601) })).toMatch(/Fragen sind zu lang/);
    expect(inputProblem(fields, form)).toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, situation: "", fragen: "" })).toBeNull();
  });
});

describe("persona: toInput und eingabeText", () => {
  it("übernimmt Profil und Formular, bereinigt Leerraum und behält Absätze in den Freitexten", () => {
    expect(toInput(fields, form)).toEqual(input);
    expect(toInput({ firma: "Malerei Keller" }, form)?.branche).toBe("");
    expect(toInput({ firma: "Malerei Keller" }, form)?.ort).toBe("");
  });
  it("gibt null ohne Altersgruppe, ohne Rolle oder ohne Betrieb, und kürzt zu lange Texte", () => {
    expect(toInput(fields, { ...form, altersgruppe: "" })).toBeNull();
    expect(toInput(fields, { ...form, rolle: "" })).toBeNull();
    expect(toInput({}, form)).toBeNull();
    const lang = toInput(fields, { ...form, angebot: "x".repeat(900), situation: "y".repeat(900), zielgruppe: "z".repeat(300) });
    expect(lang?.angebot).toHaveLength(600);
    expect(lang?.situation).toHaveLength(600);
    expect(lang?.zielgruppe).toHaveLength(200);
  });
  it("formFromInput liefert das Formular zur Eingabe zurück", () => {
    expect(toInput(fields, formFromInput(input))).toEqual(input);
  });
  it("eingabeText nennt die Angaben je Zeile, die Zielgruppe zuerst, freiwillige Felder nur, wenn sie da sind", () => {
    expect(eingabeText(input).split("\n")).toEqual([
      "Zielgruppe: Hausbesitzer in Gossau und Umgebung",
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Ort: Gossau",
      "Altersgruppe: 45 bis 60",
      "Rolle: Privatperson",
      "Angebot: Fassaden und Innenräume streichen, Beratung vor Ort, Offerte innert drei Arbeitstagen.",
      "Situation: Die Fassade blättert. / Im Frühling soll es fertig sein.",
    ]);
    expect(eingabeText({ ...input, branche: "", ort: "", situation: "", fragen: "Was kostet das?" })).not.toContain("Branche:");
    expect(eingabeText({ ...input, fragen: "Was kostet das?\nWie lange steht das Gerüst?" })).toContain("Fragen: Was kostet das? / Wie lange steht das Gerüst?");
  });
});

describe("persona: Dokument", () => {
  it("enthält alle Abschnitte, die Facts, den KI-Hinweis und das Zitat als fiktiv gekennzeichnet", () => {
    const doc = toDocument(output, input);
    const text = JSON.stringify(doc.blocks);
    expect(doc.title).toBe("Persona: Ruth Hungerbühler");
    expect(doc.subtitle).toBe("Eine erfundene Person aus der Zielgruppe «Hausbesitzer in Gossau und Umgebung» von Malerei Keller");
    expect(doc.filename).toBe("persona-ruth-hungerbuehler");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Zielgruppe", value: "Hausbesitzer in Gossau und Umgebung" },
        { label: "Altersgruppe", value: "45 bis 60" },
        { label: "Rolle", value: "Privatperson" },
      ],
    });
    expect(text).toContain(KI_HINWEIS);
    expect(text).toContain(output.kurz);
    expect(text).toContain(output.alltag);
    for (const h of ["Alltag", "Ziele", "Sorgen", "Wo sie sucht und liest", "Einwände", "So sprichst du sie an", "Fiktives Zitat"]) {
      expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: h });
    }
    for (const list of [output.ziele, output.sorgen, output.informationswege, output.einwaende]) expect(doc.blocks).toContainEqual({ type: "list", items: list });
    expect(doc.blocks).toContainEqual({
      type: "facts",
      items: [
        { label: "Ton", value: output.soSprichstDuSieAn.ton },
        { label: "Wörter, die ankommen", value: "sauber, in der Nähe, verlässlich, Termin, Festpreis" },
        { label: "Wörter, die abschrecken", value: "Premium, exklusiv, Lösung" },
      ],
    });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: `«${output.zitat}»` });
  });
  it("kommt ohne Eingabe aus und zeigt dann «keine Angabe»", () => {
    const doc = toDocument(output, null);
    expect(doc.subtitle).toBe("Eine erfundene Person aus deiner Zielgruppe");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Zielgruppe", value: "keine Angabe" },
        { label: "Altersgruppe", value: "keine Angabe" },
        { label: "Rolle", value: "keine Angabe" },
      ],
    });
  });
  it("screenBlocks lässt den KI-Hinweis weg, sonst nichts", () => {
    const doc = toDocument(output, input);
    const screen = screenBlocks(doc);
    expect(screen).toHaveLength(doc.blocks.length - 1);
    expect(JSON.stringify(screen)).not.toContain(KI_HINWEIS);
    expect(screen[0]).toEqual(doc.blocks[0]);
  });
  it("reportMarkdown beginnt mit dem Titel und listet die Abschnitte", () => {
    const md = reportMarkdown(output, input);
    expect(md.startsWith("# Persona: Ruth Hungerbühler\n")).toBe(true);
    expect(md).toContain("- **Zielgruppe:** Hausbesitzer in Gossau und Umgebung");
    expect(md).toContain("## Ziele\n\n- Die Fassade soll vor dem Sommer wieder sauber aussehen.");
    expect(md).toContain("## Fiktives Zitat\n\n«Ich will einfach wissen");
    expect(md).toContain(KI_HINWEIS);
  });
});

describe("persona: Profil", () => {
  it("hängt die Persona mit Name, Zielgruppe und Kurzsatz an", () => {
    expect(profilePatch({}, output, input)).toEqual({ personas: [{ name: "Ruth Hungerbühler", zielgruppe: input.zielgruppe, kurz: output.kurz }] });
    const patch = profilePatch({ personas: [{ name: "Reto Brunner", zielgruppe: "Verwaltungen" }] }, output, input);
    expect(patch.personas?.map((p) => p.name)).toEqual(["Reto Brunner", "Ruth Hungerbühler"]);
  });
  it("ersetzt einen Eintrag mit gleichem Namen statt ihn zu doppeln, ohne Gross/Klein", () => {
    const patch = profilePatch({ personas: [{ name: "ruth hungerbühler", zielgruppe: "alt", notiz: "bleibt" }, { name: "Reto Brunner" }] }, output, input);
    expect(patch.personas).toHaveLength(2);
    expect(patch.personas?.[0]).toEqual({ name: "Ruth Hungerbühler", zielgruppe: input.zielgruppe, kurz: output.kurz, notiz: "bleibt" });
    expect(patch.personas?.[1]).toEqual({ name: "Reto Brunner" });
  });
  it("begrenzt auf zehn Einträge und lässt den ältesten fallen", () => {
    const voll = Array.from({ length: MAX_PERSONAS }, (_, i) => ({ name: `Person ${i}` }));
    const patch = profilePatch({ personas: voll }, output, input);
    expect(patch.personas).toHaveLength(MAX_PERSONAS);
    expect(patch.personas?.[0].name).toBe("Person 1");
    expect(patch.personas?.[MAX_PERSONAS - 1].name).toBe("Ruth Hungerbühler");
    expect(MAX_PERSONAS).toBe(10);
  });
});

describe("persona: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten oder falscher Version den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState([])).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, form, input, output })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE.form).toBe(EMPTY_FORM);
  });
  it("lässt kaputten Entwurf oder kaputte Eingabe allein wegfallen und behält das Formular", () => {
    const state = parseState({ v: 1, form: { ...form, altersgruppe: "50-70", rolle: 3, fragen: 7 }, input: { betrieb: "" }, output: { name: "x" } });
    expect(state).toEqual({ v: 1, form: { ...form, altersgruppe: "", rolle: "", fragen: "" }, input: null, output: null });
    expect(parseState({ v: 1 }).form).toEqual(EMPTY_FORM);
    expect(parseState({ v: 1, form: "kaputt", output }).output).toEqual(output);
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, form: formFromInput(input), input, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
