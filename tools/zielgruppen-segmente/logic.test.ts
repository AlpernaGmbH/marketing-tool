import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import { sanitizeProfile } from "@/lib/profile";
import { isToolDone } from "@/lib/progress";
import { profilePatch as icpProfilePatch } from "@/tools/icp-builder/logic";
import {
  ADD_BUTTON_ID,
  DOC_TITLE,
  EINSCHAETZUNG_NOTE,
  EMPTY_STATE,
  FELDER,
  FELD_KEYS,
  FIRMA_FIELD_ID,
  HINWEISE,
  KANAELE,
  LIMITS,
  MATRIX,
  MAX_KANAELE,
  MAX_SEGMENTE,
  RECHNUNG,
  RICHTWERT_NOTE,
  SCHWELLE,
  SKALEN,
  attraktivitaet,
  ausgabeText,
  auswerten,
  botschaft,
  eingabeText,
  empfehlung,
  erreichbarkeit,
  feldId,
  feldOf,
  groesseNorm,
  istLeer,
  leeresSegment,
  legendeZeilen,
  matrixBeschriftung,
  matrixEingabe,
  matrixLayout,
  matrixSvg,
  neueId,
  parseGroesse,
  parseState,
  profilePatch,
  pruefeSegmente,
  segmenteTitel,
  stufeText,
  toDocument,
  typOf,
  validate,
  vorlage,
  type Auswertung,
  type Kontext,
  type Segment,
} from "./logic";

const seg = (id: string, name: string, p: Partial<Segment> = {}): Segment => ({
  ...leeresSegment(id, name),
  beduerfnis: "Fassade erneuern, ohne Stress",
  kaufmotiv: "Werterhalt",
  nutzen: "saubere Arbeit zum Fixpreis",
  groesse: "1000",
  kanaele: ["Website"],
  zahlung: 3,
  erreich: 3,
  wettbewerb: 3,
  ...p,
});

/** Das Beispiel aus content/tools/zielgruppen-segmente.md: Malerei Keller, Gossau. */
const KELLER: Segment[] = [
  seg("s1", "Hauseigentümer in Gossau", {
    beduerfnis: "Fassade und Innenräume erneuern, ohne Stress",
    kaufmotiv: "Werterhalt",
    nutzen: "saubere Arbeit zum Fixpreis",
    groesse: "1200",
    kanaele: ["Empfehlungen", "Website"],
    zahlung: 4,
    erreich: 4,
    wettbewerb: 3,
  }),
  seg("s2", "Hausverwaltungen in der Region", {
    beduerfnis: "Wohnungen schnell wieder vermieten",
    kaufmotiv: "Zeitersparnis",
    nutzen: "eine feste Ansprechperson und kurze Termine",
    groesse: "80",
    kanaele: ["Telefon und Gespräch", "LinkedIn"],
    zahlung: 5,
    erreich: 2,
    wettbewerb: 3,
  }),
  seg("s3", "Gewerbebetriebe in Gossau", {
    beduerfnis: "Räume günstig auffrischen, ohne den Betrieb zu stören",
    kaufmotiv: "Kosten im Griff",
    nutzen: "Arbeiten am Wochenende zum Festpreis",
    groesse: "300",
    kanaele: ["Google-Unternehmensprofil", "Aushang und Flyer"],
    zahlung: 2,
    erreich: 4,
    wettbewerb: 3,
  }),
];

const KONTEXT: Kontext = { firma: "Malerei Keller", branche: "Malerei", typ: "kmu" };

function ok(segmente: readonly Segment[]): Auswertung {
  const a = auswerten(segmente);
  if (!a) throw new Error("Auswertung scheitert: " + JSON.stringify(pruefeSegmente(segmente)));
  return a;
}

/**
 * Zwei oder mehr Segmente mit gleicher Grösse (Grösse 5), damit A nur von Zahlungsbereitschaft und Wettbewerbsdruck abhängt:
 * A = 50 bei z − w = −2, 58 bei −1, 67 bei 0, 75 bei +1, 83 bei +2, 100 bei +4; E = (erreich − 1) × 25.
 */
const mitAE = (id: string, name: string, z: number, w: number, e: number) => seg(id, name, { zahlung: z, wettbewerb: w, erreich: e });

const gutKopie = () => KELLER.map((s) => ({ ...s, kanaele: [...s.kanaele] }));

const REGELN: { name: string; aendere: (s: Segment) => Segment; message: string; feld: Parameters<typeof feldId>[1] }[] = [
  { name: "Name leer", aendere: (s) => ({ ...s, name: "" }), message: "Segment 1: Gib einen Namen an.", feld: "name" },
  { name: "Name zu kurz", aendere: (s) => ({ ...s, name: "ab" }), message: "Segment 1: Der Name braucht mindestens 3 Zeichen.", feld: "name" },
  { name: "Name zu lang", aendere: (s) => ({ ...s, name: "x".repeat(61) }), message: "Segment 1: Der Name darf höchstens 60 Zeichen haben.", feld: "name" },
  { name: "Bedürfnis leer", aendere: (s) => ({ ...s, beduerfnis: " " }), message: "Segment 1: Beschreibe das Hauptbedürfnis.", feld: "beduerfnis" },
  { name: "Bedürfnis zu kurz", aendere: (s) => ({ ...s, beduerfnis: "Ruhe" }), message: "Segment 1: Das Hauptbedürfnis braucht mindestens 5 Zeichen.", feld: "beduerfnis" },
  { name: "Bedürfnis zu lang", aendere: (s) => ({ ...s, beduerfnis: "x".repeat(121) }), message: "Segment 1: Das Hauptbedürfnis darf höchstens 120 Zeichen haben.", feld: "beduerfnis" },
  { name: "Kaufmotiv leer", aendere: (s) => ({ ...s, kaufmotiv: "" }), message: "Segment 1: Beschreibe das Kaufmotiv.", feld: "kaufmotiv" },
  { name: "Kaufmotiv zu kurz", aendere: (s) => ({ ...s, kaufmotiv: "Ruf" }), message: "Segment 1: Das Kaufmotiv braucht mindestens 5 Zeichen.", feld: "kaufmotiv" },
  { name: "Nutzen leer", aendere: (s) => ({ ...s, nutzen: "" }), message: "Segment 1: Beschreibe den Nutzen, den du bietest.", feld: "nutzen" },
  { name: "Nutzen zu lang", aendere: (s) => ({ ...s, nutzen: "x".repeat(121) }), message: "Segment 1: Der Nutzen darf höchstens 120 Zeichen haben.", feld: "nutzen" },
  { name: "Grösse leer", aendere: (s) => ({ ...s, groesse: "" }), message: "Segment 1: Schätze, wie viele mögliche Kundinnen und Kunden das Segment hat.", feld: "groesse" },
  { name: "Grösse null", aendere: (s) => ({ ...s, groesse: "0" }), message: "Segment 1: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.", feld: "groesse" },
  { name: "Grösse negativ", aendere: (s) => ({ ...s, groesse: "-5" }), message: "Segment 1: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.", feld: "groesse" },
  { name: "Grösse mit Komma", aendere: (s) => ({ ...s, groesse: "12.5" }), message: "Segment 1: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.", feld: "groesse" },
  { name: "Grösse zu gross", aendere: (s) => ({ ...s, groesse: "10000001" }), message: "Segment 1: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.", feld: "groesse" },
  { name: "Grösse Text", aendere: (s) => ({ ...s, groesse: "viele" }), message: "Segment 1: Die Grösse ist eine ganze Zahl von 1 bis 10'000'000.", feld: "groesse" },
  {
    name: "fünf Kanäle",
    aendere: (s) => ({ ...s, kanaele: ["Website", "Instagram", "Facebook", "LinkedIn", "WhatsApp"] }),
    message: "Segment 1: Wähle höchstens vier Kanäle.",
    feld: "kanaele",
  },
  { name: "unbekannter Kanal", aendere: (s) => ({ ...s, kanaele: ["Brieftaube" as never] }), message: "Segment 1: Wähle die Kanäle aus der Liste.", feld: "kanaele" },
  { name: "Einwand zu lang", aendere: (s) => ({ ...s, einwand: "x".repeat(121) }), message: "Segment 1: Der Einwand darf höchstens 120 Zeichen haben.", feld: "einwand" },
  { name: "Zahlungsbereitschaft fehlt", aendere: (s) => ({ ...s, zahlung: 0 }), message: "Segment 1: Wähle die Zahlungsbereitschaft von 1 bis 5.", feld: "zahlung" },
  { name: "Erreichbarkeit fehlt", aendere: (s) => ({ ...s, erreich: 0 }), message: "Segment 1: Wähle die Erreichbarkeit von 1 bis 5.", feld: "erreich" },
  { name: "Wettbewerbsdruck fehlt", aendere: (s) => ({ ...s, wettbewerb: 0 }), message: "Segment 1: Wähle den Wettbewerbsdruck von 1 bis 5.", feld: "wettbewerb" },
  { name: "Skala 6", aendere: (s) => ({ ...s, zahlung: 6 }), message: "Segment 1: Die Zahlungsbereitschaft geht von 1 bis 5.", feld: "zahlung" },
  { name: "Skala 2,5", aendere: (s) => ({ ...s, wettbewerb: 2.5 }), message: "Segment 1: Der Wettbewerbsdruck geht von 1 bis 5.", feld: "wettbewerb" },
];

