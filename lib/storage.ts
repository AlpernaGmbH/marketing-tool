// localStorage mit Rückfall auf den Arbeitsspeicher (privates Fenster, blockierter Speicher).
// Alle Schlüssel dieser App beginnen mit «mt:» (mt:profile, mt:<slug>, mt:merkliste).

import { SYNC_META_KEY, isSyncKey } from "@/lib/sync-keys";

export const KEY_PREFIX = "mt:";
const CHANGE_EVENT = "mt:storage";
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    const probe = "mt:__probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readLocal(key: string): string | null {
  // Ein Wert im Arbeitsspeicher ist neuer als der im Speicher des Browsers: Er steht nur dort, weil das Schreiben scheiterte.
  if (memory.has(key)) return memory.get(key) ?? null;
  const s = ls();
  if (s) {
    try {
      return s.getItem(key);
    } catch {
      /* fällt auf Arbeitsspeicher zurück */
    }
  }
  return memory.get(key) ?? null;
}

function put(key: string, value: string): void {
  const s = ls();
  try {
    if (s) {
      s.setItem(key, value);
      memory.delete(key);
    } else memory.set(key, value);
  } catch {
    memory.set(key, value); // Speicher voll oder gesperrt
  }
}

function drop(key: string): void {
  try {
    ls()?.removeItem(key);
  } catch {
    /* egal */
  }
  memory.delete(key);
}

// ---- Abgleich mit dem Konto ----------------------------------------------------------------------
// Zu jedem Schlüssel, der zum Konto gehört (lib/sync-keys.ts), merkt sich der Browser den Zeitpunkt der letzten Änderung
// (`at`) und den Stand, den der Server kennt (`sat`). lib/sync.ts gleicht ab, was neuer ist.

export type SyncMeta = { v: 1; keys: Record<string, { at: number; sat: number; del?: boolean }> };

export function readSyncMeta(): SyncMeta {
  try {
    const raw = readLocal(SYNC_META_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SyncMeta>) : null;
    if (parsed && parsed.v === 1 && typeof parsed.keys === "object" && parsed.keys !== null) return { v: 1, keys: parsed.keys };
  } catch {
    /* beschädigt: neu anfangen */
  }
  return { v: 1, keys: {} };
}

export function writeSyncMeta(meta: SyncMeta): void {
  put(SYNC_META_KEY, JSON.stringify(meta));
}

/** Alle Schlüssel, die im Browser stehen (localStorage und Arbeitsspeicher). */
export function listLocalKeys(): string[] {
  const found = new Set(memory.keys());
  const s = ls();
  if (s) {
    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k) found.add(k);
      }
    } catch {
      /* egal */
    }
  }
  return [...found];
}

function touch(key: string, deleted: boolean): void {
  if (!isSyncKey(key)) return;
  const meta = readSyncMeta();
  const prev = meta.keys[key];
  meta.keys[key] = { at: Date.now(), sat: prev?.sat ?? -1, ...(deleted ? { del: true } : {}) };
  writeSyncMeta(meta);
}

/** Schreibt einen Wert, den die Person geändert hat. Er gilt als neue Änderung und geht beim nächsten Abgleich zum Konto. */
export function writeLocal(key: string, value: string): void {
  put(key, value);
  touch(key, false);
  notify();
}

/** Löscht einen Wert, den die Person gelöscht hat. Das Löschen geht beim nächsten Abgleich zum Konto. */
export function removeLocal(key: string): void {
  drop(key);
  touch(key, true);
  notify();
}

/** Schreibt einen Wert, der vom Konto kommt: keine neue Änderung, nichts zurückzuschicken. */
export function writeLocalFromAccount(key: string, value: string): void {
  put(key, value);
  notify();
}

export function removeLocalFromAccount(key: string): void {
  drop(key);
  notify();
}

/** Löscht alles, was diese App lokal gespeichert hat (Profil, Zwischenstände, Merkliste). */
export function clearAllLocal(): void {
  const s = ls();
  if (s) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k?.startsWith(KEY_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => s.removeItem(k));
    } catch {
      /* egal */
    }
  }
  memory.clear();
  notify();
}

/** Für useSyncExternalStore: meldet Änderungen aus diesem und aus anderen Tabs. */
export function subscribeLocal(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}
