import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile, ProfileKey } from "@/lib/profile";

// Kanalstrategie: reine Funktionen, kein React, kein DOM, kein Netz (specs/kanalstrategie.md).
// Alles rechnet im Browser (Klasse C, kein Server, keine KI). Es gibt keine Statistik: Alle Eigenschaften der Kanäle, die Gewichte,
// die Schwellen und die Regeln sind ein Richtwert von Alperna, keine Statistik. Im erzeugten Text steht darum keine Ziffer ausser
// «Monat 1 bis 3»; die Passung erscheint nur als Wort.

export const SLUG = "kanalstrategie";
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
/** Der ehrliche Satz zur Grenze des Werkzeugs; steht über dem Formular, im Ergebnis und im Dokument. */
export const GRENZE_NOTE =
  "Das Werkzeug sagt dir, was zu deinen Angaben passt, nicht, was auf einer Plattform gerade am meisten Reichweite bringt.";

// ---- Typ ---------------------------------------------------------------------------------------

export type Typ = "kmu" | "verein";
export const typOf = (organisationstyp: string | undefined): Typ => (organisationstyp === "verein" ? "verein" : "kmu");

/** Wörter, die sich zwischen Betrieb und Verein unterscheiden. */
export type Begriffe = {
  verein: boolean;
  /** «Dein Betrieb» / «Dein Verein» */
  einrichtung: string;
  /** «deine Kundschaft» / «deine Zielgruppe» */
  zielgruppe: string;
  /** «Anfragen» / «Anfragen und Anmeldungen» */
  anfragen: string;
};

export const begriffe = (typ: Typ): Begriffe =>
  typ === "verein"
    ? { verein: true, einrichtung: "Verein", zielgruppe: "deine Zielgruppe", anfragen: "Anfragen und Anmeldungen" }
    : { verein: false, einrichtung: "Betrieb", zielgruppe: "deine Kundschaft", anfragen: "Anfragen" };

// ---- Ziele, Kundschaft, Suchverhalten, Gebiet, Zeit, Fähigkeiten -------------------------------

export type ZielKey = "anfragen" | "bekanntheit" | "binden" | "fachkraefte" | "mitglieder" | "anlaesse" | "sponsoren" | "freiwillige";
export type Ziel = { key: ZielKey; typ: Typ; label: string; /** Ziel «Fachkräfte» oder «Freiwillige»: dort sucht man nicht in Verzeichnissen. */ personal: boolean };

export const ZIELE: readonly Ziel[] = [
  { key: "anfragen", typ: "kmu", label: "Anfragen und Aufträge", personal: false },
  { key: "bekanntheit", typ: "kmu", label: "Bekanntheit in der Region", personal: false },
  { key: "binden", typ: "kmu", label: "Stammkundschaft binden", personal: false },
  { key: "fachkraefte", typ: "kmu", label: "Fachkräfte und Lernende finden", personal: true },
  { key: "mitglieder", typ: "verein", label: "Mitglieder gewinnen", personal: false },
  { key: "anlaesse", typ: "verein", label: "Anlässe füllen", personal: false },
  { key: "sponsoren", typ: "verein", label: "Sponsoren und Gönner finden", personal: false },
  { key: "freiwillige", typ: "verein", label: "Freiwillige finden", personal: true },
];
export const zieleFor = (typ: Typ): Ziel[] => ZIELE.filter((z) => z.typ === typ);
export const zielOf = (key: string): Ziel | undefined => ZIELE.find((z) => z.key === key);
export const zielLegende = "Was soll dein Auftritt zuerst erreichen?";

export type KundschaftKey = "privat" | "firmen" | "beides";
export type SucheKey = "aktiv" | "wecken" | "beides";
export type GebietKey = "ort" | "region" | "schweiz";
export type ZeitStufe = 1 | 2 | 3 | 4;
export type FaehigkeitKey = "text" | "foto" | "video" | "gestaltung";

export const KUNDSCHAFT_KEYS: readonly KundschaftKey[] = ["privat", "firmen", "beides"];
export const SUCHE_KEYS: readonly SucheKey[] = ["aktiv", "wecken", "beides"];
export const GEBIET_KEYS: readonly GebietKey[] = ["ort", "region", "schweiz"];

export const kundschaftLegende = "Wen willst du erreichen?";
export const KUNDSCHAFT_LABEL: Record<Typ, Record<KundschaftKey, string>> = {
  kmu: { privat: "Privatpersonen", firmen: "Firmen", beides: "Beides" },
  verein: { privat: "Mitglieder und Publikum", firmen: "Firmen und Sponsoren", beides: "Beides" },
};
/** Wie die Kundschaft in einem Satz heisst («erreicht Privatpersonen»). */
const KUNDSCHAFT_SATZ: Record<Typ, Record<KundschaftKey, string>> = {
  kmu: { privat: "Privatpersonen", firmen: "Firmen", beides: "Privatpersonen und Firmen" },
  verein: { privat: "Mitglieder und Publikum", firmen: "Firmen und Sponsoren", beides: "Mitglieder, Publikum und Sponsoren" },
};

export const sucheLegende = "Suchen die Leute aktiv nach dir?";
export const SUCHE_LABEL: Record<SucheKey, string> = {
  aktiv: "Ja, sie suchen, wenn sie etwas brauchen",
  wecken: "Nein, ich muss erst Aufmerksamkeit wecken",
  beides: "Beides",
};

export const gebietLegende = "Wie gross ist dein Einzugsgebiet?";
export const GEBIET_LABEL: Record<GebietKey, string> = {
  ort: "Mein Ort und die Umgebung",
  region: "Meine Region oder mein Kanton",
  schweiz: "Die ganze Schweiz",
};

export const zeitLabelText = "Zeit pro Woche für den Auftritt";
export const ZEITEN: readonly { stufe: ZeitStufe; label: string; worte: string }[] = [
  { stufe: 1, label: "Bis 1 Stunde", worte: "bis eine Stunde" },
  { stufe: 2, label: "2 bis 3 Stunden", worte: "zwei bis drei Stunden" },
  { stufe: 3, label: "4 bis 6 Stunden", worte: "vier bis sechs Stunden" },
  { stufe: 4, label: "Mehr als 6 Stunden", worte: "mehr als sechs Stunden" },
];
const zeitOf = (stufe: number) => ZEITEN.find((z) => z.stufe === stufe);

export const faehigkeitLegende = "Was könnt ihr gut?";
export const FAEHIGKEITEN: readonly { key: FaehigkeitKey; label: string }[] = [
  { key: "text", label: "Text" },
  { key: "foto", label: "Foto" },
  { key: "video", label: "Video" },
  { key: "gestaltung", label: "Gestaltung" },
];
const FAEHIGKEIT_KEYS: readonly FaehigkeitKey[] = FAEHIGKEITEN.map((f) => f.key);
const faehigkeitLabel = (key: FaehigkeitKey): string => FAEHIGKEITEN.find((f) => f.key === key)?.label ?? key;

export const heuteLegende = "Wo seid ihr heute aktiv?";

// ---- Grenzen und Gewichte (alles Richtwert von Alperna) ----------------------------------------

/** Höchstsumme der Eignung: Ziel 3, Kundschaft 2, Suchverhalten 2, Gebiet 2. */
export const HOECHSTSUMME = 9;
/** Ab dieser Eignung (0 bis 100) kann ein Kanal Fokus sein; entspricht «passt gut». */
export const SCHWELLE_FOKUS = 60;
/** Ab dieser Eignung kann ein Kanal Ergänzung sein; entspricht «passt teilweise». */
export const SCHWELLE_ERGAENZUNG = 45;
/** Höchstens so viele Fokus-Kanäle: bei Zeitstufe 1 und 2 einer, bei 3 und 4 zwei. */
export const fokusMax = (zeit: ZeitStufe): number => (zeit >= 3 ? 2 : 1);
/** Nur die höchste Zeitstufe hat Platz für Ergänzungen. */
export const ERGAENZUNG_ZEIT: ZeitStufe = 4;
export const ERGAENZUNG_MAX = 2;

