import { brandHits } from "@/lib/brand-rules";
import { KANTONE } from "@/lib/ch";
import { flattenBlocks, safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { z } from "zod";
import {
  ANLASS_KEYS,
  ANLASS_LABELS,
  LAENGE_MAX_WORDS,
  LAENGE_MIN_WORDS,
  LEAD_MAX_WORDS,
  LIMITS,
  fremdeZahlen,
  gesamtWoerter,
  leadNenntBetrieb,
  leadNenntOrt,
  leadNenntWann,
  medienInput,
  medienOutput,
  wordCount,
  zitatStimmt,
  type AnlassKey,
  type MedienInput,
  type MedienOutput,
} from "./generator";

// Medienmitteilung: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts. Spec: specs/medienmitteilung.md

export const SLUG = "medienmitteilung";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";

/** Die Grenzen für Lead und Länge sind keine Statistik. */
export const RICHTWERT_HINWEIS = `Lead höchstens ${LEAD_MAX_WORDS} Wörter, Gesamtlänge ${LAENGE_MIN_WORDS} bis ${LAENGE_MAX_WORDS} Wörter: Richtwert von Alperna, keine Statistik.`;

export function anlassLabel(key: AnlassKey): string {
  return ANLASS_LABELS[key];
}

export function isAnlass(value: string): value is AnlassKey {
  return (ANLASS_KEYS as readonly string[]).includes(value);
}

/** Zeichen eines Textes, je Zeichen gezählt (nicht je Byte). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Eingabe -------------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "ort" | "kanton" | "website" | "positionierung">;

export type Kontakt = { name: string; telefon: string; email: string };
export const EMPTY_KONTAKT: Kontakt = { name: "", telefon: "", email: "" };

export type FormValues = {
  anlass: AnlassKey | "";
  was: string;
  wann: string;
  wo: string;
  wer: string;
  warum: string;
  zitat: string;
  zitatVon: string;
  bild: string;
  kontaktName: string;
  kontaktTelefon: string;
  kontaktEmail: string;
  /** Je Zeile ein Medium. */
  empfaenger: string;
};

export const EMPTY_FORM: FormValues = {
  anlass: "",
  was: "",
  wann: "",
  wo: "",
  wer: "",
  warum: "",
  zitat: "",
  zitatVon: "",
  bild: "",
  kontaktName: "",
  kontaktTelefon: "",
  kontaktEmail: "",
  empfaenger: "",
};

