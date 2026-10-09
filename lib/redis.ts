import { Redis } from "@upstash/redis";

const DAY = 24 * 60 * 60;

/** TTLs in Sekunden. */
export const TTL = {
  daily: 2 * DAY,
  /** Wartende Leads (E-Mail, Eingabe, Ausgabe im Klartext) verfallen, falls n8n sie nie abholt. */
  leadQueue: 30 * DAY,
  /** Merker «diese Adresse hat schon eine Mail «neuer Lead» ausgelöst» (nur HMAC der Adresse). */
  known: 365 * DAY,
} as const;

/** Höchstens so viele Leads warten in lead_queue; ältere fallen weg (Schutz vor Überlauf). */
export const LEAD_QUEUE_MAX = 1000;

/** Redis-Keys. <iphash> ist nie die Klartext-IP, <acchash> nie die Adresse (lib/access.ts). */
export const keys = {
  popular: (slug: string) => `popular:${slug}`,
  /** Einordnungen je Person (HMAC der E-Mail-Adresse) und Tag. */
  ai: (acchash: string, day: string) => `ai:${acchash}:${day}`,
  lookup: (iphash: string, day: string) => `lookup:${iphash}:${day}`,
  aiGlobal: (day: string) => `ai:global:${day}`,
  /** Ausgaben der KI je Person (HMAC der Adresse) und Tag in Millionstel US-Dollar, aus `usage.cost` der Antworten. */
  aiCost: (acchash: string, day: string) => `aicost:${acchash}:${day}`,
  /** Ausgaben der KI aller Besucher an einem Tag in Millionstel US-Dollar. */
  aiCostGlobal: (day: string) => `aicost:global:${day}`,
  /** Marke «Tagesgrenze der KI heute gemeldet», damit die Mail nur einmal am Tag rausgeht. */
  aiAlert: (day: string, kind = "limit") => `ai:alert:${kind}:${day}`,
  /** Zwischenspeicher der KI-Einordnung je Ergebnis (Hash der Signatur), 24 Stunden. */
  aiCache: (hash: string) => `aicache:${hash}`,
  /** Eine Adresse (HMAC, nie die Adresse selbst), für die Alperna schon eine Mail «neuer Lead» bekommen hat. */
  known: (acchash: string) => `known:${acchash}`,
  leadQueue: "lead_queue",
} as const;

/** Datum als YYYY-MM-DD in Schweizer Zeit (Tageslimits laufen um Mitternacht in der Schweiz ab). */
export function dayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

let client: Redis | null | undefined;

/**
 * Upstash-Client oder null, wenn nicht konfiguriert. Der Vercel-Marketplace setzt
 * UPSTASH_REDIS_REST_*; die älteren KV_REST_API_*-Namen gelten als Fallback.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  client = url && token ? new Redis({ url, token, retry: { retries: 1, backoff: () => 100 } }) : null;
  return client;
}

/** Nur für Tests. */
export function resetRedisClient(): void {
  client = undefined;
}

/** Wartet höchstens `ms` auf Redis. Ein Besucher wartet nie länger wegen unserer Technik. */
export async function withTimeout<T>(promise: Promise<T>, ms = 1500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("redis_timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
