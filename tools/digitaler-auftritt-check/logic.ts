import type { Answers, Question } from "@/components/tool/questionnaire";
import type { DocumentModel } from "@/lib/export/model";
import type { Profile } from "@/lib/profile";
import { scoreBand } from "@/lib/score";

// Reine Funktionen, kein React, kein DOM. Spec: specs/digitaler-auftritt-check.md

export const BAUSTEIN_IDS = ["website", "gbp", "social", "shop", "buchung", "ads"] as const;
export type BausteinId = (typeof BAUSTEIN_IDS)[number];

export const BAUSTEIN_LABELS: Record<BausteinId, string> = {
  website: "Website",
  gbp: "Google Business Profil",
  social: "Social Media",
  shop: "Online-Shop",
  buchung: "Buchungstool",
  ads: "Google Ads",
};

export type Aufwand = "klein" | "mittel" | "gross";
export type Antwort = "ja" | "teilweise" | "nein";

export type Pruefpunkt = {
  id: string;
  baustein: BausteinId;
  /** Aussage, die der Besucher mit Ja / Teilweise / Nein beantwortet. */
  frage: string;
  /** Gewicht 1 bis 3. Annahme: Einschätzung von Alperna, keine Statistik. */
  gewicht: 1 | 2 | 3;
  aufwand: Aufwand;
  massnahme: string;
  warum: string;
  /** Slug eines Werkzeugs, das dazu passt. Der Link erscheint nur, wenn es das Werkzeug gibt. */
  tool?: string;
};

