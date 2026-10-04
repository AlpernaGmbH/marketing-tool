import { describe, expect, it } from "vitest";
import { LIMITS, type MarkenInput, type MarkenOutput } from "./generator";
import {
  ABSCHNITTE,
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  anredeLabel,
  charCount,
  eingabeText,
  hatMarke,
  hostOf,
  inputProblem,
  isAnrede,
  looksLikeWebsite,
  normalizeOutput,
  parseState,
  profilHinweise,
  profilePatch,
  reportMarkdown,
  storedInput,
  toDocument,
  toForm,
  toInput,
  viewBlocks,
  websiteLesenVorschlag,
  withVorschlag,
  type FormValues,
} from "./logic";

const profile = {
  firma: " Malerei Keller ",
  branche: "Malerei",
  ort: "Gossau",
  website: "www.malerei-keller.ch",
  positionierung: "Der Malerbetrieb in Gossau,   der Termine hält.",
  primaersegment: "Eigentümer älterer Einfamilienhäuser",
};

const form: FormValues = {
  wofuer: "Saubere Arbeit, Termine, die wir halten,   und eine Offerte, die am Ende auch die Rechnung ist.\n\n\n\nSeit 1985 im Fürstenland.",
  woerterKundschaft: " zuverlässig, bodenständig,  genau ",
  nie: "",
  anrede: "sie",
  websiteLesen: false,
};

const input: MarkenInput = {
  betrieb: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  zielgruppe: "Eigentümer älterer Einfamilienhäuser",
  wofuer: "Saubere Arbeit, Termine, die wir halten, und eine Offerte, die am Ende auch die Rechnung ist.\n\nSeit 1985 im Fürstenland.",
  woerterKundschaft: "zuverlässig, bodenständig, genau",
  nie: "",
  anrede: "sie",
  websiteText: "",
  headings: [],
};

const page = { host: "malerei-keller.ch", headings: ["Malerei Keller Gossau", "  ", "Unsere Leistungen"], text: "Willkommen bei der   Malerei Keller.\nWir streichen Fassaden." };

const output: MarkenOutput = {
  versprechen: "Wir streichen so, dass die Fassade hält und der Termin steht, und erklären die Farbwahl vor Ort.",
  werte: [
    { name: "Verlässlich", satz: "Wir rufen am gleichen Tag zurück und halten den Termin, den wir nennen." },
    { name: "Genau", satz: "Wir decken ab, bevor wir anfangen, und räumen auf, bevor wir gehen." },
    { name: "Bodenständig", satz: "Wir sagen, was eine Fassade kostet, ohne Umwege und ohne Rabattspiel." },
  ],
  persoenlichkeit: ["ruhig", "handfest", "verbindlich"],
  tonalitaet: {
    so: "Kurze Sätze. Per Sie, freundlich, ohne Fachwörter. Wir sagen, was wir tun und wann.",
    nichtSo: "Keine Rabatte, keine Superlative, keine Versprechen über Termine, die wir nicht halten können.",
    beispielSatz: "Gern schauen wir uns Ihre Fassade an und sagen Ihnen vor Ort, was sie braucht.",
  },
  woerter: {
    verwenden: ["sauber", "Termin", "vor Ort", "Offerte", "halten"],
    vermeiden: ["Premium", "exklusiv", "Lösung", "Aktion", "Rabatt"],
  },
  geschichte:
    "Die Malerei Keller arbeitet seit 1985 im Fürstenland. [Name der Gründerin] hat den Betrieb in Gossau aufgebaut, mit dem Grundsatz, dass eine Offerte am Ende auch die Rechnung ist. Daran hat sich bis heute nichts geändert.",
  bewertungsregeln: [
    "Wir danken für jede Bewertung mit Namen und einem Satz zum Auftrag.",
    "Bei Kritik entschuldigen wir uns nicht pauschal, sondern bieten ein Gespräch an.",
    "Wir antworten innert weniger Tage, in der Sie-Form, ohne Rechtfertigung.",
  ],
  heutigerTon: "Die Startseite spricht per Sie, mit kurzen Sätzen. Mit der Plattform kommen Werte und Beispielsätze dazu.",
};

