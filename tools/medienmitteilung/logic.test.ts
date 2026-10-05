import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import { BEISPIEL_INPUT, BEISPIEL_KONTAKT, BEISPIEL_OUTPUT } from "./beispiel";
import type { MedienInput, MedienOutput } from "./generator";
import {
  EMPTY_FORM,
  EMPTY_KONTAKT,
  EMPTY_STATE,
  KI_HINWEIS,
  RICHTWERT_HINWEIS,
  betreffzeile,
  bildzeileFuer,
  checkDraft,
  draftFunde,
  eingabeText,
  empfaengerHinweise,
  inputProblem,
  isAnlass,
  kantonName,
  parseEmpfaenger,
  parseState,
  reportMarkdown,
  superlativeIn,
  toDocument,
  toForm,
  toInput,
  toKontakt,
  toPlainText,
  versandCheckliste,
  viewBlocks,
  zitatFuer,
  zitatSatz,
  type FormValues,
} from "./logic";
import config from "./tool.config";

const input: MedienInput = BEISPIEL_INPUT;
const output = (over: Partial<MedienOutput> = {}): MedienOutput => ({ ...BEISPIEL_OUTPUT, ...over });
const DATUM = "05.10.2026";

const fields = { firma: "Malerei Keller", ort: "Gossau", kanton: "SG", website: "malerei-keller.ch", positionierung: "Der Malerbetrieb in Gossau, der Termine hält." };

const form: FormValues = {
  anlass: "jubilaeum",
  was: input.was,
  wann: input.wann,
  wo: input.wo,
  wer: input.wer,
  warum: input.warum,
  zitat: input.zitat,
  zitatVon: input.zitatVon,
  bild: input.bild,
  kontaktName: BEISPIEL_KONTAKT.name,
  kontaktTelefon: BEISPIEL_KONTAKT.telefon,
  kontaktEmail: BEISPIEL_KONTAKT.email,
  empfaenger: "Appenzeller Zeitung, Redaktion Gossau\nGemeindeblatt Gossau",
};

describe("medienmitteilung: Konfiguration", () => {
  it("ist gültig und liegt als achter Schritt im Pfad Content", () => {
    expect(config.slug).toBe("medienmitteilung");
    expect(config.category).toBe("content");
    expect(config.needsServer).toBe(true);
    expect(config.pathStep).toEqual({ path: "content", order: 8 });
    expect(config.related).toEqual(["positionierung", "textcheck", "content-kalender"]);
    expect(config.tagline.length).toBeLessThanOrEqual(110);
  });
});

describe("medienmitteilung: Hilfen", () => {
  it("kennt Anlässe und löst Kantone auf", () => {
    expect(isAnlass("jubilaeum")).toBe(true);
    expect(isAnlass("")).toBe(false);
    expect(isAnlass("feier")).toBe(false);
    expect(kantonName("SG")).toBe("St. Gallen");
    expect(kantonName("ar")).toBe("Appenzell Ausserrhoden");
    expect(kantonName("Fantasia")).toBe("Fantasia");
    expect(kantonName(undefined)).toBe("");
  });
  it("nennt die Grenzen als Richtwert von Alperna, keine Statistik", () => {
    expect(RICHTWERT_HINWEIS).toContain("Richtwert von Alperna, keine Statistik");
    expect(RICHTWERT_HINWEIS).toContain("40 Wörter");
    expect(RICHTWERT_HINWEIS).toContain("250 bis 400 Wörter");
  });
});

