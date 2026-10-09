// Aufgabenvorlagen des Anlass-Zeitplans. Reine Daten, kein React, kein DOM.
// Die Vorlagen und ihre Vorlaufzeiten sind ein Richtwert von Alperna, keine Statistik und keine Vorschrift.
// Regeln für Texte: keine Rechtsaussagen, keine genannten Fristen, keine Ziffern in Titeln und Hinweisen.
// Bewilligungen heissen «bei der Gemeinde nachfragen», Fristen «Frist beim Anzeiger erfragen» oder «Frist laut Statuten prüfen».
// Spec: specs/anlass-planer.md

export const TYP_KEYS = ["tag-der-offenen-tuer", "eroeffnung", "jubilaeum", "messe", "dorffest", "generalversammlung"] as const;
export type TypKey = (typeof TYP_KEYS)[number];

export const KANAL_KEYS = ["website", "gbp", "instagram", "facebook", "linkedin", "newsletter", "aushang", "presse", "whatsapp"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];

/** Kanal einer Aufgabe: ein Kanal der Auswahl oder «intern» (Arbeit im Betrieb oder Verein, kein Kanal). */
export type VorlagenKanal = KanalKey | "intern";
export type NurWenn = KanalKey | "inserate";

export type Vorlage = {
  id: string;
  titel: string;
  /** Woche, in der die Aufgabe steht: 10 bis 1 Wochen vorher, 0 = Anlasstag, -1 = eine Woche danach. */
  wochenVorher: number;
  /** Feinerer Termin in Tagen vor dem Anlass (negativ: danach). Ohne Angabe gilt 7 mal `wochenVorher`. */
  tageVorher?: number;
  kanal: VorlagenKanal;
  /** Slug eines bestehenden Werkzeugs, das bei der Aufgabe hilft. */
  werkzeug?: string;
  /** Die Aufgabe erscheint nur, wenn dieser Kanal gewählt ist (oder, bei «inserate», die Checkbox gesetzt). */
  nurWenn?: NurWenn;
  /** Ein kurzer Satz zur Aufgabe, etwa wo die Person nachfragen soll. */
  hinweis?: string;
  /** true: nur Vereine. false: nur KMU. «beide»: alle. */
  vereinsTyp: boolean | "beide";
};

type Extra = Partial<Pick<Vorlage, "tageVorher" | "werkzeug" | "nurWenn" | "hinweis" | "vereinsTyp">>;

const INTERN = "intern" as const;

const v = (id: string, titel: string, wochenVorher: number, kanal: VorlagenKanal, extra: Extra = {}): Vorlage => ({
  id,
  titel,
  wochenVorher,
  kanal,
  vereinsTyp: "beide",
  ...extra,
});

/** Persönliche Einladung: für KMU an Stammkundschaft und Partner, für Vereine an Mitglieder und Gönner. */
const einladungen = (prefix: string, wochen: number, nurKmu = false): Vorlage[] => [
  v(`${prefix}-einladung-kmu`, "Stammkundschaft und Partner persönlich einladen", wochen, INTERN, { vereinsTyp: false }),
  ...(nurKmu ? [] : [v(`${prefix}-einladung-verein`, "Mitglieder und Gönner persönlich einladen", wochen, INTERN, { vereinsTyp: true })]),
];

