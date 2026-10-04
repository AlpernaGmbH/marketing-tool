import { readLocal, removeLocal, writeLocal } from "@/lib/storage";

// Browser-Seite der Konto-Anmeldung. Die Einwilligung gibt der Besucher im Fenster, bevor er zu Google geht;
// weil die Anmeldung die Seite verlässt, merken wir uns Werkzeug und Einwilligung kurz im Browser.

const KEY = "mt:_konto";
/** Wie lange eine begonnene Anmeldung gilt. */
export const PENDING_MS = 15 * 60 * 1000;

export type Pending = { tool: string; firma?: string; at: number };

export function savePending(p: Omit<Pending, "at">, now = Date.now()): void {
  writeLocal(KEY, JSON.stringify({ ...p, at: now }));
}

export function readPending(now = Date.now()): Pending | null {
  try {
    const raw = readLocal(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pending>;
    if (typeof p.tool !== "string" || typeof p.at !== "number" || now - p.at > PENDING_MS || p.at > now + 60_000) return null;
    return { tool: p.tool, at: p.at, ...(typeof p.firma === "string" && p.firma ? { firma: p.firma } : {}) };
  } catch {
    return null;
  }
}

export function clearPending(): void {
  removeLocal(KEY);
}

/** Name des Abfrageparameters nach der Rückkehr von Google: «konto» (Freischalten im Werkzeug) oder «anmeldung» (Kopfzeile). */
export type ReturnParam = "konto" | "anmeldung";

/** Adresse der aktuellen Seite ohne Konto-Parameter, plus neuer Wert. Nur Pfad und Abfrage, nie fremde Hosts. */
export function returnPath(location: Pick<Location, "pathname" | "search">, value: "ok" | "fehler", param: ReturnParam = "konto"): string {
  const params = new URLSearchParams(location.search);
  params.delete("konto");
  params.delete("anmeldung");
  params.set(param, value);
  return `${location.pathname}?${params.toString()}`;
}

/**
 * Startet die Anmeldung bei Google (Weiterleitung). Gibt nur zurück, wenn etwas schiefging.
 * Die Bibliothek lädt erst beim Klick, damit sie die Seite nicht verlangsamt.
 */
export async function startGoogleSignIn(location: Pick<Location, "pathname" | "search">, param: ReturnParam = "konto"): Promise<boolean> {
  try {
    const { createAuthClient } = await import("better-auth/client");
    const { error } = await createAuthClient().signIn.social({
      provider: "google",
      callbackURL: returnPath(location, "ok", param),
      errorCallbackURL: returnPath(location, "fehler", param),
    });
    return !error;
  } catch {
    return false;
  }
}
