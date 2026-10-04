"use client";

import { toolComponents } from "@/tools/components";

/**
 * Hängt die Client-Komponente eines Werkzeugs ein. Als Client-Baustein, damit `next/dynamic` in tools/components.tsx
 * jedes Werkzeug in einen eigenen Chunk legt: Die Seite lädt nur das Werkzeug, das sie zeigt, nicht alle.
 * (Aus einer Server-Komponente heraus landeten alle Werkzeuge in einem Chunk der Seite.)
 */
export function ToolMount({ slug }: { slug: string }) {
  const Tool = toolComponents[slug];
  if (!Tool) throw new Error(`tools/components.tsx hat keinen Eintrag für «${slug}»`);
  return <Tool />;
}
