import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import { z } from "zod";

// Seitentext einer Tool-Seite: content/tools/<slug>.md (Vorlage in CLAUDE.md).
// Dieses Modul liest nur und prüft nichts Inhaltliches; die Regeln stehen in lib/content-rules.ts.

export const CONTENT_DIR = path.join(process.cwd(), "content");

export const SECTION_TITLES = {
  warum: "Warum das wichtig ist",
  nutzen: "So nutzt du das Ergebnis",
  fehler: "Häufige Fehler",
  beispiel: "Beispiel",
  fragen: "Häufige Fragen",
  alperna: "Alperna",
} as const;

export const SECTION_ORDER = ["warum", "nutzen", "fehler", "beispiel", "fragen", "alperna"] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];

export const frontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  h1: z.string().min(1),
  tagline: z.string().min(1),
  beispielFirma: z.string().min(1),
  /** Das Versprechen in drei Punkten («In Kürze»): was du bekommst, was du dafür tust, was danach klar ist. */
  kurz: z.array(z.string().min(1)).length(3),
  /** Der Ablauf in drei kurzen Schritten (Grafik unter dem Werkzeug). */
  ablauf: z.array(z.string().min(1)).length(3),
});
export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** Kopfdaten, die ein Text sein müssen, und solche, die eine Liste aus genau drei Texten sind. */
const TEXT_KEYS = ["title", "description", "h1", "tagline", "beispielFirma"] as const;
const LIST_KEYS = ["kurz", "ablauf"] as const;

export type Faq = { question: string; answer: string };
export type AlpernaFields = { problem?: string; baustein?: string; beweis?: string };

export type ParsedToolContent = {
  /** Fehler beim Lesen der Kopfdaten; leer, wenn alles da ist. */
  frontmatterIssues: string[];
  frontmatter: Partial<Frontmatter>;
  /** Roh-Markdown je Abschnitt, in Vorlagen-Reihenfolge gefunden. */
  sections: Partial<Record<SectionKey, string>>;
  /** Reihenfolge der gefundenen H2-Titel, für die Reihenfolge-Prüfung. */
  h2Order: string[];
  faq: Faq[];
  alperna: AlpernaFields;
  /** Markdown-Text nach den Kopfdaten. */
  body: string;
};

/** Zerlegt Markdown in H2-Abschnitte. Zeilen in Codeblöcken zählen nicht als Überschrift. */
export function splitH2(body: string): { title: string; content: string }[] {
  const out: { title: string; content: string }[] = [];
  let current: { title: string; lines: string[] } | null = null;
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence ? /^##\s+(.+?)\s*$/.exec(line) : null;
    if (m) {
      if (current) out.push({ title: current.title, content: current.lines.join("\n").trim() });
      current = { title: m[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) out.push({ title: current.title, content: current.lines.join("\n").trim() });
  return out;
}

export function parseFaq(content: string): Faq[] {
  const faq: Faq[] = [];
  let q: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (q !== null) faq.push({ question: q, answer: lines.join("\n").trim() });
  };
  for (const line of content.split("\n")) {
    const m = /^###\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      q = m[1];
      lines = [];
    } else if (q !== null) {
      lines.push(line);
    }
  }
  flush();
  return faq;
}

function parseAlperna(content: string): AlpernaFields {
  const out: AlpernaFields = {};
  for (const line of content.split("\n")) {
    const m = /^(problem|baustein|beweis):\s*(.+)$/i.exec(line.trim());
    if (m) out[m[1].toLowerCase() as keyof AlpernaFields] = m[2].trim();
  }
  return out;
}

export function parseToolMarkdown(raw: string): ParsedToolContent {
  const { data, content } = matter(raw);
  const fm = frontmatterSchema.partial().safeParse(data);
  const frontmatter = fm.success ? fm.data : {};
  const issues: string[] = [];
  for (const key of TEXT_KEYS) {
    const v = (data as Record<string, unknown>)[key];
    if (typeof v !== "string" || v.trim() === "") issues.push(`Kopfdaten: «${key}» fehlt`);
  }
  for (const key of LIST_KEYS) {
    const v = (data as Record<string, unknown>)[key];
    if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== "string" || x.trim() === "")) issues.push(`Kopfdaten: «${key}» braucht genau drei Einträge`);
  }

  const byTitle = new Map(splitH2(content).map((s) => [s.title, s.content]));
  const sections: ParsedToolContent["sections"] = {};
  for (const key of SECTION_ORDER) {
    const text = byTitle.get(SECTION_TITLES[key]);
    if (text !== undefined) sections[key] = text;
  }

  return {
    frontmatterIssues: issues,
    frontmatter,
    sections,
    h2Order: splitH2(content).map((s) => s.title),
    faq: parseFaq(sections.fragen ?? ""),
    alperna: parseAlperna(sections.alperna ?? ""),
    body: content,
  };
}

export function toolContentPath(slug: string): string {
  return path.join(CONTENT_DIR, "tools", `${slug}.md`);
}

/** Liest und zerlegt content/tools/<slug>.md. Wirft, wenn die Datei fehlt. */
export function readToolContent(slug: string): ParsedToolContent {
  const file = toolContentPath(slug);
  if (!fs.existsSync(file)) throw new Error(`content/tools/${slug}.md fehlt`);
  return parseToolMarkdown(fs.readFileSync(file, "utf8"));
}

/**
 * Markdown zu HTML (remark, bereinigt). Nur für Inhalte aus dem Repo.
 * Ein Absatz, der mit «=> » beginnt, ist eine offene Schleife: ein Satz am Ende eines Abschnitts, der auf den nächsten neugierig
 * macht («Gleich unten: …»). Er bekommt die Klasse `loop` und wird vom Stil abgesetzt.
 */
export async function markdownToHtml(md: string): Promise<string> {
  const file = await remark().use(html).process(md);
  return String(file).replace(/<p>=(?:&gt;|>)\s+/g, '<p class="loop">');
}

/** Wörter eines Textes ohne Markdown-Zeichen; die offenen Schleifen zählen mit. */
export function loopCount(md: string): number {
  return md.split("\n").filter((l) => /^=>\s+\S/.test(l.trim())).length;
}

export type FaqHtml = { question: string; html: string };

/** Fragen und Antworten für die Anzeige: Antworten als HTML, ohne Alperna-Schlüsselzeilen. */
export async function faqToHtml(faq: Faq[]): Promise<FaqHtml[]> {
  return Promise.all(faq.map(async (f) => ({ question: f.question, html: await markdownToHtml(stripAlpernaFields(f.answer)) })));
}

/** Abschnitt ohne die Alperna-Schlüsselzeilen, zum Anzeigen. */
export function stripAlpernaFields(md: string): string {
  return md
    .split("\n")
    .filter((l) => !/^(problem|baustein|beweis):/i.test(l.trim()))
    .join("\n")
    .trim();
}
