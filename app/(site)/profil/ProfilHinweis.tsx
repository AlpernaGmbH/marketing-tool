"use client";

import { useAccount } from "@/lib/use-account";

/** Wo das Firmenprofil liegt, je nachdem ob jemand angemeldet ist. Der Text vor dem Laden gilt für Besucher ohne Konto. */
export function ProfilHinweis() {
  const info = useAccount();
  let text = "Ohne Konto bleibt dein Profil nur in diesem Browser. Melde dich an, dann liegt es bei deinem Konto und steht auf jedem Gerät bereit. Exportiere es, wenn du eine Kopie willst.";
  if (info?.account && info.storage) {
    text = "Dein Profil liegt in deinem Konto und steht auf jedem Gerät bereit. Exportiere es, wenn du eine Kopie willst.";
  } else if (info?.account) {
    text = "Der Speicher beim Konto ist gerade nicht erreichbar. Dein Profil bleibt vorerst in diesem Browser. Exportiere es, wenn du eine Kopie willst.";
  } else if (info && info.login === null) {
    text = "Wird nur in deinem Browser gespeichert. Exportiere es, wenn du es behalten willst.";
  }
  return <p className="measure mt-4 text-lg text-muted-foreground">{text}</p>;
}
