import { LIMITS, isSyncKey } from "@/lib/sync-keys";
import { listLocalKeys, readLocal, readSyncMeta, removeLocalFromAccount, writeLocalFromAccount, writeSyncMeta, clearAllLocal } from "@/lib/storage";

// Abgleich der lokalen Daten mit dem Konto (Browser-Seite von /api/account/data).
// Regel: Je Schlüssel gewinnt die jüngere Änderung. Bevor ein Gerät zum ersten Mal abgleicht, gilt sein Wert als ältester
// Stand (`at` = 0): Was im Konto liegt, bleibt. Was dort fehlt, geht hinauf.

type Entry = { value: string | null; at: number };
export type SyncResult = "ok" | "unavailable" | "failed";

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Was noch nicht beim Konto ist: Änderungen, Löschungen und Schlüssel, die der Browser noch nie abgeglichen hat. */
function pendingEntries(): Record<string, Entry> {
  const meta = readSyncMeta();
  const local = new Set(listLocalKeys().filter(isSyncKey));
  const keys = new Set([...Object.keys(meta.keys), ...local]);
  const out: Record<string, Entry> = {};
  for (const key of keys) {
    const m = meta.keys[key];
    if (local.has(key)) {
      if (m && m.at <= m.sat) continue;
      const value = readLocal(key);
      // Was kein JSON ist oder zu gross, kann das Konto nicht aufnehmen: bleibt lokal.
      if (value === null || value.length > LIMITS.maxValueChars || !isJson(value)) continue;
      out[key] = { value, at: m?.at ?? 0 };
    } else if (m?.del && m.at > m.sat) {
      out[key] = { value: null, at: m.at };
    }
  }
  return out;
}

export function hasPending(): boolean {
  return Object.keys(pendingEntries()).length > 0;
}

/** Ein Abgleich: Änderungen hinaufschicken, den Stand des Kontos zurückholen. Wirft nie. */
export async function syncOnce(fetchImpl: typeof fetch = fetch): Promise<SyncResult> {
  const push = pendingEntries();
  let res: Response;
  try {
    res = await fetchImpl("/api/account/data", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entries: push }),
      credentials: "same-origin",
    });
  } catch {
    return "failed";
  }
  if (res.status === 401 || res.status === 503) return "unavailable";
  if (!res.ok) return "failed";

  let server: Record<string, Entry>;
  try {
    server = ((await res.json()) as { entries?: Record<string, Entry> }).entries ?? {};
  } catch {
    return "failed";
  }

  // Während der Anfrage kann die Person weitergearbeitet haben: den Stand frisch lesen, bevor wir etwas eintragen.
  const meta = readSyncMeta();
  for (const [key, e] of Object.entries(server)) {
    if (!isSyncKey(key) || typeof e?.at !== "number") continue;
    const m = meta.keys[key];
    const pushed = push[key];
    if (pushed && pushed.at === e.at && pushed.value === e.value) {
      meta.keys[key] = { ...m, at: Math.max(m?.at ?? 0, e.at), sat: e.at, ...(m?.del && e.value === null ? { del: true } : {}) };
      if (!(m?.del && e.value === null)) delete meta.keys[key].del;
    } else if (!m || e.at > m.at) {
      if (e.value === null) {
        removeLocalFromAccount(key);
        meta.keys[key] = { at: e.at, sat: e.at, del: true };
      } else {
        writeLocalFromAccount(key, e.value);
        meta.keys[key] = { at: e.at, sat: e.at };
      }
    } else if (e.at === m.at) {
      meta.keys[key] = { ...m, sat: e.at };
    }
  }
  writeSyncMeta(meta);
  return "ok";
}

/** Löscht alle Daten beim Konto. */
export async function deleteAccountData(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl("/api/account/data", { method: "DELETE", credentials: "same-origin" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Vor dem Abmelden: Alles zum Konto schicken und danach die lokale Kopie entfernen, damit die nächste Person an diesem
 * Gerät nichts davon sieht. Klappt das Hinaufschicken nicht, bleibt die lokale Kopie (lieber Daten behalten).
 */
export async function flushAndClear(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if ((await syncOnce(fetchImpl)) !== "ok") return false;
  clearAllLocal();
  return true;
}
