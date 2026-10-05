import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { parseToolMarkdown } from "@/lib/content";
import { checkToolContent } from "@/lib/content-rules";
import { toMarkdown } from "@/lib/export/model";
import { isToolDone } from "@/lib/progress";
import config from "./tool.config";
import {
  ANREIZ_KEYS,
  ANTEIL,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAL_KEYS,
  TEMPLATES,
  TEMPLATE_INFO,
  TEMPLATE_KEYS,
  anerkennung,
  anreizLabel,
  anreizZeile,
  ausgabeText,
  begriffe,
  begruendung,
  buildTexts,
  dankSatz,
  docFilename,
  eingabeText,
  emailHinweis,
  empfehlungsSatz,
  feldIssue,
  fillTemplate,
  formIssue,
  hinweise,
  kanalLabel,
  kartenFilename,
  kartenInhalt,
  kontextOf,
  kundenwertProblem,
  margeProblem,
  mechanik,
  nummerFuerKanal,
  parseNumber,
  parseState,
  programm,
  rechne,
  reportMarkdown,
  richtwertHinweis,
  roundTo,
  spanneText,
  toDocument,
  toEingabe,
  zielFor,
  zielHinweis,
  zielOf,
  type Anrede,
  type FormFields,
  type Kontext,
  type Rechnung,
} from "./logic";

const KELLER: Kontext = { verein: false, firma: "Malerei Keller, Gossau", website: "malerei-keller.ch" };
const FC: Kontext = { verein: true, firma: "FC Trogen", website: "fc-trogen.ch" };
const NUMMER = "079 123 45 67";

const FORM: FormFields = { kundenwert: "3000", marge: "25", anreiz: "gutschein", beide: true, kanal: "karte", nummer: NUMMER, anrede: "du" };
const form = (patch: Partial<FormFields> = {}): FormFields => ({ ...FORM, ...patch });

const rechnung = (patch: Partial<FormFields> = {}): Rechnung => {
  const e = toEingabe(form(patch));
  if (!e) throw new Error("ungültige Eingabe im Test");
  return rechne(e);
};

/** Ruhiger Ton: Sperrliste, Ausrufezeichen, «jetzt», Gedankenstrich, ß. */
const calm = (text: string): void => {
  expect(brandHits(text), text).toEqual([]);
  expect(text, text).not.toMatch(/!|\bjetzt\b|—|ß/i);
};

describe("empfehlungsprogramm: Rechnung", () => {
  it("rechnet Deckungsbeitrag und Spanne: 10 bis 20 % von Kundenwert mal Marge", () => {
    const r = rechnung({ beide: false });
    expect(r.deckungsbeitrag).toBe(750);
    expect(r.gesamt).toEqual({ min: 75, max: 150 });
    expect(r.proSeite).toEqual({ min: 75, max: 150 });
    expect(r.mitte).toBe(115);
    expect(r.wirksam).toBe("gutschein");
    expect(r.zuKlein).toBe(false);
    expect(ANTEIL).toEqual({ min: 10, max: 20 });
  });

  it("rundet auf 5 Franken", () => {
    const r = rechnung({ kundenwert: "1000", marge: "33", beide: false });
    expect(r.deckungsbeitrag).toBe(330);
    expect(r.gesamt).toEqual({ min: 35, max: 65 });
    expect(roundTo(2.4)).toBe(0);
    expect(roundTo(2.5)).toBe(5);
    expect(roundTo(7.4)).toBe(5);
    expect(roundTo(7.5)).toBe(10);
    expect(roundTo(12.5)).toBe(15);
  });

  it("halbiert die Spanne je Seite, wenn beide Seiten belohnt werden", () => {
    const r = rechnung({ beide: true });
    expect(r.gesamt).toEqual({ min: 75, max: 150 });
    expect(r.proSeite).toEqual({ min: 40, max: 75 });
    expect(r.mitte).toBe(60);
    expect(anreizZeile(r)).toBe("CHF 40.- bis CHF 75.- je Seite");
    expect(anreizZeile(rechnung({ beide: false }))).toBe("CHF 75.- bis CHF 150.- je erfolgreiche Empfehlung");
  });

  it("gibt bei «nichts Materielles» keinen Betrag aus", () => {
    const r = rechnung({ anreiz: "ideell" });
    expect(r.gesamt).toBeNull();
    expect(r.proSeite).toBeNull();
    expect(r.mitte).toBeNull();
    expect(r.zuKlein).toBe(false);
    expect(r.wirksam).toBe("ideell");
    expect(anreizZeile(r)).toBe("Ohne Betrag: Dank und Sichtbarkeit");
    expect(anerkennung()).toHaveLength(3);
    expect(anerkennung().join(" ")).toMatch(/Dank von Hand/);
    expect(anerkennung().join(" ")).toMatch(/Newsletter, nur mit dem Einverständnis/);
    expect(anerkennung().join(" ")).toMatch(/Einladung zu einem Anlass/);
    expect(richtwertHinweis(r)).toBeNull();
  });

  it("hebt einen Betrag unter 5 Franken auf 5 und lässt einen noch kleineren Betrag weg", () => {
    const klein = rechnung({ kundenwert: "100", marge: "20", beide: false });
    expect(klein.deckungsbeitrag).toBe(20);
    expect(klein.proSeite).toEqual({ min: 5, max: 5 });
    expect(klein.mitte).toBe(5);
    expect(spanneText(klein.proSeite!)).toBe("CHF 5.-");

    const zuKlein = rechnung({ kundenwert: "100", marge: "20", beide: true });
    expect(zuKlein.zuKlein).toBe(true);
    expect(zuKlein.proSeite).toBeNull();
    expect(zuKlein.wirksam).toBe("ideell");
    expect(begruendung(zuKlein).join(" ")).toMatch(/weniger als CHF 5\.-/);

    const winzig = rechnung({ kundenwert: "10", marge: "1", beide: false });
    expect(winzig.deckungsbeitrag).toBe(0.1);
    expect(winzig.zuKlein).toBe(true);
  });

  it("rechnet Extremwerte: CHF 1'000'000.- bei 90 % Marge", () => {
    const r = rechnung({ kundenwert: "1000000", marge: "90", beide: false });
    expect(r.deckungsbeitrag).toBe(900000);
    expect(spanneText(r.gesamt!)).toBe("CHF 90'000.- bis CHF 180'000.-");
    expect(r.mitte).toBe(135000);
  });

  it("hält die Mitte immer innerhalb der Spanne und auf 5 Franken", () => {
    for (const kundenwert of ["50", "137", "999", "2500", "48000"]) {
      for (const marge of ["5", "12,5", "40", "90"]) {
        for (const beide of [false, true]) {
          const r = rechnung({ kundenwert, marge, beide });
          if (!r.proSeite || r.mitte === null) continue;
          expect(r.mitte % 5).toBe(0);
          expect(r.mitte).toBeGreaterThanOrEqual(r.proSeite.min);
          expect(r.mitte).toBeLessThanOrEqual(r.proSeite.max);
        }
      }
    }
  });

  it("begründet die Spanne mit der Rechnung und kennzeichnet den Richtwert", () => {
    const r = rechnung({ beide: true });
    const text = begruendung(r).join(" ");
    expect(text).toContain("Kundenwert von CHF 3'000.- und einer Marge von 25 %");
    expect(text).toContain("CHF 750.- Deckungsbeitrag");
    expect(text).toContain("10 bis 20 %");
    expect(text).toContain("jede Seite die Hälfte");
    expect(richtwertHinweis(r)).toMatch(/^Richtwert von Alperna, keine Statistik/);
    expect(begruendung(rechnung(), true).join(" ")).toContain("Jahresbeitrag von CHF 3'000.-");
  });
});

