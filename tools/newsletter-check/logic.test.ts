import { describe, expect, it } from "vitest";
import spamData from "@/data/spamwoerter.json";
import {
  EMPTY_STATE,
  MAX_CHARS,
  RICHTWERT,
  SAMPLE,
  SPAMWOERTER,
  SPAMWOERTER_META,
  analyzeNewsletter,
  anredeOf,
  findingsOf,
  inputProblem,
  isHtml,
  loadSpamwoerter,
  parseNewsletterState,
  reportMarkdown,
  signatureOf,
  spamHits,
  toDocument,
  toPlainText,
  type NewsletterInput,
} from "./logic";

// Ein sauberer Newsletter, der alle Prüfpunkte erfüllt.
const GOOD_TEXT = `Hallo Anna

Im November streichen wir Fassaden zum Winterpreis. Die Farbe trocknet bei kühlem Wetter langsamer, darum planen wir pro Haus zwei Tage ein. Du bekommst eine Offerte innert drei Tagen, mit Material, Arbeit und Termin.

Im Oktober haben wir in Herisau ein Mehrfamilienhaus gestrichen. Die Bilder dazu findest du auf unserer Website.

Termin buchen: https://www.malerei-keller.ch/termin

Freundliche Grüsse
Peter Keller

Malerei Keller GmbH, Bahnhofstrasse 12, 9200 Gossau
Newsletter abmelden: https://www.malerei-keller.ch/abmelden`;

const GOOD: NewsletterInput = { betreff: "Fassade streichen: freie Termine im November", absender: "Malerei Keller", text: GOOD_TEXT };
const input = (over: Partial<NewsletterInput>): NewsletterInput => ({ ...GOOD, ...over });
const checkOf = (i: NewsletterInput, id: string) => analyzeNewsletter(i).checks.find((c) => c.id === id)!;
const passOf = (i: NewsletterInput, id: string) => checkOf(i, id).pass;

const HTML = `<!doctype html><html><head><title>Titel</title><style>p{color:red}</style></head><body><table><tr><td>
<p>Hallo Anna,</p><p>wir haben neue Termine. <a href="https://x.ch/termin?utm_source=nl">Termin buchen</a> oder <a href="https://x.ch/termin/#oben">hier</a>.</p>
<img src="a.jpg" alt="Frisch gestrichene Fassade in Gossau"><img src="b.jpg"><img src="pixel.gif" width="1" height="1">
<p><a href="https://x.ch/unsubscribe?u=1">Newsletter abmelden</a> · Malerei Keller GmbH, Bahnhofstrasse 12, 9200 Gossau</p>
</td></tr></table></body></html>`;

describe("newsletter-check: HTML erkennen und in Text wandeln", () => {
  it("erkennt HTML-Quelltext, aber keinen reinen Text mit spitzen Klammern", () => {
    expect(isHtml(HTML)).toBe(true);
    expect(isHtml("<p>Hallo</p>")).toBe(true);
    expect(isHtml("Preis < 100 und Qualität > Preis. <3")).toBe(false);
    expect(isHtml(GOOD_TEXT)).toBe(false);
  });

  it("macht aus Blöcken Zeilen, lässt Titel und Stile weg und entschärft Entitäten", () => {
    const { text, html } = toPlainText(HTML);
    expect(html).toBe(true);
    expect(text).not.toContain("Titel");
    expect(text).not.toContain("color");
    expect(text.split("\n")[0]).toBe("Hallo Anna,");
    expect(text).toContain("Termin buchen");
    expect(text).toContain("Newsletter abmelden");
    expect(toPlainText("Zeile 1\r\nZeile 2")).toEqual({ text: "Zeile 1\nZeile 2", html: false });
  });

  it("prüft bei HTML Bilder, Alt-Texte, Linkziele ohne Tracking-Parameter und nichtssagende Linktexte", () => {
    const r = analyzeNewsletter(input({ text: HTML }));
    expect(r.html).toBe(true);
    expect(r.images).toBe(2); // Zählpixel 1 × 1 zählt nicht
    expect(r.links).toBe(1); // Abfrage und Anker fallen weg, Abmeldelink ist Fusszeile
    expect(checkOf(input({ text: HTML }), "bilder-alt").detail).toMatch(/1 von 2 Bildern ohne Alt-Text/);
    expect(passOf(input({ text: HTML }), "bilder-verhaeltnis")).toBe(0.5);
    expect(passOf(input({ text: HTML }), "ziel-linktext")).toBe(0);
    expect(passOf(input({ text: HTML }), "abmeldung")).toBe(1);
    expect(passOf(input({ text: HTML }), "adresse")).toBe(1);
  });

  it("prüft bei reinem Text keine Bilder", () => {
    const r = analyzeNewsletter(GOOD);
    expect(r.html).toBe(false);
    expect(r.images).toBeNull();
    expect(r.checks.some((c) => c.group === "bilder")).toBe(false);
  });
});

