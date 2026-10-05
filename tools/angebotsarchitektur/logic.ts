import { chf, numberCH, pctCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";

// Angebotsarchitektur und Preisstrategie: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Alles rechnet im Browser (Klasse C, keine KI). Die Preisabstände (Einstieg 40 bis 60 %, Premium 180 bis 250 % vom
// Kern-Preis) sind eine Faustregel von Alperna, keine Statistik und keine Marktaussage. Die Zielmarge ist die Annahme der
// Person, kein Richtwert. Das Werkzeug sagt nichts über rechtliche Vorgaben zur Preisangabe (Harte Regel 8).
// Spec: specs/angebotsarchitektur.md

export const SLUG = "angebotsarchitektur";
export const FAUSTREGEL_SATZ = "Die Preisabstände sind eine Faustregel von Alperna, keine Statistik und keine Marktaussage.";
export const ZIELMARGE_NOTE = "Deine Annahme, kein Richtwert";

export const LIMITS = {
  leistungen: { min: 1, max: 6 },
  name: { min: 3, max: 60 },
  preis: { max: 10_000_000 },
  aufwand: { max: 10_000 },
  kosten: { max: 10_000_000 },
  satz: { min: 0, max: 500 },
  zielmarge: { min: 5, max: 90, standard: 30 },
} as const;

/** Faustregel von Alperna, keine Statistik: Anteil am Kern-Preis. Gezeigt wird die Mitte, geprüft wird die Spanne. */
export const FAKTOREN = {
  einstieg: { min: 0.4, mittel: 0.5, max: 0.6 },
  premium: { min: 1.8, mittel: 2.0, max: 2.5 },
} as const;

const EPS = 1e-9;

// ---- Formen, Stufen ------------------------------------------------------------------------------

export const FORM_KEYS = ["einzel", "pakete", "abo"] as const;
export type FormKey = (typeof FORM_KEYS)[number];

export const STUFEN = ["einstieg", "kern", "premium"] as const;
export type StufeKey = (typeof STUFEN)[number];

export type FormDef = {
  key: FormKey;
  label: string;
  /** Beschriftung der drei Stufen. */
  stufen: Record<StufeKey, string>;
  /** Hängt am Preis, leer bei einmaligen Preisen. */
  einheit: string;
  /** Hilfetext im Formular. */
  hinweis: string;
  /** Beispieltext im Namensfeld. */
  beispiel: string;
};

export const FORMEN: FormDef[] = [
  {
    key: "einzel",
    label: "Einzelleistungen",
    stufen: { einstieg: "Einstieg", kern: "Kern", premium: "Premium" },
    einheit: "",
    hinweis: "Du verkaufst einzelne Leistungen. Die Stufen heissen Einstieg, Kern und Premium.",
    beispiel: "Zum Beispiel: Fassade streichen",
  },
  {
    key: "pakete",
    label: "Pakete",
    stufen: { einstieg: "Basis", kern: "Standard", premium: "Komplett" },
    einheit: "",
    hinweis: "Du bündelst Leistungen zu Paketen. Die Stufen heissen Basis, Standard und Komplett.",
    beispiel: "Zum Beispiel: Paket Fassade komplett",
  },
  {
    key: "abo",
    label: "Abo oder Betreuung",
    stufen: { einstieg: "Basis", kern: "Standard", premium: "Komplett" },
    einheit: "pro Monat",
    hinweis: "Du verkaufst eine Betreuung oder ein Abo. Preis, Aufwand und Kosten gelten pro Monat; die Stufen heissen Basis, Standard und Komplett.",
    beispiel: "Zum Beispiel: Betreuung pro Monat",
  },
];

export function formDef(key: FormKey): FormDef {
  return FORMEN.find((f) => f.key === key) ?? FORMEN[0];
}

export const isFormKey = (v: unknown): v is FormKey => typeof v === "string" && (FORM_KEYS as readonly string[]).includes(v);

export function stufenLabel(form: FormKey, key: StufeKey): string {
  return formDef(form).stufen[key];
}

/** Reihenfolge der Spalten in der Ausgabe: mit Anker steht das Premium links. */
export function reihenfolge(anker: boolean): StufeKey[] {
  return anker ? ["premium", "kern", "einstieg"] : ["einstieg", "kern", "premium"];
}

// ---- Zahlen ----------------------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** «40 bis 60 %» */
export const spanneText = (s: { min: number; max: number }) => `${numberCH(s.min * 100, 0)} bis ${pctCH(s.max * 100, 0)}`;

/** Faktor mit zwei Stellen und Komma: 2 → «2,00». */
export function faktorCH(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "–";
}

/** Auf 5 Franken runden (ab 2,50 auf, darunter ab): 1'250 bleibt, 1'247 wird 1'245. Nicht endlich oder bis 0: 0. */
export function roundPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value / 5 + EPS) * 5;
}

