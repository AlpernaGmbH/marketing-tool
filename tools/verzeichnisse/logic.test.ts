import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { parseToolMarkdown } from "@/lib/content";
import { checkToolContent } from "@/lib/content-rules";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import { isToolDone } from "@/lib/progress";
import {
  ANDERES_STANDARD,
  ART_LABEL,
  BEDINGUNGEN_NOTE,
  DATA,
  EMPTY_FUND,
  EMPTY_INPUT,
  EMPTY_STATE,
  FREI_ANDERES,
  FREI_GEMEINDE,
  FREI_VERBAND,
  KEINE_LISTE_NOTE,
  KEIN_ABRUF_NOTE,
  KOSTEN_JA,
  KOSTEN_NEIN,
  KOSTEN_UNKLAR,
  MSG,
  RICHTWERT_NOTE,
  STATUS_OPTIONS,
  ZUSATZ_BRANCHE,
  alleAbweichungen,
  aufgabeFor,
  auswerten,
  buildEintrag,
  compareEntry,
  eingabeText,
  eintragFelder,
  eintragText,
  formatPhoneCH,
  istGastgewerbe,
  itemsFor,
  kostenText,
  loadData,
  normalizePhoneCH,
  normalizeWebsite,
  parseState,
  quellenzeile,
  reportMarkdown,
  summaryText,
  telefonProblem,
  toDocument,
  validate,
  type Abweichung,
  type Eintrag,
  type Fund,
  type Stamm,
  type VzData,
  type VzInput,
  type VzState,
} from "./logic";
import config from "./tool.config";

// ---- Beispiele ---------------------------------------------------------------------------------

const KELLER: Stamm = { firma: "Malerei Keller", ort: "Gossau", website: "malerei-keller.ch", branche: "Malerei" };
const KELLER_INPUT: VzInput = {
  ...EMPTY_INPUT,
  strasse: "Wilerstrasse 24",
  plz: "9200",
  telefon: "071 123 45 67",
  oeffnungszeiten: "Mo bis Fr 7.30 bis 17.00 Uhr",
  beschreibung: "Malerarbeiten für Haus und Wohnung in Gossau und Umgebung.",
};
const eintrag = (): Eintrag => {
  const e = buildEintrag(KELLER, KELLER_INPUT);
  if (!e) throw new Error("Beispiel ist ungültig");
  return e;
};
const found = (f: Partial<Fund>): Fund => ({ ...EMPTY_FUND, ...f });
const arten = (list: Abweichung[]) => list.map((a) => a.art);

const DATA_PATH = path.join(process.cwd(), "data", "verzeichnisse.json");
const RAW = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as { meta: Record<string, string>; eintraege: Record<string, unknown>[] };

// ---- Datensatz ---------------------------------------------------------------------------------