/** Leerraum bereinigen, Zeilenumbrüche bleiben. */
const clip = (s: string | undefined, max: number) => (s ?? "").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, max);
/** Einzeiliges Feld: auch Zeilenumbrüche werden zu Leerzeichen. */
const clipLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Der Kanton für die KI mit Namen («SG» → «St. Gallen»); unbekannte Werte bleiben, wie sie sind. */
export function kantonName(code: string | undefined): string {
  const c = (code ?? "").trim();
  const hit = KANTONE.find(([k]) => k === c.toUpperCase());
  return hit ? hit[1] : c;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Meldet, warum es nicht losgehen kann. null: in Ordnung. */
export function inputProblem(fields: Pick<ProfileFields, "firma" | "ort">, values: FormValues): string | null {
  if (!clipLine(fields.firma, LIMITS.betrieb)) return "Gib den Namen deines Betriebs an.";
  if (!isAnlass(values.anlass)) return "Wähle den Anlass.";
  if (clip(values.was, LIMITS.was).length < LIMITS.wasMin) return `Beschreib in mindestens ${LIMITS.wasMin} Zeichen, was passiert ist oder passiert.`;
  if (!clipLine(values.wann, LIMITS.wann)) return "Sag, wann es stattfindet oder stattgefunden hat.";
  if (!clipLine(values.wo, LIMITS.wo) && !clipLine(fields.ort, LIMITS.ort)) return "Sag, wo es stattfindet, oder trag deinen Ort ein.";
  if (clip(values.warum, LIMITS.warum).length < LIMITS.warumMin) return `Sag in mindestens ${LIMITS.warumMin} Zeichen, warum das für die Region von Bedeutung ist.`;
  if (clip(values.zitat, LIMITS.zitat + 1).length > LIMITS.zitat) return `Kürze das Zitat auf ${LIMITS.zitat} Zeichen.`;
  if (clip(values.zitat, LIMITS.zitat) && !clipLine(values.zitatVon, LIMITS.zitatVon)) return "Nenne Name und Funktion der Person, die du zitierst.";
  if (!clipLine(values.kontaktName, LIMITS.kontaktName)) return "Gib eine Kontaktperson für Rückfragen an.";
  const email = clipLine(values.kontaktEmail, LIMITS.kontaktEmail);
  if (email && !EMAIL_RE.test(email)) return "Prüfe die E-Mail-Adresse der Kontaktperson.";
  return null;
}

/** Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. Ohne Kontaktdaten. */
export function toInput(fields: ProfileFields, values: FormValues): MedienInput {
  const zitat = clip(values.zitat, LIMITS.zitat);
  return {
    betrieb: clipLine(fields.firma, LIMITS.betrieb),
    ort: clipLine(fields.ort, LIMITS.ort),
    kanton: clipLine(kantonName(fields.kanton), LIMITS.kanton),
    website: clipLine(fields.website, LIMITS.website),
    positionierung: clip(fields.positionierung, LIMITS.positionierung),
    anlass: isAnlass(values.anlass) ? values.anlass : "anderes",
    was: clip(values.was, LIMITS.was),
    wann: clipLine(values.wann, LIMITS.wann),
    wo: clipLine(values.wo, LIMITS.wo),
    wer: clip(values.wer, LIMITS.wer),
    warum: clip(values.warum, LIMITS.warum),
    zitat,
    zitatVon: zitat ? clipLine(values.zitatVon, LIMITS.zitatVon) : "",
    bild: clip(values.bild, LIMITS.bild),
  };
}

/** Kontaktperson aus dem Formular. Bleibt im Browser. */
export function toKontakt(values: FormValues): Kontakt {
  return {
    name: clipLine(values.kontaktName, LIMITS.kontaktName),
    telefon: clipLine(values.kontaktTelefon, LIMITS.kontaktTelefon),
    email: clipLine(values.kontaktEmail, LIMITS.kontaktEmail),
  };
}

/** Empfänger aus der Textarea: je Zeile ein Medium, ohne Leerzeilen und Doppelte, höchstens 20. */
export function parseEmpfaenger(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const medium = clipLine(line, LIMITS.empfaengerZeile);
    const key = medium.toLowerCase();
    if (!medium || seen.has(key)) continue;
    seen.add(key);
    out.push(medium);
    if (out.length >= LIMITS.empfaengerMax) break;
  }
  return out;
}

/** Das Formular aus einem gespeicherten Stand, für «Angaben ändern». */
export function toForm(input: MedienInput, kontakt: Kontakt, empfaenger: string[]): FormValues {
  return {
    anlass: input.anlass,
    was: input.was,
    wann: input.wann,
    wo: input.wo,
    wer: input.wer,
    warum: input.warum,
    zitat: input.zitat,
    zitatVon: input.zitatVon,
    bild: input.bild,
    kontaktName: kontakt.name,
    kontaktTelefon: kontakt.telefon,
    kontaktEmail: kontakt.email,
    empfaenger: empfaenger.join("\n"),
  };
}

/**
 * Die Angaben fürs CRM, eine je Zeile. Ohne Kontaktdaten und ohne Empfänger: Beides bleibt im Browser.
 * Der Server kürzt auf 1'900 Zeichen; das Wichtigste steht darum oben.
 */
