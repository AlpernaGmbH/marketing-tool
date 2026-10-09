import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { styleIssues } from "@/lib/content-rules";
import { isToolDone } from "@/lib/progress";
import { findingsOf } from "@/tools/textcheck/logic";
import {
  ABOUT_ANFANG,
  EMPTY_STATE,
  GEWICHT_SUMME,
  HEADLINE_RICHTWERT,
  HINWEISE,
  KRITERIEN,
  KRITERIEN_IDS,
  LIMITS,
  MAX_VERBESSERUNGEN,
  REST_PROFIL,
  RICHTWERT_HINWEIS,
  SAMPLE,
  bewerten,
  documentParts,
  eingabeText,
  hinweiseFuerKi,
  kiInput,
  outputOf,
  parseState,
  punkteFuer,
  reportMarkdown,
  sprichtKundschaftAn,
  stufe,
  toDocument,
  validate,
  verbesserungText,
  verbesserungen,
  vorbefuellt,
  zielgruppeVorschlag,
  type KriteriumId,
  type LinkedinState,
} from "./logic";

// Spec: specs/linkedin-profil.md, Abschnitte «Regeln» und «Rechenbeispiel».

const KI = {
  headlines: [
    { text: "Ich helfe Familien in Gossau beim Streichen ihrer Fassade", grund: "Nennt, wem du wobei hilfst." },
    { text: "Fassaden und Innenräume für Familien in Gossau und Flawil", grund: "Nennt die Orte, die du bedienst." },
    { text: "Malermeister in dritter Generation für Familien in Gossau", grund: "Die dritte Generation ist ein Beleg." },
  ],
  infoAnfang: "Familien in Gossau, Flawil und Herisau bekommen von uns Fassaden und Innenräume, die halten. Wir beraten bei der Farbwahl und streichen sauber.",
};

const P = (id: KriteriumId, headline: string, about = "") => punkteFuer(id, headline, about);
const woerter = (n: number) => Array.from({ length: n }, () => "wort").join(" ");

const KELLER: LinkedinState = {
  ...EMPTY_STATE,
  phase: "result",
  headline: SAMPLE.headline,
  about: SAMPLE.about,
  zielgruppe: SAMPLE.zielgruppe,
  firma: "Malerei Keller",
  branche: "Malerei",
  ki: KI,
  output: outputOf(SAMPLE.headline, SAMPLE.about),
};

describe("linkedin-profil: Kriterien", () => {
  it("hat zehn Kriterien mit eindeutigen IDs; die Gewichte summieren sich zu 100 und sind gerade", () => {
    expect(KRITERIEN).toHaveLength(10);
    expect(new Set(KRITERIEN_IDS).size).toBe(10);
    expect(GEWICHT_SUMME).toBe(100);
    for (const k of KRITERIEN) expect(k.gewicht % 2).toBe(0);
  });

  it("verteilt das Gewicht: Headline 38, Info-Text 62", () => {
    const summe = (stelle: string) => KRITERIEN.filter((k) => k.stelle === stelle).reduce((n, k) => n + k.gewicht, 0);
    expect(summe("Headline")).toBe(38);
    expect(summe("Info-Text")).toBe(62);
  });

  it("gibt jedem Kriterium zwei Texte für 0 und 1 Punkt und einen Satz «wie»", () => {
    for (const k of KRITERIEN) {
      expect(k.fehlt[0]).not.toBe(k.fehlt[1]);
      expect(k.wie.length).toBeGreaterThan(20);
    }
  });
});

