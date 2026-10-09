import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import {
  BEITRAEGE,
  KANAELE,
  KI_HINWEIS,
  beitraegeLabel,
  isBeitraegeKey,
  isKanalKey,
  kanaeleAusProfil,
  kanaeleVorschlag,
  kanalLabel,
  normalizeKanaele,
} from "@/tools/inhalte-saeulen/logic";
import {
  KANAL_KEYS,
  LIMITS,
  MAX_SAEULEN,
  MIN_SAEULEN_ANGABE,
  ORGANISATIONSTYPEN,
  ZIEL_KEYS,
  ZIEL_LABELS,
  normName,
  strategieInput,
  strategieOutput,
  type BeitraegeKey,
  type KanalKey,
  type Organisationstyp,
  type StrategieInput,
  type StrategieOutput,
  type ZielKey,
} from "./generator";

// Inhaltsstrategie: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Entwurf macht /api/generate über generator.ts; hier stehen Labels, Vorbelegung aus dem Profil, Eingabeprüfung,
// Dokument, CRM-Texte, Profil-Ergänzung und der gespeicherte Stand. Spec: specs/inhalte-strategie.md

export const SLUG = "inhalte-strategie";

export { BEITRAEGE, KANAELE, KI_HINWEIS, beitraegeLabel, isBeitraegeKey, isKanalKey, kanaeleAusProfil, kanalLabel, normalizeKanaele };

// ---- Listen und Labels -------------------------------------------------------------------------

export const isZielKey = (v: unknown): v is ZielKey => typeof v === "string" && (ZIEL_KEYS as readonly string[]).includes(v);

/** Das Ziel in den Wörtern des Typs: «Anfragen und Aufträge» beim Betrieb, «Mitglieder gewinnen» beim Verein. */
export const zielLabel = (typ: Organisationstyp, key: ZielKey): string => ZIEL_LABELS[typ][key];

/** Die vier Ziele für die Auswahl, in fester Reihenfolge, mit den Wörtern des Typs. */
export function zielListe(typ: Organisationstyp): { key: ZielKey; label: string }[] {
  return ZIEL_KEYS.map((key) => ({ key, label: ZIEL_LABELS[typ][key] }));
}

export const typLabel = (typ: Organisationstyp): string => (typ === "verein" ? "Verein" : "KMU");

/** Der Typ aus dem Profil; ohne Angabe gilt «kmu» (wie in ProfileFieldsForm). */
export function organisationstypVon(profile: Pick<Profile, "organisationstyp">): Organisationstyp {
  return profile.organisationstyp === "verein" ? ORGANISATIONSTYPEN[1] : ORGANISATIONSTYPEN[0];
}

const oneLine = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
const multiLine = (s: string | undefined, max: number) =>
  (s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Zeichen je Schriftzeichen (nicht je Code-Einheit), für die Anzeige «n von 800 Zeichen». */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// ---- Profil lesen ------------------------------------------------------------------------------

export type ProfileFields = Pick<
  Profile,
  "organisationstyp" | "firma" | "branche" | "ort" | "positionierung" | "primaersegment" | "marke" | "kanaele" | "contentSaeulen"
>;

/** Tonalität aus der Marke: der Satz «so» (Markenplattform), sonst alle Texte ausser der Anrede; auf die Grenze gekürzt. */
export function tonalitaetText(marke: Profile["marke"]): string {
  const ton = marke?.tonalitaet;
  if (!isRecord(ton)) return "";
  const so = typeof ton.so === "string" ? oneLine(ton.so, LIMITS.tonalitaet) : "";
  if (so) return so;
  return Object.entries(ton)
    .filter(([key, value]) => key !== "anrede" && typeof value === "string")
    .map(([, value]) => oneLine(value as string, LIMITS.tonalitaet))
    .filter(Boolean)
    .join(" ")
    .slice(0, LIMITS.tonalitaet)
    .trim();
}

/** Die Positionierung, wie sie mitgeht: Leerraum bereinigt, auf die Grenze gekürzt. */
export function positionierungText(profile: Pick<Profile, "positionierung">): string {
  return multiLine(profile.positionierung, LIMITS.positionierung);
}

/** Namen der Profil-Teile, die als Hintergrund mitgehen, für den Hinweis im Formular und den Satz vor dem Knopf. */
export function hinweisNamen(profile: Pick<Profile, "positionierung" | "marke">): string[] {
  const out: string[] = [];
  if (positionierungText(profile)) out.push("Positionierung");
  if (tonalitaetText(profile.marke)) out.push("Tonalität");
  return out;
}

/**
 * Namen der Themensäulen aus dem Profil (Einträge mit «name»), auf 3 bis 40 Zeichen, ohne Doppel (klein), höchstens fünf.
 * Einträge ohne brauchbaren Namen fallen weg. Kaputte Daten ergeben keine Säulen.
 */
export function saeulenAusProfil(profile: Pick<Profile, "contentSaeulen">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(profile.contentSaeulen) ? profile.contentSaeulen : []) {
    const name = oneLine(isRecord(e) && typeof e.name === "string" ? e.name : "", LIMITS.saeule);
    if (name.length < LIMITS.saeuleMin || seen.has(normName(name))) continue;
    seen.add(normName(name));
    out.push(name);
    if (out.length === MAX_SAEULEN) break;
  }
  return out;
}

