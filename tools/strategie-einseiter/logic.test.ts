import { describe, expect, it } from "vitest";
import type { Answers } from "@/components/tool/questionnaire";
import { dateCH } from "@/lib/ch";
import type { Profile } from "@/lib/profile";
import { isToolDone, toolStateKey } from "@/lib/progress";
import {
  AUFWAND_UNBEKANNT,
  BAUSTEINE,
  BAUSTEIN_KEYS,
  BOTSCHAFTEN_SLUG,
  BUDGET_SLUG,
  CHECK_SLUG,
  EMPTY_STATE,
  ICP_SLUG,
  MARKE_SLUG,
  MAX_EINTRAEGE,
  NUTZEN_SLUG,
  PERSONA_SLUG,
  POSITIONIERUNG_SLUG,
  QUELLEN_KEYS,
  QUELLE_PROFIL,
  REIFEGRAD_SLUG,
  SAEULEN_SLUG,
  SLUG,
  SWOT_SLUG,
  TITEL,
  TOTAL,
  WERKZEUG_NAMEN,
  collect,
  eingabeText,
  fehlende,
  inhaltOf,
  massnahmen,
  offen,
  parseBudget,
  parseState,
  quelleWerkzeug,
  reportMarkdown,
  toDocument,
  toState,
  vollstaendigkeit,
  type Einseiter,
} from "./logic";

// Spec: specs/strategie-einseiter.md, Abschnitte «Logik», «Edge Cases» und «Tests».

// ---- Stände der Quellen, wie sie im Browser liegen (gültig nach den Schemas der Werkzeuge) ----------------------

const satz = (n: number, text = "Wort") => Array.from({ length: n }, (_, i) => `${text} ${i + 1}`).join(" ");

const POSITIONIERUNG = {
  v: 1,
  form: { unterscheidung: "", beweise: "" },
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", kanton: "St. Gallen", host: "malerei-keller.ch", title: "Malerei Keller", headings: [], funde: [], unterscheidung: "", beweise: "" },
  check: {
    score: 55,
    funde: [{ id: "zielgruppe-ok", gruppe: "zielgruppe", titel: "Für wen", status: "gut", punkte: 20, max: 20, hinweis: "Die Startseite nennt, für wen du arbeitest.", beispiele: [] }],
    kennzahlen: { woerter: 300, saetze: 20, wirSaetze: 5, kundeSaetze: 1, kundenAnteil: 0.17, beweise: 3, floskeln: 4, lesbarkeit: null },
  },
  output: {
    kernsatz: "Für Hausbesitzer in Gossau und im Fürstenland: Fassaden, die zwanzig Jahre halten, in zwei Wochen fertig.",
    fuerWen: "Hausbesitzer in Gossau und im Fürstenland mit einem älteren Einfamilienhaus.",
    wasAnders: "Die Offerte ist am Ende auch die Rechnung, und der Termin steht, bevor das Gerüst kommt. Die Farbwahl wird vor Ort erklärt.",
    beweise: ["Seit 1985 in Gossau.", "Zwölf Mitarbeitende und drei Lernende."],
    varianten: [
      { stil: "kurz", satz: "Fassaden in Gossau, in zwei Wochen fertig." },
      { stil: "konkret", satz: "Seit 1985 streichen wir Fassaden in Gossau, die zwanzig Jahre halten." },
      { stil: "persoenlich", satz: "Ich streiche Fassaden in Gossau so, dass sie zwanzig Jahre halten." },
    ],
    streichen: ["Wir freuen uns auf Ihre Anfrage", "kompetent und zuverlässig"],
    naechsterSchritt: "Ersetze den ersten Satz der Startseite durch den Kernsatz und stelle die Beweise darunter.",
  },
};

const ICP = {
  v: 1,
  input: {
    betrieb: "Malerei Keller",
    branche: "Malerei",
    ort: "Gossau",
    kanton: "St. Gallen",
    groesse: "10 bis 49 Mitarbeitende",
    angebot: "Fassaden, Innenräume, Farbberatung vor Ort.",
    besteKunden: "Eigentümer älterer Einfamilienhäuser aus dem Dorf, die auf Empfehlung kommen.",
    einzugsgebiet: "Gossau und Umgebung",
    auftrag: "",
    nichtPassend: "",
  },
  output: {
    segmentName: "Eigentümer älterer Einfamilienhäuser in Gossau und Umgebung",
    beschreibung: "Paare und Familien, die ihr Haus seit Jahren besitzen und einen Betrieb aus der Nähe bevorzugen. Sie fragen auf Empfehlung an.",
    merkmale: ["Einfamilienhaus in Gossau und Umgebung", "Haus seit vielen Jahren im Besitz", "Entscheiden selbst, ohne Verwaltung", "Kommen auf Empfehlung aus dem Dorf"],
    ausloeser: ["Die Fassade fällt im Frühling auf", "Ein Nachbar hat frisch gestrichen", "Vor einem Verkauf oder einer Übergabe"],
    einwaende: ["Ein Gerüst, das wochenlang steht", "Ein Preis über der Offerte"],
    signale: ["Fragt nach einer Besichtigung", "Nennt den Namen des Empfehlers", "Will einen festen Termin"],
    nichtIdeal: ["Nur der Preis zählt", "Ein Generalunternehmer dazwischen"],
    punktekarte: Array.from({ length: 6 }, (_, i) => ({ kriterium: `Kriterium Nummer ${i + 1}`, punkte: (i % 3) + 1, warum: "Weil es den Auftrag entscheidet." })),
  },
};