describe("empfehlungsprogramm: Eingaben", () => {
  it("liest Zahlen mit Komma, Punkt, Apostroph und Leerzeichen", () => {
    expect(parseNumber("3000")).toBe(3000);
    expect(parseNumber("3'000")).toBe(3000);
    expect(parseNumber("3’000")).toBe(3000);
    expect(parseNumber("3 000")).toBe(3000);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("12.5")).toBe(12.5);
    for (const bad of ["", "  ", "abc", "1e3", "-5", "12,5,5", "CHF 100", "1.2.3"]) expect(parseNumber(bad), bad).toBeNull();
  });

  it("prüft die Grenzen von Kundenwert (10 bis 1'000'000) und Marge (1 bis 90)", () => {
    expect(kundenwertProblem("9")).toMatch(/zwischen CHF 10\.- und CHF 1'000'000\.-/);
    expect(kundenwertProblem("10")).toBeNull();
    expect(kundenwertProblem("1000000")).toBeNull();
    expect(kundenwertProblem("1000001")).toMatch(/zwischen/);
    expect(kundenwertProblem("")).toBe("Gib den Kundenwert pro Jahr an.");
    expect(kundenwertProblem("", true)).toBe("Gib den Jahresbeitrag pro Mitglied an.");
    expect(kundenwertProblem("viel")).toMatch(/keine Zahl/);
    expect(margeProblem("0,5")).toMatch(/zwischen 1 % und 90 %/);
    expect(margeProblem("1")).toBeNull();
    expect(margeProblem("90")).toBeNull();
    expect(margeProblem("91")).toMatch(/zwischen/);
    expect(margeProblem("")).toBe("Gib die Marge in Prozent an.");
    expect(toEingabe(form({ kundenwert: "9" }))).toBeNull();
    expect(toEingabe(form({ marge: "91" }))).toBeNull();
    expect(toEingabe(form({ anreiz: "" }))).toBeNull();
    expect(toEingabe(form({ kundenwert: "3'000", marge: "25,5" }))).toEqual({ kundenwert: 3000, marge: 25.5, anreiz: "gutschein", beide: true });
  });

  it("meldet die erste fehlende Angabe in der Reihenfolge des Formulars", () => {
    expect(feldIssue(EMPTY_FORM)?.feld).toBe("kundenwert");
    expect(feldIssue({ ...EMPTY_FORM, kundenwert: "3000" })?.feld).toBe("marge");
    expect(feldIssue({ ...EMPTY_FORM, kundenwert: "3000", marge: "25" })?.feld).toBe("anreiz");
    expect(feldIssue({ ...EMPTY_FORM, kundenwert: "3000", marge: "25", anreiz: "rabatt" })?.feld).toBe("kanal");
    expect(feldIssue({ ...FORM, anrede: "" })?.feld).toBe("anrede");
    expect(feldIssue(FORM)).toBeNull();
  });

  it("prüft die Nummer nur bei WhatsApp und Karte und nur, wenn sie ausgefüllt ist", () => {
    expect(feldIssue(form({ nummer: "12345" }))?.feld).toBe("nummer");
    expect(feldIssue(form({ kanal: "whatsapp", nummer: "+49 171 1234567" }))?.feld).toBe("nummer");
    expect(feldIssue(form({ nummer: "" }))).toBeNull();
    expect(feldIssue(form({ kanal: "email", nummer: "kaputt" }))).toBeNull();
    expect(feldIssue(form({ kanal: "persoenlich", nummer: "kaputt" }))).toBeNull();
    expect(feldIssue(form({ nummer: "+41 79 123 45 67" }))).toBeNull();
  });

  it("verlangt die Firma aus dem Profil, mit der Bezeichnung für Betrieb oder Verein", () => {
    expect(formIssue(FORM, { verein: false, firma: " " })).toEqual({ feld: "firma", text: "Gib den Namen deines Betriebs an." });
    expect(formIssue(FORM, { verein: true, firma: "" })?.text).toBe("Gib den Namen deines Vereins an.");
    expect(formIssue(FORM, KELLER)).toBeNull();
  });
});

