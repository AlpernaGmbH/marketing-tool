import { describe, expect, it } from "vitest";
import floskelnData from "@/data/floskeln.json";
import {
  EMPTY_STATE,
  FLOSKELN,
  FLOSKELN_META,
  LONG_SENTENCE_WORDS,
  MAX_CHARS,
  MIN_WORDS_FOR_INDEX,
  SAMPLE_TEXT,
  analyzeText,
  cleanText,
  findingsOf,
  inputProblem,
  levelOf,
  num,
  parseTextcheckState,
  readability,
  reportMarkdown,
  syllables,
} from "./logic";

const ENTCHEN = "Alle meine Entchen schwimmen auf dem See, Köpfchen unters Wasser, Schwänzchen in die Höh.";
const ids = (text: string) => findingsOf(text).map((f) => f.id);
const count = (text: string, id: string) => findingsOf(text).find((f) => f.id === id)?.count ?? 0;

describe("textcheck: Silben und Lesbarkeit", () => {
  it("schätzt Silben aus Selbstlautgruppen", () => {
    expect(syllables("Entchen")).toBe(2);
    expect(syllables("meine")).toBe(2);
    expect(syllables("See")).toBe(1);
    expect(syllables("die")).toBe(1);
    expect(syllables("Schwänzchen")).toBe(2);
    expect(syllables("E-Mail")).toBe(2);
  });

  it("zählt Kürzel ohne Selbstlaut je Buchstabe, kleine Wörter ohne Selbstlaut als eine Silbe", () => {
    expect(syllables("CHF")).toBe(3);
    expect(syllables("SBB")).toBe(3);
    expect(syllables("Pst")).toBe(1);
  });

  it("rechnet das Beispiel der Quelle nach: 14 Wörter, 22 Silben, Index 74", () => {
    // Quelle: de.wikipedia.org/wiki/Lesbarkeitsindex, Beispiel «Alle meine Entchen» (ASL 14, ASW 1,57, Amstad 74).
    // Dreimal hintereinander, damit die Mindestzahl an Wörtern erreicht ist; Mittelwerte bleiben gleich.
    const text = `${ENTCHEN} ${ENTCHEN} ${ENTCHEN}`;
    const r = readability(text);
    expect(r).not.toBeNull();
    expect(r!.avgSentenceLength).toBeCloseTo(14, 5);
    expect(r!.avgSyllables).toBeCloseTo(22 / 14, 5);
    expect(r!.index).toBe(74);
    expect(r!.level).toBe("mittelleicht");
  });

  it("ordnet die Stufen nach Amstad ein (von … bis unter …)", () => {
    expect(levelOf(-12)).toBe("sehr schwer");
    expect(levelOf(29)).toBe("sehr schwer");
    expect(levelOf(30)).toBe("schwer");
    expect(levelOf(49)).toBe("schwer");
    expect(levelOf(50)).toBe("mittelschwer");
    expect(levelOf(60)).toBe("mittel");
    expect(levelOf(70)).toBe("mittelleicht");
    expect(levelOf(80)).toBe("leicht");
    expect(levelOf(90)).toBe("sehr leicht");
    expect(levelOf(120)).toBe("sehr leicht");
  });

  it("zeigt bei zu wenig Text keinen Index", () => {
    expect(readability("Ein kurzer Satz.")).toBeNull();
    expect(MIN_WORDS_FOR_INDEX).toBeGreaterThan(5);
  });

  it("beendet Sätze nicht an Kürzeln, Dezimalzahlen, Datum und Ordnungszahlen", () => {
    const text =
      "Am 3. Oktober 2026 kostet es ca. 8,5 Franken, z. B. für Kinder. Danach ist Schluss. Mehr unter www.alperna.ch oder kontakt@alperna.ch erfahren Sie. Preis: 1.250 Franken.";
    expect(analyzeText(text).sentences).toBe(4);
  });

  it("zählt Zeilenumbrüche als Satzgrenze (Überschriften, Listen)", () => {
    expect(analyzeText("Unsere Leistungen\nMalen\nTapezieren\nDann folgt ein ganzer Satz.").sentences).toBe(4);
  });
});

