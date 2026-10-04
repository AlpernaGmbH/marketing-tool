import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { FaqList } from "@/components/site/FaqList";
import { Html } from "@/components/site/Html";
import { PageH1 } from "@/components/site/PageH1";
import { AlpernaPitch } from "@/components/tool/AlpernaPitch";
import { RelatedTools } from "@/components/tool/RelatedTools";
import { minutesLabel } from "@/lib/ch";
import { SECTION_TITLES, faqToHtml, markdownToHtml, type ParsedToolContent } from "@/lib/content";
import { CATEGORY_LABELS, type ToolConfig } from "@/lib/registry";

type Props = {
  config: ToolConfig;
  content: ParsedToolContent;
  /** Die Tool-Client-Komponente. Desktop im sichtbaren Bereich, mobil direkt nach H1 und Tagline. */
  children: React.ReactNode;
};

/** Seitenaufbau Tool-Seite in der Reihenfolge aus CLAUDE.md. */
export async function ToolPageLayout({ config, content, children }: Props) {
  const { frontmatter: fm, sections, faq, alperna } = content;
  const [warum, nutzen, fehler, beispiel, faqItems] = await Promise.all([
    markdownToHtml(sections.warum ?? ""),
    markdownToHtml(sections.nutzen ?? ""),
    markdownToHtml(sections.fehler ?? ""),
    markdownToHtml(sections.beispiel ?? ""),
    faqToHtml(faq),
  ]);

  return (
    <article>
      <header className="container-page pt-8 md:pt-10">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: CATEGORY_LABELS[config.category], href: `/${config.category}` },
            { label: config.name },
          ]}
        />
        <div className="mt-4">
          <PageH1 text={fm.h1 ?? config.name} />
        </div>
        <p className="measure mt-3 text-lg text-muted-foreground">{fm.tagline ?? config.tagline}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {minutesLabel(config.estimatedMinutes)} · {CATEGORY_LABELS[config.category]} · Ergebnis sofort, Dateien nach
          kurzem Formular
        </p>
      </header>

      <div className="container-page mt-6 md:mt-8">{children}</div>

      <div className="container-page">
        <section aria-labelledby="warum" className="section">
          <h2 id="warum">{SECTION_TITLES.warum}</h2>
          <div className="mt-4">
            <Html html={warum} />
          </div>
        </section>

        <section aria-labelledby="nutzen" className="pb-[var(--section-y)]">
          <h2 id="nutzen">{SECTION_TITLES.nutzen}</h2>
          <div className="mt-4">
            <Html html={nutzen} />
          </div>
        </section>

        <section aria-labelledby="fehler" className="pb-[var(--section-y)]">
          <h2 id="fehler">{SECTION_TITLES.fehler}</h2>
          <div className="mt-4">
            <Html html={fehler} />
          </div>
        </section>

        <section aria-labelledby="beispiel" className="pb-[var(--section-y)]">
          <h2 id="beispiel">{SECTION_TITLES.beispiel}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Fiktives Beispiel: {fm.beispielFirma}</p>
          <div className="mt-4 rounded-xl border border-line bg-paper p-6 md:p-8">
            <Html html={beispiel} />
          </div>
        </section>

        <section aria-labelledby="fragen" className="pb-[var(--section-y)]">
          <h2 id="fragen">{SECTION_TITLES.fragen}</h2>
          <div className="mt-4">
            <FaqList items={faqItems} />
          </div>
        </section>

        <div className="pb-[var(--section-y)]">
          <AlpernaPitch variant="short" toolName={config.name} toolSlug={config.slug} fields={alperna} />
        </div>

        <div className="pb-[var(--section-y)]">
          <RelatedTools slug={config.slug} />
        </div>
      </div>
    </article>
  );
}
