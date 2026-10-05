import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { defaultAiStore, limitsFromEnv, notifyCapacity, releaseSlot, takeSlot } from "@/lib/ai-quota";
import { describeAiError, generateJson } from "@/lib/ai";
import { readJson, respond } from "@/lib/api";
import { checkGenerated, repairHint, systemPrompt } from "@/lib/generator";
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
  const limits = limitsFromEnv();
  const slot = await takeSlot(store, null, limits, new Date(), "text");
  if (slot === "capacity") {
    await notifyCapacity(store, limits);
    return respond(ROUTE, 503, { error: "capacity" }, "ai_capacity");
  }

  // Besteht der Entwurf die Prüfung nicht, bekommt dasselbe Modell die Rückmeldung und einen zweiten Versuch, danach antwortet das nächste Modell
  // der Liste (lib/ai.ts); der Grund der letzten Ablehnung bleibt für die Fehlermeldung.
  let lastReason: string | null = null;
  let lastRule: string | undefined;
  const accept = (value: unknown): true | string => {
    const outcome = checkGenerated(def, value, input.data);
    lastReason = outcome.ok ? null : outcome.reason;
    lastRule = outcome.ok ? undefined : outcome.detail;
    return outcome.ok ? true : repairHint(outcome.reason, outcome.detail);
  };
  let raw: unknown;
  try {
    raw = await generateJson({ system: systemPrompt(def), prompt: def.prompt(input.data), maxOutputTokens: def.maxTokens, temperature: def.temperature, accept });
  } catch (error) {
    await releaseSlot(store, null, new Date(), "text"); // ohne Entwurf kein verbrauchter Platz
    const kind = describeAiError(error);
    if (kind === "AiBadJson" && lastReason) return respond(ROUTE, 502, { error: "ai_rejected", detail: lastReason, ...(lastRule ? { rule: lastRule } : {}) }, "ai_failed", `rejected:${lastReason}${lastRule ? `:${lastRule}` : ""}`);
    return respond(ROUTE, 502, { error: "ai_failed", detail: kind }, "ai_failed", kind);
  }
  const checked = checkGenerated(def, raw, input.data);
  if (!checked.ok) {
    await releaseSlot(store, null, new Date(), "text");
    return respond(ROUTE, 502, { error: "ai_rejected", detail: checked.reason, ...(checked.detail ? { rule: checked.detail } : {}) }, "ai_failed", `rejected:${checked.reason}${checked.detail ? `:${checked.detail}` : ""}`);
  }
  return respond(ROUTE, 200, { ok: true, output: checked.output }, "ai_ok");
}