describe("markenplattform: Anreden und Hilfen", () => {
  it("kennt Du und Sie, erkennt die Schlüssel und zählt Zeichen", () => {
    expect(ANREDEN.map((a) => a.key)).toEqual(["du", "sie"]);
    expect(anredeLabel("du")).toBe("Du");
    expect(anredeLabel("sie")).toBe("Sie");
    expect(isAnrede("sie")).toBe(true);
    expect(isAnrede("ihr")).toBe(false);
    expect(isAnrede("")).toBe(false);
    expect(charCount("Grüezi")).toBe(6);
    expect(charCount("")).toBe(0);
  });
  it("erkennt Website-Adressen grob und liefert den Host für die Anzeige", () => {
    expect(looksLikeWebsite("malerei-keller.ch")).toBe(true);
    expect(looksLikeWebsite("https://www.malerei-keller.ch/ueber-uns")).toBe(true);
    expect(looksLikeWebsite("malerei keller")).toBe(false);
    expect(looksLikeWebsite("keller")).toBe(false);
    expect(looksLikeWebsite("")).toBe(false);
    expect(looksLikeWebsite(undefined)).toBe(false);
    expect(hostOf("https://www.malerei-keller.ch/ueber-uns")).toBe("malerei-keller.ch");
    expect(hostOf("malerei-keller.ch")).toBe("malerei-keller.ch");
    expect(hostOf("")).toBe("");
  });
});

describe("markenplattform: Vorschläge aus dem Profil", () => {
  it("kreuzt «Website lesen» nur an, wenn im Profil eine brauchbare Adresse steht", () => {
    expect(websiteLesenVorschlag({ website: "malerei-keller.ch" })).toBe(true);
    expect(websiteLesenVorschlag({ website: "keller" })).toBe(false);
    expect(websiteLesenVorschlag({})).toBe(false);
  });
  it("nimmt Positionierung und Primärsegment gekürzt mit, sonst leer", () => {
    expect(profilHinweise(profile)).toEqual({ positionierung: "Der Malerbetrieb in Gossau, der Termine hält.", zielgruppe: "Eigentümer älterer Einfamilienhäuser" });
    expect(profilHinweise({})).toEqual({ positionierung: "", zielgruppe: "" });
    expect(profilHinweise({ positionierung: "x".repeat(900), primaersegment: "y".repeat(300) })).toEqual({ positionierung: "x".repeat(LIMITS.positionierung), zielgruppe: "y".repeat(LIMITS.zielgruppe) });
  });
  it("löst die Checkbox nur auf, solange sie nicht angefasst wurde", () => {
    expect(withVorschlag(EMPTY_FORM, profile).websiteLesen).toBe(true);
    expect(withVorschlag(EMPTY_FORM, {}).websiteLesen).toBe(false);
    expect(withVorschlag({ ...EMPTY_FORM, websiteLesen: false }, profile).websiteLesen).toBe(false);
    expect(withVorschlag({ ...EMPTY_FORM, websiteLesen: true }, {}).websiteLesen).toBe(true);
  });
});

