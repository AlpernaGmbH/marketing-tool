import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import {
  FOLD_NOTE,
  PLATFORMS,
  TEXTCHECK_KEY,
  TEXTCHECK_PATH,
  anredeFromProfile,
  charCount,
  cleanHashtags,
  counterLabel,
  foldHint,
  foldInfo,
  splitAtFold,
  textcheckState,
  tidy,
  type Platform,
} from "@/tools/caption-baukasten/logic";
import {
  ANREDE_KEYS,
  FORMAT_KEYS,
  LIMITS,
  PLATTFORM_KEYS,
  ZIEL_KEYS,
  postInput,
  postOutput,
  type AnredeKey,
  type FormatKey,
  type PlattformKey,
  type PostInput,
  type PostOutput,
  type ZielKey,
} from "./generator";

// Post-Generator: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Den Beitrag schreibt /api/generate über generator.ts; hier stehen Labels, Auswahl aus dem Profil, Eingabeprüfung,
// der fertige Text je Plattform, Dokument, CRM-Texte, Entwürfe und der gespeicherte Stand. Spec: specs/post-generator.md
//
// Die Faltkante und der Zeichenzähler kommen vom Caption-Baukasten (foldInfo, splitAtFold, counterLabel, foldHint).
// Die Werte sind Richtwerte von Alperna, keine Statistik; die Plattformen ändern das (FOLD_NOTE).

export const SLUG = "post-generator";
export const STORAGE_KEY = `mt:${SLUG}`;
/** Merkliste des Werkzeugs «Beitragsideen» (CLAUDE.md, Firmenprofil): Der Post-Generator liest sie, schreibt aber nicht hinein. */
export const MERKLISTE_KEY = "mt:merkliste";

export const KI_HINWEIS = "Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.";
export const MAX_ENTWUERFE = 10;
/** Hashtags, die die Person selbst schreibt (gleiche Grenze wie im Caption-Baukasten). */
export const HASHTAGS_MAX = 300;

export { FOLD_NOTE, TEXTCHECK_KEY, TEXTCHECK_PATH, charCount, counterLabel, foldHint, foldInfo, splitAtFold, textcheckState };
export type { Platform };

// ---- Auswahllisten und Beschriftungen --------------------------------------------------------------

export const PLATTFORMEN: { key: PlattformKey; label: string }[] = PLATTFORM_KEYS.map((key) => ({ key, label: PLATFORMS[key].label }));

export const FORMATE: { key: FormatKey; label: string; hint: string }[] = [
  { key: "geschichte", label: "Geschichte", hint: "Eine kleine Szene aus dem Alltag mit Anfang, Wendung und Schluss." },
  { key: "liste", label: "Liste", hint: "Drei bis fünf Punkte untereinander." },
  { key: "meinung", label: "Meinung", hint: "Eine klare Haltung, begründet aus der Praxis." },
  { key: "fachtipp", label: "Fachtipp", hint: "Ein Rat, den deine Kundschaft sofort umsetzen kann." },
];

export const ZIELE: { key: ZielKey; label: string; hint: string }[] = [
  { key: "kommentar", label: "Kommentar", hint: "Die Aufforderung lädt zu einem Kommentar ein." },
  { key: "nachricht", label: "Nachricht", hint: "Die Aufforderung lädt zu einer Nachricht an euch ein." },
  { key: "profil", label: "Profil besuchen", hint: "Die Aufforderung lädt ein, euer Profil anzusehen." },
  { key: "link", label: "Link", hint: "An der Stelle steht der Platzhalter [Link]. Die Adresse setzt du selbst ein." },
  { key: "speichern", label: "Speichern", hint: "Die Aufforderung lädt ein, den Beitrag zu speichern." },
];

export const ANREDEN: { key: AnredeKey; label: string }[] = [
  { key: "du", label: "Du" },
  { key: "sie", label: "Sie" },
];

