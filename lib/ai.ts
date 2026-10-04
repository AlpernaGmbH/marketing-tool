import { generateText, Output } from "ai";
import { SYSTEM_PROMPT, einordnungSchema, userPrompt, type Fakten } from "@/lib/check/ai";

// Aufruf der KI. Zwei Wege:
//  1. MISTRAL_API_KEY gesetzt: direkt bei Mistral AI (Frankreich), im kostenlosen Plan «Experiment». Das ist der Standard,
//     weil der kostenlose Plan des Vercel AI Gateway nur eine kleine Auswahl an Modellen enthält und Mistral nicht dazugehört
//     (Stand 04.10.2026, vercel.com/ai-gateway/models?freeTier=true). Ohne bezahltes Guthaben scheitern die Anfragen dort.
//  2. Ohne Schlüssel: Vercel AI Gateway (kein eigener Schlüssel, auf Vercel meldet sich die Funktion per OIDC an) mit den
//     Modellen aus AI_MODELS. Das ist der Weg für bezahltes Guthaben oder für Modelle, die Alperna aus der Gratis-Liste wählt.
// Die Antwort der KI wird in jedem Fall geprüft, bevor sie jemand sieht (lib/check/ai.ts, tools/text-umschreiber/logic.ts).
export const DEFAULT_AI_MODELS = ["mistral/mistral-small", "mistral/mistral-nemo"];

/** Modellliste aus AI_MODELS (kommagetrennt, `anbieter/modell`); ungültige Einträge fallen weg, leer gilt der Standard. */
export function modelsFromEnv(raw: string | undefined = process.env.AI_MODELS): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/i.test(m))
    .slice(0, 4);
  return list.length > 0 ? list : DEFAULT_AI_MODELS;
}

/**
 * Beschreibt einen Fehler der KI-Schicht als kurze Fehlerart für das Protokoll, zum Beispiel
 * «RetryError>GatewayInternalServerError:500». Enthält nie die Meldung, weil die Texte der Anbieter Eingaben enthalten können.
 */
export function describeAiError(error: unknown, depth = 0): string {
  if (typeof error !== "object" || error === null) return "unbekannt";
  const e = error as { name?: unknown; statusCode?: unknown; lastError?: unknown; cause?: unknown; finishReason?: unknown };
  const name = typeof e.name === "string" && e.name ? e.name : "Error";
  const status = typeof e.statusCode === "number" ? `:${e.statusCode}` : "";
  const finish = typeof e.finishReason === "string" ? `:${e.finishReason}` : "";
  const inner = depth < 2 ? (e.lastError ?? e.cause) : undefined;
  return `${name}${status}${finish}${inner ? `>${describeAiError(inner, depth + 1)}` : ""}`;
}

// ---- Mistral direkt ---------------------------------------------------------------------------------------------

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
export const DEFAULT_MISTRAL_MODELS = ["mistral-small-latest", "open-mistral-nemo"];

/** Mistral-Modelle aus MISTRAL_MODELS (kommagetrennt, erstes zuerst); ungültige Einträge fallen weg, leer gilt der Standard. */
export function mistralModelsFromEnv(raw: string | undefined = process.env.MISTRAL_MODELS): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[a-z0-9][a-z0-9._-]*$/i.test(m))
    .slice(0, 3);
  return list.length > 0 ? list : DEFAULT_MISTRAL_MODELS;
}

/** Läuft die KI über Mistral direkt? */
export function usesMistral(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.MISTRAL_API_KEY);
}

/** Fehler der Mistral-Schnittstelle. Trägt nur Name und Statuscode, nie Text des Anbieters (kann Eingaben enthalten). */
export class MistralError extends Error {
  statusCode?: number;
  constructor(name: string, statusCode?: number) {
    super(name);
    this.name = name;
    this.statusCode = statusCode;
  }
}

type ChatArgs = { system: string; prompt: string; maxTokens: number; temperature: number; json?: boolean; timeoutMs: number };

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === "string" ? c : typeof (c as { text?: unknown })?.text === "string" ? (c as { text: string }).text : "")).join("");
  }
  return "";
}

