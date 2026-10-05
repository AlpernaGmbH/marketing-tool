import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import { strategieInput } from "./generator";
import {
  BEITRAEGE,
  EMPTY_FORM,
  EMPTY_STATE,
  FIELD_IDS,
  KANAELE,
  KAPITEL,
  KI_HINWEIS,
  betriebZeile,
  charCount,
  effectiveKanaele,
  effectiveSaeulen,
  effectiveZielgruppe,
  eingabeText,
  formFromInput,
  hinweisNamen,
  inputProblem,
  isZielKey,
  kanalFieldId,
  organisationstypVon,
  padSaeulen,
  parseState,
  positionierungText,
  profilePatch,
  reportMarkdown,
  resultState,
  saeuleFieldId,
  saeulenAusProfil,
  screenBlocks,
  setSaeule,
  tonalitaetText,
  toDocument,
  toInput,
  typLabel,
  zielFieldId,
  zielLabel,
  zielListe,
  type ProfileFields,
  type StrategieForm,
} from "./logic";
import { input, mitSaeulen, output } from "./testdata";

const profile: ProfileFields = {
  organisationstyp: "kmu",
  firma: " Malerei Keller ",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau,   der Termine hält.",
  primaersegment: "Hausbesitzer in Gossau und Umgebung",
  marke: { tonalitaet: { so: "Ruhig und konkret.", nichtSo: "Keine Floskeln.", anrede: "du" } },
  kanaele: [{ name: "Instagram" }, { kanal: "Google Unternehmensprofil" }],
  contentSaeulen: [],
};

const form: StrategieForm = {
  ziel: "anfragen",
  angebot: "Fassaden und Innenräume streichen,   Farbberatung vor Ort, seit 1998 in Gossau. Fragen: Was kostet eine Fassade?   Wie lange hält die Farbe?",
  besonders: "Termine werden gehalten, zwei Lehrlinge.",
  zielgruppe: null,
  saeulen: null,
  kanaele: null,
  beitraegeProWoche: "2",
};

describe("content-strategie: Listen und Labels", () => {
  it("nennt die Ziele mit den Wörtern des Typs, in fester Reihenfolge", () => {
    expect(zielListe("kmu").map((z) => z.label)).toEqual(["Anfragen und Aufträge", "Bekanntheit in der Region", "Stammkundschaft binden", "Fachkräfte und Lernende finden"]);
    expect(zielListe("verein").map((z) => z.label)).toEqual(["Mitglieder gewinnen", "Anlässe füllen", "Sponsoren finden", "Freiwillige finden"]);
    expect(zielListe("verein").map((z) => z.key)).toEqual(["anfragen", "bekanntheit", "bindung", "fachkraefte"]);
    expect(zielLabel("verein", "fachkraefte")).toBe("Freiwillige finden");
    expect(zielLabel("kmu", "bindung")).toBe("Stammkundschaft binden");
    expect(isZielKey("bindung")).toBe(true);
    expect(isZielKey("umsatz")).toBe(false);
    expect(isZielKey(3)).toBe(false);
  });
  it("übernimmt Kanäle und Mengen von «Content-Säulen» und kennt den Typ aus dem Profil", () => {
    expect(KANAELE.map((k) => k.label)).toEqual(["Instagram", "Facebook", "LinkedIn", "Google-Beitrag", "Newsletter", "Website"]);
    expect(BEITRAEGE.map((b) => b.key)).toEqual(["1", "2", "3", "5"]);
    expect(organisationstypVon({ organisationstyp: "verein" })).toBe("verein");
    expect(organisationstypVon({ organisationstyp: "kmu" })).toBe("kmu");
    expect(organisationstypVon({})).toBe("kmu");
    expect(typLabel("kmu")).toBe("KMU");
    expect(typLabel("verein")).toBe("Verein");
    expect(charCount("Grüezi 👋")).toBe(8);
  });
});

