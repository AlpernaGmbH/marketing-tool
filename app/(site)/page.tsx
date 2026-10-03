import type { Metadata } from "next";
import Link from "next/link";
import { Contours } from "@/components/site/Contours";
import { FaqList } from "@/components/site/FaqList";
import { Html } from "@/components/site/Html";
import { PageH1 } from "@/components/site/PageH1";
import { PathCard } from "@/components/site/PathCard";
import { Search } from "@/components/site/Search";
import { ToolCard } from "@/components/site/ToolCard";
import { TrustLine } from "@/components/site/TrustLine";
import { searchItems } from "@/components/site/Header";
import { AlpernaPitch } from "@/components/tool/AlpernaPitch";
import { buttonVariants } from "@/components/ui/button";
import { faqToHtml, markdownToHtml } from "@/lib/content";
import { SITE_URL, homeJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { getPopularTools } from "@/lib/popular";
import { CATEGORY_LABELS, getPath, type CategoryPage } from "@/lib/registry";
import { SITE_FILES, readCategory, readSimple } from "@/lib/site-content";
import { cn } from "cn";

// Meistgenutzt kommt aus Redis (popular:<slug>); einmal pro Stunde neu berechnen.
export const revalidate = 3600;

const TITLE = "Marketing-Tools für Schweizer KMU und Vereine – kostenlos";
const DESCRIPTION =
  "Kostenlose Marketing-Werkzeuge für Schweizer KMU und Vereine: Strategie, Content, Analyse und Recht. Ohne Konto, mit Ergebnis in Minuten.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: { title: TITLE, description: DESCRIPTION, url: SITE_URL, type: "website", locale: "de_CH" },
};

const PATH_CARDS: CategoryPage[] = ["strategie", "content", "analyse", "schweiz"];

const slugsOf = (page: CategoryPage) => getPath(page).map((t) => t.slug);
const cardText = (page: CategoryPage) => readCategory(page).front.description ?? "";

export default async function HomePage() {
  const popular = await getPopularTools(6);
  const warum = readSimple(SITE_FILES.warumKostenlos);
  const seo = readSimple(SITE_FILES.marketingSchweiz);
  const faq = readSimple(SITE_FILES.faqStartseite).faq;
  const [seoHtml, faqItems] = await Promise.all([markdownToHtml(seo.body), faqToHtml(faq)]);
  const firstStep = getPath("strategie")[0];

  return (
    <>
      {homeJsonLd(faq).map((block, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(block) }} />
      ))}

      <section className="relative overflow-hidden" aria-labelledby="hero-titel">
        <Contours />
        <div className="container-page relative section">
          <PageH1 text="Marketing-Werkzeuge für Schweizer KMU und Vereine" className="measure" />
          <p className="measure mt-4 text-lg text-muted-foreground">
            Kostenlos, verständlich und für die Schweiz gemacht. Beantworte ein paar Fragen und du hältst in Minuten ein
            Ergebnis in der Hand.
          </p>
          <div className="mt-6">
            <Search items={searchItems()} variant="hero" label="Welches Werkzeug suchst du?" />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href="#werkzeuge" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Tool finden
            </a>
            <Link href={firstStep ? `/tools/${firstStep.slug}` : "/strategie"} className={cn(buttonVariants({ size: "lg" }))}>
              Strategie-Pfad starten
            </Link>
          </div>
          <div className="mt-8">
            <TrustLine />
          </div>
        </div>
      </section>

      <section aria-labelledby="pfade" className="container-page pb-[var(--section-y)]">
        <h2 id="pfade">Such dir einen Pfad aus</h2>
        <p className="measure mt-2 text-muted-foreground">
          Jeder Pfad ordnet die Werkzeuge in einer sinnvollen Reihenfolge. Was du erledigt hast, merkt sich dein Browser.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PATH_CARDS.map((page) => (
            <li key={page}>
              <PathCard href={`/${page}`} title={CATEGORY_LABELS[page]} text={cardText(page)} slugs={slugsOf(page)} />
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <PathCard href="/vereine" title={CATEGORY_LABELS.vereine} text={cardText("vereine")} slugs={slugsOf("vereine")} />
        </div>
      </section>

      <section id="werkzeuge" aria-labelledby="meistgenutzt" className="container-page scroll-mt-6 pb-[var(--section-y)]">
        <h2 id="meistgenutzt">Meistgenutzt</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((t) => (
            <li key={t.slug}>
              <ToolCard tool={t} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="warum-kostenlos" className="border-y border-line bg-surface">
        <div className="container-page section">
          <h2 id="warum-kostenlos">Warum kostenlos?</h2>
          <div className="content mt-4">
            {warum.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="marketing-schweiz" className="container-page section">
        <h2 id="marketing-schweiz">{seo.front.heading}</h2>
        <div className="mt-4">
          <Html html={seoHtml} />
        </div>
      </section>

      <div className="container-page pb-[var(--section-y)]">
        <AlpernaPitch variant="long" />
      </div>

      <section aria-labelledby="faq" className="container-page pb-[var(--section-y)]">
        <h2 id="faq">Häufige Fragen</h2>
        <div className="mt-4">
          <FaqList items={faqItems} />
        </div>
      </section>
    </>
  );
}