export const PRUEFPUNKTE: readonly Pruefpunkt[] = [
  // Website
  {
    id: "web-mobil",
    baustein: "website",
    frage: "Die Website ist auf dem Handy gut lesbar und öffnet schnell.",
    gewicht: 3,
    aufwand: "mittel",
    massnahme: "Website auf dem Handy durchklicken und die Ladezeit verbessern",
    warum: "Viele Besucher kommen mit dem Handy. Wer dort warten oder zoomen muss, springt ab.",
  },
  {
    id: "web-kontakt",
    baustein: "website",
    frage: "Telefon, E-Mail und Adresse sind auf jeder Seite schnell zu finden.",
    gewicht: 3,
    aufwand: "klein",
    massnahme: "Kontaktdaten in Kopf- oder Fusszeile jeder Seite einbauen",
    warum: "Wer anfragen will, soll nicht suchen müssen. Jeder Klick mehr kostet Anfragen.",
  },
  {
    id: "web-angebot",
    baustein: "website",
    frage: "Auf der Startseite steht in einem Satz, was du für wen machst.",
    gewicht: 2,
    aufwand: "klein",
    massnahme: "Einen klaren Einstiegssatz an den Anfang der Startseite setzen",
    warum: "Besucher entscheiden in Sekunden, ob sie bleiben. Ein klarer Satz hält sie.",
    tool: "positionierung",
  },
  {
    id: "web-impressum",
    baustein: "website",
    frage: "Impressum und Datenschutzerklärung sind vorhanden und verlinkt.",
    gewicht: 2,
    aufwand: "mittel",
    massnahme: "Impressum und Datenschutzerklärung erstellen und im Fuss verlinken",
    warum: "Sie schaffen Vertrauen und zeigen, wer hinter dem Angebot steht.",
    tool: "impressum",
  },
  // Google Business Profil
  {
    id: "gbp-eintrag",
    baustein: "gbp",
    frage: "Dein Betrieb hat einen bestätigten Google-Business-Eintrag.",
    gewicht: 3,
    aufwand: "mittel",
    massnahme: "Google-Business-Eintrag anlegen und bestätigen lassen",
    warum: "Bei der Suche nach einem Betrieb in der Nähe ist dieser Eintrag oft der erste Kontakt.",
    tool: "gbp-check",
  },
  {
    id: "gbp-daten",
    baustein: "gbp",
    frage: "Öffnungszeiten, Telefon und Website im Eintrag stimmen und sind aktuell.",
    gewicht: 3,
    aufwand: "klein",
    massnahme: "Öffnungszeiten, Telefon und Website im Eintrag prüfen und korrigieren",
    warum: "Falsche Angaben führen zu verpassten Anrufen und zu Frust vor dem ersten Kontakt.",
    tool: "gbp-feiertage",
  },
  {
    id: "gbp-bewertungen",
    baustein: "gbp",
    frage: "Du bittest Kundinnen und Kunden um Google-Bewertungen und antwortest darauf.",
    gewicht: 2,
    aufwand: "mittel",
    massnahme: "Nach jedem erledigten Auftrag um eine Bewertung bitten und Bewertungen beantworten",
    warum: "Bewertungen sind für viele der Grund, dich anzurufen oder eben nicht.",
    tool: "bewertungs-kit",
  },
  {
    id: "gbp-fotos",
    baustein: "gbp",
    frage: "Im Eintrag sind echte, aktuelle Fotos von Betrieb und Arbeit.",
    gewicht: 2,
    aufwand: "klein",
    massnahme: "Echte Fotos von Betrieb, Team und Arbeit hochladen",
    warum: "Fotos zeigen, wer dich erwartet. Das senkt die Hemmschwelle anzufragen.",
  },
  // Social Media
  {
    id: "soc-profil",
    baustein: "social",
    frage: "Das Profil sagt klar, wer du bist, wo du tätig bist und wie man dich erreicht.",
    gewicht: 2,
    aufwand: "klein",
    massnahme: "Profiltext, Ort und Kontaktweg im Social-Media-Profil schärfen",
    warum: "Das Profil ist die Visitenkarte. Wer es öffnet, will sofort wissen, ob er richtig ist.",
    tool: "linkedin-profil",
  },
  {
    id: "soc-rhythmus",
    baustein: "social",
    frage: "Du veröffentlichst in einem festen Rhythmus, den du durchhältst.",
    gewicht: 2,
    aufwand: "mittel",
    massnahme: "Einen Rhythmus festlegen, der zu deiner Zeit passt, und Beiträge vorplanen",
    warum: "Ein Profil, das lange still ist, wirkt verlassen. Ein kleiner, fester Rhythmus wirkt verlässlich.",
    tool: "posting-plan",
  },
  {
    id: "soc-inhalt",
    baustein: "social",
    frage: "Die Beiträge zeigen Arbeit, Menschen oder Wissen und nicht nur Angebote.",
    gewicht: 1,
    aufwand: "mittel",
    massnahme: "Beiträge mit Einblick in die Arbeit und mit Fachwissen mischen",
    warum: "Wer nur verkauft, wird überscrollt. Wer zeigt, wie er arbeitet, bleibt in Erinnerung.",
    tool: "content-saeulen",
  },
  // Online-Shop
  {
    id: "shop-kauf",
    baustein: "shop",
    frage: "Ein Kauf ist in wenigen Schritten und ohne Kundenkonto möglich.",
    gewicht: 3,
    aufwand: "gross",
    massnahme: "Bestellvorgang kürzen und den Kauf ohne Konto ermöglichen",
    warum: "Jeder zusätzliche Schritt vor dem Bezahlen lässt Kundinnen und Kunden abspringen.",
  },
  {
    id: "shop-info",
    baustein: "shop",
    frage: "Preise, Versandkosten und Lieferzeit sind vor dem Bezahlen klar sichtbar.",
    gewicht: 3,
    aufwand: "klein",
    massnahme: "Preise, Versandkosten und Lieferzeit schon im Warenkorb anzeigen",
    warum: "Überraschungen am Schluss lassen Kundinnen und Kunden den Kauf abbrechen.",
    tool: "preisangabe-check",
  },
  {
    id: "shop-vertrauen",
    baustein: "shop",
    frage: "Zahlungsarten, Rückgabe und Kontakt sind verständlich erklärt.",
    gewicht: 2,
    aufwand: "klein",
    massnahme: "Zahlungsarten, Rückgabe und Kontaktweg auf einer Seite erklären",
    warum: "Wer etwas online kauft, will wissen, was passiert, wenn etwas nicht passt.",
  },
  // Buchungstool
  {
    id: "bu-online",
    baustein: "buchung",
    frage: "Termine lassen sich online buchen, auch ausserhalb der Bürozeiten.",
    gewicht: 3,
    aufwand: "mittel",
    massnahme: "Ein Buchungstool einrichten, das mit deinem Kalender verbunden ist",
    warum: "Viele buchen abends oder am Wochenende. Wer dann nicht buchen kann, fragt woanders an.",
  },
  {
    id: "bu-bestaetigung",
    baustein: "buchung",
    frage: "Kundinnen und Kunden erhalten sofort eine Bestätigung und eine Erinnerung.",
    gewicht: 2,
    aufwand: "klein",
    massnahme: "Bestätigung und Erinnerung per Mail oder SMS im Buchungstool aktivieren",
    warum: "Erinnerungen senken Ausfälle und ersparen dir Nachfragen.",
  },
  {
    id: "bu-link",
    baustein: "buchung",
    frage: "Der Buchungslink steht auf der Website, im Google-Eintrag und in den Profilen.",
    gewicht: 2,
    aufwand: "klein",
    massnahme: "Buchungslink überall eintragen, wo man dich findet",
    warum: "Ein Tool, das niemand findet, bringt keine Termine.",
    tool: "whatsapp-link",
  },
  // Google Ads
  {
    id: "ads-ziel",
    baustein: "ads",
    frage: "Du weisst, was ein Kontakt oder eine Anfrage aus Google Ads kosten darf.",
    gewicht: 3,
    aufwand: "mittel",
    massnahme: "Maximal tragbare Kosten pro Anfrage festlegen, bevor du Budget einsetzt",
    warum: "Ohne Zielwert lässt sich nicht beurteilen, ob sich Werbung lohnt.",
    tool: "budget-planer",
  },
  {
    id: "ads-messung",
    baustein: "ads",
    frage: "Anrufe und Formulare werden gemessen und einer Anzeige zugeordnet.",
    gewicht: 3,
    aufwand: "gross",
    massnahme: "Anrufe und Formular-Anfragen als Ziel in Google Ads erfassen",
    warum: "Was du nicht misst, kannst du nicht verbessern. Du bezahlst sonst im Blindflug.",
  },
  {
    id: "ads-seite",
    baustein: "ads",
    frage: "Jede Anzeige führt auf eine Seite, die genau dazu passt.",
    gewicht: 2,
    aufwand: "mittel",
    massnahme: "Pro Anzeigengruppe eine passende Zielseite verwenden",
    warum: "Wer klickt, will sofort finden, was die Anzeige versprochen hat.",
    tool: "keywords-lokal",
  },
];

