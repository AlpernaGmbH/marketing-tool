import { describe, expect, it } from "vitest";
import type { Saeule, SaeulenInput, SaeulenOutput } from "./generator";
import {
  BEITRAEGE,
  DEFAULT_KANAELE,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAELE,
  KI_HINWEIS,
  ZIEL_LABELS,
  beitraegeLabel,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  inputProblem,
  isBeitraegeKey,
  isKanalKey,
  kanaeleAusProfil,
  kanaeleVorschlag,
  kanalLabel,
  normalizeKanaele,
  parseState,
  personaNamen,
  profilePatch,
  reportMarkdown,
  screenBlocks,
  toDocument,
  toInput,
  type SaeulenForm,
} from "./logic";

const fields = {
  firma: " Malerei Keller ",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau,   der Termine hält.",
  primaersegment: "Hausbesitzer in Gossau und Umgebung",
  personas: [{ name: "Ruth Hungerbühler" }, { name: "  Reto Brunner  " }],
  kanaele: [{ name: "Instagram" }, { kanal: "Google Unternehmensprofil" }],
};

const form: SaeulenForm = {
  angebot: "Fassaden und Innenräume streichen,   Farbberatung vor Ort.\n\n\nFragen: Was kostet eine Fassade? Wie lange hält die Farbe?",
  alltag: "Baustellen in der Region, zwei Lehrlinge.",
  kanaele: ["google", "instagram", "instagram"],
  beitraegeProWoche: "2",
};

const input: SaeulenInput = {
  betrieb: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  primaersegment: "Hausbesitzer in Gossau und Umgebung",
  personas: ["Ruth Hungerbühler", "Reto Brunner"],
  angebot: "Fassaden und Innenräume streichen, Farbberatung vor Ort.\nFragen: Was kostet eine Fassade? Wie lange hält die Farbe?",
  alltag: "Baustellen in der Region, zwei Lehrlinge.",
  kanaele: ["instagram", "google"],
  beitraegeProWoche: "2",
};

const saeule = (over: Partial<Saeule> = {}): Saeule => ({
  name: "Fassaden vorher und nachher",
  beschreibung: "Was eine Fassade in Gossau braucht, vom Gerüst bis zum letzten Anstrich. Die Kundschaft sieht, wie sauber gearbeitet wird.",
  ziel: "anfragen",
  beispiele: ["Ein Haus in Gossau in drei Bildern: vor, während und nach dem Gerüst.", "Was ein Regentag auf der Baustelle ändert.", "Wie lange eine Fassadenfarbe hält."],
  anteil: 35,
  ...over,
});

const output: SaeulenOutput = {
  saeulen: [
    saeule(),
    saeule({ name: "Fragen aus dem Alltag", ziel: "vertrauen", anteil: 25, beschreibung: "Die Fragen vom Telefon, einmal in Ruhe beantwortet, damit die Kundschaft vor der Offerte weiss, was sie erwartet." }),
    saeule({ name: "Team und Lehre", ziel: "bindung", anteil: 20, beschreibung: "Wer bei der Malerei Keller arbeitet und wie die Lehre läuft. Die Kundschaft lernt die Leute kennen, die zu ihr kommen." }),
    saeule({ name: "Gossau und die Region", ziel: "sichtbarkeit", anteil: 20, beschreibung: "Der Betrieb als Teil des Dorfs: Anlässe, Nachbarn, Baustellen am Dorfplatz. So bleibt der Name in Gossau präsent." }),
  ],
  rhythmus: {
    satz: "Mit 2 Beiträgen pro Woche kommen die Fassaden jede Woche dran, die drei anderen Säulen wechseln sich ab.",
    wochenplan: [
      { tag: "Dienstag", saeule: "Fassaden vorher und nachher", kanal: "Instagram" },
      { tag: "Freitag", saeule: "Fragen aus dem Alltag", kanal: "Google-Beitrag" },
    ],
  },
  niemals: ["Memes und Trends ohne Bezug zum Malen, weil sie der Kundschaft nichts sagen.", "Preise ohne Besichtigung, weil jede Fassade anders ist."],
};

