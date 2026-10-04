import fs from "node:fs";
import path from "node:path";
import { CATEGORIES } from "@/lib/define-tool";

// Legt ein neues Werkzeug an (CLAUDE.md, Harte Regel 6: Ein Tool = ein Ordner, nur über `npm run new-tool`).

export type ScaffoldOptions = {
  root: string;
  slug: string;
  name?: string;
  category?: string;
  audience?: "kmu" | "verein" | "beide";
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function camelFromSlug(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

function write(root: string, rel: string, content: string, created: string[]) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  created.push(rel);
}

/** Fügt `line` vor der Markierungszeile ein. Wirft, wenn die Markierung fehlt. */
export function insertBeforeMarker(source: string, marker: string, line: string, file: string): string {
  const idx = source.indexOf(marker);
  if (idx < 0) throw new Error(`${file}: Markierung «${marker}» fehlt`);
  const lineStart = source.lastIndexOf("\n", idx) + 1;
  const indent = /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? "";
  return `${source.slice(0, lineStart)}${indent}${line}\n${source.slice(lineStart)}`;
}

export function scaffoldTool(opts: ScaffoldOptions): string[] {
  const { root, slug } = opts;
  if (!SLUG_RE.test(slug)) throw new Error(`Ungültiger Slug «${slug}»: nur a-z, 0-9 und Bindestriche`);
  const category = opts.category ?? "strategie";
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`Ungültige Kategorie «${category}»: ${CATEGORIES.join(", ")}`);
  }
  const audience = opts.audience ?? "kmu";
  const name = opts.name ?? titleFromSlug(slug);
  const dir = path.join(root, "tools", slug);
  if (fs.existsSync(dir)) throw new Error(`tools/${slug} gibt es schon`);
  for (const f of ["content/tools", "specs"]) {
    if (fs.existsSync(path.join(root, f, `${slug}.md`))) throw new Error(`${f}/${slug}.md gibt es schon`);
  }

  const indexFile = path.join(root, "tools", "index.ts");
  const componentsFile = path.join(root, "tools", "components.tsx");
  const index = fs.readFileSync(indexFile, "utf8");
  const components = fs.readFileSync(componentsFile, "utf8");
  const ident = `${camelFromSlug(slug)}Config`;

  // Zuerst beide Einträge berechnen (wirft bei fehlender Markierung), erst dann schreiben.
  let nextIndex = insertBeforeMarker(index, "// new-tool:imports", `import ${ident} from "./${slug}/tool.config";`, "tools/index.ts");
  nextIndex = insertBeforeMarker(nextIndex, "// new-tool:configs", `${ident},`, "tools/index.ts");
  let nextComponents = insertBeforeMarker(
    components,
    "// new-tool:components",
    `"${slug}": dynamic(() => import("./${slug}/Tool")),`,
    "tools/components.tsx",
  );
  // Nur echte Import-Zeilen zählen, nicht der Text im Kopfkommentar.
  if (!/^import dynamic from "next\/dynamic";$/m.test(nextComponents)) {
    nextComponents = `import dynamic from "next/dynamic";\n${nextComponents}`;
  }

  const created: string[] = [];
  write(
    root,
    `tools/${slug}/tool.config.ts`,
    `import { defineTool } from "@/lib/define-tool";

export default defineTool({
  slug: "${slug}",
  name: "${name}",
  category: "${category}",
  audience: "${audience}",
  tagline: "TODO Tagline: Nutzen in einem Satz, höchstens 110 Zeichen.",
  keyword: "TODO Keyword",
  related: [],
  needsServer: false,
  usesProfile: [],
  writesProfile: [],
  outputs: ["copy"],
  estimatedMinutes: 5,
  pathStep: { path: "${category}", order: 99 },
  featured: false,
});
`,
    created,
  );
  write(
    root,
    `tools/${slug}/logic.ts`,
    `import type { Answers, Question } from "@/components/tool/questionnaire";

// Reine Funktionen: kein React, kein DOM. Höchstens 10 Fragen (CLAUDE.md, Harte Regel 9).
export const questions: Question[] = [
  { id: "frage-1", type: "text", label: "TODO Frage", required: true },
];

export function evaluate(answers: Answers) {
  // TODO: aus den Antworten das Ergebnis berechnen (Formeln aus specs/${slug}.md)
  return { antworten: answers };
}
`,
    created,
  );
  write(
    root,
    `tools/${slug}/logic.test.ts`,
    `import { describe, expect, it } from "vitest";
import { validateQuestions } from "@/components/tool/questionnaire";
import { evaluate, questions } from "./logic";

describe("${slug}: Fragenkatalog", () => {
  it("ist gültig (höchstens 10 Fragen, eindeutige IDs)", () => {
    expect(validateQuestions(questions)).toEqual([]);
  });
});

describe("${slug}: evaluate", () => {
  it("liefert ein Ergebnis", () => {
    expect(evaluate({ "frage-1": "x" })).toBeDefined();
  });
  // Mindestens fünf Fälle, davon zwei Edge Cases (specs/${slug}.md, Abschnitt «Tests»):
  it.todo("Fall 2");
  it.todo("Fall 3");
  it.todo("Fall 4");
  it.todo("Edge Case: leere oder widersprüchliche Eingaben");
  it.todo("Edge Case: Extremwerte (0, sehr gross)");
});
`,
    created,
  );
  write(
    root,
    `tools/${slug}/Tool.tsx`,
    `"use client";

import { QuestionnaireEngine } from "@/components/tool/QuestionnaireEngine";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell } from "@/components/tool/ToolShell";
import { evaluate, questions } from "./logic";
import config from "./tool.config";

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <QuestionnaireEngine
        slug={config.slug}
        questions={questions}
        scoreFn={evaluate}
        intro={<p>TODO Einleitung: was passiert, wie lange dauert es, was mit Eingaben und Ergebnis geschieht.</p>}
        // Zugang v3: Das Ergebnis geht als Text ins CRM. TODO lesbar machen (Markdown), sonst geht JSON.
        resultText={(result) => JSON.stringify(result, null, 1)}
        renderResult={(result) => (
          <ResultCard title="Ergebnis">
            <pre className="overflow-x-auto text-sm">{JSON.stringify(result, null, 2)}</pre>
          </ResultCard>
        )}
      />
    </ToolShell>
  );
}
`,
    created,
  );
  write(
    root,
    `content/tools/${slug}.md`,
    `---
title: "TODO Titel mit Schweiz, höchstens 60 Zeichen"
description: "TODO Beschreibung, höchstens 155 Zeichen"
h1: "${name} für Schweizer KMU"
tagline: "TODO Tagline"
beispielFirma: "Malerei Keller, Gossau"
kurz:
  - "TODO was du bekommst"
  - "TODO was du dafür tust"
  - "TODO was danach klar ist"
ablauf:
  - "TODO Schritt 1"
  - "TODO Schritt 2"
  - "TODO Schritt 3"
---
## Warum das wichtig ist
TODO Ein Satz mit der Aussage (50 bis 140 Wörter mit den Punkten).

- TODO Punkt 1
- TODO Punkt 2
- TODO Punkt 3

=> TODO Offene Schleife: ein Satz, der auf den nächsten Abschnitt neugierig macht.

## So nutzt du das Ergebnis
1. TODO

=> TODO Offene Schleife auf «Häufige Fehler».

## Häufige Fehler
- TODO

## Beispiel
TODO Ergebnis der fiktiven Firma Malerei Keller, Gossau.

## Häufige Fragen
### TODO Frage 1
TODO Antwort (höchstens 80 Wörter)

## Alperna
problem: TODO
baustein: Website
beweis: TODO
`,
    created,
  );
  const template = fs.existsSync(path.join(root, "specs", "_TEMPLATE.md"))
    ? fs.readFileSync(path.join(root, "specs", "_TEMPLATE.md"), "utf8")
    : "# <Tool-Name> (<slug>)\n";
  write(root, `specs/${slug}.md`, template.replace("# <Tool-Name> (<slug>)", `# ${name} (${slug})`), created);

  fs.writeFileSync(indexFile, nextIndex);
  fs.writeFileSync(componentsFile, nextComponents);
  created.push("tools/index.ts (Eintrag)", "tools/components.tsx (Eintrag)");
  return created;
}