describe("empfehlungsprogramm: Dank-Satz und Vorlagen", () => {
  const ANREDEN_: Anrede[] = ["du", "sie"];

  it("bildet den Dank-Satz je Typ, Anrede und Sicht", () => {
    const o = { anrede: "du" as Anrede, beide: true, verein: false, sicht: "empfehlende" as const };
    expect(dankSatz("gutschein", 30, o)).toBe("Als Dank gibt es für dich und die empfohlene Person je CHF 30.- als Gutschein.");
    expect(dankSatz("gutschein", 60, { ...o, anrede: "sie", beide: false })).toBe("Als Dank gibt es für Sie CHF 60.- als Gutschein.");
    expect(dankSatz("rabatt", 30, o)).toBe("Als Dank gibt es für dich und die empfohlene Person je CHF 30.- Rabatt auf den nächsten Auftrag.");
    expect(dankSatz("rabatt", 30, { ...o, verein: true })).toBe("Als Dank gibt es für dich und die empfohlene Person je CHF 30.- Ermässigung auf den nächsten Jahresbeitrag.");
    expect(dankSatz("zusatz", 60, { ...o, beide: false })).toBe("Als Dank gibt es für dich eine Zusatzleistung im Wert von CHF 60.- nach Absprache.");
    expect(dankSatz("spende", 30, o)).toBe("Als Dank spenden wir für dich und die empfohlene Person je CHF 30.- an einen Verein eurer Wahl.");
    expect(dankSatz("spende", 60, { ...o, beide: false })).toBe("Als Dank spenden wir für dich CHF 60.- an einen Verein deiner Wahl.");
    expect(dankSatz("spende", 60, { ...o, beide: false, anrede: "sie" })).toBe("Als Dank spenden wir für Sie CHF 60.- an einen Verein Ihrer Wahl.");
    expect(dankSatz("ideell", null, { ...o, beide: false })).toBe("Als Dank gibt es für dich ein persönliches Dankeschön von uns.");
    expect(dankSatz("gutschein", 60, { ...o, beide: false, sicht: "empfohlene" })).toBe("Als Dank gibt es für die Person, die dich geschickt hat, CHF 60.- als Gutschein.");
    expect(dankSatz("gutschein", 30, { ...o, sicht: "empfohlene", anrede: "sie" })).toBe(
      "Als Dank gibt es für Sie und die Person, die Sie geschickt hat, je CHF 30.- als Gutschein.",
    );
    expect(dankSatz("spende", 60, { ...o, beide: false, sicht: "empfohlene" })).toContain("an einen Verein ihrer Wahl.");
    expect(dankSatz("gutschein", null, o)).toBe("Als Dank gibt es für dich und die empfohlene Person je einen Gutschein.");
  });

  it("endet nie mit dem Betrag und lässt nichts Unbestimmtes stehen", () => {
    for (const typ of ANREIZ_KEYS) {
      for (const anrede of ANREDEN_) {
        for (const beide of [false, true]) {
          for (const verein of [false, true]) {
            for (const sicht of ["empfehlende", "empfohlene"] as const) {
              for (const betrag of [60, null]) {
                const s = dankSatz(typ, betrag, { anrede, beide, verein, sicht });
                expect(s).toMatch(/^Als Dank /);
                expect(s).toMatch(/[a-zäöü]\.$/);
                expect(s).not.toMatch(/undefined|null|\.-\./);
                calm(s);
              }
            }
          }
        }
      }
    }
  });

  it("setzt in allen Vorlagen Firma, Anreiz und Link ein und lässt nur [Name] stehen", () => {
    for (const kontext of [KELLER, FC]) {
      for (const anrede of ANREDEN_) {
        for (const typ of ANREIZ_KEYS) {
          for (const beide of [false, true]) {
            const r = rechnung({ anreiz: typ, beide });
            const ziel = zielOf(NUMMER, kontext.website, kontext);
            const texte = buildTexts({ anrede, rechnung: r, kontext, ziel });
            for (const key of TEMPLATE_KEYS) {
              const t = texte[key];
              expect(t, `${key}`).not.toMatch(/\[(Anreiz|Firma|Link)\]/);
              expect(t, `${key}`).toContain("[Name]");
              expect(t.match(/\[[^\]]+\]/g), `${key}`).toEqual(["[Name]"]);
              expect(t).toContain(kontext.firma);
              expect(t).toContain("Als Dank");
              calm(t);
            }
            expect(texte.bitte).toContain("https://wa.me/41791234567");
            expect(texte.empfohlene).toContain("https://wa.me/41791234567");
            expect(texte.dank).not.toContain("wa.me");
          }
        }
      }
    }
  });

  it("schreibt Du-Vorlagen in Du-Form und Sie-Vorlagen in Sie-Form", () => {
    const r = rechnung();
    const ziel = zielOf(NUMMER, "", KELLER);
    const du = buildTexts({ anrede: "du", rechnung: r, kontext: KELLER, ziel });
    const sie = buildTexts({ anrede: "sie", rechnung: r, kontext: KELLER, ziel });
    for (const key of TEMPLATE_KEYS) {
      expect(du[key], key).toMatch(/\b(du|dich|dir|dein\w*)\b/);
      expect(du[key], key).not.toMatch(/\b(Sie|Ihnen|Ihr\w*)\b/);
      expect(sie[key], key).toMatch(/\b(Sie|Ihnen|Ihr\w*)\b/);
      expect(sie[key], key).not.toMatch(/\b(du|dich|dir|dein\w*)\b/);
    }
    expect(du.bitte.startsWith("Hallo [Name]")).toBe(true);
    expect(sie.bitte.startsWith("Guten Tag [Name]")).toBe(true);
    expect(Object.keys(TEMPLATES)).toEqual(["kmu", "verein"]);
    expect(TEMPLATE_INFO.bitte.copyLabel).toBe("Bitte um Empfehlung kopieren");
    expect(TEMPLATE_INFO.empfohlene.copyLabel).toBe("Nachricht an Empfohlene kopieren");
    expect(TEMPLATE_INFO.dank.copyLabel).toBe("Dank kopieren");
  });

  it("lässt die Zeile mit dem Link weg, wenn es keinen Link gibt", () => {
    const r = rechnung();
    const texte = buildTexts({ anrede: "du", rechnung: r, kontext: KELLER, ziel: null });
    expect(texte.bitte).not.toMatch(/erreicht man uns direkt|\[Link\]/);
    expect(texte.empfohlene).not.toMatch(/erreichst uns direkt|\[Link\]/);
    expect(texte.bitte).toContain("Wir freuen uns über jede Empfehlung.\nAls Dank");
  });

  it("verändert den Link nicht: Prozentzeichen bleiben, wie sie sind", () => {
    const t = fillTemplate("Hier: [Link]\nDank [Anreiz] 8% [Firma]", { firma: "Keller", anreiz: "ein Gutschein", link: "https://x.ch/?a=5%25&b=2%20" });
    expect(t).toContain("https://x.ch/?a=5%25&b=2%20");
    expect(t).toContain("8 %");
    expect(t).toContain("Keller");
  });

  it("wendet die Schweizer Schreibweise auf den Text an", () => {
    expect(fillTemplate("[Firma] [Anreiz]", { firma: "Müller", anreiz: "CHF 1000 und 5%", link: "" })).toBe("Müller CHF 1'000 und 5 %");
  });

  it("nennt bei Vereinen Mitglied und Eintritt statt Auftrag", () => {
    const r = rechnung({ anreiz: "rabatt" });
    for (const anrede of ANREDEN_) {
      const texte = buildTexts({ anrede, rechnung: r, kontext: FC, ziel: zielOf("", "fc-trogen.ch", FC) });
      for (const key of TEMPLATE_KEYS) expect(texte[key], key).not.toMatch(/Auftrag|Kundschaft/);
      expect(texte.dank).toContain("Eintritt");
      expect(texte.bitte).toContain("mitmachen");
      expect(texte.bitte).toContain("Jahresbeitrag");
    }
  });
});

