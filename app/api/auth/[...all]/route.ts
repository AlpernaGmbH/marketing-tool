import { getAuth } from "@/lib/auth";
import { logStatus } from "@/lib/log";

// Anmeldung über Better Auth (Google). Ohne Einrichtung antwortet die Route mit 404.
// Geloggt wird nur der Statuscode (Harte Regel 1), nie Adresse, E-Mail oder Parameter.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/auth";

async function handle(req: Request): Promise<Response> {
  const auth = getAuth();
  if (!auth) {
    logStatus(ROUTE, 404, "auth_disabled");
    return Response.json({ error: "auth_disabled" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const res = await auth.handler(req);
  logStatus(ROUTE, res.status, res.status >= 400 ? "auth_error" : "ok");
  return res;
}

export { handle as GET, handle as POST };
