/* Prüft Seitentexte und Pitch-Bausteine. Läuft in `npm run check`; Fehler machen den Build rot.
 *   npm run content-check             normale Prüfung (offene TODO in bausteine.md sind Hinweise)
 *   npm run content-check -- --strict offene TODO zählen als Fehler (Launch)
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT_DIR, readToolContent, toolContentPath } from "@/lib/content";
import { brandHits } from "@/lib/brand-rules";
import { checkToolContent, type Issue } from "@/lib/content-rules";
import { LEGAL_IGNORED, checkLegalFile } from "@/lib/legal-rules";
import { loadBausteine } from "@/lib/pitch";
import { getTools } from "@/lib/registry";
import { SITE_FILES, readCategory, readSimple, siteFile } from "@/lib/site-content";
import { checkCategory, checkFaqStartseite, checkMarketingSchweiz, checkWarumKostenlos } from "@/lib/site-rules";
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

// Seitentexte der Site (content/site/*.md)
const siteChecks: [string, (name: string) => Issue[]][] = [
  ...SITE_FILES.categories.map((c): [string, (n: string) => Issue[]] => [c, (n) => checkCategory(readCategory(n))]),
  [SITE_FILES.warumKostenlos, (n) => checkWarumKostenlos(readSimple(n))],
  [SITE_FILES.marketingSchweiz, (n) => checkMarketingSchweiz(readSimple(n))],
  [SITE_FILES.faqStartseite, (n) => checkFaqStartseite(readSimple(n))],
];
for (const [name, run] of siteChecks) {
  report(
    `site/${name}`,
    fs.existsSync(siteFile(name))
      ? run(name)
      : [{ level: "error", code: "missing-file", message: `content/site/${name}.md fehlt` }],
  );
}
const siteKnown = new Set(siteChecks.map(([n]) => `${n}.md`));
const siteDir = path.join(CONTENT_DIR, "site");
if (fs.existsSync(siteDir)) {
  for (const file of fs.readdirSync(siteDir).filter((f) => f.endsWith(".md") && !siteKnown.has(f))) {
    report("content", [{ level: "warn", code: "orphan", message: `content/site/${file} wird nirgends verwendet` }]);
  }
}

// Rechtstexte (content/legal/*.md): Kopf und Freigabe-Status; Entwürfe sind Hinweise (Harte Regel 8)
const legalDir = path.join(CONTENT_DIR, "legal");
if (fs.existsSync(legalDir)) {
  for (const file of fs.readdirSync(legalDir).filter((f) => f.endsWith(".md") && !LEGAL_IGNORED.has(f))) {
    report(`legal/${file}`, checkLegalFile(file, fs.readFileSync(path.join(legalDir, file), "utf8")));
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
  // Sperrliste aus ANTI-PATTERNS.md auch auf die Pitch-Texte anwenden (nur ausgefüllte Felder).
  const pitchTexts: [string, string][] = [
    ["einstiegsangebot", bausteine.einstiegsangebot],
    ...bausteine.items.flatMap((b): [string, string][] => [[`${b.name}.text`, b.text], [`${b.name}.beweis`, b.beweis]]),
  ];
  for (const [field, text] of pitchTexts) {
    if (!text || /^todo\b/i.test(text.trim())) continue;
    report(
      "pitch",
      brandHits(text).map((h) => ({
        level: h.level === "hart" ? ("error" as const) : ("warn" as const),
        code: "voice",
        message: `bausteine.md, ${field}: ${h.what} («${h.text}»)`,
      })),
    );
  }
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