// ---- Formular ----------------------------------------------------------------------------------

/**
 * Was die Person im Formular angibt. `zielgruppe`, `saeulen` und `kanaele` null: noch nicht angefasst, dann gilt der
 * Vorschlag aus dem Profil (Harte Regel 10). `saeulen` hat sonst immer fünf Einträge (leer erlaubt).
 */
export type StrategieForm = {
  ziel: ZielKey | "";
  angebot: string;
  besonders: string;
  zielgruppe: string | null;
  saeulen: string[] | null;
  kanaele: KanalKey[] | null;
  beitraegeProWoche: BeitraegeKey | "";
};

export const EMPTY_FORM: StrategieForm = { ziel: "", angebot: "", besonders: "", zielgruppe: null, saeulen: null, kanaele: null, beitraegeProWoche: "" };

/** Fünf Felder: die Namen, dann leere Zeichenketten. */
export function padSaeulen(namen: readonly string[]): string[] {
  return Array.from({ length: MAX_SAEULEN }, (_, i) => namen[i] ?? "");
}

/** Die Hauptzielgruppe, die im Formular gilt: die getippte, sonst das Primärsegment aus dem Profil. */
export function effectiveZielgruppe(form: Pick<StrategieForm, "zielgruppe">, profile: Pick<Profile, "primaersegment">): string {
  return form.zielgruppe ?? oneLine(profile.primaersegment, LIMITS.zielgruppe);
}

/** Die fünf Säulenfelder, die im Formular gelten: die getippten, sonst die Namen aus dem Profil. */
export function effectiveSaeulen(form: Pick<StrategieForm, "saeulen">, profile: Pick<Profile, "contentSaeulen">): string[] {
  return form.saeulen ? padSaeulen(form.saeulen) : padSaeulen(saeulenAusProfil(profile));
}

/** Die Kanäle, die im Formular gelten: die gewählten, sonst die aus dem Profil, sonst Instagram und Google-Beitrag. */
export function effectiveKanaele(form: Pick<StrategieForm, "kanaele">, profile: Pick<Profile, "kanaele">): KanalKey[] {
  return form.kanaele ?? kanaeleVorschlag(profile);
}

/** Ändert das Feld mit der Nummer `index` (0 bis 4); der Rest bleibt. */
export function setSaeule(saeulen: readonly string[], index: number, value: string): string[] {
  return padSaeulen(saeulen).map((s, i) => (i === index ? value : s));
}

// ---- Eingabe prüfen ----------------------------------------------------------------------------

export type Problem = { message: string; fieldId: string };