/** Auf 5 Franken aufrunden: 1'001 wird 1'005, 1'000 bleibt. */
export function ceilPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 5 - EPS) * 5;
}

/**
 * Liest eine Zahl aus einem Feld: Apostrophe und Leerzeichen als Tausendertrenner, Komma als Dezimalzeichen.
 * null, wenn leer; NaN, wenn es keine Zahl ist.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/['’\s]/g, "").replace(",", ".");
  if (s === "") return null;
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return Number.NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

const isNum = (n: number | null): n is number => n !== null && Number.isFinite(n);

// ---- Deckungsbeitrag ---------------------------------------------------------------------------------

export type Zahlen = { preis: number; aufwand: number; kosten: number };

/** Deckungsbeitrag = Preis − direkte Kosten − Aufwand × Stundensatz (CHF, auf Rappen). Marge = Deckungsbeitrag / Preis in %. */
export function deckungsbeitrag(z: Zahlen, satz: number): { db: number; margePct: number } {
  const db = round2(z.preis - z.kosten - z.aufwand * satz);
  const margePct = z.preis > 0 ? round2((db / z.preis) * 100) : 0;
  return { db, margePct };
}

/** Preis, der die Zielmarge erreicht: (Kosten + Aufwand × Satz) / (1 − Zielmarge), auf 5 Franken aufgerundet. */
export function preisFuerMarge(z: Pick<Zahlen, "aufwand" | "kosten">, satz: number, zielmarge: number): number {
  const selbst = z.kosten + z.aufwand * satz;
  return ceilPrice((selbst * 100) / (100 - zielmarge));
}

// ---- Daten ---------------------------------------------------------------------------------------------

export type Leistung = { id: string; name: string; preis: number; aufwand: number; kosten: number };

export type AngebotInput = {
  firma: string;
  branche: string;
  leistungen: Leistung[];
  /** Interner Stundensatz in CHF; 0 heisst: Arbeitszeit nicht einrechnen. */
  satz: number;
  /** Zielmarge in % vom Preis (Annahme der Person). */
  zielmarge: number;
  kernId: string;
  /** null: keine Leistung, die Stufe entsteht als Vorschlag nach Faustregel. */
  einstiegId: string | null;
  premiumId: string | null;
  form: FormKey;
  anker: boolean;
};

export type Stufe = {
  key: StufeKey;
  /** null beim Vorschlag. */
  leistungId: string | null;
  /** Name der Leistung; leer beim Vorschlag. */
  name: string;
  vorschlag: boolean;
  preis: number;
  aufwand: number;
  kosten: number;
  db: number;
  margePct: number;
  unterZiel: boolean;
  /** Preis, der die Zielmarge erreicht; nur gesetzt, wenn die Marge unter dem Ziel liegt. */
  preisFuerZiel: number | null;
};
export type Stufen = Record<StufeKey, Stufe>;

type StufenInput = Pick<AngebotInput, "leistungen" | "satz" | "zielmarge" | "kernId" | "einstiegId" | "premiumId">;

type Preisbar = { id: string; preis: number };

// ---- Zuordnung -------------------------------------------------------------------------------------------

/** Der Kern ist die Leistung mit dem mittleren Preis; bei gerader Anzahl die untere der beiden mittleren. Gleiche Preise: die zuerst eingetragene. */
export function defaultKernId(leistungen: Preisbar[]): string {
  if (leistungen.length === 0) return "";
  const sorted = leistungen.map((l, i) => ({ l, i })).sort((a, b) => a.l.preis - b.l.preis || a.i - b.i);
  return sorted[Math.floor((sorted.length - 1) / 2)].l.id;
}

/**
 * Standard für Einstieg und Premium: die Leistung, deren Preis dem Zielpreis der Stufe am nächsten liegt (Kern-Preis × Faktor,
 * auf 5 Franken gerundet). Der Einstieg kommt nur aus Leistungen unter dem Kern-Preis, das Premium nur aus solchen darüber; der
 * Kern und `exclude` sind nie dabei. Gleichstand: die zuerst eingetragene. Keine passende Leistung: null (Vorschlag).
 */
export function defaultStufeId(stufe: "einstieg" | "premium", leistungen: Preisbar[], kernId: string, exclude: string[] = []): string | null {
  const kern = leistungen.find((l) => l.id === kernId);
  if (!kern) return null;
  const ziel = roundPrice(kern.preis * FAKTOREN[stufe].mittel);
  let best: Preisbar | null = null;
  for (const l of leistungen) {
    if (l.id === kernId || exclude.includes(l.id)) continue;
    if (stufe === "einstieg" ? !(l.preis < kern.preis) : !(l.preis > kern.preis)) continue;
    if (best === null || Math.abs(l.preis - ziel) < Math.abs(best.preis - ziel)) best = l;
  }
  return best?.id ?? null;
}