describe("linkedin-profil: Punkte je Kriterium", () => {
  it("h-laenge: leer 0, über dem Richtwert 0, unter 25 Zeichen 1, sonst 2", () => {
    expect(P("h-laenge", "")).toBe(0);
    expect(P("h-laenge", "x".repeat(HEADLINE_RICHTWERT + 1))).toBe(0);
    expect(P("h-laenge", "x".repeat(HEADLINE_RICHTWERT))).toBe(2);
    expect(P("h-laenge", "Maler")).toBe(1);
    expect(P("h-laenge", "x".repeat(24))).toBe(1);
    expect(P("h-laenge", "x".repeat(25))).toBe(2);
  });

  it("h-aussage: Verb und Bezug 2, nur eins von beiden 1, sonst 0", () => {
    expect(P("h-aussage", "Ich helfe Familien in Gossau beim Streichen")).toBe(2);
    expect(P("h-aussage", "Wir streichen Fassaden für Familien")).toBe(2);
    expect(P("h-aussage", "Malerei für Fassaden")).toBe(1);
    expect(P("h-aussage", "Wir streichen Fassaden")).toBe(1);
    expect(P("h-aussage", "Malermeister bei Malerei Keller")).toBe(0);
    expect(P("h-aussage", "")).toBe(0);
  });

  it("h-aussage: ein Verb zählt nur als ganzes Wort", () => {
    expect(P("h-aussage", "Bauleiter für Kunden")).toBe(1);
    expect(P("h-aussage", "Macher aus Leidenschaft")).toBe(0);
  });

  it("h-beleg: Zahl 2, Ort 1, sonst 0", () => {
    expect(P("h-beleg", "Malerei seit 1987")).toBe(2);
    expect(P("h-beleg", "Maler in Gossau")).toBe(1);
    expect(P("h-beleg", "Maler")).toBe(0);
  });

  it("h-floskel: eine Floskel aus dem Textcheck gibt 0, keine gibt 2, eine leere Headline 0", () => {
    expect(P("h-floskel", "Ganzheitliche Lösungen für Ihr Zuhause")).toBe(0);
    expect(P("h-floskel", "Malermeister bei Malerei Keller")).toBe(2);
    expect(P("h-floskel", "")).toBe(0);
  });

  it("i-nutzen: «Ich bin» und «Mein Name» 0, sonst mit «Ich» 1, sonst 2", () => {
    expect(P("i-nutzen", "", "Ich bin Malermeister in Gossau.")).toBe(0);
    expect(P("i-nutzen", "", "«Ich bin Malermeister in Gossau.»")).toBe(0);
    expect(P("i-nutzen", "", "Mein Name ist Ruth Keller.")).toBe(0);
    expect(P("i-nutzen", "", "Ich führe die Malerei Keller in dritter Generation.")).toBe(1);
    expect(P("i-nutzen", "", "Wir streichen Fassaden in Gossau.")).toBe(2);
    expect(P("i-nutzen", "", "Ichthyologie ist ein Fach.")).toBe(2);
    expect(P("i-nutzen", "", "")).toBe(0);
  });

  it("i-kundschaft: in den ersten 210 Zeichen 2, danach bis 600 Zeichen 1, sonst 0", () => {
    expect(P("i-kundschaft", "", "Familien in Gossau bekommen von uns Fassaden.")).toBe(2);
    expect(P("i-kundschaft", "", `${"Wir streichen. ".repeat(20)}Unsere Kundschaft kennt uns.`)).toBe(1);
    expect(P("i-kundschaft", "", `${"Wir streichen. ".repeat(60)}Unsere Kundschaft kennt uns.`)).toBe(0);
    expect(P("i-kundschaft", "", "Wir streichen Fassaden in Gossau.")).toBe(0);
    expect(ABOUT_ANFANG).toBe(210);
  });

  it("sprichtKundschaftAn: «Sie» zählt gross, «sie» klein nicht", () => {
    expect(sprichtKundschaftAn("Wir beraten Sie gern.")).toBe(true);
    expect(sprichtKundschaftAn("Wir beraten sie gern.")).toBe(false);
    expect(sprichtKundschaftAn("Das hilft dir bei der Farbwahl.")).toBe(true);
    expect(sprichtKundschaftAn("Ein Kunde ruft an.")).toBe(true);
  });

  it("i-saetze: kein Satz über 25 Wörter 2, einer 1, mehrere 0; genau 25 Wörter sind erlaubt", () => {
    expect(P("i-saetze", "", `${woerter(25)}.`)).toBe(2);
    expect(P("i-saetze", "", `${woerter(26)}.`)).toBe(1);
    expect(P("i-saetze", "", `${woerter(26)}. ${woerter(30)}.`)).toBe(0);
  });

  it("i-umfang: unter 100 Zeichen 0, unter 300 Zeichen 1, sonst 2", () => {
    expect(P("i-umfang", "", "x".repeat(99))).toBe(0);
    expect(P("i-umfang", "", "x".repeat(100))).toBe(1);
    expect(P("i-umfang", "", "x".repeat(299))).toBe(1);
    expect(P("i-umfang", "", "x".repeat(300))).toBe(2);
  });

  it("i-floskel: keine Floskel 2, eine 1, zwei 0", () => {
    expect(P("i-floskel", "", "Wir streichen Fassaden in Gossau.")).toBe(2);
    expect(P("i-floskel", "", "Wir bieten massgeschneiderte Lösungen.")).toBe(1);
    expect(P("i-floskel", "", "Wir bieten massgeschneiderte Lösungen. Ganzheitlich gedacht.")).toBe(0);
  });

  it("i-aufruf: ein nächster Schritt oder ein Weg zu dir in den letzten 300 Zeichen gibt 2", () => {
    const vorne = "Wir streichen Fassaden. ".repeat(20);
    expect(P("i-aufruf", "", `${vorne}Schreib mir, wenn du eine Offerte brauchst.`)).toBe(2);
    expect(P("i-aufruf", "", `${vorne}Mail: ruth@keller-maler.ch`)).toBe(2);
    expect(P("i-aufruf", "", `${vorne}Telefon 071 123 45 67`)).toBe(2);
    expect(P("i-aufruf", "", `Schreib mir. ${vorne}`)).toBe(0);
    expect(P("i-aufruf", "", vorne)).toBe(0);
  });

  it("gibt einem leeren Text 0 Punkte in allen seinen Kriterien", () => {
    for (const k of KRITERIEN) expect(punkteFuer(k.id, k.stelle === "Headline" ? "" : "Wir streichen Fassaden für Familien in Gossau", k.stelle === "Info-Text" ? "" : "Ich helfe Familien")).toBe(0);
  });
});

