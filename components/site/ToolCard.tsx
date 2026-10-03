import Link from "next/link";
import { minutesLabel } from "@/lib/ch";
import { CATEGORY_LABELS, type ToolConfig } from "@/lib/registry";

export function ToolCard({ tool }: { tool: ToolConfig }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex h-full flex-col rounded-lg border border-line bg-paper p-5 transition-colors hover:border-ink"
    >
      <span className="text-sm text-muted-foreground">
        {CATEGORY_LABELS[tool.category]} · {minutesLabel(tool.estimatedMinutes)}
      </span>
      <span className="mt-2 font-heading text-lg font-semibold group-hover:underline group-hover:underline-offset-4">
        {tool.name}
      </span>
      <span className="mt-2 text-base text-muted-foreground">{tool.tagline}</span>
    </Link>
  );
}