const PERSONA = {
  v: 1,
  form: { zielgruppe: "", angebot: "", altersgruppe: "", rolle: "", situation: "", fragen: "" },
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", zielgruppe: "Hausbesitzer in Gossau", angebot: "Fassaden streichen, Beratung vor Ort, Offerte innert drei Arbeitstagen.", altersgruppe: "45-60", rolle: "privatperson", situation: "", fragen: "" },
  output: {
    name: "Ruth Hungerbühler",
    kurz: "Ruth Hungerbühler, zwischen 45 und 60, wohnt mit ihrem Mann in einem Einfamilienhaus in Gossau.",
    alltag: "Drei Tage pro Woche Gemeindeverwaltung in Flawil. Samstags im Garten, wo ihr die Fassade auffällt und sie an den Maler denkt.",
    ziele: ["Fassade vor dem Sommer sauber", "Betrieb aus der Nähe", "Eine Offerte, die sie zeigen kann"],
    sorgen: ["Ein Gerüst, das wochenlang steht", "Ein Preis über der Offerte", "Die falsche Farbe"],
    informationswege: ["Google, Suche nach Maler Gossau", "Nachbarschaft und Bekannte", "Gemeindeblatt"],
    einwaende: ["Das hält doch noch ein paar Jahre.", "Ich vergleiche zuerst zwei Offerten."],
    soSprichstDuSieAn: { ton: "Per Sie, ruhig, ohne Fachwörter.", woerter: ["sauber", "in der Nähe", "verlässlich", "Termin"], vermeiden: ["Premium", "exklusiv", "Lösung"] },
    zitat: "Ich will wissen, wann ihr kommt und wann ihr wieder weg seid.",
  },
};

const NUTZEN = {
  v: 1,
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", zielgruppe: "Hausbesitzer in der Region", angebot: "Fassaden, Innenräume, Farbberatung.", problem: "Die Fassade blättert und niemand hat Zeit.", ergebnis: "Eine Fassade, die hält.", beweise: "", positionierung: "" },
  output: {
    kurz: "Fassaden in Gossau, die zwanzig Jahre halten.",
    mittel: "Du bekommst eine Fassade, die zwanzig Jahre hält, und eine Offerte innert einer Woche. Die Farbwahl erklären wir dir vor Ort.",
    lang: satz(30, "Satz"),
    nutzen: ["Du bekommst eine Fassade, die hält", "Du hast eine Offerte innert einer Woche", "Du bekommst die Farbwahl vor Ort erklärt", "Du hast einen festen Termin"],
    beweise: ["[Zahl der Fassaden seit der Gründung]"],
    bausteine: {
      websiteTitel: "Malerei Keller: Fassaden in Gossau, die halten",
      websiteUntertitel: "Fassaden und Innenräume für Hausbesitzer in der Region Gossau.",
      googleBeschreibung: satz(20, "Google"),
      instagramBio: "Fassaden in Gossau, die halten. Offerte innert einer Woche.",
      einSatzAmTelefon: "Wir streichen Fassaden in Gossau, die halten, und sind am Tag da, den wir nennen.",
    },
  },
};

const MARKE = {
  v: 1,
  website: "",
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", positionierung: "", zielgruppe: "", wofuer: "Saubere Arbeit, Termine, die gehalten werden.", woerterKundschaft: "zuverlässig, bodenständig, genau", nie: "", anrede: "sie", websiteText: "", headings: [] },
  output: {
    versprechen: "Wir streichen so, dass die Fassade hält und der Termin steht, und erklären die Farbwahl vor Ort.",
    werte: [
      { name: "Verlässlich", satz: "Wir rufen am gleichen Tag zurück und halten den Termin." },
      { name: "Genau", satz: "Wir decken ab, bevor wir anfangen, und räumen auf." },
      { name: "Bodenständig", satz: "Wir sagen, was eine Fassade kostet, ohne Rabattspiel." },
      { name: "Nah", satz: "Wir sind aus Gossau und kennen die Häuser hier." },
    ],
    persoenlichkeit: ["zuverlässig", "bodenständig", "genau"],
    tonalitaet: { so: "Kurze Sätze, per Sie, ohne Fachwörter. Wir sagen, was wir tun.", nichtSo: "Keine Superlative, keine Rabatte, keine Ausrufezeichen im Text.", beispielSatz: "Gern schauen wir uns Ihre Fassade an." },
    woerter: { verwenden: ["sauber", "Termin", "vor Ort", "Offerte", "halten"], vermeiden: ["Premium", "exklusiv", "Lösung", "Aktion", "Rabatt"] },
    geschichte: satz(25, "Geschichte"),
    bewertungsregeln: ["Dank mit Namen und einem Satz zum Auftrag.", "Bei Kritik keine Rechtfertigung, ein Angebot zum Gespräch.", "Innert einer Woche antworten."],
    heutigerTon: "",
  },
};

