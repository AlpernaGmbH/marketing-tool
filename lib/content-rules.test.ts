import { describe, expect, it } from "vitest";
import { parseToolMarkdown, splitH2 } from "@/lib/content";
import { checkToolContent, countWords } from "@/lib/content-rules";
import { validToolMarkdown, words } from "@/tests/fixtures";

const check = (md: string) => checkToolContent(parseToolMarkdown(md));
const errorCodes = (md: string) => check(md).filter((i) => i.level === "error").map((i) => i.code);

describe("countWords", () => {
  it("zählt Wörter, ignoriert Markdown-Zeichen und leere Tokens", () => {
    expect(countWords("## Titel\n\n- eins zwei\n- drei **vier**")).toBe(5);
    expect(countWords("")).toBe(0);
    expect(countWords(" * | > ")).toBe(0);
  });
});

describe("splitH2", () => {
  it("ignoriert Überschriften in Codeblöcken", () => {
    const parts = splitH2("## A\ntext\n```\n## B\n```\n## C\nmehr");
    expect(parts.map((p) => p.title)).toEqual(["A", "C"]);
  });
});

describe("checkToolContent: gültiger Text", () => {
  it("hat keine Fehler", () => {
    expect(errorCodes(validToolMarkdown())).toEqual([]);
  });
});

describe("checkToolContent: Struktur", () => {
  it("meldet fehlende Abschnitte", () => {
    expect(errorCodes(validToolMarkdown({ omit: ["beispiel"] }))).toContain("section-missing");
    expect(errorCodes(validToolMarkdown({ omit: ["alperna"] }))).toContain("section-missing");
  });
  it("meldet falsche Reihenfolge", () => {
    expect(errorCodes(validToolMarkdown({ swap: true }))).toContain("section-order");
  });
  it("meldet unbekannte Abschnitte und eine H1 im Text", () => {
    expect(errorCodes(validToolMarkdown({ extra: "## Noch etwas\ntext" }))).toContain("section-unknown");
    expect(errorCodes(validToolMarkdown({ extra: "# Zweite H1\ntext" }))).toContain("h1-in-body");
  });
  it("meldet fehlende Kopfdaten", () => {
    expect(errorCodes(validToolMarkdown({ front: { h1: null } }))).toContain("frontmatter");
  });
});

describe("checkToolContent: Umfang", () => {
  it("verlangt 200 bis 300 Wörter in «Warum das wichtig ist»", () => {
    expect(errorCodes(validToolMarkdown({ warum: words(150) }))).toContain("warum-words");
    expect(errorCodes(validToolMarkdown({ warum: words(350) }))).toContain("warum-words");
    expect(errorCodes(validToolMarkdown({ warum: words(200) }))).not.toContain("warum-words");
  });
  it("verlangt 3 bis 5 nummerierte Schritte", () => {
    expect(errorCodes(validToolMarkdown({ nutzen: "1. a\n2. b" }))).toContain("nutzen-steps");
    expect(errorCodes(validToolMarkdown({ nutzen: "1. a\n2. b\n3. c\n4. d\n5. e\n6. f" }))).toContain("nutzen-steps");
  });
  it("verlangt 3 bis 5 Punkte bei Häufige Fehler", () => {
    expect(errorCodes(validToolMarkdown({ fehler: "- a\n- b" }))).toContain("fehler-items");
  });
  it("verlangt 5 bis 7 FAQ und Antworten", () => {
    expect(errorCodes(validToolMarkdown({ faqCount: 4 }))).toContain("faq-count");
    expect(errorCodes(validToolMarkdown({ faqCount: 8 }))).toContain("faq-count");
    expect(errorCodes(validToolMarkdown({ faqCount: 7 }))).not.toContain("faq-count");
  });
  it("verlangt 800 bis 1'200 Wörter gesamt", () => {
    expect(errorCodes(validToolMarkdown({ warum: words(200), faqCount: 5, beispiel: `${"Malerei Keller, Gossau"} ${words(5)}.` }))).toContain("total-words");
    expect(errorCodes(validToolMarkdown({ extra: "", beispiel: `Malerei Keller, Gossau. ${words(500, "b")}.` }))).toContain("total-words");
  });
  it("verlangt die Beispielfirma im Beispiel", () => {
    expect(errorCodes(validToolMarkdown({ beispiel: `Ein Betrieb. ${words(110)}.` }))).toContain("beispiel-firma");
  });
});

