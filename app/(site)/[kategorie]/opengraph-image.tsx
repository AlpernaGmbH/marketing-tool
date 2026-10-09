import { notFound } from "next/navigation";
import { OG_SIZE, renderOg } from "@/lib/og";
import { CATEGORY_LABELS, CATEGORY_PAGES, type CategoryPage } from "@/lib/registry";
import { readCategory } from "@/lib/site-content";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Marketing-Werkzeuge für Schweizer KMU";

export function generateStaticParams() {
  return CATEGORY_PAGES.map((kategorie) => ({ kategorie }));
}

export default async function OgImage({ params }: { params: Promise<{ kategorie: string }> }) {
  const { kategorie } = await params;
  if (!(CATEGORY_PAGES as readonly string[]).includes(kategorie)) notFound();
  const page = kategorie as CategoryPage;
  return renderOg({ eyebrow: `Marketing-Werkzeuge · ${CATEGORY_LABELS[page]}`, title: readCategory(page).front.h1 ?? CATEGORY_LABELS[page] });
}