describe("medienmitteilung: inputProblem", () => {
  const ok = { firma: "Malerei Keller", ort: "Gossau" };
  it("lässt ein vollständiges Formular durch", () => {
    expect(inputProblem(ok, form)).toBeNull();
  });
  it("meldet das Erste, was fehlt, in fester Reihenfolge", () => {
    expect(inputProblem({ firma: " ", ort: "Gossau" }, form)).toBe("Gib den Namen deines Betriebs an.");
    expect(inputProblem(ok, { ...form, anlass: "" })).toBe("Wähle den Anlass.");
    expect(inputProblem(ok, { ...form, was: "kurz" })).toContain("mindestens 20 Zeichen");
    expect(inputProblem(ok, { ...form, wann: "  " })).toBe("Sag, wann es stattfindet oder stattgefunden hat.");
    expect(inputProblem({ firma: "Malerei Keller", ort: "" }, { ...form, wo: "" })).toBe("Sag, wo es stattfindet, oder trag deinen Ort ein.");
    expect(inputProblem(ok, { ...form, warum: "kurz" })).toContain("mindestens 10 Zeichen");
    expect(inputProblem(ok, { ...form, zitatVon: "" })).toBe("Nenne Name und Funktion der Person, die du zitierst.");
    expect(inputProblem(ok, { ...form, kontaktName: "" })).toBe("Gib eine Kontaktperson für Rückfragen an.");
    expect(inputProblem(ok, { ...form, kontaktEmail: "anna.keller" })).toBe("Prüfe die E-Mail-Adresse der Kontaktperson.");
    expect(inputProblem(ok, { ...EMPTY_FORM })).toBe("Wähle den Anlass.");
  });
  it("braucht kein «wo», wenn der Ort im Profil steht, und kein Zitat samt Name", () => {
    expect(inputProblem(ok, { ...form, wo: "" })).toBeNull();
    expect(inputProblem(ok, { ...form, zitat: "", zitatVon: "", bild: "", wer: "", kontaktTelefon: "", kontaktEmail: "", empfaenger: "" })).toBeNull();
  });
  it("meldet ein zu langes Zitat", () => {
    expect(inputProblem(ok, { ...form, zitat: "x".repeat(301) })).toBe("Kürze das Zitat auf 300 Zeichen.");
  });
});

describe("medienmitteilung: toInput und toForm", () => {
  it("baut die Eingabe aus Profil und Formular, mit Kanton als Name und ohne Kontaktdaten", () => {
    const i = toInput(fields, form);
    expect(i).toEqual(input);
    expect(JSON.stringify(i)).not.toContain(BEISPIEL_KONTAKT.telefon);
    expect(JSON.stringify(i)).not.toContain(BEISPIEL_KONTAKT.email);
    expect(Object.keys(i)).not.toContain("kontakt");
  });
  it("funktioniert ohne Positionierung, Website und Kanton", () => {
    const i = toInput({ firma: "Malerei Keller" }, { ...form, wo: "" });
    expect(i.positionierung).toBe("");
    expect(i.website).toBe("");
    expect(i.kanton).toBe("");
    expect(i.ort).toBe("");
    expect(i.wo).toBe("");
  });
  it("bereinigt Leerraum, macht einzeilige Felder einzeilig und kürzt", () => {
    const i = toInput(fields, { ...form, wann: " Samstag,\n  14. November  ", was: `${"a ".repeat(400)}`, warum: "  Weil   es   zählt.  \n\n  Wirklich.  " });
    expect(i.wann).toBe("Samstag, 14. November");
    expect(i.was.length).toBeLessThanOrEqual(600);
    expect(i.warum).toBe("Weil es zählt.\nWirklich.");
  });
  it("lässt den Namen weg, wenn es kein Zitat gibt", () => {
    expect(toInput(fields, { ...form, zitat: "  ", zitatVon: "Anna Keller" }).zitatVon).toBe("");
  });
  it("setzt einen unbekannten Anlass auf «anderes»", () => {
    expect(toInput(fields, { ...form, anlass: "" }).anlass).toBe("anderes");
  });
  it("macht aus Kontakt und Empfängern wieder ein Formular", () => {
    const kontakt = toKontakt(form);
    const empfaenger = parseEmpfaenger(form.empfaenger);
    expect(kontakt).toEqual(BEISPIEL_KONTAKT);
    expect(toForm(input, kontakt, empfaenger)).toEqual(form);
    expect(toInput(fields, toForm(input, kontakt, empfaenger))).toEqual(input);
  });
});

describe("medienmitteilung: Empfänger", () => {
  it("nimmt je Zeile ein Medium, ohne Leerzeilen und Doppelte", () => {
    expect(parseEmpfaenger("Anzeiger\n\n  Radio  \nanzeiger\r\nGemeindeblatt")).toEqual(["Anzeiger", "Radio", "Gemeindeblatt"]);
    expect(parseEmpfaenger("")).toEqual([]);
  });
  it("begrenzt auf 20 Medien mit je 120 Zeichen", () => {
    const viele = Array.from({ length: 30 }, (_, i) => `Medium ${i}`).join("\n");
    expect(parseEmpfaenger(viele)).toHaveLength(20);
    expect(parseEmpfaenger("x".repeat(200))[0]).toHaveLength(120);
  });
});

