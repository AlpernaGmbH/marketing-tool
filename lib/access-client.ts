// Browser-seitige Helfer für /api/lead und /api/result. Keine Funktion wirft.

import type { LeadInput } from "@/lib/lead-schema";

/** Lokaler Merker der angegebenen Adresse (nur für die Anzeige; was gilt, entscheidet das Cookie des Servers). */
export const LEAD_KEY = "mt:_lead";

type Reply = { ok: boolean; status: number };

async function postJson(path: string, body: unknown, fetchImpl: typeof fetch): Promise<Reply | null> {
  try {
    const res = await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    // Den Body immer lesen: Eine Antwort, deren Body niemand liest, hält die Anfrage im Browser offen.
    try {
      await res.text();
    } catch {
      /* Inhalt ist nicht nötig */
    }
    return { ok: res.ok, status: res.status };
  } catch {
    return null;
  }
}

export type GateResult = { ok: true } | { ok: false; reason: "invalid" | "rate_limited" | "network" };

/** Gibt die Adresse an den Server; danach trägt der Browser das Cookie mt_gate. */
export async function submitEmail(input: LeadInput, fetchImpl: typeof fetch = fetch): Promise<GateResult> {
  const res = await postJson("/api/lead", input, fetchImpl);
  if (!res) return { ok: false, reason: "network" };
  if (res.ok) return { ok: true };
  if (res.status === 400) return { ok: false, reason: "invalid" };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "network" };
}

export type ResultBody = { tool: string; eingabe: string; ausgabe: string; firma?: string };
/** «gate»: der Server kennt keine Adresse (Cookie fehlt oder abgelaufen); dann das Fenster zeigen und noch einmal senden. */
export type ResultDelivery = "ok" | "gate" | "failed";

/** Schickt Werkzeug, Eingabe und Ausgabe an Alperna (CRM). */
export async function sendResult(body: ResultBody, fetchImpl: typeof fetch = fetch): Promise<ResultDelivery> {
  const res = await postJson("/api/result", body, fetchImpl);
  if (!res) return "failed";
  if (res.ok) return "ok";
  return res.status === 403 ? "gate" : "failed";
}

/** Welche Adresse kennt der Server (Cookie)? null: keine, oder der Server war nicht erreichbar. Wirft nie. */
export async function fetchGateEmail(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchImpl("/api/gate", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: unknown };
    return typeof data.email === "string" && data.email.includes("@") ? data.email : null;
  } catch {
    return null;
  }
}

/** Vergisst die Adresse auch beim Server (Cookie entfernen). Wirft nie. */
export async function forgetGateEmail(fetchImpl: typeof fetch = fetch): Promise<void> {
  await postLike("DELETE", fetchImpl);
}

async function postLike(method: "DELETE", fetchImpl: typeof fetch): Promise<void> {
  try {
    const res = await fetchImpl("/api/gate", { method, credentials: "same-origin" });
    await res.text().catch(() => "");
  } catch {
    /* ohne Verbindung bleibt das Cookie bis zum Ablauf; der lokale Merker ist trotzdem weg */
  }
}
