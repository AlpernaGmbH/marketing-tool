import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { Redis } from "@upstash/redis";
import { LEAD_QUEUE_MAX, TTL, getRedis, keys, withTimeout } from "@/lib/redis";

// Zugang v3 (Stand 04.10.2026): kein Konto. Wer ein Ergebnis will, gibt eine E-Mail-Adresse an. Sie steht signiert im
// Cookie mt_gate; jede Server-Route, die ein Ergebnis liefert oder weitergibt, verlangt dieses Cookie. In Redis liegt
// nichts über die Person, nur Zähler je Werkzeug und die Warteschlange der Leads, falls n8n nicht erreichbar ist.

export const GATE_COOKIE = "mt_gate";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // Sekunden
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Zustand im signierten Cookie mt_gate: die Adresse, die der Besucher angegeben hat. */
/** `consent`: Hat die Person eingewilligt, dass Alperna sie zum Ergebnis kontaktiert? Cookies aus der Zeit, als das Häkchen Pflicht war, tragen kein Feld und gelten als «ja». */
export type GateState = { email: string; iat: number; consent: boolean };

/**
 * Schmale Schnittstelle zu Redis. Jede Methode darf werfen; die Routen fangen das ab.
 * Ein Besucher wird nie wegen unserer Technik blockiert.
 */
export interface AccessStore {
  /** Zählt ein Ergebnis: popular:<slug> (Startseite «Meistgenutzt»). */
  recordResult(slug: string): Promise<void>;
  pushLead(json: string): Promise<void>;
  /** Die ältesten wartenden Leads (als JSON-Text), höchstens `max`. */
  peekLeads(max: number): Promise<string[]>;
  /** Entfernt die ältesten `count` Leads aus lead_queue (nach erfolgreichem Versand). */
  dropLeads(count: number): Promise<void>;
  /**
   * Merkt sich, dass für diese Adresse (HMAC, `accountHash`) die Mail «neuer Lead» ausgelöst wurde. true: erste Meldung dieser
   * Adresse in den letzten 365 Tagen; false: war schon bekannt. Atomar (SET NX), damit zwei Werkzeuge gleichzeitig nur eine Mail auslösen.
   */
  markKnown(acchash: string): Promise<boolean>;
}

export function gateSecret(): string | null {
  const s = process.env.GATE_SECRET;
  return s && s.length >= 16 ? s : null;
}

/**
 * Kennung einer Person für Kontingente: HMAC-SHA256 der E-Mail-Adresse (klein geschrieben) mit GATE_SECRET, auf 16 Byte
 * gekürzt. In Redis steht nie die Adresse selbst. Das Präfix trennt sie vom IP-Hash.
 */
export function accountHash(email: string, secret: string): string {
  return createHmac("sha256", secret).update(`acct:${email.trim().toLowerCase()}`).digest().subarray(0, 16).toString("hex");
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
    if (typeof s.email !== "string" || s.email.length > 254 || !EMAIL_RE.test(s.email) || typeof s.iat !== "number") return null;
    if (now / 1000 - s.iat > COOKIE_MAX_AGE) return null;
    return { email: s.email, iat: s.iat, consent: s.consent !== false };
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

/** Entfernt das Cookie (Profil, «Alles löschen»). */
export function clearGateCookie(res: NextResponse): void {
  res.cookies.set(GATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

/** AccessStore auf Upstash Redis. */
export function redisStore(redis: Redis): AccessStore {
  return {
    async recordResult(slug) {
      await withTimeout(redis.incr(keys.popular(slug)));
    },
    async peekLeads(max) {
      const list = await withTimeout(redis.lrange<unknown>(keys.leadQueue, 0, max - 1));
      // Der Upstash-Client liest JSON-Texte als Objekte zurück; hier wollen wir wieder den Text.
      return (list ?? []).map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    },
    async dropLeads(count) {
      if (count > 0) await withTimeout(redis.ltrim(keys.leadQueue, count, -1));
    },
    async markKnown(acchash) {
      const res = await withTimeout(redis.set(keys.known(acchash), "1", { nx: true, ex: TTL.known }));
      return res === "OK";
    },
    async pushLead(json) {
      // Personendaten im Klartext: Ablauf und Obergrenze, damit nichts unbegrenzt in Redis liegt, wenn n8n ausfällt.
      const p = redis.pipeline();
      p.rpush(keys.leadQueue, json);
      p.ltrim(keys.leadQueue, -LEAD_QUEUE_MAX, -1);
      p.expire(keys.leadQueue, TTL.leadQueue);
      await withTimeout(p.exec());
    },
  };
}

/** Redis-Store oder null, wenn Redis nicht konfiguriert ist. */
export function defaultStore(): AccessStore | null {
  const redis = getRedis();
  return redis ? redisStore(redis) : null;
}
