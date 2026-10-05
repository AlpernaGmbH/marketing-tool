import { typoCH } from "@/lib/ch";
import type { Profile } from "@/lib/profile";

// Bewertungs-Kit für Google: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Prüfung des Bewertungslinks und der Place-ID, Farbkontrast, Anfrage-Vorlagen, Druckmasse in Punkt,
// Texte fürs CRM und der gespeicherte Stand. Das Zeichnen (QR, PDF) steht in export.ts.
// Spec: specs/bewertungs-kit.md

export const SLUG = "bewertungs-kit";

/** Papierfarbe der Aufsteller (Design-Token --paper). */
export const PAPER = "#FFFDF8";
export const INK = "#0F0F0E";
export const DEFAULT_FARBE = INK;
/** Unter diesem Kontrast zu Papier ist eine Farbe für Rahmen und Titel zu hell (WCAG-Schwelle für Grafik und grosse Schrift). */
export const MIN_CONTRAST = 3;
/** Richtwert für eine SMS ohne Umbruch in zwei Nachrichten. */
export const SMS_MAX = 160;
export const MAX_LINK = 2000;
export const PLACE_ID = { min: 10, max: 300 } as const;

/** Hilfeseiten von Google, mit WebFetch am 05.10.2026 geöffnet. */
export const HELP = {
  linkHilfe: {
    title: "Link oder QR-Code zum Anfordern von Rezensionen erstellen",
    url: "https://support.google.com/business/answer/16816815",
  },
  tipps: { title: "Tipps für mehr Rezensionen", url: "https://support.google.com/business/answer/3474122" },
  richtlinie: {
    title: "Richtlinien für von Maps-Nutzern veröffentlichte Inhalte",
    url: "https://support.google.com/contributionpolicy/answer/7400114",
  },
} as const;

/** Schritte zum Link laut der Hilfeseite von Google (HELP.linkHilfe). */
export const LINK_SCHRITTE = [
  "Melde dich bei Google an und öffne business.google.com mit dem Konto, das dein Unternehmensprofil verwaltet.",
  "Wähle «Rezensionen lesen» und dann «Mehr Rezensionen erhalten».",
  "Klicke auf das Kopiersymbol neben dem Link und füge den Link hier ein.",
] as const;

export const HINWEIS_GEGENLEISTUNG =
  "Frag ohne Gegenleistung. Google lässt keine Anreize für Rezensionen zu, etwa Zahlungen, Rabatte oder kostenlose Produkte und Dienstleistungen. Frag alle Kunden gleich, nicht nur die zufriedenen.";

// ---- Anrede --------------------------------------------------------------------------------------

export type Anrede = "du" | "sie";
export const ANREDEN: { value: Anrede; label: string }[] = [
  { value: "du", label: "Du" },
  { value: "sie", label: "Sie" },
];
export const isAnrede = (v: unknown): v is Anrede => v === "du" || v === "sie";
export const anredeLabel = (a: Anrede): string => (a === "du" ? "Du" : "Sie");

const stringsOf = (v: unknown, depth = 0): string[] => {
  if (typeof v === "string") return [v];
  if (depth > 3 || typeof v !== "object" || v === null) return [];
  return Object.values(v as Record<string, unknown>).flatMap((x) => stringsOf(x, depth + 1));
};

/** Liest die Anrede aus profile.marke.tonalitaet (Feld «anrede» oder erkennbar im Text), sonst "". */
export function anredeFromProfile(profile: Pick<Profile, "marke"> | null | undefined): Anrede | "" {
  const ton = profile?.marke?.tonalitaet;
  if (!ton || typeof ton !== "object") return "";
  const direct = (ton as Record<string, unknown>).anrede;
  if (isAnrede(direct)) return direct;
  const text = stringsOf(ton).join("\n");
  const per = /\bper\s+(Sie|Du)\b/i.exec(text);
  if (per) return per[1].toLowerCase() === "sie" ? "sie" : "du";
  const form = /\b(Sie|Du)-Form\b/i.exec(text);
  if (form) return form[1].toLowerCase() === "sie" ? "sie" : "du";
  // «Sie» am Satzanfang ist mehrdeutig (auch Plural); nur mitten im Satz zählt es als Anrede.
  if (/[^.!?\n]\s+Sie\b/.test(text) || /\bIhnen\b|\bIhre[nmrs]?\b/.test(text)) return "sie";
  if (/\b[Dd]u\b|\b[Dd]ein(?:e[nmrs]?)?\b|\b[Dd]ich\b|\b[Dd]ir\b/.test(text)) return "du";
  return "";
}

