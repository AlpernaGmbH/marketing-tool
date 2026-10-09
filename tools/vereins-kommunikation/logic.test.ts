import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_FIELDS } from "@/lib/profile-fields";
import { toMarkdown } from "@/lib/export/model";
import { LIMITS, type VereinInput, type VereinOutput } from "./generator";
import {
  ANSPRUCHSGRUPPEN_SLUG,
  EMPTY_FORM,
  EMPTY_STATE,
  ENTWICKLUNGEN,
  FIELD_IDS,
  KANAELE,
  KI_HINWEIS,
  MONAT_OPTIONEN,
  SLUG,
  ZIELE,
  addAnlass,
  anlassFieldId,
  charCount,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  gruppenAus,
  gruppenHinweis,
  inputProblem,
  isEntwicklung,
  isKanalKey,
  isZielKey,
  kalenderSortiert,
  kanaeleAusProfil,
  kanalFieldId,
  kantonName,
  monatName,
  neueKanaele,
  normalizeKanaele,
  normalizeZiele,
  parseState,
  parseZahl,
  profilePatch,
  removeAnlass,
  reportMarkdown,
  screenBlocks,
  setAnlass,
  toDocument,
  toInput,
  vereinZeile,
  zielFieldId,
  type VereinForm,
} from "./logic";
import config from "./tool.config";

const fields = { firma: "FC Trogen", ort: "Trogen", kanton: "AR" };

const form = (over: Partial<VereinForm> = {}): VereinForm => ({
  zweck: "Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren. Heimspiele auf dem Sportplatz in Trogen.",
  mitglieder: "180",
  entwicklung: "waechst",
  ziele: ["nachwuchs", "mitglieder", "sponsoren"],
  anlaesse: [
    { id: "a1", name: "Generalversammlung", monat: "3" },
    { id: "a2", name: "Dorffest", monat: "6" },
    { id: "a3", name: "Grümpelturnier", monat: "8" },
  ],
  kanaele: ["instagram", "website", "whatsapp", "gemeindeblatt"],
  wer: "Zwei Vorstandsmitglieder",
  stunden: "6",
  budget: "2000",
  ...over,
});

const gruppen = [
  { name: "Mitglieder", interesse: 5, einfluss: 4 },
  { name: "Sponsoren", interesse: 4, einfluss: 5 },
];

const input = (): VereinInput => {
  const i = toInput(fields, form(), gruppen);
  if (!i) throw new Error("Testeingabe ungültig");
  return i;
};

const output = (over: Partial<VereinOutput> = {}): VereinOutput => ({
  ausgangslage:
    "Der FC Trogen hat 180 Mitglieder, und die Zahl wächst. Heute laufen die Website, Instagram, WhatsApp-Gruppen und das Gemeindeblatt. Zwei Vorstandsmitglieder machen die Kommunikation und haben dafür 6 Stunden pro Monat.",
  ziele: [
    { ziel: "Mehr Kinder und Jugendliche für den Nachwuchs gewinnen", messgroesse: "Anmeldungen im Nachwuchs" },
    { ziel: "Neue Mitglieder aus Trogen und Umgebung gewinnen", messgroesse: "Neue Mitglieder im Vereinsjahr" },
  ],
  zielgruppen: [
    { name: "Mitglieder", erwartung: "Wissen, wann Training, Spiele und Anlässe stattfinden." },
    { name: "Sponsoren", erwartung: "Sehen, was ihr Beitrag im Verein bewirkt." },
  ],
  kernbotschaft: "Der FC Trogen bringt Kinder, Familien und Dorf auf dem Sportplatz zusammen.",
  kanalplan: [
    { kanal: "Website", zweck: "Termine, Kontakt und Anmeldung für den Nachwuchs.", rhythmus: "bei jeder Änderung", verantwortlich: "Betreuung Website" },
    { kanal: "Newsletter oder Mail (neu)", zweck: "Sponsoren zweimal im Jahr informieren.", rhythmus: "zweimal im Jahr", verantwortlich: "" },
  ],
  jahreskalender: [
    { monat: 8, anlass: "Grümpelturnier", kommunikation: "Anmeldung auf der Website, Bilder danach auf Instagram." },
    { monat: 3, anlass: "Generalversammlung", kommunikation: "Einladung per Mail und Aushang, danach das Protokoll auf der Website." },
    { monat: 6, anlass: "Dorffest", kommunikation: "Einladung im Gemeindeblatt, Bilder auf Instagram, Dank an die Helferinnen und Helfer." },
  ],
  rollen: [
    { rolle: "Verantwortliche für Instagram", aufgaben: "Plant und veröffentlicht die Beiträge.", stundenProMonat: 3 },
    { rolle: "Betreuung Website", aufgaben: "Hält Termine und Hinweise aktuell.", stundenProMonat: 2 },
  ],
  erfolgsmessung: ["Zahl der Mitglieder am Ende des Vereinsjahrs", "Anmeldungen zum Dorffest und zum Grümpelturnier"],
  ...over,
});

