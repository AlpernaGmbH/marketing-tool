import { describe, expect, it } from "vitest";
import { KANTONE, chf, dateCH, minutesLabel, numberCH, pctCH, typoCH, uidValid } from "@/lib/ch";

describe("chf", () => {
  it("formatiert ganze Franken mit .-", () => {
    expect(chf(1000)).toBe("CHF 1'000.-");
    expect(chf(0)).toBe("CHF 0.-");
    expect(chf(999)).toBe("CHF 999.-");
    expect(chf(1234567)).toBe("CHF 1'234'567.-");
  });
  it("formatiert Rappen mit zwei Stellen", () => {
    expect(chf(1000.5)).toBe("CHF 1'000.50");
    expect(chf(19.05)).toBe("CHF 19.05");
    expect(chf(0.1 + 0.2)).toBe("CHF 0.30");
  });
  it("rundet auf Rappen und behandelt negative Werte", () => {
    expect(chf(10.999)).toBe("CHF 11.-");
    expect(chf(-1500)).toBe("CHF -1'500.-");
    expect(chf(-0.001)).toBe("CHF 0.-");
  });
  it("stürzt bei NaN und Unendlich nicht ab", () => {
    expect(chf(NaN)).toBe("CHF –");
    expect(chf(Infinity)).toBe("CHF –");
  });
});

describe("numberCH und pctCH", () => {
  it("nutzt Apostroph und Komma", () => {
    expect(numberCH(1234.5)).toBe("1'234,5");
    expect(numberCH(1000)).toBe("1'000");
    expect(numberCH(0.04, 1)).toBe("0");
    expect(numberCH(-12.34, 2)).toBe("-12,34");
  });
  it("setzt Prozent mit Leerzeichen", () => {
    expect(pctCH(8.1)).toBe("8,1 %");
    expect(pctCH(25)).toBe("25 %");
  });
});

describe("dateCH", () => {
  it("liefert TT.MM.JJJJ", () => {
    expect(dateCH(new Date("2026-10-03T10:00:00Z"))).toBe("03.10.2026");
    expect(dateCH("2026-01-05T12:00:00Z")).toBe("05.01.2026");
  });
  it("rechnet in Schweizer Zeit (Mitternacht UTC ist schon der nächste Tag im Sommer)", () => {
    expect(dateCH(new Date("2026-07-14T22:30:00Z"))).toBe("15.07.2026");
  });
  it("gibt bei ungültigem Datum einen Strich zurück", () => {
    expect(dateCH("kein datum")).toBe("–");
  });
});

describe("typoCH", () => {
  it("ersetzt ß durch ss", () => {
    expect(typoCH("Die Straße ist groß. GROẞ")).toBe("Die Strasse ist gross. GROSS");
  });
  it("setzt «» statt gerader und deutscher Anführungszeichen", () => {
    expect(typoCH('Er sagte "Guten Tag" und „Auf Wiedersehen“.')).toBe("Er sagte «Guten Tag» und «Auf Wiedersehen».");
    expect(typoCH("Das ist “neu”.")).toBe("Das ist «neu».");
  });
  it("lässt unausgeglichene Anführungszeichen unangetastet", () => {
    expect(typoCH('Ein " allein')).toBe('Ein " allein');
  });
  it("setzt einfache Anführungszeichen als ‹›, aber keinen Apostroph um", () => {
    expect(typoCH("Er nannte es ‘Stein’.")).toBe("Er nannte es ‹Stein›.");
    expect(typoCH("Sie geht’s an.")).toBe("Sie geht’s an.");
  });
  it("setzt Tausenderapostroph bei CHF-Beträgen", () => {
    expect(typoCH("Das kostet CHF 1000.- im Jahr")).toBe("Das kostet CHF 1'000.- im Jahr");
    expect(typoCH("CHF 12500 und CHF 999")).toBe("CHF 12'500 und CHF 999");
    expect(typoCH("CHF 1'000.-")).toBe("CHF 1'000.-");
  });
  it("macht aus typografischem Apostroph zwischen Ziffern einen geraden", () => {
    expect(typoCH("1’000 Mitglieder")).toBe("1'000 Mitglieder");
  });
  it("setzt Prozent mit Leerzeichen", () => {
    expect(typoCH("8,1% und 25 % und 3%")).toBe("8,1 % und 25 % und 3 %");
  });
  it("füllt Datum mit Nullen auf", () => {
    expect(typoCH("Am 3.10.2026 und 03.10.2026")).toBe("Am 03.10.2026 und 03.10.2026");
    expect(typoCH("Version 1.2.3 bleibt")).toBe("Version 1.2.3 bleibt");
  });
  it("ist idempotent", () => {
    const once = typoCH('Er sagte "Hallo" zu 8% der Straße, CHF 1000.- am 3.10.2026');
    expect(typoCH(once)).toBe(once);
  });
});

describe("uidValid", () => {
  it("erkennt echte UIDs (Google Switzerland GmbH)", () => {
    expect(uidValid("CHE-116.281.710")).toBe(true);
  });
  it("akzeptiert Schreibvarianten und Zusätze", () => {
    expect(uidValid("CHE116281710")).toBe(true);
    expect(uidValid("che-116.281.710")).toBe(true);
    expect(uidValid("CHE-116.281.710 MWST")).toBe(true);
    expect(uidValid("  CHE-116.281.710 HR ")).toBe(true);
  });
  it("lehnt falsche Prüfziffer, Format und Müll ab", () => {
    expect(uidValid("CHE-116.281.711")).toBe(false);
    expect(uidValid("CHE-116.281")).toBe(false);
    expect(uidValid("116.281.710")).toBe(false);
    expect(uidValid("")).toBe(false);
    expect(uidValid("CHE-ABC.DEF.GHI")).toBe(false);
  });
  it("lehnt Nummern ab, deren Prüfziffer rechnerisch 10 wäre", () => {
    // 5*0+4*0+3*0+2*0+7*0+6*0+5*0+4*3=12 -> 12 mod 11 = 1 -> 10
    expect(uidValid("CHE-000.000.030")).toBe(false);
  });
});

describe("minutesLabel", () => {
  it("unterscheidet Einzahl und Mehrzahl", () => {
    expect(minutesLabel(1)).toBe("1 Minute");
    expect(minutesLabel(8)).toBe("8 Minuten");
    expect(minutesLabel(0)).toBe("0 Minuten");
  });
});

describe("KANTONE", () => {
  it("enthält alle 26 Kantone einmal", () => {
    expect(KANTONE).toHaveLength(26);
    expect(new Set(KANTONE.map(([c]) => c)).size).toBe(26);
    expect(KANTONE.find(([c]) => c === "AR")?.[1]).toBe("Appenzell Ausserrhoden");
  });
});

describe("numberCH ohne Nachkommastellen", () => {
  it("kürzt keine Nullen ganzer Zahlen", () => {
    expect(numberCH(100, 0)).toBe("100");
    expect(numberCH(10, 0)).toBe("10");
    expect(numberCH(1000, 0)).toBe("1'000");
    expect(numberCH(0, 0)).toBe("0");
    expect(pctCH(100, 0)).toBe("100 %");
  });
  it("kürzt weiter Nachkomma-Nullen", () => {
    expect(numberCH(100)).toBe("100");
    expect(numberCH(8.10)).toBe("8,1");
    expect(numberCH(2.5, 2)).toBe("2,5");
    expect(pctCH(12.0)).toBe("12 %");
  });
});