const BOTSCHAFTEN = {
  v: 1,
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", zielgruppe: "Hausbesitzer in der Region", angebot: "Fassaden, Innenräume, Farbberatung vor Ort.", wirkung: "Die halten, was sie sagen.", beweise: "", anrede: "du", positionierung: "", primaersegment: "", personas: [] },
  output: {
    hauptbotschaft: "Die Malerei Keller streicht Fassaden in der Region Gossau, die halten, und ist am Tag da, den sie nennt.",
    botschaften: [
      { fuer: "Hausbesitzer", satz: "Du bekommst eine Fassade, die hält, und eine Offerte innert einer Woche.", beleg: "[Zahl der Fassaden]" },
      { fuer: "Liegenschaftsverwaltungen", satz: "Wir streichen das Treppenhaus, während die Mieter wohnen bleiben.", beleg: "[Zahl der Treppenhäuser]" },
      { fuer: "Offerte", satz: "Die Offerte ist am Ende auch die Rechnung.", beleg: "[Beleg aus den Angaben]" },
      { fuer: "Reklamation", satz: "Wir kommen vorbei und schauen es uns an.", beleg: "[Beleg aus den Angaben]" },
    ],
    kanaele: { website: "Fassaden in der Region Gossau, die halten. Offerte innert einer Woche.", googleProfil: "Wir streichen Fassaden und Innenräume für Hausbesitzer in der Region Gossau.", instagram: "Fassaden in Gossau, die halten.", offerteOderMail: satz(12, "Offerte") },
    telefonsatz: "Wir sind die Malerei Keller aus Gossau, wir streichen Fassaden, die halten.",
    nichtSagen: ["Dass wir alles für alle machen", "Dass wir die Günstigsten sind", "Ein Preis am Telefon"],
  },
};

const SAEULEN = {
  v: 1,
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", positionierung: "", primaersegment: "", personas: [], angebot: "Fassaden und Innenräume, zwei Lehrlinge, Fragen nach Preis, Dauer und Farbwahl.", alltag: "", kanaele: ["instagram", "google"], beitraegeProWoche: "2" },
  output: {
    saeulen: [
      { name: "Fassaden vorher und nachher", beschreibung: "Was eine Fassade in Gossau braucht, vom Gerüst bis zum Anstrich.", ziel: "anfragen", beispiele: ["Ein Haus in drei Bildern", "Was ein Regentag ändert", "Das Gerüst kommt"], anteil: 35 },
      { name: "Fragen aus dem Alltag", beschreibung: "Die Fragen vom Telefon, in Ruhe beantwortet, damit sie nicht mehr gestellt werden.", ziel: "vertrauen", beispiele: ["Der Weg zur Offerte", "Welches Weiss in eine Altbauwohnung passt", "Wie lange eine Fassade trocknet"], anteil: 25 },
      { name: "Team und Lehre", beschreibung: "Wer bei der Malerei Keller arbeitet und wie ein Tag auf der Baustelle aussieht.", ziel: "bindung", beispiele: ["Ein Morgen mit [Name des Lehrlings]", "Der Znüni auf der Baustelle", "Die Werkstatt am Freitag"], anteil: 20 },
      { name: "Gossau und die Region", beschreibung: "Der Betrieb als Teil des Dorfs, mit Anlässen und Baustellen aus der Nachbarschaft.", ziel: "sichtbarkeit", beispiele: ["Der Stand am [Anlass in Gossau]", "Die Baustelle am Dorfplatz", "Der Lehrling an der Berufsmesse"], anteil: 20 },
    ],
    rhythmus: { satz: "Zwei Beiträge pro Woche; die Fassaden jede Woche, die anderen Säulen im Wechsel.", wochenplan: [{ tag: "Dienstag", saeule: "Fassaden vorher und nachher", kanal: "Instagram" }, { tag: "Freitag", saeule: "Fragen aus dem Alltag", kanal: "Google-Beitrag" }] },
    niemals: ["Memes ohne Bezug zum Malen, weil sie nichts erklären.", "Preise ohne Besichtigung, weil sie nie stimmen."],
  },
};

const SWOT = {
  v: 1,
  form: { staerken: "", schwaechen: "", chancen: "", risiken: "", ziel: "" },
  input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", groesse: "", positionierung: "", ziel: "", staerken: "Stammkundschaft", schwaechen: "Website veraltet", chancen: "Neues Quartier Sommerau", risiken: "Preisdruck", fakten: [] },
  output: {
    einSatz: "Malerei Keller lebt von Empfehlungen und sauberer Arbeit, bleibt online aber hinter dem zurück, was der Betrieb kann.",
    staerken: [{ punkt: "Stammkundschaft, die weiterempfiehlt", warum: "Empfehlungen bringen die besten Aufträge." }, { punkt: "Saubere Arbeit auf jeder Baustelle", warum: "Das sieht die Nachbarschaft." }, { punkt: "Offerte innert drei Arbeitstagen", warum: "Schneller als viele andere." }],
    schwaechen: [{ punkt: "Website seit Jahren unverändert", warum: "Online zeigt sich nicht, was der Betrieb kann." }, { punkt: "Google-Profil nicht bestätigt", warum: "Wer sucht, findet alte Angaben." }, { punkt: "Niemand hat feste Zeit fürs Marketing", warum: "Darum bleibt vieles liegen." }],
    chancen: [{ punkt: "Neues Quartier Sommerau", warum: "Junge Hausbesitzer brauchen bald einen Maler." }, { punkt: "Ein Mitbewerber in Flawil hört auf", warum: "Seine Kundschaft sucht neu." }, { punkt: "[Anlass in deiner Region]", warum: "Ein Stand bringt Gespräche." }],
    risiken: [{ punkt: "Preisdruck aus St. Gallen", warum: "Grosse Betriebe offerieren tiefer." }, { punkt: "Abhängigkeit von Empfehlungen", warum: "Bleiben sie aus, bleibt der Kalender leer." }],
    folgerungen: [
      { massnahme: "Google-Profil bestätigen und mit Baustellenfotos füllen", nutzt: "saubere Arbeit", behebt: "schwaches Profil", aufwand: "klein" },
      { massnahme: "Flyer und Beitrag fürs Quartier Sommerau", nutzt: "neues Quartier", behebt: "Abhängigkeit von Empfehlungen", aufwand: "mittel" },
      { massnahme: "Startseite mit Kernsatz und Beweisen neu schreiben", nutzt: "Stammkundschaft", behebt: "", aufwand: "gross" },
    ],
  },
};

