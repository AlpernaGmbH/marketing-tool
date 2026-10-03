import { Breadcrumbs } from "@/components/site/Breadcrumbs";

/**
 * Platzhalter für Seiten, die erst in Etappe 7 entstehen (Impressum, Datenschutz, Über).
 * Rechtstexte schreibt ein Mensch (CLAUDE.md, Harte Regel 8); bis dahin kein Inhalt und noindex.
 */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="container-page section">
      <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: title }]} />
      <h1 className="mt-6">{title}</h1>
      <p className="measure mt-4 text-muted-foreground">Diese Seite wird vor dem Start ergänzt.</p>
    </div>
  );
}
