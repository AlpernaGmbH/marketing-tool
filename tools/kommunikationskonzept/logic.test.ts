import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { PROFILE_FIELDS } from "@/lib/profile-fields";
import { toMarkdown } from "@/lib/export/model";
import { LIMITS, type KonzeptInput, type KonzeptOutput } from "./generator";
import {
  ANSPRUCHSGRUPPEN_SLUG,
  EMPTY_FORM,
  EMPTY_STATE,
  ENTWICKLUNGEN,
  FIELD_IDS,
  KI_HINWEIS,
  KNAPP_STUNDEN_JE_KANAL,
  MONAT_OPTIONEN,
  SCAN_SLUG,
  SLUG,
  WORTE,
  addAnlass,
  anlassFieldId,
  anzahlZeile,
  betriebZeile,
  charCount,
  effectiveKanaele,
  eingabeText,
  formFromInput,
  gruppenAus,
  gruppenHinweis,
  inputProblem,
  isEntwicklung,
  kalenderSortiert,
  kanaeleAusProfil,
  kanaeleAusScan,
  kanaeleFuer,
  kanalFieldId,
  kantonName,
  monatName,
  neueKanaele,
  normalizeKanaele,
  normalizeZiele,
  parseState,
  parseZahl,
  pitchFor,
  profilePatch,
  removeAnlass,
  reportMarkdown,
  screenBlocks,
  setAnlass,
  socialKanaele,
  toDocument,
  toInput,
  typOf,
  vorbelegung,
  vorbelegungText,
  zielFieldId,
  zieleFuer,
  type KonzeptForm,
} from "./logic";
import config from "./tool.config";

const fields = { firma: "FC Trogen", ort: "Trogen", kanton: "AR", organisationstyp: "verein" as const };
const kmuFields = { firma: "Malerei Keller", ort: "Gossau", kanton: "SG", organisationstyp: "kmu" as const };

