import type { NextRequest } from "next/server";
import { clearGateCookie, gateSecret, readGateCookie } from "@/lib/access";
import { respond } from "@/lib/api";

// Zugang v3: Das Cookie mt_gate ist HttpOnly, der Browser kann es nicht lesen. Zwei kleine Wege, damit der lokale Merker
// der Adresse (mt:_lead) und das Cookie nicht auseinanderlaufen:
//  - GET: Welche Adresse kennt der Server? Der Browser stellt damit den Merker wieder her, wenn er ihn verloren hat
//    (Safari räumt lokale Daten nach einigen Tagen ohne Besuch ab; «Alles löschen» entfernt ihn). Sonst fragte jedes Werkzeug
//    nach der Adresse, obwohl das Cookie noch ein Jahr gilt. Die Antwort enthält nur die Adresse des Besuchers selbst.
//  - DELETE: «Alles löschen» im Profil entfernt auch das Cookie. Danach fragt das nächste Ergebnis wieder nach einer Adresse.
// Geloggt wird nur der Statuscode (Harte Regel 1).

const ROUTE = "/api/gate";

export async function GET(req: NextRequest) {
  const secret = gateSecret();
  const gate = secret ? readGateCookie(req, secret) : null;
  return respond(ROUTE, 200, { email: gate?.email ?? null });
}

export async function DELETE() {
  const res = respond(ROUTE, 200, { ok: true });
  clearGateCookie(res);
  return res;
}
