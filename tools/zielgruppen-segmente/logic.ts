import { numberCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { Profile, ProfileKey } from "@/lib/profile";

// Zielgruppen-Segmente: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Alles rechnet im Browser (Klasse C, kein Server, keine KI). Die Skalen und die Grösse eines Segments sind Einschätzungen der
// Person, keine Statistik. Die gleichen Gewichte der Attraktivität, die Schwelle 50 und die Hinweise sind ein Richtwert von
// Alperna, keine Statistik. Es gibt keine Zahl mit fremder Quelle.
// Spec: specs/zielgruppen-segmente.md

export const SLUG = "zielgruppen-segmente";
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
export const EINSCHAETZUNG_NOTE = "Einschätzung, keine Statistik";
export const HINWEIS_EINSCHAETZUNG = `${EINSCHAETZUNG_NOTE}: Die drei Skalen und die Grösse der Segmente sind deine Angaben. Die gleichen Gewichte der Rechnung und die Grenze von 50 für «hoch» sind ein ${RICHTWERT_NOTE}.`;

/** Ab diesem Wert (von 100) gilt Attraktivität oder Erreichbarkeit als «hoch». Genau 50 zählt als hoch. Richtwert von Alperna. */
export const SCHWELLE = 50;
export const MIN_SEGMENTE = 1;
export const MAX_SEGMENTE = 4;
export const MAX_KANAELE = 4;
export const GROESSE_MAX = 10_000_000;
export const LIMITS = { name: { min: 3, max: 60 }, text: { min: 5, max: 120 }, einwand: { max: 120 } } as const;

// ---- Typ ---------------------------------------------------------------------------------------

export type Typ = "kmu" | "verein";
export const typOf = (organisationstyp: string | undefined): Typ => (organisationstyp === "verein" ? "verein" : "kmu");

/** «Deine Segmente» bei Betrieben, «Zielgruppen des Vereins» bei Vereinen. */
export const segmenteTitel = (typ: Typ): string => (typ === "verein" ? "Zielgruppen des Vereins" : "Deine Segmente");

// ---- Kanäle und Skalen -------------------------------------------------------------------------

export const KANAELE = [
  "Website",
  "Google-Unternehmensprofil",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Newsletter",
  "Empfehlungen",
  "Anlässe",
  "Aushang und Flyer",
  "Lokalzeitung und Anzeiger",
  "Telefon und Gespräch",
  "WhatsApp",
] as const;
export type Kanal = (typeof KANAELE)[number];
const isKanal = (v: unknown): v is Kanal => (KANAELE as readonly unknown[]).includes(v);

export type SkalaKey = "zahlung" | "erreich" | "wettbewerb";
export type Skala = {
  key: SkalaKey;
  label: string;
  /** Artikel im Akkusativ für Meldungen: «die Zahlungsbereitschaft», «den Wettbewerbsdruck». */
  artikel: "die" | "den";
  frage: string;
  /** Text zu 1 bis 5, so steht er neben der Zahl im Formular. */
  stufen: readonly [string, string, string, string, string];
};

export const SKALEN: readonly Skala[] = [
  {
    key: "zahlung",
    label: "Zahlungsbereitschaft",
    artikel: "die",
    frage: "Wie viel ist das Segment bereit, für deinen Nutzen zu bezahlen?",
    stufen: ["gering", "eher gering", "mittel", "eher hoch", "hoch"],
  },
  {
    key: "erreich",
    label: "Erreichbarkeit",
    artikel: "die",
    frage: "Wie leicht erreichst du das Segment mit deinen Kanälen?",
    stufen: ["schwer", "eher schwer", "mittel", "eher leicht", "leicht"],
  },
  {
    key: "wettbewerb",
    label: "Wettbewerbsdruck",
    artikel: "den",
    frage: "Wie stark bemühen sich andere Anbieter um dieses Segment?",
    stufen: ["gering", "eher gering", "mittel", "eher hoch", "hoch"],
  },
];

export const WERTE = [1, 2, 3, 4, 5] as const;
const skalaOf = (key: SkalaKey): Skala => SKALEN.find((s) => s.key === key) as Skala;

/** «4 eher hoch» für Formular und Dokument. */
export const stufeText = (key: SkalaKey, wert: number): string => `${wert} ${skalaOf(key).stufen[wert - 1] ?? ""}`.trim();

const istWert = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

// ---- Felder der Matrix -------------------------------------------------------------------------

export type FeldKey = "zuerst" | "aufbauen" | "mitnehmen" | "vorerst";
export const FELD_KEYS: readonly FeldKey[] = ["zuerst", "aufbauen", "mitnehmen", "vorerst"];

export type FeldInfo = { titel: string; lage: string; text: string };

export const FELDER: Record<FeldKey, FeldInfo> = {
  zuerst: {
    titel: "Zuerst bearbeiten",
    lage: "Attraktivität hoch, Erreichbarkeit hoch",
    text: "Das Segment lohnt sich und du erreichst es gut. Beginne hier.",
  },
  aufbauen: {
    titel: "Aufbauen",
    lage: "Attraktivität hoch, Erreichbarkeit niedrig",
    text: "Das Segment lohnt sich, du erreichst es aber noch nicht gut. Baue zuerst einen Weg dorthin, zum Beispiel über Empfehlungen oder einen passenden Kanal.",
  },
  mitnehmen: {
    titel: "Mitnehmen",
    lage: "Attraktivität niedrig, Erreichbarkeit hoch",
    text: "Das Segment ist leicht zu erreichen, bringt aber weniger. Bediene es nebenbei, ohne viel Aufwand.",
  },
  vorerst: {
    titel: "Vorerst nicht",
    lage: "Attraktivität niedrig, Erreichbarkeit niedrig",
    text: "Das Segment bringt wenig und ist schwer zu erreichen. Stelle es zurück und prüfe deine Einschätzung später noch einmal.",
  },
};

// ---- Segment, Eingabe --------------------------------------------------------------------------

/** Ein Segment im Formular. Skalen: 0 heisst «noch nicht gewählt», 1 bis 5 sind Werte. Die Grösse steht als Text, wie getippt. */
export type Segment = {
  id: string;
  name: string;
  beduerfnis: string;
  kaufmotiv: string;
  nutzen: string;
  groesse: string;
  kanaele: Kanal[];
  einwand: string;
  zahlung: number;
  erreich: number;
  wettbewerb: number;
};

export const leeresSegment = (id: string, name = ""): Segment => ({
  id,
  name,
  beduerfnis: "",
  kaufmotiv: "",
  nutzen: "",
  groesse: "",
  kanaele: [],
  einwand: "",
  zahlung: 0,
  erreich: 0,
  wettbewerb: 0,
});

const one = (s: string | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Nächste freie ID `s<n>`: grösser als jede vorhandene, damit keine ID wiederkehrt. */
export function neueId(segmente: readonly Pick<Segment, "id">[]): string {
  let max = 0;
  for (const s of segmente) {
    const m = /^s(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

export const neuesSegment = (segmente: readonly Pick<Segment, "id">[]): Segment => leeresSegment(neueId(segmente));

/** Trägt das Segment irgendeine Angabe? Ein unberührtes Segment trägt keine und zählt nicht. */
export const istLeer = (s: Segment): boolean =>
  one(s.name) === "" &&
  one(s.beduerfnis) === "" &&
  one(s.kaufmotiv) === "" &&
  one(s.nutzen) === "" &&
  one(s.groesse) === "" &&
  s.kanaele.length === 0 &&
  one(s.einwand) === "" &&
  s.zahlung === 0 &&
  s.erreich === 0 &&
  s.wettbewerb === 0;

/** Liest die Grösse: ganze Zahl von 1 bis 10'000'000. Leerraum und Apostroph als Tausendertrenner sind erlaubt. null: ungültig. */
export function parseGroesse(raw: string | number | undefined): number | null {
  const s = typeof raw === "number" ? String(raw) : (raw ?? "").replace(/[\s'’]/g, "");
  if (!/^\d{1,8}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= GROESSE_MAX ? n : null;
}

/** Profil-Felder, die das Werkzeug liest. */
export type ProfileFields = Pick<Profile, "firma" | "branche" | "organisationstyp" | "zielgruppen" | "primaersegment">;

/**
 * Startliste aus dem Profil (Harte Regel 10): Namen der Zielgruppen (höchstens vier), sonst das Primärsegment; mindestens zwei
 * Segmente, die leeren ohne Namen. Bleibt nichts im Profil, sind es zwei leere Segmente.
 */
export function vorlage(profile: Pick<Profile, "zielgruppen" | "primaersegment">): Segment[] {
  const namen: string[] = [];
  const add = (n: string | undefined) => {
    const name = one(n).slice(0, LIMITS.name.max);
    if (name && !namen.some((x) => x.toLowerCase() === name.toLowerCase()) && namen.length < MAX_SEGMENTE) namen.push(name);
  };
  for (const z of profile.zielgruppen ?? []) add(z.name);
  if (namen.length === 0) add(profile.primaersegment);
  const out = namen.map((n, i) => leeresSegment(`s${i + 1}`, n));
  while (out.length < 2) out.push(leeresSegment(`s${out.length + 1}`));
  return out;
}

// ---- Prüfung -----------------------------------------------------------------------------------

export type Problem = { message: string; fieldId?: string };

export type SegmentFeld = "name" | "beduerfnis" | "kaufmotiv" | "nutzen" | "groesse" | "kanaele" | "einwand" | SkalaKey;
export const feldId = (id: string, feld: SegmentFeld): string => `zs-${id}-${feld}`;
export const FIRMA_FIELD_ID = "zs-firma";
export const ADD_BUTTON_ID = "zs-add";

/** Ein geprüftes Segment: Leerraum bereinigt, Grösse als Zahl. */
export type Geprueft = {
  id: string;
  name: string;
  beduerfnis: string;
  kaufmotiv: string;
  nutzen: string;
  groesse: number;
  kanaele: Kanal[];
  einwand: string;
  zahlung: number;
  erreich: number;
  wettbewerb: number;
};

export type Pruefung = { ok: true; segmente: Geprueft[]; ignoriert: number } | { ok: false; problem: Problem };

function textProblem(nr: number, value: string, wort: string, leer: string, min: number, max: number): string | null {
  if (value === "") return `Segment ${nr}: ${leer}`;
  if (value.length < min) return `Segment ${nr}: ${wort} braucht mindestens ${min} Zeichen.`;
  if (value.length > max) return `Segment ${nr}: ${wort} darf höchstens ${max} Zeichen haben.`;
  return null;
}

/**
 * Prüft die Segmente in der Reihenfolge des Formulars und meldet das erste Problem. Völlig leere Segmente zählen nicht
 * (Nummern in den Meldungen sind die Nummern im Formular). Ein Segment reicht für ein Ergebnis; die Matrix braucht zwei.
 */
export function pruefeSegmente(segmente: readonly Segment[]): Pruefung {
  const fail = (message: string, fieldId?: string): Pruefung => ({ ok: false, problem: { message, fieldId } });
  if (segmente.length > MAX_SEGMENTE) {
    return fail(`Du kannst höchstens vier Segmente bewerten. Entferne eines, bevor du weitermachst.`, ADD_BUTTON_ID);
  }
  const out: Geprueft[] = [];
  let ignoriert = 0;
  for (const [i, s] of segmente.entries()) {
    if (istLeer(s)) {
      ignoriert += 1;
      continue;
    }
    const nr = i + 1;
    const name = one(s.name);
    const beduerfnis = one(s.beduerfnis);
    const kaufmotiv = one(s.kaufmotiv);
    const nutzen = one(s.nutzen);
    const einwand = one(s.einwand);
    const at = (f: SegmentFeld) => feldId(s.id, f);

    let m = textProblem(nr, name, "Der Name", "Gib einen Namen an.", LIMITS.name.min, LIMITS.name.max);
    if (m) return fail(m, at("name"));
    if (out.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      return fail(`Segment ${nr}: Der Name ist schon vergeben. Gib jedem Segment einen eigenen Namen.`, at("name"));
    }
    m = textProblem(nr, beduerfnis, "Das Hauptbedürfnis", "Beschreibe das Hauptbedürfnis.", LIMITS.text.min, LIMITS.text.max);
    if (m) return fail(m, at("beduerfnis"));
    m = textProblem(nr, kaufmotiv, "Das Kaufmotiv", "Beschreibe das Kaufmotiv.", LIMITS.text.min, LIMITS.text.max);
    if (m) return fail(m, at("kaufmotiv"));
    m = textProblem(nr, nutzen, "Der Nutzen", "Beschreibe den Nutzen, den du bietest.", LIMITS.text.min, LIMITS.text.max);
    if (m) return fail(m, at("nutzen"));

    if (one(s.groesse) === "") return fail(`Segment ${nr}: Schätze, wie viele mögliche Kundinnen und Kunden das Segment hat.`, at("groesse"));
    const groesse = parseGroesse(s.groesse);
    if (groesse === null) return fail(`Segment ${nr}: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.`, at("groesse"));

    if (!s.kanaele.every(isKanal)) return fail(`Segment ${nr}: Wähle die Kanäle aus der Liste.`, at("kanaele"));
    const kanaele = KANAELE.filter((k) => s.kanaele.includes(k));
    if (kanaele.length > MAX_KANAELE) return fail(`Segment ${nr}: Wähle höchstens vier Kanäle.`, at("kanaele"));

    if (einwand.length > LIMITS.einwand.max) {
      return fail(`Segment ${nr}: Der Einwand darf höchstens ${LIMITS.einwand.max} Zeichen haben.`, at("einwand"));
    }
    for (const sk of SKALEN) {
      const wert = s[sk.key];
      if (wert === 0) return fail(`Segment ${nr}: Wähle ${sk.artikel} ${sk.label} von 1 bis 5.`, at(sk.key));
      if (!istWert(wert)) return fail(`Segment ${nr}: ${sk.artikel === "die" ? "Die" : "Der"} ${sk.label} geht von 1 bis 5.`, at(sk.key));
    }
    out.push({ id: s.id, name, beduerfnis, kaufmotiv, nutzen, groesse, kanaele, einwand, zahlung: s.zahlung, erreich: s.erreich, wettbewerb: s.wettbewerb });
  }
  if (out.length < MIN_SEGMENTE) {
    return fail("Beschreibe mindestens ein Segment.", segmente[0] ? feldId(segmente[0].id, "name") : ADD_BUTTON_ID);
  }
  return { ok: true, segmente: out, ignoriert };
}

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars (Firma, dann die Segmente). null: in Ordnung. */
export function validate(firma: string | undefined, typ: Typ, segmente: readonly Segment[]): Problem | null {
  if (!one(firma)) {
    return { message: typ === "verein" ? "Gib den Namen deines Vereins an." : "Gib den Namen deines Betriebs an.", fieldId: FIRMA_FIELD_ID };
  }
  const p = pruefeSegmente(segmente);
  return p.ok ? null : p.problem;
}

// ---- Rechnung ----------------------------------------------------------------------------------

/**
 * Grösse eines Segments auf 1 bis 5: 1 + 4 × (Grösse / grösste Schätzung). Bei nur einem Segment (nichts zu vergleichen) und bei
 * ungültigen Werten gilt 3.
 */
export function groesseNorm(groesse: number, max: number, anzahl: number): number {
  if (anzahl <= 1 || !(max > 0) || !Number.isFinite(groesse)) return 3;
  return round6(1 + 4 * clamp(groesse / max, 0, 1));
}

/**
 * Attraktivität von 0 bis 100: Mittel aus Grösse (1 bis 5), Zahlungsbereitschaft und (6 − Wettbewerbsdruck), umgerechnet mit
 * (Mittel − 1) / 4 × 100, auf ganze Zahlen gerundet. Die drei Teile zählen gleich viel (Richtwert von Alperna, keine Statistik).
 */
export function attraktivitaet(g: number, zahlung: number, wettbewerb: number): number {
  const mittel = (g + zahlung + (6 - wettbewerb)) / 3;
  return clamp(Math.round(round6(((mittel - 1) / 4) * 100)), 0, 100);
}

/** Erreichbarkeit von 0 bis 100: (E − 1) / 4 × 100 mit E von 1 bis 5. */
export function erreichbarkeit(erreich: number): number {
  return clamp(Math.round(round6(((erreich - 1) / 4) * 100)), 0, 100);
}

/** Feld der Matrix. Genau 50 zählt als «hoch». Die Werte sind die angezeigten, gerundeten Zahlen. */
export function feldOf(attraktiv: number, erreichbar: number): FeldKey {
  const a = attraktiv >= SCHWELLE;
  const e = erreichbar >= SCHWELLE;
  if (a && e) return "zuerst";
  if (a) return "aufbauen";
  if (e) return "mitnehmen";
  return "vorerst";
}

const ohneSchluss = (s: string): string => one(s).replace(/[\s.!?;:,…]+$/u, "");
/** Anführungszeichen im Text werden zu ‹ ›, weil der Satz selbst in « » steht (Schweizer Regel). */
const innen = (s: string): string => s.replace(/«/g, "‹").replace(/»/g, "›").replace(/[„“"]([^„“”"]*)[“”"]/g, "‹$1›");

/**
 * Botschaftssatz: «Für {Name} mit dem Bedürfnis «{Hauptbedürfnis}» bieten wir {Nutzen}.» Die Eingaben bleiben, wie sie sind
 * (getrimmt); Satzzeichen am Ende werden nicht verdoppelt.
 */
export function botschaft(s: Pick<Segment, "name" | "beduerfnis" | "nutzen">): string {
  return `Für ${ohneSchluss(s.name)} mit dem Bedürfnis «${innen(ohneSchluss(s.beduerfnis))}» bieten wir ${ohneSchluss(s.nutzen)}.`;
}

export type Bewertet = Geprueft & {
  /** Nummer im Ergebnis, 1 bis 4, in der Reihenfolge der Eingabe. */
  nr: number;
  /** Grösse auf 1 bis 5 normiert. */
  g: number;
  attraktivitaet: number;
  erreichbarkeit: number;
  feld: FeldKey;
  /** Platz in der Rangfolge, 1 ist vorn. */
  rang: number;
  botschaft: string;
};

export type Empfehlung = {
  /** Erstes Segment der Rangfolge ausserhalb von «Vorerst nicht»; null, wenn alle dort liegen. */
  primaer: Bewertet | null;
  sekundaer: Bewertet | null;
  /** Alle übrigen Segmente in der Rangfolge. */
  zurueck: Bewertet[];
  /** Satz zum Primärsegment mit den Zahlen. */
  satz: string;
  /** Satz zum Sekundärsegment; leer, wenn es keines gibt. */
  danach: string;
  /** Satz zu den übrigen Segmenten; leer, wenn es keine gibt oder kein Segment die Schwelle erreicht. */
  zurueckSatz: string;
  /** Alle drei Teile in einem Absatz. */
  text: string;
};

export type Auswertung = {
  /** In der Reihenfolge der Eingabe. */
  segmente: Bewertet[];
  /** Nach Rang: höchster Mittelwert aus Attraktivität und Erreichbarkeit zuerst. */
  rangfolge: Bewertet[];
  empfehlung: Empfehlung;
  /** Grösste Schätzung, Bezug der Normierung. */
  groessterWert: number;
};

const zahlenText = (s: Pick<Bewertet, "attraktivitaet" | "erreichbarkeit">): string => `Attraktivität ${s.attraktivitaet}, Erreichbarkeit ${s.erreichbarkeit}`;
const quoted = (name: string): string => `«${name}»`;

const GRUND: Record<FeldKey, string> = {
  zuerst: "Es ist attraktiv, und du erreichst es gut.",
  aufbauen: "Es ist attraktiv, aber du erreichst es noch nicht gut. Baue zuerst einen Weg dorthin.",
  mitnehmen: "Du erreichst es gut, es ist aber weniger attraktiv. Halte den Aufwand klein.",
  vorerst: "Es liegt unter der Schwelle von 50.",
};

/**
 * Empfehlung aus der Rangfolge. Primärsegment ist das erste der Rangfolge, das nicht im Feld «Vorerst nicht» liegt, Sekundärsegment
 * das nächste. Alle anderen stehen unter «vorerst nicht im Fokus». Liegen alle im Feld «Vorerst nicht», gibt es kein Primärsegment.
 * Bei einem einzigen Segment gibt es nichts zu vergleichen.
 */
export function empfehlung(rangfolge: readonly Bewertet[]): Empfehlung {
  const kandidaten = rangfolge.filter((s) => s.feld !== "vorerst");
  const primaer = kandidaten[0] ?? null;
  const sekundaer = kandidaten[1] ?? null;
  const zurueck = rangfolge.filter((s) => s !== primaer && s !== sekundaer);

  let satz: string;
  let danach = "";
  let zurueckSatz = "";
  if (rangfolge.length === 0) {
    satz = "Beschreibe mindestens ein Segment.";
    return { primaer: null, sekundaer: null, zurueck: [], satz, danach, zurueckSatz, text: satz };
  }
  if (rangfolge.length === 1) {
    const s = rangfolge[0];
    satz = `Du hast ein Segment beschrieben: ${quoted(s.name)} (${zahlenText(s)}). Ohne zweites Segment gibt es nichts zu vergleichen. Beschreibe ein zweites Segment, dann setzt das Werkzeug beide in die Matrix.`;
    return { primaer, sekundaer: null, zurueck: [], satz, danach, zurueckSatz, text: satz };
  }
  if (primaer) {
    satz = `Konzentriere dich zuerst auf ${quoted(primaer.name)}: ${zahlenText(primaer)}. ${GRUND[primaer.feld]}`;
    if (sekundaer) danach = `Danach folgt ${quoted(sekundaer.name)} (${zahlenText(sekundaer)}).`;
    if (zurueck.length > 0) zurueckSatz = `Vorerst nicht im Fokus: ${zurueck.map((s) => quoted(s.name)).join(", ")}.`;
  } else {
    const naechstes = rangfolge[0];
    satz = `Kein Segment erreicht bei Attraktivität oder Erreichbarkeit die Schwelle von ${SCHWELLE}. Am nächsten kommt ${quoted(naechstes.name)} (${zahlenText(naechstes)}). Prüfe deine Einschätzungen oder beschreibe ein Segment, das mehr bringt oder das du besser erreichst.`;
  }
  return { primaer, sekundaer, zurueck, satz, danach, zurueckSatz, text: [satz, danach, zurueckSatz].filter(Boolean).join(" ") };
}

/** Rangfolge: höchster Mittelwert aus Attraktivität und Erreichbarkeit, bei Gleichstand die höhere Erreichbarkeit, dann die frühere Eingabe. */
export function vergleiche(a: Pick<Bewertet, "attraktivitaet" | "erreichbarkeit" | "nr">, b: Pick<Bewertet, "attraktivitaet" | "erreichbarkeit" | "nr">): number {
  return b.attraktivitaet + b.erreichbarkeit - (a.attraktivitaet + a.erreichbarkeit) || b.erreichbarkeit - a.erreichbarkeit || a.nr - b.nr;
}

/** Rechnet geprüfte Segmente durch. */
export function bewerte(segmente: readonly Geprueft[]): Auswertung {
  const anzahl = segmente.length;
  const groessterWert = segmente.reduce((m, s) => Math.max(m, s.groesse), 0);
  const roh = segmente.map((s, i) => {
    const g = groesseNorm(s.groesse, groessterWert, anzahl);
    const a = attraktivitaet(g, s.zahlung, s.wettbewerb);
    const e = erreichbarkeit(s.erreich);
    return { ...s, nr: i + 1, g, attraktivitaet: a, erreichbarkeit: e, feld: feldOf(a, e), rang: 0, botschaft: botschaft(s) };
  });
  const reihenfolge = [...roh].sort(vergleiche);
  const segmenteMitRang = roh.map((s) => ({ ...s, rang: reihenfolge.findIndex((r) => r.nr === s.nr) + 1 }));
  const rangfolge = reihenfolge.map((r) => segmenteMitRang[r.nr - 1]);
  return { segmente: segmenteMitRang, rangfolge, empfehlung: empfehlung(rangfolge), groessterWert };
}

/** Die Auswertung; null, wenn die Prüfung der Segmente scheitert. */
export function auswerten(segmente: readonly Segment[]): Auswertung | null {
  const p = pruefeSegmente(segmente);
  return p.ok ? bewerte(p.segmente) : null;
}

// ---- Matrix (SVG) ------------------------------------------------------------------------------

export const MATRIX = {
  width: 360,
  plot: { x: 54, y: 12, size: 288 },
  /** Radius eines Punkts. */
  r: 11,
  /** Mittlerer Radius des Gold-Rands um das Primärsegment. */
  ring: 15,
  /** Kleinster Abstand zweier Mittelpunkte; hält auch den Gold-Rand frei. */
  minAbstand: 30,
  /** Abstand der Punkte zum Rand eines Feldes. */
  inset: 19,
  /** Streifen im Feld, in dem der Name des Feldes steht und kein Punkt sitzt. */
  band: 20,
  /** Zeichen je Zeile der Legende, Zeilen je Eintrag. */
  legendeZeichen: 40,
  legendeZeilen: 2,
} as const;

export type MatrixEingabe = { nr: number; name: string; attraktivitaet: number; erreichbarkeit: number; primaer?: boolean };

export type MatrixPunkt = MatrixEingabe & { feld: FeldKey; cx: number; cy: number; primaer: boolean };
export type LegendeEintrag = { nr: number; primaer: boolean; zeilen: string[]; y: number; hoehe: number };
export type MatrixLayout = { width: number; height: number; punkte: MatrixPunkt[]; legende: LegendeEintrag[]; legendeTop: number };

type Box = { x0: number; x1: number; y0: number; y1: number; qx: number; qy: number };

/** Fläche eines Feldes und Bereich darin, in dem Punkte sitzen dürfen. Links: tiefe Erreichbarkeit, oben: hohe Attraktivität. */
function feldBox(feld: FeldKey): Box {
  const { plot, inset, band } = MATRIX;
  const half = plot.size / 2;
  const links = feld === "aufbauen" || feld === "vorerst";
  const oben = feld === "zuerst" || feld === "aufbauen";
  const qx = plot.x + (links ? 0 : half);
  const qy = plot.y + (oben ? 0 : half);
  return {
    qx,
    qy,
    x0: qx + inset,
    x1: qx + half - inset,
    y0: qy + inset + (oben ? band : 0),
    y1: qy + half - inset - (oben ? 0 : band),
  };
}

const finite = (n: number): number => (Number.isFinite(n) ? clamp(n, 0, 100) : 0);

/** Name der Legende in höchstens `legendeZeilen` Zeilen; Überlanges endet mit «…». */
export function legendeZeilen(text: string): string[] {
  const limit = MATRIX.legendeZeichen;
  const lines: string[] = [];
  let line = "";
  for (let word of one(text).split(" ")) {
    if (word === "") continue;
    while (word.length > limit) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, limit));
      word = word.slice(limit);
    }
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= limit) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= MATRIX.legendeZeilen) return lines;
  const kept = lines.slice(0, MATRIX.legendeZeilen);
  const last = kept[kept.length - 1];
  kept[kept.length - 1] = `${last.length >= limit ? last.slice(0, limit - 1) : last}…`;
  return kept;
}

/**
 * Positionen im SVG. Erreichbarkeit läuft nach rechts, Attraktivität nach oben; die Grenze 50 liegt auf der Mittellinie, und
 * ein Punkt bleibt in seinem Feld (Wert 50 sitzt im «hohen» Feld, nicht auf der Linie). Punkte, die sich verdecken würden,
 * werden innerhalb ihres Feldes auseinandergeschoben.
 */
export function matrixLayout(segmente: readonly MatrixEingabe[]): MatrixLayout {
  const { minAbstand, plot } = MATRIX;
  const punkte: MatrixPunkt[] = segmente.map((s) => {
    const a = finite(s.attraktivitaet);
    const e = finite(s.erreichbarkeit);
    const feld = feldOf(a, e);
    const b = feldBox(feld);
    const tx = e >= SCHWELLE ? (e - SCHWELLE) / SCHWELLE : e / SCHWELLE;
    const ty = a >= SCHWELLE ? (a - SCHWELLE) / SCHWELLE : a / SCHWELLE;
    return {
      nr: s.nr,
      name: s.name,
      attraktivitaet: a,
      erreichbarkeit: e,
      primaer: s.primaer === true,
      feld,
      cx: b.x0 + clamp(tx, 0, 1) * (b.x1 - b.x0),
      cy: b.y1 - clamp(ty, 0, 1) * (b.y1 - b.y0),
    };
  });

  // Auseinanderschieben: paarweise, bis keine zwei Punkte näher als minAbstand sind. Jeder Punkt bleibt in seinem Feld.
  for (let runde = 0; runde < 400; runde++) {
    let bewegt = false;
    for (let i = 0; i < punkte.length; i++) {
      for (let j = i + 1; j < punkte.length; j++) {
        const p = punkte[i];
        const q = punkte[j];
        let dx = q.cx - p.cx;
        let dy = q.cy - p.cy;
        let d = Math.hypot(dx, dy);
        if (d >= minAbstand) continue;
        bewegt = true;
        if (d < 1e-6) {
          const winkel = (i + 1) * 2.399963; // Goldener Winkel: gleiche Werte fächern sich auf
          dx = Math.cos(winkel);
          dy = Math.sin(winkel);
          d = 1;
        }
        const schub = (minAbstand - d) / 2 + 0.05;
        const ux = dx / d;
        const uy = dy / d;
        p.cx -= ux * schub;
        p.cy -= uy * schub;
        q.cx += ux * schub;
        q.cy += uy * schub;
        for (const pt of [p, q]) {
          const b = feldBox(pt.feld);
          pt.cx = clamp(pt.cx, b.x0, b.x1);
          pt.cy = clamp(pt.cy, b.y0, b.y1);
        }
      }
    }
    if (!bewegt) break;
  }
  for (const p of punkte) {
    p.cx = r1(p.cx);
    p.cy = r1(p.cy);
  }

  const legendeTop = plot.y + plot.size + 62;
  const lineH = 17;
  let y = legendeTop;
  const legende = [...punkte]
    .sort((a, b) => a.nr - b.nr)
    .map((p): LegendeEintrag => {
      const zeilen = legendeZeilen(p.primaer ? `${p.name} (Fokus)` : p.name);
      const hoehe = Math.max(34, zeilen.length * lineH + 14);
      const eintrag = { nr: p.nr, primaer: p.primaer, zeilen, y, hoehe };
      y += hoehe;
      return eintrag;
    });
  return { width: MATRIX.width, height: Math.ceil(y + 6), punkte, legende, legendeTop };
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Beschriftung der Matrix für Screenreader. */
export function matrixBeschriftung(segmente: readonly MatrixEingabe[]): string {
  const teile = [...segmente]
    .sort((a, b) => a.nr - b.nr)
    .map((s) => {
      const a = finite(s.attraktivitaet);
      const e = finite(s.erreichbarkeit);
      return `Segment ${s.nr}, ${s.name}: Attraktivität ${a}, Erreichbarkeit ${e}, Feld ${FELDER[feldOf(a, e)].titel}${s.primaer ? ", Fokus" : ""}`;
    });
  const kopf = `Vier-Felder-Matrix mit ${segmente.length} ${segmente.length === 1 ? "Segment" : "Segmenten"}. Waagrecht die Erreichbarkeit, senkrecht die Attraktivität, jeweils von 0 bis 100.`;
  return teile.length > 0 ? `${kopf} ${teile.join("; ")}.` : kopf;
}

// Farben aus den Design-Tokens (mit Rückfallwert), keine Verläufe.
const C = {
  ink: "var(--ink,#0f0f0e)",
  ink2: "var(--ink-2,#33322f)",
  paper: "var(--paper,#fffdf8)",
  surface: "var(--surface,#eae7e0)",
  line: "var(--line-strong,rgba(15,15,14,0.32))",
  gold: "var(--yellow,#ffd700)",
} as const;

/**
 * Die Vier-Felder-Matrix als SVG-Text: Erreichbarkeit waagrecht, Attraktivität senkrecht, vier beschriftete Felder, nummerierte
 * Punkte, eine Legende mit den Namen und ein Gold-Rand um das Primärsegment. `role="img"` mit `aria-label`; `describedBy` ist die
 * ID einer Liste mit denselben Daten. Alle Texte sind maskiert.
 */
export function matrixSvg(segmente: readonly MatrixEingabe[], describedBy?: string): string {
  const L = matrixLayout(segmente);
  const { plot, r, ring } = MATRIX;
  const half = plot.size / 2;
  const out: string[] = [];

  // Felder: das Feld «Zuerst bearbeiten» etwas dunkler, die anderen auf Papier
  const felder: { feld: FeldKey; x: number; y: number; ax: "start" | "end"; ty: number }[] = [
    { feld: "aufbauen", x: plot.x, y: plot.y, ax: "start", ty: plot.y + 16 },
    { feld: "zuerst", x: plot.x + half, y: plot.y, ax: "end", ty: plot.y + 16 },
    { feld: "vorerst", x: plot.x, y: plot.y + half, ax: "start", ty: plot.y + plot.size - 8 },
    { feld: "mitnehmen", x: plot.x + half, y: plot.y + half, ax: "end", ty: plot.y + plot.size - 8 },
  ];
  for (const f of felder) {
    out.push(`<rect x="${f.x}" y="${f.y}" width="${half}" height="${half}" data-feld="${f.feld}" style="fill:${f.feld === "zuerst" ? C.surface : C.paper};stroke:${C.line};stroke-width:1"/>`);
    const tx = f.ax === "start" ? f.x + 8 : f.x + half - 8;
    out.push(`<text x="${tx}" y="${f.ty}" text-anchor="${f.ax}" font-size="13" style="fill:${C.ink2}">${esc(FELDER[f.feld].titel)}</text>`);
  }

  // Achsen
  const bottom = plot.y + plot.size;
  for (const [wert, x] of [
    ["0", plot.x],
    [String(SCHWELLE), plot.x + half],
    ["100", plot.x + plot.size],
  ] as const) {
    out.push(`<text x="${x}" y="${bottom + 17}" text-anchor="middle" font-size="13" style="fill:${C.ink2}">${wert}</text>`);
  }
  for (const [wert, y] of [
    ["0", bottom],
    [String(SCHWELLE), plot.y + half],
    ["100", plot.y],
  ] as const) {
    out.push(`<text x="${plot.x - 8}" y="${y + 4}" text-anchor="end" font-size="13" style="fill:${C.ink2}">${wert}</text>`);
  }
  out.push(`<text x="${plot.x + half}" y="${bottom + 38}" text-anchor="middle" font-size="13" font-weight="600" style="fill:${C.ink}">Erreichbarkeit</text>`);
  out.push(
    `<text x="14" y="${plot.y + half}" text-anchor="middle" font-size="13" font-weight="600" transform="rotate(-90 14 ${plot.y + half})" style="fill:${C.ink}">Attraktivität</text>`,
  );

  // Punkte
  for (const p of L.punkte) {
    out.push(`<g data-segment="${p.nr}"><title>${esc(`${p.nr} ${p.name}: Attraktivität ${p.attraktivitaet}, Erreichbarkeit ${p.erreichbarkeit}`)}</title>`);
    if (p.primaer) {
      out.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${ring + 2.5}" data-fokus="1" style="fill:none;stroke:${C.ink};stroke-width:1"/>`);
      out.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${ring}" data-fokus="1" style="fill:none;stroke:${C.gold};stroke-width:3.5"/>`);
    }
    out.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${r}" style="fill:${C.ink}"/>`);
    out.push(`<text x="${p.cx}" y="${p.cy}" dy="0.35em" text-anchor="middle" font-size="13" font-weight="600" style="fill:${C.paper}">${p.nr}</text></g>`);
  }

  // Legende
  for (const l of L.legende) {
    const cy = l.y + 17;
    out.push(`<g data-legende="${l.nr}">`);
    if (l.primaer) out.push(`<circle cx="22" cy="${cy}" r="14" style="fill:none;stroke:${C.gold};stroke-width:3"/><circle cx="22" cy="${cy}" r="16.5" style="fill:none;stroke:${C.ink};stroke-width:1"/>`);
    out.push(`<circle cx="22" cy="${cy}" r="10" style="fill:${C.ink}"/>`);
    out.push(`<text x="22" y="${cy}" dy="0.35em" text-anchor="middle" font-size="12" font-weight="600" style="fill:${C.paper}">${l.nr}</text>`);
    l.zeilen.forEach((z, i) => {
      out.push(`<text x="46" y="${cy + 4 + i * 17}" font-size="13" style="fill:${C.ink}">${esc(z)}</text>`);
    });
    out.push("</g>");
  }

  const desc = describedBy ? ` aria-describedby="${esc(describedBy)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(matrixBeschriftung(segmente))}"${desc} viewBox="0 0 ${L.width} ${L.height}" ` +
    `preserveAspectRatio="xMidYMin meet" style="display:block;width:100%;height:auto">` +
    out.join("") +
    "</svg>"
  );
}

/** Eingaben der Matrix aus einer Auswertung. */
export function matrixEingabe(a: Auswertung): MatrixEingabe[] {
  return a.segmente.map((s) => ({
    nr: s.nr,
    name: s.name,
    attraktivitaet: s.attraktivitaet,
    erreichbarkeit: s.erreichbarkeit,
    primaer: a.empfehlung.primaer?.nr === s.nr,
  }));
}

// ---- Dokument ----------------------------------------------------------------------------------

export type Kontext = { firma: string; branche: string; typ: Typ };

const firmaText = (k: Kontext): string => one(k.firma) || "keine Angabe";
const kanaeleText = (kanaele: readonly string[]): string => (kanaele.length > 0 ? kanaele.join(", ") : "keine Angabe");

export const DOC_TITLE = "Zielgruppen-Segmente";

/** Wie gerechnet wird; steht im Dokument und unter dem Ergebnis. */
export const RECHNUNG: readonly string[] = [
  `Die Skalen und die Grösse eines Segments sind deine Einschätzungen, keine Statistik.`,
  `Attraktivität (0 bis 100): Mittel aus der Grösse im Vergleich zum grössten Segment (1 bis 5), der Zahlungsbereitschaft und dem Wettbewerbsdruck (umgekehrt gezählt: 6 minus Wert). Die drei Teile zählen gleich viel (${RICHTWERT_NOTE}).`,
  `Erreichbarkeit (0 bis 100): deine Skala von 1 bis 5, umgerechnet.`,
  `Ab ${SCHWELLE} gilt ein Wert als hoch (${RICHTWERT_NOTE}).`,
  `Rangfolge: der höhere Mittelwert aus Attraktivität und Erreichbarkeit; bei Gleichstand die höhere Erreichbarkeit, dann die frühere Eingabe.`,
];

/** Drei Hinweise unter dem Dokument. */
export const HINWEISE: readonly string[] = [
  `Bearbeite lieber ein Segment richtig als vier halb. Ein bis zwei Segmente gleichzeitig sind ein ${RICHTWERT_NOTE}.`,
  `Prüfe deine Einschätzungen nach drei Monaten: Kommen die Anfragen aus dem Primärsegment, und stimmt die Zahlungsbereitschaft? Drei Monate sind ein ${RICHTWERT_NOTE}.`,
  "Die Matrix zeigt Prioritäten, keine Garantien. Sie ordnet deine Einschätzungen, mehr nicht.",
];

const wortSegmente = (n: number): string => (n === 1 ? "1 Segment" : `${n} Segmente`);

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(a: Auswertung, k: Kontext): DocumentModel {
  const verein = k.typ === "verein";
  const n = a.segmente.length;
  const facts = [{ label: verein ? "Verein" : "Betrieb", value: firmaText(k) }];
  if (one(k.branche)) facts.push({ label: verein ? "Tätigkeit" : "Branche", value: one(k.branche) });
  facts.push({ label: verein ? "Zielgruppen" : "Segmente", value: String(n) });

  const blocks: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "heading", level: 1, text: "Empfehlung" },
    { type: "paragraph", text: a.empfehlung.text },
    { type: "heading", level: 1, text: n > 1 ? "Die Segmente in der Matrix" : "Das Segment im Überblick" },
    {
      type: "table",
      header: ["Segment", "Attraktivität", "Erreichbarkeit", "Feld"],
      rows: a.segmente.map((s) => [`${s.nr}. ${s.name}`, String(s.attraktivitaet), String(s.erreichbarkeit), FELDER[s.feld].titel]),
      widths: [3.4, 2, 2, 2.4],
    },
    {
      type: "paragraph",
      text:
        n > 1
          ? `Waagrecht steht die Erreichbarkeit, senkrecht die Attraktivität, jeweils von 0 bis 100. Ab ${SCHWELLE} gilt ein Wert als hoch (${RICHTWERT_NOTE}).`
          : `Mit einem Segment gibt es keine Matrix. Beschreibe ein zweites Segment, dann ordnet das Werkzeug beide ein.`,
    },
    { type: "heading", level: 1, text: "Botschaft je Segment" },
    { type: "list", items: a.rangfolge.map((s) => s.botschaft) },
    { type: "heading", level: 1, text: "Deine Angaben" },
  ];
  for (const s of a.segmente) {
    const items = [
      { label: "Hauptbedürfnis", value: s.beduerfnis },
      { label: "Kaufmotiv", value: s.kaufmotiv },
      { label: "Dein Nutzen", value: s.nutzen },
      { label: "Grösse (deine Schätzung)", value: numberCH(s.groesse, 0) },
      { label: "Kanäle", value: kanaeleText(s.kanaele) },
    ];
    if (s.einwand) items.push({ label: "Typischer Einwand", value: s.einwand });
    for (const sk of SKALEN) items.push({ label: `${sk.label} (1 bis 5)`, value: stufeText(sk.key, s[sk.key]) });
    blocks.push({ type: "heading", level: 2, text: `${s.nr}. ${s.name}` }, { type: "facts", items });
  }
  blocks.push(
    { type: "heading", level: 1, text: "So sind die Werte entstanden" },
    { type: "list", items: [...RECHNUNG] },
    { type: "paragraph", text: HINWEIS_EINSCHAETZUNG },
    { type: "list", items: FELD_KEYS.map((f) => `${FELDER[f].titel} (${FELDER[f].lage}): ${FELDER[f].text}`) },
    { type: "heading", level: 1, text: "Hinweise" },
    { type: "list", ordered: true, items: [...HINWEISE] },
  );
  const fokus = a.empfehlung.primaer;
  return {
    title: DOC_TITLE,
    subtitle: fokus ? `Fokus: ${fokus.name}` : wortSegmente(n),
    firma: one(k.firma) || undefined,
    filename: `zielgruppen-segmente-${safeFilename(k.firma, "betrieb")}`,
    blocks,
  };
}

/** Die Angaben fürs CRM, eine Zeile je Segment (der Server kürzt auf 1'900 Zeichen). */
export function eingabeText(k: Kontext, a: Pick<Auswertung, "segmente">): string {
  const verein = k.typ === "verein";
  const lines = [`${verein ? "Verein" : "Betrieb"}: ${firmaText(k)}`];
  if (one(k.branche)) lines.push(`${verein ? "Tätigkeit" : "Branche"}: ${one(k.branche)}`);
  for (const s of a.segmente) {
    lines.push(
      [
        `Segment ${s.nr}: ${s.name}`,
        `Bedürfnis: ${s.beduerfnis}`,
        `Kaufmotiv: ${s.kaufmotiv}`,
        `Nutzen: ${s.nutzen}`,
        `Grösse: ${numberCH(s.groesse, 0)}`,
        `Kanäle: ${kanaeleText(s.kanaele)}`,
        `Einwand: ${s.einwand || "keiner"}`,
        `Zahlungsbereitschaft ${s.zahlung} von 5, Erreichbarkeit ${s.erreich} von 5, Wettbewerbsdruck ${s.wettbewerb} von 5`,
      ].join("; "),
    );
  }
  return lines.join("\n");
}

/** Das Ergebnis fürs CRM und zum Kopieren: das Dokument als Markdown. */
export function ausgabeText(a: Auswertung, k: Kontext): string {
  return toMarkdown(toDocument(a, k));
}

// ---- Profil ------------------------------------------------------------------------------------

export type ProfilePatch = Partial<Record<ProfileKey, unknown>>;

/**
 * Schreibt die Segmente (Primärsegment zuerst) und das Primärsegment ins Profil, aber nur in leere Felder (Harte Regel 10;
 * writesProfile in tool.config.ts). Form wie beim ICP-Builder: `{ name, beschreibung }`.
 */
export function profilePatch(profile: Pick<Profile, "zielgruppen" | "primaersegment">, a: Pick<Auswertung, "rangfolge" | "empfehlung">): ProfilePatch {
  const patch: ProfilePatch = {};
  if (!profile.zielgruppen?.length) {
    patch.zielgruppen = a.rangfolge.map((s) => ({
      name: s.name,
      beschreibung: `Hauptbedürfnis: ${ohneSchluss(s.beduerfnis)}. Kaufmotiv: ${ohneSchluss(s.kaufmotiv)}.`,
    }));
  }
  if (!profile.primaersegment?.trim() && a.empfehlung.primaer) patch.primaersegment = a.empfehlung.primaer.name;
  return patch;
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

/** Kurzfassung des Ergebnisses im Stand. Beim Lesen wird sie aus den Segmenten neu berechnet; ein gespeicherter Wert zählt nicht. */
export type Kurzergebnis = {
  primaer: string | null;
  sekundaer: string | null;
  vorerstNicht: string[];
  segmente: { name: string; attraktivitaet: number; erreichbarkeit: number; feld: FeldKey }[];
};

export type ZsState = { v: 1; phase: "edit" | "result"; segmente: Segment[]; output?: Kurzergebnis };

/** Leerer Stand: keine eigenen Segmente, die Startliste kommt dann aus dem Profil (`vorlage`). */
export const EMPTY_STATE: ZsState = { v: 1, phase: "edit", segmente: [] };

export function kurzergebnis(a: Auswertung): Kurzergebnis {
  return {
    primaer: a.empfehlung.primaer?.name ?? null,
    sekundaer: a.empfehlung.sekundaer?.name ?? null,
    vorerstNicht: a.empfehlung.zurueck.map((s) => s.name),
    segmente: a.rangfolge.map((s) => ({ name: s.name, attraktivitaet: s.attraktivitaet, erreichbarkeit: s.erreichbarkeit, feld: s.feld })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const singleLine = (v: unknown, max: number): string => text(v, max).replace(/[\r\n]+/g, " ");
const wert = (v: unknown): number => (istWert(v) ? v : 0);

function parseSegment(raw: unknown, used: Set<string>): Segment | null {
  if (!isObj(raw)) return null;
  let id = typeof raw.id === "string" && /^[a-z0-9-]{1,24}$/.test(raw.id) && !used.has(raw.id) ? raw.id : "";
  if (!id) {
    for (let n = 1; ; n++) {
      if (!used.has(`s${n}`)) {
        id = `s${n}`;
        break;
      }
    }
  }
  used.add(id);
  const g = raw.groesse;
  const groesse = typeof g === "number" && Number.isFinite(g) ? String(g).slice(0, 16) : singleLine(g, 16);
  const kanaele = Array.isArray(raw.kanaele) ? KANAELE.filter((k) => (raw.kanaele as unknown[]).includes(k)).slice(0, MAX_KANAELE) : [];
  return {
    id,
    name: singleLine(raw.name, 200),
    beduerfnis: singleLine(raw.beduerfnis, 400),
    kaufmotiv: singleLine(raw.kaufmotiv, 400),
    nutzen: singleLine(raw.nutzen, 400),
    groesse,
    kanaele,
    einwand: singleLine(raw.einwand, 400),
    zahlung: wert(raw.zahlung),
    erreich: wert(raw.erreich),
    wettbewerb: wert(raw.wettbewerb),
  };
}

/**
 * Liest den gespeicherten Stand. Kaputte Daten oder eine falsche Version ergeben den leeren Stand. «result» gilt nur, wenn die
 * Segmente die Prüfung bestehen; dann wird das Kurzergebnis neu berechnet. Mehr als vier Segmente werden abgeschnitten.
 */
export function parseState(raw: unknown): ZsState {
  if (!isObj(raw) || raw.v !== 1) return EMPTY_STATE;
  const used = new Set<string>();
  const segmente = Array.isArray(raw.segmente)
    ? raw.segmente
        .slice(0, 20)
        .map((s) => parseSegment(s, used))
        .filter((s): s is Segment => s !== null)
        .slice(0, MAX_SEGMENTE)
    : [];
  if (raw.phase === "result") {
    const a = auswerten(segmente);
    if (a) return { v: 1, phase: "result", segmente, output: kurzergebnis(a) };
  }
  return { v: 1, phase: "edit", segmente };
}