describe("checkToolContent: Metadaten", () => {
  it("title höchstens 60 Zeichen und mit «Schweiz»", () => {
    expect(errorCodes(validToolMarkdown({ front: { title: `Schweiz ${"x".repeat(60)}` } }))).toContain("title-length");
    expect(errorCodes(validToolMarkdown({ front: { title: "ICP-Builder – Idealkundenprofil in 8 Fragen" } }))).toContain("title-schweiz");
  });
  it("description höchstens 155 Zeichen, tagline höchstens 110", () => {
    expect(errorCodes(validToolMarkdown({ front: { description: "x".repeat(156) } }))).toContain("description-length");
    expect(errorCodes(validToolMarkdown({ front: { tagline: "x".repeat(111) } }))).toContain("tagline-length");
  });
});

describe("checkToolContent: Platzhalter", () => {
  it("lehnt TODO im Text und in den Kopfdaten ab", () => {
    expect(errorCodes(validToolMarkdown({ warum: `${words(240)} TODO ergänzen` }))).toContain("todo-left");
    expect(errorCodes(validToolMarkdown({ front: { tagline: "TODO Tagline" } }))).toContain("todo-left");
    expect(errorCodes(validToolMarkdown({ alperna: "problem: TODO\nbaustein: Website\nbeweis: x" }))).toContain("todo-left");
  });
  it("lässt Wörter wie «Todoliste» zu", () => {
    expect(errorCodes(validToolMarkdown({ warum: `${words(240)} eine Todoliste hilft` }))).not.toContain("todo-left");
  });
});

describe("checkToolContent: Alperna-Felder", () => {
  it("verlangt problem, baustein und beweis", () => {
    expect(errorCodes(validToolMarkdown({ alperna: "problem: a\nbaustein: Website" }))).toContain("alperna-field");
  });
  it("lässt nur die sechs Bausteine zu", () => {
    expect(errorCodes(validToolMarkdown({ alperna: "problem: a\nbaustein: Logo\nbeweis: c" }))).toContain("alperna-baustein");
    expect(errorCodes(validToolMarkdown({ alperna: "problem: a\nbaustein: Website\nbeweis: c" }))).not.toContain("alperna-baustein");
  });
});

describe("checkToolContent: Stil", () => {
  const withText = (t: string) => validToolMarkdown({ warum: `${words(240)} ${t}` });
  it.each([
    ["jetzt starten", "jetzt"],
    ["nur noch heute", "nur noch"],
    ["garantiert mehr Kunden", "garantiert"],
    ["die Nr. 1 der Schweiz", "Nr. 1"],
    ["Das ist wichtig!", "Ausrufezeichen"],
    ["Das freut dich 🎉 sehr", "Emoji"],
    ["Die Straße ist lang", "ß"],
    ['Das sagt man "so"', "gerade Anführungszeichen"],
    ["Das kostet CHF 1000 im Jahr", "CHF ohne Apostroph"],
    ["Wachstum von 8,1% im Jahr", "Prozent ohne Leerzeichen"],
  ])("lehnt %s ab (%s)", (text) => {
    expect(errorCodes(withText(text))).toContain("style");
  });
  it("lässt Schweizer Schreibweise zu", () => {
    expect(errorCodes(withText("Das kostet CHF 1'000.- und steigt um 8,1 % laut «Quelle».")).filter((c) => c === "style")).toEqual([]);
  });
  it("warnt bei Zahlen ohne Quelle, nicht bei Zahlen mit Quelle", () => {
    const unsourced = check(validToolMarkdown({ warum: `${words(240)} 62 % der KMU nutzen das.` }));
    expect(unsourced.some((i) => i.code === "unsourced-number" && i.level === "warn")).toBe(true);
    const sourced = check(validToolMarkdown({ warum: `${words(240)} 62 % der KMU nutzen das (BFS, 2024).` }));
    expect(sourced.some((i) => i.code === "unsourced-number")).toBe(false);
  });
});
