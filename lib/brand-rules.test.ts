import { describe, expect, it } from "vitest";
import { BRAND_RULES, brandHits } from "@/lib/brand-rules";

const hard = (t: string) => brandHits(t).filter((h) => h.level === "hart").map((h) => h.text.toLowerCase());
const soft = (t: string) => brandHits(t).filter((h) => h.level === "vermeiden").map((h) => h.text.toLowerCase());

describe("brandHits: harte Verbote (ANTI-PATTERNS 1.1, 1.2, 2.1, 6.1, 7.1)", () => {
  it.each([
    ["In der heutigen schnelllebigen Welt zählt der erste Eindruck.", "in der heutigen schnelllebigen welt"],
    ["Lass uns gemeinsam anfangen.", "lass uns"],
    ["Es ist wichtig zu erwähnen, dass das Profil fehlt.", "es ist wichtig zu erwähnen"],
    ["Letztendlich entscheidet der Kunde.", "letztendlich"],
    ["Grundsätzlich gilt das für alle.", "grundsätzlich"],
    ["Wie bereits erwähnt, fehlt die Sitemap.", "wie bereits erwähnt"],
    ["Stell dir vor, du wirst gefunden.", "stell dir vor"],
    ["Wussten Sie schon, dass das geht?", "wussten sie schon"],
    ["Hot Take: Marketing ist tot.", "hot take:"],
    ["Wir nutzen Synergien.", "synergie"],
    ["Eine ganzheitliche Lösung.", "ganzheitlich"],
    ["Eine massgeschneiderte Lösung für dich.", "massgeschneidert"],
    ["Das ist Best Practice.", "best practice"],
    ["Das bringt Mehrwert.", "mehrwert"],
    ["Die Customer Journey beginnt hier.", "customer journey"],
    ["Jeder Touchpoint zählt.", "touchpoint"],
    ["Eine Pain Point Analyse.", "pain point"],
    ["Wir sind führend in der Ostschweiz.", "führend"],
    ["Ein innovativer Ansatz.", "innovativ"],
    ["Eine skalierbare Lösung.", "skalierbar"],
    ["Nur diese Woche zum halben Preis.", "nur diese woche"],
    ["Wir sind Experten für Social Media.", "experten für"],
    ["Wir sind eine Agentur aus Speicher.", "wir sind eine agentur"],
    ["Das ist ein Gedankenstrich — und verboten.", "—"],
    ["Ein Satz , mit Leerzeichen vor dem Komma.", " ,"],
  ])("meldet: %s", (text, needle) => {
    expect(hard(text).some((t) => t.includes(needle.trim()))).toBe(true);
  });
});

describe("brandHits: zu vermeiden (nur Hinweis)", () => {
  it.each([
    ["Das ist authentisch.", "authentisch"],
    ["Mit Leidenschaft und Herzblut.", "leidenschaft"],
    ["Ehrlich gesagt ist das schwierig.", "ehrlich gesagt"],
    ["Das wird viral.", "viral"],
    ["Wir geben unser Bestes.", "wir geben unser bestes"],
  ])("meldet als Hinweis: %s", (text, needle) => {
    expect(soft(text).some((t) => t.includes(needle))).toBe(true);
    expect(hard(text)).toEqual([]);
  });
});

describe("brandHits: Alperna-Sätze aus BRAND-VOICE-CORE bleiben unbeanstandet", () => {
  it.each([
    "Cold Mails funktionieren nicht. Wir haben hunderte verschickt, null Antwort.",
    "Wir haben unseren ersten Kunden gratis übernommen. Einfach um zu zeigen, dass wir's können.",
    "Viele KMU haben schon Geld für Marketing verbrannt. Das ist nicht ihre Schuld.",
    "Wir sorgen dafür, dass du gefunden wirst, wenn jemand nach dir sucht.",
    "Wir sind frisch gegründet und studieren beide BWL. Deshalb ist der Preis fair. Was wir schon gebaut haben, siehst du hier.",
    "Realistisch ist, dass du gefunden wirst, wenn jemand nach dir sucht.",
    "Beim BC Trogen Speicher stiegen die Aufrufe des Instagram-Profils um 690 % (Quelle: alperna.ch).",
    "Website, Google-Profil, Social Media: der ganze digitale Auftritt aus einer Hand.",
  ])("%s", (text) => {
    expect(brandHits(text)).toEqual([]);
  });
});

describe("brandHits: Zeilennummer und Struktur", () => {
  it("nennt die Zeile des Treffers", () => {
    const hits = brandHits("Erste Zeile.\nZweite Zeile.\nDas ist ganzheitlich gedacht.");
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
  });
  it("meldet je Regel nur den ersten Treffer", () => {
    expect(brandHits("ganzheitlich und ganzheitlich")).toHaveLength(1);
  });
  it("jede Regel hat eine Beschreibung und eine Stufe", () => {
    for (const r of BRAND_RULES) {
      expect(r.what.length).toBeGreaterThan(3);
      expect(["hart", "vermeiden"]).toContain(r.level);
    }
  });
});
