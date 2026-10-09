import { KANTONE } from "@/lib/ch";
import { formatPhoneCH, normalizePhoneCH } from "./logic";

// Angaben aus der eigenen Website: Strasse, PLZ, Ort und Telefon aus dem gelesenen Text der Startseite (lib/read.ts). Rein und ohne Netz.
// Die Erkennung folgt festen Mustern, keine KI: Sie findet die Adresse in der Fusszeile oder im Text, wenn sie als «Strasse Nr, PLZ Ort»
// steht, und die erste Schweizer Telefonnummer, vor der nicht «Fax» steht. Was sie findet, ist ein Vorschlag; die Person bestätigt ihn.

export type SeitenText = { text: string; tail?: string };
export type Adresse = { strasse: string; plz: string; ort: string };
export type KontaktFeld = "strasse" | "plz" | "telefon";
export type KontaktVorschlag = { key: KontaktFeld; label: string; wert: string };

const KANTON_CODES: string[] = KANTONE.map(([c]) => c);

/** Wörter vor einer Hausnummer, die keine Strasse sind. */
const KEINE_STRASSE = new Set([
  "kontakt", "adresse", "anschrift", "telefon", "tel", "fon", "fax", "mail", "email", "postfach", "impressum", "standort", "sitz",
  "öffnungszeiten", "oeffnungszeiten", "uns", "büro", "buero", "firma", "besuch", "besuchen", "jahr", "jahre", "seit", "mehr", "als",
  "ab", "bis", "von", "um", "uhr", "chf", "fr", "nr", "no", "nummer", "plz", "und", "oder", "für",
]);
/** Wörter, die zu einem Strassennamen gehören können und vor dem eigentlichen Namen stehen («Im Dorf», «Obere Mühlestrasse»). */
const VORWORT = new Set(["im", "am", "auf", "an", "in", "zur", "zum", "beim", "vor", "hinter", "unter", "ob", "bei", "der", "dem", "den", "obere", "untere", "alte", "neue", "grosse", "kleine", "hintere", "vordere", "mittlere"]);
const STRASSEN_ENDUNG = /(?:strasse|str\.|gasse|weg|platz|allee|rain|ring|quai|hof|graben|halde|matte|acker|bühl|steig|pfad|zeile|park|markt|damm|brücke|berg|büel|moos|feld|egg|tobel|wiese|garten|mühle)$/i;
/** Wörter nach der PLZ, die nicht mehr zum Ort gehören. */
const ORT_ENDE = new Set(["tel", "telefon", "fon", "fax", "mail", "email", "e-mail", "schweiz", "switzerland", "suisse", "svizzera", "ch", "öffnungszeiten", "impressum", "kontakt", "datenschutz", "agb", "www"]);

const PLZ_ORT = /(?<![\d.])(?:CH[-\s]?)?([1-9]\d{3})\s+([A-ZÄÖÜ][\p{L}'.-]*(?:\s+(?:[A-ZÄÖÜ][\p{L}'.-]*|am|an|im|bei|ob|unter|de|la|le|sur|près)){0,3})/gu;
const compact = (s: string) => s.replace(/\s+/g, " ").trim();
const istGross = (w: string) => /^[A-ZÄÖÜ]/.test(w);

/** Abkürzungen mit Punkt, die zum Ort gehören («St. Gallen»). */
const ORT_ABKUERZUNG = /^(?:St|Ste|Mt)\.$/;

/** Der Ort aus den Wörtern nach der PLZ: bei einem Stoppwort, einem Satzende oder einem angehängten Kantonskürzel ist Schluss. */
function ortOf(raw: string): string {
  const out: string[] = [];
  for (const w of raw.split(/\s+/)) {
    const k = w.replace(/[.,;:]+$/, "");
    if (ORT_ENDE.has(k.toLowerCase())) break;
    if (out.length > 0 && /^[A-Z]{2}$/.test(k) && KANTON_CODES.includes(k)) break;
    const abk = ORT_ABKUERZUNG.test(w);
    out.push(abk ? w : k);
    if (!abk && /[.,;:]$/.test(w)) break;
  }
  return out.join(" ").replace(/[,;:]+$/, "");
}

/** Die Strasse (mit Hausnummer) aus dem Text unmittelbar vor der PLZ; null, wenn dort keine steht. */
function strasseVor(vor: string): string | null {
  const m = /([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,3})\s+(\d{1,3})\s?([a-z])?\s*[,|·•–-]*\s*(?:CH[-\s]?)?$/u.exec(vor);
  if (!m) return null;
  const tokens = m[1].split(/\s+/);
  const last = tokens[tokens.length - 1];
  const lower = last.toLowerCase();
  const passt = STRASSEN_ENDUNG.test(last) || (istGross(last) && !KEINE_STRASSE.has(lower));
  if (!passt || KEINE_STRASSE.has(lower)) return null;
  const name = [last];
  for (let i = tokens.length - 2; i >= 0 && name.length < 3; i--) {
    if (!VORWORT.has(tokens[i].toLowerCase())) break;
    name.unshift(tokens[i]);
  }
  return `${name.join(" ")} ${m[2]}${m[3] ?? ""}`;
}

