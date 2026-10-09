/* Prüft die Wortwahl (lib/wording-rules.ts). Läuft in `npm run check`; Fehler machen den Build rot.
 *   npm run wording-check
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { CONTENT_DIR } from "@/lib/content";
import { CATEGORY_LABELS, CATEGORY_PAGES, CATEGORY_TAGLINES } from "@/lib/define-tool";
import { getTools } from "@/lib/registry";
import { checkContentWord, checkNavigation, checkSlugs, checkVereinWording, type WordingIssue } from "@/lib/wording-rules";

const tools = getTools();
const issues: WordingIssue[] = [];

// 1. Menü, Kategorienamen, Kategorieköpfe
const nav = [
  ...CATEGORY_PAGES.flatMap((p) => [
    { scope: `Kategorie ${p}`, text: CATEGORY_LABELS[p] },
    { scope: `Kategorie ${p}`, text: CATEGORY_TAGLINES[p] },
  ]),
];
const siteDir = path.join(CONTENT_DIR, "site");
for (const p of CATEGORY_PAGES) {
  const file = path.join(siteDir, `${p}.md`);
  if (!fs.existsSync(file)) continue;
  const { data } = matter(fs.readFileSync(file, "utf8"));
  for (const k of ["h1", "seoHeading", "pfadText"]) if (typeof data[k] === "string") nav.push({ scope: `content/site/${p}.md ${k}`, text: data[k] });
}
issues.push(...checkNavigation(nav));

// 2. Slugs und Namen der Werkzeuge
issues.push(...checkSlugs([...CATEGORY_PAGES, ...tools.map((t) => t.slug)]));
for (const t of tools) {
  issues.push(...checkContentWord([t.name, t.tagline, t.keyword].map((text) => ({ scope: `tools/${t.slug}/tool.config.ts`, text }))));
}

// 3. Fliesstexte: «Content» ist überall gestrichen, «Vereine» ist ein Hinweis bis P3
const dirs = [path.join(CONTENT_DIR, "tools"), siteDir];
for (const dir of dirs) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
    const rel = `content/${path.basename(dir)}/${f}`;
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    issues.push(...checkContentWord([{ scope: rel, text }]));
    issues.push(...checkVereinWording(rel, text));
  }
}

const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");
for (const i of errors) console.log(`  FEHLER  [${i.scope}] ${i.message}`);
console.log(`wording-check: ${errors.length} Fehler, ${warns.length} Text(e) mit «Vereine» (Hinweis, Wortlaut KMU folgt in P3)`);
if (process.argv.includes("--verbose")) for (const i of warns) console.log(`  Hinweis [${i.scope}] ${i.message}`);
if (errors.length > 0) process.exit(1);
