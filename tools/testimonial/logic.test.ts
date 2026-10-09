import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { readToolContent } from "@/lib/content";
import { checkToolContent, countWords, styleIssues } from "@/lib/content-rules";
import { toMarkdown } from "@/lib/export/model";
import { isToolDone } from "@/lib/progress";
import {
  ANONYM_QUELLE,
  DEFAULT_FRAGEN,
  EMPTY_ANFRAGE,
  EMPTY_REFERENZ,
  EMPTY_STATE,
  ERSTER_SATZ_HINWEIS,
  FRAGEN,
  GEKUERZT_HINWEIS,
  LANG_HINWEIS,
  LUECKE,
  NACHFASSEN,
  NAME_HINWEIS,
  PRUEF_SCHLUSS,
  SEHR_KURZ_HINWEIS,
  TIPP,
  ZITAT_LANG,
  ZITAT_SEHR_KURZ,
  anfrageProblems,
  anonymisiere,
  ausgabeAnfrage,
  ausgabeReferenz,
  basisProblem,
  beitraegeOf,
  buildAnfrage,
  buildReferenz,
  charCount,
  cleanZitat,
  dankSatz,
  eingabeAnfrage,
  eingabeReferenz,
  ersterSatz,
  fallstudieBildschirm,
  fallstudieOf,
  floskelHinweise,
  freigabeFrage,
  hinweiseReferenz,
  hookOf,
  innerQuotes,
  kachelOf,
  kundeImTitel,
  kurzReferenz,
  leitfadenText,
  normalizeFragen,
  parseState,
  pruefliste,
  quelle,
  referenzProblems,
  satzForm,
  splitSaetze,
  validateAnfrage,
  validateReferenz,
  zitatAuswahl,
  zitatLaenge,
  zitatSaetze,
  type AnfrageInput,
  type Nennung,
  type ReferenzInput,
} from "./logic";
import config from "./tool.config";

// Weg 1: Nachricht für die Bitte um ein Zitat. Weg 2: Referenz aus dem Zitat. Fiktives Beispiel: Malerei Keller, Gossau.

const ZITAT =
  "Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag. Herr Keller hat erst die Feuchte im Putz gemessen, bevor er gestrichen hat. Ich würde die Malerei jederzeit weiterempfehlen.";
const MITTE = "Herr Keller hat erst die Feuchte im Putz gemessen, bevor er gestrichen hat.";

const KELLER: ReferenzInput = {
  zitat: ZITAT,
  ohne: [MITTE],
  nennung: "vorname-ort",
  name: "Regula",
  ortFirma: "Gossau",
  funktion: "",
  gemacht: "Fassadenanstrich an einem Einfamilienhaus",
  ausgangslage: "Die Fassade blätterte nach drei Wintern ab",
  getan: "Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen",
  ergebnis: "Die Fassade hält seit zwei Jahren",
  firma: "Malerei Keller",
};

const ANFRAGE: AnfrageInput = {
  anrede: "du",
  kanal: "whatsapp",
  vorname: "Regula",
  leistung: "den Anstrich der Fassade in Gossau",
  fragen: ["lage", "ueberzeugt", "veraendert"],
  freigabe: "vorname-ort",
  firma: "Malerei Keller",
};

const NENNUNGEN_ALLE: Nennung[] = ["vorname-ort", "voller-name", "name-firma", "anonym"];

describe("testimonial: Satzteilung", () => {
  it("teilt nach Punkt, Fragezeichen und Ausrufezeichen, wenn ein Grossbuchstabe folgt", () => {
    expect(splitSaetze("Wie schnell ging das? Erstaunlich schnell! Wirklich.")).toEqual(["Wie schnell ging das?", "Erstaunlich schnell!", "Wirklich."]);
    expect(splitSaetze("Test… Zweiter Satz.")).toEqual(["Test…", "Zweiter Satz."]);
  });

  it("teilt nicht nach Kürzeln: Dr., Nr., z. B., ca., St. Gallen", () => {
    expect(splitSaetze("Dr. Meier hat uns beraten. Das war Nr. 5 auf der Liste. Danke!")).toEqual([
      "Dr. Meier hat uns beraten.",
      "Das war Nr. 5 auf der Liste.",
      "Danke!",
    ]);
    expect(splitSaetze("Wir haben z. B. die Küche gemacht. Super Arbeit!")).toEqual(["Wir haben z. B. die Küche gemacht.", "Super Arbeit!"]);
    expect(splitSaetze("Es war in St. Gallen. Ca. 3 Wochen später kam die Rechnung.")).toEqual([
      "Es war in St. Gallen.",
      "Ca. 3 Wochen später kam die Rechnung.",
    ]);
  });

  it("teilt nicht nach Ordnungszahlen und Dezimalzahlen", () => {
    expect(splitSaetze("Am 5. Mai war alles fertig. Es dauerte 3.5 Wochen.")).toEqual(["Am 5. Mai war alles fertig.", "Es dauerte 3.5 Wochen."]);
  });

  it("behandelt Anführungszeichen im Zitat: gerade, deutsche und Guillemets", () => {
    expect(splitSaetze('Er sagte: "Das war top." Danach kam der Rest.')).toEqual(['Er sagte: "Das war top."', "Danach kam der Rest."]);
    expect(splitSaetze("„Das war top.“ Danach ging es weiter.")).toEqual(["„Das war top.“", "Danach ging es weiter."]);
    expect(splitSaetze("Sie sagte: «Top.» Danach ging es weiter.")).toEqual(["Sie sagte: «Top.»", "Danach ging es weiter."]);
  });

  it("liefert bei einem einzigen Satz einen Satz, auch ohne Schlusspunkt, und bei leerem Text nichts", () => {
    expect(splitSaetze("Nur ein Satz ohne Punkt")).toEqual(["Nur ein Satz ohne Punkt"]);
    expect(splitSaetze("Ein Satz.")).toEqual(["Ein Satz."]);
    expect(splitSaetze("")).toEqual([]);
    expect(zitatSaetze("   ")).toEqual([]);
  });

  it("teilt nicht vor Kleinbuchstaben (konservativ)", () => {
    expect(splitSaetze("super arbeit. danke vielmals. gerne wieder")).toEqual(["super arbeit. danke vielmals. gerne wieder"]);
  });

  it("ersterSatz nimmt den ersten Satz nach Bereinigung", () => {
    expect(ersterSatz("  Die Fassade   blätterte ab.\nDann kam Keller. ")).toBe("Die Fassade blätterte ab.");
    expect(ersterSatz("")).toBe("");
  });
});