// ---- Formular ------------------------------------------------------------------------------------

export type FormFields = { link: string; placeId: string; anrede: Anrede | ""; farbe: string };
export const EMPTY_FORM: FormFields = { link: "", placeId: "", anrede: "", farbe: DEFAULT_FARBE };

export type KitState = { v: 1; phase: "edit" | "result" } & FormFields;
export const EMPTY_STATE: KitState = { v: 1, phase: "edit", ...EMPTY_FORM };

export const LINK_MELDUNG = "Das sieht nicht wie ein Google-Link aus. Kopiere den Link aus deinem Unternehmensprofil oder gib die Place-ID an.";
export const LEER_MELDUNG = "Gib deinen Google-Bewertungslink an oder die Place-ID.";
export const FARBE_HELL_MELDUNG = "Diese Farbe ist auf Papier zu hell.";
export const FARBE_FORM_MELDUNG = "Die Akzentfarbe braucht einen Hex-Wert wie #0F0F0E.";

const HOSTS = new Set(["g.page", "search.google.com", "maps.google.com", "maps.app.goo.gl"]);

/** https-Link auf g.page, search.google.com, maps.google.com, google.com/maps, goo.gl/maps oder maps.app.goo.gl. */
export function isGoogleReviewLink(input: string): boolean {
  const s = input.trim();
  if (!s || s.length > MAX_LINK || /\s/.test(s)) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (HOSTS.has(host)) return true;
  if ((host === "google.com" || host === "www.google.com") && /^\/maps(?:\/|$)/.test(u.pathname)) return true;
  if (host === "goo.gl" && /^\/maps(?:\/|$)/.test(u.pathname)) return true;
  return false;
}

export function linkProblem(input: string): string | null {
  if (!input.trim()) return LEER_MELDUNG;
  return isGoogleReviewLink(input) ? null : LINK_MELDUNG;
}

/** Place-ID: nicht leer, keine Leerzeichen, 10 bis 300 Zeichen. */
export function placeIdProblem(input: string): string | null {
  const s = input.trim();
  if (!s) return "Gib die Place-ID an.";
  if (/\s/.test(s)) return "Die Place-ID enthält keine Leerzeichen. Kopiere sie am Stück.";
  if (s.length < PLACE_ID.min || s.length > PLACE_ID.max) return `Die Place-ID hat ${PLACE_ID.min} bis ${PLACE_ID.max} Zeichen.`;
  return null;
}

export const placeIdUrl = (id: string): string => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id.trim())}`;

const looksLikeUrl = (s: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.includes("/") || s.includes(".");

/** Bewertungslink aus einem Google-Link oder einer Place-ID; null, wenn beides nicht passt. */
export function reviewUrl(linkOrPlaceId: string): string | null {
  const s = linkOrPlaceId.trim();
  if (!s) return null;
  if (looksLikeUrl(s)) return isGoogleReviewLink(s) ? s : null;
  return placeIdProblem(s) ? null : placeIdUrl(s);
}

/** Der Link des Formulars: der Bewertungslink hat Vorrang, sonst die Place-ID. */
export function resolveUrl(form: Pick<FormFields, "link" | "placeId">): string | null {
  if (form.link.trim()) return isGoogleReviewLink(form.link) ? form.link.trim() : null;
  if (form.placeId.trim()) return placeIdProblem(form.placeId) ? null : placeIdUrl(form.placeId);
  return null;
}

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. */
export function formProblem(form: FormFields, profile: Pick<Profile, "firma">): string | null {
  if (!(profile.firma ?? "").trim()) return "Gib den Namen deines Betriebs an.";
  if (!form.link.trim() && !form.placeId.trim()) return LEER_MELDUNG;
  const problem = form.link.trim() ? linkProblem(form.link) : placeIdProblem(form.placeId);
  if (problem) return problem;
  if (!isAnrede(form.anrede)) return "Wähle die Anrede: Du oder Sie.";
  return farbProblem(form.farbe);
}

// ---- Farbe ---------------------------------------------------------------------------------------

/** «#0F0F0E» oder «#fff» → [r, g, b] in 0 bis 255; null bei allem anderen. */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export const normalizeHex = (hex: string): string => {
  const rgb = parseHex(hex);
  return rgb ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`.toUpperCase() : DEFAULT_FARBE;
};