export type Zuordnung = { kernId: string; einstiegId: string | null; premiumId: string | null };

/**
 * Die Zuordnung, die im Formular gilt. Kern: der gewählte, sonst der mittlere. Einstieg und Premium: `undefined` heisst
 * Standard (nächstliegende Leistung), `""` heisst Vorschlag, eine Kennung eine gewählte Leistung. Eine unbekannte Kennung gilt als Standard.
 * null, wenn es keine Leistung gibt.
 */
export function zuordnung(
  wahl: { kern: string; einstiegId?: string; premiumId?: string },
  leistungen: Preisbar[],
): Zuordnung | null {
  if (leistungen.length === 0) return null;
  const has = (id: string) => leistungen.some((l) => l.id === id);
  const kernId = has(wahl.kern) ? wahl.kern : defaultKernId(leistungen);
  const explicit = (id: string | undefined): string | null | undefined => (id === "" ? null : id !== undefined && has(id) ? id : undefined);
  let e = explicit(wahl.einstiegId);
  let p = explicit(wahl.premiumId);
  if (e === undefined) e = defaultStufeId("einstieg", leistungen, kernId, typeof p === "string" ? [p] : []);
  if (p === undefined) p = defaultStufeId("premium", leistungen, kernId, typeof e === "string" ? [e] : []);
  return { kernId, einstiegId: e, premiumId: p };
}

// ---- Stufen ----------------------------------------------------------------------------------------------

function bauen(
  key: StufeKey,
  q: { leistungId: string | null; name: string; vorschlag: boolean } & Zahlen,
  satz: number,
  zielmarge: number,
): Stufe {
  const { db, margePct } = deckungsbeitrag(q, satz);
  // Vergleich ohne Rundung der Marge, mit kleiner Toleranz: Genau auf dem Ziel ist keine Warnung.
  const unterZiel = db * 100 < zielmarge * q.preis - 1e-6;
  return {
    key,
    leistungId: q.leistungId,
    name: q.name,
    vorschlag: q.vorschlag,
    preis: q.preis,
    aufwand: q.aufwand,
    kosten: q.kosten,
    db,
    margePct,
    unterZiel,
    preisFuerZiel: unterZiel ? preisFuerMarge(q, satz, zielmarge) : null,
  };
}

/**
 * Die drei Stufen. Jede Stufe rechnet mit Preis, Aufwand und Kosten der gewählten Leistung. Ohne Leistung entsteht die Stufe als
 * Vorschlag: Preis nach Faustregel (Kern-Preis × 0,5 oder × 2,0, auf 5 Franken gerundet, mindestens CHF 5.-), Aufwand und Kosten
 * mit demselben Faktor vom Kern. Das sind Rechenannahmen.
 */
export function stufen(input: StufenInput): Stufen {
  if (input.leistungen.length === 0) throw new Error("stufen: mindestens eine Leistung nötig");
  const byId = (id: string | null) => (id === null ? undefined : input.leistungen.find((l) => l.id === id));
  const kern = byId(input.kernId) ?? byId(defaultKernId(input.leistungen))!;
  const aus = (key: StufeKey, l: Leistung): Stufe =>
    bauen(key, { leistungId: l.id, name: l.name, vorschlag: false, preis: l.preis, aufwand: l.aufwand, kosten: l.kosten }, input.satz, input.zielmarge);
  const vorschlag = (key: "einstieg" | "premium"): Stufe => {
    const f = FAKTOREN[key].mittel;
    return bauen(
      key,
      {
        leistungId: null,
        name: "",
        vorschlag: true,
        preis: Math.max(5, roundPrice(kern.preis * f)),
        aufwand: round2(kern.aufwand * f),
        kosten: round2(kern.kosten * f),
      },
      input.satz,
      input.zielmarge,
    );
  };
  const e = byId(input.einstiegId);
  const p = byId(input.premiumId);
  return {
    einstieg: e && e.id !== kern.id ? aus("einstieg", e) : vorschlag("einstieg"),
    kern: aus("kern", kern),
    premium: p && p.id !== kern.id ? aus("premium", p) : vorschlag("premium"),
  };
}

// ---- Preisabstand ------------------------------------------------------------------------------------------

export type Abstand = {
  /** Kern-Preis geteilt durch Einstiegspreis, auf zwei Stellen. */
  kernZuEinstieg: number;
  /** Premium-Preis geteilt durch Kern-Preis, auf zwei Stellen. */
  premiumZuKern: number;
  /** Einstieg in % vom Kern-Preis. */
  einstiegPct: number;
  /** Premium in % vom Kern-Preis. */
  premiumPct: number;
  einstiegInSpanne: boolean;
  premiumInSpanne: boolean;
};

