import type { Form } from "./logic";
import type { SponsoringOutput } from "./generator";

// Das Beispiel des Seitentexts: der fiktive «FC Trogen». Alle Zahlen und Preise sind erfunden und gelten als Angaben des
// fiktiven Vereins. Die Tests und der Seitentext (content/tools/sponsoring-dossier.md) rechnen mit denselben Werten.

export const BEISPIEL_FORM: Form = {
  verein: "FC Trogen",
  ort: "Trogen",
  kanton: "AR",
  website: "",
  anlass: "Saison 2026/27",
  zahlen: {
    mitglieder: "280",
    aktive: "85",
    zuschauer: "180",
    anlaesse: "14",
    instagram: "950",
    facebook: "620",
    besuche: "1400",
    medien: "12",
  },
  zielgruppe: "Betriebe aus Trogen, Speicher und Teufen, die bei Familien und jungen Erwachsenen sichtbar sein wollen: Handwerk, Gastronomie, Garagen.",
  pakete: [
    { name: "Bronze", preis: "500", haken: ["website", "newsletter", "anlaesse"], social: "", tickets: "", weitere: "" },
    { name: "Silber", preis: "1500", haken: ["bande", "website", "newsletter", "anlaesse"], social: "6", tickets: "4", weitere: "" },
    { name: "Gold", preis: "6000", haken: ["trikot", "bande", "website", "newsletter", "anlaesse", "stand", "medien"], social: "12", tickets: "8", weitere: "" },
  ],
  referenzen: "Schreinerei Eugster\nGartenbau Zuberbühler",
  kontakt: { name: "Lea Frei", funktion: "Präsidentin", telefon: "071 000 00 00", email: "sponsoring@fc-trogen.example" },
  farbe: "#1B3A6B",
  stichworte: "Gegründet 1948, Juniorenabteilung mit 8 Teams, Heimspiele auf der Sportanlage Landhaus, Förderung von Jugend und Dorfleben.",
};

/** Eine gültige Antwort der KI zu BEISPIEL_FORM (für Tests und den Stub von /api/generate im Browser-Test). */
export const BEISPIEL_KI: SponsoringOutput = {
  portraet:
    "Der FC Trogen wurde 1948 gegründet und spielt auf der Sportanlage Landhaus in Trogen. Der Verein hat 280 Mitglieder, davon 85 Aktive, und führt eine Juniorenabteilung mit 8 Teams. Er fördert Jugend und Dorfleben.",
  warum:
    "Bei 14 Anlässen pro Jahr sehen im Schnitt 180 Personen zu. Der Verein erreicht Familien und junge Erwachsene aus Trogen, Speicher und Teufen. Die drei Pakete Bronze, Silber und Gold decken vom Logo auf der Website bis zum Stand am Anlass ab.",
  dank: "Wir danken allen Betrieben, die den Verein unterstützen oder dies erwägen. Im nächsten Schritt besprechen wir gerne in einem Gespräch, welches Paket zu Ihrem Betrieb passt.",
};