/** Aufgaben aller Arten: die neun festen und die Aufgaben je Kanal. */
export const GEMEINSAM: Vorlage[] = [
  v("g-ziel", "Ziel und Budget klären", 10, INTERN),
  v("g-datum-ort", "Datum und Ort sichern", 10, INTERN),
  v("g-team", "Verantwortliche verteilen", 9, INTERN),
  v("g-programm", "Programm festlegen", 8, INTERN),
  v("g-einladung", "Einladung gestalten", 6, INTERN),
  v("g-erinnerung", "Erinnerung eine Woche vorher in den gewählten Kanälen veröffentlichen", 1, INTERN),
  v("g-aufbau", "Aufbau am Vortag", 1, INTERN, { tageVorher: 1 }),
  v("g-zaehlen", "Besuchende und Anfragen zählen", 0, INTERN),
  v("g-rueckblick", "Rückblick mit Zahlen: Besuchende und Anfragen auswerten", -1, INTERN, { tageVorher: -7 }),

  // Website
  v("k-web-ankuendigung", "Ankündigung auf der Website veröffentlichen", 5, "website"),
  v("k-web-rueckblick", "Website mit Fotos und Rückblick ergänzen", -1, "website", { tageVorher: -4 }),
  // Google-Unternehmensprofil
  v("k-gbp-ankuendigung", "Ankündigung im Google-Unternehmensprofil veröffentlichen", 4, "gbp", { werkzeug: "post-generator" }),
  v("k-gbp-bewertung", "Bewertungen nach dem Anlass anfragen", -1, "gbp", { tageVorher: -3, werkzeug: "bewertungs-kit", vereinsTyp: false }),
  // Instagram
  v("k-ig-ankuendigung", "Ankündigung auf Instagram veröffentlichen", 4, "instagram", { werkzeug: "post-generator" }),
  v("k-ig-stories", "Stories vom Anlass veröffentlichen", 0, "instagram", { werkzeug: "caption-baukasten" }),
  v("k-ig-danke", "Danke-Beitrag auf Instagram veröffentlichen", -1, "instagram", { tageVorher: -1, werkzeug: "caption-baukasten" }),
  // Facebook
  v("k-fb-veranstaltung", "Veranstaltung auf Facebook anlegen", 5, "facebook"),
  v("k-fb-danke", "Danke-Beitrag auf Facebook veröffentlichen", -1, "facebook", { tageVorher: -1, werkzeug: "caption-baukasten" }),
  // LinkedIn
  v("k-li-ankuendigung", "Ankündigung auf LinkedIn veröffentlichen", 3, "linkedin", { werkzeug: "post-generator" }),
  v("k-li-danke", "Danke-Beitrag auf LinkedIn veröffentlichen", -1, "linkedin", { tageVorher: -2, werkzeug: "caption-baukasten" }),
  // Newsletter
  v("k-nl-einladung", "Einladung als Newsletter schreiben und prüfen", 3, "newsletter", { werkzeug: "newsletter-check" }),
  v("k-nl-danke", "Danke-Newsletter mit Fotos versenden", -1, "newsletter", { tageVorher: -4 }),
  // Aushang und Flyer
  v("k-print-qr", "QR-Code für Flyer und Plakate erstellen", 5, "aushang", { werkzeug: "qr-set" }),
  v("k-print-druck", "Flyer und Plakate drucken, verteilen und aufhängen", 3, "aushang"),
  // Lokalzeitung und Anzeiger
  v("k-presse-kalender", "Anlass im Veranstaltungskalender der Lokalzeitung melden", 4, "presse", { hinweis: "Frist beim Anzeiger erfragen." }),
  v("k-presse-bericht", "Fotos und Kurzbericht an die Lokalpresse schicken", -1, "presse", { tageVorher: -2 }),
  // WhatsApp
  v("k-wa-einladung", "Einladung per WhatsApp an Kontakte und Gruppen senden", 3, "whatsapp", { werkzeug: "whatsapp-link" }),
  v("k-wa-danke", "Danke-Nachricht per WhatsApp senden", -1, "whatsapp", { tageVorher: -1 }),

  // Bezahlte Inserate: genau zwei Aufgaben
  v("k-ins-buchen", "Inserat planen und buchen", 5, "presse", { nurWenn: "inserate", hinweis: "Frist beim Anzeiger erfragen." }),
  v("k-ins-pruefen", "Inserat prüfen", 2, "presse", { nurWenn: "inserate" }),
];