describe("medienmitteilung: eingabeText fürs CRM", () => {
  it("nennt die Angaben je Zeile und lässt Kontaktdaten und Empfänger weg", () => {
    const text = eingabeText(input);
    expect(text.split("\n")[0]).toBe("Betrieb: Malerei Keller");
    expect(text).toContain("Ort: Gossau, St. Gallen");
    expect(text).toContain("Anlass: Jubiläum");
    expect(text).toContain("Wann: Samstag, 14. November 2026, 10 bis 16 Uhr");
    expect(text).toContain("Zitat: «Wir wollen den Leuten zeigen, wie wir arbeiten, und uns bei der Kundschaft bedanken.» (Anna Keller, Inhaberin)");
    expect(text).not.toContain(BEISPIEL_KONTAKT.telefon);
    expect(text).not.toContain(BEISPIEL_KONTAKT.email);
    expect(text).not.toContain("Appenzeller Zeitung");
  });
  it("lässt leere Felder aus", () => {
    const text = eingabeText({ ...input, ort: "", kanton: "", wo: "", wer: "", zitat: "", zitatVon: "", bild: "", website: "", positionierung: "" });
    expect(text.split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Anlass: Jubiläum",
      `Was: ${input.was}`,
      `Wann: ${input.wann}`,
      `Warum für die Region: ${input.warum}`,
    ]);
  });
});

describe("medienmitteilung: Zitat", () => {
  it("setzt das Zitat in «» mit Name und Funktion", () => {
    expect(zitatSatz("Wir freuen uns auf den Tag.", "Anna Keller, Inhaberin")).toBe("«Wir freuen uns auf den Tag», sagt Anna Keller, Inhaberin.");
    expect(zitatSatz("Freut ihr euch auch?", "Anna Keller")).toBe("«Freut ihr euch auch?», sagt Anna Keller.");
  });
  it("nimmt Anführungszeichen um das Zitat weg und kommt ohne Namen aus", () => {
    expect(zitatSatz("«Ein guter Tag.»", "Anna Keller")).toBe("«Ein guter Tag», sagt Anna Keller.");
    expect(zitatSatz("\"Ein guter Tag\"", "")).toBe("«Ein guter Tag»");
    expect(zitatSatz("   ", "Anna Keller")).toBe("");
  });
  it("zeigt nur ein Zitat, das die Person angegeben hat; fehlt es im Entwurf, gilt die Angabe", () => {
    expect(zitatFuer(BEISPIEL_OUTPUT, input)).toBe("«Wir wollen den Leuten zeigen, wie wir arbeiten, und uns bei der Kundschaft bedanken», sagt Anna Keller, Inhaberin.");
    expect(zitatFuer(output({ zitat: "" }), input)).toBe(zitatFuer(BEISPIEL_OUTPUT, input));
    expect(zitatFuer(output({ zitat: "Erfundener Satz der KI." }), { ...input, zitat: "", zitatVon: "" })).toBe("");
  });
  it("zeigt die Bildzeile nur bei einem Bildangebot", () => {
    expect(bildzeileFuer(BEISPIEL_OUTPUT, input)).toContain("Lea Meier");
    expect(bildzeileFuer(BEISPIEL_OUTPUT, { ...input, bild: "" })).toBe("");
    expect(bildzeileFuer(output({ bildzeile: "" }), input)).toBe(input.bild);
  });
});

