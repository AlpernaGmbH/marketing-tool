import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";

// Kundenweg-Mapper: reine Funktionen, kein React, kein DOM, kein Netz (specs/kundenweg.md).
// Die Wörter «Customer Journey», «Touchpoint» und «Funnel» stehen auf der Sperrliste und kommen hier nirgends vor.

export const SLUG = "kundenweg";

export type Typ = "kmu" | "verein";

export const LIMITS = { frage: 160, verantwortlich: 60 } as const;

/** Der Hinweis zu jeder Reihenfolge und Stufe: eigene Faustregel, keine Statistik. */
export const RICHTWERT = "Richtwert von Alperna, keine Statistik";

// ---- Phasen ------------------------------------------------------------------------------------

export const PHASE_KEYS = ["aufmerksam", "informieren", "vergleichen", "entscheiden", "kaufen", "empfehlen"] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export type Phase = {
  key: PhaseKey;
  label: string;
  /** Name der Phase bei Vereinen; ohne Angabe gilt `label`. */
  labelVerein?: string;
  /** Platzhalter im Feld «Frage der Kundschaft» (kein vorausgefüllter Wert). */
  platzhalter: string;
  platzhalterVerein?: string;
};

export const PHASEN: readonly Phase[] = [
  { key: "aufmerksam", label: "Aufmerksam werden", platzhalter: "Wer macht so etwas in meiner Nähe?", platzhalterVerein: "Gibt es in meiner Nähe einen Verein dafür?" },
  { key: "informieren", label: "Informieren", platzhalter: "Was kostet das, wie läuft es ab?" },
  { key: "vergleichen", label: "Vergleichen", platzhalter: "Warum dieser Betrieb und nicht der andere?" },
  { key: "entscheiden", label: "Entscheiden", platzhalter: "Kann ich dem vertrauen, und wie melde ich mich?" },
  {
    key: "kaufen",
    label: "Kaufen oder Nutzen",
    labelVerein: "Mitmachen",
    platzhalter: "Was passiert nach meiner Zusage?",
    platzhalterVerein: "Wie werde ich Mitglied, und was passiert danach?",
  },
  { key: "empfehlen", label: "Weiterempfehlen", platzhalter: "Wem erzähle ich davon?" },
];

export const phaseLabel = (p: Phase, typ: Typ): string => (typ === "verein" ? (p.labelVerein ?? p.label) : p.label);
export const phasePlatzhalter = (p: Phase, typ: Typ): string => (typ === "verein" ? (p.platzhalterVerein ?? p.platzhalter) : p.platzhalter);
/** «Kundenweg» für Betriebe, «Weg zur Mitgliedschaft» für Vereine. */
export const wegName = (typ: Typ): string => (typ === "verein" ? "Weg zur Mitgliedschaft" : "Kundenweg");

// ---- Berührungspunkte --------------------------------------------------------------------------

export const PUNKT_KEYS = [
  "website",
  "gbp",
  "instagram",
  "facebook",
  "linkedin",
  "newsletter",
  "empfehlungen",
  "anlaesse",
  "aushang",
  "zeitung",
  "telefon",
  "whatsapp",
] as const;
export type PunktKey = (typeof PUNKT_KEYS)[number];

export type Beruehrungspunkt = {
  key: PunktKey;
  label: string;
  /** Wörter, an denen ein Eintrag in profile.kanaele diesem Punkt zugeordnet wird (nur Vorschlag). */
  re: RegExp;
};

