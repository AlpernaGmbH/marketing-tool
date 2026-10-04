import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, defaultStore, gateSecret, ipHash, readGateCookie, unlock, writeGateCookie } from "@/lib/access";
import { requestAccount } from "@/lib/account";
import { readJson, respond } from "@/lib/api";
import { buildPayload, deliverLead } from "@/lib/lead";
import { logStatus } from "@/lib/log";
import { withinLimit } from "@/lib/ratelimit";
import { getTool } from "@/lib/registry";

// Freischalten mit Konto: Name und E-Mail kommen aus der Google-Anmeldung, nicht aus dem Browser.
// Die Einwilligung hat der Besucher vor der Anmeldung im Fenster gegeben; sie steht hier als Pflichtfeld.

const ROUTE = "/api/lead/account";
const bodySchema = z.object({
  tool: z.string().min(1).max(80),
  consent: z.literal(true),
  firma: z.string().trim().max(160).optional(),
});

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid_body" }, "invalid_body");
  const tool = getTool(body.data.tool);
  if (!tool) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");

  const secret = gateSecret();
  const who = await requestAccount(req.headers, secret);
  if (!secret || !who) return respond(ROUTE, 401, { error: "not_signed_in" }, "auth_error");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("lead", 5, "1 h", hash))) {
    return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");
  }

  const store = defaultStore();
  // Ein Konto, das schon freigeschaltet ist, erzeugt keinen zweiten Lead (jede neue Anmeldung würde sonst einen anlegen).
  let known = false;
  try {
    known = store ? await store.isAccountUnlocked(who.acchash) : false;
  } catch {
    /* Redis nicht erreichbar: dann lieber ein doppelter Lead als ein verlorener */
  }
  if (!known) {
    const payload = buildPayload(
      { name: who.account.name, firma: body.data.firma ?? "", email: who.account.email, consent: true, tool: tool.slug },
      tool.category,
    );
    const delivery = await deliverLead(store, payload);
    if (delivery !== "sent") logStatus(ROUTE, 200, delivery === "queued" ? "lead_queued" : "lead_lost");
  }

  const state = await unlock(store, hash, readGateCookie(req, secret), Date.now(), who.acchash);
  const res = respond(ROUTE, 200, { ok: true, known }, known ? "ok" : "account_unlocked");
  writeGateCookie(res, state, secret);
  return res;
}
