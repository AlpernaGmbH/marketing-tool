import { safeFilename, type DocBlock, type DocumentModel } from "@/lib/export/model";

// Anspruchsgruppen-Analyse: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Alles rechnet im Browser (Klasse C). Die Grenze zwischen «hoch» und «tiefer», die Reihenfolge der Quadranten und die
// Vorschläge für Kanal und Rhythmus sind Richtwerte von Alperna, keine Statistik; es gibt keine Zahl mit Quelle.
// Spec: specs/anspruchsgruppen.md

export const SLUG = "anspruchsgruppen";
export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";

/** Ab diesem Wert (von 5) gilt Interesse oder Einfluss als «hoch». Richtwert von Alperna, keine Statistik. */
export const SCHWELLE = 4;
export const MIN_GRUPPEN = 2;
export const MAX_GRUPPEN = 12;
export const LIMITS = { name: 60, text: 200, plan: 80 } as const;
export const SKALA = [1, 2, 3, 4, 5] as const;

// ---- Typ, Gruppen, Vorlagen --------------------------------------------------------------------

export type Typ = "kmu" | "verein";
export const isTyp = (v: unknown): v is Typ => v === "kmu" || v === "verein";
export const typLabel = (typ: Typ): string => (typ === "verein" ? "Verein" : "Betrieb");

export const BEZIEHUNGEN = [
  { key: "eng", label: "eng" },
  { key: "gut", label: "gut" },
  { key: "lose", label: "lose" },
  { key: "keine", label: "keine" },
] as const;
export type Beziehung = (typeof BEZIEHUNGEN)[number]["key"];
export type BeziehungWahl = Beziehung | "";
export const isBeziehung = (v: unknown): v is Beziehung => BEZIEHUNGEN.some((b) => b.key === v);

/** Interesse und Einfluss: 0 heisst «noch nicht gewählt», 1 bis 5 sind Werte. */
export type Gruppe = {
  id: string;
  name: string;
  interesse: number;
  einfluss: number;
  beziehung: BeziehungWahl;
  erwartung: string;
  bedarf: string;
};

export const leereGruppe = (id: string, name = ""): Gruppe => ({ id, name, interesse: 0, einfluss: 0, beziehung: "", erwartung: "", bedarf: "" });

export const VORLAGEN: Record<Typ, readonly string[]> = {
  kmu: ["Kunden", "Mitarbeitende", "Lieferanten", "Gemeinde und Behörden", "Banken", "Verbände", "Medien", "Nachbarschaft"],
  verein: ["Mitglieder", "Nachwuchs und Eltern", "Vorstand", "Sponsoren", "Gemeinde", "Verbände", "Medien", "Helferinnen und Helfer"],
};

/** Die Vorlage des Typs: acht Gruppen mit Namen, ohne Werte. */
export function vorlage(typ: Typ): Gruppe[] {
  return VORLAGEN[typ].map((name, i) => leereGruppe(`g${i + 1}`, name));
}