/** Aufgaben je Art. Die gemeinsamen Aufgaben kommen dazu. */
export const NACH_TYP: Record<TypKey, Vorlage[]> = {
  "tag-der-offenen-tuer": [
    v("tod-anmeldung", "Anmeldung oder Laufkundschaft klären", 8, INTERN),
    v("tod-fuehrungen", "Führungen und Stationen planen", 6, INTERN),
    v("tod-verpflegung", "Verpflegung und Getränke planen", 5, INTERN),
    v("tod-presse", "Medienmitteilung an die Lokalpresse schreiben", 4, "presse", { nurWenn: "presse", werkzeug: "medienmitteilung" }),
    v("tod-schilder", "Wegweiser und Hinweisschilder vorbereiten", 2, INTERN),
    v("tod-nachfassen", "Anfragen aus dem Anlass beantworten", -1, INTERN, { tageVorher: -3 }),
    ...einladungen("tod", 5),
  ],
  eroeffnung: [
    v("er-angebot", "Eröffnungsangebot festlegen", 7, INTERN),
    v("er-gaeste", "Gästeliste für die Einladungen zusammenstellen", 7, INTERN),
    v("er-presse", "Medienmitteilung zur Eröffnung schreiben", 5, "presse", { nurWenn: "presse", werkzeug: "medienmitteilung" }),
    v("er-schaufenster", "Schaufenster und Beschilderung vorbereiten", 4, INTERN),
    v("er-gbp", "Adresse und Öffnungszeiten im Google-Unternehmensprofil prüfen", 3, "gbp"),
    v("er-kontakt", "Gästebuch oder Kontaktkarten bereitlegen", 1, INTERN, { tageVorher: 2 }),
    v("er-nachfassen", "Neue Kontakte nach der Eröffnung anschreiben", -1, INTERN, { tageVorher: -4 }),
    ...einladungen("er", 6),
  ],
  jubilaeum: [
    v("ju-geschichte", "Geschichte und Meilensteine sammeln", 10, INTERN),
    v("ju-bilder", "Alte Fotos und Dokumente zusammentragen", 9, INTERN),
    v("ju-motto", "Motto und Auftritt festlegen", 8, INTERN),
    v("ju-gaeste", "Gäste und Wegbegleiter auflisten", 8, INTERN),
    v("ju-serie", "Rückblicke im Feiertagskalender einplanen", 7, INTERN, { werkzeug: "feiertagskalender" }),
    v("ju-presse", "Medienmitteilung zum Jubiläum schreiben", 5, "presse", { nurWenn: "presse", werkzeug: "medienmitteilung" }),
    v("ju-zeitstrahl", "Zeitstrahl oder Ausstellung für den Anlass vorbereiten", 3, INTERN),
    ...einladungen("ju", 6),
  ],
  messe: [
    v("me-standplatz", "Standplatz buchen und Bedingungen beim Veranstalter erfragen", 10, INTERN),
    v("me-angebot", "Messeangebot oder Muster festlegen", 7, INTERN),
    v("me-material", "Standmaterial, Banner und Beleuchtung planen", 6, INTERN),
    v("me-prospekte", "Prospekte und Visitenkarten drucken lassen", 4, INTERN),
    v("me-besetzung", "Standbesetzung und Pausen planen", 3, INTERN),
    v("me-kontakt", "Kontaktkarten oder Liste für Interessierte vorbereiten", 1, INTERN, { tageVorher: 2 }),
    v("me-nachfassen", "Kontakte von der Messe nachfassen", -1, INTERN, { tageVorher: -3 }),
  ],
  dorffest: [
    v("df-bewilligung", "Bei der Gemeinde nachfragen, ob eine Bewilligung nötig ist", 10, INTERN),
    v("df-helfer", "Helferplan erstellen", 8, INTERN),
    v("df-sponsoren", "Sponsoren anfragen", 8, INTERN, { vereinsTyp: true, werkzeug: "sponsoring-dossier" }),
    v("df-mitglieder", "Mitglieder über Termin und Einsatz informieren", 8, INTERN, { vereinsTyp: true, werkzeug: "vereins-kommunikation" }),
    v("df-verpflegung", "Festwirtschaft und Verpflegung planen", 7, INTERN),
    v("df-verkehr", "Verkehr und Parkplätze klären", 6, INTERN),
    v("df-presse", "Medienmitteilung zum Fest schreiben", 4, "presse", { nurWenn: "presse", werkzeug: "medienmitteilung" }),
    v("df-sponsorenhinweis", "Sponsorenhinweis auf Flyer und Beiträgen einplanen", 4, INTERN),
    v("df-anwohner", "Anwohnende informieren", 3, INTERN),
    v("df-abbau", "Abbau und Aufräumen organisieren", -1, INTERN, { tageVorher: -1 }),
    ...einladungen("df", 5, true),
  ],
  generalversammlung: [
    v("gv-traktanden", "Traktandenliste entwerfen", 8, INTERN),
    v("gv-wahlen", "Wahlen und Rücktritte klären", 7, INTERN),
    v("gv-antraege", "Anträge einsammeln", 6, INTERN, { hinweis: "Frist laut Statuten prüfen." }),
    v("gv-bericht", "Jahresbericht und Rechnung vorbereiten", 6, INTERN),
    v("gv-einladung", "Einladung samt Traktanden versenden", 4, INTERN, { hinweis: "Frist laut Statuten prüfen." }),
    v("gv-lokal", "Lokal und Apéro vorbereiten", 3, INTERN),
    v("gv-unterlagen", "Anwesenheitsliste und Stimmkarten vorbereiten", 1, INTERN, { tageVorher: 3 }),
    v("gv-protokoll", "Protokoll nach dem Anlass schreiben", -1, INTERN, { tageVorher: -7 }),
    v("gv-beschluesse", "Beschlüsse an alle Eingeladenen senden", -1, INTERN, { tageVorher: -5 }),
  ],
};

/** Alle Vorlagen einer Art: gemeinsame zuerst, dann die der Art. */
export const vorlagenFor = (typ: TypKey): Vorlage[] => [...GEMEINSAM, ...NACH_TYP[typ]];
