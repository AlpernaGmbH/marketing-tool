"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import { isWanted, loadClerkIfReturning, subscribeWanted } from "@/lib/clerk-bridge";

// Clerk ist nicht Teil der Seite, bis jemand es braucht (lib/clerk-bridge.ts entscheidet). Besucher ohne Konto laden es nie.
const ClerkRoot = dynamic(() => import("@/components/site/ClerkRoot"), { ssr: false });

export function ClerkLoader() {
  const wanted = useSyncExternalStore(subscribeWanted, isWanted, () => false);
  // Rückkehr von Google, Microsoft oder Apple: Clerk muss die Anmeldung abschliessen, auch wenn niemand mehr klickt.
  useEffect(() => {
    loadClerkIfReturning();
  }, []);
  return wanted ? <ClerkRoot /> : null;
}