const inSpanne = (anteil: number, s: { min: number; max: number }) => anteil >= s.min - EPS && anteil <= s.max + EPS;

/** Abstände der drei Preise als Faktor mit zwei Stellen und ob sie in der Spanne der Faustregel liegen. Ausserhalb ist ein Hinweis, kein Fehler. */
export function abstand(st: Stufen): Abstand {
  const k = st.kern.preis;
  const einstieg = st.einstieg.preis / k;
  const premium = st.premium.preis / k;
  return {
    kernZuEinstieg: round2(k / st.einstieg.preis),
    premiumZuKern: round2(premium),
    einstiegPct: round2(einstieg * 100),
    premiumPct: round2(premium * 100),
    einstiegInSpanne: inSpanne(einstieg, FAKTOREN.einstieg),
    premiumInSpanne: inSpanne(premium, FAKTOREN.premium),
  };
}

// ---- Warnungen ----------------------------------------------------------------------------------------------

export type Warnung = {
  art: "marge" | "reihenfolge" | "abstand" | "satz" | "vorschlag";
  stufe?: StufeKey;
  text: string;
};

function stufeText(form: FormKey, s: Stufe): string {
  const label = stufenLabel(form, s.key);
  return s.vorschlag ? `${label} (Vorschlag)` : `${label} «${s.name}»`;
}

/** Warnungen und Hinweise zur Rechnung: Marge unter Ziel, falsche Reihenfolge, Abstand ausserhalb der Faustregel, Satz 0, Vorschläge. */
export function warnungen(st: Stufen, ab: Abstand, input: Pick<AngebotInput, "satz" | "zielmarge" | "form">): Warnung[] {
  const out: Warnung[] = [];
  for (const key of STUFEN) {
    const s = st[key];
    if (!s.unterZiel || s.preisFuerZiel === null) continue;
    const verlust = s.db < 0 ? " Der Deckungsbeitrag ist negativ: Dieses Angebot kostet dich mehr, als es einbringt." : "";
    out.push({
      art: "marge",
      stufe: key,
      text: `${stufeText(input.form, s)}: Die Marge liegt bei ${pctCH(s.margePct)}, deine Zielmarge ist ${pctCH(input.zielmarge)}.${verlust} Der Preis, der die Zielmarge erreicht: ${chf(s.preisFuerZiel)}${s.vorschlag ? " (Rechenannahme)" : ""}.`,
    });
  }
  const falsch: Partial<Record<StufeKey, boolean>> = {};
  if (st.einstieg.preis >= st.kern.preis) {
    falsch.einstieg = true;
    out.push({
      art: "reihenfolge",
      stufe: "einstieg",
      text: `${stufeText(input.form, st.einstieg)} kostet gleich viel wie dein Kern oder mehr. Der Einstieg ist das günstigste der drei Angebote: Wähle eine günstigere Leistung oder lass einen Vorschlag rechnen.`,
    });
  }
  if (st.premium.preis <= st.kern.preis) {
    falsch.premium = true;
    out.push({
      art: "reihenfolge",
      stufe: "premium",
      text: `${stufeText(input.form, st.premium)} kostet gleich viel wie dein Kern oder weniger. Das Premium ist das teuerste der drei Angebote: Wähle eine teurere Leistung oder lass einen Vorschlag rechnen.`,
    });
  }
  if (!falsch.einstieg && !ab.einstiegInSpanne) {
    out.push({
      art: "abstand",
      stufe: "einstieg",
      text: `${stufeText(input.form, st.einstieg)} liegt bei ${pctCH(ab.einstiegPct)} vom Kern-Preis (Kern / Einstieg: ${faktorCH(ab.kernZuEinstieg)}). Die Faustregel von Alperna nennt ${spanneText(FAKTOREN.einstieg)}. Das ist ein Hinweis, kein Fehler: Prüfe, ob der Abstand zu deinem Angebot passt.`,
    });
  }
  if (!falsch.premium && !ab.premiumInSpanne) {
    out.push({
      art: "abstand",
      stufe: "premium",
      text: `${stufeText(input.form, st.premium)} liegt bei ${pctCH(ab.premiumPct)} vom Kern-Preis (Premium / Kern: ${faktorCH(ab.premiumZuKern)}). Die Faustregel von Alperna nennt ${spanneText(FAKTOREN.premium)}. Das ist ein Hinweis, kein Fehler: Prüfe, ob der Abstand zu deinem Angebot passt.`,
    });
  }
  if (input.satz === 0) {
    out.push({
      art: "satz",
      text: "Dein interner Stundensatz ist 0. Die Arbeitszeit ist in keinem Deckungsbeitrag eingerechnet, die Margen sind darum höher, als sie mit Arbeitszeit wären.",
    });
  }
  for (const key of ["einstieg", "premium"] as const) {
    const s = st[key];
    if (!s.vorschlag) continue;
    out.push({
      art: "vorschlag",
      stufe: key,
      text: `${stufenLabel(input.form, key)}: Das ist ein Vorschlag nach Faustregel, keine deiner Leistungen. Preis, Aufwand und Kosten sind Rechenannahmen (Faktor ${numberCH(FAKTOREN[key].mittel, 2)} vom Kern). Was müsste dieses Angebot enthalten?`,
    });
  }
  return out;
}

