import { brandHits } from "@/lib/brand-rules";
import { numberCH, typoCH } from "@/lib/ch";
import { safeFilename, type DocBlock, type DocumentModel } from "@/lib/export/model";
import {
  FOLD_NOTE,
  anredeFromProfile,
  anredeLabel,
  charCount,
  counterLabel,
  foldInfo,
  isAnrede,
  placeholdersOf,
  resolveAnrede,
  splitSentences,
  type Anrede,
} from "@/tools/caption-baukasten/logic";

// Story-Post-Builder: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Die Person beantwortet sechs Fragen zu einer Geschichte. Das Werkzeug ordnet und kürzt ihre Sätze, es schreibt keine neuen.
// Nur der Hook setzt Wörter der Person zusammen. Keine KI, kein Server. Spec: specs/story-post.md

export const SLUG = "story-post";
export const STORAGE_KEY = `mt:${SLUG}`;
export { FOLD_NOTE, anredeFromProfile, anredeLabel, charCount, counterLabel, foldInfo, isAnrede, resolveAnrede };
export type { Anrede };

/** Richtwert von Alperna, keine Statistik: Instagram erlaubt in der Beschriftung bis zu so vielen Zeichen; die Plattform ändert die Grenze. */
export const INSTAGRAM_MAX = 2200;
/** Ein Hook hat höchstens so viele Zeichen. Ist er länger, endet er am letzten Leerzeichen vor Zeichen 137 mit «…». */
export const HOOK_MAX = 140;
const HOOK_CUT = 137;
/** Ein zweiter Hook, der nach dem Kürzen kürzer ist, entfällt. */
export const HOOK_MIN = 30;
/** Höchstens so viele Sätze hat ein Teil der Geschichte, ohne dass das Werkzeug einen Hinweis gibt. */
export const MAX_SAETZE = 3;
/** Annahme von Alperna, keine Statistik. */
export const WORDS_PER_MINUTE = 200;
export const LESEZEIT_NOTE = `Annahme von Alperna: ${WORDS_PER_MINUTE} Wörter pro Minute, keine Statistik`;
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
export const SAETZE_NOTE = "Die Sätze sind deine; das Werkzeug ordnet sie.";
export const INSTAGRAM_TOO_LONG = "Zu lang für Instagram: kürze von Hand";

export const ANREDEN: { value: Anrede; label: string }[] = [
  { value: "du", label: "Du" },
  { value: "sie", label: "Sie" },
];

// ---- Felder ----------------------------------------------------------------------------------------

export const FELD_KEYS = ["ausgangslage", "problem", "wendepunkt", "ergebnis", "lehre", "bezug"] as const;
export type FeldKey = (typeof FELD_KEYS)[number];
export type Felder = Record<FeldKey, string>;
export const EMPTY_FELDER: Felder = { ausgangslage: "", problem: "", wendepunkt: "", ergebnis: "", lehre: "", bezug: "" };

export type FeldDef = {
  key: FeldKey;
  label: string;
  hinweis: string;
  /** Beispiel der fiktiven Malerei Keller; steht als Platzhalter im Feld und nie als Wert. */
  beispiel: string;
  /** Wo das Beispiel von der Anrede abhängt. */
  beispielSie?: string;
  min: number;
  max: number;
  pflicht: boolean;
};

export const FELDER: FeldDef[] = [
  {
    key: "ausgangslage",
    label: "Ausgangslage",
    hinweis: "Wo standest du, wer war beteiligt?",
    beispiel: "Frau Z. aus Gossau rief an: Ihre Fassade blätterte nach drei Wintern ab.",
    min: 20,
    max: 400,
    pflicht: true,
  },
  {
    key: "problem",
    label: "Problem oder Spannung",
    hinweis: "Was war schwierig oder unklar?",
    beispiel: "Zwei andere Maler hatten nur übergestrichen.",
    min: 20,
    max: 400,
    pflicht: true,
  },
  {
    key: "wendepunkt",
    label: "Wendepunkt",
    hinweis: "Was hat den Unterschied gemacht?",
    beispiel: "Wir haben erst die Feuchte im Putz gemessen.",
    min: 20,
    max: 400,
    pflicht: true,
  },
  {
    key: "ergebnis",
    label: "Ergebnis",
    hinweis: "Was ist daraus geworden? Nur, was stimmt.",
    beispiel: "Die Fassade hält seit zwei Jahren.",
    min: 20,
    max: 400,
    pflicht: true,
  },
  {
    key: "lehre",
    label: "Lehre",
    hinweis: "Was nimmst du mit?",
    beispiel: "Erst messen, dann streichen.",
    min: 20,
    max: 400,
    pflicht: true,
  },
  {
    key: "bezug",
    label: "Bezug zur Leserin",
    hinweis: "Eine Frage oder Einladung an die Leserschaft.",
    beispiel: "Wie ist das bei deinem Haus?",
    beispielSie: "Wie ist das bei Ihrem Haus?",
    min: 10,
    max: 400,
    pflicht: false,
  },
];