export const isPlattform = (v: unknown): v is PlattformKey => typeof v === "string" && (PLATTFORM_KEYS as readonly string[]).includes(v);
export const isFormat = (v: unknown): v is FormatKey => typeof v === "string" && (FORMAT_KEYS as readonly string[]).includes(v);
export const isZiel = (v: unknown): v is ZielKey => typeof v === "string" && (ZIEL_KEYS as readonly string[]).includes(v);
export const isAnrede = (v: unknown): v is AnredeKey => typeof v === "string" && (ANREDE_KEYS as readonly string[]).includes(v);

export const plattformLabel = (key: PlattformKey): string => PLATFORMS[key].label;
export const formatLabel = (key: FormatKey): string => FORMATE.find((f) => f.key === key)?.label ?? key;
export const zielLabel = (key: ZielKey): string => ZIELE.find((z) => z.key === key)?.label ?? key;
export const anredeLabel = (key: AnredeKey): string => (key === "du" ? "Du" : "Sie");

/** Hashtags gibt es nur auf Instagram. */
export const hatHashtags = (key: PlattformKey): boolean => PLATFORMS[key].hashtags;

// ---- Hilfen ------------------------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneLine = (s: unknown, max: number): string => (typeof s === "string" ? s : "").replace(/\s+/g, " ").trim().slice(0, max);
const multiLine = (s: unknown, max: number): string =>
  (typeof s === "string" ? s : "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

/** Eine Liste von Texten: ohne Leere, ohne Doppel (ohne Gross- und Kleinschreibung), jeder Eintrag gekürzt, höchstens `count`. */
function textList(raw: unknown, count: number, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = oneLine(item, max);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= count) break;
  }
  return out;
}

/** Namen aus Einträgen mit «name» (Personas, Themensäulen), ohne Leere und Doppel. */
function nameList(raw: unknown, count: number, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return textList(
    raw.map((e) => (isRecord(e) ? e.name : "")),
    count,
    max,
  );
}

const endSentence = (s: string): string => (/[.!?:]$/.test(s) ? s : `${s}.`);

// ---- Profil ------------------------------------------------------------------------------------------

export type ProfileFields = Pick<Profile, "firma" | "branche" | "ort" | "positionierung" | "marke" | "contentSaeulen" | "personas">;

/** Was aus dem Profil als Hintergrund mitgehen kann. Leer, wo nichts da ist. */
export type ProfilTeile = {
  positionierung: string;
  werte: string[];
  tonalitaet: string;
  vermeiden: string[];
  persona: string;
  saeulen: string[];
};

/** Tonalität aus der Marke: «So schreiben wir: …» und «So nicht: …» (Markenplattform), sonst alle Texte ausser der Anrede. */
export function tonalitaetText(marke: Profile["marke"]): string {
  const ton = marke?.tonalitaet;
  if (!isRecord(ton)) return "";
  const so = oneLine(ton.so, LIMITS.tonalitaet);
  const nichtSo = oneLine(ton.nichtSo, LIMITS.tonalitaet);
  if (so || nichtSo) {
    return [so ? `So schreiben wir: ${endSentence(so)}` : "", nichtSo ? `So nicht: ${endSentence(nichtSo)}` : ""].filter(Boolean).join(" ").slice(0, LIMITS.tonalitaet);
  }
  const rest = Object.entries(ton)
    .filter(([key, value]) => key !== "anrede" && typeof value === "string")
    .map(([, value]) => oneLine(value, LIMITS.tonalitaet))
    .filter(Boolean)
    .join(" ");
  return rest.slice(0, LIMITS.tonalitaet);
}

/** Namen der Themensäulen aus dem Profil, für das Feld «Säule». */
export function saeulenNamen(profile: Pick<Profile, "contentSaeulen">): string[] {
  return nameList(profile.contentSaeulen, 10, LIMITS.saeule);
}

/** Namen der Personas, zu einem Text verbunden und auf die Grenze gekürzt. */
export function personaText(profile: Pick<Profile, "personas">): string {
  return nameList(profile.personas, 5, 60).join(", ").slice(0, LIMITS.persona);
}

