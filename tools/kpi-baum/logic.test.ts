import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import {
  ANNAHME_NOTE,
  CSV_BOM,
  EMPTY_STATE,
  HINWEISE,
  KANAELE,
  KPIS,
  LIMITS,
  NICHT_GEPRUEFT,
  PLAUSIBEL_NOTE,
  ZEITRAEUME,
  ZIEL_ARTEN,
  addMonths,
  artenFuer,
  auswerten,
  baumBeschriftung,
  baumModell,
  baumZeile,
  csvFilename,
  documentParts,
  effektiveQuelle,
  eingabeText,
  emptyKpi,
  emptyMarketingZiel,
  heuteIso,
  isoToCH,
  kpiProZeitraum,
  kpisFuer,
  messplan,
  monateBis,
  monatsSpalten,
  parseIso,
  parseNum,
  parseState,
  reportMarkdown,
  rueckwaerts,
  smartCheck,
  toCsv,
  toDocument,
  treeSvg,
  validate,
  wrapText,
  type Check,
  type CheckKey,
  type Ergebnis,
  type FormState,
  type KpiForm,
  type KpiWerte,
  type Kontext,
  type MarketingZielForm,
  type MarketingZielWerte,
  type Typ,
} from "./logic";
import config from "./tool.config";

const HEUTE = "2026-10-05";
const KMU: Kontext = { heute: HEUTE, typ: "kmu", firma: "Malerei Keller", branche: "Malerei" };
const VEREIN: Kontext = { heute: HEUTE, typ: "verein", firma: "FC Trogen", branche: "Fussball" };

const kpiForm = (p: Partial<KpiForm> = {}): KpiForm => ({ ...emptyKpi(), ...p });
const anfragenKpi = (p: Partial<KpiForm> = {}) => kpiForm({ kpi: "anfragen", zielwert: "17", zeitraum: "monat", quelle: "Postfach und Telefonnotiz", ...p });
const mz = (p: Partial<MarketingZielForm> = {}): MarketingZielForm => ({ text: "Mehr Anfragen über Google", kanal: "gbp", kpis: [anfragenKpi()], ...p });
const form = (p: Partial<FormState> = {}): FormState => ({
  ziel: { art: "auftraege", zielwert: "30", ausgangswert: "18", ende: "2026-12-31" },
  ziele: [mz()],
  rueckwaerts: { anfragenZuOfferten: "6", offertenZuAuftraegen: "4" },
  ...p,
});
const vereinForm = (p: Partial<FormState> = {}): FormState =>
  form({
    ziel: { art: "mitglieder", zielwert: "40", ausgangswert: "", ende: "2026-12-31" },
    ziele: [mz({ text: "Mehr Mitglieder über Instagram", kanal: "instagram", kpis: [kpiForm({ kpi: "neumitglieder", zielwert: "10", zeitraum: "monat", quelle: "Mitgliederliste" })] })],
    rueckwaerts: { anfragenZuOfferten: "", offertenZuAuftraegen: "" },
    ...p,
  });

/** Das Beispiel aus dem Seitentext (Malerei Keller, Gossau). */
const BEISPIEL: FormState = form({
  ziele: [
    mz({
      kpis: [anfragenKpi(), kpiForm({ kpi: "bewertungen", zielwert: "9", zeitraum: "gesamt", quelle: "Google-Unternehmensprofil" })],
    }),
    mz({
      text: "Besichtigungstermine online buchbar machen",
      kanal: "website",
      kpis: [kpiForm({ kpi: "termine", zielwert: "8", zeitraum: "monat", quelle: "Kalender oder Buchungswerkzeug" })],
    }),
  ],
});

function ergebnis(f: FormState = form(), k: Kontext = KMU): Ergebnis {
  const e = auswerten(f, k);
  if (!e) throw new Error(`auswerten lieferte null: ${validate(f, k.typ, k.heute)}`);
  return e;
}

// ---- Werte für smartCheck ----------------------------------------------------------------------

const zielW = { einheit: "auftraege", zielwert: 30, ende: "2026-12-31" };
const kw = (p: Partial<KpiWerte> = {}): KpiWerte => ({
  key: "anfragen",
  label: "Anfragen",
  einheit: "anfragen",
  zielwert: 17,
  zeitraum: "monat",
  quelle: "Kontaktformular",
  rhythmus: "monatlich",
  umrechnung: kpiProZeitraum(17, "monat", 3),
  ...p,
});
const mw = (p: Partial<Pick<MarketingZielWerte, "text" | "kanal" | "kpis">> = {}) => ({ text: "Mehr Anfragen über Google", kanal: "gbp" as const, kpis: [kw()], ...p });
const pick = (checks: Check[], key: CheckKey) => checks.find((c) => c.key === key)!;

// ---- Datum -------------------------------------------------------------------------------------