const ANTWORT_OPTIONEN = [
  { value: "ja", label: "Ja" },
  { value: "teilweise", label: "Teilweise" },
  { value: "nein", label: "Nein" },
];

function matrixFor(b: BausteinId): Question {
  return {
    id: b,
    type: "matrix",
    label: `${BAUSTEIN_LABELS[b]}: Was trifft zu?`,
    help: "«Nein» gilt auch, wenn es etwas noch nicht gibt.",
    required: true,
    rows: PRUEFPUNKTE.filter((p) => p.baustein === b).map((p) => ({ id: p.id, label: p.frage })),
    columns: ANTWORT_OPTIONEN,
    showIf: (a) => Array.isArray(a.bausteine) && a.bausteine.includes(b),
  };
}

/** Sieben Fragen: Auswahl der Bausteine und je eine Matrix pro Baustein (Harte Regel 9: höchstens 10). */
export const questions: Question[] = [
  {
    id: "bausteine",
    type: "multi",
    label: "Welche Bausteine spielen für deinen Betrieb eine Rolle?",
    help: "Was du nicht brauchst, zählt nicht gegen dich. Wähle auch Bausteine, die du noch nicht hast, aber haben solltest.",
    required: true,
    options: BAUSTEIN_IDS.map((b) => ({ value: b, label: BAUSTEIN_LABELS[b] })),
  },
  ...BAUSTEIN_IDS.map(matrixFor),
];

// ---- Auswertung --------------------------------------------------------------------------------

const WERT: Record<Antwort, number> = { ja: 1, teilweise: 0.5, nein: 0 };
const AUFWAND_RANG: Record<Aufwand, number> = { klein: 0, mittel: 1, gross: 2 };

export type BausteinErgebnis = { baustein: BausteinId; label: string; score: number; ja: number; teilweise: number; nein: number };

export type Massnahme = {
  id: string;
  baustein: BausteinId;
  bausteinLabel: string;
  massnahme: string;
  warum: string;
  aufwand: Aufwand;
  /** Gewicht × (1 bei Nein, 0,5 bei Teilweise) */
  prioritaet: number;
  antwort: Exclude<Antwort, "ja">;
  tool?: string;
};

export type Ergebnis = {
  gesamt: number;
  stufe: string;
  bausteine: BausteinErgebnis[];
  massnahmen: Massnahme[];
};

function asAntwort(v: unknown): Antwort {
  return v === "ja" || v === "teilweise" ? v : "nein";
}

function gewaehlt(answers: Answers): BausteinId[] {
  const raw = answers.bausteine;
  const set = new Set(Array.isArray(raw) ? raw : []);
  // Reihenfolge der Bausteine bleibt fest; unbekannte Werte aus altem Zwischenstand werden ignoriert.
  return BAUSTEIN_IDS.filter((b) => set.has(b));
}

