import { generateText, Output } from "ai";
import { SYSTEM_PROMPT, einordnungSchema, userPrompt, type Fakten } from "@/lib/check/ai";
import { parseJsonObject } from "@/lib/generator";

// Aufruf der KI. Drei Wege, gewählt mit AI_PROVIDER (siehe aiProvider):
//  1. OpenRouter (Standard, sobald OPENROUTER_API_KEY gesetzt ist; seit 05.10.2026): kostenlose Modelle («:free»), ohne
//     Monatsgebühr. Grenzen: 20 Anfragen je Minute und 50 je Tag, ab 10 gekauften Credits 1'000 je Tag (openrouter.ai/docs/api-reference/limits).
//     Die Anbieter kostenloser Modelle dürfen Eingaben für das Training nutzen (docs/DATENSCHUTZ-FAKTEN.md). Modelle: OPENROUTER_MODELS.
//  2. Vercel AI Gateway (Rückfall ohne Schlüssel, und mit AI_PROVIDER=gateway): Auf Vercel meldet sich die Funktion per OIDC an,
//     es braucht gekauftes Guthaben («AI Gateway Credits»), zum Listenpreis des Anbieters ohne Aufschlag. Modelle: AI_MODELS.
//  3. Mistral direkt, nur mit AI_PROVIDER=mistral und MISTRAL_API_KEY: Mistral gibt im Plan «Free» keinen API-Zugriff mehr
//     (Meldung der Konsole am 05.10.2026) und der bezahlte Plan hat eine Monatsgebühr.
// Die Antwort der KI wird in jedem Fall geprüft, bevor sie jemand sieht (lib/check/ai.ts, lib/generator.ts, tools/text-umschreiber/logic.ts).
// Mistral Large 3 zuerst (Listenpreis 0,5 / 1,5 US-Dollar je Million Token Ein- und Ausgabe, rund 0,003 Dollar je Aufruf), bei Ausfall
// Claude Haiku 4.5 (1 / 5). Gewählt, weil das Monatsbudget bei 5 Franken liegt (Entscheid 56). Preise: ai-gateway.vercel.sh/v1/models,
// 05.10.2026. Für höhere Qualität AI_MODELS auf anthropic/claude-haiku-4.5 oder anthropic/claude-sonnet-5.5 (2 / 10) stellen.
export const DEFAULT_AI_MODELS = ["mistral/mistral-large-3", "anthropic/claude-haiku-4.5"];

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

// ---- Anbieter mit OpenAI-kompatibler Schnittstelle (Mistral direkt, OpenRouter) -------------------------------------

export type AiProvider = "openrouter" | "gateway" | "mistral";

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MISTRAL_MODELS = ["mistral-small-latest", "open-mistral-nemo"];
// Kostenlose Modelle von OpenRouter. Am 05.10.2026 mit den Anweisungen von drei Werkzeugen ausprobiert: Nemotron 3 Super und Ultra
// antworteten (ohne «Denken») gültig, aber knapp; Gemma 4 und Qwen 3.8 meldeten fast immer «upstream rate-limited» (429) und kosten dann
// keine der 50 Tagesanfragen. Die Liste geht darum der Reihe nach durch. OPENROUTER_MODELS überschreibt sie (bis zu fünf Einträge,
// der erste zuerst, auch bezahlte wie mistralai/mistral-large-2512 für bessere und längere Texte).
export const DEFAULT_OPENROUTER_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3.8-27b:free",
];

/** Mistral-Modelle aus MISTRAL_MODELS (kommagetrennt, erstes zuerst); ungültige Einträge fallen weg, leer gilt der Standard. */
export function mistralModelsFromEnv(raw: string | undefined = process.env.MISTRAL_MODELS): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[a-z0-9][a-z0-9._-]*$/i.test(m))
    .slice(0, 3);
  return list.length > 0 ? list : DEFAULT_MISTRAL_MODELS;
}

/** OpenRouter-Modelle aus OPENROUTER_MODELS (`anbieter/modell`, auch mit «:free», bis zu fünf); ungültige Einträge fallen weg, leer gilt der Standard. */
export function openrouterModelsFromEnv(raw: string | undefined = process.env.OPENROUTER_MODELS): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(m))
    .slice(0, 5);
  return list.length > 0 ? list : DEFAULT_OPENROUTER_MODELS;
}