describe("kpi-baum: Datum", () => {
  it("liest nur gültige ISO-Daten", () => {
    expect(parseIso("2026-10-05")).toEqual({ y: 2026, m: 10, d: 5 });
    expect(parseIso("2028-02-29")).not.toBeNull();
    for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-2-3", "05.10.2026", "", 20261005, null, undefined]) expect(parseIso(bad)).toBeNull();
  });

  it("addMonths setzt auf den letzten Tag des Zielmonats, wenn der Tag fehlt", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("kaputt", 2)).toBe("kaputt");
  });

  it("zählt Monate bis zum Enddatum: angebrochene Monate zählen voll", () => {
    expect(monateBis("2026-10-05", "2026-12-31")).toBe(3);
    expect(monateBis("2026-10-05", "2027-10-05")).toBe(12);
  });

  it("zählt über den Jahreswechsel", () => {
    expect(monateBis("2026-10-05", "2027-01-05")).toBe(3);
    expect(monateBis("2026-10-05", "2027-01-06")).toBe(4);
    expect(monateBis("2026-12-20", "2027-01-10")).toBe(1);
  });

  it("zählt an Monatsenden richtig, auch im Schaltjahr", () => {
    expect(monateBis("2026-01-31", "2026-02-28")).toBe(1);
    expect(monateBis("2026-01-31", "2026-03-01")).toBe(2);
    expect(monateBis("2026-10-31", "2026-11-30")).toBe(1);
    expect(monateBis("2027-12-31", "2028-02-29")).toBe(2);
  });

  it("ergibt bei weniger als einem Monat, am selben Tag, in der Vergangenheit und bei kaputten Daten mindestens 1", () => {
    expect(monateBis("2026-10-05", "2026-10-20")).toBe(1);
    expect(monateBis("2026-10-05", "2026-10-05")).toBe(1);
    expect(monateBis("2026-10-05", "2026-09-01")).toBe(1);
    expect(monateBis("kaputt", "2026-12-31")).toBe(1);
    expect(monateBis("2026-10-05", "")).toBe(1);
  });

  it("formatiert das heutige Datum in Schweizer Zeit und als dd.MM.yyyy", () => {
    expect(heuteIso(new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
    expect(heuteIso(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01"); // Winterzeit, UTC+1
    expect(heuteIso(new Date("2026-06-30T22:30:00Z"))).toBe("2026-07-01"); // Sommerzeit, UTC+2
    expect(isoToCH("2026-10-05")).toBe("05.10.2026");
    expect(isoToCH("kaputt")).toBe("–");
  });
});

describe("kpi-baum: Zahlen", () => {
  it("liest Zahlen mit Komma, Hochkomma und Leerzeichen; leer ist null, Unsinn ist NaN", () => {
    expect(parseNum("12")).toBe(12);
    expect(parseNum(" 1'000 ")).toBe(1000);
    expect(parseNum("2,5")).toBe(2.5);
    expect(parseNum("")).toBeNull();
    expect(parseNum("  ")).toBeNull();
    expect(Number.isNaN(parseNum("abc"))).toBe(true);
    expect(Number.isNaN(parseNum("1e3"))).toBe(true);
    expect(parseNum("-4")).toBe(-4);
  });
});

// ---- Kataloge ----------------------------------------------------------------------------------

describe("kpi-baum: Kataloge", () => {
  it("bietet KMU und Vereinen die passenden Arten an", () => {
    expect(artenFuer("kmu").map((a) => a.key)).toEqual(["umsatz", "kunden", "auftraege"]);
    expect(artenFuer("verein").map((a) => a.key)).toEqual(["mitglieder", "anmeldungen"]);
    expect(artenFuer("kmu").map((a) => a.label)).toEqual(["Umsatz in CHF", "Neue Kundinnen und Kunden", "Aufträge"]);
    expect(artenFuer("verein").map((a) => a.label)).toEqual(["Neue Mitglieder", "Anmeldungen zum Anlass"]);
  });

  it("bietet bei Vereinen Neumitglieder und Anmeldungen statt Neukunden und Offerten an", () => {
    const kmu = kpisFuer("kmu").map((k) => k.key);
    const verein = kpisFuer("verein").map((k) => k.key);
    expect(kmu).toContain("neukunden");
    expect(kmu).toContain("offerten");
    expect(kmu).not.toContain("neumitglieder");
    expect(verein).toContain("neumitglieder");
    expect(verein).toContain("anmeldungen");
    expect(verein).not.toContain("neukunden");
    expect(verein).not.toContain("offerten");
    for (const k of ["anfragen", "profilaufrufe", "bewertungen", "newsletter", "besuche", "termine", "anrufe"]) {
      expect(kmu).toContain(k);
      expect(verein).toContain(k);
    }
  });

  it("nennt je Kennzahl mindestens eine sachliche Messquelle und den Rhythmus", () => {
    for (const k of KPIS) {
      expect(k.quellen.length).toBeGreaterThan(0);
      expect(new Set(k.quellen).size).toBe(k.quellen.length);
    }
    expect(KPIS.find((k) => k.key === "anfragen")!.quellen).toEqual(["Postfach und Telefonnotiz", "Kontaktformular", "CRM oder Excel"]);
    expect(KPIS.find((k) => k.key === "besuche")!.rhythmus).toBe("wöchentlich");
    expect(KPIS.filter((k) => k.key !== "besuche").every((k) => k.rhythmus === "monatlich")).toBe(true);
    expect(ZEITRAEUME.map((z) => z.label)).toEqual(["pro Monat", "pro Quartal", "gesamt bis zum Enddatum"]);
    expect(KANAELE.map((k) => k.label)).toEqual([
      "Website",
      "Google-Unternehmensprofil",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "Newsletter",
      "Empfehlungen",
      "Anlässe",
      "Print",
    ]);
  });

  it("nimmt als Messquelle nur einen Vorschlag der Kennzahl oder den eigenen Text bei «Andere»", () => {
    expect(effektiveQuelle({ kpi: "anfragen", quelle: "Kontaktformular", andere: "" })).toBe("Kontaktformular");
    expect(effektiveQuelle({ kpi: "anfragen", quelle: "Instagram Insights", andere: "" })).toBe("");
    expect(effektiveQuelle({ kpi: "anfragen", quelle: "andere", andere: "  Strichliste am Empfang " })).toBe("Strichliste am Empfang");
    expect(effektiveQuelle({ kpi: "anfragen", quelle: "andere", andere: "  " })).toBe("");
    expect(effektiveQuelle({ kpi: "", quelle: "Kontaktformular", andere: "" })).toBe("");
  });
});

// ---- Umrechnung --------------------------------------------------------------------------------

describe("kpi-baum: Zeiträume umrechnen", () => {
  it("rechnet «pro Monat» auf Quartal und gesamt", () => {
    expect(kpiProZeitraum(20, "monat", 3)).toEqual({ proMonat: 20, proQuartal: 60, gesamt: 60 });
    expect(kpiProZeitraum(20, "monat", 12)).toEqual({ proMonat: 20, proQuartal: 60, gesamt: 240 });
  });

  it("rechnet «pro Quartal» auf Monat und gesamt, auf zwei Stellen gerundet", () => {
    expect(kpiProZeitraum(60, "quartal", 3)).toEqual({ proMonat: 20, proQuartal: 60, gesamt: 60 });
    expect(kpiProZeitraum(10, "quartal", 6)).toEqual({ proMonat: 3.33, proQuartal: 10, gesamt: 20 });
  });

  it("rechnet «gesamt bis zum Enddatum» auf Monat und Quartal", () => {
    expect(kpiProZeitraum(100, "gesamt", 3)).toEqual({ proMonat: 33.33, proQuartal: 100, gesamt: 100 });
    expect(kpiProZeitraum(9, "gesamt", 3)).toEqual({ proMonat: 3, proQuartal: 9, gesamt: 9 });
  });

  it("behandelt weniger als einen Monat wie einen Monat", () => {
    expect(kpiProZeitraum(12, "gesamt", 0)).toEqual({ proMonat: 12, proQuartal: 36, gesamt: 12 });
    expect(kpiProZeitraum(12, "monat", -2)).toEqual({ proMonat: 12, proQuartal: 36, gesamt: 12 });
  });
});

// ---- SMART-Check -------------------------------------------------------------------------------

describe("kpi-baum: SMART, spezifisch", () => {
  it("ist erfüllt mit Text und Kanal", () => {
    expect(pick(smartCheck(mw(), zielW, HEUTE), "spezifisch")).toEqual({ key: "spezifisch", status: "ok", hinweis: "" });
  });

  it("fehlt bei einem Text unter 10 Zeichen, genau 10 reichen", () => {
    const genau = pick(smartCheck(mw({ text: "Mehr Leads" }), zielW, HEUTE), "spezifisch");
    expect(genau.status).toBe("ok"); // 10 Zeichen
    const zuKurz = pick(smartCheck(mw({ text: "Mehr Kund" }), zielW, HEUTE), "spezifisch"); // 9 Zeichen
    expect(zuKurz.status).toBe("fehlt");
    expect(zuKurz.hinweis).toBe("Der Text hat nur 9 Zeichen (mindestens 10).");
  });

  it("zählt den Text ohne Leerraum am Rand", () => {
    expect(pick(smartCheck(mw({ text: "   kurz   " }), zielW, HEUTE), "spezifisch").hinweis).toBe("Der Text hat nur 4 Zeichen (mindestens 10).");
  });

  it("fehlt ohne Kanal", () => {
    const c = pick(smartCheck(mw({ kanal: "" }), zielW, HEUTE), "spezifisch");
    expect(c.status).toBe("fehlt");
    expect(c.hinweis).toBe("Es fehlt ein Kanal.");
  });

  it("nennt Text und Kanal in einem Satz, wenn beides fehlt", () => {
    const c = pick(smartCheck(mw({ text: "Mehr", kanal: "" }), zielW, HEUTE), "spezifisch");
    expect(c.hinweis).toBe("Der Text hat nur 4 Zeichen (mindestens 10) und es fehlt ein Kanal.");
  });
});

describe("kpi-baum: SMART, messbar", () => {
  it("ist erfüllt mit einer Kennzahl mit Zielwert und Messquelle", () => {
    expect(pick(smartCheck(mw(), zielW, HEUTE), "messbar").status).toBe("ok");
  });

  it("fehlt ohne Kennzahl", () => {
    const c = pick(smartCheck(mw({ kpis: [] }), zielW, HEUTE), "messbar");
    expect(c.status).toBe("fehlt");
    expect(c.hinweis).toBe("Es fehlt eine Kennzahl mit Zielwert und Messquelle.");
  });

  it("fehlt ohne Zielwert, ohne Messquelle und ohne beides", () => {
    expect(pick(smartCheck(mw({ kpis: [kw({ zielwert: null, umrechnung: null })] }), zielW, HEUTE), "messbar").hinweis).toBe("Bei «Anfragen» fehlt der Zielwert.");
    expect(pick(smartCheck(mw({ kpis: [kw({ quelle: "" })] }), zielW, HEUTE), "messbar").hinweis).toBe("Bei «Anfragen» fehlt die Messquelle.");
    expect(pick(smartCheck(mw({ kpis: [kw({ quelle: "", zielwert: null, umrechnung: null })] }), zielW, HEUTE), "messbar").hinweis).toBe(
      "Bei «Anfragen» fehlen Zielwert und Messquelle.",
    );
  });

  it("ist erfüllt, wenn eine von zwei Kennzahlen vollständig ist", () => {
    const c = pick(smartCheck(mw({ kpis: [kw({ quelle: "" }), kw({ key: "termine", label: "Termine", einheit: "termine" })] }), zielW, HEUTE), "messbar");
    expect(c.status).toBe("ok");
  });
});

describe("kpi-baum: SMART, terminiert", () => {
  it("ist erfüllt, wenn das Enddatum nach heute liegt", () => {
    expect(pick(smartCheck(mw(), { ...zielW, ende: "2026-10-06" }, HEUTE), "terminiert").status).toBe("ok");
  });

  it("fehlt, wenn das Enddatum heute ist", () => {
    const c = pick(smartCheck(mw(), { ...zielW, ende: HEUTE }, HEUTE), "terminiert");
    expect(c.status).toBe("fehlt");
    expect(c.hinweis).toBe("Das Enddatum 05.10.2026 liegt nicht nach heute (05.10.2026); wähl ein Datum in der Zukunft.");
  });

  it("fehlt, wenn das Enddatum in der Vergangenheit liegt", () => {
    const c = pick(smartCheck(mw(), { ...zielW, ende: "2026-09-30" }, HEUTE), "terminiert");
    expect(c.status).toBe("fehlt");
    expect(c.hinweis).toContain("30.09.2026");
  });

  it("gilt auch für Kennzahlen «gesamt bis zum Enddatum»", () => {
    const gesamt = mw({ kpis: [kw({ zeitraum: "gesamt", umrechnung: kpiProZeitraum(17, "gesamt", 1) })] });
    expect(pick(smartCheck(gesamt, { ...zielW, ende: "2026-09-30" }, HEUTE), "terminiert").status).toBe("fehlt");
    expect(pick(smartCheck(gesamt, zielW, HEUTE), "terminiert").status).toBe("ok");
  });
});

describe("kpi-baum: SMART, plausibel", () => {
  const kunden = { einheit: "kunden", zielwert: 20, ende: "2026-12-31" };
  const neukunden = (zielwert: number, zeitraum: "monat" | "gesamt" = "gesamt") =>
    kw({ key: "neukunden", label: "Neukunden", einheit: "kunden", zielwert, zeitraum, umrechnung: kpiProZeitraum(zielwert, zeitraum, zeitraum === "gesamt" ? 3 : 6) });

  it("fehlt, wenn die Kennzahl mit derselben Einheit grösser ist als das Unternehmensziel", () => {
    const c = pick(smartCheck(mw({ kpis: [neukunden(25)] }), kunden, HEUTE), "plausibel");
    expect(c.status).toBe("fehlt");
    expect(c.hinweis).toBe("Die Kennzahl «Neukunden» ergibt bis zum Enddatum 25, mehr als dein Unternehmensziel (20).");
  });

  it("ist erfüllt bei gleichem oder kleinerem Wert", () => {
    expect(pick(smartCheck(mw({ kpis: [neukunden(20)] }), kunden, HEUTE), "plausibel").status).toBe("ok");
    expect(pick(smartCheck(mw({ kpis: [neukunden(5)] }), kunden, HEUTE), "plausibel").status).toBe("ok");
  });

  it("rechnet «pro Monat» auf das Enddatum um", () => {
    expect(pick(smartCheck(mw({ kpis: [neukunden(5, "monat")] }), kunden, HEUTE), "plausibel").status).toBe("fehlt"); // 5 x 6 Monate = 30
  });

  it("ist nicht prüfbar bei verschiedener Einheit oder ohne Zielwert", () => {
    const c = pick(smartCheck(mw(), zielW, HEUTE), "plausibel");
    expect(c.status).toBe("offen");
    expect(c.hinweis).toContain("Nicht prüfbar");
    expect(pick(smartCheck(mw({ kpis: [kw({ key: "neukunden", label: "Neukunden", einheit: "kunden", zielwert: null, umrechnung: null })] }), kunden, HEUTE), "plausibel").status).toBe("offen");
  });
});

// ---- Rückwärtsrechnung -------------------------------------------------------------------------

describe("kpi-baum: Rückwärtsrechnung", () => {
  it("stimmt mit der Handrechnung überein", () => {
    // 30 - 18 = 12 Aufträge; 12 x 10 / 4 = 30 Offerten; 30 x 10 / 6 = 50 Anfragen; 3 Monate
    const r = rueckwaerts(30, 18, 6, 4, 3);
    expect(r).toEqual({
      ok: true,
      erreicht: false,
      auftraege: 12,
      offerten: 30,
      anfragen: 50,
      monate: 3,
      proMonat: { auftraege: 4, offerten: 10, anfragen: 17 },
      anfragenZuOfferten: 6,
      offertenZuAuftraegen: 4,
    });
  });

  it("nimmt ohne Ausgangswert den ganzen Zielwert und rundet pro Monat auf", () => {
    const r = rueckwaerts(40, null, 5, 4, 3);
    expect(r).toMatchObject({ ok: true, auftraege: 40, offerten: 100, anfragen: 200, proMonat: { auftraege: 14, offerten: 34, anfragen: 67 } });
  });

  it("rundet Offerten und Anfragen auf ganze Zahlen auf", () => {
    // 7 x 10 / 3 = 23,33 -> 24 Offerten; 24 x 10 / 5 = 48 Anfragen
    expect(rueckwaerts(7, 0, 5, 3, 1)).toMatchObject({ ok: true, offerten: 24, anfragen: 48 });
    // 1 Auftrag bei 1 von 10 und 1 von 10: 10 Offerten, 100 Anfragen
    expect(rueckwaerts(1, 0, 1, 1, 1)).toMatchObject({ ok: true, offerten: 10, anfragen: 100 });
    // 3 Aufträge bei 7 von 10: 30 / 7 = 4,29 -> 5 Offerten; 5 x 10 / 3 = 16,67 -> 17 Anfragen
    expect(rueckwaerts(3, 0, 3, 7, 1)).toMatchObject({ ok: true, offerten: 5, anfragen: 17 });
  });

  it("rundet einen Zielwert mit Nachkommastellen auf", () => {
    expect(rueckwaerts(12.5, 0, 10, 10, 1)).toMatchObject({ ok: true, auftraege: 13, offerten: 13, anfragen: 13 });
  });

  it("ergibt bei 0 Aufträgen lauter Nullen, auch wenn der Ausgangswert über dem Ziel liegt", () => {
    for (const start of [10, 12]) {
      const r = rueckwaerts(10, start, 5, 4, 3);
      expect(r).toEqual({
        ok: true,
        erreicht: true,
        auftraege: 0,
        offerten: 0,
        anfragen: 0,
        monate: 3,
        proMonat: { auftraege: 0, offerten: 0, anfragen: 0 },
        anfragenZuOfferten: 5,
        offertenZuAuftraegen: 4,
      });
    }
  });

  it("meldet bei einer Quote von 0 einen Fehler statt Unendlich", () => {
    for (const [a, o] of [
      [0, 4],
      [5, 0],
      [0, 0],
    ] as const) {
      const r = rueckwaerts(30, 0, a, o, 3);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toMatch(/Infinity|NaN|null/);
      if (!r.ok) expect(r.fehler).toContain("0 von 10");
    }
  });

  it("meldet ungültige Quoten und Zielwerte", () => {
    for (const [a, o] of [
      [11, 4],
      [5, -1],
      [2.5, 4],
      [Number.NaN, 4],
    ] as const) {
      expect(rueckwaerts(30, 0, a, o, 3).ok).toBe(false);
    }
    expect(rueckwaerts(-1, 0, 5, 4, 3).ok).toBe(false);
    expect(rueckwaerts(Number.NaN, 0, 5, 4, 3).ok).toBe(false);
  });

  it("rechnet weniger als einen Monat wie einen Monat", () => {
    expect(rueckwaerts(30, 18, 6, 4, 0)).toMatchObject({ ok: true, monate: 1, proMonat: { anfragen: 50 } });
  });

  it("rechnet 10 von 10 ohne Aufschlag", () => {
    expect(rueckwaerts(10, 0, 10, 10, 2)).toMatchObject({ ok: true, auftraege: 10, offerten: 10, anfragen: 10, proMonat: { anfragen: 5 } });
  });
});

// ---- Prüfung der Eingabe -----------------------------------------------------------------------

describe("kpi-baum: validate", () => {
  it("lässt ein vollständiges Formular durch", () => {
    expect(validate(form(), "kmu", HEUTE)).toBeNull();
    expect(validate(BEISPIEL, "kmu", HEUTE)).toBeNull();
    expect(validate(vereinForm(), "verein", HEUTE)).toBeNull();
  });

  it("verlangt Art, Zielwert und Enddatum", () => {
    expect(validate(form({ ziel: { ...form().ziel, art: "" } }), "kmu", HEUTE)).toBe("Wähl, was du erreichen willst.");
    for (const z of ["", "0", "-5", "abc"]) {
      expect(validate(form({ ziel: { ...form().ziel, zielwert: z } }), "kmu", HEUTE)).toBe("Der Zielwert muss eine Zahl über 0 sein.");
    }
    expect(validate(form({ ziel: { ...form().ziel, zielwert: "2000000000" } }), "kmu", HEUTE)).toContain("zu gross");
    expect(validate(form({ ziel: { ...form().ziel, ende: "" } }), "kmu", HEUTE)).toContain("bis wann");
    expect(validate(form({ ziel: { ...form().ziel, ende: "2026-02-30" } }), "kmu", HEUTE)).toContain("bis wann");
  });

  it("lehnt Arten ab, die es für die Organisation nicht gibt", () => {
    expect(validate(vereinForm({ ziel: { art: "auftraege", zielwert: "40", ausgangswert: "", ende: "2026-12-31" } }), "verein", HEUTE)).toBe("Wähl, was du erreichen willst.");
    expect(validate(form({ ziel: { art: "mitglieder", zielwert: "40", ausgangswert: "", ende: "2026-12-31" } }), "kmu", HEUTE)).toBe("Wähl, was du erreichen willst.");
  });

  it("erlaubt einen leeren Ausgangswert und die 0, lehnt negative Werte und Text ab", () => {
    expect(validate(form({ ziel: { ...form().ziel, ausgangswert: "" } }), "kmu", HEUTE)).toBeNull();
    expect(validate(form({ ziel: { ...form().ziel, ausgangswert: "0" } }), "kmu", HEUTE)).toBeNull();
    expect(validate(form({ ziel: { ...form().ziel, ausgangswert: "-1" } }), "kmu", HEUTE)).toContain("Ausgangswert");
    expect(validate(form({ ziel: { ...form().ziel, ausgangswert: "viel" } }), "kmu", HEUTE)).toContain("Ausgangswert");
  });

  it("lässt ein Enddatum in der Vergangenheit zu (der SMART-Check zeigt es) und lehnt mehr als zehn Jahre ab", () => {
    expect(validate(form({ ziel: { ...form().ziel, ende: "2026-09-30" } }), "kmu", HEUTE)).toBeNull();
    expect(validate(form({ ziel: { ...form().ziel, ende: HEUTE } }), "kmu", HEUTE)).toBeNull();
    expect(validate(form({ ziel: { ...form().ziel, ende: "2036-10-05" } }), "kmu", HEUTE)).toBeNull(); // genau 120 Monate
    expect(validate(form({ ziel: { ...form().ziel, ende: "2036-10-06" } }), "kmu", HEUTE)).toContain("zehn Jahre");
  });

  it("verlangt mindestens ein Marketingziel und ignoriert leere Zeilen", () => {
    expect(validate(form({ ziele: [emptyMarketingZiel()] }), "kmu", HEUTE)).toBe("Nenne mindestens ein Marketingziel.");
    expect(validate(form({ ziele: [emptyMarketingZiel(), mz(), emptyMarketingZiel()] }), "kmu", HEUTE)).toBeNull();
  });

  it("lehnt mehr als drei Marketingziele ab", () => {
    expect(validate(form({ ziele: [mz(), mz(), mz()] }), "kmu", HEUTE)).toBeNull();
    expect(validate(form({ ziele: [mz(), mz(), mz(), mz()] }), "kmu", HEUTE)).toBe(`Du kannst höchstens ${LIMITS.maxZiele} Marketingziele angeben.`);
    expect(validate(form({ ziele: [mz(), mz(), mz(), emptyMarketingZiel()] }), "kmu", HEUTE)).toBeNull();
  });

  it("lehnt mehr als zwei Kennzahlen je Ziel ab, leere Zeilen zählen nicht", () => {
    const drei = mz({ kpis: [anfragenKpi(), anfragenKpi(), anfragenKpi()] });
    expect(validate(form({ ziele: [drei] }), "kmu", HEUTE)).toBe(`Marketingziel 1: Höchstens ${LIMITS.maxKpis} Kennzahlen.`);
    expect(validate(form({ ziele: [mz({ kpis: [anfragenKpi(), emptyKpi(), anfragenKpi()] })] }), "kmu", HEUTE)).toBeNull();
  });

  it("prüft Text und Länge eines Marketingziels, mit der Nummer aus dem Formular", () => {
    expect(validate(form({ ziele: [mz({ text: "  ", kanal: "gbp" })] }), "kmu", HEUTE)).toBe("Marketingziel 1: Schreib auf, was du erreichen willst.");
    expect(validate(form({ ziele: [emptyMarketingZiel(), mz({ text: "", kanal: "website" })] }), "kmu", HEUTE)).toContain("Marketingziel 2:");
    expect(validate(form({ ziele: [mz({ text: "a".repeat(140) })] }), "kmu", HEUTE)).toBeNull();
    expect(validate(form({ ziele: [mz({ text: "a".repeat(141) })] }), "kmu", HEUTE)).toBe("Marketingziel 1: Der Text ist länger als 140 Zeichen.");
  });

  it("verlangt bei einer Kennzahlenzeile eine Kennzahl, die es für die Organisation gibt", () => {
    expect(validate(form({ ziele: [mz({ kpis: [kpiForm({ zielwert: "5" })] })] }), "kmu", HEUTE)).toBe("Marketingziel 1, Kennzahl 1: Wähl eine Kennzahl.");
    expect(validate(vereinForm({ ziele: [mz({ kpis: [anfragenKpi({ kpi: "neukunden" })] })] }), "verein", HEUTE)).toContain("Wähl eine Kennzahl");
    expect(validate(form({ ziele: [mz({ kpis: [anfragenKpi({ kpi: "neumitglieder" })] })] }), "kmu", HEUTE)).toContain("Wähl eine Kennzahl");
  });

  it("lässt eine Kennzahl ohne Zielwert oder Messquelle zu, lehnt aber Zielwert 0 und Text ab", () => {
    expect(validate(form({ ziele: [mz({ kpis: [anfragenKpi({ zielwert: "", quelle: "" })] })] }), "kmu", HEUTE)).toBeNull();
    for (const w of ["0", "-3", "viel"]) {
      expect(validate(form({ ziele: [mz({ kpis: [anfragenKpi({ zielwert: w })] })] }), "kmu", HEUTE)).toContain("Der Zielwert muss eine Zahl über 0 sein");
    }
  });

  it("prüft die Quoten", () => {
    const q = (a: string, o: string, art: "auftraege" | "umsatz" = "auftraege") =>
      validate(form({ ziel: { ...form().ziel, art }, rueckwaerts: { anfragenZuOfferten: a, offertenZuAuftraegen: o } }), "kmu", HEUTE);
    expect(q("", "")).toBeNull();
    expect(q("5", "")).toBeNull(); // nur eine Quote: keine Rückwärtsrechnung
    expect(q("11", "4")).toContain("0 bis 10");
    expect(q("2.5", "4")).toContain("0 bis 10");
    expect(q("0", "4")).toContain("0 von 10");
    expect(q("5", "0")).toContain("0 von 10");
    expect(q("0", "0", "umsatz")).toBeNull(); // gilt für Umsatz nicht
    expect(q("10", "10")).toBeNull();
  });

  it("verlangt ein gültiges heutiges Datum", () => {
    expect(validate(form(), "kmu", "heute")).toBe("Das heutige Datum fehlt.");
  });

  it("formuliert alle Meldungen ruhig, in Du-Form und ohne Wörter der Sperrliste", () => {
    const z = form().ziel;
    const bad: [FormState, Typ][] = [
      [form({ ziel: { ...z, art: "" } }), "kmu"],
      [form({ ziel: { ...z, zielwert: "0" } }), "kmu"],
      [form({ ziel: { ...z, zielwert: "2000000000" } }), "kmu"],
      [form({ ziel: { ...z, ausgangswert: "-1" } }), "kmu"],
      [form({ ziel: { ...z, ausgangswert: "2000000000" } }), "kmu"],
      [form({ ziel: { ...z, ende: "" } }), "kmu"],
      [form({ ziel: { ...z, ende: "2040-01-01" } }), "kmu"],
      [form({ ziele: [emptyMarketingZiel()] }), "kmu"],
      [form({ ziele: [mz(), mz(), mz(), mz()] }), "kmu"],
      [form({ ziele: [mz({ text: "" })] }), "kmu"],
      [form({ ziele: [mz({ text: "a".repeat(141) })] }), "kmu"],
      [form({ ziele: [mz({ kpis: [anfragenKpi(), anfragenKpi(), anfragenKpi()] })] }), "kmu"],
      [form({ ziele: [mz({ kpis: [kpiForm({ zielwert: "3" })] })] }), "kmu"],
      [form({ ziele: [mz({ kpis: [anfragenKpi({ zielwert: "0" })] })] }), "kmu"],
      [form({ ziele: [mz({ kpis: [anfragenKpi({ zielwert: "2000000000" })] })] }), "kmu"],
      [form({ rueckwaerts: { anfragenZuOfferten: "11", offertenZuAuftraegen: "4" } }), "kmu"],
      [form({ rueckwaerts: { anfragenZuOfferten: "0", offertenZuAuftraegen: "4" } }), "kmu"],
    ];
    for (const [f, typ] of bad) {
      const m = validate(f, typ, HEUTE);
      expect(m).not.toBeNull();
      expect(brandHits(m!).filter((h) => h.level === "hart")).toEqual([]);
      expect(m).not.toMatch(/!|\bjetzt\b|—|ß|"/);
    }
    expect(bad.every(([f, typ]) => validate(f, typ, HEUTE) !== null)).toBe(true);
    const meldungen = new Set(bad.map(([f, typ]) => validate(f, typ, HEUTE)));
    expect(meldungen.size).toBe(bad.length); // jede Meldung ist anders
  });
});

// ---- Auswertung --------------------------------------------------------------------------------

describe("kpi-baum: auswerten", () => {
  it("gibt bei ungültiger Eingabe null zurück", () => {
    expect(auswerten(form({ ziele: [emptyMarketingZiel()] }), KMU)).toBeNull();
    expect(auswerten(vereinForm(), KMU)).toBeNull();
  });

  it("nummeriert die Marketingziele ohne Lücken und lässt leere Zeilen weg", () => {
    const e = ergebnis(form({ ziele: [emptyMarketingZiel(), mz(), emptyMarketingZiel(), mz({ text: "Mehr Bewertungen sammeln" })] }));
    expect(e.ziele.map((z) => z.nr)).toEqual([1, 2]);
    expect(e.ziele[1].text).toBe("Mehr Bewertungen sammeln");
    expect(e.ziele[0].kanalLabel).toBe("Google-Unternehmensprofil");
  });

  it("zählt Lücken je Marketingziel, «nicht prüfbar» ist keine Lücke", () => {
    const e = ergebnis(form({ ziele: [mz(), mz({ text: "Kurz", kanal: "" })] }));
    expect(e.ziele[0].luecken).toBe(0);
    expect(e.ziele[0].checks.map((c) => c.status)).toEqual(["ok", "ok", "ok", "offen"]);
    expect(e.ziele[1].luecken).toBe(1);
    expect(e.luecken).toBe(1);
  });

  it("zeigt bei einem Enddatum in der Vergangenheit trotzdem ein Ergebnis mit Lücke bei «terminiert»", () => {
    const e = ergebnis(form({ ziel: { ...form().ziel, ende: "2026-09-01" } }));
    expect(e.luecken).toBe(1);
    expect(e.ziele[0].checks.find((c) => c.key === "terminiert")!.status).toBe("fehlt");
    expect(e.ziel.monate).toBe(1);
    expect(e.rueckwaerts).toMatchObject({ ok: true, monate: 1, anfragen: 50, proMonat: { anfragen: 50 } });
  });

  it("rechnet das Beispiel aus dem Seitentext", () => {
    const e = ergebnis(BEISPIEL);
    expect(e.ziel.monate).toBe(3);
    expect(e.rueckwaerts).toMatchObject({ ok: true, auftraege: 12, offerten: 30, anfragen: 50, proMonat: { auftraege: 4, offerten: 10, anfragen: 17 } });
    expect(e.luecken).toBe(0);
    expect(e.ziele).toHaveLength(2);
    expect(e.messplan.map((r) => r.kpi)).toEqual(["Anfragen (Ziel 1)", "Bewertungen (Ziel 1)", "Termine (Ziel 2)"]);
    expect(e.ziel.satz).toBe("Bis 31.12.2026 willst du 30 Aufträge erhalten (Ausgangswert: 18 Aufträge).");
  });

  it("zeigt die Rückwärtsrechnung nur bei Kundschaft und Aufträgen und nur mit beiden Quoten", () => {
    expect(ergebnis().rueckwaerts).not.toBeNull();
    expect(ergebnis().rueckwaertsOffen).toBe(false);

    const ohne = ergebnis(form({ rueckwaerts: { anfragenZuOfferten: "", offertenZuAuftraegen: "" } }));
    expect(ohne.rueckwaerts).toBeNull();
    expect(ohne.rueckwaertsOffen).toBe(true);

    const eine = ergebnis(form({ rueckwaerts: { anfragenZuOfferten: "5", offertenZuAuftraegen: "" } }));
    expect(eine.rueckwaerts).toBeNull();
    expect(eine.rueckwaertsOffen).toBe(true);

    const umsatz = ergebnis(form({ ziel: { art: "umsatz", zielwert: "500000", ausgangswert: "380000", ende: "2026-12-31" } }));
    expect(umsatz.rueckwaerts).toBeNull();
    expect(umsatz.rueckwaertsOffen).toBe(false);
    expect(umsatz.ziel.satz).toBe("Bis 31.12.2026 willst du einen Umsatz von CHF 500'000.- erreichen (Ausgangswert: CHF 380'000.-).");

    const kunden = ergebnis(form({ ziel: { art: "kunden", zielwert: "20", ausgangswert: "", ende: "2026-12-31" } }));
    expect(kunden.rueckwaerts).toMatchObject({ ok: true, auftraege: 20 });
  });
});

describe("kpi-baum: Vereinsvariante", () => {
  it("spricht von Mitgliedern statt Kundschaft und rechnet nicht rückwärts", () => {
    const e = ergebnis(vereinForm(), VEREIN);
    expect(e.ziel.satz).toBe("Bis 31.12.2026 willst du 40 neue Mitglieder gewinnen.");
    expect(e.rueckwaerts).toBeNull();
    expect(e.rueckwaertsOffen).toBe(false);
    const md = reportMarkdown(e);
    expect(md).toContain("**Verein:** FC Trogen");
    expect(md).toContain("**Tätigkeit:** Fussball");
    expect(md).toContain("Neumitglieder: 10 pro Monat");
    expect(md).not.toContain("## Rückwärtsrechnung");
    expect(md).not.toContain("Betrieb");
    expect(md).not.toContain("Kundin");
  });

  it("prüft die Plausibilität mit Mitgliedern", () => {
    const zu = ergebnis(vereinForm({ ziele: [mz({ kanal: "instagram", kpis: [kpiForm({ kpi: "neumitglieder", zielwert: "50", zeitraum: "gesamt", quelle: "Mitgliederliste" })] })] }), VEREIN);
    expect(zu.ziele[0].checks.find((c) => c.key === "plausibel")!.status).toBe("fehlt");
    const ok = ergebnis(vereinForm(), VEREIN); // 10 pro Monat x 3 Monate = 30 von 40
    expect(ok.ziele[0].checks.find((c) => c.key === "plausibel")!.status).toBe("ok");
  });

  it("nennt Anmeldungen zum Anlass", () => {
    const e = ergebnis(
      vereinForm({
        ziel: { art: "anmeldungen", zielwert: "120", ausgangswert: "35", ende: "2026-11-15" },
        ziele: [mz({ text: "Mehr Anmeldungen über den Newsletter", kanal: "newsletter", kpis: [kpiForm({ kpi: "anmeldungen", zielwert: "85", zeitraum: "gesamt", quelle: "Anmeldeformular" })] })],
      }),
      VEREIN,
    );
    expect(e.ziel.satz).toBe("Bis 15.11.2026 willst du 120 Anmeldungen zum Anlass erhalten (Ausgangswert: 35 Anmeldungen zum Anlass).");
    expect(e.ziele[0].checks.find((c) => c.key === "plausibel")!.status).toBe("ok");
  });
});

// ---- Messplan ----------------------------------------------------------------------------------

describe("kpi-baum: Messplan", () => {
  it("hat je Kennzahl eine Zeile mit den sechs Spalten", () => {
    const rows = ergebnis(BEISPIEL).messplan;
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0])).toEqual(["kpi", "zielwert", "zeitraum", "ist", "quelle", "rhythmus"]);
    expect(rows[0]).toEqual({
      kpi: "Anfragen (Ziel 1)",
      zielwert: "17",
      zeitraum: "pro Monat (= 51 pro Quartal, 51 bis 31.12.2026)",
      ist: "",
      quelle: "Postfach und Telefonnotiz",
      rhythmus: "monatlich",
    });
    expect(rows[1]).toMatchObject({ zielwert: "9", zeitraum: "gesamt bis 31.12.2026 (= 3 pro Monat, 9 pro Quartal)", quelle: "Google-Unternehmensprofil" });
  });

  it("lässt «Ist» leer und den Zusatz «(Ziel n)» bei nur einem Marketingziel weg", () => {
    const rows = ergebnis().messplan;
    expect(rows).toHaveLength(1);
    expect(rows[0].kpi).toBe("Anfragen");
    expect(rows.every((r) => r.ist === "")).toBe(true);
  });

  it("schlägt monatlich vor, bei Website-Besuchen wöchentlich", () => {
    const e = ergebnis(
      form({
        ziele: [
          mz({
            kpis: [
              kpiForm({ kpi: "besuche", zielwert: "200", zeitraum: "monat", quelle: "Statistik des Hosters" }),
              kpiForm({ kpi: "profilaufrufe", zielwert: "300", zeitraum: "monat", quelle: "Instagram Insights" }),
            ],
          }),
          mz({ kpis: [kpiForm({ kpi: "bewertungen", zielwert: "2", zeitraum: "monat", quelle: "Google-Unternehmensprofil" })] }),
        ],
      }),
    );
    const byKpi = Object.fromEntries(e.messplan.map((r) => [r.kpi.split(" (")[0], r.rhythmus]));
    expect(byKpi).toEqual({ "Website-Besuche": "wöchentlich", Profilaufrufe: "monatlich", Bewertungen: "monatlich" });
  });

  it("zeigt fehlende Angaben als «offen» und eine eigene Messquelle im Klartext", () => {
    const e = ergebnis(
      form({
        ziele: [
          mz({
            kpis: [
              kpiForm({ kpi: "anfragen" }),
              kpiForm({ kpi: "termine", zielwert: "4", quelle: "andere", andere: "Strichliste am Empfang" }),
            ],
          }),
        ],
      }),
    );
    expect(e.messplan[0]).toMatchObject({ zielwert: "offen", zeitraum: "pro Monat", quelle: "offen" });
    expect(e.messplan[1]).toMatchObject({ zielwert: "4", quelle: "Strichliste am Empfang" });
    expect(e.ziele[0].checks.find((c) => c.key === "messbar")!.status).toBe("ok"); // die zweite Kennzahl ist vollständig
  });

  it("nimmt eine veraltete Messquelle nicht an", () => {
    const e = ergebnis(form({ ziele: [mz({ kpis: [anfragenKpi({ quelle: "Instagram Insights" })] })] }));
    expect(e.messplan[0].quelle).toBe("offen");
    expect(e.ziele[0].checks.find((c) => c.key === "messbar")!.status).toBe("fehlt");
  });

  it("ist als reine Funktion mit Zielen und Enddatum aufrufbar", () => {
    expect(messplan([], "2026-12-31")).toEqual([]);
  });
});