/** Nächste freie ID `g<n>`: grösser als jede vorhandene, damit keine ID wiederkehrt. */
export function neueId(gruppen: readonly Pick<Gruppe, "id">[]): string {
  let max = 0;
  for (const g of gruppen) {
    const m = /^g(\d+)$/.exec(g.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `g${max + 1}`;
}

export const neueGruppe = (gruppen: readonly Pick<Gruppe, "id">[]): Gruppe => leereGruppe(neueId(gruppen));

const istWert = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;

/** Trägt die Karte irgendeinen Wert (ausser dem Namen)? Eine unberührte Vorlagenkarte trägt keinen. */
export const hatWerte = (g: Gruppe): boolean =>
  g.interesse !== 0 || g.einfluss !== 0 || g.beziehung !== "" || g.erwartung.trim() !== "" || g.bedarf.trim() !== "";

/** Die Liste ist genau die Vorlage des Typs und trägt keine Werte. */
export function istUnberuehrt(gruppen: readonly Gruppe[], typ: Typ): boolean {
  const namen = VORLAGEN[typ];
  return gruppen.length === namen.length && gruppen.every((g, i) => g.name === namen[i] && !hatWerte(g));
}

// ---- Quadranten --------------------------------------------------------------------------------

/** Reihenfolge nach Wichtigkeit; so stehen Karten, Liste, Tabelle und Dokument. */
export const STRATEGIEN = ["eng einbinden", "zufriedenstellen", "informieren", "beobachten"] as const;
export type Strategie = (typeof STRATEGIEN)[number];

export type QuadrantInfo = {
  titel: string;
  lage: string;
  /** Satz zur Strategie. */
  text: string;
  /** Vorschlag für den Kanal (Richtwert von Alperna, keine Statistik). */
  kanal: string;
  /** Vorschlag für den Rhythmus (Richtwert von Alperna, keine Statistik). */
  rhythmus: string;
};

export const QUADRANT_INFO: Record<Strategie, QuadrantInfo> = {
  "eng einbinden": {
    titel: "Eng einbinden",
    lage: "Einfluss hoch, Interesse hoch",
    text: "Diese Gruppen entscheiden mit und wollen mitreden. Sprich früh mit ihnen, bevor etwas feststeht.",
    kanal: "persönliches Gespräch",
    rhythmus: "monatlich",
  },
  zufriedenstellen: {
    titel: "Zufriedenstellen",
    lage: "Einfluss hoch, Interesse tiefer",
    text: "Diese Gruppen können viel bewegen, beschäftigen sich aber wenig mit dir. Halte sie auf dem Laufenden, ohne sie zu überladen.",
    kanal: "kurzer Bericht oder Anruf",
    rhythmus: "quartalsweise",
  },
  informieren: {
    titel: "Informieren",
    lage: "Einfluss tiefer, Interesse hoch",
    text: "Diese Gruppen wollen wissen, was läuft, entscheiden aber wenig. Wer gut informiert ist, trägt deine Botschaft weiter.",
    kanal: "Newsletter oder Beitrag",
    rhythmus: "monatlich",
  },
  beobachten: {
    titel: "Beobachten",
    lage: "Einfluss tiefer, Interesse tiefer",
    text: "Diese Gruppen brauchen im Alltag keinen Aufwand. Schau einmal im Jahr, ob sich ihre Lage verändert hat.",
    kanal: "Einladung oder Gruss",
    rhythmus: "jährlich, bei Anlass",
  },
};

/** Quadrant einer Gruppe: «hoch» heisst Wert ≥ 4 (Richtwert von Alperna, keine Statistik). */
export function quadrant(interesse: number, einfluss: number): Strategie {
  const hochEinfluss = einfluss >= SCHWELLE;
  const hochInteresse = interesse >= SCHWELLE;
  if (hochEinfluss && hochInteresse) return "eng einbinden";
  if (hochEinfluss) return "zufriedenstellen";
  if (hochInteresse) return "informieren";
  return "beobachten";
}

export const HINWEIS_BEZIEHUNG = "Beziehung aufbauen";

/** «Beziehung aufbauen» bei «eng einbinden», wenn die Beziehung lose oder nicht vorhanden ist; sonst null. */
export function hinweis(g: Pick<Gruppe, "interesse" | "einfluss" | "beziehung">): string | null {
  if (quadrant(g.interesse, g.einfluss) !== "eng einbinden") return null;
  return g.beziehung === "keine" || g.beziehung === "lose" ? HINWEIS_BEZIEHUNG : null;
}

/** Vorschlag für Kanal und Rhythmus je Quadrant. */
export function vorschlag(strategie: Strategie): { kanal: string; rhythmus: string } {
  const { kanal, rhythmus } = QUADRANT_INFO[strategie];
  return { kanal, rhythmus };
}

export const strategieSlug = (s: Strategie): string => s.replace(/ /g, "-");

// ---- Prüfung -----------------------------------------------------------------------------------

export type Problem = { message: string; fieldId?: string };

export type GruppenFeld = "name" | "interesse" | "einfluss" | "beziehung" | "erwartung" | "bedarf";
export const feldId = (id: string, feld: GruppenFeld): string => `ag-${id}-${feld}`;
export const FIRMA_FIELD_ID = "ag-firma";
export const ADD_BUTTON_ID = "ag-add";

const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

export type Pruefung = { ok: true; bewertet: Gruppe[]; nichtBewertet: string[] } | { ok: false; problem: Problem };

/**
 * Prüft die Karten in der Reihenfolge der Liste und meldet das erste Problem.
 * Leere Karten (ohne Namen und Werte) zählen nicht; Karten nur mit Namen sind «nicht bewertet».
 */
export function pruefeGruppen(gruppen: readonly Gruppe[]): Pruefung {
  const fail = (message: string, fieldId?: string): Pruefung => ({ ok: false, problem: { message, fieldId } });
  if (gruppen.length > MAX_GRUPPEN) return fail(`Du kannst höchstens ${MAX_GRUPPEN} Gruppen bewerten. Entferne eine, bevor du weitermachst.`, ADD_BUTTON_ID);

  const bewertet: Gruppe[] = [];
  const nichtBewertet: string[] = [];
  for (const [i, g] of gruppen.entries()) {
    const name = oneLine(g.name);
    if (!name && !hatWerte(g)) continue;
    const nr = i + 1;
    if (!name) return fail(`Gruppe ${nr}: Gib einen Namen an.`, feldId(g.id, "name"));
    if (name.length > LIMITS.name) return fail(`${name}: Der Name darf höchstens ${LIMITS.name} Zeichen haben.`, feldId(g.id, "name"));
    if (!hatWerte(g)) {
      nichtBewertet.push(name);
      continue;
    }
    if (g.interesse === 0) return fail(`${name}: Wähle das Interesse von 1 bis 5.`, feldId(g.id, "interesse"));
    if (!istWert(g.interesse)) return fail(`${name}: Das Interesse geht von 1 bis 5.`, feldId(g.id, "interesse"));
    if (g.einfluss === 0) return fail(`${name}: Wähle den Einfluss von 1 bis 5.`, feldId(g.id, "einfluss"));
    if (!istWert(g.einfluss)) return fail(`${name}: Der Einfluss geht von 1 bis 5.`, feldId(g.id, "einfluss"));
    if (g.beziehung !== "" && !isBeziehung(g.beziehung)) return fail(`${name}: Wähle die Beziehung aus der Liste.`, feldId(g.id, "beziehung"));
    if (g.erwartung.length > LIMITS.text) return fail(`${name}: «Was sie erwartet» darf höchstens ${LIMITS.text} Zeichen haben.`, feldId(g.id, "erwartung"));
    if (g.bedarf.length > LIMITS.text) return fail(`${name}: «Was wir von ihr brauchen» darf höchstens ${LIMITS.text} Zeichen haben.`, feldId(g.id, "bedarf"));
    bewertet.push({ ...g, name, erwartung: g.erwartung.trim(), bedarf: g.bedarf.trim() });
  }
  if (bewertet.length < MIN_GRUPPEN) {
    const offen = gruppen.find((g) => oneLine(g.name) && !hatWerte(g));
    return fail("Bewerte mindestens zwei Gruppen mit Interesse und Einfluss.", offen ? feldId(offen.id, "interesse") : ADD_BUTTON_ID);
  }
  return { ok: true, bewertet, nichtBewertet };
}

/** Meldet, warum es nicht losgehen kann, in der Reihenfolge des Formulars (Firma, dann die Karten). null: in Ordnung. */
export function formProblem(firma: string | undefined, typ: Typ, gruppen: readonly Gruppe[]): Problem | null {
  if (!oneLine(firma ?? "")) {
    return { message: typ === "verein" ? "Gib den Namen deines Vereins an." : "Gib den Namen deines Betriebs an.", fieldId: FIRMA_FIELD_ID };
  }
  const p = pruefeGruppen(gruppen);
  return p.ok ? null : p.problem;
}

// ---- Auswertung --------------------------------------------------------------------------------

export type Bewertet = Gruppe & { nr: number; strategie: Strategie; hinweis: string | null };

export type Analyse = {
  /** Nach Quadrant, Einfluss, Interesse und Eingabe sortiert; `nr` zählt in dieser Reihenfolge ab 1. */
  gruppen: Bewertet[];
  je: Record<Strategie, Bewertet[]>;
  nichtBewertet: string[];
};

/** Die Auswertung; null, wenn die Prüfung der Gruppen scheitert. */
export function analysiere(gruppen: readonly Gruppe[]): Analyse | null {
  const p = pruefeGruppen(gruppen);
  if (!p.ok) return null;
  const rang = (s: Strategie) => STRATEGIEN.indexOf(s);
  const sortiert = p.bewertet
    .map((g, index) => ({ g, index, strategie: quadrant(g.interesse, g.einfluss) }))
    .sort((a, b) => rang(a.strategie) - rang(b.strategie) || b.g.einfluss - a.g.einfluss || b.g.interesse - a.g.interesse || a.index - b.index)
    .map(({ g, strategie }, i): Bewertet => ({ ...g, nr: i + 1, strategie, hinweis: hinweis(g) }));
  const je: Record<Strategie, Bewertet[]> = { "eng einbinden": [], zufriedenstellen: [], informieren: [], beobachten: [] };
  for (const g of sortiert) je[g.strategie].push(g);
  return { gruppen: sortiert, je, nichtBewertet: p.nichtBewertet };
}

/** «8 Gruppen bewertet. Eng einbinden: 3, zufriedenstellen: 2 …»; Quadranten ohne Gruppe fehlen. */
export function zusammenfassung(a: Analyse): string {
  const teile = STRATEGIEN.filter((s) => a.je[s].length > 0).map((s, i) => `${i === 0 ? QUADRANT_INFO[s].titel : s}: ${a.je[s].length}`);
  const rest = a.nichtBewertet.length > 0 ? ` Nicht bewertet: ${a.nichtBewertet.join(", ")}.` : "";
  return `${a.gruppen.length} Gruppen bewertet. ${teile.join(", ")}.${rest}`;
}

// ---- Kommunikationsplan ------------------------------------------------------------------------

export type PlanEintrag = { id: string; strategie: Strategie; kanal: string; rhythmus: string; verantwortlich: string };
export type PlanFeld = "kanal" | "rhythmus" | "verantwortlich";

/** Ein Eintrag je Gruppe in der Reihenfolge von `gruppen`. Vorschlag, wo nichts gespeichert ist oder der Quadrant gewechselt hat. */
export function planFuer(gruppen: readonly Pick<Bewertet, "id" | "strategie">[], gespeichert: readonly PlanEintrag[]): PlanEintrag[] {
  return gruppen.map((g) => {
    const alt = gespeichert.find((p) => p.id === g.id);
    if (alt && alt.strategie === g.strategie) return { ...alt };
    return { id: g.id, strategie: g.strategie, ...vorschlag(g.strategie), verantwortlich: alt?.verantwortlich ?? "" };
  });
}

/** Ändert ein Feld des Plans; Zeilenumbrüche werden zu Leerzeichen, die Länge wird begrenzt. */
export function setzePlanFeld(plan: readonly PlanEintrag[], id: string, feld: PlanFeld, wert: string): PlanEintrag[] {
  const sauber = wert.replace(/[\r\n]+/g, " ").slice(0, LIMITS.plan);
  return plan.map((p) => (p.id === id ? { ...p, [feld]: sauber } : p));
}

// ---- Matrix ------------------------------------------------------------------------------------

export const MATRIX = {
  width: 360,
  height: 324,
  plot: { x: 44, y: 12, w: 300, h: 264 },
  /** Radius eines Punkts. */
  r: 10,
  /** Streifen am unteren Rand der Plotfläche, in dem die Namen der unteren Quadranten stehen und kein Punkt sitzt. */
  band: 24,
} as const;

/**
 * Position eines Werts auf der Achse, 0 bis 1. Die Grenze zwischen 3 und 4 liegt in der Mitte, damit die vier Quadranten
 * gleich gross sind: 1 bis 3 teilen die erste Hälfte, 4 und 5 die zweite. `unten` (Anteil von 0 bis 0,5) hält am Anfang der
 * Achse einen Streifen frei; die Werte 1 bis 3 verteilen sich dann auf den Rest der ersten Hälfte.
 */
export function achse(wert: number, unten = 0): number {
  const v = Math.min(5, Math.max(1, Number.isFinite(wert) ? wert : 1));
  const frei = Math.min(0.4, Math.max(0, unten));
  return v <= 3 ? frei + ((v - 0.5) / 3) * (0.5 - frei) : 0.5 + (v - 3.5) / 4;
}

export type MatrixEingabe = { id: string; nr: number; name: string; interesse: number; einfluss: number };
export type Punkt = MatrixEingabe & { cx: number; cy: number; strategie: Strategie };
export type QuadrantFlaeche = { strategie: Strategie; x: number; y: number; w: number; h: number; textX: number; textY: number; anker: "start" | "end" };
export type MatrixLayout = {
  width: number;
  height: number;
  plot: { x: number; y: number; w: number; h: number };
  r: number;
  quadranten: QuadrantFlaeche[];
  punkte: Punkt[];
  ticksX: { wert: number; x: number }[];
  ticksY: { wert: number; y: number }[];
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/**
 * Positionen im SVG. Interesse läuft nach rechts, Einfluss nach oben. Mehrere Gruppen mit denselben Werten sitzen auf einem
 * kleinen Kreis um die Mitte der Zelle; alle Punkte bleiben innerhalb der Plotfläche.
 */
export function matrixLayout(gruppen: readonly MatrixEingabe[]): MatrixLayout {
  const { plot, r, width, height } = MATRIX;
  const zellen = new Map<string, number[]>();
  gruppen.forEach((g, i) => {
    const key = `${g.interesse}/${g.einfluss}`;
    zellen.set(key, [...(zellen.get(key) ?? []), i]);
  });

  const unten = MATRIX.band / plot.h;
  const punkte = gruppen.map((g, i): Punkt => {
    const mx = plot.x + achse(g.interesse) * plot.w;
    const my = plot.y + (1 - achse(g.einfluss, unten)) * plot.h;
    const gleiche = zellen.get(`${g.interesse}/${g.einfluss}`) ?? [i];
    const n = gleiche.length;
    let dx = 0;
    let dy = 0;
    if (n > 1) {
      const zelleB = g.interesse >= SCHWELLE ? plot.w / 4 : plot.w / 6;
      const zelleH = g.einfluss >= SCHWELLE ? plot.h / 4 : (plot.h / 2 - MATRIX.band) / 3;
      const radius = Math.min(0.45 * Math.min(zelleB, zelleH), Math.max(r + 3, (r + 1) / Math.sin(Math.PI / n)));
      const winkel = -Math.PI / 2 + (2 * Math.PI * gleiche.indexOf(i)) / n;
      dx = radius * Math.cos(winkel);
      dy = radius * Math.sin(winkel);
    }
    return {
      ...g,
      cx: round2(clamp(mx + dx, plot.x + r, plot.x + plot.w - r)),
      cy: round2(clamp(my + dy, plot.y + r, plot.y + plot.h - r)),
      strategie: quadrant(g.interesse, g.einfluss),
    };
  });

  const w = plot.w / 2;
  const h = plot.h / 2;
  const pad = 8;
  const quadranten: QuadrantFlaeche[] = [
    { strategie: "zufriedenstellen", x: plot.x, y: plot.y, w, h, textX: plot.x + pad, textY: plot.y + 18, anker: "start" },
    { strategie: "eng einbinden", x: plot.x + w, y: plot.y, w, h, textX: plot.x + plot.w - pad, textY: plot.y + 18, anker: "end" },
    { strategie: "beobachten", x: plot.x, y: plot.y + h, w, h, textX: plot.x + pad, textY: plot.y + plot.h - pad, anker: "start" },
    { strategie: "informieren", x: plot.x + w, y: plot.y + h, w, h, textX: plot.x + plot.w - pad, textY: plot.y + plot.h - pad, anker: "end" },
  ];
  return {
    width,
    height,
    plot: { ...plot },
    r,
    quadranten,
    punkte,
    ticksX: SKALA.map((wert) => ({ wert, x: round2(plot.x + achse(wert) * plot.w) })),
    ticksY: SKALA.map((wert) => ({ wert, y: round2(plot.y + (1 - achse(wert, unten)) * plot.h) })),
  };
}

// ---- Dokument und Texte ------------------------------------------------------------------------

export type Kontext = { firma: string; typ: Typ };

const firmaText = (k: Kontext): string => oneLine(k.firma) || "keine Angabe";
const beziehungText = (b: BeziehungWahl): string => (b === "" ? "nicht angegeben" : b);
const orDash = (s: string): string => oneLine(s) || "–";

/** Generalversammlung bei Vereinen, Jahresplanung bei Betrieben. Richtwert von Alperna, keine Statistik. */
const pruefZeitpunkt = (typ: Typ): string => (typ === "verein" ? "vor der Generalversammlung" : "vor der Jahresplanung");

/** Hinweise unter dem Dokument. */
export function hinweise(a: Analyse, k: Kontext): string[] {
  const out: string[] = [];
  const aufbauen = a.gruppen.filter((g) => g.hinweis).map((g) => g.name);
  if (aufbauen.length > 0) {
    out.push(`${HINWEIS_BEZIEHUNG}: ${aufbauen.join(", ")}. Diese Gruppen haben viel Einfluss und viel Interesse, aber die Beziehung ist lose oder fehlt. Such das Gespräch, bevor du etwas brauchst.`);
  }
  out.push(`Prüf die Matrix einmal im Jahr, ${pruefZeitpunkt(k.typ)} (${RICHTWERT_NOTE}).`);
  out.push("Gruppen ändern ihre Lage: Eine neue Gemeindepräsidentin oder ein neuer Hauptsponsor verschiebt Einfluss und Interesse.");
  if (a.nichtBewertet.length > 0) {
    out.push(`Nicht bewertet: ${a.nichtBewertet.join(", ")}. Diese Gruppen fehlen in der Matrix; bewerte sie, wenn sie für dich eine Rolle spielen.`);
  }
  return out;
}

/** Zeilen der Plan-Tabelle: Gruppe, Quadrant, Strategie, Kanal, Rhythmus, Verantwortlich. */
export function planZeilen(a: Analyse, plan: readonly PlanEintrag[]): string[][] {
  return planFuer(a.gruppen, plan).map((p, i) => {
    const g = a.gruppen[i];
    return [g.name, QUADRANT_INFO[g.strategie].lage, g.strategie, orDash(p.kanal), orDash(p.rhythmus), oneLine(p.verantwortlich) || "noch offen"];
  });
}

export const DOC_TITLE = "Anspruchsgruppen-Analyse";

/** DocumentModel für Anzeige, PDF, Word und Markdown-Copy. */
export function toDocument(a: Analyse, plan: readonly PlanEintrag[], k: Kontext): DocumentModel {
  const mitText = a.gruppen.some((g) => g.beziehung !== "" || g.erwartung !== "" || g.bedarf !== "");
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: typLabel(k.typ), value: firmaText(k) },
        { label: "Bewertete Gruppen", value: String(a.gruppen.length) },
        { label: "Grenze für «hoch»", value: `ab ${SCHWELLE} von 5 (${RICHTWERT_NOTE})` },
      ],
    },
    { type: "heading", level: 1, text: "Die Gruppen im Überblick" },
    {
      type: "table",
      header: ["Gruppe", "Interesse", "Einfluss", "Quadrant", "Strategie"],
      rows: a.gruppen.map((g) => [g.name, String(g.interesse), String(g.einfluss), QUADRANT_INFO[g.strategie].lage, g.strategie]),
      widths: [3, 1.3, 1.3, 3, 2.2],
    },
    { type: "heading", level: 1, text: "Strategie je Quadrant" },
    {
      type: "list",
      items: STRATEGIEN.map((s) => {
        const namen = a.je[s].map((g) => g.name);
        return `${QUADRANT_INFO[s].titel} (${QUADRANT_INFO[s].lage}): ${namen.length > 0 ? namen.join(", ") : "keine Gruppe"}. ${QUADRANT_INFO[s].text}`;
      }),
    },
  ];
  if (mitText) {
    blocks.push(
      { type: "heading", level: 1, text: "Erwartungen und Bedarf" },
      {
        type: "table",
        header: ["Gruppe", "Beziehung", "Was sie erwartet", "Was wir von ihr brauchen"],
        rows: a.gruppen.map((g) => [g.name, g.beziehung === "" ? "–" : g.beziehung, orDash(g.erwartung), orDash(g.bedarf)]),
        widths: [2.2, 1.5, 3.5, 3.5],
      },
    );
  }
  blocks.push(
    { type: "heading", level: 1, text: "Kommunikationsplan" },
    {
      type: "table",
      header: ["Gruppe", "Quadrant", "Strategie", "Kanal", "Rhythmus", "Verantwortlich"],
      rows: planZeilen(a, plan),
      // Breiten so, dass das längste Wort jeder Spalte («zufriedenstellen», «quartalsweise», «Verantwortlich») in A4 ohne Umbruch passt.
      widths: [80, 83, 86, 74, 78, 82],
    },
    { type: "paragraph", text: `Kanal und Rhythmus sind Vorschläge je Quadrant (${RICHTWERT_NOTE}). Pass sie an euren Alltag an und trag ein, wer die Gruppe betreut.` },
    { type: "heading", level: 1, text: "Hinweise" },
    { type: "list", ordered: true, items: hinweise(a, k) },
  );
  return {
    title: DOC_TITLE,
    subtitle: `${firmaText(k)}: ${a.gruppen.length} Gruppen bewertet, ${a.je["eng einbinden"].length} davon eng einbinden`,
    firma: oneLine(k.firma) || undefined,
    filename: `anspruchsgruppen-${safeFilename(k.firma, "analyse")}`,
    blocks,
  };
}