describe("textcheck: Fehler", () => {
  it("findet doppelte Wörter, auch mit anderer Gross- und Kleinschreibung, aber keine Teilwörter", () => {
    expect(count("Wir malen bei der der Wahl mit.", "doppeltes-wort")).toBe(1);
    expect(count("Die die Farbe stimmt.", "doppeltes-wort")).toBe(1);
    expect(count("Die Dienstleistung dient dem Dienst.", "doppeltes-wort")).toBe(0);
    expect(count("Er sagte ja, ja, ja.", "doppeltes-wort")).toBe(0);
  });

  it("findet Leerzeichen vor Satzzeichen und fehlende Leerzeichen nach dem Komma", () => {
    expect(count("Hallo , Welt.", "leerzeichen-vor-satzzeichen")).toBe(1);
    expect(count("Wirklich ?", "leerzeichen-vor-satzzeichen")).toBe(1);
    expect(count("Innen ,und aussen.", "leerzeichen-vor-satzzeichen")).toBe(1);
    expect(count("Hallo,Welt;gut", "komma-ohne-leerzeichen")).toBe(2);
    expect(count("Es kostet 8,5 Franken.", "komma-ohne-leerzeichen")).toBe(0);
  });

  it("findet mehrere Leerzeichen und wiederholte Satzzeichen", () => {
    expect(count("Ein  Satz.", "doppeltes-leerzeichen")).toBe(1);
    expect(count("Ein Satz.\n  Eingerückt.", "doppeltes-leerzeichen")).toBe(0);
    expect(count("Wirklich?? Ja!!! Und so weiter....", "mehrfach-satzzeichen")).toBe(3);
    expect(count("Und so weiter...", "mehrfach-satzzeichen")).toBe(0);
  });
});

describe("textcheck: Schweizer Schreibweise", () => {
  it("meldet Eszett, Anführungszeichen, Prozent, CHF nach dem Betrag und Tausender mit Punkt", () => {
    const text = 'Die Straße kostet 5% mehr. Er sagte „gut“ und "fein". Ab 450 CHF, oder 12.500 Franken.';
    expect(count(text, "eszett")).toBe(1);
    expect(count(text, "anfuehrungszeichen")).toBe(4);
    expect(count(text, "prozent")).toBe(1);
    expect(count(text, "chf-nachgestellt")).toBe(1);
    expect(count(text, "tausender")).toBe(1);
  });

  it("lässt Schweizer Schreibweisen in Ruhe", () => {
    const text = "Die Strasse kostet 5 % mehr. Er sagte «gut». Ab CHF 450 oder 12'500 Franken. Am 03.10.2026 um 10.30 Uhr, Version 2.1.";
    expect(ids(text)).toEqual([]);
  });

  it("hält Datum und Dezimalzahlen nicht für Tausender", () => {
    expect(count("Am 03.10.2026 und am 1.10.2026. Preis 1.250,50 Franken. Version 10.2026.", "tausender")).toBe(0);
    expect(count("2.500.000 Einwohner", "tausender")).toBe(1);
  });
});