export function eingabeText(input: MedienInput): string {
  const ortKanton = [input.ort, input.kanton].filter(Boolean).join(", ");
  return [
    `Betrieb: ${input.betrieb}`,
    ortKanton ? `Ort: ${ortKanton}` : "",
    `Anlass: ${anlassLabel(input.anlass)}`,
    `Was: ${input.was}`,
    `Wann: ${input.wann}`,
    input.wo ? `Wo: ${input.wo}` : "",
    input.wer ? `Wer: ${input.wer}` : "",
    `Warum für die Region: ${input.warum}`,
    input.zitat ? `Zitat: «${input.zitat}»${input.zitatVon ? ` (${input.zitatVon})` : ""}` : "",
    input.bild ? `Bildangebot: ${input.bild}` : "",
    input.website ? `Website: ${input.website}` : "",
    input.positionierung ? `Positionierung: ${input.positionierung}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ------------------------------------------------------------------------------------

/** Entfernt Anführungszeichen am Rand, damit das Dokument sie selbst setzt. */
function stripQuotes(text: string): string {
  return text.trim().replace(/^[«»"„“”'‹›\s]+/, "").replace(/[«»"„“”'‹›\s]+$/, "");
}

/** «Wir freuen uns», sagt Anna Keller, Inhaberin. Ohne Namen nur das Zitat in «». Leer, wenn es kein Zitat gibt. */
export function zitatSatz(zitat: string, von: string): string {
  const z = stripQuotes(zitat);
  if (!z) return "";
  const name = von.replace(/\s+/g, " ").trim();
  if (!name) return `«${z}»`;
  return `«${z.replace(/\.+$/, "")}», sagt ${name}.`;
}

/**
 * Das Zitat der Mitteilung: nur, wenn die Angaben eines haben. Lässt der Entwurf es weg, gilt der Wortlaut der Angabe.
 * Ein Zitat, das die Person nicht angegeben hat, erscheint nie.
 */
export function zitatFuer(output: MedienOutput, input: MedienInput): string {
  if (!input.zitat.trim()) return "";
  return zitatSatz(output.zitat.trim() || input.zitat, input.zitatVon);
}

/** Die Bildzeile: nur, wenn die Angaben ein Bildangebot haben. Fehlt sie im Entwurf, gilt die Angabe. */
export function bildzeileFuer(output: MedienOutput, input: MedienInput): string {
  if (!input.bild.trim()) return "";
  return output.bildzeile.trim() || input.bild.trim();
}

function kontaktBlocks(kontakt: Kontakt): DocBlock[] {
  const lines = [kontakt.name, kontakt.telefon ? `Telefon: ${kontakt.telefon}` : "", kontakt.email ? `E-Mail: ${kontakt.email}` : ""].filter(Boolean);
  if (lines.length === 0) return [];
  return [
    { type: "heading", level: 2, text: "Kontakt für Rückfragen" },
    { type: "paragraph", text: lines.join("\n") },
  ];
}

/**
 * DocumentModel für Anzeige, PDF, Word und Markdown-Copy: Kopf «Medienmitteilung» mit Ort und Datum, Titel, Lead (als
 * Überschrift der dritten Stufe, damit er in PDF und Word fett steht), Absätze mit dem Zitat nach dem ersten, Bildzeile,
 * Boilerplate unter «Über <Betrieb>» und der Kontakt. `datum` ist bereits formatiert (dateCH). Die Empfänger stehen nicht
 * im Dokument: Es geht so an die Redaktionen.
 */
export function toDocument(output: MedienOutput, input: MedienInput, kontakt: Kontakt, datum: string): DocumentModel {
  const betrieb = input.betrieb || "Dein Betrieb";
  const zitat = zitatFuer(output, input);
  const bild = bildzeileFuer(output, input);
  const blocks: DocBlock[] = [
    { type: "heading", level: 1, text: output.titel },
    { type: "heading", level: 3, text: output.lead },
  ];
  output.text.forEach((absatz, i) => {
    blocks.push({ type: "paragraph", text: absatz });
    if (i === 0 && zitat) blocks.push({ type: "paragraph", text: zitat });
  });
  if (bild) blocks.push({ type: "paragraph", text: `Bildmaterial: ${bild}` });
  blocks.push({ type: "heading", level: 2, text: `Über ${betrieb}` }, { type: "paragraph", text: output.boilerplate });
  blocks.push(...kontaktBlocks(kontakt));
  return {
    title: "Medienmitteilung",
    subtitle: input.ort ? `${input.ort}, ${datum}` : datum,
    firma: betrieb,
    datum,
    filename: `medienmitteilung-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Blöcke für den Bildschirm: der Kopf «Medienmitteilung, Ort, Datum» steht dort als erste Zeile. */
export function viewBlocks(doc: DocumentModel): DocBlock[] {
  return [{ type: "paragraph", text: [doc.title, doc.subtitle].filter(Boolean).join(", ") }, ...doc.blocks];
}

/** Reiner Text für den Mailtext: Kopfzeile mit Ort und Datum, dann die Blöcke mit Leerzeile dazwischen, ohne Markdown. */
export function toPlainText(doc: DocumentModel): string {
  const parts: string[] = [];
  if (doc.subtitle) parts.push(doc.subtitle);
  for (const b of flattenBlocks(doc.blocks)) {
    switch (b.type) {
      case "heading":
      case "paragraph":
        parts.push(b.text);
        break;
      case "list":
        parts.push(b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : "-"} ${it}`).join("\n"));
        break;
      case "facts":
        parts.push(b.items.map((f) => `${f.label}: ${f.value}`).join("\n"));
        break;
      case "table":
        parts.push([b.header.join(" | "), ...b.rows.map((r) => r.join(" | "))].join("\n"));
        break;
    }
  }
  return parts.join("\n\n") + "\n";
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. Ohne Kontaktdaten: Sie gehen nicht an Alperna. */
export function reportMarkdown(output: MedienOutput, input: MedienInput, datum: string): string {
  return toMarkdown(toDocument(output, input, EMPTY_KONTAKT, datum));
}

// ---- Prüfung des Entwurfs --------------------------------------------------------------------------

export type PruefId = "lead" | "w-fragen" | "wann" | "zahl" | "laenge" | "zitat" | "superlativ";

/** Eine Regel, ihr Stand und ein Satz dazu. `ok: false` ist ein Hinweis an die Person, kein Fehler. */
export type Pruefpunkt = { id: PruefId; ok: boolean; label: string; hinweis: string };

/** Steigerungsformen und Wertungen, die nach Werbung klingen. Ergänzt die Sperrliste aus lib/brand-rules.ts. */
const SUPERLATIV_RE =
  /\b(?:beste[nrms]?|grösste[nrms]?|schönste[nrms]?|günstigste[nrms]?|modernste[nrms]?|erfolgreichste[nrms]?|einzigartig\w*|einmalig\w*|sensationell\w*|revolutionär\w*|unschlagbar\w*|beispiellos\w*|spektakulär\w*|erstklassig\w*|weltklasse|spitzenklasse|nummer eins)\b/giu;

/** Texte der Mitteilung ohne das Zitat: Dort spricht die Person, nicht die Redaktion. */
function sachtext(output: MedienOutput): string {
  return [output.titel, output.lead, ...output.text, output.boilerplate].join("\n");
}

/** Superlative und Werbesprache im Text, klein geschrieben und ohne Doppelte (eigene Liste und Sperrliste der Marke). */
export function superlativeIn(output: MedienOutput): string[] {
  const text = sachtext(output);
  const own = (text.match(SUPERLATIV_RE) ?? []).map((w) => w.toLowerCase());
  const brand = brandHits(text)
    .filter((h) => !/^Leerzeichen vor Satzzeichen/.test(h.what))
    .map((h) => h.text.toLowerCase());
  return [...new Set([...own, ...brand].filter(Boolean))];
}

const joinQuoted = (items: string[]) => items.map((i) => `«${i}»`).join(", ");

/**
 * Prüft den Entwurf mit denselben Regeln wie der Generator (Lead, Wer und Wo, Zahlen, Länge, Zitat) und fügt Wann
 * und Superlative hinzu. Gibt jede Regel zurück, mit `ok` und einem Satz für die Anzeige.
 */
export function checkDraft(output: MedienOutput, input: MedienInput): Pruefpunkt[] {
  const leadWoerter = wordCount(output.lead);
  const betriebOk = leadNenntBetrieb(output.lead, input);
  const ortOk = leadNenntOrt(output.lead, input);
  const wannOk = leadNenntWann(output.lead, input);
  const fremd = fremdeZahlen(output, input);
  const laenge = gesamtWoerter(output);
  const laengeOk = laenge >= LAENGE_MIN_WORDS && laenge <= LAENGE_MAX_WORDS;
  const zitatOk = zitatStimmt(output, input);
  const superlative = superlativeIn(output);

  const wFragenFehlt = [!betriebOk ? `der Betrieb «${input.betrieb}»` : "", !ortOk ? `der Ort «${input.ort || input.wo}»` : ""].filter(Boolean).join(" und ");

  return [
    {
      id: "lead",
      ok: leadWoerter <= LEAD_MAX_WORDS,
      label: `Lead mit höchstens ${LEAD_MAX_WORDS} Wörtern`,
      hinweis: leadWoerter <= LEAD_MAX_WORDS ? `Der Lead hat ${leadWoerter} Wörter.` : `Der Lead hat ${leadWoerter} Wörter. Kürze ihn auf höchstens ${LEAD_MAX_WORDS}.`,
    },
    {
      id: "w-fragen",
      ok: betriebOk && ortOk,
      label: "Lead nennt wer und wo",
      hinweis: betriebOk && ortOk ? "Betrieb und Ort stehen im Lead." : `Im Lead fehlt ${wFragenFehlt}.`,
    },
    {
      id: "wann",
      ok: wannOk,
      label: "Lead nennt wann",
      hinweis: wannOk ? "Die Zeitangabe steht im Lead." : `Im Lead fehlt die Zeitangabe «${input.wann}».`,
    },
    {
      id: "zahl",
      ok: fremd.length === 0,
      label: "Zahlen stammen aus deinen Angaben",
      hinweis: fremd.length === 0 ? "Jede Zahl im Text steht in deinen Angaben." : `Diese Zahlen stehen nicht in deinen Angaben: ${fremd.join(", ")}. Prüfe sie oder streich sie.`,
    },
    {
      id: "laenge",
      ok: laengeOk,
      label: `Länge von ${LAENGE_MIN_WORDS} bis ${LAENGE_MAX_WORDS} Wörtern`,
      hinweis: laengeOk ? `Die Mitteilung hat ${laenge} Wörter.` : `Die Mitteilung hat ${laenge} Wörter. ${laenge < LAENGE_MIN_WORDS ? "Ergänze Einzelheiten." : "Kürze sie."}`,
    },
    {
      id: "zitat",
      ok: zitatOk,
      label: "Zitat stammt von dir",
      hinweis: !input.zitat.trim()
        ? zitatOk
          ? "Du hast kein Zitat angegeben, die Mitteilung hat keins."
          : "Der Entwurf enthält ein Zitat, das du nicht angegeben hast. Es steht nicht in der Mitteilung."
        : zitatOk
          ? "Das Zitat steht so in deinen Angaben."
          : "Das Zitat weicht von deinen Angaben ab. Prüfe den Wortlaut.",
    },
    {
      id: "superlativ",
      ok: superlative.length === 0,
      label: "Keine Superlative und keine Werbesprache",
      hinweis: superlative.length === 0 ? "Im Text steht nichts davon." : `Prüfe ${joinQuoted(superlative)}. Streich die Wertung oder belege sie.`,
    },
  ];
}

/** Nur die Regeln, die nicht erfüllt sind. */
export function draftFunde(output: MedienOutput, input: MedienInput): Pruefpunkt[] {
  return checkDraft(output, input).filter((p) => !p.ok);
}

// ---- Versand ---------------------------------------------------------------------------------------

export type ChecklistOptions = { titel?: string; bild?: boolean };

/** Betreffzeile für die E-Mail an die Redaktion. */
export function betreffzeile(titel: string | undefined): string {
  const t = (titel ?? "").replace(/\s+/g, " ").trim();
  return t ? `Medienmitteilung: ${t}` : "Medienmitteilung:";
}

/**
 * Checkliste für den Versand. Steht ein Medium in `empfaenger`, bekommt es eine eigene Zeile; sonst steht dort die Aufgabe,
 * Empfänger festzulegen. Zeitpunkt und Nachfassen sind Richtwerte von Alperna, keine Statistik.
 */
export function versandCheckliste(empfaenger: string[], opts: ChecklistOptions = {}): string[] {
  const items: string[] = ["Namen, Daten, Zahlen und Platzhalter in eckigen Klammern prüfen; die zitierte Person liest das Zitat vor dem Versand."];
  if (empfaenger.length === 0) {
    items.push("Empfänger festlegen: Lokalzeitung oder Anzeiger, Gemeindeblatt, Regionalradio und Online-Portal deines Kantons (siehe «Empfänger finden»).");
  } else {
    for (const medium of empfaenger) items.push(`Senden an: ${medium}`);
  }
  items.push(
    `Betreffzeile: «${betreffzeile(opts.titel)}»`,
    "Die Mitteilung als Text in die E-Mail einfügen und das Word-Dokument zusätzlich anhängen.",
    opts.bild
      ? "Das Bild als Anhang in Druckauflösung beilegen und nennen, wer fotografiert hat."
      : "Falls du ein Bild hast: in Druckauflösung als Anhang beilegen und nennen, wer fotografiert hat.",
    "Am Vormittag unter der Woche versenden (Richtwert von Alperna, keine Statistik).",
    "Am Versandtag unter der angegebenen Nummer erreichbar sein.",
    "Nach einigen Tagen kurz nachfassen, ob die Mitteilung angekommen ist (Richtwert von Alperna, keine Statistik).",
    "Die Mitteilung auch auf die eigene Website stellen und im Google-Unternehmensprofil als Beitrag veröffentlichen.",
  );
  return items;
}

export type EmpfaengerHinweis = { titel: string; text: string };

/** Anleitung «Empfänger finden»: Suchbegriffe mit Gemeinde und Kanton. Keine Adressen: Sie lassen sich hier nicht belegen. */
export function empfaengerHinweise(ort: string | undefined, kanton: string | undefined): EmpfaengerHinweis[] {
  const gemeinde = (ort ?? "").replace(/\s+/g, " ").trim() || "Deine Gemeinde";
  const region = kantonName(kanton) || "Deine Region";
  return [
    {
      titel: "Lokalzeitung und Anzeiger",
      text: `Such nach «${gemeinde} Anzeiger Redaktion» und «${gemeinde} Zeitung Redaktion». Die Adresse der Redaktion findest du im Impressum der Website.`,
    },
    {
      titel: "Gemeindeblatt",
      text: "Frag bei der Gemeindeverwaltung, wer das Gemeindeblatt betreut und bis wann Beiträge eingehen.",
    },
    {
      titel: "Regionalradio und Regionalfernsehen",
      text: `Such nach «${region} Regionalradio Redaktion» und «${region} Regionalfernsehen Redaktion».`,
    },
    {
      titel: "Online-Portale",
      text: `Such nach «${region} Lokalnachrichten online» und lies im Impressum, ob das Portal Mitteilungen von Betrieben annimmt.`,
    },
    {
      titel: "Branche und Verband",
      text: "Betrifft die Meldung auch deine Branche, schick sie an die Zeitschrift oder den Newsletter deines Branchenverbands.",
    },
    {
      titel: "Persönlich anschreiben",
      text: "Such im Impressum die Person für Lokales oder Region und schreib sie mit Namen an. Im Zweifel ruf kurz an und frag, wohin Mitteilungen gehören.",
    },
  ];
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type MedienState = { v: 1; input: MedienInput | null; output: MedienOutput | null; kontakt: Kontakt; empfaenger: string[] };

export const EMPTY_STATE: MedienState = { v: 1, input: null, output: null, kontakt: EMPTY_KONTAKT, empfaenger: [] };

const kontaktSchema = z.object({
  name: z.string().max(LIMITS.kontaktName),
  telefon: z.string().max(LIMITS.kontaktTelefon),
  email: z.string().max(LIMITS.kontaktEmail),
});

/**
 * Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Entwurf ohne gültige Eingabe fällt weg,
 * ein kaputter Entwurf allein auch (die Eingabe bleibt für «Angaben ändern»). Kaputte Kontaktdaten oder Empfänger
 * fallen einzeln weg.
 */
export function parseState(raw: unknown): MedienState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<Record<keyof MedienState, unknown>>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = medienInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = medienOutput.safeParse(r.output);
  const kontakt = kontaktSchema.safeParse(r.kontakt);
  const empfaenger = Array.isArray(r.empfaenger) ? parseEmpfaenger(r.empfaenger.filter((e): e is string => typeof e === "string").join("\n")) : [];
  return { v: 1, input: input.data, output: output.success ? output.data : null, kontakt: kontakt.success ? kontakt.data : EMPTY_KONTAKT, empfaenger };
}
