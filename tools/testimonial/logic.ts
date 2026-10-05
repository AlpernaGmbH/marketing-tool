import { numberCH, typoCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import {
  FOLD_NOTE,
  anredeFromProfile,
  anredeLabel,
  charCount,
  counterLabel,
  isAnrede,
  resolveAnrede,
  type Anrede,
} from "@/tools/caption-baukasten/logic";
import { findingsOf } from "@/tools/textcheck/logic";

// Testimonial-Baukasten: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Weg 1 baut Nachrichten, mit denen man Kundschaft um ein Zitat bittet. Weg 2 baut aus einem Zitat Kachel, Kurz-Referenz,
// Beitrag, Fallstudie und Prüfliste. Das Werkzeug erfindet nichts: Das Zitat bleibt wörtlich, gekürzt wird nur durch die
// Auswahl ganzer Sätze («[…]»), Zahlen und Ergebnisse stammen nur aus den Angaben. Keine KI, kein Server. Spec: specs/testimonial.md

export const SLUG = "testimonial";
export const STORAGE_KEY = `mt:${SLUG}`;
export { FOLD_NOTE, anredeFromProfile, anredeLabel, charCount, isAnrede, resolveAnrede };
export type { Anrede };

export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
/** Unter so vielen Zeichen gilt das gezeigte Zitat als «sehr kurz», darüber hinaus als «lang». Die Zahlen stehen nicht im UI. */
export const ZITAT_SEHR_KURZ = 40;
export const ZITAT_LANG = 280;
/** Die Lücke zwischen zwei nicht benachbarten Sätzen. */
export const LUECKE = "[…]";
export const ANONYM_QUELLE = "Eine Kundin oder ein Kunde";

export const LIMITS = {
  vorname: { min: 2, max: 40 },
  leistung: { min: 5, max: 120 },
  zitat: { min: 20, max: 600 },
  name: { min: 2, max: 60 },
  ortFirma: { min: 2, max: 60 },
  funktion: { max: 60 },
  gemacht: { min: 5, max: 160 },
  text: { min: 10, max: 300 },
} as const;

/** IDs der Felder (DOM), damit die Prüfung den Fokus setzen kann. */
export const FIELD = {
  firma: "tb-firma",
  vorname: "tb-vorname",
  leistung: "tb-leistung",
  fragen: "tb-frage-lage",
  zitat: "tb-zitat",
  saetze: "tb-satz-0",
  name: "tb-name",
  ortFirma: "tb-ortfirma",
  funktion: "tb-funktion",
  gemacht: "tb-gemacht",
  ausgangslage: "tb-ausgangslage",
  getan: "tb-getan",
  ergebnis: "tb-ergebnis",
} as const;

// ---- Text ------------------------------------------------------------------------------------------

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();
const clamp = (s: string, max: number): string => (s.length <= max ? s : Array.from(s).slice(0, max).join(""));
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Eigene Texte der Person: Leerraum zu einem Leerzeichen, Schweizer Schreibweise (typoCH), «...» zu «…». Der Wortlaut ändert sich nie. */
export function tidy(s: string): string {
  return typoCH(oneLine(s))
    .replace(/\.{3,}/g, "…")
    .replace(/\.\./g, ".");
}

const ohneSchluss = (s: string): string => s.replace(/[\s.!?…,;:]+$/u, "");

/** Grossbuchstabe am Satzanfang und ein Schlusspunkt, wenn keiner da ist. Ein Komma, Strichpunkt oder Doppelpunkt am Ende wird zum Punkt. */
export function satzForm(text: string): string {
  let t = tidy(text);
  if (!t) return "";
  t = t.replace(/^([«„"‹([]*)(\p{Ll})/u, (_m, pre: string, ch: string) => pre + ch.toUpperCase());
  t = t.replace(/[,;:]+$/, "");
  if (!/[.!?…]["»”’)›]*$/u.test(t)) t += ".";
  return t;
}

// ---- Sätze -----------------------------------------------------------------------------------------

/** Kürzel, nach denen ein Punkt keinen Satz beendet (klein geschrieben, ohne Punkt). */
const ABKUERZUNGEN = new Set([
  "z", "bzw", "ca", "evtl", "ggf", "inkl", "exkl", "usw", "etc", "nr", "st", "dr", "prof", "hr", "hrn", "fr", "frl", "vgl", "mio", "mrd",
  "tel", "str", "max", "min", "mind", "ev", "std", "kt", "abs", "art", "jh", "bsp", "ing", "dipl", "lic", "pkt", "resp", "sog", "ua",
]);

/** Einzelbuchstaben, ein- oder zweistellige Zahlen (Ordnungszahlen, Aufzählungen) und Kürzel beenden keinen Satz. */
const keinSatzende = (wort: string): boolean => wort.length === 1 || /^\d{1,2}$/.test(wort) || ABKUERZUNGEN.has(wort.toLowerCase());

/**
 * Teilt einen Text in Sätze. Ein Satz endet auf . ! ? … (mit schliessenden Anführungszeichen oder Klammern), wenn danach
 * Leerraum und ein Grossbuchstabe, eine Ziffer, ein Anführungszeichen oder eine Klammer folgen. Kürzel («Dr.», «Nr.», «z. B.»,
 * «St. Gallen», «ca.»), Einzelbuchstaben und kleine Zahlen («am 5. Mai») beenden keinen Satz. Kleingeschriebene Fortsetzungen
 * teilen nicht (konservativ). Der Text bleibt Zeichen für Zeichen erhalten, nur der Leerraum zwischen den Sätzen fällt weg.
 */
export function splitSaetze(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]+["»”“’›')\]]*(?=\s+[A-ZÄÖÜ0-9«„"“‹(\[])/gu;
  let start = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (/^\.(?!\.)/.test(m[0])) {
      const wort = /([\p{L}\p{N}]+)$/u.exec(text.slice(start, at))?.[1] ?? "";
      if (keinSatzende(wort)) continue;
    }
    const end = at + m[0].length;
    out.push(text.slice(start, end).trim());
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Der erste Satz eines Textes (nach tidy), leer bei leerem Text. */
export const ersterSatz = (text: string): string => splitSaetze(tidy(text))[0] ?? "";

const upperFirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ---- Auswahlen -------------------------------------------------------------------------------------

export type Modus = "anfrage" | "referenz";
export const MODUS_LEGENDE = "Was brauchst du?";
export const MODI: { value: Modus; label: string }[] = [
  { value: "anfrage", label: "Ich möchte um ein Zitat bitten" },
  { value: "referenz", label: "Ich habe ein Zitat und baue die Referenz" },
];
export const isModus = (v: unknown): v is Modus => v === "anfrage" || v === "referenz";

export type Kanal = "whatsapp" | "email" | "gespraech";
export const KANAELE: { value: Kanal; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-Mail" },
  { value: "gespraech", label: "Im Gespräch" },
];
export const isKanal = (v: unknown): v is Kanal => v === "whatsapp" || v === "email" || v === "gespraech";
export const kanalLabel = (k: Kanal): string => KANAELE.find((x) => x.value === k)?.label ?? "WhatsApp";

export type Nennung = "vorname-ort" | "voller-name" | "name-firma" | "anonym";
/** Weg 1: Was fragst du die Person? */
export const FREIGABEN: { value: Nennung; label: string }[] = [
  { value: "vorname-ort", label: "Vorname und Ort" },
  { value: "voller-name", label: "Voller Name" },
  { value: "name-firma", label: "Name und Firma" },
  { value: "anonym", label: "Anonym (ohne Namen)" },
];
/** Weg 2: Wie wird die Person genannt? */
export const NENNUNGEN: { value: Nennung; label: string }[] = [
  { value: "vorname-ort", label: "Vorname und Ort" },
  { value: "voller-name", label: "Voller Name" },
  { value: "name-firma", label: "Name und Firma" },
  { value: "anonym", label: "Ohne Namen" },
];
export const isNennung = (v: unknown): v is Nennung => FREIGABEN.some((f) => f.value === v);
export const freigabeLabel = (n: Nennung): string => FREIGABEN.find((f) => f.value === n)?.label ?? "Vorname und Ort";

const FREIGABE_FRAGEN: Record<Nennung, Record<Anrede, string>> = {
  "vorname-ort": { du: "Darf ich dein Zitat mit Vorname und Ort zeigen?", sie: "Darf ich Ihr Zitat mit Vorname und Ort zeigen?" },
  "voller-name": { du: "Darf ich dein Zitat mit deinem vollen Namen zeigen?", sie: "Darf ich Ihr Zitat mit Ihrem vollen Namen zeigen?" },
  "name-firma": {
    du: "Darf ich dein Zitat mit deinem Namen und deiner Firma zeigen?",
    sie: "Darf ich Ihr Zitat mit Ihrem Namen und Ihrer Firma zeigen?",
  },
  anonym: { du: "Darf ich dein Zitat ohne Namen zeigen?", sie: "Darf ich Ihr Zitat ohne Namen zeigen?" },
};
export const freigabeFrage = (n: Nennung, a: Anrede): string => FREIGABE_FRAGEN[n][a];

export const ANREDEN: { value: Anrede; label: string }[] = [
  { value: "du", label: "Du" },
  { value: "sie", label: "Sie" },
];

// ---- Leitfragen ------------------------------------------------------------------------------------

export const FRAGE_MIN = 2;
export const FRAGE_MAX = 3;

export const FRAGEN = [
  { id: "lage", du: "Wie war die Lage, bevor wir angefangen haben?", sie: "Wie war die Lage, bevor wir angefangen haben?" },
  { id: "ueberzeugt", du: "Was hat dich überzeugt, uns zu beauftragen?", sie: "Was hat Sie überzeugt, uns zu beauftragen?" },
  { id: "veraendert", du: "Was hat sich für dich verändert?", sie: "Was hat sich für Sie verändert?" },
  { id: "zoegert", du: "Was würdest du jemandem sagen, der zögert?", sie: "Was würden Sie jemandem sagen, der zögert?" },
  { id: "weiterempfehlen", du: "Würdest du uns weiterempfehlen, und warum?", sie: "Würden Sie uns weiterempfehlen, und warum?" },
  { id: "ueberrascht", du: "Was hat dich überrascht?", sie: "Was hat Sie überrascht?" },
] as const;
export type FrageId = (typeof FRAGEN)[number]["id"];
export const DEFAULT_FRAGEN: readonly FrageId[] = ["lage", "ueberzeugt", "veraendert"];
export const frageId = (id: FrageId): string => `tb-frage-${id}`;
export const frageText = (id: FrageId, anrede: Anrede): string => FRAGEN.find((f) => f.id === id)?.[anrede] ?? "";

/** Nur bekannte Leitfragen, jede einmal, in der Reihenfolge der Liste (nicht der Auswahl). */
export function normalizeFragen(ids: readonly unknown[]): FrageId[] {
  const set = new Set(ids);
  return FRAGEN.filter((f) => set.has(f.id)).map((f) => f.id);
}

// ---- Prüfung ---------------------------------------------------------------------------------------

export type Problem = { id: string; message: string };

type TextRule = { label: string; leer: string; min: number; max: number; optional?: boolean; clean?: (s: string) => string };

function textProblem(id: string, raw: string, r: TextRule): Problem | null {
  const n = charCount((r.clean ?? tidy)(raw));
  if (n === 0) return r.optional ? null : { id, message: r.leer };
  if (n < r.min) return { id, message: `${r.label} ist zu kurz: mindestens ${r.min} Zeichen, du hast ${n}.` };
  if (n > r.max) return { id, message: `${r.label} ist zu lang: höchstens ${numberCH(r.max, 0)} Zeichen, du hast ${numberCH(n, 0)}.` };
  return null;
}

const compact = (list: (Problem | null)[]): Problem[] => list.filter((p): p is Problem => p !== null);

export type Typ = "kmu" | "verein";

/** Ohne Firma gibt es keine Unterschrift in der Nachricht und keinen Kopf in der Datei. */
export function basisProblem(firma: string, typ: Typ): Problem | null {
  return oneLine(firma) ? null : { id: FIELD.firma, message: `Gib den Namen deines ${typ === "verein" ? "Vereins" : "Betriebs"} an.` };
}

export type Anfrage = {
  /** Leer: aus dem Profil, sonst Du. */
  anrede: Anrede | "";
  kanal: Kanal;
  vorname: string;
  leistung: string;
  fragen: FrageId[];
  freigabe: Nennung;
};

export const EMPTY_ANFRAGE: Anfrage = {
  anrede: "",
  kanal: "whatsapp",
  vorname: "",
  leistung: "",
  fragen: [...DEFAULT_FRAGEN],
  freigabe: "vorname-ort",
};

/** Fehler der Angaben von Weg 1 (ohne Firma), in der Reihenfolge der Felder. */
export function anfrageProblems(a: Anfrage): Problem[] {
  const list: (Problem | null)[] = [
    textProblem(FIELD.vorname, a.vorname, {
      label: "Der Vorname",
      leer: "Gib den Vornamen der Person an.",
      ...LIMITS.vorname,
      clean: oneLine,
    }),
    textProblem(FIELD.leistung, a.leistung, {
      label: "«Was habt ihr zusammen gemacht?»",
      leer: "Schreib kurz, was ihr zusammen gemacht habt.",
      ...LIMITS.leistung,
    }),
  ];
  const n = normalizeFragen(a.fragen).length;
  if (n < FRAGE_MIN) list.push({ id: FIELD.fragen, message: "Wähle mindestens zwei Leitfragen." });
  else if (n > FRAGE_MAX) list.push({ id: FIELD.fragen, message: "Wähle höchstens drei Leitfragen." });
  return compact(list);
}

export function validateAnfrage(a: Anfrage, basis: { firma: string; typ: Typ }): Problem[] {
  return compact([basisProblem(basis.firma, basis.typ)]).concat(anfrageProblems(a));
}

export type Referenz = {
  zitat: string;
  /** Sätze des Zitats, die in der Kachel fehlen sollen (der Satz selbst, nicht seine Stelle). */
  ohne: string[];
  nennung: Nennung;
  name: string;
  ortFirma: string;
  funktion: string;
  gemacht: string;
  ausgangslage: string;
  getan: string;
  ergebnis: string;
};

export const EMPTY_REFERENZ: Referenz = {
  zitat: "",
  ohne: [],
  nennung: "vorname-ort",
  name: "",
  ortFirma: "",
  funktion: "",
  gemacht: "",
  ausgangslage: "",
  getan: "",
  ergebnis: "",
};

/** Braucht die Nennung einen Namen, einen Ort oder eine Firma? */
export const brauchtName = (n: Nennung): boolean => n !== "anonym";
export const brauchtOrtFirma = (n: Nennung): boolean => n === "vorname-ort" || n === "name-firma";

/** Fehler der Angaben von Weg 2 (ohne Firma), in der Reihenfolge der Felder. */
export function referenzProblems(r: Referenz): Problem[] {
  const list: (Problem | null)[] = [
    textProblem(FIELD.zitat, r.zitat, {
      label: "Das Zitat",
      leer: "Füge das Zitat der Kundschaft ein.",
      ...LIMITS.zitat,
      clean: cleanZitat,
    }),
  ];
  const auswahl = zitatAuswahl(r.zitat, r.ohne);
  if (auswahl.saetze.length > 0 && auswahl.gezeigt === 0) list.push({ id: FIELD.saetze, message: "Wähle mindestens einen Satz für die Kachel." });
  if (brauchtName(r.nennung)) {
    list.push(
      textProblem(FIELD.name, r.name, { label: "Der Name", leer: "Gib den Namen der Person an.", ...LIMITS.name, clean: oneLine }),
    );
  }
  if (brauchtOrtFirma(r.nennung)) {
    list.push(
      textProblem(FIELD.ortFirma, r.ortFirma, {
        label: r.nennung === "vorname-ort" ? "Der Ort" : "Die Firma",
        leer: r.nennung === "vorname-ort" ? "Gib den Ort der Person an." : "Gib die Firma der Person an.",
        ...LIMITS.ortFirma,
        clean: oneLine,
      }),
    );
  }
  if (brauchtName(r.nennung)) {
    list.push(
      textProblem(FIELD.funktion, r.funktion, { label: "«Funktion»", leer: "", min: 0, max: LIMITS.funktion.max, optional: true, clean: oneLine }),
    );
  }
  list.push(
    textProblem(FIELD.gemacht, r.gemacht, { label: "«Was habt ihr gemacht?»", leer: "Schreib kurz, was ihr gemacht habt.", ...LIMITS.gemacht }),
    textProblem(FIELD.ausgangslage, r.ausgangslage, { label: "«Ausgangslage»", leer: "Beschreib die Ausgangslage.", ...LIMITS.text }),
    textProblem(FIELD.getan, r.getan, { label: "«Was habt ihr getan?»", leer: "Beschreib, was ihr getan habt.", ...LIMITS.text }),
    textProblem(FIELD.ergebnis, r.ergebnis, { label: "«Ergebnis»", leer: "", ...LIMITS.text, optional: true }),
  );
  return compact(list);
}

export function validateReferenz(r: Referenz, basis: { firma: string; typ: Typ }): Problem[] {
  return compact([basisProblem(basis.firma, basis.typ)]).concat(referenzProblems(r));
}

// ---- Weg 1: Nachrichten ----------------------------------------------------------------------------

export type AnfrageInput = Omit<Anfrage, "anrede"> & { anrede: Anrede; firma: string };

export type FassungId = "kurz" | "persoenlich" | "foermlich";
export type Fassung = {
  id: FassungId;
  label: string;
  copyLabel: string;
  text: string;
  zeichen: number;
  /** Passt zu dem Weg, den die Person gewählt hat (WhatsApp: Kurz, E-Mail: Persönlich). */
  passend: boolean;
};

export type Leitfaden = { einstieg: string; fragen: string[]; schluss: string };

export type AnfrageErgebnis = {
  anrede: Anrede;
  kanal: Kanal;
  freigabeFrage: string;
  fragen: string[];
  /** Leer bei «Im Gespräch». */
  fassungen: Fassung[];
  /** Nur bei «Im Gespräch». */
  leitfaden: Leitfaden | null;
  nachfass: string;
  hinweise: string[];
};

export const TIPP =
  "Ein Zitat entsteht eher, wenn du Fragen stellst, die man mit zwei Sätzen beantworten kann. Darum sind die Leitfragen kurz gehalten.";
export const WORTLAUT = "Zeig die Worte so, wie die Person sie schreibt. Kürze nur ganze Sätze und sprich das mit ihr ab.";
export const GESPRAECH_HINWEIS = "Schreib die Antworten wörtlich mit und lies sie am Ende vor. Erst danach fragst du, ob du sie zeigen darfst.";
export const WO_ZEIGEN =
  "Nenn der Person, wo du das Zitat zeigst, zum Beispiel auf der Website oder auf Social Media. So weiss sie, wofür sie zustimmt.";
export const NACHFASSEN = `Fass nach etwa einer Woche nach, ruhig und mit einem Satz (${RICHTWERT_NOTE}).`;

const numbered = (fragen: readonly string[]): string => fragen.map((f, i) => `${i + 1}. ${f}`).join("\n");

const fragenWort = (n: number): string => (n === 1 ? "eine Frage" : n === 2 ? "zwei Fragen" : n === 3 ? "drei Fragen" : `${n} Fragen`);

type Ctx = { du: boolean; n: string; l: string; firma: string; fragen: string[]; fq: string };

function textKurz(c: Ctx): string {
  const liste = numbered(c.fragen);
  return c.du
    ? `Hallo ${c.n}\nDanke für ${c.l}. Magst du mir in zwei, drei Sätzen schreiben, wie es für dich war? Diese Fragen helfen dir:\n${liste}\n${c.fq}\nGrüsse, ${c.firma}`
    : `Guten Tag ${c.n}\nDanke für ${c.l}. Mögen Sie mir in zwei, drei Sätzen schreiben, wie es für Sie war? Diese Fragen helfen Ihnen:\n${liste}\n${c.fq}\nFreundliche Grüsse, ${c.firma}`;
}

function textPersoenlich(c: Ctx): string {
  const liste = numbered(c.fragen);
  return c.du
    ? `Betreff: Darf ich dich um ein Zitat bitten?\n\nHallo ${c.n}\n\nDanke für ${c.l}. Ich hoffe, alles ist so, wie du es dir vorgestellt hast.\n\nMagst du mir in zwei, drei Sätzen schreiben, wie es für dich war? Ich würde deine Worte gern anderen zeigen, so wie du sie schreibst. Diese Fragen können dir helfen:\n\n${liste}\n\n${c.fq}\n\nWenn es gerade nicht passt, ist das in Ordnung.\n\nHerzliche Grüsse\n${c.firma}`
    : `Betreff: Darf ich Sie um ein Zitat bitten?\n\nGuten Tag ${c.n}\n\nDanke für ${c.l}. Ich hoffe, alles ist so, wie Sie es sich vorgestellt haben.\n\nMögen Sie mir in zwei, drei Sätzen schreiben, wie es für Sie war? Ich würde Ihre Worte gern anderen zeigen, so wie Sie sie schreiben. Diese Fragen können Ihnen helfen:\n\n${liste}\n\n${c.fq}\n\nWenn es gerade nicht passt, ist das in Ordnung.\n\nHerzliche Grüsse\n${c.firma}`;
}

function textFoermlich(c: Ctx): string {
  const liste = numbered(c.fragen);
  return c.du
    ? `Betreff: Bitte um ein Zitat\n\nGuten Tag ${c.n}\n\nVielen Dank für ${c.l}.\n\nIch möchte zeigen, wie andere uns erleben, und bitte dich um ein kurzes Zitat. Zwei, drei Sätze genügen. Diese Fragen können dir als Anhaltspunkt dienen:\n\n${liste}\n\n${c.fq}\n\nDeine Antwort ist freiwillig. Dein Zitat zeige ich nur, wenn du zustimmst, und so, wie du es schreibst.\n\nFreundliche Grüsse\n${c.firma}`
    : `Betreff: Bitte um ein Zitat\n\nGuten Tag ${c.n}\n\nVielen Dank für ${c.l}.\n\nIch möchte zeigen, wie andere uns erleben, und bitte Sie um ein kurzes Zitat. Zwei, drei Sätze genügen. Diese Fragen können Ihnen als Anhaltspunkt dienen:\n\n${liste}\n\n${c.fq}\n\nIhre Antwort ist freiwillig. Ihr Zitat zeige ich nur, wenn Sie zustimmen, und so, wie Sie es schreiben.\n\nFreundliche Grüsse\n${c.firma}`;
}

function leitfadenOf(c: Ctx): Leitfaden {
  const wort = fragenWort(c.fragen.length);
  return c.du
    ? {
        einstieg: `Hallo ${c.n}. Danke noch einmal für ${c.l}. Hast du kurz Zeit? Ich würde dir gern ${wort} stellen und deine Antworten wörtlich mitschreiben.`,
        fragen: c.fragen,
        schluss: `Danke. Ich lese dir vor, was ich notiert habe. ${c.fq}`,
      }
    : {
        einstieg: `Guten Tag ${c.n}. Danke noch einmal für ${c.l}. Haben Sie kurz Zeit? Ich würde Ihnen gern ${wort} stellen und Ihre Antworten wörtlich mitschreiben.`,
        fragen: c.fragen,
        schluss: `Danke. Ich lese Ihnen vor, was ich notiert habe. ${c.fq}`,
      };
}

function nachfassSatz(du: boolean, n: string): string {
  return du
    ? `Hallo ${n}, ich wollte kurz nachfragen, ob du Zeit für die Fragen gefunden hast. Falls es gerade nicht passt, ist das in Ordnung.`
    : `Guten Tag ${n}, ich wollte kurz nachfragen, ob Sie Zeit für die Fragen gefunden haben. Falls es gerade nicht passt, ist das in Ordnung.`;
}

/** Baut die Nachricht in drei Fassungen oder, bei «Im Gespräch», den Gesprächsleitfaden. Ohne Zufall: gleiche Angaben, gleicher Text. */
export function buildAnfrage(input: AnfrageInput): AnfrageErgebnis {
  const anrede = input.anrede;
  const du = anrede === "du";
  const ids = normalizeFragen(input.fragen);
  const fragen = ids.map((id) => frageText(id, anrede));
  const fq = freigabeFrage(isNennung(input.freigabe) ? input.freigabe : "vorname-ort", anrede);
  const kanal = isKanal(input.kanal) ? input.kanal : "whatsapp";
  const ctx: Ctx = {
    du,
    n: oneLine(input.vorname) || "[Vorname]",
    l: ohneSchluss(tidy(input.leistung)) || "[Auftrag]",
    firma: oneLine(input.firma) || "[Firma]",
    fragen,
    fq,
  };
  const alle: Record<FassungId, Omit<Fassung, "zeichen" | "passend">> = {
    kurz: { id: "kurz", label: "Kurz, für WhatsApp", copyLabel: "Kurze Fassung kopieren", text: textKurz(ctx) },
    persoenlich: { id: "persoenlich", label: "Persönlich, für E-Mail", copyLabel: "Persönliche Fassung kopieren", text: textPersoenlich(ctx) },
    foermlich: { id: "foermlich", label: "Förmlich", copyLabel: "Förmliche Fassung kopieren", text: textFoermlich(ctx) },
  };
  const order: FassungId[] = kanal === "email" ? ["persoenlich", "kurz", "foermlich"] : ["kurz", "persoenlich", "foermlich"];
  const passt: FassungId | null = kanal === "whatsapp" ? "kurz" : kanal === "email" ? "persoenlich" : null;
  const fassungen: Fassung[] =
    kanal === "gespraech"
      ? []
      : order.map((id) => ({ ...alle[id], zeichen: charCount(alle[id].text), passend: id === passt }));
  return {
    anrede,
    kanal,
    freigabeFrage: fq,
    fragen,
    fassungen,
    leitfaden: kanal === "gespraech" ? leitfadenOf(ctx) : null,
    nachfass: nachfassSatz(du, ctx.n),
    hinweise: [TIPP, kanal === "gespraech" ? GESPRAECH_HINWEIS : WORTLAUT, WO_ZEIGEN, NACHFASSEN],
  };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ersetzt den Vornamen der Person im Text durch «[Vorname]». Nur ganze Wörter, ohne Rücksicht auf Gross und Klein. */
export function anonymisiere(text: string, vorname: string): string {
  const v = oneLine(vorname);
  if (!v) return text;
  return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(v)}(?![\\p{L}\\p{N}])`, "giu"), "[Vorname]");
}

/** Der Gesprächsleitfaden als Text zum Kopieren: Einstieg, nummerierte Leitfragen, Schluss. */
export const leitfadenText = (l: Leitfaden): string => `${l.einstieg}\n\n${numbered(l.fragen)}\n\n${l.schluss}`;

/** Markdown der Nachricht fürs CRM. */
export function anfrageMarkdown(res: AnfrageErgebnis): string {
  const parts: string[] = [];
  if (res.leitfaden) {
    parts.push(`## Gesprächsleitfaden\n${leitfadenText(res.leitfaden)}`);
  } else {
    for (const f of res.fassungen) parts.push(`## ${f.label}\n${f.text}`);
  }
  parts.push(`## Nachfassen\n${res.nachfass}`);
  return parts.join("\n\n");
}

/** Die Angaben von Weg 1 fürs CRM, eine je Zeile. Der Vorname der Person geht nie mit (Daten Dritter): nur «Vorname: ja». */
export function eingabeAnfrage(input: AnfrageInput): string {
  const ids = normalizeFragen(input.fragen);
  const leistung = anonymisiere(tidy(input.leistung), input.vorname);
  return [
    "Weg: Zitat anfragen",
    `Anrede: ${anredeLabel(input.anrede)}`,
    `Kanal: ${kanalLabel(input.kanal)}`,
    `Vorname: ${oneLine(input.vorname) ? "ja" : "nein"}`,
    `Was ihr zusammen gemacht habt: ${leistung || "keine Angabe"}`,
    `Leitfragen: ${ids.map((id) => frageText(id, "du")).join(" | ") || "keine"}`,
    `Freigabe: ${freigabeLabel(input.freigabe)}`,
  ].join("\n");
}

/** Das Ergebnis von Weg 1 fürs CRM. Statt des Vornamens steht «[Vorname]». */
export function ausgabeAnfrage(input: AnfrageInput): string {
  const res = buildAnfrage({ ...input, vorname: "[Vorname]", leistung: anonymisiere(input.leistung, input.vorname) });
  return anfrageMarkdown(res);
}

// ---- Weg 2: Zitat ----------------------------------------------------------------------------------

const WRAPS: [string, string][] = [
  ["«", "»"],
  ["„", "“"],
  ["“", "”"],
  ['"', '"'],
  ["‹", "›"],
];

/** Umschliessen Anführungszeichen den ganzen Text (und kommen sie sonst nirgends vor), fallen sie weg. */
function stripWrapping(t: string): string {
  for (const [open, close] of WRAPS) {
    if (t.length < 2 || !t.startsWith(open) || !t.endsWith(close)) continue;
    const inner = t.slice(open.length, t.length - close.length);
    if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
  }
  return t;
}

/** Das Zitat der Kundschaft: Leerraum zu einem Leerzeichen, äussere Anführungszeichen weg, sonst nichts. Kein typoCH, kein ß. */
export function cleanZitat(raw: string): string {
  return stripWrapping(oneLine(raw));
}

/** Die Sätze des Zitats. Kürzel, Einzelbuchstaben und kleine Zahlen beenden keinen Satz (splitSaetze). */
export const zitatSaetze = (raw: string): string[] => splitSaetze(cleanZitat(raw));

/** Innere Anführungszeichen zu ‹ ›, weil das Zitat selbst in « » steht. Unpaarige Zeichen bleiben stehen. */
export function innerQuotes(t: string): string {
  return t
    .replace(/[«‹]/g, "‹")
    .replace(/[»›]/g, "›")
    .replace(/„([^“”„]*)[“”]/g, "‹$1›")
    .replace(/“([^“”]*)”/g, "‹$1›")
    .replace(/"([^"]*)"/g, "‹$1›");
}

export type ZitatAuswahl = {
  saetze: string[];
  /** Je Satz: in der Kachel gezeigt? */
  gewaehlt: boolean[];
  gezeigt: number;
  /** Der gezeigte Text mit «[…]» zwischen nicht benachbarten Sätzen, ohne äussere « ». */
  text: string;
  /** Die gezeigten Sätze ohne «[…]», für die Länge. */
  plain: string;
  /** Mindestens ein Satz fehlt (auch am Anfang oder Ende). */
  gekuerzt: boolean;
};

/** Wählt Sätze des Zitats. Kürzen geht nur über ganze Sätze; «[…]» steht nur zwischen zwei gezeigten, nicht benachbarten Sätzen. */
export function zitatAuswahl(raw: string, ohne: readonly string[]): ZitatAuswahl {
  const saetze = zitatSaetze(raw);
  const weg = new Set(ohne);
  const gewaehlt = saetze.map((s) => !weg.has(s));
  const teile: string[] = [];
  let letzter = -1;
  saetze.forEach((s, i) => {
    if (!gewaehlt[i]) return;
    if (letzter >= 0 && i - letzter > 1) teile.push(LUECKE);
    teile.push(s);
    letzter = i;
  });
  const gezeigt = gewaehlt.filter(Boolean).length;
  return {
    saetze,
    gewaehlt,
    gezeigt,
    text: innerQuotes(teile.join(" ")),
    plain: saetze.filter((_, i) => gewaehlt[i]).join(" "),
    gekuerzt: gezeigt < saetze.length,
  };
}

/** Wie das Zitat in der Länge wirkt: nach dem gezeigten Text. */
export function zitatLaenge(auswahl: Pick<ZitatAuswahl, "plain">): "sehr-kurz" | "ok" | "lang" {
  const n = charCount(auswahl.plain);
  if (n === 0) return "ok";
  if (n < ZITAT_SEHR_KURZ) return "sehr-kurz";
  return n > ZITAT_LANG ? "lang" : "ok";
}

// ---- Weg 2: Bausteine ------------------------------------------------------------------------------

export type ReferenzInput = Referenz & { firma: string };

/** Die Nennung unter dem Zitat: «Anna, Gossau», «Anna Keller», «Anna Keller, Keller AG» oder bei «Ohne Namen» eine Kundin oder ein Kunde. */
export function quelle(r: Pick<Referenz, "nennung" | "name" | "ortFirma" | "funktion">): string {
  if (r.nennung === "anonym") return ANONYM_QUELLE;
  const teile = [oneLine(r.name) || "[Name]", oneLine(r.funktion)];
  if (brauchtOrtFirma(r.nennung)) teile.push(oneLine(r.ortFirma));
  return teile.filter(Boolean).join(", ");
}

/** Wer im Titel der Fallstudie steht. */
export function kundeImTitel(r: Pick<Referenz, "nennung" | "name" | "ortFirma">): string {
  const name = oneLine(r.name);
  const ortFirma = oneLine(r.ortFirma);
  switch (r.nennung) {
    case "anonym":
      return "unsere Kundschaft";
    case "vorname-ort":
      return ortFirma ? `${name} aus ${ortFirma}` : name || "[Name]";
    case "voller-name":
      return name || "[Name]";
    case "name-firma":
      return ortFirma || name || "[Firma]";
  }
}

export type Kachel = { zitat: string; quelle: string; text: string };

export function kachelOf(r: Referenz): Kachel {
  const zitat = `«${zitatAuswahl(r.zitat, r.ohne).text}»`;
  const q = quelle(r);
  return { zitat, quelle: q, text: `${zitat}\n${q}` };
}

/** Die Kurz-Referenz: je Angabe der erste Satz (Ausgangslage, Getan, Ergebnis), in den Wörtern der Person. Ohne Ergebnis zwei Sätze. */
export function kurzReferenz(r: Pick<Referenz, "ausgangslage" | "getan" | "ergebnis">): string[] {
  return [r.ausgangslage, r.getan, r.ergebnis]
    .map((t) => satzForm(ersterSatz(t)))
    .filter(Boolean);
}

/** Der Dank unter dem Beitrag, nur wenn ein Name gezeigt wird. */
export function dankSatz(r: Pick<Referenz, "nennung" | "name">): string {
  const name = oneLine(r.name);
  return r.nennung === "anonym" || !name ? "" : `Danke an ${name} für das Vertrauen.`;
}

/** Der Hook: der erste gezeigte Satz des Zitats in « », leer, wenn kein Satz gezeigt wird. */
export function hookOf(r: Pick<Referenz, "zitat" | "ohne">): string {
  const a = zitatAuswahl(r.zitat, r.ohne);
  const i = a.gewaehlt.indexOf(true);
  return i < 0 ? "" : `«${innerQuotes(a.saetze[i])}»`;
}

export type Beitraege = { linkedin: string; instagram: string };

/** LinkedIn: Hook, Kurz-Referenz, Dank. Instagram (kürzer): Hook, Sätze zu «Was getan» und «Ergebnis», Dank. Keine Hashtags. */
export function beitraegeOf(r: Referenz): Beitraege {
  const hook = hookOf(r);
  const kurz = kurzReferenz(r);
  const dank = dankSatz(r);
  const join = (...teile: string[]) => teile.filter(Boolean).join("\n\n");
  return {
    linkedin: join(hook, kurz.join(" "), dank),
    instagram: join(hook, kurz.slice(1).join(" "), dank),
  };
}

const ABSCHNITT_AUSGANG = "Ausgangslage";
const ABSCHNITT_AUFGABE = "Aufgabe";
const ABSCHNITT_VORGEHEN = "Vorgehen";
const ABSCHNITT_ERGEBNIS = "Ergebnis";
const ABSCHNITT_WORTLAUT = "Das Zitat im Wortlaut";

/** Die Fallstudie als Dokument: Titel, Zitat, Ausgangslage, Aufgabe, Vorgehen, Ergebnis, am Ende das ganze Zitat. */
export function fallstudieOf(r: ReferenzInput): DocumentModel {
  const firma = oneLine(r.firma) || undefined;
  const q = quelle(r);
  const para = (text: string): DocBlock => ({ type: "paragraph", text });
  const heading = (text: string): DocBlock => ({ type: "heading", level: 1, text });
  const ganz = innerQuotes(cleanZitat(r.zitat));
  const blocks: DocBlock[] = [
    para(kachelOf(r).zitat),
    para(q),
    heading(ABSCHNITT_AUSGANG),
    para(satzForm(r.ausgangslage)),
    heading(ABSCHNITT_AUFGABE),
    para(upperFirst(tidy(r.gemacht))),
    heading(ABSCHNITT_VORGEHEN),
    para(satzForm(r.getan)),
  ];
  const ergebnis = satzForm(r.ergebnis);
  if (ergebnis) blocks.push(heading(ABSCHNITT_ERGEBNIS), para(ergebnis));
  blocks.push(heading(ABSCHNITT_WORTLAUT), para(`«${ganz}»`), para(q));
  return {
    title: `${upperFirst(ohneSchluss(tidy(r.gemacht)))} für ${kundeImTitel(r)}`,
    subtitle: "Fallstudie",
    firma,
    filename: `fallstudie-${safeFilename(r.gemacht, "referenz")}`,
    blocks,
  };
}

export const PRUEF_SCHLUSS = "Bei Zweifeln frag eine Fachperson.";

/** Die Prüfliste vor der Veröffentlichung: nur Fragen, keine Rechtsaussagen. */
export function pruefliste(r: Pick<Referenz, "nennung" | "ergebnis">): string[] {
  const out = [
    r.nennung === "anonym"
      ? "Hat die Person zugestimmt, dass das Zitat ohne Namen erscheint, und verrät der Rest des Textes nicht trotzdem, wer sie ist?"
      : "Hat die Person der Veröffentlichung von Name, Foto und Firma zugestimmt?",
    "Steht das Zitat wörtlich da, oder hast du die Kürzung mit der Person abgestimmt?",
    "Ist das Ergebnis ohne Übertreibung formuliert, und kannst du es belegen?",
    "Passt das Foto, falls du eines verwendest, zum Zitat und zur Person?",
    "Habt ihr abgemacht, bis wann du das Zitat auf Wunsch der Person wieder entfernst?",
  ];
  if (!tidy(r.ergebnis)) {
    out.push(
      "Kannst du noch ein Ergebnis ergänzen? Ein Satz mit einer Zahl oder einer Beobachtung, die du belegen kannst, macht die Referenz glaubwürdiger.",
    );
  }
  return out;
}

export const GEKUERZT_HINWEIS = "Du zeigst nur einen Teil des Zitats. Sprich die Kürzung mit der Person ab.";
export const VOLLTEXT_HINWEIS = "Die Fallstudie zeigt am Ende das ganze Zitat. Streich dort Sätze von Hand, wenn sie nicht erscheinen sollen.";
export const SEHR_KURZ_HINWEIS = `Das Zitat ist sehr kurz. Frag nach, warum die Person so denkt: Ein zweiter Satz macht es greifbar (${RICHTWERT_NOTE}).`;
export const LANG_HINWEIS = `Das Zitat ist lang. Kurze Zitate wirken am besten: Wähle die stärksten Sätze (${RICHTWERT_NOTE}).`;
export const ERSTER_SATZ_HINWEIS = "Die Kurz-Referenz nimmt je Angabe nur den ersten Satz. Die Fallstudie enthält alles.";
export const NAME_HINWEIS = "Du hast «Vorname und Ort» gewählt, im Feld «Name» steht aber mehr als ein Wort. Zeigst du wirklich nur den Vornamen?";

type Eigentext = { label: string; text: string };

/** Floskeln aus data/floskeln.json (über den Textcheck), nur in den Eigentexten der Person. */
export function floskelHinweise(felder: readonly Eigentext[]): string[] {
  const out: string[] = [];
  for (const f of felder) {
    const text = tidy(f.text);
    if (!text) continue;
    for (const fund of findingsOf(text)) {
      if (fund.kind !== "floskel") continue;
      const e = fund.examples[0];
      const treffer = e ? oneLine(text.slice(e.start, e.end)) : fund.title;
      out.push(`In «${f.label}» steht «${treffer}», eine Floskel${fund.count > 1 ? ` (${fund.count} Mal)` : ""}. ${fund.hint}`);
    }
  }
  return out;
}

/** Hinweise zur Referenz. Floskeln nur in Ausgangslage, Getan und Ergebnis; das Zitat der Kundschaft prüft das Werkzeug nicht. */
export function hinweiseReferenz(r: Referenz): string[] {
  const a = zitatAuswahl(r.zitat, r.ohne);
  const out: string[] = [];
  if (a.gekuerzt) out.push(GEKUERZT_HINWEIS, VOLLTEXT_HINWEIS);
  const laenge = zitatLaenge(a);
  if (laenge === "sehr-kurz") out.push(SEHR_KURZ_HINWEIS);
  if (laenge === "lang") out.push(LANG_HINWEIS);
  if ([r.ausgangslage, r.getan, r.ergebnis].some((t) => splitSaetze(tidy(t)).length > 1)) out.push(ERSTER_SATZ_HINWEIS);
  if (r.nennung === "vorname-ort" && oneLine(r.name).includes(" ")) out.push(NAME_HINWEIS);
  out.push(
    ...floskelHinweise([
      { label: "Ausgangslage", text: r.ausgangslage },
      { label: "Was habt ihr getan?", text: r.getan },
      { label: "Ergebnis", text: r.ergebnis },
    ]),
  );
  return out;
}

export type ReferenzErgebnis = {
  auswahl: ZitatAuswahl;
  kachel: Kachel;
  kurz: string[];
  linkedin: string;
  instagram: string;
  dokument: DocumentModel;
  pruefliste: string[];
  hinweise: string[];
};

export function buildReferenz(input: ReferenzInput): ReferenzErgebnis {
  const beitraege = beitraegeOf(input);
  return {
    auswahl: zitatAuswahl(input.zitat, input.ohne),
    kachel: kachelOf(input),
    kurz: kurzReferenz(input),
    linkedin: beitraege.linkedin,
    instagram: beitraege.instagram,
    dokument: fallstudieOf(input),
    pruefliste: pruefliste(input),
    hinweise: hinweiseReferenz(input),
  };
}

/** Counter wie beim Story-Post: Zeichen und Zeichen vor der Faltkante. */
export const beitragZaehler = (platform: "linkedin" | "instagram", text: string): string => counterLabel(platform, text);

/** Die Angaben von Weg 2 fürs CRM. Das Zitat steht nur als «Zitat der Kundschaft»; der Name nur, wenn er im Ergebnis gezeigt wird. */
export function eingabeReferenz(r: Referenz): string {
  const a = zitatAuswahl(r.zitat, r.ohne);
  const lines = [
    "Weg: Referenz bauen",
    `Zitat der Kundschaft: ${cleanZitat(r.zitat)}`,
    `Gezeigte Sätze: ${a.gezeigt} von ${a.saetze.length}`,
    `Nennung: ${NENNUNGEN.find((n) => n.value === r.nennung)?.label ?? "Vorname und Ort"}`,
  ];
  if (r.nennung !== "anonym") lines.push(`Genannt wird: ${quelle(r)}`);
  lines.push(
    `Was ihr gemacht habt: ${tidy(r.gemacht)}`,
    `Ausgangslage: ${tidy(r.ausgangslage)}`,
    `Was ihr getan habt: ${tidy(r.getan)}`,
    `Ergebnis: ${tidy(r.ergebnis) || "keine Angabe"}`,
  );
  return lines.join("\n");
}

/** Das Ergebnis von Weg 2 als Markdown: Kachel, Kurz-Referenz, Beiträge, Fallstudie. */
export function referenzMarkdown(res: ReferenzErgebnis): string {
  return [
    `## Zitat-Kachel\n${res.kachel.text}`,
    `## Kurz-Referenz\n${res.kurz.join(" ")}`,
    `## Beitrag für LinkedIn\n${res.linkedin}`,
    `## Beitrag für Instagram\n${res.instagram}`,
    `## Fallstudie\n${toMarkdown(res.dokument)}`,
  ].join("\n\n");
}

export const ausgabeReferenz = (input: ReferenzInput): string => referenzMarkdown(buildReferenz(input));

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

/** Momentaufnahme dessen, was ins CRM ging (angezeigt wird immer das aus den Angaben berechnete Ergebnis). */
export type Output = { ausgabe: string };

export type TestimonialState = {
  v: 1;
  modus: Modus;
  phase: "edit" | "result";
  anfrage: Anfrage;
  referenz: Referenz;
  output?: Output;
};

export const EMPTY_STATE: TestimonialState = { v: 1, modus: "anfrage", phase: "edit", anfrage: EMPTY_ANFRAGE, referenz: EMPTY_REFERENZ };

const MAX_OHNE = 60;

export function parseAnfrage(raw: unknown): Anfrage {
  if (!isRecord(raw)) return EMPTY_ANFRAGE;
  return {
    anrede: isAnrede(raw.anrede) ? raw.anrede : "",
    kanal: isKanal(raw.kanal) ? raw.kanal : "whatsapp",
    vorname: clamp(str(raw.vorname), LIMITS.vorname.max),
    leistung: clamp(str(raw.leistung), LIMITS.leistung.max),
    fragen: Array.isArray(raw.fragen) ? normalizeFragen(raw.fragen) : [...DEFAULT_FRAGEN],
    freigabe: isNennung(raw.freigabe) ? raw.freigabe : "vorname-ort",
  };
}

export function parseReferenz(raw: unknown): Referenz {
  if (!isRecord(raw)) return EMPTY_REFERENZ;
  const ohne = Array.isArray(raw.ohne)
    ? raw.ohne.filter((s): s is string => typeof s === "string").slice(0, MAX_OHNE).map((s) => clamp(s, LIMITS.zitat.max))
    : [];
  return {
    zitat: clamp(str(raw.zitat), LIMITS.zitat.max),
    ohne,
    nennung: isNennung(raw.nennung) ? raw.nennung : "vorname-ort",
    name: clamp(str(raw.name), LIMITS.name.max),
    ortFirma: clamp(str(raw.ortFirma), LIMITS.ortFirma.max),
    funktion: clamp(str(raw.funktion), LIMITS.funktion.max),
    gemacht: clamp(str(raw.gemacht), LIMITS.gemacht.max),
    ausgangslage: clamp(str(raw.ausgangslage), LIMITS.text.max),
    getan: clamp(str(raw.getan), LIMITS.text.max),
    ergebnis: clamp(str(raw.ergebnis), LIMITS.text.max),
  };
}

/**
 * Liest den gespeicherten Stand; kaputte Daten und fremde Versionen ergeben den leeren Stand. «result» gilt nur, wenn die
 * Angaben des gewählten Wegs die Prüfung bestehen (sonst «edit»). lib/progress.ts erkennt `phase: "result"` als erledigt.
 */
export function parseState(raw: unknown): TestimonialState {
  if (!isRecord(raw) || raw.v !== 1) return EMPTY_STATE;
  const modus: Modus = isModus(raw.modus) ? raw.modus : "anfrage";
  const anfrage = parseAnfrage(raw.anfrage);
  const referenz = parseReferenz(raw.referenz);
  const complete = modus === "anfrage" ? anfrageProblems(anfrage).length === 0 : referenzProblems(referenz).length === 0;
  const phase = raw.phase === "result" && complete ? "result" : "edit";
  const o = raw.output;
  const output: Output | undefined = phase === "result" && isRecord(o) && typeof o.ausgabe === "string" ? { ausgabe: clamp(o.ausgabe, 12_000) } : undefined;
  return { v: 1, modus, phase, anfrage, referenz, ...(output ? { output } : {}) };
}