/** Rechenbeispiel aus specs/reifegrad-check.md (ohne Website-Scan): Strategie 33, Kundenkontakt 33, Steuerung 17; Auftritt und Inhalte nicht bewertet. */
const KELLER: Answers = { ziele: "kopf", zielgruppe: "grob", verantwortung: "unter2", bewertungen: "manchmal", kontakt: "gelegentlich", budget: "keins" };
const REIFEGRAD = { v: 1, phase: "result", step: 10, answers: KELLER };

const CHECK = {
  v: 1,
  phase: "result",
  step: 0,
  answers: {},
  form: { industry: "craft", socials: {} },
  result: {
    v: 1,
    score: 38,
    company: "Malerei Keller",
    url: "https://www.malerei-keller.ch",
    checkedAt: "2026-10-03T09:00:00.000Z",
    // Website 60, Google-Profil 50, Social Media 40, keine Web-Analyse (Website-Scan des Reifegrad-Checks)
    categories: [
      { id: "seo", score: 0.6, items: [] },
      { id: "gbp", score: 0.5, verified: false, items: [] },
      { id: "social", score: 0.4, items: [] },
      { id: "sea", score: 0.4, items: [{ id: "sea.analytics", ok: false }] },
    ],
    facts: {},
    massnahmen: [],
  },
};

const BUDGET = {
  v: 1,
  input: { umsatz: 400000 },
  output: {
    jahr: 12000,
    monat: 1000,
    kanaele: [
      { label: "Newsletter", anteil: 10, jahr: 1200 },
      { label: "Website", anteil: 40, jahr: 4800 },
      { label: "Google-Unternehmensprofil", anteil: 20, jahr: 2400 },
      { label: "Instagram", anteil: 30, jahr: 3600 },
    ],
    summe: 12000,
  },
};

const ALLE: Record<string, unknown> = {
  [toolStateKey(POSITIONIERUNG_SLUG)]: POSITIONIERUNG,
  [toolStateKey(ICP_SLUG)]: ICP,
  [toolStateKey(PERSONA_SLUG)]: PERSONA,
  [toolStateKey(NUTZEN_SLUG)]: NUTZEN,
  [toolStateKey(MARKE_SLUG)]: MARKE,
  [toolStateKey(BOTSCHAFTEN_SLUG)]: BOTSCHAFTEN,
  [toolStateKey(SAEULEN_SLUG)]: SAEULEN,
  [toolStateKey(BUDGET_SLUG)]: BUDGET,
  [toolStateKey(SWOT_SLUG)]: SWOT,
  [toolStateKey(REIFEGRAD_SLUG)]: REIFEGRAD,
  [toolStateKey(CHECK_SLUG)]: CHECK,
};

/** Liest wie der Browser: der Wert zu einem Schlüssel als Text, sonst null. Texte bleiben roh (kaputte Daten). */
const reader = (states: Record<string, unknown>) => (key: string) => {
  if (!(key in states)) return null;
  const v = states[key];
  return typeof v === "string" ? v : JSON.stringify(v);
};

const PROFIL: Profile = { firma: "Malerei Keller", ort: "Gossau", branche: "Malerei" };
const leer = () => collect(() => null, {});
const voll = (profile: Profile = PROFIL) => collect(reader(ALLE), profile);
const NOW = new Date("2026-10-05T10:00:00.000Z");

// ---- Bausteine und Schlüssel ------------------------------------------------------------------------------

describe("strategie-einseiter: Bausteine", () => {
  it("kennt acht Bausteine mit eindeutigen Schlüsseln, Werkzeugnamen und Links", () => {
    expect(BAUSTEINE).toHaveLength(8);
    expect(TOTAL).toBe(8);
    expect(new Set(BAUSTEINE.map((b) => b.key)).size).toBe(8);
    expect(BAUSTEINE.map((b) => b.key)).toEqual([...BAUSTEIN_KEYS]);
    for (const b of BAUSTEINE) {
      expect(b.link).toBe(`/tools/${b.werkzeugSlug}`);
      expect(b.werkzeugName).not.toBe("");
      expect(b.quelle).not.toBe("");
    }
    expect(BAUSTEINE.find((b) => b.key === "budget")?.werkzeugSlug).toBe(BUDGET_SLUG);
  });

  it("liest elf Schlüssel im Browser, alle mit mt:", () => {
    expect(QUELLEN_KEYS).toHaveLength(11);
    expect(QUELLEN_KEYS.every((k) => k.startsWith("mt:"))).toBe(true);
    expect(QUELLEN_KEYS).toContain("mt:budget-planer");
    expect(SLUG).toBe("strategie-einseiter");
  });
});

// ---- collect -------------------------------------------------------------------------------------------------

