import type { AccessStore } from "@/lib/access";
import type { LeadInput } from "@/lib/lead-schema";

export { leadSchema, type LeadInput } from "@/lib/lead-schema";

/** Genau diese Felder gehen an n8n, sonst nichts (CLAUDE.md, Harte Regel 1). */
export type LeadPayload = {
  name: string;
  firma: string;
  email: string;
  telefon: string;
  tool: string;
  kategorie: string;
  quelle: "tools.alperna.ch";
  zeit: string;
};

export function buildPayload(input: LeadInput, kategorie: string, now = new Date()): LeadPayload {
  return {
    name: input.name,
    firma: input.firma,
    email: input.email,
    telefon: input.telefon ?? "",
    tool: input.tool,
    kategorie,
    quelle: "tools.alperna.ch",
    zeit: now.toISOString(),
  };
}

/** POST an den n8n-Webhook, Timeout 5 s. true bei 2xx. */
export async function forwardToN8n(payload: LeadPayload, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type LeadDelivery = "sent" | "queued" | "lost";

/**
 * Gibt den Lead an n8n weiter. Fällt n8n aus, kommt er in lead_queue und wird stündlich nachgeholt.
 * Der Besucher wird in jedem Fall freigeschaltet; «lost» heisst: weder n8n noch Redis waren erreichbar.
 */
export async function deliverLead(store: AccessStore | null, payload: LeadPayload, fetchImpl: typeof fetch = fetch): Promise<LeadDelivery> {
  if (await forwardToN8n(payload, fetchImpl)) return "sent";
  if (store) {
    try {
      await store.pushLead(JSON.stringify(payload));
      return "queued";
    } catch {
      /* siehe unten */
    }
  }
  return "lost";
}
