import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  clientIp,
  defaultStore,
  gateSecret,
  ipHash,
  markComplete,
  readGateCookie,
  writeGateCookie,
} from "@/lib/access";
import { readJson, respond } from "@/lib/api";
import { withinLimit } from "@/lib/ratelimit";
import { getTool } from "@/lib/registry";

const ROUTE = "/api/access/complete";
const bodySchema = z.object({ tool: z.string().min(1).max(80) });

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid_body" }, "invalid_body");
  if (!getTool(body.data.tool)) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 200, { ok: true, unlocked: true }, "gate_unconfigured");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("access", 60, "1 m", hash))) {
    return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");
  }

  const state = await markComplete(defaultStore(), hash, body.data.tool, readGateCookie(req, secret));
  const res = respond(ROUTE, 200, { ok: true, unlocked: state.unlocked });
  writeGateCookie(res, state, secret);
  return res;
}
