import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { legalPageSource, pageTextOf } from "@/lib/legal";
import { parseLegalMeta } from "@/lib/legal-rules";

function file(front: Record<string, string>, body: string): string {
  const head = Object.entries(front)
    .map(([k, v]) => `${k}: "${v}"`)
    .join("\n");
  return `---\n${head}\n---\n\n${body}\n`;
}

const DONE = { titel: "T", stand: "2026-10-20", quelle: "UWG Art. 3", status: "geprueft", geprueft: "ja", geprueft_von: "Lisa Muster, Rechtsanwältin", geprueft_am: "2026-10-20" };
const DRAFT = { ...DONE, status: "entwurf", geprueft: "nein", geprueft_von: "", geprueft_am: "" };
const TEXT = "```text\nLetztes Update: {{datum}}\n\n## Kontaktadresse\n\nAlperna GmbH  \nRöhrenbrugg 7\n```";

describe("pageTextOf", () => {
  it("nimmt den Inhalt des ersten Codeblocks text", () => {
    expect(pageTextOf("Vorspann\n\n```text\nEins\n\nZwei\n```\n\n```text\nDrei\n```")).toBe("Eins\n\nZwei");
  });
  it("gibt null ohne Codeblock oder bei leerem Block", () => {
    expect(pageTextOf("kein Block")).toBeNull();
    expect(pageTextOf("```text\n\n```")).toBeNull();
    expect(pageTextOf("```js\nx\n```")).toBeNull();
  });
});

describe("legalPageSource", () => {
  it("gibt eine geprüfte Datei frei und setzt das Stand-Datum ein", () => {
    const out = legalPageSource("eigene-impressum.md", file(DONE, TEXT));
    expect(out).toEqual({ markdown: "Letztes Update: 20.10.2026\n\n## Kontaktadresse\n\nAlperna GmbH  \nRöhrenbrugg 7", stand: "2026-10-20" });
  });

  it("gibt einen Entwurf nie frei, auch nicht mit Seitentext", () => {
    expect(legalPageSource("a.md", file(DRAFT, `**ENTWURF, NICHT GEPRÜFT.**\n\n${TEXT}`))).toBeNull();
  });

  it("gibt eine als geprüft markierte Datei nicht frei, solange Fragen oder Lücken offen sind", () => {
    expect(legalPageSource("a.md", file(DONE, `${TEXT}\n\nPRÜFEN: noch offen`))).toBeNull();
    expect(legalPageSource("a.md", file(DONE, `${TEXT}\n\n[OFFEN: Frist]`))).toBeNull();
    expect(legalPageSource("a.md", file({ ...DONE, geprueft_von: "" }, TEXT))).toBeNull();
  });

  it("gibt nichts frei ohne Seitentext oder mit unbekanntem Platzhalter", () => {
    expect(legalPageSource("a.md", file(DONE, "Nur Erläuterung ohne Block."))).toBeNull();
    expect(legalPageSource("a.md", file(DONE, "```text\nHallo {{firma}}\n```"))).toBeNull();
  });

  it("gibt nichts frei bei kaputtem Kopf", () => {
    expect(legalPageSource("a.md", "kein Kopf\n" + TEXT)).toBeNull();
  });
});

describe("die echten Dateien unter content/legal", () => {
  const dir = path.join(process.cwd(), "content", "legal");

  for (const name of ["eigene-impressum.md", "eigene-datenschutz.md"]) {
    const raw = fs.readFileSync(path.join(dir, name), "utf8");

    it(`${name}: hat einen Seitentext, der bis auf {{datum}} keine Platzhalter enthält`, () => {
      const text = pageTextOf(raw);
      expect(text).not.toBeNull();
      expect(text!.match(/\{\{[^}]*\}\}/g)?.every((p) => p === "{{datum}}") ?? true).toBe(true);
    });

    it(`${name}: erscheint nur, wenn ein Mensch freigegeben hat, und dann auch wirklich`, () => {
      const meta = parseLegalMeta(raw);
      const source = legalPageSource(name, raw);
      // Entwurf: kein Seitentext. Freigegeben: die Seite muss sich laden lassen (sonst bliebe der Platzhalter still stehen).
      if (meta?.geprueft) expect(source).not.toBeNull();
      else expect(source).toBeNull();
    });
  }
});