export function profilTeile(profile: Pick<Profile, "positionierung" | "marke" | "contentSaeulen" | "personas">): ProfilTeile {
  const marke = isRecord(profile.marke) ? profile.marke : undefined;
  const woerter = marke && isRecord(marke.woerter) ? marke.woerter : undefined;
  return {
    positionierung: multiLine(profile.positionierung, LIMITS.positionierung),
    werte: textList(marke?.werte, LIMITS.werte, LIMITS.wert),
    tonalitaet: tonalitaetText(profile.marke),
    vermeiden: textList(woerter?.vermeiden, LIMITS.vermeiden, LIMITS.vermeidenWort),
    persona: personaText(profile),
    saeulen: saeulenNamen(profile),
  };
}

/**
 * Namen der Profil-Teile, die mitgehen, für den Hinweis über dem Formular und den Satz vor dem Knopf. Die Säule zählt nur,
 * wenn die Person eine gewählt hat und sie im Profil steht.
 */
export function hinweisNamen(teile: ProfilTeile, saeule = ""): string[] {
  const out: string[] = [];
  if (teile.positionierung) out.push("Positionierung");
  if (teile.werte.length > 0) out.push("Werte");
  if (teile.tonalitaet) out.push("Tonalität");
  if (teile.vermeiden.length > 0) out.push("zu vermeidende Wörter");
  if (saeule && teile.saeulen.includes(saeule)) out.push("Säule");
  if (teile.persona) out.push("Persona-Namen");
  return out;
}

