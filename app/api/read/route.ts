import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { readJson, respond } from "@/lib/api";
import { normalizeUrl } from "@/lib/check/analyze";
import { CheckError } from "@/lib/check/types";
import { MIN_READ_CHARS, readPage } from "@/lib/read";
import { withinLimit } from "@/lib/ratelimit";

// Liest den Text der Startseite des Besuchers (lib/read.ts) für Werkzeuge, die daraus einen Entwurf machen.
// Zugang v3: nur mit E-Mail-Adresse (Cookie mt_gate). Die Adresse und der Text werden nicht gespeichert und nicht
// geloggt (Harte Regel 1): nur Route, Statuscode, Stichwort.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

const ROUTE = "/api/read";

const bodySchema = z.object({ website: z.string().trim().min(1).max(300) });

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid", message: "Bitte gib eine Website an." }, "invalid_body");
  try {
    normalizeUrl(body.data.website);
  } catch (e) {
    return respond(ROUTE, 400, { error: "invalid", message: e instanceof CheckError ? e.message : "Bitte gib eine gültige Website an." }, "invalid_body");
  }

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 503, { error: "gate_unconfigured" }, "gate_unconfigured");
  const hash = ipHash(clientIp(req.headers), secret);
  // Die Route ruft fremde Server ab, darum ein enges Limit.
  if (!(await withinLimit("read", 10, "1 h", hash))) {
    return respond(ROUTE, 429, { error: "rate_limited", message: "Das waren viele Abrufe in kurzer Zeit. Bitte versuch es später wieder." }, "rate_limited");
  }
  if (!readGateCookie(req, secret)) return respond(ROUTE, 403, { error: "gate", message: "Bitte gib zuerst deine E-Mail-Adresse an." }, "gate_used");

  try {
    const page = await readPage(body.data.website);
    if (page.text.length < MIN_READ_CHARS) {
      return respond(
        ROUTE,
        422,
        { error: "thin", message: "Auf der Startseite steht kaum lesbarer Text. Oft lädt die Seite ihren Inhalt erst im Browser. Beschreibe deinen Betrieb in den Feldern selbst." },
        "read_thin",
      );
    }
    return respond(ROUTE, 200, { ok: true, page }, "read_ok");
  } catch (e) {
    if (e instanceof CheckError) {
      if (e.code === "blocked") return respond(ROUTE, 400, { error: "blocked", message: e.message }, "read_error");
      if (e.code === "invalid") return respond(ROUTE, 400, { error: "invalid", message: e.message }, "read_error");
      return respond(ROUTE, 502, { error: "unreachable", message: e.message }, "read_error");
    }
    return respond(ROUTE, 502, { error: "failed", message: "Die Website konnte nicht gelesen werden. Bitte versuch es später noch einmal." }, "read_error");
  }
}