describe("zielgruppen-segmente: Grösse normieren", () => {
  it("setzt bei einem Segment 3, weil nichts zu vergleichen ist", () => {
    expect(groesseNorm(500, 500, 1)).toBe(3);
    expect(groesseNorm(1, 1, 1)).toBe(3);
  });
  it("gibt gleich grossen Segmenten den Wert 5", () => {
    const a = ok([seg("s1", "Alpha"), seg("s2", "Beta")]);
    expect(a.segmente.map((s) => s.g)).toEqual([5, 5]);
  });
  it("rechnet 1 + 4 × (Grösse / grösste Schätzung)", () => {
    expect(groesseNorm(80, 1200, 3)).toBeCloseTo(1.266667, 5);
    expect(groesseNorm(300, 1200, 3)).toBe(2);
    expect(groesseNorm(600, 1200, 2)).toBe(3);
    expect(groesseNorm(1200, 1200, 3)).toBe(5);
  });
  it("hält extreme Unterschiede im Bereich 1 bis 5", () => {
    const klein = groesseNorm(1, 10_000_000, 2);
    expect(klein).toBeGreaterThanOrEqual(1);
    expect(klein).toBeLessThan(1.0001);
    expect(groesseNorm(10_000_000, 10_000_000, 2)).toBe(5);
  });
  it("fällt bei ungültigen Werten auf 3 zurück und kappt Werte über dem Maximum", () => {
    expect(groesseNorm(5, 0, 3)).toBe(3);
    expect(groesseNorm(Number.NaN, 10, 3)).toBe(3);
    expect(groesseNorm(5, Number.NaN, 3)).toBe(3);
    expect(groesseNorm(50, 10, 3)).toBe(5);
    expect(groesseNorm(-5, 10, 3)).toBe(1);
  });
});

describe("zielgruppen-segmente: Attraktivität und Erreichbarkeit", () => {
  it("liefert an den Rändern 0 und 100", () => {
    expect(attraktivitaet(1, 1, 5)).toBe(0);
    expect(attraktivitaet(5, 5, 1)).toBe(100);
    expect(erreichbarkeit(1)).toBe(0);
    expect(erreichbarkeit(5)).toBe(100);
  });
  it("liefert in der Mitte 50", () => {
    expect(attraktivitaet(3, 3, 3)).toBe(50);
    expect(erreichbarkeit(3)).toBe(50);
  });
  it("rechnet die Erreichbarkeit in Viertelschritten", () => {
    expect([1, 2, 3, 4, 5].map(erreichbarkeit)).toEqual([0, 25, 50, 75, 100]);
  });
  it("kehrt den Wettbewerbsdruck um (6 minus Wert) und rundet auf ganze Zahlen", () => {
    expect(attraktivitaet(3, 3, 1)).toBeGreaterThan(attraktivitaet(3, 3, 5));
    expect(attraktivitaet(2, 3, 4)).toBe(33); // 33,33
    expect(attraktivitaet(1.266667, 5, 3)).toBe(52); // 52,22
    expect(Number.isInteger(attraktivitaet(2.5, 3, 3))).toBe(true);
  });
  it("bleibt bei Werten ausserhalb der Skala zwischen 0 und 100", () => {
    expect(attraktivitaet(0, 0, 9)).toBe(0);
    expect(attraktivitaet(9, 9, 0)).toBe(100);
    expect(erreichbarkeit(0)).toBe(0);
    expect(erreichbarkeit(9)).toBe(100);
  });
  it("gewichtet Grösse, Zahlungsbereitschaft und Wettbewerbsdruck gleich", () => {
    const basis = attraktivitaet(3, 3, 3);
    // Jeder Teil um einen Punkt besser ergibt dieselbe Veränderung.
    expect(attraktivitaet(4, 3, 3) - basis).toBe(attraktivitaet(3, 4, 3) - basis);
    expect(attraktivitaet(3, 4, 3) - basis).toBe(attraktivitaet(3, 3, 2) - basis);
  });
});

describe("zielgruppen-segmente: Felder der Matrix", () => {
  it("ordnet die vier Felder zu", () => {
    expect(feldOf(80, 80)).toBe("zuerst");
    expect(feldOf(80, 20)).toBe("aufbauen");
    expect(feldOf(20, 80)).toBe("mitnehmen");
    expect(feldOf(20, 20)).toBe("vorerst");
  });
  it("zählt genau 50 als hoch", () => {
    expect(SCHWELLE).toBe(50);
    expect(feldOf(50, 50)).toBe("zuerst");
    expect(feldOf(49, 50)).toBe("mitnehmen");
    expect(feldOf(50, 49)).toBe("aufbauen");
    expect(feldOf(49, 49)).toBe("vorerst");
  });
  it("benennt die Felder wie im Auftrag", () => {
    expect(FELD_KEYS.map((k) => FELDER[k].titel)).toEqual(["Zuerst bearbeiten", "Aufbauen", "Mitnehmen", "Vorerst nicht"]);
  });
});