describe("content-strategie: Hintergrund aus dem Profil", () => {
  it("liest die Tonalität aus «so», sonst aus allen Texten ausser der Anrede, und kürzt auf 200 Zeichen", () => {
    expect(tonalitaetText(profile.marke)).toBe("Ruhig und konkret.");
    expect(tonalitaetText({ tonalitaet: { anrede: "du", stil: "Locker", ton: "und direkt" } })).toBe("Locker und direkt");
    expect(tonalitaetText({ tonalitaet: { anrede: "du" } })).toBe("");
    expect(tonalitaetText({ tonalitaet: { so: "x".repeat(300) } })).toHaveLength(200);
    expect(tonalitaetText({ tonalitaet: "kein Objekt" as unknown as Record<string, unknown> })).toBe("");
    expect(tonalitaetText({ werte: ["Verlässlich"] })).toBe("");
    expect(tonalitaetText(undefined)).toBe("");
  });
  it("bereinigt die Positionierung und nennt die Teile, die mitgehen", () => {
    expect(positionierungText(profile)).toBe("Der Malerbetrieb in Gossau, der Termine hält.");
    expect(positionierungText({ positionierung: "x".repeat(700) })).toHaveLength(600);
    expect(hinweisNamen(profile)).toEqual(["Positionierung", "Tonalität"]);
    expect(hinweisNamen({ positionierung: "Eine Positionierung." })).toEqual(["Positionierung"]);
    expect(hinweisNamen({ marke: { tonalitaet: { so: "Ruhig." } } })).toEqual(["Tonalität"]);
    expect(hinweisNamen({})).toEqual([]);
  });
  it("liest Säulen aus dem Profil: nur Namen von 3 bis 40 Zeichen, ohne Doppel, höchstens fünf", () => {
    expect(saeulenAusProfil({ contentSaeulen: [{ name: " Fassaden " }, { name: "Team", beschreibung: "x" }, { name: "team" }, { name: "PR" }, { beschreibung: "ohne Namen" }, { name: 7 }] })).toEqual(["Fassaden", "Team"]);
    expect(saeulenAusProfil({ contentSaeulen: Array.from({ length: 8 }, (_, i) => ({ name: `Säule Nummer ${i + 1}` })) })).toHaveLength(5);
    expect(saeulenAusProfil({ contentSaeulen: [{ name: "x".repeat(60) }] })[0]).toHaveLength(40);
    expect(saeulenAusProfil({ contentSaeulen: [] })).toEqual([]);
    expect(saeulenAusProfil({})).toEqual([]);
    expect(saeulenAusProfil({ contentSaeulen: "kaputt" as unknown as Record<string, unknown>[] })).toEqual([]);
  });
});

