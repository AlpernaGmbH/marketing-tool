import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { defaultStore } from "@/lib/access";
import { respond } from "@/lib/api";
import { drainLeads } from "@/lib/lead";

// Täglicher Lauf (vercel.json): Leads, die n8n nicht annehmen konnte, liegen in lead_queue. Hier gehen sie nach.
// Vercel ruft die Route mit «Authorization: Bearer <CRON_SECRET>» auf. Geloggt werden nur Statuscode und Stichwort.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/cron/leads";

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function GET(req: NextRequest) {
  if (!authorized(req.headers.get("authorization"))) return respond(ROUTE, 401, { error: "unauthorized" }, "auth_error");
  const store = defaultStore();
  if (!store) return respond(ROUTE, 200, { ok: true, skipped: "redis" }, "redis_unavailable");
  try {
    const result = await drainLeads(store);
    return respond(ROUTE, 200, { ok: true, ...result }, result.sent > 0 ? "lead_drained" : "ok");
  } catch {
    return respond(ROUTE, 200, { ok: false }, "redis_unavailable");
  }
}