describe("zielgruppen-segmente: Auswertung und Empfehlung", () => {
  const a = ok(KELLER);

  it("rechnet das Beispiel Malerei Keller", () => {
    expect(a.segmente.map((s) => [s.nr, s.attraktivitaet, s.erreichbarkeit, s.feld])).toEqual([
      [1, 75, 75, "zuerst"],
      [2, 52, 25, "aufbauen"],
      [3, 33, 75, "mitnehmen"],
    ]);
    expect(a.groessterWert).toBe(1200);
    expect(a.rangfolge.map((s) => s.nr)).toEqual([1, 3, 2]);
    expect(a.segmente.map((s) => s.rang)).toEqual([1, 3, 2]);
  });
  it("empfiehlt Primär- und Sekundärsegment und nennt den Rest", () => {
    const e = a.empfehlung;
    expect(e.primaer?.name).toBe("Hauseigentümer in Gossau");
    expect(e.sekundaer?.name).toBe("Gewerbebetriebe in Gossau");
    expect(e.zurueck.map((s) => s.name)).toEqual(["Hausverwaltungen in der Region"]);
    expect(e.satz).toBe("Konzentriere dich zuerst auf «Hauseigentümer in Gossau»: Attraktivität 75, Erreichbarkeit 75. Es ist attraktiv, und du erreichst es gut.");
    expect(e.danach).toBe("Danach folgt «Gewerbebetriebe in Gossau» (Attraktivität 33, Erreichbarkeit 75).");
    expect(e.zurueckSatz).toBe("Vorerst nicht im Fokus: «Hausverwaltungen in der Region».");
    expect(e.text).toBe(`${e.satz} ${e.danach} ${e.zurueckSatz}`);
  });
  it("entscheidet bei Gleichstand des Mittelwerts mit der höheren Erreichbarkeit", () => {
    // X: A 50, E 100 (Mittel 75). Y: A 75, E 75 (Mittel 75). Gleichstand, X hat die höhere Erreichbarkeit.
    const r = ok([mitAE("s1", "Segment Y", 4, 3, 4), mitAE("s2", "Segment X", 3, 5, 5)]);
    const [y, x] = r.segmente;
    expect([y.attraktivitaet, y.erreichbarkeit, x.attraktivitaet, x.erreichbarkeit]).toEqual([75, 75, 50, 100]);
    expect(r.empfehlung.primaer?.name).toBe("Segment X");
    expect(r.empfehlung.sekundaer?.name).toBe("Segment Y");
  });
  it("entscheidet bei völligem Gleichstand mit der früheren Eingabe", () => {
    const r = ok([mitAE("s1", "Erstes", 4, 3, 4), mitAE("s2", "Zweites", 4, 3, 4)]);
    expect(r.empfehlung.primaer?.name).toBe("Erstes");
    expect(r.empfehlung.sekundaer?.name).toBe("Zweites");
    expect(r.segmente.map((s) => s.rang)).toEqual([1, 2]);
  });
  it("beschreibt bei einem einzigen Segment nur und verweist auf ein zweites", () => {
    const r = ok([KELLER[0]]);
    expect(r.segmente[0].g).toBe(3);
    expect(r.segmente[0].attraktivitaet).toBe(58); // (3 + 4 + 3) / 3 = 3,33 → 58,33
    expect(r.segmente[0].erreichbarkeit).toBe(75);
    expect(r.empfehlung.sekundaer).toBeNull();
    expect(r.empfehlung.zurueck).toEqual([]);
    expect(r.empfehlung.satz).toContain("Du hast ein Segment beschrieben");
    expect(r.empfehlung.satz).toContain("zweites Segment");
    expect(r.empfehlung.text).toBe(r.empfehlung.satz);
  });
  it("nennt bei nur «Vorerst nicht» kein Primärsegment, aber das nächste", () => {
    const r = ok([mitAE("s1", "Schwach", 1, 5, 1), mitAE("s2", "Etwas besser", 2, 5, 2)]);
    expect(r.segmente.every((s) => s.feld === "vorerst")).toBe(true);
    expect(r.empfehlung.primaer).toBeNull();
    expect(r.empfehlung.sekundaer).toBeNull();
    expect(r.empfehlung.satz).toContain("Kein Segment erreicht");
    expect(r.empfehlung.satz).toContain("«Etwas besser»");
    expect(r.empfehlung.zurueckSatz).toBe("");
    expect(r.empfehlung.zurueck).toHaveLength(2);
  });
  it("wählt kein Segment aus dem Feld «Vorerst nicht» als Primärsegment, auch wenn sein Mittelwert höher ist", () => {
    // Knapp: A 42, E 25 → Vorerst nicht, Mittel 33,5. Gegenstück: A 50, E 0 → Aufbauen, Mittel 25.
    const r = ok([mitAE("s1", "Knapp darunter", 2, 5, 2), mitAE("s2", "Aufbauen", 3, 5, 1)]);
    const [k, b] = r.segmente;
    expect([k.feld, b.feld]).toEqual(["vorerst", "aufbauen"]);
    expect(k.attraktivitaet + k.erreichbarkeit).toBeGreaterThan(b.attraktivitaet + b.erreichbarkeit);
    expect(r.empfehlung.primaer?.name).toBe("Aufbauen");
    expect(r.empfehlung.satz).toContain("Baue zuerst einen Weg dorthin");
    expect(r.empfehlung.zurueck.map((s) => s.name)).toEqual(["Knapp darunter"]);
  });
  it("lässt Segmente über dem Sekundärsegment unter «vorerst nicht im Fokus» stehen", () => {
    const r = ok([mitAE("s1", "Segment A", 5, 1, 5), mitAE("s2", "Segment B", 4, 2, 4), mitAE("s3", "Segment C", 4, 2, 3), mitAE("s4", "Segment D", 1, 5, 1)]);
    expect(r.empfehlung.primaer?.name).toBe("Segment A");
    expect(r.empfehlung.sekundaer?.name).toBe("Segment B");
    expect(r.empfehlung.zurueck.map((s) => s.name)).toEqual(["Segment C", "Segment D"]);
    expect(r.empfehlung.zurueckSatz).toBe("Vorerst nicht im Fokus: «Segment C», «Segment D».");
  });
  it("kennt für ein Primärsegment im Feld «Mitnehmen» einen eigenen Grund", () => {
    const r = ok([mitAE("s1", "Nebenbei", 2, 5, 5), mitAE("s2", "Schwach", 1, 5, 1)]);
    expect(r.empfehlung.primaer?.name).toBe("Nebenbei");
    expect(r.empfehlung.primaer?.feld).toBe("mitnehmen");
    expect(r.empfehlung.satz).toContain("weniger attraktiv");
  });
  it("stürzt bei einer leeren Rangfolge nicht ab", () => {
    const e = empfehlung([]);
    expect(e.primaer).toBeNull();
    expect(e.text).toBe("Beschreibe mindestens ein Segment.");
  });
});

describe("zielgruppen-segmente: Botschaft", () => {
  it("setzt den Satz aus Name, Hauptbedürfnis und Nutzen zusammen", () => {
    expect(botschaft({ name: "Hauseigentümer in Gossau", beduerfnis: "Fassade erneuern, ohne Stress", nutzen: "saubere Arbeit zum Fixpreis" })).toBe(
      "Für Hauseigentümer in Gossau mit dem Bedürfnis «Fassade erneuern, ohne Stress» bieten wir saubere Arbeit zum Fixpreis.",
    );
  });
  it("verdoppelt Satzzeichen am Ende der Eingaben nicht", () => {
    const b = botschaft({ name: "Eltern von Junioren.", beduerfnis: "Sichere Trainings!", nutzen: "Betreuung durch Fachleute…" });
    expect(b).toBe("Für Eltern von Junioren mit dem Bedürfnis «Sichere Trainings» bieten wir Betreuung durch Fachleute.");
    expect(b).not.toMatch(/[.!?…]{2}/);
    expect(botschaft({ name: "A", beduerfnis: "x;", nutzen: "y: " })).toBe("Für A mit dem Bedürfnis «x» bieten wir y.");
  });
  it("ändert Gross- und Kleinschreibung nicht und trimmt nur", () => {
    expect(botschaft({ name: "  kleine Betriebe  ", beduerfnis: "  schnelle Hilfe ", nutzen: "  einen festen Termin  " })).toBe(
      "Für kleine Betriebe mit dem Bedürfnis «schnelle Hilfe» bieten wir einen festen Termin.",
    );
  });
  it("macht aus Anführungszeichen im Bedürfnis einfache ‹ › und lässt «» nur um das Bedürfnis", () => {
    const b = botschaft({ name: "Kunden", beduerfnis: 'etwas "Besonderes" und «Echtes»', nutzen: "Beratung" });
    expect(b).toBe("Für Kunden mit dem Bedürfnis «etwas ‹Besonderes› und ‹Echtes›» bieten wir Beratung.");
    expect(b.match(/«/g)).toHaveLength(1);
    expect(b.match(/»/g)).toHaveLength(1);
    expect(b).not.toContain('"');
  });
  it("steht je Segment in der Auswertung", () => {
    const a = ok(KELLER);
    expect(a.segmente[1].botschaft).toBe(
      "Für Hausverwaltungen in der Region mit dem Bedürfnis «Wohnungen schnell wieder vermieten» bieten wir eine feste Ansprechperson und kurze Termine.",
    );
  });
});