// ---- Ergebnis ----------------------------------------------------------------------------------------------

export type AngebotErgebnis = {
  stufen: Stufen;
  abstand: Abstand;
  warnungen: Warnung[];
  reihenfolge: StufeKey[];
};

type RechenInput = StufenInput & Pick<AngebotInput, "form" | "anker">;

export function rechnen(input: RechenInput): AngebotErgebnis {
  const st = stufen(input);
  const ab = abstand(st);
  return { stufen: st, abstand: ab, warnungen: warnungen(st, ab, input), reihenfolge: reihenfolge(input.anker) };
}

// ---- Formular -----------------------------------------------------------------------------------------------

export type FormLeistung = { id: string; name: string; preis: string; aufwand: string; kosten: string };

export type FormFields = {
  leistungen: FormLeistung[];
  satz: string;
  zielmarge: string;
  /** Kennung des Kerns; leer: die Leistung mit dem mittleren Preis. */
  kern: string;
  /** undefined: Standard, "": Vorschlag, sonst Kennung. */
  einstiegId?: string;
  premiumId?: string;
  form: FormKey;
  anker: boolean;
};

export function newLeistung(id: string): FormLeistung {
  return { id, name: "", preis: "", aufwand: "", kosten: "0" };
}

/** Kleinste freie Kennung «l1», «l2», … */
export function nextLeistungId(rows: Pick<FormLeistung, "id">[]): string {
  const used = new Set(rows.map((r) => r.id));
  for (let n = 1; ; n++) if (!used.has(`l${n}`)) return `l${n}`;
}

export function emptyForm(): FormFields {
  return {
    leistungen: [newLeistung("l1"), newLeistung("l2"), newLeistung("l3")],
    satz: "",
    zielmarge: String(LIMITS.zielmarge.standard),
    kern: "",
    form: "einzel",
    anker: false,
  };
}

/** Eine Zeile ohne Angaben (Kosten leer oder 0) zählt nicht als Leistung und wird übersprungen. */
export function isEmptyRow(l: FormLeistung): boolean {
  return l.name.trim() === "" && l.preis.trim() === "" && l.aufwand.trim() === "" && (l.kosten.trim() === "" || parseNumber(l.kosten) === 0);
}

const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();

/** Die Zeilen mit Angaben, mit ihrer Nummer im Formular (ab 1). */
function usedRows(form: Pick<FormFields, "leistungen">): { row: FormLeistung; nr: number }[] {
  return form.leistungen.map((row, i) => ({ row, nr: i + 1 })).filter(({ row }) => !isEmptyRow(row));
}

/** Zeilen mit Name und gültigem Preis: genug, um Kern, Einstieg und Premium vorzuschlagen, auch wenn das Formular sonst noch unvollständig ist. */
export function vorschauLeistungen(form: Pick<FormFields, "leistungen">): { id: string; name: string; preis: number }[] {
  const out: { id: string; name: string; preis: number }[] = [];
  for (const { row } of usedRows(form)) {
    const preis = parseNumber(row.preis);
    const name = cleanName(row.name);
    if (name !== "" && isNum(preis) && preis > 0) out.push({ id: row.id, name, preis });
  }
  return out;
}

/** Die Zuordnung, die im Formular gilt (für die Auswahlfelder). null, solange keine Leistung mit Name und Preis da ist. */
export function zuordnungAusForm(form: FormFields): Zuordnung | null {
  return zuordnung(form, vorschauLeistungen(form));
}