export const BERUEHRUNGSPUNKTE: readonly Beruehrungspunkt[] = [
  { key: "website", label: "Website", re: /website|webseite|homepage|internetseite|\bblog\b/i },
  { key: "gbp", label: "Google-Unternehmensprofil", re: /unternehmensprofil|business[- ]?profil|google[- ]?(?:business|maps|profil|my business|unternehmen)|\bgbp\b/i },
  { key: "instagram", label: "Instagram", re: /instagram/i },
  { key: "facebook", label: "Facebook", re: /facebook/i },
  { key: "linkedin", label: "LinkedIn", re: /linkedin/i },
  { key: "newsletter", label: "Newsletter", re: /newsletter|e-?mail|mailing/i },
  { key: "empfehlungen", label: "Empfehlungen", re: /empfehlung|bewertung|rezension|review/i },
  { key: "anlaesse", label: "Anlässe", re: /anlass|anlässe|anlaesse|\bevent|\bmesse|sponsoring/i },
  { key: "aushang", label: "Aushang und Flyer", re: /aushang|flyer|plakat|prospekt|broschüre/i },
  { key: "zeitung", label: "Lokalzeitung und Anzeiger", re: /anzeiger|zeitung|inserat|\bprint\b/i },
  { key: "telefon", label: "Telefon und Gespräch", re: /telefon|anruf|gespräch|persönlich/i },
  { key: "whatsapp", label: "WhatsApp", re: /whatsapp/i },
];

export const punktLabel = (key: PunktKey): string => BERUEHRUNGSPUNKTE.find((p) => p.key === key)!.label;
export const isPunktKey = (v: unknown): v is PunktKey => typeof v === "string" && (PUNKT_KEYS as readonly string[]).includes(v);

/** Berührungspunkte aus den Kanälen des Profils (Einträge mit «name» oder «kanal», Wortvergleich), in fester Reihenfolge. */
export function punkteAusProfil(kanaele: readonly unknown[] | undefined): PunktKey[] {
  const found = new Set<PunktKey>();
  for (const k of kanaele ?? []) {
    const r = (typeof k === "object" && k !== null ? k : {}) as Record<string, unknown>;
    const name = [r.name, r.kanal].find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (!name) continue;
    for (const p of BERUEHRUNGSPUNKTE) if (p.re.test(name)) found.add(p.key);
  }
  return PUNKT_KEYS.filter((k) => found.has(k));
}

// ---- Inhalt ------------------------------------------------------------------------------------

export const INHALT_STUFEN = [
  { key: "ja", label: "Ja" },
  { key: "teilweise", label: "Teilweise" },
  { key: "nein", label: "Nein" },
] as const;
export type InhaltKey = (typeof INHALT_STUFEN)[number]["key"];
export type InhaltValue = InhaltKey | "";
export const isInhaltKey = (v: unknown): v is InhaltKey => v === "ja" || v === "teilweise" || v === "nein";

export const KEIN_INHALT_HINWEIS = "Keine Auswahl zählt wie «Nein».";

const inhaltText = (v: InhaltValue): string => INHALT_STUFEN.find((s) => s.key === v)?.label ?? "Nicht beantwortet";

// ---- Eingabe -----------------------------------------------------------------------------------

export type PhaseInput = { frage: string; punkte: PunktKey[]; inhalt: InhaltValue; verantwortlich: string };
export type WegInput = { typ: Typ; phasen: PhaseInput[] };
export type Kontext = { firma: string; branche: string; /** Datum der Erstellung, TT.MM.JJJJ; leer: der Export setzt das heutige. */ datum?: string };

export const emptyPhase = (): PhaseInput => ({ frage: "", punkte: [], inhalt: "", verantwortlich: "" });
export const emptyPhasen = (): PhaseInput[] => PHASEN.map(emptyPhase);

const hatAngabe = (p: PhaseInput): boolean => p.frage.trim() !== "" || p.punkte.length > 0 || p.inhalt !== "" || p.verantwortlich.trim() !== "";

/** Wie viele Phasen etwas enthalten (für die Fortschrittsanzeige im Formular). */
export function beschriebenePhasen(phasen: readonly PhaseInput[]): number {
  return phasen.filter(hatAngabe).length;
}

/**
 * Solange das Formular ganz leer ist, stehen die Berührungspunkte aus dem Profil in der ersten und zweiten Phase
 * angekreuzt. Sobald irgendeine Angabe da ist, gilt nur noch, was die Person gewählt hat.
 */
export function mitVorschlag(phasen: readonly PhaseInput[], kanaele: readonly unknown[] | undefined): PhaseInput[] {
  const vorschlag = punkteAusProfil(kanaele);
  if (vorschlag.length === 0 || phasen.some(hatAngabe)) return phasen.map((p) => ({ ...p, punkte: [...p.punkte] }));
  return phasen.map((p, i) => ({ ...p, punkte: i < 2 ? [...vorschlag] : [] }));
}

