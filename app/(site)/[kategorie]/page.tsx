import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { FaqList } from "@/components/site/FaqList";
import { Html } from "@/components/site/Html";
import { PageH1 } from "@/components/site/PageH1";
import { PathGraphic } from "@/components/site/PathGraphic";
import { ToolCard } from "@/components/site/ToolCard";
import { AlpernaPitch } from "@/components/tool/AlpernaPitch";
import { buildNotice } from "@/lib/category-notice";
import { minutesLabel } from "@/lib/ch";
import { faqToHtml, markdownToHtml } from "@/lib/content";
import { SITE_URL, categoryJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { CATEGORY_LABELS, CATEGORY_PAGES, getPath, getToolsByCategory, type CategoryPage } from "@/lib/registry";
import { readCategory } from "@/lib/site-content";

type Params = { kategorie: string };

// Nur die sechs bekannten Seiten; alles andere ist 404.
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return CATEGORY_PAGES.map((kategorie) => ({ kategorie }));
}

const isPage = (s: string): s is CategoryPage => (CATEGORY_PAGES as readonly string[]).includes(s);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { kategorie } = await params;
  if (!isPage(kategorie)) return {};
  const { front } = readCategory(kategorie);
  const url = `${SITE_URL}/${kategorie}`;
  return {
    title: front.title,
    description: front.description,
    alternates: { canonical: url },
    openGraph: { title: front.title, description: front.description, url, type: "website", locale: "de_CH" },
  };
}

export default async function CategoryPageRoute({ params }: { params: Promise<Params> }) {
  const { kategorie } = await params;
  if (!isPage(kategorie)) notFound();

  const content = readCategory(kategorie);
  const { front } = content;
  const tools = getToolsByCategory(kategorie);
  const path = getPath(kategorie);
  const notice = buildNotice(tools.length);
  const [einleitung, hintergrund, faqItems] = await Promise.all([
    markdownToHtml(content.einleitung ?? ""),
    markdownToHtml(content.hintergrund ?? ""),
    faqToHtml(content.faq),
  ]);

  const jsonLd = categoryJsonLd(kategorie, { h1: front.h1 ?? CATEGORY_LABELS[kategorie], description: front.description ?? "" }, content.faq, tools);

  return (
    <>
      {jsonLd.map((block, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(block) }} />
      ))}
      <article>
        <header className="container-page pt-8 md:pt-10">
          <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: CATEGORY_LABELS[kategorie] }]} />
          <div className="mt-4">
            <PageH1 text={front.h1 ?? CATEGORY_LABELS[kategorie]} />
          </div>
          <div className="mt-4">
            <Html html={einleitung} />
          </div>
        </header>

        <div className="container-page">
          {notice && (
            <p className="measure mt-8 rounded-xl border border-line bg-surface px-4 py-3 text-base" role="note">
              {notice}
            </p>
          )}

          {path.length > 0 && (
            <section aria-labelledby="pfad" className="section">
              <h2 id="pfad">Dein Weg</h2>
              <p className="measure mt-2 text-muted-foreground">{front.pfadText}</p>
              <div className="mt-6">
                <PathGraphic steps={path.map((t) => ({ slug: t.slug, name: t.name, minutes: minutesLabel(t.estimatedMinutes) }))} />
              </div>
            </section>
          )}

          {tools.length > 0 && (
            <section aria-labelledby="werkzeuge" className="pb-[var(--section-y)]">
              <h2 id="werkzeuge">Alle Werkzeuge</h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((t) => (
                  <li key={t.slug}>
                    <ToolCard tool={t} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="hintergrund" className={tools.length === 0 && path.length === 0 ? "section" : "pb-[var(--section-y)]"}>
            <h2 id="hintergrund">{front.seoHeading}</h2>
            <div className="mt-4">
              <Html html={hintergrund} />
            </div>
          </section>

          <section aria-labelledby="fragen" className="pb-[var(--section-y)]">
            <h2 id="fragen">Häufige Fragen</h2>
            <div className="mt-4">
              <FaqList items={faqItems} />
            </div>
          </section>

          <div className="pb-[var(--section-y)]">
            <AlpernaPitch variant="long" />
          </div>
        </div>
      </article>
    </>
  );
}
