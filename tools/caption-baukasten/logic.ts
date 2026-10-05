import { numberCH, typoCH } from "@/lib/ch";
import { safeFilename } from "@/lib/export/model";
import { anredeFromProfile, anredeLabel, isAnrede, type Anrede } from "@/tools/bewertungs-kit/logic";
import type { TextcheckState } from "@/tools/textcheck/logic";

// Caption-Baukasten: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Hook-Formel, Aufbau und Aufforderung ergeben je Plattform eine fertige Caption. Keine KI.
// Alle Muster stehen hier, jedes in einer Du- und einer Sie-Fassung. Spec: specs/caption-baukasten.md
//
// Für den Post-Generator (später): `foldInfo(platform, text)` ist stabil und darf importiert werden.
//   foldInfo(platform: Platform, text: string): { limit: number; before: number; over: number }
//   limit  = Stelle der Faltkante in genau diesem Text, in Zeichen (Instagram 125, LinkedIn 210 oder früher das Ende
//            der dritten Zeile, Facebook 480, Google-Beitrag 1'500 als Grenze)
//   before = Zeichen bis dahin = min(Länge, limit);  over = Zeichen dahinter = Länge − before

export const SLUG = "caption-baukasten";
export const STORAGE_KEY = `mt:${SLUG}`;
export type { Anrede };
export { anredeFromProfile, anredeLabel, isAnrede };

/** Grenzen der Eingaben in Zeichen. */
export const LIMITS = { hook: 160, teil: 700, cta: 400, hashtags: 300 } as const;
export const MAX_ENTWUERFE = 10;
export const FOLD_NOTE = "Richtwert von Alperna, keine Statistik; die Plattformen ändern das.";

export type Fassung = { du: string; sie: string };
export const ANREDEN: { value: Anrede; label: string }[] = [
  { value: "du", label: "Du" },
  { value: "sie", label: "Sie" },
];

// ---- Zeichen und Text ------------------------------------------------------------------------------

/** Zeichen als Unicode-Zeichen (ein Emoji zählt als eins), nicht als UTF-16-Einheiten. */
export const charCount = (s: string): number => Array.from(s).length;

