import { authConfigured, getAccount } from "@/lib/auth";
import { respond } from "@/lib/api";
import { getRedis } from "@/lib/redis";

// Wer ist angemeldet? Für Kopfzeile und Profilseite. Antwortet nur der Person selbst (Sitzungs-Cookie) und
// nie mit mehr als Name und E-Mail. Geloggt wird nur der Statuscode.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/account";

export async function GET(req: Request) {
  const login = authConfigured() ? "google" : null;
  const account = login ? await getAccount(req.headers) : null;
  // storage: Daten beim Konto sind möglich (Redis ist verbunden). Davon hängen die Texte «gespeichert in deinem Konto» ab.
  return respond(ROUTE, 200, { login, account: account ? { name: account.name, email: account.email } : null, storage: getRedis() !== null });
}