describe("content-saeulen: Listen und Labels", () => {
  it("kennt sechs Kanäle, vier Mengen und vier Ziele mit Labels und erkennt die Schlüssel", () => {
    expect(KANAELE.map((k) => k.key)).toEqual(["instagram", "facebook", "linkedin", "google", "newsletter", "website"]);
    expect(KANAELE.map((k) => k.label)).toEqual(["Instagram", "Facebook", "LinkedIn", "Google-Beitrag", "Newsletter", "Website"]);
    expect(BEITRAEGE.map((b) => b.key)).toEqual(["1", "2", "3", "5"]);
    expect(beitraegeLabel("1")).toBe("1 Beitrag pro Woche");
    expect(beitraegeLabel("5")).toBe("5 Beiträge pro Woche");
    expect(kanalLabel("google")).toBe("Google-Beitrag");
    expect(ZIEL_LABELS).toEqual({ vertrauen: "Vertrauen", sichtbarkeit: "Sichtbarkeit", anfragen: "Anfragen", bindung: "Bindung" });
    expect(isKanalKey("linkedin")).toBe(true);
    expect(isKanalKey("tiktok")).toBe(false);
    expect(isKanalKey(3)).toBe(false);
    expect(isBeitraegeKey("3")).toBe(true);
    expect(isBeitraegeKey("4")).toBe(false);
    expect(isBeitraegeKey("")).toBe(false);
    expect(DEFAULT_KANAELE).toEqual(["instagram", "google"]);
  });
  it("normalizeKanaele bringt Kanäle in feste Reihenfolge, ohne Doppel und ohne Unbekanntes", () => {
    expect(normalizeKanaele(["google", "instagram", "instagram", "tiktok", 7])).toEqual(["instagram", "google"]);
    expect(normalizeKanaele(["website", "facebook"])).toEqual(["facebook", "website"]);
    expect(normalizeKanaele([])).toEqual([]);
  });
});

describe("content-saeulen: Vorschläge aus dem Profil", () => {
  it("erkennt Kanäle im Profil an Name oder Kanal, auch in anderer Schreibweise, in fester Reihenfolge", () => {
    expect(kanaeleAusProfil(fields)).toEqual(["instagram", "google"]);
    expect(kanaeleAusProfil({ kanaele: [{ kanal: "E-Mail-Newsletter" }, { name: "Blog auf der Webseite" }, { name: "LinkedIn Seite" }, { name: "facebook" }] })).toEqual(["facebook", "linkedin", "newsletter", "website"]);
    expect(kanaeleAusProfil({ kanaele: [{ name: "TikTok" }, { notiz: "Instagram" }, { name: 3 }] })).toEqual([]);
    expect(kanaeleAusProfil({ kanaele: [] })).toEqual([]);
    expect(kanaeleAusProfil({})).toEqual([]);
  });
  it("schlägt die Kanäle aus dem Profil vor, sonst Instagram und Google-Beitrag", () => {
    expect(kanaeleVorschlag(fields)).toEqual(["instagram", "google"]);
    expect(kanaeleVorschlag({ kanaele: [{ name: "LinkedIn" }] })).toEqual(["linkedin"]);
    expect(kanaeleVorschlag({ kanaele: [{ name: "TikTok" }] })).toEqual(DEFAULT_KANAELE);
    expect(kanaeleVorschlag({})).toEqual(DEFAULT_KANAELE);
  });
  it("effectiveKanaele nimmt die gewählten Kanäle, sonst den Vorschlag", () => {
    expect(effectiveKanaele({ kanaele: null }, fields)).toEqual(["instagram", "google"]);
    expect(effectiveKanaele({ kanaele: null }, {})).toEqual(DEFAULT_KANAELE);
    expect(effectiveKanaele({ kanaele: ["linkedin"] }, fields)).toEqual(["linkedin"]);
    expect(effectiveKanaele({ kanaele: [] }, fields)).toEqual([]);
  });
  it("personaNamen liest die Namen, kürzt sie und nimmt höchstens fünf", () => {
    expect(personaNamen(fields)).toEqual(["Ruth Hungerbühler", "Reto Brunner"]);
    expect(personaNamen({ personas: [{ name: "" }, { name: "x".repeat(70) }] })).toEqual(["x".repeat(60)]);
    expect(personaNamen({ personas: Array.from({ length: 7 }, (_, i) => ({ name: `Person ${i}` })) })).toHaveLength(5);
    expect(personaNamen({ personas: [] })).toEqual([]);
    expect(personaNamen({})).toEqual([]);
  });
});

