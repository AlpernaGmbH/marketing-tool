// localStorage mit Rückfall auf den Arbeitsspeicher (privates Fenster, blockierter Speicher).
// Alle Schlüssel dieser App beginnen mit «mt:» (mt:profile, mt:<slug>, mt:merkliste).

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

/** Kann der Browser dauerhaft speichern? false im privaten Fenster oder bei blockiertem Speicher: dann gilt nur der Arbeitsspeicher bis zum Neuladen. */
export function canPersist(): boolean {
  return ls() !== null;
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

export function writeLocal(key: string, value: string): void {
  put(key, value);
  notify();
}

export function removeLocal(key: string): void {
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
