import type { NextRequest } from "next/server";
import { z } from "zod";
import { canStart, clientIp, defaultStore, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { readJson, respond } from "@/lib/api";
import { withinLimit } from "@/lib/ratelimit";
import { getTool } from "@/lib/registry";

const ROUTE = "/api/access";
const bodySchema = z.object({ tool: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid_body" }, "invalid_body");
  if (!getTool(body.data.tool)) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");

  const secret = gateSecret();
  if (!secret) {
    // Ohne GATE_SECRET lässt sich weder zählen noch signieren. Wir sperren dann niemanden aus.
    return respond(ROUTE, 200, { allowed: true, unlocked: true, reason: "gate_disabled" }, "gate_unconfigured");
  }

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("access", 60, "1 m", hash))) {
    return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");
  }

  const decision = await canStart(defaultStore(), hash, readGateCookie(req, secret));
  return respond(ROUTE, 200, decision);
}