/** Alle Adressen «Strasse Nr, PLZ Ort», die der Text enthält, in der Reihenfolge des Textes. */
export function adressenAus(text: string): Adresse[] {
  const out: Adresse[] = [];
  for (const m of text.matchAll(PLZ_ORT)) {
    const ort = ortOf(m[2]);
    if (!ort) continue;
    const idx = m.index ?? 0;
    const strasse = strasseVor(text.slice(Math.max(0, idx - 70), idx));
    if (strasse) out.push({ strasse, plz: m[1], ort });
  }
  return out;
}

const TEL_INT = /(?<![\d+])(?:\+|00)\s?41(?:[\s().-]*0)?(?:[\s().-]*\d){9}(?!\d)/g;
const TEL_NAT = /(?<![\d+])0[1-9]\d(?:[\s./-]?\d){7}(?!\d)/g;

/** Alle Schweizer Telefonnummern im Text, ohne Fax, mit Vorrang für Nummern nach «Tel», «Telefon» oder «Fon». Wie geschrieben, nicht umgeformt. */
export function telefonAus(text: string): string[] {
  const found: { wert: string; mitLabel: boolean; pos: number }[] = [];
  for (const re of [TEL_INT, TEL_NAT]) {
    for (const m of text.matchAll(re)) {
      const wert = compact(m[0]);
      if (!normalizePhoneCH(wert)) continue;
      const pos = m.index ?? 0;
      const davor = text.slice(Math.max(0, pos - 12), pos);
      if (/fax\W*$/i.test(davor)) continue;
      found.push({ wert, mitLabel: /(?:tel|telefon|fon|phone|anrufen|mobil|natel)\W*$/i.test(davor), pos });
    }
  }
  found.sort((a, b) => Number(b.mitLabel) - Number(a.mitLabel) || a.pos - b.pos);
  return [...new Set(found.map((f) => f.wert))];
}

export type Kontakt = { strasse: string; plz: string; ort: string; telefon: string };
export const KEIN_KONTAKT: Kontakt = { strasse: "", plz: "", ort: "", telefon: "" };

/**
 * Strasse, PLZ, Ort und Telefon aus dem gelesenen Text. Die Fusszeile (`tail`) steht vor dem Text, weil dort die Anschrift zu stehen
 * pflegt. Passt der Ort zu `ortHint` (Ort aus dem Firmenprofil), gewinnt diese Adresse; sonst die erste.
 */
export function kontaktAus(page: SeitenText, ortHint = ""): Kontakt {
  const quellen = [page.tail ?? "", page.text].filter((q) => q.trim() !== "");
  const adressen = quellen.flatMap(adressenAus);
  const hint = ortHint.trim().toLowerCase();
  const adresse = (hint ? adressen.find((a) => a.ort.toLowerCase().startsWith(hint)) : undefined) ?? adressen[0];
  const telefon = quellen.map(telefonAus).find((t) => t.length > 0)?.[0] ?? "";
  return { strasse: adresse?.strasse ?? "", plz: adresse?.plz ?? "", ort: adresse?.ort ?? "", telefon };
}

export const KONTAKT_LABEL: Record<KontaktFeld, string> = { strasse: "Strasse und Nummer", plz: "PLZ", telefon: "Telefon" };

/** Telefon so, wie die Person es im Formular erwartet: «071 123 45 67». */
export const telefonAnzeige = (t: string): string => formatPhoneCH(t)?.national ?? t;

/**
 * Die Vorschläge für die Felder des Formulars. Ein Feld, das schon einen anderen Wert hat, ist `vorhanden` und wird nicht vorgewählt:
 * Angaben der Person werden nie still überschrieben. Ein Feld mit demselben Wert fehlt in der Liste.
 */
export function kontaktVorschlaege(k: Kontakt, aktuell: { strasse: string; plz: string; telefon: string }): (KontaktVorschlag & { vorhanden: boolean })[] {
  const werte: Record<KontaktFeld, string> = { strasse: k.strasse, plz: k.plz, telefon: k.telefon ? telefonAnzeige(k.telefon) : "" };
  return (["strasse", "plz", "telefon"] as const)
    .filter((key) => werte[key] !== "" && compact(aktuell[key]) !== werte[key])
    .map((key) => ({ key, label: KONTAKT_LABEL[key], wert: werte[key], vorhanden: compact(aktuell[key]) !== "" }));
}