describe("zielgruppen-segmente: matrixSvg", () => {
  const a = ok(KELLER);
  const eingabe = matrixEingabe(a);

  it("zeichnet einen Punkt je Segment, nummeriert 1 bis n", () => {
    const svg = matrixSvg(eingabe);
    expect(svg.match(/data-segment="/g)).toHaveLength(3);
    for (const n of [1, 2, 3]) expect(svg).toContain(`data-segment="${n}"`);
    const nummern = [...svg.matchAll(/data-segment="\d"><title>[^<]*<\/title>(?:<circle[^>]*data-fokus[^>]*\/>)*<circle[^>]*\/><text[^>]*>(\d)<\/text>/g)].map((m) => m[1]);
    expect(nummern).toEqual(["1", "2", "3"]);
  });
  it("hat role=img, aria-label mit allen Segmenten und die Beschreibung per ID", () => {
    const svg = matrixSvg(eingabe, "zs-lage");
    expect(svg).toMatch(/^<svg [^>]*role="img"/);
    expect(svg).toContain('aria-describedby="zs-lage"');
    const label = /aria-label="([^"]*)"/.exec(svg)?.[1] ?? "";
    expect(label).toContain("Vier-Felder-Matrix mit 3 Segmenten");
    expect(label).toContain("Waagrecht die Erreichbarkeit, senkrecht die Attraktivität");
    expect(label).toContain("Segment 1, Hauseigentümer in Gossau: Attraktivität 75, Erreichbarkeit 75, Feld Zuerst bearbeiten, Fokus");
    expect(label).toContain("Segment 3, Gewerbebetriebe in Gossau: Attraktivität 33, Erreichbarkeit 75, Feld Mitnehmen");
    expect(matrixSvg(eingabe)).not.toContain("aria-describedby");
    expect(matrixBeschriftung([{ nr: 1, name: "Einziges", attraktivitaet: 10, erreichbarkeit: 10 }])).toContain("mit 1 Segment.");
  });
  it("beschriftet die vier Felder und die beiden Achsen", () => {
    const svg = matrixSvg(eingabe);
    for (const k of FELD_KEYS) {
      expect(svg).toContain(`data-feld="${k}"`);
      expect(svg).toContain(`>${FELDER[k].titel}</text>`);
    }
    expect(svg).toContain(">Erreichbarkeit</text>");
    expect(svg).toContain(">Attraktivität</text>");
    expect(svg).toContain('transform="rotate(-90');
  });
  it("führt eine Legende mit den Namen der Segmente", () => {
    const svg = matrixSvg(eingabe);
    expect(svg.match(/data-legende="/g)).toHaveLength(3);
    expect(svg).toContain(">Hauseigentümer in Gossau (Fokus)</text>");
    expect(svg).toContain(">Hausverwaltungen in der Region</text>");
    expect(svg).toContain(">Gewerbebetriebe in Gossau</text>");
  });
  it("legt gleiche Werte nebeneinander statt übereinander", () => {
    const gleich = [1, 2, 3, 4].map((nr) => ({ nr, name: `S${nr}`, attraktivitaet: 70, erreichbarkeit: 70 }));
    const L = matrixLayout(gleich);
    expect(new Set(L.punkte.map((p) => `${p.cx}/${p.cy}`)).size).toBe(4);
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const d = Math.hypot(L.punkte[i].cx - L.punkte[j].cx, L.punkte[i].cy - L.punkte[j].cy);
        expect(d).toBeGreaterThanOrEqual(2 * MATRIX.r + 6);
      }
    }
    expect(L.punkte.every((p) => p.feld === "zuerst")).toBe(true);
  });
  it("hält auch knapp verschiedene Werte auseinander und jeden Punkt in seinem Feld (200 Zufallsfälle)", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const mitte = MATRIX.plot.x + MATRIX.plot.size / 2;
    const mitteY = MATRIX.plot.y + MATRIX.plot.size / 2;
    for (let n = 0; n < 200; n++) {
      const k = 2 + Math.floor(rnd() * 3);
      // Werte aus wenigen Stufen, damit viele Punkte (fast) gleich liegen
      const stufen = [0, 25, 49, 50, 51, 75, 100];
      const punkte = Array.from({ length: k }, (_, i) => ({
        nr: i + 1,
        name: `S${i + 1}`,
        attraktivitaet: stufen[Math.floor(rnd() * stufen.length)],
        erreichbarkeit: stufen[Math.floor(rnd() * stufen.length)],
      }));
      const L = matrixLayout(punkte);
      for (const p of L.punkte) {
        expect(p.cx > mitte).toBe(p.erreichbarkeit >= SCHWELLE);
        expect(p.cy < mitteY).toBe(p.attraktivitaet >= SCHWELLE);
        expect(p.cx).toBeGreaterThanOrEqual(MATRIX.plot.x + MATRIX.r);
        expect(p.cx).toBeLessThanOrEqual(MATRIX.plot.x + MATRIX.plot.size - MATRIX.r);
        expect(p.cy).toBeGreaterThanOrEqual(MATRIX.plot.y + MATRIX.r);
        expect(p.cy).toBeLessThanOrEqual(MATRIX.plot.y + MATRIX.plot.size - MATRIX.r);
      }
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          const d = Math.hypot(L.punkte[i].cx - L.punkte[j].cx, L.punkte[i].cy - L.punkte[j].cy);
          expect(d).toBeGreaterThanOrEqual(2 * MATRIX.r + 4);
        }
      }
    }
  });
  it("setzt den Wert 50 ins «hohe» Feld, nicht auf die Mittellinie", () => {
    const L = matrixLayout([{ nr: 1, name: "Grenze", attraktivitaet: 50, erreichbarkeit: 50 }]);
    const mitte = MATRIX.plot.x + MATRIX.plot.size / 2;
    expect(L.punkte[0].feld).toBe("zuerst");
    expect(L.punkte[0].cx - mitte).toBeGreaterThanOrEqual(MATRIX.inset);
    expect(MATRIX.plot.y + MATRIX.plot.size / 2 - L.punkte[0].cy).toBeGreaterThanOrEqual(MATRIX.inset);
  });
  it("erzeugt auch bei ungültigen Werten kein NaN, undefined oder Infinity", () => {
    const wirr = [
      { nr: 1, name: "A", attraktivitaet: Number.NaN, erreichbarkeit: Number.POSITIVE_INFINITY },
      { nr: 2, name: "B", attraktivitaet: -40, erreichbarkeit: 250 },
      { nr: 3, name: "", attraktivitaet: 0, erreichbarkeit: 0 },
    ];
    const svg = matrixSvg(wirr);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(matrixSvg([])).not.toMatch(/NaN|undefined|Infinity/);
    expect(matrixSvg([])).toContain('role="img"');
    expect(matrixSvg([])).toContain("mit 0 Segmenten");
  });
  it("maskiert Sonderzeichen in Namen", () => {
    const svg = matrixSvg([{ nr: 1, name: `<b>Tom & "Jerry"</b> 'x'`, attraktivitaet: 80, erreichbarkeit: 20 }]);
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;");
    expect(svg).toContain("&#39;x&#39;");
  });
  it("markiert höchstens ein Segment mit dem Gold-Rand und keines ohne Primärsegment", () => {
    const mit = matrixSvg(eingabe);
    expect(mit.match(/data-fokus="1"/g)).toHaveLength(2); // zwei Kreise: Gold und feine Linie
    expect(mit).toContain("stroke:var(--yellow,#ffd700)");
    const ohne = matrixSvg(eingabe.map((e) => ({ ...e, primaer: false })));
    expect(ohne).not.toContain("data-fokus");
    expect(ohne).not.toContain("--yellow");
  });
  it("nutzt nur Farben aus den Design-Tokens, ohne Verläufe", () => {
    const svg = matrixSvg(eingabe);
    expect(svg).not.toMatch(/gradient/i);
    const ohneTokens = svg.replace(/var\(--[a-z0-9-]+,[^)]*\)/g, "");
    expect(ohneTokens).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(ohneTokens).not.toMatch(/\brgba?\(/);
  });
  it("kürzt lange Namen in der Legende auf zwei Zeilen mit «…»", () => {
    const lang = "Selbständige Handwerker, Gewerbetreibende und Inhaber kleiner Familienbetriebe in der ganzen Region";
    const zeilen = legendeZeilen(lang);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[1].endsWith("…")).toBe(true);
    expect(zeilen.every((z) => z.length <= MATRIX.legendeZeichen)).toBe(true);
    expect(legendeZeilen("Kurz")).toEqual(["Kurz"]);
    expect(legendeZeilen("")).toEqual([]);
    expect(legendeZeilen("x".repeat(100))).toHaveLength(2);
  });
  it("gibt der Viewbox genug Höhe für die Legende", () => {
    const eins = matrixLayout([{ nr: 1, name: "A", attraktivitaet: 1, erreichbarkeit: 1 }]);
    const vier = matrixLayout([1, 2, 3, 4].map((nr) => ({ nr, name: `Segment ${nr}`, attraktivitaet: nr * 20, erreichbarkeit: nr * 20 })));
    expect(vier.height).toBeGreaterThan(eins.height);
    expect(vier.legende.at(-1)!.y + vier.legende.at(-1)!.hoehe).toBeLessThanOrEqual(vier.height);
  });
});

