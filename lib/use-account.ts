"use client";

import { useEffect, useState } from "react";
import { fetchAccountInfo, type AccountInfo } from "@/lib/account-client";
import { whenSessionReady } from "@/lib/clerk-bridge";

// Ein Abruf pro Seitenaufruf, geteilt zwischen Kopfzeile und Profilseite. Nach Anmelden und Abmelden lädt die Seite
// neu, daher gibt es keine Aktualisierung im Hintergrund.
let shared: Promise<AccountInfo | null> | null = null;

export function resetAccountCache(): void {
  shared = null;
}

/** `undefined`: wird geladen. `null`: nicht erreichbar. */
export function useAccount(): AccountInfo | null | undefined {
  const [info, setInfo] = useState<AccountInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    // Erst wenn der Browser Luft hat: Der Abruf konkurriert sonst mit dem Aufbau der Seite (Total Blocking Time).
    const start = () => {
      // Wer ein Sitzungs-Zeichen trägt, wartet kurz, bis Clerk die Sitzung aufgefrischt hat (sonst sähe der Server ihn als abgemeldet).
      shared ??= whenSessionReady().then(() => fetchAccountInfo());
      void shared.then((value) => {
        if (alive) setInfo(value);
      });
    };
    const hasIdle = "requestIdleCallback" in window;
    const handle = hasIdle ? window.requestIdleCallback(start, { timeout: 1500 }) : window.setTimeout(start, 300);
    return () => {
      alive = false;
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);
  return info;
}
