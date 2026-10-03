import { Ratelimit } from "@upstash/ratelimit";
import { getRedis, withTimeout } from "@/lib/redis";

type Window = `${number} ${"s" | "m" | "h" | "d"}`;

const limiters = new Map<string, Ratelimit>();

/**
 * true = durchlassen. Ohne Redis oder bei Redis-Fehlern wird immer durchgelassen:
 * Ein Besucher wird nie wegen unserer Technik blockiert.
 */
export async function withinLimit(name: string, max: number, window: Window, id: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const cacheKey = `${name}:${max}:${window}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, window),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(cacheKey, limiter);
  }
  try {
    const { success } = await withTimeout(limiter.limit(id));
    return success;
  } catch {
    return true;
  }
}