describe("strategie-einseiter: collect", () => {
  it("leerer Browser: 0 von 8, alle Bausteine fehlen, keine Quellen, Betrieb leer", () => {
    const e = leer();
    expect(e.vorhanden).toBe(0);
    expect(e.total).toBe(8);
    expect(vollstaendigkeit(e)).toBe("0 von 8 Bausteinen");
    expect(e.bausteine).toHaveLength(8);
    expect(e.bausteine.every((b) => !b.vorhanden && b.quellen.length === 0)).toBe(true);
    expect(fehlende(e)).toHaveLength(8);
    expect(e.betrieb).toEqual({ firma: "", ort: "", branche: "" });
    expect(inhaltOf(e, "positionierung").kernsatz).toBe("");
    expect(inhaltOf(e, "lage").reifegrad).toBeNull();
    expect(inhaltOf(e, "budget").jahr).toBeNull();
  });

  it("vollständige Stände: 8 von 8 mit Inhalt aus jedem Werkzeug", () => {
    const e = voll();
    expect(e.vorhanden).toBe(8);
    expect(fehlende(e)).toHaveLength(0);
    expect(e.betrieb).toEqual({ firma: "Malerei Keller", ort: "Gossau", branche: "Malerei" });

    const pos = inhaltOf(e, "positionierung");
    expect(pos.kernsatz).toBe(POSITIONIERUNG.output.kernsatz);
    expect(pos.fuerWen).toBe(POSITIONIERUNG.output.fuerWen);

    const ziel = inhaltOf(e, "zielgruppe");
    expect(ziel.segment).toBe(ICP.output.segmentName);
    expect(ziel.merkmale).toEqual(ICP.output.merkmale.slice(0, MAX_EINTRAEGE));
    expect(ziel.persona).toEqual({ name: "Ruth Hungerbühler", kurz: PERSONA.output.kurz });

    expect(inhaltOf(e, "nutzen")).toEqual({ key: "nutzen", kurz: NUTZEN.output.kurz, nutzen: NUTZEN.output.nutzen.slice(0, 3) });

    const marke = inhaltOf(e, "marke");
    expect(marke.versprechen).toBe(MARKE.output.versprechen);
    expect(marke.werte).toEqual(["Verlässlich", "Genau", "Bodenständig"]);
    expect(marke.tonalitaet).toBe(MARKE.output.tonalitaet.so);
    expect(marke.woerter).toEqual(MARKE.output.woerter.verwenden);

    const bot = inhaltOf(e, "botschaft");
    expect(bot.hauptbotschaft).toBe(BOTSCHAFTEN.output.hauptbotschaft);
    expect(bot.botschaften).toHaveLength(3);
    expect(bot.botschaften[0]).toEqual({ fuer: "Hausbesitzer", satz: BOTSCHAFTEN.output.botschaften[0].satz });

    const kan = inhaltOf(e, "kanaele");
    expect(kan.kanaele).toEqual(["Instagram", "Google-Beitrag"]);
    expect(kan.saeulen.map((s) => s.name)).toEqual(SAEULEN.output.saeulen.map((s) => s.name));
    expect(kan.saeulen[0].anteil).toBe(35);
    expect(kan.rhythmus).toBe(SAEULEN.output.rhythmus.satz);

    const bud = inhaltOf(e, "budget");
    expect(bud.jahr).toBe(12000);
    expect(bud.monat).toBe(1000);
    expect(bud.kanaele.map((k) => k.label)).toEqual(["Website", "Instagram", "Google-Unternehmensprofil"]);

    const lage = inhaltOf(e, "lage");
    expect(lage.einSatz).toBe(SWOT.output.einSatz);
    expect(lage.folgerungen).toHaveLength(3);
    expect(lage.check).toEqual({ score: 38, host: "malerei-keller.ch", datum: "03.10.2026" });
    // Strategie 33, Auftritt 56, Inhalte 40, Kundenkontakt 33, Steuerung 11: (33 + 56 + 40 + 33 + 11) ÷ 5 = 35
    expect(lage.reifegrad?.gesamt).toBe(35);
    expect(lage.reifegrad?.stufe).toBe("Aufbau");
    expect(lage.reifegrad?.staerkste.name).toBe("Auftritt");
    expect(lage.reifegrad?.schwaechste).toMatchObject({ name: "Steuerung", score: 11, stufe: "Anfang" });
    expect(lage.reifegrad?.schwaechste.schritte).toHaveLength(2);
  });

  it("nennt je Baustein die Quelle in Worten", () => {
    const e = voll();
    const q = Object.fromEntries(e.bausteine.map((b) => [b.key, b.quellen]));
    expect(q.positionierung).toEqual([quelleWerkzeug(WERKZEUG_NAMEN.positionierung)]);
    expect(q.zielgruppe).toEqual([quelleWerkzeug(WERKZEUG_NAMEN.icp), quelleWerkzeug(WERKZEUG_NAMEN.persona)]);
    expect(q.nutzen).toEqual(["Werkzeug Nutzenversprechen"]);
    expect(q.marke).toEqual(["Werkzeug Markenplattform"]);
    expect(q.botschaft).toEqual(["Werkzeug Kernbotschaften"]);
    expect(q.kanaele).toEqual(["Werkzeug Themensäulen"]);
    expect(q.budget).toEqual(["Werkzeug Marketing-Budget-Planer"]);
    expect(q.lage).toEqual(["Werkzeug SWOT-Analyse", "Werkzeug Reifegrad-Check", "Werkzeug Digitaler-Auftritt-Check"]);
  });

  it("kaputte Stände zählen als «fehlt», ohne Fehler", () => {
    const kaputt: Record<string, unknown> = {
      [toolStateKey(POSITIONIERUNG_SLUG)]: "{nicht json",
      [toolStateKey(ICP_SLUG)]: { v: 2, input: ICP.input, output: ICP.output },
      [toolStateKey(PERSONA_SLUG)]: { v: 1, output: { name: "x" } },
      [toolStateKey(NUTZEN_SLUG)]: [1, 2, 3],
      [toolStateKey(MARKE_SLUG)]: { v: 1, input: null, output: MARKE.output },
      [toolStateKey(BOTSCHAFTEN_SLUG)]: 42,
      [toolStateKey(SAEULEN_SLUG)]: { v: 1, input: SAEULEN.input, output: { saeulen: "keine" } },
      [toolStateKey(BUDGET_SLUG)]: { v: 1, output: { jahr: "zwölftausend" } },
      [toolStateKey(SWOT_SLUG)]: { v: 1, input: SWOT.input, output: null },
      [toolStateKey(REIFEGRAD_SLUG)]: { v: 1, phase: "questions", step: 3, answers: KELLER },
      [toolStateKey(CHECK_SLUG)]: { v: 1, phase: "result", result: { score: "hoch" } },
    };
    const e = collect(reader(kaputt), {});
    expect(e.bausteine.filter((b) => b.vorhanden).map((b) => b.key)).toEqual([]);
    expect(e.vorhanden).toBe(0);
    expect(inhaltOf(e, "kanaele")).toEqual({ key: "kanaele", kanaele: [], saeulen: [], rhythmus: "" });
    expect(inhaltOf(e, "lage")).toEqual({ key: "lage", einSatz: "", folgerungen: [], reifegrad: null, check: null });
  });

  it("Profil hat Vorrang vor dem Werkzeug-Stand (Positionierung, Segment, Marke, Kanäle, Budget)", () => {
    const profil: Profile = {
      ...PROFIL,
      positionierung: "  Fassaden in Gossau, die halten.  ",
      primaersegment: "Hausbesitzer im Fürstenland",
      marke: { werte: ["Nah", "Genau"], tonalitaet: { so: "Per Sie, kurz." }, woerter: { verwenden: ["Termin", "sauber"] } },
      kanaele: [{ name: "Instagram" }, { kanal: "Newsletter" }, { url: "ohne-namen" }],
      budgetJahr: 15000,
    };
    const e = voll(profil);
    expect(inhaltOf(e, "positionierung").kernsatz).toBe("Fassaden in Gossau, die halten.");
    expect(inhaltOf(e, "zielgruppe").segment).toBe("Hausbesitzer im Fürstenland");
    expect(inhaltOf(e, "marke")).toMatchObject({ werte: ["Nah", "Genau"], tonalitaet: "Per Sie, kurz.", woerter: ["Termin", "sauber"], versprechen: MARKE.output.versprechen });
    expect(inhaltOf(e, "kanaele").kanaele).toEqual(["Instagram", "Newsletter"]);
    expect(inhaltOf(e, "budget")).toMatchObject({ jahr: 15000, monat: 1000 });
    const q = Object.fromEntries(e.bausteine.map((b) => [b.key, b.quellen]));
    expect(q.positionierung).toEqual([QUELLE_PROFIL]);
    expect(q.zielgruppe).toEqual([QUELLE_PROFIL, quelleWerkzeug(WERKZEUG_NAMEN.persona)]);
    expect(q.marke).toEqual([QUELLE_PROFIL, quelleWerkzeug(WERKZEUG_NAMEN.marke)]);
    expect(q.kanaele).toEqual([QUELLE_PROFIL, quelleWerkzeug(WERKZEUG_NAMEN.saeulen)]);
    expect(q.budget).toEqual([QUELLE_PROFIL, quelleWerkzeug(WERKZEUG_NAMEN.budget)]);
  });

  it("Zielgruppe: erste Zielgruppe und Persona aus dem Profil reichen, auch ohne Werkzeug-Stand", () => {
    const e = collect(() => null, { zielgruppen: [{ name: "Eigentümer älterer Einfamilienhäuser" }], personas: [{ name: "Ruth Hungerbühler", kurz: "Wohnt in Gossau." }] });
    expect(e.vorhanden).toBe(1);
    const z = inhaltOf(e, "zielgruppe");
    expect(z.segment).toBe("Eigentümer älterer Einfamilienhäuser");
    expect(z.persona).toEqual({ name: "Ruth Hungerbühler", kurz: "Wohnt in Gossau." });
    expect(z.merkmale).toEqual([]);
    expect(e.bausteine.find((b) => b.key === "zielgruppe")?.quellen).toEqual([QUELLE_PROFIL]);
  });

  it("Lage: Reifegrad ohne Scan bewertet nur drei Dimensionen (Strategie gewinnt den Gleichstand mit Kundenkontakt), alle gleich: stärkste gleich schwächste", () => {
    const nurReifegrad = collect(reader({ [toolStateKey(REIFEGRAD_SLUG)]: REIFEGRAD }), {});
    const r = inhaltOf(nurReifegrad, "lage").reifegrad;
    // (33 + 33 + 17) ÷ 3 = 27,7 → 28
    expect(r?.gesamt).toBe(28);
    expect(r?.staerkste).toMatchObject({ name: "Strategie", score: 33 });
    expect(r?.schwaechste.name).toBe("Steuerung");
    expect(inhaltOf(nurReifegrad, "lage").check).toBeNull();
    expect(nurReifegrad.vorhanden).toBe(1);

    const alleTief: Answers = { ziele: "keine", zielgruppe: "nein", verantwortung: "niemand", bewertungen: "nie", kontakt: "keiner", budget: "keins" };
    const gleich = collect(reader({ [toolStateKey(REIFEGRAD_SLUG)]: { v: 1, phase: "result", step: 10, answers: alleTief } }), {});
    const g = inhaltOf(gleich, "lage").reifegrad;
    expect(g?.staerkste.name).toBe(g?.schwaechste.name);
    expect(g?.schwaechste.score).toBe(0);
  });

  it("begrenzt Listen auf drei Einträge und sortiert die Budget-Kanäle nach Betrag", () => {
    const e = voll();
    expect(inhaltOf(e, "zielgruppe").merkmale).toHaveLength(3);
    expect(inhaltOf(e, "nutzen").nutzen).toHaveLength(3);
    expect(inhaltOf(e, "botschaft").botschaften).toHaveLength(3);
    expect(inhaltOf(e, "budget").kanaele.map((k) => k.jahr)).toEqual([4800, 3600, 2400]);
  });

  it("parseBudget: liest die angenommene Form defensiv und lässt kaputte Kanäle weg", () => {
    expect(parseBudget(null)).toBeNull();
    expect(parseBudget({ v: 1 })).toBeNull();
    expect(parseBudget({ v: 1, output: { jahr: Number.NaN } })).toBeNull();
    expect(parseBudget({ v: 1, output: { jahr: -5 } })).toBeNull();
    expect(parseBudget({ v: 1, output: { jahr: 6000 } })).toEqual({ jahr: 6000, monat: null, kanaele: [] });
    expect(parseBudget({ v: 1, output: { jahr: 6000, monat: 500, kanaele: [{ label: "Website", anteil: 50, jahr: 3000 }, { label: "", anteil: 50, jahr: 3000 }, "x", { label: "Instagram", anteil: "50", jahr: 3000 }] } })).toEqual({
      jahr: 6000,
      monat: 500,
      kanaele: [{ label: "Website", anteil: 50, jahr: 3000 }],
    });
  });

  it("Betrieb fehlt, Werkzeuge da: Kopf mit Platzhalter Firmenprofil, Bausteine trotzdem vorhanden", () => {
    const e = collect(reader(ALLE), {});
    expect(e.vorhanden).toBe(8);
    expect(e.betrieb).toEqual({ firma: "", ort: "", branche: "" });
    const md = reportMarkdown(e, NOW);
    expect(md).toContain(`**Firma:** ${offen(WERKZEUG_NAMEN.profil)}`);
    expect(md).toContain(`_Dein Betrieb, ${dateCH(NOW)}_`);
    expect(md).not.toContain(offen(WERKZEUG_NAMEN.swot));
  });

  it("Hilfen: offen, quelleWerkzeug, vollstaendigkeit", () => {
    expect(offen("SWOT-Analyse")).toBe("[Noch offen: SWOT-Analyse]");
    expect(quelleWerkzeug("Persona-Generator")).toBe("Werkzeug Persona-Generator");
    expect(vollstaendigkeit({ vorhanden: 3, total: 8 })).toBe("3 von 8 Bausteinen");
    expect(vollstaendigkeit(voll())).toBe("8 von 8 Bausteinen");
  });
});

