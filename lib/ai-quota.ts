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
  /** Zählt `amount` zum Zähler dazu (ganze Zahl) und gibt den neuen Stand zurück. Beim ersten Aufruf setzt es die Lebensdauer. */
  add(key: string, amount: number, ttl: number): Promise<number>;
  /** Liest einen Zähler (0, wenn es ihn nicht gibt). */
  read(key: string): Promise<number>;
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
    async add(key, amount, ttl) {
      const p = redis.pipeline();
      p.incrby(key, amount);
      p.expire(key, ttl, "NX");
      const [n] = await withTimeout(p.exec<[number, number]>());
      return Number(n);
    },
    async read(key) {
      const v = await withTimeout(redis.get<number | string | null>(key));
      return v === null || v === undefined ? 0 : Number(v) || 0;
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
  // Mit gekauftem Guthaben (ab 10 Credits) erlaubt OpenRouter 1'000 Anfragen am Tag; die Kosten begrenzt das Tagesbudget (spendLimitsFromEnv).
  const defaultCap = aiProvider(env) === "openrouter" ? 1000 : 2000;
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
  event: "ki_tageslimit" | "ki_budget" = "ki_tageslimit",
): Promise<boolean> {
  const url = env.ALERT_WEBHOOK_URL;
  if (!store || !url) return false;
  const day = dayKey(now);
  try {
    if ((await store.incr(keys.aiAlert(day, event === "ki_budget" ? "budget" : "limit"), TTL.daily)) !== 1) return false;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, datum: day, limit: event === "ki_budget" ? spendLimitsFromEnv(env).globalRp : limits.global, anbieter: aiProvider(env) }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- Tagesbudget in Rappen --------------------------------------------------------------------------------------------
// Beschluss vom 09.10.2026: Hat eine Adresse am Tag für 30 Rappen KI verbraucht, antworten nur noch kostenlose Modelle. Dasselbe
// gilt für alle Besucher, wenn das globale Tagesbudget (Standard CHF 5.-) erreicht ist. Gemessen wird mit `usage.cost` der Antworten
// (lib/ai.ts), abgelehnte Antworten und Wiederholungen eingerechnet. Niemand wird blockiert, die Antworten kommen nur vom Gratismodell.

/** 1 US-Dollar in Rappen (Annahme 1 USD = 0.80 CHF; Dollar-Kurs und Rappen nur zur Umrechnung des Budgets). */
export const RP_PER_USD = 80;
const MICRO = 1_000_000;

export type SpendLimits = { perAddressRp: number; globalRp: number };

export function spendLimitsFromEnv(env: Record<string, string | undefined> = process.env): SpendLimits {
  const n = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
  return { perAddressRp: n(env.AI_ADDRESS_DAILY_RP, 30), globalRp: n(env.AI_GLOBAL_DAILY_RP, 500) };
}

const rpToMicro = (rp: number) => Math.round((rp / RP_PER_USD) * MICRO);

/**
 * Welche Modelle antworten heute? «paid»: Es darf bezahlt werden. «address»: das Budget dieser Adresse ist aufgebraucht, «global»: das
 * Budget aller Besucher (nur kostenlose Modelle). Fällt Redis aus, gilt «paid» (kein Besucher wartet auf unsere Technik).
 */
export type BudgetMode = "paid" | "address" | "global";

export async function budgetMode(store: AiStore | null, acchash: string | null, limits: SpendLimits, now = new Date()): Promise<BudgetMode> {
  if (!store) return "paid";
  const day = dayKey(now);
  try {
    if ((await store.read(keys.aiCostGlobal(day))) >= rpToMicro(limits.globalRp)) return "global";
    if (acchash && (await store.read(keys.aiCost(acchash, day))) >= rpToMicro(limits.perAddressRp)) return "address";
    return "paid";
  } catch {
    return "paid";
  }
}

/** Bucht die Kosten eines Aufrufs (US-Dollar) auf die Adresse und auf den Tag. Wirft nie. */
export async function recordSpend(store: AiStore | null, acchash: string | null, costUsd: number, now = new Date()): Promise<void> {
  const micro = Math.round(costUsd * MICRO);
  if (!store || micro <= 0) return;
  const day = dayKey(now);
  try {
    await store.add(keys.aiCostGlobal(day), micro, TTL.daily);
    if (acchash) await store.add(keys.aiCost(acchash, day), micro, TTL.daily);
  } catch {
    /* Das Budget ist ein Schutz; ein Ausfall von Redis hält niemanden auf. */
  }
}

/** Fasst die Kosten mehrerer Antworten eines Aufrufs zusammen (US-Dollar). */
export function spendCollector(): { onUsage: (u: { costUsd: number }) => void; total: () => number } {
  let sum = 0;
  return { onUsage: (u) => void (sum += u.costUsd), total: () => sum };
}