// ---- Kanäle ------------------------------------------------------------------------------------

export type KanalKey = "gbp" | "website" | "verzeichnisse" | "whatsapp" | "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "newsletter";
type P3 = 0 | 1 | 2 | 3;
type P2 = 0 | 1 | 2;

export type Kanal = {
  key: KanalKey;
  label: string;
  beschreibung: string;
  /** Wie gut er je Ziel passt (0 bis 3). */
  ziele: Record<ZielKey, P3>;
  /** Wie gut er welche Kundschaft erreicht (0 bis 2). «mitglieder» gilt für Vereine. */
  kundschaft: { privat: P2; firmen: P2; mitglieder: P2 };
  /** Passt zu «sie suchen aktiv» und zu «Aufmerksamkeit wecken» (0 bis 2). */
  suche: { aktiv: P2; wecken: P2 };
  /** Lokal, regional, schweizweit (0 bis 2). */
  gebiet: { ort: P2; region: P2; schweiz: P2 };
  /** Nötige Fähigkeiten: alle Gruppen müssen erfüllt sein, in einer Gruppe genügt eine («Foto oder Video»). */
  faehigkeit: readonly (readonly FaehigkeitKey[])[];
  /** Zeitstufe, ab der der Kanal sinnvoll bespielt werden kann (1 bis 4). */
  aufwand: ZeitStufe;
};

/** Reihenfolge der Ziele: anfragen, bekanntheit, binden, fachkraefte, mitglieder, anlaesse, sponsoren, freiwillige. */
const z = (
  anfragen: P3,
  bekanntheit: P3,
  binden: P3,
  fachkraefte: P3,
  mitglieder: P3,
  anlaesse: P3,
  sponsoren: P3,
  freiwillige: P3,
): Record<ZielKey, P3> => ({ anfragen, bekanntheit, binden, fachkraefte, mitglieder, anlaesse, sponsoren, freiwillige });

/** Feste Reihenfolge; sie entscheidet bei Gleichstand nach «heute aktiv». */
export const KANAELE: readonly Kanal[] = [
  {
    key: "gbp",
    label: "Google-Unternehmensprofil",
    beschreibung: "Dein Eintrag in Google Maps und der Google-Suche mit Öffnungszeiten, Fotos und Bewertungen.",
    ziele: z(3, 2, 1, 0, 1, 1, 0, 0),
    kundschaft: { privat: 2, firmen: 1, mitglieder: 1 },
    suche: { aktiv: 2, wecken: 0 },
    gebiet: { ort: 2, region: 1, schweiz: 0 },
    faehigkeit: [["text", "foto"]],
    aufwand: 1,
  },
  {
    key: "website",
    label: "Website",
    beschreibung: "Deine eigene Seite, auf der Angebot, Kontakt und Referenzen zusammenlaufen.",
    ziele: z(3, 1, 1, 2, 3, 2, 2, 1),
    kundschaft: { privat: 2, firmen: 2, mitglieder: 2 },
    suche: { aktiv: 2, wecken: 0 },
    gebiet: { ort: 2, region: 2, schweiz: 2 },
    faehigkeit: [],
    aufwand: 1,
  },
  {
    key: "verzeichnisse",
    label: "Verzeichnisse",
    beschreibung: "Einträge in Verzeichnissen wie local.ch, search.ch und Branchenverzeichnissen.",
    ziele: z(2, 2, 0, 0, 1, 1, 0, 0),
    kundschaft: { privat: 2, firmen: 1, mitglieder: 1 },
    suche: { aktiv: 2, wecken: 0 },
    gebiet: { ort: 2, region: 2, schweiz: 1 },
    faehigkeit: [["text"]],
    aufwand: 1,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    beschreibung: "Direkter Kontakt per Nachricht, mit Business-Profil, Chat-Link und Status.",
    ziele: z(2, 0, 3, 0, 2, 2, 1, 2),
    kundschaft: { privat: 2, firmen: 1, mitglieder: 2 },
    suche: { aktiv: 1, wecken: 0 },
    gebiet: { ort: 2, region: 1, schweiz: 0 },
    faehigkeit: [["text"]],
    aufwand: 1,
  },
  {
    key: "instagram",
    label: "Instagram",
    beschreibung: "Bilder und kurze Videos für Leute, die dich noch nicht kennen.",
    ziele: z(1, 3, 2, 2, 2, 3, 1, 2),
    kundschaft: { privat: 2, firmen: 0, mitglieder: 2 },
    suche: { aktiv: 0, wecken: 2 },
    gebiet: { ort: 2, region: 2, schweiz: 1 },
    faehigkeit: [["foto", "video", "gestaltung"]],
    aufwand: 2,
  },
  {
    key: "facebook",
    label: "Facebook",
    beschreibung: "Seite, Beiträge und Veranstaltungen für Leute aus der Region.",
    ziele: z(1, 2, 2, 1, 2, 3, 1, 2),
    kundschaft: { privat: 2, firmen: 1, mitglieder: 2 },
    suche: { aktiv: 0, wecken: 1 },
    gebiet: { ort: 2, region: 2, schweiz: 1 },
    faehigkeit: [["text", "foto"]],
    aufwand: 2,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    beschreibung: "Berufliches Netzwerk für Firmen, Fachleute und Stellensuchende.",
    ziele: z(2, 1, 0, 3, 0, 0, 3, 0),
    kundschaft: { privat: 0, firmen: 2, mitglieder: 0 },
    suche: { aktiv: 0, wecken: 2 },
    gebiet: { ort: 0, region: 1, schweiz: 2 },
    faehigkeit: [["text"]],
    aufwand: 2,
  },
  {
    key: "tiktok",
    label: "TikTok",
    beschreibung: "Kurze Videos, die auch Leute ausserhalb deines Umfelds erreichen.",
    ziele: z(0, 3, 1, 3, 2, 2, 0, 2),
    kundschaft: { privat: 2, firmen: 0, mitglieder: 2 },
    suche: { aktiv: 0, wecken: 2 },
    gebiet: { ort: 1, region: 1, schweiz: 2 },
    faehigkeit: [["video"]],
    aufwand: 3,
  },
  {
    key: "youtube",
    label: "YouTube",
    beschreibung: "Längere Videos, die gefunden werden, wenn jemand eine Frage hat.",
    ziele: z(2, 2, 1, 1, 1, 1, 1, 0),
    kundschaft: { privat: 2, firmen: 2, mitglieder: 1 },
    suche: { aktiv: 2, wecken: 1 },
    gebiet: { ort: 0, region: 1, schweiz: 2 },
    faehigkeit: [["video"]],
    aufwand: 4,
  },
  {
    key: "newsletter",
    label: "Newsletter",
    beschreibung: "E-Mails an Leute, die sich dafür angemeldet haben.",
    ziele: z(2, 1, 3, 0, 2, 3, 2, 1),
    kundschaft: { privat: 2, firmen: 2, mitglieder: 2 },
    suche: { aktiv: 1, wecken: 0 },
    gebiet: { ort: 2, region: 2, schweiz: 2 },
    faehigkeit: [["text"]],
    aufwand: 3,
  },
];

export const KANAL_KEYS: readonly KanalKey[] = KANAELE.map((k) => k.key);
export const kanalOf = (key: KanalKey): Kanal => KANAELE.find((k) => k.key === key) as Kanal;
export const kanalLabel = (key: KanalKey): string => kanalOf(key).label;
const isKanal = (v: unknown): v is KanalKey => typeof v === "string" && (KANAL_KEYS as readonly string[]).includes(v);

/** Reihenfolge der Basis-Kanäle im Ergebnis. */
export const BASIS_REIHENFOLGE: readonly KanalKey[] = ["website", "gbp", "verzeichnisse"];