describe("newsletter-check: Prüfpunkte", () => {
  it("der saubere Newsletter erfüllt alles und erreicht 100 Punkte", () => {
    const r = analyzeNewsletter(GOOD);
    expect(findingsOf(r).map((c) => c.id)).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.links).toBe(1);
    expect(r.ctas).toBe(1);
  });

  it("Betreff: fehlt, zu kurz, zu lang, im Richtwert", () => {
    expect(passOf(input({ betreff: "" }), "betreff")).toBe(0);
    expect(passOf(input({ betreff: "Neuigkeiten" }), "betreff")).toBe(0.5);
    expect(passOf(input({ betreff: "a".repeat(RICHTWERT.betreffMax + 1) }), "betreff")).toBe(0.5);
    expect(passOf(input({ betreff: "a".repeat(RICHTWERT.betreffMin) }), "betreff")).toBe(1);
    expect(checkOf(input({ betreff: "" }), "betreff").hint).toContain("Richtwert von Alperna");
  });

  it("Absender: aus dem Feld, aus der Signatur oder gar nicht", () => {
    expect(passOf(GOOD, "absender")).toBe(1);
    const ohneFeld = input({ absender: "" });
    expect(passOf(ohneFeld, "absender")).toBe(1);
    expect(checkOf(ohneFeld, "absender").detail).toContain("Peter Keller");
    const nichts = input({ absender: "", text: "Hallo Anna\n\nWir streichen im November Fassaden. Termin buchen: https://x.ch/t" });
    expect(passOf(nichts, "absender")).toBe(0);
  });

  it("Signatur: Grussformel mit Name, Rechtsform oder «Dein Team»", () => {
    expect(signatureOf("Text\n\nFreundliche Grüsse\nAnna Keller")).toBe("Anna Keller");
    expect(signatureOf("Text. Liebe Grüsse, dein Team Keller")).toBe("dein Team Keller");
    expect(signatureOf("Bis bald, Malerei Keller GmbH")).toBe("Malerei Keller GmbH");
    expect(signatureOf("Ohne alles.")).toBeNull();
  });

  it("Anrede: persönlich, mit Platzhalter, allgemein oder keine", () => {
    expect(anredeOf("Guten Tag Frau Müller\n\nText").kind).toBe("persoenlich");
    expect(anredeOf("Hallo {{Vorname}}\n\nText").kind).toBe("persoenlich");
    expect(anredeOf("Hallo zusammen,\n\nText").kind).toBe("allgemein");
    expect(anredeOf("Liebe Mitglieder\n\nText").kind).toBe("allgemein");
    expect(anredeOf("Sehr geehrte Damen und Herren\n\nText").kind).toBe("allgemein");
    expect(anredeOf("Wir lieben Farben. Hier gibt es keine Anrede.").kind).toBe("keine");
    expect(anredeOf("Kurz. Liebe Grüsse\nAnna").kind).toBe("keine");
    expect(passOf(input({ text: GOOD_TEXT.replace("Hallo Anna", "Liebe Kundinnen und Kunden") }), "anrede")).toBe(0.75);
    expect(passOf(input({ text: GOOD_TEXT.replace("Hallo Anna\n\n", "") }), "anrede")).toBe(0);
  });

  it("Ziel: zu viele Linkziele, zu viele Aufforderungen, «hier klicken», kein Link", () => {
    const viele = Array.from({ length: RICHTWERT.linksMax + 1 }, (_, i) => `Mehr: https://www.malerei-keller.ch/seite-${i}`).join("\n");
    const r = analyzeNewsletter(input({ text: `${GOOD_TEXT}\n${viele}` }));
    expect(r.links).toBe(RICHTWERT.linksMax + 2);
    expect(passOf(input({ text: `${GOOD_TEXT}\n${viele}` }), "ziel-links")).toBe(0.5);
    // Gleiche Seite mit Tracking-Parametern zählt einmal.
    const same = `${GOOD_TEXT}\nhttps://www.malerei-keller.ch/termin?utm_source=a\nhttps://www.malerei-keller.ch/termin/#x`;
    expect(analyzeNewsletter(input({ text: same })).links).toBe(1);
    const ctas = `${GOOD_TEXT}\nJetzt anmelden. Mehr erfahren. Folgen Sie uns. Bewerten Sie uns.`;
    expect(analyzeNewsletter(input({ text: ctas })).ctas).toBe(5);
    expect(passOf(input({ text: ctas }), "ziel-cta")).toBe(0.5);
    expect(passOf(input({ text: `${GOOD_TEXT}\nHier klicken: https://www.malerei-keller.ch/x` }), "ziel-linktext")).toBe(0);
    const ohneLink = input({ text: GOOD_TEXT.replace(/https?:\/\/\S+/g, "") });
    expect(passOf(ohneLink, "ziel-links")).toBe(0.5);
    expect(checkOf(ohneLink, "ziel-links").hint).toContain("HTML-Quelltext");
  });

  it("Abmeldung: Wörter im Text oder Link, sonst Fund ohne Rechtsaussage", () => {
    const ohne = input({ text: GOOD_TEXT.replace(/Newsletter abmelden:.*$/m, "") });
    const c = checkOf(ohne, "abmeldung");
    expect(c.pass).toBe(0);
    expect(c.hint).not.toMatch(/UWG|Pflicht|erlaubt|verboten|gesetz/i);
    expect(passOf(input({ text: GOOD_TEXT.replace("Newsletter abmelden", "Unsubscribe") }), "abmeldung")).toBe(1);
    expect(passOf(input({ text: GOOD_TEXT.replace("Newsletter abmelden", "Keine weiteren E-Mails") }), "abmeldung")).toBe(1);
  });

  it("Adresse: Strasse mit Nummer und PLZ mit Ort, nur eines davon, nichts", () => {
    expect(passOf(GOOD, "adresse")).toBe(1);
    expect(passOf(input({ text: GOOD_TEXT.replace("Bahnhofstrasse 12, ", "") }), "adresse")).toBe(0.5);
    expect(passOf(input({ text: GOOD_TEXT.replace("Bahnhofstrasse 12, 9200 Gossau", "Gossau") }), "adresse")).toBe(0);
    // Jahreszahl mit Monat ist keine Postleitzahl.
    expect(passOf(input({ text: GOOD_TEXT.replace("Bahnhofstrasse 12, 9200 Gossau", "seit 2026 Oktober") }), "adresse")).toBe(0);
    expect(passOf(input({ text: GOOD_TEXT.replace("Bahnhofstrasse 12, 9200 Gossau", "Postfach 5, CH-9200 Gossau") }), "adresse")).toBe(1);
  });

  it("Spam: Muster aus der Datei, Grossbuchstaben ab zwei Wörtern, Ausrufezeichen ab vier", () => {
    const ids = (t: string) => spamHits(t).map((h) => h.item.id);
    expect(ids("GRATIS und KOSTENLOS Beratung")).toEqual(expect.arrayContaining(["p-gratis", "f-grossschreibung"]));
    expect(ids("GRATIS Beratung")).not.toContain("f-grossschreibung");
    expect(ids("Toll! Super! Gut!")).not.toContain("f-ausrufezeichen");
    expect(ids("Toll! Super! Gut! Ja!")).toContain("f-ausrufezeichen");
    expect(ids("jetzt zugreifen, nur heute, 70 % Rabatt")).toEqual(expect.arrayContaining(["d-jetzt-zugreifen", "d-nur-heute", "p-rabatt-hoch"]));
    expect(ids("Re: dein Termin")).toContain("f-re-fwd");
    expect(ids("Wir streichen im November. Termin buchen.")).toEqual([]);
    const r = analyzeNewsletter(input({ betreff: "GRATIS Beratung nur heute für dich sichern" }));
    expect(passOf(input({ betreff: "GRATIS Beratung nur heute für dich sichern" }), "spam")).toBeLessThan(1);
    expect(r.checks.find((c) => c.id === "spam")!.examples[0]).toMatch(/Zum Beispiel: «/);
  });

  it("die Datei ist gültig: Quelle, Stand, eindeutige Kennungen, alle Muster kompilieren, keines trifft den leeren Text", () => {
    expect(SPAMWOERTER_META.source).toContain("Redaktionelle Liste von Alperna");
    expect(SPAMWOERTER_META.source).toContain("keine Häufigkeitsangaben");
    expect(SPAMWOERTER_META.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const all = spamData.items.map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(35);
    expect(SPAMWOERTER).toHaveLength(all.length);
    for (const s of SPAMWOERTER) {
      expect(s.re.test("")).toBe(false);
      s.re.lastIndex = 0;
      expect(s.label.trim()).not.toBe("");
      expect(s.hint.trim()).not.toBe("");
    }
  });

  it("kaputte Muster in der Datei fallen einzeln weg", () => {
    const loaded = loadSpamwoerter([
      { id: "kaputt", pattern: "(", label: "x", hint: "y", group: "form" },
      { id: "gut", pattern: "\\bgratis\\b", label: "gratis", hint: "y", group: "preis" },
    ]);
    expect(loaded.map((s) => s.id)).toEqual(["gut"]);
    expect(loaded[0].minCount).toBe(1);
  });

  it("Sprache: Floskeln, Schreibweise und lange Sätze kommen aus dem Textcheck", () => {
    const t = input({ text: GOOD_TEXT.replace("Im November streichen wir Fassaden zum Winterpreis.", 'In der heutigen Zeit streichen wir "qualitativ hochwertig" die Straße für 5% weniger.') });
    expect(passOf(t, "sprache-floskeln")).toBe(0.5);
    expect(checkOf(t, "sprache-floskeln").detail).toContain("In der heutigen Zeit");
    expect(passOf(t, "sprache-form")).toBeLessThan(1);
    expect(checkOf(t, "sprache-form").detail).toMatch(/Eszett|Anführungszeichen|Prozent/);
    const long = `${GOOD_TEXT}\n${Array.from({ length: 30 }, () => "wort").join(" ")}.`;
    expect(passOf(input({ text: long }), "laenge-saetze")).toBe(0.5);
    expect(checkOf(input({ text: long }), "laenge-saetze").examples[0]).toMatch(/^30 Wörter/);
  });

  it("Länge: kurz, im Richtwert, lang", () => {
    expect(passOf(input({ text: "Hallo Anna\n\nKurz. Termin buchen: https://x.ch\n\nFreundliche Grüsse\nPeter" }), "laenge-woerter")).toBe(0.5);
    expect(passOf(GOOD, "laenge-woerter")).toBe(1);
    const lang = `${GOOD_TEXT}\n${Array.from({ length: 90 }, () => "Wir streichen Wände und Fassaden in Gossau.").join(" ")}`;
    const c = checkOf(input({ text: lang }), "laenge-woerter");
    expect(c.pass).toBe(0.5);
    expect(c.detail).toContain("das ist lang");
  });
});