/** Erste Meldung oder null. Blockiert wird nur, was kein sinnvolles Ergebnis zulässt. */
export function validate(input: WegInput): string | null {
  if (input.phasen.length !== PHASEN.length) return "Der Stand ist unvollständig. Beginne neu.";
  for (let i = 0; i < input.phasen.length; i++) {
    const p = input.phasen[i];
    if (p.frage.length > LIMITS.frage) return `Phase ${i + 1}: Die Frage ist zu lang (höchstens ${LIMITS.frage} Zeichen).`;
    if (p.verantwortlich.length > LIMITS.verantwortlich) return `Phase ${i + 1}: Der Name ist zu lang (höchstens ${LIMITS.verantwortlich} Zeichen).`;
  }
  if (!input.phasen.some((p) => p.frage.trim() !== "" || p.punkte.length > 0 || p.inhalt !== "")) {
    return "Beschreibe mindestens eine Phase: eine Frage, einen Berührungspunkt oder die Antwort bei «Gibt es dafür Inhalt?».";
  }
  return null;
}

// ---- Lücke -------------------------------------------------------------------------------------

export type Stufe = "rot" | "gelb" | "ok";
export type Luecke = {
  stufe: Stufe;
  /** Was fehlt, als Sätze ohne Punkt am Ende. Leer bei «ok». */
  gruende: string[];
  /** Hinweise ohne Einfluss auf die Stufe. */
  hinweise: string[];
};

export const GRUND = {
  punkt: "Kein Berührungspunkt gewählt",
  inhalt: "Es gibt keinen Inhalt dafür",
  teilweise: "Der Inhalt ist nur teilweise da",
  frage: "Die Frage fehlt",
} as const;
export const HINWEIS_VERANTWORTLICH = "Niemand verantwortlich";
export const HINWEIS_UNBEANTWORTET = "Keine Antwort bei «Gibt es dafür Inhalt?», das zählt wie «Nein».";

/**
 * Rot: kein Berührungspunkt oder Inhalt «Nein»/ungewählt. Gelb: Inhalt «Teilweise»; eine fehlende Frage macht eine sonst
 * abgedeckte Phase gelb. Sonst ok. «Niemand verantwortlich» ist ein Hinweis und ändert die Stufe nicht.
 */
export function luecke(phase: PhaseInput): Luecke {
  const gruende: string[] = [];
  const hinweise: string[] = [];
  let stufe: Stufe = "ok";
  if (phase.punkte.length === 0) {
    gruende.push(GRUND.punkt);
    stufe = "rot";
  }
  if (phase.inhalt === "nein" || phase.inhalt === "") {
    gruende.push(GRUND.inhalt);
    stufe = "rot";
    if (phase.inhalt === "") hinweise.push(HINWEIS_UNBEANTWORTET);
  } else if (phase.inhalt === "teilweise") {
    gruende.push(GRUND.teilweise);
    if (stufe === "ok") stufe = "gelb";
  }
  if (phase.frage.trim() === "") {
    gruende.push(GRUND.frage);
    if (stufe === "ok") stufe = "gelb";
  }
  if (phase.verantwortlich.trim() === "") hinweise.push(HINWEIS_VERANTWORTLICH);
  return { stufe, gruende, hinweise };
}

export const STUFE_TEXT: Record<Stufe, string> = { rot: "Lücke", gelb: "Teilweise", ok: "Abgedeckt" };

// ---- Vorschläge und Werkzeuge ------------------------------------------------------------------