const clamp = (s: string, max: number): string => (s.length <= max ? s : Array.from(s).slice(0, max).join(""));
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Zeilenenden vereinheitlicht, Schweizer Schreibweise, Leerraum an den Zeilenenden weg, höchstens eine Leerzeile am Stück. */
export function tidy(s: string): string {
  return typoCH(s.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---- Platzhalter -----------------------------------------------------------------------------------

const PLACEHOLDER_RE = /\[([^[\]\n]{1,40})\]/g;

/** Die Platzhalter in `[Klammern]`, jeder einmal, in der Reihenfolge des Auftretens. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER_RE)].map((m) => m[1]))];
}

const stripQuotes = (v: string): string => v.replace(/^[«"“„‹]+\s*/, "").replace(/\s*[»"”“›]+$/, "");

/**
 * Setzt die Werte in ein Muster ein. Ein fehlender oder leerer Wert lässt `[Name]` stehen.
 * Endet der Wert auf das Satzzeichen, das im Muster gleich danach folgt, entfällt das Zeichen im Muster (kein «..»).
 * Steht der Platzhalter zwischen « und », fallen Anführungszeichen und ein Schlusspunkt des Werts weg.
 */
export function fill(pattern: string, felder: Readonly<Record<string, string | undefined>>): string {
  let out = "";
  let last = 0;
  for (const m of pattern.matchAll(PLACEHOLDER_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    out += pattern.slice(last, start);
    last = end;
    const raw = Object.prototype.hasOwnProperty.call(felder, m[1]) ? felder[m[1]] : undefined;
    let value = typeof raw === "string" ? oneLine(raw) : "";
    if (!value) {
      out += m[0];
      continue;
    }
    const next = pattern[end];
    if (pattern[start - 1] === "«" && next === "»") value = stripQuotes(value).replace(/\.$/, "");
    if (!value) {
      out += m[0];
      continue;
    }
    out += value;
    if (next && ".?!".includes(next) && value.endsWith(next)) last = end + 1;
  }
  return out + pattern.slice(last);
}

// ---- Plattformen und Faltkante ---------------------------------------------------------------------

export const PLATFORM_KEYS = ["instagram", "linkedin", "facebook", "google"] as const;
export type Platform = (typeof PLATFORM_KEYS)[number];
export const isPlatform = (v: unknown): v is Platform => typeof v === "string" && (PLATFORM_KEYS as readonly string[]).includes(v);

export type PlatformInfo = {
  key: Platform;
  label: string;
  copyLabel: string;
  /** Zeichen bis zur Faltkante (bei Google: bis zur Grenze). Richtwert von Alperna, keine Statistik. */
  limit: number;
  /** «faltkante»: danach folgt «mehr». «grenze»: mehr passt nicht. */
  kind: "faltkante" | "grenze";
  /** LinkedIn: Die Faltkante liegt spätestens am Ende dieser Zeile. */
  maxLines?: number;
  hashtags: boolean;
};

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  instagram: { key: "instagram", label: "Instagram", copyLabel: "Instagram-Text kopieren", limit: 125, kind: "faltkante", hashtags: true },
  linkedin: { key: "linkedin", label: "LinkedIn", copyLabel: "LinkedIn-Text kopieren", limit: 210, kind: "faltkante", maxLines: 3, hashtags: false },
  facebook: { key: "facebook", label: "Facebook", copyLabel: "Facebook-Text kopieren", limit: 480, kind: "faltkante", hashtags: false },
  google: { key: "google", label: "Google-Beitrag", copyLabel: "Google-Text kopieren", limit: 1500, kind: "grenze", hashtags: false },
};

export type FoldInfo = { limit: number; before: number; over: number };

/** Stelle des n-ten Zeilenumbruchs (= Ende der n-ten Zeile) in Zeichen; null, wenn der Text weniger Umbrüche hat. */
function lineEnd(chars: string[], n: number): number | null {
  let seen = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "\n" && ++seen === n) return i;
  }
  return null;
}

/** Faltkante eines Textes auf einer Plattform. Stabile Schnittstelle, auch für den Post-Generator. */
export function foldInfo(platform: Platform, text: string): FoldInfo {
  const p = PLATFORMS[platform];
  const chars = Array.from(text);
  let limit = p.limit;
  if (p.maxLines) {
    const end = lineEnd(chars, p.maxLines);
    if (end !== null) limit = Math.min(limit, end);
  }
  const before = Math.min(chars.length, limit);
  return { limit, before, over: chars.length - before };
}

/** Der Text vor und hinter der Faltkante, für die Vorschau. */
export function splitAtFold(platform: Platform, text: string): { before: string; after: string } {
  const { before } = foldInfo(platform, text);
  const chars = Array.from(text);
  return { before: chars.slice(0, before).join(""), after: chars.slice(before).join("") };
}

/** «312 Zeichen, davon 125 vor der Faltkante»; bei Google «… innerhalb der Grenze von 1'500». */
export function counterLabel(platform: Platform, text: string): string {
  const info = foldInfo(platform, text);
  const total = numberCH(info.before + info.over, 0);
  const before = numberCH(info.before, 0);
  return PLATFORMS[platform].kind === "grenze"
    ? `${total} Zeichen, davon ${before} innerhalb der Grenze von ${numberCH(info.limit, 0)}`
    : `${total} Zeichen, davon ${before} vor der Faltkante`;
}

/** Was an der Stelle passiert, für den Hinweis unter der Vorschau. */
export function foldHint(platform: Platform, over: number): string {
  if (PLATFORMS[platform].kind === "grenze") {
    return over > 0 ? "Der Text ist länger als die Grenze. Kürze ihn, sonst wird er abgeschnitten." : "Der Text passt in die Grenze.";
  }
  return over > 0 ? "Ab hier zeigt die Plattform «mehr» an. Der Hook gehört davor." : "Der ganze Text steht vor der Faltkante.";
}

// ---- Hook-Formeln ----------------------------------------------------------------------------------

export const HOOK_KEYS = ["frage", "zahl", "kontrast", "vorher-nachher", "fehler", "gestaendnis", "liste", "zitat"] as const;
export type HookKey = (typeof HOOK_KEYS)[number];
export const isHookKey = (v: unknown): v is HookKey => typeof v === "string" && (HOOK_KEYS as readonly string[]).includes(v);

export type HookField = { name: string; hint: string; beispiel: string };
export type Hook = { key: HookKey; label: string; beschreibung: string; pattern: Fassung; fields: HookField[] };

// Die Platzhalter nehmen nie ein auf die Person gebeugtes Verb auf, damit die Umschaltung Du/Sie nur das Muster betrifft.
// Zahlen stehen nie im Muster: Die Person setzt sie selbst ein (Harte Regel 7).
export const HOOKS: Record<HookKey, Hook> = {
  frage: {
    key: "frage",
    label: "Frage",
    beschreibung: "Eine Frage aus dem Alltag der Kundschaft.",
    pattern: { du: "Was machst du, wenn [Situation]?", sie: "Was machen Sie, wenn [Situation]?" },
    fields: [
      {
        name: "Situation",
        hint: "Ein Nebensatz, der nach «wenn» passt, zum Beispiel «der Anstrich abblättert».",
        beispiel: "der Anstrich schon nach wenigen Wintern abblättert",
      },
    ],
  },
  zahl: {
    key: "zahl",
    label: "Zahl",
    beschreibung: "Eine Zahl und das Versprechen, was folgt. Die Zahl setzt du selbst ein.",
    pattern: { du: "[Zahl] [Begriff], die du bei [Thema] prüfen solltest.", sie: "[Zahl] [Begriff], die Sie bei [Thema] prüfen sollten." },
    fields: [
      { name: "Zahl", hint: "Eine Zahl oder ein Zahlwort, zum Beispiel «Drei».", beispiel: "Drei" },
      { name: "Begriff", hint: "Was gezählt wird, zum Beispiel Punkte, Fragen oder Tipps.", beispiel: "Punkte" },
      { name: "Thema", hint: "Mit «bei» davor, also im Dativ: «einer Offerte», «einem Neuanstrich».", beispiel: "einer Offerte für den Neuanstrich" },
    ],
  },
  kontrast: {
    key: "kontrast",
    label: "Kontrast",
    beschreibung: "Was viele tun, gegen das, was besser ist.",
    pattern: { du: "Nicht [Gewohntes], sondern [Besseres].", sie: "Nicht [Gewohntes], sondern [Besseres]." },
    fields: [
      { name: "Gewohntes", hint: "Was viele tun oder erwarten.", beispiel: "der billigste Anstrich" },
      { name: "Besseres", hint: "Was stattdessen besser ist.", beispiel: "der, der mehrere Winter hält" },
    ],
  },
  "vorher-nachher": {
    key: "vorher-nachher",
    label: "Vorher/Nachher",
    beschreibung: "Zwei Zustände, die sich gegenüberstehen. Passt zu einem Bild.",
    pattern: { du: "Vorher: [Vorher]. Nachher: [Nachher].", sie: "Vorher: [Vorher]. Nachher: [Nachher]." },
    fields: [
      { name: "Vorher", hint: "Der Zustand am Anfang, in wenigen Worten.", beispiel: "graue, rissige Fassade" },
      { name: "Nachher", hint: "Der Zustand am Ende, in wenigen Worten.", beispiel: "frisch gestrichen und dicht" },
    ],
  },
  fehler: {
    key: "fehler",
    label: "Fehler",
    beschreibung: "Ein Fehler, den du aus der Praxis kennst.",
    pattern: {
      du: "Ein Fehler, den wir bei [Thema] immer wieder sehen: [Fehler].",
      sie: "Ein Fehler, den wir bei [Thema] immer wieder sehen: [Fehler].",
    },
    fields: [
      { name: "Thema", hint: "Mit «bei» davor, also im Dativ: «Fassadenanstrichen», «Offerten».", beispiel: "Fassadenanstrichen" },
      { name: "Fehler", hint: "Der Fehler als ganzer Satz.", beispiel: "Es wird gestrichen, bevor der Untergrund trocken ist" },
    ],
  },
  gestaendnis: {
    key: "gestaendnis",
    label: "Geständnis",
    beschreibung: "Ein Fehler oder eine Schwäche, offen gesagt. Das schafft Vertrauen.",
    pattern: { du: "Wir müssen dir etwas gestehen: [Geständnis].", sie: "Wir müssen Ihnen etwas gestehen: [Geständnis]." },
    fields: [{ name: "Geständnis", hint: "Ein ganzer Satz, der stimmt.", beispiel: "Unser erster Fassadenanstrich hielt nur einen Sommer" }],
  },
  liste: {
    key: "liste",
    label: "Liste",
    beschreibung: "Kündigt eine Liste an, die im Hauptteil folgt.",
    pattern: { du: "Checkliste für [Anlass]: Das gehört auf deine Liste.", sie: "Checkliste für [Anlass]: Das gehört auf Ihre Liste." },
    fields: [{ name: "Anlass", hint: "Mit «für» davor, also im Akkusativ: «den Neuanstrich», «das Fest».", beispiel: "den Fassadenanstrich im Frühling" }],
  },
  zitat: {
    key: "zitat",
    label: "Zitat",
    beschreibung: "Eine Stimme aus der Kundschaft.",
    pattern: { du: "«[Zitat]», sagte [Person].", sie: "«[Zitat]», sagte [Person]." },
    fields: [
      { name: "Zitat", hint: "Nur ein echtes Zitat, mit dem Einverständnis der Person.", beispiel: "Das Treppenhaus ist viel heller geworden" },
      { name: "Person", hint: "Wer es gesagt hat, wie die Person genannt werden möchte.", beispiel: "Frau Meier aus Herisau" },
    ],
  },
};

export const hookFieldId = (name: string): string => `cb-hook-${safeFilename(name, "feld")}`;

/** Der Hook mit den Werten der Person; offene Felder bleiben als `[Name]` stehen. */
export function hookText(formel: HookKey, anrede: Anrede, felder: Readonly<Record<string, string>>): string {
  return typoCH(fill(HOOKS[formel].pattern[anrede], felder));
}

const hookExampleValues = (formel: HookKey): Record<string, string> =>
  Object.fromEntries(HOOKS[formel].fields.map((f) => [f.name, f.beispiel]));

/** Der Hook mit den Beispielwerten der Malerei Keller. */
export function hookExample(formel: HookKey, anrede: Anrede): string {
  return hookText(formel, anrede, hookExampleValues(formel));
}

// ---- Aufbau des Hauptteils -------------------------------------------------------------------------

export const STRUCTURE_KEYS = ["problem-loesung", "drei-punkte", "geschichte", "anleitung"] as const;
export type StructureKey = (typeof STRUCTURE_KEYS)[number];
export const isStructureKey = (v: unknown): v is StructureKey => typeof v === "string" && (STRUCTURE_KEYS as readonly string[]).includes(v);

export type StructureField = {
  key: string;
  label: string;
  hint: Fassung;
  beispiel: string;
  optional?: boolean;
  /** Wird ab zwei ausgefüllten nummerierten Feldern mit «1. », «2. » … eingeleitet. */
  nummer?: boolean;
  prefix?: string;
};
export type Structure = { key: StructureKey; label: string; beschreibung: string; fields: StructureField[] };

const same = (s: string): Fassung => ({ du: s, sie: s });

export const STRUCTURES: Record<StructureKey, Structure> = {
  "problem-loesung": {
    key: "problem-loesung",
    label: "Problem und Lösung",
    beschreibung: "Erst, was stört, dann, was du dagegen tust. Der klassische Aufbau.",
    fields: [
      {
        key: "problem",
        label: "Problem",
        hint: { du: "Was stört deine Kundschaft oder dich selbst? Ein bis zwei Sätze.", sie: "Was stört Ihre Kundschaft oder Sie selbst? Ein bis zwei Sätze." },
        beispiel: "Meist ist der Untergrund beim Streichen noch feucht. Dann haftet die Farbe schlecht.",
      },
      {
        key: "loesung",
        label: "Lösung",
        hint: { du: "Was machst du anders? Ein bis zwei Sätze.", sie: "Was machen Sie anders? Ein bis zwei Sätze." },
        beispiel: "Wir messen die Feuchtigkeit vor dem ersten Strich. Erst wenn die Wand trocken ist, streichen wir.",
      },
    ],
  },
  "drei-punkte": {
    key: "drei-punkte",
    label: "Drei Punkte",
    beschreibung: "Drei kurze Gedanken, nummeriert. Gut zu lesen und leicht zu merken.",
    fields: [
      {
        key: "punkt1",
        label: "Punkt 1",
        hint: { du: "Dein wichtigster Punkt zuerst, in ein bis zwei Sätzen.", sie: "Ihr wichtigster Punkt zuerst, in ein bis zwei Sätzen." },
        beispiel: "Untergrund prüfen: Feuchte Wände halten keine Farbe.",
        nummer: true,
      },
      { key: "punkt2", label: "Punkt 2", hint: same("Der zweite Punkt, in ein bis zwei Sätzen."), beispiel: "Wetter beachten: Gestrichen wird bei trockenem Wetter.", nummer: true },
      {
        key: "punkt3",
        label: "Punkt 3",
        hint: same("Der dritte Punkt, in ein bis zwei Sätzen."),
        beispiel: "Farbe passend wählen: Für Fassaden braucht es Farbe, die Wind und Regen aushält.",
        nummer: true,
      },
    ],
  },
  geschichte: {
    key: "geschichte",
    label: "Geschichte",
    beschreibung: "Ein Fall aus dem Betrieb in drei Teilen: Ausgangslage, Wendepunkt, Ergebnis.",
    fields: [
      {
        key: "ausgangslage",
        label: "Ausgangslage",
        hint: same("Wo hat es angefangen? Wer war beteiligt, was war los?"),
        beispiel: "Familie Meier in Herisau wollte ihr Treppenhaus schon lange streichen lassen.",
      },
      {
        key: "wendepunkt",
        label: "Wendepunkt",
        hint: { du: "Was ist passiert und was hast du getan?", sie: "Was ist passiert und was haben Sie getan?" },
        beispiel: "Bei der Begehung zeigte sich, dass die alte Farbe an mehreren Stellen abblätterte. Wir haben zuerst den Untergrund saniert.",
      },
      {
        key: "ergebnis",
        label: "Ergebnis",
        hint: same("Wie sieht es am Ende aus? Was hat sich verändert?"),
        beispiel: "Das Treppenhaus ist hell, ruhig und bereit für die nächsten Jahre.",
      },
    ],
  },
  anleitung: {
    key: "anleitung",
    label: "Anleitung",
    beschreibung: "Eine Aufgabe in Schritten, wie jemand sie selbst erledigen kann.",
    fields: [
      {
        key: "schritt1",
        label: "Schritt 1",
        hint: { du: "Womit fängst du an?", sie: "Womit fangen Sie an?" },
        beispiel: "Die Wand abwaschen und trocknen lassen.",
        nummer: true,
      },
      { key: "schritt2", label: "Schritt 2", hint: same("Der nächste Handgriff."), beispiel: "Risse mit Spachtelmasse füllen und glatt schleifen.", nummer: true },
      { key: "schritt3", label: "Schritt 3", hint: same("Der letzte Handgriff."), beispiel: "Die Farbe in dünnen Schichten auftragen und gut trocknen lassen.", nummer: true },
      {
        key: "tipp",
        label: "Tipp",
        hint: { du: "Ein Kniff aus deiner Erfahrung.", sie: "Ein Kniff aus Ihrer Erfahrung." },
        beispiel: "Wir ziehen das Klebeband ab, solange die Farbe noch leicht feucht ist.",
        optional: true,
        prefix: "Tipp: ",
      },
    ],
  },
};

export const teilFieldId = (key: string): string => `cb-teil-${key}`;
/** «Tipp (freiwillig)» für optionale Felder. */
export const fieldLabel = (f: StructureField): string => (f.optional ? `${f.label} (freiwillig)` : f.label);

// ---- Aufforderung ----------------------------------------------------------------------------------

export const CTA_KEYS = ["kommentar", "nachricht", "profil", "link", "speichern"] as const;
export type CtaKey = (typeof CTA_KEYS)[number];
export const isCtaKey = (v: unknown): v is CtaKey => typeof v === "string" && (CTA_KEYS as readonly string[]).includes(v);

export type Cta = { key: CtaKey; label: string; beschreibung: string; vorschlaege: Fassung[] };

export const CTAS: Record<CtaKey, Cta> = {
  kommentar: {
    key: "kommentar",
    label: "Kommentar",
    beschreibung: "Die Leute sollen antworten.",
    vorschlaege: [
      { du: "Schreib uns in die Kommentare, was du dazu denkst.", sie: "Schreiben Sie uns in die Kommentare, was Sie dazu denken." },
      { du: "Welche Erfahrung hast du damit gemacht? Wir lesen jeden Kommentar.", sie: "Welche Erfahrung haben Sie damit gemacht? Wir lesen jeden Kommentar." },
    ],
  },
  nachricht: {
    key: "nachricht",
    label: "Nachricht",
    beschreibung: "Die Leute sollen sich privat melden.",
    vorschlaege: [
      { du: "Schreib uns eine Nachricht, wir antworten persönlich.", sie: "Schreiben Sie uns eine Nachricht, wir antworten persönlich." },
      { du: "Du hast eine Frage dazu? Schick uns eine Direktnachricht.", sie: "Sie haben eine Frage dazu? Schicken Sie uns eine Direktnachricht." },
    ],
  },
  profil: {
    key: "profil",
    label: "Profil",
    beschreibung: "Die Leute sollen dein Profil ansehen oder dir folgen.",
    vorschlaege: [
      { du: "Mehr aus unserem Alltag findest du in unserem Profil.", sie: "Mehr aus unserem Alltag finden Sie in unserem Profil." },
      { du: "Folge uns, wenn du mehr davon sehen möchtest.", sie: "Folgen Sie uns, wenn Sie mehr davon sehen möchten." },
    ],
  },
  link: {
    key: "link",
    label: "Link",
    beschreibung: "Die Leute sollen auf deine Website. Der Vorschlag nennt keine Adresse; die setzt du selbst ein.",
    vorschlaege: [
      {
        du: "Mehr dazu findest du auf unserer Website. Den Link siehst du in unserem Profil.",
        sie: "Mehr dazu finden Sie auf unserer Website. Den Link sehen Sie in unserem Profil.",
      },
      { du: "Alle Details stehen auf unserer Website, den Link findest du in unserem Profil.", sie: "Alle Details stehen auf unserer Website, den Link finden Sie in unserem Profil." },
    ],
  },
  speichern: {
    key: "speichern",
    label: "Speichern",
    beschreibung: "Die Leute sollen den Beitrag speichern oder weitergeben.",
    vorschlaege: [
      { du: "Speichere dir den Beitrag, damit du ihn später wiederfindest.", sie: "Speichern Sie sich den Beitrag, damit Sie ihn später wiederfinden." },
      { du: "Teile den Beitrag mit jemandem, der ihn brauchen kann.", sie: "Teilen Sie den Beitrag mit jemandem, der ihn brauchen kann." },
    ],
  },
};

/** Die Vorschläge eines Ziels in der gewählten Anrede. */
export const ctaVorschlaege = (ziel: CtaKey, anrede: Anrede): string[] => CTAS[ziel].vorschlaege.map((v) => v[anrede]);

/**
 * Wechselt die Anrede der Aufforderung. Entspricht der Text genau einem Vorschlag des Ziels in der alten Anrede,
 * kommt derselbe Vorschlag in der neuen; eigener oder geänderter Text bleibt.
 */
export function switchCta(ziel: CtaKey, cta: string, von: Anrede, nach: Anrede): string {
  const i = ctaVorschlaege(ziel, von).indexOf(cta.trim());
  return i >= 0 ? CTAS[ziel].vorschlaege[i][nach] : cta;
}

// ---- Hashtags --------------------------------------------------------------------------------------

/** «malerei, #Gossau #malerei» → «#malerei #Gossau». Sonderzeichen weg, Duplikate (ohne Rücksicht auf Gross und Klein) weg. */
export function cleanHashtags(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(/[\s,;]+/)) {
    const word = token
      .replace(/ß/g, "ss")
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]/gu, "");
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${word}`);
  }
  return out.join(" ");
}

// ---- Sätze -----------------------------------------------------------------------------------------

const ABBREVIATIONS = new Set([
  "z", "bzw", "ca", "evtl", "ggf", "inkl", "exkl", "usw", "etc", "nr", "st", "dr", "prof", "hr", "fr", "vgl", "mio", "mrd", "tel", "str", "max", "min", "ev",
]);

/** Kürzel, Einzelbuchstaben und ein- oder zweistellige Zahlen (Ordnungszahlen, Aufzählung) beenden keinen Satz. */
const endsNoSentence = (word: string): boolean => word.length === 1 || /^\d{1,2}$/.test(word) || ABBREVIATIONS.has(word.toLowerCase());

/** Teilt eine Zeile in Sätze. Getrennt wird nach . ! ? …, wenn ein Grossbuchstabe, eine Ziffer oder ein Anführungszeichen folgt. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["»”’)]*(?=\s+[A-ZÄÖÜ0-9«„"(])/gu;
  let start = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (/^\.(?!\.)/.test(m[0])) {
      const word = /([\p{L}\p{N}]+)$/u.exec(text.slice(start, at))?.[1] ?? "";
      if (endsNoSentence(word)) continue;
    }
    const end = at + m[0].length;
    out.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// ---- Zusammensetzen --------------------------------------------------------------------------------

export type Parts = { hook: string; teile: string[]; cta: string; hashtags: string };
export type Texte = Record<Platform, string>;

/** Setzt die Caption für eine Plattform zusammen. Hashtags nur bei Instagram. */
export function compose(platform: Platform, parts: Parts): string {
  const hook = tidy(parts.hook);
  const teile = parts.teile.map(tidy).filter(Boolean);
  const cta = tidy(parts.cta);
  const tags = PLATFORMS[platform].hashtags ? cleanHashtags(parts.hashtags) : "";

  switch (platform) {
    case "instagram": {
      // Jeder Satz des Hauptteils auf eine eigene Zeile; die Teile durch eine Leerzeile getrennt.
      const body = teile.map((t) =>
        t
          .split(/\n{2,}/)
          .map((p) => p.split("\n").flatMap(splitSentences).join("\n"))
          .join("\n\n"),
      );
      return [hook, ...body, cta, tags].filter(Boolean).join("\n\n");
    }
    case "linkedin": {
      // Kurze Absätze: höchstens zwei Sätze, jede eingegebene Zeile für sich.
      const body = teile.flatMap((t) =>
        t
          .split("\n")
          .filter((l) => l.trim())
          .flatMap((line) => chunk(splitSentences(line), 2).map((c) => c.join(" "))),
      );
      return [hook, ...body, cta].filter(Boolean).join("\n\n");
    }
    case "facebook":
      return [hook, ...teile, cta].filter(Boolean).join("\n\n");
    case "google":
      return [hook, ...teile, cta]
        .map((s) => s.replace(/\n{2,}/g, "\n"))
        .filter(Boolean)
        .join("\n");
  }
}

// ---- Felder und Stand ------------------------------------------------------------------------------

export type Felder = {
  formel: HookKey;
  aufbau: StructureKey;
  ziel: CtaKey;
  /** "" = noch nicht gewählt: folgt dem Profil, sonst Du. */
  anrede: Anrede | "";
  /** Platzhalter → Text; gleiche Namen gelten für alle Formeln, die sie nennen. */
  hook: Record<string, string>;
  /** Feld des Hauptteils → Text. */
  teile: Record<string, string>;
  cta: string;
  hashtags: string;
};

export const EMPTY_FELDER: Felder = { formel: "frage", aufbau: "problem-loesung", ziel: "kommentar", anrede: "", hook: {}, teile: {}, cta: "", hashtags: "" };

/** Anrede, die gilt: gewählt, sonst aus dem Profil, sonst Du. */
export const resolveAnrede = (gewaehlt: Anrede | "", ausProfil: Anrede | ""): Anrede => gewaehlt || ausProfil || "du";
const anredeOf = (f: Pick<Felder, "anrede">): Anrede => (f.anrede === "sie" ? "sie" : "du");

/** Der Hauptteil als Absätze: nur ausgefüllte Felder, nummeriert ab zwei ausgefüllten nummerierten Feldern. */
export function teileOf(aufbau: StructureKey, teile: Readonly<Record<string, string>>): string[] {
  const filled = STRUCTURES[aufbau].fields
    .map((f) => ({ f, text: tidy(Object.prototype.hasOwnProperty.call(teile, f.key) ? teile[f.key] : "") }))
    .filter((x) => x.text);
  const numbered = filled.filter((x) => x.f.nummer).length;
  let n = 0;
  return filled.map(({ f, text }) => {
    if (f.nummer && numbered >= 2) return `${++n}. ${text}`;
    return f.prefix ? `${f.prefix}${text}` : text;
  });
}

export function partsOf(f: Felder): Parts {
  return {
    hook: hookText(f.formel, anredeOf(f), f.hook),
    teile: teileOf(f.aufbau, f.teile),
    cta: f.cta,
    hashtags: f.hashtags,
  };
}

/** Die vier Texte zu den Angaben. */
export function captionTexts(f: Felder): Texte {
  const parts = partsOf(f);
  return {
    instagram: compose("instagram", parts),
    linkedin: compose("linkedin", parts),
    facebook: compose("facebook", parts),
    google: compose("google", parts),
  };
}

/** Felder mit den Beispielwerten der Malerei Keller; die Grundlage des Beispiels im Seitentext. */
export function beispielFelder(formel: HookKey, aufbau: StructureKey, ziel: CtaKey, anrede: Anrede): Felder {
  return {
    formel,
    aufbau,
    ziel,
    anrede,
    hook: hookExampleValues(formel),
    teile: Object.fromEntries(STRUCTURES[aufbau].fields.map((f) => [f.key, f.beispiel])),
    cta: ctaVorschlaege(ziel, anrede)[0],
    hashtags: "#MalereiKeller #Gossau #Fassadenanstrich",
  };
}

// ---- Prüfung ---------------------------------------------------------------------------------------

export type Problem = { step: 1 | 2 | 3; message: string; fieldId: string };

const list = (names: string[]): string => names.join(", ");

/** Was in einem Schritt fehlt; null, wenn er vollständig ist. */
export function stepProblem(step: 1 | 2 | 3, f: Felder): Problem | null {
  if (step === 1) {
    const missing = HOOKS[f.formel].fields.filter((x) => !oneLine(f.hook[x.name] ?? ""));
    if (missing.length === 0) return null;
    return { step, message: `Im Hook fehlt noch: ${list(missing.map((x) => x.name))}.`, fieldId: hookFieldId(missing[0].name) };
  }
  if (step === 2) {
    const missing = STRUCTURES[f.aufbau].fields.filter((x) => !x.optional && !oneLine(f.teile[x.key] ?? ""));
    if (missing.length === 0) return null;
    return { step, message: `Im Hauptteil fehlt noch: ${list(missing.map((x) => x.label))}.`, fieldId: teilFieldId(missing[0].key) };
  }
  if (!oneLine(f.cta)) return { step, message: "Die Aufforderung fehlt. Wähle einen Vorschlag oder schreib eine eigene.", fieldId: "cb-cta" };
  const open = placeholdersOf(f.cta);
  if (open.length > 0) {
    return { step, message: `In der Aufforderung steht noch eine Klammer: ${open.map((n) => `[${n}]`).join(", ")}. Ersetze sie durch deinen Text.`, fieldId: "cb-cta" };
  }
  return null;
}

/** Das erste Problem über alle drei Schritte; null, wenn die Angaben für die Caption reichen. */
export function inputProblem(f: Felder): Problem | null {
  return stepProblem(1, f) ?? stepProblem(2, f) ?? stepProblem(3, f);
}

// ---- Entwürfe --------------------------------------------------------------------------------------

export type Entwurf = { id: string; titel: string; gespeichertAm: string; felder: Felder; texte: Texte };

/** Titel eines Entwurfs: der Hook, bei mehr als 60 Zeichen mit «…» gekürzt. */
export function draftTitle(hook: string): string {
  const t = oneLine(hook);
  if (!t) return "Ohne Titel";
  const chars = Array.from(t);
  return chars.length <= 60 ? t : `${chars.slice(0, 59).join("").trimEnd()}…`;
}

export function newDraft(felder: Felder, now: Date, existing: readonly Entwurf[] = []): Entwurf {
  const base = `e-${now.getTime().toString(36)}`;
  const taken = new Set(existing.map((e) => e.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return { id, titel: draftTitle(partsOf(felder).hook), gespeichertAm: now.toISOString(), felder, texte: captionTexts(felder) };
}

/** Der neue Entwurf zuerst; mehr als zehn gibt es nicht, der älteste fällt weg. */
export function addDraft(list: readonly Entwurf[], draft: Entwurf): Entwurf[] {
  return [draft, ...list.filter((e) => e.id !== draft.id)].slice(0, MAX_ENTWUERFE);
}

export const removeDraft = (list: readonly Entwurf[], id: string): Entwurf[] => list.filter((e) => e.id !== id);

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type CaptionState = { v: 1; phase: "edit" | "result"; felder: Felder; entwuerfe: Entwurf[] };
export const EMPTY_STATE: CaptionState = { v: 1, phase: "edit", felder: EMPTY_FELDER, entwuerfe: [] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const HOOK_NAMES = new Set(HOOK_KEYS.flatMap((k) => HOOKS[k].fields.map((f) => f.name)));
const TEIL_KEYS = new Set(STRUCTURE_KEYS.flatMap((k) => STRUCTURES[k].fields.map((f) => f.key)));

function stringRecord(raw: unknown, allowed: ReadonlySet<string>, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k) && typeof v === "string") out[k] = clamp(v, max);
  }
  return out;
}

/** Liest Angaben aus beliebigen Daten: unbekannte Schlüssel und Werte falschen Typs fallen weg, Texte werden gekürzt. */
export function parseFelder(raw: unknown): Felder {
  if (!isRecord(raw)) return EMPTY_FELDER;
  return {
    formel: isHookKey(raw.formel) ? raw.formel : EMPTY_FELDER.formel,
    aufbau: isStructureKey(raw.aufbau) ? raw.aufbau : EMPTY_FELDER.aufbau,
    ziel: isCtaKey(raw.ziel) ? raw.ziel : EMPTY_FELDER.ziel,
    anrede: isAnrede(raw.anrede) ? raw.anrede : "",
    hook: stringRecord(raw.hook, HOOK_NAMES, LIMITS.hook),
    teile: stringRecord(raw.teile, TEIL_KEYS, LIMITS.teil),
    cta: typeof raw.cta === "string" ? clamp(raw.cta, LIMITS.cta) : "",
    hashtags: typeof raw.hashtags === "string" ? clamp(raw.hashtags, LIMITS.hashtags) : "",
  };
}

function parseEntwurf(raw: unknown): Entwurf | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id === "" || raw.id.length > 60) return null;
  if (typeof raw.gespeichertAm !== "string" || Number.isNaN(Date.parse(raw.gespeichertAm))) return null;
  const felder = parseFelder(raw.felder);
  if (inputProblem(felder)) return null;
  const computed = captionTexts(felder);
  const stored = isRecord(raw.texte) ? raw.texte : {};
  const texte = Object.fromEntries(
    PLATFORM_KEYS.map((p) => {
      const text = stored[p];
      return [p, typeof text === "string" ? clamp(text, 6000) : computed[p]];
    }),
  ) as Texte;
  const titel = typeof raw.titel === "string" && raw.titel.trim() ? clamp(raw.titel, 80) : draftTitle(partsOf(felder).hook);
  return { id: raw.id, titel, gespeichertAm: raw.gespeichertAm, felder, texte };
}

/**
 * Liest den gespeicherten Stand; kaputte Daten ergeben den leeren Stand. «result» gilt nur, wenn die Angaben vollständig sind.
 * Höchstens zehn gültige Entwürfe bleiben, doppelte IDs fallen weg.
 */
export function parseState(raw: unknown): CaptionState {
  if (!isRecord(raw) || raw.v !== 1) return EMPTY_STATE;
  const felder = parseFelder(raw.felder);
  const seen = new Set<string>();
  const entwuerfe: Entwurf[] = [];
  for (const item of Array.isArray(raw.entwuerfe) ? raw.entwuerfe : []) {
    const e = parseEntwurf(item);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    entwuerfe.push(e);
    if (entwuerfe.length === MAX_ENTWUERFE) break;
  }
  const phase = raw.phase === "result" && inputProblem(felder) === null ? "result" : "edit";
  return { v: 1, phase, felder, entwuerfe };
}

// ---- CRM -------------------------------------------------------------------------------------------

const orNone = (s: string): string => oneLine(s) || "keine Angabe";

/** Die Angaben fürs CRM, eine je Zeile. */
export function eingabeText(f: Felder): string {
  const hook = HOOKS[f.formel];
  const aufbau = STRUCTURES[f.aufbau];
  return [
    `Hook-Formel: ${hook.label}`,
    `Anrede: ${anredeLabel(anredeOf(f))}`,
    ...hook.fields.map((x) => `${x.name}: ${orNone(f.hook[x.name] ?? "")}`),
    `Aufbau: ${aufbau.label}`,
    ...aufbau.fields.map((x) => `${x.label}: ${orNone(f.teile[x.key] ?? "")}`),
    `Ziel: ${CTAS[f.ziel].label}`,
    `Aufforderung: ${orNone(f.cta)}`,
    `Hashtags: ${cleanHashtags(f.hashtags) || "keine"}`,
  ].join("\n");
}

/** Das Ergebnis fürs CRM: die vier Texte, je mit Plattform und Zeichenzahl. */
export function ausgabeText(texte: Texte): string {
  return PLATFORM_KEYS.map((p) => `${PLATFORMS[p].label} (${numberCH(charCount(texte[p]), 0)} Zeichen)\n${texte[p]}`).join("\n\n");
}

// ---- Übergabe an den Textcheck ---------------------------------------------------------------------

export const TEXTCHECK_KEY = "mt:textcheck";
export const TEXTCHECK_PATH = "/tools/textcheck";

/** Stand des Textchecks mit unserem Text im Eingabefeld (so liest `parseTextcheckState` ihn). */
export const textcheckState = (text: string): TextcheckState => ({ v: 1, phase: "edit", text });