describe("testimonial: Zitat wörtlich, Kürzung mit […]", () => {
  it("cleanZitat ändert nur Leerraum und äussere Anführungszeichen", () => {
    expect(cleanZitat("  Das war\n\n  top.  ")).toBe("Das war top.");
    expect(cleanZitat("«Das war top. Wirklich.»")).toBe("Das war top. Wirklich.");
    expect(cleanZitat('"Das war top."')).toBe("Das war top.");
    expect(cleanZitat("„Das war top.“")).toBe("Das war top.");
    // Mehrere Paare: nicht umschliessend, bleibt unverändert
    expect(cleanZitat('"Top." sagte er. "Sehr gut."')).toBe('"Top." sagte er. "Sehr gut."');
  });

  it("ändert im Zitat keine Wörter: kein ß-Tausch, kein Prozent-Umbau, Zeichen für Zeichen gleich", () => {
    const roh = "Die Straße war fertig. Wir sparten 20% der Kosten. Das war schön gemacht.";
    const a = zitatAuswahl(roh, []);
    expect(a.text).toBe(roh);
    expect(kachelOf({ ...KELLER, zitat: roh, ohne: [] }).zitat).toBe(`«${roh}»`);
    expect(a.text).toContain("Straße");
    expect(a.text).toContain("20%");
  });

  it("setzt […] nur zwischen zwei gezeigten, nicht benachbarten Sätzen", () => {
    const roh = "A eins. B zwei. C drei. D vier.";
    expect(zitatAuswahl(roh, []).text).toBe("A eins. B zwei. C drei. D vier.");
    expect(zitatAuswahl(roh, ["B zwei."]).text).toBe(`A eins. ${LUECKE} C drei. D vier.`);
    expect(zitatAuswahl(roh, ["B zwei.", "D vier."]).text).toBe(`A eins. ${LUECKE} C drei.`);
    // Zwei fehlende Sätze am Stück ergeben eine einzige Lücke
    expect(zitatAuswahl(roh, ["B zwei.", "C drei."]).text).toBe(`A eins. ${LUECKE} D vier.`);
  });

  it("setzt am Anfang und am Ende nie […], meldet die Kürzung aber", () => {
    const roh = "A eins. B zwei. C drei.";
    const a = zitatAuswahl(roh, ["A eins.", "C drei."]);
    expect(a.text).toBe("B zwei.");
    expect(a.gekuerzt).toBe(true);
    expect(a.gezeigt).toBe(1);
    expect(zitatAuswahl(roh, []).gekuerzt).toBe(false);
    expect(zitatAuswahl(roh, ["A eins."]).text).toBe("B zwei. C drei.");
  });

  it("ignoriert abgewählte Sätze, die es im Zitat nicht gibt, und zählt gleiche Sätze gemeinsam", () => {
    const a = zitatAuswahl("A eins. B zwei.", ["Gibt es nicht."]);
    expect(a.gewaehlt).toEqual([true, true]);
    expect(zitatAuswahl("Danke. Danke.", ["Danke."]).gezeigt).toBe(0);
  });

  it("setzt innere Anführungszeichen als ‹ ›, weil das Zitat in « » steht", () => {
    expect(innerQuotes('Er sagte "top" und «gut»')).toBe("Er sagte ‹top› und ‹gut›");
    expect(innerQuotes("Er sagte „top“.")).toBe("Er sagte ‹top›.");
    expect(innerQuotes('Ein Zoll: 5" Rohr')).toBe('Ein Zoll: 5" Rohr');
    expect(kachelOf({ ...KELLER, zitat: 'Er sagte: "Sehr gut." Danach ging es weiter.', ohne: [] }).zitat).toBe("«Er sagte: ‹Sehr gut.› Danach ging es weiter.»");
  });

  it("misst die Länge am gezeigten Text: sehr kurz unter 40, lang über 280 Zeichen", () => {
    const n = (k: number) => ({ plain: "a".repeat(k) });
    expect(zitatLaenge(n(ZITAT_SEHR_KURZ - 1))).toBe("sehr-kurz");
    expect(zitatLaenge(n(ZITAT_SEHR_KURZ))).toBe("ok");
    expect(zitatLaenge(n(ZITAT_LANG))).toBe("ok");
    expect(zitatLaenge(n(ZITAT_LANG + 1))).toBe("lang");
    expect(zitatLaenge(n(0))).toBe("ok");
  });
});

describe("testimonial: Nennung in Kachel, Beitrag und Fallstudie", () => {
  const eingabe = { name: "Regula Meier", ortFirma: "Keller AG", funktion: "" };

  it("nennt die Person je nach Freigabe: Vorname und Ort, voller Name, Name und Firma", () => {
    expect(quelle({ nennung: "vorname-ort", name: "Regula", ortFirma: "Gossau", funktion: "" })).toBe("Regula, Gossau");
    expect(quelle({ nennung: "voller-name", ...eingabe })).toBe("Regula Meier");
    expect(quelle({ nennung: "name-firma", ...eingabe })).toBe("Regula Meier, Keller AG");
    expect(quelle({ nennung: "vorname-ort", name: "Regula", ortFirma: "Gossau", funktion: "Hauseigentümerin" })).toBe("Regula, Hauseigentümerin, Gossau");
  });

  it("nennt bei «Ohne Namen» nie einen Namen, auch wenn die Felder noch gefüllt sind", () => {
    const r: ReferenzInput = { ...KELLER, nennung: "anonym", name: "Regula Meier", ortFirma: "Gossau", funktion: "Hauseigentümerin" };
    expect(quelle(r)).toBe(ANONYM_QUELLE);
    const res = buildReferenz(r);
    const alles = [res.kachel.text, res.linkedin, res.instagram, toMarkdown(res.dokument), res.dokument.title].join("\n");
    for (const wort of ["Regula", "Meier", "Hauseigentümerin"]) expect(alles).not.toContain(wort);
    expect(res.kachel.text).toBe(`${res.kachel.zitat}\n${ANONYM_QUELLE}`);
    expect(eingabeReferenz(r)).not.toContain("Regula");
    expect(ausgabeReferenz(r)).not.toContain("Regula");
    expect(dankSatz(r)).toBe("");
  });

  it("zeigt den Namen in der Kachel unter dem Zitat und im Dank-Satz", () => {
    const res = buildReferenz(KELLER);
    expect(res.kachel.quelle).toBe("Regula, Gossau");
    expect(res.kachel.text).toBe(`«Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag. ${LUECKE} Ich würde die Malerei jederzeit weiterempfehlen.»\nRegula, Gossau`);
    expect(dankSatz(KELLER)).toBe("Danke an Regula für das Vertrauen.");
    expect(res.linkedin.endsWith("Danke an Regula für das Vertrauen.")).toBe(true);
    expect(res.instagram.endsWith("Danke an Regula für das Vertrauen.")).toBe(true);
  });

  it("setzt bei vier Freigaben den passenden Namen in den Titel der Fallstudie", () => {
    expect(kundeImTitel({ nennung: "vorname-ort", name: "Regula", ortFirma: "Gossau" })).toBe("Regula aus Gossau");
    expect(kundeImTitel({ nennung: "voller-name", name: "Regula Meier", ortFirma: "Keller AG" })).toBe("Regula Meier");
    expect(kundeImTitel({ nennung: "name-firma", name: "Regula Meier", ortFirma: "Keller AG" })).toBe("Keller AG");
    expect(kundeImTitel({ nennung: "anonym", name: "Regula Meier", ortFirma: "Keller AG" })).toBe("unsere Kundschaft");
    for (const nennung of NENNUNGEN_ALLE) {
      const doc = fallstudieOf({ ...KELLER, nennung, name: "Regula Meier", ortFirma: "Keller AG" });
      expect(doc.title.startsWith("Fassadenanstrich an einem Einfamilienhaus für ")).toBe(true);
    }
  });

  it("lässt ohne Name einen Platzhalter stehen statt eine Person zu erfinden", () => {
    expect(quelle({ nennung: "voller-name", name: "", ortFirma: "", funktion: "" })).toBe("[Name]");
    expect(kundeImTitel({ nennung: "voller-name", name: "", ortFirma: "" })).toBe("[Name]");
  });
});