const form = (over: Partial<KonzeptForm> = {}): KonzeptForm => ({
  zweck: "Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren. Heimspiele auf dem Sportplatz in Trogen.",
  anzahl: "180",
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

const input = (): KonzeptInput => {
  const i = toInput(fields, form(), gruppen);
  if (!i) throw new Error("Testeingabe ungültig");
  return i;
};

const kmuForm = (over: Partial<KonzeptForm> = {}): KonzeptForm => ({
  zweck: "Malerei mit acht Mitarbeitenden, Fassaden und Innenräume für Privatkundschaft und Verwaltungen in Gossau und Umgebung.",
  anzahl: "8",
  entwicklung: "stabil",
  ziele: ["fachkraefte", "neukunden"],
  anlaesse: [{ id: "a1", name: "Tag der offenen Tür", monat: "9" }],
  kanaele: ["instagram", "website", "google", "facebook"],
  wer: "Die Inhaberin und eine Mitarbeiterin im Büro",
  stunden: "8",
  budget: "",
  ...over,
});

const kmuInput = (): KonzeptInput => {
  const i = toInput(kmuFields, kmuForm());
  if (!i) throw new Error("Testeingabe des Betriebs ungültig");
  return i;
};

const output = (over: Partial<KonzeptOutput> = {}): KonzeptOutput => ({
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

describe("kommunikationskonzept: Konfiguration", () => {
  it("passt zum Auftrag: Betriebe und Vereine, Server, Profil-Felder aus der Liste", () => {
    expect(config.slug).toBe(SLUG);
    expect(config.name).toBe("Kommunikationskonzept");
    expect(config.audience).toBe("beide");
    expect(config.needsServer).toBe(true);
    expect(config.pathStep).toEqual({ path: "strategie", order: 18 });
    expect(config.related).toEqual(["anspruchsgruppen", "kanalstrategie", "posting-plan"]);
    for (const f of [...config.usesProfile, ...config.writesProfile]) expect(PROFILE_FIELDS).toContain(f);
    expect(config.usesProfile).toContain("website");
    expect(config.writesProfile).toEqual(["kanaele"]);
    expect(config.tagline.length).toBeLessThanOrEqual(110);
  });
});

describe("kommunikationskonzept: Typ und Wortlaut", () => {
  it("typOf folgt der Rechtsform im Profil; ohne Wahl gilt der Betrieb", () => {
    expect(typOf({ organisationstyp: "verein" })).toBe("verein");
    expect(typOf({ organisationstyp: "kmu" })).toBe("kmu");
    expect(typOf({})).toBe("kmu");
  });
  it("hat für beide Typen jeden Satz, ruhig und ohne Sperrliste", () => {
    for (const typ of ["verein", "kmu"] as const) {
      for (const [key, text] of Object.entries(WORTE[typ])) {
        expect(text, `${typ}.${key}`).not.toBe("");
        expect(text, `${typ}.${key}`).not.toMatch(/!|—|ß/);
        expect(brandHits(text), `${typ}.${key}`).toEqual([]);
      }
    }
    expect(Object.keys(WORTE.verein).sort()).toEqual(Object.keys(WORTE.kmu).sort());
  });
  it("spricht beim Verein von Mitgliedern und Vorstand, beim Betrieb von Mitarbeitenden, Nachfrage und Geschäftsleitung", () => {
    expect(WORTE.verein.anzahlLabel).toBe("Mitgliederzahl");
    expect(WORTE.verein.ergebnisHinweis).toContain("Generalversammlung");
    expect(WORTE.kmu.anzahlLabel).toBe("Mitarbeitende");
    expect(WORTE.kmu.entwicklungLabel).toBe("Entwicklung der Nachfrage");
    expect(WORTE.kmu.ergebnisHinweis).toContain("Geschäftsleitung");
    for (const text of Object.values(WORTE.kmu)) expect(text).not.toMatch(/Verein|Mitglied|Vorstand|Generalversammlung/);
  });
});

describe("kommunikationskonzept: Listen und Hilfen", () => {
  it("führt die Auswahl in fester Reihenfolge je Typ", () => {
    expect(ENTWICKLUNGEN.map((e) => e.label)).toEqual(["wächst", "stabil", "schrumpft"]);
    expect(zieleFuer("verein").map((z) => z.label)).toEqual(["Mitglieder gewinnen", "Nachwuchs", "Helferinnen und Helfer", "Sponsoren", "Sichtbarkeit in der Gemeinde"]);
    expect(zieleFuer("kmu").map((z) => z.label)).toEqual(["Neue Kundschaft gewinnen", "Stammkundschaft halten", "Fachkräfte und Lernende finden", "Bekanntheit in der Region"]);
    expect(kanaeleFuer("verein")).toHaveLength(8);
    expect(kanaeleFuer("kmu").map((k) => k.label)).toEqual(["Website", "Google Business Profil", "Instagram", "Facebook", "LinkedIn", "Newsletter oder Mail", "Gemeindeblatt oder Anzeiger", "Lokalpresse"]);
    expect(MONAT_OPTIONEN).toHaveLength(12);
    expect(MONAT_OPTIONEN[0]).toEqual({ value: "1", label: "Januar" });
    expect(isEntwicklung("stabil")).toBe(true);
    expect(isEntwicklung("")).toBe(false);
    expect(monatName(6)).toBe("Juni");
    expect(monatName(13)).toBe("13");
  });
  it("normalizeZiele und normalizeKanaele ordnen, entfernen Doppel, Unbekanntes und alles, was nicht zum Typ passt", () => {
    expect(normalizeZiele(["sponsoren", "mitglieder", "mitglieder", "geld"], "verein")).toEqual(["mitglieder", "sponsoren"]);
    expect(normalizeZiele(["sponsoren", "mitglieder", "fachkraefte", "neukunden"], "kmu")).toEqual(["neukunden", "fachkraefte"]);
    expect(normalizeKanaele(["aushang", "website", "website", "tiktok"], "verein")).toEqual(["website", "aushang"]);
    expect(normalizeKanaele(["aushang", "linkedin", "google", "website"], "kmu")).toEqual(["website", "google", "linkedin"]);
    expect(normalizeKanaele(["linkedin", "whatsapp"], "verein")).toEqual(["whatsapp"]);
    expect(normalizeKanaele([], "kmu")).toEqual([]);
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

describe("kommunikationskonzept: Kanäle aus dem Profil", () => {
  it("erkennt Einträge mit name oder kanal an ihren Wörtern, in fester Reihenfolge", () => {
    expect(kanaeleAusProfil({ kanaele: [{ name: "WhatsApp-Gruppen" }, { kanal: "Instagram" }, { name: "Gemeindeblatt" }, { name: "E-Mail-Newsletter" }] })).toEqual([
      "instagram",
      "whatsapp",
      "newsletter",
      "gemeindeblatt",
    ]);
    expect(kanaeleAusProfil({ kanaele: [{ name: "LinkedIn" }, { name: "Google Business Profil" }, { kanal: "Google Unternehmensprofil" }, { name: "GBP" }] })).toEqual(["google", "linkedin"]);
  });
  it("lässt Unbekanntes, leere Einträge und fehlende Kanäle weg", () => {
    expect(kanaeleAusProfil({ kanaele: [{ name: "TikTok" }, {}, { name: "  " }] })).toEqual([]);
    expect(kanaeleAusProfil({})).toEqual([]);
  });
  it("effectiveKanaele nimmt die gewählten Kanäle, sonst den Vorschlag, und immer nur die des Typs", () => {
    expect(effectiveKanaele({ kanaele: null }, ["website"], "verein")).toEqual(["website"]);
    expect(effectiveKanaele({ kanaele: ["aushang"] }, ["website"], "verein")).toEqual(["aushang"]);
    expect(effectiveKanaele({ kanaele: [] }, ["website"], "verein")).toEqual([]);
    expect(effectiveKanaele(EMPTY_FORM, [], "kmu")).toEqual([]);
    expect(effectiveKanaele({ kanaele: null }, ["website", "linkedin"], "verein")).toEqual(["website"]);
    expect(effectiveKanaele({ kanaele: ["aushang", "google"] }, [], "kmu")).toEqual(["google"]);
  });
});

describe("kommunikationskonzept: Kanäle aus der Website-Prüfung", () => {
  const scan = (over: { netze?: string[]; newsletter?: boolean; gbp?: boolean | "wahrscheinlich" | "unbekannt" } = {}) => ({
    categories: [
      { id: "seo", title: "Website und SEO", weight: 25, score: 0.5, items: [] },
      { id: "social", title: "Social Media", weight: 20, score: 0.3, items: [], channels: (over.netze ?? []).map((network) => ({ network, label: network, linkedOnSite: true, freq: null, freqLabel: "Unbekannt", freqScore: 0.3 })) },
    ],
    facts: { hasNewsletter: over.newsletter ?? false, gbpFound: over.gbp ?? "unbekannt" },
  });
  // Nur die Felder, die kanaeleAusScan liest; die übrigen Felder des Ergebnisses braucht der Test nicht.
  type Scan = Parameters<typeof kanaeleAusScan>[0];

  it("findet die Website immer, dazu verlinkte Netze, die Newsletter-Anmeldung und das Google-Profil", () => {
    expect(kanaeleAusScan(scan() as unknown as Scan)).toEqual(["website"]);
    expect(kanaeleAusScan(scan({ netze: ["facebook", "instagram", "linkedin"], newsletter: true, gbp: true }) as unknown as Scan)).toEqual(["website", "google", "instagram", "facebook", "linkedin", "newsletter"]);
  });
  it("nimmt den Hinweis «wahrscheinlich» fürs Google-Profil mit, «unbekannt» und false nicht", () => {
    expect(kanaeleAusScan(scan({ gbp: "wahrscheinlich" }) as unknown as Scan)).toContain("google");
    expect(kanaeleAusScan(scan({ gbp: "unbekannt" }) as unknown as Scan)).not.toContain("google");
    expect(kanaeleAusScan(scan({ gbp: false }) as unknown as Scan)).not.toContain("google");
  });
  it("lässt Netze weg, die das Werkzeug nicht kennt (TikTok, YouTube), und findet ohne Ergebnis nichts", () => {
    expect(kanaeleAusScan(scan({ netze: ["tiktok", "youtube"] }) as unknown as Scan)).toEqual(["website"]);
    expect(kanaeleAusScan(null)).toEqual([]);
    expect(kanaeleAusScan(undefined)).toEqual([]);
  });
  it("vorbelegung vereinigt Profil und Scan, filtert auf den Typ und sagt, woher die Kanäle kommen", () => {
    const profil = { kanaele: [{ name: "WhatsApp-Gruppen" }, { name: "LinkedIn" }] };
    const ergebnis = scan({ netze: ["instagram"], newsletter: true }) as unknown as Scan;
    expect(vorbelegung(profil, ergebnis, "verein")).toEqual({ kanaele: ["website", "instagram", "whatsapp", "newsletter"], profil: true, scan: true });
    expect(vorbelegung(profil, ergebnis, "kmu")).toEqual({ kanaele: ["website", "instagram", "linkedin", "newsletter"], profil: true, scan: true });
    expect(vorbelegung({}, ergebnis, "kmu")).toEqual({ kanaele: ["website", "instagram", "newsletter"], profil: false, scan: true });
    expect(vorbelegung(profil, null, "verein")).toEqual({ kanaele: ["whatsapp"], profil: true, scan: false });
    expect(vorbelegung({}, null, "verein")).toEqual({ kanaele: [], profil: false, scan: false });
  });
  it("vorbelegungText nennt die Quellen oder bleibt leer", () => {
    expect(vorbelegungText({ kanaele: ["website"], profil: true, scan: true })).toBe("Vorbelegt aus deinem Firmenprofil und der Website-Prüfung. ");
    expect(vorbelegungText({ kanaele: ["website"], profil: true, scan: false })).toBe("Vorbelegt aus deinem Firmenprofil. ");
    expect(vorbelegungText({ kanaele: ["website"], profil: false, scan: true })).toBe("Vorbelegt aus der Website-Prüfung. ");
    expect(vorbelegungText({ kanaele: [], profil: false, scan: false })).toBe("");
    expect(SCAN_SLUG).toBe("digitaler-auftritt-check");
  });
});

describe("kommunikationskonzept: Anspruchsgruppen", () => {
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

describe("kommunikationskonzept: Liste der Anlässe", () => {
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

describe("kommunikationskonzept: inputProblem", () => {
  it("lässt eine vollständige Eingabe durch, auch mit leerem Budget, ohne Anlässe und mit 0 Stunden", () => {
    expect(inputProblem(fields, form())).toBeNull();
    expect(inputProblem(fields, form({ budget: "", wer: "", anlaesse: [{ id: "a1", name: "", monat: "" }], kanaele: [], stunden: "0" }))).toBeNull();
    expect(inputProblem(fields, form({ anlaesse: [], kanaele: null }))).toBeNull();
  });
  it("meldet zuerst den fehlenden Namen und nennt das Feld, beim Betrieb mit seinem Wort", () => {
    expect(inputProblem({ firma: "  ", organisationstyp: "verein" }, EMPTY_FORM)).toEqual({ message: "Gib den Namen deines Vereins an.", fieldId: FIELD_IDS.firma });
    expect(inputProblem({ firma: "  ", organisationstyp: "kmu" }, EMPTY_FORM)).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: FIELD_IDS.firma });
    expect(inputProblem({}, form())?.fieldId).toBe("vk-firma");
  });
  it("prüft den Zweck: mindestens 20, höchstens 400 Zeichen", () => {
    expect(inputProblem(fields, form({ zweck: "zu kurz" }))).toMatchObject({ fieldId: FIELD_IDS.zweck });
    expect(inputProblem(fields, form({ zweck: "x".repeat(19) }))?.message).toContain("mindestens 20 Zeichen");
    expect(inputProblem(fields, form({ zweck: "x".repeat(20) }))).toBeNull();
    expect(inputProblem(fields, form({ zweck: "x".repeat(401) }))?.message).toContain("höchstens 400 Zeichen");
  });
  it("prüft die Anzahl: ganze Zahl von 1 bis 100'000, beim Betrieb mit dem Wort Mitarbeitende", () => {
    for (const bad of ["", "0", "-5", "abc", "1.5", "100001"]) {
      expect(inputProblem(fields, form({ anzahl: bad })), bad).toMatchObject({ fieldId: FIELD_IDS.anzahl });
    }
    expect(inputProblem(fields, form({ anzahl: "abc" }))?.message).toBe("Gib die Zahl der Mitglieder an: eine ganze Zahl von 1 bis 100'000.");
    expect(inputProblem(kmuFields, kmuForm({ anzahl: "abc" }))?.message).toContain("Mitarbeitenden");
    expect(inputProblem(fields, form({ anzahl: "1" }))).toBeNull();
    expect(inputProblem(fields, form({ anzahl: "100000" }))).toBeNull();
  });
  it("verlangt eine Entwicklung und mindestens ein Ziel des Typs", () => {
    expect(inputProblem(fields, form({ entwicklung: "" }))).toEqual({ message: "Wähle, wie sich die Mitgliederzahl entwickelt.", fieldId: FIELD_IDS.entwicklung });
    expect(inputProblem(kmuFields, kmuForm({ entwicklung: "" }))?.message).toBe("Wähle, wie sich die Nachfrage entwickelt.");
    expect(inputProblem(fields, form({ ziele: [] }))).toEqual({ message: "Wähle mindestens ein Ziel.", fieldId: zielFieldId("mitglieder") });
    expect(inputProblem(kmuFields, kmuForm({ ziele: [] }))).toEqual({ message: "Wähle mindestens ein Ziel.", fieldId: zielFieldId("neukunden") });
    // Ein Ziel des anderen Typs zählt nicht: Wer vom Verein zum Betrieb wechselt, muss neu wählen.
    expect(inputProblem(kmuFields, kmuForm({ ziele: ["sponsoren"] }))?.fieldId).toBe(zielFieldId("neukunden"));
  });
  it("nennt beim Betrieb die Beschreibung statt des Vereinszwecks und passende Beispiele", () => {
    expect(inputProblem(kmuFields, kmuForm({ zweck: "kurz" }))?.message).toBe("Beschreib deinen Betrieb in mindestens 20 Zeichen, zum Beispiel was ihr anbietet und für wen.");
    expect(inputProblem(kmuFields, kmuForm({ zweck: "x".repeat(401) }))?.message).toContain("Beschreibung des Betriebs");
    const rows = [{ id: "a1", name: "TT", monat: "9" }];
    expect(inputProblem(kmuFields, kmuForm({ anlaesse: rows }))?.message).toContain("«Tag der offenen Tür» statt «TdoT»");
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
    expect(inputProblem(fields, form({ anzahl: "", ziele: [], stunden: "" }))?.fieldId).toBe(FIELD_IDS.anzahl);
    expect(inputProblem(fields, form({ ziele: [], stunden: "" }))?.fieldId).toBe(zielFieldId("mitglieder"));
    expect(inputProblem(fields, form({ stunden: "" }))?.fieldId).toBe(FIELD_IDS.stunden);
    expect(kanalFieldId("website")).toBe("vk-kanal-website");
  });
  it("hält jede Meldung ruhig: ohne Ausrufezeichen, ohne Sperrliste", () => {
    const rows = (name: string, monat: string) => [{ id: "a1", name, monat }];
    const forms = [
      EMPTY_FORM,
      form({ zweck: "x".repeat(401) }),
      form({ anzahl: "abc" }),
      form({ entwicklung: "" }),
      form({ ziele: [] }),
      form({ anlaesse: rows("Dorffest", "") }),
      form({ anlaesse: rows("", "6") }),
      form({ anlaesse: rows("GV", "3") }),
      form({ wer: "x".repeat(81) }),
      form({ stunden: "" }),
      form({ budget: "abc" }),
    ];
    for (const typ of ["verein", "kmu"] as const) {
      for (const f of forms) {
        const message = inputProblem({ firma: "FC Trogen", organisationstyp: typ }, f)?.message ?? "";
        expect(message).not.toBe("");
        expect(message).not.toMatch(/!|\bjetzt\b|—|ß/);
        expect(brandHits(message)).toEqual([]);
      }
    }
    expect(brandHits(inputProblem({}, EMPTY_FORM)?.message ?? "")).toEqual([]);
  });
});

describe("kommunikationskonzept: toInput", () => {
  it("macht aus Profil, Formular und Gruppen die Eingabe des Generators, geordnet und mit Kantonsnamen", () => {
    expect(toInput(fields, form(), gruppen)).toEqual({
      typ: "verein",
      betrieb: "FC Trogen",
      ort: "Trogen",
      kanton: "Appenzell Ausserrhoden",
      zweck: "Fussballclub mit Aktiven, Senioren und Juniorinnen und Junioren. Heimspiele auf dem Sportplatz in Trogen.",
      anzahl: 180,
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
    const i = toInput({ firma: "FC Trogen", organisationstyp: "verein" }, form({ budget: "", anlaesse: [{ id: "a1", name: "", monat: "" }], wer: "", stunden: "0" }));
    expect(i).toMatchObject({ typ: "verein", betrieb: "FC Trogen", ort: "", kanton: "", anlaesse: [], gruppen: [], budget: 0, wer: "", stundenProMonat: 0 });
    expect(toInput(fields, form())?.gruppen).toEqual([]);
  });
  it("nimmt die Kanäle aus dem dritten Wert, sonst aus dem Formular, und leer, wenn nichts gewählt ist", () => {
    expect(toInput(fields, form(), [], ["aushang", "website"])?.kanaele).toEqual(["website", "aushang"]);
    expect(toInput(fields, form({ kanaele: ["aushang"] }))?.kanaele).toEqual(["aushang"]);
    expect(toInput(fields, form({ kanaele: null }))?.kanaele).toEqual([]);
  });
  it("macht aus einem Betrieb die Eingabe mit Typ «kmu», seinen Zielen und Kanälen; Fremdes fällt weg", () => {
    const i = toInput(kmuFields, kmuForm(), [], ["linkedin", "aushang", "google", "website"]);
    expect(i).toMatchObject({ typ: "kmu", betrieb: "Malerei Keller", ort: "Gossau", kanton: "St. Gallen", anzahl: 8, entwicklung: "stabil", ziele: ["neukunden", "fachkraefte"] });
    expect(i?.kanaele).toEqual(["website", "google", "linkedin"]);
    // Ziele des Vereins in einem Betriebsformular fallen weg; bleibt keines übrig, gibt es keine Eingabe.
    expect(toInput(kmuFields, kmuForm({ ziele: ["sponsoren", "neukunden"] }))?.ziele).toEqual(["neukunden"]);
    expect(toInput(kmuFields, kmuForm({ ziele: ["sponsoren"] }))).toBeNull();
    expect(toInput(fields, form({ ziele: ["neukunden"] }))).toBeNull();
  });
  it("bereinigt Leerraum und Tausendertrenner und kürzt auf die Grenzen", () => {
    const i = toInput({ firma: "  FC   Trogen  ", ort: " Trogen ", kanton: "AR", organisationstyp: "verein" }, form({ anzahl: " 1'200 ", wer: "  Zwei   Personen ", zweck: `  ${"x".repeat(450)}  ` }));
    expect(i?.betrieb).toBe("FC Trogen");
    expect(i?.ort).toBe("Trogen");
    expect(i?.anzahl).toBe(1200);
    expect(i?.wer).toBe("Zwei Personen");
    expect(i?.zweck).toHaveLength(LIMITS.zweck);
  });
  it("gibt null, wenn etwas fehlt oder ausserhalb der Grenzen liegt", () => {
    expect(toInput({}, form())).toBeNull();
    expect(toInput(fields, form({ zweck: "kurz" }))).toBeNull();
    expect(toInput(fields, form({ anzahl: "" }))).toBeNull();
    expect(toInput(fields, form({ anzahl: "0" }))).toBeNull();
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
    expect(f.anzahl).toBe("180");
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

describe("kommunikationskonzept: Texte fürs CRM", () => {
  it("betriebZeile fügt Ort und Kanton an, wenn sie da sind", () => {
    expect(betriebZeile({ betrieb: "FC Trogen", ort: "Trogen", kanton: "Appenzell Ausserrhoden" })).toBe("FC Trogen, Trogen (Appenzell Ausserrhoden)");
    expect(betriebZeile({ betrieb: "FC Trogen", ort: "", kanton: "" })).toBe("FC Trogen");
    expect(betriebZeile({ betrieb: "FC Trogen", ort: "", kanton: "Thurgau" })).toBe("FC Trogen (Thurgau)");
  });
  it("anzahlZeile sagt «Zahl» beim Verein und «Nachfrage» beim Betrieb", () => {
    expect(anzahlZeile({ typ: "verein", anzahl: 180, entwicklung: "waechst" })).toBe("180, Zahl wächst");
    expect(anzahlZeile({ typ: "kmu", anzahl: 8, entwicklung: "stabil" })).toBe("8, Nachfrage stabil");
    expect(anzahlZeile({ typ: "verein", anzahl: 1200, entwicklung: "schrumpft" })).toBe("1'200, Zahl schrumpft");
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
  it("eingabeText nennt beim Betrieb Betrieb, Mitarbeitende und Nachfrage", () => {
    const lines = eingabeText(kmuInput()).split("\n");
    expect(lines[0]).toBe("Betrieb: Malerei Keller, Gossau (St. Gallen)");
    expect(lines).toContain("Mitarbeitende: 8, Nachfrage stabil");
    expect(lines).toContain("Ziele: Neue Kundschaft gewinnen, Fachkräfte und Lernende finden");
    expect(lines).toContain("Kanäle heute: Website, Google Business Profil, Instagram, Facebook");
    expect(lines.join("\n")).not.toMatch(/Verein|Mitglied/);
  });
  it("eingabeText sagt es offen, wenn Anlässe, Kanäle, wer und Budget fehlen, und lässt die Gruppenzeile weg", () => {
    const i = toInput({ firma: "FC Trogen", organisationstyp: "verein" }, form({ anlaesse: [], kanaele: [], wer: "", budget: "" }))!;
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

describe("kommunikationskonzept: Dokument", () => {
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
    const ohne = toInput({ firma: "FC Trogen", organisationstyp: "verein" }, form({ anlaesse: [], budget: "", wer: "" }))!;
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

describe("kommunikationskonzept: Dokument eines Betriebs", () => {
  const kmuOutput = (): KonzeptOutput => ({
    ausgangslage:
      "Die Malerei Keller hat 8 Mitarbeitende, und die Nachfrage ist stabil. Heute laufen die Website, das Google Business Profil, Instagram und Facebook. Die Inhaberin und eine Mitarbeiterin im Büro haben dafür 8 Stunden pro Monat.",
    ziele: [
      { ziel: "Neue Privatkundschaft in Gossau und Umgebung gewinnen", messgroesse: "Anfragen über die Website" },
      { ziel: "Lernende für die nächste Lehrstelle finden", messgroesse: "Bewerbungen auf offene Lehrstellen" },
    ],
    zielgruppen: [
      { name: "Privatkundschaft", erwartung: "Sehen Referenzen und wissen, wie sie eine Offerte anfragen." },
      { name: "Verwaltungen", erwartung: "Erwarten verlässliche Termine und klare Ansprechpersonen." },
    ],
    kernbotschaft: "Die Malerei Keller streicht Fassaden und Räume in Gossau sauber, pünktlich und mit klaren Absprachen.",
    kanalplan: [
      { kanal: "Website", zweck: "Referenzen zeigen und Offerten anfragen lassen.", rhythmus: "bei jedem Projekt", verantwortlich: "Inhaberin" },
      { kanal: "Google Business Profil", zweck: "Öffnungszeiten, Bilder und Bewertungen pflegen.", rhythmus: "monatlich", verantwortlich: "" },
    ],
    jahreskalender: [{ monat: 9, anlass: "Tag der offenen Tür", kommunikation: "Einladung auf der Website, im Google-Profil und auf Instagram, danach Bilder." }],
    rollen: [{ rolle: "Inhaberin", aufgaben: "Gibt die Beiträge frei und beantwortet Anfragen.", stundenProMonat: 4 }],
    erfolgsmessung: ["Zahl der Anfragen über die Website", "Zahl der Bewerbungen auf offene Lehrstellen"],
  });

  it("schreibt Untertitel, Facts und Schlusssatz im Wortlaut des Betriebs", () => {
    const doc = toDocument(kmuOutput(), kmuInput());
    expect(doc.subtitle).toBe("Malerei Keller, Konzept für die Jahresplanung");
    expect(doc.filename).toBe("kommunikationskonzept-malerei-keller");
    const facts = doc.blocks[0];
    if (facts.type !== "facts") throw new Error("Facts erwartet");
    expect(facts.items.map((f) => f.label)).toEqual(["Betrieb", "Mitarbeitende", "Zeit für die Kommunikation", "Budget pro Jahr"]);
    expect(facts.items[1].value).toBe("8, Nachfrage stabil");
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text.startsWith("Gemessen wird nur, was der Betrieb selbst zählt"))).toBe(true);
  });
  it("erwähnt in Dokument und Markdown weder Verein noch Mitglieder noch Generalversammlung", () => {
    const md = reportMarkdown(kmuOutput(), kmuInput());
    expect(md).not.toMatch(/Verein|Mitglied|Vorstand|Generalversammlung/);
    expect(md).toContain("Konzept für die Jahresplanung");
    expect(md).not.toMatch(/undefined|NaN|\[object/);
  });
  it("nennt beim Verein weiter die Generalversammlung", () => {
    expect(toDocument(output(), input()).subtitle).toContain("Vorlage für die Generalversammlung");
  });
});

describe("kommunikationskonzept: Hinweis auf Alperna", () => {
  const plan = (...kanaele: string[]) => ({ kanalplan: kanaele.map((kanal) => ({ kanal, zweck: "Hinweise an die Kundschaft.", rhythmus: "wöchentlich", verantwortlich: "" })) });

  it("zählt Instagram, Facebook und LinkedIn im Kanalplan, auch als Vorschlag mit «(neu)»", () => {
    expect(socialKanaele(plan("Website", "Instagram", "Facebook (neu)", "LinkedIn", "Newsletter oder Mail"))).toBe(3);
    expect(socialKanaele(plan("Website", "Google Business Profil"))).toBe(0);
    expect(socialKanaele(plan())).toBe(0);
  });
  it("nennt den Baustein «Social Media», wenn mehrere Kanäle bei knapper Zeit geplant sind", () => {
    expect(pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 6, budget: 0 })).toEqual({
      baustein: "Social Media",
      satz: "Dein Konzept plant 2 Social-Media-Kanäle bei 6 Stunden im Monat.",
    });
    expect(pitchFor(plan("Instagram", "Facebook", "LinkedIn"), { stundenProMonat: 1, budget: 0 })?.satz).toBe("Dein Konzept plant 3 Social-Media-Kanäle bei 1 Stunde im Monat.");
    expect(pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 0, budget: 0 })?.satz).toBe("Dein Konzept plant 2 Social-Media-Kanäle ohne eingeplante Stunden.");
  });
  it("hält die Grenze bei vier Stunden je Kanal: darunter knapp, ab dort nur mit Budget ein Hinweis", () => {
    expect(KNAPP_STUNDEN_JE_KANAL).toBe(4);
    expect(pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 7, budget: 0 })).not.toBeNull();
    expect(pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 8, budget: 0 })).toBeNull();
    expect(pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 8, budget: 2000 })).toEqual({
      baustein: "Social Media",
      satz: "Dein Konzept plant 2 Social-Media-Kanäle und CHF 2'000.- Budget im Jahr.",
    });
  });
  it("sagt nichts bei weniger als zwei Social-Media-Kanälen, egal wie knapp Zeit und Budget sind", () => {
    expect(pitchFor(plan("Website", "Instagram"), { stundenProMonat: 0, budget: 5000 })).toBeNull();
    expect(pitchFor(plan("Website", "Google Business Profil"), { stundenProMonat: 1, budget: 0 })).toBeNull();
    expect(pitchFor(plan(), { stundenProMonat: 0, budget: 0 })).toBeNull();
  });
  it("nennt nie einen Preis und bleibt ruhig", () => {
    for (const satz of [
      pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 2, budget: 0 })?.satz,
      pitchFor(plan("Instagram", "Facebook"), { stundenProMonat: 20, budget: 1500 })?.satz,
    ]) {
      expect(satz).toBeDefined();
      expect(satz).not.toMatch(/!|—|ß|ab CHF/);
      expect(brandHits(satz ?? "")).toEqual([]);
    }
  });
});

describe("kommunikationskonzept: Profil schreiben", () => {
  it("ändert die Rechtsform nie: Der Typ kommt aus dem Profil, das Werkzeug schreibt ihn nicht", () => {
    expect(profilePatch({})).toEqual({});
    expect(profilePatch({ organisationstyp: "kmu" })).toEqual({});
    expect(profilePatch({ organisationstyp: "verein" })).toEqual({});
    expect(profilePatch({}, ["website"])).not.toHaveProperty("organisationstyp");
  });
  it("schreibt die Kanäle als Liste mit Namen, nur wenn das Feld leer ist", () => {
    expect(profilePatch({ organisationstyp: "verein" }, ["instagram", "website"])).toEqual({ kanaele: [{ name: "Website" }, { name: "Instagram" }] });
    expect(profilePatch({ organisationstyp: "verein", kanaele: [{ name: "Facebook" }] }, ["instagram"])).toEqual({});
    expect(profilePatch({ organisationstyp: "verein", kanaele: [] }, ["aushang"])).toEqual({ kanaele: [{ name: "Aushang" }] });
  });
  it("schreibt die Kanäle eines Betriebs mit ihren Namen, und was nicht zum Typ passt, nicht", () => {
    expect(profilePatch({ organisationstyp: "kmu" }, ["google", "linkedin", "website"])).toEqual({ kanaele: [{ name: "Website" }, { name: "Google Business Profil" }, { name: "LinkedIn" }] });
    expect(profilePatch({ organisationstyp: "kmu" }, ["aushang"])).toEqual({});
    expect(profilePatch({ organisationstyp: "verein" }, ["linkedin"])).toEqual({});
  });
  it("schreibt keine Kanäle, wenn die Person keine gewählt hat", () => {
    expect(profilePatch({}, [])).toEqual({});
    expect(profilePatch({ organisationstyp: "verein" }, [])).toEqual({});
  });
  it("die Kanäle lesen sich im Formular wieder zurück", () => {
    const patch = profilePatch({ organisationstyp: "verein" }, ["whatsapp", "gemeindeblatt"]);
    expect(patch).toEqual({ kanaele: [{ name: "WhatsApp-Gruppen" }, { name: "Gemeindeblatt oder Anzeiger" }] });
    expect(kanaeleAusProfil({ kanaele: patch.kanaele })).toEqual(["whatsapp", "gemeindeblatt"]);
    const kmu = profilePatch({ organisationstyp: "kmu" }, ["google", "linkedin"]);
    expect(kanaeleAusProfil({ kanaele: kmu.kanaele })).toEqual(["google", "linkedin"]);
  });
});

describe("kommunikationskonzept: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten und falscher Version den leeren Stand", () => {
    for (const raw of [null, undefined, 5, "text", [], { v: 2, input: input(), output: output() }, {}]) expect(parseState(raw)).toEqual(EMPTY_STATE);
  });
  it("gibt den leeren Stand, wenn die Eingabe ungültig ist; ein Entwurf ohne Eingabe fällt weg", () => {
    expect(parseState({ v: 1, input: { betrieb: "FC Trogen" }, output: output() })).toEqual(EMPTY_STATE);
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
