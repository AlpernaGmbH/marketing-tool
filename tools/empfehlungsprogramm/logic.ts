import { chf, pctCH, typoCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { ANREDEN, anredeFromProfile, anredeLabel, isAnrede, type Anrede } from "@/tools/bewertungs-kit/logic";
import { displayOf, parseHttpUrl, readWhatsappNumber } from "@/tools/qr-set/logic";
import { buildWaLink, normalizePhone, phoneProblem } from "@/tools/whatsapp-link/logic";

// Empfehlungsprogramm-Designer: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Anreiz als Anteil des Deckungsbeitrags, Mechanik in fünf Schritten, drei Textvorlagen in Du und Sie, Einseiter als
// DocumentModel, Inhalt der Karte A6, Texte fürs CRM und der gespeicherte Stand. Das Zeichnen (QR, PDF) steht in export.ts.
// Spec: specs/empfehlungsprogramm.md

export { ANREDEN, anredeFromProfile, anredeLabel, isAnrede, readWhatsappNumber };
export type { Anrede };

export const SLUG = "empfehlungsprogramm";
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";

/** Anteil des Deckungsbeitrags, den eine erfolgreiche Empfehlung wert ist, in Prozent. Richtwert von Alperna, keine Statistik. */
export const ANTEIL = { min: 10, max: 20 } as const;
/** Beträge werden auf 5 Franken gerundet. */
export const RUNDEN = 5;
export const LIMITS = {
  kundenwert: { min: 10, max: 1_000_000 },
  marge: { min: 1, max: 90 },
  /** Kundschaft pro Jahr, freiwillig: ohne Angabe rechnet das Modell mit einem Beispiel. */
  kundschaft: { min: 1, max: 100_000 },
} as const;
export const MAX_NUMMER = 40;
const MAX_ZAHL = 20;

// ---- Betrieb oder Verein ------------------------------------------------------------------------

/** Was die Seite aus dem Firmenprofil braucht. */
export type Kontext = { verein: boolean; firma: string; website: string };

export function kontextOf(profile: Pick<Profile, "organisationstyp" | "firma" | "website">): Kontext {
  return { verein: profile.organisationstyp === "verein", firma: (profile.firma ?? "").trim(), website: (profile.website ?? "").trim() };
}

export type Begriffe = {
  betrieb: string;
  legende: string;
  /** Kurzform für Dokument und Meldungen. */
  wert: string;
  wertFeld: string;
  wertHilfe: string;
  margeHilfe: string;
  anredeLegende: string;
  anredeHilfe: string;
  /** Feld «Kundschaft pro Jahr». */
  kundschaftFeld: string;
  kundschaftHilfe: string;
  /** «neue Kundinnen und Kunden» im Modell. */
  neu: string;
  /** «Kundin» im Satz «Eine gewonnene … bringt dir». */
  gewonnen: string;
};

export function begriffe(verein: boolean): Begriffe {
  return verein
    ? {
        betrieb: "Verein",
        legende: "Dein Verein",
        wert: "Jahresbeitrag pro Mitglied",
        wertFeld: "Jahresbeitrag pro Mitglied in CHF",
        wertHilfe: "Was ein Mitglied im Jahr im Schnitt bezahlt. Deine Schätzung genügt.",
        margeHilfe: "Der Anteil des Jahresbeitrags, der nach den direkten Kosten pro Mitglied bleibt, in Prozent.",
        anredeLegende: "Anrede deiner Mitglieder",
        anredeHilfe: "Gilt für Karte und Vorlagen. Umschalten kannst du im Ergebnis.",
        kundschaftFeld: "Mitglieder insgesamt (freiwillig)",
        kundschaftHilfe: "Damit rechnen wir drei Szenarien. Ohne Angabe rechnen wir mit 100 Mitgliedern als Beispiel.",
        neu: "neue Mitglieder",
        gewonnen: "gewonnenes Mitglied",
      }
    : {
        betrieb: "Betrieb",
        legende: "Dein Betrieb",
        wert: "Kundenwert pro Jahr",
        wertFeld: "Kundenwert pro Jahr in CHF",
        wertHilfe: "Was eine Kundin im Jahr im Schnitt bei dir ausgibt. Deine Schätzung genügt.",
        margeHilfe: "Der Anteil des Kundenwerts, der nach den direkten Kosten bleibt, in Prozent.",
        anredeLegende: "Anrede deiner Kundschaft",
        anredeHilfe: "Gilt für Karte und Vorlagen. Umschalten kannst du im Ergebnis.",
        kundschaftFeld: "Kundinnen und Kunden pro Jahr (freiwillig)",
        kundschaftHilfe: "Damit rechnen wir drei Szenarien. Ohne Angabe rechnen wir mit 100 Kundinnen und Kunden als Beispiel.",
        neu: "neue Kundinnen und Kunden",
        gewonnen: "gewonnene Kundin",
      };
}

// ---- Auswahlfelder ------------------------------------------------------------------------------

export const ANREIZ_KEYS = ["rabatt", "gutschein", "spende", "zusatz", "ideell"] as const;
export type AnreizKey = (typeof ANREIZ_KEYS)[number];
export const isAnreizKey = (v: unknown): v is AnreizKey => typeof v === "string" && (ANREIZ_KEYS as readonly string[]).includes(v);

export function anreizLabel(key: AnreizKey, verein = false): string {
  switch (key) {
    case "rabatt":
      return verein ? "Ermässigung auf den nächsten Jahresbeitrag" : "Rabatt auf den nächsten Auftrag";
    case "gutschein":
      return "Gutschein";
    case "spende":
      return "Spende an einen Verein";
    case "zusatz":
      return "Zusatzleistung";
    case "ideell":
      return "Nichts Materielles (Dank und Sichtbarkeit)";
  }
}

export const KANAL_KEYS = ["whatsapp", "email", "persoenlich", "karte"] as const;
export type KanalKey = (typeof KANAL_KEYS)[number];
export const isKanalKey = (v: unknown): v is KanalKey => typeof v === "string" && (KANAL_KEYS as readonly string[]).includes(v);

export function kanalLabel(key: KanalKey, verein = false): string {
  switch (key) {
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "E-Mail";
    case "persoenlich":
      return "Persönlich";
    case "karte":
      return verein ? "Karte beim Anlass" : "Karte beim Auftrag";
  }
}

/** Die Nummer gilt nur bei diesen Kanälen. */
export const NUMMER_KANAELE: readonly KanalKey[] = ["whatsapp", "karte"];
export const brauchtNummer = (kanal: KanalKey | ""): boolean => kanal !== "" && NUMMER_KANAELE.includes(kanal);

// ---- Formular -----------------------------------------------------------------------------------

export type FormFields = {
  kundenwert: string;
  marge: string;
  kundschaft: string;
  anreiz: AnreizKey | "";
  beide: boolean;
  kanal: KanalKey | "";
  nummer: string;
  anrede: Anrede | "";
};

export const EMPTY_FORM: FormFields = { kundenwert: "", marge: "", kundschaft: "", anreiz: "", beide: false, kanal: "", nummer: "", anrede: "" };

export type FeldKey = "firma" | "kundenwert" | "marge" | "kundschaft" | "anreiz" | "kanal" | "nummer" | "anrede";
export type Issue = { feld: FeldKey; text: string };

/**
 * Zahl aus einer Eingabe: Ziffern mit Komma oder Punkt als Dezimalzeichen; Apostroph und Leerzeichen als Tausendertrenner
 * fallen weg («3'000», «3 000», «3000,50»). null bei leerer oder unlesbarer Eingabe.
 */
export function parseNumber(raw: string): number | null {
  const s = (raw ?? "").trim().replace(/['’\s]/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const KEINE_ZAHL = "Das ist keine Zahl. Gib sie in Ziffern an, zum Beispiel 3000.";

export function kundenwertProblem(raw: string, verein = false): string | null {
  if (!(raw ?? "").trim()) return verein ? "Gib den Jahresbeitrag pro Mitglied an." : "Gib den Kundenwert pro Jahr an.";
  const n = parseNumber(raw);
  if (n === null) return KEINE_ZAHL;
  if (n < LIMITS.kundenwert.min || n > LIMITS.kundenwert.max) return `Der Betrag liegt zwischen ${chf(LIMITS.kundenwert.min)} und ${chf(LIMITS.kundenwert.max)}.`;
  return null;
}

export function margeProblem(raw: string): string | null {
  if (!(raw ?? "").trim()) return "Gib die Marge in Prozent an.";
  const n = parseNumber(raw);
  if (n === null) return KEINE_ZAHL;
  if (n < LIMITS.marge.min || n > LIMITS.marge.max) return `Die Marge liegt zwischen ${pctCH(LIMITS.marge.min, 0)} und ${pctCH(LIMITS.marge.max, 0)}.`;
  return null;
}

/** Die Zahl der Kundschaft ist freiwillig; wenn sie dasteht, muss sie eine ganze Zahl in den Grenzen sein. */
export function kundschaftProblem(raw: string): string | null {
  if (!(raw ?? "").trim()) return null;
  const n = parseNumber(raw);
  if (n === null || !Number.isInteger(n)) return "Gib die Zahl als ganze Zahl in Ziffern an, zum Beispiel 120.";
  if (n < LIMITS.kundschaft.min || n > LIMITS.kundschaft.max) return `Die Zahl liegt zwischen ${LIMITS.kundschaft.min} und ${LIMITS.kundschaft.max.toLocaleString("en-US").replace(/,/g, "'")}.`;
  return null;
}

/** Die Zahl der Kundschaft; null, wenn leer oder ungültig (dann gilt das Beispiel). */
export function kundschaftOf(form: Pick<FormFields, "kundschaft">): number | null {
  return kundschaftProblem(form.kundschaft) === null ? parseNumber(form.kundschaft) : null;
}

/** Die Nummer ist freiwillig, aber wenn sie bei WhatsApp oder Karte steht, muss sie eine Schweizer Nummer sein. */
export function nummerProblem(form: Pick<FormFields, "kanal" | "nummer">): string | null {
  if (!brauchtNummer(form.kanal) || !form.nummer.trim()) return null;
  return phoneProblem(form.nummer);
}

/** Erste Angabe, die fehlt oder nicht stimmt, ohne die Firma. null: in Ordnung. */
export function feldIssue(form: FormFields, verein = false): Issue | null {
  const k = kundenwertProblem(form.kundenwert, verein);
  if (k) return { feld: "kundenwert", text: k };
  const m = margeProblem(form.marge);
  if (m) return { feld: "marge", text: m };
  const ks = kundschaftProblem(form.kundschaft);
  if (ks) return { feld: "kundschaft", text: ks };
  if (!isAnreizKey(form.anreiz)) return { feld: "anreiz", text: "Wähle, was die Person als Dank bekommt." };
  if (!isKanalKey(form.kanal)) return { feld: "kanal", text: "Wähle, wie du um Empfehlungen bittest." };
  const n = nummerProblem(form);
  if (n) return { feld: "nummer", text: n };
  if (!isAnrede(form.anrede)) return { feld: "anrede", text: "Wähle die Anrede: Du oder Sie." };
  return null;
}

export function formIssue(form: FormFields, kontext: Pick<Kontext, "verein" | "firma">): Issue | null {
  if (!kontext.firma.trim()) return { feld: "firma", text: kontext.verein ? "Gib den Namen deines Vereins an." : "Gib den Namen deines Betriebs an." };
  return feldIssue(form, kontext.verein);
}

export function formProblem(form: FormFields, kontext: Pick<Kontext, "verein" | "firma">): string | null {
  return formIssue(form, kontext)?.text ?? null;
}

// ---- Rechnung -----------------------------------------------------------------------------------

export type Eingabe = { kundenwert: number; marge: number; anreiz: AnreizKey; beide: boolean };
export type Range = { min: number; max: number };

export type Rechnung = {
  kundenwert: number;
  marge: number;
  /** Kundenwert mal Marge, in Franken pro Jahr. */
  deckungsbeitrag: number;
  typ: AnreizKey;
  /** Was die Texte sagen: «ideell», wenn der Betrag zu klein ist. */
  wirksam: AnreizKey;
  beide: boolean;
  /** 10 bis 20 % des Deckungsbeitrags für beide Seiten zusammen, auf 5 Franken gerundet. */
  gesamt: Range | null;
  /** Je Seite; bei beide Seiten die Hälfte. */
  proSeite: Range | null;
  /** Mitte von proSeite, auf 5 Franken gerundet: der Betrag in den Vorlagen. */
  mitte: number | null;
  /** Der Betrag wäre unter 5 Franken. */
  zuKlein: boolean;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Rundet auf ein Vielfaches von `step` (Standard 5 Franken); 12.50 wird 15. */
export function roundTo(v: number, step: number = RUNDEN): number {
  return Math.round((v + 1e-9) / step) * step;
}

/** Aus den Eingaben; null bei Werten ausserhalb der Grenzen. */
export function toEingabe(form: FormFields): Eingabe | null {
  const kundenwert = parseNumber(form.kundenwert);
  const marge = parseNumber(form.marge);
  if (kundenwert === null || kundenwert < LIMITS.kundenwert.min || kundenwert > LIMITS.kundenwert.max) return null;
  if (marge === null || marge < LIMITS.marge.min || marge > LIMITS.marge.max) return null;
  if (!isAnreizKey(form.anreiz)) return null;
  return { kundenwert, marge, anreiz: form.anreiz, beide: form.beide === true };
}

/**
 * Deckungsbeitrag = Kundenwert mal Marge. Der Anreiz für eine erfolgreiche Empfehlung liegt bei 10 bis 20 % davon
 * (Richtwert von Alperna, keine Statistik), bei «beide Seiten» je Seite die Hälfte, auf 5 Franken gerundet. «Nichts
 * Materielles» hat keinen Betrag; ein Betrag unter 5 Franken je Person gilt als zu klein und fällt weg.
 */
export function rechne(input: Eingabe): Rechnung {
  const deckungsbeitrag = round2((input.kundenwert * input.marge) / 100);
  const base: Rechnung = {
    kundenwert: input.kundenwert,
    marge: input.marge,
    deckungsbeitrag,
    typ: input.anreiz,
    wirksam: "ideell",
    beide: input.beide,
    gesamt: null,
    proSeite: null,
    mitte: null,
    zuKlein: false,
  };
  if (input.anreiz === "ideell") return base;

  const teil = input.beide ? 2 : 1;
  const rawMin = (deckungsbeitrag * ANTEIL.min) / 100;
  const rawMax = (deckungsbeitrag * ANTEIL.max) / 100;
  const seiteMax = roundTo(rawMax / teil);
  if (seiteMax < RUNDEN) return { ...base, zuKlein: true };

  const proSeite: Range = { min: Math.max(roundTo(rawMin / teil), RUNDEN), max: seiteMax };
  const gesamt: Range = { min: Math.max(roundTo(rawMin), RUNDEN), max: roundTo(rawMax) };
  const mitte = Math.min(Math.max(roundTo((proSeite.min + proSeite.max) / 2), proSeite.min), proSeite.max);
  return { ...base, wirksam: input.anreiz, gesamt, proSeite, mitte };
}

// ---- Rechenmodell: was ein Empfehlungsprogramm bringt ---------------------------------------------

/** Dauer einer Kundenbeziehung im Modell, in Jahren. Richtwert von Alperna, keine Statistik. */
export const JAHRE = 3;
/** Beispielgrösse, wenn die Person keine Zahl angibt. */
export const BEISPIEL_KUNDSCHAFT = 100;
/**
 * Drei Szenarien: Anteil der Kundschaft, der pro Jahr eine neue Person bringt, die tatsächlich Kundschaft wird. Richtwerte von Alperna zum
 * Durchspielen, keine Statistik und keine Prognose.
 */
export const SZENARIEN = [
  { key: "vorsichtig", label: "Vorsichtig", prozent: 2 },
  { key: "realistisch", label: "Realistisch", prozent: 5 },
  { key: "mutig", label: "Mutig", prozent: 10 },
] as const;

export type SzenarioKey = (typeof SZENARIEN)[number]["key"];
export type Szenario = { key: SzenarioKey; label: string; prozent: number; neu: number; anreize: number; deckungsbeitrag: number; ergebnis: number };

export type Modell = {
  jahre: number;
  /** Umsatz einer gewonnenen Person in drei Jahren (Kundenwert mal Jahre). */
  umsatz: number;
  /** Deckungsbeitrag einer gewonnenen Person in drei Jahren. */
  deckungsbeitrag: number;
  /** Was der Anreiz für eine erfolgreiche Empfehlung kostet (alle Seiten zusammen, Mitte der Spanne); 0 ohne Betrag. */
  kosten: number;
  /** Deckungsbeitrag abzüglich Anreiz. */
  netto: number;
  /** Nach wie vielen Monaten der Anreiz aus dem Deckungsbeitrag zurückverdient ist; null ohne Betrag. */
  monate: number | null;
  kundschaft: number;
  /** true: Die Person hat keine Zahl angegeben, das Modell rechnet mit dem Beispiel. */
  beispiel: boolean;
  szenarien: Szenario[];
};

/** Rechnet in ganzen Franken und lässt Bruchteile von Personen stehen (Erwartungswert, keine Zählung). */
export function modell(r: Rechnung, kundschaft: number | null): Modell {
  const beispiel = kundschaft === null;
  const k = kundschaft ?? BEISPIEL_KUNDSCHAFT;
  const umsatz = round2(r.kundenwert * JAHRE);
  const deckungsbeitrag = round2(r.deckungsbeitrag * JAHRE);
  const kosten = r.mitte !== null && r.wirksam !== "ideell" ? round2(r.mitte * (r.beide ? 2 : 1)) : 0;
  const netto = round2(deckungsbeitrag - kosten);
  const monate = kosten > 0 && r.deckungsbeitrag > 0 ? Math.max(1, Math.ceil(kosten / (r.deckungsbeitrag / 12))) : null;
  const szenarien = SZENARIEN.map((s): Szenario => {
    const neu = (k * s.prozent) / 100;
    return {
      key: s.key,
      label: s.label,
      prozent: s.prozent,
      neu: Math.round(neu * 10) / 10,
      anreize: Math.round(neu * kosten),
      deckungsbeitrag: Math.round(neu * deckungsbeitrag),
      ergebnis: Math.round(neu * netto),
    };
  });
  return { jahre: JAHRE, umsatz, deckungsbeitrag, kosten, netto, monate, kundschaft: k, beispiel, szenarien };
}

/** «2» oder «0,4»: Personen mit einer Stelle nach dem Komma, wenn sie keine ganze Zahl sind. */
export function personenText(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

/** Das Modell als Bausteine für Bildschirm und Dokument: Kennzahl, drei Szenarien als Balken, Annahmen. */
export function modellBlocks(r: Rechnung, kundschaft: number | null, verein = false): DocBlock[] {
  const b = begriffe(verein);
  const m = modell(r, kundschaft);
  const note =
    m.kosten > 0
      ? `Deckungsbeitrag in ${m.jahre} Jahren ${chf(m.deckungsbeitrag)}, abzüglich ${chf(m.kosten)} Anreiz${m.monate !== null ? `. Der Anreiz ist nach ${m.monate} ${m.monate === 1 ? "Monat" : "Monaten"} zurückverdient.` : "."}`
      : `Deckungsbeitrag in ${m.jahre} Jahren ${chf(m.deckungsbeitrag)}. Der Anreiz kostet kein Geld, nur etwas Zeit.`;
  return [
    { type: "heading", level: 1, text: "Was es dir bringt" },
    { type: "stat", label: `Eine ${b.gewonnen} bringt dir netto`, value: chf(m.netto), band: `in ${m.jahre} Jahren`, note },
    {
      type: "bars",
      title: `Drei Szenarien für ein Jahr, ${m.beispiel ? `Beispiel mit ${m.kundschaft} ${verein ? "Mitgliedern" : "Kundinnen und Kunden"}` : `bei ${m.kundschaft} ${verein ? "Mitgliedern" : "Kundinnen und Kunden"}`}`,
      unit: "CHF",
      items: m.szenarien.map((s) => ({
        label: `${s.label}: ${s.prozent} % empfehlen`,
        value: Math.max(0, s.ergebnis),
        note: `${personenText(s.neu)} ${b.neu}, Anreize ${chf(s.anreize)}, Deckungsbeitrag in ${m.jahre} Jahren ${chf(s.deckungsbeitrag)}`,
      })),
    },
    {
      type: "paragraph",
      text: `${RICHTWERT_NOTE}: ${m.jahre} Jahre Beziehung und ${SZENARIEN.map((s) => `${s.prozent} %`).join(", ")} der ${verein ? "Mitglieder" : "Kundschaft"}, die pro Jahr jemanden bringen, sind Annahmen zum Durchspielen, keine Prognose.${m.beispiel ? " Gib deine Zahl an, dann rechnet das Werkzeug mit ihr." : ""}`,
    },
  ];
}

export function spanneText(r: Range): string {
  return r.min === r.max ? chf(r.min) : `${chf(r.min)} bis ${chf(r.max)}`;
}

/** Drei Formen der Anerkennung ohne Betrag. */
export function anerkennung(verein = false): string[] {
  return [
    "Dank von Hand: eine kurze, persönliche Karte oder Nachricht.",
    "Nennung im Newsletter, nur mit dem Einverständnis der Person.",
    verein ? "Einladung zu einem Anlass des Vereins." : "Einladung zu einem Anlass im Betrieb.",
  ];
}

/** Die Zeile über dem Anreiz-Kasten: Spanne mit Bezug, oder «ohne Betrag». */
export function anreizZeile(r: Rechnung): string {
  if (!r.proSeite) return "Ohne Betrag: Dank und Sichtbarkeit";
  return `${spanneText(r.proSeite)} ${r.beide ? "je Seite" : "je erfolgreiche Empfehlung"}`;
}

/** Begründung der Spanne in Absätzen: Rechnung, Aufteilung, Richtwert. */
export function begruendung(r: Rechnung, verein = false): string[] {
  const rechnung = `Bei ${verein ? "einem Jahresbeitrag" : "einem Kundenwert"} von ${chf(r.kundenwert)} und einer Marge von ${pctCH(r.marge)} bleiben ${chf(r.deckungsbeitrag)} Deckungsbeitrag im Jahr.`;
  if (r.typ === "ideell") {
    return [`${rechnung} Du hast einen Anreiz ohne Betrag gewählt, darum rechnet das Werkzeug keinen Betrag aus. Drei Formen der Anerkennung:`];
  }
  if (r.zuKlein || !r.proSeite || !r.gesamt || r.mitte === null) {
    return [
      `${rechnung} ${ANTEIL.min} bis ${ANTEIL.max} % davon ergeben weniger als ${chf(RUNDEN)} je Person. Das ist kein Betrag, der als Anreiz wirkt. Wähle eine Form der Anerkennung ohne Betrag:`,
    ];
  }
  const out = [`${rechnung} Für eine erfolgreiche Empfehlung rechnest du mit ${ANTEIL.min} bis ${ANTEIL.max} % davon: ${spanneText(r.gesamt)}.`];
  out.push(
    r.beide
      ? `Du belohnst beide Seiten, darum bekommt jede Seite die Hälfte: ${spanneText(r.proSeite)}. In den Vorlagen steht die Mitte der Spanne, ${chf(r.mitte)} je Person.`
      : `In den Vorlagen steht die Mitte der Spanne, ${chf(r.mitte)}. Ändere den Betrag im Text, wenn du einen anderen wählst.`,
  );
  return out;
}

/** Der Hinweis zum Richtwert unter jeder Spanne; ohne Betrag gibt es keinen. */
export function richtwertHinweis(r: Rechnung): string | null {
  if (r.typ === "ideell") return null;
  return `${RICHTWERT_NOTE}: Die Spanne von ${ANTEIL.min} bis ${ANTEIL.max} % des Deckungsbeitrags ist eine Einschätzung von Alperna, keine Auswertung von Daten.`;
}

// ---- Mechanik -----------------------------------------------------------------------------------

export type Schritt = { titel: string; text: string };

/** Die fünf Schritte vom abgeschlossenen Auftrag bis zum Dank, je ein Satz, mit dem gewählten Kanal. */
export function mechanik(o: { kanal: KanalKey; beide: boolean; verein: boolean }): Schritt[] {
  const { kanal, beide, verein } = o;
  const bitte: Record<KanalKey, string> = {
    whatsapp: `Du schickst eine WhatsApp-Nachricht mit der Bitte um Empfehlung und nennst den Anreiz (Vorlage «Bitte um Empfehlung»).`,
    email: `Du schickst eine E-Mail mit der Bitte um Empfehlung und nennst den Anreiz (Vorlage «Bitte um Empfehlung»).`,
    persoenlich: verein
      ? `Du bittest persönlich um eine Empfehlung, zum Beispiel nach dem Anlass, und nennst den Anreiz.`
      : `Du bittest bei der Übergabe persönlich um eine Empfehlung und nennst den Anreiz.`,
    karte: verein
      ? `Du gibst die Karte A6 beim Anlass mit, bittest persönlich um eine Empfehlung und nennst den Anreiz.`
      : `Du gibst die Karte A6 beim Auftrag mit, bittest persönlich um eine Empfehlung und nennst den Anreiz.`,
  };
  const meldung: Record<KanalKey, string> = {
    whatsapp: `Die empfohlene Person schreibt dir auf WhatsApp und nennt, wer sie geschickt hat.`,
    email: `Die empfohlene Person schreibt dir eine E-Mail und nennt, wer sie geschickt hat.`,
    persoenlich: `Die empfohlene Person spricht dich an oder ruft an und nennt, wer sie geschickt hat.`,
    karte: `Die empfohlene Person scannt den Code auf der Karte, meldet sich und nennt, wer sie geschickt hat.`,
  };
  const wen = beide ? "bei beiden" : "bei der empfehlenden Person";
  const dank: Record<KanalKey, string> = {
    whatsapp: `Du bedankst dich per WhatsApp ${wen} (Vorlage «Dank») und setzt den Anreiz um.`,
    email: `Du bedankst dich per E-Mail ${wen} (Vorlage «Dank») und setzt den Anreiz um.`,
    persoenlich: `Du bedankst dich persönlich ${wen} und setzt den Anreiz um.`,
    karte: `Du bedankst dich mit ein paar handgeschriebenen Zeilen ${wen} und setzt den Anreiz um.`,
  };
  return [
    {
      titel: verein ? "Mitglied ist zufrieden" : "Auftrag abgeschlossen",
      text: verein ? "Ein Anlass ist gelungen, und das Mitglied ist gern dabei." : "Der Auftrag ist erledigt, und die Kundschaft hat das Ergebnis gesehen.",
    },
    { titel: "Bitte um Empfehlung", text: bitte[kanal] },
    { titel: "Empfohlene Person meldet sich mit Hinweis", text: meldung[kanal] },
    {
      titel: verein ? "Eintritt kommt zustande" : "Auftrag kommt zustande",
      text: verein
        ? "Du antwortest wie bei jeder Anfrage, und die Person tritt ein. Der Anreiz gilt erst, wenn der Eintritt steht."
        : "Du machst die Offerte wie bei jeder Anfrage. Der Anreiz gilt erst, wenn der Auftrag steht.",
    },
    { titel: beide ? "Dank und Anreiz an beide" : "Dank und Anreiz an die empfehlende Person", text: dank[kanal] },
  ];
}

/** Die Schritte als nummerierte Liste für das Dokument. */
export function mechanikItems(o: { kanal: KanalKey; beide: boolean; verein: boolean }): string[] {
  return mechanik(o).map((s) => `${s.titel}: ${s.text}`);
}

// ---- Dank-Satz und Vorlagen ---------------------------------------------------------------------

export type Sicht = "empfehlende" | "empfohlene";

/** Wer den Dank bekommt (Akkusativ) und wessen Wahl bei der Spende gilt. */
function empfaenger(anrede: Anrede, beide: boolean, sicht: Sicht): { wer: string; wahl: string } {
  const du = anrede === "du";
  const ich = du ? "dich" : "Sie";
  const plural = du ? "eurer Wahl" : "Ihrer Wahl";
  if (sicht === "empfehlende") {
    return { wer: beide ? `${ich} und die empfohlene Person` : ich, wahl: beide ? plural : du ? "deiner Wahl" : "Ihrer Wahl" };
  }
  const person = `die Person, die ${ich} geschickt hat,`;
  return { wer: beide ? `${ich} und ${person}` : person, wahl: beide ? plural : "ihrer Wahl" };
}

/**
 * Ein Satz, der den Anreiz nennt. `betrag` ist der Betrag je Person; null lässt ihn weg (Karte). Endet nie mit dem Betrag,
 * damit kein «CHF 60.-.» entsteht.
 */
export function dankSatz(typ: AnreizKey, betrag: number | null, o: { anrede: Anrede; beide: boolean; verein: boolean; sicht: Sicht }): string {
  const { wer, wahl } = empfaenger(o.anrede, o.beide, o.sicht);
  const je = o.beide ? "je " : "";
  switch (typ) {
    case "rabatt": {
      const was = betrag !== null ? `${je}${chf(betrag)} ${o.verein ? "Ermässigung" : "Rabatt"}` : `${je}${o.verein ? "eine Ermässigung" : "einen Rabatt"}`;
      return `Als Dank gibt es für ${wer} ${was} auf den nächsten ${o.verein ? "Jahresbeitrag" : "Auftrag"}.`;
    }
    case "gutschein":
      return `Als Dank gibt es für ${wer} ${betrag !== null ? `${je}${chf(betrag)} als Gutschein` : `${je}einen Gutschein`}.`;
    case "zusatz":
      return `Als Dank gibt es für ${wer} ${betrag !== null ? `${je}eine Zusatzleistung im Wert von ${chf(betrag)}` : `${je}eine Zusatzleistung`} nach Absprache.`;
    case "spende":
      return `Als Dank spenden wir für ${wer} ${betrag !== null ? `${je}${chf(betrag)}` : o.beide ? "je einen Betrag" : "einen Betrag"} an einen Verein ${wahl}.`;
    case "ideell":
      return `Als Dank gibt es für ${wer} ${je}ein persönliches Dankeschön von uns.`;
  }
}

export const TEMPLATE_KEYS = ["bitte", "empfohlene", "dank"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);

export const TEMPLATE_INFO: Record<TemplateKey, { label: string; vereinLabel: string; copyLabel: string }> = {
  bitte: { label: "Bitte um Empfehlung nach dem Auftrag", vereinLabel: "Bitte um Empfehlung", copyLabel: "Bitte um Empfehlung kopieren" },
  empfohlene: { label: "Nachricht an die empfohlene Person", vereinLabel: "Nachricht an die empfohlene Person", copyLabel: "Nachricht an Empfohlene kopieren" },
  dank: { label: "Dankesnachricht", vereinLabel: "Dankesnachricht", copyLabel: "Dank kopieren" },
};

export const templateLabel = (key: TemplateKey, verein = false): string => (verein ? TEMPLATE_INFO[key].vereinLabel : TEMPLATE_INFO[key].label);

/**
 * Platzhalter in den Vorlagen: [Anreiz], [Firma] und [Link] setzt das Werkzeug ein, [Name] schreibt die Person von Hand.
 * Ohne Link fällt die Zeile mit [Link] weg.
 */
export const PLATZHALTER_AUTO = ["[Anreiz]", "[Firma]", "[Link]"] as const;
export const PLATZHALTER_HAND = "[Name]";

export const TEMPLATES: Record<"kmu" | "verein", Record<Anrede, Record<TemplateKey, string>>> = {
  kmu: {
    du: {
      bitte:
        "Hallo [Name]\n\nDanke für deinen Auftrag. Wir hoffen, du bist zufrieden.\nKennst du jemanden, der Ähnliches braucht? Wir freuen uns über jede Empfehlung.\n[Anreiz]\nSo erreicht man uns direkt: [Link]\n\nFreundliche Grüsse\n[Firma]",
      empfohlene:
        "Hallo [Name]\n\nSchön, dass du dich bei [Firma] meldest. Wir kümmern uns gern um dein Anliegen.\nSag uns bitte kurz, wer dich zu uns geschickt hat.\n[Anreiz]\nDu erreichst uns direkt hier: [Link]\n\nFreundliche Grüsse\n[Firma]",
      dank: "Hallo [Name]\n\nDanke, dass du uns weiterempfohlen hast. Die Empfehlung hat zu einem Auftrag geführt, und wir freuen uns darüber.\n[Anreiz]\nMelde dich bei uns, wenn du dazu Fragen hast.\n\nFreundliche Grüsse\n[Firma]",
    },
    sie: {
      bitte:
        "Guten Tag [Name]\n\nDanke für Ihren Auftrag. Wir hoffen, Sie sind zufrieden.\nKennen Sie jemanden, der Ähnliches braucht? Wir freuen uns über jede Empfehlung.\n[Anreiz]\nSo erreicht man uns direkt: [Link]\n\nFreundliche Grüsse\n[Firma]",
      empfohlene:
        "Guten Tag [Name]\n\nSchön, dass Sie sich bei [Firma] melden. Wir kümmern uns gern um Ihr Anliegen.\nSagen Sie uns bitte kurz, wer Sie zu uns geschickt hat.\n[Anreiz]\nSie erreichen uns direkt hier: [Link]\n\nFreundliche Grüsse\n[Firma]",
      dank: "Guten Tag [Name]\n\nDanke, dass Sie uns weiterempfohlen haben. Die Empfehlung hat zu einem Auftrag geführt, und wir freuen uns darüber.\n[Anreiz]\nMelden Sie sich bei uns, wenn Sie dazu Fragen haben.\n\nFreundliche Grüsse\n[Firma]",
    },
  },
  verein: {
    du: {
      bitte:
        "Hallo [Name]\n\nSchön, dass du bei [Firma] dabei bist. Wir hoffen, es gefällt dir.\nKennst du jemanden, die oder der gern bei uns mitmachen würde? Wir freuen uns über jede Empfehlung.\n[Anreiz]\nSo erreicht man uns direkt: [Link]\n\nFreundliche Grüsse\n[Firma]",
      empfohlene:
        "Hallo [Name]\n\nSchön, dass du dich bei [Firma] meldest. Wir erzählen dir gern, wie es bei uns läuft.\nSag uns bitte kurz, wer dich zu uns geschickt hat.\n[Anreiz]\nDu erreichst uns direkt hier: [Link]\n\nFreundliche Grüsse\n[Firma]",
      dank: "Hallo [Name]\n\nDanke, dass du uns weiterempfohlen hast. Die Empfehlung hat zu einem Eintritt geführt, und wir freuen uns darüber.\n[Anreiz]\nMelde dich bei uns, wenn du dazu Fragen hast.\n\nFreundliche Grüsse\n[Firma]",
    },
    sie: {
      bitte:
        "Guten Tag [Name]\n\nSchön, dass Sie bei [Firma] dabei sind. Wir hoffen, es gefällt Ihnen.\nKennen Sie jemanden, die oder der gern bei uns mitmachen würde? Wir freuen uns über jede Empfehlung.\n[Anreiz]\nSo erreicht man uns direkt: [Link]\n\nFreundliche Grüsse\n[Firma]",
      empfohlene:
        "Guten Tag [Name]\n\nSchön, dass Sie sich bei [Firma] melden. Wir erzählen Ihnen gern, wie es bei uns läuft.\nSagen Sie uns bitte kurz, wer Sie zu uns geschickt hat.\n[Anreiz]\nSie erreichen uns direkt hier: [Link]\n\nFreundliche Grüsse\n[Firma]",
      dank: "Guten Tag [Name]\n\nDanke, dass Sie uns weiterempfohlen haben. Die Empfehlung hat zu einem Eintritt geführt, und wir freuen uns darüber.\n[Anreiz]\nMelden Sie sich bei uns, wenn Sie dazu Fragen haben.\n\nFreundliche Grüsse\n[Firma]",
    },
  },
};

/**
 * Setzt Firma, Anreiz und Link ein. typoCH läuft über den Text, nie über den Link (Prozentzeichen in Adressen).
 * [Name] bleibt stehen.
 */
export function fillTemplate(template: string, v: { firma: string; anreiz: string; link: string }): string {
  const link = v.link.trim();
  const lines = link ? template.split("\n") : template.split("\n").filter((l) => !l.includes("[Link]"));
  const text = lines
    .join("\n")
    .replace(/\[(Firma|Anreiz)\]/g, (_m, key: string) => (key === "Firma" ? v.firma.trim() : v.anreiz));
  return typoCH(text).replace(/\[Link\]/g, () => link);
}

export type Texte = Record<TemplateKey, string>;

/** Die drei Vorlagen einer Anrede mit Firma, Dank-Satz und Link. */
export function buildTexts(o: { anrede: Anrede; rechnung: Rechnung; kontext: Pick<Kontext, "verein" | "firma">; ziel: Ziel | null }): Texte {
  const org = o.kontext.verein ? "verein" : "kmu";
  const link = o.ziel?.linkKurz ?? "";
  const fill = (key: TemplateKey): string => {
    const anreiz = dankSatz(o.rechnung.wirksam, o.rechnung.mitte, {
      anrede: o.anrede,
      beide: o.rechnung.beide,
      verein: o.kontext.verein,
      sicht: key === "empfohlene" ? "empfohlene" : "empfehlende",
    });
    return fillTemplate(TEMPLATES[org][o.anrede][key], { firma: o.kontext.firma, anreiz, link });
  };
  return { bitte: fill("bitte"), empfohlene: fill("empfohlene"), dank: fill("dank") };
}

/** Hinweis zum Versand per E-Mail (nur bei dem Kanal E-Mail). Keine Rechtsaussage über den Satz hinaus. */
export function emailHinweis(verein = false): string {
  return `Versand nur an Personen, die dir ihre Adresse im Rahmen ${verein ? "der Mitgliedschaft" : "eines Auftrags"} gegeben haben; Werbung per E-Mail hat Regeln; ein Werkzeug dazu ist geplant.`;
}

/** Hinweise unter dem Ergebnis: Praxis, keine Rechtsaussage. */
export function hinweise(o: { kanal: KanalKey; verein: boolean }): string[] {
  const out = [
    o.verein
      ? "Lege vorher fest, wann der Anreiz fällig ist: wenn die empfohlene Person eingetreten ist oder erst nach dem ersten Jahresbeitrag. Sag es schon in der Bitte um Empfehlung."
      : "Lege vorher fest, wann der Anreiz fällig ist: wenn der Auftrag der empfohlenen Person steht oder erst nach der Zahlung. Sag es schon in der Bitte um Empfehlung.",
    o.verein
      ? "Frag bei jedem Anlass. Ein Programm, das nicht erwähnt wird, bleibt unbekannt."
      : "Frag nach jedem Auftrag. Ein Programm, das nicht erwähnt wird, bleibt unbekannt.",
    "Zähle nach drei Monaten nach: Wie viele Empfehlungen, wie viele Aufträge? Passe den Betrag danach an.",
  ];
  if (o.kanal === "email") out.push(emailHinweis(o.verein));
  return out;
}

// ---- Ziel des QR-Codes --------------------------------------------------------------------------

export type Ziel = {
  art: "whatsapp" | "website";
  /** Was im QR-Code steht; bei WhatsApp mit vorausgefülltem Satz. */
  url: string;
  /** Der Link in den Texten: bei WhatsApp ohne Satz, damit er kurz bleibt. */
  linkKurz: string;
  /** Was auf der Karte als Kontakt steht. */
  anzeige: string;
};

/** Der Satz, den der QR-Code in WhatsApp vorausfüllt: Die empfohlene Person ergänzt, wer sie geschickt hat. */
export function empfehlungsSatz(firma: string, verein = false): string {
  const f = firma.trim();
  return verein
    ? `Guten Tag${f ? ` ${f}` : ""}, ich interessiere mich für den Verein. Empfohlen hat mich …`
    : `Guten Tag${f ? ` ${f}` : ""}, ich komme auf Empfehlung von …`;
}

/** Nur bei WhatsApp und Karte gilt die Nummer; bei E-Mail und persönlich bleibt sie ausser Acht. */
export const nummerFuerKanal = (form: Pick<FormFields, "kanal" | "nummer">): string => (brauchtNummer(form.kanal) ? form.nummer.trim() : "");

/** QR-Ziel: die gültige Nummer als wa.me-Link, sonst die Website, sonst keines (null). */
export function zielOf(nummer: string, website: string, kontext: Pick<Kontext, "firma" | "verein">): Ziel | null {
  const phone = nummer.trim() ? normalizePhone(nummer) : null;
  if (phone) {
    return {
      art: "whatsapp",
      url: buildWaLink(phone.e164, empfehlungsSatz(kontext.firma, kontext.verein)),
      linkKurz: buildWaLink(phone.e164),
      anzeige: `WhatsApp ${phone.display}`,
    };
  }
  const u = website.trim() ? parseHttpUrl(website) : null;
  if (u) return { art: "website", url: u.href, linkKurz: u.href, anzeige: displayOf(u) };
  return null;
}

export function zielFor(form: Pick<FormFields, "kanal" | "nummer">, kontext: Kontext): Ziel | null {
  return zielOf(nummerFuerKanal(form), kontext.website, kontext);
}

export function zielHinweis(ziel: Ziel | null): string {
  if (!ziel) return "Ohne gültige Nummer und ohne Website bleibt der QR-Code auf der Karte weg. Trag eine Nummer oder deine Website ein, wenn du ihn willst.";
  return ziel.art === "whatsapp"
    ? `Der QR-Code öffnet einen WhatsApp-Chat mit ${ziel.anzeige.replace("WhatsApp ", "")} und dem Satz «ich komme auf Empfehlung von …».`
    : `Der QR-Code führt auf ${ziel.anzeige}. Mit einer WhatsApp-Nummer führt er stattdessen in einen Chat.`;
}

// ---- Karte A6 -----------------------------------------------------------------------------------

export type KartenInhalt = {
  firma: string;
  titel: string;
  anreiz: string;
  scanHinweis: string;
  /** Adresse im QR-Code; null: kein Code. */
  qr: string | null;
  /** Kontakt unter dem Code; leer, wenn es keinen gibt. */
  kontakt: string;
  rueckTitel: string;
  /** Mechanik in drei Zeilen. */
  rueck: [string, string, string];
};

export const KARTE_SCAN = "Kamera auf den Code richten";

/** Was auf der Karte steht: Vorderseite mit Satz, Anreiz ohne Betrag, QR und Kontakt; Rückseite mit drei Zeilen. */
export function kartenInhalt(o: { anrede: Anrede; rechnung: Rechnung; kontext: Pick<Kontext, "verein" | "firma">; ziel: Ziel | null }): KartenInhalt {
  const du = o.anrede === "du";
  const { verein } = o.kontext;
  const beide = o.rechnung.beide;
  const euch = beide ? (du ? "euch beiden" : "Ihnen beiden") : du ? "dir" : "Ihnen";
  return {
    firma: o.kontext.firma,
    titel: du ? "Danke, dass du uns weiterempfiehlst" : "Danke, dass Sie uns weiterempfehlen",
    anreiz: dankSatz(o.rechnung.wirksam, null, { anrede: o.anrede, beide, verein, sicht: "empfehlende" }),
    scanHinweis: KARTE_SCAN,
    qr: o.ziel?.url ?? null,
    kontakt: o.ziel?.anzeige ?? "",
    rueckTitel: "So geht es",
    rueck: [
      du
        ? verein
          ? "Gib die Karte jemandem weiter, die oder der gern bei uns mitmachen würde."
          : "Gib die Karte jemandem weiter, der Ähnliches braucht."
        : verein
          ? "Geben Sie die Karte jemandem weiter, die oder der gern bei uns mitmachen würde."
          : "Geben Sie die Karte jemandem weiter, der Ähnliches braucht.",
      du ? "Die Person meldet sich bei uns und sagt, dass du sie geschickt hast." : "Die Person meldet sich bei uns und sagt, dass Sie sie geschickt haben.",
      verein ? `Tritt die Person ein, bedanken wir uns bei ${euch}.` : `Kommt ein Auftrag zustande, bedanken wir uns bei ${euch}.`,
    ],
  };
}

// ---- Dokument und CRM ---------------------------------------------------------------------------

export function docFilename(firma: string): string {
  return `empfehlungsprogramm-${safeFilename(firma, "betrieb")}`;
}

export function kartenFilename(firma: string): string {
  return `empfehlungskarte-a6-${safeFilename(firma, "betrieb")}.pdf`;
}

export type DocInput = { rechnung: Rechnung; kontext: Kontext; form: FormFields; anrede: Anrede; texte: Texte };

/** Der Einseiter: Titel, Angaben, Anreiz, Mechanik als nummerierte Liste, Vorlagen, Hinweise. */
export function toDocument(o: DocInput): DocumentModel {
  const { rechnung: r, kontext: k, form } = o;
  const b = begriffe(k.verein);
  const kanal = isKanalKey(form.kanal) ? form.kanal : "whatsapp";
  const firma = k.firma;
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: b.betrieb, value: firma || "keine Angabe" },
        { label: b.wert, value: chf(r.kundenwert) },
        { label: "Marge", value: pctCH(r.marge) },
        { label: "Anreiz", value: `${anreizLabel(r.typ, k.verein)}${r.beide ? ", beide Seiten belohnt" : ""}` },
        { label: "Kanal der Ansprache", value: kanalLabel(kanal, k.verein) },
      ],
    },
    { type: "heading", level: 1, text: "Anreiz" },
    ...begruendung(r, k.verein).map((text): DocBlock => ({ type: "paragraph", text })),
  ];
  if (r.wirksam === "ideell") blocks.push({ type: "list", items: anerkennung(k.verein) });
  const richtwert = richtwertHinweis(r);
  if (richtwert) blocks.push({ type: "paragraph", text: richtwert });
  // In der Datei steht das Modell nach dem Ablauf: Der Server kürzt die Ausgabe fürs CRM auf 1'900 Zeichen, Anreiz und Ablauf müssen davor stehen.
  blocks.push(
    { type: "heading", level: 1, text: "Ablauf in fünf Schritten" },
    { type: "list", ordered: true, items: mechanikItems({ kanal, beide: r.beide, verein: k.verein }) },
    ...modellBlocks(r, kundschaftOf(form), k.verein),
    { type: "heading", level: 1, text: `Textvorlagen (${anredeLabel(o.anrede)})` },
    { type: "paragraph", text: `Ersetze ${PLATZHALTER_HAND} vor dem Versand${r.mitte !== null ? ` und prüfe den Betrag (Mitte der Spanne: ${chf(r.mitte)})` : ""}.` },
  );
  for (const key of TEMPLATE_KEYS) {
    blocks.push({ type: "heading", level: 2, text: templateLabel(key, k.verein) }, { type: "paragraph", text: o.texte[key] });
  }
  blocks.push({ type: "heading", level: 1, text: "Hinweise" }, { type: "list", items: hinweise({ kanal, verein: k.verein }) });

  return {
    title: firma ? `Empfehlungsprogramm ${firma}` : "Empfehlungsprogramm",
    subtitle: r.proSeite ? `Anreiz: ${anreizZeile(r)}` : "Anreiz: Dank und Sichtbarkeit, ohne Betrag",
    firma: firma || undefined,
    filename: docFilename(firma),
    blocks,
  };
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(o: DocInput): string {
  return toMarkdown(toDocument(o));
}

/** Alles, was Dokument und Karte aus Formular und Profil brauchen; null bei ungültigen Angaben. */
export function programm(form: FormFields, kontext: Kontext, anrede: Anrede): DocInput | null {
  const eingabe = toEingabe(form);
  if (!eingabe) return null;
  const rechnung = rechne(eingabe);
  const ziel = zielFor(form, kontext);
  return { rechnung, kontext, form, anrede, texte: buildTexts({ anrede, rechnung, kontext, ziel }) };
}

/** Die Angaben fürs CRM, eine je Zeile. */
export function eingabeText(form: FormFields, kontext: Pick<Kontext, "verein" | "firma" | "website">): string {
  const b = begriffe(kontext.verein);
  const kw = parseNumber(form.kundenwert);
  const marge = parseNumber(form.marge);
  const lines = [
    `${b.betrieb}: ${kontext.firma.trim() || "keine Angabe"}`,
    `Website: ${kontext.website.trim() || "keine Angabe"}`,
    `${b.wert}: ${kw !== null ? chf(kw) : form.kundenwert.trim() || "keine Angabe"}`,
    `Marge: ${marge !== null ? pctCH(marge) : form.marge.trim() || "keine Angabe"}`,
    `Kundschaft pro Jahr: ${form.kundschaft.trim() || "keine Angabe (Beispiel mit 100)"}`,
    `Anreiz: ${isAnreizKey(form.anreiz) ? anreizLabel(form.anreiz, kontext.verein) : "keine Angabe"}`,
    `Beide Seiten belohnen: ${form.beide ? "ja" : "nein"}`,
    `Kanal: ${isKanalKey(form.kanal) ? kanalLabel(form.kanal, kontext.verein) : "keine Angabe"}`,
  ];
  if (brauchtNummer(form.kanal)) lines.push(`WhatsApp-Nummer: ${form.nummer.trim() || "keine Angabe"}`);
  lines.push(`Anrede: ${isAnrede(form.anrede) ? anredeLabel(form.anrede) : "keine Angabe"}`);
  return lines.join("\n");
}

/** Das Ergebnis fürs CRM: der Einseiter als Markdown, das Wichtigste (Anreiz) steht oben. */
export const ausgabeText = reportMarkdown;

// ---- Gespeicherter Stand ------------------------------------------------------------------------

export type EmpfehlungState = { v: 1; phase: "edit" | "result"; form: FormFields };
export const EMPTY_STATE: EmpfehlungState = { v: 1, phase: "edit", form: EMPTY_FORM };

const clip = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Stand unter mt:empfehlungsprogramm. Kaputte Daten ergeben den leeren Stand; «result» gilt nur mit gültigen Angaben. */
export function parseState(raw: unknown): EmpfehlungState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const s = raw as Record<string, unknown>;
  if (s.v !== 1 || typeof s.form !== "object" || s.form === null || Array.isArray(s.form)) return EMPTY_STATE;
  const f = s.form as Record<string, unknown>;
  const form: FormFields = {
    kundenwert: clip(f.kundenwert, MAX_ZAHL),
    marge: clip(f.marge, MAX_ZAHL),
    kundschaft: clip(f.kundschaft, MAX_ZAHL),
    anreiz: isAnreizKey(f.anreiz) ? f.anreiz : "",
    beide: f.beide === true,
    kanal: isKanalKey(f.kanal) ? f.kanal : "",
    nummer: clip(f.nummer, MAX_NUMMER),
    anrede: isAnrede(f.anrede) ? f.anrede : "",
  };
  return { v: 1, phase: s.phase === "result" && feldIssue(form) === null ? "result" : "edit", form };
}