export const FIELD_IDS = {
  firma: "cs-firma",
  angebot: "cs-angebot",
  besonders: "cs-besonders",
  zielgruppe: "cs-zielgruppe",
  beitraege: "cs-beitraege",
} as const;
export const zielFieldId = (key: ZielKey): string => `cs-ziel-${key}`;
/** Nummer 1 bis 5, wie im Label «Säule 1». */
export const saeuleFieldId = (nummer: number): string => `cs-saeule-${nummer}`;
export const kanalFieldId = (key: KanalKey): string => `cs-kanal-${key}`;

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars. null: in Ordnung. Der Server prüft mit denselben Schemas noch einmal. */
export function inputProblem(profile: ProfileFields, form: StrategieForm): Problem | null {
  const verein = organisationstypVon(profile) === "verein";
  if (!oneLine(profile.firma, LIMITS.betrieb)) {
    return { message: verein ? "Gib den Namen deines Vereins an." : "Gib den Namen deines Betriebs an.", fieldId: FIELD_IDS.firma };
  }
  if (!isZielKey(form.ziel)) return { message: "Wähle, wofür dein Inhalt da sein soll.", fieldId: zielFieldId(ZIEL_KEYS[0]) };

  const angebot = multiLine(form.angebot, LIMITS.angebot + 1);
  if (angebot.length < LIMITS.angebotMin) {
    return {
      message: verein
        ? `Beschreib, was dein Verein anbietet und was Mitglieder und Interessierte am häufigsten fragen, in mindestens ${LIMITS.angebotMin} Zeichen.`
        : `Beschreib dein Angebot und die häufigsten Fragen deiner Kundschaft in mindestens ${LIMITS.angebotMin} Zeichen.`,
      fieldId: FIELD_IDS.angebot,
    };
  }
  if (angebot.length > LIMITS.angebot) return { message: `Das Angebot ist zu lang. Es sind höchstens ${LIMITS.angebot} Zeichen möglich.`, fieldId: FIELD_IDS.angebot };
  if (multiLine(form.besonders, LIMITS.besonders + 1).length > LIMITS.besonders) {
    return { message: `Das Besondere ist zu lang. Es sind höchstens ${LIMITS.besonders} Zeichen möglich.`, fieldId: FIELD_IDS.besonders };
  }
  if (oneLine(effectiveZielgruppe(form, profile), LIMITS.zielgruppe + 1).length > LIMITS.zielgruppe) {
    return { message: `Die Hauptzielgruppe ist zu lang. Es sind höchstens ${LIMITS.zielgruppe} Zeichen möglich.`, fieldId: FIELD_IDS.zielgruppe };
  }

  const saeulen = effectiveSaeulen(form, profile).map((s) => oneLine(s, LIMITS.saeule + 1));
  const gesehen = new Set<string>();
  let gefuellt = 0;
  for (const [i, name] of saeulen.entries()) {
    if (!name) continue;
    gefuellt += 1;
    const fieldId = saeuleFieldId(i + 1);
    if (name.length < LIMITS.saeuleMin) return { message: `Die Säule «${name}» ist zu kurz. Schreib mindestens ${LIMITS.saeuleMin} Zeichen.`, fieldId };
    if (name.length > LIMITS.saeule) return { message: `Die Säule «${name.slice(0, 20)} …» ist zu lang. Es sind höchstens ${LIMITS.saeule} Zeichen möglich.`, fieldId };
    if (gesehen.has(normName(name))) return { message: `Zwei Säulen heissen «${name}». Gib jeder Säule einen eigenen Namen.`, fieldId };
    gesehen.add(normName(name));
  }
  if (gefuellt > 0 && gefuellt < MIN_SAEULEN_ANGABE) {
    const leer = saeulen.findIndex((s) => !s);
    return { message: "Gib drei bis fünf Säulen an oder lass alle Felder leer, dann schlägt die KI Säulen vor.", fieldId: saeuleFieldId(leer + 1) };
  }

  if (normalizeKanaele(effectiveKanaele(form, profile)).length === 0) return { message: "Wähle mindestens einen Kanal.", fieldId: kanalFieldId(KANAL_KEYS[0]) };
  if (!isBeitraegeKey(form.beitraegeProWoche)) return { message: "Wähle, wie viele Beiträge pro Woche realistisch sind.", fieldId: FIELD_IDS.beitraege };
  return null;
}

/**
 * Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. null, wenn etwas fehlt oder ausserhalb der
 * Grenzen liegt (vorher `inputProblem`). Leere Säulenfelder fallen weg.
 */