describe("verzeichnisse: Datensatz data/verzeichnisse.json", () => {
  it("hat eine vollständige meta mit https-Adresse und Datum", () => {
    expect(RAW.meta.source.length).toBeGreaterThan(20);
    expect(RAW.meta.url.startsWith("https://")).toBe(true);
    expect(RAW.meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(RAW.meta.asOf).getTime())).toBe(false);
  });

  it("hat nur https-Adressen", () => {
    for (const e of RAW.eintraege) {
      for (const key of ["url", "eintragUrl", "quelle", "quelleBestaetigung"]) {
        const v = e[key];
        if (v === undefined || v === null) continue;
        expect(String(v).startsWith("https://"), `${e.id} ${key}`).toBe(true);
      }
    }
  });

  it("nennt je Eintrag eine Quelle und ein Prüfdatum", () => {
    expect(RAW.eintraege.length).toBeGreaterThanOrEqual(4);
    for (const e of RAW.eintraege) {
      expect(String(e.quelle).startsWith("https://"), `${e.id} quelle`).toBe(true);
      expect(String(e.geprueft), `${e.id} geprueft`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("hat einmalige ids", () => {
    const ids = RAW.eintraege.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(FREI_GEMEINDE);
    expect(ids).not.toContain(FREI_VERBAND);
    expect(ids).not.toContain(FREI_ANDERES);
  });

  it("hat kein «kostenlos: true» ohne Quelle und keine Bestätigung ohne Quelle", () => {
    for (const e of RAW.eintraege) {
      if (e.kostenlos === true) expect(typeof e.quelle === "string" && e.quelle.length > 10, `${e.id}`).toBe(true);
      if (e.bestaetigung) expect(typeof e.quelle === "string" && e.quelle.length > 10, `${e.id}`).toBe(true);
      expect([true, false, null], `${e.id}`).toContain(e.kostenlos);
    }
  });

  it("wird vom Schema gelesen und enthält Tripadvisor als Bewertungsverzeichnis mit Branchen", () => {
    expect(DATA).not.toBeNull();
    const ta = DATA?.eintraege.find((e) => e.id === "tripadvisor");
    expect(ta?.typ).toBe("bewertung");
    expect(ta?.branchen?.length).toBeGreaterThan(0);
    expect(DATA?.eintraege.map((e) => e.typ)).toContain("karte");
    expect(DATA?.eintraege.map((e) => e.typ)).toContain("telefonbuch");
  });

  it("enthält keine Zahlen zu Preis oder Reichweite und nichts von der Sperrliste", () => {
    for (const e of RAW.eintraege) {
      const texts = [e.name, e.hinweis, e.bestaetigung].filter((t): t is string => typeof t === "string");
      for (const t of texts) {
        expect(t, `${e.id}: ${t}`).not.toMatch(/\d|CHF|%|Million|Nutzer|Ranking|Reichweite/i);
        expect(brandHits(t).filter((h) => h.level === "hart")).toEqual([]);
        expect(t).not.toMatch(/!|—/);
      }
    }
  });

  it("lehnt kaputte Datensätze ab", () => {
    const ok = RAW as unknown as VzData;
    expect(loadData(ok)).not.toBeNull();
    expect(loadData(null)).toBeNull();
    expect(loadData({})).toBeNull();
    expect(loadData({ ...ok, meta: { ...ok.meta, url: "http://example.ch" } })).toBeNull();
    expect(loadData({ ...ok, meta: { ...ok.meta, asOf: "heute" } })).toBeNull();
    expect(loadData({ ...ok, meta: { source: ok.meta.source, asOf: ok.meta.asOf } })).toBeNull();
    expect(loadData({ ...ok, eintraege: [] })).toBeNull();
    expect(loadData({ ...ok, eintraege: [ok.eintraege[0], ok.eintraege[0]] })).toBeNull();
    expect(loadData({ ...ok, eintraege: [{ ...ok.eintraege[0], quelle: undefined }] })).toBeNull();
    expect(loadData({ ...ok, eintraege: [{ ...ok.eintraege[0], url: "http://x.ch" }] })).toBeNull();
    expect(loadData({ ...ok, eintraege: [{ ...ok.eintraege[0], typ: "bewertung", branchen: undefined }] })).toBeNull();
  });
});

// ---- Telefon -----------------------------------------------------------------------------------

describe("verzeichnisse: Telefon", () => {
  it("normalisiert Festnetz und Mobil", () => {
    expect(normalizePhoneCH("071 123 45 67")).toBe("41711234567");
    expect(normalizePhoneCH("079 123 45 67")).toBe("41791234567");
  });

  it("liest +41, 0041, Bindestriche, Schrägstriche und (0)", () => {
    for (const s of ["+41 71 123 45 67", "0041 71 123 45 67", "071-123-45-67", "071/123 45 67", "+41 (0) 71 123 45 67", " 0711234567 ", "+41711234567"]) {
      expect(normalizePhoneCH(s), s).toBe("41711234567");
    }
  });

  it("lehnt ungültige Nummern ab", () => {
    for (const s of ["", "123", "abc", "+49 30 1234567", "071 123 45", "071 123 45 678", "0"]) {
      expect(normalizePhoneCH(s), s).toBeNull();
    }
  });

  it("zeigt beide Schreibweisen", () => {
    expect(formatPhoneCH("0711234567")).toEqual({ international: "+41 71 123 45 67", national: "071 123 45 67" });
    expect(formatPhoneCH("0041791234567")).toEqual({ international: "+41 79 123 45 67", national: "079 123 45 67" });
    expect(formatPhoneCH("nein")).toBeNull();
  });

  it("meldet leere, falsche und zu lange oder kurze Nummern", () => {
    expect(telefonProblem("")).toBe(MSG.telefonLeer);
    expect(telefonProblem("   ")).toBe(MSG.telefonLeer);
    expect(telefonProblem("abc")).toBe(MSG.telefonCH);
    expect(telefonProblem("+49 30 1234567")).toBe(MSG.telefonCH);
    expect(telefonProblem("071 123 45")).toBe(MSG.telefonLaenge);
    expect(telefonProblem("071 123 45 67")).toBeNull();
  });
});

// ---- Website, Eingaben, einheitlicher Eintrag --------------------------------------------------

describe("verzeichnisse: Website", () => {
  it("schreibt https:// ohne Schrägstrich am Ende", () => {
    expect(normalizeWebsite("malerei-keller.ch")).toBe("https://malerei-keller.ch");
    expect(normalizeWebsite("http://www.Malerei-Keller.ch/")).toBe("https://www.malerei-keller.ch");
    expect(normalizeWebsite("https://malerei-keller.ch/leistungen/")).toBe("https://malerei-keller.ch/leistungen");
    expect(normalizeWebsite("  https://malerei-keller.ch  ")).toBe("https://malerei-keller.ch");
  });

  it("lässt eine leere Website leer und lehnt Unsinn ab", () => {
    expect(normalizeWebsite("")).toBe("");
    expect(normalizeWebsite("   ")).toBe("");
    expect(normalizeWebsite("kein link")).toBeNull();
    expect(normalizeWebsite("malerei")).toBeNull();
    expect(normalizeWebsite("https://")).toBeNull();
  });
});

describe("verzeichnisse: validate und buildEintrag", () => {
  it("baut den einheitlichen Eintrag im Format der Verzeichnisse", () => {
    const e = eintrag();
    expect(e.name).toBe("Malerei Keller");
    expect(e.adresse).toBe("Wilerstrasse 24, 9200 Gossau");
    expect(e.telefon).toBe("+41 71 123 45 67");
    expect(e.telefonNational).toBe("071 123 45 67");
    expect(e.website).toBe("https://malerei-keller.ch");
    expect(e.oeffnungszeiten).toBe("Mo bis Fr 7.30 bis 17.00 Uhr");
  });

  it("nimmt die Firma wörtlich und schreibt «ß» in der Strasse als «ss»", () => {
    const e = buildEintrag({ ...KELLER, firma: "  Keller   &  Söhne AG " }, { ...KELLER_INPUT, strasse: "Wilerstraße  24" });
    expect(e?.name).toBe("Keller & Söhne AG");
    expect(e?.adresse).toBe("Wilerstrasse 24, 9200 Gossau");
  });

  it("lässt die Website weg, wenn keine angegeben ist", () => {
    const e = buildEintrag({ ...KELLER, website: "" }, KELLER_INPUT);
    expect(e?.website).toBe("");
    expect(eintragFelder(e!).map((f) => f.key)).not.toContain("website");
  });

  it("meldet die PLZ: vier Ziffern, keine Buchstaben, nicht mit 0 beginnend", () => {
    for (const plz of ["", "920", "92000", "92a0", "0123", "ABCD"]) {
      expect(validate(KELLER, { ...KELLER_INPUT, plz }).map((p) => p.feld), plz).toEqual(["plz"]);
    }
    expect(validate(KELLER, { ...KELLER_INPUT, plz: " 9200 " })).toEqual([]);
  });

  it("meldet Strasse, Telefon, Firma, Ort und Website", () => {
    expect(validate(KELLER, { ...KELLER_INPUT, strasse: "ab" }).map((p) => p.feld)).toEqual(["strasse"]);
    expect(validate(KELLER, { ...KELLER_INPUT, strasse: "x".repeat(81) }).map((p) => p.feld)).toEqual(["strasse"]);
    expect(validate(KELLER, { ...KELLER_INPUT, strasse: "Weg" })).toEqual([]);
    expect(validate(KELLER, { ...KELLER_INPUT, telefon: "abc" })).toEqual([{ feld: "telefon", text: MSG.telefonCH }]);
    expect(validate(KELLER, { ...KELLER_INPUT, telefon: "12" })).toEqual([{ feld: "telefon", text: MSG.telefonLaenge }]);
    expect(validate({ ...KELLER, firma: " " }, KELLER_INPUT)).toEqual([{ feld: "firma", text: MSG.firma }]);
    expect(validate({ ...KELLER, firma: "" }, KELLER_INPUT, true)).toEqual([{ feld: "firma", text: MSG.firmaVerein }]);
    expect(validate({ ...KELLER, ort: "" }, KELLER_INPUT)).toEqual([{ feld: "ort", text: MSG.ort }]);
    expect(validate({ ...KELLER, website: "kein link" }, KELLER_INPUT)).toEqual([{ feld: "website", text: MSG.website }]);
  });

  it("meldet zu lange freiwillige Felder und alle Fehler in Formularreihenfolge", () => {
    expect(validate(KELLER, { ...KELLER_INPUT, oeffnungszeiten: "x".repeat(201) }).map((p) => p.feld)).toEqual(["oeffnungszeiten"]);
    expect(validate(KELLER, { ...KELLER_INPUT, beschreibung: "x".repeat(301) }).map((p) => p.feld)).toEqual(["beschreibung"]);
    expect(validate(KELLER, { ...KELLER_INPUT, oeffnungszeiten: "x".repeat(200), beschreibung: "x".repeat(300) })).toEqual([]);
    const all = validate({ firma: "", ort: "", website: "x y", branche: "" }, EMPTY_INPUT).map((p) => p.feld);
    expect(all).toEqual(["firma", "ort", "website", "strasse", "plz", "telefon"]);
  });

  it("baut bei ungültigen Angaben keinen Eintrag", () => {
    expect(buildEintrag(KELLER, { ...KELLER_INPUT, plz: "1" })).toBeNull();
    expect(buildEintrag(KELLER, EMPTY_INPUT)).toBeNull();
  });

  it("liefert die Kopiervorlage ohne leere freiwillige Felder", () => {
    const e = buildEintrag(KELLER, { ...KELLER_INPUT, oeffnungszeiten: "", beschreibung: "" })!;
    expect(eintragFelder(e).map((f) => f.key)).toEqual(["name", "adresse", "telefon", "telefonNational", "website"]);
    expect(eintragText(e)).toBe(
      ["Name: Malerei Keller", "Adresse: Wilerstrasse 24, 9200 Gossau", "Telefon: +41 71 123 45 67", "Website: https://malerei-keller.ch"].join("\n"),
    );
  });
});

// ---- Vergleich ---------------------------------------------------------------------------------

describe("verzeichnisse: compareEntry", () => {
  const m = eintrag();
  const gleich = found({ name: "Malerei Keller", adresse: "Wilerstrasse 24, 9200 Gossau", telefon: "+41 71 123 45 67" });

  it("findet nichts, wenn alles gleich geschrieben ist, und überspringt leere Felder", () => {
    expect(compareEntry(m, gleich)).toEqual([]);
    expect(compareEntry(m, EMPTY_FUND)).toEqual([]);
    expect(compareEntry(m, found({ name: "  ", adresse: "", telefon: " " }))).toEqual([]);
  });

  it("str-abkuerzung: «Str.» und «str» statt «strasse»", () => {
    for (const adresse of ["Wilerstr. 24, 9200 Gossau", "Wilerstr 24, 9200 Gossau", "Wilerstr.24, 9200 Gossau"]) {
      const r = compareEntry(m, found({ adresse }));
      expect(arten(r), adresse).toEqual(["str-abkuerzung"]);
      expect(r[0]).toMatchObject({ feld: "adresse", stufe: "hinweis", dort: adresse, soll: "Wilerstrasse 24, 9200 Gossau" });
    }
  });

  it("str-abkuerzung: nicht bei ausgeschriebener Strasse oder Wörtern mit «str»", () => {
    expect(arten(compareEntry(m, found({ adresse: "Wilerstrasse 24, 9200 Gossau" })))).toEqual([]);
    const andere = buildEintrag(KELLER, { ...KELLER_INPUT, strasse: "Industriestrasse 5" })!;
    expect(arten(compareEntry(andere, found({ adresse: "Industriestrasse 5, 9200 Gossau" })))).toEqual([]);
    expect(arten(compareEntry(andere, found({ adresse: "Industriestr. 5, 9200 Gossau" })))).toEqual(["str-abkuerzung"]);
  });

  it("str-abkuerzung: auch, wenn der einheitliche Eintrag die Abkürzung trägt", () => {
    const abk = buildEintrag(KELLER, { ...KELLER_INPUT, strasse: "Wilerstr. 24" })!;
    const r = compareEntry(abk, found({ adresse: "Wilerstrasse 24, 9200 Gossau" }));
    expect(arten(r)).toEqual(["str-abkuerzung"]);
  });

  it("ss-eszett: «ß» in Adresse und Name, nicht bei «ss»", () => {
    const a = compareEntry(m, found({ adresse: "Wilerstraße 24, 9200 Gossau" }));
    expect(arten(a)).toEqual(["ss-eszett"]);
    const n = buildEintrag({ ...KELLER, firma: "Strassburger Weine" }, KELLER_INPUT)!;
    expect(arten(compareEntry(n, found({ name: "Straßburger Weine" })))).toEqual(["ss-eszett"]);
    expect(arten(compareEntry(n, found({ name: "Strassburger Weine" })))).toEqual([]);
  });

  it("telefon-format: dieselbe Nummer anders geschrieben, nicht bei der Zielschreibweise", () => {
    for (const telefon of ["071 123 45 67", "0711234567", "0041 71 123 45 67", "+41711234567", "071-123-45-67"]) {
      const r = compareEntry(m, found({ telefon }));
      expect(arten(r), telefon).toEqual(["telefon-format"]);
      expect(r[0]).toMatchObject({ feld: "telefon", stufe: "hinweis", soll: "+41 71 123 45 67" });
    }
    expect(compareEntry(m, found({ telefon: "+41 71 123 45 67" }))).toEqual([]);
  });

  it("telefon: eine andere Nummer ist eine Warnung, auch eine unlesbare", () => {
    const a = compareEntry(m, found({ telefon: "071 999 99 99" }));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ art: "sonstige", stufe: "warnung", text: "Die Nummer weicht ab." });
    const b = compareEntry(m, found({ telefon: "+49 30 1234567" }));
    expect(b[0]).toMatchObject({ art: "sonstige", stufe: "warnung" });
    const c = compareEntry(m, found({ telefon: "abc" }));
    expect(c[0].text).toBe("Die Nummer lässt sich nicht als Schweizer Nummer lesen.");
  });

  it("name-zusatz: Rechtsform dort, Zusatz dort, Wort fehlt dort; kein Fehler, nur Hinweis", () => {
    const a = compareEntry(m, found({ name: "Malerei Keller GmbH" }));
    expect(arten(a)).toEqual(["name-zusatz"]);
    expect(a[0].stufe).toBe("hinweis");
    expect(a[0].text).toContain("Rechtsform «GmbH»");
    expect(a[0].text).toContain("kein Fehler");
    const b = compareEntry(m, found({ name: "Malerei Keller Gossau" }));
    expect(b[0].text).toContain("zusätzlich «Gossau»");
    expect(b[0].text).not.toContain("Rechtsform");
    const mitForm = buildEintrag({ ...KELLER, firma: "Malerei Keller GmbH" }, KELLER_INPUT)!;
    const c = compareEntry(mitForm, found({ name: "Malerei Keller" }));
    expect(arten(c)).toEqual(["name-zusatz"]);
    expect(c[0].text).toContain("Dort fehlt «GmbH»");
    expect(arten(compareEntry(mitForm, found({ name: "Malerei Keller GmbH" })))).toEqual([]);
  });

  it("name-zusatz: zu viele Zusatzwörter sind eine Abweichung", () => {
    const r = compareEntry(m, found({ name: "Malerei Keller Familie Hans Peter Keller Gossau" }));
    expect(r[0]).toMatchObject({ art: "sonstige", stufe: "warnung" });
  });

  it("plz-fehlt: Adresse ohne PLZ, nicht mit PLZ", () => {
    const r = compareEntry(m, found({ adresse: "Wilerstrasse 24, Gossau" }));
    expect(arten(r)).toEqual(["plz-fehlt"]);
    expect(r[0].stufe).toBe("hinweis");
    expect(r[0].text).toContain("9200");
    expect(arten(compareEntry(m, found({ adresse: "Wilerstrasse 24, 9200 Gossau" })))).toEqual([]);
  });

  it("plz: eine andere PLZ ist eine Warnung", () => {
    const r = compareEntry(m, found({ adresse: "Wilerstrasse 24, 9201 Gossau" }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ art: "sonstige", stufe: "warnung" });
    expect(r[0].text).toContain("dort 9201, bei dir 9200");
  });

  it("gross-klein: Name und Adresse, nicht bei gleicher Schreibweise", () => {
    const n = compareEntry(m, found({ name: "MALEREI KELLER" }));
    expect(arten(n)).toEqual(["gross-klein"]);
    expect(n[0].stufe).toBe("hinweis");
    expect(arten(compareEntry(m, found({ name: "malerei keller" })))).toEqual(["gross-klein"]);
    expect(arten(compareEntry(m, found({ adresse: "wilerstrasse 24, 9200 gossau" })))).toEqual(["gross-klein"]);
    expect(arten(compareEntry(m, found({ name: "Malerei Keller" })))).toEqual([]);
  });

  it("sonstige: ein ganz anderer Name oder eine andere Hausnummer ist eine Warnung", () => {
    const n = compareEntry(m, found({ name: "Gipserei Meier" }));
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ feld: "name", art: "sonstige", stufe: "warnung", dort: "Gipserei Meier", soll: "Malerei Keller" });
    const a = compareEntry(m, found({ adresse: "Wilerstrasse 42, 9200 Gossau" }));
    expect(a[0]).toMatchObject({ feld: "adresse", art: "sonstige", stufe: "warnung" });
    const b = compareEntry(m, found({ adresse: "Bahnhofstrasse 24, 9200 Gossau" }));
    expect(b[0]).toMatchObject({ art: "sonstige", stufe: "warnung" });
  });

  it("sonstige: gleich nach der Normalisierung ist ein Hinweis, keine Warnung", () => {
    const n = compareEntry(m, found({ name: "Malerei-Keller" }));
    expect(n[0]).toMatchObject({ art: "sonstige", stufe: "hinweis" });
    const mueller = buildEintrag({ ...KELLER, firma: "Müller Gartenbau" }, KELLER_INPUT)!;
    expect(compareEntry(mueller, found({ name: "Mueller Gartenbau" }))[0]).toMatchObject({ art: "sonstige", stufe: "hinweis" });
    const kein = compareEntry(m, found({ adresse: "Wilerstrasse 24 9200 Gossau" }));
    expect(kein[0]).toMatchObject({ art: "sonstige", stufe: "hinweis" });
    expect(kein[0].text).toContain("Satzzeichen");
  });

  it("sonstige: ein Kanton hinter dem Ort und ein fehlender Ort sind Hinweise", () => {
    const k = compareEntry(m, found({ adresse: "Wilerstrasse 24, 9200 Gossau SG" }));
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ art: "sonstige", stufe: "hinweis" });
    expect(k[0].text).toContain("«SG»");
    const o = compareEntry(m, found({ adresse: "Wilerstrasse 24, 9200" }));
    expect(o).toHaveLength(1);
    expect(o[0].text).toContain("fehlt der Ort");
  });

  it("meldet mehrere Arten zugleich, je Feld und in Feldreihenfolge", () => {
    const r = compareEntry(m, found({ name: "Malerei Keller GmbH", adresse: "Wilerstr. 24, Gossau", telefon: "071 123 45 67" }));
    expect(r.map((x) => `${x.feld}:${x.art}`)).toEqual(["name:name-zusatz", "adresse:str-abkuerzung", "adresse:plz-fehlt", "telefon:telefon-format"]);
    expect(r.every((x) => x.stufe === "hinweis")).toBe(true);
  });

  it("hat zu jeder Art eine Bezeichnung und nennt in jeder Abweichung dort und soll", () => {
    expect(Object.keys(ART_LABEL).sort()).toEqual(["gross-klein", "name-zusatz", "plz-fehlt", "telefon-format", "sonstige", "ss-eszett", "str-abkuerzung"].sort());
    const r = compareEntry(m, found({ name: "MALEREI KELLER GMBH", adresse: "Wilerstraße 24, 9200 Gossau SG", telefon: "0711234567" }));
    for (const x of r) {
      expect(x.dort.length).toBeGreaterThan(0);
      expect(x.soll.length).toBeGreaterThan(0);
      expect(x.text.length).toBeGreaterThan(10);
      expect(x.text).not.toMatch(/undefined|NaN|!/);
    }
  });
});