// ---- Links auf andere Werkzeuge ----------------------------------------------------------------

export type WerkzeugLink = { slug: string; name: string };

const L = {
  bewertungsKit: { slug: "bewertungs-kit", name: "Bewertungs-Kit für Google" },
  gbpFeiertage: { slug: "gbp-feiertage", name: "Öffnungszeiten an Feiertagen" },
  whatsappLink: { slug: "whatsapp-link", name: "WhatsApp-Link mit QR" },
  qrSet: { slug: "qr-set", name: "QR-Set für Flyer und Aufkleber" },
  contentSaeulen: { slug: "inhalte-saeulen", name: "Themensäulen" },
  postingPlan: { slug: "posting-plan", name: "Posting-Plan nach Zeitbudget" },
  newsletterCheck: { slug: "newsletter-check", name: "Newsletter-Check" },
  linkedinProfil: { slug: "linkedin-profil", name: "LinkedIn-Profil-Score" },
  auftrittCheck: { slug: "digitaler-auftritt-check", name: "Digitaler-Auftritt-Check" },
  verzeichnisse: { slug: "verzeichnisse", name: "Verzeichnis-Check" },
} as const satisfies Record<string, WerkzeugLink>;

/** Welches Werkzeug beim ersten Schritt eines Kanals hilft. Nur Slugs aus tools/ (der Test prüft es). */
export const KANAL_LINKS: Record<KanalKey, readonly WerkzeugLink[]> = {
  gbp: [L.bewertungsKit, L.gbpFeiertage],
  website: [L.auftrittCheck],
  verzeichnisse: [L.verzeichnisse],
  whatsapp: [L.whatsappLink, L.qrSet],
  instagram: [L.contentSaeulen, L.postingPlan],
  facebook: [L.contentSaeulen, L.postingPlan],
  linkedin: [L.linkedinProfil, L.contentSaeulen, L.postingPlan],
  tiktok: [L.contentSaeulen],
  youtube: [L.contentSaeulen],
  newsletter: [L.newsletterCheck],
};

// ---- Texte je Kanal: erster Schritt und Aufgabe im Plan ----------------------------------------

type Schritt = (b: Begriffe) => string;

/** Der erste Schritt: «neu», wenn die Person den Kanal heute nicht bespielt, «aktiv», wenn doch. */
const SCHRITTE: Record<KanalKey, { neu: Schritt; aktiv: Schritt }> = {
  gbp: {
    neu: (b) =>
      b.verein
        ? "Lege ein Google-Unternehmensprofil für den Verein an und trage Adresse, Zeiten und ein Foto ein."
        : "Lege dein Google-Unternehmensprofil an und trage Adresse, Öffnungszeiten, Leistungen und ein paar Fotos ein.",
    aktiv: (b) =>
      b.verein
        ? "Prüfe Zeiten und Fotos im Google-Profil des Vereins und bitte Mitglieder um eine Bewertung."
        : "Prüfe Öffnungszeiten, Leistungen und Fotos in deinem Google-Unternehmensprofil und bitte zufriedene Kundschaft um eine Bewertung.",
  },
  website: {
    neu: (b) =>
      b.verein
        ? "Schreib auf die Startseite, was der Verein anbietet, für wen und wo, und setz Kontakt und Anmeldeweg gut sichtbar dazu."
        : "Schreib auf die Startseite, was du anbietest, für wen und wo, und setz Telefonnummer und Anfrageweg gut sichtbar dazu.",
    aktiv: (b) =>
      b.verein
        ? "Lies die Startseite wie eine fremde Person: Steht dort, was der Verein anbietet, für wen und wie man mitmacht?"
        : "Lies deine Startseite wie eine fremde Person: Steht dort, was du anbietest, für wen und wie man dich erreicht?",
  },
  verzeichnisse: {
    neu: (b) =>
      b.verein
        ? "Trag den Verein bei local.ch und search.ch ein und, falls es eines gibt, im Vereinsverzeichnis deiner Gemeinde, mit gleichem Namen und gleichem Kontakt wie auf der Website."
        : "Trag deinen Betrieb bei local.ch und search.ch ein, mit gleichem Namen, gleicher Adresse und gleicher Telefonnummer wie auf deiner Website.",
    aktiv: () => "Vergleiche Name, Adresse und Telefonnummer in den Verzeichnissen mit deiner Website. Sie müssen übereinstimmen.",
  },
  whatsapp: {
    neu: () => "Richte WhatsApp Business ein, schreib eine Begrüssung und eine Abwesenheitsnachricht und setz den Link auf deine Website.",
    aktiv: () => "Prüfe Begrüssung und Antwortzeit und setz den Link zu deinem Chat auf Website, Visitenkarte und Flyer.",
  },
  instagram: {
    neu: (b) =>
      b.verein
        ? "Lege ein Profil an mit klarer Kurzbeschreibung, Ort und Link, und plane den ersten Beitrag mit einem Foto vom letzten Anlass."
        : "Lege ein Profil an mit klarer Kurzbeschreibung, Ort und Link, und plane den ersten Beitrag mit einem Foto einer fertigen Arbeit.",
    aktiv: (b) =>
      b.verein
        ? "Leg fest, welche Themen der Verein regelmässig zeigt, und trag die nächsten Beiträge in einen Plan ein."
        : "Leg fest, über welche Themen du regelmässig zeigst, was du tust, und trag die nächsten Beiträge in einen Plan ein.",
  },
  facebook: {
    neu: (b) =>
      b.verein
        ? "Lege eine Seite für den Verein an, mit Ort, Kontakt und Link zur Website, und erstelle den nächsten Anlass als Veranstaltung."
        : "Lege eine Seite für deinen Betrieb an, kein privates Profil, mit Adresse, Öffnungszeiten und Link zur Website.",
    aktiv: (b) =>
      b.verein
        ? "Prüfe, ob Seite, Kontakt und Termine stimmen, und plane den nächsten Beitrag mit einem eigenen Foto."
        : "Prüfe, ob Seite, Öffnungszeiten und Link stimmen, und plane den nächsten Beitrag mit einem eigenen Foto.",
  },
  linkedin: {
    neu: (b) =>
      b.verein
        ? "Lege eine Seite für den Verein an und schreib in einem Satz, wofür er steht und wen er sucht."
        : "Schreib die Kurzbeschreibung deines Profils so, dass klar ist, wem du bei was hilfst, und verlinke die Firmenseite.",
    aktiv: () => "Prüfe die Kurzbeschreibung deines Profils und plane einen Beitrag über ein abgeschlossenes Projekt.",
  },
  tiktok: {
    neu: (b) =>
      b.verein
        ? "Lege ein Profil an und plane ein kurzes Video mit einem Moment aus dem Vereinsleben."
        : "Lege ein Profil an und plane ein kurzes Video, das einen Handgriff oder einen Moment aus deinem Alltag zeigt.",
    aktiv: () => "Leg fest, welche Art Video du regelmässig zeigst, und plane die nächsten Videos.",
  },
  youtube: {
    neu: (b) =>
      b.verein
        ? "Sammle die Fragen, die Interessierte am häufigsten stellen, und plane ein Video, das eine davon beantwortet."
        : "Sammle die Fragen, die deine Kundschaft am häufigsten stellt, und plane ein Video, das eine davon beantwortet.",
    aktiv: () => "Prüfe, welche Videos eine Frage beantworten, und gib ihnen Titel und Beschreibung, mit denen man sie findet.",
  },
  newsletter: {
    neu: () => "Lege eine Adressliste von Leuten an, die den Newsletter wollen, und plane die erste Ausgabe zu einer Frage, die du oft hörst.",
    aktiv: () => "Prüfe deine letzte Ausgabe: Hat sie ein Ziel, einen klaren Betreff und einen Link?",
  },
};

