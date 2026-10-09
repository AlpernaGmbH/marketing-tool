import type { AccessStore } from "@/lib/access";

/** Genau diese Felder gehen an n8n, sonst nichts (CLAUDE.md, Zugang v3). Name und Telefon bleiben leer; das CRM kennt die Spalten. */
export type LeadPayload = {
  name: string;
  firma: string;
  email: string;
  telefon: string;
  tool: string;
  kategorie: string;
  quelle: "tools.alperna.ch";
  zeit: string;
  eingabe: string;
  ausgabe: string;
  /** Hat die Person eingewilligt, dass Alperna sie zum Ergebnis kontaktiert? Ohne «ja» meldet sich Alperna nicht von sich aus. */
  einwilligung: "ja" | "nein";
  /**
   * «ja»: Für diese Adresse hat Alperna schon eine Mail «neuer Lead» bekommen; n8n legt den Eintrag in Notion an, schickt aber keine Mail.
   * «nein»: erste Meldung dieser Adresse, n8n schickt die Mail. Fällt die Prüfung aus, steht «nein» (lieber doppelt als verloren).
   */
  bekannt: "ja" | "nein";
};

/** Mehr passt nicht in ein Textfeld bei Notion (2'000 Zeichen); der Rest wird abgeschnitten und markiert. */
export const CLIP_CHARS = 1900;

export function clipText(text: string, max = CLIP_CHARS): string {
  const t = text.replace(/\r\n?/g, "\n").trim();
  return t.length <= max ? t : `${t.slice(0, max - 2).trimEnd()} …`;
}

export type ResultLead = { email: string; consent: boolean; /** Adresse schon bekannt (siehe LeadPayload.bekannt); Standard: nein. */ known?: boolean; firma?: string; tool: string; eingabe: string; ausgabe: string };

export function buildPayload(input: ResultLead, kategorie: string, now = new Date()): LeadPayload {
  return {
    name: "",
    firma: input.firma?.trim() ?? "",
    email: input.email,
    telefon: "",
    tool: input.tool,
    kategorie,
    quelle: "tools.alperna.ch",
    zeit: now.toISOString(),
    eingabe: clipText(input.eingabe),
    ausgabe: clipText(input.ausgabe),
    einwilligung: input.consent ? "ja" : "nein",
    bekannt: input.known ? "ja" : "nein",
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
 * Gibt den Lead an n8n weiter. Fällt n8n aus, kommt er in lead_queue und wird vom Cron (`/api/cron/leads`) nachgeholt.
 * Der Besucher sieht sein Ergebnis in jedem Fall; «lost» heisst: weder n8n noch Redis waren erreichbar.
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

/** `waiting`: unter den angeschauten Leads noch nicht gesendet. Mehr als `max` Leads gehen im nächsten Lauf weiter. */
export type DrainResult = { sent: number; waiting: number; invalid: number };

/**
 * Schickt wartende Leads der Reihe nach an n8n. Beim ersten Fehler wird abgebrochen (n8n ist dann noch nicht wieder
 * da). Abgeholte Leads fallen aus der Warteschlange, die übrigen bleiben für den nächsten Lauf. Ein Lead, der nach
 * dem Versand nicht entfernt werden kann, würde doppelt ankommen; das nehmen wir in Kauf («lieber doppelt als verloren»).
 */
export async function drainLeads(store: AccessStore, fetchImpl: typeof fetch = fetch, max = 50): Promise<DrainResult> {
  const items = await store.peekLeads(max);
  let done = 0;
  let sent = 0;
  let invalid = 0;
  for (const json of items) {
    let payload: LeadPayload | null = null;
    try {
      const parsed = JSON.parse(json) as Partial<LeadPayload>;
      if (parsed && typeof parsed.email === "string" && typeof parsed.name === "string") payload = parsed as LeadPayload;
    } catch {
      /* unlesbar */
    }
    if (!payload) {
      invalid++; // nicht zustellbar, aber auch nicht liegen lassen: sonst blockiert er alle dahinter
      done++;
      continue;
    }
    if (!(await forwardToN8n(payload, fetchImpl))) break;
    sent++;
    done++;
  }
  await store.dropLeads(done);
  return { sent, waiting: items.length - done, invalid };
}