describe("zielgruppen-segmente: Prüfung", () => {
  const gut = gutKopie;

  it("lässt das Beispiel durch", () => {
    expect(validate("Malerei Keller", "kmu", gut())).toBeNull();
  });
  it("verlangt den Namen des Betriebs oder des Vereins", () => {
    expect(validate("", "kmu", gut())).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: FIRMA_FIELD_ID });
    expect(validate("   ", "verein", gut())).toEqual({ message: "Gib den Namen deines Vereins an.", fieldId: FIRMA_FIELD_ID });
    expect(validate(undefined, "kmu", gut())?.fieldId).toBe("zs-firma");
  });

  for (const r of REGELN) {
    it(`meldet: ${r.name}`, () => {
      const segmente = gut();
      segmente[0] = r.aendere(segmente[0]);
      const p = validate("Malerei Keller", "kmu", segmente);
      expect(p?.message).toBe(r.message);
      expect(p?.fieldId).toBe(feldId("s1", r.feld));
    });
  }

  it("zählt Segmente nach der Nummer im Formular und meldet das erste Problem zuerst", () => {
    const segmente = gut();
    segmente[1] = { ...segmente[1], nutzen: "" };
    segmente[2] = { ...segmente[2], name: "" };
    const p = validate("Malerei Keller", "kmu", segmente);
    expect(p).toEqual({ message: "Segment 2: Beschreibe den Nutzen, den du bietest.", fieldId: "zs-s2-nutzen" });
  });
  it("lehnt ein fünftes Segment ab", () => {
    const fuenf = [...gut(), seg("s4", "Viertes"), seg("s5", "Fünftes")];
    expect(MAX_SEGMENTE).toBe(4);
    const p = validate("Malerei Keller", "kmu", fuenf);
    expect(p).toEqual({ message: "Du kannst höchstens vier Segmente bewerten. Entferne eines, bevor du weitermachst.", fieldId: ADD_BUTTON_ID });
    expect(validate("Malerei Keller", "kmu", [...gut(), seg("s4", "Viertes")])).toBeNull();
  });
  it("erlaubt genau vier Kanäle", () => {
    expect(MAX_KANAELE).toBe(4);
    const segmente = gut();
    segmente[0] = { ...segmente[0], kanaele: ["Website", "Instagram", "Facebook", "LinkedIn"] };
    expect(validate("Malerei Keller", "kmu", segmente)).toBeNull();
  });
  it("lässt Kanäle und Einwand weg, wenn die Person sie nicht angibt", () => {
    const segmente = gut();
    segmente[0] = { ...segmente[0], kanaele: [], einwand: "" };
    expect(validate("Malerei Keller", "kmu", segmente)).toBeNull();
    const a = ok(segmente);
    expect(a.segmente[0].kanaele).toEqual([]);
    expect(a.segmente[0].einwand).toBe("");
  });
  it("verlangt für jedes Segment einen eigenen Namen, auch bei anderer Schreibweise", () => {
    const segmente = gut();
    segmente[1] = { ...segmente[1], name: "  HAUSEIGENTÜMER   in gossau " };
    expect(validate("Malerei Keller", "kmu", segmente)).toEqual({
      message: "Segment 2: Der Name ist schon vergeben. Gib jedem Segment einen eigenen Namen.",
      fieldId: "zs-s2-name",
    });
  });
  it("ignoriert völlig leere Segmente und meldet, wenn alle leer sind", () => {
    const mitLeerem = [leeresSegment("s1"), KELLER[0], leeresSegment("s3")];
    const p = pruefeSegmente(mitLeerem);
    expect(p.ok && p.segmente.map((s) => s.name)).toEqual(["Hauseigentümer in Gossau"]);
    expect(p.ok && p.ignoriert).toBe(2);
    expect(validate("Keller", "kmu", [leeresSegment("s1"), leeresSegment("s2")])).toEqual({ message: "Beschreibe mindestens ein Segment.", fieldId: "zs-s1-name" });
    expect(validate("Keller", "kmu", [])).toEqual({ message: "Beschreibe mindestens ein Segment.", fieldId: ADD_BUTTON_ID });
  });
  it("zählt ein Segment mit nur einer Angabe nicht mehr als leer", () => {
    const halb = { ...leeresSegment("s2"), zahlung: 3 };
    expect(istLeer(halb)).toBe(false);
    expect(istLeer(leeresSegment("s2"))).toBe(true);
    expect(istLeer({ ...leeresSegment("s2"), name: "   " })).toBe(true);
    expect(validate("Keller", "kmu", [KELLER[0], halb])?.message).toBe("Segment 2: Gib einen Namen an.");
  });
  it("bereinigt Leerraum in den Eingaben und liest die Grösse mit Tausendertrenner", () => {
    const p = pruefeSegmente([{ ...KELLER[0], name: "  Haus   eigentümer ", groesse: " 1'200 " }]);
    expect(p.ok && p.segmente[0].name).toBe("Haus eigentümer");
    expect(p.ok && p.segmente[0].groesse).toBe(1200);
    expect(parseGroesse("10000000")).toBe(10_000_000);
    expect(parseGroesse("1")).toBe(1);
    expect(parseGroesse(42)).toBe(42);
    expect(parseGroesse(1.5)).toBeNull();
    expect(parseGroesse("1e3")).toBeNull();
    expect(parseGroesse(undefined)).toBeNull();
  });
  it("hält die Grenzen aus dem Auftrag", () => {
    expect(LIMITS.name).toEqual({ min: 3, max: 60 });
    expect(LIMITS.text).toEqual({ min: 5, max: 120 });
    expect(LIMITS.einwand.max).toBe(120);
    expect(KANAELE).toHaveLength(12);
    expect(KANAELE).toContain("Google-Unternehmensprofil");
    expect(SKALEN.map((s) => s.label)).toEqual(["Zahlungsbereitschaft", "Erreichbarkeit", "Wettbewerbsdruck"]);
    expect(stufeText("zahlung", 4)).toBe("4 eher hoch");
    expect(stufeText("erreich", 1)).toBe("1 schwer");
    expect(stufeText("wettbewerb", 5)).toBe("5 hoch");
  });
});