describe("testimonial: Kurz-Referenz", () => {
  it("besteht aus genau drei Sätzen in den Wörtern der Person", () => {
    const kurz = kurzReferenz(KELLER);
    expect(kurz).toEqual([
      "Die Fassade blätterte nach drei Wintern ab.",
      "Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen.",
      "Die Fassade hält seit zwei Jahren.",
    ]);
    expect(kurz.every((s) => splitSaetze(s).length === 1)).toBe(true);
  });

  it("lässt ohne Ergebnis den dritten Satz weg", () => {
    expect(kurzReferenz({ ...KELLER, ergebnis: "   " })).toHaveLength(2);
    expect(buildReferenz({ ...KELLER, ergebnis: "" }).kurz).toHaveLength(2);
  });

  it("passt nur Grossschreibung am Satzanfang, Schlusspunkt und Schweizer Schreibweise an", () => {
    expect(satzForm("die Fassade blätterte ab")).toBe("Die Fassade blätterte ab.");
    expect(satzForm("Wir haben gestrichen,")).toBe("Wir haben gestrichen.");
    expect(satzForm("Wie lange hält das?")).toBe("Wie lange hält das?");
    expect(satzForm("«top» gemacht")).toBe("«Top» gemacht.");
    expect(satzForm("Es war eine Straße")).toBe("Es war eine Strasse.");
    expect(satzForm("   ")).toBe("");
  });

  it("nimmt bei mehreren Sätzen in einer Angabe nur den ersten und sagt es", () => {
    const r = { ...KELLER, ausgangslage: "Die Fassade blätterte ab. Zwei Maler hatten nur übergestrichen." };
    expect(kurzReferenz(r)[0]).toBe("Die Fassade blätterte ab.");
    expect(hinweiseReferenz(r)).toContain(ERSTER_SATZ_HINWEIS);
    expect(hinweiseReferenz(KELLER)).not.toContain(ERSTER_SATZ_HINWEIS);
    // Die Fallstudie enthält alles
    expect(toMarkdown(fallstudieOf(r))).toContain("Zwei Maler hatten nur übergestrichen.");
  });
});

describe("testimonial: Beitrag und Fallstudie", () => {
  it("baut den LinkedIn-Beitrag aus Hook, Kurz-Referenz und Dank, den Instagram-Beitrag kürzer", () => {
    const b = beitraegeOf(KELLER);
    expect(b.linkedin).toBe(
      [
        "«Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag.»",
        "Die Fassade blätterte nach drei Wintern ab. Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen. Die Fassade hält seit zwei Jahren.",
        "Danke an Regula für das Vertrauen.",
      ].join("\n\n"),
    );
    expect(b.instagram).toBe(
      [
        "«Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag.»",
        "Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen. Die Fassade hält seit zwei Jahren.",
        "Danke an Regula für das Vertrauen.",
      ].join("\n\n"),
    );
    expect(charCount(b.instagram)).toBeLessThan(charCount(b.linkedin));
    expect(b.linkedin + b.instagram).not.toContain("#");
  });

  it("nimmt als Hook den ersten gezeigten Satz, auch wenn der erste Satz abgewählt ist", () => {
    expect(hookOf(KELLER)).toBe("«Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag.»");
    expect(hookOf({ ...KELLER, ohne: ["Die Fassade sieht nach zwei Wintern noch aus wie am ersten Tag."] })).toBe(`«${MITTE}»`);
    expect(hookOf({ zitat: "", ohne: [] })).toBe("");
    expect(beitraegeOf({ ...KELLER, zitat: "", ohne: [] }).linkedin.startsWith("«")).toBe(false);
  });

  it("baut die Fallstudie als Dokument: Titel, Zitat, Ausgangslage, Aufgabe, Vorgehen, Ergebnis, ganzes Zitat am Ende", () => {
    const doc = fallstudieOf(KELLER);
    expect(doc.title).toBe("Fassadenanstrich an einem Einfamilienhaus für Regula aus Gossau");
    expect(doc.subtitle).toBe("Fallstudie");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.blocks.map((b) => (b.type === "heading" ? `h:${b.text}` : b.type))).toEqual([
      "paragraph",
      "paragraph",
      "h:Ausgangslage",
      "paragraph",
      "h:Aufgabe",
      "paragraph",
      "h:Vorgehen",
      "paragraph",
      "h:Ergebnis",
      "paragraph",
      "h:Das Zitat im Wortlaut",
      "paragraph",
      "paragraph",
    ]);
    const texts = doc.blocks.filter((b) => b.type === "paragraph").map((b) => (b.type === "paragraph" ? b.text : ""));
    expect(texts[0]).toBe(kachelOf(KELLER).zitat);
    expect(texts[1]).toBe("Regula, Gossau");
    expect(texts[2]).toBe("Die Fassade blätterte nach drei Wintern ab.");
    expect(texts[3]).toBe("Fassadenanstrich an einem Einfamilienhaus");
    expect(texts[4]).toBe("Wir haben erst die Feuchte im Putz gemessen und dann neu gestrichen.");
    expect(texts[5]).toBe("Die Fassade hält seit zwei Jahren.");
    expect(texts[6]).toBe(`«${ZITAT}»`);
    expect(texts[7]).toBe("Regula, Gossau");
    expect(toMarkdown(doc)).toContain("# Fassadenanstrich an einem Einfamilienhaus für Regula aus Gossau");
  });

  it("lässt den Abschnitt «Ergebnis» weg, wenn keines angegeben ist, und den Namen aus dem Dateinamen", () => {
    const doc = fallstudieOf({ ...KELLER, ergebnis: "" });
    expect(doc.blocks.some((b) => b.type === "heading" && b.text === "Ergebnis")).toBe(false);
    expect(doc.filename).toBe("fallstudie-fassadenanstrich-an-einem-einfamilienhaus");
    expect(doc.filename).not.toMatch(/regula|gossau/);
    expect(fallstudieOf({ ...KELLER, firma: "  " }).firma).toBeUndefined();
  });
});

