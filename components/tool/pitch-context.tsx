"use client";

import { createContext, useContext } from "react";
import type { BausteinName } from "@/lib/pitch";

// Die Seite (Server) liest content/pitch/bausteine.md und gibt die Texte hier an die Werkzeuge weiter, damit ein Werkzeug im Ergebnis
// einen Baustein nennen kann (ResultPitch). Ohne Anbieter, zum Beispiel in Tests, bleibt der Hinweis weg.

export type PitchData = {
  toolName: string;
  toolSlug: string;
  /** Nur verwendbare Bausteine (Text gefüllt, kein TODO). */
  bausteine: { name: BausteinName; text: string }[];
  /** Nur Ziffern, wie NEXT_PUBLIC_WHATSAPP_NUMBER. */
  whatsappNumber?: string;
  erstgespraechUrl?: string;
};

const PitchContext = createContext<PitchData | null>(null);

export function PitchProvider({ data, children }: { data: PitchData; children: React.ReactNode }) {
  return <PitchContext.Provider value={data}>{children}</PitchContext.Provider>;
}

export function usePitchData(): PitchData | null {
  return useContext(PitchContext);
}
