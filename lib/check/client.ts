import type { CheckErrorCode, CheckEvent, CheckInput, CheckResult, CheckStepId } from "@/lib/check/types";

// Browser-Seite von /api/check: sendet die Eingaben, liest den NDJSON-Stream und meldet Schritte und Ergebnis.
// Jeder Fehler wird zu einer verständlichen Meldung; die Funktion wirft nie.

export type CheckOutcome = { ok: true; result: CheckResult } | { ok: false; code: CheckErrorCode; message: string };

const FAILED_MESSAGE = "Der Check ist fehlgeschlagen. Bitte versuche es später noch einmal.";
const FAILED: CheckOutcome = { ok: false, code: "failed", message: FAILED_MESSAGE };

function isEvent(v: unknown): v is CheckEvent {
  return typeof v === "object" && v !== null && typeof (v as { type?: unknown }).type === "string";
}

export async function runCheck(
  input: CheckInput,
  onStep: (id: CheckStepId, state: "start" | "done") => void,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, code: "failed", message: "Keine Verbindung. Bitte prüfe dein Netz und versuche es noch einmal." };
  }

  if (!res.ok) {
    let data: { error?: string; message?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* keine Details */
    }
    const code: CheckErrorCode = res.status === 403 ? "gate" : res.status === 429 ? "rate_limited" : res.status === 400 ? "invalid" : "failed";
    return { ok: false, code, message: data.message ?? FAILED_MESSAGE };
  }

  const reader = res.body?.getReader();
  if (!reader) return FAILED;

  const decoder = new TextDecoder();
  let buffer = "";
  const found: { outcome: CheckOutcome | null } = { outcome: null };

  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return; // unvollständige oder fremde Zeile ignorieren
    }
    if (!isEvent(event)) return;
    if (event.type === "step") onStep(event.id, event.state);
    else if (event.type === "result") found.outcome = { ok: true, result: event.result };
    else if (event.type === "error") found.outcome = { ok: false, code: event.code, message: event.message };
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handle(buffer + decoder.decode());
  } catch {
    return found.outcome ?? { ok: false, code: "failed", message: "Die Verbindung wurde unterbrochen. Bitte versuche es noch einmal." };
  }
  return found.outcome ?? FAILED;
}
