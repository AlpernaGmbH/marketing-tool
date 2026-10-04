import { createHash } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { TTL, dayKey, getRedis, keys, withTimeout } from "@/lib/redis";

// Kontingente und Zwischenspeicher der KI-Einordnung. Alles in Redis; ohne Redis (oder bei Ausfall) gibt es keine Grenze
// in der Anwendung. Dann begrenzt das Gratisguthaben des Vercel AI Gateway die Kosten: Ist es aufgebraucht, kommt ein
// Fehler, und der Check steht ohne Einordnung da. Niemand wird wegen unserer Technik blockiert.

export const CACHE_TTL = 24 * 60 * 60;

export interface AiStore {
  /** Erhöht den Zähler und gibt den neuen Stand zurück. Beim ersten Aufruf setzt es die Lebensdauer. */
  incr(key: string, ttl: number): Promise<number>;
  /** Zieht einen Zähler wieder ab (Rückbuchung nach einem Fehlversuch). */
  decr(key: string): Promise<void>;
  getCache(hash: string): Promise<string | null>;
  setCache(hash: string, json: string): Promise<void>;
}

export function redisAiStore(redis: Redis): AiStore {
  return {
    async incr(key, ttl) {
      const p = redis.pipeline();
      p.incr(key);
      p.expire(key, ttl, "NX");
      const [n] = await withTimeout(p.exec<[number, number]>());
      return Number(n);
    },
    async decr(key) {
      await withTimeout(redis.decr(key));
    },
    async getCache(hash) {
      const v = await withTimeout(redis.get<unknown>(keys.aiCache(hash)));
      return v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
    },
    async setCache(hash, json) {
      await withTimeout(redis.set(keys.aiCache(hash), json, { ex: CACHE_TTL }));
    },
  };
}

export function defaultAiStore(): AiStore | null {
  const redis = getRedis();
  return redis ? redisAiStore(redis) : null;
}

/** Schlüssel im Zwischenspeicher: Hash der Signatur des Ergebnisses (gleiches Ergebnis, gleiche Einordnung). */
export function cacheHash(sig: string): string {
  return createHash("sha256").update(sig).digest("hex").slice(0, 32);
}

export type Slot = "ok" | "account_limit" | "capacity";

export type Limits = { perAccount: number; perAccountText: number; global: number };

/** Art der Anfrage: Einordnung zum Check oder Umschreiben eines Textes. Jede hat ein eigenes Tageslimit pro Konto, die globale Grenze teilen sie. */
export type Scope = "einordnung" | "text";

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  const n = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
  return { perAccount: n(env.AI_ACCOUNT_DAILY, 5), perAccountText: n(env.AI_TEXT_DAILY, 10), global: n(env.AI_DAILY_CAP, 200) };
}

const accountKey = (scope: Scope, acchash: string, day: string) => (scope === "text" ? keys.aiText(acchash, day) : keys.ai(acchash, day));

/**
 * Reserviert eine Anfrage. Erst das Tageslimit des Kontos (je Art), dann das globale Tageslimit.
 * Fällt Redis aus, geht die Anfrage durch.
 */
export async function takeSlot(store: AiStore | null, acchash: string, limits: Limits, now = new Date(), scope: Scope = "einordnung"): Promise<Slot> {
  if (!store) return "ok";
  const day = dayKey(now);
  const mine = accountKey(scope, acchash, day);
  const max = scope === "text" ? limits.perAccountText : limits.perAccount;
  try {
    if ((await store.incr(mine, TTL.daily)) > max) {
      await store.decr(mine); // abgelehnte Anfragen zählen nicht weiter
      return "account_limit";
    }
    if ((await store.incr(keys.aiGlobal(day), TTL.daily)) > limits.global) {
      await store.decr(keys.aiGlobal(day));
      await store.decr(mine);
      return "capacity";
    }
    return "ok";
  } catch {
    return "ok";
  }
}

/** Bucht einen reservierten Platz zurück, wenn keine Einordnung entstanden ist (Modellfehler, verworfene Antwort). */
export async function releaseSlot(store: AiStore | null, acchash: string, now = new Date(), scope: Scope = "einordnung"): Promise<void> {
  if (!store) return;
  const day = dayKey(now);
  try {
    await store.decr(accountKey(scope, acchash, day));
    await store.decr(keys.aiGlobal(day));
  } catch {
    /* Rückbuchung ist Komfort */
  }
}
