import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { defaultAiStore, limitsFromEnv, releaseSlot, takeSlot } from "@/lib/ai-quota";
import { describeAiError, generateJson } from "@/lib/ai";
import { readJson, respond } from "@/lib/api";
import { checkGenerated, systemPrompt } from "@/lib/generator";
import { withinLimit } from "@/lib/ratelimit";
import { getGenerator } from "@/tools/generators";

// Eine Route für alle Generatoren (Klasse B): {tool, input} → Entwurf als JSON. Welcher Prompt und welche Form gelten,
// steht in tools/<slug>/generator.ts. Zugang v3: Ergebnisse gibt es gegen eine E-Mail-Adresse (Cookie mt_gate).
// Schutz: Ratenbegrenzung pro IP-Hash und die globale Tagesgrenze (Bereich «text»), kein Limit pro Person.
// Geloggt werden nur Statuscode, Stichwort und Fehlerart, nie Eingaben oder Entwürfe (Harte Regel 1).
// Jede Antwort der KI wird geprüft (checkGenerated) und sonst verworfen; gespeichert wird nichts.
// Bei einem Fehler nennt die Antwort die Fehlerart («detail», zum Beispiel MistralHttpError:401 oder den Grund der Prüfung), nie Text des Anbieters
// und nie Eingaben: So lässt sich ein Ausfall auch ohne Zugang zu den Protokollen eingrenzen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/generate";

const bodySchema = z.object({
  tool: z.string().min(1).max(80),
  input: z.unknown(),
});

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");
  const def = getGenerator(body.data.tool);
  if (!def) return respond(ROUTE, 400, { error: "invalid_tool" }, "invalid_tool");
  const input = def.input.safeParse(body.data.input);
  if (!input.success) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 503, { error: "ai_disabled" }, "gate_unconfigured");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("generate", 20, "1 h", hash))) return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");

  if (!readGateCookie(req, secret)) return respond(ROUTE, 403, { error: "gate" }, "gate_used");

  const store = defaultAiStore();
  const slot = await takeSlot(store, null, limitsFromEnv(), new Date(), "text");
  if (slot === "capacity") return respond(ROUTE, 503, { error: "capacity" }, "ai_capacity");

  let raw: unknown;
  try {
    raw = await generateJson({ system: systemPrompt(def), prompt: def.prompt(input.data), maxOutputTokens: def.maxTokens, temperature: def.temperature });
  } catch (error) {
    await releaseSlot(store, null, new Date(), "text"); // ohne Entwurf kein verbrauchter Platz
    return respond(ROUTE, 502, { error: "ai_failed", detail: describeAiError(error) }, "ai_failed", describeAiError(error));
  }
  const checked = checkGenerated(def, raw, input.data);
  if (!checked.ok) {
    await releaseSlot(store, null, new Date(), "text");
    return respond(ROUTE, 502, { error: "ai_rejected", detail: checked.reason }, "ai_failed", `rejected:${checked.reason}`);
  }
  return respond(ROUTE, 200, { ok: true, output: checked.output }, "ai_ok");
}