const DEF = Object.fromEntries(FELDER.map((f) => [f.key, f])) as Record<FeldKey, FeldDef>;

export const fieldId = (key: FeldKey): string => `sp-${key}`;
/** Beschriftung im Formular: Freiwillige Felder tragen den Zusatz. */
export const fieldLabel = (f: FeldDef): string => (f.pflicht ? f.label : `${f.label} (freiwillig)`);
export const beispielOf = (f: FeldDef, anrede: Anrede): string => (anrede === "sie" && f.beispielSie ? f.beispielSie : f.beispiel);
export const PFLICHT_KEYS: FeldKey[] = FELDER.filter((f) => f.pflicht).map((f) => f.key);

/** Die Beispiele der Malerei Keller als ausgefüllte Angaben (für Tests und Seitentext). */
export function beispielFelder(anrede: Anrede = "du"): Felder {
  return Object.fromEntries(FELDER.map((f) => [f.key, beispielOf(f, anrede)])) as Felder;
}

// ---- Text ------------------------------------------------------------------------------------------

/**
 * Bringt eine Eingabe in Form: Zeilenumbrüche und Leerraum zu einem Leerzeichen, Schweizer Schreibweise (typoCH),
 * drei oder mehr Punkte zu «…», zwei Punkte zu einem. Eckige Klammern bleiben stehen. Der Wortlaut ändert sich nie.
 */
export function tidy(s: string): string {
  return typoCH(s.replace(/\s+/g, " ").trim())
    .replace(/\.{3,}/g, "…")
    .replace(/\.\./g, ".");
}

export const wordCount = (text: string): number => text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

/** Der erste Satz eines Textes (nach tidy), leer bei leerem Text. */
const firstSentence = (text: string): string => splitSentences(text)[0] ?? "";

// ---- Prüfung ---------------------------------------------------------------------------------------

export type Problem = { key: FeldKey; fieldId: string; message: string };

/** Alle Fehler der Angaben, in der Reihenfolge der Felder. Ein freiwilliges Feld darf leer sein, sonst gelten dieselben Grenzen. */
export function validate(felder: Felder): Problem[] {
  const out: Problem[] = [];
  for (const f of FELDER) {
    const n = charCount(tidy(felder[f.key] ?? ""));
    const problem = (message: string) => out.push({ key: f.key, fieldId: fieldId(f.key), message });
    if (n === 0) {
      if (f.pflicht) problem(`«${f.label}» fehlt noch.`);
    } else if (n < f.min) {
      problem(`«${f.label}» ist zu kurz: mindestens ${f.min} Zeichen, du hast ${n}.`);
    } else if (n > f.max) {
      problem(`«${f.label}» ist zu lang: höchstens ${numberCH(f.max, 0)} Zeichen, du hast ${numberCH(n, 0)}.`);
    }
  }
  return out;
}

/** Wie viele Pflichtfelder die Mindestlänge erreichen (für die Fortschrittsanzeige). */
export function readyCount(felder: Felder): number {
  return PFLICHT_KEYS.filter((k) => {
    const n = charCount(tidy(felder[k] ?? ""));
    return n >= DEF[k].min && n <= DEF[k].max;
  }).length;
}

// ---- Hook ------------------------------------------------------------------------------------------

export type HookWahl = 0 | 1 | 2;
export const HOOK_WAHLEN: { value: HookWahl; label: string }[] = [
  { value: 1, label: "Hook 1" },
  { value: 2, label: "Hook 2" },
  { value: 0, label: "Ohne Hook" },
];
export const isHookWahl = (v: unknown): v is HookWahl => v === 0 || v === 1 || v === 2;
export const hookLabel = (w: HookWahl): string => HOOK_WAHLEN.find((h) => h.value === w)?.label ?? "Hook 1";