describe("testimonial: Prüfliste und Hinweise", () => {
  it("fragt nach Zustimmung, wörtlichem Zitat, belegtem Ergebnis, Foto und Frist und verweist auf eine Fachperson", () => {
    const liste = pruefliste(KELLER);
    expect(liste).toHaveLength(5);
    expect(liste[0]).toBe("Hat die Person der Veröffentlichung von Name, Foto und Firma zugestimmt?");
    expect(liste[1]).toMatch(/wörtlich.*Kürzung.*abgestimmt/);
    expect(liste[2]).toMatch(/Ergebnis.*Übertreibung.*belegen/);
    expect(liste[3]).toMatch(/Foto.*Zitat/);
    expect(liste[4]).toMatch(/bis wann.*entfernst/);
    for (const frage of liste) expect(frage.endsWith("?")).toBe(true);
    expect(PRUEF_SCHLUSS).toBe("Bei Zweifeln frag eine Fachperson.");
  });

  it("macht aus der Prüfliste keine Rechtsaussage: keine Paragrafen, keine Pflichten", () => {
    for (const r of [KELLER, { ...KELLER, nennung: "anonym" as const }, { ...KELLER, ergebnis: "" }]) {
      const text = [...pruefliste(r), PRUEF_SCHLUSS, ...hinweiseReferenz(r)].join("\n");
      expect(text).not.toMatch(/§|\bArt\.|\bmusst\b|\bmüssen\b|\bgesetz|\bpflicht|\bverboten|\bstrafbar|\bDSG\b|\bdatenschutz/i);
    }
  });

  it("ändert die erste Frage bei «Ohne Namen» und erinnert ohne Ergebnis an einen Beleg", () => {
    expect(pruefliste({ ...KELLER, nennung: "anonym" })[0]).toMatch(/ohne Namen.*verrät/);
    const ohne = pruefliste({ ...KELLER, ergebnis: "" });
    expect(ohne).toHaveLength(6);
    expect(ohne[5]).toMatch(/Ergebnis ergänzen.*belegen/);
  });

  it("meldet Floskeln nur in Ausgangslage, Getan und Ergebnis, nie im Zitat der Kundschaft", () => {
    const imZitat = { ...KELLER, zitat: "Eine ganzheitliche Lösung. Wir sind begeistert.", ohne: [] };
    expect(hinweiseReferenz(imZitat).filter((h) => h.includes("Floskel"))).toEqual([]);
    const imErgebnis = { ...KELLER, ergebnis: "Eine ganzheitliche Lösung für das Haus" };
    const hinweise = hinweiseReferenz(imErgebnis).filter((h) => h.includes("Floskel"));
    expect(hinweise).toHaveLength(1);
    expect(hinweise[0]).toContain("In «Ergebnis» steht «ganzheitlich», eine Floskel.");
    const ausgang = hinweiseReferenz({ ...KELLER, ausgangslage: "Ein innovatives Projekt" }).filter((h) => h.includes("Floskel"));
    expect(ausgang[0]).toContain("In «Ausgangslage»");
    expect(floskelHinweise([{ label: "X", text: "" }])).toEqual([]);
  });

  it("nennt «sehr kurz» und «lang» ohne Zahl", () => {
    const kurz = hinweiseReferenz({ ...KELLER, zitat: "Top gemacht.", ohne: [] });
    expect(kurz).toContain(SEHR_KURZ_HINWEIS);
    const lang = hinweiseReferenz({ ...KELLER, zitat: `${"Das war sehr gut gemacht. ".repeat(12)}`.trim().slice(0, 590), ohne: [] });
    expect(lang).toContain(LANG_HINWEIS);
    expect(SEHR_KURZ_HINWEIS).not.toMatch(/\d/);
    expect(LANG_HINWEIS).not.toMatch(/\d/);
    expect(hinweiseReferenz({ ...KELLER, ohne: [] })).not.toContain(SEHR_KURZ_HINWEIS);
    expect(hinweiseReferenz({ ...KELLER, ohne: [] })).not.toContain(LANG_HINWEIS);
  });

  it("meldet eine Kürzung und dass die Fallstudie das ganze Zitat zeigt", () => {
    const h = hinweiseReferenz(KELLER);
    expect(h[0]).toBe(GEKUERZT_HINWEIS);
    expect(h[1]).toMatch(/Fallstudie zeigt am Ende das ganze Zitat/);
    expect(hinweiseReferenz({ ...KELLER, ohne: [] })).not.toContain(GEKUERZT_HINWEIS);
  });

  it("fragt nach, wenn bei «Vorname und Ort» mehr als ein Wort im Namen steht", () => {
    expect(hinweiseReferenz({ ...KELLER, name: "Regula Meier" })).toContain(NAME_HINWEIS);
    expect(hinweiseReferenz({ ...KELLER, name: "Regula" })).not.toContain(NAME_HINWEIS);
    expect(hinweiseReferenz({ ...KELLER, name: "Regula Meier", nennung: "voller-name" })).not.toContain(NAME_HINWEIS);
  });
});

