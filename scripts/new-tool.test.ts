import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { camelFromSlug, scaffoldTool, titleFromSlug } from "./new-tool-lib";

let root: string;
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "new-tool-"));
  fs.mkdirSync(path.join(root, "tools"), { recursive: true });
  fs.mkdirSync(path.join(root, "specs"), { recursive: true });
  for (const f of ["tools/index.ts", "tools/components.tsx", "specs/_TEMPLATE.md"]) {
    fs.copyFileSync(path.join(process.cwd(), f), path.join(root, f));
  }
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("Hilfsfunktionen", () => {
  it("bildet Namen und Bezeichner aus dem Slug", () => {
    expect(titleFromSlug("icp-builder")).toBe("Icp Builder");
    expect(camelFromSlug("icp-builder")).toBe("icpBuilder");
    expect(camelFromSlug("gbp-feiertage-2")).toBe("gbpFeiertage2");
  });
});

describe("scaffoldTool", () => {
  it("legt alle Dateien an und trägt das Tool in beiden Listen ein", () => {
    const created = scaffoldTool({ root, slug: "icp-builder", name: "ICP-Builder" });
    expect(created).toEqual(
      expect.arrayContaining([
        "tools/icp-builder/tool.config.ts",
        "tools/icp-builder/logic.ts",
        "tools/icp-builder/logic.test.ts",
        "tools/icp-builder/Tool.tsx",
        "content/tools/icp-builder.md",
        "specs/icp-builder.md",
      ]),
    );
    expect(read("tools/icp-builder/tool.config.ts")).toContain('slug: "icp-builder"');
    expect(read("tools/icp-builder/tool.config.ts")).toContain('name: "ICP-Builder"');
    expect(read("tools/index.ts")).toContain('import icpBuilderConfig from "./icp-builder/tool.config";');
    expect(read("tools/index.ts")).toMatch(/icpBuilderConfig,\n\s*\/\/ new-tool:configs/);
    expect(read("tools/components.tsx")).toContain('import dynamic from "next/dynamic";');
    expect(read("tools/components.tsx")).toContain('"icp-builder": dynamic(() => import("./icp-builder/Tool")),');
    expect(read("specs/icp-builder.md")).toMatch(/^# ICP-Builder \(icp-builder\)/);
    expect(read("content/tools/icp-builder.md")).toContain('h1: "ICP-Builder für Schweizer KMU"');
  });

  it("kann mehrere Tools nacheinander eintragen, ohne dynamic doppelt zu importieren", () => {
    scaffoldTool({ root, slug: "persona" });
    scaffoldTool({ root, slug: "positionierung", category: "strategie" });
    const comps = read("tools/components.tsx");
    expect(comps.match(/^import dynamic/gm)).toHaveLength(1);
    expect(comps).toContain('"persona"');
    expect(comps).toContain('"positionierung"');
    expect(read("tools/index.ts")).toContain("personaConfig,");
    expect(read("tools/index.ts")).toContain("positionierungConfig,");
  });

  it("setzt Kategorie und Zielgruppe in die Konfiguration", () => {
    scaffoldTool({ root, slug: "sponsoring-dossier", category: "content", audience: "verein" });
    const cfg = read("tools/sponsoring-dossier/tool.config.ts");
    expect(cfg).toContain('category: "content"');
    expect(cfg).toContain('audience: "verein"');
    expect(cfg).toContain('pathStep: { path: "content", order: 99 }');
  });

  it("lehnt ungültige Slugs und Kategorien ab, ohne etwas anzulegen", () => {
    for (const slug of ["", "Icp Builder", "icp_builder", "-x", "x-", "../evil", "a/b"]) {
      expect(() => scaffoldTool({ root, slug })).toThrow(/Ungültiger Slug/);
    }
    expect(() => scaffoldTool({ root, slug: "x", category: "unsinn" })).toThrow(/Ungültige Kategorie/);
    expect(exists("tools/x")).toBe(false);
  });

  it("bricht ab, wenn das Tool schon existiert, und lässt alles unverändert", () => {
    scaffoldTool({ root, slug: "persona" });
    const before = [read("tools/index.ts"), read("tools/components.tsx"), read("tools/persona/logic.ts")];
    expect(() => scaffoldTool({ root, slug: "persona" })).toThrow(/gibt es schon/);
    expect([read("tools/index.ts"), read("tools/components.tsx"), read("tools/persona/logic.ts")]).toEqual(before);
  });

  it("schreibt nichts, wenn eine Markierung in den Listen fehlt", () => {
    fs.writeFileSync(path.join(root, "tools/components.tsx"), "export const toolComponents = {};\n");
    const indexBefore = read("tools/index.ts");
    expect(() => scaffoldTool({ root, slug: "persona" })).toThrow(/Markierung/);
    expect(exists("tools/persona")).toBe(false);
    expect(exists("content/tools/persona.md")).toBe(false);
    expect(read("tools/index.ts")).toBe(indexBefore);
  });
});