// ---- Baum als SVG ------------------------------------------------------------------------------

const count = (s: string, needle: string) => s.split(needle).length - 1;
const rects = (svg: string, kind: string) =>
  [...svg.matchAll(new RegExp(`<g data-node="${kind}"><rect x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"`, "g"))].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2]),
    w: Number(m[3]),
    h: Number(m[4]),
  }));

describe("kpi-baum: Baum als SVG", () => {
  const svg = treeSvg(baumModell(ergebnis(BEISPIEL)));

  it("zeichnet einen Knoten je Ziel, Marketingziel und Kennzahl und eine Linie je Verbindung", () => {
    expect(count(svg, 'data-node="ziel"')).toBe(1);
    expect(count(svg, 'data-node="marketingziel"')).toBe(2);
    expect(count(svg, 'data-node="kpi"')).toBe(3);
    expect(count(svg, "<rect ")).toBe(6);
    expect(count(svg, "<path ")).toBe(5); // 2 vom Ziel zu den Marketingzielen, 3 zu den Kennzahlen
  });

  it("ist ein Bild mit Beschriftung und viewBox", () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" role="img"')).toBe(true);
    expect(svg).toContain('aria-label="Baum: Unternehmensziel 30 Aufträge bis 31.12.2026; 2 Marketingziele; 3 Kennzahlen."');
    expect(svg).toMatch(/viewBox="-2 -2 764 [\d.]+"/);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("enthält Zielwerte, Quellen und Kanal als Text", () => {
    expect(svg).toContain(">Unternehmensziel</text>");
    expect(svg).toContain(">Marketingziel 1</text>");
    expect(svg).toContain(">17 pro Monat</text>");
    expect(svg).toContain(">9 gesamt</text>");
    expect(svg).toContain(">Kanal: Website</text>");
  });

  it("hat keine NaN, keine Verläufe und nutzt die Design-Tokens", () => {
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(svg).not.toMatch(/gradient/i);
    expect(svg).not.toMatch(/filter|shadow/i);
    for (const token of ["--ink", "--page", "--surface", "--paper", "--muted", "--yellow"]) expect(svg).toContain(`var(${token},`);
  });

  it("hält alle Knoten im Bild und ohne Überlappung in jeder Spalte", () => {
    for (const kind of ["ziel", "marketingziel", "kpi"]) {
      const list = rects(svg, kind);
      expect(list.length).toBeGreaterThan(0);
      for (const r of list) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(760);
        expect(r.y).toBeGreaterThanOrEqual(0);
      }
      for (let i = 1; i < list.length; i++) expect(list[i].y).toBeGreaterThanOrEqual(list[i - 1].y + list[i - 1].h);
    }
  });

  it("bricht lange Texte nach Zeichenzahl um und lässt keine Zeile über die Spaltenbreite laufen", () => {
    const lang = "Mehr Anfragen über Google und Empfehlungen aus dem Dorf, damit Eigentümer älterer Einfamilienhäuser uns zuerst anfragen";
    const e = ergebnis(form({ ziele: [mz({ text: lang.slice(0, 120) })] }));
    const out = treeSvg(baumModell(e));
    const lines = [...out.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(lines.length).toBeGreaterThan(8);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(22);
    expect(lines.join(" ")).toContain("Eigentümer");
    const goal = rects(out, "marketingziel")[0];
    expect(goal.h).toBeGreaterThan(130);
  });

  it("maskiert Sonderzeichen im Text", () => {
    const e = ergebnis(form({ ziele: [mz({ text: 'Preise <b> & "Rabatt" im Blick' })] }));
    const out = treeSvg(baumModell(e));
    expect(out).toContain("&lt;b&gt;");
    expect(out).toContain("&amp;");
    expect(out).toContain("&quot;Rabatt&quot;");
    expect(out).not.toContain("<b>");
  });

  it("zeichnet bei einem langen Wort ohne Leerzeichen keine überlange Zeile", () => {
    const e = ergebnis(form({ ziele: [mz({ text: "Qualitätssicherungsmassnahmenkatalog2026" })] }));
    const lines = [...treeSvg(baumModell(e)).matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(22);
  });

  it("zeichnet auch einen Baum ohne Marketingziele und ohne Kennzahlen", () => {
    const leer = treeSvg({ ziel: { titel: "Unternehmensziel", text: "30 Aufträge bis 31.12.2026", detail: null }, ziele: [] });
    expect(count(leer, "<rect ")).toBe(1);
    expect(count(leer, "<path ")).toBe(0);
    expect(leer).not.toMatch(/NaN|undefined/);
    expect(leer).toContain("0 Marketingziele; 0 Kennzahlen.");

    const ohneKpi = treeSvg({
      ziel: { titel: "Unternehmensziel", text: "30 Aufträge bis 31.12.2026", detail: null },
      ziele: [{ titel: "Marketingziel 1", text: "Mehr Anfragen über Google", detail: "Kanal fehlt", kpis: [] }],
    });
    expect(count(ohneKpi, "<rect ")).toBe(2);
    expect(count(ohneKpi, "<path ")).toBe(1);
    expect(ohneKpi).toContain("1 Marketingziel; 0 Kennzahlen.");
  });

  it("beschreibt den Baum mit der richtigen Einzahl", () => {
    const m = baumModell(ergebnis());
    expect(baumBeschriftung(m)).toBe("Baum: Unternehmensziel 30 Aufträge bis 31.12.2026; 1 Marketingziel; 1 Kennzahl.");
  });

  it("legt das Modell und die Listenzeilen fest", () => {
    const m = baumModell(ergebnis(form({ ziele: [mz({ kanal: "", kpis: [anfragenKpi({ zielwert: "", quelle: "" })] })] })));
    expect(m.ziel).toEqual({ titel: "Unternehmensziel", text: "30 Aufträge bis 31.12.2026", detail: "Ausgangswert: 18 Aufträge" });
    expect(m.ziele[0].detail).toBe("Kanal fehlt");
    expect(m.ziele[0].kpis[0]).toEqual({ titel: "Anfragen", text: "Zielwert offen", detail: "Quelle: offen" });
    expect(baumZeile(m.ziel)).toBe("Unternehmensziel: 30 Aufträge bis 31.12.2026 (Ausgangswert: 18 Aufträge)");
    expect(baumZeile({ titel: "Anfragen", text: "17 pro Monat", detail: null })).toBe("Anfragen: 17 pro Monat");
  });
});

describe("kpi-baum: Textumbruch", () => {
  it("bricht nach Zeichenzahl um", () => {
    expect(wrapText("Mehr Anfragen über Google", 14)).toEqual(["Mehr Anfragen", "über Google"]);
    expect(wrapText("  viele   Leerzeichen  ", 12)).toEqual(["viele", "Leerzeichen"]);
    expect(wrapText("", 10)).toEqual([]);
    expect(wrapText("   ", 10)).toEqual([]);
  });

  it("zerlegt lange Wörter, lieber nach einem Bindestrich", () => {
    expect(wrapText("Unternehmensprofil", 8)).toEqual(["Unterneh", "mensprof", "il"]);
    expect(wrapText("Google-Unternehmensprofil", 20)).toEqual(["Google-", "Unternehmensprofil"]);
    expect(wrapText("Quelle: Statistik im Google-Unternehmensprofil", 20)).toEqual(["Quelle: Statistik im", "Google-", "Unternehmensprofil"]);
  });

  it("macht nie eine Zeile länger als die Grenze", () => {
    const text = "Aufträge und Anfragen: Qualitätssicherungsmassnahmen für Einfamilienhäuser in Gossau, Herisau und Wil";
    for (const max of [1, 5, 12, 22]) for (const l of wrapText(text, max)) expect(l.length).toBeLessThanOrEqual(max);
  });
});

// ---- CSV ---------------------------------------------------------------------------------------

describe("kpi-baum: CSV-Vorlage", () => {
  it("beginnt mit BOM, trennt mit Semikolon und endet mit CRLF", () => {
    const csv = toCsv(ergebnis(BEISPIEL));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(new TextEncoder().encode(csv).slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]));
    expect(csv.endsWith("\r\n")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(5); // Kopf, 3 Kennzahlen, leere Zeile am Ende
    expect(lines[0]).toBe("KPI;Zielwert;Quelle;Okt;Nov;Dez;Jan;Feb;Mär;Apr;Mai;Jun;Jul;Aug;Sep");
    expect(lines[1]).toBe("Anfragen (Ziel 1);17 pro Monat;Postfach und Telefonnotiz;;;;;;;;;;;;");
    expect(lines[2]).toBe("Bewertungen (Ziel 1);9 gesamt bis 31.12.2026;Google-Unternehmensprofil;;;;;;;;;;;;");
    for (const l of lines.slice(0, 4)) expect(l.split(";")).toHaveLength(15);
  });

  it("lässt die zwölf Monatsspalten leer", () => {
    const rows = toCsv(ergebnis(BEISPIEL)).slice(1).split("\r\n").slice(1, 4);
    for (const r of rows) expect(r.split(";").slice(3).every((c) => c === "")).toBe(true);
  });

  it("beginnt die Monate im Monat des heutigen Datums, auch über den Jahreswechsel", () => {
    expect(monatsSpalten("2026-10-05")).toEqual(["Okt", "Nov", "Dez", "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep"]);
    expect(monatsSpalten("2026-01-15")[0]).toBe("Jan");
    expect(monatsSpalten("2026-01-15")[11]).toBe("Dez");
    expect(monatsSpalten("2026-12-31")).toEqual(["Dez", "Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov"]);
    expect(monatsSpalten("kaputt")[0]).toBe("Jan");
    const dez = toCsv(ergebnis(form({ ziel: { ...form().ziel, ende: "2027-06-30" } }), { ...KMU, heute: "2026-12-31" }));
    expect(dez.slice(1).split("\r\n")[0]).toBe("KPI;Zielwert;Quelle;Dez;Jan;Feb;Mär;Apr;Mai;Jun;Jul;Aug;Sep;Okt;Nov");
  });

  it("setzt Zellen mit Semikolon oder Anführungszeichen in Anführungszeichen", () => {
    const e = ergebnis(form({ ziele: [mz({ kpis: [anfragenKpi({ quelle: "andere", andere: 'Excel; Blatt "Anfragen"' })] })] }));
    expect(toCsv(e)).toContain('"Excel; Blatt ""Anfragen"""');
  });

  it("schreibt fehlende Angaben als «offen» (Zielwert) und leer (Quelle)", () => {
    const e = ergebnis(form({ ziele: [mz({ kpis: [anfragenKpi({ zielwert: "", quelle: "" })] })] }));
    expect(toCsv(e).slice(1).split("\r\n")[1]).toBe("Anfragen;offen;;;;;;;;;;;;;");
  });

  it("benennt die Datei nach dem Betrieb", () => {
    expect(csvFilename("Malerei Keller, Gossau")).toBe("kpi-messplan-malerei-keller-gossau.csv");
    expect(csvFilename("")).toBe("kpi-messplan-betrieb.csv");
  });
});

// ---- Dokument ----------------------------------------------------------------------------------

describe("kpi-baum: Dokument", () => {
  const headings = (blocks: ReturnType<typeof toDocument>["blocks"]) => blocks.flatMap((b) => (b.type === "heading" ? [b.text] : []));

  it("folgt der Reihenfolge Kopf, Ziel in einem Satz, Baum, SMART-Check, Rückwärtsrechnung, Messplan, Hinweise", () => {
    const doc = toDocument(ergebnis(BEISPIEL));
    expect(headings(doc.blocks)).toEqual(["Das Ziel in einem Satz", "Der Baum", "SMART-Check", "Rückwärtsrechnung", "Messplan", "Drei Hinweise"]);
    expect(doc.blocks[0].type).toBe("facts");
    expect(doc.title).toBe("Ziel- und KPI-Baum");
    expect(doc.subtitle).toBe("30 Aufträge bis 31.12.2026");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.datum).toBe("05.10.2026");
    expect(doc.filename).toBe("kpi-baum-malerei-keller");
  });

  it("stellt den Baum als verschachtelte Liste dar", () => {
    const { baum } = documentParts(ergebnis(BEISPIEL));
    expect(baum[1]).toEqual({ type: "paragraph", text: "Unternehmensziel: 30 Aufträge bis 31.12.2026 (Ausgangswert: 18 Aufträge)" });
    const liste = baum[2];
    expect(liste.type).toBe("list");
    if (liste.type !== "list") return;
    expect(liste.items).toHaveLength(2);
    expect(liste.items[0]).toBe(
      "Marketingziel 1: Mehr Anfragen über Google (Kanal: Google-Unternehmensprofil)\n  - Anfragen: 17 pro Monat (Quelle: Postfach und Telefonnotiz)\n  - Bewertungen: 9 gesamt (Quelle: Google-Unternehmensprofil)",
    );
  });

  it("hat die SMART-Tabelle mit den vier geprüften Spalten und dem Hinweis", () => {
    const tabelle = documentParts(ergebnis(form({ ziele: [mz(), mz({ text: "Kurz", kanal: "" })] }))).rest.find((b) => b.type === "table");
    expect(tabelle).toBeDefined();
    if (!tabelle || tabelle.type !== "table") return;
    expect(tabelle.header).toEqual(["Marketingziel", "Spezifisch", "Messbar", "Terminiert", "Plausibel", "Hinweis"]);
    expect(tabelle.rows[0]).toEqual(["1. Mehr Anfragen über Google", "erfüllt", "erfüllt", "erfüllt", "nicht prüfbar", "Nichts offen."]);
    expect(tabelle.rows[1].slice(0, 5)).toEqual(["2. Kurz", "fehlt", "erfüllt", "erfüllt", "nicht prüfbar"]);
    expect(tabelle.rows[1][5]).toBe("Spezifisch: Der Text hat nur 4 Zeichen (mindestens 10) und es fehlt ein Kanal.");
    expect(tabelle.widths).toHaveLength(6);
  });

  it("sagt offen, dass «attraktiv» und «realistisch» nicht geprüft werden", () => {
    const md = reportMarkdown(ergebnis());
    expect(md).toContain(NICHT_GEPRUEFT);
    expect(md).toContain(PLAUSIBEL_NOTE);
  });

  it("hat die Messplan-Tabelle mit sechs Spalten", () => {
    const doc = toDocument(ergebnis(BEISPIEL));
    const tabellen = doc.blocks.filter((b) => b.type === "table");
    const plan = tabellen[tabellen.length - 1];
    if (plan.type !== "table") throw new Error("keine Tabelle");
    expect(plan.header).toEqual(["KPI", "Zielwert", "Zeitraum", "Ist", "Messquelle", "Rhythmus"]);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows.every((r) => r[3] === "")).toBe(true);
    expect(plan.widths).toHaveLength(6);
  });

  it("zeigt den Hinweis oben nur, wenn etwas fehlt, und zählt richtig", () => {
    const first = (e: Ergebnis) => {
      const b = toDocument(e).blocks[0];
      return b.type === "paragraph" ? b.text : "";
    };
    expect(first(ergebnis(BEISPIEL))).toBe("");
    expect(toDocument(ergebnis(BEISPIEL)).blocks[0].type).toBe("facts");
    expect(first(ergebnis(form({ ziele: [mz({ kanal: "" })] })))).toBe("Hinweis: Beim Marketingziel fehlt noch etwas. Der Baum steht trotzdem; die Lücken stehen im SMART-Check.");
    expect(first(ergebnis(form({ ziele: [mz(), mz({ kanal: "" })] })))).toBe("Hinweis: Bei 1 von 2 Marketingzielen fehlt noch etwas. Der Baum steht trotzdem; die Lücken stehen im SMART-Check.");
    expect(first(ergebnis(form({ ziele: [mz({ kanal: "" }), mz({ kanal: "" })] })))).toBe("Hinweis: Bei allen 2 Marketingzielen fehlt noch etwas. Der Baum steht trotzdem; die Lücken stehen im SMART-Check.");
  });

  it("zeigt die Rückwärtsrechnung als Annahme mit nachvollziehbarer Rechnung", () => {
    const md = reportMarkdown(ergebnis());
    expect(md).toContain("## Rückwärtsrechnung");
    expect(md).toContain(ANNAHME_NOTE);
    expect(md).toContain("Von 10 Anfragen werden 6 zu Offerten, von 10 Offerten werden 4 zu Aufträgen. Bis zum 31.12.2026 sind es 3 Monate.");
    expect(md).toContain("| Aufträge (Zielwert minus Ausgangswert) | 12 | 4 |");
    expect(md).toContain("| Offerten (4 von 10 werden zum Auftrag) | 30 | 10 |");
    expect(md).toContain("| Anfragen (6 von 10 werden zur Offerte) | 50 | 17 |");
    expect(md).toContain("Rechnung: 30 minus 18 = 12 Aufträge.");
    expect(md).not.toContain("Annahme: Jede neue Kundin und jeder neue Kunde");
  });

  it("nennt bei neuer Kundschaft die Annahme «ein Auftrag je Kunde»", () => {
    const md = reportMarkdown(ergebnis(form({ ziel: { art: "kunden", zielwert: "20", ausgangswert: "", ende: "2026-12-31" } })));
    expect(md).toContain("Annahme: Jede neue Kundin und jeder neue Kunde bringt einen Auftrag.");
  });

  it("lässt die Rückwärtsrechnung bei Umsatz weg und weist bei fehlenden Quoten darauf hin", () => {
    const umsatz = reportMarkdown(ergebnis(form({ ziel: { art: "umsatz", zielwert: "500000", ausgangswert: "", ende: "2026-12-31" } })));
    expect(umsatz).not.toContain("Rückwärtsrechnung");
    const ohne = reportMarkdown(ergebnis(form({ rueckwaerts: { anfragenZuOfferten: "", offertenZuAuftraegen: "" } })));
    expect(ohne).toContain("## Rückwärtsrechnung");
    expect(ohne).toContain("Du hast die beiden Quoten nicht angegeben.");
  });

  it("sagt, wenn das Ziel mit dem Ausgangswert schon erreicht ist", () => {
    const md = reportMarkdown(ergebnis(form({ ziel: { ...form().ziel, ausgangswert: "35" } })));
    expect(md).toContain("Dein Ausgangswert erreicht das Ziel schon");
    expect(md).not.toContain("| Schritt |");
  });

  it("enthält drei Hinweise und keine unsauberen Zeichen", () => {
    expect(HINWEISE).toHaveLength(3);
    const md = reportMarkdown(ergebnis(BEISPIEL));
    for (const h of HINWEISE) expect(md).toContain(h);
    expect(md).not.toMatch(/NaN|undefined|Infinity|null/);
    expect(md).not.toContain("—");
    expect(md).not.toContain("!");
    expect(md.startsWith("# Ziel- und KPI-Baum\n")).toBe(true);
    expect(md.endsWith("\n")).toBe(false);
  });

  it("verwendet keine Wörter der Sperrliste", () => {
    const e = ergebnis(BEISPIEL);
    const texte = [
      reportMarkdown(e),
      reportMarkdown(ergebnis(form({ ziele: [mz({ text: "Kurz", kanal: "" })], rueckwaerts: { anfragenZuOfferten: "", offertenZuAuftraegen: "" } }))),
      reportMarkdown(ergebnis(vereinForm(), VEREIN)),
      eingabeText(e),
      HINWEISE.join("\n"),
      ZIEL_ARTEN.map((a) => a.label).join("\n"),
      KPIS.flatMap((k) => [k.label, ...k.quellen]).join("\n"),
    ];
    for (const t of texte) expect(brandHits(t).filter((h) => h.level === "hart")).toEqual([]);
  });
});

