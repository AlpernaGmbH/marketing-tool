import { parseTextResponse, type TextOutcome } from "./logic";
import type { Anrede } from "./styles";

// Browser-Seite von /api/text. Die Funktion wirft nie: Jeder Fehler wird zu einem Grund, den die Oberfläche in einen
// ruhigen Satz übersetzt (parseTextResponse). Der Text wird nur an diese eine Route geschickt und nicht zwischengespeichert.

/** Die Route darf 45 Sekunden brauchen (maxDuration); der Browser wartet etwas länger. */
const TIMEOUT_MS = 50_000;

export async function requestRewrite(
  input: { text: string; styleId: string; anrede: Anrede },
  fetchImpl: typeof fetch = fetch,
): Promise<TextOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: input.text, style: input.styleId, anrede: input.anrede }),
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
  return parseTextResponse(res.status, data);
}