/** Meldet, was an den Leistungen, am Satz und an der Zielmarge nicht stimmt, in der Reihenfolge des Formulars. null: in Ordnung. */
export function validateStruktur(form: FormFields): string | null {
  const used = usedRows(form);
  if (used.length < LIMITS.leistungen.min) return "Trag mindestens eine Leistung ein.";
  if (used.length > LIMITS.leistungen.max) return "Mehr als sechs Leistungen sind zu viele: Nimm die wichtigsten sechs.";

  for (const { row, nr } of used) {
    const name = cleanName(row.name);
    if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) {
      return `Leistung ${nr}: Der Name braucht ${LIMITS.name.min} bis ${LIMITS.name.max} Zeichen.`;
    }
    const preis = parseNumber(row.preis);
    if (!isNum(preis) || preis <= 0 || round2(preis) <= 0 || preis > LIMITS.preis.max) {
      return `Leistung ${nr}: Gib einen Preis über 0 an, höchstens ${chf(LIMITS.preis.max)}.`;
    }
    const aufwand = parseNumber(row.aufwand);
    if (!isNum(aufwand) || aufwand < 0 || aufwand > LIMITS.aufwand.max) {
      return `Leistung ${nr}: Gib den Aufwand in Stunden an, von 0 bis ${numberCH(LIMITS.aufwand.max, 0)}.`;
    }
    const kosten = row.kosten.trim() === "" ? 0 : parseNumber(row.kosten);
    if (!isNum(kosten) || kosten < 0 || kosten > LIMITS.kosten.max) {
      return `Leistung ${nr}: Material und Fremdleistungen brauchen eine Zahl ab 0, höchstens ${chf(LIMITS.kosten.max)}.`;
    }
  }

  const seen = new Set<string>();
  for (const { row } of used) {
    const name = cleanName(row.name);
    const key = name.toLowerCase();
    if (seen.has(key)) return `Zwei Leistungen heissen «${name}». Gib jeder einen eigenen Namen.`;
    seen.add(key);
  }

  const satz = parseNumber(form.satz);
  if (!isNum(satz) || satz < LIMITS.satz.min || satz > LIMITS.satz.max) {
    return `Der interne Stundensatz muss zwischen ${chf(LIMITS.satz.min)} und ${chf(LIMITS.satz.max)} liegen. Bei 0 rechnet das Werkzeug ohne Arbeitszeit.`;
  }
  const ziel = parseNumber(form.zielmarge);
  if (!isNum(ziel) || ziel < LIMITS.zielmarge.min || ziel > LIMITS.zielmarge.max) {
    return `Die Zielmarge muss zwischen ${pctCH(LIMITS.zielmarge.min, 0)} und ${pctCH(LIMITS.zielmarge.max, 0)} liegen.`;
  }

  if (form.kern !== "" && !used.some(({ row }) => row.id === form.kern)) return "Wähle deinen Kern aus der Liste der Leistungen.";
  const z = zuordnung(form, vorschauLeistungen(form));
  if (!z) return "Trag mindestens eine Leistung ein.";
  if (z.einstiegId === z.kernId || z.premiumId === z.kernId || (z.einstiegId !== null && z.einstiegId === z.premiumId)) {
    return "Einstieg, Kern und Premium brauchen drei verschiedene Leistungen. Wähle für eine Stufe «Vorschlag», wenn dir eine fehlt.";
  }
  return null;
}

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars. null: in Ordnung. */
export function validate(form: FormFields, profile: { firma?: string }): string | null {
  if (!(profile.firma ?? "").trim()) return "Gib den Namen deines Betriebs an.";
  return validateStruktur(form);
}

const clip = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Eingabe der Rechnung aus Formular und Profil. null, wenn etwas nicht stimmt (vorher validate). */
export function toInput(form: FormFields, profile: { firma?: string; branche?: string }): AngebotInput | null {
  if (validateStruktur(form) !== null) return null;
  const leistungen: Leistung[] = usedRows(form).map(({ row }) => ({
    id: row.id,
    name: cleanName(row.name),
    preis: round2(parseNumber(row.preis) as number),
    aufwand: Math.round((parseNumber(row.aufwand) as number) * 4) / 4,
    kosten: row.kosten.trim() === "" ? 0 : round2(parseNumber(row.kosten) as number),
  }));
  const z = zuordnung(form, leistungen);
  if (!z) return null;
  return {
    firma: clip(profile.firma, 200),
    branche: clip(profile.branche, 200),
    leistungen,
    satz: round2(parseNumber(form.satz) as number),
    zielmarge: Math.round((parseNumber(form.zielmarge) as number) * 10) / 10,
    kernId: z.kernId,
    einstiegId: z.einstiegId,
    premiumId: z.premiumId,
    form: form.form,
    anker: form.anker,
  };
}

// ---- Dokument -------------------------------------------------------------------------------------------------

export const HINWEISE = [
  "Die Preise gelten netto oder brutto, genau so, wie du sie eingegeben hast. Gib alle Preise gleich ein, sonst stimmen die Abstände nicht.",
  "Teste die Struktur zuerst bei Neukunden. Bestehende Kundschaft kennt deine bisherigen Preise.",
  "Prüfe die Zahlen nach drei Monaten: Welche Stufe wird gewählt, und stimmt der Aufwand?",
] as const;

export const ANKER_HINWEIS =
  "Das Premium steht zuerst, damit die Kundschaft den höchsten Preis als Erstes sieht (Anker). Das ist eine Entscheidung zur Darstellung, keine Aussage über die Wirkung. Zeig die Reihenfolge einigen Neukunden und halte fest, welche Stufe sie wählen.";

