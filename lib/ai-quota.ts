import { createHash } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { aiProvider } from "@/lib/ai";
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

export type Limits = { perAccount: number; global: number };

/**
 * Art der Anfrage. «einordnung»: KI-Einordnung zum Check, mit Tageslimit pro E-Mail-Adresse (HMAC, `acchash`).
 * «text»: Text-Umschreiber und Textcheck, ohne Limit pro Person; es gilt nur die globale Tagesgrenze
 * (Schutz davor, dass ein Skript den kostenlosen Plan des Anbieters aufbraucht) und die Ratenbegrenzung pro IP-Hash in der Route.
 */
export type Scope = "einordnung" | "text";

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  const n = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
  // Mit OpenRouter (kostenlose Modelle) gelten 50 Anfragen am Tag, fehlgeschlagene und Wiederholungen eingerechnet: 40 lässt Luft.
  const defaultCap = aiProvider(env) === "openrouter" ? 40 : 2000;
  return { perAccount: n(env.AI_ACCOUNT_DAILY, 5), global: n(env.AI_DAILY_CAP, defaultCap) };
}

/**
 * Reserviert eine Anfrage. Bei «einordnung» erst das Tageslimit der Adresse, dann das globale Tageslimit; bei «text» nur das globale.
 * Fällt Redis aus, geht die Anfrage durch.
 */
export async function takeSlot(store: AiStore | null, acchash: string | null, limits: Limits, now = new Date(), scope: Scope = "einordnung"): Promise<Slot> {
  if (!store) return "ok";
  const day = dayKey(now);
  const mine = scope === "einordnung" && acchash ? keys.ai(acchash, day) : null;
  try {
    if (mine && (await store.incr(mine, TTL.daily)) > limits.perAccount) {
      await store.decr(mine); // abgelehnte Anfragen zählen nicht weiter
      return "account_limit";
    }
    if ((await store.incr(keys.aiGlobal(day), TTL.daily)) > limits.global) {
      await store.decr(keys.aiGlobal(day));
      if (mine) await store.decr(mine);
      return "capacity";
    }
    return "ok";
  } catch {
    return "ok";
  }
}

/** Bucht einen reservierten Platz zurück, wenn kein Ergebnis entstanden ist (Modellfehler, verworfene Antwort). */
export async function releaseSlot(store: AiStore | null, acchash: string | null, now = new Date(), scope: Scope = "einordnung"): Promise<void> {
  if (!store) return;
  const day = dayKey(now);
  try {
    if (scope === "einordnung" && acchash) await store.decr(keys.ai(acchash, day));
    await store.decr(keys.aiGlobal(day));
  } catch {
    /* Rückbuchung ist Komfort */
  }
}

/**
 * Meldet höchstens einmal am Tag, dass die Tagesgrenze der KI erreicht ist: ein Aufruf an ALERT_WEBHOOK_URL (n8n schickt daraus eine Mail).
 * Ohne die Variable oder ohne Redis tut es nichts. Es wirft nie und blockiert die Antwort an den Besucher nicht länger als 5 Sekunden.
 * Im Aufruf stehen nur Datum, Grenze und Anbieter, nie Eingaben oder Adressen.
 */
export async function notifyCapacity(
  store: AiStore | null,
  limits: Limits,
  now = new Date(),
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  const url = env.ALERT_WEBHOOK_URL;
  if (!store || !url) return false;
  const day = dayKey(now);
  try {
    if ((await store.incr(keys.aiAlert(day), TTL.daily)) !== 1) return false;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "ki_tageslimit", datum: day, limit: limits.global, anbieter: aiProvider(env) }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
