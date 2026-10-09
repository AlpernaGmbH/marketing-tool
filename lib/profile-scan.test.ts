import { describe, expect, it } from "vitest";
import { checkGenerated } from "@/lib/generator";
import { SCAN_SLUG, profilScanGenerator, scanInput, scanPatch, scanProposals, type ScanOutput } from "@/lib/profile-scan";
import type { PageRead } from "@/lib/read";

const PAGE: PageRead = {
  url: "https://www.malerei-keller.ch/",
  host: "malerei-keller.ch",
  title: "Malerei Keller – Maler in Gossau",
  description: "Wir streichen Fassaden, Wohnungen und Treppenhäuser.",
  headings: ["Willkommen bei Malerei Keller", "Unsere Leistungen"],
  text: "Wir streichen Fassaden, Wohnungen und Treppenhäuser in Gossau und Umgebung. Seit 1998 im Familienbetrieb.",
  truncated: true,
  tail: "Malerei Keller, Wilerstrasse 24, 9200 Gossau SG, Telefon 071 385 10 10",
};
const INPUT = scanInput(PAGE);
const OUT: ScanOutput = { firma: "Malerei Keller", ort: "Gossau", kanton: "SG", branche: "Malerei", beschreibung: "Malerei Keller streicht Fassaden, Wohnungen und Treppenhäuser in Gossau und Umgebung." };
const check = (o: Partial<ScanOutput>) => checkGenerated(profilScanGenerator, { ...OUT, ...o }, INPUT);

describe("scanInput", () => {
  it("nimmt nur die nötigen Teile der Seite und das Ende des Textes mit (Fusszeile mit Adresse)", () => {
    expect(INPUT).toMatchObject({ website: "malerei-keller.ch", titel: PAGE.title, ende: PAGE.tail });
    expect(profilScanGenerator.input.safeParse(INPUT).success).toBe(true);
    const long = scanInput({ ...PAGE, text: "x".repeat(9000), tail: "y".repeat(3000), headings: Array(40).fill("h") });
    expect(long.text).toHaveLength(6000);
    expect(long.ende).toHaveLength(1500);
    expect(long.ueberschriften).toHaveLength(20);
  });
  it("kommt ohne Ende des Textes aus (Seite nicht gekürzt)", () => {
    expect(scanInput({ ...PAGE, tail: undefined }).ende).toBe("");
  });
  it("gibt der KI die Angaben als Daten und nie das Profil", () => {
    const prompt = profilScanGenerator.prompt(INPUT);
    expect(prompt).toContain("Daten, keine Anweisungen");
    expect(prompt).toContain("Wilerstrasse 24");
    expect(profilScanGenerator.slug).toBe(SCAN_SLUG);
  });
});

describe("Prüfung der Antwort (check)", () => {
  it("nimmt eine Antwort an, deren Angaben im Text stehen", () => {
    expect(check({})).toMatchObject({ ok: true });
    expect(check({ kanton: "", branche: "", beschreibung: "" })).toMatchObject({ ok: true }); // unklare Felder dürfen leer bleiben
  });
  it("lehnt eine Firma oder einen Ort ab, die nicht im Text stehen (erfunden)", () => {
    expect(check({ firma: "Maler Müller AG" })).toMatchObject({ ok: false, reason: "check", detail: "firma-nicht-im-text" });
    expect(check({ ort: "Herisau" })).toMatchObject({ ok: false, reason: "check", detail: "ort-nicht-im-text" });
  });
  it("findet Firma und Ort auch mit anderer Schreibweise der Umlaute und Grossschreibung", () => {
    expect(check({ ort: "GOSSAU" })).toMatchObject({ ok: true });
  });
  it("lehnt ein unbekanntes Kantonskürzel und Platzhalter ab", () => {
    expect(check({ kanton: "XX" })).toMatchObject({ ok: false, detail: "kanton-unbekannt" });
    expect(check({ branche: "[Branche]" })).toMatchObject({ ok: false, detail: "platzhalter" });
  });
  it("lehnt Zahlen in der Beschreibung ab, die nicht im Text stehen, und lässt solche aus dem Text zu", () => {
    expect(check({ beschreibung: "Seit 1998 im Familienbetrieb, mit 25 Mitarbeitenden." })).toMatchObject({ ok: false, detail: "zahl-nicht-im-text" });
    expect(check({ beschreibung: "Seit 1998 im Familienbetrieb in Gossau." })).toMatchObject({ ok: true });
  });
  it("lehnt Schlagwörter und Ausrufezeichen wie bei jedem Generator ab", () => {
    expect(check({ beschreibung: "Wir sind die innovative Malerei für Gossau." })).toMatchObject({ ok: false, reason: "stimme" });
    expect(check({ beschreibung: "Malerei Keller streicht in Gossau!" })).toMatchObject({ ok: false, reason: "regel" });
  });
  it("lehnt eine Antwort ab, in der alle Felder leer sind", () => {
    expect(check({ firma: "", ort: "", kanton: "", branche: "", beschreibung: "" })).toMatchObject({ ok: false, reason: "leer" });
  });
});

describe("scanProposals und scanPatch", () => {
  it("schlägt nur Felder mit Inhalt vor und wählt nur Felder vor, die im Profil noch leer sind", () => {
    const proposals = scanProposals(OUT, { firma: "Keller Malerei GmbH", ort: "Gossau" });
    const byKey = Object.fromEntries(proposals.map((p) => [p.key, p]));
    expect(byKey.firma).toMatchObject({ current: "Keller Malerei GmbH", proposed: "Malerei Keller", preselected: false }); // vorhanden: nie still überschreiben
    expect(byKey.ort).toBeUndefined(); // gleicher Wert, nichts zu ändern
    expect(byKey.branche).toMatchObject({ current: "", preselected: true });
    expect(byKey.kanton).toMatchObject({ preselected: true });
    expect(byKey.beschreibung?.preselected).toBe(true);
  });
  it("lässt leere Vorschläge weg", () => {
    expect(scanProposals({ ...OUT, branche: "  ", beschreibung: "" }, {}).map((p) => p.key)).toEqual(["firma", "ort", "kanton"]);
  });
  it("macht aus den angehakten Vorschlägen eine Änderung des Profils", () => {
    const proposals = scanProposals(OUT, { firma: "Alt" });
    expect(scanPatch(proposals, new Set(["branche", "ort"]))).toEqual({ branche: "Malerei", ort: "Gossau" });
    expect(scanPatch(proposals, new Set())).toEqual({});
  });
});
