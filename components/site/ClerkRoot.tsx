"use client";

import { ClerkProvider, useClerk } from "@clerk/nextjs";
import { useEffect } from "react";
import { registerClerk, type ClerkApi } from "@/lib/clerk-bridge";
import { localizationDeCH } from "@/lib/clerk-localization";

// Erst geladen (components/site/ClerkLoader.tsx), wenn Clerk gebraucht wird. Hier steht alles, was Clerk braucht:
// Anbieter, Texte, Farben. Die App selbst sieht Clerk nur über lib/clerk-bridge.ts.

function Bridge() {
  const clerk = useClerk();
  useEffect(() => {
    registerClerk(clerk as unknown as ClerkApi);
    return () => registerClerk(null);
  }, [clerk]);
  return null;
}

export default function ClerkRoot() {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      localization={localizationDeCH}
      appearance={{
        variables: {
          colorPrimary: "#0F0F0E",
          colorPrimaryForeground: "#FFFDF8",
          colorForeground: "#0F0F0E",
          colorBackground: "#FFFDF8",
          colorInput: "#FFFDF8",
          colorInputForeground: "#0F0F0E",
          borderRadius: "14px",
          fontFamily: "var(--font-geist), 'Helvetica Neue', Helvetica, system-ui, sans-serif",
        },
      }}
    >
      <Bridge />
    </ClerkProvider>
  );
}
