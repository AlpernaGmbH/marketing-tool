import type { PageRead } from "@/lib/read";

// Browser-Seite von /api/read. Wirft nie; jeder Fehler wird zu einem Grund mit einem ruhigen Satz.

export type ReadFailReason = "gate" | "invalid" | "unreachable" | "thin" | "rate" | "failed" | "network";
export type ReadOutcome = { ok: true; page: PageRead } | { ok: false; reason: ReadFailReason; message: string };

export const READ_FAIL_MESSAGES: Record<ReadFailReason, string> = {
  gate: "Wir brauchen deine E-Mail-Adresse, bevor wir deine Website lesen. Versuch es noch einmal.",
  invalid: "Bitte gib eine gültige Website-Adresse an.",
  unreachable: "Die Website konnte nicht geladen werden. Stimmt die Adresse?",
  thin: "Auf der Startseite steht kaum lesbarer Text. Beschreibe deinen Betrieb in den Feldern selbst.",
  rate: "Das waren viele Abrufe in kurzer Zeit. Warte etwas und versuch es noch einmal.",
  failed: "Die Website konnte nicht gelesen werden. Versuch es später noch einmal.",
  network: "Die Verbindung hat nicht geklappt. Prüfe dein Netz und versuch es noch einmal.",
};

const TIMEOUT_MS = 45_000;

function isPage(v: unknown): v is PageRead {
  const p = v as Partial<PageRead> | null;
  return typeof p === "object" && p !== null && typeof p.url === "string" && typeof p.host === "string" && typeof p.text === "string" && Array.isArray(p.headings);
}

export function parseReadResponse(status: number, data: unknown): ReadOutcome {
  const d = (typeof data === "object" && data !== null ? data : {}) as { ok?: unknown; page?: unknown; error?: unknown; message?: unknown };
  const message = typeof d.message === "string" ? d.message : null;
  if (status >= 200 && status < 300 && d.ok === true && isPage(d.page)) return { ok: true, page: d.page };
  const fail = (reason: ReadFailReason): ReadOutcome => ({ ok: false, reason, message: message ?? READ_FAIL_MESSAGES[reason] });
  if (status === 403) return fail("gate");
  if (status === 422 && d.error === "thin") return fail("thin");
  if (status === 429) return fail("rate");
  if (status === 400) return fail(d.error === "blocked" ? "unreachable" : "invalid");
  if (status === 502 && d.error === "unreachable") return fail("unreachable");
  return fail("failed");
}

export async function readWebsite(website: string, fetchImpl: typeof fetch = fetch): Promise<ReadOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ website }),
      credentials: "same-origin",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "network", message: READ_FAIL_MESSAGES.network };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* keine Details */
  }
  return parseReadResponse(res.status, data);
}