/** Kurze Aufgabe für den Plan der nächsten drei Monate. */
const AUFGABEN: Record<KanalKey, string> = {
  gbp: "Profil vollständig ausfüllen, Fotos hochladen, um Bewertungen bitten",
  website: "Startseite prüfen: Angebot, Ort, Kontakt und Anfrageweg",
  verzeichnisse: "Einträge anlegen oder abgleichen: Name, Adresse, Telefonnummer",
  whatsapp: "Business-Profil einrichten, Begrüssung schreiben, Link platzieren",
  instagram: "Profil einrichten und Beiträge nach Plan veröffentlichen",
  facebook: "Seite einrichten und Beiträge und Termine nach Plan veröffentlichen",
  linkedin: "Profil schärfen und Fachbeiträge nach Plan veröffentlichen",
  tiktok: "Kurze Videos nach Plan aufnehmen und veröffentlichen",
  youtube: "Videos zu häufigen Fragen aufnehmen und beschriften",
  newsletter: "Adressliste aufbauen und Ausgaben nach Plan versenden",
};

// ---- Eingabe -----------------------------------------------------------------------------------

export type Input = {
  typ: Typ;
  ziel: ZielKey | "";
  kundschaft: KundschaftKey | "";
  suche: SucheKey | "";
  gebiet: GebietKey | "";
  /** 0 heisst «noch nicht gewählt», 1 bis 4 sind die Stufen. */
  zeit: 0 | ZeitStufe;
  faehigkeiten: FaehigkeitKey[];
  /** null: noch nichts gewählt, dann gelten die Kanäle aus dem Profil als Vorschlag. */
  heute: KanalKey[] | null;
};

/** Eine vollständige Eingabe. */
export type Geprueft = Input & { ziel: ZielKey; kundschaft: KundschaftKey; suche: SucheKey; gebiet: GebietKey; zeit: ZeitStufe; heute: KanalKey[] };

export const emptyInput = (typ: Typ = "kmu"): Input => ({ typ, ziel: "", kundschaft: "", suche: "", gebiet: "", zeit: 0, faehigkeiten: [], heute: null });

/** Wechselt der Typ (Betrieb/Verein), passt das gewählte Ziel nicht mehr; es fällt weg. */
export function mitTyp(input: Input, typ: Typ): Input {
  const ziel = input.ziel !== "" && zielOf(input.ziel)?.typ === typ ? input.ziel : "";
  return { ...input, typ, ziel };
}

const canon = <T extends string>(all: readonly T[], list: readonly unknown[]): T[] => all.filter((k) => list.includes(k));

// Kanäle aus dem Profil: Namen per Wortvergleich auf die Liste abbilden, Unbekanntes bleibt weg.
const HEUTE_RE: Record<KanalKey, RegExp> = {
  gbp: /unternehmensprofil|business[- ]?profil|google[- ]?(?:business|maps|profil|my business|unternehmen)|\bgbp\b/i,
  website: /website|webseite|homepage|internetseite|\bblog\b/i,
  verzeichnisse: /verzeichnis|local\.ch|search\.ch|branchenbuch|gelbe seiten/i,
  whatsapp: /whats\s?app/i,
  instagram: /instagram/i,
  facebook: /facebook/i,
  linkedin: /linked\s?in/i,
  tiktok: /tik\s?tok/i,
  youtube: /you\s?tube/i,
  newsletter: /newsletter|e-?mail|mailing/i,
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Kanäle aus `profile.kanaele` (Einträge mit «name» oder «kanal»), in der festen Reihenfolge; leer, wenn keiner passt. */
export function heuteAusProfil(kanaele: readonly unknown[] | undefined): KanalKey[] {
  const found: KanalKey[] = [];
  for (const k of kanaele ?? []) {
    const r = isObj(k) ? k : {};
    const name = [r.name, r.kanal].find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (!name) continue;
    for (const key of KANAL_KEYS) if (HEUTE_RE[key].test(name)) found.push(key);
  }
  return canon(KANAL_KEYS, found);
}

/** Die Kanäle, die heute als aktiv gelten: die Wahl der Person, sonst der Vorschlag aus dem Profil. */
export const heuteOf = (input: Pick<Input, "heute">, profile: Pick<Profile, "kanaele">): KanalKey[] => input.heute ?? heuteAusProfil(profile.kanaele);

// ---- Prüfung -----------------------------------------------------------------------------------

export type Problem = { message: string; fieldId: string };

export const FIELD_IDS = {
  firma: "ks-firma",
  ziel: "ks-ziel",
  kundschaft: "ks-kundschaft",
  suche: "ks-suche",
  gebiet: "ks-gebiet",
  zeit: "ks-zeit",
  faehigkeiten: "ks-faehigkeiten",
  heute: "ks-heute",
} as const;

/** Wie viele der sechs Pflichtangaben stehen (Firma, Ziel, Kundschaft, Suchverhalten, Gebiet, Zeit). */
export const PFLICHTANGABEN = 6;
export function angaben(firma: string | undefined, input: Input): number {
  const zielOk = input.ziel !== "" && zielOf(input.ziel)?.typ === input.typ;
  return [(firma ?? "").trim() !== "", zielOk, input.kundschaft !== "", input.suche !== "", input.gebiet !== "", input.zeit !== 0].filter(Boolean).length;
}

/** Erste Meldung oder null. Fähigkeiten und heutige Kanäle sind freiwillig. */
export function validate(firma: string | undefined, input: Input): Problem | null {
  const verein = input.typ === "verein";
  if (!(firma ?? "").trim()) {
    return { message: verein ? "Gib den Namen deines Vereins an." : "Gib den Namen deines Betriebs an.", fieldId: FIELD_IDS.firma };
  }
  if (input.ziel === "" || zielOf(input.ziel)?.typ !== input.typ) {
    return { message: "Wähle, was dein Auftritt zuerst erreichen soll.", fieldId: FIELD_IDS.ziel };
  }
  if (input.kundschaft === "") return { message: "Wähle, wen du erreichen willst.", fieldId: FIELD_IDS.kundschaft };
  if (input.suche === "") return { message: "Wähle, ob die Leute aktiv nach dir suchen.", fieldId: FIELD_IDS.suche };
  if (input.gebiet === "") return { message: "Wähle dein Einzugsgebiet.", fieldId: FIELD_IDS.gebiet };
  if (input.zeit === 0) return { message: "Wähle, wie viel Zeit du pro Woche hast.", fieldId: FIELD_IDS.zeit };
  return null;
}

/** Eine vollständige Eingabe oder null. `heute: null` gilt als «keiner». */
export function geprueft(input: Input): Geprueft | null {
  const { ziel, kundschaft, suche, gebiet, zeit } = input;
  if (ziel === "" || zielOf(ziel)?.typ !== input.typ || kundschaft === "" || suche === "" || gebiet === "" || zeit === 0) return null;
  return { ...input, ziel, kundschaft, suche, gebiet, zeit, heute: input.heute ?? [] };
}

// ---- Eignung -----------------------------------------------------------------------------------

export type Teilwerte = { ziel: P3; kundschaft: P2; suche: P2; gebiet: P2 };

/** Die vier Teilwerte eines Kanals für diese Eingabe. «Beides» zählt den besseren der beiden Werte. */
export function teilwerte(k: Kanal, i: Pick<Geprueft, "typ" | "ziel" | "kundschaft" | "suche" | "gebiet">): Teilwerte {
  const spalten: ("privat" | "firmen" | "mitglieder")[] =
    i.kundschaft === "beides" ? (i.typ === "verein" ? ["mitglieder", "firmen"] : ["privat", "firmen"]) : [i.kundschaft === "firmen" ? "firmen" : i.typ === "verein" ? "mitglieder" : "privat"];
  const kundschaft = Math.max(...spalten.map((s) => k.kundschaft[s])) as P2;
  const suche = (i.suche === "beides" ? Math.max(k.suche.aktiv, k.suche.wecken) : k.suche[i.suche]) as P2;
  return { ziel: k.ziele[i.ziel], kundschaft, suche, gebiet: k.gebiet[i.gebiet] };
}

/** Eignung 0 bis 100: Summe der Teilwerte durch die Höchstsumme, gerundet. Richtwert von Alperna, keine Statistik. */
export function eignung(k: Kanal, i: Pick<Geprueft, "typ" | "ziel" | "kundschaft" | "suche" | "gebiet">): number {
  const t = teilwerte(k, i);
  return Math.round((100 * (t.ziel + t.kundschaft + t.suche + t.gebiet)) / HOECHSTSUMME);
}

export type Passung = "gut" | "teilweise" | "wenig";
export const PASSUNG_TEXT: Record<Passung, string> = { gut: "passt gut", teilweise: "passt teilweise", wenig: "passt wenig" };
export function passungOf(wert: number): Passung {
  if (wert >= SCHWELLE_FOKUS) return "gut";
  if (wert >= SCHWELLE_ERGAENZUNG) return "teilweise";
  return "wenig";
}

/** Die erste Gruppe nötiger Fähigkeiten, von der keine angegeben ist; null, wenn alles da ist. */
export function fehlendeFaehigkeit(k: Pick<Kanal, "faehigkeit">, haben: readonly FaehigkeitKey[]): readonly FaehigkeitKey[] | null {
  return k.faehigkeit.find((gruppe) => !gruppe.some((f) => haben.includes(f))) ?? null;
}

function oderListe(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} oder ${list[list.length - 1]}`;
}
function undListe(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} und ${list[list.length - 1]}`;
}

