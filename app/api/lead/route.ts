import type { NextRequest } from "next/server";
import { clientIp, gateSecret, ipHash, writeGateCookie } from "@/lib/access";
import { readJson, respond } from "@/lib/api";
import { leadSchema } from "@/lib/lead-schema";
import { withinLimit } from "@/lib/ratelimit";
import { getTool } from "@/lib/registry";

// Zugang v3: Die Person gibt ihre E-Mail-Adresse an, bevor sie ein Ergebnis sieht. Die Adresse kommt signiert ins Cookie
// mt_gate; ins CRM geht sie erst zusammen mit einem Ergebnis (/api/result). Geloggt wird nur der Statuscode.

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
  if (!getTool(parsed.data.tool)) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 503, { error: "gate_unconfigured" }, "gate_unconfigured");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("lead", 10, "1 h", hash))) return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");

  const res = respond(ROUTE, 200, { ok: true });
  writeGateCookie(res, { email: parsed.data.email, iat: Math.floor(Date.now() / 1000), consent: parsed.data.consent }, secret);
  return res;
}