const VORSCHLAEGE: Record<PhaseKey, { kmu: string[]; verein?: string[] }> = {
  aufmerksam: {
    kmu: ["Google-Unternehmensprofil mit Fotos und Öffnungszeiten", "Regelmässige Beiträge, die zeigen, was du machst", "Empfehlungen sichtbar machen"],
  },
  informieren: {
    kmu: ["Leistungsseiten mit Ablauf", "Häufige Fragen mit klaren Antworten", "Preisrahmen oder «ab»-Angabe, nur wenn du Preise nennen willst"],
  },
  vergleichen: {
    kmu: ["Referenzen mit Ort und Namen", "Bewertungen von Kundschaft", "Vorher-Nachher-Fälle"],
  },
  entscheiden: {
    kmu: ["Klarer nächster Schritt: Anruf, WhatsApp oder Termin", "Offerte mit Frist", "Kontaktangaben an jeder Stelle"],
  },
  kaufen: {
    kmu: ["Bestätigung und Ablauf nach der Zusage", "Wer kommt wann", "Ansprechperson mit Telefonnummer"],
    verein: ["Schnuppertraining oder Probetermin", "Beitritt in wenigen Schritten", "Willkommensmail"],
  },
  empfehlen: {
    kmu: ["Bitte um Bewertung nach dem Auftrag", "Empfehlungskarte", "Dank an alle, die weiterempfehlen"],
    verein: ["Bitte um Bewertung nach den ersten Wochen", "Empfehlungskarte", "Dank an alle, die weiterempfehlen"],
  },
};

/** Zwei bis drei Inhaltstypen, die in der Phase fehlen können (Richtwert von Alperna, keine Statistik). */
export function vorschlaege(phaseKey: PhaseKey, typ: Typ = "kmu"): string[] {
  const v = VORSCHLAEGE[phaseKey];
  return [...(typ === "verein" ? (v.verein ?? v.kmu) : v.kmu)];
}

export const VORSCHLAG_FRAGE = "Schreib die Frage der Kundschaft in einem Satz auf.";

export type Werkzeug = { slug: string; name: string };

/** Die Werkzeuge, auf die der Weg verweist. Namen wie in der tool.config.ts des jeweiligen Werkzeugs (der Test prüft es). */
export const WERKZEUGE: Record<string, Werkzeug> = {
  "inhalte-saeulen": { slug: "inhalte-saeulen", name: "Themensäulen" },
  "gbp-feiertage": { slug: "gbp-feiertage", name: "Öffnungszeiten an Feiertagen" },
  textcheck: { slug: "textcheck", name: "Textcheck" },
  "bewertungs-kit": { slug: "bewertungs-kit", name: "Bewertungs-Kit für Google" },
  "whatsapp-link": { slug: "whatsapp-link", name: "WhatsApp-Link mit QR" },
  empfehlungsprogramm: { slug: "empfehlungsprogramm", name: "Empfehlungsprogramm-Designer" },
  anspruchsgruppen: { slug: "anspruchsgruppen", name: "Anspruchsgruppen-Analyse" },
};

const WERKZEUG_SLUGS: Record<PhaseKey, { kmu: string[]; verein?: string[] }> = {
  aufmerksam: { kmu: ["inhalte-saeulen", "gbp-feiertage"] },
  informieren: { kmu: ["textcheck"] },
  vergleichen: { kmu: ["bewertungs-kit"] },
  entscheiden: { kmu: ["whatsapp-link"] },
  kaufen: { kmu: [] },
  empfehlen: { kmu: ["bewertungs-kit", "empfehlungsprogramm"], verein: ["empfehlungsprogramm", "anspruchsgruppen"] },
};

/** Das nächste Werkzeug (oder zwei zur Wahl) für eine Lücke in der Phase; leer, wenn keines passt. */
export function werkzeugFuer(phaseKey: PhaseKey, typ: Typ = "kmu"): Werkzeug[] {
  const v = WERKZEUG_SLUGS[phaseKey];
  return (typ === "verein" ? (v.verein ?? v.kmu) : v.kmu).map((slug) => WERKZEUGE[slug]);
}

// ---- Auswertung --------------------------------------------------------------------------------

export type Zeile = {
  nr: number;
  key: PhaseKey;
  label: string;
  frage: string;
  punkte: string[];
  inhalt: InhaltValue;
  inhaltText: string;
  verantwortlich: string;
  luecke: Luecke;
  stufeText: string;
};

export type LueckenEintrag = {
  nr: number;
  key: PhaseKey;
  label: string;
  stufe: "rot" | "gelb";
  gruende: string[];
  vorschlaege: string[];
  werkzeuge: Werkzeug[];
};