// ---- Massnahmen ------------------------------------------------------------------------------------------------

describe("strategie-einseiter: massnahmen", () => {
  it("nimmt die Folgerungen der SWOT und die zwei Schritte der schwächsten Reifegrad-Dimension", () => {
    const liste = massnahmen(voll());
    expect(liste).toHaveLength(5);
    expect(liste[0]).toEqual({ massnahme: SWOT.output.folgerungen[0].massnahme, woher: "SWOT-Analyse", aufwand: "klein" });
    expect(liste[2].aufwand).toBe("gross");
    expect(liste[3].woher).toBe("Reifegrad-Check, Dimension «Steuerung»");
    expect(liste[3].aufwand).toBe(AUFWAND_UNBEKANNT);
    expect(liste[3].massnahme).toMatch(/Bestimme eine Person/);
    expect(liste[4].massnahme).toMatch(/jede Anfrage/);
  });

  it("nur SWOT, nur Reifegrad oder nichts", () => {
    expect(massnahmen(collect(reader({ [toolStateKey(SWOT_SLUG)]: SWOT }), {}))).toHaveLength(3);
    const nurReifegrad = massnahmen(collect(reader({ [toolStateKey(REIFEGRAD_SLUG)]: REIFEGRAD }), {}));
    expect(nurReifegrad).toHaveLength(2);
    expect(nurReifegrad.every((m) => m.woher.startsWith("Reifegrad-Check"))).toBe(true);
    expect(massnahmen(leer())).toEqual([]);
  });
});