/** Die Angaben fürs CRM, eine je Zeile; die Zahlen stehen vorn, die Texte hinten (der Server kürzt auf 1'900 Zeichen). */
export function eingabeText(k: Kontext, gruppen: readonly Gruppe[]): string {
  const p = pruefeGruppen(gruppen);
  const bewertet = p.ok ? p.bewertet : [];
  const nicht = p.ok ? p.nichtBewertet : [];
  const lines = [`${typLabel(k.typ)}: ${firmaText(k)}`, `Gruppen (${bewertet.length} bewertet, Interesse und Einfluss von 1 bis 5):`];
  for (const g of bewertet) lines.push(`${g.name}: Interesse ${g.interesse}, Einfluss ${g.einfluss}, Beziehung ${beziehungText(g.beziehung)}`);
  if (nicht.length > 0) lines.push(`Nicht bewertet: ${nicht.join(", ")}`);
  const texte = bewertet.filter((g) => g.erwartung !== "" || g.bedarf !== "");
  if (texte.length > 0) {
    lines.push("Erwartungen und Bedarf:");
    for (const g of texte) {
      const teile = [g.erwartung !== "" ? `erwartet ${oneLine(g.erwartung)}` : "", g.bedarf !== "" ? `braucht ${oneLine(g.bedarf)}` : ""].filter(Boolean);
      lines.push(`${g.name}: ${teile.join("; ")}`);
    }
  }
  return lines.join("\n");
}