describe("medienmitteilung: toDocument", () => {
  const doc = toDocument(BEISPIEL_OUTPUT, input, BEISPIEL_KONTAKT, DATUM);
  it("baut Kopf, Titel, Lead und Dateinamen", () => {
    expect(doc.title).toBe("Medienmitteilung");
    expect(doc.subtitle).toBe("Gossau, 05.10.2026");
    expect(doc.datum).toBe(DATUM);
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("medienmitteilung-malerei-keller");
    expect(doc.blocks[0]).toEqual({ type: "heading", level: 1, text: BEISPIEL_OUTPUT.titel });
    expect(doc.blocks[1]).toEqual({ type: "heading", level: 3, text: BEISPIEL_OUTPUT.lead });
  });
  it("setzt das Zitat nach dem ersten Absatz, dann die weiteren Absätze, die Bildzeile, die Boilerplate und den Kontakt", () => {
    const texts = doc.blocks.map((b) => (b.type === "paragraph" || b.type === "heading" ? b.text : ""));
    expect(texts[2]).toBe(BEISPIEL_OUTPUT.text[0]);
    expect(texts[3]).toContain("sagt Anna Keller, Inhaberin.");
    expect(texts[4]).toBe(BEISPIEL_OUTPUT.text[1]);
    const rest = texts.slice(-5);
    expect(rest[0]).toMatch(/^Bildmaterial: Fotos der Werkstatt/);
    expect(rest[1]).toBe("Über Malerei Keller");
    expect(rest[2]).toBe(BEISPIEL_OUTPUT.boilerplate);
    expect(rest[3]).toBe("Kontakt für Rückfragen");
    expect(rest[4]).toBe("Anna Keller, Inhaberin\nTelefon: 071 000 00 00\nE-Mail: anna@malerei-keller.example");
  });
  it("lässt Zitat, Bildzeile und Kontakt weg, wenn es sie nicht gibt", () => {
    const schlicht = toDocument(output({ zitat: "", bildzeile: "" }), { ...input, zitat: "", zitatVon: "", bild: "" }, EMPTY_KONTAKT, DATUM);
    const md = toMarkdown(schlicht);
    expect(md).not.toContain("sagt");
    expect(md).not.toContain("Bildmaterial");
    expect(md).not.toContain("Kontakt für Rückfragen");
    expect(schlicht.blocks.at(-1)).toEqual({ type: "paragraph", text: BEISPIEL_OUTPUT.boilerplate });
  });
  it("zeigt nur die ausgefüllten Kontaktzeilen", () => {
    const nurName = toDocument(BEISPIEL_OUTPUT, input, { name: "Anna Keller", telefon: "", email: "" }, DATUM);
    expect(nurName.blocks.at(-1)).toEqual({ type: "paragraph", text: "Anna Keller" });
  });
  it("schreibt ohne Ort nur das Datum in den Kopf und kommt ohne Betrieb aus", () => {
    const d = toDocument(BEISPIEL_OUTPUT, { ...input, ort: "", betrieb: "Keller & Söhne AG" }, EMPTY_KONTAKT, DATUM);
    expect(d.subtitle).toBe(DATUM);
    expect(d.filename).toBe("medienmitteilung-keller-soehne-ag");
  });
  it("hat Markdown, in dem der Titel, das Zitat und der Kontakt stehen", () => {
    const md = toMarkdown(doc);
    expect(md.startsWith("# Medienmitteilung\n")).toBe(true);
    expect(md).toContain("## Malerei Keller feiert 40 Jahre mit einem Tag der offenen Tür");
    expect(md).toContain("### Über Malerei Keller");
    expect(md).toContain("anna@malerei-keller.example");
  });
});

