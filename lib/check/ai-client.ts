import type { Einordnung } from "@/lib/check/ai";
import type { CheckResult } from "@/lib/check/types";

// Browser-Seite von /api/ai. Die Funktion wirft nie: Jeder Fehler wird zu einem Grund, den die Oberfläche in einen
// ruhigen Satz übersetzt. Ohne Einordnung ist der Check trotzdem vollständig.

export type EinordnungReason = "not_signed_in" | "limit" | "capacity" | "failed";
export type EinordnungOutcome = { ok: true; einordnung: Einordnung } | { ok: false; reason: EinordnungReason };

/** Prüft die Antwort des Servers auf die erwartete Form, bevor sie im Browser gespeichert wird. */
export function parseEinordnung(raw: unknown): Einordnung | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as { zusammenfassung?: unknown; prioritaeten?: unknown };
  if (typeof r.zusammenfassung !== "string" || !r.zusammenfassung.trim() || !Array.isArray(r.prioritaeten)) return null;
  const prioritaeten: Einordnung["prioritaeten"] = [];
  for (const p of r.prioritaeten.slice(0, 3)) {
    if (typeof p !== "object" || p === null) return null;
    const { schritt, titel, text } = p as { schritt?: unknown; titel?: unknown; text?: unknown };
    if (typeof schritt !== "string" || typeof titel !== "string" || typeof text !== "string" || !text.trim()) return null;
    prioritaeten.push({ schritt, titel, text });
  }
  return { zusammenfassung: r.zusammenfassung, prioritaeten };
}

export async function fetchEinordnung(result: CheckResult, fetchImpl: typeof fetch = fetch): Promise<EinordnungOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result }),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, reason: "failed" };
  }

  let data: { error?: unknown; einordnung?: unknown } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* keine Details */
  }

  if (res.ok) {
    const einordnung = parseEinordnung(data.einordnung);
    return einordnung ? { ok: true, einordnung } : { ok: false, reason: "failed" };
  }
  // 403 «gate»: der Server kennt keine E-Mail-Adresse (Zugang v3). 401 bleibt aus Verträglichkeit mit älteren Antworten.
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "not_signed_in" };
  if (res.status === 429) return { ok: false, reason: data.error === "account_limit" ? "limit" : "failed" };
  if (res.status === 503 && data.error === "capacity") return { ok: false, reason: "capacity" };
  return { ok: false, reason: "failed" };
}

// Merker pro Browser-Tab: Ein Ergebnis, bei dem die Einordnung schon versucht wurde, wird beim Neuladen nicht von selbst
// noch einmal angefragt. Sonst löst jedes Neuladen bei einem Ausfall einen neuen Aufruf aus (Kosten, Kontingent).
// Der Knopf «Noch einmal versuchen» geht weiter.
const triedKey = (sig: string) => `mt:ai-tried:${sig.slice(0, 16)}`;

export function aiTried(sig: string): boolean {
  try {
    return window.sessionStorage.getItem(triedKey(sig)) === "1";
  } catch {
    return false;
  }
}

export function markAiTried(sig: string): void {
  try {
    window.sessionStorage.setItem(triedKey(sig), "1");
  } catch {
    /* ohne Speicher gibt es den Schutz vor Wiederholung nicht, mehr nicht */
  }
}

