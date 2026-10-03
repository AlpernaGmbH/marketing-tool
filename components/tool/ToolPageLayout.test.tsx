import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseToolMarkdown } from "@/lib/content";
import { fixtureTool, validToolMarkdown } from "@/tests/fixtures";

const list = vi.hoisted(() => ({ tools: [] as unknown[] }));
vi.mock("@/tools", () => ({
  get tools() {
    return list.tools;
  },
}));
vi.mock("@/lib/pitch", async (orig) => ({ ...(await orig<typeof import("@/lib/pitch")>()), loadBausteine: () => null }));

import { ToolPageLayout } from "@/components/tool/ToolPageLayout";

async function render(over: Parameters<typeof validToolMarkdown>[0] = {}, tool = fixtureTool()) {
  list.tools = [tool];
  const el = await ToolPageLayout({
    config: tool,
    content: parseToolMarkdown(validToolMarkdown(over)),
    children: <div data-testid="tool">TOOL</div>,
  });
  return renderToStaticMarkup(el);
}

describe("ToolPageLayout", () => {
  it("setzt die Abschnitte in der Reihenfolge aus CLAUDE.md", async () => {
    const html = await render();
    const order = ["Breadcrumbs", "<h1", "TOOL", "Warum das wichtig ist", "So nutzt du das Ergebnis", "Häufige Fehler", "Beispiel", "Häufige Fragen", "Wenn du das lieber abgibst"];
    let last = -1;
    for (const marker of order) {
      const at = html.indexOf(marker === "Breadcrumbs" ? "Brotkrumen" : marker);
      expect(at, `«${marker}» fehlt`).toBeGreaterThan(-1);
      expect(at, `«${marker}» steht zu früh`).toBeGreaterThan(last);
      last = at;
    }
  });
  it("legt das Tool direkt nach H1, Tagline und Metazeile, vor den Erklärtext", async () => {
    const html = await render();
    expect(html.indexOf("Dein Idealkunde in 8 Fragen")).toBeLessThan(html.indexOf("TOOL"));
    expect(html.indexOf("TOOL")).toBeLessThan(html.indexOf("Warum das wichtig ist"));
  });
  it("hat genau eine H1 und markiert nur den Teil nach «für» gelb", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('ICP-Builder für <mark class="mark-yellow">Schweizer KMU</mark>');
    expect(html.match(/mark-yellow/g)).toHaveLength(1);
  });
  it("zeigt Dauer in korrekter Einzahl/Mehrzahl, Kategorie und den Hinweis zum Formular", async () => {
    expect(await render({}, fixtureTool({ estimatedMinutes: 8 }))).toContain("8 Minuten · Strategie · Ergebnis sofort, Dateien nach kurzem Formular");
    expect(await render({}, fixtureTool({ estimatedMinutes: 1 }))).toContain("1 Minute · Strategie");
  });
  it("baut die Brotkrumen Start → Kategorie → Tool", async () => {
    const html = await render();
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/strategie"');
    expect(html).toContain('aria-current="page"');
  });
  it("gibt alle FAQ-Fragen als H3 aus und zeigt die Beispielfirma", async () => {
    const html = await render({ faqCount: 6 });
    expect(html.match(/<h3[^>]*>Frage \d<\/h3>/g)).toHaveLength(6);
    expect(html).toContain("Fiktives Beispiel: Malerei Keller, Gossau");
  });
  it("zeigt die Alperna-Schlüsselzeilen nicht als Text im Erklärtext", async () => {
    const html = await render();
    expect(html).not.toContain("problem:");
    expect(html).not.toContain("baustein:");
  });
  it("rendert Markdown (Listen, Fett) aus dem Seitentext", async () => {
    const html = await render({ nutzen: "1. **Wichtig** zuerst\n2. Danach\n3. Zum Schluss" });
    expect(html).toContain("<ol>");
    expect(html).toContain("<strong>Wichtig</strong>");
  });
});
