import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { AlpernaPitch } from "@/components/tool/AlpernaPitch";
import { RelatedTools } from "@/components/tool/RelatedTools";
import { minutesLabel } from "@/lib/ch";
import { SECTION_TITLES, markdownToHtml, stripAlpernaFields, type ParsedToolContent } from "@/lib/content";
import { CATEGORY_LABELS, type ToolConfig } from "@/lib/registry";

type Props = {
  config: ToolConfig;
  content: ParsedToolContent;
  /** Die Tool-Client-Komponente. Desktop im sichtbaren Bereich, mobil direkt nach H1 und Tagline. */
  children: React.ReactNode;
};

/** «ICP-Builder für Schweizer KMU» → die gelbe Markierung liegt auf «Schweizer KMU» (eine pro Seite). */
function H1({ text }: { text: string }) {
  const i = text.indexOf(" für ");
  if (i < 0) return <h1>{text}</h1>;
  return (
    <h1>
      {text.slice(0, i + 5)}
      <mark className="mark-yellow">{text.slice(i + 5)}</mark>
    </h1>
  );
}

function Html({ html }: { html: string }) {
  return <div className="content" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Seitenaufbau Tool-Seite in der Reihenfolge aus CLAUDE.md. */
export async function ToolPageLayout({ config, content, children }: Props) {
  const { frontmatter: fm, sections, faq, alperna } = content;
  const [warum, nutzen, fehler, beispiel] = await Promise.all([
    markdownToHtml(sections.warum ?? ""),
    markdownToHtml(sections.nutzen ?? ""),
    markdownToHtml(sections.fehler ?? ""),
    markdownToHtml(sections.beispiel ?? ""),
  ]);
  const faqHtml = await Promise.all(
    faq.map(async (f) => ({ question: f.question, html: await markdownToHtml(stripAlpernaFields(f.answer)) })),
  );

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
          <H1 text={fm.h1 ?? config.name} />
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
          <div className="mt-4 rounded-lg border border-line bg-surface p-6 md:p-8">
            <Html html={beispiel} />
          </div>
        </section>

        <section aria-labelledby="fragen" className="pb-[var(--section-y)]">
          <h2 id="fragen">{SECTION_TITLES.fragen}</h2>
          <div className="mt-4 grid gap-8">
            {faqHtml.map((f) => (
              <div key={f.question} className="measure">
                <h3>{f.question}</h3>
                <div className="mt-2">
                  <Html html={f.html} />
                </div>
              </div>
            ))}
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
