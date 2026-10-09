import { ChevronDown } from "lucide-react";
import { VisualBlockView } from "@/components/tool/visual";
import type { DocBlock } from "@/lib/export/model";

type Props = {
  blocks: DocBlock[];
  /** Überschriften im Dokument beginnen bei dieser Stufe (Standard 4: unter dem h3 der ResultCard). */
  baseLevel?: 4 | 5;
};

type HeadingTag = "h4" | "h5" | "h6";

/**
 * Zeigt ein DocumentModel am Bildschirm, mit denselben Blöcken wie PDF, Word und Markdown-Copy (lib/export/model.ts).
 * So sehen Besucher genau das, was sie herunterladen. Rein darstellend, ohne Zustand.
 */
export function DocView({ blocks, baseLevel = 4 }: Props) {
  return (
    <div className="grid gap-4">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const Tag = `h${Math.min(baseLevel + b.level - 1, 6)}` as HeadingTag;
            return (
              <Tag key={i} className={b.level === 1 ? "font-heading text-lg font-medium" : "font-heading font-medium"}>
                {b.text}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="whitespace-pre-wrap">
                {b.text}
              </p>
            );
          case "list":
            return b.ordered ? (
              <ol key={i} className="grid list-decimal gap-1.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="grid list-disc gap-1.5 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{it}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      {b.header.map((h, j) => (
                        <th key={j} scope="col" className="border-b border-ink py-2 pr-4 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {b.header.map((_, c) => (
                          <td key={c} className="border-b border-line py-2 pr-4 align-top">
                            {row[c] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "facts":
            return (
              <dl key={i} className="grid gap-2 sm:grid-cols-[max-content_1fr] sm:gap-x-6">
                {b.items.map((f, j) => (
                  <div key={j} className="contents">
                    <dt className="text-sm text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-wrap">{f.value}</dd>
                  </div>
                ))}
              </dl>
            );
          case "details":
            return (
              <details key={i} className="group rounded-xl border border-line bg-paper" data-testid="doc-details">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 font-heading font-medium [&::-webkit-details-marker]:hidden">
                  <span>
                    {b.title}
                    {b.summary && <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{b.summary}</span>}
                  </span>
                  <ChevronDown aria-hidden="true" strokeWidth={1.8} className="size-5 shrink-0 transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <div className="border-t border-line px-5 py-5">
                  <DocView blocks={b.blocks} baseLevel={baseLevel} />
                </div>
              </details>
            );
          default:
            return <VisualBlockView key={i} block={b} />;
        }
      })}
    </div>
  );
}