async function mistralOnce(model: string, args: ChatArgs, key: string, fetchImpl: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(MISTRAL_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.prompt },
        ],
        temperature: args.temperature,
        max_tokens: args.maxTokens,
        ...(args.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch (e) {
    throw new MistralError((e as { name?: string })?.name === "TimeoutError" ? "MistralTimeout" : "MistralNetworkError");
  }
  if (!res.ok) throw new MistralError("MistralHttpError", res.status);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new MistralError("MistralBadResponse");
  }
  const text = contentText((data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content).trim();
  if (!text) throw new MistralError("MistralEmptyError");
  return text;
}

/**
 * Eine Anfrage an Mistral. Bei Überlastung (429), Serverfehler, Zeitüberschreitung oder leerer Antwort versucht es das nächste
 * Modell der Liste. Ein falscher Schlüssel oder eine falsche Anfrage (andere 4xx) hilft mit einem anderen Modell nicht: sofort Schluss.
 */
export async function mistralChat(args: ChatArgs, fetchImpl: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<string> {
  const key = env.MISTRAL_API_KEY;
  if (!key) throw new MistralError("MistralNoKey");
  let last: unknown;
  for (const model of mistralModelsFromEnv(env.MISTRAL_MODELS)) {
    try {
      return await mistralOnce(model, args, key, fetchImpl);
    } catch (e) {
      last = e;
      const status = e instanceof MistralError ? e.statusCode : undefined;
      if (status !== undefined && status !== 429 && status < 500) break;
    }
  }
  throw last;
}

export type GenerateRaw = (fakten: Fakten) => Promise<unknown>;

const EINORDNUNG_FORM = `Antworte ausschliesslich mit einem JSON-Objekt in genau dieser Form: {"zusammenfassung": "…", "prioritaeten": [{"schritt": "id aus schritte", "text": "…"}]}.`;

export const generateRaw: GenerateRaw = async (fakten) => {
  if (usesMistral()) {
    const text = await mistralChat({ system: `${SYSTEM_PROMPT}\n${EINORDNUNG_FORM}`, prompt: userPrompt(fakten), maxTokens: 700, temperature: 0.3, json: true, timeoutMs: 25_000 });
    try {
      return JSON.parse(text) as unknown; // geprüft wird danach in pruefeEinordnung
    } catch {
      throw new MistralError("MistralBadResponse");
    }
  }
  const [model, ...fallbacks] = modelsFromEnv();
  const { output } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: userPrompt(fakten),
    output: Output.object({
      name: "Einordnung",
      description: "Zusammenfassung und höchstens drei erklärte Schritte des Marketing-Checks",
      schema: einordnungSchema,
    }),
    temperature: 0.3,
    maxOutputTokens: 700,
    abortSignal: AbortSignal.timeout(25_000),
    // Ein Wiederholungsversuch genügt: Jeder weitere zählt im Gateway als eigene fehlgeschlagene Anfrage und verlängert die Wartezeit.
    maxRetries: 1,
    providerOptions: fallbacks.length > 0 ? { gateway: { models: fallbacks } } : undefined,
  });
  return output;
};

/** Freier Text statt strukturierter Ausgabe: für Text-Umschreiber und Textcheck. Gleicher Weg wie die Einordnung (Mistral direkt oder Gateway). */
export type GenerateFreeText = (args: { system: string; prompt: string; maxOutputTokens: number }) => Promise<string>;

export const generateFreeText: GenerateFreeText = async ({ system, prompt, maxOutputTokens }) => {
  if (usesMistral()) return mistralChat({ system, prompt, maxTokens: maxOutputTokens, temperature: 0.5, timeoutMs: 30_000 });
  const [model, ...fallbacks] = modelsFromEnv();
  const { text } = await generateText({
    model,
    system,
    prompt,
    temperature: 0.5,
    maxOutputTokens,
    abortSignal: AbortSignal.timeout(30_000),
    maxRetries: 1,
    providerOptions: fallbacks.length > 0 ? { gateway: { models: fallbacks } } : undefined,
  });
  return text;
};
