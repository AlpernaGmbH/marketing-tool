import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { CONTENT_DIR, parseFaq, splitH2, type Faq } from "@/lib/content";
import { CATEGORY_PAGES } from "@/lib/define-tool";

// Seitentexte der Site (content/site/*.md): Startseite, Kategorieseiten, FAQ.
// Prüfregeln stehen in lib/site-rules.ts.

export const SITE_DIR = path.join(CONTENT_DIR, "site");

export const SITE_FILES = {
  categories: [...CATEGORY_PAGES] as string[],
  warumKostenlos: "warum-kostenlos",
  marketingSchweiz: "marketing-schweiz",
  faqStartseite: "faq-startseite",
} as const;

export const CATEGORY_SECTIONS = { einleitung: "Einleitung", hintergrund: "Hintergrund", fragen: "Häufige Fragen" } as const;

const categoryFront = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  h1: z.string().min(1),
  /** Überschrift (H2) über dem SEO-Abschnitt «Hintergrund». */
  seoHeading: z.string().min(1),
  /** Kurzer Satz über der Pfad-Grafik. */
  pfadText: z.string().min(1),
});

const simpleFront = z.object({ title: z.string().min(1), description: z.string().min(1).optional(), heading: z.string().min(1).optional() });

export type CategoryContent = {
  front: Partial<z.infer<typeof categoryFront>>;
  frontIssues: string[];
  einleitung?: string;
  hintergrund?: string;
  faq: Faq[];
  body: string;
};

export type SimpleContent = { front: Partial<z.infer<typeof simpleFront>>; body: string; paragraphs: string[]; faq: Faq[] };

function missingKeys(shape: Record<string, unknown>, data: Record<string, unknown>): string[] {
  return Object.keys(shape)
    .filter((k) => k !== "description" || shape.description !== undefined)
    .filter((k) => typeof data[k] !== "string" || (data[k] as string).trim() === "")
    .map((k) => `Kopfdaten: «${k}» fehlt`);
}

export function parseCategory(raw: string): CategoryContent {
  const { data, content } = matter(raw);
  const parsed = categoryFront.partial().safeParse(data);
  const sections = new Map(splitH2(content).map((s) => [s.title, s.content]));
  return {
    front: parsed.success ? parsed.data : {},
    frontIssues: missingKeys(categoryFront.shape, data),
    einleitung: sections.get(CATEGORY_SECTIONS.einleitung),
    hintergrund: sections.get(CATEGORY_SECTIONS.hintergrund),
    faq: parseFaq(sections.get(CATEGORY_SECTIONS.fragen) ?? ""),
    body: content,
  };
}

export function parseSimple(raw: string): SimpleContent {
  const { data, content } = matter(raw);
  const parsed = simpleFront.partial().safeParse(data);
  return {
    front: parsed.success ? parsed.data : {},
    body: content.trim(),
    paragraphs: content
      .trim()
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
    faq: parseFaq(content),
  };
}

export function siteFile(name: string): string {
  return path.join(SITE_DIR, `${name}.md`);
}

function readRaw(name: string): string {
  const file = siteFile(name);
  if (!fs.existsSync(file)) throw new Error(`content/site/${name}.md fehlt`);
  return fs.readFileSync(file, "utf8");
}

export const readCategory = (name: string): CategoryContent => parseCategory(readRaw(name));
export const readSimple = (name: string): SimpleContent => parseSimple(readRaw(name));
