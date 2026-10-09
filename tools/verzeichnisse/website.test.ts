import { describe, expect, it } from "vitest";
import { adressenAus, kontaktAus, kontaktVorschlaege, telefonAus, telefonAnzeige, KONTAKT_LABEL } from "./website";

// Angaben aus der eigenen Website: feste Muster auf dem gelesenen Text der Startseite (lib/read.ts), kein Netz, keine KI.

describe("verzeichnisse: Adressen aus dem Text der Website", () => {
  it("findet «Strasse Nr, PLZ Ort» in der Fusszeile", () => {
    expect(adressenAus("© 2026 Malerei Keller Wilerstrasse 24, 9200 Gossau Tel. 071 123 45 67 Impressum")).toEqual([
      { strasse: "Wilerstrasse 24", plz: "9200", ort: "Gossau" },
    ]);
  });

  it("nimmt Strassen mit Vorwort, mit Buchstabe an der Nummer und ohne Komma", () => {
    expect(adressenAus("Im Dorf 5 9100 Herisau")).toEqual([{ strasse: "Im Dorf 5", plz: "9100", ort: "Herisau" }]);
    expect(adressenAus("Obere Mühlestrasse 5a, 9000 St. Gallen")).toEqual([{ strasse: "Obere Mühlestrasse 5a", plz: "9000", ort: "St. Gallen" }]);
    expect(adressenAus("Rosenberg 12, CH-9200 Gossau")).toEqual([{ strasse: "Rosenberg 12", plz: "9200", ort: "Gossau" }]);
  });

  it("lässt Kanton, Telefon und andere Wörter nach dem Ort weg", () => {
    expect(adressenAus("Bahnhofstrasse 3, 9200 Gossau SG")[0].ort).toBe("Gossau");
    expect(adressenAus("Bahnhofstrasse 3, 9200 Gossau Telefon 071 123 45 67")[0].ort).toBe("Gossau");
    expect(adressenAus("Bahnhofstrasse 3, 9200 Gossau Schweiz")[0].ort).toBe("Gossau");
    expect(adressenAus("Bahnhofstrasse 3 9425 Thal Öffnungszeiten Mo bis Fr")[0].ort).toBe("Thal");
  });

  it("nimmt aus mehreren Wörtern vor der Strasse nur den Namen der Strasse", () => {
    expect(adressenAus("Kontakt Malerei Keller Hauptstrasse 12, 9200 Gossau")[0].strasse).toBe("Hauptstrasse 12");
  });

  it("findet keine Adresse ohne Strasse oder mit einem Wort, das keine Strasse ist", () => {
    expect(adressenAus("Besuchen Sie uns in 9200 Gossau")).toEqual([]);
    expect(adressenAus("Kontakt 12, 9200 Gossau")).toEqual([]);
    expect(adressenAus("Telefon 071 123 45, 9200 Gossau")).toEqual([]);
    expect(adressenAus("Preise ab CHF 450 9200 Gossau")).toEqual([]);
    expect(adressenAus("")).toEqual([]);
  });

  it("liefert alle Adressen in der Reihenfolge des Textes", () => {
    const text = "Hauptsitz Wilerstrasse 24, 9200 Gossau. Filiale Bahnhofstrasse 3, 9100 Herisau.";
    expect(adressenAus(text).map((a) => `${a.strasse}|${a.ort}`)).toEqual(["Wilerstrasse 24|Gossau", "Bahnhofstrasse 3|Herisau"]);
  });
});