export type Summary = {
  /** Phasen ohne Lücke (Stufe «ok»). */
  abgedeckt: number;
  total: number;
  rot: number;
  gelb: number;
  /** «4 von 6 Phasen sind abgedeckt.» */
  satz: string;
  /** Der Satz mit der wichtigsten Lücke, oder «Es gibt keine Lücke.» */
  wichtigsteSatz: string;
  wichtigste: LueckenEintrag | null;
  luecken: LueckenEintrag[];
  ohneVerantwortliche: number;
};

export function zeilen(input: WegInput): Zeile[] {
  return PHASEN.map((p, i) => {
    const ph = input.phasen[i] ?? emptyPhase();
    const l = luecke(ph);
    return {
      nr: i + 1,
      key: p.key,
      label: phaseLabel(p, input.typ),
      frage: ph.frage.trim(),
      punkte: PUNKT_KEYS.filter((k) => ph.punkte.includes(k)).map(punktLabel),
      inhalt: ph.inhalt,
      inhaltText: inhaltText(ph.inhalt),
      verantwortlich: ph.verantwortlich.trim(),
      luecke: l,
      stufeText: STUFE_TEXT[l.stufe],
    };
  });
}

/** Die Lücken, rot vor gelb, innerhalb derselben Stufe die frühere Phase zuerst (Richtwert von Alperna, keine Statistik). */
export function lueckenliste(input: WegInput): LueckenEintrag[] {
  const eintraege = zeilen(input)
    .filter((z) => z.luecke.stufe !== "ok")
    .map((z): LueckenEintrag => {
      const nurFrage = z.luecke.gruende.length === 1 && z.luecke.gruende[0] === GRUND.frage;
      return {
        nr: z.nr,
        key: z.key,
        label: z.label,
        stufe: z.luecke.stufe as "rot" | "gelb",
        gruende: z.luecke.gruende,
        vorschlaege: nurFrage ? [VORSCHLAG_FRAGE] : vorschlaege(z.key, input.typ),
        werkzeuge: nurFrage ? [] : werkzeugFuer(z.key, input.typ),
      };
    });
  const rang = { rot: 0, gelb: 1 } as const;
  return eintraege.sort((a, b) => rang[a.stufe] - rang[b.stufe] || a.nr - b.nr);
}

export const VORSCHLAEGE_NOTE = `Die Vorschläge sind ein ${RICHTWERT}. Sie nennen den Inhaltstyp, der fehlt, nicht den fertigen Text.`;

export const BEGRUENDUNG = `Die frühere Phase kommt zuerst, weil ohne Aufmerksamkeit der Rest nichts bringt. Das ist ein ${RICHTWERT}.`;

/** Gesamtaussage: «n von 6 Phasen sind abgedeckt» und ein Satz mit der wichtigsten Lücke. */
export function summary(input: WegInput): Summary {
  const rows = zeilen(input);
  const luecken = lueckenliste(input);
  const total = rows.length;
  const abgedeckt = rows.filter((z) => z.luecke.stufe === "ok").length;
  const ohneVerantwortliche = rows.filter((z) => z.verantwortlich === "").length;
  const wichtigste = luecken[0] ?? null;
  const satz = `${abgedeckt} von ${total} Phasen ${abgedeckt === 1 ? "ist" : "sind"} abgedeckt.`;
  let wichtigsteSatz: string;
  if (wichtigste) {
    wichtigsteSatz = `Die wichtigste Lücke liegt in der Phase «${wichtigste.label}»: ${wichtigste.gruende[0]}.`;
  } else if (ohneVerantwortliche > 0) {
    const n = ohneVerantwortliche;
    wichtigsteSatz = `Es gibt keine Lücke. Offen bleibt, wer sich um ${n === 1 ? "eine Phase" : `${n} Phasen`} kümmert.`;
  } else {
    wichtigsteSatz = "Es gibt keine Lücke.";
  }
  return {
    abgedeckt,
    total,
    rot: luecken.filter((l) => l.stufe === "rot").length,
    gelb: luecken.filter((l) => l.stufe === "gelb").length,
    satz,
    wichtigsteSatz,
    wichtigste,
    luecken,
    ohneVerantwortliche,
  };
}

