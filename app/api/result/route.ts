import type { NextRequest } from "next/server";
import { clientIp, defaultStore, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { readJson, respond } from "@/lib/api";
import { buildPayload, deliverLead } from "@/lib/lead";
import { resultSchema } from "@/lib/lead-schema";
import { withinLimit } from "@/lib/ratelimit";
import { getTool } from "@/lib/registry";

// Jedes Ergebnis geht mit der Adresse aus dem Cookie an Alperna: Werkzeug, Eingabe, Ausgabe (CLAUDE.md, Zugang v3).
// Ohne Cookie: 403, und der Browser zeigt das E-Mail-Fenster. Geloggt werden Statuscode und Stichwort, nie Inhalte.

const ROUTE = "/api/result";

export async function POST(req: NextRequest) {
  const parsed = resultSchema.safeParse(await readJson(req));
  if (!parsed.success) return respond(ROUTE, 400, { error: "invalid_body" }, "invalid_body");
  const tool = getTool(parsed.data.tool);
  if (!tool) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 503, { error: "gate_unconfigured" }, "gate_unconfigured");
  const gate = readGateCookie(req, secret);
  if (!gate) return respond(ROUTE, 403, { error: "gate" }, "gate_used");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("result", 30, "1 h", hash))) return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");

  const store = defaultStore();
  const payload = buildPayload({ email: gate.email, firma: parsed.data.firma, tool: tool.slug, eingabe: parsed.data.eingabe, ausgabe: parsed.data.ausgabe }, tool.category);
  const delivery = await deliverLead(store, payload);
  try {
    await store?.recordResult(tool.slug);
  } catch {
    /* Zähler ist Komfort */
  }
  return respond(ROUTE, 200, { ok: true }, delivery === "sent" ? "ok" : delivery === "queued" ? "lead_queued" : "lead_lost");
}