// ---- Verzeichnisse und Aufgaben ----------------------------------------------------------------

const SCRAMBLED: VzData = {
  meta: { source: "Testdaten, keine echten Angaben", url: "https://example.ch/quelle", asOf: "2026-10-05" },
  eintraege: [
    { id: "t-gemeinde", name: "Gemeinde-Test", typ: "gemeinde", url: "https://example.ch/g", eintragUrl: null, kostenlos: null, bestaetigung: null, hinweis: "Hinweis zur Gemeinde.", quelle: "https://example.ch/g", geprueft: "2026-10-05" },
    { id: "t-bewertung", name: "Bewertung-Test", typ: "bewertung", branchen: ["Restaurant"], url: "https://example.ch/b", kostenlos: false, bestaetigung: null, hinweis: "Hinweis zur Bewertung.", quelle: "https://example.ch/b", geprueft: "2026-10-05" },
    { id: "t-branche", name: "Branche-Test", typ: "branche", url: "https://example.ch/br", kostenlos: true, bestaetigung: null, hinweis: "Hinweis zur Branche.", quelle: "https://example.ch/br", geprueft: "2026-10-05" },
    { id: "t-buch", name: "Buch-Test", typ: "telefonbuch", url: "https://example.ch/t", kostenlos: true, bestaetigung: "Bestätigung per Post, steht auf der Seite.", hinweis: "Hinweis zum Buch.", quelle: "https://example.ch/t", geprueft: "2026-10-05" },
    { id: "t-karte-2", name: "Karte-Test 2", typ: "karte", url: "https://example.ch/k2", kostenlos: null, bestaetigung: null, hinweis: "Hinweis zur Karte zwei.", quelle: "https://example.ch/k2", geprueft: "2026-10-05" },
    { id: "t-karte-1", name: "Karte-Test 1", typ: "karte", url: "https://example.ch/k1", eintragUrl: "https://example.ch/k1/neu", kostenlos: true, bestaetigung: null, hinweis: "Hinweis zur Karte eins.", quelle: "https://example.ch/k1", geprueft: "2026-10-05" },
  ],
};