export type Ergebnis = {
  typ: Typ;
  firma: string;
  branche: string;
  datum: string;
  wegName: string;
  zeilen: Zeile[];
  summary: Summary;
};

export function auswerten(input: WegInput, kontext: Kontext): Ergebnis {
  return {
    typ: input.typ,
    firma: kontext.firma.trim(),
    branche: kontext.branche.trim(),
    datum: kontext.datum ?? "",
    wegName: wegName(input.typ),
    zeilen: zeilen(input),
    summary: summary(input),
  };
}

// ---- Dokument ----------------------------------------------------------------------------------

export const HINWEISE: readonly string[] = [
  `Die Stufen sind ein ${RICHTWERT}: Ohne Berührungspunkt oder ohne Inhalt ist eine Phase eine Lücke, mit teilweisem Inhalt ist sie teilweise abgedeckt.`,
  "Der Weg gilt für ein Angebot. Hast du Angebote mit ganz verschiedener Kundschaft, starte das Werkzeug für jedes neu.",
  "Eine Phase ohne verantwortliche Person bleibt liegen. Trag für jede Phase einen Namen ein und prüf den Weg einmal im Jahr.",
];

export const KEINE_LUECKE_TEXT = "Es gibt nichts zu ergänzen. Prüf den Weg in einem Jahr noch einmal und frag ein paar Personen, wie sie auf dich gekommen sind.";

const list = (items: string[], empty: string) => (items.length > 0 ? items.join(", ") : empty);

/** Das Dokument für Bildschirm-Copy, PDF (A4 quer über `landscape`) und Word. */
export function toDocument(e: Ergebnis): DocumentModel & { landscape: true } {
  const verein = e.typ === "verein";
  const s = e.summary;
  const kopf: DocBlock[] = [
    { type: "heading", level: 1, text: "Auf einen Blick" },
    {
      type: "facts",
      items: [
        { label: verein ? "Verein" : "Betrieb", value: e.firma || "keine Angabe" },
        ...(e.branche ? [{ label: verein ? "Tätigkeit" : "Branche", value: e.branche }] : []),
        { label: "Abgedeckte Phasen", value: `${s.abgedeckt} von ${s.total}` },
        { label: "Wichtigste Lücke", value: s.wichtigste ? s.wichtigste.label : "keine" },
      ],
    },
    { type: "paragraph", text: `${s.satz} ${s.wichtigsteSatz}` },
  ];

  const weg: DocBlock[] = [
    { type: "heading", level: 1, text: verein ? "Der Weg zur Mitgliedschaft in sechs Phasen" : "Der Weg in sechs Phasen" },
    {
      type: "table",
      header: ["Phase", "Frage", "Berührungspunkte", "Inhalt", "Verantwortlich", "Lücke"],
      widths: [1.4, 2.2, 2.2, 1, 1.4, 1],
      rows: e.zeilen.map((z) => [
        `${z.nr}. ${z.label}`,
        z.frage || GRUND.frage,
        list(z.punkte, "keine"),
        z.inhaltText,
        z.verantwortlich || HINWEIS_VERANTWORTLICH,
        z.stufeText,
      ]),
    },
  ];

  const luecken: DocBlock[] = [
    { type: "heading", level: 1, text: "Lückenliste" },
    ...(s.luecken.length === 0
      ? ([{ type: "paragraph", text: KEINE_LUECKE_TEXT }] as DocBlock[])
      : ([
          { type: "paragraph", text: BEGRUENDUNG },
          {
            type: "table",
            header: ["Phase", "Was fehlt", "Vorschläge", "Nächstes Werkzeug"],
            widths: [1.4, 2, 3, 2],
            rows: s.luecken.map((l) => [
              `${l.nr}. ${l.label} (${STUFE_TEXT[l.stufe]})`,
              l.gruende.join("\n"),
              l.vorschlaege.map((v) => `• ${v}`).join("\n"),
              l.werkzeuge.length > 0 ? l.werkzeuge.map((w) => w.name).join(" oder ") : "keines",
            ]),
          },
          { type: "paragraph", text: VORSCHLAEGE_NOTE },
        ] as DocBlock[])),
  ];

  const hinweise: DocBlock[] = [
    { type: "heading", level: 1, text: "Drei Hinweise" },
    { type: "list", ordered: true, items: [...HINWEISE] },
  ];

  return {
    title: e.firma ? `${e.wegName}: ${e.firma}` : e.wegName,
    subtitle: `Sechs Phasen von «${e.zeilen[0].label}» bis «${e.zeilen[5].label}»`,
    firma: e.firma || undefined,
    datum: e.datum || undefined,
    filename: safeFilename(`${verein ? "weg zur mitgliedschaft" : "kundenweg"} ${e.firma}`, verein ? "weg-zur-mitgliedschaft" : "kundenweg"),
    blocks: [...kopf, ...weg, ...luecken, ...hinweise],
    landscape: true,
  };
}

