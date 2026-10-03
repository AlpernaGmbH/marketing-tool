/* npm run new-tool <slug> [-- --name "Anzeigename" --category strategie --audience kmu]
 * Legt tools/<slug>/, content/tools/<slug>.md und specs/<slug>.md an und trägt das Tool ein.
 */
import { scaffoldTool } from "./new-tool-lib";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const slug = process.argv[2];

if (!slug || slug.startsWith("--")) {
  console.error('Aufruf: npm run new-tool <slug> [-- --name "Name" --category strategie --audience kmu]');
  process.exit(1);
}

try {
  const created = scaffoldTool({
    root: process.cwd(),
    slug,
    name: arg("--name"),
    category: arg("--category"),
    audience: arg("--audience") as "kmu" | "verein" | "beide" | undefined,
  });
  console.log(`Werkzeug «${slug}» angelegt:`);
  for (const f of created) console.log(`  ${f}`);
  console.log(`\nNächste Schritte: specs/${slug}.md ausfüllen, dann logic.ts mit Tests, Tool.tsx, content/tools/${slug}.md.`);
} catch (e) {
  console.error(`Fehler: ${(e as Error).message}`);
  process.exit(1);
}
