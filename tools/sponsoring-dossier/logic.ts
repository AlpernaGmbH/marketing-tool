import { KANTONE, chf, numberCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import { LIMITS, sponsoringInput, sponsoringOutput, type SponsoringInput, type SponsoringOutput } from "./generator";
import { contrast, parseHex } from "@/tools/bewertungs-kit/logic";

// Sponsoring-Dossier: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Das Dossier entsteht im Browser ohne KI (Klasse C). Die KI schreibt auf Wunsch drei Absätze dazu (generator.ts).
// Die Ampel (Gegenleistung zum Preis) ist eine Einschätzung von Alperna, keine Statistik und keine Marktdaten:
// Punkte je Gegenleistung, Faktor nach Mitgliedern und 100 Franken je Punkt sind Richtwerte.
// Spec: specs/sponsoring-dossier.md

export const SLUG = "sponsoring-dossier";
export const AMPEL_NOTE = "Einschätzung von Alperna, keine Marktdaten";
export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";
export const ZAHLEN_NOTE = "Alle Zahlen sind Angaben des Vereins.";
export const PAKETE_NOTE = "Preise und Gegenleistungen legt der Verein fest.";

// ---- Grenzen -----------------------------------------------------------------------------------

export const SOCIAL_MAX = 52;
export const TICKETS_MAX = 1000;

export const MAX = {
  anlass: 80,
  zielgruppeMin: LIMITS.zielgruppeMin,
  zielgruppe: LIMITS.zielgruppe,
  paketName: LIMITS.paketName,
  preisMin: LIMITS.paketPreisMin,
  preisMax: LIMITS.paketPreisMax,
  weitere: 120,
  referenzen: 300,
  kontaktName: 120,
  kontaktFunktion: 80,
  kontaktTelefon: 40,
  kontaktEmail: 120,
  stichworteMin: LIMITS.stichworteMin,
  stichworte: LIMITS.stichworte,
} as const;

export const DEFAULT_NAMEN = ["Bronze", "Silber", "Gold"] as const;
export const DEFAULT_FARBE = "#111A28";
export const INK = "#0F0F0E";
export const WEISS = "#FFFFFF";
/** Papierfarbe des Dossiers (Design-Token --paper); gegen sie wird die Vereinsfarbe geprüft. */
export const PAPER = "#FFFDF8";
/** Unter diesem Kontrast zu Papier ist eine Farbe für Rahmen, Linien und Titel zu hell (WCAG-Schwelle für Grafik und grosse Schrift). */
export const MIN_CONTRAST = 3;

// ---- Zahlen des Vereins ------------------------------------------------------------------------

export const ZAHL_KEYS = ["mitglieder", "aktive", "zuschauer", "anlaesse", "instagram", "facebook", "besuche", "medien"] as const;
export type ZahlKey = (typeof ZAHL_KEYS)[number];

export type ZahlDef = {
  key: ZahlKey;
  /** Beschriftung im Formular. */
  label: string;
  /** Bezeichnung im Dossier und in der Eingabe an die KI. */
  zeile: string;
  min: number;
  max: number;
  pflicht: boolean;
};

export const ZAHLEN: ZahlDef[] = [
  { key: "mitglieder", label: "Mitglieder", zeile: "Mitglieder", min: 1, max: 1_000_000, pflicht: true },
  { key: "aktive", label: "Davon Aktive (freiwillig)", zeile: "Davon Aktive", min: 0, max: 1_000_000, pflicht: false },
  { key: "zuschauer", label: "Zuschauer pro Anlass (freiwillig)", zeile: "Zuschauer pro Anlass", min: 0, max: 1_000_000, pflicht: false },
  { key: "anlaesse", label: "Anlässe pro Jahr (freiwillig)", zeile: "Anlässe pro Jahr", min: 0, max: 1000, pflicht: false },
  { key: "instagram", label: "Follower auf Instagram (freiwillig)", zeile: "Follower auf Instagram", min: 0, max: 100_000_000, pflicht: false },
  { key: "facebook", label: "Follower auf Facebook (freiwillig)", zeile: "Follower auf Facebook", min: 0, max: 100_000_000, pflicht: false },
  { key: "besuche", label: "Website-Besuche pro Monat (freiwillig)", zeile: "Website-Besuche pro Monat", min: 0, max: 1_000_000_000, pflicht: false },
  { key: "medien", label: "Medienberichte pro Jahr (freiwillig)", zeile: "Medienberichte pro Jahr", min: 0, max: 10_000, pflicht: false },
];

export const zahlDef = (key: ZahlKey): ZahlDef => ZAHLEN.find((z) => z.key === key)!;

/**
 * Liest eine ganze Zahl aus einem Feld: Apostrophe und Leerzeichen als Tausendertrenner, ein Franken-Zusatz «.-» am Ende ist erlaubt.
 * null: leer. NaN: keine ganze Zahl (Komma, Dezimalpunkt, Buchstaben, zu gross).
 */
export function parseGanzzahl(raw: string): number | null {
  const s = raw.replace(/['’\s]/g, "").replace(/\.[-–]$/, "");
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return Number.NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

// ---- Gegenleistungen und Punkte ---------------------------------------------------------------

export const HAKEN_KEYS = ["trikot", "bande", "website", "newsletter", "anlaesse", "stand", "medien"] as const;
export type HakenKey = (typeof HAKEN_KEYS)[number];

/** Gegenleistungen zum Ankreuzen mit Punkten (Richtwert von Alperna, keine Statistik). */
export const LEISTUNGEN: { key: HakenKey; label: string; punkte: number }[] = [
  { key: "trikot", label: "Logo auf Trikot", punkte: 5 },
  { key: "bande", label: "Logo auf Bande", punkte: 3 },
  { key: "website", label: "Logo auf Website", punkte: 1 },
  { key: "newsletter", label: "Logo im Newsletter", punkte: 1 },
  { key: "anlaesse", label: "Nennung bei Anlässen", punkte: 2 },
  { key: "stand", label: "Stand am Anlass", punkte: 3 },
  { key: "medien", label: "Nennung in Medienmitteilungen", punkte: 2 },
];

/** Gegenleistungen mit Anzahl und das Freitextfeld: Punkte je Stück bis zu einem Höchstwert. */
export const PUNKTE = {
  social: { je: 0.5, max: 5 },
  tickets: { je: 0.25, max: 3 },
  weitere: 1,
} as const;

export type ZeilenKey = HakenKey | "social" | "tickets" | "weitere";
export type ZeilenArt = "haken" | "zahl" | "text";

/** Die zehn Zeilen eines Pakets in der Reihenfolge von Formular und Vergleichstabelle. */
export const ZEILEN: { key: ZeilenKey; art: ZeilenArt; label: string; tabelle: string }[] = [
  ...(["trikot", "bande", "website", "newsletter", "anlaesse"] as const).map((key) => {
    const l = LEISTUNGEN.find((x) => x.key === key)!;
    return { key, art: "haken" as const, label: l.label, tabelle: l.label };
  }),
  { key: "social", art: "zahl", label: "Beiträge auf Social Media pro Jahr", tabelle: "Beiträge auf Social Media pro Jahr" },
  { key: "tickets", art: "zahl", label: "Tickets oder Einladungen pro Jahr", tabelle: "Tickets oder Einladungen pro Jahr" },
  ...(["stand", "medien"] as const).map((key) => {
    const l = LEISTUNGEN.find((x) => x.key === key)!;
    return { key, art: "haken" as const, label: l.label, tabelle: l.label };
  }),
  { key: "weitere", art: "text", label: "Weitere Gegenleistung (freiwillig)", tabelle: "Weitere Gegenleistung" },
];

export const leistungLabel = (key: HakenKey): string => LEISTUNGEN.find((l) => l.key === key)!.label;
export const isHakenKey = (v: unknown): v is HakenKey => typeof v === "string" && (HAKEN_KEYS as readonly string[]).includes(v);

// ---- Formular ----------------------------------------------------------------------------------

/** Ein Paket, wie die Person es tippt. */
export type PaketForm = { name: string; preis: string; haken: HakenKey[]; social: string; tickets: string; weitere: string };
export type KontaktForm = { name: string; funktion: string; telefon: string; email: string };

/**
 * Alles, was das Dossier braucht, als Text, wie es im Formular steht. Verein, Ort, Kanton und Website kopiert das
 * Werkzeug beim Erstellen aus dem Firmenprofil. Die Kontaktdaten und die Referenzen bleiben im Browser.
 */
export type Form = {
  verein: string;
  ort: string;
  kanton: string;
  website: string;
  anlass: string;
  zahlen: Record<ZahlKey, string>;
  zielgruppe: string;
  pakete: PaketForm[];
  referenzen: string;
  kontakt: KontaktForm;
  farbe: string;
  stichworte: string;
};

export const EMPTY_PAKET = (name: string): PaketForm => ({ name, preis: "", haken: [], social: "", tickets: "", weitere: "" });

export const EMPTY_FORM: Form = {
  verein: "",
  ort: "",
  kanton: "",
  website: "",
  anlass: "",
  zahlen: { mitglieder: "", aktive: "", zuschauer: "", anlaesse: "", instagram: "", facebook: "", besuche: "", medien: "" },
  zielgruppe: "",
  pakete: DEFAULT_NAMEN.map(EMPTY_PAKET),
  referenzen: "",
  kontakt: { name: "", funktion: "", telefon: "", email: "" },
  farbe: DEFAULT_FARBE,
  stichworte: "",
};

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
const cleanLines = (s: string): string =>
  s
    .split(/\r?\n/)
    .map((l) => clean(l))
    .filter(Boolean)
    .join("\n");

// ---- Farbe -------------------------------------------------------------------------------------

export const FARBE_FORM_MELDUNG = "Die Vereinsfarbe braucht einen Hex-Wert wie #111A28.";
export const FARBE_HELL_MELDUNG = "Diese Farbe ist auf Papier zu hell. Wähle eine dunklere für Deckblatt und Tabellenkopf.";

/** «#1b3a6b» → «#1B3A6B»; ungültige Werte werden zur Standardfarbe. */
export function normFarbe(hex: string): string {
  const rgb = parseHex(hex);
  return rgb ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase() : DEFAULT_FARBE;
}

/** Kontrast der Farbe zum Papier des Dossiers (1 bis 21); null bei ungültigem Wert. */
export function farbKontrast(hex: string): number | null {
  return contrast(hex, PAPER);
}

/** Zu hell für Linien und Titel auf Papier: Kontrast unter 3:1. Ungültige Werte zählen nicht als zu hell. */
export function isTooLight(hex: string): boolean {
  const c = farbKontrast(hex);
  return c !== null && c < MIN_CONTRAST;
}

export function farbProblem(hex: string): string | null {
  if (!parseHex(hex)) return FARBE_FORM_MELDUNG;
  return isTooLight(hex) ? FARBE_HELL_MELDUNG : null;
}

/** Schriftfarbe auf der Vereinsfarbe (Deckblatt, Tabellenkopf): Weiss oder Tinte, je nachdem, was mehr Kontrast gibt. */
export function textOn(hex: string): typeof WEISS | typeof INK {
  const weiss = contrast(hex, WEISS) ?? 0;
  const tinte = contrast(hex, INK) ?? 0;
  return weiss >= tinte ? WEISS : INK;
}

// ---- Pakete ------------------------------------------------------------------------------------

/** Ein Paket mit Zahlen statt Text, bereit für Rahmen, Ampel, Dokument und KI. */
export type Paket = { index: number; name: string; preis: number; haken: HakenKey[]; social: number; tickets: number; weitere: string };

const zahlGesetzt = (raw: string): boolean => {
  const n = parseGanzzahl(raw);
  return n !== null && (Number.isNaN(n) || n > 0);
};

/** Ein Paket gilt als angefangen, sobald Preis, eine Gegenleistung oder ein Freitext da ist. Der Name allein zählt nicht. */
export function paketAktiv(p: PaketForm): boolean {
  return p.preis.trim() !== "" || p.haken.length > 0 || zahlGesetzt(p.social) || zahlGesetzt(p.tickets) || p.weitere.trim() !== "";
}

const hatLeistung = (p: PaketForm): boolean => p.haken.length > 0 || (parseGanzzahl(p.social) ?? 0) > 0 || (parseGanzzahl(p.tickets) ?? 0) > 0 || p.weitere.trim() !== "";

/** Name eines Pakets: der getippte, sonst der Vorschlag (Bronze, Silber, Gold). */
export const paketName = (p: PaketForm, index: number): string => clean(p.name) || DEFAULT_NAMEN[index] || `Paket ${index + 1}`;

/** Die vollständigen Pakete in Reihenfolge. Pakete ohne gültigen Preis fehlen (vorher inputProblem prüfen). */
export function aktivePakete(form: Pick<Form, "pakete">): Paket[] {
  const out: Paket[] = [];
  form.pakete.forEach((p, index) => {
    if (!paketAktiv(p)) return;
    const preis = parseGanzzahl(p.preis);
    if (preis === null || Number.isNaN(preis) || preis < MAX.preisMin || preis > MAX.preisMax) return;
    const social = parseGanzzahl(p.social);
    const tickets = parseGanzzahl(p.tickets);
    out.push({
      index,
      name: paketName(p, index).slice(0, MAX.paketName),
      preis,
      haken: HAKEN_KEYS.filter((k) => p.haken.includes(k)),
      social: social === null || Number.isNaN(social) ? 0 : Math.min(social, SOCIAL_MAX),
      tickets: tickets === null || Number.isNaN(tickets) ? 0 : Math.min(tickets, TICKETS_MAX),
      weitere: clean(p.weitere).slice(0, MAX.weitere),
    });
  });
  return out;
}

/** Punkte eines Pakets (Richtwert von Alperna, keine Statistik): Gegenleistungen, Beiträge bis 5, Tickets bis 3, Freitext 1. */
export function paketPunkte(p: Pick<Paket, "haken" | "social" | "tickets" | "weitere">): number {
  const haken = new Set(p.haken);
  let punkte = LEISTUNGEN.filter((l) => haken.has(l.key)).reduce((s, l) => s + l.punkte, 0);
  punkte += Math.min(Math.max(p.social, 0) * PUNKTE.social.je, PUNKTE.social.max);
  punkte += Math.min(Math.max(p.tickets, 0) * PUNKTE.tickets.je, PUNKTE.tickets.max);
  if (p.weitere.trim() !== "") punkte += PUNKTE.weitere;
  return punkte;
}

/** Faktor nach Mitgliedern (Richtwert von Alperna): unter 100 → 1, bis 300 → 1,5, darüber → 2. */
export function reichweitenFaktor(mitglieder: number): number {
  if (!(mitglieder >= 100)) return 1;
  return mitglieder <= 300 ? 1.5 : 2;
}

/** Erwarteter Preisrahmen in Franken: Punkte × Faktor × 100 (Richtwert von Alperna, keine Marktdaten). */
export function preisrahmen(punkte: number, mitglieder: number): number {
  return punkte * reichweitenFaktor(mitglieder) * 100;
}

export type Stufe = "gruen" | "gelb" | "rot";
export type AmpelText = "passt" | "eher günstig" | "eher hoch" | "passt nicht zur Gegenleistung";
export type Ampel = { stufe: Stufe; text: AmpelText; prozent: number };

/** Grenzen der Ampel in Prozent des Rahmens (Richtwert von Alperna). */
export const AMPEL_GRENZEN = { gruenVon: 60, gruenBis: 140, rotAb: 250 } as const;

/**
 * Ampel zum Verhältnis von Preis und Rahmen: von 60 bis 140 % grün «passt», darunter gelb «eher günstig», darüber gelb
 * «eher hoch», über 250 % rot «passt nicht zur Gegenleistung». Ohne Rahmen (keine Punkte) gibt es keine Einschätzung.
 */
export function ampel(preis: number, rahmen: number): Ampel | null {
  if (!Number.isFinite(preis) || preis < 0 || !(rahmen > 0) || !Number.isFinite(rahmen)) return null;
  // Ganzzahl-genau: Punkte sind Vielfache von 0,25 und Faktoren von 0,5, die Vergleiche kommen ohne Rundungsfehler aus.
  const p100 = preis * 100;
  let stufe: Stufe;
  let text: AmpelText;
  if (p100 > rahmen * AMPEL_GRENZEN.rotAb) {
    stufe = "rot";
    text = "passt nicht zur Gegenleistung";
  } else if (p100 > rahmen * AMPEL_GRENZEN.gruenBis) {
    stufe = "gelb";
    text = "eher hoch";
  } else if (p100 >= rahmen * AMPEL_GRENZEN.gruenVon) {
    stufe = "gruen";
    text = "passt";
  } else {
    stufe = "gelb";
    text = "eher günstig";
  }
  // Die angezeigte Prozentzahl liegt auf derselben Seite der Grenze wie die Farbe («59,6 %» wird nicht zu «60 %»).
  let prozent = Math.round((preis / rahmen) * 100);
  if (text === "eher günstig") prozent = Math.min(prozent, AMPEL_GRENZEN.gruenVon - 1);
  if (text === "eher hoch") prozent = Math.max(prozent, AMPEL_GRENZEN.gruenBis + 1);
  if (stufe === "rot") prozent = Math.max(prozent, AMPEL_GRENZEN.rotAb + 1);
  return { stufe, text, prozent };
}

export const AMPEL_HINWEISE: Record<AmpelText, string> = {
  passt: "Preis und Gegenleistung liegen nah beieinander.",
  "eher günstig": "Der Preis liegt unter dem Rahmen. Prüf, ob ihr mehr verlangen oder weniger anbieten wollt.",
  "eher hoch": "Der Preis liegt über dem Rahmen. Prüf, ob ihr eine Gegenleistung ergänzen könnt.",
  "passt nicht zur Gegenleistung": "Der Preis liegt weit über dem Rahmen. Ergänze Gegenleistungen oder senke den Preis, bevor du das Dossier verschickst.",
};

/** Die Regeln der Ampel als Text, aus denselben Konstanten wie die Rechnung (so weichen Text und Rechnung nie ab). */
export function ampelRegel(): string {
  const haken = [...LEISTUNGEN]
    .sort((a, b) => b.punkte - a.punkte)
    .map((l) => `${l.label} ${numberCH(l.punkte, 2)}`)
    .join(", ");
  return (
    `Jede Gegenleistung gibt Punkte: ${haken}, Beitrag auf Social Media ${numberCH(PUNKTE.social.je, 2)} je Beitrag bis höchstens ${numberCH(PUNKTE.social.max, 2)}, ` +
    `Tickets oder Einladungen ${numberCH(PUNKTE.tickets.je, 2)} je Stück bis höchstens ${numberCH(PUNKTE.tickets.max, 2)}, weitere Gegenleistung ${numberCH(PUNKTE.weitere, 2)}. ` +
    `Die Punkte mal der Faktor nach Mitgliedern (unter 100: 1, bis 300: 1,5, darüber: 2) mal CHF 100.- ergeben den Rahmen. ` +
    `Grün: der Preis liegt zwischen ${AMPEL_GRENZEN.gruenVon} und ${AMPEL_GRENZEN.gruenBis} % des Rahmens. Gelb: darunter oder bis ${AMPEL_GRENZEN.rotAb} %. Rot: darüber.`
  );
}

export type PaketBewertung = { index: number; name: string; preis: number; punkte: number; faktor: number; rahmen: number; ampel: Ampel };

/** Mitglieder als Zahl; 0, wenn die Angabe fehlt oder keine ganze Zahl ist. */
export function mitgliederVon(form: Pick<Form, "zahlen">): number {
  const n = parseGanzzahl(form.zahlen.mitglieder);
  return n === null || Number.isNaN(n) ? 0 : n;
}

/** Ampel je vollständigem Paket. Die Pakete bleiben, wie sie eingegeben wurden. */
export function bewertePakete(form: Pick<Form, "pakete" | "zahlen">): PaketBewertung[] {
  const mitglieder = mitgliederVon(form);
  const out: PaketBewertung[] = [];
  for (const p of aktivePakete(form)) {
    const punkte = paketPunkte(p);
    const rahmen = preisrahmen(punkte, mitglieder);
    const a = ampel(p.preis, rahmen);
    if (a) out.push({ index: p.index, name: p.name, preis: p.preis, punkte, faktor: reichweitenFaktor(mitglieder), rahmen, ampel: a });
  }
  return out;
}

/** Die Einschätzung als ein Satz für das CRM; leer, wenn kein Paket zu bewerten ist. */
export function einschaetzungText(form: Pick<Form, "pakete" | "zahlen">): string {
  const b = bewertePakete(form);
  if (b.length === 0) return "";
  return `${AMPEL_NOTE}: ${b.map((x) => `${x.name} ${chf(x.preis)} ${x.ampel.text} (Rahmen ${chf(Math.round(x.rahmen))})`).join("; ")}.`;
}

// ---- Prüfung -----------------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Meldet, warum das Dossier noch nicht entstehen kann, in der Reihenfolge des Formulars. null: in Ordnung. */
export function inputProblem(form: Form): string | null {
  if (clean(form.verein) === "") return "Gib den Namen deines Vereins an.";
  if (Array.from(clean(form.verein)).length > LIMITS.verein) return `Der Name des Vereins darf höchstens ${LIMITS.verein} Zeichen haben.`;
  if (Array.from(form.anlass.trim()).length > MAX.anlass) return `Anlass oder Saison darf höchstens ${MAX.anlass} Zeichen haben.`;

  const werte = {} as Record<ZahlKey, number | null>;
  for (const z of ZAHLEN) {
    const n = parseGanzzahl(form.zahlen[z.key]);
    werte[z.key] = n;
    if (n === null) {
      if (z.pflicht) return "Gib die Zahl der Mitglieder an.";
      continue;
    }
    if (Number.isNaN(n) || n < z.min || n > z.max) return `${z.zeile}: Gib eine ganze Zahl zwischen ${numberCH(z.min, 0)} und ${numberCH(z.max, 0)} an.`;
  }
  if (werte.aktive !== null && werte.mitglieder !== null && werte.aktive > werte.mitglieder) return "Die Aktiven können nicht mehr sein als die Mitglieder.";

  const ziel = clean(form.zielgruppe);
  if (Array.from(ziel).length < MAX.zielgruppeMin) return "Beschreib in ein paar Worten, welche Betriebe zu euch passen und warum (mindestens 10 Zeichen).";
  if (Array.from(ziel).length > MAX.zielgruppe) return `Die Zielgruppe darf höchstens ${MAX.zielgruppe} Zeichen haben.`;

  const aktiv = form.pakete.map((p, i) => ({ p, i })).filter(({ p }) => paketAktiv(p));
  if (aktiv.length === 0) return "Gib mindestens ein Paket mit Preis und einer Gegenleistung an.";
  const gesehen = new Set<string>();
  for (const { p, i } of aktiv) {
    const nr = `Paket ${i + 1}`;
    const name = paketName(p, i);
    if (Array.from(name).length > MAX.paketName) return `${nr}: Der Name darf höchstens ${MAX.paketName} Zeichen haben.`;
    if (gesehen.has(name.toLowerCase())) return `${nr}: Der Name «${name}» kommt schon vor. Jedes Paket braucht einen eigenen Namen.`;
    gesehen.add(name.toLowerCase());
    const preis = parseGanzzahl(p.preis);
    if (preis === null) return `${nr}: Gib den Preis in CHF an.`;
    if (Number.isNaN(preis) || preis < MAX.preisMin || preis > MAX.preisMax) return `${nr}: Der Preis muss zwischen ${chf(MAX.preisMin)} und ${chf(MAX.preisMax)} liegen.`;
    const social = parseGanzzahl(p.social);
    if (social !== null && (Number.isNaN(social) || social > SOCIAL_MAX)) return `${nr}: Beiträge auf Social Media pro Jahr: eine ganze Zahl von 0 bis ${SOCIAL_MAX}.`;
    const tickets = parseGanzzahl(p.tickets);
    if (tickets !== null && (Number.isNaN(tickets) || tickets > TICKETS_MAX)) return `${nr}: Tickets oder Einladungen: eine ganze Zahl von 0 bis ${numberCH(TICKETS_MAX, 0)}.`;
    if (Array.from(clean(p.weitere)).length > MAX.weitere) return `${nr}: Die weitere Gegenleistung darf höchstens ${MAX.weitere} Zeichen haben.`;
    if (!hatLeistung(p)) return `${nr}: Wähle mindestens eine Gegenleistung.`;
  }

  if (Array.from(form.referenzen.trim()).length > MAX.referenzen) return `Die Referenzen dürfen höchstens ${MAX.referenzen} Zeichen haben.`;

  if (clean(form.kontakt.name) === "") return "Gib eine Ansprechperson für Rückfragen an.";
  if (form.kontakt.email.trim() !== "" && !EMAIL_RE.test(form.kontakt.email.trim())) return "Prüfe die E-Mail-Adresse der Ansprechperson.";

  const farbe = farbProblem(form.farbe);
  if (farbe) return farbe;
  if (Array.from(form.stichworte.trim()).length > MAX.stichworte) return `Die Stichworte dürfen höchstens ${MAX.stichworte} Zeichen haben.`;
  return null;
}

// ---- Texte aus dem Formular --------------------------------------------------------------------

/** «Trogen AR», «Trogen», «Kanton Appenzell Ausserrhoden» oder leer. */
export function ortLabel(form: Pick<Form, "ort" | "kanton">): string {
  const ort = clean(form.ort);
  const kanton = form.kanton.trim().toUpperCase();
  const kantonName = KANTONE.find(([code]) => code === kanton)?.[1];
  if (ort && kantonName) return `${ort} ${kanton}`;
  if (ort) return ort;
  return kantonName ? `Kanton ${kantonName}` : "";
}

/** Gegebene Kennzahlen (grösser als 0) in der Reihenfolge der Liste. */
export function zahlenZeilen(form: Pick<Form, "zahlen">): { key: ZahlKey; label: string; wert: number }[] {
  const out: { key: ZahlKey; label: string; wert: number }[] = [];
  for (const z of ZAHLEN) {
    const n = parseGanzzahl(form.zahlen[z.key]);
    if (n !== null && !Number.isNaN(n) && n > 0) out.push({ key: z.key, label: z.zeile, wert: n });
  }
  return out;
}

/** Die Gegenleistungen eines Pakets als Liste von Sätzen (für Eingabe an die KI und CRM). */
export function leistungenListe(p: Pick<Paket, "haken" | "social" | "tickets" | "weitere">): string[] {
  const out: string[] = [];
  for (const z of ZEILEN) {
    if (z.art === "haken" && p.haken.includes(z.key as HakenKey)) out.push(z.label);
    if (z.key === "social" && p.social > 0) out.push(`Beitrag auf Social Media (${p.social} pro Jahr)`);
    if (z.key === "tickets" && p.tickets > 0) out.push(`Tickets oder Einladungen (${p.tickets} pro Jahr)`);
    if (z.key === "weitere" && p.weitere.trim() !== "") out.push(p.weitere.trim());
  }
  return out;
}

// ---- Dokument ----------------------------------------------------------------------------------

export const HAKEN = "✓";
export const KEIN = "–";

export const SCHRITTE = [
  "Gespräch: Wir klären mit Ihnen, welches Paket zu Ihrem Betrieb passt und was Sie sich vom Sponsoring erhoffen.",
  "Vertrag auf Papier: Gegenleistungen, Preis und Dauer halten wir schriftlich fest.",
  "Dank und Bericht: Wir bedanken uns und berichten Ihnen nach dem Anlass oder am Ende der Saison, was wir umgesetzt haben.",
] as const;

const zelle = (key: ZeilenKey, p: Paket): string => {
  if (key === "social") return p.social > 0 ? numberCH(p.social, 0) : KEIN;
  if (key === "tickets") return p.tickets > 0 ? numberCH(p.tickets, 0) : KEIN;
  if (key === "weitere") return p.weitere || KEIN;
  return p.haken.includes(key) ? HAKEN : KEIN;
};

/** Vergleichstabelle: eine Zeile je Gegenleistung, die mindestens ein Paket enthält, am Ende die Preiszeile. */
export function paketTabelle(pakete: Paket[]): DocBlock {
  const rows: string[][] = [];
  for (const z of ZEILEN) {
    const cells = pakete.map((p) => zelle(z.key, p));
    if (cells.every((c) => c === KEIN)) continue;
    rows.push([z.tabelle, ...cells]);
  }
  rows.push(["Preis", ...pakete.map((p) => chf(p.preis))]);
  return { type: "table", header: ["Gegenleistung", ...pakete.map((p) => p.name)], rows, widths: [3, ...pakete.map(() => 1.3)] };
}

export type DocOptions = {
  /** Datum im Kopf, bereits formatiert (dateCH). */
  datum?: string;
  /** Für das CRM: ohne Kontaktdaten und ohne Namen der Referenzen. Beides bleibt im Browser. */
  crm?: boolean;
};

/**
 * DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Deckblatt (Titel «Sponsoring <Verein>», Untertitel Anlass oder
 * Saison und Ort), Porträt (nur mit KI), Verein in Zahlen (nur angegebene Werte), Zielgruppe, «Warum Sponsoring hier wirkt»
 * (nur mit KI), Pakete als Vergleichstabelle, Referenzen, nächste Schritte (mit dem Dank der KI), Kontakt. Die Ampel steht
 * nicht im Dokument: Sie ist eine Einschätzung für den Verein, nicht für Sponsoren.
 */
export function toDocument(form: Form, ki: SponsoringOutput | null, opts: DocOptions = {}): DocumentModel {
  const verein = clean(form.verein);
  const ort = ortLabel(form);
  const untertitel = [clean(form.anlass), ort].filter(Boolean).join(", ");
  const blocks: DocBlock[] = [];

  if (ki) blocks.push({ type: "heading", level: 1, text: "Porträt des Vereins" }, { type: "paragraph", text: ki.portraet });

  const zahlen = zahlenZeilen(form);
  if (zahlen.length > 0) {
    blocks.push(
      { type: "heading", level: 1, text: "Der Verein in Zahlen" },
      { type: "table", header: ["Kennzahl", "Angabe des Vereins"], rows: zahlen.map((z) => [z.label, numberCH(z.wert, 0)]), widths: [3, 2] },
      { type: "paragraph", text: ZAHLEN_NOTE },
    );
  }

  blocks.push({ type: "heading", level: 1, text: "Zielgruppe: Welche Betriebe zu uns passen" }, { type: "paragraph", text: clean(form.zielgruppe) });
  if (ki) blocks.push({ type: "heading", level: 1, text: "Warum Sponsoring hier wirkt" }, { type: "paragraph", text: ki.warum });

  const pakete = aktivePakete(form);
  if (pakete.length > 0) {
    blocks.push({ type: "heading", level: 1, text: "Pakete im Vergleich" }, paketTabelle(pakete), { type: "paragraph", text: PAKETE_NOTE });
  }

  const referenzen = cleanLines(form.referenzen);
  if (referenzen && !opts.crm) {
    const zeilen = referenzen.split("\n");
    blocks.push({ type: "heading", level: 1, text: "Bisherige Sponsoren und Partner" });
    blocks.push(zeilen.length > 1 ? { type: "list", items: zeilen } : { type: "paragraph", text: referenzen });
  }

  blocks.push({ type: "heading", level: 1, text: "Nächste Schritte" });
  if (ki) blocks.push({ type: "paragraph", text: ki.dank });
  blocks.push({ type: "list", ordered: true, items: [...SCHRITTE] });

  if (!opts.crm) {
    const k = form.kontakt;
    const person = [clean(k.name), clean(k.funktion)].filter(Boolean).join(", ");
    const items = [
      person ? { label: "Ansprechperson", value: person } : null,
      clean(k.telefon) ? { label: "Telefon", value: clean(k.telefon) } : null,
      clean(k.email) ? { label: "E-Mail", value: clean(k.email) } : null,
      clean(form.website) ? { label: "Website", value: clean(form.website) } : null,
    ].filter((x): x is { label: string; value: string } => x !== null);
    if (items.length > 0) blocks.push({ type: "heading", level: 1, text: "Kontakt" }, { type: "facts", items });
  }

  return {
    title: verein ? `Sponsoring ${verein}` : "Sponsoring-Dossier",
    subtitle: untertitel || undefined,
    firma: verein || undefined,
    datum: opts.datum || undefined,
    filename: `sponsoring-dossier-${safeFilename(verein, "verein")}`,
    blocks,
  };
}

/** Blöcke für den Bildschirm: Titel und Untertitel stehen dort als erste Zeilen, die Abschnitte eine Stufe tiefer. */
export function viewBlocks(doc: DocumentModel): DocBlock[] {
  const head: DocBlock[] = [{ type: "heading", level: 1, text: doc.title }];
  if (doc.subtitle) head.push({ type: "paragraph", text: doc.subtitle });
  const rest = doc.blocks.map((b): DocBlock => (b.type === "heading" ? { ...b, level: b.level === 1 ? 2 : 3 } : b));
  return [...head, ...rest];
}

/** Das Dossier als Markdown fürs CRM: vorne die Einschätzung der Ampel, dann das Dossier ohne Kontaktdaten und Referenzen. */
export function reportMarkdown(form: Form, ki: SponsoringOutput | null): string {
  const einschaetzung = einschaetzungText(form);
  const doc = toMarkdown(toDocument(form, ki, { crm: true }));
  return einschaetzung ? `${einschaetzung}\n\n${doc}` : doc;
}

/** Das Dossier als Markdown zum Kopieren (mit Kontakt und Referenzen). */
export function dossierMarkdown(form: Form, ki: SponsoringOutput | null, datum?: string): string {
  return toMarkdown(toDocument(form, ki, { datum }));
}

/**
 * Die Angaben fürs CRM, eine je Zeile. Ohne Kontaktdaten, ohne Namen der Referenzen und ohne die Stichworte für die KI.
 * Der Server kürzt auf 1'900 Zeichen; das Wichtigste steht darum oben.
 */
export function eingabeText(form: Form): string {
  const lines: string[] = [`Verein: ${clean(form.verein)}`];
  const ort = ortLabel(form);
  if (ort) lines.push(`Ort: ${ort}`);
  if (clean(form.anlass)) lines.push(`Anlass oder Saison: ${clean(form.anlass)}`);
  for (const z of zahlenZeilen(form)) lines.push(`${z.label}: ${numberCH(z.wert, 0)}`);
  lines.push(`Zielgruppe der Sponsoren: ${clean(form.zielgruppe)}`);
  for (const p of aktivePakete(form)) lines.push(`${p.name}: ${chf(p.preis)}; ${leistungenListe(p).join(", ")}`);
  if (cleanLines(form.referenzen)) lines.push("Referenzen: angegeben (die Namen bleiben im Browser)");
  if (clean(form.website)) lines.push(`Website: ${clean(form.website)}`);
  return lines.join("\n");
}

// ---- KI ----------------------------------------------------------------------------------------

/** Für die KI-Texte braucht es Stichworte von mindestens 10 Zeichen. */
export function kiBereit(form: Pick<Form, "stichworte">): boolean {
  return Array.from(form.stichworte.trim()).length >= MAX.stichworteMin;
}

/**
 * Eingabe an die KI: Verein, Ort, Stichworte, Zielgruppe, die Zahlen und die Pakete mit Namen, Preis und Gegenleistungen.
 * Nie die Kontaktdaten, die Referenzen, die Website oder die E-Mail-Adresse. null, wenn die Angaben nicht reichen.
 */
export function toKiInput(form: Form): SponsoringInput | null {
  if (!kiBereit(form)) return null;
  const candidate = {
    verein: clean(form.verein),
    ort: ortLabel(form),
    stichworte: clean(form.stichworte),
    zielgruppe: clean(form.zielgruppe),
    zahlen: zahlenZeilen(form).map((z) => ({ label: z.label, wert: z.wert })),
    pakete: aktivePakete(form).map((p) => ({ name: p.name, preis: p.preis, leistungen: leistungenListe(p) })),
  };
  const parsed = sponsoringInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Wofür die KI-Texte geschrieben wurden: ändert sich die Eingabe, passen die Texte nicht mehr. Leer, wenn keine KI-Eingabe möglich ist. */
export function kiSignatur(form: Form): string {
  const input = toKiInput(form);
  return input ? JSON.stringify(input) : "";
}

/** Die Eingabe an die KI als lesbarer Text fürs CRM. */
export function kiEingabeText(input: SponsoringInput): string {
  return [
    `Verein: ${input.verein}`,
    input.ort ? `Ort: ${input.ort}` : "",
    `Stichworte: ${input.stichworte}`,
    `Zielgruppe der Sponsoren: ${input.zielgruppe}`,
    ...input.zahlen.map((z) => `${z.label}: ${numberCH(z.wert, 0)}`),
    ...input.pakete.map((p) => `${p.name}: ${chf(p.preis)}; ${p.leistungen.join(", ")}`),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Die drei Absätze der KI als lesbarer Text fürs CRM. */
export function kiAusgabeText(ki: SponsoringOutput): string {
  return `Porträt des Vereins\n${ki.portraet}\n\nWarum Sponsoring hier wirkt\n${ki.warum}\n\nDank und nächste Schritte\n${ki.dank}\n`;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type SdState = {
  v: 1;
  phase: "edit" | "result";
  form: Form;
  /** Die drei Absätze der KI, wenn die Person sie hat schreiben lassen. */
  ki: SponsoringOutput | null;
  /** Eingabe an die KI, für die `ki` geschrieben wurde (kiSignatur). */
  kiSig: string;
};

export const EMPTY_STATE: SdState = { v: 1, phase: "edit", form: EMPTY_FORM, ki: null, kiSig: "" };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Höchstlänge eines gespeicherten Textfelds (die Felder selbst haben engere Grenzen im Formular). */
const CAP = 2000;
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v.slice(0, CAP) : fallback);

function parsePaket(raw: unknown, index: number): PaketForm {
  const r = isObject(raw) ? raw : {};
  return {
    name: str(r.name, DEFAULT_NAMEN[index]),
    preis: str(r.preis),
    haken: Array.isArray(r.haken) ? HAKEN_KEYS.filter((k) => (r.haken as unknown[]).includes(k)) : [],
    social: str(r.social),
    tickets: str(r.tickets),
    weitere: str(r.weitere),
  };
}

/** Liest ein Formular aus beliebigen Daten: jedes Feld einzeln, Unbrauchbares wird zum Standardwert. Der Text bleibt, wie er steht. */
export function parseForm(raw: unknown): Form {
  if (!isObject(raw)) return EMPTY_FORM;
  const zahlen = isObject(raw.zahlen) ? raw.zahlen : {};
  const kontakt = isObject(raw.kontakt) ? raw.kontakt : {};
  const pakete = Array.isArray(raw.pakete) ? raw.pakete : [];
  return {
    verein: str(raw.verein),
    ort: str(raw.ort),
    kanton: str(raw.kanton).slice(0, 40),
    website: str(raw.website),
    anlass: str(raw.anlass),
    zahlen: Object.fromEntries(ZAHL_KEYS.map((k) => [k, str(zahlen[k])])) as Record<ZahlKey, string>,
    zielgruppe: str(raw.zielgruppe),
    pakete: DEFAULT_NAMEN.map((_, i) => parsePaket(pakete[i], i)),
    referenzen: str(raw.referenzen),
    kontakt: { name: str(kontakt.name), funktion: str(kontakt.funktion), telefon: str(kontakt.telefon), email: str(kontakt.email) },
    farbe: typeof raw.farbe === "string" && parseHex(raw.farbe) ? raw.farbe : DEFAULT_FARBE,
    stichworte: str(raw.stichworte),
  };
}

/**
 * Liest den gespeicherten Stand; bei kaputten Daten oder falscher Version gilt der leere Stand. Ein Ergebnis («result»)
 * gibt es nur mit einem Formular, das die Prüfung besteht; sonst gilt «edit». Kaputte KI-Texte fallen allein weg.
 */
export function parseState(raw: unknown): SdState {
  if (!isObject(raw) || raw.v !== 1) return EMPTY_STATE;
  const form = parseForm(raw.form);
  const ki = sponsoringOutput.safeParse(raw.ki);
  const phase = raw.phase === "result" && inputProblem(form) === null ? "result" : "edit";
  return { v: 1, phase, form, ki: ki.success ? ki.data : null, kiSig: ki.success ? str(raw.kiSig) : "" };
}
