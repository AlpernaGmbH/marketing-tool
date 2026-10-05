import { z } from "zod";
import verzeichnisseJson from "@/data/verzeichnisse.json";
import { KANTONE, dateCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocumentModel } from "@/lib/export/model";
import { PHONE_ERROR_LENGTH, normalizePhone, phoneProblem } from "@/tools/whatsapp-link/logic";

// Verzeichnis-Check: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Aus den Stammdaten entsteht der einheitliche Eintrag (Name, Adresse, Telefon), aus dem Status je Verzeichnis eine
// Aufgabenliste und aus den eingefügten Einträgen die Abweichungen zur Schreibweise. Das Werkzeug ruft keine Verzeichnisse
// ab; die Liste der Verzeichnisse ist ein Datensatz mit Quelle (data/verzeichnisse.json). Spec: specs/verzeichnisse.md

export const SLUG = "verzeichnisse";

// ---- Grenzen und Meldungen ---------------------------------------------------------------------

export const LIMITS = {
  strasse: { min: 3, max: 80 },
  oeffnungszeiten: 200,
  beschreibung: 300,
  fundName: 160,
  fundAdresse: 200,
  fundTelefon: 40,
  anderesName: 80,
  ort: 80,
  firma: 200,
} as const;

export const MSG = {
  firma: "Trag oben die Firma ein.",
  firmaVerein: "Trag oben den Namen des Vereins ein.",
  ort: "Trag oben den Ort ein.",
  website: "Die Website sieht nicht nach einer Adresse aus. Ein Beispiel: malerei-keller.ch",
  strasse: `Gib Strasse und Nummer an, zum Beispiel Bahnhofstrasse 12 (${LIMITS.strasse.min} bis ${LIMITS.strasse.max} Zeichen).`,
  plz: "Gib eine Schweizer PLZ mit vier Ziffern an, zum Beispiel 9200.",
  telefonLeer: "Trag die Telefonnummer ein, zum Beispiel 071 123 45 67.",
  telefonCH: "Gib eine Schweizer Nummer an, zum Beispiel 071 123 45 67.",
  telefonLaenge: "Diese Nummer hat zu viele oder zu wenige Stellen.",
  oeffnungszeiten: `Die Öffnungszeiten sind zu lang (höchstens ${LIMITS.oeffnungszeiten} Zeichen).`,
  beschreibung: `Die Kurzbeschreibung ist zu lang (höchstens ${LIMITS.beschreibung} Zeichen).`,
} as const;

export const KOSTEN_JA = "Laut Anbieter kostenlos.";
export const KOSTEN_NEIN = "Laut Anbieter kostenpflichtig.";
export const KOSTEN_UNKLAR = "Prüfe die Bedingungen auf der Seite des Anbieters.";
export const RICHTWERT_NOTE = "Die Reihenfolge ist ein Richtwert von Alperna, keine Statistik.";
export const KEIN_ABRUF_NOTE = "Der Check ruft keine Verzeichnisse ab. Er vergleicht nur, was du selbst angegeben oder eingefügt hast.";
export const BEDINGUNGEN_NOTE =
  "Angebote und Bedingungen der Verzeichnisse ändern sich. Prüfe sie auf der Seite des Anbieters, bevor du dich einträgst.";
export const ZUSATZ_BRANCHE = "falls es zu deiner Branche passt";
export const KEINE_LISTE_NOTE = "Die Liste der Verzeichnisse ist gerade nicht lesbar. Du kannst die freien Plätze trotzdem nutzen.";
export const BESCHREIBUNG_HINWEIS = "Die Plattformen haben eigene Grenzen für die Länge. Kürze den Text dort, falls nötig.";

// ---- Datensatz data/verzeichnisse.json ---------------------------------------------------------

export const TYPEN = ["karte", "telefonbuch", "bewertung", "branche", "gemeinde"] as const;
export type Typ = (typeof TYPEN)[number];
/** Reihenfolge der Typen (Richtwert von Alperna, keine Statistik). Bei Gastgewerbe steht «bewertung» vorn. */
export const TYP_ORDER: readonly Typ[] = ["karte", "telefonbuch", "bewertung", "branche", "gemeinde"];

const httpsUrl = z.string().url().startsWith("https://");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), "kein gültiges Datum");

export const eintragSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(2).max(80),
  typ: z.enum(TYPEN),
  /** Nur bei «bewertung»: für welche Betriebe das Verzeichnis gedacht ist (Anzeige). */
  branchen: z.array(z.string().min(2)).min(1).optional(),
  url: httpsUrl,
  eintragUrl: httpsUrl.nullable().optional(),
  kostenlos: z.boolean().nullable(),
  bestaetigung: z.string().min(10).max(300).nullable(),
  hinweis: z.string().min(10).max(300),
  quelle: httpsUrl,
  quelleBestaetigung: httpsUrl.optional(),
  geprueft: isoDate,
});
export type Eintragsdatensatz = z.infer<typeof eintragSchema>;

export const dataSchema = z
  .object({
    meta: z.object({ source: z.string().min(10), url: httpsUrl, asOf: isoDate, note: z.string().optional() }),
    eintraege: z.array(eintragSchema).min(1),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    for (const e of d.eintraege) {
      if (seen.has(e.id)) ctx.addIssue({ code: "custom", message: `id doppelt: ${e.id}` });
      seen.add(e.id);
      if (e.typ === "bewertung" && !e.branchen) ctx.addIssue({ code: "custom", message: `${e.id}: «bewertung» braucht «branchen»` });
    }
  });