describe("vereins-kommunikation: Konfiguration", () => {
  it("passt zum Auftrag: Verein, Server, Profil-Felder aus der Liste", () => {
    expect(config.slug).toBe(SLUG);
    expect(config.audience).toBe("verein");
    expect(config.needsServer).toBe(true);
    expect(config.pathStep).toEqual({ path: "strategie", order: 18 });
    expect(config.related).toEqual(["anspruchsgruppen", "sponsoring-dossier", "feiertagskalender"]);
    for (const f of [...config.usesProfile, ...config.writesProfile]) expect(PROFILE_FIELDS).toContain(f);
    expect(config.writesProfile).toEqual(["organisationstyp", "kanaele"]);
    expect(config.tagline.length).toBeLessThanOrEqual(110);
  });
});

describe("vereins-kommunikation: Listen und Hilfen", () => {
  it("führt die Auswahl in fester Reihenfolge und erkennt gültige Schlüssel", () => {
    expect(ENTWICKLUNGEN.map((e) => e.label)).toEqual(["wächst", "stabil", "schrumpft"]);
    expect(ZIELE.map((z) => z.label)).toEqual(["Mitglieder gewinnen", "Nachwuchs", "Helferinnen und Helfer", "Sponsoren", "Sichtbarkeit in der Gemeinde"]);
    expect(KANAELE).toHaveLength(8);
    expect(MONAT_OPTIONEN).toHaveLength(12);
    expect(MONAT_OPTIONEN[0]).toEqual({ value: "1", label: "Januar" });
    expect(isEntwicklung("stabil")).toBe(true);
    expect(isEntwicklung("")).toBe(false);
    expect(isZielKey("helfer")).toBe(true);
    expect(isZielKey("geld")).toBe(false);
    expect(isKanalKey("aushang")).toBe(true);
    expect(isKanalKey("tiktok")).toBe(false);
    expect(monatName(6)).toBe("Juni");
    expect(monatName(13)).toBe("13");
  });
  it("normalizeZiele und normalizeKanaele ordnen, entfernen Doppel und Unbekanntes", () => {
    expect(normalizeZiele(["sponsoren", "mitglieder", "mitglieder", "geld"])).toEqual(["mitglieder", "sponsoren"]);
    expect(normalizeKanaele(["aushang", "website", "website", "tiktok"])).toEqual(["website", "aushang"]);
    expect(normalizeKanaele([])).toEqual([]);
  });
  it("kantonName macht aus dem Kürzel den Namen", () => {
    expect(kantonName("AR")).toBe("Appenzell Ausserrhoden");
    expect(kantonName("SG")).toBe("St. Gallen");
    expect(kantonName("XX")).toBe("");
    expect(kantonName(undefined)).toBe("");
  });
  it("charCount zählt Schriftzeichen", () => {
    expect(charCount("Grümpel")).toBe(7);
    expect(charCount("a😀b")).toBe(3);
  });
});

describe("vereins-kommunikation: Kanäle aus dem Profil", () => {
  it("erkennt Einträge mit name oder kanal an ihren Wörtern, in fester Reihenfolge", () => {
    expect(kanaeleAusProfil({ kanaele: [{ name: "WhatsApp-Gruppen" }, { kanal: "Instagram" }, { name: "Gemeindeblatt" }, { name: "E-Mail-Newsletter" }] })).toEqual([
      "instagram",
      "whatsapp",
      "newsletter",
      "gemeindeblatt",
    ]);
  });
  it("lässt Unbekanntes, leere Einträge und fehlende Kanäle weg", () => {
    expect(kanaeleAusProfil({ kanaele: [{ name: "TikTok" }, {}, { name: "  " }] })).toEqual([]);
    expect(kanaeleAusProfil({})).toEqual([]);
  });
  it("effectiveKanaele nimmt die gewählten Kanäle, sonst den Vorschlag aus dem Profil", () => {
    const profile = { kanaele: [{ name: "Website" }] };
    expect(effectiveKanaele({ kanaele: null }, profile)).toEqual(["website"]);
    expect(effectiveKanaele({ kanaele: ["aushang"] }, profile)).toEqual(["aushang"]);
    expect(effectiveKanaele({ kanaele: [] }, profile)).toEqual([]);
    expect(effectiveKanaele(EMPTY_FORM, {})).toEqual([]);
  });
});