describe("markenplattform: Eingabeprüfung", () => {
  it("meldet, was fehlt oder zu lang ist, in der Reihenfolge des Formulars", () => {
    const fields = { firma: profile.firma, website: profile.website };
    expect(inputProblem({ firma: "  ", website: "" }, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem(fields, { ...form, wofuer: "zu kurz" })).toMatch(/mindestens 20 Zeichen/);
    expect(inputProblem(fields, { ...form, wofuer: "x".repeat(LIMITS.wofuer + 1) })).toMatch(/zu lang/);
    expect(inputProblem(fields, { ...form, woerterKundschaft: " " })).toMatch(/drei Wörter/);
    expect(inputProblem(fields, { ...form, woerterKundschaft: "x".repeat(LIMITS.woerterKundschaft + 1) })).toMatch(/drei Wörter sind zu lang/);
    expect(inputProblem(fields, { ...form, nie: "x".repeat(LIMITS.nie + 1) })).toMatch(/nie sagen würdest, ist zu lang/);
    expect(inputProblem(fields, { ...form, anrede: "" })).toBe("Wähle die Anrede: Du oder Sie.");
    expect(inputProblem({ firma: "Malerei Keller", website: "keller" }, { ...form, websiteLesen: true })).toMatch(/gültige Adresse/);
    expect(inputProblem({ firma: "Malerei Keller", website: "" }, { ...form, websiteLesen: true })).toMatch(/gültige Adresse/);
    expect(inputProblem({ firma: "Malerei Keller", website: "" }, { ...form, websiteLesen: false })).toBeNull();
    expect(inputProblem(fields, { ...form, websiteLesen: true })).toBeNull();
    expect(inputProblem(fields, form)).toBeNull();
  });
});

describe("markenplattform: toInput, toForm und eingabeText", () => {
  it("übernimmt Profil und Formular, bereinigt Leerraum und lässt die Website ohne Seite leer", () => {
    expect(toInput(profile, form, null)).toEqual(input);
    const ohne = toInput({ firma: "Malerei Keller" }, form, null);
    expect(ohne?.branche).toBe("");
    expect(ohne?.ort).toBe("");
    expect(ohne?.positionierung).toBe("");
    expect(ohne?.zielgruppe).toBe("");
  });
  it("nimmt Text und Überschriften der Seite mit, bereinigt und kürzt sie", () => {
    const mit = toInput(profile, form, page);
    expect(mit?.websiteText).toBe("Willkommen bei der Malerei Keller. Wir streichen Fassaden.");
    expect(mit?.headings).toEqual(["Malerei Keller Gossau", "Unsere Leistungen"]);
    const lang = toInput(profile, form, { host: "x.ch", headings: Array.from({ length: 30 }, (_, i) => `H${i} ${"x".repeat(300)}`), text: "y".repeat(9000) });
    expect(lang?.websiteText).toHaveLength(LIMITS.websiteText);
    expect(lang?.headings).toHaveLength(LIMITS.headings);
    expect(lang?.headings[0]).toHaveLength(LIMITS.heading);
  });
  it("gibt null ohne Anrede oder ohne Betrieb und kürzt zu lange Texte", () => {
    expect(toInput(profile, { ...form, anrede: "" }, null)).toBeNull();
    expect(toInput({}, form, null)).toBeNull();
    const lang = toInput(profile, { ...form, wofuer: "x".repeat(900), nie: "y".repeat(900), woerterKundschaft: "z".repeat(300) }, null);
    expect(lang?.wofuer).toHaveLength(LIMITS.wofuer);
    expect(lang?.nie).toHaveLength(LIMITS.nie);
    expect(lang?.woerterKundschaft).toHaveLength(LIMITS.woerterKundschaft);
  });
  it("toForm liefert das Formular zur Eingabe zurück, mit der Checkbox nach gelesener Website; storedInput lässt den Website-Text weg", () => {
    expect(toForm(input)).toEqual({ ...form, wofuer: input.wofuer, woerterKundschaft: input.woerterKundschaft, websiteLesen: false });
    expect(toForm(input, "malerei-keller.ch").websiteLesen).toBe(true);
    expect(toForm(null)).toBe(EMPTY_FORM);
    expect(toInput(profile, toForm(input), null)).toEqual(input);
    const mit = toInput(profile, form, page);
    expect(storedInput(mit as MarkenInput)).toEqual({ ...mit, websiteText: "" });
    expect(storedInput(mit as MarkenInput).headings).toEqual(["Malerei Keller Gossau", "Unsere Leistungen"]);
  });
  it("eingabeText nennt die Angaben je Zeile, freiwillige Felder nur, wenn sie da sind, nie den Text der Website", () => {
    expect(eingabeText(input).split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Ort: Gossau",
      "Anrede: Sie",
      "Wofür der Betrieb steht: Saubere Arbeit, Termine, die wir halten, und eine Offerte, die am Ende auch die Rechnung ist. / Seit 1985 im Fürstenland.",
      "Drei Wörter: zuverlässig, bodenständig, genau",
      "Primärsegment: Eigentümer älterer Einfamilienhäuser",
      "Positionierung: Der Malerbetrieb in Gossau, der Termine hält.",
      "Website gelesen: nein",
    ]);
    const mit = eingabeText({ ...input, branche: "", ort: "", nie: "Rabatte anpreisen.", positionierung: "", zielgruppe: "", websiteText: "Willkommen bei der Malerei Keller.", headings: ["Malerei Keller", "Kontakt"] });
    expect(mit).not.toContain("Branche:");
    expect(mit).toContain("Nie: Rabatte anpreisen.");
    expect(mit).toContain("Website gelesen: ja");
    expect(mit).toContain("Überschriften: Malerei Keller · Kontakt");
    expect(mit).not.toContain("Willkommen");
  });
});