/** Das Ergebnis fürs CRM als Markdown: Quadranten, dann der Plan als Liste. */
export function ausgabeText(k: Kontext, a: Analyse, plan: readonly PlanEintrag[]): string {
  const lines = [`# ${DOC_TITLE}: ${firmaText(k)}`, `${typLabel(k.typ)}, ${zusammenfassung(a)}`];
  for (const s of STRATEGIEN) {
    if (a.je[s].length === 0) continue;
    lines.push("", `## ${QUADRANT_INFO[s].titel}`);
    for (const g of a.je[s]) lines.push(`- ${g.name} (Interesse ${g.interesse}, Einfluss ${g.einfluss})${g.hinweis ? `, ${g.hinweis}` : ""}`);
  }
  lines.push("", "## Kommunikationsplan");
  planFuer(a.gruppen, plan).forEach((p, i) => {
    const verantwortlich = oneLine(p.verantwortlich);
    lines.push(`- ${a.gruppen[i].name}: ${orDash(p.kanal)}, ${orDash(p.rhythmus)}${verantwortlich ? `, Verantwortlich: ${verantwortlich}` : ""}`);
  });
  return lines.join("\n");
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type AgState = { v: 1; phase: "edit" | "result"; typ: Typ; gruppen: Gruppe[]; plan: PlanEintrag[] };

export const emptyState = (typ: Typ = "kmu"): AgState => ({ v: 1, phase: "edit", typ, gruppen: vorlage(typ), plan: [] });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const singleLine = (v: unknown, max: number): string => text(v, max).replace(/[\r\n]+/g, " ");
const wert = (v: unknown): number => (istWert(v) ? v : 0);

function parseGruppe(raw: unknown, used: Set<string>): Gruppe | null {
  if (!isObj(raw)) return null;
  let id = typeof raw.id === "string" && /^[a-z0-9-]{1,24}$/.test(raw.id) && !used.has(raw.id) ? raw.id : "";
  if (!id) {
    for (let n = 1; ; n++) {
      if (!used.has(`g${n}`)) {
        id = `g${n}`;
        break;
      }
    }
  }
  used.add(id);
  return {
    id,
    name: singleLine(raw.name, LIMITS.name),
    interesse: wert(raw.interesse),
    einfluss: wert(raw.einfluss),
    beziehung: isBeziehung(raw.beziehung) ? raw.beziehung : "",
    erwartung: text(raw.erwartung, LIMITS.text),
    bedarf: text(raw.bedarf, LIMITS.text),
  };
}

const isStrategie = (v: unknown): v is Strategie => (STRATEGIEN as readonly unknown[]).includes(v);

function parsePlan(raw: unknown, ids: ReadonlySet<string>): PlanEintrag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PlanEintrag[] = [];
  for (const p of raw) {
    if (!isObj(p) || typeof p.id !== "string" || !ids.has(p.id) || seen.has(p.id) || !isStrategie(p.strategie)) continue;
    seen.add(p.id);
    out.push({
      id: p.id,
      strategie: p.strategie,
      kanal: singleLine(p.kanal, LIMITS.plan),
      rhythmus: singleLine(p.rhythmus, LIMITS.plan),
      verantwortlich: singleLine(p.verantwortlich, LIMITS.plan),
    });
  }
  return out;
}