describe("vereins-kommunikation: Anspruchsgruppen", () => {
  const stand = (gruppenListe: unknown[]) => ({ v: 1, phase: "result", typ: "verein", gruppen: gruppenListe, plan: [] });
  const g = (id: string, name: string, interesse: number, einfluss: number) => ({ id, name, interesse, einfluss, beziehung: "", erwartung: "", bedarf: "" });

  it("liest die bewerteten Gruppen aus dem gespeicherten Stand", () => {
    expect(gruppenAus(stand([g("g1", "Mitglieder", 5, 4), g("g2", "Sponsoren", 4, 5)]))).toEqual(gruppen);
  });
  it("lässt Gruppen ohne Werte, ohne Namen oder mit ungültigen Werten weg", () => {
    expect(gruppenAus(stand([g("g1", "Mitglieder", 5, 4), g("g2", "Medien", 0, 0), g("g3", "Vorstand", 3, 0), g("g4", "  ", 3, 3), g("g5", "Gemeinde", 2, 5)]))).toEqual([
      { name: "Mitglieder", interesse: 5, einfluss: 4 },
      { name: "Gemeinde", interesse: 2, einfluss: 5 },
    ]);
  });
  it("gibt höchstens zwölf Gruppen zurück", () => {
    const viele = Array.from({ length: 15 }, (_, i) => g(`g${i + 1}`, `Gruppe ${i + 1}`, 3, 3));
    expect(gruppenAus(stand(viele)).length).toBeLessThanOrEqual(LIMITS.gruppen);
  });
  it("gibt bei kaputten, fehlenden und unberührten Ständen keine Gruppen zurück", () => {
    expect(gruppenAus(null)).toEqual([]);
    expect(gruppenAus("kaputt")).toEqual([]);
    expect(gruppenAus({ v: 2, gruppen: [g("g1", "Mitglieder", 5, 4)] })).toEqual([]);
    expect(gruppenAus({ v: 1, gruppen: "nein" })).toEqual([]);
    expect(gruppenAus(stand([g("g1", "Mitglieder", 0, 0), g("g2", "Sponsoren", 0, 0)]))).toEqual([]);
  });
  it("gruppenHinweis nennt die Namen oder bleibt leer", () => {
    expect(gruppenHinweis(gruppen)).toBe("Deine Anspruchsgruppen gehen mit: Mitglieder, Sponsoren.");
    expect(gruppenHinweis([])).toBe("");
    expect(ANSPRUCHSGRUPPEN_SLUG).toBe("anspruchsgruppen");
  });
});

describe("vereins-kommunikation: Liste der Anlässe", () => {
  it("startet mit einer leeren Zeile", () => {
    expect(EMPTY_FORM.anlaesse).toEqual([{ id: "a1", name: "", monat: "" }]);
    expect(EMPTY_FORM.kanaele).toBeNull();
  });
  it("addAnlass hängt eine Zeile mit neuer ID an, höchstens bis acht", () => {
    let rows = addAnlass(EMPTY_FORM.anlaesse);
    expect(rows.map((r) => r.id)).toEqual(["a1", "a2"]);
    for (let i = 0; i < 10; i++) rows = addAnlass(rows);
    expect(rows).toHaveLength(LIMITS.anlaesse);
    expect(new Set(rows.map((r) => r.id)).size).toBe(LIMITS.anlaesse);
  });
  it("removeAnlass entfernt eine Zeile, und eine neue Zeile bekommt keine alte ID zurück", () => {
    const drei = addAnlass(addAnlass(EMPTY_FORM.anlaesse));
    const ohneMitte = removeAnlass(drei, "a2");
    expect(ohneMitte.map((r) => r.id)).toEqual(["a1", "a3"]);
    expect(addAnlass(ohneMitte).map((r) => r.id)).toEqual(["a1", "a3", "a4"]);
    expect(removeAnlass(drei, "a9")).toEqual(drei);
    expect(removeAnlass(EMPTY_FORM.anlaesse, "a1")).toEqual([]);
    expect(addAnlass([]).map((r) => r.id)).toEqual(["a1"]);
  });
  it("setAnlass ändert nur die gewählte Zeile", () => {
    const rows = setAnlass(addAnlass(EMPTY_FORM.anlaesse), "a2", { name: "Dorffest", monat: "6" });
    expect(rows[0]).toEqual({ id: "a1", name: "", monat: "" });
    expect(rows[1]).toEqual({ id: "a2", name: "Dorffest", monat: "6" });
  });
  it("parseZahl liest ganze Zahlen mit Tausendertrenner und sonst nichts", () => {
    expect(parseZahl("180")).toBe(180);
    expect(parseZahl(" 1'200 ")).toBe(1200);
    expect(parseZahl("1 200")).toBe(1200);
    expect(parseZahl("0")).toBe(0);
    for (const bad of ["", "abc", "1.5", "1,5", "-3", "1e3", "12345678901"]) expect(parseZahl(bad)).toBeNull();
  });
});