// ---- Rollen ------------------------------------------------------------------------------------

export type Rolle = "basis" | "fokus" | "ergaenzung" | "vorerst";
export const ROLLEN: readonly Rolle[] = ["basis", "fokus", "ergaenzung", "vorerst"];
export const ROLLE_LABEL: Record<Rolle, string> = { basis: "Basis", fokus: "Fokus", ergaenzung: "Ergänzung", vorerst: "Vorerst nicht" };
export const ROLLE_INTRO: Record<Rolle, string> = {
  basis: "Das gehört zu jedem Auftritt, unabhängig von der Passung. Richte es einmal sauber ein, danach genügt gelegentliches Prüfen.",
  fokus: "Hier steckst du deine Zeit zuerst hinein.",
  ergaenzung: "Diese Kanäle kommen dazu, sobald dein Fokus läuft.",
  vorerst: "Diese Kanäle lässt du zuerst weg. Der Grund steht bei jedem. Läuft dein Fokus, nimmst du den nächsten dazu.",
};

/** Welche Kanäle Basis sind. Die Website immer; Google-Unternehmensprofil und Verzeichnisse nach den Regeln aus der Spec. */
export function basisKanaele(i: Pick<Geprueft, "typ" | "ziel" | "gebiet" | "zeit">): KanalKey[] {
  const lokal = i.gebiet === "ort" || i.gebiet === "region";
  const out: KanalKey[] = ["website"];
  if (i.typ === "kmu" && (lokal || i.ziel === "anfragen")) out.push("gbp");
  if (lokal && i.zeit >= 1 && !zielOf(i.ziel)?.personal) out.push("verzeichnisse");
  return BASIS_REIHENFOLGE.filter((k) => out.includes(k));
}

function basisGrund(key: KanalKey, i: Geprueft): string {
  const lokal = i.gebiet === "ort" || i.gebiet === "region";
  if (key === "website") return "Alle anderen Kanäle führen auf die Website. Sie ist die Grundlage deines Auftritts.";
  if (key === "gbp") {
    return lokal
      ? "Dein Gebiet ist lokal, und wer in der Nähe sucht, findet zuerst das Google-Profil."
      : "Du willst Anfragen, und die beginnen oft mit einer Google-Suche.";
  }
  return "Dein Gebiet ist lokal, und Verzeichnisse tauchen bei Suchen in der Nähe auf.";
}

// ---- Begründung --------------------------------------------------------------------------------

type Stufe = "hoch" | "mittel" | "niedrig";
const stufe = (wert: number, hoch: number): Stufe => (wert >= hoch ? "hoch" : wert > 0 ? "mittel" : "niedrig");

/** Satz aus den Angaben: was passt, und was weniger passt. Ohne Ziffern. */
export function begruendung(k: Kanal, i: Geprueft): string {
  const b = begriffe(i.typ);
  const t = teilwerte(k, i);
  const ziel = zielOf(i.ziel)?.label ?? "";
  const stufen = { ziel: stufe(t.ziel, 2), kundschaft: stufe(t.kundschaft, 2), suche: stufe(t.suche, 2), gebiet: stufe(t.gebiet, 2) };

  const sucheSatz =
    i.suche === "aktiv"
      ? "wird gefunden, wenn Leute aktiv suchen"
      : i.suche === "wecken"
        ? "weckt Aufmerksamkeit bei Leuten, die dich noch nicht kennen"
        : "passt dazu, dass Leute dich suchen oder erst auf dich aufmerksam werden müssen";
  const gebietSatz = { ort: "passt zu deinem Ort und der Umgebung", region: "passt zu deiner Region", schweiz: "passt zur ganzen Schweiz" }[i.gebiet];

  const gut: string[] = [];
  if (stufen.ziel === "hoch") gut.push(`passt zu deinem Ziel «${ziel}»`);
  if (stufen.kundschaft === "hoch") gut.push(`erreicht ${KUNDSCHAFT_SATZ[i.typ][i.kundschaft]}`);
  if (stufen.suche === "hoch") gut.push(sucheSatz);
  if (stufen.gebiet === "hoch") gut.push(gebietSatz);

  if (gut.length === 0) return "Passt in keinem Punkt klar zu deinen Angaben.";
  const satz = `${gut.join("; ").replace(/^./, (c) => c.toUpperCase())}.`;

  const schwach: string[] = [];
  if (stufen.ziel !== "hoch") schwach.push("dein Ziel");
  if (stufen.kundschaft !== "hoch") schwach.push(b.zielgruppe);
  if (stufen.suche !== "hoch") schwach.push("das Suchverhalten");
  if (stufen.gebiet !== "hoch") schwach.push("dein Gebiet");
  return schwach.length === 0 ? satz : `${satz} Weniger passend: ${undListe(schwach)}.`;
}

// ---- Auswertung --------------------------------------------------------------------------------

export type KanalErgebnis = {
  key: KanalKey;
  label: string;
  beschreibung: string;
  rolle: Rolle;
  /** 0 bis 100; erscheint nur als Balken, nie als Zahl im Text. */
  eignung: number;
  passung: Passung;
  passungText: string;
  begruendung: string;
  /** Nur bei «Vorerst nicht»: warum. Sonst leer. */
  grund: string;
  /** Der erste Schritt; leer bei «Vorerst nicht». */
  schritt: string;
  aufgabe: string;
  links: WerkzeugLink[];
  heuteAktiv: boolean;
};

export type Monat = { nr: 1 | 2 | 3; titel: string; text: string; punkte: { kanal: string; aufgabe: string }[] };

export type Auswertung = {
  input: Geprueft;
  typ: Typ;
  /** Alle zehn Kanäle: Basis, Fokus, Ergänzung, dann «Vorerst nicht»; innerhalb einer Rolle nach Eignung. */
  kanaele: KanalErgebnis[];
  basis: KanalErgebnis[];
  fokus: KanalErgebnis[];
  ergaenzung: KanalErgebnis[];
  vorerst: KanalErgebnis[];
  /** Heute aktiv und «Vorerst nicht». */
  pausieren: KanalErgebnis[];
  /** Warum es keinen Fokus gibt; null, wenn es einen gibt. */
  fokusLeer: string | null;
  aussage: string;
  monate: Monat[];
  hinweise: string[];
};

