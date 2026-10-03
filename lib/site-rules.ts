import { countWords, styleIssues, todoIssues, type Issue } from "@/lib/content-rules";
import type { CategoryContent, SimpleContent } from "@/lib/site-content";

// Prüfregeln für content/site/*.md (CLAUDE.md, Startseite und Kategorieseite; Etappe-1b-Prompt).

const err = (code: string, message: string): Issue => ({ level: "error", code, message });

/** Der Titel wird vom Root-Layout mit « | Alperna» ergänzt; zusammen höchstens 60 Zeichen. */
const TITLE_SUFFIX = " | Alperna".length;

function metaIssues(front: { title?: string; description?: string }, withSchweiz: boolean): Issue[] {
  const out: Issue[] = [];
  if (front.title) {
    if (front.title.length + TITLE_SUFFIX > 60) out.push(err("title-length", `title hat mit Zusatz ${front.title.length + TITLE_SUFFIX} Zeichen (höchstens 60)`));
    if (withSchweiz && !/schweiz/i.test(front.title)) out.push(err("title-schweiz", "title enthält «Schweiz» nicht"));
  }
  if (front.description && front.description.length > 155) out.push(err("description-length", `description hat ${front.description.length} Zeichen (höchstens 155)`));
  return out;
}

function inRange(label: string, text: string | undefined, min: number, max: number): Issue[] {
  if (text === undefined) return [err("section-missing", `Abschnitt «${label}» fehlt`)];
  const n = countWords(text);
  return n < min || n > max ? [err("words", `«${label}» hat ${n} Wörter (${min} bis ${max})`)] : [];
}

/** Kategorieseite: Einleitung rund 250 Wörter, Hintergrund rund 500, genau 5 Fragen. */
export function checkCategory(c: CategoryContent): Issue[] {
  const issues: Issue[] = c.frontIssues.map((m) => err("frontmatter", m));
  issues.push(...metaIssues(c.front, true));
  issues.push(...inRange("Einleitung", c.einleitung, 220, 290));
  issues.push(...inRange("Hintergrund", c.hintergrund, 440, 560));
  if (c.faq.length !== 5) issues.push(err("faq-count", `Es gibt ${c.faq.length} Fragen (genau 5)`));
  for (const f of c.faq) if (!f.answer.trim()) issues.push(err("faq-empty", `Frage «${f.question}» hat keine Antwort`));
  issues.push(...todoIssues(c.body, Object.values(c.front)), ...styleIssues(c.body));
  return issues;
}

/** «Warum kostenlos»: drei Absätze. */
export function checkWarumKostenlos(c: SimpleContent): Issue[] {
  const issues: Issue[] = [];
  if (c.paragraphs.length !== 3) issues.push(err("paragraphs", `Es gibt ${c.paragraphs.length} Absätze (genau 3)`));
  c.paragraphs.forEach((p, i) => {
    if (countWords(p) < 30) issues.push(err("words", `Absatz ${i + 1} ist zu kurz (${countWords(p)} Wörter, mindestens 30)`));
  });
  issues.push(...todoIssues(c.body), ...styleIssues(c.body));
  return issues;
}

/** Pflichtthemen des SEO-Abschnitts «Marketing in der Schweiz». */
export const MARKETING_TOPICS = ["Sprachregion", "Gemeinde", "Verein", "Google Business Profil", "WhatsApp", "UWG", "revDSG", "PBV"] as const;

export function checkMarketingSchweiz(c: SimpleContent): Issue[] {
  const issues: Issue[] = [...metaIssues(c.front, true)];
  issues.push(...inRange("Marketing in der Schweiz", c.body, 700, 900));
  for (const t of MARKETING_TOPICS) if (!c.body.includes(t)) issues.push(err("topic", `Pflichtthema «${t}» fehlt im Text`));
  if (!c.front.heading) issues.push(err("frontmatter", "Kopfdaten: «heading» fehlt"));
  issues.push(...todoIssues(c.body, Object.values(c.front)), ...styleIssues(c.body));
  return issues;
}

/** FAQ der Startseite: sieben Fragen. */
export function checkFaqStartseite(c: SimpleContent): Issue[] {
  const issues: Issue[] = [];
  if (c.faq.length !== 7) issues.push(err("faq-count", `Es gibt ${c.faq.length} Fragen (genau 7)`));
  for (const f of c.faq) if (!f.answer.trim()) issues.push(err("faq-empty", `Frage «${f.question}» hat keine Antwort`));
  issues.push(...todoIssues(c.body), ...styleIssues(c.body));
  return issues;
}
