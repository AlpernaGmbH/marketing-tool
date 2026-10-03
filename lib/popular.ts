import { getRedis, keys, withTimeout } from "@/lib/redis";
import { getTools, type ToolConfig } from "@/lib/registry";

/**
 * Reihenfolge für «Meistgenutzt»: erst Werkzeuge mit Durchläufen (absteigend, bei Gleichstand
 * Reihenfolge der Registry), dann die mit `featured`, dann der Rest. Nie mehr als `limit`.
 */
export function rankPopular(tools: readonly ToolConfig[], counts: Readonly<Record<string, number>>, limit = 6): ToolConfig[] {
  const indexed = tools.map((tool, i) => ({ tool, i, n: counts[tool.slug] ?? 0 }));
  const used = indexed.filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i);
  const seen = new Set(used.map((x) => x.tool.slug));
  const featured = indexed.filter((x) => !seen.has(x.tool.slug) && x.tool.featured);
  featured.forEach((x) => seen.add(x.tool.slug));
  const rest = indexed.filter((x) => !seen.has(x.tool.slug));
  return [...used, ...featured, ...rest].slice(0, limit).map((x) => x.tool);
}

/** Zähler popular:<slug> aus Redis. Ohne Redis oder bei Fehler: leer, die Seite fällt auf `featured` zurück. */
export async function loadPopularCounts(tools: readonly ToolConfig[] = getTools()): Promise<Record<string, number>> {
  const redis = getRedis();
  if (!redis || tools.length === 0) return {};
  try {
    const values = await withTimeout(redis.mget<(number | string | null)[]>(...tools.map((t) => keys.popular(t.slug))), 2000);
    const out: Record<string, number> = {};
    tools.forEach((t, i) => {
      const n = Number(values[i]);
      if (Number.isFinite(n) && n > 0) out[t.slug] = n;
    });
    return out;
  } catch {
    return {};
  }
}

export async function getPopularTools(limit = 6): Promise<ToolConfig[]> {
  const tools = getTools();
  return rankPopular(tools, await loadPopularCounts(tools), limit);
}