describe("verzeichnisse: itemsFor", () => {
  it("ordnet nach Typ (karte, telefonbuch, bewertung, branche, gemeinde), innerhalb des Typs nach Dateireihenfolge", () => {
    const ids = itemsFor("Restaurant", "", SCRAMBLED)
      .filter((i) => !i.frei)
      .map((i) => i.id);
    // Gastgewerbe: Bewertung steht vorn
    expect(ids).toEqual(["t-bewertung", "t-karte-2", "t-karte-1", "t-buch", "t-branche", "t-gemeinde"]);
    const andere = itemsFor("Malerei", "", SCRAMBLED).map((i) => i.id);
    expect(andere).not.toContain("t-bewertung");
    const unbekannt = itemsFor("", "", SCRAMBLED)
      .filter((i) => !i.frei)
      .map((i) => i.id);
    expect(unbekannt).toEqual(["t-karte-2", "t-karte-1", "t-buch", "t-bewertung", "t-branche", "t-gemeinde"]);
  });

  it("stellt die drei freien Plätze ans Ende", () => {
    const items = itemsFor("Malerei", "", SCRAMBLED);
    const last3 = items.slice(-3);
    expect(last3.map((i) => i.id)).toEqual([FREI_GEMEINDE, FREI_VERBAND, FREI_ANDERES]);
    expect(last3.map((i) => i.name)).toEqual(["Gewerbeverzeichnis deiner Gemeinde", "Branchenverband oder Gewerbeverein", ANDERES_STANDARD]);
    expect(last3.every((i) => i.frei && i.url === null)).toBe(true);
    expect(items.filter((i) => i.frei)).toHaveLength(3);
  });

  it("benennt das frei benannte Verzeichnis mit der Eingabe und kennzeichnet es ohne Namen als unbenannt", () => {
    const leer = itemsFor("Malerei", "  ", SCRAMBLED).find((i) => i.id === FREI_ANDERES)!;
    expect(leer.unbenannt).toBe(true);
    expect(leer.name).toBe(ANDERES_STANDARD);
    const benannt = itemsFor("Malerei", "  Gossauer   Anzeiger Online ", SCRAMBLED).find((i) => i.id === FREI_ANDERES)!;
    expect(benannt.unbenannt).toBe(false);
    expect(benannt.name).toBe("Gossauer Anzeiger Online");
  });

  it("zeigt Tripadvisor nur bei Gastgewerbe oder unbekannter Branche, bei unbekannter mit Zusatz", () => {
    const ta = (branche: string) => itemsFor(branche, "").find((i) => i.id === "tripadvisor");
    expect(ta("")).toBeDefined();
    expect(ta("")?.zusatz).toBe(ZUSATZ_BRANCHE);
    expect(ta("")?.anzeige).toBe("Tripadvisor (falls es zu deiner Branche passt)");
    expect(ta("   ")?.zusatz).toBe(ZUSATZ_BRANCHE);
    for (const b of ["Restaurant", "Gastronomie", "Hotel Krone", "Pension und Ferienwohnung", "Café", "Beherbergung", "Bed and Breakfast"]) {
      expect(ta(b), b).toBeDefined();
      expect(ta(b)?.zusatz, b).toBeNull();
      expect(ta(b)?.anzeige, b).toBe("Tripadvisor");
    }
    for (const b of ["Malerei", "Treuhand", "Pensionskassen-Beratung", "Verein"]) expect(ta(b), b).toBeUndefined();
  });

  it("stellt Tripadvisor bei Gastgewerbe an die erste Stelle, sonst hinter die Telefonbücher", () => {
    const ids = (b: string) => itemsFor(b, "").map((i) => i.id);
    expect(ids("Restaurant")[0]).toBe("tripadvisor");
    const unbekannt = ids("");
    expect(unbekannt.indexOf("tripadvisor")).toBeGreaterThan(unbekannt.indexOf("local-search-ch"));
    expect(unbekannt.indexOf("tripadvisor")).toBeLessThan(unbekannt.indexOf(FREI_GEMEINDE));
    expect(ids("Malerei")).toEqual(["google-unternehmensprofil", "apple-business", "bing-places", "local-search-ch", FREI_GEMEINDE, FREI_VERBAND, FREI_ANDERES]);
  });

  it("erkennt Gastgewerbe nach Stichwort", () => {
    expect(istGastgewerbe("Gasthof Sonne")).toBe(true);
    expect(istGastgewerbe("Bar")).toBe(true);
    expect(istGastgewerbe("Malerei und Gipserei")).toBe(false);
    expect(istGastgewerbe("")).toBe(false);
  });

  it("zeigt ohne lesbaren Datensatz nur die freien Plätze", () => {
    expect(itemsFor("Restaurant", "", null).map((i) => i.id)).toEqual([FREI_GEMEINDE, FREI_VERBAND, FREI_ANDERES]);
  });
});

