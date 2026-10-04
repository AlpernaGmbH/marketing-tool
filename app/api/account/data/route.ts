import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, gateSecret, ipHash } from "@/lib/access";
import { requestAccount } from "@/lib/account";
import { LIMITS } from "@/lib/sync-keys";
import { checkEntries, defaultDataStore, dropOldTombstones, mergeEntries, totalChars, type DataStore } from "@/lib/account-data";
import { readJson, respond } from "@/lib/api";
import { withinLimit } from "@/lib/ratelimit";

// Daten beim Konto. Nur für die angemeldete Person selbst (Sitzung), die Kennung ist der Hash der E-Mail-Adresse.
// GET liefert den Stand, PUT schickt Änderungen und bekommt den zusammengeführten Stand zurück, DELETE löscht alles.
// Der Server liest die Werte nicht; geloggt werden nur Route und Statuscode.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/account/data";
const putSchema = z.object({ entries: z.record(z.string(), z.unknown()) });

type Gate = { ok: true; store: DataStore; acchash: string } | { ok: false; response: NextResponse };

async function gate(req: NextRequest): Promise<Gate> {
  const secret = gateSecret();
  const who = await requestAccount(secret);
  if (!secret || !who) return { ok: false, response: respond(ROUTE, 401, { error: "not_signed_in" }, "auth_error") };
  if (!(await withinLimit("account-data", 60, "1 m", ipHash(clientIp(req.headers), secret)))) {
    return { ok: false, response: respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited") };
  }
  const store = defaultDataStore();
  if (!store) return { ok: false, response: respond(ROUTE, 503, { error: "storage_unavailable" }, "redis_unavailable") };
  return { ok: true, store, acchash: who.acchash };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return g.response;
  try {
    return respond(ROUTE, 200, { ok: true, entries: await g.store.get(g.acchash) });
  } catch {
    return respond(ROUTE, 503, { error: "storage_unavailable" }, "redis_unavailable");
  }
}

export async function PUT(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return g.response;
  const body = putSchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");
  const checked = checkEntries(body.data.entries);
  if (!checked.ok) return respond(ROUTE, checked.reason === "too_large" ? 413 : 400, { error: checked.reason }, "invalid_body");
  try {
    const merged = dropOldTombstones(mergeEntries(await g.store.get(g.acchash), checked.entries));
    if (Object.keys(merged).length > LIMITS.maxKeys || totalChars(merged) > LIMITS.maxTotalChars) {
      return respond(ROUTE, 413, { error: "too_large" }, "invalid_body");
    }
    await g.store.set(g.acchash, merged);
    return respond(ROUTE, 200, { ok: true, entries: merged });
  } catch {
    return respond(ROUTE, 503, { error: "storage_unavailable" }, "redis_unavailable");
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return g.response;
  try {
    await g.store.del(g.acchash);
    return respond(ROUTE, 200, { ok: true, entries: {} });
  } catch {
    return respond(ROUTE, 503, { error: "storage_unavailable" }, "redis_unavailable");
  }
}