describe("empfehlungsprogramm: Mechanik", () => {
  it("hat fünf Schritte und nennt den Kanal in Bitte, Meldung und Dank", () => {
    const marker: Record<(typeof KANAL_KEYS)[number], RegExp[]> = {
      whatsapp: [/WhatsApp-Nachricht/, /auf WhatsApp/, /per WhatsApp/],
      email: [/E-Mail/, /E-Mail/, /per E-Mail/],
      persoenlich: [/persönlich/, /spricht dich an oder ruft an/, /persönlich/],
      karte: [/Karte A6/, /scannt den Code auf der Karte/, /handgeschriebenen/],
    };
    for (const kanal of KANAL_KEYS) {
      const s = mechanik({ kanal, beide: true, verein: false });
      expect(s.map((x) => x.titel)).toEqual([
        "Auftrag abgeschlossen",
        "Bitte um Empfehlung",
        "Empfohlene Person meldet sich mit Hinweis",
        "Auftrag kommt zustande",
        "Dank und Anreiz an beide",
      ]);
      expect(s[1].text).toMatch(marker[kanal][0]);
      expect(s[2].text).toMatch(marker[kanal][1]);
      expect(s[4].text).toMatch(marker[kanal][2]);
      for (const x of s) {
        expect(x.text.endsWith("."), x.text).toBe(true);
        calm(`${x.titel}. ${x.text}`);
      }
    }
  });

  it("belohnt nur die empfehlende Person, wenn nicht beide Seiten belohnt werden", () => {
    const s = mechanik({ kanal: "whatsapp", beide: false, verein: false });
    expect(s[4].titel).toBe("Dank und Anreiz an die empfehlende Person");
    expect(s[4].text).toContain("bei der empfehlenden Person");
  });

  it("wechselt bei Vereinen die Bezeichnungen", () => {
    const s = mechanik({ kanal: "karte", beide: true, verein: true });
    expect(s[0].titel).toBe("Mitglied ist zufrieden");
    expect(s[3].titel).toBe("Eintritt kommt zustande");
    expect(s[1].text).toContain("beim Anlass");
    expect(JSON.stringify(s)).not.toMatch(/Auftrag|Kundschaft/);
    expect(begriffe(true).wert).toBe("Jahresbeitrag pro Mitglied");
    expect(begriffe(true).betrieb).toBe("Verein");
    expect(begriffe(false).wert).toBe("Kundenwert pro Jahr");
    expect(kanalLabel("karte", true)).toBe("Karte beim Anlass");
    expect(kanalLabel("karte")).toBe("Karte beim Auftrag");
    expect(anreizLabel("rabatt")).toBe("Rabatt auf den nächsten Auftrag");
    expect(anreizLabel("rabatt", true)).toBe("Ermässigung auf den nächsten Jahresbeitrag");
    expect(anreizLabel("ideell")).toBe("Nichts Materielles (Dank und Sichtbarkeit)");
    expect(kontextOf({ organisationstyp: "verein", firma: " FC Trogen ", website: "" })).toEqual({ verein: true, firma: "FC Trogen", website: "" });
    expect(kontextOf({})).toEqual({ verein: false, firma: "", website: "" });
  });
});