type Zeile = { k: Kanal; wert: number; aktiv: boolean; index: number };

/** Höhere Eignung zuerst; bei Gleichstand der Kanal, den die Person heute schon bespielt; dann die feste Reihenfolge. */
export function vergleiche(a: Pick<Zeile, "wert" | "aktiv" | "index">, b: Pick<Zeile, "wert" | "aktiv" | "index">): number {
  return b.wert - a.wert || Number(b.aktiv) - Number(a.aktiv) || a.index - b.index;
}

/** Für den Ausschluss: Fähigkeit, dann Zeit; null, wenn der Kanal möglich ist. */
export function ausschluss(k: Kanal, i: Pick<Geprueft, "faehigkeiten" | "zeit">): string | null {
  const fehlt = fehlendeFaehigkeit(k, i.faehigkeiten);
  if (fehlt) {
    const namen = fehlt.map(faehigkeitLabel);
    return fehlt.length === 1
      ? `Du hast die Fähigkeit ${namen[0]} nicht angegeben.`
      : `Du hast keine der Fähigkeiten ${oderListe(namen)} angegeben.`;
  }
  if (k.aufwand > i.zeit) return "Dafür brauchst du mehr Zeit pro Woche, als du angegeben hast.";
  return null;
}

/** Fähigkeit und Zeit reichen, und der Kanal trägt etwas zum Ziel bei: dann kann er Fokus oder Ergänzung werden. */
export function moeglich(k: Kanal, i: Geprueft): boolean {
  return ausschluss(k, i) === null && teilwerte(k, i).ziel > 0;
}

/** Ein Kanal, der zum Ziel nichts beiträgt, wird nie Fokus oder Ergänzung, auch wenn die übrigen Angaben passen. */
export const KEIN_BEITRAG_ZUM_ZIEL = "Dieser Kanal trägt kaum zu deinem Ziel bei.";

function vorerstGrund(wert: number, zielWert: number, i: Geprueft): string {
  if (zielWert === 0) return KEIN_BEITRAG_ZUM_ZIEL;
  if (wert < SCHWELLE_ERGAENZUNG) return "Dieser Kanal passt zu wenig zu deinen Angaben.";
  if (i.zeit === ERGAENZUNG_ZEIT) {
    return wert >= SCHWELLE_FOKUS
      ? "Dieser Kanal passt gut, aber Fokus und Ergänzungen sind schon besetzt."
      : "Dieser Kanal passt teilweise, und die Ergänzungen sind schon besetzt.";
  }
  if (wert >= SCHWELLE_FOKUS) {
    return fokusMax(i.zeit) === 1
      ? "Dieser Kanal passt gut, aber deine Zeit reicht für einen Fokus-Kanal, und der ist schon besetzt."
      : "Dieser Kanal passt gut, aber deine Zeit reicht für zwei Fokus-Kanäle, und die sind schon besetzt.";
  }
  return "Dieser Kanal passt nur teilweise, für den Fokus reicht es nicht.";
}

export function listText(labels: readonly string[]): string {
  return undListe(labels);
}

function aussageText(basis: readonly KanalErgebnis[], fokus: readonly KanalErgebnis[], ergaenzung: readonly KanalErgebnis[]): string {
  const teile = [`Basis: ${listText(basis.map((k) => k.label))}.`];
  teile.push(fokus.length > 0 ? `Fokus: ${listText(fokus.map((k) => k.label))}.` : "Kein Fokus-Kanal.");
  if (ergaenzung.length > 0) teile.push(`Ergänzung: ${listText(ergaenzung.map((k) => k.label))}.`);
  return teile.join(" ");
}

export function monatePlan(basis: readonly KanalErgebnis[], fokus: readonly KanalErgebnis[], ergaenzung: readonly KanalErgebnis[]): Monat[] {
  const punkte = (list: readonly KanalErgebnis[]) => list.map((k) => ({ kanal: k.label, aufgabe: k.aufgabe }));
  const m1: Monat = { nr: 1, titel: "Basis aufbauen", text: "Richte die Basis-Kanäle ein, einen nach dem anderen.", punkte: punkte(basis) };
  const m2: Monat =
    fokus.length > 0
      ? {
          nr: 2,
          titel: "Fokus",
          text: fokus.length === 1 ? "Konzentriere dich auf deinen Fokus-Kanal." : "Konzentriere dich auf deine Fokus-Kanäle.",
          punkte: punkte(fokus),
        }
      : { nr: 2, titel: "Fokus", text: "Es gibt keinen Fokus-Kanal. Verbessere in diesem Monat die Basis und notiere, woher Kontakte kommen.", punkte: [] };
  const m3: Monat =
    ergaenzung.length > 0
      ? {
          nr: 3,
          titel: "Ergänzung",
          text: "Nimm die Ergänzung dazu, sobald der Fokus läuft. Prüfe am Ende des Monats, woher Kontakte kommen.",
          punkte: punkte(ergaenzung),
        }
      : {
          nr: 3,
          titel: "Prüfen und anpassen",
          text: "Prüfe, woher Kontakte kommen. Behalte, was funktioniert, und entscheide, ob ein Kanal aus «Vorerst nicht» an die Reihe kommt.",
          punkte: [],
        };
  return [m1, m2, m3];
}

/** Drei Hinweise, je nach Angaben. Ohne Ziffern. */
export function hinweiseFor(i: Geprueft): string[] {
  const b = begriffe(i.typ);
  const eins =
    i.zeit <= 2
      ? `Mit wenig Zeit gilt: Ein Kanal richtig ist besser als drei halb. Starte mit dem Fokus und lass den Rest warten (${RICHTWERT_NOTE}).`
      : `Auch mit mehr Zeit lohnt es sich, einen Kanal nach dem anderen zu starten. Nimm den zweiten erst dazu, wenn der erste läuft (${RICHTWERT_NOTE}).`;
  const zwei =
    i.faehigkeiten.length === 0
      ? "Du hast keine Fähigkeit angegeben, darum bleibt es bei den Basis-Kanälen. Mit Text oder Foto kommen weitere Kanäle dazu, oder du holst dir Unterstützung."
      : `Deine Fähigkeiten (${i.faehigkeiten.map(faehigkeitLabel).join(", ")}) bestimmen, welche Kanäle möglich sind. Was fehlt, kannst du lernen oder abgeben.`;
  const wecken = i.suche === "wecken" || i.suche === "beides";
  const drei =
    wecken && !i.faehigkeiten.includes("foto") && !i.faehigkeiten.includes("video")
      ? "Wer erst Aufmerksamkeit wecken muss, braucht meist Bilder oder Videos. Ohne Foto und Video fehlen dir die Kanäle dafür. Plane einen Termin für Fotos oder hol dir Unterstützung."
      : `Prüfe nach drei Monaten, woher ${b.anfragen} kommen, und passe die Rollen an. Die Rangfolge ordnet deine Angaben, mehr nicht.`;
  return [eins, zwei, drei];
}

/** Wie gerechnet wird; steht im Dokument und unter dem Ergebnis. Ohne Ziffern. */
export const rechnungFor = (typ: Typ): string[] => [
  `Alle Eigenschaften der Kanäle, die Gewichte, die Schwellen und die Regeln sind ein ${RICHTWERT_NOTE}.`,
  `Jeder Kanal bekommt eine Eignung aus vier Teilen: Ziel, ${typ === "verein" ? "Zielgruppe" : "Kundschaft"}, Suchverhalten und Einzugsgebiet. Sie erscheint nur als Balken und als Wort.`,
  "Fokus wird nur ein Kanal mit hoher Eignung, Ergänzung auch einer mit mittlerer.",
  "Fehlt die Fähigkeit, reicht die Zeit nicht oder trägt der Kanal kaum zu deinem Ziel bei, wird er nie Fokus oder Ergänzung.",
  "Website, Google-Unternehmensprofil und Verzeichnisse sind Basis, wenn deine Angaben dazu passen.",
  "Bis drei Stunden pro Woche gibt es einen Fokus-Kanal, ab vier Stunden zwei, bei mehr als sechs Stunden zusätzlich bis zu zwei Ergänzungen.",
  "Bei gleicher Eignung gewinnt der Kanal, den du heute schon bespielst.",
];

