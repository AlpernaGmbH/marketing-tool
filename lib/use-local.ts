"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { readLocal, removeLocal, subscribeLocal, writeLocal } from "@/lib/storage";

/** Roher Wert aus dem lokalen Speicher. `undefined` bis die Seite im Browser hydriert ist. */
export function useLocalRaw(key: string): string | null | undefined {
  return useSyncExternalStore(
    subscribeLocal,
    () => readLocal(key),
    () => undefined,
  );
}

/**
 * JSON-Wert unter `key`. `parse` bekommt das Gelesene (oder null) und muss immer einen
 * gültigen Wert liefern, auch bei kaputten Daten.
 */
export function useLocalJson<T>(
  key: string,
  parse: (raw: unknown) => T,
): { value: T; ready: boolean; set: (next: T) => void; reset: () => void } {
  const raw = useLocalRaw(key);
  const value = useMemo(() => {
    let data: unknown = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }
    return parse(data);
    // parse ist pro Aufrufer stabil definiert
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  const set = useCallback((next: T) => writeLocal(key, JSON.stringify(next)), [key]);
  const reset = useCallback(() => removeLocal(key), [key]);
  return { value, ready: raw !== undefined, set, reset };
}