describe("content-strategie: Vorbelegung im Formular", () => {
  it("nimmt die Hauptzielgruppe, die Säulen und die Kanäle aus dem Profil, solange die Person nichts angefasst hat", () => {
    expect(effectiveZielgruppe(EMPTY_FORM, profile)).toBe("Hausbesitzer in Gossau und Umgebung");
    expect(effectiveZielgruppe(EMPTY_FORM, {})).toBe("");
    expect(effectiveSaeulen(EMPTY_FORM, { contentSaeulen: [{ name: "Fassaden" }, { name: "Team" }, { name: "Fragen" }] })).toEqual(["Fassaden", "Team", "Fragen", "", ""]);
    expect(effectiveSaeulen(EMPTY_FORM, {})).toEqual(["", "", "", "", ""]);
    expect(effectiveKanaele(EMPTY_FORM, profile)).toEqual(["instagram", "google"]);
    expect(effectiveKanaele(EMPTY_FORM, { kanaele: [{ name: "TikTok" }] })).toEqual(["instagram", "google"]);
    expect(effectiveKanaele(EMPTY_FORM, { kanaele: [{ name: "LinkedIn" }] })).toEqual(["linkedin"]);
  });
  it("lässt getippte oder geleerte Felder gelten und füllt sie nicht erneut aus dem Profil", () => {
    expect(effectiveZielgruppe({ zielgruppe: "" }, profile)).toBe("");
    expect(effectiveZielgruppe({ zielgruppe: "Familien" }, profile)).toBe("Familien");
    expect(effectiveSaeulen({ saeulen: ["", "", "", "", ""] }, { contentSaeulen: [{ name: "Fassaden" }] })).toEqual(["", "", "", "", ""]);
    expect(effectiveSaeulen({ saeulen: ["Team"] }, {})).toEqual(["Team", "", "", "", ""]);
    expect(effectiveKanaele({ kanaele: ["website"] }, profile)).toEqual(["website"]);
    expect(effectiveKanaele({ kanaele: [] }, profile)).toEqual([]);
  });
  it("padSaeulen und setSaeule halten immer fünf Felder", () => {
    expect(padSaeulen(["a", "b"])).toEqual(["a", "b", "", "", ""]);
    expect(padSaeulen([])).toHaveLength(5);
    expect(padSaeulen(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d", "e"]);
    expect(setSaeule(["a", "b"], 3, "x")).toEqual(["a", "b", "", "x", ""]);
    expect(setSaeule(["a", "b", "c", "d", "e"], 0, "")).toEqual(["", "b", "c", "d", "e"]);
  });
});

describe("content-strategie: inputProblem", () => {
  it("lässt vollständige Angaben durch, auch mit leerem Rest des Profils", () => {
    expect(inputProblem(profile, form)).toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, form)).toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, kanaele: ["linkedin"], saeulen: ["Fassaden", "Team", "Fragen", "", ""] })).toBeNull();
  });
  it("meldet fehlende Firma für Betrieb und Verein mit dem Feld, in das der Fokus gehört", () => {
    expect(inputProblem({}, form)).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: "cs-firma" });
    expect(inputProblem({ firma: "   " }, form)).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: FIELD_IDS.firma });
    expect(inputProblem({ organisationstyp: "verein" }, form)).toEqual({ message: "Gib den Namen deines Vereins an.", fieldId: "cs-firma" });
  });
  it("meldet fehlendes Ziel, zu kurzes und zu langes Angebot, jeweils mit eigener Meldung für den Verein", () => {
    expect(inputProblem(profile, { ...form, ziel: "" })).toEqual({ message: "Wähle, wofür dein Inhalt da sein soll.", fieldId: "cs-ziel-anfragen" });
    expect(inputProblem(profile, { ...form, angebot: "zu kurz" })).toMatchObject({ message: expect.stringContaining("mindestens 20 Zeichen") as string, fieldId: "cs-angebot" });
    expect(inputProblem(profile, { ...form, angebot: "zu kurz" })?.message).toContain("deiner Kundschaft");
    expect(inputProblem({ ...profile, organisationstyp: "verein" }, { ...form, angebot: "zu kurz" })?.message).toContain("was dein Verein anbietet");
    expect(inputProblem(profile, { ...form, angebot: "   \n  " })?.fieldId).toBe("cs-angebot");
    expect(inputProblem(profile, { ...form, angebot: "x".repeat(801) })).toEqual({ message: "Das Angebot ist zu lang. Es sind höchstens 800 Zeichen möglich.", fieldId: "cs-angebot" });
    expect(inputProblem(profile, { ...form, angebot: "x".repeat(800) })).toBeNull();
  });
  it("meldet zu lange Angaben zum Besonderen und zur Hauptzielgruppe, auch wenn sie aus dem Profil stammen", () => {
    expect(inputProblem(profile, { ...form, besonders: "x".repeat(401) })).toEqual({ message: "Das Besondere ist zu lang. Es sind höchstens 400 Zeichen möglich.", fieldId: "cs-besonders" });
    expect(inputProblem(profile, { ...form, zielgruppe: "x".repeat(201) })).toEqual({ message: "Die Hauptzielgruppe ist zu lang. Es sind höchstens 200 Zeichen möglich.", fieldId: "cs-zielgruppe" });
    expect(inputProblem(profile, { ...form, besonders: "x".repeat(400), zielgruppe: "x".repeat(200) })).toBeNull();
  });
  it("meldet Säulen: zu kurz, zu lang, doppelt, nur ein oder zwei; drei bis fünf und keine sind in Ordnung", () => {
    const mit = (saeulen: string[]) => inputProblem(profile, { ...form, saeulen });
    expect(mit(["Fassaden", "PR", "Team", "", ""])).toEqual({ message: "Die Säule «PR» ist zu kurz. Schreib mindestens 3 Zeichen.", fieldId: "cs-saeule-2" });
    expect(mit(["Fassaden", "", "", "", "x".repeat(41)])?.message).toMatch(/^Die Säule «x{20} …» ist zu lang\. Es sind höchstens 40 Zeichen möglich\.$/);
    expect(mit(["Fassaden", "", "", "", "x".repeat(41)])?.fieldId).toBe("cs-saeule-5");
    expect(mit(["Fassaden", "Team", "Fragen", "team", ""])).toEqual({ message: "Zwei Säulen heissen «team». Gib jeder Säule einen eigenen Namen.", fieldId: "cs-saeule-4" });
    expect(mit(["Fassaden", "", "", "", ""])).toEqual({ message: "Gib drei bis fünf Säulen an oder lass alle Felder leer, dann schlägt die KI Säulen vor.", fieldId: "cs-saeule-2" });
    expect(mit(["", "Fassaden", "Team", "", ""])?.fieldId).toBe("cs-saeule-1");
    expect(mit(["Fassaden", "Team", "Fragen", "", ""])).toBeNull();
    expect(mit(["Fassaden", "Team", "Fragen", "Region", "Lehre"])).toBeNull();
    expect(mit(["", "", "", "", ""])).toBeNull();
    expect(mit(["  Fassaden  ", "", "Team", "", "Fragen"])).toBeNull();
  });
  it("prüft auch Säulen, die nur aus dem Profil vorbelegt sind", () => {
    expect(inputProblem({ ...profile, contentSaeulen: [{ name: "Fassaden" }, { name: "Team" }] }, form)?.message).toContain("drei bis fünf Säulen");
    expect(inputProblem({ ...profile, contentSaeulen: [{ name: "Fassaden" }, { name: "Team" }, { name: "Fragen" }] }, form)).toBeNull();
    expect(inputProblem({ ...profile, contentSaeulen: [{ name: "Fassaden" }, { name: "Team" }] }, { ...form, saeulen: ["", "", "", "", ""] })).toBeNull();
  });
  it("meldet fehlenden Kanal und fehlende Beiträge pro Woche zuletzt", () => {
    expect(inputProblem(profile, { ...form, kanaele: [] })).toEqual({ message: "Wähle mindestens einen Kanal.", fieldId: kanalFieldId("instagram") });
    expect(inputProblem(profile, { ...form, beitraegeProWoche: "" })).toEqual({ message: "Wähle, wie viele Beiträge pro Woche realistisch sind.", fieldId: "cs-beitraege" });
    // Reihenfolge des Formulars: erst das Ziel, dann Angebot, Säulen, Kanäle, Beiträge
    expect(inputProblem({}, { ...EMPTY_FORM })?.fieldId).toBe("cs-firma");
    expect(inputProblem({ firma: "x" }, { ...EMPTY_FORM })?.fieldId).toBe("cs-ziel-anfragen");
    expect(inputProblem({ firma: "x" }, { ...EMPTY_FORM, ziel: "bindung" })?.fieldId).toBe("cs-angebot");
    expect(inputProblem({ firma: "x" }, { ...EMPTY_FORM, ziel: "bindung", angebot: form.angebot })?.fieldId).toBe("cs-beitraege");
  });
  it("trägt die Feld-IDs, die das Formular braucht", () => {
    expect(FIELD_IDS).toEqual({ firma: "cs-firma", angebot: "cs-angebot", besonders: "cs-besonders", zielgruppe: "cs-zielgruppe", beitraege: "cs-beitraege" });
    expect(zielFieldId("fachkraefte")).toBe("cs-ziel-fachkraefte");
    expect(saeuleFieldId(3)).toBe("cs-saeule-3");
    expect(kanalFieldId("google")).toBe("cs-kanal-google");
  });
});