describe("content-saeulen: Eingabeprüfung", () => {
  it("meldet, was fehlt oder zu lang ist, in der Reihenfolge des Formulars", () => {
    expect(inputProblem({ firma: "  " }, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem({}, form)).toMatch(/Namen deines Betriebs/);
    expect(inputProblem(fields, { ...form, angebot: "zu kurz" })).toMatch(/mindestens 20 Zeichen/);
    expect(inputProblem(fields, { ...form, angebot: "x".repeat(801) })).toMatch(/Angebot ist zu lang/);
    expect(inputProblem(fields, { ...form, alltag: "x".repeat(401) })).toMatch(/Alltag ist zu lang/);
    expect(inputProblem(fields, { ...form, kanaele: [] })).toBe("Wähle mindestens einen Kanal.");
    expect(inputProblem(fields, { ...form, kanaele: null })).toBe("Wähle mindestens einen Kanal.");
    expect(inputProblem(fields, { ...form, beitraegeProWoche: "" })).toMatch(/wie viele Beiträge pro Woche/);
  });
  it("lässt eine vollständige Eingabe durch, auch ohne Alltag, und nimmt die geltenden Kanäle als dritten Wert", () => {
    expect(inputProblem(fields, form)).toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, alltag: "" })).toBeNull();
    expect(inputProblem(fields, { ...form, kanaele: null }, ["instagram"])).toBeNull();
    expect(inputProblem(fields, form, [])).toBe("Wähle mindestens einen Kanal.");
  });
});

