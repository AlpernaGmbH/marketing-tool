"use client";

import { WebsiteScan as SharedScan } from "@/components/tool/WebsiteScan";
import { dateCH } from "@/lib/ch";
import { checkInfo } from "./logic";

/**
 * Der Website-Scan des Reifegrad-Checks (components/tool/WebsiteScan.tsx): Das Ergebnis liegt unter dem Schlüssel des Marketing-Checks.
 * Ohne Scan sind «Auftritt» und «Inhalte» nicht bewertet.
 */
export function WebsiteScan() {
  return (
    <SharedScan
      idPrefix="rg"
      fields={["firma", "website"]}
      intro="Auftritt und Inhalte liest das Werkzeug aus deiner Website, statt dich zu fragen. Dafür läuft der Marketing-Check über deine Startseite. Die Adresse deiner Website geht an unseren Server, nicht deine E-Mail-Adresse. Ohne Scan sind diese beiden Dimensionen nicht bewertet."
      stand={(saved) => {
        const info = checkInfo(saved);
        if (!info) return null;
        return `Gespeicherter Scan${info.checkedAt ? ` vom ${dateCH(info.checkedAt)}` : ""}: Marketing-Check ${info.score} von 100. Er zählt für Auftritt, Inhalte und eine Frage in Steuerung.`;
      }}
    />
  );
}