describe("empfehlungsprogramm: Ziel des QR-Codes", () => {
  it("nimmt die gültige Nummer als wa.me-Link mit dem Satz «auf Empfehlung von …»", () => {
    const z = zielOf(NUMMER, "malerei-keller.ch", KELLER)!;
    expect(z.art).toBe("whatsapp");
    expect(z.linkKurz).toBe("https://wa.me/41791234567");
    expect(z.url.startsWith("https://wa.me/41791234567?text=")).toBe(true);
    expect(decodeURIComponent(z.url.split("?text=")[1])).toBe(empfehlungsSatz(KELLER.firma));
    expect(empfehlungsSatz("Malerei Keller")).toBe("Guten Tag Malerei Keller, ich komme auf Empfehlung von …");
    expect(empfehlungsSatz("FC Trogen", true)).toContain("Empfohlen hat mich …");
    expect(z.anzeige).toBe("WhatsApp 079 123 45 67");
  });

  it("nimmt sonst die Website und sonst kein Ziel", () => {
    const web = zielOf("", "malerei-keller.ch", KELLER)!;
    expect(web).toEqual({ art: "website", url: "https://malerei-keller.ch/", linkKurz: "https://malerei-keller.ch/", anzeige: "malerei-keller.ch" });
    expect(zielOf("", "https://www.malerei-keller.ch/kontakt", KELLER)?.anzeige).toBe("malerei-keller.ch/kontakt");
    expect(zielOf("", "", KELLER)).toBeNull();
    expect(zielOf("  ", "  ", KELLER)).toBeNull();
    expect(zielOf("", "kein Link", KELLER)).toBeNull();
  });

  it("fällt bei ungültiger Nummer auf die Website zurück", () => {
    expect(zielOf("12345", "malerei-keller.ch", KELLER)?.art).toBe("website");
    expect(zielOf("12345", "", KELLER)).toBeNull();
  });

  it("beachtet die Nummer nur bei WhatsApp und Karte", () => {
    expect(nummerFuerKanal({ kanal: "whatsapp", nummer: ` ${NUMMER} ` })).toBe(NUMMER);
    expect(nummerFuerKanal({ kanal: "karte", nummer: NUMMER })).toBe(NUMMER);
    expect(nummerFuerKanal({ kanal: "email", nummer: NUMMER })).toBe("");
    expect(nummerFuerKanal({ kanal: "persoenlich", nummer: NUMMER })).toBe("");
    expect(zielFor({ kanal: "email", nummer: NUMMER }, KELLER)?.art).toBe("website");
    expect(zielFor({ kanal: "karte", nummer: NUMMER }, KELLER)?.art).toBe("whatsapp");
    expect(zielFor({ kanal: "email", nummer: NUMMER }, { ...KELLER, website: "" })).toBeNull();
  });
});

describe("empfehlungsprogramm: Meldungen und Bezeichnungen", () => {
  it("halten die Sperrliste und die Schreibregeln ein", () => {
    const texte: string[] = [
      zielHinweis(null),
      zielHinweis(zielOf(NUMMER, "", KELLER)),
      zielHinweis(zielOf("", "malerei-keller.ch", KELLER)),
      ...["", "x", "9", "1000001"].flatMap((v) => [kundenwertProblem(v) ?? "", kundenwertProblem(v, true) ?? "", margeProblem(v) ?? ""]),
      feldIssue(EMPTY_FORM)?.text ?? "",
      formIssue(FORM, { verein: true, firma: "" })?.text ?? "",
      ...[false, true].flatMap((v) => Object.values(begriffe(v))),
      ...ANREIZ_KEYS.flatMap((k) => [anreizLabel(k), anreizLabel(k, true)]),
      ...KANAL_KEYS.flatMap((k) => [kanalLabel(k), kanalLabel(k, true)]),
      ...TEMPLATE_KEYS.flatMap((k) => [TEMPLATE_INFO[k].label, TEMPLATE_INFO[k].vereinLabel, TEMPLATE_INFO[k].copyLabel]),
      ...anerkennung(),
      ...anerkennung(true),
    ];
    for (const t of texte) {
      expect(t, t).not.toBe(undefined);
      calm(t);
    }
    expect(zielHinweis(null)).toMatch(/bleibt der QR-Code auf der Karte weg/);
  });
});