describe("textcheck: Floskeln", () => {
  it("erkennt Floskeln aus der Datei und nennt eine Alternative", () => {
    const f = findingsOf("In der heutigen Zeit arbeiten wir qualitativ hochwertig und zeitnah. Wir sind grundsätzlich bereit.");
    const titles = f.filter((x) => x.kind === "floskel").map((x) => x.title);
    expect(titles).toEqual(expect.arrayContaining(["In der heutigen Zeit / Heutzutage", "qualitativ hochwertig / höchste Qualität", "zeitnah / umgehend", "Im Wesentlichen / Grundsätzlich"]));
    for (const x of f.filter((y) => y.kind === "floskel")) expect(x.hint.length).toBeGreaterThan(5);
  });

  it("findet nichts in einem Text ohne Floskeln", () => {
    expect(findingsOf("Wir streichen Wände. Termine gibt es ab Montag. Du erreichst uns unter 071 000 00 00.").filter((f) => f.kind === "floskel")).toEqual([]);
  });

  it("gruppiert mehrere Treffer derselben Floskel und zeigt höchstens vier Stellen", () => {
    const text = Array.from({ length: 7 }, () => "Das ist zeitnah erledigt.").join(" ");
    const f = findingsOf(text).find((x) => x.id === "floskel-b-zeitnah")!;
    expect(f.count).toBe(7);
    expect(f.examples).toHaveLength(4);
    expect(f.examples[0].excerpt).toContain("zeitnah");
  });

  it("die Datei ist gültig: Quelle, Stand, eindeutige Kennungen, alle Muster kompilieren und keines trifft den leeren Text", () => {
    expect(FLOSKELN_META.source.length).toBeGreaterThan(20);
    expect(FLOSKELN_META.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const all = floskelnData.items.map((i) => i.id);
    expect(new Set(all).size).toBe(all.length);
    expect(FLOSKELN).toHaveLength(all.length);
    for (const f of FLOSKELN) {
      expect(f.re.test("")).toBe(false);
      f.re.lastIndex = 0;
      expect(f.label.trim()).not.toBe("");
      expect(f.alternative.trim()).not.toBe("");
    }
  });
});

describe("textcheck: lange Sätze", () => {
  it("zählt Sätze über der Grenze und nennt die Wortzahl", () => {
    const long = Array.from({ length: LONG_SENTENCE_WORDS + 5 }, () => "wort").join(" ") + ".";
    const f = findingsOf(`Kurz. ${long} Noch kurz.`).find((x) => x.id === "lange-saetze")!;
    expect(f.count).toBe(1);
    expect(f.examples[0].excerpt).toMatch(/^30 Wörter:/);
  });

  it("ein Satz an der Grenze zählt noch nicht als lang", () => {
    const edge = Array.from({ length: LONG_SENTENCE_WORDS }, () => "wort").join(" ") + ".";
    expect(ids(edge)).not.toContain("lange-saetze");
  });
});

describe("textcheck: Bereinigen", () => {
  it("ersetzt Eszett und stellt Anführungszeichen auf Guillemets um", () => {
    expect(cleanText("Die Straße")).toBe("Die Strasse");
    expect(cleanText('Er sagte "gut" und "fein".')).toBe("Er sagte «gut» und «fein».");
    expect(cleanText("Er sagte „gut“.")).toBe("Er sagte «gut».");
    expect(cleanText("Er sagte “good”.")).toBe("Er sagte «good».");
  });

  it("lässt ungepaarte gerade Anführungszeichen stehen und behandelt Zeilen einzeln", () => {
    expect(cleanText('Ein "offenes Zitat')).toBe('Ein "offenes Zitat');
    expect(cleanText('Ein "offenes Zitat\nEin "gutes" Zitat')).toBe('Ein "offenes Zitat\nEin «gutes» Zitat');
  });

  it("räumt Leerzeichen und Prozent auf", () => {
    expect(cleanText("Hallo , Welt  und mehr .")).toBe("Hallo, Welt und mehr.");
    expect(cleanText("Innen ,und aussen")).toBe("Innen, und aussen");
    expect(cleanText("Hallo,Welt")).toBe("Hallo, Welt");
    expect(cleanText("5% Rabatt und 8,1% mehr")).toBe("5 % Rabatt und 8,1 % mehr");
  });

  it("rührt Einrückung, Zeilenumbrüche, Beträge und Datum nicht an", () => {
    const text = "Titel\n\n  - Punkt eins\n  - Punkt zwei\n\nAm 03.10.2026 kostet es CHF 1'250.-.\n";
    expect(cleanText(text)).toBe(text);
  });

  it("ist wiederholbar: ein bereinigter Text hat keine automatisch behebbaren Funde mehr", () => {
    const once = cleanText(SAMPLE_TEXT);
    expect(cleanText(once)).toBe(once);
    const left = findingsOf(once).filter((f) => f.fix);
    expect(left).toEqual([]);
  });

  it("lässt alles, was nur ein Hinweis ist, unverändert (Floskeln, CHF-Stellung, Tausender, doppelte Wörter)", () => {
    const text = "Das kostet 450 CHF und 12.500 Franken, zeitnah, bei der der Wahl.";
    expect(cleanText(text)).toBe(text);
  });
});

describe("textcheck: Gesamtbericht", () => {
  it("prüft den Beispieltext: findet die eingebauten Stolperstellen und bereinigt sie", () => {
    const r = analyzeText(SAMPLE_TEXT);
    const found = r.findings.map((f) => f.id);
    for (const id of ["eszett", "anfuehrungszeichen", "prozent", "chf-nachgestellt", "tausender", "doppeltes-leerzeichen", "doppeltes-wort", "lange-saetze", "floskel-b-zeitnah"]) {
      expect(found).toContain(id);
    }
    expect(r.readability).not.toBeNull();
    expect(r.fixedCount).toBeGreaterThanOrEqual(5);
    expect(r.cleaned).not.toBe(SAMPLE_TEXT);
    expect(r.cleaned).not.toContain("ß");
    expect(r.cleaned).toContain("«Sauber gestrichen, sauber gerechnet»");
  });

  it("sortiert Fehler vor Schreibweise vor Floskeln vor Satzlänge", () => {
    const kinds = analyzeText(SAMPLE_TEXT).findings.map((f) => f.kind);
    const order = ["fehler", "schreibweise", "floskel", "satz"];
    const ranks = kinds.map((k) => order.indexOf(k));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("gibt für einen sauberen Text keine Funde und eine Meldung im Bericht", () => {
    const text = "Wir streichen Wände und Fassaden in Gossau und Herisau. Ein Termin ist meist innert einer Woche möglich. Du schreibst uns, wir kommen vorbei und machen eine Offerte.";
    const r = analyzeText(text);
    expect(r.findings).toEqual([]);
    expect(reportMarkdown(r)).toContain("nichts aufgefallen");
    expect(reportMarkdown(r)).toContain("Rechtschreibung einzelner Wörter und Grammatik prüft der Textcheck nicht");
  });

  it("der Bericht zum Kopieren nennt Zahlen, Gruppen und Beispiele, mit Komma als Dezimalzeichen", () => {
    const md = reportMarkdown(analyzeText(SAMPLE_TEXT));
    expect(md).toMatch(/^# Textcheck/);
    expect(md).toMatch(/Wörter: \d+/);
    expect(md).toMatch(/Durchschnittliche Satzlänge: \d+,\d Wörter/);
    expect(md).toContain("### Schweizer Schreibweise");
    expect(md).toContain("### Floskeln");
    expect(md).not.toMatch(/\d\.\d Wörter/);
  });

  it("formatiert Zahlen mit Komma", () => {
    expect(num(13.333)).toBe("13,3");
    expect(num(2, 0)).toBe("2");
  });
});

describe("textcheck: Eingabe und Stand", () => {
  it("lehnt leere und zu lange Texte ab", () => {
    expect(inputProblem("")).toMatch(/Füge zuerst einen Text ein/);
    expect(inputProblem("   \n  ")).toMatch(/Füge zuerst einen Text ein/);
    expect(inputProblem("123 456")).toMatch(/Füge zuerst einen Text ein/);
    expect(inputProblem("a".repeat(MAX_CHARS + 1))).toMatch(/20'000 Zeichen/);
    expect(inputProblem("Ein Wort")).toBeNull();
  });

  it("liest den gespeicherten Stand und fällt bei Müll auf den leeren Stand zurück", () => {
    expect(parseTextcheckState(null)).toEqual(EMPTY_STATE);
    expect(parseTextcheckState("text")).toEqual(EMPTY_STATE);
    expect(parseTextcheckState({ v: 2, text: "x" })).toEqual(EMPTY_STATE);
    expect(parseTextcheckState({ v: 1, text: 5 })).toEqual(EMPTY_STATE);
    expect(parseTextcheckState({ v: 1, phase: "result", text: "Ein Satz.", counted: true })).toEqual({ v: 1, phase: "result", text: "Ein Satz.", counted: true });
  });

  it("zeigt kein Ergebnis für einen Text ohne Wörter und kürzt zu lange gespeicherte Texte", () => {
    expect(parseTextcheckState({ v: 1, phase: "result", text: "  ", counted: true }).phase).toBe("edit");
    expect(parseTextcheckState({ v: 1, phase: "edit", text: "wort ".repeat(10000), counted: false }).text.length).toBe(MAX_CHARS);
  });
});

describe("textcheck: Randfälle und Laufzeit", () => {
  it("verarbeitet Text ohne Buchstaben, Emojis und Sonderzeichen ohne Fehler", () => {
    for (const text of ["", "   ", "1234 5678", "!!!???", "😀😀😀", "—–…", "\u0000\u0001\u0002"]) {
      expect(() => analyzeText(text)).not.toThrow();
    }
    expect(analyzeText("1234 5678").words).toBe(0);
    expect(analyzeText("").readability).toBeNull();
  });

  it("bleibt bei bösartigen Eingaben von 20'000 Zeichen schnell (keine quadratische Laufzeit)", () => {
    const inputs = [
      "a".repeat(MAX_CHARS),
      "!".repeat(MAX_CHARS - 1) + "a",
      "1".repeat(MAX_CHARS),
      "1.000".repeat(MAX_CHARS / 5),
      " ".repeat(MAX_CHARS - 1) + "a",
      "a" + " ".repeat(MAX_CHARS - 2) + "!",
      "a ".repeat(MAX_CHARS / 2),
      ". ".repeat(MAX_CHARS / 2),
      "a@".repeat(MAX_CHARS / 2),
      "\n".repeat(MAX_CHARS),
      '"'.repeat(MAX_CHARS),
      "wort ".repeat(MAX_CHARS / 5),
    ];
    for (const text of inputs) {
      const t0 = performance.now();
      analyzeText(text);
      expect(performance.now() - t0).toBeLessThan(1500);
    }
  });
});