describe("verzeichnisse: Aufgaben", () => {
  const e = eintrag();
  const items = itemsFor("Malerei", "", SCRAMBLED);
  const byId = (id: string) => items.find((i) => i.id === id)!;
  const karte1 = byId("t-karte-1");
  const karte2 = byId("t-karte-2");
  const buch = byId("t-buch");
  const withStatus = (id: string, status: "ja" | "nein" | "unklar", fund?: Partial<Fund>): VzInput => ({
    ...KELLER_INPUT,
    status: { [id]: status },
    funde: fund ? { [id]: found(fund) } : {},
  });

  it("«Nein» heisst Eintragen, mit der Seite zum Anlegen oder sonst der Startseite", () => {
    const a = aufgabeFor(karte2, e, withStatus(karte2.id, "nein"));
    expect(a).toMatchObject({ aktion: "eintragen", aufgabe: "Eintragen", status: "nein", url: "https://example.ch/k2" });
    const b = aufgabeFor(karte1, e, withStatus(karte1.id, "nein"));
    expect(b.url).toBe("https://example.ch/k1/neu");
    expect(b.hinweis).toBe("Hinweis zur Karte eins.");
    expect(a.hinweis).toBe("Hinweis zur Karte zwei.");
  });

  it("«Weiss ich nicht» und kein Status heissen Suchen, mit der Startseite", () => {
    const a = aufgabeFor(karte1, e, withStatus(karte1.id, "unklar"));
    expect(a).toMatchObject({ aktion: "suchen", aufgabe: "Suchen, ob du schon drin bist", url: "https://example.ch/k1" });
    expect(aufgabeFor(karte1, e, KELLER_INPUT).aktion).toBe("suchen");
  });

  it("«Ja» ohne Angabe heisst Prüfen", () => {
    const a = aufgabeFor(buch, e, withStatus(buch.id, "ja"));
    expect(a).toMatchObject({ aktion: "pruefen", aufgabe: "Prüfe, ob Name, Adresse und Telefon wie oben lauten", eingefuegt: false });
    expect(aufgabeFor(buch, e, withStatus(buch.id, "ja", { name: "  " })).aktion).toBe("pruefen");
  });

  it("«Ja» mit Abweichungen heisst Angleichen, ohne Abweichungen In Ordnung", () => {
    const a = aufgabeFor(buch, e, withStatus(buch.id, "ja", { adresse: "Wilerstr. 24, 9200 Gossau" }));
    expect(a.aktion).toBe("angleichen");
    expect(a.abweichungen.map((x) => x.art)).toEqual(["str-abkuerzung"]);
    expect(a.eingefuegt).toBe(true);
    const b = aufgabeFor(buch, e, withStatus(buch.id, "ja", { name: "Malerei Keller", telefon: "+41 71 123 45 67" }));
    expect(b).toMatchObject({ aktion: "ok", aufgabe: "In Ordnung", abweichungen: [] });
  });

  it("zeigt die Bestätigung nur bei Eintragen und Suchen, die Angabe zu den Kosten aus der Datei", () => {
    expect(aufgabeFor(buch, e, withStatus(buch.id, "nein")).bestaetigung).toBe("Bestätigung per Post, steht auf der Seite.");
    expect(aufgabeFor(buch, e, withStatus(buch.id, "ja")).bestaetigung).toBeNull();
    expect(kostenText(true)).toBe(KOSTEN_JA);
    expect(kostenText(false)).toBe(KOSTEN_NEIN);
    expect(kostenText(null)).toBe(KOSTEN_UNKLAR);
    expect(KOSTEN_UNKLAR).toBe("Prüfe die Bedingungen auf der Seite des Anbieters.");
    expect(aufgabeFor(karte2, e, KELLER_INPUT).kosten).toBe(KOSTEN_UNKLAR);
    expect(aufgabeFor(karte1, e, KELLER_INPUT).kosten).toBe(KOSTEN_JA);
  });

  it("gibt nur https-Links weiter", () => {
    const unsicher = { ...karte1, url: "http://example.ch", eintragUrl: "javascript:alert(1)" };
    expect(aufgabeFor(unsicher, e, withStatus(karte1.id, "nein")).url).toBeNull();
    expect(aufgabeFor(unsicher, e, KELLER_INPUT).url).toBeNull();
  });

  it("gibt den freien Plätzen keinen Link und keine Kostenangabe", () => {
    const frei = itemsFor("Malerei", "", SCRAMBLED).find((i) => i.id === FREI_GEMEINDE)!;
    const a = aufgabeFor(frei, e, withStatus(FREI_GEMEINDE, "nein"));
    expect(a).toMatchObject({ aktion: "eintragen", url: null, kosten: null, frei: true });
  });
});