// ---- Eingabe fürs CRM --------------------------------------------------------------------------

describe("kpi-baum: eingabeText", () => {
  it("nennt die Angaben je Zeile", () => {
    expect(eingabeText(ergebnis(BEISPIEL))).toBe(
      [
        "Betrieb: Malerei Keller",
        "Branche: Malerei",
        "Unternehmensziel: 30 Aufträge bis 31.12.2026 (Ausgangswert: 18 Aufträge)",
        "Marketingziel 1: Mehr Anfragen über Google | Kanal: Google-Unternehmensprofil",
        "  Kennzahl: Anfragen, 17 pro Monat, Messquelle: Postfach und Telefonnotiz",
        "  Kennzahl: Bewertungen, 9 gesamt bis 31.12.2026, Messquelle: Google-Unternehmensprofil",
        "Marketingziel 2: Besichtigungstermine online buchbar machen | Kanal: Website",
        "  Kennzahl: Termine, 8 pro Monat, Messquelle: Kalender oder Buchungswerkzeug",
        "Rückwärtsrechnung (Annahmen): 6 von 10 Anfragen werden zu Offerten, 4 von 10 Offerten werden zu Aufträgen",
      ].join("\n"),
    );
  });

  it("lässt die Rückwärtsrechnung ohne Quoten weg und nennt offene Angaben", () => {
    const e = ergebnis(form({ ziele: [mz({ kanal: "", kpis: [anfragenKpi({ zielwert: "", quelle: "" })] })], rueckwaerts: { anfragenZuOfferten: "", offertenZuAuftraegen: "" } }));
    const text = eingabeText(e);
    expect(text).not.toContain("Rückwärtsrechnung");
    expect(text).toContain("| Kanal: offen");
    expect(text).toContain("Kennzahl: Anfragen, Zielwert offen, Messquelle: offen");
  });

  it("spricht bei Vereinen von Verein und Tätigkeit", () => {
    expect(eingabeText(ergebnis(vereinForm(), VEREIN)).split("\n").slice(0, 3)).toEqual([
      "Verein: FC Trogen",
      "Tätigkeit: Fussball",
      "Unternehmensziel: 40 neue Mitglieder bis 31.12.2026",
    ]);
  });

  it("kommt ohne Firma und Branche aus", () => {
    const text = eingabeText(ergebnis(form(), { ...KMU, firma: "", branche: "" }));
    expect(text.split("\n")[0]).toBe("Betrieb: keine Angabe");
    expect(text).not.toContain("Branche:");
  });

  it("bleibt kurz genug, dass das Wichtigste vor der Kürzung auf 1'900 Zeichen steht", () => {
    expect(eingabeText(ergebnis(BEISPIEL)).length).toBeLessThan(1900);
    expect(reportMarkdown(ergebnis(BEISPIEL)).slice(0, 1900)).toContain("## Der Baum");
  });
});