const preisText = (form: FormKey, preis: number) => {
  const einheit = formDef(form).einheit;
  return einheit ? `${chf(preis)} ${einheit}` : chf(preis);
};

const stundenText = (h: number) => `${numberCH(h, 2)} h`;

function stufeZeile(form: FormKey, s: Stufe): string[] {
  return [
    stufenLabel(form, s.key),
    s.vorschlag ? "Vorschlag nach Faustregel" : s.name,
    chf(s.preis),
    stundenText(s.aufwand),
    chf(s.kosten),
    chf(s.db),
    pctCH(s.margePct, 1),
  ];
}

export function toDocument(result: AngebotErgebnis, input: AngebotInput): DocumentModel {
  const { stufen: st, abstand: ab } = result;
  const form = input.form;
  const def = formDef(form);
  const facts: { label: string; value: string }[] = [{ label: "Betrieb", value: input.firma || "keine Angabe" }];
  if (input.branche) facts.push({ label: "Branche", value: input.branche });
  facts.push(
    { label: "Form", value: def.label },
    { label: "Interner Stundensatz", value: input.satz === 0 ? `${chf(0)} (Arbeitszeit nicht eingerechnet)` : chf(input.satz) },
    { label: "Zielmarge", value: `${pctCH(input.zielmarge)} vom Preis (deine Annahme, kein Richtwert)` },
    { label: "Kern", value: st.kern.name },
    { label: "Reihenfolge", value: input.anker ? "Premium zuerst (Anker)" : "Einstieg zuerst" },
  );

  const stufenListe = result.reihenfolge.map((key) => {
    const s = st[key];
    const label = stufenLabel(form, key);
    return s.vorschlag
      ? `${label}: noch offen, Vorschlag nach Faustregel zu ${preisText(form, s.preis)}. Was müsste dieses Angebot enthalten?`
      : `${label}: «${s.name}» zu ${preisText(form, s.preis)}`;
  });

  const blocks: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "heading", level: 1, text: "Die drei Stufen" },
    ...(def.einheit ? ([{ type: "paragraph", text: `Preis, Aufwand und Kosten gelten ${def.einheit}.` }] as DocBlock[]) : []),
    {
      type: "table",
      header: ["Stufe", "Leistung", def.einheit ? `Preis ${def.einheit}` : "Preis", "Aufwand", "Kosten", "Deckungsbeitrag", "Marge"],
      rows: result.reihenfolge.map((key) => stufeZeile(form, st[key])),
      widths: [1.4, 1.8, 1.8, 1.2, 1.6, 2.1, 1],
    },
    { type: "heading", level: 1, text: "Warnungen" },
    result.warnungen.length === 0
      ? { type: "paragraph", text: `Keine Warnung: Alle drei Stufen erreichen deine Zielmarge von ${pctCH(input.zielmarge)}, und die Preisabstände liegen in der Faustregel.` }
      : { type: "list", items: result.warnungen.map((w) => w.text) },
    { type: "heading", level: 1, text: "Was die Stufen unterscheidet" },
    {
      type: "paragraph",
      text: "Die Stufen unterscheiden sich durch die Leistung, die du ihnen zugeordnet hast. Das Werkzeug ergänzt keinen Inhalt; was ein Vorschlag enthalten soll, legst du fest.",
    },
    { type: "list", items: stufenListe },
    { type: "heading", level: 1, text: "Preisabstände" },
    {
      type: "paragraph",
      text: `${FAUSTREGEL_SATZ} Der Einstieg liegt bei ${spanneText(FAKTOREN.einstieg)} vom Kern-Preis (gezeigt: ${pctCH(FAKTOREN.einstieg.mittel * 100, 0)}), das Premium bei ${spanneText(FAKTOREN.premium)} (gezeigt: ${pctCH(FAKTOREN.premium.mittel * 100, 0)}). Passe sie an dein Angebot an.`,
    },
    {
      type: "paragraph",
      text: `Dein Ergebnis: Kern / Einstieg ${faktorCH(ab.kernZuEinstieg)} (Einstieg bei ${pctCH(ab.einstiegPct)} vom Kern), Premium / Kern ${faktorCH(ab.premiumZuKern)} (Premium bei ${pctCH(ab.premiumPct)}).`,
    },
    { type: "heading", level: 1, text: "Hinweise" },
    { type: "list", ordered: true, items: [...HINWEISE, ...(input.anker ? [ANKER_HINWEIS] : [])] },
  ];

  const preise = STUFEN.map((key) => `${stufenLabel(form, key)} ${preisText(form, st[key].preis)}`).join(", ");
  return {
    title: "Angebotsarchitektur und Preisstrategie",
    subtitle: `${preise}. Preisabstände: Faustregel von Alperna, keine Statistik.`,
    firma: input.firma || undefined,
    filename: `angebotsarchitektur-${safeFilename(input.firma, "betrieb")}`,
    blocks,
  };
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(result: AngebotErgebnis, input: AngebotInput): string {
  return toMarkdown(toDocument(result, input));
}

