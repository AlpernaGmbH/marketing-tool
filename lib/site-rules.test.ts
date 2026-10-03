import { describe, expect, it } from "vitest";
import { SITE_FILES, parseCategory, parseSimple, readCategory, readSimple } from "@/lib/site-content";
import { MARKETING_TOPICS, checkCategory, checkFaqStartseite, checkMarketingSchweiz, checkWarumKostenlos } from "@/lib/site-rules";
import { words } from "@/tests/fixtures";

const codes = (issues: { level: string; code: string }[]) => issues.filter((i) => i.level === "error").map((i) => i.code);

function category(o: { einleitung?: string; hintergrund?: string; faq?: number; front?: Record<string, string | null> } = {}): string {
  const front: Record<string, string | null> = {
    title: "Strategie-Werkzeuge Schweiz",
    description: "Positionierung, Zielgruppe und Angebot klären, bevor du Geld ausgibst.",
    h1: "Marketing-Strategie für Schweizer KMU",
    seoHeading: "Warum Strategie vor Massnahmen kommt",
    pfadText: "Fünf Schritte vom Auftritt bis zum Plan.",
    ...o.front,
  };
  const head = Object.entries(front)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}: "${v}"`)
    .join("\n");
  const faq = Array.from({ length: o.faq ?? 5 }, (_, i) => `### Frage ${i + 1}\n${words(40, `a${i}`)}.`).join("\n\n");
  return `---\n${head}\n---\n\n## Einleitung\n${o.einleitung ?? words(250, "e")}.\n\n## Hintergrund\n${o.hintergrund ?? words(500, "h")}.\n\n## Häufige Fragen\n${faq}\n`;
}

const check = (md: string) => codes(checkCategory(parseCategory(md)));

describe("checkCategory", () => {
  it("akzeptiert einen vollständigen Text", () => {
    expect(check(category())).toEqual([]);
  });
  it("verlangt rund 250 Wörter Einleitung und rund 500 Hintergrund", () => {
    expect(check(category({ einleitung: words(150) }))).toContain("words");
    expect(check(category({ einleitung: words(400) }))).toContain("words");
    expect(check(category({ hintergrund: words(300) }))).toContain("words");
    expect(check(category({ hintergrund: words(700) }))).toContain("words");
  });
  it("verlangt genau 5 Fragen", () => {
    expect(check(category({ faq: 4 }))).toContain("faq-count");
    expect(check(category({ faq: 6 }))).toContain("faq-count");
  });
  it("meldet fehlende Kopfdaten", () => {
    expect(check(category({ front: { seoHeading: null } }))).toContain("frontmatter");
    expect(check(category({ front: { pfadText: null } }))).toContain("frontmatter");
  });
  it("meldet title über 60 Zeichen (mit Zusatz) und ohne «Schweiz», description über 155", () => {
    expect(check(category({ front: { title: `Schweiz ${"x".repeat(55)}` } }))).toContain("title-length");
    expect(check(category({ front: { title: "Strategie-Werkzeuge" } }))).toContain("title-schweiz");
    expect(check(category({ front: { description: "x".repeat(156) } }))).toContain("description-length");
  });
  it("meldet fehlende Abschnitte", () => {
    const md = category().replace("## Hintergrund", "## Etwas anderes");
    expect(check(md)).toContain("section-missing");
  });
  it("meldet TODO und verbotene Schreibweisen", () => {
    expect(check(category({ einleitung: `${words(250)} TODO` }))).toContain("todo-left");
    expect(check(category({ einleitung: `${words(250)} Das ist grossartig!` }))).toContain("style");
  });
});

describe("checkWarumKostenlos", () => {
  const para = (n: number) => `${words(n)}.`;
  const run = (md: string) => codes(checkWarumKostenlos(parseSimple(md)));
  it("verlangt genau drei Absätze mit Substanz", () => {
    expect(run(`${para(40)}\n\n${para(40)}\n\n${para(40)}`)).toEqual([]);
    expect(run(`${para(40)}\n\n${para(40)}`)).toContain("paragraphs");
    expect(run(`${para(40)}\n\n${para(40)}\n\n${para(40)}\n\n${para(40)}`)).toContain("paragraphs");
    expect(run(`${para(40)}\n\n${para(10)}\n\n${para(40)}`)).toContain("words");
  });
});

describe("checkMarketingSchweiz", () => {
  const full = `${MARKETING_TOPICS.join(" ")} ${words(750 - MARKETING_TOPICS.length - 1)}.`;
  const doc = (body: string, front = 'title: "Marketing in der Schweiz"\nheading: "Marketing in der Schweiz: was anders ist"') => `---\n${front}\n---\n\n${body}\n`;
  const run = (md: string) => codes(checkMarketingSchweiz(parseSimple(md)));
  it("akzeptiert 700 bis 900 Wörter mit allen Pflichtthemen", () => {
    expect(run(doc(full))).toEqual([]);
  });
  it("meldet zu wenig und zu viel", () => {
    expect(run(doc(`${MARKETING_TOPICS.join(" ")} ${words(200)}`))).toContain("words");
    expect(run(doc(`${MARKETING_TOPICS.join(" ")} ${words(1000)}`))).toContain("words");
  });
  it.each(MARKETING_TOPICS)("meldet das fehlende Pflichtthema «%s»", (topic) => {
    expect(run(doc(full.replace(topic, "XYZ")))).toContain("topic");
  });
  it("verlangt heading", () => {
    expect(run(doc(full, 'title: "Marketing in der Schweiz"'))).toContain("frontmatter");
  });
});

describe("checkFaqStartseite", () => {
  const faq = (n: number) => Array.from({ length: n }, (_, i) => `### Frage ${i + 1}\n${words(30, `a${i}`)}.`).join("\n\n");
  const run = (md: string) => codes(checkFaqStartseite(parseSimple(md)));
  it("verlangt genau 7 Fragen", () => {
    expect(run(faq(7))).toEqual([]);
    expect(run(faq(6))).toContain("faq-count");
    expect(run(faq(8))).toContain("faq-count");
  });
});

describe("echte Seitentexte (content/site)", () => {
  it.each(SITE_FILES.categories)("Kategorie «%s» besteht die Prüfung", (name) => {
    expect(checkCategory(readCategory(name)).filter((i) => i.level === "error")).toEqual([]);
  });
  it("warum-kostenlos, marketing-schweiz und faq-startseite bestehen", () => {
    expect(checkWarumKostenlos(readSimple(SITE_FILES.warumKostenlos)).filter((i) => i.level === "error")).toEqual([]);
    expect(checkMarketingSchweiz(readSimple(SITE_FILES.marketingSchweiz)).filter((i) => i.level === "error")).toEqual([]);
    expect(checkFaqStartseite(readSimple(SITE_FILES.faqStartseite)).filter((i) => i.level === "error")).toEqual([]);
  });
});