describe("newsletter-check: Punktzahl", () => {
  it("liegt zwischen 0 und 100 und sinkt oder bleibt mit jedem zusätzlichen Fund", () => {
    const steps: NewsletterInput[] = [
      GOOD,
      input({ text: GOOD_TEXT.replace(/Newsletter abmelden:.*$/m, "") }),
      input({ text: GOOD_TEXT.replace(/Newsletter abmelden:.*$/m, "").replace("Bahnhofstrasse 12, 9200 Gossau", "Gossau") }),
      input({ betreff: "GRATIS!!!! nur heute", text: GOOD_TEXT.replace(/Newsletter abmelden:.*$/m, "").replace("Bahnhofstrasse 12, 9200 Gossau", "Gossau") }),
      input({ betreff: "", absender: "", text: "Kurz.\nHier klicken: https://a.ch https://b.ch https://c.ch https://d.ch https://e.ch https://f.ch" }),
    ];
    const scores = steps.map((s) => analyzeNewsletter(s).score);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    expect(scores[0]).toBe(100);
    expect(scores[scores.length - 1]).toBeLessThan(50);
  });

  it("die Gruppen tragen ihre Gewichte und Punkte, Bilder nur bei HTML", () => {
    const r = analyzeNewsletter(GOOD);
    expect(r.groups.map((g) => g.group)).not.toContain("bilder");
    expect(r.groups.reduce((n, g) => n + g.weight, 0)).toBe(r.checks.reduce((n, c) => n + c.weight, 0));
    expect(analyzeNewsletter(input({ text: HTML })).groups.map((g) => g.group)).toContain("bilder");
  });
});