describe("content-saeulen: toInput, formFromInput und eingabeText", () => {
  it("übernimmt Profil und Formular, bereinigt Leerraum, ordnet die Kanäle und liest die Personas", () => {
    expect(toInput(fields, form)).toEqual(input);
    expect(toInput({ firma: "Malerei Keller" }, form)).toMatchObject({ branche: "", ort: "", positionierung: "", primaersegment: "", personas: [] });
  });
  it("nimmt die geltenden Kanäle als dritten Wert und gibt null ohne Menge, ohne Kanal, ohne Betrieb oder mit zu kurzem Angebot", () => {
    expect(toInput(fields, { ...form, kanaele: null }, ["linkedin"])?.kanaele).toEqual(["linkedin"]);
    expect(toInput(fields, { ...form, beitraegeProWoche: "" })).toBeNull();
    expect(toInput(fields, { ...form, kanaele: [] })).toBeNull();
    expect(toInput({}, form)).toBeNull();
    expect(toInput(fields, { ...form, angebot: "zu kurz" })).toBeNull();
  });
  it("kürzt zu lange Texte auf die Grenzen", () => {
    const lang = toInput(
      { ...fields, firma: "x".repeat(200), positionierung: "p".repeat(700), primaersegment: "s".repeat(300) },
      { ...form, angebot: "a".repeat(900), alltag: "b".repeat(500) },
    );
    expect(lang?.betrieb).toHaveLength(120);
    expect(lang?.positionierung).toHaveLength(600);
    expect(lang?.primaersegment).toHaveLength(200);
    expect(lang?.angebot).toHaveLength(800);
    expect(lang?.alltag).toHaveLength(400);
  });
  it("formFromInput liefert das Formular zur Eingabe zurück", () => {
    expect(formFromInput(input)).toEqual({ angebot: input.angebot, alltag: input.alltag, kanaele: ["instagram", "google"], beitraegeProWoche: "2" });
    expect(toInput(fields, formFromInput(input))).toEqual(input);
  });
  it("eingabeText nennt die Angaben je Zeile, Betrieb und Kanäle zuerst, Freitexte auf einer Zeile, freiwillige Felder nur, wenn sie da sind", () => {
    expect(eingabeText(input).split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Ort: Gossau",
      "Kanäle: Instagram, Google-Beitrag",
      "Beiträge pro Woche: 2",
      "Angebot und Fragen: Fassaden und Innenräume streichen, Farbberatung vor Ort. / Fragen: Was kostet eine Fassade? Wie lange hält die Farbe?",
      "Alltag: Baustellen in der Region, zwei Lehrlinge.",
      "Zielgruppe: Hausbesitzer in Gossau und Umgebung",
      "Personas: Ruth Hungerbühler, Reto Brunner",
      "Positionierung: Der Malerbetrieb in Gossau, der Termine hält.",
    ]);
    const ohne = eingabeText({ ...input, branche: "", ort: "", alltag: "", primaersegment: "", personas: [], positionierung: "" });
    expect(ohne.split("\n")).toHaveLength(4);
    expect(ohne).not.toContain("Branche:");
    expect(ohne).not.toContain("Personas:");
  });
});

describe("content-saeulen: Dokument", () => {
  it("enthält Facts, den KI-Hinweis, jede Säule mit Beschreibung, Beispielen und Anteil, den Rhythmus mit Tabelle und die Liste «Das posten wir nicht»", () => {
    const doc = toDocument(output, input);
    expect(doc.title).toBe("Content-Säulen");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.filename).toBe("content-saeulen-malerei-keller");
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Kanäle", value: "Instagram, Google-Beitrag" },
        { label: "Beiträge pro Woche", value: "2" },
      ],
    });
    expect(doc.blocks[1]).toEqual({ type: "paragraph", text: KI_HINWEIS });
    output.saeulen.forEach((s, i) => {
      expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: `${i + 1}. ${s.name}` });
      expect(doc.blocks).toContainEqual({ type: "paragraph", text: s.beschreibung });
      expect(doc.blocks).toContainEqual({ type: "list", items: s.beispiele });
    });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: "Anteil 35 % der Beiträge, Ziel: Anfragen" });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: "Anteil 20 % der Beiträge, Ziel: Bindung" });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: "Rhythmus" });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: output.rhythmus.satz });
    expect(doc.blocks).toContainEqual({
      type: "table",
      header: ["Tag", "Säule", "Kanal"],
      rows: [
        ["Dienstag", "Fassaden vorher und nachher", "Instagram"],
        ["Freitag", "Fragen aus dem Alltag", "Google-Beitrag"],
      ],
      widths: [1, 2, 1],
    });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: "Das posten wir nicht" });
    expect(doc.blocks[doc.blocks.length - 1]).toEqual({ type: "list", items: output.niemals });
    // Je Säule vier Blöcke, dazu Facts, Hinweis, Rhythmus (3) und «niemals» (2).
    expect(doc.blocks).toHaveLength(2 + output.saeulen.length * 4 + 3 + 2);
  });
  it("kommt ohne Eingabe und ohne Ort aus", () => {
    const ohne = toDocument(output, null);
    expect(ohne.subtitle).toBe("Für deinen Betrieb");
    expect(ohne.filename).toBe("content-saeulen-betrieb");
    expect(ohne.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "keine Angabe" },
        { label: "Kanäle", value: "keine Angabe" },
        { label: "Beiträge pro Woche", value: "keine Angabe" },
      ],
    });
    expect(ohne.blocks).toContainEqual({ type: "heading", level: 1, text: "1. Fassaden vorher und nachher" });
    const ohneOrt = toDocument(output, { ...input, ort: "" });
    expect(ohneOrt.blocks[0]).toMatchObject({ items: [{ label: "Betrieb", value: "Malerei Keller" }, { label: "Kanäle", value: "Instagram, Google-Beitrag" }, { label: "Beiträge pro Woche", value: "2" }] });
  });
  it("screenBlocks lässt den KI-Hinweis weg, sonst nichts", () => {
    const doc = toDocument(output, input);
    const screen = screenBlocks(doc);
    expect(screen).toHaveLength(doc.blocks.length - 1);
    expect(JSON.stringify(screen)).not.toContain(KI_HINWEIS);
    expect(screen[0]).toEqual(doc.blocks[0]);
  });
  it("reportMarkdown beginnt mit dem Titel und enthält Säulen, Anteile, Tabelle und die Liste", () => {
    const md = reportMarkdown(output, input);
    expect(md.startsWith("# Content-Säulen\n\n_Für Malerei Keller_")).toBe(true);
    expect(md).toContain("- **Kanäle:** Instagram, Google-Beitrag");
    expect(md).toContain("## 1. Fassaden vorher und nachher");
    expect(md).toContain("- Ein Haus in Gossau in drei Bildern: vor, während und nach dem Gerüst.");
    expect(md).toContain("Anteil 35 % der Beiträge, Ziel: Anfragen");
    expect(md).toContain("| Tag | Säule | Kanal |");
    expect(md).toContain("| Dienstag | Fassaden vorher und nachher | Instagram |");
    expect(md).toContain("## Das posten wir nicht\n\n- Memes");
    expect(md).toContain(KI_HINWEIS);
  });
});