describe("verzeichnisse: auswerten", () => {
  it("liefert null bei ungültigen Angaben", () => {
    expect(auswerten(KELLER, EMPTY_INPUT, "05.10.2026")).toBeNull();
    expect(auswerten({ ...KELLER, ort: "" }, KELLER_INPUT, "05.10.2026")).toBeNull();
  });

  it("zählt die Aufgaben und nummeriert sie in der Reihenfolge der Liste", () => {
    const input: VzInput = {
      ...KELLER_INPUT,
      status: { "google-unternehmensprofil": "ja", "apple-business": "nein", "bing-places": "nein", "local-search-ch": "ja", [FREI_GEMEINDE]: "unklar", [FREI_VERBAND]: "ja" },
      funde: { "google-unternehmensprofil": found({ adresse: "Wilerstr. 24, 9200 Gossau" }), [FREI_VERBAND]: found({ name: "Malerei Keller", telefon: "+41 71 123 45 67" }) },
    };
    const r = auswerten(KELLER, input, "05.10.2026")!;
    expect(r.aufgaben.map((a) => `${a.nr}:${a.id}:${a.aktion}`)).toEqual([
      "1:google-unternehmensprofil:angleichen",
      "2:apple-business:eintragen",
      "3:bing-places:eintragen",
      "4:local-search-ch:pruefen",
      "5:frei-gemeinde:suchen",
      "6:frei-verband:ok",
    ]);
    expect(r.zaehlung).toEqual({ eintragen: 2, suchen: 1, pruefen: 1, angleichen: 1, ok: 1 });
    expect(summaryText(r)).toBe("6 Verzeichnisse in der Liste: 2 zum Eintragen, 1 zum Suchen, 1 zum Prüfen, 1 zum Angleichen, 1 in Ordnung.");
    expect(alleAbweichungen(r).map((x) => `${x.verzeichnis}:${x.art}`)).toEqual(["Google Unternehmensprofil:str-abkuerzung"]);
  });

  it("nimmt das frei benannte Verzeichnis nur mit Namen in die Liste", () => {
    const ohne = auswerten(KELLER, KELLER_INPUT, "05.10.2026")!;
    expect(ohne.aufgaben.map((a) => a.id)).not.toContain(FREI_ANDERES);
    const mit = auswerten(KELLER, { ...KELLER_INPUT, anderesName: "Gossauer Branchenbuch", status: { [FREI_ANDERES]: "nein" } }, "05.10.2026")!;
    const last = mit.aufgaben[mit.aufgaben.length - 1];
    expect(last).toMatchObject({ id: FREI_ANDERES, verzeichnis: "Gossauer Branchenbuch", aktion: "eintragen" });
  });

  it("schaltet Tripadvisor über die Branche aus dem Profil und fragt dafür nichts nach", () => {
    const hotel = auswerten({ ...KELLER, branche: "Hotel" }, KELLER_INPUT, "05.10.2026")!;
    expect(hotel.aufgaben[0].id).toBe("tripadvisor");
    expect(hotel.aufgaben[0].verzeichnis).toBe("Tripadvisor");
    const unbekannt = auswerten({ ...KELLER, branche: "" }, KELLER_INPUT, "05.10.2026")!;
    expect(unbekannt.aufgaben.find((a) => a.id === "tripadvisor")?.verzeichnis).toBe("Tripadvisor (falls es zu deiner Branche passt)");
    expect(auswerten(KELLER, KELLER_INPUT, "05.10.2026")!.aufgaben.map((a) => a.id)).not.toContain("tripadvisor");
  });

  it("arbeitet ohne lesbaren Datensatz mit den freien Plätzen und sagt das in der Quellenzeile", () => {
    const r = auswerten(KELLER, KELLER_INPUT, "05.10.2026", null)!;
    expect(r.aufgaben.map((a) => a.id)).toEqual([FREI_GEMEINDE, FREI_VERBAND]);
    expect(r.quelle).toBeNull();
    expect(quellenzeile(r.quelle)).toBe("Angaben zu den Verzeichnissen: keine Liste verfügbar.");
    expect(KEINE_LISTE_NOTE).toMatch(/nicht lesbar/);
  });
});

// ---- Dokument und Texte ------------------------------------------------------------------------

const BEISPIEL_INPUT: VzInput = {
  ...KELLER_INPUT,
  status: {
    "google-unternehmensprofil": "ja",
    "apple-business": "nein",
    "bing-places": "nein",
    "local-search-ch": "ja",
    [FREI_GEMEINDE]: "unklar",
    [FREI_VERBAND]: "unklar",
  },
  funde: {
    "google-unternehmensprofil": found({ name: "Malerei Keller", adresse: "Wilerstr. 24, 9200 Gossau", telefon: "071 123 45 67" }),
  },
};

