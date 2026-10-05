import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import { isToolDone } from "@/lib/progress";
import {
  ANKER_HINWEIS,
  EMPTY_STATE,
  FAKTOREN,
  FAUSTREGEL_SATZ,
  FORMEN,
  HINWEISE,
  LIMITS,
  abstand,
  ceilPrice,
  deckungsbeitrag,
  defaultKernId,
  defaultStufeId,
  eingabeText,
  emptyForm,
  faktorCH,
  formOf,
  isEmptyRow,
  newLeistung,
  nextLeistungId,
  parseNumber,
  parseState,
  preisFuerMarge,
  rechnen,
  reihenfolge,
  reportMarkdown,
  roundPrice,
  stufen,
  stufenLabel,
  toDocument,
  toInput,
  validate,
  validateStruktur,
  warnungen,
  zuordnung,
  type AngebotInput,
  type FormFields,
  type FormLeistung,
  type Leistung,
} from "./logic";

const L = (id: string, name: string, preis: number, aufwand: number, kosten: number): Leistung => ({ id, name, preis, aufwand, kosten });

/** Malerei Keller, Gossau: das Beispiel aus dem Seitentext. */
const KELLER: Leistung[] = [
  L("l1", "Zimmer auffrischen", 1500, 9, 150),
  L("l2", "Wohnung streichen (3 Zimmer)", 3000, 22, 500),
  L("l3", "Fassade Einfamilienhaus", 6400, 36, 1000),
];

function input(over: Partial<AngebotInput> = {}): AngebotInput {
  return {
    firma: "Malerei Keller, Gossau",
    branche: "Malerei",
    leistungen: KELLER,
    satz: 85,
    zielmarge: 30,
    kernId: "l2",
    einstiegId: "l1",
    premiumId: "l3",
    form: "einzel",
    anker: false,
    ...over,
  };
}

const row = (id: string, name: string, preis: string, aufwand = "1", kosten = "0"): FormLeistung => ({ id, name, preis, aufwand, kosten });

function form(over: Partial<FormFields> = {}): FormFields {
  return {
    leistungen: [
      row("l1", "Zimmer auffrischen", "1500", "9", "150"),
      row("l2", "Wohnung streichen (3 Zimmer)", "3000", "22", "500"),
      row("l3", "Fassade Einfamilienhaus", "6400", "36", "1000"),
    ],
    satz: "85",
    zielmarge: "30",
    kern: "",
    form: "einzel",
    anker: false,
    ...over,
  };
}

