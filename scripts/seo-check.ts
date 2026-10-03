/* SEO-Prüfung über alle Werkzeuge (Etappe 7, Launch): Titel, Beschreibung, eine H1,
 * Keyword in H1 und erstem Absatz, interne Links. Nicht Teil von `npm run check`,
 * weil «mindestens drei verwandte Werkzeuge» erst mit dem vollständigen Katalog erfüllbar ist.
 */
import { readToolContent } from "@/lib/content";
import { getNextStep, getRelated, getTools } from "@/lib/registry";

let errors = 0;
const tools = getTools();
console.log(`seo-check: ${tools.length} Werkzeug(e)`);

for (const tool of tools) {
  const problems: string[] = [];
  const c = readToolContent(tool.slug);
  const fm = c.frontmatter;
  const kw = tool.keyword.toLowerCase();

  if (!fm.title || fm.title.length > 60) problems.push(`title: ${fm.title?.length ?? 0} Zeichen (höchstens 60)`);
  if (fm.title && !/schweiz/i.test(fm.title)) problems.push("title enthält «Schweiz» nicht");
  if (!fm.description || fm.description.length > 155) {
    problems.push(`description: ${fm.description?.length ?? 0} Zeichen (höchstens 155)`);
  }
  if (/^#\s+\S/m.test(c.body)) problems.push("zusätzliche H1 im Text");
  if (!fm.h1?.toLowerCase().includes(kw)) problems.push(`Keyword «${tool.keyword}» fehlt in der H1`);

  const firstParagraph = (c.sections.warum ?? "").split(/\n\s*\n/)[0]?.toLowerCase() ?? "";
  if (!firstParagraph.includes(kw)) problems.push(`Keyword «${tool.keyword}» fehlt im ersten Absatz`);

  const occurrences = (`${fm.h1 ?? ""}\n${c.body}`.toLowerCase().match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  if (occurrences < 3 || occurrences > 5) problems.push(`Keyword «${tool.keyword}» kommt ${occurrences}-mal vor (3 bis 5)`);

  const internalLinks = getRelated(tool.slug).length + 1 + (getNextStep(tool.slug) ? 1 : 0);
  if (internalLinks < 3) problems.push(`nur ${internalLinks} interne Links (mindestens 3)`);

  if (problems.length) {
    errors += problems.length;
    for (const p of problems) console.log(`  FEHLER [${tool.slug}] ${p}`);
  }
}

console.log(`seo-check: ${errors} Fehler`);
process.exit(errors > 0 ? 1 : 0);