describe("verzeichnisse: Dokument", () => {
  const r = auswerten(KELLER, BEISPIEL_INPUT, "05.10.2026")!;
  const doc = toDocument(r);

  it("baut Kopf, Eintrag, Aufgabenliste, Abweichungen und Quelle in dieser Reihenfolge", () => {
    expect(doc.title).toBe("Verzeichnis-Check: Malerei Keller");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.datum).toBe("05.10.2026");
    expect(doc.filename).toBe("verzeichnisse-malerei-keller");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Einheitlicher Eintrag (Kopiervorlage)", "Aufgabenliste", "Abweichungen", "Quelle und Stand"]);
    expect(doc.blocks[0]).toEqual({ type: "paragraph", text: summaryText(r) });
  });

  it("enthält die Aufgabenliste als Tabelle Verzeichnis, Aufgabe, Hinweis", () => {
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table?.type === "table" && table.header).toEqual(["Verzeichnis", "Aufgabe", "Hinweis"]);
    if (table?.type !== "table") throw new Error("keine Tabelle");
    expect(table.rows).toHaveLength(6);
    expect(table.rows[0][0]).toBe("Google Unternehmensprofil");
    expect(table.rows[0][1]).toBe("Angleichen");
    expect(table.rows[0][2]).toContain("2 Abweichungen, siehe unten.");
    expect(table.rows[1][1]).toBe("Eintragen");
    expect(table.rows[1][2]).toContain("Prüfe die Bedingungen auf der Seite des Anbieters.");
    expect(table.rows[1][2]).toContain("Link: https://support.apple.com/de-ch/guide/business/abcb98816a34/web");
    expect(table.rows[2][2]).toContain("Laut Anbieter kostenlos.");
    expect(table.rows[3][1]).toBe("Prüfe, ob Name, Adresse und Telefon wie oben lauten");
  });

  it("enthält die Abweichungen als Tabelle mit Verzeichnis, Feld, Dort, Soll und Art, nur wenn es welche gibt", () => {
    const tables = doc.blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(2);
    const abw = tables[1];
    if (abw.type !== "table") throw new Error("keine Tabelle");
    expect(abw.header).toEqual(["Verzeichnis", "Feld", "Dort", "Soll", "Art"]);
    expect(abw.rows).toEqual([
      ["Google Unternehmensprofil", "Adresse", "Wilerstr. 24, 9200 Gossau", "Wilerstrasse 24, 9200 Gossau", "Abkürzung bei der Strasse (Gleich, aber anders geschrieben)"],
      ["Google Unternehmensprofil", "Telefon", "071 123 45 67", "+41 71 123 45 67", "Telefon anders geschrieben (Gleich, aber anders geschrieben)"],
    ]);
    const ohne = toDocument(auswerten(KELLER, KELLER_INPUT, "05.10.2026")!);
    expect(ohne.blocks.filter((b) => b.type === "table")).toHaveLength(1);
    expect(ohne.blocks.some((b) => b.type === "heading" && b.text === "Abweichungen")).toBe(false);
  });

  it("zeigt den einheitlichen Eintrag als Steckbrief", () => {
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts?.type === "facts" && facts.items.map((f) => `${f.label}: ${f.value}`)).toEqual([
      "Name: Malerei Keller",
      "Adresse: Wilerstrasse 24, 9200 Gossau",
      "Telefon: +41 71 123 45 67",
      "Telefon (national): 071 123 45 67",
      "Website: https://malerei-keller.ch",
      "Öffnungszeiten: Mo bis Fr 7.30 bis 17.00 Uhr",
      "Kurzbeschreibung: Malerarbeiten für Haus und Wohnung in Gossau und Umgebung.",
    ]);
  });

  it("schreibt die Quellenzeile aus meta und den Hinweis, dass sich Bedingungen ändern", () => {
    expect(DATA).not.toBeNull();
    const zeile = `Angaben zu den Verzeichnissen: ${DATA!.meta.source}, Stand 05.10.2026.`;
    expect(quellenzeile(r.quelle)).toBe(zeile);
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: zeile });
    const last = doc.blocks[doc.blocks.length - 1];
    expect(last.type === "paragraph" && last.text).toContain(BEDINGUNGEN_NOTE);
    expect(last.type === "paragraph" && last.text).toContain(KEIN_ABRUF_NOTE);
  });

  it("macht Markdown fürs CRM: Kopf zuerst, keine JSON-Reste", () => {
    const md = reportMarkdown(r);
    expect(md.startsWith("# Verzeichnis-Check: Malerei Keller")).toBe(true);
    expect(md).toContain("6 Verzeichnisse in der Liste: 2 zum Eintragen, 2 zum Suchen, 1 zum Prüfen, 1 zum Angleichen.");
    expect(md).toContain(RICHTWERT_NOTE);
    expect(md.indexOf("Einheitlicher Eintrag")).toBeLessThan(md.indexOf("Aufgabenliste"));
    expect(md).not.toMatch(/[{}]|undefined|NaN/);
  });

  it("verwendet nichts von der Sperrliste und keine Ausrufezeichen", () => {
    const texts = [reportMarkdown(r), ...Object.values(MSG), RICHTWERT_NOTE, KEIN_ABRUF_NOTE, BEDINGUNGEN_NOTE, KOSTEN_JA, KOSTEN_NEIN, KOSTEN_UNKLAR, KEINE_LISTE_NOTE, ...Object.values(ART_LABEL)];
    for (const t of texts) {
      expect(brandHits(t).filter((h) => h.level === "hart"), t).toEqual([]);
      expect(t).not.toMatch(/!|—|\bjetzt\b|nur noch/i);
    }
    // «ß» steht nur dort, wo die Abweichung selbst von «ß» handelt (Bezeichnung der Art, Erklärung, Beispieleintrag)
    expect(reportMarkdown(r)).not.toContain("ß");
    expect(RICHTWERT_NOTE + KEIN_ABRUF_NOTE + BEDINGUNGEN_NOTE + Object.values(MSG).join("")).not.toContain("ß");
    expect(alleAbweichungen(r).every((a) => !/!|—/.test(a.text))).toBe(true);
  });
});

describe("verzeichnisse: PDF und Word", () => {
  const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
  const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
  // Alle Abweichungsarten in einem Dokument, damit jedes Zeichen der Texte geprüft wird.
  const alle: VzInput = {
    ...BEISPIEL_INPUT,
    status: { ...BEISPIEL_INPUT.status, "bing-places": "ja", "apple-business": "ja" },
    funde: {
      "google-unternehmensprofil": found({ name: "MALEREI KELLER GmbH", adresse: "Wilerstraße 24, 9200 Gossau SG", telefon: "0711234567" }),
      "bing-places": found({ name: "Gipserei Meier", adresse: "Wilerstr. 24, Gossau", telefon: "+49 30 1234567" }),
      "apple-business": found({ adresse: "wilerstrasse 24, 9200 gossau" }),
    },
  };
  const r = auswerten(KELLER, alle, "05.10.2026")!;
  const doc = toDocument(r);

  it("deckt alle Abweichungsarten ab", () => {
    expect(new Set(alleAbweichungen(r).map((x) => x.art))).toEqual(new Set(["name-zusatz", "ss-eszett", "gross-klein", "str-abkuerzung", "plz-fehlt", "telefon-format", "sonstige"]));
  });

  it("baut ein A4-PDF, in dem jedes Zeichen des Dokuments in der Schrift vorkommt", async () => {
    const bytes = await buildPdf(doc, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    const probe = await PDFDocument.create();
    probe.registerFontkit(fontkit);
    const set = new Set((await probe.embedFont(fonts.body, { subset: true })).getCharacterSet());
    const text = [doc.title, doc.subtitle ?? "", reportMarkdown(r)].join("\n");
    const missing = [...new Set([...text].filter((c) => c !== "\n" && c !== "#" && !set.has(c.codePointAt(0)!)))];
    expect(missing).toEqual([]);
  });

  it("baut Word mit Steckbrief, Aufgabenliste und Abweichungen", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(doc));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Einheitlicher Eintrag (Kopiervorlage)");
    expect(xml).toContain("Aufgabenliste");
    expect(xml).toContain("Abweichungen");
    expect(xml).toContain("Quelle und Stand");
    expect(xml.match(/<w:tbl>/g)).toHaveLength(3); // Steckbrief, Aufgabenliste, Abweichungen
  });
});

describe("verzeichnisse: eingabeText", () => {
  it("nennt Stammdaten zuerst, dann den Status je Verzeichnis und die eingefügten Einträge", () => {
    const text = eingabeText(KELLER, BEISPIEL_INPUT);
    const lines = text.split("\n");
    expect(lines.slice(0, 7)).toEqual([
      "Firma: Malerei Keller",
      "Ort: Gossau",
      "PLZ: 9200",
      "Strasse: Wilerstrasse 24",
      "Telefon: 071 123 45 67",
      "Website: malerei-keller.ch",
      "Branche: Malerei",
    ]);
    expect(lines).toContain("Google Unternehmensprofil: Ja (Eintrag dort: Name «Malerei Keller», Adresse «Wilerstr. 24, 9200 Gossau», Telefon «071 123 45 67»)");
    expect(lines).toContain("Apple Business (früher Apple Business Connect): Nein");
    expect(lines).toContain("local.ch und search.ch: Ja");
    expect(lines).toContain("Gewerbeverzeichnis deiner Gemeinde: Weiss ich nicht");
    expect(lines).toContain("Öffnungszeiten: Mo bis Fr 7.30 bis 17.00 Uhr");
    expect(lines[lines.length - 1]).toMatch(/^Kurzbeschreibung: /);
    expect(text).not.toMatch(/[{}]|undefined/);
  });

  it("lässt das unbenannte Verzeichnis und leere freiwillige Angaben weg", () => {
    const text = eingabeText({ ...KELLER, website: "", branche: "" }, { ...KELLER_INPUT, oeffnungszeiten: "", beschreibung: "" });
    expect(text).not.toContain(ANDERES_STANDARD);
    expect(text).not.toContain("Website:");
    expect(text).not.toContain("Branche:");
    expect(text).not.toContain("Öffnungszeiten:");
    expect(text).toContain("Tripadvisor (falls es zu deiner Branche passt): Weiss ich nicht");
  });

  it("nennt das frei benannte Verzeichnis mit seinem Namen", () => {
    const text = eingabeText(KELLER, { ...KELLER_INPUT, anderesName: "Gossauer Branchenbuch", status: { [FREI_ANDERES]: "nein" } });
    expect(text).toContain("Gossauer Branchenbuch: Nein");
  });
});

