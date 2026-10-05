"use client";

import { useEffect } from "react";
import { useProfile } from "@/lib/use-profile";
import type { ToolConfig } from "@/lib/define-tool";
import { toolComponents } from "@/tools/components";

/**
 * Hängt die Client-Komponente eines Werkzeugs ein. Als Client-Baustein, damit `next/dynamic` in tools/components.tsx
 * jedes Werkzeug in einen eigenen Chunk legt: Die Seite lädt nur das Werkzeug, das sie zeigt, nicht alle.
 * (Aus einer Server-Komponente heraus landeten alle Werkzeuge in einem Chunk der Seite.)
 *
 * Ein reines Vereins-Werkzeug (`audience: "verein"`) stellt ein leeres Profil auf «Verein». Sonst stünde dort «KMU oder
 * Selbständige» vorgewählt, und die Felder hiessen «Firma» statt «Name des Vereins». Ein vorhandener Typ bleibt.
 */
export function ToolMount({ slug, audience }: { slug: string; audience?: ToolConfig["audience"] }) {
  const Tool = toolComponents[slug];
  if (!Tool) throw new Error(`tools/components.tsx hat keinen Eintrag für «${slug}»`);
  const { profile, ready, update } = useProfile();
  const needsVerein = audience === "verein" && ready && !profile.organisationstyp;
  useEffect(() => {
    if (needsVerein) update({ organisationstyp: "verein" });
  }, [needsVerein, update]);
  return <Tool />;
}
