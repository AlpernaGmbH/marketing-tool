import { generateText, Output } from "ai";
import { SYSTEM_PROMPT, einordnungSchema, userPrompt, type Fakten } from "@/lib/check/ai";

// Aufruf der KI über das Vercel AI Gateway (Plan v2): kein eigener Schlüssel, auf Vercel meldet sich die Funktion
// per OIDC an. Das Gratisguthaben (5 Dollar im Monat) ist die harte Obergrenze. Reihenfolge der Modelle: das erste,
// bei Fehler (zum Beispiel nicht im Gratis-Kontingent) die nächsten. Welches Modell das beste Deutsch schreibt, zeigt
// der Test mit echten Checks. Standard: nur Mistral (Anbieter in der EU). Ein Modell von Alibaba (qwen3.5-flash) wäre
// billiger im Ausfall, schickt Betriebsname und Adresse aber an einen Anbieter in China; das entscheidet Alperna
// (STATUS.md, Entscheid 41) und setzt es dann mit AI_MODELS, ohne Code zu ändern.
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

export type GenerateRaw = (fakten: Fakten) => Promise<unknown>;

export const generateRaw: GenerateRaw = async (fakten) => {
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
