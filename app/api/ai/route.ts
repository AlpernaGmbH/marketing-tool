import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountHash, clientIp, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { budgetMode, cacheHash, defaultAiStore, limitsFromEnv, notifyCapacity, recordSpend, releaseSlot, spendCollector, spendLimitsFromEnv, takeSlot } from "@/lib/ai-quota";
import { describeAiError, generateRaw } from "@/lib/ai";
import { readJson, respond } from "@/lib/api";
import { buildFakten, pruefeEinordnung } from "@/lib/check/ai";
import { verifyResult } from "@/lib/check/sign";
import type { CheckResult } from "@/lib/check/types";
import { withinLimit } from "@/lib/ratelimit";

// KI-Einordnung zu einem Check-Ergebnis. Nur mit E-Mail-Adresse (Cookie mt_gate, Zugang v3), nur für Ergebnisse, die
// /api/check signiert hat, mit Tageslimit pro Person (HMAC der Adresse) und global und 24 Stunden Zwischenspeicher.
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
  // Erst die Adresse (403), dann die Signatur (400): ohne Adresse erzeugt die Route nie etwas, auch keine Prüfung.
  const gate = readGateCookie(req, secret);
  if (!gate) return respond(ROUTE, 403, { error: "gate" }, "gate_used");
  if (!verifyResult(result, secret)) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");
  const acchash = accountHash(gate.email, secret);

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("ai", 20, "1 h", hash))) return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");

  const store = defaultAiStore();
  const key = cacheHash(result.sig as string);
  try {
    const cached = store ? await store.getCache(key) : null;
    if (cached) return respond(ROUTE, 200, { ok: true, einordnung: JSON.parse(cached), cached: true }, "ai_cached");
  } catch {
    /* Zwischenspeicher nicht erreichbar: neu erzeugen */
  }

  const limits = limitsFromEnv();
  const slot = await takeSlot(store, acchash, limits);
  if (slot === "account_limit") return respond(ROUTE, 429, { error: "account_limit" }, "ai_limit");
  if (slot === "capacity") {
    await notifyCapacity(store, limits);
    return respond(ROUTE, 503, { error: "capacity" }, "ai_capacity");
  }

  const fakten = buildFakten(result);
  const mode = await budgetMode(store, acchash, spendLimitsFromEnv());
  if (mode === "global") await notifyCapacity(store, limits, new Date(), fetch, process.env, "ki_budget");
  const spend = spendCollector();
  let checked;
  try {
    checked = pruefeEinordnung(await generateRaw(fakten, { freeOnly: mode !== "paid", onUsage: spend.onUsage }), fakten);
  } catch (error) {
    await recordSpend(store, acchash, spend.total());
    await releaseSlot(store, acchash); // ohne Einordnung kein verbrauchter Platz
    return respond(ROUTE, 502, { error: "ai_failed" }, "ai_failed", describeAiError(error));
  }
  await recordSpend(store, acchash, spend.total());
  if (!checked.ok) {
    await releaseSlot(store, acchash);
    return respond(ROUTE, 502, { error: "ai_rejected" }, "ai_failed", `rejected:${checked.reason}`);
  }

  try {
    await store?.setCache(key, JSON.stringify(checked.value));
  } catch {
    /* Zwischenspeicher ist Komfort */
  }
  return respond(ROUTE, 200, { ok: true, einordnung: checked.value, cached: false }, "ai_ok");
}