describe("angebotsarchitektur: Runden auf 5 Franken", () => {
  it("rundet ab, auf und lässt volle Fünfer stehen", () => {
    expect(roundPrice(1247)).toBe(1245);
    expect(roundPrice(1248)).toBe(1250);
    expect(roundPrice(1250)).toBe(1250);
    expect(roundPrice(1252.4)).toBe(1250);
    expect(roundPrice(1252.5)).toBe(1255);
  });
  it("hält die Mitte (ab 2,50 auf) und kommt mit unbrauchbaren Werten zurecht", () => {
    expect(roundPrice(2.5)).toBe(5);
    expect(roundPrice(2.4)).toBe(0);
    expect(roundPrice(0)).toBe(0);
    expect(roundPrice(-30)).toBe(0);
    expect(roundPrice(Number.NaN)).toBe(0);
    expect(roundPrice(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it("rundet nach oben, ohne durch Gleitkomma einen Schritt zu viel zu machen", () => {
    expect(ceilPrice(1001)).toBe(1005);
    expect(ceilPrice(1000)).toBe(1000);
    expect(ceilPrice(1000.0000000000001)).toBe(1000);
    expect(ceilPrice(0.01)).toBe(5);
    expect(ceilPrice(0)).toBe(0);
  });
});

describe("angebotsarchitektur: Konstanten", () => {
  it("die Faustregel ist 40 bis 60 % und 180 bis 250 % vom Kern, gezeigt wird die Mitte", () => {
    expect(FAKTOREN.einstieg).toEqual({ min: 0.4, mittel: 0.5, max: 0.6 });
    expect(FAKTOREN.premium).toEqual({ min: 1.8, mittel: 2.0, max: 2.5 });
    expect(FAUSTREGEL_SATZ).toBe("Die Preisabstände sind eine Faustregel von Alperna, keine Statistik und keine Marktaussage.");
  });
  it("drei Formen mit Beschriftungen; nur das Abo hängt «pro Monat» an", () => {
    expect(FORMEN.map((f) => f.label)).toEqual(["Einzelleistungen", "Pakete", "Abo oder Betreuung"]);
    expect(stufenLabel("einzel", "kern")).toBe("Kern");
    expect(stufenLabel("pakete", "einstieg")).toBe("Basis");
    expect(stufenLabel("pakete", "kern")).toBe("Standard");
    expect(stufenLabel("abo", "premium")).toBe("Komplett");
    expect(FORMEN.filter((f) => f.einheit).map((f) => f.key)).toEqual(["abo"]);
  });
  it("faktorCH zeigt zwei Stellen mit Komma", () => {
    expect(faktorCH(2)).toBe("2,00");
    expect(faktorCH(2.125)).toBe("2,13");
    expect(faktorCH(Number.NaN)).toBe("–");
  });
});

describe("angebotsarchitektur: Deckungsbeitrag und Marge", () => {
  it("rechnet von Hand: 1'250 − 150 − 8 × 85 = 420, Marge 33,6 %", () => {
    expect(deckungsbeitrag({ preis: 1250, aufwand: 8, kosten: 150 }, 85)).toEqual({ db: 420, margePct: 33.6 });
  });
  it("Satz 0 rechnet ohne Arbeitszeit: Preis − Kosten", () => {
    expect(deckungsbeitrag({ preis: 1250, aufwand: 8, kosten: 150 }, 0)).toEqual({ db: 1100, margePct: 88 });
  });
  it("kann negativ werden", () => {
    const r = deckungsbeitrag({ preis: 500, aufwand: 10, kosten: 100 }, 85);
    expect(r.db).toBe(-450);
    expect(r.margePct).toBe(-90);
  });
  it("preisFuerMarge: (Kosten + Aufwand × Satz) / (1 − Ziel), auf 5 Franken aufgerundet", () => {
    // (500 + 22 × 85) / 0.7 = 3385,71
    expect(preisFuerMarge({ aufwand: 22, kosten: 500 }, 85, 30)).toBe(3390);
    // genau 1'000: 700 / 0.7 darf nicht zu 1'005 werden
    expect(preisFuerMarge({ aufwand: 0, kosten: 700 }, 0, 30)).toBe(1000);
    expect(preisFuerMarge({ aufwand: 0, kosten: 700.01 }, 0, 30)).toBe(1005);
  });
});

describe("angebotsarchitektur: Zuordnung", () => {
  it("der Kern ist die Leistung mit dem mittleren Preis; bei gerader Anzahl die untere", () => {
    expect(defaultKernId([])).toBe("");
    expect(defaultKernId([{ id: "a", preis: 100 }])).toBe("a");
    expect(defaultKernId([{ id: "a", preis: 500 }, { id: "b", preis: 100 }])).toBe("b");
    expect(defaultKernId([{ id: "a", preis: 900 }, { id: "b", preis: 100 }, { id: "c", preis: 400 }])).toBe("c");
    expect(defaultKernId([{ id: "a", preis: 400 }, { id: "b", preis: 100 }, { id: "c", preis: 900 }, { id: "d", preis: 200 }])).toBe("d");
    // gleiche Preise: es zählt die Reihenfolge der Eingabe
    expect(defaultKernId([{ id: "a", preis: 100 }, { id: "b", preis: 100 }])).toBe("a");
    expect(defaultKernId([{ id: "a", preis: 100 }, { id: "b", preis: 100 }, { id: "c", preis: 100 }])).toBe("b");
  });
  it("Einstieg und Premium: die Leistung, deren Preis dem Zielpreis am nächsten liegt", () => {
    const ls = [
      { id: "a", preis: 1200 },
      { id: "k", preis: 3000 },
      { id: "b", preis: 1550 },
      { id: "c", preis: 5000 },
      { id: "d", preis: 6200 },
    ];
    expect(defaultStufeId("einstieg", ls, "k")).toBe("b"); // Ziel 1'500
    expect(defaultStufeId("premium", ls, "k")).toBe("d"); // Ziel 6'000
  });
  it("bei Gleichstand gewinnt die zuerst eingetragene", () => {
    const ls = [
      { id: "k", preis: 2000 },
      { id: "a", preis: 900 },
      { id: "b", preis: 1100 },
    ];
    expect(defaultStufeId("einstieg", ls, "k")).toBe("a"); // Ziel 1'000, beide 100 entfernt
  });
  it("der Einstieg kommt nur von unterhalb des Kerns, das Premium nur von oberhalb; der Kern wird nie doppelt belegt", () => {
    const ls = [
      { id: "k", preis: 1000 },
      { id: "a", preis: 2000 },
      { id: "b", preis: 3000 },
    ];
    expect(defaultStufeId("einstieg", ls, "k")).toBeNull();
    expect(defaultStufeId("premium", ls, "k")).toBe("a"); // Ziel 2'000
    expect(defaultStufeId("premium", ls, "k", ["a"])).toBe("b");
    expect(defaultStufeId("einstieg", ls, "gibt-es-nicht")).toBeNull();
  });
  it("zuordnung: Standard, Vorschlag («») und eigene Wahl; eine unbekannte Kennung gilt als Standard", () => {
    const ls = KELLER.map((l) => ({ id: l.id, preis: l.preis }));
    expect(zuordnung({ kern: "" }, ls)).toEqual({ kernId: "l2", einstiegId: "l1", premiumId: "l3" });
    expect(zuordnung({ kern: "", einstiegId: "", premiumId: "l3" }, ls)).toEqual({ kernId: "l2", einstiegId: null, premiumId: "l3" });
    expect(zuordnung({ kern: "l1" }, ls)).toEqual({ kernId: "l1", einstiegId: null, premiumId: "l2" });
    expect(zuordnung({ kern: "x", einstiegId: "y" }, ls)).toEqual({ kernId: "l2", einstiegId: "l1", premiumId: "l3" });
    expect(zuordnung({ kern: "" }, [])).toBeNull();
  });
  it("eine gewählte Leistung bleibt der anderen Stufe erspart", () => {
    const ls = [
      { id: "k", preis: 1000 },
      { id: "a", preis: 3000 },
      { id: "b", preis: 2000 },
    ];
    // Einstieg ausdrücklich «a» (teurer als der Kern): Das Premium wählt nicht dieselbe Leistung
    expect(zuordnung({ kern: "k", einstiegId: "a" }, ls)).toEqual({ kernId: "k", einstiegId: "a", premiumId: "b" });
  });
});

describe("angebotsarchitektur: Stufen", () => {
  it("jede Stufe rechnet mit Preis, Aufwand und Kosten der gewählten Leistung", () => {
    const st = stufen(input());
    expect(st.einstieg).toMatchObject({ leistungId: "l1", name: "Zimmer auffrischen", vorschlag: false, preis: 1500, aufwand: 9, kosten: 150, db: 585, margePct: 39 });
    expect(st.kern).toMatchObject({ leistungId: "l2", preis: 3000, aufwand: 22, kosten: 500, db: 630, margePct: 21 });
    expect(st.premium).toMatchObject({ leistungId: "l3", preis: 6400, aufwand: 36, kosten: 1000, db: 2340, margePct: 36.56 });
  });
  it("Preise der Stufen aus dem Kern: ein Kern allein ergibt 50 % und 200 %, auf 5 Franken gerundet", () => {
    const st = stufen({ ...input(), leistungen: [L("a", "Nur diese", 1250, 8, 150)], kernId: "a", einstiegId: null, premiumId: null });
    expect(st.einstieg.preis).toBe(625);
    expect(st.kern.preis).toBe(1250);
    expect(st.premium.preis).toBe(2500);
    const rund = stufen({ ...input(), leistungen: [L("a", "Nur diese", 1247, 8, 150)], kernId: "a", einstiegId: null, premiumId: null });
    expect(rund.einstieg.preis).toBe(625); // 623,5 → 625
    expect(rund.premium.preis).toBe(2495); // 2'494 → 2'495
  });
  it("eine Leistung allein: Einstieg und Premium sind Vorschläge, Aufwand und Kosten mit den Faktoren 0,5 und 2,0", () => {
    const st = stufen({ ...input(), leistungen: [L("a", "Nur diese", 1250, 8, 150)], kernId: "a", einstiegId: null, premiumId: null });
    expect(st.einstieg).toMatchObject({ leistungId: null, name: "", vorschlag: true, aufwand: 4, kosten: 75 });
    expect(st.premium).toMatchObject({ leistungId: null, vorschlag: true, aufwand: 16, kosten: 300 });
    expect(st.kern.vorschlag).toBe(false);
    // dieselbe Rechnung wie bei jeder Stufe: 625 − 75 − 4 × 85 = 210
    expect(st.einstieg.db).toBe(210);
  });
  it("ein Vorschlag kostet mindestens CHF 5.-", () => {
    const st = stufen({ ...input(), leistungen: [L("a", "Kleinigkeit", 4, 0, 0)], kernId: "a", einstiegId: null, premiumId: null });
    expect(st.einstieg.preis).toBe(5);
  });
  it("ohne Leistung wirft stufen; mit unbekanntem Kern nimmt sie den mittleren", () => {
    expect(() => stufen({ ...input(), leistungen: [] })).toThrow();
    expect(stufen({ ...input(), kernId: "gibt-es-nicht" }).kern.leistungId).toBe("l2");
  });
});

describe("angebotsarchitektur: Warnungen", () => {
  it("warnt, wenn die Marge unter der Zielmarge liegt, und nennt den Preis, der sie erreicht", () => {
    const r = rechnen(input());
    expect(r.stufen.kern.unterZiel).toBe(true);
    expect(r.stufen.kern.preisFuerZiel).toBe(3390);
    expect(r.stufen.einstieg.unterZiel).toBe(false);
    expect(r.stufen.einstieg.preisFuerZiel).toBeNull();
    const w = r.warnungen.filter((x) => x.art === "marge");
    expect(w).toHaveLength(1);
    expect(w[0].stufe).toBe("kern");
    expect(w[0].text).toContain("21 %");
    expect(w[0].text).toContain("30 %");
    expect(w[0].text).toContain("CHF 3'390.-");
  });
  it("genau auf der Zielmarge ist keine Warnung", () => {
    const r = rechnen(input({ leistungen: [L("a", "Genau", 1000, 0, 700)], kernId: "a", einstiegId: null, premiumId: null }));
    expect(r.stufen.kern.margePct).toBe(30);
    expect(r.stufen.kern.unterZiel).toBe(false);
    expect(r.warnungen.filter((w) => w.art === "marge")).toHaveLength(0);
  });
  it("ein negativer Deckungsbeitrag steht im Text", () => {
    const r = rechnen(input({ leistungen: [L("a", "Zu billig", 500, 10, 100)], kernId: "a", einstiegId: null, premiumId: null }));
    const w = r.warnungen.find((x) => x.art === "marge" && x.stufe === "kern");
    expect(w?.text).toContain("negativ");
  });
  it("Satz 0 heisst: Arbeitszeit nicht eingerechnet, mit Hinweis", () => {
    const r = rechnen(input({ satz: 0 }));
    expect(r.stufen.kern.db).toBe(2500);
    const w = r.warnungen.find((x) => x.art === "satz");
    expect(w?.text).toContain("Arbeitszeit");
    expect(toMarkdown(toDocument(r, input({ satz: 0 })))).toContain("Arbeitszeit nicht eingerechnet");
    expect(rechnen(input()).warnungen.some((x) => x.art === "satz")).toBe(false);
  });
  it("Vorschläge werden als Rechenannahme markiert und fragen, was das Angebot enthalten müsste", () => {
    const r = rechnen(input({ einstiegId: null }));
    const w = r.warnungen.find((x) => x.art === "vorschlag");
    expect(w?.stufe).toBe("einstieg");
    expect(w?.text).toContain("Rechenannahmen");
    expect(w?.text).toContain("Was müsste dieses Angebot enthalten?");
  });
  it("Einstieg über dem Kern-Preis und Premium darunter sind falsch gestuft", () => {
    const r = rechnen(input({ einstiegId: "l3", premiumId: "l1" }));
    const falsch = r.warnungen.filter((w) => w.art === "reihenfolge");
    expect(falsch.map((w) => w.stufe)).toEqual(["einstieg", "premium"]);
    // keine zweite Meldung zum Abstand derselben Stufe
    expect(r.warnungen.filter((w) => w.art === "abstand")).toHaveLength(0);
  });
});

describe("angebotsarchitektur: warnungen als eigene Funktion", () => {
  it("liefert dieselbe Liste wie rechnen und nutzt Beschriftung der Form", () => {
    const st = stufen(input({ form: "pakete" }));
    const w = warnungen(st, abstand(st), { satz: 85, zielmarge: 30, form: "pakete" });
    expect(w).toEqual(rechnen(input({ form: "pakete" })).warnungen);
    expect(w[0].text.startsWith("Standard «Wohnung streichen (3 Zimmer)»: ")).toBe(true);
  });
});

describe("angebotsarchitektur: Preisabstand", () => {
  it("zeigt Kern / Einstieg und Premium / Kern als Faktor mit zwei Stellen", () => {
    const st = stufen(input());
    const ab = abstand(st);
    expect(ab.kernZuEinstieg).toBe(2);
    expect(ab.premiumZuKern).toBe(2.13);
    expect(ab.einstiegPct).toBe(50);
    expect(ab.premiumPct).toBe(213.33);
    expect(ab.einstiegInSpanne).toBe(true);
    expect(ab.premiumInSpanne).toBe(true);
  });
  it("die Grenzen der Spanne zählen noch als in der Faustregel", () => {
    const mit = (e: number, p: number) =>
      abstand(
        stufen({
          leistungen: [L("e", "E", e, 1, 0), L("k", "K", 1000, 1, 0), L("p", "P", p, 1, 0)],
          satz: 0,
          zielmarge: 30,
          kernId: "k",
          einstiegId: "e",
          premiumId: "p",
        }),
      );
    expect(mit(400, 1800)).toMatchObject({ einstiegInSpanne: true, premiumInSpanne: true });
    expect(mit(600, 2500)).toMatchObject({ einstiegInSpanne: true, premiumInSpanne: true });
    expect(mit(399, 1799)).toMatchObject({ einstiegInSpanne: false, premiumInSpanne: false });
    expect(mit(601, 2501)).toMatchObject({ einstiegInSpanne: false, premiumInSpanne: false });
  });
  it("ausserhalb der Spanne gibt es einen Hinweis, keinen Fehler", () => {
    const i = input({ leistungen: [L("e", "Einfach", 900, 1, 0), L("k", "Mitte", 1250, 1, 0), L("p", "Teuer", 5000, 1, 0)], kernId: "k", einstiegId: "e", premiumId: "p" });
    expect(validateStruktur(form({ leistungen: [row("e", "Einfach", "900"), row("k", "Mitte", "1250"), row("p", "Teuer", "5000")] }))).toBeNull();
    const r = rechnen(i);
    const w = r.warnungen.filter((x) => x.art === "abstand");
    expect(w.map((x) => x.stufe)).toEqual(["einstieg", "premium"]);
    expect(w[0].text).toContain("40 bis 60 %");
    expect(w[0].text).toContain("72 %");
    expect(w[1].text).toContain("180 bis 250 %");
    expect(w[1].text).toContain("4,00");
  });
});

describe("angebotsarchitektur: Anker und Paketierung", () => {
  it("der Anker kehrt die Reihenfolge um: Premium links", () => {
    expect(reihenfolge(false)).toEqual(["einstieg", "kern", "premium"]);
    expect(reihenfolge(true)).toEqual(["premium", "kern", "einstieg"]);
    expect(rechnen(input({ anker: true })).reihenfolge).toEqual(["premium", "kern", "einstieg"]);
  });
  it("im Dokument steht das Premium zuerst und der Anker-Hinweis kommt dazu, ohne Wirkungsversprechen", () => {
    const doc = toDocument(rechnen(input({ anker: true })), input({ anker: true }));
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table?.type === "table" && table.rows.map((r) => r[0])).toEqual(["Premium", "Kern", "Einstieg"]);
    const md = toMarkdown(doc);
    expect(md).toContain(ANKER_HINWEIS);
    expect(md).toContain("keine Aussage über die Wirkung");
    const ohne = toMarkdown(toDocument(rechnen(input()), input()));
    expect(ohne).not.toContain(ANKER_HINWEIS);
  });
  it("die Paketierung ändert nur Beschriftungen, nicht die Rechnung", () => {
    const einzel = rechnen(input({ form: "einzel" }));
    const pakete = rechnen(input({ form: "pakete" }));
    const abo = rechnen(input({ form: "abo" }));
    expect(pakete.stufen).toEqual(einzel.stufen);
    expect(abo.stufen).toEqual(einzel.stufen);
    expect(pakete.abstand).toEqual(einzel.abstand);
    const cell = (m: string, b: string) => m.includes(b);
    const mdEinzel = reportMarkdown(einzel, input({ form: "einzel" }));
    const mdPakete = reportMarkdown(pakete, input({ form: "pakete" }));
    const mdAbo = reportMarkdown(abo, input({ form: "abo" }));
    expect(cell(mdEinzel, "| Einstieg |") && cell(mdEinzel, "| Premium |")).toBe(true);
    expect(cell(mdPakete, "| Basis |") && cell(mdPakete, "| Standard |") && cell(mdPakete, "| Komplett |")).toBe(true);
    expect(mdAbo).toContain("pro Monat");
    expect(mdPakete).not.toContain("pro Monat");
  });
  it("beim Abo hängt «pro Monat» am Preis, ohne dass der Betrag sich ändert", () => {
    const doc = toDocument(rechnen(input({ form: "abo" })), input({ form: "abo" }));
    const md = toMarkdown(doc);
    expect(md).toContain("Preis pro Monat");
    expect(md).toContain("zu CHF 3'000.- pro Monat");
  });
});

describe("angebotsarchitektur: Prüfung der Eingaben", () => {
  it("eine vollständige Eingabe ist in Ordnung", () => {
    expect(validate(form(), { firma: "Malerei Keller" })).toBeNull();
  });
  it("ohne Firma geht es nicht los", () => {
    expect(validate(form(), {})).toBe("Gib den Namen deines Betriebs an.");
    expect(validate(form(), { firma: "   " })).toBe("Gib den Namen deines Betriebs an.");
  });
  it("ohne Leistung geht es nicht los; Zeilen ohne Angaben werden übersprungen", () => {
    expect(validateStruktur(form({ leistungen: [row("l1", "", "", "", "0"), row("l2", "", "", "", "")] }))).toBe("Trag mindestens eine Leistung ein.");
    const mit = form({ leistungen: [row("l1", "", "", "", "0"), row("l2", "Fassade streichen", "1250", "8", "150"), row("l3", "", "", "", "")] });
    expect(validateStruktur(mit)).toBeNull();
    expect(toInput(mit, { firma: "X" })?.leistungen).toHaveLength(1);
  });
  it("mehr als sechs Leistungen sind zu viele", () => {
    const sieben = Array.from({ length: 7 }, (_, i) => row(`l${i + 1}`, `Leistung Nummer ${i + 1}`, String(1000 + i * 100)));
    expect(validateStruktur(form({ leistungen: sieben }))).toBe("Mehr als sechs Leistungen sind zu viele: Nimm die wichtigsten sechs.");
    expect(validateStruktur(form({ leistungen: sieben.slice(0, 6) }))).toBeNull();
  });
  it("Preis über 0, mit der Nummer der Zeile in der Meldung", () => {
    const f = (preis: string) => form({ leistungen: [row("l1", "Fassade streichen", "1200"), row("l2", "Zimmer streichen", preis)] });
    for (const bad of ["0", "-5", "", "abc", "0.001"]) {
      expect(validateStruktur(f(bad))).toMatch(/^Leistung 2: Gib einen Preis über 0 an/);
    }
    expect(validateStruktur(f("0.05"))).toBeNull();
    expect(validateStruktur(f("10000001"))).toMatch(/^Leistung 2: Gib einen Preis/);
  });
  it("Name mit 3 bis 60 Zeichen", () => {
    const f = (name: string) => form({ leistungen: [row("l1", name, "1200")] });
    expect(validateStruktur(f("ab"))).toBe("Leistung 1: Der Name braucht 3 bis 60 Zeichen.");
    expect(validateStruktur(f("abc"))).toBeNull();
    expect(validateStruktur(f("a".repeat(60)))).toBeNull();
    expect(validateStruktur(f("a".repeat(61)))).toBe("Leistung 1: Der Name braucht 3 bis 60 Zeichen.");
    expect(validateStruktur(f("  a  b  "))).toBeNull(); // wird zu «a b», drei Zeichen
    expect(validateStruktur(f("  ab  "))).toBe("Leistung 1: Der Name braucht 3 bis 60 Zeichen.");
  });
  it("Aufwand ab 0 und Kosten ab 0", () => {
    const f = (aufwand: string, kosten: string) => form({ leistungen: [row("l1", "Fassade streichen", "1200", aufwand, kosten)] });
    expect(validateStruktur(f("0", "0"))).toBeNull();
    expect(validateStruktur(f("-1", "0"))).toMatch(/^Leistung 1: Gib den Aufwand/);
    expect(validateStruktur(f("", "0"))).toMatch(/^Leistung 1: Gib den Aufwand/);
    expect(validateStruktur(f("10001", "0"))).toMatch(/^Leistung 1: Gib den Aufwand/);
    expect(validateStruktur(f("2", "-3"))).toMatch(/^Leistung 1: Material und Fremdleistungen/);
    expect(validateStruktur(f("2", ""))).toBeNull(); // Kosten leer zählt als 0
  });
  it("gleiche Namen sind nicht erlaubt, auch nicht bei anderer Schreibung", () => {
    const f = form({ leistungen: [row("l1", "Fassade streichen", "1200"), row("l2", "  fassade   STREICHEN ", "2400")] });
    expect(validateStruktur(f)).toBe("Zwei Leistungen heissen «fassade STREICHEN». Gib jeder einen eigenen Namen.");
  });
  it("Stundensatz von 0 bis 500 (0 ist erlaubt), Zielmarge von 5 bis 90", () => {
    expect(validateStruktur(form({ satz: "0" }))).toBeNull();
    expect(validateStruktur(form({ satz: "500" }))).toBeNull();
    for (const bad of ["", "501", "-1", "viel"]) expect(validateStruktur(form({ satz: bad }))).toMatch(/^Der interne Stundensatz muss zwischen CHF 0\.- und CHF 500\.- liegen/);
    expect(validateStruktur(form({ zielmarge: "5" }))).toBeNull();
    expect(validateStruktur(form({ zielmarge: "90" }))).toBeNull();
    for (const bad of ["", "4.9", "91", "x"]) expect(validateStruktur(form({ zielmarge: bad }))).toBe("Die Zielmarge muss zwischen 5 % und 90 % liegen.");
  });
  it("der Kern muss in der Liste stehen", () => {
    expect(validateStruktur(form({ kern: "gibt-es-nicht" }))).toBe("Wähle deinen Kern aus der Liste der Leistungen.");
    expect(validateStruktur(form({ kern: "l1" }))).toBeNull();
    // eine leere Zeile ist keine Leistung
    const f = form({ leistungen: [row("l1", "Fassade streichen", "1200"), row("l2", "", "", "", "0")], kern: "l2" });
    expect(validateStruktur(f)).toBe("Wähle deinen Kern aus der Liste der Leistungen.");
  });
  it("drei verschiedene Leistungen für drei Stufen", () => {
    const msg = "Einstieg, Kern und Premium brauchen drei verschiedene Leistungen. Wähle für eine Stufe «Vorschlag», wenn dir eine fehlt.";
    expect(validateStruktur(form({ kern: "l2", einstiegId: "l2" }))).toBe(msg);
    expect(validateStruktur(form({ kern: "l2", premiumId: "l2" }))).toBe(msg);
    expect(validateStruktur(form({ kern: "l2", einstiegId: "l1", premiumId: "l1" }))).toBe(msg);
    expect(validateStruktur(form({ kern: "l2", einstiegId: "", premiumId: "" }))).toBeNull();
  });
  it("die Grenzen stehen in LIMITS", () => {
    expect(LIMITS.leistungen).toEqual({ min: 1, max: 6 });
    expect(LIMITS.satz).toEqual({ min: 0, max: 500 });
    expect(LIMITS.zielmarge).toEqual({ min: 5, max: 90, standard: 30 });
  });
});

describe("angebotsarchitektur: Zahlen lesen", () => {
  it("parseNumber liest Komma, Apostroph und Leerzeichen; leer ist null, Unsinn NaN", () => {
    expect(parseNumber("1250")).toBe(1250);
    expect(parseNumber("1'250,50")).toBe(1250.5);
    expect(parseNumber(" 12 500 ")).toBe(12500);
    expect(parseNumber(".5")).toBe(0.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber("abc")).toBeNaN();
    expect(parseNumber("1e5")).toBeNaN();
    expect(parseNumber("9".repeat(400))).toBeNaN();
  });
  it("toInput rundet: Rappen beim Preis, Viertelstunden beim Aufwand, leere Kosten sind 0", () => {
    const f = form({ leistungen: [row("l1", "  Fassade   streichen ", "1250,556", "0,3", "")], satz: "85.556" });
    const i = toInput(f, { firma: "  Malerei  Keller ", branche: "Malerei" });
    expect(i?.leistungen[0]).toEqual({ id: "l1", name: "Fassade streichen", preis: 1250.56, aufwand: 0.25, kosten: 0 });
    expect(i?.satz).toBe(85.56);
    expect(i?.firma).toBe("Malerei Keller");
    expect(toInput(form({ satz: "" }), { firma: "X" })).toBeNull();
  });
  it("toInput löst die Standardwerte auf: Kern in der Mitte, Einstieg und Premium nach Zielpreis", () => {
    const i = toInput(form(), { firma: "X" });
    expect(i).toMatchObject({ kernId: "l2", einstiegId: "l1", premiumId: "l3", form: "einzel", anker: false, zielmarge: 30 });
  });
});

describe("angebotsarchitektur: Dokument", () => {
  const i = input();
  const r = rechnen(i);
  const doc = toDocument(r, i);
  const md = toMarkdown(doc);

  it("Kopf mit Firma, Dateiname mit Firma, Untertitel mit den drei Preisen und der Faustregel", () => {
    expect(doc.firma).toBe("Malerei Keller, Gossau");
    expect(doc.filename).toBe("angebotsarchitektur-malerei-keller-gossau");
    expect(doc.subtitle).toBe("Einstieg CHF 1'500.-, Kern CHF 3'000.-, Premium CHF 6'400.-. Preisabstände: Faustregel von Alperna, keine Statistik.");
    expect(toDocument(r, { ...i, firma: "" }).firma).toBeUndefined();
  });
  it("die Tabelle hat sieben Spalten und drei Zeilen", () => {
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table?.type === "table" && table.header).toEqual(["Stufe", "Leistung", "Preis", "Aufwand", "Kosten", "Deckungsbeitrag", "Marge"]);
    expect(table?.type === "table" && table.rows).toEqual([
      ["Einstieg", "Zimmer auffrischen", "CHF 1'500.-", "9 h", "CHF 150.-", "CHF 585.-", "39 %"],
      ["Kern", "Wohnung streichen (3 Zimmer)", "CHF 3'000.-", "22 h", "CHF 500.-", "CHF 630.-", "21 %"],
      ["Premium", "Fassade Einfamilienhaus", "CHF 6'400.-", "36 h", "CHF 1'000.-", "CHF 2'340.-", "36,6 %"],
    ]);
  });
  it("Beträge im Schweizer Format: CHF 1'000.-, Prozent mit Leerzeichen und Komma", () => {
    expect(md).toContain("CHF 1'500.-");
    expect(md).toContain("CHF 6'400.-");
    expect(md).toContain("36,6 %");
    expect(md).not.toMatch(/\d%/);
    expect(md).not.toMatch(/CHF \d{4,}/);
  });
  it("Warnungen als Liste, «Was die Stufen unterscheidet», Preisabstände und Hinweise", () => {
    expect(md).toContain("## Warnungen");
    expect(md).toContain("- Kern «Wohnung streichen (3 Zimmer)»: Die Marge liegt bei 21 %");
    expect(md).toContain("## Was die Stufen unterscheidet");
    expect(md).toContain("- Einstieg: «Zimmer auffrischen» zu CHF 1'500.-");
    expect(md).toContain("## Preisabstände");
    expect(md).toContain(FAUSTREGEL_SATZ);
    expect(md).toContain("40 bis 60 %");
    expect(md).toContain("Kern / Einstieg 2,00");
    expect(md).toContain("Premium / Kern 2,13");
    expect(md).toContain("## Hinweise");
    for (const h of HINWEISE) expect(md).toContain(h);
    expect(HINWEISE).toHaveLength(3);
  });
  it("ohne Warnung steht ein Satz statt der Liste", () => {
    const ok = input({ zielmarge: 20 });
    const t = toMarkdown(toDocument(rechnen(ok), ok));
    expect(t).toContain("Keine Warnung: Alle drei Stufen erreichen deine Zielmarge von 20 %");
  });
  it("Vorschläge heissen im Dokument Vorschlag und tragen die Frage", () => {
    const e = input({ einstiegId: null });
    const t = toMarkdown(toDocument(rechnen(e), e));
    expect(t).toContain("| Einstieg | Vorschlag nach Faustregel |");
    expect(t).toContain("noch offen, Vorschlag nach Faustregel zu CHF 1'500.-. Was müsste dieses Angebot enthalten?");
  });
  it("reportMarkdown ist das Markdown des Dokuments", () => {
    expect(reportMarkdown(r, i)).toBe(md);
    expect(md.startsWith("# Angebotsarchitektur und Preisstrategie")).toBe(true);
  });
  it("nichts davon steht auf der Sperrliste, kein Ausrufezeichen, kein Gedankenstrich", () => {
    const alle = [
      md,
      toMarkdown(toDocument(rechnen(input({ anker: true, form: "abo", satz: 0, einstiegId: null, premiumId: "l1" })), input({ anker: true, form: "abo", satz: 0, einstiegId: null, premiumId: "l1" }))),
      ...FORMEN.flatMap((f) => [f.hinweis, f.beispiel]),
    ].join("\n");
    expect(brandHits(alle).filter((h) => h.level === "hart")).toEqual([]);
    expect(alle).not.toContain("!");
    expect(alle).not.toContain("—");
  });
  it("sagt nichts über rechtliche Vorgaben", () => {
    expect(md.toLowerCase()).not.toMatch(/gesetz|verordnung|pflicht|preisbekanntgabe|rechtlich/);
  });
});

describe("angebotsarchitektur: Eingabe fürs CRM", () => {
  it("eine Angabe je Zeile: Leistungen, Satz, Zielmarge, Kern, Stufen, Form, Anker", () => {
    expect(eingabeText(input())).toBe(
      [
        "Branche: Malerei",
        "Leistung 1: Zimmer auffrischen, Preis CHF 1'500.-, Aufwand 9 h, Material und Fremdleistungen CHF 150.-",
        "Leistung 2: Wohnung streichen (3 Zimmer), Preis CHF 3'000.-, Aufwand 22 h, Material und Fremdleistungen CHF 500.-",
        "Leistung 3: Fassade Einfamilienhaus, Preis CHF 6'400.-, Aufwand 36 h, Material und Fremdleistungen CHF 1'000.-",
        "Interner Stundensatz: CHF 85.-",
        "Zielmarge: 30 % vom Preis",
        "Kern: Wohnung streichen (3 Zimmer)",
        "Einstieg: Zimmer auffrischen",
        "Premium: Fassade Einfamilienhaus",
        "Form: Einzelleistungen",
        "Premium zuerst (Anker): nein",
      ].join("\n"),
    );
  });
  it("Vorschlag, Satz 0, Abo und Anker erscheinen im Klartext", () => {
    const t = eingabeText(input({ einstiegId: null, satz: 0, form: "abo", anker: true, branche: "" }));
    expect(t).not.toContain("Branche");
    expect(t).toContain("Einstieg: Vorschlag nach Faustregel");
    expect(t).toContain("Interner Stundensatz: CHF 0.- (Arbeitszeit nicht eingerechnet)");
    expect(t).toContain("Form: Abo oder Betreuung");
    expect(t).toContain("Premium zuerst (Anker): ja");
    expect(t).not.toMatch(/[{}[\]]/);
  });
  it("auch bei sechs Leistungen bleiben die Angaben unter dem Limit des Servers (1'900 Zeichen)", () => {
    const sechs = Array.from({ length: 6 }, (_, k) => L(`l${k + 1}`, "x".repeat(60), 1000 + k * 100, 12.25, 1234.5));
    expect(eingabeText(input({ leistungen: sechs, kernId: "l3", einstiegId: "l1", premiumId: "l6" })).length).toBeLessThan(1900);
  });
});

describe("angebotsarchitektur: gespeicherter Stand", () => {
  it("kaputte Daten ergeben den leeren Stand", () => {
    for (const bad of [null, undefined, "text", 42, [], {}, { v: 2 }, { v: 1, leistungen: "kaputt" }]) {
      const s = parseState(bad);
      expect(s.phase).toBe("edit");
      expect(s.output).toBeNull();
      expect(s.leistungen).toHaveLength(3);
      expect(s.zielmarge).toBe("30");
    }
    expect(parseState(null)).toEqual(EMPTY_STATE);
  });
  it("der leere Stand hat drei leere Zeilen, Zielmarge 30 und gilt nicht als erledigt", () => {
    const f = emptyForm();
    expect(f.leistungen.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    expect(f.leistungen.every(isEmptyRow)).toBe(true);
    expect(f).toMatchObject({ satz: "", zielmarge: "30", kern: "", form: "einzel", anker: false });
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });
  it("ein gültiges Ergebnis kommt zurück und wird neu gerechnet; veränderte Zahlen im Speicher gelten nicht", () => {
    const saved = { v: 1, phase: "result", ...form(), output: { stufen: { kern: { preis: 1 } } } };
    const s = parseState(JSON.parse(JSON.stringify(saved)));
    expect(s.phase).toBe("result");
    expect(s.output?.stufen.kern.preis).toBe(3000);
    expect(s.output?.stufen.kern.preisFuerZiel).toBe(3390);
    expect(s.output).toEqual(rechnen(toInput(form(), {})!));
  });
  it("das Ergebnis zählt im Pfad als erledigt, ein Entwurf nicht", () => {
    const done = parseState({ v: 1, phase: "result", ...form() });
    expect(isToolDone(JSON.stringify(done))).toBe(true);
    const draft = parseState({ v: 1, phase: "edit", ...form(), output: rechnen(toInput(form(), {})!) });
    expect(draft.output).toBeNull();
    expect(isToolDone(JSON.stringify(draft))).toBe(false);
  });
  it("phase «result» mit ungültigen Angaben fällt auf «edit» zurück, die Angaben bleiben", () => {
    const s = parseState({ v: 1, phase: "result", ...form({ satz: "viel" }) });
    expect(s.phase).toBe("edit");
    expect(s.output).toBeNull();
    expect(s.leistungen).toHaveLength(3);
    expect(s.satz).toBe("viel");
  });
  it("macht aus Unsinn brauchbare Zeilen: höchstens sechs, eindeutige Kennungen, Texte gekürzt", () => {
    const rows = Array.from({ length: 9 }, () => ({ id: "l1", name: "n".repeat(200), preis: 1250, aufwand: null, kosten: { a: 1 } }));
    const s = parseState({ v: 1, phase: "edit", leistungen: rows, satz: 85, zielmarge: 25 });
    expect(s.leistungen).toHaveLength(6);
    expect(new Set(s.leistungen.map((l) => l.id)).size).toBe(6);
    expect(s.leistungen[0]).toMatchObject({ id: "l1", preis: "1250", aufwand: "", kosten: "" });
    expect(s.leistungen[0].name).toHaveLength(60);
    expect(s.satz).toBe("85");
    expect(s.zielmarge).toBe("25");
  });
  it("Zeilen, die keine Objekte sind, fallen weg; ohne Zeile gilt der leere Entwurf", () => {
    expect(parseState({ v: 1, leistungen: [1, "x", null] }).leistungen).toHaveLength(3);
    expect(parseState({ v: 1, leistungen: [null, { name: "Fassade streichen", preis: "1200", aufwand: "2" }] }).leistungen).toMatchObject([{ name: "Fassade streichen", kosten: "0" }]);
  });
  it("unbekannte Kennungen für Kern, Einstieg und Premium werden bereinigt; «» bleibt als Vorschlag", () => {
    const s = parseState({ v: 1, phase: "edit", ...form({ kern: "weg", einstiegId: "weg", premiumId: "" }) });
    expect(s.kern).toBe("");
    expect(s.einstiegId).toBeUndefined();
    expect(s.premiumId).toBe("");
    expect(parseState({ v: 1, ...form({ kern: "l1", einstiegId: "l3" }) })).toMatchObject({ kern: "l1", einstiegId: "l3" });
  });
  it("unbekannte Form und Anker: Standardwerte", () => {
    const s = parseState({ v: 1, ...form(), form: "paket", anker: "ja" });
    expect(s.form).toBe("einzel");
    expect(s.anker).toBe(false);
    expect(parseState({ v: 1, ...form({ form: "abo", anker: true }) })).toMatchObject({ form: "abo", anker: true });
  });
  it("Rundlauf: formOf(parseState(...)) gibt das Formular zurück", () => {
    const f = form({ kern: "l1", einstiegId: "", premiumId: "l3", form: "pakete", anker: true });
    expect(formOf(parseState(JSON.parse(JSON.stringify({ v: 1, phase: "edit", output: null, ...f }))))).toEqual(f);
  });
  it("Kennungen: die kleinste freie", () => {
    expect(nextLeistungId([])).toBe("l1");
    expect(nextLeistungId([newLeistung("l1"), newLeistung("l3")])).toBe("l2");
    expect(nextLeistungId([newLeistung("l1"), newLeistung("l2"), newLeistung("l3")])).toBe("l4");
  });
});

describe("angebotsarchitektur: das Beispiel aus dem Seitentext (Malerei Keller, Gossau)", () => {
  it("Einstieg, Kern und Premium mit Deckungsbeitrag, Marge und genau einer Warnung", () => {
    const r = rechnen(toInput(form(), { firma: "Malerei Keller, Gossau" })!);
    expect(r.stufen.einstieg).toMatchObject({ preis: 1500, db: 585, margePct: 39 });
    expect(r.stufen.kern).toMatchObject({ preis: 3000, db: 630, margePct: 21, preisFuerZiel: 3390 });
    expect(r.stufen.premium).toMatchObject({ preis: 6400, db: 2340, margePct: 36.56 });
    expect(r.abstand).toMatchObject({ kernZuEinstieg: 2, premiumZuKern: 2.13 });
    expect(r.warnungen.map((w) => w.art)).toEqual(["marge"]);
  });
});