describe("testimonial: Weg 1, Leitfragen und Fassungen", () => {
  it("lässt zwei bis drei Leitfragen zu", () => {
    const mit = (fragen: string[]) => anfrageProblems({ ...EMPTY_ANFRAGE, vorname: "Regula", leistung: "den Anstrich", fragen: normalizeFragen(fragen) });
    expect(mit(["lage"]).map((p) => p.message)).toEqual(["Wähle mindestens zwei Leitfragen."]);
    expect(mit([])).toHaveLength(1);
    expect(mit(["lage", "zoegert"])).toEqual([]);
    expect(mit(["lage", "zoegert", "ueberrascht"])).toEqual([]);
    expect(mit(["lage", "zoegert", "ueberrascht", "veraendert"]).map((p) => p.message)).toEqual(["Wähle höchstens drei Leitfragen."]);
  });

  it("bereinigt die Auswahl der Leitfragen: bekannte Kennungen, einmal, in der Reihenfolge der Liste", () => {
    expect(normalizeFragen(["ueberrascht", "lage", "lage", "gibtesnicht", 3, null])).toEqual(["lage", "ueberrascht"]);
    expect(FRAGEN).toHaveLength(6);
    expect(DEFAULT_FRAGEN).toEqual(["lage", "ueberzeugt", "veraendert"]);
  });

  it("baut die Du-Fassung für WhatsApp mit Vorname, Dank, Leitfragen, Freigabe-Frage und Firma", () => {
    const kurz = buildAnfrage(ANFRAGE).fassungen.find((f) => f.id === "kurz")!;
    expect(kurz.text).toBe(
      [
        "Hallo Regula",
        "Danke für den Anstrich der Fassade in Gossau. Magst du mir in zwei, drei Sätzen schreiben, wie es für dich war? Diese Fragen helfen dir:",
        "1. Wie war die Lage, bevor wir angefangen haben?",
        "2. Was hat dich überzeugt, uns zu beauftragen?",
        "3. Was hat sich für dich verändert?",
        "Darf ich dein Zitat mit Vorname und Ort zeigen?",
        "Grüsse, Malerei Keller",
      ].join("\n"),
    );
    expect(kurz.label).toBe("Kurz, für WhatsApp");
  });

  it("baut die Sie-Fassung: Guten Tag, Sie-Formen und Sie-Fragen, nirgends «dich» oder «dein»", () => {
    const res = buildAnfrage({ ...ANFRAGE, anrede: "sie", vorname: "Frau Meier", fragen: ["ueberzeugt", "zoegert", "weiterempfehlen"] });
    for (const f of res.fassungen) {
      expect(f.text).toContain("Guten Tag Frau Meier");
      expect(f.text).not.toMatch(/\b(?:du|dich|dir|dein\w*|deine\w*)\b/i);
      expect(f.text).toContain("Ihr Zitat");
    }
    expect(res.fragen).toEqual(["Was hat Sie überzeugt, uns zu beauftragen?", "Was würden Sie jemandem sagen, der zögert?", "Würden Sie uns weiterempfehlen, und warum?"]);
    expect(res.fassungen[0].text).toContain("Mögen Sie mir");
  });

  it("baut die Du-Fassungen ohne «Sie» und «Ihr»", () => {
    for (const f of buildAnfrage(ANFRAGE).fassungen) expect(f.text).not.toMatch(/\bIhr\w*\b|\bSie\b/);
  });

  it("liefert drei Fassungen für WhatsApp und E-Mail und stellt die zum Weg passende nach vorn", () => {
    const wa = buildAnfrage(ANFRAGE);
    expect(wa.fassungen.map((f) => f.id)).toEqual(["kurz", "persoenlich", "foermlich"]);
    expect(wa.fassungen.map((f) => f.passend)).toEqual([true, false, false]);
    const mail = buildAnfrage({ ...ANFRAGE, kanal: "email" });
    expect(mail.fassungen.map((f) => f.id)).toEqual(["persoenlich", "kurz", "foermlich"]);
    expect(mail.fassungen.map((f) => f.passend)).toEqual([true, false, false]);
    expect(mail.fassungen[0].text.startsWith("Betreff: Darf ich dich um ein Zitat bitten?")).toBe(true);
    expect(mail.leitfaden).toBeNull();
  });

  it("liefert «Im Gespräch» als Leitfaden mit Einstieg, Leitfragen und Schluss, ohne Brief", () => {
    const g = buildAnfrage({ ...ANFRAGE, kanal: "gespraech", fragen: ["lage", "zoegert"] });
    expect(g.fassungen).toEqual([]);
    expect(g.leitfaden).not.toBeNull();
    expect(g.leitfaden!.einstieg).toBe(
      "Hallo Regula. Danke noch einmal für den Anstrich der Fassade in Gossau. Hast du kurz Zeit? Ich würde dir gern zwei Fragen stellen und deine Antworten wörtlich mitschreiben.",
    );
    expect(g.leitfaden!.fragen).toEqual(["Wie war die Lage, bevor wir angefangen haben?", "Was würdest du jemandem sagen, der zögert?"]);
    expect(g.leitfaden!.schluss).toBe("Danke. Ich lese dir vor, was ich notiert habe. Darf ich dein Zitat mit Vorname und Ort zeigen?");
    expect(leitfadenText(g.leitfaden!)).toContain("1. Wie war die Lage");
    expect(g.hinweise[1]).toMatch(/wörtlich mit/);
    const drei = buildAnfrage({ ...ANFRAGE, kanal: "gespraech" });
    expect(drei.leitfaden!.einstieg).toContain("drei Fragen stellen");
  });

  it("formuliert die Freigabe-Frage für vier Freigaben in Du und Sie", () => {
    expect(freigabeFrage("vorname-ort", "du")).toBe("Darf ich dein Zitat mit Vorname und Ort zeigen?");
    expect(freigabeFrage("voller-name", "du")).toBe("Darf ich dein Zitat mit deinem vollen Namen zeigen?");
    expect(freigabeFrage("name-firma", "du")).toBe("Darf ich dein Zitat mit deinem Namen und deiner Firma zeigen?");
    expect(freigabeFrage("anonym", "du")).toBe("Darf ich dein Zitat ohne Namen zeigen?");
    expect(freigabeFrage("vorname-ort", "sie")).toBe("Darf ich Ihr Zitat mit Vorname und Ort zeigen?");
    expect(freigabeFrage("voller-name", "sie")).toBe("Darf ich Ihr Zitat mit Ihrem vollen Namen zeigen?");
    expect(freigabeFrage("name-firma", "sie")).toBe("Darf ich Ihr Zitat mit Ihrem Namen und Ihrer Firma zeigen?");
    expect(freigabeFrage("anonym", "sie")).toBe("Darf ich Ihr Zitat ohne Namen zeigen?");
    for (const n of NENNUNGEN_ALLE) {
      const res = buildAnfrage({ ...ANFRAGE, freigabe: n });
      expect(res.freigabeFrage).toBe(freigabeFrage(n, "du"));
      for (const f of res.fassungen) expect(f.text).toContain(freigabeFrage(n, "du"));
    }
  });

  it("zählt die Zeichen jeder Fassung als Unicode-Zeichen", () => {
    const res = buildAnfrage({ ...ANFRAGE, firma: "Malerei Keller 🎨" });
    for (const f of res.fassungen) {
      expect(f.zeichen).toBe(Array.from(f.text).length);
      expect(f.zeichen).toBe(charCount(f.text));
    }
    const kurz = res.fassungen[0];
    expect(kurz.text.length).toBe(kurz.zeichen + 1); // das Emoji besteht aus zwei UTF-16-Einheiten
  });

  it("macht aus einer Leistung mit Schlusspunkt keinen doppelten Punkt und setzt Platzhalter statt Erfundenem", () => {
    const res = buildAnfrage({ ...ANFRAGE, leistung: "den Anstrich der Fassade.", firma: "  ", vorname: " " });
    expect(res.fassungen[0].text).toContain("Danke für den Anstrich der Fassade. Magst");
    expect(res.fassungen[0].text).not.toContain("..");
    expect(res.fassungen[0].text).toContain("Hallo [Vorname]");
    expect(res.fassungen[0].text.endsWith("Grüsse, [Firma]")).toBe(true);
    expect(buildAnfrage({ ...ANFRAGE, leistung: "" }).fassungen[0].text).toContain("Danke für [Auftrag].");
  });

  it("gibt Tipp, Wortlaut, Wo-zeigen-Hinweis und Nachfassen mit Richtwert und einen Nachfass-Satz", () => {
    const res = buildAnfrage(ANFRAGE);
    expect(res.hinweise[0]).toBe(TIPP);
    expect(res.hinweise).toContain(NACHFASSEN);
    expect(NACHFASSEN).toMatch(/etwa einer Woche.*ruhig.*Richtwert von Alperna, keine Statistik/);
    expect(res.hinweise.some((h) => h.includes("Website oder auf Social Media"))).toBe(true);
    expect(res.nachfass).toBe(
      "Hallo Regula, ich wollte kurz nachfragen, ob du Zeit für die Fragen gefunden hast. Falls es gerade nicht passt, ist das in Ordnung.",
    );
    expect(buildAnfrage({ ...ANFRAGE, anrede: "sie" }).nachfass).toContain("ob Sie Zeit für die Fragen gefunden haben");
  });

  it("baut gleiche Angaben immer zum gleichen Text", () => {
    expect(buildAnfrage(ANFRAGE)).toEqual(buildAnfrage({ ...ANFRAGE }));
    expect(buildReferenz(KELLER)).toEqual(buildReferenz({ ...KELLER }));
  });
});

