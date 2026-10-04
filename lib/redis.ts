import { Redis } from "@upstash/redis";

const DAY = 24 * 60 * 60;

/** TTLs in Sekunden. */
export const TTL = {
  run: 30 * DAY,
  unlocked: 365 * DAY,
  daily: 2 * DAY,
  /** Wartende Leads (Name, E-Mail im Klartext) verfallen, falls n8n sie nie abholt. */
  leadQueue: 30 * DAY,
} as const;

/** Höchstens so viele Leads warten in lead_queue; ältere fallen weg (Schutz vor Überlauf). */
export const LEAD_QUEUE_MAX = 1000;

/** Redis-Keys. <iphash> ist nie die Klartext-IP. */
export const keys = {
  run: (iphash: string) => `run:${iphash}`,
  unlocked: (iphash: string) => `unlocked:${iphash}`,
  /** Freischaltung eines Kontos (HMAC der E-Mail-Adresse), gilt auf allen Geräten. */
  account: (acchash: string) => `acct:${acchash}`,
  popular: (slug: string) => `popular:${slug}`,
  ai: (acchash: string, day: string) => `ai:${acchash}:${day}`,
  /** Umschreibungen des Text-Umschreibers je Konto und Tag; die globale Grenze (`aiGlobal`) gilt für beide Arten. */
  aiText: (acchash: string, day: string) => `aitext:${acchash}:${day}`,
  lookup: (iphash: string, day: string) => `lookup:${iphash}:${day}`,
  aiGlobal: (day: string) => `ai:global:${day}`,
  /** Zwischenspeicher der KI-Einordnung je Ergebnis (Hash der Signatur), 24 Stunden. */
  aiCache: (hash: string) => `aicache:${hash}`,
  /** Daten beim Konto (Profil, Merkliste, Zwischenstände), ein Dokument je Konto, ohne Ablauf. */
  accountData: (acchash: string) => `data:${acchash}`,
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