describe("empfehlungsprogramm: Karte A6", () => {
  const ziel = zielOf(NUMMER, "", KELLER);

  it("schreibt den Satz in Du- und Sie-Form und nennt den Anreiz ohne Betrag", () => {
    const r = rechnung();
    const du = kartenInhalt({ anrede: "du", rechnung: r, kontext: KELLER, ziel });
    const sie = kartenInhalt({ anrede: "sie", rechnung: r, kontext: KELLER, ziel });
    expect(du.titel).toBe("Danke, dass du uns weiterempfiehlst");
    expect(sie.titel).toBe("Danke, dass Sie uns weiterempfehlen");
    expect(du.firma).toBe("Malerei Keller, Gossau");
    expect(du.anreiz).toBe("Als Dank gibt es für dich und die empfohlene Person je einen Gutschein.");
    expect(sie.anreiz).toBe("Als Dank gibt es für Sie und die empfohlene Person je einen Gutschein.");
    expect(du.anreiz).not.toContain("CHF");
    expect(du.rueck).toHaveLength(3);
    expect(du.rueck[1]).toContain("dass du sie geschickt hast");
    expect(sie.rueck[1]).toContain("dass Sie sie geschickt haben");
    expect(du.rueck[2]).toBe("Kommt ein Auftrag zustande, bedanken wir uns bei euch beiden.");
    expect(sie.rueck[2]).toBe("Kommt ein Auftrag zustande, bedanken wir uns bei Ihnen beiden.");
    for (const t of [du.titel, du.anreiz, ...du.rueck, sie.titel, sie.anreiz, ...sie.rueck]) calm(t);
  });

  it("nimmt Ziel und Kontakt aus der Nummer, sonst aus der Website, sonst bleibt der Code weg", () => {
    const r = rechnung({ beide: false });
    const mitNummer = kartenInhalt({ anrede: "du", rechnung: r, kontext: KELLER, ziel });
    expect(mitNummer.qr).toBe(ziel!.url);
    expect(mitNummer.kontakt).toBe("WhatsApp 079 123 45 67");
    expect(mitNummer.rueck[2]).toBe("Kommt ein Auftrag zustande, bedanken wir uns bei dir.");
    const web = kartenInhalt({ anrede: "du", rechnung: r, kontext: KELLER, ziel: zielOf("", "malerei-keller.ch", KELLER) });
    expect(web.qr).toBe("https://malerei-keller.ch/");
    expect(web.kontakt).toBe("malerei-keller.ch");
    const keins = kartenInhalt({ anrede: "du", rechnung: r, kontext: KELLER, ziel: null });
    expect(keins.qr).toBeNull();
    expect(keins.kontakt).toBe("");
  });

  it("wechselt bei Vereinen Rückseite und Anreiz", () => {
    const r = rechnung({ anreiz: "rabatt" });
    const k = kartenInhalt({ anrede: "sie", rechnung: r, kontext: FC, ziel: null });
    expect(k.rueck[0]).toBe("Geben Sie die Karte jemandem weiter, die oder der gern bei uns mitmachen würde.");
    expect(k.rueck[2]).toBe("Tritt die Person ein, bedanken wir uns bei Ihnen beiden.");
    expect(k.anreiz).toContain("Ermässigung auf den nächsten Jahresbeitrag");
  });

  it("benennt die Datei nach der Firma", () => {
    expect(kartenFilename("Malerei Keller, Gossau")).toBe("empfehlungskarte-a6-malerei-keller-gossau.pdf");
    expect(kartenFilename("")).toBe("empfehlungskarte-a6-betrieb.pdf");
    expect(docFilename("Müller & Söhne")).toBe("empfehlungsprogramm-mueller-soehne");
  });
});