export function auswerten(input: Input): Auswertung | null {
  const g = geprueft(input);
  if (!g) return null;
  const typ = g.typ;
  const b = begriffe(typ);
  const basisKeys = basisKanaele(g);

  const zeilen: Zeile[] = KANAELE.map((k, index) => ({ k, wert: eignung(k, g), aktiv: g.heute.includes(k.key), index }));
  const beitrag = (r: Zeile): number => teilwerte(r.k, g).ziel;
  const kandidaten = zeilen.filter((r) => !basisKeys.includes(r.k.key) && moeglich(r.k, g)).sort(vergleiche);
  const fokusZeilen = kandidaten.filter((r) => r.wert >= SCHWELLE_FOKUS).slice(0, fokusMax(g.zeit));
  const rest = kandidaten.filter((r) => !fokusZeilen.includes(r));
  const ergaenzungZeilen = g.zeit === ERGAENZUNG_ZEIT ? rest.filter((r) => r.wert >= SCHWELLE_ERGAENZUNG).slice(0, ERGAENZUNG_MAX) : [];

  const rolleOf = (r: Zeile): Rolle =>
    basisKeys.includes(r.k.key) ? "basis" : fokusZeilen.includes(r) ? "fokus" : ergaenzungZeilen.includes(r) ? "ergaenzung" : "vorerst";

  const make = (r: Zeile): KanalErgebnis => {
    const rolle = rolleOf(r);
    const passung = passungOf(r.wert);
    const grund = rolle === "vorerst" ? (ausschluss(r.k, g) ?? vorerstGrund(r.wert, beitrag(r), g)) : "";
    const schritte = SCHRITTE[r.k.key];
    return {
      key: r.k.key,
      label: r.k.label,
      beschreibung: r.k.beschreibung,
      rolle,
      eignung: r.wert,
      passung,
      passungText: PASSUNG_TEXT[passung],
      begruendung: rolle === "vorerst" ? grund : rolle === "basis" ? basisGrund(r.k.key, g) : begruendung(r.k, g),
      grund,
      schritt: rolle === "vorerst" ? "" : (r.aktiv ? schritte.aktiv : schritte.neu)(b),
      aufgabe: AUFGABEN[r.k.key],
      links: rolle === "vorerst" ? [] : [...KANAL_LINKS[r.k.key]],
      heuteAktiv: r.aktiv,
    };
  };

  const alle = zeilen.map(make);
  const byKey = (key: KanalKey) => alle.find((k) => k.key === key) as KanalErgebnis;
  const basis = basisKeys.map(byKey);
  const fokus = fokusZeilen.map((r) => byKey(r.k.key));
  const ergaenzung = ergaenzungZeilen.map((r) => byKey(r.k.key));
  // Zuerst die Kanäle, die möglich wären und nur nicht an der Reihe sind; danach die, für die Fähigkeit oder Zeit fehlt.
  const vorerst = zeilen
    .filter((r) => rolleOf(r) === "vorerst")
    .sort((x, y) => Number(!moeglich(x.k, g)) - Number(!moeglich(y.k, g)) || vergleiche(x, y))
    .map((r) => byKey(r.k.key));

  const fokusLeer =
    fokus.length > 0
      ? null
      : g.faehigkeiten.length === 0
        ? "Du hast keine Fähigkeit angegeben. Darum bleibt es bei den Basis-Kanälen."
        : kandidaten.length === 0
          ? "Mit deinen Fähigkeiten, deiner Zeit und deinem Ziel ist kein weiterer Kanal möglich."
          : "Kein weiterer Kanal passt gut genug zu deinen Angaben.";

  return {
    input: g,
    typ,
    kanaele: [...basis, ...fokus, ...ergaenzung, ...vorerst],
    basis,
    fokus,
    ergaenzung,
    vorerst,
    pausieren: vorerst.filter((k) => k.heuteAktiv),
    fokusLeer,
    aussage: aussageText(basis, fokus, ergaenzung),
    monate: monatePlan(basis, fokus, ergaenzung),
    hinweise: hinweiseFor(g),
  };
}

// ---- Dokument ----------------------------------------------------------------------------------

export type Kontext = { firma: string; branche: string };

export const DOC_TITLE = "Kanalstrategie";
const one = (s: string): string => s.replace(/\s+/g, " ").trim();
const firmaText = (k: Kontext): string => one(k.firma) || "keine Angabe";
export const PAUSIEREN_TITEL = "Das kannst du pausieren";
export const pausierenHinweis = (b: Begriffe): string =>
  `Prüfe vor dem Pausieren, ob über diesen Kanal ${b.anfragen} kommen. Wenn ja, lass ihn laufen. Pausieren heisst nicht, dass er nichts bringt, sondern dass er zuerst nicht dein Fokus ist.`;

/** Zeile pro Kanal im Abschnitt «Das kannst du pausieren». */
export const pausierenZeile = (k: KanalErgebnis): string => `${k.label}: Du bist heute dort aktiv. ${k.grund}`;

