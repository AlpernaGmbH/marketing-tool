import type { Redis } from "@upstash/redis";
import { getRedis, keys, withTimeout } from "@/lib/redis";
import { LIMITS, isSyncKey } from "@/lib/sync-keys";

// Daten beim Konto (Zugang v3): Firmenprofil, Merkliste und Zwischenstände der Werkzeuge, auf jedem Gerät verfügbar.
// Ein Dokument je Konto in Redis (`data:<acchash>`, ohne Ablauf; der Besucher löscht es selbst). Der Server liest die
// Werte nie, er speichert und liefert sie. Geloggt werden nur Statuscodes.

/** Ein Wert mit Zeitpunkt der letzten Änderung. `value: null` heisst gelöscht (damit andere Geräte nachziehen). */
export type Entry = { value: string | null; at: number };
export type Entries = Record<string, Entry>;

export interface DataStore {
  get(acchash: string): Promise<Entries>;
  set(acchash: string, entries: Entries): Promise<void>;
  del(acchash: string): Promise<void>;
}

export function redisDataStore(redis: Redis): DataStore {
  return {
    async get(acchash) {
      const raw = await withTimeout(redis.get<unknown>(keys.accountData(acchash)));
      // Der Upstash-Client liest JSON-Texte als Objekte zurück; beides ist möglich.
      const doc = typeof raw === "string" ? safeParse(raw) : raw;
      return sanitizeStored(doc);
    },
    async set(acchash, entries) {
      await withTimeout(redis.set(keys.accountData(acchash), JSON.stringify({ v: 1, entries })));
    },
    async del(acchash) {
      await withTimeout(redis.del(keys.accountData(acchash)));
    },
  };
}

export function defaultDataStore(): DataStore | null {
  const redis = getRedis();
  return redis ? redisDataStore(redis) : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function sanitizeStored(doc: unknown): Entries {
  if (typeof doc !== "object" || doc === null) return {};
  const entries = (doc as { entries?: unknown }).entries;
  const result = checkEntries(entries);
  return result.ok ? result.entries : {};
}

export type CheckResult = { ok: true; entries: Entries } | { ok: false; reason: "invalid" | "too_large" };

/** Prüft Einträge vom Browser: erlaubte Schlüssel, JSON-Werte, Grössen. */
export function checkEntries(raw: unknown): CheckResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "invalid" };
  const out: Entries = {};
  let total = 0;
  const list = Object.entries(raw as Record<string, unknown>);
  if (list.length > LIMITS.maxKeys) return { ok: false, reason: "too_large" };
  for (const [key, e] of list) {
    if (!isSyncKey(key) || typeof e !== "object" || e === null) return { ok: false, reason: "invalid" };
    const { value, at } = e as { value?: unknown; at?: unknown };
    if (typeof at !== "number" || !Number.isFinite(at) || at < 0) return { ok: false, reason: "invalid" };
    if (value !== null && typeof value !== "string") return { ok: false, reason: "invalid" };
    if (typeof value === "string") {
      if (value.length > LIMITS.maxValueChars) return { ok: false, reason: "too_large" };
      if (!isJson(value)) return { ok: false, reason: "invalid" };
      total += value.length;
    }
    out[key] = { value, at: Math.floor(at) } as Entry;
  }
  if (total > LIMITS.maxTotalChars) return { ok: false, reason: "too_large" };
  return { ok: true, entries: out };
}

/** Führt zwei Stände zusammen: je Schlüssel gewinnt der neuere Zeitpunkt, bei Gleichstand der Server. */
export function mergeEntries(server: Entries, incoming: Entries): Entries {
  const merged: Entries = { ...server };
  for (const [key, entry] of Object.entries(incoming)) {
    const current = merged[key];
    if (!current || entry.at > current.at) merged[key] = entry;
  }
  return merged;
}

/** Gelöschte Einträge (value null) halten sich nur 60 Tage, damit das Dokument nicht ewig wächst. */
export function dropOldTombstones(entries: Entries, now = Date.now()): Entries {
  const limit = now - 60 * 24 * 60 * 60 * 1000;
  return Object.fromEntries(Object.entries(entries).filter(([, e]) => e.value !== null || e.at >= limit));
}

export function totalChars(entries: Entries): number {
  return Object.values(entries).reduce((n, e) => n + (e.value?.length ?? 0), 0);
}