/** Relative Helligkeit nach WCAG 2.x; null bei ungültigem Hex. */
export function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrastverhältnis zweier Farben (1 bis 21); null bei ungültigem Hex. */
export function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Zu hell für Rahmen und Titel auf Papier (#FFFDF8): Kontrast unter 3:1. Ungültige Werte zählen nicht als zu hell. */
export function isTooLight(hex: string): boolean {
  const c = contrast(hex, PAPER);
  return c !== null && c < MIN_CONTRAST;
}

export function farbProblem(hex: string): string | null {
  if (!parseHex(hex)) return FARBE_FORM_MELDUNG;
  return isTooLight(hex) ? FARBE_HELL_MELDUNG : null;
}

// ---- Vorlagen ------------------------------------------------------------------------------------

export type Kanal = "sms" | "whatsapp" | "email";
export const KANAELE: { value: Kanal; label: string; copyLabel: string }[] = [
  { value: "sms", label: "SMS", copyLabel: "SMS kopieren" },
  { value: "whatsapp", label: "WhatsApp", copyLabel: "WhatsApp-Text kopieren" },
  { value: "email", label: "E-Mail", copyLabel: "E-Mail kopieren" },
];

/** Platzhalter {firma} und {link} setzt fillTemplate ein; [Name] und [Auftrag] füllt die Person von Hand. */
export const TEMPLATES: Record<Anrede, Record<Kanal, string>> = {
  du: {
    sms: "Hallo [Name], danke für deinen Auftrag. Magst du uns auf Google bewerten? Ehrlich reicht: {link} Grüsse, {firma}",
    whatsapp:
      "Hallo [Name]\nDanke für deinen Auftrag ([Auftrag]). Wir hoffen, du bist zufrieden.\nMagst du uns auf Google bewerten? Das dauert eine Minute und hilft anderen aus der Region bei der Wahl: {link}\nEine ehrliche Bewertung reicht uns.\nGrüsse, {firma}",
    email:
      "Betreff: Wie war es bei uns, [Name]?\n\nHallo [Name]\n\nDanke für deinen Auftrag ([Auftrag]). Wir hoffen, alles ist so, wie du es dir vorgestellt hast.\n\nMagst du uns auf Google bewerten? Das dauert eine Minute und hilft anderen aus der Region bei der Wahl. Eine ehrliche Bewertung reicht uns, auch wenn nicht alles perfekt war: {link}\n\nFreundliche Grüsse\n{firma}",
  },
  sie: {
    sms: "Guten Tag [Name], danke für Ihren Auftrag. Mögen Sie uns auf Google bewerten? Ehrlich reicht: {link} Grüsse, {firma}",
    whatsapp:
      "Guten Tag [Name]\nDanke für Ihren Auftrag ([Auftrag]). Wir hoffen, Sie sind zufrieden.\nMögen Sie uns auf Google bewerten? Das dauert eine Minute und hilft anderen aus der Region bei der Wahl: {link}\nEine ehrliche Bewertung reicht uns.\nFreundliche Grüsse, {firma}",
    email:
      "Betreff: Wie war es bei uns, [Name]?\n\nGuten Tag [Name]\n\nDanke für Ihren Auftrag ([Auftrag]). Wir hoffen, alles ist so, wie Sie es sich vorgestellt haben.\n\nMögen Sie uns auf Google bewerten? Das dauert eine Minute und hilft anderen aus der Region bei der Wahl. Eine ehrliche Bewertung reicht uns, auch wenn nicht alles perfekt war: {link}\n\nFreundliche Grüsse\n{firma}",
  },
};

/** Kurze SMS ohne Namen und Firma, wenn der Link die 160 Zeichen sprengt. */
export const SMS_KURZ: Record<Anrede, string> = {
  du: "Danke für deinen Auftrag. Eine ehrliche Google-Bewertung hilft uns: {link}",
  sie: "Danke für Ihren Auftrag. Eine ehrliche Google-Bewertung hilft uns: {link}",
};

/** Setzt Firma und Link ein. typoCH läuft über den Text, nie über den Link (Prozentzeichen in URLs). */
export function fillTemplate(template: string, values: { firma: string; link: string }): string {
  const text = typoCH(template.split("{firma}").join(values.firma.trim()));
  return text.split("{link}").join(values.link.trim());
}

export type Texte = Record<Kanal, string>;

/** Die drei Vorlagen einer Anrede; die SMS fällt auf die kurze Form zurück, wenn sie über 160 Zeichen hätte. */
export function buildTexts(anrede: Anrede, firma: string, link: string): Texte {
  const fill = (t: string) => fillTemplate(t, { firma, link });
  let sms = fill(TEMPLATES[anrede].sms);
  if (sms.length > SMS_MAX) sms = fill(SMS_KURZ[anrede]);
  return { sms, whatsapp: fill(TEMPLATES[anrede].whatsapp), email: fill(TEMPLATES[anrede].email) };
}

/** Texte auf den Aufstellern und Aufklebern. */
export const DRUCK = {
  titel: "Wie war es bei uns?",
  satz: (firma: string, anrede: Anrede) => (anrede === "du" ? `Bewerte ${firma} auf Google` : `Bewerten Sie ${firma} auf Google`),
  danke: (anrede: Anrede) => (anrede === "du" ? "Danke für deine Bewertung" : "Danke für Ihre Bewertung"),
  aufkleber: (anrede: Anrede) => (anrede === "du" ? "Bewerte uns auf Google" : "Bewerten Sie uns auf Google"),
  scan: "Kamera auf den Code richten",
  google: "Google-Bewertung",
} as const;

// ---- Druckmasse in Punkt -------------------------------------------------------------------------

/** 1 mm in PDF-Punkt (1/72 Zoll). */
export const MM = 72 / 25.4;
export const mm = (v: number): number => v * MM;

export type Box = { x: number; y: number; w: number; h: number };
export type StandSize = "a6" | "a5";

export const PAGES = {
  a6: { w: mm(105), h: mm(148) },
  a5: { w: mm(148), h: mm(210) },
  a4: { w: mm(210), h: mm(297) },
} as const;

export const STAND_LABELS: Record<StandSize, string> = { a6: "Aufsteller A6 (PDF)", a5: "Aufsteller A5 (PDF)" };

export type StandLayout = {
  size: StandSize;
  page: { w: number; h: number };
  /** Rahmen in der Akzentfarbe, innen liegt alles andere. */
  frame: Box;
  /** Strichstärke des Rahmens und Innenabstand. */
  stroke: number;
  pad: number;
  /** QR-Code mit Ruhezone, zentriert; y gilt für Layout 1, y2 für Layout 2. */
  qr: Box;
  qr2: Box;
  /** Schriftgrössen. */
  title: number;
  text: number;
  small: number;
  footer: number;
  /** Grundlinien von oben (Abstand zur oberen Seitenkante). */
  titleTop: number;
  textTop: number;
  footTop: number;
};

/** Alle Masse der Aufsteller in Punkt; A5 ist A6 mal 1,41 (Seitenverhältnis der A-Reihe). */
export function standLayout(size: StandSize): StandLayout {
  const page = PAGES[size];
  const k = size === "a6" ? 1 : PAGES.a5.w / PAGES.a6.w;
  const margin = mm(7) * k;
  const pad = mm(6) * k;
  const frame: Box = { x: margin, y: margin, w: page.w - 2 * margin, h: page.h - 2 * margin };
  const qrSize = mm(56) * k;
  const qrX = (page.w - qrSize) / 2;
  return {
    size,
    page,
    frame,
    stroke: 1.5 * k,
    pad,
    qr: { x: qrX, y: page.h - mm(50) * k - qrSize, w: qrSize, h: qrSize },
    qr2: { x: qrX, y: page.h - mm(38) * k - qrSize, w: qrSize, h: qrSize },
    title: 20 * k,
    text: 11 * k,
    small: 8 * k,
    footer: 7 * k,
    titleTop: mm(18) * k,
    textTop: mm(30) * k,
    footTop: page.h - margin - pad,
  };
}

export type StickerLayout = {
  page: { w: number; h: number };
  cell: number;
  gap: number;
  cells: Box[];
  /** Grösse des QR-Codes innerhalb einer Zelle und Abstand zum Zellenrand. */
  qr: number;
  pad: number;
  text: number;
  /** Länge der Schnittmarken ausserhalb der Zellen. */
  mark: number;
  footer: number;
};

/** A4 mit 8 Aufklebern 50 × 50 mm in 2 Spalten und 4 Reihen, zentriert, mit Schnittmarken. */
export function stickerLayout(): StickerLayout {
  const page = PAGES.a4;
  const cell = mm(50);
  const gap = mm(10);
  const cols = 2;
  const rows = 4;
  const left = (page.w - (cols * cell + (cols - 1) * gap)) / 2;
  const top = (page.h - (rows * cell + (rows - 1) * gap)) / 2;
  const cells: Box[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: left + c * (cell + gap), y: page.h - top - (r + 1) * cell - r * gap, w: cell, h: cell });
    }
  }
  return { page, cell, gap, cells, qr: mm(34), pad: mm(3), text: 8.5, mark: mm(3), footer: 7 };
}

