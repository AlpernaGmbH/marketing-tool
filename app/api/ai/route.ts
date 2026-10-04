import type { NextRequest } from "next/server";
import { z } from "zod";
import { canStart, clientIp, defaultStore, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { requestAccount } from "@/lib/account";
import { cacheHash, defaultAiStore, limitsFromEnv, takeSlot } from "@/lib/ai-quota";
import { generateRaw } from "@/lib/ai";
import { readJson, respond } from "@/lib/api";
import { buildFakten, pruefeEinordnung } from "@/lib/check/ai";
import { verifyResult } from "@/lib/check/sign";
import type { CheckResult } from "@/lib/check/types";
import { withinLimit } from "@/lib/ratelimit";

// KI-Einordnung zu einem Check-Ergebnis. Nur für angemeldete, freigeschaltete Personen, nur für Ergebnisse, die
// /api/check signiert hat, mit Tageslimit pro Konto und global und 24 Stunden Zwischenspeicher.
// Geloggt werden nur Statuscode und Stichwort, nie Betriebsname, Adresse oder Text der KI (Harte Regel 1).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const ROUTE = "/api/ai";

const bodySchema = z.object({
  result: z
    .object({
      v: z.literal(1),
      company: z.string(),
      city: z.string(),
      url: z.string(),
      industryLabel: z.string(),
      score: z.number(),
      categories: z.array(z.object({}).passthrough()),
      massnahmen: z.array(z.object({}).passthrough()),
      sig: z.string().min(1),
    })
    .passthrough(),
});

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");
  const result = body.data.result as unknown as CheckResult;

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 503, { error: "ai_disabled" }, "gate_unconfigured");
  if (!verifyResult(result, secret)) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");

  const who = await requestAccount(req.headers, secret);
  if (!who) return respond(ROUTE, 401, { error: "not_signed_in" }, "auth_error");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("ai", 20, "1 h", hash))) return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");

  const decision = await canStart(defaultStore(), hash, readGateCookie(req, secret), who.acchash);
  if (!decision.unlocked) return respond(ROUTE, 403, { error: "gate" }, "gate_used");

  const store = defaultAiStore();
  const key = cacheHash(result.sig as string);
  try {
    const cached = store ? await store.getCache(key) : null;
    if (cached) return respond(ROUTE, 200, { ok: true, einordnung: JSON.parse(cached), cached: true }, "ai_cached");
  } catch {
    /* Zwischenspeicher nicht erreichbar: neu erzeugen */
  }

  const slot = await takeSlot(store, who.acchash, limitsFromEnv());
  if (slot === "account_limit") return respond(ROUTE, 429, { error: "account_limit" }, "ai_limit");
  if (slot === "capacity") return respond(ROUTE, 503, { error: "capacity" }, "ai_capacity");

  const fakten = buildFakten(result);
  let checked;
  try {
    checked = pruefeEinordnung(await generateRaw(fakten), fakten);
  } catch {
    return respond(ROUTE, 502, { error: "ai_failed" }, "ai_failed");
  }
  if (!checked.ok) return respond(ROUTE, 502, { error: "ai_rejected" }, "ai_failed");

  try {
    await store?.setCache(key, JSON.stringify(checked.value));
  } catch {
    /* Zwischenspeicher ist Komfort */
  }
  return respond(ROUTE, 200, { ok: true, einordnung: checked.value, cached: false }, "ai_ok");
}