/** «A, B und C» für Aufzählungen im Fliesstext. */
export function joinNamen(namen: string[]): string {
  if (namen.length <= 1) return namen.join("");
  return `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
}

/** Anrede, die gilt: gewählt, sonst aus der Tonalität im Profil, sonst Du. */
export function resolveAnrede(gewaehlt: AnredeKey | "", profile: Pick<Profile, "marke">): AnredeKey {
  if (isAnrede(gewaehlt)) return gewaehlt;
  const ausProfil = anredeFromProfile(profile);
  return isAnrede(ausProfil) ? ausProfil : "du";
}

/** Steht im Profil (Tonalität der Marke) eine erkennbare Anrede? Dann ist das Feld «Anrede» daraus vorbelegt. */
export function hatAnredeImProfil(profile: Pick<Profile, "marke">): boolean {
  return isAnrede(anredeFromProfile(profile));
}

// ---- Eingabe -------------------------------------------------------------------------------------

/** Was die Person im Formular angibt. Anrede leer: gilt das Profil, sonst Du. */
export type FormValues = {
  idee: string;
  plattform: PlattformKey | "";
  format: FormatKey | "";
  ziel: ZielKey | "";
  saeule: string;
  anrede: AnredeKey | "";
  emojis: boolean;
};

export const EMPTY_FORM: FormValues = { idee: "", plattform: "instagram", format: "geschichte", ziel: "kommentar", saeule: "", anrede: "", emojis: false };

export type Problem = { message: string; fieldId: string };

/** Meldet, warum es nicht losgehen kann, und welches Feld gemeint ist. null: in Ordnung. Der Server prüft mit demselben Schema noch einmal. */
export function inputProblem(fields: Pick<ProfileFields, "firma">, form: FormValues): Problem | null {
  if (!oneLine(fields.firma, LIMITS.betrieb)) return { message: "Gib den Namen deines Betriebs an.", fieldId: "pg-firma" };
  const idee = multiLine(form.idee, LIMITS.idee + 1);
  if (idee.length < LIMITS.ideeMin) {
    return { message: `Beschreib deine Idee in mindestens ${LIMITS.ideeMin} Zeichen, zum Beispiel, was diese Woche im Betrieb passiert ist.`, fieldId: "pg-idee" };
  }
  if (idee.length > LIMITS.idee) return { message: `Kürze die Idee auf ${LIMITS.idee} Zeichen.`, fieldId: "pg-idee" };
  if (!isPlattform(form.plattform)) return { message: "Wähle die Plattform.", fieldId: "pg-plattform" };
  if (!isFormat(form.format)) return { message: "Wähle das Format.", fieldId: "pg-format" };
  if (!isZiel(form.ziel)) return { message: "Wähle das Ziel der Aufforderung.", fieldId: "pg-ziel" };
  return null;
}

/** Eingabe des Generators aus Profil und Formular, bereinigt und gekürzt. Eine Säule geht nur mit, wenn sie im Profil steht. */
export function toInput(fields: ProfileFields, form: FormValues): PostInput {
  const teile = profilTeile(fields);
  const saeule = oneLine(form.saeule, LIMITS.saeule);
  return {
    betrieb: oneLine(fields.firma, LIMITS.betrieb),
    branche: oneLine(fields.branche, LIMITS.branche),
    ort: oneLine(fields.ort, LIMITS.ort),
    idee: multiLine(form.idee, LIMITS.idee),
    plattform: isPlattform(form.plattform) ? form.plattform : "instagram",
    format: isFormat(form.format) ? form.format : "geschichte",
    ziel: isZiel(form.ziel) ? form.ziel : "kommentar",
    saeule: teile.saeulen.includes(saeule) ? saeule : "",
    anrede: resolveAnrede(form.anrede, fields),
    emojis: form.emojis === true,
    positionierung: teile.positionierung,
    werte: teile.werte,
    tonalitaet: teile.tonalitaet,
    vermeiden: teile.vermeiden,
    persona: teile.persona,
  };
}

/** Das Formular aus einer gespeicherten Eingabe, für «Angaben ändern». */
export function toForm(input: PostInput): FormValues {
  return { idee: input.idee, plattform: input.plattform, format: input.format, ziel: input.ziel, saeule: input.saeule, anrede: input.anrede, emojis: input.emojis };
}

/** Die Idee aus einer gemerkten Beitragsidee (Titel und Beschrieb), auf die Grenze des Feldes gekürzt. */
export function ideeText(idea: { titel: string; beschrieb: string }): string {
  const titel = oneLine(idea.titel, LIMITS.idee);
  const beschrieb = oneLine(idea.beschrieb, LIMITS.idee);
  return `${titel ? endSentence(titel) : ""} ${beschrieb}`.trim().slice(0, LIMITS.idee);
}

/** Eine gemerkte Idee für das Auswahlfeld. */
export type MerkIdee = { id: string; titel: string; text: string };

/** Die Angaben fürs CRM, eine je Zeile. Der Server kürzt auf 1'900 Zeichen; das Wichtigste steht darum oben. */
export function eingabeText(input: PostInput): string {
  return [
    `Betrieb: ${input.betrieb}`,
    input.ort ? `Ort: ${input.ort}` : "",
    input.branche ? `Branche: ${input.branche}` : "",
    `Plattform: ${plattformLabel(input.plattform)}`,
    `Format: ${formatLabel(input.format)}`,
    `Ziel der Aufforderung: ${zielLabel(input.ziel)}`,
    `Anrede: ${anredeLabel(input.anrede)}`,
    `Emojis: ${input.emojis ? "erlaubt" : "nicht erlaubt"}`,
    input.saeule ? `Säule: ${input.saeule}` : "",
    `Idee: ${input.idee.replace(/\s*\n+\s*/g, " / ")}`,
    input.positionierung ? `Positionierung: ${input.positionierung.replace(/\s*\n+\s*/g, " / ")}` : "",
    input.werte.length > 0 ? `Werte: ${input.werte.join(", ")}` : "",
    input.tonalitaet ? `Tonalität: ${input.tonalitaet}` : "",
    input.vermeiden.length > 0 ? `Zu vermeidende Wörter: ${input.vermeiden.join(", ")}` : "",
    input.persona ? `Persona: ${input.persona}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- Der fertige Beitrag -------------------------------------------------------------------------

export type HookIndex = 0 | 1;

/**
 * Der fertige Text: Hook (die gewählte Variante), Leerzeile, Hauptteil, Leerzeile, Aufforderung; bei Instagram danach die
 * Hashtags der Person (bereinigt). Der Google-Beitrag hat keine Leerzeilen, nur einfache Zeilenumbrüche.
 */
export function compose(output: PostOutput, hookIndex: HookIndex, hashtags: string, platform: PlattformKey): string {
  const hook = tidy(output.hooks[hookIndex === 1 ? 1 : 0]);
  const hauptteil = tidy(output.hauptteil);
  const cta = tidy(output.cta);
  if (platform === "google") {
    return [hook, hauptteil.replace(/\n{2,}/g, "\n"), cta].filter(Boolean).join("\n");
  }
  const tags = hatHashtags(platform) ? cleanHashtags(hashtags) : "";
  return [hook, hauptteil, cta, tags].filter(Boolean).join("\n\n");
}

/** Absätze eines Textes: durch Leerzeilen getrennt, ohne Leere. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Der Platzhalter-Hinweis der KI, bereinigt; leer, wenn die KI keinen liefert. */
export function hinweisOf(output: PostOutput): string {
  return oneLine(output.hinweis, 200);
}

// ---- Dokument ------------------------------------------------------------------------------------

/** DocumentModel für «Text kopieren»: beide Hooks, Hauptteil, Aufforderung, bei Instagram die Hashtags der Person. */
export function toDocument(output: PostOutput, input: PostInput, hashtags = ""): DocumentModel {
  const betrieb = input.betrieb || "Dein Betrieb";
  const plattform = plattformLabel(input.plattform);
  const tags = hatHashtags(input.plattform) ? cleanHashtags(hashtags) : "";
  const hinweis = hinweisOf(output);
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Betrieb", value: input.ort ? `${betrieb}, ${input.ort}` : betrieb },
        { label: "Plattform", value: plattform },
        { label: "Format", value: formatLabel(input.format) },
        { label: "Ziel der Aufforderung", value: zielLabel(input.ziel) },
        { label: "Anrede", value: anredeLabel(input.anrede) },
      ],
    },
    { type: "paragraph", text: KI_HINWEIS },
    { type: "heading", level: 1, text: "Hook, zwei Varianten" },
    { type: "list", ordered: true, items: output.hooks },
    { type: "heading", level: 1, text: "Hauptteil" },
    ...paragraphs(output.hauptteil).map((text): DocBlock => ({ type: "paragraph", text })),
    { type: "heading", level: 1, text: "Aufforderung" },
    { type: "paragraph", text: output.cta },
    ...(tags ? [{ type: "heading", level: 1, text: "Hashtags" } as DocBlock, { type: "paragraph", text: tags } as DocBlock] : []),
    ...(hinweis ? [{ type: "heading", level: 1, text: "Hinweis der KI" } as DocBlock, { type: "paragraph", text: hinweis } as DocBlock] : []),
  ];
  return {
    title: `Beitrag: ${plattform}`,
    subtitle: `Für ${betrieb}`,
    filename: `beitrag-${safeFilename(plattform, "plattform")}-${safeFilename(betrieb, "betrieb")}`,
    blocks,
  };
}