function listeMitLinks(list: readonly KanalErgebnis[]): string[] {
  return list.map((k) => {
    const links = k.links.length > 0 ? ` Werkzeug: ${k.links.map((l) => `${l.name} (tools.alperna.ch/tools/${l.slug})`).join(", ")}.` : "";
    return `${k.label}: ${k.schritt}${links}`;
  });
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(a: Auswertung, k: Kontext): DocumentModel {
  const i = a.input;
  const b = begriffe(a.typ);
  const verein = b.verein;
  const ziel = zielOf(i.ziel)?.label ?? "";
  const facts = [{ label: verein ? "Verein" : "Betrieb", value: firmaText(k) }];
  if (one(k.branche)) facts.push({ label: verein ? "Tätigkeit" : "Branche", value: one(k.branche) });
  facts.push(
    { label: "Ziel", value: ziel },
    { label: verein ? "Zielgruppe" : "Kundschaft", value: KUNDSCHAFT_LABEL[a.typ][i.kundschaft] },
    { label: "Suchverhalten", value: SUCHE_LABEL[i.suche] },
    { label: "Einzugsgebiet", value: GEBIET_LABEL[i.gebiet] },
    { label: "Zeit pro Woche", value: zeitOf(i.zeit)?.worte ?? "" },
    { label: "Fähigkeiten", value: i.faehigkeiten.length > 0 ? i.faehigkeiten.map(faehigkeitLabel).join(", ") : "keine angegeben" },
    { label: "Heute aktiv", value: i.heute.length > 0 ? i.heute.map(kanalLabel).join(", ") : "keine angegeben" },
  );

  const kurz = [`Basis: ${listText(a.basis.map((x) => x.label))}`, a.fokus.length > 0 ? `Fokus: ${listText(a.fokus.map((x) => x.label))}` : "Fokus: keiner"];
  if (a.ergaenzung.length > 0) kurz.push(`Ergänzung: ${listText(a.ergaenzung.map((x) => x.label))}`);
  if (a.vorerst.length > 0) kurz.push(`Vorerst nicht: ${listText(a.vorerst.map((x) => x.label))}`);

  const blocks: DocBlock[] = [
    { type: "heading", level: 1, text: "Überblick" },
    { type: "facts", items: facts },
    { type: "heading", level: 1, text: "Das Ergebnis in Kürze" },
    { type: "list", items: kurz },
    { type: "paragraph", text: `${RICHTWERT_NOTE}. ${GRENZE_NOTE}` },
    { type: "heading", level: 1, text: "Alle Kanäle im Überblick" },
    {
      type: "table",
      header: ["Kanal", "Rolle", "Passung", "Begründung"],
      rows: a.kanaele.map((x) => [x.label, ROLLE_LABEL[x.rolle], x.passungText, x.begruendung]),
      widths: [2.2, 1.6, 1.8, 5.4],
    },
    { type: "heading", level: 1, text: "Basis" },
    { type: "paragraph", text: ROLLE_INTRO.basis },
    { type: "list", items: listeMitLinks(a.basis) },
    { type: "heading", level: 1, text: "Fokus" },
  ];
  if (a.fokus.length > 0) {
    blocks.push({ type: "paragraph", text: ROLLE_INTRO.fokus }, { type: "list", items: listeMitLinks(a.fokus) });
  } else {
    blocks.push({ type: "paragraph", text: a.fokusLeer ?? "" });
  }
  if (a.ergaenzung.length > 0) {
    blocks.push(
      { type: "heading", level: 1, text: "Ergänzung" },
      { type: "paragraph", text: ROLLE_INTRO.ergaenzung },
      { type: "list", items: listeMitLinks(a.ergaenzung) },
    );
  }
  if (a.vorerst.length > 0) {
    blocks.push(
      { type: "heading", level: 1, text: "Vorerst nicht" },
      { type: "paragraph", text: ROLLE_INTRO.vorerst },
      { type: "list", items: a.vorerst.map((x) => `${x.label}: ${x.grund}`) },
    );
  }
  if (a.pausieren.length > 0) {
    blocks.push(
      { type: "heading", level: 1, text: PAUSIEREN_TITEL },
      { type: "list", items: a.pausieren.map(pausierenZeile) },
      { type: "paragraph", text: pausierenHinweis(b) },
    );
  }
  blocks.push({ type: "heading", level: 1, text: "Die nächsten drei Monate" });
  for (const m of a.monate) {
    blocks.push({ type: "heading", level: 2, text: `Monat ${m.nr}: ${m.titel}` }, { type: "paragraph", text: m.text });
    if (m.punkte.length > 0) blocks.push({ type: "list", items: m.punkte.map((p) => `${p.kanal}: ${p.aufgabe}`) });
  }
  blocks.push(
    { type: "heading", level: 1, text: "Hinweise" },
    { type: "list", ordered: true, items: [...a.hinweise] },
    { type: "heading", level: 1, text: "So ist gerechnet" },
    { type: "list", items: rechnungFor(a.typ) },
    { type: "paragraph", text: `${RICHTWERT_NOTE}. ${GRENZE_NOTE}` },
  );

  return {
    title: DOC_TITLE,
    subtitle: a.fokus.length > 0 ? `Fokus: ${listText(a.fokus.map((x) => x.label))}` : `Basis: ${listText(a.basis.map((x) => x.label))}`,
    firma: one(k.firma) || undefined,
    filename: `kanalstrategie-${safeFilename(k.firma, verein ? "verein" : "betrieb")}`,
    blocks,
  };
}

/** Die Angaben fürs CRM, eine Zeile je Angabe (der Server kürzt auf 1'900 Zeichen). */
export function eingabeText(i: Geprueft, k: Kontext): string {
  const verein = i.typ === "verein";
  const lines = [`${verein ? "Verein" : "Betrieb"}: ${firmaText(k)}`];
  if (one(k.branche)) lines.push(`${verein ? "Tätigkeit" : "Branche"}: ${one(k.branche)}`);
  lines.push(
    `Ziel: ${zielOf(i.ziel)?.label ?? ""}`,
    `${verein ? "Zielgruppe" : "Kundschaft"}: ${KUNDSCHAFT_LABEL[i.typ][i.kundschaft]}`,
    `Suchverhalten: ${SUCHE_LABEL[i.suche]}`,
    `Einzugsgebiet: ${GEBIET_LABEL[i.gebiet]}`,
    `Zeit pro Woche: ${zeitOf(i.zeit)?.label ?? ""}`,
    `Fähigkeiten: ${i.faehigkeiten.length > 0 ? i.faehigkeiten.map(faehigkeitLabel).join(", ") : "keine"}`,
    `Heute aktiv: ${i.heute.length > 0 ? i.heute.map(kanalLabel).join(", ") : "keine"}`,
  );
  return lines.join("\n");
}

/** Das Ergebnis fürs CRM und zum Kopieren: das Dokument als Markdown. */
export function ausgabeText(a: Auswertung, k: Kontext): string {
  return toMarkdown(toDocument(a, k));
}

// ---- Profil ------------------------------------------------------------------------------------

export type ProfilePatch = Partial<Record<ProfileKey, unknown>>;

/** Schreibt Basis und Fokus als Kanäle ins Profil, aber nur, wenn dort noch keine stehen (Harte Regel 10; writesProfile in tool.config.ts). */
export function profilePatch(profile: Pick<Profile, "kanaele">, a: Pick<Auswertung, "basis" | "fokus">): ProfilePatch {
  if (profile.kanaele?.length) return {};
  const liste = [...a.basis, ...a.fokus].map((k) => ({ name: k.label, url: "" }));
  return liste.length > 0 ? { kanaele: liste } : {};
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

/** Kurzfassung des Ergebnisses im Stand. Beim Lesen wird sie aus der Eingabe neu berechnet; ein gespeicherter Wert zählt nicht. */
export type Kurzergebnis = { basis: KanalKey[]; fokus: KanalKey[]; ergaenzung: KanalKey[]; vorerst: KanalKey[] };

export type KsState = { v: 1; phase: "edit" | "result"; input: Input; output?: Kurzergebnis };

export const EMPTY_STATE: KsState = { v: 1, phase: "edit", input: emptyInput() };

export function kurzergebnis(a: Pick<Auswertung, "basis" | "fokus" | "ergaenzung" | "vorerst">): Kurzergebnis {
  return {
    basis: a.basis.map((k) => k.key),
    fokus: a.fokus.map((k) => k.key),
    ergaenzung: a.ergaenzung.map((k) => k.key),
    vorerst: a.vorerst.map((k) => k.key),
  };
}

function parseInput(raw: unknown): Input {
  if (!isObj(raw)) return emptyInput();
  const typ: Typ = raw.typ === "verein" ? "verein" : "kmu";
  const ziel = typeof raw.ziel === "string" && zielOf(raw.ziel)?.typ === typ ? (raw.ziel as ZielKey) : "";
  const kundschaft = KUNDSCHAFT_KEYS.find((k) => k === raw.kundschaft) ?? "";
  const suche = SUCHE_KEYS.find((k) => k === raw.suche) ?? "";
  const gebiet = GEBIET_KEYS.find((k) => k === raw.gebiet) ?? "";
  const zeit = ZEITEN.find((z) => z.stufe === raw.zeit)?.stufe ?? 0;
  const faehigkeiten = Array.isArray(raw.faehigkeiten) ? canon(FAEHIGKEIT_KEYS, raw.faehigkeiten) : [];
  const heute = Array.isArray(raw.heute) ? canon(KANAL_KEYS, raw.heute.filter(isKanal)) : null;
  return { typ, ziel, kundschaft, suche, gebiet, zeit, faehigkeiten, heute };
}

/**
 * Liest den gespeicherten Stand. Kaputte Daten oder eine falsche Version ergeben den leeren Stand. «result» gilt nur, wenn die
 * Eingabe vollständig ist; dann wird das Kurzergebnis neu berechnet.
 */
export function parseState(raw: unknown): KsState {
  if (!isObj(raw) || raw.v !== 1) return EMPTY_STATE;
  const input = parseInput(raw.input);
  if (raw.phase === "result") {
    const frozen: Input = { ...input, heute: input.heute ?? [] };
    const a = auswerten(frozen);
    if (a) return { v: 1, phase: "result", input: frozen, output: kurzergebnis(a) };
  }
  return { v: 1, phase: "edit", input };
}
