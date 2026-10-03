import { Html } from "@/components/site/Html";
import type { FaqHtml } from "@/lib/content";

/** Fragen und Antworten als offene Liste (kein Akkordeon: der Text soll für Suchmaschinen und Leser sichtbar sein). */
export function FaqList({ items }: { items: FaqHtml[] }) {
  return (
    <div className="grid gap-8">
      {items.map((f) => (
        <div key={f.question} className="measure">
          <h3>{f.question}</h3>
          <div className="mt-2">
            <Html html={f.html} />
          </div>
        </div>
      ))}
    </div>
  );
}