// ---- Gespeicherter Stand -----------------------------------------------------------------------

describe("kpi-baum: parseState", () => {
  const output = { datum: HEUTE, typ: "kmu" as const, firma: "Malerei Keller", branche: "Malerei" };
  const result = (extra: Record<string, unknown> = {}) => ({ v: 1, phase: "result", ...BEISPIEL, output, ...extra });

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const bad of [null, undefined, "x", 42, [], true, {}, { v: 2 }, { v: "1" }]) expect(parseState(bad)).toEqual(EMPTY_STATE);
  });

  it("fängt falsche Feldtypen ab und behält eine leere Zeile", () => {
    const s = parseState({ v: 1, phase: "result", ziel: 5, ziele: "x", rueckwaerts: [], output: "x" });
    expect(s.phase).toBe("edit");
    expect(s.ziel).toEqual({ art: "", zielwert: "", ausgangswert: "", ende: "" });
    expect(s.ziele).toEqual([emptyMarketingZiel()]);
    expect(s.rueckwaerts).toEqual({ anfragenZuOfferten: "", offertenZuAuftraegen: "" });
    expect(s.output).toBeUndefined();
  });

  it("verwirft unbekannte Schlüssel und ungültige Werte einzeln", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      ziel: { art: "gewinn", zielwert: 5, ausgangswert: "7", ende: "morgen" },
      ziele: [{ text: 7, kanal: "tiktok", kpis: [{ kpi: "likes", zielwert: "3", zeitraum: "jahr", quelle: 4, andere: null }, "x"] }, null],
    });
    expect(s.ziel).toEqual({ art: "", zielwert: "", ausgangswert: "7", ende: "" });
    expect(s.ziele[0]).toEqual({ text: "", kanal: "", kpis: [{ kpi: "", zielwert: "3", zeitraum: "monat", quelle: "", andere: "" }, emptyKpi()] });
    expect(s.ziele[1]).toEqual(emptyMarketingZiel());
  });

  it("schneidet mehr als drei Ziele, mehr als zwei Kennzahlen und lange Texte ab", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      ziele: [1, 2, 3, 4, 5].map(() => ({ text: "x".repeat(500), kanal: "website", kpis: [anfragenKpi(), anfragenKpi(), anfragenKpi()] })),
    });
    expect(s.ziele).toHaveLength(3);
    expect(s.ziele[0].kpis).toHaveLength(2);
    expect(s.ziele[0].text).toHaveLength(140);
  });

  it("behält ein gültiges Ergebnis samt Datum", () => {
    const s = parseState(result());
    expect(s.phase).toBe("result");
    expect(s.output).toEqual(output);
    expect(s.ziele).toEqual(BEISPIEL.ziele);
    expect(auswerten(s, { ...s.output!, heute: s.output!.datum })).not.toBeNull();
  });

  it("fällt auf «edit» zurück, wenn das Ergebnis nicht tragen würde", () => {
    expect(parseState(result({ output: undefined })).phase).toBe("edit");
    expect(parseState(result({ output: { ...output, datum: "gestern" } })).phase).toBe("edit");
    expect(parseState(result({ output: { ...output, typ: "gmbh" } })).phase).toBe("edit");
    expect(parseState(result({ ziele: [] })).phase).toBe("edit");
    expect(parseState(result({ ziel: { ...BEISPIEL.ziel, zielwert: "0" } })).phase).toBe("edit");
    expect(parseState(result({ output: { ...output, typ: "verein" } })).phase).toBe("edit"); // «Aufträge» gibt es für Vereine nicht
    expect(parseState({ ...result(), phase: "fertig" }).phase).toBe("edit");
  });

  it("übersteht einen Durchlauf durch JSON", () => {
    const s = parseState(result());
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const edit = parseState({ v: 1, phase: "edit", ...BEISPIEL });
    expect(edit.phase).toBe("edit");
    expect(parseState(JSON.parse(JSON.stringify(edit)))).toEqual(edit);
  });

  it("erkennt der Fortschritt im Pfad als erledigt (phase «result»)", async () => {
    const { isToolDone } = await import("@/lib/progress");
    expect(isToolDone(JSON.stringify(parseState(result())))).toBe(true);
    expect(isToolDone(JSON.stringify(parseState({ v: 1, phase: "edit", ...BEISPIEL })))).toBe(false);
  });
});