/**
 * Der Schlüssel aus der Umgebung. Umgebungsvariablen unterscheiden Gross- und Kleinschreibung: Wer die Variable auf Vercel
 * klein geschrieben anlegt (mistral_api_key), bekäme sonst still den Weg über das Gateway und einen 403. Beide Schreibweisen gelten.
 */
export function mistralKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.MISTRAL_API_KEY || env.mistral_api_key || undefined;
}

/** Schlüssel von OpenRouter, gross oder klein geschrieben. */
export function openrouterKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.OPENROUTER_API_KEY || env.openrouter_api_key || undefined;
}

/**
 * Welcher Weg gilt? AI_PROVIDER nennt ihn ausdrücklich (openrouter, gateway, mistral). Ohne Angabe gilt OpenRouter, wenn ein Schlüssel
 * da ist, sonst das Gateway. Mistral direkt nur auf ausdrücklichen Wunsch: Ein vergessener Schlüssel soll nicht still den Weg ersetzen.
 * Fehlt zu einem genannten Weg der Schlüssel, gilt das Gateway.
 */
export function aiProvider(env: Record<string, string | undefined> = process.env): AiProvider {
  const want = env.AI_PROVIDER?.trim().toLowerCase();
  if (want === "gateway") return "gateway";
  if (want === "mistral") return mistralKey(env) ? "mistral" : "gateway";
  if ((want === "openrouter" || !want) && openrouterKey(env)) return "openrouter";
  return "gateway";
}

/** Läuft die KI über Mistral direkt? Nur auf ausdrücklichen Wunsch (AI_PROVIDER=mistral) und mit Schlüssel. */
export function usesMistral(env: Record<string, string | undefined> = process.env): boolean {
  return aiProvider(env) === "mistral";
}

/** Läuft die KI über OpenRouter? */
export function usesOpenrouter(env: Record<string, string | undefined> = process.env): boolean {
  return aiProvider(env) === "openrouter";
}

/** Fehler der Anbieter-Schnittstelle. Trägt nur Name und Statuscode, nie Text des Anbieters (kann Eingaben enthalten). */
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

type Endpoint = {
  label: "Mistral" | "OpenRouter";
  url: string;
  jsonMode: boolean;
  /** Zusätzliche Felder im Anfrage-Körper. */
  extra?: Record<string, unknown>;
  /** Fehlercodes, bei denen ein anderes Modell nichts nützt (falscher Schlüssel). Sonst geht es mit dem nächsten Modell weiter. */
  fatal: (status: number) => boolean;
};

async function chatOnce(ep: Endpoint, model: string, args: ChatArgs, key: string, fetchImpl: typeof fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(ep.url, {
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
        ...(args.json && ep.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...ep.extra,
      }),
      signal: AbortSignal.timeout(args.timeoutMs),
    });
  } catch (e) {
    throw new MistralError((e as { name?: string })?.name === "TimeoutError" ? `${ep.label}Timeout` : `${ep.label}NetworkError`);
  }
  if (!res.ok) throw new MistralError(`${ep.label}HttpError`, res.status);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new MistralError(`${ep.label}BadResponse`);
  }
  const text = contentText((data as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content).trim();
  if (!text) throw new MistralError(`${ep.label}EmptyError`);
  return text;
}

/** Eine Anfrage mit Rückfall auf das nächste Modell der Liste, wenn das erste ausfiel, zu langsam oder leer war (siehe `fatal`). */
async function chatWithFallback(ep: Endpoint, models: string[], args: ChatArgs, key: string, fetchImpl: typeof fetch): Promise<string> {
  let last: unknown;
  for (const model of models) {
    try {
      return await chatOnce(ep, model, args, key, fetchImpl);
    } catch (e) {
      last = e;
      const status = e instanceof MistralError ? e.statusCode : undefined;
      if (status !== undefined && ep.fatal(status)) break;
    }
  }
  throw last;
}