/**
 * Liest den gespeicherten Stand. Kaputte Daten oder eine falsche Version ergeben den leeren Stand (Vorlage «kmu»). Fehlt die
 * Liste, gilt die Vorlage des Typs; eine leere Liste bleibt leer. «result» gilt nur, wenn die Gruppen die Prüfung bestehen.
 */
export function parseState(raw: unknown): AgState {
  if (!isObj(raw) || raw.v !== 1) return emptyState();
  const typ: Typ = isTyp(raw.typ) ? raw.typ : "kmu";
  const used = new Set<string>();
  const gruppen = Array.isArray(raw.gruppen)
    ? raw.gruppen
        .slice(0, MAX_GRUPPEN)
        .map((g) => parseGruppe(g, used))
        .filter((g): g is Gruppe => g !== null)
    : vorlage(typ);
  const plan = parsePlan(raw.plan, new Set(gruppen.map((g) => g.id)));
  const phase = raw.phase === "result" && pruefeGruppen(gruppen).ok ? "result" : "edit";
  return { v: 1, phase, typ, gruppen, plan };
}

/**
 * Passt den Stand an den Typ im Profil an: Weicht der Typ ab und ist die Liste unberührt, gilt die Vorlage des Profil-Typs.
 * Sonst bleibt der Stand, wie er ist (dann zeigt `typWechselHinweis` den Hinweis).
 */
export function aufTyp(state: AgState, typ: Typ): AgState {
  if (state.typ === typ || state.phase !== "edit" || !istUnberuehrt(state.gruppen, state.typ)) return state;
  return { ...state, typ, gruppen: vorlage(typ), plan: [] };
}

/** Der Typ im Profil weicht vom Typ der Liste ab, und die Liste trägt schon Werte: Hinweis statt Wechsel. */
export function typWechselHinweis(state: AgState, typ: Typ): boolean {
  return state.phase === "edit" && state.typ !== typ && state.gruppen.length > 0 && !istUnberuehrt(state.gruppen, state.typ);
}