describe("zielgruppen-segmente: Vorlage aus dem Profil", () => {
  it("startet mit zwei leeren Segmenten, wenn das Profil nichts enthält", () => {
    const v = vorlage({});
    expect(v).toHaveLength(2);
    expect(v.every(istLeer)).toBe(true);
    expect(v.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
  it("übernimmt die Namen der Zielgruppen, höchstens vier, ohne Doppelte und gekürzt", () => {
    const v = vorlage({
      zielgruppen: [{ name: "Eltern" }, { name: "eltern" }, { name: "Sponsoren" }, { name: "x".repeat(100) }, { name: "Mitglieder" }, { name: "Helfer" }],
    });
    expect(v.map((s) => s.name)).toEqual(["Eltern", "Sponsoren", "x".repeat(60), "Mitglieder"]);
  });
  it("nimmt das Primärsegment, wenn es keine Zielgruppen gibt, und füllt auf zwei auf", () => {
    const v = vorlage({ primaersegment: "Hauseigentümer in Gossau" });
    expect(v.map((s) => s.name)).toEqual(["Hauseigentümer in Gossau", ""]);
    expect(vorlage({ zielgruppen: [{ name: "Eltern" }], primaersegment: "Sponsoren" }).map((s) => s.name)).toEqual(["Eltern", ""]);
  });
  it("vergibt neue IDs ohne Wiederholung", () => {
    expect(neueId([])).toBe("s1");
    expect(neueId([{ id: "s1" }, { id: "s3" }])).toBe("s4");
    expect(neueId([{ id: "x" }])).toBe("s1");
  });
  it("kennt den Typ aus dem Profil", () => {
    expect(typOf("verein")).toBe("verein");
    expect(typOf("kmu")).toBe("kmu");
    expect(typOf(undefined)).toBe("kmu");
    expect(segmenteTitel("verein")).toBe("Zielgruppen des Vereins");
    expect(segmenteTitel("kmu")).toBe("Deine Segmente");
  });
});

describe("zielgruppen-segmente: Profil schreiben", () => {
  const a = ok(KELLER);

  it("schreibt Segmente (Primärsegment zuerst) und Primärsegment in ein leeres Profil", () => {
    const patch = profilePatch({}, a);
    expect(patch.primaersegment).toBe("Hauseigentümer in Gossau");
    expect(patch.zielgruppen).toEqual([
      { name: "Hauseigentümer in Gossau", beschreibung: "Hauptbedürfnis: Fassade und Innenräume erneuern, ohne Stress. Kaufmotiv: Werterhalt." },
      { name: "Gewerbebetriebe in Gossau", beschreibung: "Hauptbedürfnis: Räume günstig auffrischen, ohne den Betrieb zu stören. Kaufmotiv: Kosten im Griff." },
      { name: "Hausverwaltungen in der Region", beschreibung: "Hauptbedürfnis: Wohnungen schnell wieder vermieten. Kaufmotiv: Zeitersparnis." },
    ]);
  });
  it("schreibt nur in leere Felder", () => {
    expect(profilePatch({ zielgruppen: [{ name: "Eltern" }] }, a)).toEqual({ primaersegment: "Hauseigentümer in Gossau" });
    expect(profilePatch({ primaersegment: "Sponsoren" }, a)).toHaveProperty("zielgruppen");
    expect(profilePatch({ primaersegment: "Sponsoren" }, a)).not.toHaveProperty("primaersegment");
    expect(profilePatch({ zielgruppen: [{ name: "Eltern" }], primaersegment: "Sponsoren" }, a)).toEqual({});
    expect(profilePatch({ primaersegment: "   " }, a)).toHaveProperty("primaersegment");
    expect(profilePatch({ zielgruppen: [] }, a)).toHaveProperty("zielgruppen");
  });
  it("hat dieselbe Form wie der Patch des ICP-Builders", () => {
    const ours = profilePatch({}, a);
    const icp = icpProfilePatch({}, { segmentName: "Eigentümer", beschreibung: "Beschreibung" });
    expect(Object.keys(ours).sort()).toEqual(Object.keys(icp).sort());
    const eintrag = (ours.zielgruppen as Record<string, unknown>[])[0];
    const icpEintrag = (icp.zielgruppen as Record<string, unknown>[])[0];
    expect(Object.keys(eintrag).sort()).toEqual(Object.keys(icpEintrag).sort());
    expect(typeof eintrag.name).toBe("string");
    expect(typeof eintrag.beschreibung).toBe("string");
  });
  it("übersteht die Prüfung des Profils", () => {
    const profile = sanitizeProfile(profilePatch({}, a));
    expect(profile.zielgruppen).toHaveLength(3);
    expect(profile.primaersegment).toBe("Hauseigentümer in Gossau");
  });
  it("schreibt kein Primärsegment, wenn keines empfohlen wird", () => {
    const r = ok([mitAE("s1", "Schwach", 1, 5, 1), mitAE("s2", "Auch schwach", 1, 5, 2)]);
    const patch = profilePatch({}, r);
    expect(patch).not.toHaveProperty("primaersegment");
    expect(patch.zielgruppen).toHaveLength(2);
  });
  it("lässt Satzzeichen am Ende der Beschreibung nicht doppelt", () => {
    const r = ok([{ ...KELLER[0], beduerfnis: "Ruhe im Haus!", kaufmotiv: "Werterhalt." }, KELLER[1]]);
    expect((profilePatch({}, r).zielgruppen as { beschreibung: string }[])[0].beschreibung).toBe("Hauptbedürfnis: Ruhe im Haus. Kaufmotiv: Werterhalt.");
  });
});

describe("zielgruppen-segmente: gespeicherter Stand", () => {
  const ergebnis = () => ({ v: 1, phase: "result", segmente: KELLER });

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, 42, "text", [], { v: 2, phase: "result", segmente: KELLER }, {}, { v: "1" }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
    expect(EMPTY_STATE).toEqual({ v: 1, phase: "edit", segmente: [] });
  });
  it("behält ein gültiges Ergebnis und berechnet das Kurzergebnis neu", () => {
    const s = parseState({ ...ergebnis(), output: { primaer: "Erfunden" } });
    expect(s.phase).toBe("result");
    expect(s.segmente).toHaveLength(3);
    expect(s.output?.primaer).toBe("Hauseigentümer in Gossau");
    expect(s.output?.sekundaer).toBe("Gewerbebetriebe in Gossau");
    expect(s.output?.vorerstNicht).toEqual(["Hausverwaltungen in der Region"]);
    expect(s.output?.segmente[0]).toEqual({ name: "Hauseigentümer in Gossau", attraktivitaet: 75, erreichbarkeit: 75, feld: "zuerst" });
  });
  it("fällt auf «edit» zurück, wenn die Segmente das Ergebnis nicht tragen", () => {
    const kaputt = parseState({ v: 1, phase: "result", segmente: [{ ...KELLER[0], nutzen: "" }] });
    expect(kaputt.phase).toBe("edit");
    expect(kaputt.output).toBeUndefined();
    expect(kaputt.segmente).toHaveLength(1);
    expect(parseState({ v: 1, phase: "result", segmente: [] }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result" }).segmente).toEqual([]);
  });
  it("kürzt auf vier Segmente, filtert Kanäle und setzt ungültige Skalen auf 0", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      segmente: [
        { ...KELLER[0], kanaele: ["Website", "Brieftaube", "Instagram", "Facebook", "LinkedIn", "WhatsApp", "Website"], zahlung: 9, erreich: "x", wettbewerb: 2.5 },
        KELLER[1],
        KELLER[2],
        seg("s4", "Viertes"),
        seg("s5", "Fünftes"),
      ],
    });
    expect(s.segmente).toHaveLength(4);
    expect(s.segmente[0].kanaele).toEqual(["Website", "Instagram", "Facebook", "LinkedIn"]);
    expect([s.segmente[0].zahlung, s.segmente[0].erreich, s.segmente[0].wettbewerb]).toEqual([0, 0, 0]);
  });
  it("bereinigt IDs, Texte und die Grösse", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      segmente: [
        { id: "s1", name: "Eins\nZwei", groesse: 1200 },
        { id: "s1", name: 42, groesse: { x: 1 } },
        "kein Objekt",
        null,
        { id: "<script>", name: "Drei", groesse: "1'200", kanaele: "Website" },
      ],
    });
    expect(s.segmente.map((x) => x.id)).toEqual(["s1", "s2", "s3"]);
    expect(s.segmente[0].name).toBe("Eins Zwei");
    expect(s.segmente[0].groesse).toBe("1200");
    expect(s.segmente[1].name).toBe("");
    expect(s.segmente[1].groesse).toBe("");
    expect(s.segmente[2].kanaele).toEqual([]);
  });
  it("zählt im Pfad nur als erledigt, wenn die Phase «result» ist", () => {
    const fertig = parseState(ergebnis());
    expect(isToolDone(JSON.stringify(fertig))).toBe(true);
    expect(isToolDone(JSON.stringify({ ...fertig, phase: "edit" }))).toBe(false);
    expect(isToolDone(JSON.stringify(parseState(null)))).toBe(false);
  });
  it("übersteht einen Durchlauf durch JSON", () => {
    const s = parseState(ergebnis());
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe("zielgruppen-segmente: Texte fürs CRM", () => {
  const a = ok(KELLER);

  it("schreibt die Eingabe mit einer Zeile je Segment", () => {
    const text = eingabeText(KONTEXT, a);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Betrieb: Malerei Keller");
    expect(lines[1]).toBe("Branche: Malerei");
    expect(lines).toHaveLength(5);
    expect(lines[2]).toBe(
      "Segment 1: Hauseigentümer in Gossau; Bedürfnis: Fassade und Innenräume erneuern, ohne Stress; Kaufmotiv: Werterhalt; Nutzen: saubere Arbeit zum Fixpreis; Grösse: 1'200; Kanäle: Website, Empfehlungen; Einwand: keiner; Zahlungsbereitschaft 4 von 5, Erreichbarkeit 4 von 5, Wettbewerbsdruck 3 von 5",
    );
    expect(lines[3]).toContain("Segment 2: Hausverwaltungen in der Region;");
    expect(lines[3]).toContain("Grösse: 80;");
    expect(text).not.toMatch(/\[object|undefined|NaN|\{|\}/);
  });
  it("nennt bei Vereinen Verein und Tätigkeit und lässt eine leere Branche weg", () => {
    const verein = eingabeText({ firma: "FC Trogen", branche: "Fussball", typ: "verein" }, a).split("\n");
    expect(verein.slice(0, 2)).toEqual(["Verein: FC Trogen", "Tätigkeit: Fussball"]);
    const ohne = eingabeText({ firma: "FC Trogen", branche: "  ", typ: "verein" }, a).split("\n");
    expect(ohne[1].startsWith("Segment 1:")).toBe(true);
    expect(eingabeText({ firma: "", branche: "", typ: "kmu" }, a).split("\n")[0]).toBe("Betrieb: keine Angabe");
  });
  it("schreibt Kanäle und Einwand, wenn sie angegeben sind", () => {
    const mit = ok([{ ...KELLER[0], einwand: "Zu teuer" }, { ...KELLER[1], kanaele: [] }]);
    const lines = eingabeText(KONTEXT, mit).split("\n");
    expect(lines[2]).toContain("Einwand: Zu teuer;");
    expect(lines[3]).toContain("Kanäle: keine Angabe;");
  });
  it("gibt das Dokument als Markdown aus, mit Empfehlung vor den Details", () => {
    const md = ausgabeText(a, KONTEXT);
    expect(md.startsWith(`# ${DOC_TITLE}\n`)).toBe(true);
    expect(md.indexOf("## Empfehlung")).toBeLessThan(md.indexOf("## Die Segmente in der Matrix"));
    expect(md.indexOf("## Die Segmente in der Matrix")).toBeLessThan(md.indexOf("## Botschaft je Segment"));
    expect(md.indexOf("## Botschaft je Segment")).toBeLessThan(md.indexOf("## Deine Angaben"));
    expect(md).toBe(toMarkdown(toDocument(a, KONTEXT)));
  });
});

describe("zielgruppen-segmente: Dokument", () => {
  const a = ok(KELLER);
  const doc = toDocument(a, KONTEXT);

  it("hat Titel, Untertitel, Firma und Dateinamen", () => {
    expect(doc.title).toBe("Zielgruppen-Segmente");
    expect(doc.subtitle).toBe("Fokus: Hauseigentümer in Gossau");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("zielgruppen-segmente-malerei-keller");
    expect(toDocument(a, { firma: "", branche: "", typ: "kmu" }).firma).toBeUndefined();
    expect(toDocument(a, { firma: "", branche: "", typ: "kmu" }).filename).toBe("zielgruppen-segmente-betrieb");
  });
  it("beginnt mit den Eckdaten und der Empfehlung in einem Absatz", () => {
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller" },
        { label: "Branche", value: "Malerei" },
        { label: "Segmente", value: "3" },
      ],
    });
    expect(doc.blocks[1]).toEqual({ type: "heading", level: 1, text: "Empfehlung" });
    expect(doc.blocks[2]).toEqual({ type: "paragraph", text: a.empfehlung.text });
  });
  it("zeigt die Matrix als Tabelle: Segment, Attraktivität, Erreichbarkeit, Feld", () => {
    const tabelle = doc.blocks.find((b) => b.type === "table");
    expect(tabelle).toMatchObject({
      header: ["Segment", "Attraktivität", "Erreichbarkeit", "Feld"],
      rows: [
        ["1. Hauseigentümer in Gossau", "75", "75", "Zuerst bearbeiten"],
        ["2. Hausverwaltungen in der Region", "52", "25", "Aufbauen"],
        ["3. Gewerbebetriebe in Gossau", "33", "75", "Mitnehmen"],
      ],
    });
  });
  it("nennt die Botschaft je Segment in der Rangfolge", () => {
    const i = doc.blocks.findIndex((b) => b.type === "heading" && b.text === "Botschaft je Segment");
    const liste = doc.blocks[i + 1];
    expect(liste.type === "list" && liste.items).toHaveLength(3);
    expect(liste.type === "list" && liste.items[0]).toBe(a.rangfolge[0].botschaft);
    expect(liste.type === "list" && liste.items[1]).toBe(a.rangfolge[1].botschaft);
  });
  it("führt die Angaben je Segment mit den Skalen in Worten", () => {
    const i = doc.blocks.findIndex((b) => b.type === "heading" && b.text === "1. Hauseigentümer in Gossau");
    expect(i).toBeGreaterThan(-1);
    const facts = doc.blocks[i + 1];
    expect(facts.type).toBe("facts");
    const labels = facts.type === "facts" ? facts.items.map((f) => f.label) : [];
    expect(labels).toEqual(["Hauptbedürfnis", "Kaufmotiv", "Dein Nutzen", "Grösse (deine Schätzung)", "Kanäle", "Zahlungsbereitschaft (1 bis 5)", "Erreichbarkeit (1 bis 5)", "Wettbewerbsdruck (1 bis 5)"]);
    expect(facts.type === "facts" && facts.items.find((f) => f.label === "Zahlungsbereitschaft (1 bis 5)")?.value).toBe("4 eher hoch");
    expect(facts.type === "facts" && facts.items.find((f) => f.label === "Grösse (deine Schätzung)")?.value).toBe("1'200");
  });
  it("erklärt die Rechnung, kennzeichnet Einschätzung und Richtwert und hat drei Hinweise", () => {
    const md = toMarkdown(doc);
    expect(md).toContain(EINSCHAETZUNG_NOTE);
    expect(md).toContain(RICHTWERT_NOTE);
    for (const z of RECHNUNG) expect(md).toContain(z);
    expect(HINWEISE).toHaveLength(3);
    const i = doc.blocks.findIndex((b) => b.type === "heading" && b.text === "Hinweise");
    const liste = doc.blocks[i + 1];
    expect(liste).toMatchObject({ type: "list", ordered: true });
    expect(liste.type === "list" && liste.items).toEqual([...HINWEISE]);
    expect(md).toContain("Die Matrix zeigt Prioritäten, keine Garantien.");
  });
  it("beschreibt alle vier Felder im Dokument", () => {
    const md = toMarkdown(doc);
    for (const k of FELD_KEYS) expect(md).toContain(`${FELDER[k].titel} (${FELDER[k].lage})`);
  });
  it("kommt bei einem Segment ohne Matrix aus und verweist auf ein zweites", () => {
    const eins = toDocument(ok([KELLER[0]]), KONTEXT);
    const md = toMarkdown(eins);
    expect(md).toContain("## Das Segment im Überblick");
    expect(md).not.toContain("Die Segmente in der Matrix");
    expect(md).toContain("Mit einem Segment gibt es keine Matrix. Beschreibe ein zweites Segment");
    expect(eins.subtitle).toBe("Fokus: Hauseigentümer in Gossau");
    expect(eins.blocks[0]).toMatchObject({ items: [{ label: "Betrieb" }, { label: "Branche" }, { label: "Segmente", value: "1" }] });
  });
  it("spricht bei Vereinen von Verein, Tätigkeit und Zielgruppen und zeigt den Untertitel ohne Primärsegment", () => {
    const verein = toDocument(a, { firma: "FC Trogen", branche: "Fussball", typ: "verein" });
    expect(verein.blocks[0]).toMatchObject({ items: [{ label: "Verein" }, { label: "Tätigkeit" }, { label: "Zielgruppen" }] });
    const schwach = toDocument(ok([mitAE("s1", "Schwach", 1, 5, 1), mitAE("s2", "Auch", 1, 5, 2)]), KONTEXT);
    expect(schwach.subtitle).toBe("2 Segmente");
  });
  it("lässt den Einwand weg, wenn keiner angegeben ist, und nennt ihn sonst", () => {
    const md = toMarkdown(toDocument(ok([{ ...KELLER[0], einwand: "Zu teuer" }, KELLER[1]]), KONTEXT));
    expect(md.match(/Typischer Einwand/g)).toHaveLength(1);
    expect(md).toContain("**Typischer Einwand:** Zu teuer");
  });
  it("braucht für die Tabelle in A4 keine Spalte unter 1,5 Anteilen", () => {
    const tabelle = doc.blocks.find((b) => b.type === "table");
    const widths = tabelle?.type === "table" ? (tabelle.widths ?? []) : [];
    expect(widths).toHaveLength(4);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1.5);
  });
});