describe("linkedin-profil: Punktwert und Stufe", () => {
  it("rechnet das Beispiel Malerei Keller von Hand: 6 + 8 + 8 + 4 + 8 = 34", () => {
    const b = bewerten(SAMPLE.headline, SAMPLE.about);
    expect(b.zeilen.map((z) => `${z.id}:${z.punkte}`)).toEqual([
      "h-laenge:2",
      "h-aussage:0",
      "h-beleg:0",
      "h-floskel:2",
      "i-nutzen:0",
      "i-kundschaft:0",
      "i-saetze:2",
      "i-umfang:1",
      "i-floskel:2",
      "i-aufruf:0",
    ]);
    expect(b.score).toBe(34);
    expect(b.stufe).toBe("Ausbaufähig");
  });

  it("ergibt ohne Texte 0 und ist immer eine ganze Zahl von 0 bis 100", () => {
    expect(bewerten("", "").score).toBe(0);
    const proben = [
      ["Ich helfe Familien in Gossau seit 1987 beim Streichen", `Familien in Gossau bekommen Fassaden, die halten. ${"Wir streichen sauber. ".repeat(15)}Schreib mir.`],
      ["x", "y"],
      ["", "Wir streichen Fassaden für Familien."],
    ];
    for (const [h, a] of proben) {
      const s = bewerten(h, a).score;
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("erreicht mit einem vollständig guten Profil 100", () => {
    const headline = "Ich helfe Familien in Gossau seit 1987 beim Streichen";
    const about = `Familien in Gossau bekommen von uns Fassaden, die halten. ${"Wir streichen Innenräume und beraten bei der Farbwahl. ".repeat(6)}Schreib mir, wenn du eine Offerte brauchst.`;
    expect(bewerten(headline, about).score).toBe(100);
    expect(verbesserungen(headline, about)).toEqual([]);
  });

  it("liegt an den Schwellen: 39 Ausbaufähig, 40 Solide Basis, 69 Solide Basis, 70 Stark", () => {
    expect([stufe(0), stufe(39), stufe(40), stufe(69), stufe(70), stufe(100)]).toEqual([
      "Ausbaufähig",
      "Ausbaufähig",
      "Solide Basis",
      "Solide Basis",
      "Stark",
      "Stark",
    ]);
    expect([stufe(Number.NaN), stufe(-5), stufe(250)]).toEqual(["Ausbaufähig", "Ausbaufähig", "Stark"]);
  });

  it("ändert den Punktwert nicht durch Leerzeichen oder Zeilenumbrüche", () => {
    expect(bewerten(`  ${SAMPLE.headline}  `, SAMPLE.about.replace(/ /g, "  ")).score).toBe(34);
  });
});

describe("linkedin-profil: Verbesserungen", () => {
  it("sortiert absteigend nach offenen Punkten und nennt höchstens fünf", () => {
    const v = verbesserungen(SAMPLE.headline, SAMPLE.about);
    expect(v.map((x) => `${x.id}:${x.offen}`)).toEqual(["h-aussage:18", "i-nutzen:16", "i-kundschaft:12", "i-aufruf:10", "h-beleg:6"]);
    expect(v).toHaveLength(MAX_VERBESSERUNGEN);
    expect(verbesserungen(SAMPLE.headline, SAMPLE.about, 2)).toHaveLength(2);
    expect(verbesserungen(SAMPLE.headline, SAMPLE.about, 0)).toEqual([]);
  });

  it("nimmt den Text zur Punktzahl: 0 und 1 Punkt haben verschiedene Texte", () => {
    expect(verbesserungen("Wir streichen Fassaden", "x", 10).find((v) => v.id === "h-aussage")?.fehlt).toBe(KRITERIEN[1].fehlt[1]);
    expect(verbesserungen("Maler", "x", 10).find((v) => v.id === "h-aussage")?.fehlt).toBe(KRITERIEN[1].fehlt[0]);
  });

  it("nennt die Stelle des Funds: Floskel, lange Headline, lange Sätze", () => {
    const floskel = verbesserungen("Ganzheitliche Lösungen für Ihr Zuhause", "", 10).find((v) => v.id === "h-floskel");
    expect(floskel?.funde[0]).toMatch(/ganzheitlich/i);
    const lang = verbesserungen("x".repeat(HEADLINE_RICHTWERT + 1), "", 10).find((v) => v.id === "h-laenge");
    expect(lang?.funde[0]).toContain(`${HEADLINE_RICHTWERT + 1} Zeichen`);
    const saetze = verbesserungen("", `${woerter(30)}. ${woerter(27)}.`, 10).find((v) => v.id === "i-saetze");
    expect(saetze?.funde[0]).toMatch(/2 Sätze sind lang, der längste hat 30 Wörter/);
  });

  it("macht aus einer Verbesserung einen Satz mit offenen Punkten, Fund und «So geht es»", () => {
    const v = verbesserungen("Ganzheitliche Lösungen für Ihr Zuhause", "", 10).find((x) => x.id === "h-floskel");
    expect(v).toBeDefined();
    const t = verbesserungText(v!);
    expect(t).toMatch(/^Headline ohne Floskeln \(Headline, 8 Punkte offen\): /);
    expect(t).toContain("So geht es: ");
    expect(verbesserungText({ ...v!, offen: 1 })).toContain("1 Punkt offen");
  });

  it("gibt der KI höchstens acht kurze Hinweise", () => {
    const h = hinweiseFuerKi(SAMPLE.headline, SAMPLE.about);
    expect(h.length).toBeGreaterThan(0);
    expect(h.length).toBeLessThanOrEqual(LIMITS.hinweise);
    for (const x of h) expect(x.length).toBeLessThanOrEqual(LIMITS.hinweis);
  });
});

describe("linkedin-profil: Profil und Vorbefüllung", () => {
  it("füllt die Zielgruppe aus dem primaersegment des Profils", () => {
    expect(vorbefuellt(EMPTY_STATE, { primaersegment: "Familien in Gossau" }).zielgruppe).toBe("Familien in Gossau");
  });

  it("überschreibt keine Zielgruppe, die die Person getippt hat", () => {
    expect(vorbefuellt({ ...EMPTY_STATE, zielgruppe: "Vereine" }, { primaersegment: "Familien in Gossau" }).zielgruppe).toBe("Vereine");
  });

  it("lässt die Zielgruppe leer, wenn das Profil nichts hat, und kürzt Langes am letzten Leerzeichen", () => {
    expect(zielgruppeVorschlag(undefined)).toBe("");
    const lang = zielgruppeVorschlag("Eigentümer älterer Einfamilienhäuser in Gossau, Flawil, Herisau und Umgebung, die ihre Fassade erneuern wollen");
    expect(lang).toBe("Eigentümer älterer Einfamilienhäuser in Gossau, Flawil, Herisau und Umgebung");
    expect(lang.length).toBeLessThanOrEqual(LIMITS.zielgruppe);
  });
});

describe("linkedin-profil: validate", () => {
  it("verlangt Headline oder Info-Text", () => {
    expect(validate({ headline: "", about: "" })).toMatch(/Headline oder den Info-Text/);
    expect(validate({ headline: "  ", about: " \n " })).not.toBeNull();
    expect(validate({ headline: "Maler", about: "" })).toBeNull();
    expect(validate({ headline: "", about: "Wir streichen." })).toBeNull();
  });

  it("prüft die Längen der Texte", () => {
    expect(validate({ headline: "x".repeat(LIMITS.headline + 1), about: "" })).toMatch(/höchstens 300 Zeichen/);
    expect(validate({ headline: "", about: "x".repeat(LIMITS.about + 1) })).toMatch(/höchstens 2600 Zeichen/);
    expect(validate({ headline: "x".repeat(LIMITS.headline), about: "x".repeat(LIMITS.about) })).toBeNull();
  });
});

describe("linkedin-profil: parseState", () => {
  it("liefert bei kaputten Daten und bei Ständen einer früheren Fassung den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 3, [], {}, { v: 1, phase: "result", headline: "Maler" }]) expect(parseState(raw)).toEqual(EMPTY_STATE);
  });

  it("kürzt zu lange Texte auf die Grenzen und verwirft falsche Typen", () => {
    const s = parseState({ v: 2, phase: "edit", headline: "x".repeat(999), about: 5, zielgruppe: "y".repeat(500), firma: "z".repeat(500), branche: null });
    expect(s.headline).toHaveLength(LIMITS.headline);
    expect(s.about).toBe("");
    expect(s.zielgruppe).toHaveLength(LIMITS.zielgruppe);
    expect(s.firma).toHaveLength(LIMITS.betrieb);
    expect(s.branche).toBe("");
  });

  it("gibt ein Ergebnis nur mit Text; sonst zurück ins Formular", () => {
    expect(parseState({ v: 2, phase: "result", headline: "", about: "" }).phase).toBe("edit");
    expect(parseState({ v: 2, phase: "result", headline: "Maler", about: "" }).phase).toBe("result");
  });

  it("berechnet output neu und vertraut einem gespeicherten output nicht", () => {
    const s = parseState({ ...KELLER, output: { score: 99, stufe: "Stark" } });
    expect(s.output).toEqual({ score: 34, stufe: "Ausbaufähig" });
  });

  it("liest einen gespeicherten Stand unverändert zurück (Rundlauf)", () => {
    expect(parseState(JSON.parse(JSON.stringify(KELLER)))).toEqual(KELLER);
  });

  it("verwirft Vorschläge der KI, die nicht zum Schema passen, und merkt sich den Ausfall nur ohne Vorschläge", () => {
    const kaputt = parseState({ ...KELLER, ki: { headlines: [{ text: "kurz", grund: "x" }], infoAnfang: "zu kurz" }, kiAusfall: true });
    expect(kaputt.ki).toBeNull();
    expect(kaputt.kiAusfall).toBe(true);
    const ok = parseState({ ...KELLER, kiAusfall: true });
    expect(ok.ki).toEqual(KI);
    expect(ok.kiAusfall).toBe(false);
  });

  it("gilt im Pfad als erledigt, sobald phase «result» ist, und nicht mehr in der Bearbeitung", () => {
    expect(isToolDone(JSON.stringify(KELLER))).toBe(true);
    expect(isToolDone(JSON.stringify({ ...KELLER, phase: "edit", output: undefined }))).toBe(false);
  });
});

describe("linkedin-profil: kiInput", () => {
  it("räumt die Angaben auf, kürzt sie auf die Grenzen und hängt die Hinweise der Regeln an", () => {
    const i = kiInput({ ...KELLER, headline: "  Malermeister \n bei Malerei Keller ", firma: "Malerei  Keller" });
    expect(i.betrieb).toBe("Malerei Keller");
    expect(i.headline).toBe("Malermeister bei Malerei Keller");
    expect(i.about).toBe(SAMPLE.about);
    expect(i.hinweise).toEqual(hinweiseFuerKi(KELLER.headline, KELLER.about));
    expect(kiInput({ ...KELLER, about: "a".repeat(5000) }).about).toHaveLength(LIMITS.about);
  });
});

describe("linkedin-profil: Dokument und Texte fürs CRM", () => {
  it("baut das Dokument: Punktwert, Balken, Verbesserungen, Vorschläge der KI, Rest des Profils, drei Hinweise", () => {
    const doc = toDocument(KELLER);
    expect(doc.title).toBe("LinkedIn-Profil-Score");
    expect(doc.subtitle).toBe("Punktwert 34 von 100, Stufe «Ausbaufähig»");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("linkedin-profil-malerei-keller");
    const types = doc.blocks.map((b) => b.type);
    expect(types).toContain("stat");
    expect(types).toContain("bars");
    expect(types).toContain("cards");
    const stat = doc.blocks.find((b) => b.type === "stat");
    expect(stat).toMatchObject({ value: "34", of: "100", band: "Ausbaufähig" });
    const bars = doc.blocks.find((b) => b.type === "bars");
    expect(bars && bars.type === "bars" ? bars.items : []).toHaveLength(10);
  });

  it("teilt das Dokument in drei Teile; die Vorschläge der KI stehen in der Mitte", () => {
    const t = documentParts(KELLER);
    expect(t.vor.length).toBeGreaterThan(3);
    expect(JSON.stringify(t.ki)).toContain(KI.headlines[0].text);
    expect(JSON.stringify(t.ki)).toContain(KI.infoAnfang);
    expect(JSON.stringify(t.nach)).toContain(REST_PROFIL[0].titel);
    expect(JSON.stringify(t.nach)).toContain(HINWEISE[0].slice(0, 30));
  });

  it("sagt im Dokument, wenn die KI ausgefallen ist, und zeigt trotzdem Punktwert und Verbesserungen", () => {
    const md = reportMarkdown({ ...KELLER, ki: null, kiAusfall: true });
    expect(md).toContain("nicht erreichbar");
    expect(md).toContain("34");
    expect(md).toContain("Verbesserungen");
    expect(md).not.toContain(KI.headlines[0].text);
  });

  it("sagt bei voller Punktzahl ohne Funde, dass es nichts zu verbessern gibt", () => {
    const headline = "Ich helfe Familien in Gossau seit 1987 beim Streichen";
    const about = `Familien in Gossau bekommen von uns Fassaden, die halten. ${"Wir streichen Innenräume und beraten bei der Farbwahl. ".repeat(6)}Schreib mir, wenn du eine Offerte brauchst.`;
    expect(reportMarkdown({ ...KELLER, headline, about, ki: null })).toContain("nichts zu verbessern");
  });

  it("schreibt die Eingabe fürs CRM lesbar: Betrieb zuerst, dann die eingefügten Texte; leere Angaben fehlen", () => {
    const t = eingabeText(KELLER);
    expect(t.split("\n")).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Zielgruppe: Familien in Gossau",
      "Eingefügte Headline: Malermeister bei Malerei Keller",
      `Eingefügter Info-Text: ${SAMPLE.about}`,
    ]);
    expect(eingabeText({ firma: "", branche: "", zielgruppe: "", headline: "Maler", about: "" })).toBe("Eingefügte Headline: Maler");
  });

  it("schreibt die Ausgabe fürs CRM als Markdown mit Punktwert und Vorschlägen", () => {
    const md = reportMarkdown(KELLER);
    expect(md).toContain("34");
    expect(md).toContain(KI.headlines[1].text);
    expect(md).toContain(KI.infoAnfang);
  });

  it("verändert den Stand nicht und liefert bei gleichem Stand dasselbe Ergebnis", () => {
    const vorher = JSON.stringify(KELLER);
    const a = reportMarkdown(KELLER);
    expect(reportMarkdown(KELLER)).toBe(a);
    expect(JSON.stringify(KELLER)).toBe(vorher);
  });
});