// ---- CRM und Stand -------------------------------------------------------------------------------

/** Eingabe fürs CRM: eine Angabe je Zeile. */
export function eingabeText(form: FormFields, firma: string): string {
  const lines = [`Firma: ${firma.trim() || "keine Angabe"}`];
  if (form.link.trim()) lines.push(`Bewertungslink: ${form.link.trim()}`);
  else lines.push(`Place-ID: ${form.placeId.trim()}`);
  lines.push(`Anrede: ${isAnrede(form.anrede) ? anredeLabel(form.anrede) : "keine Angabe"}`);
  lines.push(`Akzentfarbe: ${normalizeHex(form.farbe)}`);
  return lines.join("\n");
}

/** Ausgabe fürs CRM: Link, was erzeugt wurde, und die drei Vorlagen der gewählten Anrede. */
export function ausgabeText(url: string, anrede: Anrede, texte: Texte): string {
  const a = anredeLabel(anrede);
  return [
    `Bewertungslink: ${url}`,
    "Erzeugt: Aufsteller A6 (zwei Layouts), Aufsteller A5 (zwei Layouts), Aufkleber-Bogen A4 (8 Stück), QR-Code als PNG",
    `## SMS (${a})\n${texte.sms}`,
    `## WhatsApp (${a})\n${texte.whatsapp}`,
    `## E-Mail (${a})\n${texte.email}`,
  ].join("\n\n");
}

const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Stand unter mt:bewertungs-kit. Kaputte Daten ergeben den leeren Stand; ein Ergebnis ohne gültigen Link fällt auf «edit». */
export function parseState(raw: unknown): KitState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const s = raw as Record<string, unknown>;
  if (s.v !== 1) return EMPTY_STATE;
  const form: FormFields = {
    link: clip(s.link, MAX_LINK),
    placeId: clip(s.placeId, PLACE_ID.max),
    anrede: isAnrede(s.anrede) ? s.anrede : "",
    farbe: typeof s.farbe === "string" && parseHex(s.farbe) ? normalizeHex(s.farbe) : DEFAULT_FARBE,
  };
  const complete = s.phase === "result" && isAnrede(form.anrede) && resolveUrl(form) !== null && !farbProblem(form.farbe);
  return { v: 1, phase: complete ? "result" : "edit", ...form };
}