describe("vereins-kommunikation: inputProblem", () => {
  it("lässt eine vollständige Eingabe durch, auch mit leerem Budget, ohne Anlässe und mit 0 Stunden", () => {
    expect(inputProblem(fields, form())).toBeNull();
    expect(inputProblem(fields, form({ budget: "", wer: "", anlaesse: [{ id: "a1", name: "", monat: "" }], kanaele: [], stunden: "0" }))).toBeNull();
    expect(inputProblem(fields, form({ anlaesse: [], kanaele: null }))).toBeNull();
  });
  it("meldet zuerst den fehlenden Vereinsnamen und nennt das Feld", () => {
    expect(inputProblem({ firma: "  " }, EMPTY_FORM)).toEqual({ message: "Gib den Namen deines Vereins an.", fieldId: FIELD_IDS.firma });
    expect(inputProblem({}, form())?.fieldId).toBe("vk-firma");
  });
  it("prüft den Zweck: mindestens 20, höchstens 400 Zeichen", () => {
    expect(inputProblem(fields, form({ zweck: "zu kurz" }))).toMatchObject({ fieldId: FIELD_IDS.zweck });
    expect(inputProblem(fields, form({ zweck: "x".repeat(19) }))?.message).toContain("mindestens 20 Zeichen");
    expect(inputProblem(fields, form({ zweck: "x".repeat(20) }))).toBeNull();
    expect(inputProblem(fields, form({ zweck: "x".repeat(401) }))?.message).toContain("höchstens 400 Zeichen");
  });
  it("prüft die Mitgliederzahl: ganze Zahl von 1 bis 100'000", () => {
    for (const bad of ["", "0", "-5", "abc", "1.5", "100001"]) {
      expect(inputProblem(fields, form({ mitglieder: bad })), bad).toMatchObject({ fieldId: FIELD_IDS.mitglieder });
    }
    expect(inputProblem(fields, form({ mitglieder: "abc" }))?.message).toContain("1 bis 100'000");
    expect(inputProblem(fields, form({ mitglieder: "1" }))).toBeNull();
    expect(inputProblem(fields, form({ mitglieder: "100000" }))).toBeNull();
  });
  it("verlangt eine Entwicklung und mindestens ein Ziel", () => {
    expect(inputProblem(fields, form({ entwicklung: "" }))).toEqual({ message: "Wähle, wie sich die Mitgliederzahl entwickelt.", fieldId: FIELD_IDS.entwicklung });
    expect(inputProblem(fields, form({ ziele: [] }))).toEqual({ message: "Wähle mindestens ein Ziel.", fieldId: zielFieldId("mitglieder") });
  });
  it("prüft die Anlässe: Name, Länge, Monat und Anzahl; leere Zeilen zählen nicht", () => {
    const rows = (...a: [string, string][]) => a.map(([name, monat], i) => ({ id: `a${i + 1}`, name, monat }));
    expect(inputProblem(fields, form({ anlaesse: rows(["Dorffest", ""]) }))).toEqual({ message: "Wähle den Monat für «Dorffest».", fieldId: anlassFieldId("a1", "monat") });
    expect(inputProblem(fields, form({ anlaesse: rows(["", "6"]) }))).toEqual({ message: "Gib dem Anlass im Juni einen Namen.", fieldId: anlassFieldId("a1", "name") });
    expect(inputProblem(fields, form({ anlaesse: rows(["GV", "3"]) }))?.message).toContain("«Generalversammlung» statt «GV»");
    expect(inputProblem(fields, form({ anlaesse: rows(["x".repeat(81), "3"]) }))?.message).toContain("höchstens 80 Zeichen");
    expect(inputProblem(fields, form({ anlaesse: rows(["Dorffest", "6"], ["", ""], ["Turnier", "8"]) }))).toBeNull();
    const neun = Array.from({ length: 9 }, (_, i) => ({ id: `a${i + 1}`, name: `Anlass ${i + 1}`, monat: "1" }));
    expect(inputProblem(fields, form({ anlaesse: neun }))).toEqual({ message: "Du kannst höchstens 8 Anlässe angeben.", fieldId: FIELD_IDS.anlassAdd });
  });
  it("prüft wer, Stunden und Budget", () => {
    expect(inputProblem(fields, form({ wer: "x".repeat(81) }))).toMatchObject({ fieldId: FIELD_IDS.wer });
    for (const bad of ["", "abc", "1.5"]) expect(inputProblem(fields, form({ stunden: bad })), bad).toMatchObject({ fieldId: FIELD_IDS.stunden });
    expect(inputProblem(fields, form({ stunden: "201" }))?.message).toContain("0 bis 200");
    expect(inputProblem(fields, form({ stunden: "200" }))).toBeNull();
    for (const bad of ["abc", "-1", "1000001", "2.5"]) expect(inputProblem(fields, form({ budget: bad })), bad).toMatchObject({ fieldId: FIELD_IDS.budget });
    expect(inputProblem(fields, form({ budget: "1000000" }))).toBeNull();
  });
  it("meldet in der Reihenfolge des Formulars", () => {
    expect(inputProblem(fields, EMPTY_FORM)?.fieldId).toBe(FIELD_IDS.zweck);
    expect(inputProblem(fields, form({ mitglieder: "", ziele: [], stunden: "" }))?.fieldId).toBe(FIELD_IDS.mitglieder);
    expect(inputProblem(fields, form({ ziele: [], stunden: "" }))?.fieldId).toBe(zielFieldId("mitglieder"));
    expect(inputProblem(fields, form({ stunden: "" }))?.fieldId).toBe(FIELD_IDS.stunden);
    expect(kanalFieldId("website")).toBe("vk-kanal-website");
  });
  it("hält jede Meldung ruhig: ohne Ausrufezeichen, ohne Sperrliste", () => {
    const rows = (name: string, monat: string) => [{ id: "a1", name, monat }];
    const forms = [
      EMPTY_FORM,
      form({ zweck: "x".repeat(401) }),
      form({ mitglieder: "abc" }),
      form({ entwicklung: "" }),
      form({ ziele: [] }),
      form({ anlaesse: rows("Dorffest", "") }),
      form({ anlaesse: rows("", "6") }),
      form({ anlaesse: rows("GV", "3") }),
      form({ wer: "x".repeat(81) }),
      form({ stunden: "" }),
      form({ budget: "abc" }),
    ];
    for (const f of forms) {
      const message = inputProblem({ firma: "FC Trogen" }, f)?.message ?? "";
      expect(message).not.toBe("");
      expect(message).not.toMatch(/!|\bjetzt\b|—|ß/);
      expect(brandHits(message)).toEqual([]);
    }
    expect(brandHits(inputProblem({}, EMPTY_FORM)?.message ?? "")).toEqual([]);
  });
});

