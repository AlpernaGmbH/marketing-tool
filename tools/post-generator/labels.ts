import { KATEGORIE_KEYS, ZIEL_KEYS, type KategorieKey, type ZielKey } from "./generator";

// Ziele der Aufforderung und Kategorien des Beitrags mit Beschriftung: reine Daten, von Post-Generator und Caption-Baukasten
// gemeinsam genutzt (der Caption-Baukasten fragt dasselbe, ohne den Post-Generator zu laden).

export const ZIELE: { key: ZielKey; label: string; hint: string }[] = [
  { key: "kommentar", label: "Kommentieren", hint: "Die Aufforderung lädt zu einem Kommentar ein." },
  { key: "nachricht", label: "Direktnachricht", hint: "Die Aufforderung lädt zu einer Nachricht an euch ein." },
  { key: "profil", label: "Follower gewinnen", hint: "Die Aufforderung lädt ein, euer Profil anzusehen und euch zu folgen." },
  { key: "link", label: "Website-Besuche", hint: "An der Stelle steht der Platzhalter [Link]. Die Adresse setzt du selbst ein." },
  { key: "speichern", label: "Speichern", hint: "Die Aufforderung lädt ein, den Beitrag zu speichern." },
  { key: "verkauf", label: "Verkauf", hint: "Die Aufforderung lädt zum Kauf oder zur Bestellung ein. Preise und Link setzt du selbst ein." },
  { key: "termin", label: "Termin", hint: "Die Aufforderung lädt ein, einen Termin zu vereinbaren." },
  { key: "bewerbung", label: "Bewerbung", hint: "Die Aufforderung lädt ein, sich zu bewerben oder zu melden." },
  { key: "anmeldung", label: "Anmeldung", hint: "Die Aufforderung lädt zur Anmeldung ein. Datum, Ort und Link nennst du in der Idee." },
  { key: "teilen", label: "Teilen", hint: "Die Aufforderung bittet darum, den Beitrag weiterzuschicken." },
];

/** Worum es im Beitrag geht; die Auswahl ist freiwillig. */
export const KATEGORIEN: { key: KategorieKey; label: string; hint: string }[] = [
  { key: "angebot", label: "Angebot", hint: "Eine Leistung oder ein Produkt wird vorgestellt." },
  { key: "team", label: "Team", hint: "Ein Mensch oder das Team steht im Mittelpunkt." },
  { key: "kundenprojekt", label: "Kundenprojekt", hint: "Ein abgeschlossenes Projekt oder eine Zusammenarbeit." },
  { key: "kulissen", label: "Hinter den Kulissen", hint: "Ein Einblick in den Arbeitsalltag." },
  { key: "frage", label: "Frage", hint: "Der Beitrag beantwortet eine Frage deiner Kundschaft oder stellt eine." },
  { key: "tipp", label: "Tipp", hint: "Ein praktischer Rat." },
  { key: "saison", label: "Saison", hint: "Bezug zu einer Jahreszeit oder einem Anlass." },
];


export const isZiel = (v: unknown): v is ZielKey => typeof v === "string" && (ZIEL_KEYS as readonly string[]).includes(v);
export const isKategorie = (v: unknown): v is KategorieKey => typeof v === "string" && (KATEGORIE_KEYS as readonly string[]).includes(v);
export const zielLabel = (key: ZielKey): string => ZIELE.find((z) => z.key === key)?.label ?? key;
export const kategorieLabel = (key: KategorieKey): string => KATEGORIEN.find((k) => k.key === key)?.label ?? key;
