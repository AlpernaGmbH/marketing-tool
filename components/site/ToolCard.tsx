import Link from "next/link";
import { minutesLabel } from "@/lib/ch";
import { ToolIcon } from "@/lib/tool-icons";
import { CATEGORY_LABELS, type ToolConfig } from "@/lib/registry";

export function ToolCard({ tool }: { tool: ToolConfig }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-paper p-5 transition-colors hover:border-ink"
    >
      <span className="flex items-start justify-between gap-4">
        <span className="eyebrow">
          {CATEGORY_LABELS[tool.category]} · {minutesLabel(tool.estimatedMinutes)}
        </span>
        <ToolIcon slug={tool.slug} className="size-7 shrink-0 text-ink transition-transform group-hover:-rotate-6" />
      </span>
      <span className="mt-3 text-xl font-medium tracking-[-0.02em] group-hover:underline group-hover:underline-offset-4">
        {tool.name}
      </span>
      <span className="mt-2 text-base text-muted-foreground">{tool.tagline}</span>
    </Link>
  );
}