describe("markenplattform: Entwurf und Dokument", () => {
  it("normalizeOutput leert den heutigen Ton ohne gelesene Website", () => {
    expect(normalizeOutput(output, true)).toEqual(output);
    expect(normalizeOutput(output, false)).toEqual({ ...output, heutigerTon: "" });
  });
  it("enthält alle Abschnitte, die Facts, den KI-Hinweis und den heutigen Ton nur, wenn er da ist", () => {
    const doc = toDocument(output, input);
    const text = JSON.stringify(doc.blocks);
    expect(doc.title).toBe("Markenplattform");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("markenplattform-malerei-keller");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Anrede der Kundschaft", value: "Sie" },
      ],
    });
    expect(text).toContain(KI_HINWEIS);
    for (const h of Object.values(ABSCHNITTE)) expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: h });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: output.versprechen });
    expect(doc.blocks).toContainEqual({ type: "list", items: output.werte.map((w) => `${w.name}: ${w.satz}`) });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: "ruhig, handfest, verbindlich" });
    expect(doc.blocks).toContainEqual({
      type: "facts",
      items: [
        { label: "So schreiben wir", value: output.tonalitaet.so },
        { label: "So nicht", value: output.tonalitaet.nichtSo },
        { label: "Beispielsatz", value: output.tonalitaet.beispielSatz },
      ],
    });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 2, text: "Verwenden" });
    expect(doc.blocks).toContainEqual({ type: "list", items: output.woerter.verwenden });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 2, text: "Vermeiden" });
    expect(doc.blocks).toContainEqual({ type: "list", items: output.woerter.vermeiden });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: output.geschichte });
    expect(doc.blocks).toContainEqual({ type: "list", items: output.bewertungsregeln });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: output.heutigerTon });

    const ohneTon = toDocument({ ...output, heutigerTon: "" }, input);
    expect(ohneTon.blocks).not.toContainEqual({ type: "heading", level: 1, text: ABSCHNITTE.heutigerTon });
    expect(ohneTon.blocks).toHaveLength(doc.blocks.length - 2);
  });
  it("kommt ohne Eingabe aus und zeigt dann «keine Angabe»", () => {
    const doc = toDocument(output, null);
    expect(doc.subtitle).toBe("Für deinen Betrieb");
    expect(doc.firma).toBeUndefined();
    expect(doc.filename).toBe("markenplattform-betrieb");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "keine Angabe" },
        { label: "Anrede der Kundschaft", value: "keine Angabe" },
      ],
    });
    expect(toDocument(output, { ...input, ort: "" }).blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller" },
        { label: "Anrede der Kundschaft", value: "Sie" },
      ],
    });
  });
  it("viewBlocks lässt den KI-Hinweis weg, reportMarkdown beginnt mit dem Titel und listet die Abschnitte", () => {
    const doc = toDocument(output, input);
    const screen = viewBlocks(doc);
    expect(screen).toHaveLength(doc.blocks.length - 1);
    expect(JSON.stringify(screen)).not.toContain(KI_HINWEIS);
    const md = reportMarkdown(output, input);
    expect(md.startsWith("# Markenplattform\n")).toBe(true);
    expect(md).toContain("- **Betrieb:** Malerei Keller, Gossau");
    expect(md).toContain("## Werte\n\n- Verlässlich: Wir rufen am gleichen Tag zurück");
    expect(md).toContain("### Vermeiden\n\n- Premium");
    expect(md).toContain("## Antworten auf Bewertungen\n\n- Wir danken");
    expect(md).toContain(KI_HINWEIS);
  });
});

describe("markenplattform: Profil", () => {
  it("schreibt Werte, Persönlichkeit, Tonalität, Wörter und Bewertungsregeln in eine leere Marke", () => {
    expect(hatMarke({})).toBe(false);
    expect(profilePatch({}, output, input)).toEqual({
      marke: {
        werte: ["Verlässlich", "Genau", "Bodenständig"],
        persoenlichkeit: { eigenschaften: ["ruhig", "handfest", "verbindlich"] },
        tonalitaet: { so: output.tonalitaet.so, nichtSo: output.tonalitaet.nichtSo, anrede: "sie" },
        woerter: { verwenden: output.woerter.verwenden, vermeiden: output.woerter.vermeiden },
        bewertungsregeln: output.bewertungsregeln,
      },
    });
  });
  it("lässt eine Marke mit Werten in Ruhe und behält bei einer Marke ohne Werte die übrigen Schlüssel", () => {
    expect(hatMarke({ marke: { werte: ["Verlässlich"] } })).toBe(true);
    expect(profilePatch({ marke: { werte: ["Verlässlich"], tonalitaet: { so: "alt" } } }, output, input)).toEqual({});
    expect(hatMarke({ marke: { werte: [] } })).toBe(false);
    expect(hatMarke({ marke: { werte: [" "] } })).toBe(false);
    const patch = profilePatch({ marke: { werte: [], farben: ["blau"] } }, output, input);
    expect(patch.marke).toMatchObject({ farben: ["blau"], werte: ["Verlässlich", "Genau", "Bodenständig"] });
  });
});

describe("markenplattform: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten, falscher Version oder kaputter Eingabe den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState([])).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, input, output, website: "" })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { betrieb: "" }, output, website: "" })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1 })).toBe(EMPTY_STATE);
  });
  it("lässt einen kaputten Entwurf allein wegfallen und behält die Eingabe, kürzt die Website", () => {
    expect(parseState({ v: 1, input, output: { versprechen: "x" }, website: 7 })).toEqual({ v: 1, input, output: null, website: "" });
    expect(parseState({ v: 1, input, output, website: "x".repeat(300) }).website).toHaveLength(200);
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, input: storedInput(toInput(profile, form, page) as MarkenInput), output, website: "malerei-keller.ch" };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