const GRUND = "Der Grund:";

/**
 * Kürzt einen Hook auf höchstens 140 Zeichen: Schnitt am letzten Leerzeichen vor Zeichen 137, am Ende «…».
 * Nie mitten in einer Klammer. Schlusszeichen vor dem Schnitt (Komma, Punkt, Doppelpunkt, ...) fallen weg, damit keine
 * doppelten Satzzeichen entstehen. Gezählt wird in Unicode-Zeichen. `hart`: Gibt es vor dem Schnitt weniger als HOOK_MIN
 * Zeichen, schneidet der Hook hart bei 137 statt am Leerzeichen.
 */
export function shorten(text: string, hart = false): string {
  const chars = Array.from(text);
  if (chars.length <= HOOK_MAX) return text;
  let head = chars.slice(0, HOOK_CUT).join("");
  const open = head.lastIndexOf("[");
  const klammerOffen = open > head.lastIndexOf("]");
  if (klammerOffen) head = head.slice(0, open);
  // Steht nach Zeichen 137 ein Leerzeichen, endet der Anfang schon an einer Wortgrenze.
  const wortEnde = !klammerOffen && chars[HOOK_CUT] === " ";
  const space = head.lastIndexOf(" ");
  let cut = wortEnde || space <= 0 ? head : head.slice(0, space);
  if (hart && charCount(cut) < HOOK_MIN) cut = head;
  cut = cut.replace(/[\s,;:.!?\-–…]+$/u, "");
  return `${cut}…`;
}

/** Erster Satz des Ergebnisses ohne Schlusspunkt, «. Der Grund: », erster Satz des Wendepunkts. Kein «!.» oder «..». */
function grundHook(ergebnis: string, wendepunkt: string): string {
  const base = ergebnis.replace(/[.,;:]+$/, "");
  const sep = /[!?…]$/.test(base) ? ` ${GRUND} ` : `. ${GRUND} `;
  return `${base}${sep}${wendepunkt}`;
}

/**
 * Die Hook-Vorschläge, nur aus Wörtern der Person. Hook 1: erster Satz des Ergebnisses. Hook 2: derselbe Satz ohne
 * Schlusspunkt, «. Der Grund: » und der erste Satz des Wendepunkts. Hook 2 entfällt, wenn er nach dem Kürzen kürzer als
 * 30 Zeichen ist, den Grund nicht mehr enthält oder wie Hook 1 lautet. Leere Angaben ergeben keinen Hook.
 */
export function hooks(felder: Felder): string[] {
  const ergebnis = firstSentence(tidy(felder.ergebnis ?? ""));
  if (!ergebnis) return [];
  const out = [shorten(ergebnis, true)];
  const wendepunkt = firstSentence(tidy(felder.wendepunkt ?? ""));
  if (wendepunkt) {
    const zwei = shorten(grundHook(ergebnis, wendepunkt));
    if (charCount(zwei) >= HOOK_MIN && zwei.includes(GRUND) && zwei !== out[0]) out.push(zwei);
  }
  return out;
}

/** Die wirksame Wahl: «Hook 2» ohne zweiten Vorschlag fällt auf Hook 1 zurück, ohne jeden Vorschlag auf «Ohne Hook». */
export function effectiveHook(wahl: HookWahl, vorschlaege: readonly string[]): HookWahl {
  if (wahl === 0 || vorschlaege.length === 0) return 0;
  return wahl === 2 && vorschlaege.length >= 2 ? 2 : 1;
}

// ---- Lesezeit --------------------------------------------------------------------------------------

/** `minuten` ist 0, solange der Text unter einer Minute liegt (weniger als 200 Wörter); sonst in halben Minuten aufgerundet. */
export type Lesezeit = { woerter: number; minuten: number; label: string };

export function readingTime(text: string): Lesezeit {
  const woerter = wordCount(text);
  if (woerter < WORDS_PER_MINUTE) return { woerter, minuten: 0, label: "unter 1 Minute" };
  const minuten = Math.ceil(woerter / (WORDS_PER_MINUTE / 2)) / 2;
  return { woerter, minuten, label: minuten === 1 ? "1 Minute" : `${numberCH(minuten, 1)} Minuten` };
}