// ---- Dokument ----------------------------------------------------------------------------------------------------

const textOf = (e: Einseiter) => reportMarkdown(e, NOW);

describe("strategie-einseiter: toDocument", () => {
  it("leerer Browser: Platzhalter mit dem Namen jedes Werkzeugs, keine Tabelle", () => {
    const doc = toDocument(leer(), NOW);
    const md = textOf(leer());
    for (const name of Object.values(WERKZEUG_NAMEN)) expect(md).toContain(offen(name));
    expect(md).toContain("0 von 8 Bausteinen vorhanden. Noch offen: Positionierungs-Check, ICP-Builder, Nutzenversprechen, Markenplattform, Kernbotschaften, Themensäulen, Marketing-Budget-Planer, SWOT-Analyse.");
    expect(md).toContain("Noch keine Massnahmen.");
    expect(doc.blocks.some((b) => b.type === "table")).toBe(false);
    expect(doc.subtitle).toBe(`Dein Betrieb, ${dateCH(NOW)}`);
    expect(doc.firma).toBeUndefined();
    expect(doc.filename).toBe("strategie-einseiter-betrieb");
  });

  it("vollständig: Titel, Untertitel mit Firma und Datum, Blöcke in Reihenfolge, Beträge und Prozent in Schweizer Schreibweise", () => {
    const doc = toDocument(voll(), NOW);
    expect(doc.title).toBe(TITEL);
    expect(doc.subtitle).toBe(`Malerei Keller, ${dateCH(NOW)}`);
    expect(doc.datum).toBe("05.10.2026");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("strategie-einseiter-malerei-keller");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b as { text: string }).text);
    expect(headings).toEqual(["Positionierung", "Für wen", "Nutzen", "Marke", "Botschaft", "Kanäle und Säulen", "Budget", "Lage", "Massnahmen"]);
    const md = textOf(voll());
    expect(md).not.toContain("[Noch offen");
    expect(md).toContain("8 von 8 Bausteinen vorhanden.");
    expect(md).toContain("CHF 12'000.-");
    expect(md).toContain("CHF 1'000.-");
    expect(md).toContain("Website CHF 4'800.- (40 %)");
    expect(md).toContain("Säule Fassaden vorher und nachher (35 % der Beiträge)");
    expect(md).toContain("Kanäle: Instagram, Google-Beitrag");
    expect(md).toContain("Ruth Hungerbühler: Ruth Hungerbühler, zwischen 45 und 60");
    expect(md).toContain("35 von 100, Stufe «Aufbau»; stärkste Dimension «Auftritt» (56), schwächste «Steuerung» (11)");
    expect(md).toContain("38 von 100 (malerei-keller.ch, geprüft am 03.10.2026)");
    const table = doc.blocks.find((b) => b.type === "table") as { header: string[]; rows: string[][] };
    expect(table.header).toEqual(["Massnahme", "Woher", "Aufwand"]);
    expect(table.rows).toHaveLength(5);
    expect(md).toMatch(/^# Marketingstrategie auf einer Seite/);
  });

  it("teilweise: Platzhalter nur dort, wo etwas fehlt", () => {
    const e = collect(reader({ [toolStateKey(SWOT_SLUG)]: SWOT, [toolStateKey(BUDGET_SLUG)]: { v: 1, output: { jahr: 6000 } } }), PROFIL);
    const md = textOf(e);
    expect(md).toContain("2 von 8 Bausteinen vorhanden.");
    expect(md).toContain(offen(WERKZEUG_NAMEN.positionierung));
    expect(md).toContain(offen(WERKZEUG_NAMEN.reifegrad));
    expect(md).toContain(offen(WERKZEUG_NAMEN.check));
    expect(md).not.toContain(offen(WERKZEUG_NAMEN.swot));
    expect(md).not.toContain(offen(WERKZEUG_NAMEN.profil));
    expect(md).toContain("CHF 6'000.-");
    expect(md).toContain(`**Pro Monat:** ${offen(WERKZEUG_NAMEN.budget)}`);
    expect(md).toContain("| Woher |");
  });

  it("Reifegrad bei Gleichstand als ein Satz", () => {
    const alleTief: Answers = { ziele: "keine", zielgruppe: "nein", verantwortung: "niemand", bewertungen: "nie", kontakt: "keiner", budget: "keins" };
    const e = collect(reader({ [toolStateKey(REIFEGRAD_SLUG)]: { v: 1, phase: "result", step: 10, answers: alleTief } }), {});
    expect(textOf(e)).toContain("0 von 100, Stufe «Anfang»; alle bewerteten Dimensionen liegen bei 0 von 100");
  });
});