/** Eine Anfrage an Mistral (direkt, bezahlter Plan). */
export async function mistralChat(args: ChatArgs, fetchImpl: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<string> {
  const key = mistralKey(env);
  if (!key) throw new MistralError("MistralNoKey");
  // Bei Mistral direkt hilft ein anderes Modell nur bei Überlastung (429) und Serverfehlern; ein falscher Schlüssel oder eine falsche Anfrage bricht ab.
  const fatal = (status: number) => status !== 429 && status < 500;
  return chatWithFallback({ label: "Mistral", url: MISTRAL_URL, jsonMode: true, fatal }, mistralModelsFromEnv(env.MISTRAL_MODELS), args, key, fetchImpl);
}

/**
 * Eine Anfrage an OpenRouter.
 * - Ohne `response_format`: Nicht jeder Anbieter eines kostenlosen Modells unterstützt es, und OpenRouter antwortet dann mit 404
 *   «No endpoints found». Das JSON verlangt die Anweisung, gelesen wird es mit parseJsonObject.
 * - Mit `reasoning: { enabled: false }`: Modelle, die erst «denken», brauchten sonst die ganze Ausgabegrenze dafür und lieferten eine
 *   leere Antwort (am 05.10.2026 bei Nemotron 3 Super und Qwen 3.8 gemessen). Ein Modell, das das nicht erlaubt, antwortet mit 400:
 *   dann gilt das nächste.
 * - Ein anderes Modell hilft bei jedem Fehler ausser einem ungültigen Schlüssel (401).
 */
export async function openrouterChat(args: ChatArgs, fetchImpl: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<string> {
  const key = openrouterKey(env);
  if (!key) throw new MistralError("OpenRouterNoKey");
  const ep: Endpoint = { label: "OpenRouter", url: OPENROUTER_URL, jsonMode: false, extra: { reasoning: { enabled: false } }, fatal: (status) => status === 401 };
  return chatWithFallback(ep, openrouterModelsFromEnv(env.OPENROUTER_MODELS), args, key, fetchImpl);
}

export type GenerateRaw = (fakten: Fakten) => Promise<unknown>;

const EINORDNUNG_FORM = `Antworte ausschliesslich mit einem JSON-Objekt in genau dieser Form: {"zusammenfassung": "…", "prioritaeten": [{"schritt": "id aus schritte", "text": "…"}]}.`;

export const generateRaw: GenerateRaw = async (fakten) => {
  const provider = aiProvider();
  if (provider !== "gateway") {
    const chat = provider === "openrouter" ? openrouterChat : mistralChat;
    const text = await chat({ system: `${SYSTEM_PROMPT}\n${EINORDNUNG_FORM}`, prompt: userPrompt(fakten), maxTokens: 700, temperature: 0.3, json: true, timeoutMs: 25_000 });
    const value = parseJsonObject(text); // geprüft wird danach in pruefeEinordnung
    if (value === null) throw new MistralError("AiBadJson");
    return value;
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

/**
 * JSON-Objekt ohne festes Schema beim Anbieter: für die Generatoren (lib/generator.ts). Die Form prüft danach
 * checkGenerated; hier wird nur das Objekt aus der Antwort gelesen. Wirft bei Fehlern des Anbieters oder bei Antworten
 * ohne JSON (Fehlerart «AiBadJson», nie der Text).
 */
export type GenerateJson = (args: { system: string; prompt: string; maxOutputTokens: number; temperature?: number }) => Promise<unknown>;

export const generateJson: GenerateJson = async ({ system, prompt, maxOutputTokens, temperature = 0.4 }) => {
  let text: string;
  const provider = aiProvider();
  if (provider !== "gateway") {
    const chat = provider === "openrouter" ? openrouterChat : mistralChat;
    text = await chat({ system, prompt, maxTokens: maxOutputTokens, temperature, json: true, timeoutMs: 40_000 });
  } else {
    const [model, ...fallbacks] = modelsFromEnv();
    const out = await generateText({
      model,
      system,
      prompt,
      temperature,
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(40_000),
      maxRetries: 1,
      providerOptions: fallbacks.length > 0 ? { gateway: { models: fallbacks } } : undefined,
    });
    text = out.text;
  }
  const value = parseJsonObject(text);
  if (value === null) throw new MistralError("AiBadJson");
  return value;
};

/** Freier Text statt strukturierter Ausgabe: für Text-Umschreiber und Textcheck. Gleicher Weg wie die Einordnung (Mistral direkt oder Gateway). */
export type GenerateFreeText = (args: { system: string; prompt: string; maxOutputTokens: number }) => Promise<string>;

export const generateFreeText: GenerateFreeText = async ({ system, prompt, maxOutputTokens }) => {
  const provider = aiProvider();
  if (provider !== "gateway") {
    const chat = provider === "openrouter" ? openrouterChat : mistralChat;
    return chat({ system, prompt, maxTokens: maxOutputTokens, temperature: 0.5, timeoutMs: 30_000 });
  }
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
