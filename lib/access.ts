import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Redis } from "@upstash/redis";
import { TTL, getRedis, keys, withTimeout } from "@/lib/redis";

export const GATE_COOKIE = "mt_gate";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // Sekunden

/** Zustand im signierten Cookie mt_gate. */
export type GateState = { runs: number; unlocked: boolean; iat: number };

export type AccessReason = "unlocked" | "free_run" | "free_run_used" | "gate_disabled";
export type AccessDecision = { allowed: boolean; unlocked: boolean; reason: AccessReason };

/** Was Redis über einen Besucher weiss. */
export type StoredState = { runs: number; unlocked: boolean };

/**
 * Schmale Schnittstelle zu Redis. Jede Methode darf werfen; die Funktionen unten
 * fangen das ab und werten dann nur das Cookie.
 */
export interface AccessStore {
  getState(iphash: string): Promise<StoredState>;
  /** Zählt einen abgeschlossenen Durchlauf: popular:<slug> immer, run:<iphash> nur wenn countRun. */
  recordCompletion(iphash: string, slug: string, countRun: boolean): Promise<void>;
  setUnlocked(iphash: string): Promise<void>;
  pushLead(json: string): Promise<void>;
}

export function gateSecret(): string | null {
  const s = process.env.GATE_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** HMAC-SHA256 der Client-IP mit GATE_SECRET, auf 16 Byte gekürzt (32 Hex-Zeichen). */
export function ipHash(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest().subarray(0, 16).toString("hex");
}

/** Erstes Element von x-forwarded-for; Vercel setzt den Header selbst. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}

const b64 = (buf: Buffer) => buf.toString("base64url");

function sign(payload: string, secret: string): string {
  return b64(createHmac("sha256", secret).update(payload).digest());
}

/** Cookie-Wert: base64url(JSON) + "." + base64url(HMAC). */
export function signGate(state: GateState, secret: string): string {
  const payload = b64(Buffer.from(JSON.stringify(state)));
  return `${payload}.${sign(payload, secret)}`;
}

/** Gibt den Zustand zurück oder null bei fehlender, manipulierter oder abgelaufener Signatur. */
export function verifyGate(value: string | undefined, secret: string, now = Date.now()): GateState | null {
  if (!value) return null;
  const [payload, sig, ...rest] = value.split(".");
  if (!payload || !sig || rest.length > 0) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<GateState>;
    if (
      typeof s.runs !== "number" ||
      !Number.isInteger(s.runs) ||
      s.runs < 0 ||
      typeof s.unlocked !== "boolean" ||
      typeof s.iat !== "number"
    ) {
      return null;
    }
    if (now / 1000 - s.iat > COOKIE_MAX_AGE) return null;
    return { runs: s.runs, unlocked: s.unlocked, iat: s.iat };
  } catch {
    return null;
  }
}

export function readGateCookie(req: NextRequest, secret: string): GateState | null {
  return verifyGate(req.cookies.get(GATE_COOKIE)?.value, secret);
}

export function writeGateCookie(res: NextResponse, state: GateState, secret: string): void {
  res.cookies.set(GATE_COOKIE, signGate(state, secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** Schreibt gebraucht/freigeschaltet aus Redis und Cookie zusammen. */
function merge(stored: StoredState | null, cookie: GateState | null): StoredState {
  return {
    runs: Math.max(stored?.runs ?? 0, cookie?.runs ?? 0),
    unlocked: Boolean(stored?.unlocked || cookie?.unlocked),
  };
}

async function readStored(store: AccessStore | null, iphash: string): Promise<StoredState | null> {
  if (!store) return null;
  try {
    return await store.getState(iphash);
  } catch {
    return null; // Redis nicht erreichbar: nur das Cookie gilt
  }
}

/**
 * Darf der Besucher ein Tool starten? Freigeschaltet, wer in Redis ODER Cookie
 * freigeschaltet ist. Gesperrt, wer in Redis ODER Cookie als gebraucht steht.
 */
export async function canStart(
  store: AccessStore | null,
  iphash: string,
  cookie: GateState | null,
): Promise<AccessDecision> {
  const state = merge(await readStored(store, iphash), cookie);
  if (state.unlocked) return { allowed: true, unlocked: true, reason: "unlocked" };
  if (state.runs === 0) return { allowed: true, unlocked: false, reason: "free_run" };
  return { allowed: false, unlocked: false, reason: "free_run_used" };
}

/** Zählt einen Durchlauf und gibt den neuen Cookie-Zustand zurück. */
export async function markComplete(
  store: AccessStore | null,
  iphash: string,
  slug: string,
  cookie: GateState | null,
  now = Date.now(),
): Promise<GateState> {
  const before = merge(await readStored(store, iphash), cookie);
  if (store) {
    try {
      // Für Freigeschaltete zählt run: nicht mehr, das spart Redis-Befehle im Free Tier.
      await store.recordCompletion(iphash, slug, !before.unlocked);
    } catch {
      /* Zähler ist Komfort, kein Grund zu blockieren */
    }
  }
  return {
    runs: Math.max(before.runs, cookie?.runs ?? 0) + 1,
    unlocked: before.unlocked,
    iat: Math.floor(now / 1000),
  };
}

/** Schaltet frei (Redis, soweit erreichbar) und gibt den neuen Cookie-Zustand zurück. */
export async function unlock(
  store: AccessStore | null,
  iphash: string,
  cookie: GateState | null,
  now = Date.now(),
): Promise<GateState> {
  if (store) {
    try {
      await store.setUnlocked(iphash);
    } catch {
      /* Cookie genügt */
    }
  }
  return { runs: cookie?.runs ?? 0, unlocked: true, iat: Math.floor(now / 1000) };
}

/** AccessStore auf Upstash Redis. */
export function redisStore(redis: Redis): AccessStore {
  return {
    async getState(iphash) {
      const [runs, unlocked] = await withTimeout(
        redis.mget<[number | null, number | string | null]>(keys.run(iphash), keys.unlocked(iphash)),
      );
      return { runs: Number(runs ?? 0), unlocked: unlocked !== null && unlocked !== undefined };
    },
    async recordCompletion(iphash, slug, countRun) {
      const p = redis.pipeline();
      p.incr(keys.popular(slug));
      if (countRun) {
        p.incr(keys.run(iphash));
        p.expire(keys.run(iphash), TTL.run, "NX");
      }
      await withTimeout(p.exec());
    },
    async setUnlocked(iphash) {
      await withTimeout(redis.set(keys.unlocked(iphash), 1, { ex: TTL.unlocked }));
    },
    async pushLead(json) {
      await withTimeout(redis.rpush(keys.leadQueue, json));
    },
  };
}

/** Redis-Store oder null, wenn Redis nicht konfiguriert ist. */
export function defaultStore(): AccessStore | null {
  const redis = getRedis();
  return redis ? redisStore(redis) : null;
}