/** Der Beitrag als Markdown fürs CRM. */
export function reportMarkdown(output: PostOutput, input: PostInput, hashtags = ""): string {
  return toMarkdown(toDocument(output, input, hashtags));
}

// ---- Entwürfe --------------------------------------------------------------------------------------

export type Entwurf = {
  id: string;
  titel: string;
  gespeichertAm: string;
  input: PostInput;
  output: PostOutput;
  hook: HookIndex;
  hashtags: string;
};

/** Titel eines Entwurfs: der gewählte Hook, bei mehr als 60 Zeichen mit «…» gekürzt. */
export function draftTitle(hook: string): string {
  const t = oneLine(hook, 1000);
  if (!t) return "Ohne Titel";
  const chars = Array.from(t);
  return chars.length <= 60 ? t : `${chars.slice(0, 59).join("").trimEnd()}…`;
}

export function newDraft(
  input: PostInput,
  output: PostOutput,
  hook: HookIndex,
  hashtags: string,
  now: Date,
  existing: readonly Entwurf[] = [],
): Entwurf {
  const base = `e-${now.getTime().toString(36)}`;
  const taken = new Set(existing.map((e) => e.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return { id, titel: draftTitle(output.hooks[hook]), gespeichertAm: now.toISOString(), input, output, hook, hashtags: hashtags.slice(0, HASHTAGS_MAX) };
}

/** Der neue Entwurf zuerst; mehr als zehn gibt es nicht, der älteste fällt weg. */
export function addDraft(list: readonly Entwurf[], draft: Entwurf): Entwurf[] {
  return [draft, ...list.filter((e) => e.id !== draft.id)].slice(0, MAX_ENTWUERFE);
}

export const removeDraft = (list: readonly Entwurf[], id: string): Entwurf[] => list.filter((e) => e.id !== id);

/** Der Text eines Entwurfs, wie er auf der Plattform stünde. */
export const draftText = (d: Entwurf): string => compose(d.output, d.hook, d.hashtags, d.input.plattform);

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

/**
 * Stand unter mt:post-generator. `output` ist das Ergebnis (der Pfad-Fortschritt liest es); `hook` die gewählte Variante,
 * `hashtags` der Text der Person, `entwuerfe` die gemerkten Beiträge (höchstens zehn).
 */
export type PostState = { v: 1; input: PostInput | null; output: PostOutput | null; hook: HookIndex; hashtags: string; entwuerfe: Entwurf[] };

export const EMPTY_STATE: PostState = { v: 1, input: null, output: null, hook: 0, hashtags: "", entwuerfe: [] };

const hookOf = (v: unknown): HookIndex => (v === 1 ? 1 : 0);
const hashtagsOf = (v: unknown): string => (typeof v === "string" ? v.slice(0, HASHTAGS_MAX) : "");

function parseEntwurf(raw: unknown): Entwurf | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || raw.id === "" || raw.id.length > 60) return null;
  if (typeof raw.gespeichertAm !== "string" || Number.isNaN(Date.parse(raw.gespeichertAm))) return null;
  const input = postInput.safeParse(raw.input);
  const output = postOutput.safeParse(raw.output);
  if (!input.success || !output.success) return null;
  const hook = hookOf(raw.hook);
  const titel = typeof raw.titel === "string" && raw.titel.trim() ? raw.titel.slice(0, 80) : draftTitle(output.data.hooks[hook]);
  return { id: raw.id, titel, gespeichertAm: raw.gespeichertAm, input: input.data, output: output.data, hook, hashtags: hashtagsOf(raw.hashtags) };
}

