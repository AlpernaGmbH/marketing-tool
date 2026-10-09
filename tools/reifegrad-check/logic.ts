import { formatAnswer, type AnswerValue, type Answers, type Question } from "@/components/tool/questionnaire";
import { dateCH } from "@/lib/ch";
import { toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";
import type { PitchSpec } from "@/lib/pitch";
import { GROESSEN } from "@/lib/profile";

// Reine Funktionen: kein React, kein DOM. Spec: specs/reifegrad-check.md
// Alle Punktzahlen, Stufen und Schritte sind Richtwerte dieses Werkzeugs, keine Statistik.

export const SLUG = "reifegrad-check";

// ---- Fragen (höchstens 10, CLAUDE.md Harte Regel 9) --------------------------------------------
// Bei «single» ist die Reihenfolge der Antworten die Punktzahl: erste Antwort 0, letzte 3.

export const questions: Question[] = [
  {
    id: "ziele",
    type: "single",
    label: "Sind deine Marketingziele schriftlich festgehalten?",
    help: "Zum Beispiel: Anfragen pro Monat, neue Mitglieder bis Saisonstart, Umsatz je Angebot.",
    required: true,
    options: [
      { value: "keine", label: "Nein, es gibt keine festen Ziele" },
      { value: "kopf", label: "Im Kopf oder mündlich besprochen" },
      { value: "schriftlich", label: "Schriftlich, aber ohne Zahl und Termin" },
      { value: "messbar", label: "Schriftlich, mit Zahl und Termin" },
    ],
  },
  {
    id: "zielgruppe",
    type: "single",
    label: "Ist deine wichtigste Kundengruppe benannt?",
    help: "Bei Vereinen: Mitglieder, Publikum oder Sponsoren.",
    required: true,
    options: [
      { value: "nein", label: "Nein, wir sprechen alle an" },
      { value: "grob", label: "Grob, zum Beispiel «Privatkunden in der Region»" },
      { value: "beschrieben", label: "Beschrieben, mit Anlass und Bedürfnis" },
      { value: "profil", label: "Schriftlich als Profil, das alle im Betrieb kennen" },
    ],
  },
  {
    id: "verantwortung",
    type: "single",
    label: "Wer kümmert sich ums Marketing, und wie viel Zeit pro Woche?",
    required: true,
    options: [
      { value: "niemand", label: "Niemand fest, es passiert nebenbei" },
      { value: "unter2", label: "Eine Person, unter 2 Stunden pro Woche" },
      { value: "2bis5", label: "Eine Person, 2 bis 5 Stunden pro Woche" },
      { value: "ueber5", label: "Eine Person oder ein Partner, mehr als 5 Stunden pro Woche" },
    ],
  },
  {
    id: "website",
    type: "single",
    label: "Wann wurde deine Website zuletzt geändert?",
    help: "Neue Texte, Fotos, Preise oder Angebote zählen; ein Update der Technik allein nicht.",
    required: true,
    options: [
      { value: "keine", label: "Es gibt keine Website" },
      { value: "aelter", label: "Vor mehr als einem Jahr, oder ich weiss es nicht" },
      { value: "jahr", label: "Im letzten Jahr" },
      { value: "quartal", label: "In den letzten drei Monaten" },
    ],
  },
  {
    id: "google",
    type: "single",
    label: "Wie gepflegt ist dein Google-Unternehmensprofil?",
    help: "Der Eintrag, der bei Google Maps und in der Suche zu deinem Betrieb erscheint.",
    required: true,
    options: [
      { value: "keins", label: "Es gibt keins, oder ich weiss es nicht" },
      { value: "unbestaetigt", label: "Es gibt eins, aber ich habe es nicht selbst bestätigt" },
      { value: "bestaetigt", label: "Bestätigt, Öffnungszeiten und Angaben stimmen" },
      { value: "aktiv", label: "Bestätigt und regelmässig mit Fotos oder Beiträgen gepflegt" },
    ],
  },
  {
    id: "social",
    type: "single",
    label: "Wie oft erscheint ein Beitrag auf Social Media?",
    help: "Instagram, Facebook, LinkedIn oder TikTok, auf dem Kanal, den du am meisten nutzt.",
    required: true,
    options: [
      { value: "nie", label: "Gar nicht, oder es gibt keinen Kanal" },
      { value: "selten", label: "Seltener als einmal im Monat" },
      { value: "monatlich", label: "Etwa einmal im Monat" },
      { value: "woechentlich", label: "Jede Woche oder öfter" },
    ],
  },
  {
    id: "bewertungen",
    type: "single",
    label: "Beantwortest du Bewertungen auf Google und anderen Plattformen?",
    required: true,
    options: [
      { value: "nie", label: "Nein, oder wir haben keine Bewertungen" },
      { value: "manchmal", label: "Manchmal, vor allem die kritischen" },
      { value: "alle", label: "Alle, meist innerhalb einer Woche" },
      { value: "aktiv", label: "Alle, und wir bitten zufriedene Kundschaft um Bewertungen" },
    ],
  },
  {
    id: "kontakt",
    type: "single",
    label: "Wie hältst du Kontakt zu bestehender Kundschaft?",
    help: "Bei Vereinen: zu Mitgliedern, Gönnern und Sponsoren.",
    required: true,
    options: [
      { value: "keiner", label: "Nur, wenn sich jemand bei uns meldet" },
      { value: "gelegentlich", label: "Gelegentlich, zum Beispiel eine Karte zum Jahresende" },
      { value: "unregelmaessig", label: "Newsletter oder Post, aber unregelmässig" },
      { value: "regelmaessig", label: "Newsletter oder Post in festem Rhythmus" },
    ],
  },
  {
    id: "messung",
    type: "multi",
    label: "Welche Kennzahlen schaust du regelmässig an?",
    help: "Wähle alles, was du mindestens einmal im Quartal anschaust.",
    required: true,
    options: [
      { value: "anfragen", label: "Anzahl Anfragen und woher sie kommen" },
      { value: "website", label: "Besucherzahlen der Website" },
      { value: "google", label: "Aufrufe und Anrufe aus dem Google-Profil" },
      { value: "social", label: "Aufrufe und Reaktionen auf Social Media" },
      { value: "kosten", label: "Kosten je Anfrage oder Auftrag" },
      { value: "keine", label: "Keine" },
    ],
  },
  {
    id: "budget",
    type: "single",
    label: "Ist ein Marketingbudget für das Jahr geplant?",
    required: true,
    options: [
      { value: "keins", label: "Nein, wir zahlen, wenn etwas anfällt" },
      { value: "grob", label: "Grob, ein ungefährer Rahmen" },
      { value: "fest", label: "Ja, ein fester Betrag für das Jahr" },
      { value: "verteilt", label: "Ja, ein fester Betrag, verteilt auf einzelne Massnahmen" },
    ],
  },
];

/** Höchstpunktzahl je Frage. */
export const MAX_POINTS = 3;

/** Bei «messung»: diese Antwort zählt nicht als Kennzahl. */
const NONE = "keine";

const byId = new Map(questions.map((q) => [q.id, q]));

/** Punkte einer Antwort: 0 bis MAX_POINTS. Unbekannte, leere oder falsch typisierte Antworten geben 0. */
export function pointsFor(id: string, answer: AnswerValue | undefined): number {
  const q = byId.get(id);
  if (!q) return 0;
  if (q.type === "multi") {
    if (!Array.isArray(answer)) return 0;
    const valid = new Set(q.options.map((o) => o.value));
    const chosen = new Set(answer.filter((v): v is string => typeof v === "string" && v !== NONE && valid.has(v)));
    return Math.min(MAX_POINTS, chosen.size);
  }
  if (q.type !== "single" || typeof answer !== "string") return 0;
  const index = q.options.findIndex((o) => o.value === answer);
  return index < 0 ? 0 : Math.min(MAX_POINTS, index);
}

// ---- Dimensionen und Stufen ----------------------------------------------------------------------

export const DIMENSIONS = [
  { id: "strategie", name: "Strategie", questions: ["ziele", "zielgruppe"] },
  { id: "auftritt", name: "Auftritt", questions: ["website", "google"] },
  { id: "inhalte", name: "Inhalte", questions: ["social"] },
  { id: "kundenkontakt", name: "Kundenkontakt", questions: ["bewertungen", "kontakt"] },
  { id: "steuerung", name: "Steuerung", questions: ["verantwortung", "messung", "budget"] },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

export const STUFEN = ["Anfang", "Aufbau", "Routine", "Fortgeschritten"] as const;
export type Stufe = (typeof STUFEN)[number];

/** Untergrenzen der Stufen (Richtwert dieses Werkzeugs): ab 25 Aufbau, ab 50 Routine, ab 75 Fortgeschritten. */
export const STUFE_AB: Record<Exclude<Stufe, "Anfang">, number> = { Aufbau: 25, Routine: 50, Fortgeschritten: 75 };

export function stufe(score: number): Stufe {
  if (!Number.isFinite(score)) return "Anfang";
  if (score >= STUFE_AB.Fortgeschritten) return "Fortgeschritten";
  if (score >= STUFE_AB.Routine) return "Routine";
  if (score >= STUFE_AB.Aufbau) return "Aufbau";
  return "Anfang";
}

/** Anteil des Marketing-Checks an der Dimension «Auftritt». */
export const CHECK_WEIGHT = 0.5;

/** Ab dieser Punktzahl bekommt eine Dimension die Schritte zum Festigen statt zum Aufbauen. */
export const FESTIGEN_AB = STUFE_AB.Routine;

// ---- Nächste Schritte (feste Texte, Richtwerte von Alperna, keine Statistik) ------------------------

type StepPair = readonly [string, string];

export const STEPS: Record<DimensionId, { aufbauen: StepPair; festigen: StepPair }> = {
  strategie: {
    aufbauen: [
      "Schreib drei Ziele für die nächsten zwölf Monate auf, je mit Zahl und Termin, zum Beispiel «zwanzig Anfragen aus Gossau und Umgebung bis 30.06.2027».",
      "Beschreib deine wichtigste Kundengruppe auf einer halben Seite: wer, in welchen Gemeinden, zu welchem Anlass, mit welchem Problem. Leg sie im Firmenprofil unter Zielgruppen ab.",
    ],
    festigen: [
      "Prüf die Ziele einmal pro Quartal in der Geschäftsleitung oder im Vorstand: erreicht, offen, gestrichen. Zehn Minuten reichen.",
      "Leg je Kundengruppe einen Satz fest, warum sie zu dir kommt und nicht zum Betrieb im Nachbardorf. Dieser Satz gehört auf die Startseite.",
    ],
  },
  auftritt: {
    aufbauen: [
      "Bestätige dein Google-Unternehmensprofil, prüf Adresse, Telefon und Öffnungszeiten und lad acht aktuelle Fotos aus deinem Betrieb hoch.",
      "Bring die Website auf Stand: Angebot und Ort auf der Startseite, Telefonnummer sichtbar, Darstellung auf dem Handy prüfen.",
    ],
    festigen: [
      "Setz dir einen festen Termin pro Quartal für die Website: Texte, Preise, Team und Referenzen prüfen und veraltete Angebote löschen.",
      "Veröffentliche im Google-Profil einmal im Monat einen Beitrag oder ein neues Foto, zum Beispiel einen abgeschlossenen Auftrag oder einen Anlass.",
    ],
  },
  inhalte: {
    aufbauen: [
      "Leg einen Rhythmus fest, den du durchhältst: ein Beitrag alle zwei Wochen ist besser als drei in einer Woche und danach nichts.",
      "Sammle zehn Themen aus dem Alltag: ein Auftrag vorher und nachher, eine Frage aus der Kundschaft, ein Anlass in der Gemeinde. Das reicht für ein Quartal.",
    ],
    festigen: [
      "Plane die Beiträge für ein Quartal im Voraus und trag Schulferien, Feiertage und lokale Anlässe wie Chilbi oder Gewerbeausstellung in den Plan ein.",
      "Nutz jeden Beitrag zweimal: auf Social Media und als Neuigkeit auf der Website oder im Google-Profil.",
    ],
  },
  kundenkontakt: {
    aufbauen: [
      "Antworte auf jede Bewertung bei Google innerhalb einer Woche, auch auf die guten: zwei Sätze, mit Namen unterschrieben.",
      "Bitte nach jedem abgeschlossenen Auftrag um eine Bewertung. Ein Link zum Google-Profil in der Rechnungs-E-Mail genügt.",
    ],
    festigen: [
      "Schick zweimal im Jahr eine Nachricht an bestehende Kundschaft: Neuigkeiten, Saisonangebot, Erinnerung an den nächsten Termin, immer mit Abmeldelink.",
      "Führ eine Liste der Kundschaft mit E-Mail-Adresse und Einwilligung, zum Beispiel in einer Tabelle, und ergänze sie nach jedem Auftrag.",
    ],
  },
  steuerung: {
    aufbauen: [
      "Bestimme eine Person, die das Marketing verantwortet, und blocke ihr zwei Stunden pro Woche im Kalender.",
      "Zähl ab sofort jede Anfrage und notier, woher sie kam: Google, Empfehlung, Website, Social Media. Eine Strichliste reicht.",
    ],
    festigen: [
      "Leg ein Jahresbudget fest und verteile es auf drei bis vier Massnahmen, mit einem Betrag je Massnahme.",
      "Schau einmal im Monat auf drei Zahlen: Anfragen, Aufträge daraus, Kosten je Auftrag. Streich nach sechs Monaten, was nichts bringt.",
    ],
  },
};

// ---- Marketing-Check (mt:digitaler-auftritt-check) -------------------------------------------------

export type CheckInfo = { score: number; checkedAt: string };

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * Liest aus dem gespeicherten Stand des Marketing-Checks (parseCheckState) die Punktzahl.
 * null, wenn kein Ergebnis vorliegt oder die Punktzahl unbrauchbar ist.
 */
export function checkInfo(saved: unknown): CheckInfo | null {
  if (typeof saved !== "object" || saved === null) return null;
  const s = saved as { phase?: unknown; result?: unknown };
  if (s.phase !== "result" || typeof s.result !== "object" || s.result === null) return null;
  const r = s.result as { score?: unknown; checkedAt?: unknown };
  if (typeof r.score !== "number" || !Number.isFinite(r.score)) return null;
  return { score: clamp(Math.round(r.score)), checkedAt: typeof r.checkedAt === "string" ? r.checkedAt : "" };
}

// ---- Auswertung --------------------------------------------------------------------------------

export type DimensionResult = {
  id: DimensionId;
  name: string;
  /** 0 bis 100 */
  score: number;
  stufe: Stufe;
  /** Selbstangabe 0 bis 100 (ohne Check). */
  selbst: number;
  /** Punktzahl des Marketing-Checks, nur bei «Auftritt» und nur wenn vorhanden. */
  check: number | null;
  schritte: string[];
};

export type Schritt = { dimension: DimensionId; name: string; text: string };

export type Reifegrad = {
  /** 0 bis 100 */
  gesamt: number;
  stufe: Stufe;
  /** Feste Reihenfolge wie DIMENSIONS. */
  dimensionen: DimensionResult[];
  /** Alle Schritte, geordnet nach der schwächsten Dimension. */
  schritte: Schritt[];
  check: CheckInfo | null;
  kontext: { branche: string | null; groesse: string | null };
  /** Gestellte Fragen mit der Antwort in Worten, für Dokument und CRM. */
  antworten: { frage: string; antwort: string }[];
};

const pct = (points: number, max: number) => (max > 0 ? Math.round((points / max) * 100) : 0);

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Antwort in Worten; unbekannte oder falsch typisierte Antworten erscheinen als «–». */
function answerLabel(q: Question, a: AnswerValue | undefined): string {
  if (q.type === "single") return typeof a === "string" && q.options.some((o) => o.value === a) ? formatAnswer(q, a) : "–";
  if (q.type === "multi") {
    const known = Array.isArray(a) ? a.filter((v): v is string => typeof v === "string" && q.options.some((o) => o.value === v)) : [];
    return known.length > 0 ? formatAnswer(q, known) : "–";
  }
  return formatAnswer(q, a);
}

/** «10-49» → «10 bis 49 Mitarbeitende»; unbekannte Werte bleiben, wie sie sind. */
export function groesseLabel(value: string): string {
  for (const list of Object.values(GROESSEN)) {
    const hit = list.find((g) => g.value === value);
    if (hit) return hit.label;
  }
  return value;
}

/** Antworten → Reifegrad. `check` ist das Ergebnis des Marketing-Checks, falls vorhanden (zählt zur Hälfte in «Auftritt»). */
export function evaluate(answers: Answers, check: CheckInfo | null = null): Reifegrad {
  const a: Answers = typeof answers === "object" && answers !== null ? answers : {};
  const usable = check && Number.isFinite(check.score) ? { score: clamp(Math.round(check.score)), checkedAt: check.checkedAt } : null;

  const dimensionen: DimensionResult[] = DIMENSIONS.map((d) => {
    const points = d.questions.reduce((sum, id) => sum + pointsFor(id, a[id]), 0);
    const selbst = pct(points, d.questions.length * MAX_POINTS);
    const withCheck = d.id === "auftritt" && usable ? usable.score : null;
    const score = withCheck === null ? selbst : Math.round(selbst * (1 - CHECK_WEIGHT) + withCheck * CHECK_WEIGHT);
    const pair = score >= FESTIGEN_AB ? STEPS[d.id].festigen : STEPS[d.id].aufbauen;
    return { id: d.id, name: d.name, score, stufe: stufe(score), selbst, check: withCheck, schritte: [...pair] };
  });

  const gesamt = Math.round(dimensionen.reduce((s, d) => s + d.score, 0) / dimensionen.length);

  // Schwächste Dimension zuerst; bei Gleichstand bleibt die feste Reihenfolge (stabile Sortierung).
  const schritte: Schritt[] = [...dimensionen]
    .sort((x, y) => x.score - y.score)
    .flatMap((d) => d.schritte.map((t) => ({ dimension: d.id, name: d.name, text: t })));

  const groesse = text(a.groesse);
  const antworten = questions.map((q) => ({ frage: q.label, antwort: answerLabel(q, a[q.id]) }));

  return {
    gesamt,
    stufe: stufe(gesamt),
    dimensionen,
    schritte,
    check: usable,
    kontext: { branche: text(a.branche), groesse: groesse ? groesseLabel(groesse) : null },
    antworten,
  };
}

// ---- Dokument ----------------------------------------------------------------------------------

export const RICHTWERT_HINWEIS = "Punktzahlen, Stufen und Schritte sind Richtwerte dieses Werkzeugs aus deinen Selbstangaben, keine Statistik und kein Vergleich mit anderen Betrieben.";

export function rechenweg(result: Reifegrad): string[] {
  const auftritt = result.dimensionen.find((d) => d.id === "auftritt");
  return [
    "Jede Frage gibt 0 bis 3 Punkte, je nach gewählter Antwort; bei den Kennzahlen zählt jede gewählte Kennzahl einen Punkt, höchstens drei.",
    "Eine Dimension ist die Summe ihrer Punkte geteilt durch die Höchstpunktzahl, mal 100: Strategie (Ziele, Kundengruppe), Auftritt (Website, Google-Profil), Inhalte (Beiträge), Kundenkontakt (Bewertungen, Kontakt), Steuerung (Verantwortung, Kennzahlen, Budget).",
    result.check && auftritt
      ? `Auftritt ist das Mittel aus Selbstangabe und Marketing-Check: (${auftritt.selbst} + ${result.check.score}) ÷ 2 = ${auftritt.score}.`
      : "Ohne gespeicherten Marketing-Check zählt bei «Auftritt» nur die Selbstangabe.",
    "Gesamt ist das Mittel der fünf Dimensionen; alle zählen gleich.",
    `Stufen: 0 bis ${STUFE_AB.Aufbau - 1} Anfang, ${STUFE_AB.Aufbau} bis ${STUFE_AB.Routine - 1} Aufbau, ${STUFE_AB.Routine} bis ${STUFE_AB.Fortgeschritten - 1} Routine, ${STUFE_AB.Fortgeschritten} bis 100 Fortgeschritten.`,
  ];
}

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. Firma und Datum ergänzt DocumentExport aus dem Profil. */
export function toDocument(result: Reifegrad): DocumentModel {
  const facts: { label: string; value: string }[] = [{ label: "Reifegrad gesamt", value: `${result.gesamt} von 100, Stufe «${result.stufe}»` }];
  if (result.kontext.branche) facts.push({ label: "Branche", value: result.kontext.branche });
  if (result.kontext.groesse) facts.push({ label: "Grösse", value: result.kontext.groesse });
  facts.push({
    label: "Marketing-Check",
    value: result.check
      ? `${result.check.score} von 100${result.check.checkedAt ? ` vom ${dateCH(result.check.checkedAt)}` : ""}, zählt zur Hälfte in «Auftritt»`
      : "nicht einbezogen, kein Ergebnis gespeichert",
  });

  const blocks: DocBlock[] = [
    { type: "facts", items: facts },
    { type: "heading", level: 1, text: "Fünf Dimensionen" },
    {
      type: "table",
      header: ["Dimension", "Punkte", "Stufe"],
      widths: [2, 2.2, 1.4],
      rows: result.dimensionen.map((d) => [
        d.name,
        d.check === null ? `${d.score} von 100` : `${d.score} von 100 (Selbstangabe ${d.selbst}, Check ${d.check})`,
        d.stufe,
      ]),
    },
    { type: "heading", level: 1, text: "Nächste Schritte" },
    { type: "paragraph", text: "Geordnet nach der schwächsten Dimension. Je Dimension zwei Schritte, passend zu ihrer Stufe." },
    { type: "list", ordered: true, items: result.schritte.map((s) => `${s.name}: ${s.text}`) },
    { type: "heading", level: 1, text: "So ist gerechnet" },
    { type: "list", items: [...rechenweg(result), RICHTWERT_HINWEIS] },
    { type: "heading", level: 1, text: "Deine Antworten" },
    { type: "facts", items: result.antworten.map((x) => ({ label: x.frage, value: x.antwort })) },
  ];

  return {
    title: "Reifegrad-Check",
    subtitle: `Marketing-Reifegrad ${result.gesamt} von 100, Stufe «${result.stufe}»`,
    filename: "reifegrad-check",
    blocks,
  };
}

/** Das Ergebnis für den Bildschirm: grosse Zahl, fünf Balken, die nächsten Schritte als Folien. Die Datei (PDF, Word) bekommt dieselben Inhalte als Tabelle und Liste. */
export function visualBlocks(result: Reifegrad): DocBlock[] {
  // Die schwächste Dimension (bei Gleichstand die erste in der Reihenfolge der Werkzeuge) ist golden: Dort fängt der erste Schritt an.
  const schwach = result.dimensionen.length > 0 ? [...result.dimensionen].sort((a, b) => a.score - b.score)[0].id : null;
  return [
    { type: "stat", label: "Reifegrad gesamt", value: String(result.gesamt), of: "100", band: `Stufe «${result.stufe}»` },
    {
      type: "bars",
      title: "Fünf Dimensionen",
      max: 100,
      items: result.dimensionen.map((d) => ({
        label: d.name,
        value: d.score,
        highlight: d.id === schwach,
        note: `Stufe «${d.stufe}»${d.check !== null ? `, Selbstangabe ${d.selbst}, Marketing-Check ${d.check}` : ""}`,
      })),
    },
    {
      type: "slides",
      title: "Nächste Schritte, bei der schwächsten Dimension beginnend",
      items: result.schritte.map((s, i) => ({ title: s.name, text: s.text, tag: `Schritt ${i + 1}` })),
    },
  ];
}

/** Baustein, der zur Dimension passt, in der Alperna etwas übernehmen kann (Auftritt, Inhalte, Kundenkontakt). */
const BAUSTEIN_JE_DIMENSION: Partial<Record<DimensionId, PitchSpec["baustein"]>> = {
  auftritt: "Website",
  inhalte: "Social Media",
  kundenkontakt: "Google Business Profil",
};

/** Bis zu dieser Punktzahl sieht Alperna in einer Dimension etwas zu tun; ab «Fortgeschritten» gibt es nichts zu sagen. */
export const PITCH_BIS = STUFE_AB.Fortgeschritten;

/** Hinweis auf Alperna aus dem Ergebnis: die schwächste Dimension, in der Alperna arbeitet. Ohne solche Dimension unter «Fortgeschritten» kein Hinweis. */
export function pitchFor(result: Reifegrad): PitchSpec | null {
  const kandidaten = result.dimensionen
    .filter((d) => BAUSTEIN_JE_DIMENSION[d.id] && d.score < PITCH_BIS)
    .sort((a, b) => a.score - b.score);
  const d = kandidaten[0];
  if (!d) return null;
  return { baustein: BAUSTEIN_JE_DIMENSION[d.id]!, satz: `Am meisten Luft hat bei dir «${d.name}»: ${d.score} von 100.` };
}

/** Ausgabe fürs CRM (Zugang v3): Markdown des Dokuments; Gesamt und Dimensionen stehen oben. */
export function resultText(result: Reifegrad): string {
  return toMarkdown(toDocument(result));
}
