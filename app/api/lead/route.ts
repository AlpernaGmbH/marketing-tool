import type { NextRequest } from "next/server";
import {
  clientIp,
  defaultStore,
  gateSecret,
  ipHash,
  readGateCookie,
  unlock,
  writeGateCookie,
} from "@/lib/access";
import { readJson, respond } from "@/lib/api";
import { buildPayload, deliverLead, leadSchema } from "@/lib/lead";
import { logStatus } from "@/lib/log";
import { withinLimit } from "@/lib/ratelimit";
import { getTool } from "@/lib/registry";

const ROUTE = "/api/lead";

export async function POST(req: NextRequest) {
  const parsed = leadSchema.safeParse(await readJson(req));
  if (!parsed.success) {
    const honeypotHit = parsed.error.issues.some((i) => i.path[0] === "honeypot");
    return respond(
      ROUTE,
      400,
      { error: "invalid_body", fields: parsed.error.issues.map((i) => String(i.path[0])) },
      honeypotHit ? "honeypot" : "invalid_body",
    );
  }
  const tool = getTool(parsed.data.tool);
  if (!tool) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");

  const secret = gateSecret();
  const hash = secret ? ipHash(clientIp(req.headers), secret) : null;
  if (hash && !(await withinLimit("lead", 5, "1 h", hash))) {
    return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");
  }

  const store = defaultStore();
  const payload = buildPayload(parsed.data, tool.category);

  // Der Besucher wird freigeschaltet, ob n8n antwortet oder nicht.
  // Fällt n8n aus, liegt der Lead in lead_queue und wird stündlich nachgeholt.
  const delivery = await deliverLead(store, payload);
  if (delivery !== "sent") logStatus(ROUTE, 200, delivery === "queued" ? "lead_queued" : "lead_lost");

  if (!secret || !hash) {
    return respond(ROUTE, 200, { ok: true }, "gate_unconfigured");
  }
  const state = await unlock(store, hash, readGateCookie(req, secret));
  const res = respond(ROUTE, 200, { ok: true });
  writeGateCookie(res, state, secret);
  return res;
}