/**
 * Liest den gespeicherten Stand; bei kaputten Daten oder falscher Version gilt der leere Stand. Ohne gültige Eingabe fällt
 * das Ergebnis weg (es braucht die Eingabe für das Dokument); ein kaputtes Ergebnis lässt die Eingabe stehen. Von den
 * Entwürfen bleiben die gültigen, höchstens zehn, ohne doppelte IDs.
 */
export function parseState(raw: unknown): PostState {
  if (!isRecord(raw) || raw.v !== 1) return EMPTY_STATE;
  const input = postInput.safeParse(raw.input);
  const output = input.success ? postOutput.safeParse(raw.output) : null;
  const seen = new Set<string>();
  const entwuerfe: Entwurf[] = [];
  for (const item of Array.isArray(raw.entwuerfe) ? raw.entwuerfe : []) {
    const e = parseEntwurf(item);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    entwuerfe.push(e);
    if (entwuerfe.length === MAX_ENTWUERFE) break;
  }
  const hatErgebnis = input.success && output?.success === true;
  return {
    v: 1,
    input: input.success ? input.data : null,
    output: output?.success ? output.data : null,
    hook: hatErgebnis ? hookOf(raw.hook) : 0,
    hashtags: hatErgebnis ? hashtagsOf(raw.hashtags) : "",
    entwuerfe,
  };
}
