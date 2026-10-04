import { openSignIn, type SignInMode } from "@/lib/clerk-bridge";
import { readLocal, removeLocal, writeLocal } from "@/lib/storage";

// Browser-Seite der Konto-Anmeldung. Die Einwilligung gibt der Besucher im Fenster, bevor er sich anmeldet;
// weil die Anmeldung die Seite verlassen kann (Weiterleitung zum Anbieter), merken wir uns Werkzeug und Einwilligung kurz im Browser.

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

/** Name des Abfrageparameters nach der Rückkehr von der Anmeldung: «konto» (Freischalten im Werkzeug) oder «anmeldung» (Kopfzeile). */
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
 * Öffnet das Anmelde-Fenster von Clerk. Clerk lädt erst jetzt, damit es die Seite nicht verlangsamt.
 * true: Das Fenster ist offen, die Person entscheidet. Sie kehrt danach mit `?konto=ok` (oder `?anmeldung=ok`) zur Seite zurück.
 * false: Clerk ist nicht bereit (nicht eingerichtet, nicht erreichbar).
 */
export async function startSignIn(
  location: Pick<Location, "pathname" | "search">,
  param: ReturnParam = "konto",
  mode: SignInMode = "anmelden",
): Promise<boolean> {
  return openSignIn(mode, returnPath(location, "ok", param));
}