describe("vereins-kommunikation: toInput", () => {
  it("macht aus Profil, Formular und Gruppen die Eingabe des Generators, geordnet und mit Kantonsnamen", () => {
    expect(toInput(fields, form(), gruppen)).toEqual({
      verein: "FC Trogen",
      ort: "Trogen",
      kanton: "Appenzell Ausserrhoden",
      zweck: "Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren. Heimspiele auf dem Sportplatz in Trogen.",
      mitglieder: 180,
      entwicklung: "waechst",
      ziele: ["mitglieder", "nachwuchs", "sponsoren"],
      anlaesse: [
        { name: "Generalversammlung", monat: 3 },
        { name: "Dorffest", monat: 6 },
        { name: "Grümpelturnier", monat: 8 },
      ],
      kanaele: ["website", "instagram", "whatsapp", "gemeindeblatt"],
      wer: "Zwei Vorstandsmitglieder",
      stundenProMonat: 6,
      budget: 2000,
      gruppen,
    });
  });
  it("funktioniert ohne Gruppen, ohne Budget, ohne Anlässe und ohne Ort und Kanton", () => {
    const i = toInput({ firma: "FC Trogen" }, form({ budget: "", anlaesse: [{ id: "a1", name: "", monat: "" }], wer: "", stunden: "0" }));
    expect(i).toMatchObject({ verein: "FC Trogen", ort: "", kanton: "", anlaesse: [], gruppen: [], budget: 0, wer: "", stundenProMonat: 0 });
    expect(toInput(fields, form())?.gruppen).toEqual([]);
  });
  it("nimmt die Kanäle aus dem dritten Wert, sonst aus dem Formular, und leer, wenn nichts gewählt ist", () => {
    expect(toInput(fields, form(), [], ["aushang", "website"])?.kanaele).toEqual(["website", "aushang"]);
    expect(toInput(fields, form({ kanaele: ["aushang"] }))?.kanaele).toEqual(["aushang"]);
    expect(toInput(fields, form({ kanaele: null }))?.kanaele).toEqual([]);
  });
  it("bereinigt Leerraum und Tausendertrenner und kürzt auf die Grenzen", () => {
    const i = toInput({ firma: "  FC   Trogen  ", ort: " Trogen ", kanton: "AR" }, form({ mitglieder: " 1'200 ", wer: "  Zwei   Personen ", zweck: `  ${"x".repeat(450)}  ` }));
    expect(i?.verein).toBe("FC Trogen");
    expect(i?.ort).toBe("Trogen");
    expect(i?.mitglieder).toBe(1200);
    expect(i?.wer).toBe("Zwei Personen");
    expect(i?.zweck).toHaveLength(LIMITS.zweck);
  });
  it("gibt null, wenn etwas fehlt oder ausserhalb der Grenzen liegt", () => {
    expect(toInput({}, form())).toBeNull();
    expect(toInput(fields, form({ zweck: "kurz" }))).toBeNull();
    expect(toInput(fields, form({ mitglieder: "" }))).toBeNull();
    expect(toInput(fields, form({ mitglieder: "0" }))).toBeNull();
    expect(toInput(fields, form({ entwicklung: "" }))).toBeNull();
    expect(toInput(fields, form({ ziele: [] }))).toBeNull();
    expect(toInput(fields, form({ stunden: "" }))).toBeNull();
    expect(toInput(fields, form({ stunden: "201" }))).toBeNull();
    expect(toInput(fields, form({ budget: "abc" }))).toBeNull();
    expect(toInput(fields, form({ anlaesse: [{ id: "a1", name: "Dorffest", monat: "" }] }))).toBeNull();
  });
  it("begrenzt die Gruppen auf zwölf", () => {
    const viele = Array.from({ length: 15 }, (_, i) => ({ name: `Gruppe ${i + 1}`, interesse: 3, einfluss: 3 }));
    expect(toInput(fields, form(), viele)?.gruppen).toHaveLength(LIMITS.gruppen);
  });
  it("formFromInput ist die Umkehrung: aus der Eingabe wird wieder dieselbe Eingabe", () => {
    const i = input();
    const f = formFromInput(i);
    expect(f.mitglieder).toBe("180");
    expect(f.kanaele).toEqual(i.kanaele);
    expect(f.anlaesse.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(toInput(fields, f, i.gruppen)).toEqual(i);
    expect(inputProblem(fields, f)).toBeNull();
  });
  it("formFromInput gibt ohne Anlässe und ohne Budget eine leere Zeile und ein leeres Feld", () => {
    const i = toInput(fields, form({ anlaesse: [], budget: "" }))!;
    const f = formFromInput(i);
    expect(f.anlaesse).toEqual([{ id: "a1", name: "", monat: "" }]);
    expect(f.budget).toBe("");
    expect(f.kanaele).toEqual(i.kanaele);
  });
});

describe("vereins-kommunikation: Texte fürs CRM", () => {
  it("vereinZeile fügt Ort und Kanton an, wenn sie da sind", () => {
    expect(vereinZeile({ verein: "FC Trogen", ort: "Trogen", kanton: "Appenzell Ausserrhoden" })).toBe("FC Trogen, Trogen (Appenzell Ausserrhoden)");
    expect(vereinZeile({ verein: "FC Trogen", ort: "", kanton: "" })).toBe("FC Trogen");
    expect(vereinZeile({ verein: "FC Trogen", ort: "", kanton: "Thurgau" })).toBe("FC Trogen (Thurgau)");
  });
  it("eingabeText nennt jede Angabe in einer Zeile, das Wichtigste zuerst", () => {
    const lines = eingabeText(input()).split("\n");
    expect(lines[0]).toBe("Verein: FC Trogen, Trogen (Appenzell Ausserrhoden)");
    expect(lines).toContain("Mitglieder: 180, Zahl wächst");
    expect(lines).toContain("Ziele: Mitglieder gewinnen, Nachwuchs, Sponsoren");
    expect(lines).toContain("Anlässe im Jahr: Generalversammlung (März), Dorffest (Juni), Grümpelturnier (August)");
    expect(lines).toContain("Kanäle heute: Website, Instagram, WhatsApp-Gruppen, Gemeindeblatt oder Anzeiger");
    expect(lines).toContain("Kommunikation macht: Zwei Vorstandsmitglieder, 6 Stunden pro Monat");
    expect(lines).toContain("Budget pro Jahr: CHF 2'000.-");
    expect(lines).toContain("Anspruchsgruppen: Mitglieder (Interesse 5, Einfluss 4); Sponsoren (Interesse 4, Einfluss 5)");
    expect(lines.at(-1)).toMatch(/^Zweck: Fussballclub/);
    expect(lines.every((l) => l.trim() !== "")).toBe(true);
  });
  it("eingabeText sagt es offen, wenn Anlässe, Kanäle, wer und Budget fehlen, und lässt die Gruppenzeile weg", () => {
    const i = toInput({ firma: "FC Trogen" }, form({ anlaesse: [], kanaele: [], wer: "", budget: "" }))!;
    const text = eingabeText(i);
    expect(text).toContain("Anlässe im Jahr: keine angegeben");
    expect(text).toContain("Kanäle heute: keine");
    expect(text).toContain("Kommunikation macht: keine Angabe, 6 Stunden pro Monat");
    expect(text).toContain("Budget pro Jahr: keines angegeben");
    expect(text).not.toContain("Anspruchsgruppen");
  });
  it("eingabeText glättet Zeilenumbrüche im Zweck", () => {
    const i = toInput(fields, form({ zweck: "Erste Zeile des Zwecks.\n\nZweite Zeile des Zwecks." }))!;
    expect(eingabeText(i)).toContain("Zweck: Erste Zeile des Zwecks. / Zweite Zeile des Zwecks.");
  });
});

describe("vereins-kommunikation: Dokument", () => {
  it("kalenderSortiert ordnet nach Monat und lässt innerhalb eines Monats die Reihenfolge", () => {
    const e = (monat: number, anlass: string) => ({ monat, anlass, kommunikation: "Einladung im Gemeindeblatt." });
    expect(kalenderSortiert([e(8, "C"), e(3, "A"), e(8, "B"), e(1, "D")]).map((x) => x.anlass)).toEqual(["D", "A", "C", "B"]);
    expect(kalenderSortiert([])).toEqual([]);
  });
  it("neueKanaele zählt Vorschläge mit «(neu)»", () => {
    expect(neueKanaele(output())).toBe(1);
    expect(neueKanaele({ kanalplan: [] })).toBe(0);
  });
  it("baut acht Kapitel in fester Reihenfolge, mit Facts, KI-Hinweis und Untertitel", () => {
    const doc = toDocument(output(), input());
    expect(doc.title).toBe("Kommunikationskonzept");
    expect(doc.subtitle).toBe("FC Trogen, Vorlage für die Generalversammlung");
    expect(doc.firma).toBe("FC Trogen");
    expect(doc.filename).toBe("kommunikationskonzept-fc-trogen");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["1. Ausgangslage", "2. Ziele", "3. Zielgruppen", "4. Kernbotschaft", "5. Kanalplan", "6. Jahreskalender", "7. Rollenverteilung", "8. Erfolgsmessung"]);
    const facts = doc.blocks[0];
    expect(facts.type).toBe("facts");
    if (facts.type === "facts") {
      expect(facts.items.map((f) => f.label)).toEqual(["Verein", "Mitglieder", "Zeit für die Kommunikation", "Budget pro Jahr"]);
      expect(facts.items[1].value).toBe("180, Zahl wächst");
      expect(facts.items[2].value).toBe("Zwei Vorstandsmitglieder, 6 Stunden pro Monat");
      expect(facts.items[3].value).toBe("CHF 2'000.-");
    }
    expect(doc.blocks[1]).toEqual({ type: "paragraph", text: KI_HINWEIS });
  });
  it("zeigt Ziele, Zielgruppen, Kanalplan, Kalender und Rollen als Tabellen mit passenden Köpfen", () => {
    const tables = toDocument(output(), input()).blocks.filter((b) => b.type === "table");
    expect(tables.map((t) => (t.type === "table" ? t.header : []))).toEqual([
      ["Ziel", "Messgrösse"],
      ["Zielgruppe", "Erwartung"],
      ["Kanal", "Zweck", "Rhythmus", "Verantwortlich"],
      ["Monat", "Anlass", "Kommunikation"],
      ["Rolle", "Aufgaben", "Stunden pro Monat"],
    ]);
    for (const t of tables) if (t.type === "table") for (const row of t.rows) expect(row).toHaveLength(t.header.length);
  });
  it("sortiert den Kalender nach Monat und nennt die Monate beim Namen", () => {
    const kalender = toDocument(output(), input()).blocks.find((b) => b.type === "table" && b.header[0] === "Monat");
    expect(kalender?.type === "table" ? kalender.rows.map((r) => `${r[0]}: ${r[1]}`) : []).toEqual(["März: Generalversammlung", "Juni: Dorffest", "August: Grümpelturnier"]);
  });
  it("schreibt «noch offen», wo niemand verantwortlich ist, und erklärt «(neu)»", () => {
    const doc = toDocument(output(), input());
    const plan = doc.blocks.find((b) => b.type === "table" && b.header[0] === "Kanal");
    expect(plan?.type === "table" ? plan.rows.map((r) => r[3]) : []).toEqual(["Betreuung Website", "noch offen"]);
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text.includes("«(neu)»"))).toBe(true);
    const ohneNeu = toDocument(output({ kanalplan: output().kanalplan.map((k) => ({ ...k, kanal: k.kanal.replace(" (neu)", "") })) }), input());
    expect(ohneNeu.blocks.some((b) => b.type === "paragraph" && b.text.includes("«(neu)»"))).toBe(false);
  });
  it("rechnet die Stunden der Rollen zusammen", () => {
    const doc = toDocument(output(), input());
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text === "Zusammen 5 von 6 Stunden pro Monat.")).toBe(true);
  });
  it("sagt ohne Anlässe, dass kein Kalender entsteht, und ohne Budget, dass es keines gibt", () => {
    const ohne = toInput({ firma: "FC Trogen" }, form({ anlaesse: [], budget: "", wer: "" }))!;
    const doc = toDocument(output({ jahreskalender: [] }), ohne);
    expect(doc.blocks.some((b) => b.type === "table" && b.header[0] === "Monat")).toBe(false);
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text.startsWith("Es sind keine Anlässe angegeben"))).toBe(true);
    const facts = doc.blocks[0];
    if (facts.type === "facts") {
      expect(facts.items[0].value).toBe("FC Trogen");
      expect(facts.items[2].value).toBe("6 Stunden pro Monat");
      expect(facts.items[3].value).toBe("kein Budget angegeben");
    }
  });
  it("screenBlocks lässt nur den KI-Hinweis weg", () => {
    const doc = toDocument(output(), input());
    expect(screenBlocks(doc)).toHaveLength(doc.blocks.length - 1);
    expect(screenBlocks(doc).some((b) => b.type === "paragraph" && b.text === KI_HINWEIS)).toBe(false);
  });
  it("reportMarkdown ist das Markdown des Dokuments und enthält Kapitel, Tabellen und keine Lücken", () => {
    const md = reportMarkdown(output(), input());
    expect(md).toBe(toMarkdown(toDocument(output(), input())));
    expect(md.startsWith("# Kommunikationskonzept")).toBe(true);
    expect(md).toContain("## 5. Kanalplan");
    expect(md).toContain("| Kanal | Zweck | Rhythmus | Verantwortlich |");
    expect(md).toContain("| März | Generalversammlung |");
    expect(md).not.toMatch(/undefined|NaN|\[object/);
  });
  it("baut ein Dokument ohne verbotene Zeichen", () => {
    const md = reportMarkdown(output(), input());
    expect(md).not.toMatch(/!|—|ß/);
    expect(brandHits(md.replace(/^\| .*$/gm, ""))).toEqual([]);
  });
});

