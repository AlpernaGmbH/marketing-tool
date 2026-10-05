import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PlaceholderPage } from "@/components/site/PlaceholderPage";
import { dateCH } from "@/lib/ch";
import { loadLegalPage, type LegalPage } from "@/lib/legal";

const TITLES: Record<LegalPage, string> = { impressum: "Impressum", datenschutz: "Datenschutzerklärung" };

/** Rechtsseite: der freigegebene Text aus content/legal, sonst der Platzhalter (siehe lib/legal.ts). */
export async function LegalPageView({ page }: { page: LegalPage }) {
  const doc = await loadLegalPage(page);
  const title = TITLES[page];
  if (!doc) return <PlaceholderPage title={title} />;
  return (
    <div className="container-page section">
      <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: title }]} />
      <h1 className="mt-6">{title}</h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">Stand {dateCH(doc.stand)}</p>
      <div className="content measure mt-6" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </div>
  );
}