describe("medienmitteilung: Anzeige, Mailtext und CRM", () => {
  const doc = toDocument(BEISPIEL_OUTPUT, input, BEISPIEL_KONTAKT, DATUM);
  it("zeigt am Bildschirm als erste Zeile den Kopf", () => {
    const blocks = viewBlocks(doc);
    expect(blocks[0]).toEqual({ type: "paragraph", text: "Medienmitteilung, Gossau, 05.10.2026" });
    expect(blocks).toHaveLength(doc.blocks.length + 1);
  });
  it("macht aus dem Dokument einen Mailtext ohne Markdown", () => {
    const text = toPlainText(doc);
    expect(text.startsWith("Gossau, 05.10.2026\n\nMalerei Keller feiert 40 Jahre")).toBe(true);
    expect(text).not.toMatch(/^#/m);
    expect(text).not.toContain("**");
    expect(text).toContain("\n\nÜber Malerei Keller\n\nMalerei Keller ist ein Malerbetrieb");
    expect(text.trimEnd().endsWith("E-Mail: anna@malerei-keller.example")).toBe(true);
  });
  it("schickt ins CRM die Mitteilung ohne Kontaktdaten", () => {
    const md = reportMarkdown(BEISPIEL_OUTPUT, input, DATUM);
    expect(md.split("\n")[0]).toBe("# Medienmitteilung");
    expect(md).toContain("Malerei Keller feiert 40 Jahre");
    expect(md).not.toContain("071 000 00 00");
    expect(md).not.toContain("anna@malerei-keller.example");
    expect(md).not.toContain("Kontakt für Rückfragen");
  });
});

describe("medienmitteilung: Superlative", () => {
  it("findet Wertungen im Text und in der Sperrliste der Marke, nicht im Zitat", () => {
    expect(superlativeIn(BEISPIEL_OUTPUT)).toEqual([]);
    const text = [...BEISPIEL_OUTPUT.text];
    text[0] = `${text[0]} Es ist die schönste Werkstatt der Region und ein einzigartiger Betrieb, innovativ dazu.`;
    expect(superlativeIn(output({ text }))).toEqual(["schönste", "einzigartiger", "innovativ"]);
    expect(superlativeIn(output({ zitat: "Wir sind die Besten und die Grössten." }))).toEqual([]);
  });
  it("findet «Beste» im Titel", () => {
    expect(superlativeIn(output({ titel: "Die beste Malerei der Region feiert" }))).toEqual(["beste"]);
  });
});

describe("medienmitteilung: checkDraft", () => {
  const punkt = (o: MedienOutput, id: string, i: MedienInput = input) => checkDraft(o, i).find((p) => p.id === id)!;
  it("meldet beim Beispiel-Entwurf sieben Regeln, alle erfüllt", () => {
    const alle = checkDraft(BEISPIEL_OUTPUT, input);
    expect(alle.map((p) => p.id)).toEqual(["lead", "w-fragen", "wann", "zahl", "laenge", "zitat", "superlativ"]);
    expect(alle.every((p) => p.ok)).toBe(true);
    expect(draftFunde(BEISPIEL_OUTPUT, input)).toEqual([]);
    expect(alle[0].hinweis).toBe("Der Lead hat 30 Wörter.");
    expect(alle[4].hinweis).toBe("Die Mitteilung hat 300 Wörter.");
  });
  it("lead: meldet 41 Wörter", () => {
    const lead = `${BEISPIEL_OUTPUT.lead} ${Array.from({ length: 11 }, () => "Gast").join(" ")}`;
    const p = punkt(output({ lead }), "lead");
    expect(p.ok).toBe(false);
    expect(p.hinweis).toBe("Der Lead hat 41 Wörter. Kürze ihn auf höchstens 40.");
  });
  it("w-fragen und wann: melden, was im Lead fehlt", () => {
    const lead = "Ein Malerbetrieb feiert sein 40-jähriges Bestehen mit einem Tag der offenen Tür.";
    const w = punkt(output({ lead }), "w-fragen");
    expect(w.ok).toBe(false);
    expect(w.hinweis).toBe("Im Lead fehlt der Betrieb «Malerei Keller» und der Ort «Gossau».");
    const wann = punkt(output({ lead }), "wann");
    expect(wann.ok).toBe(false);
    expect(wann.hinweis).toBe("Im Lead fehlt die Zeitangabe «Samstag, 14. November 2026, 10 bis 16 Uhr».");
    expect(punkt(output({ lead: "Die Malerei Keller feiert 40 Jahre am Samstag." }), "w-fragen").hinweis).toBe("Im Lead fehlt der Ort «Gossau».");
  });
  it("zahl: nennt die fremden Zahlen", () => {
    const p = punkt(output({ titel: "Malerei Keller feiert 25 Jahre mit einem Fest" }), "zahl");
    expect(p.ok).toBe(false);
    expect(p.hinweis).toContain("25");
  });
  it("laenge: sagt, ob zu kurz oder zu lang", () => {
    const kurz = punkt(output({ text: [BEISPIEL_OUTPUT.text[0], BEISPIEL_OUTPUT.text[1]] }), "laenge");
    expect(kurz.ok).toBe(false);
    expect(kurz.hinweis).toContain("Ergänze Einzelheiten.");
    const lang = punkt(output({ text: Array(5).fill(Array.from({ length: 80 }, () => "Gast").join(" ")) }), "laenge");
    expect(lang.ok).toBe(false);
    expect(lang.hinweis).toContain("Kürze sie.");
  });
  it("zitat: meldet ein umformuliertes oder nicht angegebenes Zitat", () => {
    const umformuliert = punkt(output({ zitat: "Wir sind stolz auf unser Team und freuen uns auf viele Gäste im November." }), "zitat");
    expect(umformuliert.ok).toBe(false);
    expect(umformuliert.hinweis).toBe("Das Zitat weicht von deinen Angaben ab. Prüfe den Wortlaut.");
    const erfunden = punkt(BEISPIEL_OUTPUT, "zitat", { ...input, zitat: "", zitatVon: "" });
    expect(erfunden.ok).toBe(false);
    expect(erfunden.hinweis).toContain("das du nicht angegeben hast");
    expect(punkt(output({ zitat: "" }), "zitat", { ...input, zitat: "", zitatVon: "" }).hinweis).toBe("Du hast kein Zitat angegeben, die Mitteilung hat keins.");
  });
  it("superlativ: nennt die Wörter", () => {
    const p = punkt(output({ titel: "Die schönste Malerei der Region feiert" }), "superlativ");
    expect(p.ok).toBe(false);
    expect(p.hinweis).toBe("Prüfe «schönste». Streich die Wertung oder belege sie.");
  });
  it("fasst die Funde zusammen", () => {
    const funde = draftFunde(output({ titel: "Die beste Malerei der Region feiert 25 Jahre" }), input);
    expect(funde.map((f) => f.id)).toEqual(["zahl", "superlativ"]);
  });
});

describe("medienmitteilung: Versand-Checkliste", () => {
  it("ohne Empfänger steht dort die Aufgabe, sie festzulegen", () => {
    const l = versandCheckliste([], { titel: "Malerei Keller feiert 40 Jahre", bild: true });
    expect(l[1]).toContain("Empfänger festlegen");
    expect(l[1]).toContain("Empfänger finden");
    expect(l.some((x) => x.startsWith("Senden an"))).toBe(false);
  });
  it("mit Empfängern bekommt jedes Medium eine Zeile", () => {
    const l = versandCheckliste(["Appenzeller Zeitung, Redaktion Gossau", "Gemeindeblatt Gossau"]);
    expect(l[1]).toBe("Senden an: Appenzeller Zeitung, Redaktion Gossau");
    expect(l[2]).toBe("Senden an: Gemeindeblatt Gossau");
    expect(l.some((x) => x.includes("Empfänger festlegen"))).toBe(false);
  });
  it("schlägt eine Betreffzeile vor und nennt das Bild in Druckauflösung", () => {
    const l = versandCheckliste([], { titel: "Malerei Keller feiert 40 Jahre", bild: true });
    expect(l).toContain("Betreffzeile: «Medienmitteilung: Malerei Keller feiert 40 Jahre»");
    expect(l.find((x) => x.includes("Druckauflösung"))).toMatch(/^Das Bild als Anhang/);
    expect(versandCheckliste([], { bild: false }).find((x) => x.includes("Druckauflösung"))).toMatch(/^Falls du ein Bild hast/);
    expect(betreffzeile("  Titel \n mit Umbruch ")).toBe("Medienmitteilung: Titel mit Umbruch");
    expect(betreffzeile(undefined)).toBe("Medienmitteilung:");
  });
  it("nennt Zeitpunkt und Nachfassen als Richtwert und rät zu Website und Google-Unternehmensprofil", () => {
    const l = versandCheckliste([]);
    expect(l.find((x) => x.includes("Vormittag"))).toContain("Richtwert von Alperna, keine Statistik");
    expect(l.find((x) => x.includes("nachfassen"))).toContain("Richtwert von Alperna, keine Statistik");
    expect(l.at(-1)).toContain("eigene Website");
    expect(l.at(-1)).toContain("Google-Unternehmensprofil");
    expect(l[0]).toContain("prüfen");
  });
});

describe("medienmitteilung: Empfänger finden", () => {
  it("setzt Gemeinde und Kanton in die Suchbegriffe", () => {
    const h = empfaengerHinweise("Gossau", "St. Gallen");
    expect(h[0].titel).toBe("Lokalzeitung und Anzeiger");
    expect(h[0].text).toContain("«Gossau Anzeiger Redaktion»");
    expect(h.find((x) => x.titel.startsWith("Regionalradio"))?.text).toContain("«St. Gallen Regionalradio Redaktion»");
    expect(empfaengerHinweise("Herisau", "AR")[2].text).toContain("«Appenzell Ausserrhoden Regionalradio Redaktion»");
  });
  it("kommt ohne Ort und Kanton aus und nennt keine Adressen", () => {
    const h = empfaengerHinweise("", undefined);
    expect(h[0].text).toContain("«Deine Gemeinde Anzeiger Redaktion»");
    expect(h[2].text).toContain("«Deine Region Regionalradio Redaktion»");
    expect(JSON.stringify(h)).not.toContain("@");
    expect(h.length).toBeGreaterThanOrEqual(5);
  });
});

describe("medienmitteilung: Stimme der Texte", () => {
  it("hält die Texte des Werkzeugs frei von Sperrliste, Ausrufezeichen und Gedankenstrich", () => {
    const texte = [
      KI_HINWEIS,
      RICHTWERT_HINWEIS,
      ...versandCheckliste(["Anzeiger"], { titel: "Titel der Mitteilung", bild: true }),
      ...versandCheckliste([]),
      ...empfaengerHinweise("Gossau", "SG").flatMap((h) => [h.titel, h.text]),
      ...checkDraft(output({ lead: "Zu kurz und ohne alles", titel: "Die beste Malerei der Region feiert 25 Jahre" }), input).flatMap((p) => [p.label, p.hinweis]),
      ...checkDraft(BEISPIEL_OUTPUT, input).flatMap((p) => [p.label, p.hinweis]),
    ].join("\n");
    expect(brandHits(texte).filter((h) => h.level === "hart")).toEqual([]);
    expect(texte).not.toMatch(/[!—]/);
    expect(texte).not.toMatch(/\bjetzt\b/i);
  });
});

describe("medienmitteilung: parseState", () => {
  const state = { v: 1 as const, input, output: BEISPIEL_OUTPUT, kontakt: BEISPIEL_KONTAKT, empfaenger: ["Anzeiger", "Radio"] };
  it("liefert bei kaputten Daten den leeren Stand", () => {
    expect(parseState(null)).toEqual(EMPTY_STATE);
    expect(parseState("kaputt")).toEqual(EMPTY_STATE);
    expect(parseState(42)).toEqual(EMPTY_STATE);
    expect(parseState({})).toEqual(EMPTY_STATE);
    expect(parseState({ v: 2, input, output: BEISPIEL_OUTPUT })).toEqual(EMPTY_STATE);
    expect(parseState({ v: 1, input: { betrieb: "x" }, output: BEISPIEL_OUTPUT })).toEqual(EMPTY_STATE);
  });
  it("liest einen gültigen Stand als Rundlauf", () => {
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
  it("lässt einen kaputten Entwurf allein weg und behält die Eingabe", () => {
    const s = parseState({ ...state, output: { titel: "nur ein Feld" } });
    expect(s.input).toEqual(input);
    expect(s.output).toBeNull();
    expect(s.kontakt).toEqual(BEISPIEL_KONTAKT);
  });
  it("lässt kaputte Kontaktdaten und Empfänger einzeln weg", () => {
    const s = parseState({ ...state, kontakt: { name: 5 }, empfaenger: ["Anzeiger", 7, null, "anzeiger", "  "] });
    expect(s.kontakt).toEqual(EMPTY_KONTAKT);
    expect(s.empfaenger).toEqual(["Anzeiger"]);
    expect(parseState({ ...state, empfaenger: "Anzeiger" }).empfaenger).toEqual([]);
  });
  it("erkennt ein Ergebnis für den Pfad-Fortschritt: ein Objekt unter output", () => {
    const raw = JSON.parse(JSON.stringify(state)) as { output: unknown };
    expect(typeof raw.output).toBe("object");
    expect(raw.output).not.toBeNull();
  });
});