// ---- Absätze und Instagram -------------------------------------------------------------------------

export type AbsatzKey = "hook" | FeldKey;
export type Absatz = { key: AbsatzKey; text: string };

/** Die Absätze in der Reihenfolge Hook, Ausgangslage, Problem, Wendepunkt, Ergebnis, Lehre, Bezug. Leere Teile entfallen. */
export function absaetze(felder: Felder, hook: string): Absatz[] {
  const out: Absatz[] = hook ? [{ key: "hook", text: hook }] : [];
  for (const f of FELDER) {
    const text = tidy(felder[f.key] ?? "");
    if (text) out.push({ key: f.key, text });
  }
  return out;
}

const joinText = (teile: readonly Absatz[]): string => teile.map((a) => a.text).join("\n\n");

export type InstagramFassung = {
  text: string;
  zeichen: number;
  /** Welche Absätze entfallen sind, in der Reihenfolge der Geschichte. */
  weggelassen: ("lehre" | "bezug")[];
  zuLang: boolean;
  hinweis: string | null;
};

/**
 * Instagram-Fassung: dieselben Absätze, höchstens 2'200 Zeichen (Richtwert von Alperna, Unicode-Zeichen, ein Emoji zählt eins).
 * Ist der Text länger, entfällt zuerst der Absatz «Bezug zur Leserin», dann der Absatz «Lehre». Reicht das nicht, bleibt der
 * volle Text stehen und der Hinweis lautet «Zu lang für Instagram: kürze von Hand». Es wird nie mitten im Satz abgeschnitten.
 * Wurde gestrichen, nennt der Hinweis genau, was fehlt.
 */
export function instagram(teile: readonly Absatz[]): InstagramFassung {
  const full = joinText(teile);
  const fits = (t: string) => charCount(t) <= INSTAGRAM_MAX;
  if (fits(full)) return { text: full, zeichen: charCount(full), weggelassen: [], zuLang: false, hinweis: null };

  let rest = [...teile];
  const weg = new Set<"lehre" | "bezug">();
  for (const key of ["bezug", "lehre"] as const) {
    if (!rest.some((a) => a.key === key)) continue;
    rest = rest.filter((a) => a.key !== key);
    weg.add(key);
    const text = joinText(rest);
    if (fits(text)) {
      const fehlt = (["lehre", "bezug"] as const).filter((k) => weg.has(k));
      const namen = fehlt.map((k) => (k === "lehre" ? "Lehre" : "Bezug zur Leserin")).join(" und ");
      return {
        text,
        zeichen: charCount(text),
        weggelassen: fehlt,
        zuLang: false,
        hinweis: `Gekürzt: ${namen} ${fehlt.length === 1 ? "fehlt" : "fehlen"}`,
      };
    }
  }
  return { text: full, zeichen: charCount(full), weggelassen: [], zuLang: true, hinweis: INSTAGRAM_TOO_LONG };
}

/** Die Instagram-Zeile fürs CRM und fürs Dokument. */
export const instagramZeile = (ig: InstagramFassung): string =>
  ig.hinweis ? `Instagram: ${numberCH(ig.zeichen, 0)} Zeichen. ${ig.hinweis}.` : `Instagram: ${numberCH(ig.zeichen, 0)} Zeichen, nichts gekürzt.`;

// ---- Hinweise --------------------------------------------------------------------------------------

/** Hinweis je Teil mit mehr als drei Sätzen. Der Text bleibt unverändert. */
function satzHinweise(felder: Felder): string[] {
  const out: string[] = [];
  FELDER.forEach((f, i) => {
    if (splitSentences(tidy(felder[f.key] ?? "")).length > MAX_SAETZE) {
      out.push(`Teil ${i + 1} hat mehr als drei Sätze (${f.label}). Das Werkzeug lässt ihn unverändert.`);
    }
  });
  return out;
}

/** Wörter, die zusätzlich zur Sperrliste (lib/brand-rules.ts) im Ton der Seite nicht vorkommen. */
const EXTRA_WORDS: RegExp[] = [/\bjetzt\b/i, /\bnur noch\b/i, /\bgarantiert\b/i, /\bNr\.\s?1\b/i, /!/];

