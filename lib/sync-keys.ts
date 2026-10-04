// Welche lokalen Schlüssel zum Konto gehören. Reine Konstanten und Prüfungen ohne Browser-Zugriff, damit Server
// (Route /api/account/data) und Browser (lib/sync.ts, lib/storage.ts) dieselbe Regel nutzen.

/** Verwaltung des Abgleichs im Browser (nie auf dem Server): Zeitpunkt der letzten Änderung je Schlüssel. */
export const SYNC_META_KEY = "mt:_sync";

// mt:profile, mt:merkliste und mt:<werkzeug>. Technische Schlüssel beginnen mit «_» (mt:_konto, mt:_sync) und zählen nicht.
const KEY = /^mt:[a-z0-9][a-z0-9-]{0,60}$/;

export function isSyncKey(key: string): boolean {
  return KEY.test(key);
}

export const LIMITS = {
  /** Höchstens so viele Schlüssel je Konto. */
  maxKeys: 60,
  /** Höchstens so viele Zeichen je Wert (ein Check-Ergebnis liegt bei rund 30 bis 60 KB). */
  maxValueChars: 150_000,
  /** Höchstens so viele Zeichen insgesamt je Konto. */
  maxTotalChars: 600_000,
} as const;