describe("empfehlungsprogramm: Einseiter", () => {
  const p = programm(FORM, KELLER, "du")!;

  it("baut das Dokument: Titel, Angaben, Anreiz, nummerierte Mechanik, Vorlagen, Hinweise", () => {
    const doc = toDocument(p);
    expect(doc.title).toBe("Empfehlungsprogramm Malerei Keller, Gossau");
    expect(doc.subtitle).toBe("Anreiz: CHF 40.- bis CHF 75.- je Seite");
    expect(doc.firma).toBe("Malerei Keller, Gossau");
    expect(doc.filename).toBe("empfehlungsprogramm-malerei-keller-gossau");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual([
      "Anreiz",
      "Ablauf in fünf Schritten",
      "Textvorlagen (Du)",
      "Bitte um Empfehlung nach dem Auftrag",
      "Nachricht an die empfohlene Person",
      "Dankesnachricht",
      "Hinweise",
    ]);
    const liste = doc.blocks.find((b) => b.type === "list" && b.ordered);
    expect(liste?.type === "list" && liste.items).toHaveLength(5);
    const facts = doc.blocks[0];
    expect(facts.type === "facts" && facts.items.map((i) => i.label)).toEqual(["Betrieb", "Kundenwert pro Jahr", "Marge", "Anreiz", "Kanal der Ansprache"]);
    expect(facts.type === "facts" && facts.items.find((i) => i.label === "Anreiz")?.value).toBe("Gutschein, beide Seiten belohnt");
    expect(toMarkdown(doc)).toContain("1. Auftrag abgeschlossen:");
    expect(toMarkdown(doc)).toContain("Richtwert von Alperna, keine Statistik");
    calm(toMarkdown(doc));
  });

  it("nennt bei Vereinen Jahresbeitrag und Mitglied", () => {
    const f = form({ anreiz: "rabatt", kanal: "persoenlich" });
    const doc = toDocument(programm(f, FC, "sie")!);
    const md = toMarkdown(doc);
    expect(doc.title).toBe("Empfehlungsprogramm FC Trogen");
    expect(md).toContain("**Verein:** FC Trogen");
    expect(md).toContain("**Jahresbeitrag pro Mitglied:** CHF 3'000.-");
    expect(md).toContain("Textvorlagen (Sie)");
    expect(md).not.toMatch(/Auftrag|Kundenwert|Kundschaft/);
    calm(md);
  });

  it("zeigt bei «nichts Materielles» die drei Formen der Anerkennung und keinen Betrag", () => {
    const md = reportMarkdown(programm(form({ anreiz: "ideell" }), KELLER, "du")!);
    expect(md).toContain("Anreiz: Dank und Sichtbarkeit, ohne Betrag");
    expect(md).toContain("- Dank von Hand:");
    expect(md).toContain("- Nennung im Newsletter, nur mit dem Einverständnis der Person.");
    expect(md).toContain("- Einladung zu einem Anlass im Betrieb.");
    expect(md).not.toContain("Richtwert von Alperna");
    expect(md).not.toMatch(/je CHF|Mitte der Spanne/);
    calm(md);
  });

  it("macht aus einem zu kleinen Betrag eine Form der Anerkennung ohne Betrag", () => {
    const md = reportMarkdown(programm(form({ kundenwert: "100", marge: "20", beide: true }), KELLER, "du")!);
    expect(md).toContain("weniger als CHF 5.-");
    expect(md).toContain("- Dank von Hand:");
    expect(md).toContain("ein persönliches Dankeschön von uns");
  });

  it("gibt null zurück, wenn die Angaben nicht stimmen", () => {
    expect(programm(form({ kundenwert: "" }), KELLER, "du")).toBeNull();
    expect(programm(form({ marge: "0" }), KELLER, "du")).toBeNull();
    expect(programm(form({ anreiz: "" }), KELLER, "du")).toBeNull();
  });

  it("gibt den Hinweis zur E-Mail nur beim Kanal E-Mail aus, mit dem festen Wortlaut und ohne Rechtsaussage", () => {
    const text = "Versand nur an Personen, die dir ihre Adresse im Rahmen eines Auftrags gegeben haben; Werbung per E-Mail hat Regeln; ein Werkzeug dazu ist geplant.";
    expect(emailHinweis()).toBe(text);
    expect(emailHinweis(true)).toContain("im Rahmen der Mitgliedschaft");
    expect(hinweise({ kanal: "email", verein: false })).toContain(text);
    for (const kanal of ["whatsapp", "persoenlich", "karte"] as const) expect(hinweise({ kanal, verein: false }).join(" ")).not.toContain("E-Mail");
    for (const kanal of KANAL_KEYS) {
      for (const verein of [false, true]) {
        const alle = hinweise({ kanal, verein }).join("\n");
        expect(alle).not.toMatch(/Gesetz|Steuer|Datenschutz|Wettbewerb|Strafe|verboten|erlaubt|zulässig|rechtlich/i);
        calm(alle);
      }
    }
  });

  it("hält in jedem Dokument die Sperrliste und die Schreibregeln ein", () => {
    for (const kontext of [KELLER, FC]) {
      for (const typ of ANREIZ_KEYS) {
        for (const kanal of KANAL_KEYS) {
          for (const anrede of ["du", "sie"] as const) {
            for (const beide of [false, true]) {
              const doc = programm(form({ anreiz: typ, kanal, beide, anrede }), kontext, anrede)!;
              calm(toMarkdown(toDocument(doc)));
            }
          }
        }
      }
    }
  });

  it("schickt Eingabe und Ausgabe lesbar ins CRM, mit dem Anreiz im ersten Teil", () => {
    const eingabe = eingabeText(FORM, KELLER);
    expect(eingabe.split("\n")).toEqual([
      "Betrieb: Malerei Keller, Gossau",
      "Website: malerei-keller.ch",
      "Kundenwert pro Jahr: CHF 3'000.-",
      "Marge: 25 %",
      "Anreiz: Gutschein",
      "Beide Seiten belohnen: ja",
      "Kanal: Karte beim Auftrag",
      "WhatsApp-Nummer: 079 123 45 67",
      "Anrede: Du",
    ]);
    const ohneNummer = eingabeText(form({ kanal: "email", beide: false, anrede: "sie" }), FC).split("\n");
    expect(ohneNummer).toContain("Verein: FC Trogen");
    expect(ohneNummer).toContain("Jahresbeitrag pro Mitglied: CHF 3'000.-");
    expect(ohneNummer).toContain("Beide Seiten belohnen: nein");
    expect(ohneNummer).toContain("Kanal: E-Mail");
    expect(ohneNummer).toContain("Anrede: Sie");
    expect(ohneNummer.some((l) => l.startsWith("WhatsApp-Nummer"))).toBe(false);
    expect(eingabeText(EMPTY_FORM, { verein: false, firma: "", website: "" })).toContain("Betrieb: keine Angabe");

    const ausgabe = ausgabeText(p);
    expect(ausgabe.startsWith("# Empfehlungsprogramm Malerei Keller, Gossau")).toBe(true);
    // Der Server kürzt auf 1'900 Zeichen: Anreiz und Ablauf müssen davor stehen.
    expect(ausgabe.slice(0, 1900)).toContain("CHF 40.- bis CHF 75.- je Seite");
    expect(ausgabe.slice(0, 1900)).toContain("5. Dank und Anreiz an beide");
    expect(ausgabe).not.toMatch(/[{}]|"[a-z]+":/);
  });
});