describe("linkedin-profil: Sprache und Sperrliste", () => {
  const alleTexte = (): string[] => {
    const kriterien = KRITERIEN.flatMap((k) => [k.kurz, k.wie, ...k.fehlt]);
    const zustaende: LinkedinState[] = [
      KELLER,
      { ...KELLER, ki: null, kiAusfall: true },
      { ...KELLER, ki: null, kiAusfall: false },
      { ...EMPTY_STATE, phase: "result", headline: "Ihr kompetenter Ansprechpartner", about: `Ich bin Maler. ${woerter(40)}.` },
    ];
    const meldungen = [
      validate({ headline: "", about: "" }),
      validate({ headline: "x".repeat(LIMITS.headline + 1), about: "" }),
      validate({ headline: "", about: "x".repeat(LIMITS.about + 1) }),
    ] as string[];
    const rest = REST_PROFIL.flatMap((r) => [r.titel, r.text]);
    return [...kriterien, ...rest, ...HINWEISE, ...meldungen, ...zustaende.flatMap((s) => [reportMarkdown(s), eingabeText(s)])];
  };

  it("hält die Sperrliste und die Stilregeln in allen eigenen Texten ein", () => {
    for (const text of alleTexte()) {
      // Der Beispiel-Info-Text einer Person darf Floskeln zitieren; geprüft werden die Texte des Werkzeugs.
      if (text.includes("kompetenter Ansprechpartner")) continue;
      expect(brandHits(text)).toEqual([]);
      expect(styleIssues(text)).toEqual([]);
      expect(text).not.toMatch(/\bTools?\b/);
    }
  });

  it("enthält in den eigenen Anleitungen keine Floskel aus dem Textcheck", () => {
    const eigene = KRITERIEN.flatMap((k) => [k.wie, ...k.fehlt]).concat(HINWEISE, REST_PROFIL.map((r) => r.text));
    for (const text of eigene) expect(findingsOf(text).filter((f) => f.kind === "floskel")).toEqual([]);
  });

  it("macht keine Aussage über Algorithmen oder Reichweite und nennt keine fremden Zahlen", () => {
    const text = [...KRITERIEN.flatMap((k) => [k.wie, ...k.fehlt]), ...HINWEISE, ...REST_PROFIL.map((r) => r.text)].join("\n");
    expect(text).not.toMatch(/algorithm|reichweite|viral|mehr aufrufe|prozent/i);
    expect(text).not.toMatch(/\d+\s?%/);
  });

  it("sagt offen, dass die Zahlen ein Richtwert sind und die Plattform ihre Grenzen ändert", () => {
    expect(RICHTWERT_HINWEIS).toBe("Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn.");
    expect(HINWEISE[0]).toContain("Richtwert von Alperna");
    expect(HINWEISE[2]).toMatch(/Plattform ändert/);
  });
});