export type VzData = z.infer<typeof dataSchema>;

/** Liest den Datensatz defensiv. null, wenn er das Schema verletzt (das Werkzeug sagt das dann und nutzt nur die freien Plätze). */
export function loadData(raw: unknown): VzData | null {
  const parsed = dataSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const DATA: VzData | null = loadData(verzeichnisseJson);

// ---- Telefon -----------------------------------------------------------------------------------

/** Schweizer Nummer in E.164 ohne Plus («41711234567»); null, wenn die Eingabe keine Schweizer Nummer ist. */
export function normalizePhoneCH(input: string): string | null {
  return normalizePhone(input)?.e164 ?? null;
}

/** Beide Schreibweisen: «+41 71 123 45 67» und «071 123 45 67». null bei ungültiger Eingabe. */
export function formatPhoneCH(input: string): { international: string; national: string } | null {
  const p = normalizePhone(input);
  return p ? { international: p.displayInternational, national: p.display } : null;
}

/** Meldung zur Telefonnummer; null, wenn sie in Ordnung ist. */
export function telefonProblem(input: string): string | null {
  if (input.trim() === "") return MSG.telefonLeer;
  const p = phoneProblem(input);
  if (p === null) return null;
  return p === PHONE_ERROR_LENGTH ? MSG.telefonLaenge : MSG.telefonCH;
}

// ---- Website -----------------------------------------------------------------------------------

const HOST_RE = /^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u;

/**
 * Website im Format «https://host/pfad» ohne Schrägstrich am Ende. Leer bleibt leer; null, wenn die Eingabe keine
 * Adresse ist. Annahme: «http://» und fehlendes Schema werden zu «https://», der Host wird klein geschrieben.
 */
export function normalizeWebsite(input: string): string | null {
  const s = input.trim();
  if (s === "") return "";
  if (/\s/.test(s)) return null;
  const rest = s.replace(/^https?:\/\//i, "");
  const m = /^([^/?#]+)([/?#].*)?$/.exec(rest);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (!HOST_RE.test(host)) return null;
  const tail = (m[2] ?? "").replace(/\/+$/, "");
  return `https://${host}${tail}`;
}

// ---- Eingaben und der einheitliche Eintrag -----------------------------------------------------

export type Status = "ja" | "nein" | "unklar";
export const STATUS_OPTIONS: { key: Status; label: string }[] = [
  { key: "ja", label: "Ja" },
  { key: "nein", label: "Nein" },
  { key: "unklar", label: "Weiss ich nicht" },
];
const STATUS_KEYS = STATUS_OPTIONS.map((o) => o.key);
const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUS_KEYS as string[]).includes(v);

/** So lautet der Eintrag in einem Verzeichnis heute. Alles freiwillig. */
export type Fund = { name: string; adresse: string; telefon: string };
export const EMPTY_FUND: Fund = { name: "", adresse: "", telefon: "" };

/** Angaben der Person in diesem Werkzeug (ohne Firma, Ort und Website; die stehen im Firmenprofil). */
export type VzInput = {
  strasse: string;
  plz: string;
  telefon: string;
  oeffnungszeiten: string;
  beschreibung: string;
  /** Status je Verzeichnis-ID; fehlt eine ID, gilt «unklar». */
  status: Record<string, Status>;
  funde: Record<string, Fund>;
  /** Name des frei benannten Verzeichnisses; leer: kommt nicht in die Liste. */
  anderesName: string;
};

/** Angaben aus dem Firmenprofil zum Zeitpunkt der Prüfung. */
export type Stamm = { firma: string; ort: string; website: string; branche: string };

export const EMPTY_INPUT: VzInput = { strasse: "", plz: "", telefon: "", oeffnungszeiten: "", beschreibung: "", status: {}, funde: {}, anderesName: "" };

export const statusOf = (input: VzInput, id: string): Status => input.status[id] ?? "unklar";
export const fundOf = (input: VzInput, id: string): Fund => input.funde[id] ?? EMPTY_FUND;

export const clean = (s: string): string => s.replace(/\s+/g, " ").trim();
const hasEszett = (s: string): boolean => /[ßẞ]/.test(s);
const eszettToSs = (s: string): string => s.replace(/ß/g, "ss").replace(/ẞ/g, "SS");

export type FieldKey = "firma" | "ort" | "website" | "strasse" | "plz" | "telefon" | "oeffnungszeiten" | "beschreibung";
export type Problem = { feld: FieldKey; text: string };

/** Alle Meldungen zu den Angaben, in der Reihenfolge des Formulars. Leer: alles in Ordnung. */
export function validate(stamm: Stamm, input: VzInput, verein = false): Problem[] {
  const out: Problem[] = [];
  if (clean(stamm.firma) === "" || stamm.firma.length > LIMITS.firma) out.push({ feld: "firma", text: verein ? MSG.firmaVerein : MSG.firma });
  const ort = clean(stamm.ort);
  if (ort === "" || ort.length > LIMITS.ort) out.push({ feld: "ort", text: MSG.ort });
  if (normalizeWebsite(stamm.website) === null) out.push({ feld: "website", text: MSG.website });
  const strasse = clean(input.strasse);
  if (strasse.length < LIMITS.strasse.min || strasse.length > LIMITS.strasse.max) out.push({ feld: "strasse", text: MSG.strasse });
  if (!/^[1-9]\d{3}$/.test(input.plz.trim())) out.push({ feld: "plz", text: MSG.plz });
  const tel = telefonProblem(input.telefon);
  if (tel) out.push({ feld: "telefon", text: tel });
  if (input.oeffnungszeiten.length > LIMITS.oeffnungszeiten) out.push({ feld: "oeffnungszeiten", text: MSG.oeffnungszeiten });
  if (input.beschreibung.length > LIMITS.beschreibung) out.push({ feld: "beschreibung", text: MSG.beschreibung });
  return out;
}

export type Eintrag = {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  /** «Strasse Nr, PLZ Ort» */
  adresse: string;
  /** «+41 71 123 45 67» */
  telefon: string;
  /** «071 123 45 67» */
  telefonNational: string;
  /** «https://host», leer ohne Website */
  website: string;
  oeffnungszeiten: string;
  beschreibung: string;
};

/** «Bahnhofstrasse 12, 9200 Gossau» */
export function formatAdresse(strasse: string, plz: string, ort: string): string {
  return `${clean(eszettToSs(strasse))}, ${plz.trim()} ${clean(ort)}`;
}

/**
 * Der einheitliche Eintrag. Name = Firma wörtlich (nur Leerzeichen bereinigt). Annahme: «ß» in der Strasse wird zu «ss»
 * (Schweizer Schreibweise). null, wenn die Angaben nicht stimmen.
 */
export function buildEintrag(stamm: Stamm, input: VzInput): Eintrag | null {
  if (validate(stamm, input).length > 0) return null;
  const phone = formatPhoneCH(input.telefon);
  const website = normalizeWebsite(stamm.website);
  if (!phone || website === null) return null;
  const strasse = clean(eszettToSs(input.strasse));
  const ort = clean(stamm.ort);
  return {
    name: clean(stamm.firma),
    strasse,
    plz: input.plz.trim(),
    ort,
    adresse: formatAdresse(strasse, input.plz, ort),
    telefon: phone.international,
    telefonNational: phone.national,
    website,
    oeffnungszeiten: input.oeffnungszeiten.trim(),
    beschreibung: input.beschreibung.trim(),
  };
}

export type EintragFeld = { key: "name" | "adresse" | "telefon" | "telefonNational" | "website" | "oeffnungszeiten" | "beschreibung"; label: string; value: string };

/** Die Felder der Kopiervorlage; leere freiwillige Felder fehlen. */
export function eintragFelder(e: Eintrag): EintragFeld[] {
  const all: EintragFeld[] = [
    { key: "name", label: "Name", value: e.name },
    { key: "adresse", label: "Adresse", value: e.adresse },
    { key: "telefon", label: "Telefon", value: e.telefon },
    { key: "telefonNational", label: "Telefon (national)", value: e.telefonNational },
    { key: "website", label: "Website", value: e.website },
    { key: "oeffnungszeiten", label: "Öffnungszeiten", value: e.oeffnungszeiten },
    { key: "beschreibung", label: "Kurzbeschreibung", value: e.beschreibung },
  ];
  return all.filter((f) => f.value !== "");
}

/** Der ganze Eintrag als Text zum Kopieren («Name: …» je Zeile). */
export function eintragText(e: Eintrag): string {
  return eintragFelder(e)
    .filter((f) => f.key !== "telefonNational")
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
}

// ---- Verzeichnisse für diesen Besuch -----------------------------------------------------------

/** Gastgewerbe und Beherbergung nach dem Stichwort in der Branche aus dem Profil. */
export const GASTGEWERBE_RE =
  /gastro|gastgewerbe|restaurant|café|cafe|\bbar\b|beiz|bistro|pizzeria|imbiss|gasthaus|gasthof|wirtshaus|hotel|\bpension\b|unterkunft|beherberg|herberge|ferienwohnung|ferienhaus|b&b|bed\s*(?:and|&)\s*breakfast|camping|hostel/i;

export function istGastgewerbe(branche: string): boolean {
  return GASTGEWERBE_RE.test(branche);
}

export type Item = {
  id: string;
  /** Name ohne Zusatz */
  name: string;
  /** Name für Anzeige und Legende, mit dem Zusatz in Klammern */
  anzeige: string;
  typ: Typ;
  frei: boolean;
  /** Frei benanntes Verzeichnis ohne Namen: erscheint im Formular, aber nicht im Ergebnis. */
  unbenannt: boolean;
  url: string | null;
  eintragUrl: string | null;
  kostenlos: boolean | null;
  bestaetigung: string | null;
  hinweis: string;
  zusatz: string | null;
  quelle: string | null;
  quelleBestaetigung: string | null;
  /** ISO-Datum, an dem die Seite des Anbieters geprüft wurde. */
  geprueft: string | null;
};

export const FREI_GEMEINDE = "frei-gemeinde";
export const FREI_VERBAND = "frei-verband";
export const FREI_ANDERES = "frei-anderes";
export const ANDERES_STANDARD = "Anderes Verzeichnis";

const FREIE_PLAETZE: { id: string; name: string; typ: Typ; hinweis: string }[] = [
  {
    id: FREI_GEMEINDE,
    name: "Gewerbeverzeichnis deiner Gemeinde",
    typ: "gemeinde",
    hinweis: "Frag bei deiner Gemeinde nach, ob es ein Gewerbeverzeichnis gibt und wie du dich einträgst.",
  },
  {
    id: FREI_VERBAND,
    name: "Branchenverband oder Gewerbeverein",
    typ: "branche",
    hinweis: "Frag bei deinem Verband oder Gewerbeverein nach, ob er Mitglieder auf seiner Website auflistet.",
  },
  {
    id: FREI_ANDERES,
    name: ANDERES_STANDARD,
    typ: "branche",
    hinweis: "Schreib Name, Adresse und Telefon dort im selben Wortlaut wie im einheitlichen Eintrag.",
  },
];

const zusatzFor = (d: Eintragsdatensatz, branche: string): string | null => (d.typ === "bewertung" && branche.trim() === "" ? ZUSATZ_BRANCHE : null);
const anzeigeOf = (name: string, zusatz: string | null): string => (zusatz ? `${name} (${zusatz})` : name);

/**
 * Die Verzeichnisse für diese Branche, in der Reihenfolge der Aufgabenliste: nach Typ (Richtwert von Alperna), innerhalb
 * des Typs in der Reihenfolge der Datei, die freien Plätze zuletzt. «bewertung» (Tripadvisor) erscheint nur bei Gastgewerbe
 * oder unbekannter Branche (dann mit dem Zusatz) und steht bei Gastgewerbe vorn.
 */
export function itemsFor(branche: string, anderesName: string, data: VzData | null = DATA): Item[] {
  const gastro = istGastgewerbe(branche);
  const rank = (t: Typ) => (t === "bewertung" && gastro ? -1 : TYP_ORDER.indexOf(t));
  const fromData: Item[] = (data?.eintraege ?? [])
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.typ !== "bewertung" || gastro || branche.trim() === "")
    .sort((a, b) => rank(a.d.typ) - rank(b.d.typ) || a.i - b.i)
    .map(({ d }) => {
      const zusatz = zusatzFor(d, branche);
      return {
        id: d.id,
        name: d.name,
        anzeige: anzeigeOf(d.name, zusatz),
        typ: d.typ,
        frei: false,
        unbenannt: false,
        url: d.url,
        eintragUrl: d.eintragUrl ?? null,
        kostenlos: d.kostenlos,
        bestaetigung: d.bestaetigung,
        hinweis: d.hinweis,
        zusatz,
        quelle: d.quelle,
        quelleBestaetigung: d.quelleBestaetigung ?? null,
        geprueft: d.geprueft,
      };
    });
  const frei: Item[] = FREIE_PLAETZE.map((p) => {
    const name = p.id === FREI_ANDERES ? clean(anderesName) || p.name : p.name;
    return {
      id: p.id,
      name,
      anzeige: name,
      typ: p.typ,
      frei: true,
      unbenannt: p.id === FREI_ANDERES && clean(anderesName) === "",
      url: null,
      eintragUrl: null,
      kostenlos: null,
      bestaetigung: null,
      hinweis: p.hinweis,
      zusatz: null,
      quelle: null,
      quelleBestaetigung: null,
      geprueft: null,
    };
  });
  return [...fromData, ...frei];
}

// ---- Vergleich ---------------------------------------------------------------------------------

export type AbweichungArt = "str-abkuerzung" | "ss-eszett" | "telefon-format" | "name-zusatz" | "plz-fehlt" | "gross-klein" | "sonstige";
export type Stufe = "hinweis" | "warnung";
export type Abweichung = {
  feld: "name" | "adresse" | "telefon";
  art: AbweichungArt;
  /** hinweis: gleich, aber anders geschrieben. warnung: wirklich verschieden. */
  stufe: Stufe;
  /** So steht es dort. */
  dort: string;
  /** Vorschlag: so lautet der einheitliche Eintrag. */
  soll: string;
  text: string;
};

export const ART_LABEL: Record<AbweichungArt, string> = {
  "str-abkuerzung": "Abkürzung bei der Strasse",
  "ss-eszett": "«ß» statt «ss»",
  "telefon-format": "Telefon anders geschrieben",
  "name-zusatz": "Zusatz im Namen",
  "plz-fehlt": "PLZ fehlt",
  "gross-klein": "Gross- und Kleinschreibung",
  sonstige: "Weitere Abweichung",
};
export const STUFE_LABEL: Record<Stufe, string> = { hinweis: "Gleich, aber anders geschrieben", warnung: "Weicht ab" };
export const FELD_LABEL: Record<Abweichung["feld"], string> = { name: "Name", adresse: "Adresse", telefon: "Telefon" };

/** Kleinschreibung, «ß» zu «ss» und Umlaute zu «ae», «oe», «ue». */
const fold = (s: string): string =>
  eszettToSs(s)
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");
/** Nur Buchstaben und Ziffern, gefaltet: gleich, wenn nur Satzzeichen, Leerzeichen oder Umlaut-Schreibweise abweichen. */
const squash = (s: string): string => fold(s).replace(/[^\p{L}\p{N}]+/gu, "");
const wordsOf = (s: string): string[] => clean(s).split(/[\s,;]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

const RECHTSFORM = new Set(["gmbh", "ag", "sa", "sarl", "sàrl", "sagl", "kg", "klg", "kollektivgesellschaft", "einzelfirma", "genossenschaft", "stiftung", "verein"]);

function startsWithAll(a: string[], b: string[]): boolean {
  return b.length <= a.length && b.every((k, i) => a[i] === k);
}
function endsWithAll(a: string[], b: string[]): boolean {
  return b.length <= a.length && b.every((k, i) => a[a.length - b.length + i] === k);
}

type Zusatz = { dortMehr: boolean; woerter: string[] };
/** Unterscheiden sich die Namen nur durch angehängte oder vorangestellte Wörter (bis vier)? */
function zusatzOf(master: string, found: string): Zusatz | null {
  const wm = wordsOf(master);
  const wf = wordsOf(found);
  const km = wm.map(squash);
  const kf = wf.map(squash);
  if (kf.length === km.length || km.length === 0 || kf.length === 0) return null;
  const mehr = kf.length > km.length;
  const [lang, kurz, wLang] = mehr ? [kf, km, wf] : [km, kf, wm];
  let extra: string[] | null = null;
  if (startsWithAll(lang, kurz)) extra = wLang.slice(kurz.length);
  else if (endsWithAll(lang, kurz)) extra = wLang.slice(0, lang.length - kurz.length);
  if (!extra || extra.length === 0 || extra.length > 4) return null;
  return { dortMehr: mehr, woerter: extra };
}

function compareName(m: string, f: string): Abweichung[] {
  const mm = clean(m);
  const ff = clean(f);
  if (ff === "" || ff === mm) return [];
  const make = (art: AbweichungArt, stufe: Stufe, text: string): Abweichung => ({ feld: "name", art, stufe, dort: ff, soll: mm, text });
  const out: Abweichung[] = [];
  if (hasEszett(ff) && !hasEszett(mm)) out.push(make("ss-eszett", "hinweis", "Dort steht «ß». In der Schweiz schreibst du «ss»."));
  const ffs = eszettToSs(ff);
  const same = ffs.toLowerCase() === mm.toLowerCase();
  if (same && ffs !== mm) out.push(make("gross-klein", "hinweis", "Der Name ist gleich, aber anders gross und klein geschrieben als bei dir."));
  if (!same) {
    if (squash(mm) === squash(ff)) {
      out.push(make("sonstige", "hinweis", "Gleich, aber anders geschrieben: Satzzeichen, Leerzeichen oder Umlaute weichen ab."));
    } else {
      const z = zusatzOf(mm, ff);
      if (z) {
        const liste = z.woerter.join(" ");
        const nurRechtsform = z.woerter.every((w) => RECHTSFORM.has(squash(w)));
        out.push(
          make(
            "name-zusatz",
            "hinweis",
            z.dortMehr
              ? nurRechtsform
                ? `Dort steht zusätzlich die Rechtsform «${liste}». Das ist kein Fehler. Entscheide, ob sie überall oder nirgends stehen soll.`
                : `Dort steht zusätzlich «${liste}». Entscheide, ob der Zusatz überall oder nirgends stehen soll.`
              : `Dort fehlt «${liste}» aus deinem Namen. Entscheide, ob der Name überall gleich lauten soll.`,
          ),
        );
      } else {
        out.push(make("sonstige", "warnung", "Der Name weicht ab."));
      }
    }
  }
  return out;
}

const STR_ABK = /str\.?(?=[\s,\d]|$)/i;
const STR_ABK_ALL = /str\.?(?=[\s,\d]|$)/gi;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plzRe = (plz: string) => new RegExp(`(?<!\\d)${escapeRe(plz)}(?!\\d)`, "g");
const kantonCodes: string[] = KANTONE.map(([c]) => c);

function compareAdresse(e: Eintrag, f0: string): Abweichung[] {
  const f = clean(f0);
  const m = e.adresse;
  if (f === "" || f === m) return [];
  const make = (art: AbweichungArt, stufe: Stufe, text: string): Abweichung => ({ feld: "adresse", art, stufe, dort: f, soll: m, text });
  const out: Abweichung[] = [];

  if (hasEszett(f) && !hasEszett(m)) out.push(make("ss-eszett", "hinweis", "Dort steht «ß». In der Schweiz schreibst du «ss»."));
  let g = eszettToSs(f);

  const abkDort = STR_ABK.test(g);
  const abkSoll = STR_ABK.test(m);
  if (abkDort !== abkSoll) {
    out.push(
      make(
        "str-abkuerzung",
        "hinweis",
        abkDort ? "Dort steht «Str.» oder «str» statt «strasse». Schreib die Strasse überall aus." : "Dort ist die Strasse ausgeschrieben, bei dir steht eine Abkürzung. Schreib sie überall gleich.",
      ),
    );
  }
  // Gross-/Kleinschreibung nur vergleichen, wo keine Abkürzung ins Spiel kommt (die Erweiterung schreibt klein).
  const keepCase = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "");
  const caseDiff = !abkDort && !abkSoll && keepCase(g) !== keepCase(m) && keepCase(g).toLowerCase() === keepCase(m).toLowerCase();

  g = g.replace(STR_ABK_ALL, "strasse");
  const mE = m.replace(STR_ABK_ALL, "strasse");

  let rest = g;
  if (plzRe(e.plz).test(g)) {
    rest = g.replace(plzRe(e.plz), " ");
  } else {
    const other = /(?<!\d)(\d{4})(?=\s+\p{L})/u.exec(g);
    if (other) {
      out.push(make("sonstige", "warnung", `Die PLZ weicht ab: dort ${other[1]}, bei dir ${e.plz}.`));
      rest = g.replace(other[0], " ");
    } else {
      out.push(make("plz-fehlt", "hinweis", `Dort fehlt die PLZ ${e.plz}. Schreib die Adresse überall mit PLZ.`));
    }
  }
  const mRest = mE.replace(plzRe(e.plz), " ");

  // Ein angehängter Kanton («Gossau SG») ist kein Fehler, aber eine andere Schreibweise.
  const kanton = /\s([A-Z]{2})\s*$/.exec(rest);
  if (kanton && kantonCodes.includes(kanton[1]) && !/\s[A-Z]{2}\s*$/.test(mRest)) {
    out.push(make("sonstige", "hinweis", `Dort steht der Kanton «${kanton[1]}» dazu. Das ist kein Fehler; bleib überall bei einer Schreibweise.`));
    rest = rest.slice(0, kanton.index);
  }

  const cM = squash(mRest);
  const cF = squash(rest);
  if (cM !== cF) {
    if (cF !== "" && cM === cF + squash(e.ort)) out.push(make("sonstige", "hinweis", "Dort fehlt der Ort. Schreib die Adresse überall mit Ort."));
    else out.push(make("sonstige", "warnung", "Strasse, Nummer oder Ort weichen ab."));
  } else if (caseDiff) {
    out.push(make("gross-klein", "hinweis", "Die Adresse ist gleich, aber anders gross und klein geschrieben als bei dir."));
  } else if (out.length === 0) {
    out.push(make("sonstige", "hinweis", "Gleich, aber anders geschrieben: Satzzeichen oder Leerzeichen weichen ab."));
  }
  return out;
}

function compareTelefon(e: Eintrag, f0: string): Abweichung[] {
  const f = clean(f0);
  if (f === "" || f === e.telefon) return [];
  const make = (art: AbweichungArt, stufe: Stufe, text: string): Abweichung => ({ feld: "telefon", art, stufe, dort: f, soll: e.telefon, text });
  const a = normalizePhoneCH(f);
  if (a && a === normalizePhoneCH(e.telefon)) {
    return [make("telefon-format", "hinweis", `Dieselbe Nummer, aber anders geschrieben. Schreib sie überall als «${e.telefon}».`)];
  }
  return [make("sonstige", "warnung", a ? "Die Nummer weicht ab." : "Die Nummer lässt sich nicht als Schweizer Nummer lesen.")];
}

/**
 * Vergleicht den Eintrag in einem Verzeichnis mit dem einheitlichen Eintrag. Leere Felder werden übersprungen (alles
 * freiwillig). Gleich nach der Normalisierung, aber anders geschrieben: «hinweis» mit Vorschlag. Wirklich verschieden:
 * «warnung». Rechtsform-Zusätze sind ein Hinweis, kein Fehler.
 */
export function compareEntry(master: Eintrag, found: Fund): Abweichung[] {
  return [...compareName(master.name, found.name), ...compareAdresse(master, found.adresse), ...compareTelefon(master, found.telefon)];
}

// ---- Aufgaben ----------------------------------------------------------------------------------

export type Aktion = "eintragen" | "suchen" | "pruefen" | "angleichen" | "ok";
export const AKTIONEN: Aktion[] = ["eintragen", "suchen", "pruefen", "angleichen", "ok"];

/** Der Satz der Aufgabe, wie er in Liste, Tabelle und Dokument steht. */
export const AUFGABE_TEXT: Record<Aktion, string> = {
  eintragen: "Eintragen",
  suchen: "Suchen, ob du schon drin bist",
  pruefen: "Prüfe, ob Name, Adresse und Telefon wie oben lauten",
  angleichen: "Angleichen",
  ok: "In Ordnung",
};
export const AKTION_KURZ: Record<Aktion, string> = {
  eintragen: "Eintragen",
  suchen: "Suchen",
  pruefen: "Prüfen",
  angleichen: "Angleichen",
  ok: "In Ordnung",
};

export type Aufgabe = {
  nr: number;
  id: string;
  /** Name mit Zusatz */
  verzeichnis: string;
  typ: Typ;
  frei: boolean;
  status: Status;
  aktion: Aktion;
  aufgabe: string;
  hinweis: string;
  kosten: string | null;
  bestaetigung: string | null;
  url: string | null;
  /** Seite des Anbieters, auf der die Angaben zu Kosten und Bestätigung stehen. */
  quelle: string | null;
  geprueft: string | null;
  abweichungen: Abweichung[];
  /** Hat die Person den Eintrag dort eingefügt? */
  eingefuegt: boolean;
};

export const kostenText = (k: boolean | null): string => (k === true ? KOSTEN_JA : k === false ? KOSTEN_NEIN : KOSTEN_UNKLAR);
const safeHttps = (u: string | null): string | null => (u && u.startsWith("https://") ? u : null);
const hatFund = (f: Fund) => clean(f.name) !== "" || clean(f.adresse) !== "" || clean(f.telefon) !== "";

export function aufgabeFor(item: Item, master: Eintrag, input: VzInput, nr = 1): Aufgabe {
  const status = statusOf(input, item.id);
  const fund = fundOf(input, item.id);
  const eingefuegt = status === "ja" && hatFund(fund);
  let aktion: Aktion;
  let abweichungen: Abweichung[] = [];
  if (status === "nein") aktion = "eintragen";
  else if (status === "unklar") aktion = "suchen";
  else if (!eingefuegt) aktion = "pruefen";
  else {
    abweichungen = compareEntry(master, fund);
    aktion = abweichungen.length > 0 ? "angleichen" : "ok";
  }
  const url = safeHttps(aktion === "eintragen" ? (item.eintragUrl ?? item.url) : item.url);
  return {
    nr,
    id: item.id,
    verzeichnis: item.anzeige,
    typ: item.typ,
    frei: item.frei,
    status,
    aktion,
    aufgabe: AUFGABE_TEXT[aktion],
    hinweis: item.hinweis,
    kosten: item.frei ? null : kostenText(item.kostenlos),
    bestaetigung: aktion === "eintragen" || aktion === "suchen" ? item.bestaetigung : null,
    url,
    quelle: safeHttps(item.quelle),
    geprueft: item.geprueft,
    abweichungen,
    eingefuegt,
  };
}

export type Ergebnis = {
  stamm: Stamm;
  datum: string;
  eintrag: Eintrag;
  aufgaben: Aufgabe[];
  zaehlung: Record<Aktion, number>;
  /** Quelle des Datensatzes für die Quellenzeile; null, wenn er nicht lesbar war. */
  quelle: { source: string; asOf: string } | null;
};

/** Das Ergebnis aus den Angaben. null, wenn die Angaben nicht stimmen (siehe validate). */
export function auswerten(stamm: Stamm, input: VzInput, datum: string, data: VzData | null = DATA): Ergebnis | null {
  const eintrag = buildEintrag(stamm, input);
  if (!eintrag) return null;
  const items = itemsFor(stamm.branche, input.anderesName, data).filter((i) => !i.unbenannt);
  const aufgaben = items.map((it, i) => aufgabeFor(it, eintrag, input, i + 1));
  const zaehlung = Object.fromEntries(AKTIONEN.map((a) => [a, aufgaben.filter((x) => x.aktion === a).length])) as Record<Aktion, number>;
  return { stamm, datum, eintrag, aufgaben, zaehlung, quelle: data ? { source: data.meta.source, asOf: data.meta.asOf } : null };
}

export function alleAbweichungen(e: Ergebnis): (Abweichung & { verzeichnis: string })[] {
  return e.aufgaben.flatMap((a) => a.abweichungen.map((x) => ({ ...x, verzeichnis: a.verzeichnis })));
}

/** «6 Verzeichnisse in der Liste: 2 zum Eintragen, 2 zum Suchen, 1 zum Prüfen, 1 zum Angleichen.» */
export function summaryText(e: Ergebnis): string {
  const n = e.aufgaben.length;
  const z = e.zaehlung;
  const parts = [
    z.eintragen ? `${z.eintragen} zum Eintragen` : "",
    z.suchen ? `${z.suchen} zum Suchen` : "",
    z.pruefen ? `${z.pruefen} zum Prüfen` : "",
    z.angleichen ? `${z.angleichen} zum Angleichen` : "",
    z.ok ? `${z.ok} in Ordnung` : "",
  ].filter(Boolean);
  return `${n} ${n === 1 ? "Verzeichnis" : "Verzeichnisse"} in der Liste${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}

/** «Angaben zu den Verzeichnissen: <meta.source>, Stand 05.10.2026.» */
export function quellenzeile(q: Ergebnis["quelle"]): string {
  return q ? `Angaben zu den Verzeichnissen: ${q.source}, Stand ${dateCH(q.asOf)}.` : "Angaben zu den Verzeichnissen: keine Liste verfügbar.";
}

// ---- Dokument und Texte fürs CRM ---------------------------------------------------------------

function hinweisZelle(a: Aufgabe): string {
  const link = a.url ? `Link: ${a.url}` : "";
  let parts: (string | null)[];
  if (a.aktion === "eintragen" || a.aktion === "suchen") {
    parts = [a.hinweis, a.kosten, a.bestaetigung ? `Bestätigung: ${a.bestaetigung}` : null, link];
  } else if (a.aktion === "angleichen") {
    const n = a.abweichungen.length;
    parts = [`${n} ${n === 1 ? "Abweichung" : "Abweichungen"}, siehe unten.`, link];
  } else if (a.aktion === "pruefen") {
    parts = ["Öffne deinen Eintrag und vergleiche ihn mit dem einheitlichen Eintrag.", link];
  } else {
    parts = ["Die eingefügten Angaben stimmen mit dem einheitlichen Eintrag überein.", link];
  }
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}

export function toDocument(e: Ergebnis): DocumentModel {
  const abw = alleAbweichungen(e);
  const blocks: DocumentModel["blocks"] = [
    { type: "paragraph", text: summaryText(e) },
    { type: "heading", level: 2, text: "Einheitlicher Eintrag (Kopiervorlage)" },
    { type: "facts", items: eintragFelder(e.eintrag).map((f) => ({ label: f.label, value: f.value })) },
    { type: "heading", level: 2, text: "Aufgabenliste" },
    { type: "paragraph", text: RICHTWERT_NOTE },
    {
      type: "table",
      header: ["Verzeichnis", "Aufgabe", "Hinweis"],
      rows: e.aufgaben.map((a) => [a.verzeichnis, a.aufgabe, hinweisZelle(a)]),
      widths: [3, 3, 6],
    },
  ];
  if (abw.length > 0) {
    blocks.push(
      { type: "heading", level: 2, text: "Abweichungen" },
      {
        type: "table",
        header: ["Verzeichnis", "Feld", "Dort", "Soll", "Art"],
        rows: abw.map((x) => [x.verzeichnis, FELD_LABEL[x.feld], x.dort, x.soll, `${ART_LABEL[x.art]} (${STUFE_LABEL[x.stufe]})`]),
        widths: [3, 2, 4, 4, 3],
      },
    );
  }
  blocks.push(
    { type: "heading", level: 2, text: "Quelle und Stand" },
    { type: "paragraph", text: quellenzeile(e.quelle) },
    { type: "paragraph", text: `${KEIN_ABRUF_NOTE} ${BEDINGUNGEN_NOTE}` },
  );
  return {
    title: `Verzeichnis-Check: ${e.stamm.firma}`,
    subtitle: "Einheitlicher Eintrag und Aufgabenliste",
    firma: e.stamm.firma,
    datum: e.datum,
    blocks,
    filename: `verzeichnisse-${safeFilename(e.stamm.firma, "firma")}`,
  };
}

/** Das Ergebnis als Markdown für das CRM («ausgabe»). */
export function reportMarkdown(e: Ergebnis): string {
  return toMarkdown(toDocument(e)).trimEnd();
}

const STATUS_LABEL: Record<Status, string> = { ja: "Ja", nein: "Nein", unklar: "Weiss ich nicht" };

/** Die Angaben der Person als lesbarer Text für das CRM («eingabe»): Stammdaten zuerst, dann der Status je Verzeichnis. */
export function eingabeText(stamm: Stamm, input: VzInput, data: VzData | null = DATA): string {
  const lines: string[] = [
    `Firma: ${clean(stamm.firma)}`,
    `Ort: ${clean(stamm.ort)}`,
    `PLZ: ${input.plz.trim()}`,
    `Strasse: ${clean(input.strasse)}`,
    `Telefon: ${clean(input.telefon)}`,
  ];
  if (clean(stamm.website)) lines.push(`Website: ${clean(stamm.website)}`);
  if (clean(stamm.branche)) lines.push(`Branche: ${clean(stamm.branche)}`);
  for (const it of itemsFor(stamm.branche, input.anderesName, data)) {
    if (it.unbenannt) continue;
    const st = statusOf(input, it.id);
    const f = fundOf(input, it.id);
    let line = `${it.anzeige}: ${STATUS_LABEL[st]}`;
    if (st === "ja" && hatFund(f)) {
      const dort = [f.name && `Name «${clean(f.name)}»`, f.adresse && `Adresse «${clean(f.adresse)}»`, f.telefon && `Telefon «${clean(f.telefon)}»`].filter(Boolean);
      line += ` (Eintrag dort: ${dort.join(", ")})`;
    }
    lines.push(line);
  }
  if (clean(input.oeffnungszeiten)) lines.push(`Öffnungszeiten: ${clean(input.oeffnungszeiten)}`);
  if (clean(input.beschreibung)) lines.push(`Kurzbeschreibung: ${clean(input.beschreibung)}`);
  return lines.join("\n");
}

// ---- Gespeicherter Stand (mt:verzeichnisse) ----------------------------------------------------

export type VzOutput = { firma: string; ort: string; website: string; branche: string; datum: string };
export type VzState = { v: 1; phase: "edit" | "result"; input: VzInput; output?: VzOutput };
export const EMPTY_STATE: VzState = { v: 1, phase: "edit", input: EMPTY_INPUT };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const ID_RE = /^[a-z0-9-]{1,60}$/;

function parseInput(raw: unknown): VzInput {
  const r = isObject(raw) ? raw : {};
  const status: Record<string, Status> = {};
  if (isObject(r.status)) {
    for (const [k, v] of Object.entries(r.status).slice(0, 40)) if (ID_RE.test(k) && isStatus(v)) status[k] = v;
  }
  const funde: Record<string, Fund> = {};
  if (isObject(r.funde)) {
    for (const [k, v] of Object.entries(r.funde).slice(0, 40)) {
      if (!ID_RE.test(k) || !isObject(v)) continue;
      funde[k] = { name: str(v.name, LIMITS.fundName), adresse: str(v.adresse, LIMITS.fundAdresse), telefon: str(v.telefon, LIMITS.fundTelefon) };
    }
  }
  return {
    strasse: str(r.strasse, 200),
    plz: str(r.plz, 10),
    telefon: str(r.telefon, 60),
    oeffnungszeiten: str(r.oeffnungszeiten, 1000),
    beschreibung: str(r.beschreibung, 2000),
    status,
    funde,
    anderesName: str(r.anderesName, LIMITS.anderesName),
  };
}

/** Liest den Stand aus dem Speicher. Kaputte Daten ergeben den leeren Stand; ein Ergebnis ohne gültige Angaben wird zum Formular. */
export function parseState(raw: unknown): VzState {
  if (!isObject(raw) || raw.v !== 1) return EMPTY_STATE;
  const input = parseInput(raw.input);
  const o = raw.output;
  if (raw.phase === "result" && isObject(o) && typeof o.firma === "string" && typeof o.ort === "string") {
    const output: VzOutput = {
      firma: str(o.firma, LIMITS.firma),
      ort: str(o.ort, LIMITS.ort),
      website: str(o.website, 300),
      branche: str(o.branche, 200),
      datum: str(o.datum, 20),
    };
    if (validate(output, input).length === 0 && output.datum !== "") return { v: 1, phase: "result", input, output };
  }
  return { v: 1, phase: "edit", input };
}
