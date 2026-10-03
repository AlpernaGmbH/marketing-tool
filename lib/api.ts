import { NextResponse } from "next/server";
import { logStatus, type LogNote } from "@/lib/log";

/** Liest JSON; null bei leerem oder ungültigem Body. */
export async function readJson(req: Request): Promise<unknown> {
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
