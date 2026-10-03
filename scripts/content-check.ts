/* Prüft Seitentexte und Pitch-Bausteine. Läuft in `npm run check`; Fehler machen den Build rot.
 *   npm run content-check             normale Prüfung (offene TODO in bausteine.md sind Hinweise)
 *   npm run content-check -- --strict offene TODO zählen als Fehler (Launch)
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT_DIR, readToolContent, toolContentPath } from "@/lib/content";
import { checkToolContent, type Issue } from "@/lib/content-rules";
import { loadBausteine } from "@/lib/pitch";
import { getTools } from "@/lib/registry";
import { toolComponents } from "@/tools/components";

const strict = process.argv.includes("--strict");
let errors = 0;
let warnings = 0;

function report(scope: string, issues: Issue[]) {
  for (const i of issues) {
    const tag = i.level === "error" ? "FEHLER " : "Hinweis";
    console.log(`  ${tag} [${scope}] ${i.message}`);
    if (i.level === "error") errors++;
    else warnings++;
  }
}

const tools = getTools();
console.log(`content-check: ${tools.length} Werkzeug(e) in der Registry`);

for (const tool of tools) {
  const issues: Issue[] = [];
  if (!fs.existsSync(toolContentPath(tool.slug))) {
    issues.push({ level: "error", code: "missing-file", message: `content/tools/${tool.slug}.md fehlt` });
  } else {
    issues.push(...checkToolContent(readToolContent(tool.slug)));
  }
  for (const [field, value] of [["name", tool.name], ["tagline", tool.tagline], ["keyword", tool.keyword]] as const) {
    if (/\bTODO\b/.test(value)) {
      issues.push({ level: "error", code: "todo-config", message: `tool.config.ts: «${field}» enthält noch «TODO»` });
    }
  }
  if (!toolComponents[tool.slug]) {
    issues.push({ level: "error", code: "no-component", message: "tools/components.tsx hat keinen Eintrag" });
  }
  report(tool.slug, issues);
}

// Seitentexte ohne Registry-Eintrag
const dir = path.join(CONTENT_DIR, "tools");
if (fs.existsSync(dir)) {
  const known = new Set(tools.map((t) => `${t.slug}.md`));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !known.has(f))) {
    report("content", [{ level: "warn", code: "orphan", message: `content/tools/${file} gehört zu keinem Werkzeug` }]);
  }
}

// Pitch-Bausteine (von Alperna geliefert)
const bausteine = loadBausteine();
if (!bausteine) {
  report("pitch", [{ level: "warn", code: "no-bausteine", message: "content/pitch/bausteine.md fehlt" }]);
} else {
  report(
    "pitch",
    bausteine.issues.map((m) => ({ level: "error" as const, code: "bausteine", message: m })),
  );
  if (bausteine.open.length > 0) {
    report("pitch", [
      {
        level: strict ? "error" : "warn",
        code: "bausteine-open",
        message: `bausteine.md: ${bausteine.open.length} Feld(er) noch offen (${bausteine.open.join(", ")}). Offene Felder erscheinen nicht auf der Seite.`,
      },
    ]);
  }
}

// Links der Pitch-Knöpfe: ohne sie fehlt der Weg zu Alperna. Nur im Launch-Modus ein Fehler.
for (const env of ["NEXT_PUBLIC_WHATSAPP_NUMBER", "NEXT_PUBLIC_ERSTGESPRAECH_URL"]) {
  if (!process.env[env]) {
    report("env", [{ level: strict ? "error" : "warn", code: "env", message: `${env} ist nicht gesetzt; der Knopf entfällt` }]);
  }
}

console.log(`content-check: ${errors} Fehler, ${warnings} Hinweis(e)`);
process.exit(errors > 0 ? 1 : 0);