/** Treffer der Sperrliste in den Angaben, je einer pro Regel. Nichts wird entfernt. */
function sperrHinweise(felder: Felder): string[] {
  const text = FELDER.map((f) => tidy(felder[f.key] ?? "")).join("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (key: string, message: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(message);
  };
  for (const h of brandHits(text)) {
    if (h.what.startsWith("Leerzeichen vor")) add(h.what, "Vor einem Satzzeichen steht ein Leerzeichen, das wir nicht empfehlen.");
    else add(h.text.toLowerCase(), `In deinem Text steht ‹${h.text}›, das wir nicht empfehlen.`);
  }
  for (const re of EXTRA_WORDS) {
    const m = re.exec(text);
    if (m) add(m[0].toLowerCase(), `In deinem Text steht ‹${m[0]}›, das wir nicht empfehlen.`);
  }
  return out;
}

// Du-Formen und Sie-Formen. Gross geschriebene Sie-Formen zählen nur mitten im Satz (am Satzanfang kann «Sie» auch «sie» meinen).
const DU_RE = /\b(?:du|dich|dir|dein(?:e|em|en|er|es)?)\b/iu;
const SIE_RE = /(?<=[\p{Ll},;:»] )(?:Sie|Ihnen|Ihr(?:e|em|en|er|es)?)\b/u;

/** Hinweis, wenn «Lehre» oder «Bezug zur Leserin» die andere Anrede benutzen als die gewählte. */
function anredeHinweise(felder: Felder, anrede: Anrede): string[] {
  const out: string[] = [];
  for (const key of ["lehre", "bezug"] as const) {
    const treffer = (anrede === "du" ? SIE_RE : DU_RE).exec(tidy(felder[key] ?? ""))?.[0];
    if (treffer) out.push(`In «${DEF[key].label}» steht ‹${treffer}›, gewählt ist aber ${anredeLabel(anrede)}. Passe die Anrede oder den Text an.`);
  }
  return out;
}

/** Offene Platzhalter in `[Klammern]` über alle Angaben, jeder einmal, ohne Klammern. */
export function platzhalter(felder: Felder): string[] {
  return placeholdersOf(FELDER.map((f) => tidy(felder[f.key] ?? "")).join("\n"));
}

// ---- Beitrag ---------------------------------------------------------------------------------------

export type Input = { anrede: Anrede; felder: Felder; hook: HookWahl };

export type Story = {
  /** Die Absätze der LinkedIn-Fassung, mit Hook, wenn gewählt. */
  absaetze: Absatz[];
  linkedin: string;
  /** Die Vorschläge: ein oder zwei, bei leerem Ergebnis keiner. */
  hooks: string[];
  /** Die wirksame Wahl. */
  hook: HookWahl;
  lesezeit: Lesezeit;
  instagram: InstagramFassung;
  platzhalter: string[];
  hinweise: string[];
};

/** Setzt den Beitrag zusammen. Der Text der Person wird nicht umformuliert; nur der Hook setzt Wörter zusammen. */
export function compose(input: Input): Story {
  const { felder } = input;
  const vorschlaege = hooks(felder);
  const hook = effectiveHook(input.hook, vorschlaege);
  const teile = absaetze(felder, hook === 0 ? "" : vorschlaege[hook - 1]);
  const linkedin = joinText(teile);
  return {
    absaetze: teile,
    linkedin,
    hooks: vorschlaege,
    hook,
    lesezeit: readingTime(linkedin),
    instagram: instagram(teile),
    platzhalter: platzhalter(felder),
    hinweise: [...satzHinweise(felder), ...sperrHinweise(felder), ...anredeHinweise(felder, input.anrede)],
  };
}

// ---- Dokument --------------------------------------------------------------------------------------