// ---- Werkzeug-Konfiguration --------------------------------------------------------------------

describe("kpi-baum: Konfiguration", () => {
  it("stimmt mit dem Auftrag überein", () => {
    expect(config).toMatchObject({
      slug: "kpi-baum",
      name: "Ziel- und KPI-Baum",
      category: "strategie",
      audience: "beide",
      keyword: "KPI",
      related: ["budget-planer", "reifegrad-check", "strategie-einseiter"],
      needsServer: false,
      usesProfile: ["firma", "branche", "organisationstyp"],
      writesProfile: [],
      outputs: ["copy", "pdf", "docx", "csv"],
      estimatedMinutes: 8,
      pathStep: { path: "strategie", order: 13 },
      featured: false,
    });
    expect(config.tagline.length).toBeLessThanOrEqual(110);
  });
});

// ---- Export ------------------------------------------------------------------------------------

describe("kpi-baum: PDF und Word", () => {
  const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
  const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
  const doc = toDocument(ergebnis(BEISPIEL));

  it("baut ein PDF, in dem jedes Zeichen des Dokuments in der Schrift vorkommt", async () => {
    const bytes = await buildPdf(doc, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

    const probe = await PDFDocument.create();
    probe.registerFontkit(fontkit);
    const set = new Set((await probe.embedFont(fonts.body, { subset: true })).getCharacterSet());
    const text = [doc.title, doc.subtitle ?? "", reportMarkdown(ergebnis(BEISPIEL)), reportMarkdown(ergebnis(vereinForm(), VEREIN))].join("\n");
    const missing = [...new Set([...text].filter((c) => c !== "\n" && c !== "#" && !set.has(c.codePointAt(0)!)))];
    expect(missing).toEqual([]);
  });

  it("baut ein Word-Dokument mit Baum, Tabellen und Hinweisen", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(doc));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Marketingziel 1: Mehr Anfragen über Google");
    expect(xml).toContain("SMART-Check");
    expect(xml).toContain("Messplan");
    expect(xml.match(/<w:tbl>/g)).toHaveLength(4); // Steckbrief, SMART-Check, Rückwärtsrechnung, Messplan
  });
});