describe("content-strategie: toInput und formFromInput", () => {
  it("baut die Eingabe aus Profil und Formular, bereinigt Leerraum und nimmt die Vorbelegung", () => {
    const i = toInput(profile, form);
    expect(i).toEqual(input);
    expect(strategieInput.safeParse(i).success).toBe(true);
    // Zeilenumbrüche: Leerraum um sie fällt weg, mehr als eine Leerzeile wird eine.
    expect(toInput(profile, { ...form, angebot: "Erste Zeile \n  zweite Zeile\n\n\n\nDritte Zeile" })?.angebot).toBe("Erste Zeile\nzweite Zeile\n\nDritte Zeile");
  });
  it("nimmt getippte Werte statt des Profils, lässt leere Säulenfelder weg und ordnet die Kanäle", () => {
    const i = toInput(profile, { ...form, zielgruppe: " Familien  in   Gossau ", saeulen: ["Fassaden", "", "Team", "Fragen", ""], kanaele: ["google", "instagram", "google"] });
    expect(i?.zielgruppe).toBe("Familien in Gossau");
    expect(i?.saeulen).toEqual(["Fassaden", "Team", "Fragen"]);
    expect(i?.kanaele).toEqual(["instagram", "google"]);
  });
  it("gibt für den Verein den Typ weiter und schreibt ohne Profil leere Felder", () => {
    const i = toInput({ organisationstyp: "verein", firma: "FC Trogen" }, { ...form, ziel: "fachkraefte", kanaele: ["website"] });
    expect(i).toMatchObject({ betrieb: "FC Trogen", organisationstyp: "verein", ziel: "fachkraefte", branche: "", ort: "", positionierung: "", tonalitaet: "", zielgruppe: "", saeulen: [], kanaele: ["website"] });
  });
  it("gibt null zurück, wenn Ziel oder Beiträge fehlen, die Firma leer ist oder nur zwei Säulen da sind", () => {
    expect(toInput(profile, { ...form, ziel: "" })).toBeNull();
    expect(toInput(profile, { ...form, beitraegeProWoche: "" })).toBeNull();
    expect(toInput({ ...profile, firma: " " }, form)).toBeNull();
    expect(toInput(profile, { ...form, saeulen: ["Fassaden", "Team", "", "", ""] })).toBeNull();
    expect(toInput(profile, { ...form, kanaele: [] })).toBeNull();
  });
  it("kürzt zu lange Angaben auf die Grenzen", () => {
    const i = toInput({ ...profile, positionierung: "x".repeat(700), primaersegment: "y".repeat(300) }, { ...form, angebot: "z".repeat(900) });
    expect(i?.angebot).toHaveLength(800);
    expect(i?.positionierung).toHaveLength(600);
    expect(i?.zielgruppe).toHaveLength(200);
  });
  it("formFromInput macht alle Felder zu getippten Werten, damit das Profil sie nicht überschreibt", () => {
    const f = formFromInput(mitSaeulen);
    expect(f).toEqual({
      ziel: "anfragen",
      angebot: input.angebot,
      besonders: input.besonders,
      zielgruppe: "Hausbesitzer in Gossau und Umgebung",
      saeulen: ["Fassaden vorher und nachher", "Fragen aus dem Alltag", "Team und Region", "", ""],
      kanaele: ["instagram", "google"],
      beitraegeProWoche: "2",
    });
    expect(toInput(profile, f)).toEqual(mitSaeulen);
    const leer = formFromInput({ ...input, zielgruppe: "" });
    expect(effectiveZielgruppe(leer, profile)).toBe("");
    expect(effectiveSaeulen(leer, { contentSaeulen: [{ name: "Fassaden" }, { name: "Team" }, { name: "Fragen" }] })).toEqual(["", "", "", "", ""]);
  });
});

