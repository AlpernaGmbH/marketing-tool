import { type CategoryPage, type ToolConfig } from "@/lib/define-tool";
import { tools as toolList } from "@/tools";

export {
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PAGES,
  OUTPUTS,
  defineTool,
  type Category,
  type CategoryPage,
  type ToolConfig,
} from "@/lib/define-tool";

function validated(): readonly ToolConfig[] {
  const seen = new Set<string>();
  for (const t of toolList) {
    if (seen.has(t.slug)) throw new Error(`Doppelter Tool-Slug: ${t.slug}`);
    seen.add(t.slug);
  }
  return toolList;
}

export function getTools(): readonly ToolConfig[] {
  return validated();
}

export function getTool(slug: string): ToolConfig | undefined {
  return validated().find((t) => t.slug === slug);
}

export function getToolsByCategory(page: CategoryPage): ToolConfig[] {
  const all = validated();
  if (page === "vereine") return all.filter((t) => t.audience === "verein" || t.audience === "beide");
  return all.filter((t) => t.category === page);
}

/** Tools eines Pfads in pathStep-Reihenfolge. */
export function getPath(page: CategoryPage): ToolConfig[] {
  return validated()
    .filter((t) => t.pathStep.path === page)
    .sort((a, b) => a.pathStep.order - b.pathStep.order);
}

/** Verwandte Tools; unbekannte Slugs (noch nicht gebaut) werden übersprungen. */
export function getRelated(slug: string): ToolConfig[] {
  const tool = getTool(slug);
  if (!tool) return [];
  return tool.related.flatMap((s) => {
    const t = getTool(s);
    return t ? [t] : [];
  });
}

/** Nächster Schritt im Pfad des Tools, falls vorhanden. */
export function getNextStep(slug: string): ToolConfig | undefined {
  const tool = getTool(slug);
  if (!tool) return undefined;
  const path = getPath(tool.pathStep.path);
  const i = path.findIndex((t) => t.slug === slug);
  return i >= 0 ? path[i + 1] : undefined;
}

export function getFeatured(limit = 6): ToolConfig[] {
  return validated().filter((t) => t.featured).slice(0, limit);
}
