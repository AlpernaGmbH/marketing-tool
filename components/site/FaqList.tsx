import { Html } from "@/components/site/Html";
import type { FaqHtml } from "@/lib/content";

/**
 * Fragen und Antworten als Akkordeon (`details`): Die Fragen lassen sich überfliegen, die Antworten stehen im Seitentext
 * und sind für Suchmaschinen lesbar. Jede Frage bleibt eine H3 (im `summary`), damit die Gliederung der Seite gleich bleibt.
 */
export function FaqList({ items }: { items: FaqHtml[] }) {
  return (
    <div className="faq measure">
      {items.map((f) => (
        <details key={f.question}>
          <summary>
            <h3>{f.question}</h3>
          </summary>
          <div className="answer">
            <Html html={f.html} />
          </div>
        </details>
      ))}
    </div>
  );
}
