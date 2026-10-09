import type { NextRequest } from "next/server";
import { z } from "zod";
import { accountHash, clientIp, gateSecret, ipHash, readGateCookie } from "@/lib/access";
import { budgetMode, defaultAiStore, limitsFromEnv, notifyCapacity, recordSpend, releaseSlot, spendCollector, spendLimitsFromEnv, takeSlot } from "@/lib/ai-quota";
import { describeAiError, generateFreeText } from "@/lib/ai";
import { readJson, respond } from "@/lib/api";
import { withinLimit } from "@/lib/ratelimit";
import { buildSystemPrompt, buildUserPrompt, checkOutput, inputProblem, MAX_INPUT_CHARS, outputHint } from "@/tools/text-umschreiber/logic";
import { STYLE_IDS, getStyle } from "@/tools/text-umschreiber/styles";

// Schreibt den Text des Besuchers im gewählten Stil neu (Text-Umschreiber). Die KI-Prüfung des Textchecks läuft seit 09.10.2026 über /api/generate.
// Zugang v3: Ergebnisse gibt es gegen eine E-Mail-Adresse (Cookie mt_gate). Als Schutz vor Missbrauch dienen die
// Ratenbegrenzung pro IP-Hash und die globale Tagesgrenze, nicht ein Limit pro Person.
// Geloggt werden nur Statuscode und Stichwort, nie der Text (Harte Regel 1). Die Antwort der KI wird nie ungeprüft
// weitergegeben (checkOutput) und nirgends gespeichert.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const ROUTE = "/api/text";

const bodySchema = z.object({
  text: z.string().max(MAX_INPUT_CHARS),
  style: z.enum(STYLE_IDS),
  anrede: z.enum(["du", "sie", "wie-im-text"]),
});

export async function POST(req: NextRequest) {
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");
  const { text, style: styleId, anrede } = body.data;
  const style = getStyle(styleId);
  if (!style || inputProblem(text, styleId)) return respond(ROUTE, 400, { error: "invalid" }, "invalid_body");

  const secret = gateSecret();
  if (!secret) return respond(ROUTE, 503, { error: "ai_disabled" }, "gate_unconfigured");

  const hash = ipHash(clientIp(req.headers), secret);
  if (!(await withinLimit("text", 30, "1 h", hash))) return respond(ROUTE, 429, { error: "rate_limited" }, "rate_limited");

  const gate = readGateCookie(req, secret);
  if (!gate) return respond(ROUTE, 403, { error: "gate" }, "gate_used");
  const acchash = accountHash(gate.email, secret);

  const store = defaultAiStore();
  const limits = limitsFromEnv();
  const slot = await takeSlot(store, null, limits, new Date(), "text");
  if (slot === "capacity") {
    await notifyCapacity(store, limits);
    return respond(ROUTE, 503, { error: "capacity" }, "ai_capacity");
  }
  // Tagesbudget: Ist es aufgebraucht, antworten nur kostenlose Modelle (lib/ai-quota.ts).
  const mode = await budgetMode(store, acchash, spendLimitsFromEnv());
  if (mode === "global") await notifyCapacity(store, limits, new Date(), fetch, process.env, "ki_budget");
  const spend = spendCollector();
  // Eine leere, zu kurze, abgelehnte oder unveränderte Antwort geht mit einem Hinweis zurück an dasselbe Modell (zweiter Versuch), danach ans nächste.
  const acceptText = (raw: string): true | string => {
    const c = checkOutput(raw, text, style);
    return c.ok ? true : outputHint(c.reason, style);
  };

  let checked;
  try {
    const raw = await generateFreeText({ system: buildSystemPrompt(style, anrede), prompt: buildUserPrompt(text), maxOutputTokens: style.maxTokens, freeOnly: mode !== "paid", onUsage: spend.onUsage, accept: acceptText });
    checked = checkOutput(raw, text, style);
  } catch (error) {
    await recordSpend(store, acchash, spend.total());
    await releaseSlot(store, null, new Date(), "text"); // ohne Text kein verbrauchter Platz
    return respond(ROUTE, 502, { error: "ai_failed" }, "ai_failed", describeAiError(error));
  }
  await recordSpend(store, acchash, spend.total());
  if (!checked.ok) {
    await releaseSlot(store, null, new Date(), "text");
    return respond(ROUTE, 502, { error: "ai_rejected" }, "ai_failed", `rejected:${checked.reason}`);
  }

  return respond(ROUTE, 200, { ok: true, text: checked.text, warnings: checked.warnings }, "ai_ok");
}
