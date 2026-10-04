import { describe, expect, it } from "vitest";
import { loopCount, markdownToHtml, parseToolMarkdown } from "@/lib/content";
import { validToolMarkdown } from "@/tests/fixtures";

describe("markdownToHtml: offene Schleifen", () => {
  it("macht aus einer Zeile mit «=> » einen Absatz der Klasse loop", async () => {
    const out = await markdownToHtml("Text.\n\n=> Gleich darunter: der Fehler, den fast alle machen.");
    expect(out).toContain('<p class="loop">Gleich darunter: der Fehler, den fast alle machen.</p>');
    expect(out).not.toContain("=&gt;");
    expect(out).not.toMatch(/<p>=/);
  });

  it("lässt gewöhnliche Absätze, Listen und Pfeile im Fliesstext in Ruhe", async () => {
    const out = await markdownToHtml("Aus a => b folgt c.\n\n- Punkt\n- Punkt");
    expect(out).toContain("<p>Aus a => b folgt c.</p>");
    expect(out).not.toContain("loop");
  });
});

describe("loopCount", () => {
  it("zählt nur Zeilen, die mit «=> » und Text beginnen", () => {
    expect(loopCount("a\n=> eins\n\n  => zwei\n=>\nx => y")).toBe(2);
    expect(loopCount("")).toBe(0);
  });
});

describe("Kopfdaten kurz und ablauf", () => {
  it("liest je genau drei Einträge", () => {
    const parsed = parseToolMarkdown(validToolMarkdown());
    expect(parsed.frontmatterIssues).toEqual([]);
    expect(parsed.frontmatter.kurz).toHaveLength(3);
    expect(parsed.frontmatter.ablauf).toHaveLength(3);
  });

  it("meldet fehlende oder falsch lange Listen", () => {
    expect(parseToolMarkdown(validToolMarkdown({ kurz: null })).frontmatterIssues).toContain("Kopfdaten: «kurz» braucht genau drei Einträge");
    expect(parseToolMarkdown(validToolMarkdown({ ablauf: ["a", "b"] })).frontmatterIssues).toContain("Kopfdaten: «ablauf» braucht genau drei Einträge");
  });
});