describe("content-strategie: eingabeText", () => {
  it("nennt die Angaben je Zeile, das Wichtigste zuerst", () => {
    const lines = eingabeText(input).split("\n");
    expect(lines.slice(0, 7)).toEqual([
      "Betrieb: Malerei Keller",
      "Art: KMU",
      "Ort: Gossau",
      "Branche: Malerei",
      "Ziel: Anfragen und Aufträge",
      "Kanäle: Instagram, Google-Beitrag",
      "Beiträge pro Woche: 2",
    ]);
    expect(lines).toContain("Besonderes: Termine werden gehalten, zwei Lehrlinge.");
    expect(lines).toContain("Hauptzielgruppe: Hausbesitzer in Gossau und Umgebung");
    expect(lines).toContain("Säulen: keine angegeben, die KI schlägt vor");
    expect(lines).toContain("Positionierung: Der Malerbetrieb in Gossau, der Termine hält.");
    expect(lines).toContain("Tonalität: Ruhig und konkret.");
    expect(eingabeText(input)).not.toMatch(/\[object|^\{/);
  });
  it("legt Absätze auf eine Zeile, nennt angegebene Säulen und lässt leere Felder weg", () => {
    const text = eingabeText({ ...mitSaeulen, angebot: "Erste Zeile.\n\nZweite Zeile.", branche: "", ort: "", besonders: "", zielgruppe: "", positionierung: "", tonalitaet: "" });
    expect(text).toContain("Angebot und Fragen: Erste Zeile. / Zweite Zeile.");
    expect(text).toContain("Säulen: Fassaden vorher und nachher, Fragen aus dem Alltag, Team und Region");
    for (const label of ["Ort:", "Branche:", "Besonderes:", "Hauptzielgruppe:", "Positionierung:", "Tonalität:"]) expect(text).not.toContain(label);
  });
  it("benutzt für den Verein Vereinsbegriffe", () => {
    const text = eingabeText({ ...input, betrieb: "FC Trogen", organisationstyp: "verein", ziel: "bindung", branche: "Fussball" });
    expect(text.split("\n").slice(0, 2)).toEqual(["Verein: FC Trogen", "Art: Verein"]);
    expect(text).toContain("Tätigkeit: Fussball");
    expect(text).toContain("Ziel: Sponsoren finden");
  });
  it("betriebZeile nennt Betrieb und Ort", () => {
    expect(betriebZeile(input)).toBe("Malerei Keller, Gossau");
    expect(betriebZeile({ betrieb: "Malerei Keller", ort: "" })).toBe("Malerei Keller");
  });
});

describe("content-strategie: toDocument", () => {
  const doc = toDocument(output(), input);
  const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));

  it("trägt Titel, Untertitel, Firma und Dateinamen", () => {
    expect(doc.title).toBe("Content-Strategie");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("content-strategie-malerei-keller");
    expect(toDocument(output(), { ...input, betrieb: "!!!" }).filename).toBe("content-strategie-betrieb");
  });
  it("beginnt mit den Fakten und dem KI-Hinweis und hat die neun Kapitel in fester Reihenfolge", () => {
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Ziel", value: "Anfragen und Aufträge" },
        { label: "Kanäle", value: "Instagram, Google-Beitrag" },
        { label: "Beiträge pro Woche", value: "2" },
      ],
    });
    expect(doc.blocks[1]).toEqual({ type: "paragraph", text: KI_HINWEIS });
    expect(headings).toEqual([
      "Kernbotschaft",
      "Ziele und Messgrössen",
      "Zielgruppen",
      "Themen",
      "Rollen der Kanäle",
      "Rhythmus",
      "Die ersten 90 Tage",
      "Woran ihr merkt, ob es wirkt",
      "Das lassen wir weg",
    ]);
    expect(Object.values(KAPITEL)).toEqual(headings);
  });
  it("zeigt Ziele und Kanäle als Tabellen", () => {
    const tables = doc.blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(2);
    expect(tables[0]).toMatchObject({ header: ["Ziel", "Messgrösse"], rows: [[output().ziele[0].ziel, output().ziele[0].messgroesse], [output().ziele[1].ziel, output().ziele[1].messgroesse]] });
    expect(tables[1]).toMatchObject({
      header: ["Kanal", "Rolle", "Formate"],
      rows: [
        ["Instagram", output().kanalrollen[0].rolle, "Foto, Kurzvideo"],
        ["Google-Beitrag", output().kanalrollen[1].rolle, "Text mit Bild"],
      ],
    });
  });
  it("zeigt Zielgruppen und Themen als Listen mit «Name: Text»", () => {
    const lists = doc.blocks.filter((b) => b.type === "list");
    expect(lists[0]).toMatchObject({ items: [`Hausbesitzer in Gossau: ${output().zielgruppen[0].bedarf}`] });
    expect(lists[1]).toMatchObject({ items: output().saeulen.map((s) => `${s.name}: ${s.rolle}`) });
  });
  it("zeigt die ersten 90 Tage als drei Absätze mit je einer Liste", () => {
    const i = doc.blocks.findIndex((b) => b.type === "heading" && b.text === KAPITEL.plan);
    const plan = doc.blocks.slice(i + 1, i + 7);
    expect(plan.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph", "list", "paragraph", "list"]);
    expect(plan[0]).toEqual({ type: "paragraph", text: `Monat 1: ${output().plan90[0].schwerpunkt}` });
    expect(plan[1]).toEqual({ type: "list", items: output().plan90[0].aufgaben });
    expect(plan[4]).toEqual({ type: "paragraph", text: `Monat 3: ${output().plan90[2].schwerpunkt}` });
  });
  it("schliesst mit der Messung und «Das lassen wir weg» und sagt, dass die Richtwerte die Person festlegt", () => {
    const last = doc.blocks.slice(-4);
    expect(last[0]).toMatchObject({ type: "paragraph", text: expect.stringContaining("Legt die Richtwerte selbst fest") as string });
    expect(last[1]).toEqual({ type: "list", items: output().messung });
    expect(last[2]).toEqual({ type: "heading", level: 1, text: "Das lassen wir weg" });
    expect(last[3]).toEqual({ type: "list", items: output().niemals });
  });
  it("benutzt für den Verein das Wort Verein, ohne Ort nur den Namen", () => {
    const verein = toDocument(output(), { ...input, betrieb: "FC Trogen", ort: "", organisationstyp: "verein", ziel: "anfragen" });
    expect(verein.blocks[0]).toMatchObject({ items: [{ label: "Verein", value: "FC Trogen" }, { label: "Ziel", value: "Mitglieder gewinnen" }, expect.anything(), expect.anything()] });
  });
  it("screenBlocks lässt nur den KI-Hinweis weg, Markdown und CRM-Text behalten ihn", () => {
    const screen = screenBlocks(doc);
    expect(screen).toHaveLength(doc.blocks.length - 1);
    expect(screen.some((b) => b.type === "paragraph" && b.text === KI_HINWEIS)).toBe(false);
    const md = reportMarkdown(output(), input);
    expect(md).toBe(toMarkdown(doc));
    expect(md.startsWith("# Content-Strategie\n\n_Für Malerei Keller_")).toBe(true);
    expect(md).toContain(KI_HINWEIS);
    expect(md).toContain("| Kanal | Rolle | Formate |");
    expect(md).toContain("## Die ersten 90 Tage");
    expect(md).not.toMatch(/\[object|undefined/);
  });
  it("hält die festen Texte des Dokuments frei von Sperrliste, Ausrufezeichen und Gedankenstrich", () => {
    const fest = [...Object.values(KAPITEL), "Gemessen wird nur, was ihr selbst zählt. Legt die Richtwerte selbst fest; Vergleichswerte von aussen stehen hier nicht.", KI_HINWEIS];
    for (const t of fest) {
      expect(brandHits(t), t).toEqual([]);
      expect(t).not.toMatch(/!|—|ß|\bjetzt\b/);
    }
  });
});

