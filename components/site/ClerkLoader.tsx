"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { isWanted, subscribeWanted } from "@/lib/clerk-bridge";

// Clerk ist nicht Teil der Seite, bis jemand es braucht (lib/clerk-bridge.ts entscheidet). Besucher ohne Konto laden es nie.
const ClerkRoot = dynamic(() => import("@/components/site/ClerkRoot"), { ssr: false });

export function ClerkLoader() {
  const wanted = useSyncExternalStore(subscribeWanted, isWanted, () => false);
  return wanted ? <ClerkRoot /> : null;
}