describe("verzeichnisse: Telefon aus dem Text der Website", () => {
  it("liest Schweizer Nummern in den üblichen Schreibweisen", () => {
    expect(telefonAus("Tel. 071 123 45 67")).toEqual(["071 123 45 67"]);
    expect(telefonAus("Telefon +41 71 123 45 67")).toEqual(["+41 71 123 45 67"]);
    expect(telefonAus("Fon 0041 71 123 45 67")).toEqual(["0041 71 123 45 67"]);
    expect(telefonAus("+41 (0)71 123 45 67")).toEqual(["+41 (0)71 123 45 67"]);
    expect(telefonAus("Natel 079 123 45 67")).toEqual(["079 123 45 67"]);
    expect(telefonAus("Tel 0711234567")).toEqual(["0711234567"]);
  });

  it("überspringt Fax und gibt Nummern mit «Tel» den Vorrang", () => {
    expect(telefonAus("Fax 071 123 45 68")).toEqual([]);
    expect(telefonAus("Fax 071 123 45 68 Tel. 071 123 45 67")).toEqual(["071 123 45 67"]);
    expect(telefonAus("Mobil 079 111 22 33, Büro 071 123 45 67").length).toBe(2);
    expect(telefonAus("Bürozeiten 071 123 45 67, Tel. 071 999 88 77")[0]).toBe("071 999 88 77");
  });

  it("liest keine Zahlen, die keine Telefonnummer sind", () => {
    expect(telefonAus("Gegründet 1987, 9200 Gossau, CHF 1'250.-")).toEqual([]);
    expect(telefonAus("Bestellnummer 1071123456789")).toEqual([]);
    expect(telefonAus("Tel. 071 123 45")).toEqual([]);
    expect(telefonAus("+49 30 1234567")).toEqual([]);
    expect(telefonAus("")).toEqual([]);
  });

  it("zeigt die Nummer im Formular als «071 123 45 67»", () => {
    expect(telefonAnzeige("+41 71 123 45 67")).toBe("071 123 45 67");
    expect(telefonAnzeige("0711234567")).toBe("071 123 45 67");
    expect(telefonAnzeige("unlesbar")).toBe("unlesbar");
  });
});

describe("verzeichnisse: Kontakt aus der Seite", () => {
  const text = "Willkommen bei der Malerei Keller. Wir streichen Fassaden. Bahnhofstrasse 3, 9100 Herisau (Filiale). Tel 071 999 88 77";
  const tail = "© Malerei Keller · Wilerstrasse 24 · 9200 Gossau · Tel. 071 123 45 67 · Impressum";

  it("nimmt die Anschrift der Fusszeile vor dem Text", () => {
    expect(kontaktAus({ text, tail })).toEqual({ strasse: "Wilerstrasse 24", plz: "9200", ort: "Gossau", telefon: "071 123 45 67" });
  });

  it("nimmt die Adresse, die zum Ort aus dem Profil passt", () => {
    expect(kontaktAus({ text, tail: "" }, "Herisau")).toMatchObject({ strasse: "Bahnhofstrasse 3", plz: "9100", ort: "Herisau" });
    expect(kontaktAus({ text: `${tail} ${text}` }, "herisau")).toMatchObject({ ort: "Herisau" });
    expect(kontaktAus({ text: `${tail} ${text}` }, "Wil")).toMatchObject({ ort: "Gossau" });
  });

  it("nimmt Telefon aus dem Text, wenn die Fusszeile keines hat, und liefert leere Felder ohne Funde", () => {
    expect(kontaktAus({ text: "Tel. 071 123 45 67", tail: "© Malerei Keller" }).telefon).toBe("071 123 45 67");
    expect(kontaktAus({ text: "Wir streichen Fassaden in Gossau." })).toEqual({ strasse: "", plz: "", ort: "", telefon: "" });
  });
});

describe("verzeichnisse: Vorschläge für das Formular", () => {
  const k = { strasse: "Wilerstrasse 24", plz: "9200", ort: "Gossau", telefon: "+41 71 123 45 67" };

  it("schlägt leere Felder vor, vorgewählt, und zeigt das Telefon im Format des Formulars", () => {
    const v = kontaktVorschlaege(k, { strasse: "", plz: "", telefon: "" });
    expect(v.map((x) => [x.key, x.wert, x.vorhanden])).toEqual([
      ["strasse", "Wilerstrasse 24", false],
      ["plz", "9200", false],
      ["telefon", "071 123 45 67", false],
    ]);
    expect(v.map((x) => x.label)).toEqual([KONTAKT_LABEL.strasse, KONTAKT_LABEL.plz, KONTAKT_LABEL.telefon]);
  });

  it("kennzeichnet ein Feld mit anderem Wert als vorhanden und lässt ein Feld mit gleichem Wert weg", () => {
    const v = kontaktVorschlaege(k, { strasse: "Bahnhofstrasse 3", plz: "9200", telefon: " 071 123 45 67 " });
    expect(v.map((x) => [x.key, x.vorhanden])).toEqual([["strasse", true]]);
  });

  it("schlägt nichts vor, was die Seite nicht hergibt", () => {
    expect(kontaktVorschlaege({ strasse: "", plz: "", ort: "", telefon: "" }, { strasse: "", plz: "", telefon: "" })).toEqual([]);
  });
});