/** Baustein-Score 0 bis 100: Summe(Gewicht × Antwortwert) ÷ Summe(Gewicht). */
export function bausteinScore(baustein: BausteinId, antworten: Record<string, unknown>): BausteinErgebnis {
  const punkte = PRUEFPUNKTE.filter((p) => p.baustein === baustein);
  let summe = 0;
  let max = 0;
  const zaehler = { ja: 0, teilweise: 0, nein: 0 };
  for (const p of punkte) {
    const a = asAntwort(antworten[p.id]);
    zaehler[a]++;
    summe += p.gewicht * WERT[a];
    max += p.gewicht;
  }
  return { baustein, label: BAUSTEIN_LABELS[baustein], score: max === 0 ? 0 : Math.round((summe / max) * 100), ...zaehler };
}

export function evaluate(answers: Answers): Ergebnis {
  const ids = gewaehlt(answers);
  const bausteine = ids.map((b) => {
    const raw = answers[b];
    return bausteinScore(b, typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
  });
  const gesamt = bausteine.length === 0 ? 0 : Math.round(bausteine.reduce((s, b) => s + b.score, 0) / bausteine.length);

  const massnahmen: Massnahme[] = [];
  for (const b of ids) {
    const raw = answers[b];
    const antworten = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    for (const p of PRUEFPUNKTE.filter((x) => x.baustein === b)) {
      const a = asAntwort(antworten[p.id]);
      if (a === "ja") continue;
      massnahmen.push({
        id: p.id,
        baustein: b,
        bausteinLabel: BAUSTEIN_LABELS[b],
        massnahme: p.massnahme,
        warum: p.warum,
        aufwand: p.aufwand,
        prioritaet: p.gewicht * (a === "nein" ? 1 : 0.5),
        antwort: a,
        tool: p.tool,
      });
    }
  }
  const order = (m: Massnahme) => BAUSTEIN_IDS.indexOf(m.baustein);
  massnahmen.sort(
    (a, b) => b.prioritaet - a.prioritaet || AUFWAND_RANG[a.aufwand] - AUFWAND_RANG[b.aufwand] || order(a) - order(b),
  );

  return { gesamt, stufe: scoreBand(gesamt / 100).text, bausteine, massnahmen };
}

// ---- Dokument ----------------------------------------------------------------------------------

export const AUFWAND_TEXT: Record<Aufwand, string> = { klein: "klein", mittel: "mittel", gross: "gross" };

/** DocumentModel für PDF, DOCX und Markdown. */
export function toDocument(result: Ergebnis, profile: Profile = {}): DocumentModel {
  const firma = profile.firma?.trim();
  const ort = [profile.ort, profile.kanton].filter(Boolean).join(", ");
  const blocks: DocumentModel["blocks"] = [];

  if (firma || profile.branche || ort) {
    blocks.push({
      type: "facts",
      items: [
        ...(firma ? [{ label: "Betrieb", value: firma }] : []),
        ...(profile.branche ? [{ label: "Branche", value: profile.branche }] : []),
        ...(ort ? [{ label: "Standort", value: ort }] : []),
      ],
    });
  }

  blocks.push(
    { type: "heading", level: 1, text: "Ergebnis" },
    { type: "paragraph", text: `Gesamt: ${result.gesamt} von 100 Punkten (${result.stufe}).` },
  );

  if (result.bausteine.length > 0) {
    blocks.push({
      type: "table",
      header: ["Baustein", "Punkte", "Ja", "Teilweise", "Nein"],
      widths: [3, 1, 1, 1.4, 1],
      rows: result.bausteine.map((b) => [b.label, `${b.score} von 100`, String(b.ja), String(b.teilweise), String(b.nein)]),
    });
  }

  blocks.push({ type: "heading", level: 1, text: "Nächste Schritte" });
  if (result.massnahmen.length === 0) {
    blocks.push({ type: "paragraph", text: "Hier gibt es nichts Dringendes. Prüfe die Punkte in einigen Monaten erneut." });
  } else {
    blocks.push({
      type: "table",
      header: ["Nr.", "Baustein", "Massnahme", "Aufwand"],
      widths: [0.7, 2, 5, 1.3],
      rows: result.massnahmen.map((m, i) => [String(i + 1), m.bausteinLabel, `${m.massnahme}. ${m.warum}`, AUFWAND_TEXT[m.aufwand]]),
    });
  }

  blocks.push({
    type: "paragraph",
    text: "Hinweis: Gewichte und Aufwand sind eine Einschätzung von Alperna, keine Statistik. Der Check bewertet nur deine Angaben.",
  });

  return {
    title: firma ? `Digitaler Auftritt: ${firma}` : "Digitaler Auftritt",
    subtitle: `Gesamtpunktzahl ${result.gesamt} von 100`,
    firma,
    filename: `digitaler-auftritt-${firma ?? "check"}`,
    blocks,
  };
}