describe("vereins-kommunikation: Profil schreiben", () => {
  it("setzt den Typ «verein» nur, wenn im Profil keiner steht", () => {
    expect(profilePatch({})).toEqual({ organisationstyp: "verein" });
    expect(profilePatch({ organisationstyp: "kmu" })).toEqual({});
    expect(profilePatch({ organisationstyp: "verein" })).toEqual({});
  });
  it("schreibt die Kanäle als Liste mit Namen, nur wenn das Feld leer ist", () => {
    expect(profilePatch({ organisationstyp: "verein" }, ["instagram", "website"])).toEqual({ kanaele: [{ name: "Website" }, { name: "Instagram" }] });
    expect(profilePatch({ organisationstyp: "verein", kanaele: [{ name: "Facebook" }] }, ["instagram"])).toEqual({});
    expect(profilePatch({ organisationstyp: "verein", kanaele: [] }, ["aushang"])).toEqual({ kanaele: [{ name: "Aushang" }] });
  });
  it("schreibt keine Kanäle, wenn die Person keine gewählt hat", () => {
    expect(profilePatch({}, [])).toEqual({ organisationstyp: "verein" });
    expect(profilePatch({ organisationstyp: "verein" }, [])).toEqual({});
  });
  it("verbindet beides, wenn beides fehlt; die Kanäle lesen sich im Formular wieder zurück", () => {
    const patch = profilePatch({}, ["whatsapp", "gemeindeblatt"]);
    expect(patch).toEqual({ organisationstyp: "verein", kanaele: [{ name: "WhatsApp-Gruppen" }, { name: "Gemeindeblatt oder Anzeiger" }] });
    expect(kanaeleAusProfil({ kanaele: patch.kanaele })).toEqual(["whatsapp", "gemeindeblatt"]);
  });
});

