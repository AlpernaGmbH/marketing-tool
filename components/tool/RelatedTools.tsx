import Link from "next/link";
import { ToolCard } from "@/components/site/ToolCard";
import { CATEGORY_LABELS, getNextStep, getRelated } from "@/lib/registry";

/** Drei verwandte Werkzeuge (aus tool.config.related) und der nächste Schritt im Pfad. */
export function RelatedTools({ slug }: { slug: string }) {
  const related = getRelated(slug);
  const next = getNextStep(slug);
  if (related.length === 0 && !next) return null;

  return (
    <section aria-labelledby="verwandte-tools">
      {related.length > 0 && (
        <>
          <h2 id="verwandte-tools">Verwandte Werkzeuge</h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {related.map((t) => (
              <li key={t.slug}>
                <ToolCard tool={t} />
              </li>
            ))}
          </ul>
        </>
      )}
      {next && (
        <p className="mt-8 text-lg">
          <span className="text-muted-foreground">Nächster Schritt im Pfad «{CATEGORY_LABELS[next.pathStep.path]}»: </span>
          <Link href={`/tools/${next.slug}`} className="font-medium underline underline-offset-4">
            {next.name}
          </Link>
        </p>
      )}
    </section>
  );
}
