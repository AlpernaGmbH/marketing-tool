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
  return `---\n${head}\n---\n\n## Einleitung\n${o.einleitung ?? INTRO}\n\n## Hintergrund\n${o.hintergrund ?? BACKGROUND}\n\n## Häufige Fragen\n${faq}\n`;
}

const bulletLines = (n: number, w = 8, seed = "p") => Array.from({ length: n }, (_, i) => `- ${words(w, `${seed}${i}`)}`).join("\n");
const INTRO = `${words(25, "e")}.\n\n${bulletLines(3, 12, "e")}`;
const BACKGROUND = ["### Eins", "### Zwei", "### Drei"]
  .map((h, i) => `${h}\n${words(20, `s${i}`)}.\n\n${bulletLines(2, 20, `b${i}`)}${i < 2 ? "\n\n=> Gleich darunter: mehr." : ""}`)
  .join("\n\n");

const check = (md: string) => codes(checkCategory(parseCategory(md)));

describe("checkCategory", () => {
  it("akzeptiert einen vollständigen Text", () => {
    expect(check(category())).toEqual([]);
  });
  it("verlangt kurze Texte: Einleitung 50 bis 130 Wörter, Hintergrund 180 bis 360", () => {
    expect(check(category({ einleitung: `${words(10)}.\n\n${bulletLines(3, 3)}` }))).toContain("words");
    expect(check(category({ einleitung: `${words(150)}.\n\n${bulletLines(3, 10)}` }))).toContain("words");
    const tiny = ["### A", "### B", "### C"].map((h) => `${h}\n${words(5)}.\n\n${bulletLines(2, 5)}\n\n=> Gleich: mehr.`).join("\n\n");
    expect(check(category({ hintergrund: tiny }))).toContain("words");
    expect(check(category({ hintergrund: `${BACKGROUND}\n\n${words(400)}.` }))).toContain("words");
  });
  it("verlangt Aufzählungen, Zwischenüberschriften und offene Schleifen", () => {
    expect(check(category({ einleitung: `${words(60)}.` }))).toContain("reading");
    expect(check(category({ hintergrund: `${words(200)}.` }))).toContain("reading");
    expect(check(category({ hintergrund: BACKGROUND.replace(/=> [^\n]+/g, "") }))).toContain("reading");
  });
  it("hält die Antworten der FAQ kurz (höchstens 80 Wörter)", () => {
    const md = category().replace(/(### Frage 1\n)[^\n]+/, `$1${words(120)}.`);
    expect(check(md)).toContain("faq-long");
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
  const sections = ["### A", "### B", "### C", "### D"]
    .map((h, i) => `${h}\n${words(12, `m${i}`)}.\n\n${bulletLines(2, 10, `m${i}`)}${i < 3 ? "\n\n=> Als Nächstes: mehr." : ""}`)
    .join("\n\n");
  const full = `${MARKETING_TOPICS.join(" ")} ${words(200)}.\n\n${sections}`;
  const doc = (body: string, front = 'title: "Marketing in der Schweiz"\nheading: "Marketing in der Schweiz: was anders ist"') => `---\n${front}\n---\n\n${body}\n`;
  const run = (md: string) => codes(checkMarketingSchweiz(parseSimple(md)));
  it("akzeptiert 300 bis 480 Wörter mit allen Pflichtthemen, Aufzählungen und Schleifen", () => {
    expect(run(doc(full))).toEqual([]);
  });
  it("meldet zu wenig und zu viel", () => {
    expect(run(doc(`${MARKETING_TOPICS.join(" ")} ${words(100)}`))).toContain("words");
    expect(run(doc(`${full}\n\n${words(400)}.`))).toContain("words");
  });
  it("verlangt Aufzählungen und offene Schleifen", () => {
    expect(run(doc(`${MARKETING_TOPICS.join(" ")} ${words(350)}.`))).toEqual(expect.arrayContaining(["reading"]));
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
  it("hält die Antworten kurz (höchstens 80 Wörter)", () => {
    expect(run(faq(7).replace(/(### Frage 1\n)[^\n]+/, `$1${words(120)}.`))).toContain("faq-long");
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