export function toInput(profile: ProfileFields, form: StrategieForm): StrategieInput | null {
  if (!isZielKey(form.ziel) || !isBeitraegeKey(form.beitraegeProWoche)) return null;
  const candidate = {
    betrieb: oneLine(profile.firma, LIMITS.betrieb),
    organisationstyp: organisationstypVon(profile),
    branche: oneLine(profile.branche, LIMITS.branche),
    ort: oneLine(profile.ort, LIMITS.ort),
    ziel: form.ziel,
    angebot: multiLine(form.angebot, LIMITS.angebot),
    besonders: multiLine(form.besonders, LIMITS.besonders),
    zielgruppe: oneLine(effectiveZielgruppe(form, profile), LIMITS.zielgruppe),
    saeulen: effectiveSaeulen(form, profile)
      .map((s) => oneLine(s, LIMITS.saeule))
      .filter(Boolean),
    kanaele: normalizeKanaele(effectiveKanaele(form, profile)),
    beitraegeProWoche: form.beitraegeProWoche,
    positionierung: positionierungText(profile),
    tonalitaet: tonalitaetText(profile.marke),
  };
  const parsed = strategieInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». Alle Felder gelten dann als angefasst. */
export function formFromInput(input: StrategieInput): StrategieForm {
  return {
    ziel: input.ziel,
    angebot: input.angebot,
    besonders: input.besonders,
    zielgruppe: input.zielgruppe,
    saeulen: padSaeulen(input.saeulen),
    kanaele: [...input.kanaele],
    beitraegeProWoche: input.beitraegeProWoche,
  };
}

// ---- Texte fürs CRM ----------------------------------------------------------------------------

/** Freitext mit Absätzen auf eine Zeile: Zeilenumbrüche werden zu « / ». */
const flat = (s: string) => s.replace(/\s*\n+\s*/g, " / ");

/** «Malerei Keller, Gossau» */
export function betriebZeile(input: Pick<StrategieInput, "betrieb" | "ort">): string {
  return input.ort ? `${input.betrieb}, ${input.ort}` : input.betrieb;
}

/** Die Angaben fürs CRM, eine je Zeile; das Wichtigste zuerst, der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: StrategieInput): string {
  const verein = input.organisationstyp === "verein";
  return [
    `${verein ? "Verein" : "Betrieb"}: ${input.betrieb}`,
    `Art: ${typLabel(input.organisationstyp)}`,
    input.ort ? `Ort: ${input.ort}` : "",
    input.branche ? `${verein ? "Tätigkeit" : "Branche"}: ${input.branche}` : "",
    `Ziel: ${zielLabel(input.organisationstyp, input.ziel)}`,
    `Kanäle: ${input.kanaele.map(kanalLabel).join(", ")}`,
    `Beiträge pro Woche: ${input.beitraegeProWoche}`,
    `Angebot und Fragen: ${flat(input.angebot)}`,
    input.besonders ? `Besonderes: ${flat(input.besonders)}` : "",
    input.zielgruppe ? `Hauptzielgruppe: ${input.zielgruppe}` : "",
    `Säulen: ${input.saeulen.length > 0 ? input.saeulen.join(", ") : "keine angegeben, die KI schlägt vor"}`,
    input.positionierung ? `Positionierung: ${flat(input.positionierung)}` : "",
    input.tonalitaet ? `Tonalität: ${flat(input.tonalitaet)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Dokument ----------------------------------------------------------------------------------

export const KAPITEL = {
  kernbotschaft: "Kernbotschaft",
  ziele: "Ziele und Messgrössen",
  zielgruppen: "Zielgruppen",
  themen: "Themen",
  kanaele: "Rollen der Kanäle",
  rhythmus: "Rhythmus",
  plan: "Die ersten 90 Tage",
  messung: "Woran ihr merkt, ob es wirkt",
  niemals: "Das lassen wir weg",
} as const;

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(output: StrategieOutput, input: StrategieInput): DocumentModel {
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: input.organisationstyp === "verein" ? "Verein" : "Betrieb", value: betriebZeile(input) },
        { label: "Ziel", value: zielLabel(input.organisationstyp, input.ziel) },
        { label: "Kanäle", value: input.kanaele.map(kanalLabel).join(", ") },
        { label: "Beiträge pro Woche", value: input.beitraegeProWoche },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: KAPITEL.kernbotschaft },
    { type: "paragraph", text: output.kernbotschaft },
    { type: "heading", level: 1, text: KAPITEL.ziele },
    { type: "table", header: ["Ziel", "Messgrösse"], widths: [3, 2], rows: output.ziele.map((z) => [z.ziel, z.messgroesse]) },
    { type: "heading", level: 1, text: KAPITEL.zielgruppen },
    // Bildschirm: Karten. In PDF, Word und Markdown werden sie zu einer Liste «Name (Marke): Text».
    { type: "cards", items: output.zielgruppen.map((z) => ({ title: z.name, text: z.bedarf })) },
    { type: "heading", level: 1, text: KAPITEL.themen },
    { type: "cards", items: output.saeulen.map((s) => ({ title: s.name, text: s.rolle })) },
    { type: "heading", level: 1, text: KAPITEL.kanaele },
    {
      type: "table",
      header: ["Kanal", "Rolle", "Formate"],
      widths: [1.4, 3.4, 1.6],
      rows: output.kanalrollen.map((k) => [k.kanal, k.rolle, k.formate.join(", ")]),
    },
    { type: "heading", level: 1, text: KAPITEL.rhythmus },
    { type: "paragraph", text: output.rhythmus.satz },
    { type: "heading", level: 1, text: KAPITEL.plan },
  ];
  // Ein Schritt je Monat; die Aufgaben stehen untereinander (in der Datei durch Semikolon getrennt).
  blocks.push({ type: "steps", items: output.plan90.map((p) => ({ title: `${p.monat}: ${p.schwerpunkt}`, text: p.aufgaben.join("\n") })) });
  blocks.push(
    { type: "heading", level: 1, text: KAPITEL.messung },
    { type: "paragraph", text: "Gemessen wird nur, was ihr selbst zählt. Legt die Richtwerte selbst fest; Vergleichswerte von aussen stehen hier nicht." },
    { type: "list", items: output.messung },
    { type: "heading", level: 1, text: KAPITEL.niemals },
    { type: "list", items: output.niemals },
  );
  return {
    title: "Inhaltsstrategie",
    subtitle: `Für ${input.betrieb}`,
    firma: input.betrieb,
    filename: `inhalte-strategie-${safeFilename(input.betrieb, "betrieb")}`,
    blocks,
  };
}

/** Die Blöcke für den Bildschirm: ohne den KI-Hinweis, den die Karte selbst zeigt. PDF, Word und Copy behalten ihn. */
export function screenBlocks(doc: DocumentModel): DocBlock[] {
  return doc.blocks.filter((b) => !(b.type === "paragraph" && b.text === KI_HINWEIS));
}

/** Der Entwurf als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(output: StrategieOutput, input: StrategieInput): string {
  return toMarkdown(toDocument(output, input));
}

// ---- Profil schreiben --------------------------------------------------------------------------

export type SaeuleEintrag = { name: string; beschreibung: string };
export type ProfilePatch = { contentSaeulen?: SaeuleEintrag[] };

/**
 * Was das Werkzeug ins Firmenprofil schreibt (writesProfile: contentSaeulen), nur nach einem frisch erzeugten Entwurf und
 * nur, wenn dort noch nichts steht (TOOL-BAUEN.md, Abschnitt 2). Die Rolle der Säule wird zur Beschreibung.
 */
export function profilePatch(profile: Pick<Profile, "contentSaeulen">, output: StrategieOutput): ProfilePatch {
  if (profile.contentSaeulen?.length) return {};
  return { contentSaeulen: output.saeulen.map((s) => ({ name: s.name, beschreibung: s.rolle })) };
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type StrategiePhase = "form" | "result";
export type StrategieState = { v: 1; phase: StrategiePhase; input: StrategieInput | null; output: StrategieOutput | null };

export const EMPTY_STATE: StrategieState = { v: 1, phase: "form", input: null, output: null };

/** Der Stand mit Ergebnis. `phase: "result"` lässt den Pfad-Fortschritt (lib/progress.ts) das Werkzeug als erledigt zählen. */
export function resultState(input: StrategieInput, output: StrategieOutput): StrategieState {
  return { v: 1, phase: "result", input, output };
}

/**
 * Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ein Ergebnis ohne gültige Eingabe fällt weg;
 * eine gültige Eingabe mit kaputtem Ergebnis bleibt als Formular («form») erhalten. Die Phase folgt dem Ergebnis, nicht der Datei.
 */
export function parseState(raw: unknown): StrategieState {
  if (typeof raw !== "object" || raw === null) return EMPTY_STATE;
  const r = raw as Partial<StrategieState>;
  if (r.v !== 1) return EMPTY_STATE;
  const input = strategieInput.safeParse(r.input);
  if (!input.success) return EMPTY_STATE;
  const output = strategieOutput.safeParse(r.output);
  return output.success ? resultState(input.data, output.data) : { v: 1, phase: "form", input: input.data, output: null };
}