describe("testimonial: Sperrliste und Schreibregeln", () => {
  it("hält über alle erzeugten Texte die Sperrliste und die Schreibregeln ein", () => {
    const texte: string[] = [];
    for (const anrede of ["du", "sie"] as const) {
      for (const kanal of ["whatsapp", "email", "gespraech"] as const) {
        for (const freigabe of NENNUNGEN_ALLE) {
          const res = buildAnfrage({ ...ANFRAGE, anrede, kanal, freigabe, fragen: FRAGEN.map((f) => f.id).slice(0, 3) });
          texte.push(...res.fassungen.map((f) => f.text), res.nachfass, ...res.hinweise, res.freigabeFrage, ...res.fragen);
          if (res.leitfaden) texte.push(leitfadenText(res.leitfaden));
        }
      }
    }
    for (const id of FRAGEN) texte.push(id.du, id.sie);
    for (const nennung of NENNUNGEN_ALLE) {
      const res = buildReferenz({ ...KELLER, nennung, name: "Regula Meier", ortFirma: "Keller AG" });
      texte.push(res.kachel.text, ...res.kurz, res.linkedin, res.instagram, toMarkdown(res.dokument), ...res.pruefliste, ...res.hinweise);
    }
    texte.push(PRUEF_SCHLUSS, GEKUERZT_HINWEIS, SEHR_KURZ_HINWEIS, LANG_HINWEIS, ERSTER_SATZ_HINWEIS, NAME_HINWEIS);
    for (const t of texte) {
      expect(brandHits(t), t).toEqual([]);
      expect(t, t).not.toMatch(/!|\bjetzt\b|—|ß|\bnur noch\b|\bgarantiert\b/i);
      expect(styleIssues(t.replace(/"/g, "")).filter((i) => i.code === "voice"), t).toEqual([]);
    }
  });
});

describe("testimonial: Prüfung der Angaben", () => {
  const basis = { firma: "Malerei Keller", typ: "kmu" as const };

  it("verlangt bei Weg 1 Vorname und Leistung und meldet in der Reihenfolge der Felder", () => {
    expect(validateAnfrage(EMPTY_ANFRAGE, { firma: "", typ: "kmu" }).map((p) => p.message)).toEqual([
      "Gib den Namen deines Betriebs an.",
      "Gib den Vornamen der Person an.",
      "Schreib kurz, was ihr zusammen gemacht habt.",
    ]);
    expect(validateAnfrage(EMPTY_ANFRAGE, { firma: "", typ: "verein" })[0].message).toBe("Gib den Namen deines Vereins an.");
    expect(basisProblem("  ", "kmu")?.id).toBe("tb-firma");
    expect(basisProblem("FC Trogen", "verein")).toBeNull();
  });

  it("prüft die Längen von Vorname und Leistung an den Grenzen", () => {
    const a = (vorname: string, leistung: string) => anfrageProblems({ ...EMPTY_ANFRAGE, vorname, leistung }).map((p) => p.message);
    expect(a("A", "den Anstrich")).toEqual(["Der Vorname ist zu kurz: mindestens 2 Zeichen, du hast 1."]);
    expect(a("Al", "den Anstrich")).toEqual([]);
    expect(a("A".repeat(40), "den Anstrich")).toEqual([]);
    expect(a("A".repeat(41), "den Anstrich")).toEqual(["Der Vorname ist zu lang: höchstens 40 Zeichen, du hast 41."]);
    expect(a("Regula", "Haus")).toEqual(["«Was habt ihr zusammen gemacht?» ist zu kurz: mindestens 5 Zeichen, du hast 4."]);
    expect(a("Regula", "x".repeat(121))).toEqual(["«Was habt ihr zusammen gemacht?» ist zu lang: höchstens 120 Zeichen, du hast 121."]);
    expect(a("Regula", "x".repeat(120))).toEqual([]);
  });

  it("verlangt bei Weg 2 Zitat, Name, Ort, Angaben und meldet fehlende Sätze", () => {
    expect(validateReferenz(EMPTY_REFERENZ, basis).map((p) => p.message)).toEqual([
      "Füge das Zitat der Kundschaft ein.",
      "Gib den Namen der Person an.",
      "Gib den Ort der Person an.",
      "Schreib kurz, was ihr gemacht habt.",
      "Beschreib die Ausgangslage.",
      "Beschreib, was ihr getan habt.",
    ]);
    expect(validateReferenz({ ...EMPTY_REFERENZ, nennung: "name-firma" }, basis).map((p) => p.message)).toContain("Gib die Firma der Person an.");
    expect(validateReferenz(KELLER, basis)).toEqual([]);
    const keinSatz = referenzProblems({ ...KELLER, ohne: zitatSaetze(ZITAT) });
    expect(keinSatz.map((p) => p.message)).toEqual(["Wähle mindestens einen Satz für die Kachel."]);
    expect(keinSatz[0].id).toBe("tb-satz-0");
  });

  it("prüft das Zitat auf 20 bis 600 Zeichen und zählt es nach der Bereinigung", () => {
    const z = (zitat: string) => referenzProblems({ ...KELLER, zitat, ohne: [] }).map((p) => p.message);
    expect(z("Zu kurz.")).toEqual(["Das Zitat ist zu kurz: mindestens 20 Zeichen, du hast 8."]);
    expect(z("a".repeat(20))).toEqual([]);
    expect(z("a".repeat(600))).toEqual([]);
    expect(z("a".repeat(601))).toEqual(["Das Zitat ist zu lang: höchstens 600 Zeichen, du hast 601."]);
    expect(z("«" + "a".repeat(20) + "»")).toEqual([]);
  });

  it("verlangt bei «Ohne Namen» weder Namen noch Ort noch Funktion", () => {
    const r = { ...KELLER, nennung: "anonym" as const, name: "", ortFirma: "", funktion: "" };
    expect(referenzProblems(r)).toEqual([]);
  });

  it("lässt das Ergebnis leer, verlangt aber bei Eingabe zehn Zeichen", () => {
    expect(referenzProblems({ ...KELLER, ergebnis: "" })).toEqual([]);
    expect(referenzProblems({ ...KELLER, ergebnis: "Gut." }).map((p) => p.message)).toEqual(["«Ergebnis» ist zu kurz: mindestens 10 Zeichen, du hast 4."]);
  });
});

describe("testimonial: fürs CRM", () => {
  it("schickt bei Weg 1 nie den Vornamen der Person, nur «Vorname: ja»", () => {
    const eingabe = eingabeAnfrage(ANFRAGE);
    expect(eingabe.startsWith("Weg: Zitat anfragen\nAnrede: Du\nKanal: WhatsApp\nVorname: ja\n")).toBe(true);
    expect(eingabe).not.toContain("Regula");
    expect(eingabe).toContain("Was ihr zusammen gemacht habt: den Anstrich der Fassade in Gossau");
    expect(eingabe).toContain("Leitfragen: Wie war die Lage, bevor wir angefangen haben? | Was hat dich überzeugt, uns zu beauftragen? | Was hat sich für dich verändert?");
    expect(eingabe.endsWith("Freigabe: Vorname und Ort")).toBe(true);
    const ausgabe = ausgabeAnfrage(ANFRAGE);
    expect(ausgabe).not.toContain("Regula");
    expect(ausgabe.startsWith("## Kurz, für WhatsApp\nHallo [Vorname]\nDanke für den Anstrich")).toBe(true);
    expect(ausgabe).toContain("## Nachfassen\nHallo [Vorname], ich wollte kurz nachfragen");
    expect(eingabeAnfrage({ ...ANFRAGE, vorname: "" })).toContain("Vorname: nein");
  });

  it("ersetzt den Vornamen auch in der Leistung und in der Sie-Fassung, aber nur als ganzes Wort", () => {
    const input: AnfrageInput = { ...ANFRAGE, anrede: "sie", vorname: "Anna", leistung: "die Fassade von Anna und die Annahme" };
    expect(eingabeAnfrage(input)).toContain("die Fassade von [Vorname] und die Annahme");
    expect(ausgabeAnfrage(input)).not.toMatch(/\bAnna\b/);
    expect(ausgabeAnfrage(input)).toContain("die Annahme");
    expect(anonymisiere("Anna, anna und Annabelle", "Anna")).toBe("[Vorname], [Vorname] und Annabelle");
    expect(anonymisiere("Frau Meier kam", "Frau Meier")).toBe("[Vorname] kam");
    expect(anonymisiere("Text", "")).toBe("Text");
    expect(anonymisiere("Preis (netto) 5", "(netto)")).toBe("Preis [Vorname] 5");
  });

  it("schickt im Gespräch den Leitfaden und bei Sie die Sie-Fassung, immer ohne Vorname", () => {
    const g = ausgabeAnfrage({ ...ANFRAGE, kanal: "gespraech", anrede: "sie" });
    expect(g.startsWith("## Gesprächsleitfaden\nGuten Tag [Vorname]. Danke noch einmal für")).toBe(true);
    expect(g).not.toContain("Regula");
    expect(eingabeAnfrage({ ...ANFRAGE, anrede: "sie", kanal: "email" })).toContain("Anrede: Sie\nKanal: E-Mail");
  });

  it("schickt bei Weg 2 das Zitat als «Zitat der Kundschaft» und den Namen nur, wenn er gezeigt wird", () => {
    const e = eingabeReferenz(KELLER);
    expect(e.startsWith(`Weg: Referenz bauen\nZitat der Kundschaft: ${ZITAT}\nGezeigte Sätze: 2 von 3\nNennung: Vorname und Ort\nGenannt wird: Regula, Gossau\n`)).toBe(true);
    expect(e).toContain("Was ihr gemacht habt: Fassadenanstrich an einem Einfamilienhaus");
    expect(e).toContain("Ergebnis: Die Fassade hält seit zwei Jahren");
    const anonym = eingabeReferenz({ ...KELLER, nennung: "anonym", name: "Regula Meier", ergebnis: "" });
    expect(anonym).toContain("Nennung: Ohne Namen");
    expect(anonym).not.toContain("Genannt wird");
    expect(anonym).not.toContain("Meier");
    expect(anonym.endsWith("Ergebnis: keine Angabe")).toBe(true);
  });

  it("gibt bei Weg 2 Kachel, Kurz-Referenz, Beiträge und Fallstudie als Markdown aus", () => {
    const md = ausgabeReferenz(KELLER);
    expect(md.startsWith("## Zitat-Kachel\n«Die Fassade sieht nach zwei Wintern")).toBe(true);
    for (const kopf of ["## Kurz-Referenz", "## Beitrag für LinkedIn", "## Beitrag für Instagram", "## Fallstudie", "## Das Zitat im Wortlaut"]) {
      expect(md).toContain(kopf);
    }
  });
});

describe("testimonial: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 42, [], {}, { v: 2, phase: "result" }, { v: "1" }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
    expect(EMPTY_STATE.modus).toBe("anfrage");
    expect(EMPTY_STATE.phase).toBe("edit");
  });

  it("macht aus kaputten Feldern Standardwerte, ohne den Rest zu verlieren", () => {
    const s = parseState({
      v: 1,
      modus: "unfug",
      anfrage: { anrede: 7, kanal: "brieftaube", vorname: 12, leistung: "den Anstrich", fragen: "lage", freigabe: "alle" },
      referenz: { zitat: ["x"], ohne: [1, "Satz.", null], nennung: "mond", name: null, gemacht: "Fassade" },
    });
    expect(s.modus).toBe("anfrage");
    expect(s.anfrage).toEqual({ ...EMPTY_ANFRAGE, leistung: "den Anstrich" });
    expect(s.referenz).toEqual({ ...EMPTY_REFERENZ, ohne: ["Satz."], gemacht: "Fassade" });
    expect(s.phase).toBe("edit");
  });

  it("kürzt zu lange Texte auf die Grenze und begrenzt die abgewählten Sätze", () => {
    const s = parseState({
      v: 1,
      anfrage: { vorname: "x".repeat(100), leistung: "y".repeat(500) },
      referenz: { zitat: "z".repeat(900), ohne: Array.from({ length: 100 }, (_, i) => `Satz ${i}.`), ausgangslage: "a".repeat(999) },
    });
    expect(s.anfrage.vorname).toHaveLength(40);
    expect(s.anfrage.leistung).toHaveLength(120);
    expect(s.referenz.zitat).toHaveLength(600);
    expect(s.referenz.ausgangslage).toHaveLength(300);
    expect(s.referenz.ohne).toHaveLength(60);
  });

  it("behält ein Ergebnis von Weg 1 nur bei vollständigen Angaben, sonst «edit»", () => {
    const ok = { v: 1, modus: "anfrage", phase: "result", anfrage: { ...ANFRAGE, anrede: "du" }, output: { ausgabe: "## Text" } };
    const s = parseState(ok);
    expect(s.phase).toBe("result");
    expect(s.output).toEqual({ ausgabe: "## Text" });
    expect(parseState({ ...ok, anfrage: { ...ANFRAGE, vorname: "" } }).phase).toBe("edit");
    expect(parseState({ ...ok, anfrage: { ...ANFRAGE, fragen: ["lage"] } }).phase).toBe("edit");
    expect(parseState({ ...ok, output: { ausgabe: 5 } }).output).toBeUndefined();
    expect(parseState({ ...ok, phase: "edit" }).output).toBeUndefined();
  });

  it("behält ein Ergebnis von Weg 2 nur bei vollständigen Angaben und rechnet mit dem Weg, der gewählt ist", () => {
    const ok = { v: 1, modus: "referenz", phase: "result", referenz: KELLER };
    expect(parseState(ok).phase).toBe("result");
    expect(parseState({ ...ok, referenz: { ...KELLER, zitat: "" } }).phase).toBe("edit");
    expect(parseState({ ...ok, referenz: { ...KELLER, ohne: zitatSaetze(ZITAT) } }).phase).toBe("edit");
    // Weg 2 gewählt: unvollständige Angaben von Weg 1 stören nicht
    expect(parseState({ ...ok, anfrage: {} }).phase).toBe("result");
  });

  it("wird von lib/progress als erledigt erkannt, aber nur mit phase result", () => {
    const state = parseState({ v: 1, modus: "referenz", phase: "result", referenz: KELLER });
    expect(isToolDone(JSON.stringify(state))).toBe(true);
    expect(isToolDone(JSON.stringify({ ...state, phase: "edit" }))).toBe(false);
    expect(isToolDone(JSON.stringify(parseState(null)))).toBe(false);
  });

  it("übersteht einen Durchlauf durch JSON", () => {
    const state = parseState({ v: 1, modus: "referenz", phase: "result", anfrage: ANFRAGE, referenz: KELLER, output: { ausgabe: "x" } });
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe("testimonial: Konfiguration und Seitentext", () => {
  it("hält die Tagline unter 110 Zeichen und das Keyword «Testimonial»", () => {
    expect(config.tagline.length).toBeLessThanOrEqual(110);
    expect(config.keyword).toBe("Testimonial");
    expect(config.related).toEqual(["bewertungs-kit", "story-post", "caption-baukasten"]);
    expect(config.needsServer).toBe(false);
    expect(config.writesProfile).toEqual([]);
  });

  it("besteht die Prüfung des Seitentextes ohne Fehler und Hinweise und hat 350 bis 700 Wörter", () => {
    const c = readToolContent("testimonial");
    expect(checkToolContent(c)).toEqual([]);
    expect(c.frontmatter.tagline).toBe(config.tagline);
    expect(countWords(c.body)).toBeGreaterThanOrEqual(350);
    expect(countWords(c.body)).toBeLessThanOrEqual(700);
    expect(c.alperna.baustein).toBe("Website");
    expect(c.alperna.beweis).toBe("@baustein");
  });

  it("zeigt im Beispiel genau das, was das Werkzeug aus den Angaben der Malerei Keller berechnet", () => {
    const c = readToolContent("testimonial");
    const res = buildReferenz(KELLER);
    const beispiel = c.sections.beispiel ?? "";
    expect(beispiel).toContain("Malerei Keller, Gossau");
    expect(beispiel).toContain(res.kachel.zitat);
    expect(beispiel).toContain(res.kachel.quelle);
    expect(beispiel).toContain(res.kurz.join(" "));
    expect(beispiel).toContain(dankSatz(KELLER));
    expect(res.kachel.zitat).toContain(LUECKE);
  });

  it("nennt im Seitentext das Keyword in der H1 und im ersten Absatz", () => {
    const c = readToolContent("testimonial");
    expect(c.frontmatter.h1).toBe("Testimonial-Baukasten für Schweizer KMU");
    expect((c.sections.warum ?? "").split(/\n\s*\n/)[0]).toContain("Testimonial");
    const n = (`${c.frontmatter.h1}\n${c.body}`.toLowerCase().match(/testimonial/g) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  });
});

describe("testimonial: Fallstudie am Bildschirm", () => {
  it("zeigt Ausgangslage, Aufgabe, Vorgehen und Ergebnis als vier Schritte und lässt Zitat und Wortlaut stehen", () => {
    const doc = fallstudieOf(KELLER);
    const screen = fallstudieBildschirm(doc);
    const steps = screen.find((b) => b.type === "steps");
    expect(steps?.type === "steps" && steps.items.map((s) => s.title)).toEqual(["Ausgangslage", "Aufgabe", "Vorgehen", "Ergebnis"]);
    // Zitat und Quelle stehen vor den Schritten, der Wortlaut danach
    expect(screen[0]).toEqual(doc.blocks[0]);
    expect(screen.findIndex((b) => b.type === "steps")).toBe(2);
    expect(screen.some((b) => b.type === "heading" && b.text === "Das Zitat im Wortlaut")).toBe(true);
    expect(screen.some((b) => b.type === "heading" && b.text === "Ausgangslage")).toBe(false);
    // Die Datei behält die Überschriften
    expect(doc.blocks.some((b) => b.type === "heading" && b.text === "Ausgangslage")).toBe(true);
  });

  it("lässt das Ergebnis weg, wenn es keins gibt, und ändert ein Dokument ohne diese Abschnitte nicht", () => {
    const ohne = fallstudieBildschirm(fallstudieOf({ ...KELLER, ergebnis: "" }));
    const steps = ohne.find((b) => b.type === "steps");
    expect(steps?.type === "steps" && steps.items.map((s) => s.title)).toEqual(["Ausgangslage", "Aufgabe", "Vorgehen"]);
    const fremd = { title: "x", filename: "x", blocks: [{ type: "paragraph", text: "nur Text" } as const] };
    expect(fallstudieBildschirm(fremd)).toEqual(fremd.blocks);
  });
});
