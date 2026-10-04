import type { z } from "zod";

// Browser-Seite von /api/generate. Die Funktion wirft nie: Jeder Fehler wird zu einem Grund, den die Oberfläche in einen
// ruhigen Satz übersetzt. Die Eingaben gehen nur an diese eine Route; der Entwurf wird im Browser mit dem Schema des
// Generators geprüft (dasselbe Schema wie auf dem Server), bevor das Werkzeug ihn zeigt.

export type GenerateFailReason = "gate" | "capacity" | "rate" | "failed" | "network" | "invalid";
export type GenerateOutcome<O> = { ok: true; output: O } | { ok: false; reason: GenerateFailReason };

/** Ein ruhiger Satz pro Grund. */
export const GENERATE_FAIL_MESSAGES: Record<GenerateFailReason, string> = {
  gate: "Wir brauchen deine E-Mail-Adresse, bevor wir den Entwurf zeigen. Versuch es noch einmal.",
  capacity: "Die KI ist heute ausgelastet. Bitte versuch es morgen noch einmal.",
  rate: "Das waren viele Anfragen in kurzer Zeit. Warte etwas und versuch es noch einmal.",
  failed: "Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.",
  network: "Die Verbindung hat nicht geklappt. Prüfe dein Netz und versuch es noch einmal.",
  invalid: "Bitte prüfe deine Angaben und versuch es noch einmal.",
};

/** Die Route darf 60 Sekunden brauchen (maxDuration); der Browser wartet etwas länger. */
const TIMEOUT_MS = 65_000;

/** Liest die Antwort der Route und prüft den Entwurf gegen das Schema des Generators. */
export function parseGenerateResponse<O>(status: number, data: unknown, output: z.ZodType<O>): GenerateOutcome<O> {
  const d = (typeof data === "object" && data !== null ? data : {}) as { ok?: unknown; output?: unknown; error?: unknown };
  if (status >= 200 && status < 300 && d.ok === true) {
    const parsed = output.safeParse(d.output);
    return parsed.success ? { ok: true, output: parsed.data } : { ok: false, reason: "failed" };
  }
  if (status === 400) return { ok: false, reason: "invalid" };
  if (status === 403) return { ok: false, reason: "gate" };
  if (status === 429) return { ok: false, reason: "rate" };
  if (status === 503 && d.error === "capacity") return { ok: false, reason: "capacity" };
  return { ok: false, reason: "failed" };
}

export async function requestGenerate<I, O>(def: { slug: string; output: z.ZodType<O> }, input: I, fetchImpl: typeof fetch = fetch): Promise<GenerateOutcome<O>> {
  let res: Response;
  try {
    res = await fetchImpl("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: def.slug, input }),
      credentials: "same-origin",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* keine Details */
  }
  return parseGenerateResponse(res.status, data, def.output);
}