// ---- CRM ----------------------------------------------------------------------------------------------------------

describe("strategie-einseiter: eingabeText", () => {
  it("eine Zeile je Baustein mit Status und Quelle", () => {
    const lines = eingabeText(voll()).split("\n");
    expect(lines[0]).toBe("Betrieb: Malerei Keller, Gossau (Firmenprofil)");
    expect(lines[1]).toBe("Vollständigkeit: 8 von 8 Bausteinen");
    expect(lines).toHaveLength(10);
    expect(lines[2]).toBe("Positionierung: vorhanden (Werkzeug Positionierungs-Check)");
    expect(lines[9]).toBe("Lage und Massnahmen: vorhanden (Werkzeug SWOT-Analyse, Werkzeug Reifegrad-Check, Werkzeug Digitaler-Auftritt-Check)");
  });

  it("fehlende Bausteine nennen das Werkzeug, fehlender Betrieb heisst «fehlt»", () => {
    const lines = eingabeText(leer()).split("\n");
    expect(lines[0]).toBe("Betrieb: fehlt (Firmenprofil)");
    expect(lines[1]).toBe("Vollständigkeit: 0 von 8 Bausteinen");
    expect(lines[8]).toBe("Budget: fehlt (Werkzeug Marketing-Budget-Planer)");
    expect(lines.filter((l) => l.includes(": fehlt (Werkzeug"))).toHaveLength(8);
  });
});

// ---- Gespeicherter Stand ---------------------------------------------------------------------------------------

describe("strategie-einseiter: parseState", () => {
  it("kaputte Daten ergeben den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 7, [], {}, { v: 2, output: {} }, { v: 1 }, { v: 1, output: null }, { v: 1, output: "fertig" }, { v: 1, output: { bausteine: [], erstelltAm: "gestern" } }, { v: 1, output: { bausteine: [{ key: "fremd", vorhanden: true }], erstelltAm: "2026-10-05T10:00:00.000Z" } }, { v: 1, output: { bausteine: [{ key: "budget", vorhanden: "ja" }], erstelltAm: "2026-10-05T10:00:00.000Z" } }, { v: 1, output: { bausteine: "alle", erstelltAm: "2026-10-05T10:00:00.000Z" } }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
    expect(EMPTY_STATE.output).toBeNull();
  });

  it("Rundlauf: toState → JSON → parseState, und der Pfad zählt das Werkzeug als erledigt", () => {
    const state = toState(voll(), NOW);
    expect(state.output?.erstelltAm).toBe(NOW.toISOString());
    expect(state.output?.bausteine).toHaveLength(8);
    expect(state.output?.bausteine.every((b) => b.vorhanden)).toBe(true);
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(isToolDone(JSON.stringify(state))).toBe(true);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);

    const teil = toState(leer(), NOW);
    expect(teil.output?.bausteine.every((b) => !b.vorhanden)).toBe(true);
    expect(parseState(teil)).toEqual(teil);
  });
});
