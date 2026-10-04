import type { NextRequest } from "next/server";
import { canStart, clientIp, defaultStore, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { requestAccount } from "@/lib/account";
import { readJson, respond } from "@/lib/api";
import { analyze, normalizeUrl } from "@/lib/check/analyze";
import { signResult } from "@/lib/check/sign";
import { CheckError, checkInputSchema, type CheckEvent } from "@/lib/check/types";
import { logStatus } from "@/lib/log";
import { withinLimit } from "@/lib/ratelimit";

// Marketing-Check: ruft die Website des Besuchers ab und schickt Fortschritt und Ergebnis zeilenweise (NDJSON).
// Die Adresse und die Eingaben werden nicht gespeichert und nicht geloggt (Harte Regel 1): nur Route, Statuscode, Stichwort.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/check";

export async function POST(req: NextRequest) {
  const body = checkInputSchema.safeParse(await readJson(req));
  if (!body.success) {
    return respond(ROUTE, 400, { error: "invalid", message: body.error.issues[0]?.message ?? "Bitte prüfe deine Angaben." }, "invalid_body");
  }
  const input = body.data;
  try {
    normalizeUrl(input.website);
  } catch (e) {
    return respond(ROUTE, 400, { error: "invalid", message: e instanceof CheckError ? e.message : "Bitte gib eine gültige Website an." }, "invalid_body");
  }

  // Ohne GATE_SECRET lässt sich weder zählen noch signieren. Wir sperren dann niemanden aus (wie /api/access).
  const secret = gateSecret();
  if (secret) {
    const hash = ipHash(clientIp(req.headers), secret);
    // Der Check ruft fremde Server ab. Deshalb ein eigenes, engeres Limit als bei /api/access.
    if (!(await withinLimit("check", 8, "1 h", hash))) {
      return respond(ROUTE, 429, { error: "rate_limited", message: "Das waren viele Prüfungen in kurzer Zeit. Bitte versuche es später wieder." }, "rate_limited");
    }
    const who = await requestAccount(req.headers, secret);
    const decision = await canStart(defaultStore(), hash, readGateCookie(req, secret), who?.acchash ?? null);
    if (!decision.allowed) {
      return respond(ROUTE, 403, { error: "gate", message: "Dein freier Durchlauf ist verbraucht." }, "gate_used");
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: CheckEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // Besucher hat die Verbindung geschlossen
        }
      };
      try {
        const result = await analyze(input, {
          onStep: (id, state) => send({ type: "step", id, state }),
          gbp: { placesKey: process.env.GOOGLE_PLACES_API_KEY },
        });
        // Mit Signatur, damit /api/ai nur echte Ergebnisse annimmt. Ohne GATE_SECRET gibt es keine KI.
        send({ type: "result", result: secret ? signResult(result, secret) : result });
        logStatus(ROUTE, 200, "check_ok");
      } catch (e) {
        const err = e instanceof CheckError ? e : new CheckError("Der Check ist fehlgeschlagen. Bitte versuche es später noch einmal.", "failed");
        send({ type: "error", code: err.code, message: err.message });
        logStatus(ROUTE, 200, err.code === "blocked" ? "check_blocked" : "check_error");
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
