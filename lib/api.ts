import { NextResponse } from "next/server";
import { logStatus, type LogNote } from "@/lib/log";

/**
 * Liest JSON; null bei leerem oder ungültigem Body. Verlangt `application/json`: Eine fremde Seite kann ohne
 * Preflight nur text/plain oder Formular-Typen senden und könnte sonst Zähler fremder Besucher hochsetzen.
 */
export async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Antwort mit Statuscode-Log (ohne Inhalte). */
export function respond(route: string, status: number, body: unknown, note: LogNote = "ok"): NextResponse {
  logStatus(route, status, note);
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