describe("empfehlungsprogramm: gespeicherter Stand", () => {
  const result = { v: 1, phase: "result", form: FORM };

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 42, [], {}, { v: 2, phase: "result", form: FORM }, { v: 1, phase: "result" }, { v: 1, form: "x" }, { v: 1, form: [] }]) {
      expect(parseState(raw), JSON.stringify(raw)).toEqual(EMPTY_STATE);
    }
  });

  it("behält ein gültiges Ergebnis und macht aus einem ungültigen eine Bearbeitung", () => {
    expect(parseState(result)).toEqual({ v: 1, phase: "result", form: FORM });
    expect(parseState({ ...result, form: { ...FORM, kundenwert: "5" } }).phase).toBe("edit");
    expect(parseState({ ...result, form: { ...FORM, anrede: "x" } }).phase).toBe("edit");
    expect(parseState({ ...result, form: { ...FORM, nummer: "abc" } }).phase).toBe("edit");
    expect(parseState({ ...result, form: { ...FORM, kanal: "email", nummer: "abc" } }).phase).toBe("result");
    expect(parseState({ ...result, phase: "irgendwas" }).phase).toBe("edit");
  });

  it("säubert Felder mit falschen Typen und kürzt zu lange Texte", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      form: { kundenwert: 3000, marge: "9".repeat(100), anreiz: "gold", beide: "ja", kanal: "brief", nummer: "0".repeat(100), anrede: "ihr" },
    });
    expect(s.form.kundenwert).toBe("");
    expect(s.form.marge).toHaveLength(20);
    expect(s.form.anreiz).toBe("");
    expect(s.form.beide).toBe(false);
    expect(s.form.kanal).toBe("");
    expect(s.form.nummer).toHaveLength(40);
    expect(s.form.anrede).toBe("");
  });

  it("zählt im Pfad als erledigt, sobald das Ergebnis steht", () => {
    expect(isToolDone(JSON.stringify(parseState(result)))).toBe(true);
    expect(isToolDone(JSON.stringify(parseState({ ...result, phase: "edit" })))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });
});

describe("empfehlungsprogramm: Konfiguration und Seitentext", () => {
  it("passt zu den Vorgaben des Auftrags", () => {
    expect(config.slug).toBe("empfehlungsprogramm");
    expect(config.name).toBe("Empfehlungsprogramm-Designer");
    expect(config.audience).toBe("beide");
    expect(config.tagline.length).toBeLessThanOrEqual(110);
    expect(config.keyword).toBe("Empfehlungsprogramm");
    expect(config.related).toEqual(["bewertungs-kit", "whatsapp-link", "sponsoring-dossier"]);
    expect(config.usesProfile).toEqual(["organisationstyp", "firma", "website"]);
    expect(config.writesProfile).toEqual([]);
    expect(config.needsServer).toBe(false);
    expect(config.pathStep).toEqual({ path: "vereine", order: 4 });
  });

  const md = fs.readFileSync(path.join(process.cwd(), "content", "tools", "empfehlungsprogramm.md"), "utf8");
  const parsed = parseToolMarkdown(md);

  it("besteht die Prüfung des Seitentexts ohne Fehler und ohne Treffer der Sperrliste", () => {
    const issues = checkToolContent(parsed);
    expect(issues.filter((i) => i.level === "error"), JSON.stringify(issues)).toEqual([]);
    expect(brandHits(md.replace(/^---[\s\S]*?---/, "")), "Seitentext").toEqual([]);
    expect(parsed.frontmatter.tagline).toBe(config.tagline);
    expect(parsed.alperna.baustein).toBe("Website");
  });

  it("rechnet das Beispiel der Malerei Keller mit den Zahlen aus dem Werkzeug", () => {
    const beispiel = parsed.sections.beispiel ?? "";
    const r = rechnung({ kundenwert: "3000", marge: "25", anreiz: "gutschein", beide: true, kanal: "karte" });
    expect(beispiel).toContain(chfText(r.deckungsbeitrag));
    expect(beispiel).toContain(spanneText(r.gesamt!));
    expect(beispiel).toContain(spanneText(r.proSeite!));
    expect(beispiel).toContain(chfText(r.mitte!));
    for (const s of mechanik({ kanal: "karte", beide: true, verein: false })) expect(beispiel).toContain(s.titel);
  });
});

function chfText(n: number): string {
  return `CHF ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.-`;
}