describe("content-strategie: profilePatch", () => {
  it("schreibt Name und Rolle der Säulen, wenn das Profil keine hat", () => {
    expect(profilePatch({}, output())).toEqual({
      contentSaeulen: output().saeulen.map((s) => ({ name: s.name, beschreibung: s.rolle })),
    });
    expect(profilePatch({ contentSaeulen: [] }, output()).contentSaeulen).toHaveLength(3);
  });
  it("lässt das Profil, wie es ist, wenn dort schon Säulen stehen", () => {
    expect(profilePatch({ contentSaeulen: [{ name: "Eigene Säule" }] }, output())).toEqual({});
  });
});

describe("content-strategie: parseState", () => {
  it("liefert bei kaputten oder fremden Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 7, [], {}, { v: 2, input, output: output() }, { v: 1 }, { v: 1, input: { betrieb: "x" }, output: output() }, { v: 1, input: { ...input, kanaele: [] }, output: output() }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
    expect(EMPTY_STATE).toEqual({ v: 1, phase: "form", input: null, output: null });
  });
  it("liest einen gültigen Stand mit Ergebnis und setzt die Phase «result»", () => {
    const s = parseState({ v: 1, phase: "form", input, output: output() });
    expect(s).toEqual({ v: 1, phase: "result", input, output: output() });
    expect(s).toEqual(resultState(input, output()));
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("behält eine gültige Eingabe, wenn das Ergebnis kaputt ist, und meldet die Phase «form»", () => {
    expect(parseState({ v: 1, phase: "result", input, output: { kernbotschaft: "nur ein Feld" } })).toEqual({ v: 1, phase: "form", input, output: null });
    expect(parseState({ v: 1, phase: "result", input, output: null })).toEqual({ v: 1, phase: "form", input, output: null });
    expect(parseState({ v: 1, input, output: { ...output(), plan90: [] } }).output).toBeNull();
  });
  it("verwirft den Stand mit zwei Säulen in der Eingabe", () => {
    expect(parseState({ v: 1, input: { ...input, saeulen: ["Fassaden", "Team"] }, output: output() })).toEqual(EMPTY_STATE);
  });
  it("liest den Stand nach dem Speichern als JSON gleich wieder", () => {
    const s = resultState(mitSaeulen, output());
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