describe("newsletter-check: Eingabe, Stand, Bericht", () => {
  it("lehnt leere Texte, nur Leerraum und zu lange Texte ab, HTML ohne Text mit eigener Meldung", () => {
    expect(inputProblem("")).toMatch(/Füge zuerst/);
    expect(inputProblem("   \n\t ")).toMatch(/Füge zuerst/);
    expect(inputProblem("<p></p><img src='a.jpg'>")).toMatch(/kein Text/);
    expect(inputProblem("a".repeat(MAX_CHARS + 1))).toMatch(/20'000 Zeichen/);
    expect(inputProblem("Ein Wort")).toBeNull();
  });

  it("verarbeitet leere und sinnlose Eingaben ohne Fehler", () => {
    for (const text of ["", "   ", "1234", "!!!???", "😀😀", "<p></p>", "\u0000\u0001"]) {
      expect(() => analyzeNewsletter({ betreff: "", absender: "", text })).not.toThrow();
      const r = analyzeNewsletter({ betreff: "", absender: "", text });
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("bleibt bei bösartigen Eingaben von 20'000 Zeichen schnell", () => {
    const inputs = [
      "a".repeat(MAX_CHARS),
      "A".repeat(MAX_CHARS),
      "!".repeat(MAX_CHARS),
      "a ".repeat(MAX_CHARS / 2),
      "\n".repeat(MAX_CHARS),
      "www.".repeat(MAX_CHARS / 4),
      "<a href=".repeat(MAX_CHARS / 8),
      "<img ".repeat(MAX_CHARS / 5),
      "<p>".repeat(MAX_CHARS / 3),
      "Bahnhofstrasse 1 ".repeat(MAX_CHARS / 17),
      "9200 A ".repeat(MAX_CHARS / 7),
      "Hallo ".repeat(MAX_CHARS / 6),
      "Liebe Grüsse ".repeat(MAX_CHARS / 13),
      "a-".repeat(MAX_CHARS / 2),
      "GmbH ".repeat(MAX_CHARS / 5),
      "jetzt ".repeat(MAX_CHARS / 6),
    ];
    for (const text of inputs) {
      const t0 = performance.now();
      analyzeNewsletter({ betreff: text.slice(0, 300), absender: "", text });
      expect(performance.now() - t0).toBeLessThan(1500);
    }
  });

  it("liest den gespeicherten Stand und fällt bei Müll auf den leeren Stand zurück", () => {
    expect(parseNewsletterState(null)).toEqual(EMPTY_STATE);
    expect(parseNewsletterState("x")).toEqual(EMPTY_STATE);
    expect(parseNewsletterState({ v: 2, text: "x" })).toEqual(EMPTY_STATE);
    expect(parseNewsletterState({ v: 1, text: 5 })).toEqual(EMPTY_STATE);
    expect(parseNewsletterState({ v: 1, phase: "result", betreff: 7, absender: null, text: "Ein Satz." })).toEqual({ v: 1, phase: "result", betreff: "", absender: "", text: "Ein Satz." });
    expect(parseNewsletterState({ v: 1, phase: "result", text: "   " }).phase).toBe("edit");
    expect(parseNewsletterState({ v: 1, phase: "edit", text: "wort ".repeat(10000) }).text.length).toBe(MAX_CHARS);
  });

  it("Bericht und Dokument enthalten Punktzahl, Funde, Erfülltes und die Richtwerte", () => {
    const r = analyzeNewsletter(SAMPLE);
    const md = reportMarkdown(r);
    expect(md).toMatch(/^# Newsletter-Check/);
    expect(md).toContain(`${r.score} von 100 Punkten`);
    expect(md).toContain("## Das fällt auf");
    expect(md).toContain("Abmeldemöglichkeit");
    expect(md).toContain("## Erfüllt");
    expect(md).toContain("Richtwerte von Alperna, keine Statistik");
    expect(md).not.toMatch(/UWG|Pflicht|verboten/);
    const doc = toDocument(r);
    expect(doc.title).toBe("Newsletter-Check");
    expect(doc.filename).toBe("newsletter-check");
    expect(doc.blocks[0].type).toBe("facts");
    expect(reportMarkdown(analyzeNewsletter(GOOD))).toContain("nichts aufgefallen");
  });

  it("prüft das Beispiel der Malerei Keller: die Zahlen, die der Seitentext nennt", () => {
    const r = analyzeNewsletter(SAMPLE);
    expect(r.html).toBe(false);
    expect(r.score).toBe(40);
    expect(r.words).toBe(133);
    expect(r.sentences).toBe(13);
    expect(r.links).toBe(6);
    expect(r.ctas).toBe(5);
    expect(r.readability?.index).toBe(65);
    expect(r.checks.filter((c) => c.ok).map((c) => c.id)).toEqual(["absender", "laenge-woerter"]);
    expect(checkOf(SAMPLE, "betreff").detail).toContain("73 Zeichen");
    expect(checkOf(SAMPLE, "spam").detail).toMatch(/^5 Muster/);
    expect(checkOf(SAMPLE, "sprache-floskeln").detail).toMatch(/^2 Floskeln/);
    expect(checkOf(SAMPLE, "laenge-saetze").examples[0]).toMatch(/^41 Wörter/);
  });
});