describe("vereins-kommunikation: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten und falscher Version den leeren Stand", () => {
    for (const raw of [null, undefined, 5, "text", [], { v: 2, input: input(), output: output() }, {}]) expect(parseState(raw)).toEqual(EMPTY_STATE);
  });
  it("gibt den leeren Stand, wenn die Eingabe ungültig ist; ein Entwurf ohne Eingabe fällt weg", () => {
    expect(parseState({ v: 1, input: { verein: "FC Trogen" }, output: output() })).toEqual(EMPTY_STATE);
    expect(parseState({ v: 1, input: null, output: output() })).toEqual(EMPTY_STATE);
  });
  it("behält die Eingabe, wenn nur der Entwurf kaputt ist", () => {
    const s = parseState({ v: 1, input: input(), output: { ausgangslage: "kurz" } });
    expect(s.input).toEqual(input());
    expect(s.output).toBeNull();
  });
  it("ist ein Rundlauf für Eingabe und Entwurf, auch nach JSON", () => {
    const s = { v: 1 as const, input: input(), output: output() };
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
  it("hat die Form {v, input, output}, die der Pfad-Fortschritt als erledigt erkennt", () => {
    const s = parseState({ v: 1, input: input(), output: output() });
    expect(Object.keys(s).sort()).toEqual(["input", "output", "v"]);
    expect(typeof s.output).toBe("object");
  });
});
