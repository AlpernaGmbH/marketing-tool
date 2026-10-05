// Phasen und Massnahmenmuster des Kampagnen-Planers. Reine Daten, kein React, kein DOM.
// Phasenanteile, Budgetverteilung und Muster sind ein Richtwert von Alperna, keine Statistik und keine Vorschrift.
// Regeln für Texte: keine Rechtsaussagen, keine genannten Fristen, keine Ziffern in Titeln und Hinweisen.
// Beim Anzeiger heisst es «Frist beim Anzeiger erfragen», bei WhatsApp «nur an Personen, die zugestimmt haben».
// Je Phase und Kanal höchstens zwei Muster, damit eine Woche nie mehr als zwei Massnahmen je Kanal bekommt (Test).
// Spec: specs/kampagnen-planer.md

import type { KanalKey } from "@/tools/anlass-planer/data";

export const PHASE_KEYS = ["vorbereitung", "anlauf", "haupt", "nachfassen"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export type PhaseInfo = {
  key: PhaseKey;
  label: string;
  /** Ein Satz dazu, was in der Phase geschieht. */
  kurz: string;
  /** Anteil am Budget in Prozent (Richtwert von Alperna). */
  anteil: number;
};

export const PHASEN: readonly PhaseInfo[] = [
  { key: "vorbereitung", label: "Vorbereitung", kurz: "Texte, Material und Zuständigkeiten bereitstellen.", anteil: 0 },
  { key: "anlauf", label: "Anlauf", kurz: "Die Kampagne ankündigen und Aufmerksamkeit aufbauen.", anteil: 25 },
  { key: "haupt", label: "Hauptphase", kurz: "Das Angebot zeigen und Rückmeldungen einsammeln.", anteil: 60 },
  { key: "nachfassen", label: "Nachfassen", kurz: "Anfragen beantworten, danken und das Ergebnis auswerten.", anteil: 15 },
];

export const phaseInfo = (key: PhaseKey): PhaseInfo => PHASEN.find((p) => p.key === key) ?? PHASEN[2];

/** Position einer Massnahme in ihrer Phase. «mitte» ist die Woche ⌈n / 2⌉ einer Phase mit n Wochen. */
export type Position = "erste" | "mitte" | "letzte" | "jede";

export type MusterKanal = KanalKey | "intern";

export type Muster = {
  id: string;
  phase: PhaseKey;
  kanal: MusterKanal;
  titel: string;
  position: Position;
  /** Ein kurzer Satz zur Massnahme. */
  hinweis?: string;
  /** Slug eines bestehenden Werkzeugs, das bei der Massnahme hilft. */
  werkzeug?: string;
};

type Extra = Partial<Pick<Muster, "hinweis" | "werkzeug">>;

const m = (phase: PhaseKey, kanal: MusterKanal, titel: string, position: Position, extra: Extra = {}): Muster => ({
  id: "",
  phase,
  kanal,
  titel,
  position,
  ...extra,
});

const ZUSTIMMUNG = "Nur an Personen, die zugestimmt haben.";
const ANZEIGER = "Frist beim Anzeiger erfragen.";

const ROH: Muster[] = [
  // ---- Vorbereitung ------------------------------------------------------------------------------
  m("vorbereitung", "intern", "Kernbotschaft festhalten und im Team abstimmen", "erste", { werkzeug: "botschaften" }),
  m("vorbereitung", "intern", "Zuständigkeiten klären und Kennzahlen festlegen", "letzte", { werkzeug: "kpi-baum" }),
  m("vorbereitung", "website", "Landeseite oder Abschnitt für das Angebot vorbereiten", "erste"),
  m("vorbereitung", "gbp", "Beitrag zum Angebot vorbereiten", "erste", { werkzeug: "post-generator" }),
  m("vorbereitung", "instagram", "Beiträge vorplanen", "erste", { werkzeug: "caption-baukasten" }),
  m("vorbereitung", "facebook", "Beiträge vorplanen", "erste", { werkzeug: "caption-baukasten" }),
  m("vorbereitung", "linkedin", "Beitrag vorbereiten", "erste", { werkzeug: "post-generator" }),
  m("vorbereitung", "newsletter", "Newsletter-Text entwerfen und prüfen", "erste", { werkzeug: "newsletter-check" }),
  m("vorbereitung", "aushang", "Flyer entwerfen und drucken", "erste"),
  m("vorbereitung", "aushang", "QR-Code für den Flyer erstellen", "letzte", { werkzeug: "qr-set" }),
  m("vorbereitung", "presse", "Frist beim Anzeiger erfragen und Inserat bestellen", "erste"),
  m("vorbereitung", "presse", "Medienmitteilung schreiben", "letzte", { werkzeug: "medienmitteilung" }),
  m("vorbereitung", "whatsapp", "Link und Nachricht vorbereiten", "letzte", { werkzeug: "whatsapp-link", hinweis: ZUSTIMMUNG }),

  // ---- Anlauf ------------------------------------------------------------------------------------
  m("anlauf", "intern", "Angebot, Preise und Kontaktweg prüfen", "letzte"),
  m("anlauf", "website", "Landeseite oder Abschnitt veröffentlichen", "erste"),
  m("anlauf", "gbp", "Beitrag zum Angebot veröffentlichen", "erste", { werkzeug: "post-generator" }),
  m("anlauf", "instagram", "Ankündigung veröffentlichen", "erste", { werkzeug: "post-generator" }),
  m("anlauf", "instagram", "Story mit Blick hinter die Kulissen veröffentlichen", "letzte", { werkzeug: "caption-baukasten" }),
  m("anlauf", "facebook", "Ankündigung veröffentlichen", "erste", { werkzeug: "post-generator" }),
  m("anlauf", "linkedin", "Ankündigung veröffentlichen", "erste", { werkzeug: "post-generator" }),
  m("anlauf", "newsletter", "Ankündigung versenden", "erste", { werkzeug: "newsletter-check" }),
  m("anlauf", "aushang", "Flyer verteilen und Plakate aufhängen", "erste"),
  m("anlauf", "presse", "Medienmitteilung an die Lokalzeitung senden", "erste", { werkzeug: "medienmitteilung" }),

  // ---- Hauptphase --------------------------------------------------------------------------------
  m("haupt", "intern", "Anfragen und Rückmeldungen erfassen", "jede"),
  m("haupt", "intern", "Zwischenstand mit den Kennzahlen prüfen", "mitte", { werkzeug: "kpi-baum" }),
  m("haupt", "website", "Landeseite prüfen: Angebot, Kontakt und Anmeldung stimmen", "erste"),
  m("haupt", "website", "Kundenstimme auf die Seite stellen", "letzte"),
  m("haupt", "gbp", "Beitrag zum Angebot veröffentlichen", "mitte", { werkzeug: "post-generator" }),
  m("haupt", "instagram", "Zwei Beiträge zum Angebot veröffentlichen", "jede", { werkzeug: "caption-baukasten" }),
  m("haupt", "instagram", "Beitrag mit Kundenstimme veröffentlichen", "mitte", { werkzeug: "caption-baukasten" }),
  m("haupt", "facebook", "Beitrag zum Angebot veröffentlichen", "jede", { werkzeug: "post-generator" }),
  m("haupt", "linkedin", "Fachbeitrag zum Angebot veröffentlichen", "mitte", { werkzeug: "post-generator" }),
  m("haupt", "newsletter", "Newsletter mit Angebot und Kundenstimme versenden", "mitte", { werkzeug: "newsletter-check" }),
  m("haupt", "aushang", "Aushänge kontrollieren und Flyer nachlegen", "mitte"),
  m("haupt", "presse", "Inserat im Anzeiger prüfen und Rückmeldungen erfassen", "mitte", { hinweis: ANZEIGER }),
  m("haupt", "whatsapp", "Nachricht an Bestandskundschaft senden, die zugestimmt hat", "mitte", { werkzeug: "whatsapp-link", hinweis: ZUSTIMMUNG }),

  // ---- Nachfassen --------------------------------------------------------------------------------
  m("nachfassen", "intern", "Anfragen beantworten und offene Kontakte nachfassen", "erste"),
  m("nachfassen", "intern", "Ergebnis auswerten: Kennzahlen mit dem Ziel vergleichen", "letzte", { werkzeug: "kpi-baum" }),
  m("nachfassen", "website", "Landeseite aktualisieren oder abschalten", "erste"),
  m("nachfassen", "gbp", "Bewertungen anfragen", "erste", { werkzeug: "bewertungs-kit" }),
  m("nachfassen", "instagram", "Danke-Beitrag veröffentlichen", "erste", { werkzeug: "caption-baukasten" }),
  m("nachfassen", "facebook", "Danke-Beitrag veröffentlichen", "erste", { werkzeug: "caption-baukasten" }),
  m("nachfassen", "linkedin", "Danke-Beitrag veröffentlichen", "erste", { werkzeug: "caption-baukasten" }),
  m("nachfassen", "newsletter", "Danke-Newsletter mit dem Ergebnis versenden", "erste", { werkzeug: "newsletter-check" }),
  m("nachfassen", "aushang", "Aushänge und Plakate abhängen", "erste"),
  m("nachfassen", "presse", "Fotos und Kurzbericht an die Lokalpresse senden", "erste", { werkzeug: "medienmitteilung" }),
  m("nachfassen", "whatsapp", "Danke-Nachricht an die Kontakte senden", "erste", { werkzeug: "whatsapp-link", hinweis: ZUSTIMMUNG }),
];

/** Alle Muster mit eindeutiger ID («haupt-instagram-2»), in der Reihenfolge der Liste. */
export const MUSTER: readonly Muster[] = (() => {
  const count = new Map<string, number>();
  return ROH.map((x) => {
    const base = `${x.phase}-${x.kanal}`;
    const n = (count.get(base) ?? 0) + 1;
    count.set(base, n);
    return { ...x, id: `${base}-${n}` };
  });
})();