describe("zielgruppen-segmente: Ton und Sperrliste", () => {
  const a = ok(KELLER);
  const verboten = [/!/, /—/, /ß/, /["“”„]/, /\bjetzt\b/i, /\bnur noch\b/i, /\bgarantiert\b/i, /\bNr\.\s?1\b/];

  function alleTexte(): string[] {
    const eins = ok([KELLER[0]]);
    const schwach = ok([mitAE("s1", "Schwach", 1, 5, 1), mitAE("s2", "Auch", 1, 5, 2)]);
    const zuerst = ok([mitAE("s1", "Nebenbei", 2, 5, 5), mitAE("s2", "Schwach", 1, 5, 1)]);
    const texte: string[] = [
      ...FELD_KEYS.flatMap((k) => [FELDER[k].titel, FELDER[k].lage, FELDER[k].text]),
      ...SKALEN.flatMap((s) => [s.label, s.frage, ...s.stufen]),
      ...RECHNUNG,
      ...HINWEISE,
      segmenteTitel("kmu"),
      segmenteTitel("verein"),
    ];
    for (const r of [a, eins, schwach, zuerst]) {
      texte.push(r.empfehlung.text, ...r.segmente.map((s) => s.botschaft));
      texte.push(toMarkdown(toDocument(r, KONTEXT)), toMarkdown(toDocument(r, { firma: "FC Trogen", branche: "Fussball", typ: "verein" })));
      texte.push(eingabeText(KONTEXT, r), matrixBeschriftung(matrixEingabe(r)));
    }
    return texte;
  }

  it("enthält nichts von der Sperrliste und keine verbotenen Zeichen", () => {
    for (const t of alleTexte()) {
      expect(brandHits(t), t.slice(0, 80)).toEqual([]);
      for (const re of verboten) expect(t, `${re} in «${t.slice(0, 60)}»`).not.toMatch(re);
    }
  });
  it("hält auch die Meldungen der Prüfung frei von der Sperrliste", () => {
    const meldungen = REGELN.map((r) => {
      const segmente = gutKopie();
      segmente[0] = r.aendere(segmente[0]);
      return validate("Malerei Keller", "kmu", segmente)?.message ?? "";
    });
    meldungen.push(
      validate("", "kmu", gutKopie())?.message ?? "",
      validate("", "verein", gutKopie())?.message ?? "",
      validate("Keller", "kmu", [...gutKopie(), seg("s4", "Viertes"), seg("s5", "Fünftes")])?.message ?? "",
      validate("Keller", "kmu", [])?.message ?? "",
    );
    expect(meldungen.every((m) => m.length > 10)).toBe(true);
    for (const m of meldungen) {
      expect(brandHits(m), m).toEqual([]);
      for (const re of verboten) expect(m).not.toMatch(re);
    }
  });
  it("nennt jeden Richtwert als Richtwert von Alperna, keine Statistik", () => {
    expect(RICHTWERT_NOTE).toBe("Richtwert von Alperna, keine Statistik");
    expect(EINSCHAETZUNG_NOTE).toBe("Einschätzung, keine Statistik");
    expect(HINWEISE[0]).toContain(RICHTWERT_NOTE);
    expect(RECHNUNG[1]).toContain(RICHTWERT_NOTE); // gleiche Gewichte
    expect(RECHNUNG[3]).toContain(RICHTWERT_NOTE); // Grenze 50
  });
  it("hat im Seitentext dieselben Zahlen und Sätze wie die Rechnung", () => {
    const md = readFileSync(path.join(process.cwd(), "content/tools/zielgruppen-segmente.md"), "utf8");
    for (const s of a.segmente) {
      expect(md).toContain(`**${s.name}:** Attraktivität ${s.attraktivitaet}, Erreichbarkeit ${s.erreichbarkeit}, Feld «${FELDER[s.feld].titel}»`);
    }
    expect(md).toContain(a.empfehlung.text);
    expect(md).toContain(a.rangfolge[0].botschaft);
    expect(md).toContain("1'200 Hauseigentümer, 80 Hausverwaltungen, 300 Gewerbebetriebe");
  });
});
