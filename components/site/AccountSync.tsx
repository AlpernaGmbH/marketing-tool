"use client";

import { useEffect } from "react";
import { subscribeLocal } from "@/lib/storage";
import { hasPending, syncOnce } from "@/lib/sync";
import { useAccount } from "@/lib/use-account";

/**
 * Hält die Daten dieses Geräts und die Daten beim Konto auf demselben Stand. Läuft nur, wenn jemand angemeldet ist und der
 * Speicher beim Konto bereitsteht. Ohne Konto passiert nichts, die Daten bleiben im Browser.
 */
export function AccountSync() {
  const info = useAccount();
  const active = Boolean(info?.account && info.storage);

  useEffect(() => {
    if (!active) return;
    let running = false;
    let timer: number | undefined;
    let last = 0;

    const run = async () => {
      if (running) return;
      running = true;
      try {
        await syncOnce();
      } finally {
        running = false;
        last = Date.now();
      }
    };
    // Eine Änderung geht nach kurzer Ruhe zum Konto (nicht bei jedem Tastendruck).
    const schedule = () => {
      if (!hasPending()) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 2000);
    };
    // Wer von einem anderen Gerät zurückkommt, soll dessen Änderungen sehen.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 20_000) void run();
    };

    void run();
    const off = subscribeLocal(schedule);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, [active]);

  return null;
}