/** Der Beitrag als Dokument für Anzeige-Export, Word, PDF und Text kopieren. */
export function toDocument(story: Story, opts: { firma?: string } = {}): DocumentModel {
  const firma = opts.firma?.trim() || undefined;
  const hookText = story.hook === 0 ? "" : story.hooks[story.hook - 1];
  const para = (text: string): DocBlock => ({ type: "paragraph", text });
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: "Hook", value: hookText ? `${hookLabel(story.hook)}: ${hookText}` : "Ohne Hook" },
        { label: "Lesezeit", value: `${story.lesezeit.label} (${LESEZEIT_NOTE})` },
        { label: "LinkedIn", value: `${counterLabel("linkedin", story.linkedin)} (${RICHTWERT_NOTE})` },
        { label: "Instagram", value: `${numberCH(story.instagram.zeichen, 0)} Zeichen, höchstens ${numberCH(INSTAGRAM_MAX, 0)} (${RICHTWERT_NOTE})` },
      ],
    },
    para(SAETZE_NOTE),
    { type: "heading", level: 1, text: "LinkedIn-Fassung" },
    ...story.absaetze.map((a) => para(a.text)),
    { type: "heading", level: 1, text: "Instagram-Fassung" },
    ...story.instagram.text.split("\n\n").filter(Boolean).map(para),
  ];
  if (story.instagram.hinweis) blocks.push(para(`${story.instagram.hinweis}.`));
  if (story.platzhalter.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Noch ausfüllen" }, { type: "list", items: story.platzhalter.map((p) => `[${p}]`) });
  }
  if (story.hinweise.length > 0) {
    blocks.push({ type: "heading", level: 2, text: "Hinweise" }, { type: "list", items: story.hinweise });
  }
  return {
    title: "Story-Post",
    subtitle: "Beitrag für LinkedIn und Instagram",
    firma,
    filename: `story-post-${safeFilename(firma ?? "", "beitrag")}`,
    blocks,
  };
}

// ---- CRM -------------------------------------------------------------------------------------------

const orNone = (s: string): string => tidy(s) || "keine Angabe";

/** Die Angaben fürs CRM, eine je Zeile: erst die sechs Felder, dann Anrede und Hook. */
export function eingabeText(input: Input): string {
  return [
    ...FELDER.map((f) => `${f.label}: ${orNone(input.felder[f.key] ?? "")}`),
    `Anrede: ${anredeLabel(input.anrede)}`,
    `Hook: ${hookLabel(input.hook)}`,
  ].join("\n");
}

/** Das Ergebnis fürs CRM: die LinkedIn-Fassung, dann die Instagram-Zeile. */
export const ausgabeText = (story: Story): string => `${story.linkedin}\n\n${instagramZeile(story.instagram)}`;

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

/** Momentaufnahme der beiden Texte beim Zusammenstellen (angezeigt wird immer der aus den Angaben berechnete Beitrag). */
export type Output = { linkedin: string; instagram: string };

export type StoryState = {
  v: 1;
  phase: "edit" | "result";
  /** Leer: aus dem Profil, sonst Du. */
  anrede: Anrede | "";
  felder: Felder;
  hook: HookWahl;
  output?: Output;
};

export const EMPTY_STATE: StoryState = { v: 1, phase: "edit", anrede: "", felder: EMPTY_FELDER, hook: 1 };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (s: string, max: number): string => (s.length <= max ? s : Array.from(s).slice(0, max).join(""));

/** Liest Angaben aus beliebigen Daten: Werte falschen Typs werden leer, Texte auf die Grenze gekürzt. */
export function parseFelder(raw: unknown): Felder {
  if (!isRecord(raw)) return EMPTY_FELDER;
  return Object.fromEntries(FELDER.map((f) => [f.key, typeof raw[f.key] === "string" ? clamp(raw[f.key] as string, f.max) : ""])) as Felder;
}

/**
 * Liest den gespeicherten Stand; kaputte Daten und fremde Versionen ergeben den leeren Stand. «result» gilt nur, wenn die
 * Angaben die Prüfung bestehen (sonst «edit»). lib/progress.ts erkennt `phase: "result"` als erledigt.
 */
export function parseState(raw: unknown): StoryState {
  if (!isRecord(raw) || raw.v !== 1) return EMPTY_STATE;
  const felder = parseFelder(raw.felder);
  const complete = validate(felder).length === 0;
  const phase = raw.phase === "result" && complete ? "result" : "edit";
  const o = raw.output;
  const output: Output | undefined =
    phase === "result" && isRecord(o) && typeof o.linkedin === "string" && typeof o.instagram === "string"
      ? { linkedin: clamp(o.linkedin, 6000), instagram: clamp(o.instagram, 6000) }
      : undefined;
  return {
    v: 1,
    phase,
    anrede: isAnrede(raw.anrede) ? raw.anrede : "",
    felder,
    hook: isHookWahl(raw.hook) ? raw.hook : 1,
    ...(output ? { output } : {}),
  };
}