/** Das Dokument als Markdown fürs CRM und zum Kopieren. */
export function reportMarkdown(e: Ergebnis): string {
  return toMarkdown(toDocument(e)).trimEnd();
}

/** Die Angaben fürs CRM: je Phase eine Zeile. Der Server kürzt auf 1'900 Zeichen. */
export function eingabeText(input: WegInput): string {
  return PHASEN.map((p, i) => {
    const ph = input.phasen[i] ?? emptyPhase();
    const punkte = PUNKT_KEYS.filter((k) => ph.punkte.includes(k)).map(punktLabel);
    return (
      `${i + 1}. ${phaseLabel(p, input.typ)}: Frage: ${ph.frage.trim() || "keine Angabe"}` +
      ` | Berührungspunkte: ${list(punkte, "keine")}` +
      ` | Inhalt: ${inhaltText(ph.inhalt)}` +
      ` | Verantwortlich: ${ph.verantwortlich.trim() || "niemand"}`
    );
  }).join("\n");
}

// ---- Gespeicherter Stand -----------------------------------------------------------------------

export type Output = { firma: string; branche: string; datum: string };
export type KundenwegState = { v: 1; phase: "edit" | "result"; typ: Typ; phasen: PhaseInput[]; output?: Output };

export const EMPTY_STATE: KundenwegState = { v: 1, phase: "edit", typ: "kmu", phasen: emptyPhasen() };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const asText = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function parsePhase(raw: unknown): PhaseInput {
  if (!isObject(raw)) return emptyPhase();
  const gewaehlt = Array.isArray(raw.punkte) ? raw.punkte.filter(isPunktKey) : [];
  return {
    frage: asText(raw.frage, LIMITS.frage),
    punkte: PUNKT_KEYS.filter((k) => gewaehlt.includes(k)),
    inhalt: isInhaltKey(raw.inhalt) ? raw.inhalt : "",
    verantwortlich: asText(raw.verantwortlich, LIMITS.verantwortlich),
  };
}

function parseOutput(raw: unknown): Output | null {
  if (!isObject(raw)) return null;
  const datum = asText(raw.datum, 10);
  return { firma: asText(raw.firma, 200), branche: asText(raw.branche, 200), datum: /^\d{2}\.\d{2}\.\d{4}$/.test(datum) ? datum : "" };
}

/**
 * Liest den gespeicherten Stand; bei kaputten Daten gilt der leere Stand. Ungültige Felder fallen einzeln weg, zu lange Texte
 * werden gekürzt, fehlende Phasen leer ergänzt, überzählige abgeschnitten. Ohne gültige Eingabe oder ohne `output` bleibt
 * die Phase «edit», damit nie ein halbes Ergebnis erscheint.
 */
export function parseState(raw: unknown): KundenwegState {
  if (!isObject(raw) || raw.v !== 1) return EMPTY_STATE;
  const typ: Typ = raw.typ === "verein" ? "verein" : "kmu";
  const roh = Array.isArray(raw.phasen) ? raw.phasen : [];
  const phasen = PHASEN.map((_, i) => parsePhase(roh[i]));
  const output = parseOutput(raw.output);
  if (raw.phase === "result" && output && validate({ typ, phasen }) === null) return { v: 1, phase: "result", typ, phasen, output };
  return { v: 1, phase: "edit", typ, phasen };
}
