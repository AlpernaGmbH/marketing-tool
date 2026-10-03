"use client";

import { useMemo, useSyncExternalStore } from "react";
import { doneSlugs } from "@/lib/progress";
import { readLocal, subscribeLocal } from "@/lib/storage";

/**
 * Erledigte Werkzeuge unter `slugs`. `ready` ist erst im Browser wahr; bis dahin ist `done`
 * leer, damit Server und erste Browser-Ausgabe übereinstimmen.
 */
export function useDoneSlugs(slugs: readonly string[]): { done: ReadonlySet<string>; ready: boolean } {
  const joined = slugs.join(",");
  // Der Snapshot ist ein String, damit useSyncExternalStore ihn per Gleichheit vergleichen kann.
  const snapshot = useSyncExternalStore(
    subscribeLocal,
    () => doneSlugs(joined ? joined.split(",") : [], readLocal).join(","),
    () => undefined,
  );
  const done = useMemo(() => new Set(snapshot ? snapshot.split(",") : []), [snapshot]);
  return { done, ready: snapshot !== undefined };
}