describe("content-saeulen: Profil", () => {
  it("schreibt Name, Beschreibung und Anteil je Säule ins leere Feld contentSaeulen", () => {
    const erwartet = output.saeulen.map((s) => ({ name: s.name, beschreibung: s.beschreibung, anteil: s.anteil }));
    expect(profilePatch({}, output)).toEqual({ contentSaeulen: erwartet });
    expect(profilePatch({ contentSaeulen: [] }, output)).toEqual({ contentSaeulen: erwartet });
    expect(profilePatch({}, output).contentSaeulen?.[2]).toEqual({ name: "Team und Lehre", beschreibung: output.saeulen[2].beschreibung, anteil: 20 });
  });
  it("lässt bestehende Säulen im Profil stehen", () => {
    expect(profilePatch({ contentSaeulen: [{ name: "Alt", beschreibung: "bleibt" }] }, output)).toEqual({});
  });
});

describe("content-saeulen: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand", () => {
    expect(parseState(null)).toBe(EMPTY_STATE);
    expect(parseState("x")).toBe(EMPTY_STATE);
    expect(parseState([])).toBe(EMPTY_STATE);
    expect(parseState({ v: 2, input, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1 })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { ...input, kanaele: [] }, output })).toBe(EMPTY_STATE);
    expect(parseState({ v: 1, input: { ...input, beitraegeProWoche: "4" }, output })).toBe(EMPTY_STATE);
    expect(EMPTY_STATE).toEqual({ v: 1, input: null, output: null });
    expect(EMPTY_FORM).toEqual({ angebot: "", alltag: "", kanaele: null, beitraegeProWoche: "" });
  });
  it("lässt einen kaputten Entwurf allein wegfallen und behält die Eingabe", () => {
    expect(parseState({ v: 1, input, output: { saeulen: [] } })).toEqual({ v: 1, input, output: null });
    expect(parseState({ v: 1, input, output: null })).toEqual({ v: 1, input, output: null });
  });
  it("gibt einen gültigen Stand unverändert zurück", () => {
    const state = { v: 1 as const, input, output };
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