/** Die Angaben fürs CRM, eine je Zeile; der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: AngebotInput): string {
  const name = (id: string | null) => input.leistungen.find((l) => l.id === id)?.name ?? "Vorschlag nach Faustregel";
  const lines: string[] = [];
  if (input.branche) lines.push(`Branche: ${input.branche}`);
  input.leistungen.forEach((l, i) => {
    lines.push(`Leistung ${i + 1}: ${l.name}, Preis ${chf(l.preis)}, Aufwand ${stundenText(l.aufwand)}, Material und Fremdleistungen ${chf(l.kosten)}`);
  });
  lines.push(
    `Interner Stundensatz: ${input.satz === 0 ? `${chf(0)} (Arbeitszeit nicht eingerechnet)` : chf(input.satz)}`,
    `Zielmarge: ${pctCH(input.zielmarge)} vom Preis`,
    `Kern: ${name(input.kernId)}`,
    `Einstieg: ${name(input.einstiegId)}`,
    `Premium: ${name(input.premiumId)}`,
    `Form: ${formDef(input.form).label}`,
    `Premium zuerst (Anker): ${input.anker ? "ja" : "nein"}`,
  );
  return lines.join("\n");
}

// ---- Gespeicherter Stand -------------------------------------------------------------------------------------

export type AngebotState = FormFields & {
  v: 1;
  phase: "edit" | "result";
  /** Das Ergebnis; es zählt für den Pfad nur mit phase «result» (lib/progress.ts). */
  output: AngebotErgebnis | null;
};

export function emptyState(): AngebotState {
  return { v: 1, phase: "edit", output: null, ...emptyForm() };
}

export const EMPTY_STATE: AngebotState = emptyState();

export function formOf(state: FormFields): FormFields {
  const f: FormFields = {
    leistungen: state.leistungen,
    satz: state.satz,
    zielmarge: state.zielmarge,
    kern: state.kern,
    form: state.form,
    anker: state.anker,
  };
  if (state.einstiegId !== undefined) f.einstiegId = state.einstiegId;
  if (state.premiumId !== undefined) f.premiumId = state.premiumId;
  return f;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v).slice(0, max) : "");

function cleanRows(raw: unknown): FormLeistung[] {
  if (!Array.isArray(raw)) return [];
  const rows: FormLeistung[] = [];
  const ids = new Set<string>();
  for (const r of raw.slice(0, LIMITS.leistungen.max)) {
    if (!isObject(r)) continue;
    let id = typeof r.id === "string" && /^[a-z0-9]{1,12}$/.test(r.id) && !ids.has(r.id) ? r.id : "";
    if (id === "") id = nextLeistungId([...rows, ...[...ids].map((x) => ({ id: x }))]);
    ids.add(id);
    rows.push({
      id,
      name: text(r.name, LIMITS.name.max),
      preis: text(r.preis, 20),
      aufwand: text(r.aufwand, 20),
      kosten: r.kosten === undefined ? "0" : text(r.kosten, 20),
    });
  }
  return rows;
}

/**
 * Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Das Ergebnis wird aus den Angaben neu gerechnet
 * (deterministisch), damit veränderte Zahlen im Speicher nie die Anzeige stören; ohne gültige Angaben gibt es kein Ergebnis.
 */
export function parseState(raw: unknown): AngebotState {
  if (!isObject(raw) || raw.v !== 1) return emptyState();
  let leistungen = cleanRows(raw.leistungen);
  if (leistungen.length === 0) leistungen = emptyForm().leistungen;
  const ids = new Set(leistungen.map((l) => l.id));
  const pick = (v: unknown): string | undefined => (v === "" ? "" : typeof v === "string" && ids.has(v) ? v : undefined);
  const form: FormFields = {
    leistungen,
    satz: text(raw.satz, 12),
    zielmarge: raw.zielmarge === undefined ? String(LIMITS.zielmarge.standard) : text(raw.zielmarge, 12),
    kern: typeof raw.kern === "string" && ids.has(raw.kern) ? raw.kern : "",
    form: isFormKey(raw.form) ? raw.form : "einzel",
    anker: raw.anker === true,
  };
  const e = pick(raw.einstiegId);
  const p = pick(raw.premiumId);
  if (e !== undefined) form.einstiegId = e;
  if (p !== undefined) form.premiumId = p;
  const input = raw.phase === "result" ? toInput(form, {}) : null;
  return input
    ? { v: 1, phase: "result", ...form, output: rechnen(input) }
    : { v: 1, phase: "edit", ...form, output: null };
}