// ---- Stand -------------------------------------------------------------------------------------

describe("verzeichnisse: parseState", () => {
  const OUTPUT = { firma: "Malerei Keller", ort: "Gossau", website: "malerei-keller.ch", branche: "Malerei", datum: "05.10.2026" };
  const RESULT: VzState = { v: 1, phase: "result", input: BEISPIEL_INPUT, output: OUTPUT };

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 42, true, [], {}, { v: 2, phase: "result" }, { phase: "result" }]) {
      expect(parseState(raw), JSON.stringify(raw)).toEqual(EMPTY_STATE);
    }
  });

  it("liest einen gültigen Ergebnisstand unverändert", () => {
    expect(parseState(JSON.parse(JSON.stringify(RESULT)))).toEqual(RESULT);
  });

  it("macht aus einem Ergebnis ohne Ausgabe oder mit ungültigen Angaben wieder ein Formular, mit den Angaben", () => {
    const ohne = parseState({ ...RESULT, output: undefined });
    expect(ohne.phase).toBe("edit");
    expect(ohne.input.strasse).toBe("Wilerstrasse 24");
    expect(parseState({ ...RESULT, output: { ...OUTPUT, ort: "" } }).phase).toBe("edit");
    expect(parseState({ ...RESULT, input: { ...BEISPIEL_INPUT, plz: "12" } }).phase).toBe("edit");
    expect(parseState({ ...RESULT, output: { ...OUTPUT, datum: "" } }).phase).toBe("edit");
    expect(parseState({ ...RESULT, output: "kaputt" }).phase).toBe("edit");
  });

  it("wirft unbekannte Status und kaputte Funde weg und kürzt zu lange Texte", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      input: {
        strasse: 5,
        plz: "9200",
        telefon: "x".repeat(500),
        status: { "bing-places": "ja", "apple-business": "vielleicht", "Böse Id": "ja", "google-unternehmensprofil": 3 },
        funde: { "bing-places": { name: "Bing-Name", adresse: 7, telefon: null }, "kaputt": "text", "Böse Id": { name: "x" } },
        anderesName: "y".repeat(300),
      },
    });
    expect(s.phase).toBe("edit");
    expect(s.input.strasse).toBe("");
    expect(s.input.telefon).toHaveLength(60);
    expect(s.input.status).toEqual({ "bing-places": "ja" });
    expect(s.input.funde).toEqual({ "bing-places": { name: "Bing-Name", adresse: "", telefon: "" } });
    expect(s.input.anderesName).toHaveLength(80);
  });

  it("wird vom Pfad-Fortschritt als erledigt erkannt, das Formular nicht", () => {
    expect(isToolDone(JSON.stringify(RESULT))).toBe(true);
    expect(isToolDone(JSON.stringify({ ...RESULT, phase: "edit" }))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });

  it("bietet die Antworten Ja, Nein und Weiss ich nicht", () => {
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual(["Ja", "Nein", "Weiss ich nicht"]);
  });
});

// ---- Konfiguration und Seitentext --------------------------------------------------------------

describe("verzeichnisse: tool.config und Seitentext", () => {
  const raw = fs.readFileSync(path.join(process.cwd(), "content", "tools", "verzeichnisse.md"), "utf8");
  const parsed = parseToolMarkdown(raw);

  it("hat eine Tagline bis 110 Zeichen und das Keyword in der H1", () => {
    expect(config.tagline.length).toBeLessThanOrEqual(110);
    expect(config.slug).toBe("verzeichnisse");
    expect(config.category).toBe("analyse");
    expect(config.audience).toBe("beide");
    expect(config.needsServer).toBe(false);
    expect(config.usesProfile).toEqual(["organisationstyp", "firma", "ort", "website", "branche"]);
    expect(config.writesProfile).toEqual([]);
    expect(parsed.frontmatter.h1?.toLowerCase()).toContain(config.keyword.toLowerCase());
    expect(parsed.frontmatter.tagline).toBe(config.tagline);
  });

  it("besteht die Prüfung des Seitentextes ohne Fehler", () => {
    const errors = checkToolContent(parsed).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("nennt das Keyword drei- bis fünfmal und im ersten Absatz von «Warum das wichtig ist»", () => {
    const kw = config.keyword.toLowerCase();
    const text = `${parsed.frontmatter.h1}\n${parsed.body}`.toLowerCase();
    const n = text.split(kw).length - 1;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
    expect((parsed.sections.warum ?? "").split(/\n\s*\n/)[0].toLowerCase()).toContain(kw);
  });

  it("zeigt im Beispiel ein echtes Ergebnis des Werkzeugs für Malerei Keller mit zwei Abweichungen", () => {
    const r = auswerten(KELLER, BEISPIEL_INPUT, "05.10.2026")!;
    const beispiel = parsed.sections.beispiel ?? "";
    expect(alleAbweichungen(r)).toHaveLength(2);
    expect(beispiel).toContain(summaryText(r));
    for (const f of eintragFelder(r.eintrag).filter((x) => x.key !== "oeffnungszeiten" && x.key !== "beschreibung")) expect(beispiel).toContain(f.value);
    for (const a of r.aufgaben) {
      expect(beispiel, a.verzeichnis).toContain(a.verzeichnis);
      expect(beispiel, a.verzeichnis).toContain(a.aufgabe);
    }
    for (const x of alleAbweichungen(r)) {
      expect(beispiel).toContain(x.dort);
      expect(beispiel).toContain(x.soll);
    }
  });

  it("hat im Alperna-Block den Baustein «Google Business Profil» und @baustein", () => {
    expect(parsed.alperna.baustein).toBe("Google Business Profil");
    expect(parsed.alperna.beweis).toBe("@baustein");
  });

  it("verwendet keine Rechtsaussage, keine Preise und nichts von der Sperrliste", () => {
    const all = [parsed.body, ...(parsed.frontmatter.kurz ?? []), ...(parsed.frontmatter.ablauf ?? [])].join("\n");
    expect(brandHits(all).filter((h) => h.level === "hart")).toEqual([]);
    expect(all).not.toMatch(/laut Gesetz|Paragraf|Art\.\s?\d|müssen laut|Ranking|Million|Prozent/i);
    expect(all).not.toMatch(new RegExp("TO" + "DO"));
  });
});
