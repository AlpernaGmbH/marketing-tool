import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { styleIssues } from "@/lib/content-rules";
import { toMarkdown } from "@/lib/export/model";
import { isToolDone } from "@/lib/progress";
import { findingsOf } from "@/tools/textcheck/logic";
import {
  ABOUT_ANFANG,
  EMPTY_STATE,
  FRAGEN,
  FRAGEN_IDS,
  GEWICHT_SUMME,
  HEADLINE_RICHTWERT,
  HINWEISE,
  LIMITS,
  RICHTWERT_HINWEIS,
  SAMPLE,
  SELBSTEINSCHAETZUNG_HINWEIS,
  STUFEN_HINWEIS,
  URL_LABEL,
  auswerten,
  documentParts,
  eingabeText,
  funde,
  headlineHinweis,
  headlines,
  istVollstaendig,
  kuerzen,
  offeneFragen,
  outputOf,
  parseState,
  reportMarkdown,
  score,
  stufe,
  toDocument,
  validate,
  verbesserungText,
  verbesserungen,
  verloren,
  vorbefuellt,
  zielgruppeVorschlag,
  type Antworten,
  type LinkedinState,
  type Punkte,
} from "./logic";

// Spec: specs/linkedin-profil.md, Abschnitt «Logik» und «Rechenbeispiel».

const alle = (p: Punkte): Antworten => Object.fromEntries(FRAGEN_IDS.map((id) => [id, p])) as Antworten;

/** Beispiel «Malerei Keller, Gossau» als gespeicherter Stand. */
const KELLER: LinkedinState = { ...EMPTY_STATE, ...SAMPLE, phase: "result", firma: "Malerei Keller", branche: "Malerei" };

const woerter = (n: number, wort = "wort") => Array.from({ length: n }, (_, i) => `${wort}${i % 3 === 0 ? "a" : i % 3 === 1 ? "b" : "c"}`).join(" ");

describe("linkedin-profil: Fragenkatalog", () => {
  it("hat acht Fragen mit eindeutigen IDs; die Gewichte summieren sich zu 100", () => {
    expect(FRAGEN).toHaveLength(8);
    expect(new Set(FRAGEN_IDS).size).toBe(8);
    expect(FRAGEN.reduce((n, f) => n + f.gewicht, 0)).toBe(100);
    expect(GEWICHT_SUMME).toBe(100);
    expect(FRAGEN.map((f) => f.gewicht)).toEqual([20, 8, 8, 18, 10, 14, 8, 14]);
  });

  it("hat je Frage drei Antworten mit 0, 1 und 2 Punkten; Hilfetexte nur dort, wo Punkte fehlen", () => {
    for (const f of FRAGEN) {
      expect(f.antworten.map((a) => a.punkte)).toEqual([0, 1, 2]);
      expect(f.antworten[0].fehlt.length).toBeGreaterThan(10);
      expect(f.antworten[0].anleitung.length).toBeGreaterThan(20);
      expect(f.antworten[1].fehlt.length).toBeGreaterThan(10);
      expect(f.antworten[1].anleitung.length).toBeGreaterThan(20);
      expect(f.antworten[2].fehlt).toBe("");
      expect(f.antworten[2].anleitung).toBe("");
    }
  });

  it("hat Beschriftungen der Antworten, die über alle Fragen eindeutig sind", () => {
    const labels = FRAGEN.flatMap((f) => f.antworten.map((a) => a.label));
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(FRAGEN.map((f) => f.kurz)).size).toBe(8);
  });
});

describe("linkedin-profil: score", () => {
  it("alles mit 0 Punkten ergibt 0, alles mit 2 Punkten ergibt 100, alles mit 1 Punkt ergibt 50", () => {
    expect(score(alle(0))).toBe(0);
    expect(score(alle(2))).toBe(100);
    expect(score(alle(1))).toBe(50);
  });

  it("rechnet das Beispiel Malerei Keller: 10 + 8 + 4 + 9 + 0 + 7 + 4 + 0 = 42", () => {
    expect(score(SAMPLE.antworten)).toBe(42);
  });

  it("gewichtet: nur die Headline mit 2 Punkten ergibt 20, nur der Info-Text 18, nur das Banner 8", () => {
    expect(score({ ...alle(0), headline: 2 })).toBe(20);
    expect(score({ ...alle(0), info: 2 })).toBe(18);
    expect(score({ ...alle(0), banner: 2 })).toBe(8);
    expect(score({ ...alle(0), headline: 1 })).toBe(10);
  });

  it("zählt unbeantwortete Fragen als 0 und ignoriert ungültige Punkte", () => {
    expect(score({})).toBe(0);
    expect(score({ headline: 2 })).toBe(20);
    expect(score({ headline: 5 as Punkte, profilbild: -1 as Punkte })).toBe(0);
  });

  it("ergibt für jede der 6'561 Kombinationen eine ganze Zahl von 0 bis 100; mehr Punkte geben nie weniger", () => {
    const levels: Punkte[] = [0, 1, 2];
    let count = 0;
    const walk = (i: number, current: Antworten) => {
      if (i === FRAGEN_IDS.length) {
        const s = score(current);
        expect(Number.isInteger(s) && s >= 0 && s <= 100).toBe(true);
        count++;
        return;
      }
      for (const p of levels) walk(i + 1, { ...current, [FRAGEN_IDS[i]]: p });
    };
    walk(0, {});
    expect(count).toBe(6561);
    for (const id of FRAGEN_IDS) {
      expect(score({ ...alle(1), [id]: 2 })).toBeGreaterThan(score({ ...alle(1), [id]: 1 }));
      expect(score({ ...alle(1), [id]: 1 })).toBeGreaterThan(score({ ...alle(1), [id]: 0 }));
    }
  });
});

describe("linkedin-profil: stufe", () => {
  it("liegt an den Schwellen: 39 Ausbaufähig, 40 Solide Basis, 69 Solide Basis, 70 Stark", () => {
    expect(stufe(39)).toBe("Ausbaufähig");
    expect(stufe(40)).toBe("Solide Basis");
    expect(stufe(69)).toBe("Solide Basis");
    expect(stufe(70)).toBe("Stark");
  });

  it("deckt die Ränder und unsinnige Werte ab", () => {
    expect(stufe(0)).toBe("Ausbaufähig");
    expect(stufe(100)).toBe("Stark");
    expect(stufe(Number.NaN)).toBe("Ausbaufähig");
    expect(stufe(-5)).toBe("Ausbaufähig");
    expect(stufe(250)).toBe("Stark");
    expect(stufe(39.6)).toBe("Solide Basis"); // gerundet wie der Punktwert
  });
});

describe("linkedin-profil: verbesserungen", () => {
  it("rechnet den verlorenen Anteil: Gewicht × (2 − Punkte) / 2", () => {
    const headline = FRAGEN[0];
    expect(verloren(headline, 0)).toBe(20);
    expect(verloren(headline, 1)).toBe(10);
    expect(verloren(headline, 2)).toBe(0);
    expect(verloren(headline, undefined)).toBe(0);
    expect(verloren(FRAGEN[3], 0)).toBe(18);
  });

  it("sortiert absteigend nach offenen Punkten; bei Gleichstand gilt die Reihenfolge der Fragen", () => {
    const v = verbesserungen(SAMPLE.antworten);
    expect(v.map((x) => x.titel)).toEqual(["Aktivität", "Headline", "Im Fokus", "Info-Text", "Erfahrung"]);
    expect(v.map((x) => x.offen)).toEqual([14, 10, 10, 9, 7]);
  });

  it("nennt höchstens fünf Fragen, auch wenn mehr Punkte offen sind", () => {
    const v = verbesserungen(alle(0));
    expect(v).toHaveLength(5);
    expect(v.map((x) => x.titel)).toEqual(["Headline", "Info-Text", "Erfahrung", "Aktivität", "Im Fokus"]);
    expect(v.every((x) => x.quelle === "frage")).toBe(true);
  });

  it("ist bei voller Punktzahl leer", () => {
    expect(verbesserungen(alle(2))).toEqual([]);
  });

  it("nimmt den Text zur gewählten Stufe: 0 und 1 Punkt haben verschiedene Texte", () => {
    const [null0] = verbesserungen({ headline: 0 });
    const [eins] = verbesserungen({ headline: 1 });
    expect(null0.fehlt).toBe(FRAGEN[0].antworten[0].fehlt);
    expect(eins.fehlt).toBe(FRAGEN[0].antworten[1].fehlt);
    expect(null0.anleitung).not.toBe(eins.anleitung);
  });

  it("lässt unbeantwortete Fragen aus", () => {
    expect(verbesserungen({ headline: 1 }).map((x) => x.titel)).toEqual(["Headline"]);
    expect(verbesserungen({})).toEqual([]);
  });

  it("hängt die Funde hinter die Fragen und den Hinweis auf die Profil-Adresse ans Ende", () => {
    const f = funde("Malermeister bei Malerei Keller", "");
    const v = verbesserungen({ headline: 1, aktivitaet: 0 }, f, false);
    expect(v.map((x) => x.quelle)).toEqual(["frage", "frage", "fund", "url"]);
    expect(v[2].titel).toBe("Headline: Nur ein Titel");
    expect(v[2].fehlt).toBe(f[0].text);
    expect(v[2].anleitung).toBe(f[0].vorschlag);
    expect(v[3].titel).toBe("Profil-Adresse");
    expect(v[3].fehlt).toMatch(/Adresse/);
  });

  it("zeigt den Hinweis auf die Profil-Adresse nur, wenn sie nicht angepasst ist", () => {
    expect(verbesserungen(alle(2), [], true)).toEqual([]);
    expect(verbesserungen(alle(2), [], false).map((x) => x.quelle)).toEqual(["url"]);
    expect(verbesserungen(alle(2))).toEqual([]); // ohne Angabe kein Hinweis
  });

  it("macht aus einer Verbesserung eine Zeile mit offenen Punkten, «Was fehlt» und «So geht es»", () => {
    const [v] = verbesserungen({ aktivitaet: 0 });
    const zeile = verbesserungText(v);
    expect(zeile).toMatch(/^Aktivität \(14 Punkte offen\)\. Was fehlt: .+ So geht es: .+/);
    expect(verbesserungText({ quelle: "frage", titel: "Banner", fehlt: "a.", anleitung: "b.", offen: 1 })).toContain("(1 Punkt offen)");
  });
});

describe("linkedin-profil: funde in Headline und Info-Text", () => {
  it("findet bei leeren Texten nichts", () => {
    expect(funde("", "")).toEqual([]);
    expect(funde("   ", " \n ")).toEqual([]);
  });

  it("meldet eine Headline über 220 Zeichen, aber nicht eine mit genau 220", () => {
    const lang = `Ich helfe KMU bei Anfragen ${"x".repeat(HEADLINE_RICHTWERT)}`;
    const treffer = funde(lang, "").find((f) => f.id === "headline-lang");
    expect(treffer?.stelle).toBe("Headline");
    expect(treffer?.text).toContain(`${lang.length} Zeichen`);
    const genau = `Ich helfe KMU bei ${"x".repeat(HEADLINE_RICHTWERT - 18)}`;
    expect(genau).toHaveLength(HEADLINE_RICHTWERT);
    expect(funde(genau, "").some((f) => f.id === "headline-lang")).toBe(false);
    expect(funde(`${genau}y`, "").some((f) => f.id === "headline-lang")).toBe(true);
  });

  it("meldet eine Headline ohne Verb und ohne Zahl als vermutlichen Titel", () => {
    const f = funde("Malermeister bei Malerei Keller", "");
    expect(f.map((x) => x.id)).toEqual(["headline-jobtitel"]);
    expect(f[0].text).toMatch(/vermutlich nur einen Titel/);
    expect(funde("Geschäftsführer | Gossau", "").some((x) => x.id === "headline-jobtitel")).toBe(true);
  });

  it("meldet keinen Titel, wenn die Headline ein Verb oder eine Zahl hat", () => {
    expect(funde("Ich helfe KMU in der Ostschweiz bei neuen Anfragen", "")).toEqual([]);
    expect(funde("Wir bauen Websites für Vereine", "")).toEqual([]);
    expect(funde("Malermeister, 25 Jahre Erfahrung", "")).toEqual([]);
    expect(funde("Hilft Betrieben, gefunden zu werden", "")).toEqual([]);
  });

  it("zählt Verben nur als ganzes Wort: «Bauleiter» und «Macher» sind kein Verb", () => {
    expect(funde("Bauleiter bei Keller AG", "").some((x) => x.id === "headline-jobtitel")).toBe(true);
    expect(funde("Macher und Bauführer", "").some((x) => x.id === "headline-jobtitel")).toBe(true);
  });

  it("findet Floskeln aus dem Textcheck in der Headline und im Info-Text und nennt die Stelle", () => {
    const h = funde("Ihr kompetenter Ansprechpartner für Fassaden", "");
    const hf = h.filter((x) => x.titel === "Floskel");
    expect(hf.length).toBeGreaterThan(0);
    expect(hf.every((x) => x.stelle === "Headline")).toBe(true);
    expect(hf.map((x) => x.text).join(" ")).toMatch(/«kompetenter»|«Ihr kompetenter Ansprechpartner»/);
    const a = funde("", "Du suchst eine Malerei? Wir arbeiten qualitativ hochwertig und zeitnah.");
    const af = a.filter((x) => x.titel === "Floskel");
    expect(af.length).toBe(2);
    expect(af.every((x) => x.stelle === "Info-Text")).toBe(true);
    expect(af[0].vorschlag.length).toBeGreaterThan(3);
  });

  it("meldet bei einer sauberen Headline und einem sauberen Info-Text keine Floskel", () => {
    expect(funde("Ich helfe Familien in Gossau bei der Fassade", "Du willst dein Haus streichen? Wir beraten bei der Farbwahl.")).toEqual([]);
  });

  it("meldet einen Info-Text, der mit «Ich bin» oder «Mein Name» beginnt", () => {
    expect(funde("", "Ich bin Malermeister und streiche für Kunden in Gossau.").map((x) => x.id)).toEqual(["about-ich-bin"]);
    expect(funde("", "Mein Name ist Hans Keller. Ich helfe Kunden.").some((x) => x.id === "about-ich-bin")).toBe(true);
    expect(funde("", "«Ich bin» steht hier gleich am Anfang. Kunden lesen das.").some((x) => x.id === "about-ich-bin")).toBe(true);
  });

  it("meldet «Ich bin» nicht, wenn es nicht am Anfang steht oder ein anderes Wort ist", () => {
    expect(funde("", "Kunden in Gossau erreichst du bei mir. Ich bin seit 1998 dabei.").some((x) => x.id === "about-ich-bin")).toBe(false);
    expect(funde("", "Ich binde Kunden an den Betrieb.").some((x) => x.id === "about-ich-bin")).toBe(false);
  });

  it("meldet einen Anfang ohne Aussage über die Kundschaft", () => {
    const f = funde("", "Seit 1998 streiche ich Wände, Fassaden und Decken in der Region. Ich arbeite sauber und pünktlich.");
    expect(f.map((x) => x.id)).toEqual(["about-ohne-kundschaft"]);
    expect(f[0].text).toContain(String(ABOUT_ANFANG));
  });

  it("meldet nichts, wenn «du», «Sie», «Kundschaft», «Kunden», «Betriebe», «KMU» oder «Vereine» vorkommen", () => {
    for (const wort of ["Du suchst eine Malerei?", "Wir beraten Sie gern.", "Die Kundschaft kommt aus Gossau.", "Kunden und Kundinnen bleiben.", "Betriebe in Flawil", "KMU brauchen Ruhe.", "Vereine streichen ihr Clubhaus."]) {
      expect(funde("", `${wort} Mehr steht hier nicht.`).some((x) => x.id === "about-ohne-kundschaft")).toBe(false);
    }
  });

  it("zählt «sie» klein geschrieben nicht, und ein Wort nach den ersten 210 Zeichen auch nicht", () => {
    expect(funde("", "Sie ist gut. sie streichen auch.").some((x) => x.id === "about-ohne-kundschaft")).toBe(false); // «Sie» gross
    expect(funde("", "sie streichen auch. Das ist alles hier.").some((x) => x.id === "about-ohne-kundschaft")).toBe(true);
    const spaet = `${"Wir streichen Wände und Fassaden. ".repeat(8)}Du bekommst einen Termin.`;
    expect(spaet.indexOf("Du bekommst")).toBeGreaterThan(ABOUT_ANFANG);
    expect(funde("", spaet).some((x) => x.id === "about-ohne-kundschaft")).toBe(true);
  });

  it("meldet Sätze über 25 Wörter, aber nicht genau 25", () => {
    const lang = `Du bekommst von uns ${woerter(24)}.`;
    const f = funde("", lang).find((x) => x.id === "about-lange-saetze");
    expect(f?.stelle).toBe("Info-Text");
    expect(f?.text).toBe("Ein Satz hat 28 Wörter. Richtwert: höchstens 25.");
    expect(f?.vorschlag).toMatch(/in zwei/);
    const genau = `Du bekommst ${woerter(23)}.`;
    expect(funde("", genau).some((x) => x.id === "about-lange-saetze")).toBe(false);
  });

  it("zählt mehrere lange Sätze", () => {
    const text = `Du bekommst ${woerter(30)}. Du siehst ${woerter(40)}. Kurz.`;
    const f = funde("", text).find((x) => x.id === "about-lange-saetze");
    expect(f?.text).toBe("2 Sätze sind lang, der längste hat 42 Wörter. Richtwert: höchstens 25.");
  });

  it("gibt jedem Fund Stelle, Titel, Text und einen Vorschlag", () => {
    const f = funde("Ihr kompetenter Ansprechpartner", "Ich bin Maler. Zeitnah erledigt.");
    expect(f.length).toBeGreaterThanOrEqual(4);
    for (const x of f) {
      expect(["Headline", "Info-Text"]).toContain(x.stelle);
      expect(x.id).toBeTruthy();
      expect(x.titel).toBeTruthy();
      expect(x.text.length).toBeGreaterThan(10);
      expect(x.vorschlag.length).toBeGreaterThan(5);
    }
    expect(new Set(f.map((x) => x.id)).size).toBe(f.length);
  });

  it("ändert den Punktwert nicht", () => {
    const ohne = auswerten({ ...KELLER, headline: "", about: "" });
    const mit = auswerten({ ...KELLER, headline: "Ihr kompetenter Ansprechpartner", about: "Ich bin Maler." });
    expect(mit.funde.length).toBeGreaterThan(0);
    expect(ohne.funde).toEqual([]);
    expect(mit.score).toBe(ohne.score);
    expect(mit.stufe).toBe(ohne.stufe);
  });
});

describe("linkedin-profil: headlines", () => {
  const voll = { zielgruppe: "Familien in Gossau", ergebnis: "Fassadenanstrich und Farbberatung", beweis: "Referenzen in Gossau, Flawil und Herisau", firma: "Malerei Keller", branche: "Malerei" };

  it("setzt die drei Muster mit Beweis zusammen", () => {
    const h = headlines(voll);
    expect(h.map((x) => x.muster)).toEqual([1, 2, 3]);
    expect(h[0].text).toBe("Ich helfe Familien in Gossau bei Fassadenanstrich und Farbberatung – Referenzen in Gossau, Flawil und Herisau");
    expect(h[1].text).toBe("Fassadenanstrich und Farbberatung für Familien in Gossau: Malerei Keller");
    expect(h[2].text).toBe("Familien in Gossau: Fassadenanstrich und Farbberatung. Referenzen in Gossau, Flawil und Herisau");
    expect(h.map((x) => x.zeichen)).toEqual(h.map((x) => x.text.length));
    expect(h.every((x) => !x.gekuerzt)).toBe(true);
  });

  it("lässt ohne Beweis den Beweisteil samt Trenner weg", () => {
    const h = headlines({ ...voll, beweis: "" });
    expect(h[0].text).toBe("Ich helfe Familien in Gossau bei Fassadenanstrich und Farbberatung");
    expect(h[2].text).toBe("Familien in Gossau: Fassadenanstrich und Farbberatung");
    expect(h[1].text).toBe("Fassadenanstrich und Farbberatung für Familien in Gossau: Malerei Keller");
    for (const x of h) expect(x.text).not.toMatch(/ –$|\.$|:$/);
    expect(headlines({ ...voll, beweis: "  \n " })[0].text).not.toContain("–");
  });

  it("nimmt im zweiten Muster die Firma, sonst die Branche, sonst nichts", () => {
    expect(headlines({ ...voll, firma: "" })[1].text).toBe("Fassadenanstrich und Farbberatung für Familien in Gossau: Malerei");
    expect(headlines({ ...voll, firma: "", branche: "" })[1].text).toBe("Fassadenanstrich und Farbberatung für Familien in Gossau");
    expect(headlines({ zielgruppe: "KMU", ergebnis: "mehr Anfragen", beweis: "" })[1].text).toBe("Mehr Anfragen für KMU");
  });

  it("macht ohne Zielgruppe oder ohne Ergebnis keine Vorschläge und sagt, was fehlt", () => {
    expect(headlines({ ...voll, zielgruppe: "" })).toEqual([]);
    expect(headlines({ ...voll, ergebnis: "   " })).toEqual([]);
    expect(headlines({ zielgruppe: "", ergebnis: "", beweis: "Beleg" })).toEqual([]);
    expect(headlineHinweis(voll)).toBeNull();
    expect(headlineHinweis({ zielgruppe: "", ergebnis: "" })).toBe("Für Headline-Vorschläge fehlen Zielgruppe und Ergebnis.");
    expect(headlineHinweis({ zielgruppe: "KMU", ergebnis: "" })).toBe("Für Headline-Vorschläge fehlt das Ergebnis für deine Kundschaft.");
    expect(headlineHinweis({ zielgruppe: "", ergebnis: "Anfragen" })).toBe("Für Headline-Vorschläge fehlt die Zielgruppe.");
  });

  it("kürzt Vorschläge über 220 Zeichen am letzten Leerzeichen, ohne Trenner am Ende", () => {
    const lang = { zielgruppe: woerter(12, "zielgruppe"), ergebnis: woerter(12, "ergebnis"), beweis: woerter(12, "beweis") };
    for (const x of headlines(lang)) {
      expect(x.zeichen).toBeLessThanOrEqual(HEADLINE_RICHTWERT);
      expect(x.text.length).toBe(x.zeichen);
      expect(x.text).not.toMatch(/[\s.,;:–-]$/);
    }
    const roh1 = `Ich helfe ${lang.zielgruppe.slice(0, 80).trim()} bei ${lang.ergebnis.slice(0, 80).trim()} – ${lang.beweis.slice(0, 80).trim()}`;
    const eins = headlines(lang)[0];
    expect(roh1.length).toBeGreaterThan(HEADLINE_RICHTWERT);
    expect(eins.gekuerzt).toBe(true);
    expect(roh1.startsWith(eins.text)).toBe(true);
    expect(roh1.charAt(eins.text.length)).toMatch(/[\s]/); // geschnitten wurde an einer Wortgrenze
  });

  it("kürzt hart, wenn kein Leerzeichen da ist, und lässt Kurzes unverändert", () => {
    expect(kuerzen("a".repeat(300))).toEqual({ text: "a".repeat(220), gekuerzt: true });
    expect(kuerzen("kurz", 220)).toEqual({ text: "kurz", gekuerzt: false });
    expect(kuerzen("eins zwei drei vier", 10)).toEqual({ text: "eins zwei", gekuerzt: true });
    expect(kuerzen("eins zwei, drei vier", 9)).toEqual({ text: "eins zwei", gekuerzt: true }); // Komma am Rand entfällt
    expect(kuerzen("eins zwei drei", 8)).toEqual({ text: "eins", gekuerzt: true });
  });

  it("setzt keine Satzzeichen doppelt, auch wenn die Eingabe welche am Ende trägt", () => {
    const h = headlines({ zielgruppe: "KMU in der Ostschweiz.", ergebnis: "mehr Anfragen!", beweis: "seit 1998..", firma: "Keller AG,", branche: "" });
    for (const x of h) {
      expect(x.text).not.toMatch(/[.,;:!?]\s*[.,;:!?]/);
      expect(x.text).not.toMatch(/–\s*–/);
      expect(x.text).not.toMatch(/\s[.,;:!?]/);
      expect(x.text).not.toMatch(/\s{2,}/);
    }
    expect(h[0].text).toBe("Ich helfe KMU in der Ostschweiz bei mehr Anfragen – seit 1998");
    expect(h[2].text).toBe("KMU in der Ostschweiz: mehr Anfragen. Seit 1998");
    expect(h[1].text).toBe("Mehr Anfragen für KMU in der Ostschweiz: Keller AG");
  });

  it("räumt Leerzeichen und Zeilenumbrüche in der Eingabe auf", () => {
    const h = headlines({ zielgruppe: "  Familien \n in   Gossau ", ergebnis: " Farbe ", beweis: "" });
    expect(h[0].text).toBe("Ich helfe Familien in Gossau bei Farbe");
  });

  it("schreibt Schweizer Typografie: ss, Guillemets, Prozent mit Leerzeichen", () => {
    const h = headlines({ zielgruppe: "Hausbesitzer in der Strasse", ergebnis: "Anstrich ohne Aerger", beweis: 'bis zu 20% schneller, "Bestzeit" und Straße' });
    expect(h[0].text).toContain("20 %");
    expect(h[0].text).toContain("«Bestzeit»");
    expect(h[0].text).toContain("Strasse");
    expect(h.map((x) => x.text).join(" ")).not.toMatch(/ß|"|\d%/);
  });

  it("schreibt den Anfang der Muster 2 und 3 gross, das erste Muster beginnt mit «Ich helfe»", () => {
    const h = headlines({ zielgruppe: "familien in Gossau", ergebnis: "fassaden", beweis: "" });
    expect(h[0].text.startsWith("Ich helfe familien")).toBe(true);
    expect(h[1].text.startsWith("Fassaden für familien")).toBe(true);
    expect(h[2].text.startsWith("Familien in Gossau:")).toBe(true);
  });

  it("bleibt bei den Wörtern der Person: keine fremden Wörter ausser den Verbindungswörtern", () => {
    const h = headlines({ zielgruppe: "Alpha", ergebnis: "Beta", beweis: "Gamma", firma: "Delta" });
    expect(h.map((x) => x.text)).toEqual(["Ich helfe Alpha bei Beta – Gamma", "Beta für Alpha: Delta", "Alpha: Beta. Gamma"]);
  });
});

describe("linkedin-profil: Profil und Vorbefüllung", () => {
  it("füllt die Zielgruppe aus dem primaersegment des Profils", () => {
    const s = vorbefuellt(EMPTY_STATE, { primaersegment: "Eigentümer älterer Einfamilienhäuser" });
    expect(s.zielgruppe).toBe("Eigentümer älterer Einfamilienhäuser");
    expect(s.antworten).toEqual({});
  });

  it("überschreibt keine Zielgruppe, die die Person getippt hat", () => {
    const eigene = { ...EMPTY_STATE, zielgruppe: "Vereine in Trogen" };
    expect(vorbefuellt(eigene, { primaersegment: "Eigentümer" })).toBe(eigene);
  });

  it("lässt die Zielgruppe leer, wenn das Profil nichts hat", () => {
    expect(vorbefuellt(EMPTY_STATE, {}).zielgruppe).toBe("");
    expect(vorbefuellt(EMPTY_STATE, { primaersegment: "   " }).zielgruppe).toBe("");
  });

  it("kürzt ein langes primaersegment auf 80 Zeichen am letzten Leerzeichen", () => {
    const lang = `Eigentümer älterer Einfamilienhäuser in Gossau, Flawil und Umgebung mit Interesse an Fassadenanstrichen und Farbberatung`;
    const z = zielgruppeVorschlag(lang);
    expect(z.length).toBeLessThanOrEqual(LIMITS.zielgruppe);
    expect(lang.startsWith(z)).toBe(true);
    expect(lang.charAt(z.length)).toBe(" ");
    expect(zielgruppeVorschlag(undefined)).toBe("");
  });
});

describe("linkedin-profil: validate", () => {
  const ok = { antworten: alle(1), headline: "", about: "", zielgruppe: "", ergebnis: "", beweis: "" };

  it("verlangt alle acht Antworten und nennt, welche fehlen", () => {
    expect(validate({ ...ok, antworten: {} })).toBe("Beantworte die acht Fragen zu deinem Profil.");
    expect(validate({ ...ok, antworten: { ...alle(1), banner: undefined, empfehlungen: undefined } })).toBe("Beantworte alle acht Fragen. Es fehlt noch: Banner, Empfehlungen.");
    expect(offeneFragen({ headline: 0 })).toHaveLength(7);
    expect(istVollstaendig(alle(0))).toBe(true);
    expect(istVollstaendig({})).toBe(false);
  });

  it("lässt alles Freiwillige leer zu", () => {
    expect(validate(ok)).toBeNull();
    expect(validate({ ...ok, antworten: alle(0) })).toBeNull();
  });

  it("prüft die Längen der Texte", () => {
    expect(validate({ ...ok, headline: "x".repeat(LIMITS.headline) })).toBeNull();
    expect(validate({ ...ok, headline: "x".repeat(LIMITS.headline + 1) })).toMatch(/Headline ist zu lang.*300/);
    expect(validate({ ...ok, about: "x".repeat(LIMITS.about + 1) })).toMatch(/Info-Texts ist zu lang.*600/);
    expect(validate({ ...ok, zielgruppe: "x".repeat(81) })).toMatch(/Zielgruppe ist zu lang.*80/);
    expect(validate({ ...ok, ergebnis: "x".repeat(81) })).toMatch(/Ergebnis.*zu lang/);
    expect(validate({ ...ok, beweis: "x".repeat(81) })).toMatch(/Beleg ist zu lang/);
  });
});

describe("linkedin-profil: parseState", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 42, [], { v: 2 }, { phase: "result" }, {}]) expect(parseState(raw)).toEqual(EMPTY_STATE);
  });

  it("verwirft ungültige Antworten und falsche Typen, behält den Rest", () => {
    const s = parseState({ v: 1, phase: "edit", antworten: { headline: 2, banner: 7, profilbild: "1", unbekannt: 2 }, urlAngepasst: "ja", headline: 5, about: "Text", zielgruppe: null });
    expect(s.antworten).toEqual({ headline: 2 });
    expect(s.urlAngepasst).toBe(false);
    expect(s.headline).toBe("");
    expect(s.about).toBe("Text");
    expect(s.zielgruppe).toBe("");
    expect(s.phase).toBe("edit");
    expect(parseState({ v: 1, antworten: [1, 2, 3] }).antworten).toEqual({});
  });

  it("kürzt zu lange Texte auf die Grenzen", () => {
    const s = parseState({ v: 1, headline: "h".repeat(999), about: "a".repeat(999), zielgruppe: "z".repeat(999), ergebnis: "e".repeat(999), beweis: "b".repeat(999), firma: "f".repeat(999) });
    expect(s.headline).toHaveLength(LIMITS.headline);
    expect(s.about).toHaveLength(LIMITS.about);
    expect(s.zielgruppe).toHaveLength(LIMITS.zielgruppe);
    expect(s.ergebnis).toHaveLength(LIMITS.ergebnis);
    expect(s.beweis).toHaveLength(LIMITS.beweis);
    expect(s.firma).toHaveLength(LIMITS.firma);
  });

  it("gibt ein Ergebnis nur bei acht Antworten; sonst zurück ins Formular", () => {
    expect(parseState({ v: 1, phase: "result", antworten: { headline: 2 } }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result", antworten: alle(1) }).phase).toBe("result");
  });

  it("berechnet output neu und vertraut einem gespeicherten output nicht", () => {
    const s = parseState({ v: 1, phase: "result", antworten: alle(2), output: { score: 3, stufe: "Ausbaufähig" } });
    expect(s.output).toEqual({ score: 100, stufe: "Stark" });
    expect(outputOf(SAMPLE.antworten)).toEqual({ score: 42, stufe: "Solide Basis" });
    expect(parseState({ v: 1, phase: "edit", antworten: alle(2), output: { score: 100, stufe: "Stark" } }).output).toBeUndefined();
  });

  it("liest einen gespeicherten Stand unverändert zurück (Rundlauf)", () => {
    const stand: LinkedinState = { ...KELLER, output: outputOf(KELLER.antworten) };
    expect(parseState(JSON.parse(JSON.stringify(stand)))).toEqual(stand);
  });

  it("gilt im Pfad als erledigt, sobald phase «result» ist, und nicht mehr in der Bearbeitung", () => {
    const fertig = { ...KELLER, output: outputOf(KELLER.antworten) };
    expect(isToolDone(JSON.stringify(fertig))).toBe(true);
    expect(isToolDone(JSON.stringify({ ...fertig, phase: "edit" }))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });
});

describe("linkedin-profil: Dokument und Texte fürs CRM", () => {
  it("baut das Dokument für Keller: Kopf, Tabelle, Verbesserungen, Vorschläge und drei Hinweise", () => {
    const doc = toDocument(KELLER);
    expect(doc.title).toBe("LinkedIn-Profil-Score");
    expect(doc.subtitle).toBe("Punktwert 42 von 100, Stufe «Solide Basis»");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("linkedin-profil-malerei-keller");
    const facts = doc.blocks[0];
    expect(facts.type).toBe("facts");
    if (facts.type === "facts") {
      expect(facts.items).toEqual([
        { label: "Betrieb", value: "Malerei Keller" },
        { label: "Branche", value: "Malerei" },
        { label: "Punktwert", value: "42 von 100" },
        { label: "Stufe", value: "Solide Basis (Richtwert von Alperna)" },
      ]);
    }
    expect(doc.blocks[1]).toEqual({ type: "paragraph", text: SELBSTEINSCHAETZUNG_HINWEIS });
    const headings = doc.blocks.flatMap((b) => (b.type === "heading" ? [b.text] : []));
    expect(headings).toEqual(["Deine Antworten", "Verbesserungen", "Headline-Vorschläge", "Hinweise"]);
    const tabelle = doc.blocks.find((b) => b.type === "table");
    expect(tabelle?.type === "table" && tabelle.header).toEqual(["Frage", "Antwort", "Punkte", "Gewicht"]);
    expect(tabelle?.type === "table" && tabelle.rows).toHaveLength(8);
    expect(tabelle?.type === "table" && tabelle.rows[0]).toEqual(["Headline", "Nur Jobtitel und Firma", "1 von 2", "20"]);
    const hinweise = doc.blocks[doc.blocks.length - 1];
    expect(hinweise.type === "list" && hinweise.items).toHaveLength(3);
    expect(HINWEISE).toHaveLength(3);
  });

  it("zählt im Beispiel fünf Fragen, drei Funde und den Hinweis auf die Adresse als Verbesserungen", () => {
    const a = auswerten(KELLER);
    expect(a.score).toBe(42);
    expect(a.stufe).toBe("Solide Basis");
    expect(a.funde.map((f) => f.id)).toEqual(["headline-jobtitel", "about-ich-bin", "about-ohne-kundschaft"]);
    expect(a.verbesserungen.map((v) => v.quelle)).toEqual(["frage", "frage", "frage", "frage", "frage", "fund", "fund", "fund", "url"]);
    expect(a.vorschlaege).toHaveLength(3);
    expect(a.headlineHinweis).toBeNull();
    expect(a.zeilen).toHaveLength(8);
    expect(a.zeilen.reduce((n, z) => n + z.offen, 0)).toBe(100 - 42);
  });

  it("sagt im Dokument, wenn es keine Vorschläge gibt, und lässt die Liste weg", () => {
    const teile = documentParts({ ...KELLER, zielgruppe: "", ergebnis: "", beweis: "" });
    expect(teile.headlines).toEqual([
      { type: "heading", level: 1, text: "Headline-Vorschläge" },
      { type: "paragraph", text: "Für Headline-Vorschläge fehlen Zielgruppe und Ergebnis." },
    ]);
    expect(documentParts(KELLER).headlines[1].type).toBe("list");
  });

  it("sagt bei voller Punktzahl ohne Funde, dass nichts zuerst kommt", () => {
    const voll: LinkedinState = { ...EMPTY_STATE, phase: "result", antworten: alle(2), urlAngepasst: true };
    const md = reportMarkdown(voll);
    expect(md).toContain("Punktwert:** 100 von 100");
    expect(md).toContain("Du hast bei allen acht Fragen die volle Punktzahl.");
    expect(md).toContain("Du hast keine Texte eingefügt.");
    expect(toDocument(voll).firma).toBeUndefined();
    expect(toDocument(voll).filename).toBe("linkedin-profil-betrieb");
  });

  it("nennt, was geprüft wurde, und wie viele Funde es gibt", () => {
    const nur = (headline: string, about: string) => toMarkdown(toDocument({ ...KELLER, headline, about }));
    expect(nur("", "")).toContain("Du hast keine Texte eingefügt.");
    expect(nur("Malermeister", "")).toContain("Geprüft wurde: Headline. Ein Fund.");
    expect(nur("", "Du bekommst Farbe.")).toContain("Geprüft wurde: Info-Text. Es ist nichts aufgefallen.");
    expect(nur("Ich helfe Familien", "Ich bin Maler.")).toContain("Geprüft wurde: Headline und Info-Text. 2 Funde.");
    expect(nur("Malermeister", "")).toContain("Die Funde ändern den Punktwert nicht.");
  });

  it("schreibt die Eingabe fürs CRM lesbar: Antworten oben, eingefügte Texte und Angaben danach", () => {
    const lines = eingabeText(KELLER).split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "Betrieb: Malerei Keller",
      "Branche: Malerei",
      "Headline: Nur Jobtitel und Firma (1 von 2)",
      "Profilbild: Gut erkennbares Gesicht oder Logo, ruhiger Hintergrund (2 von 2)",
    ]);
    expect(lines).toContain("Aktivität: Gar nicht (0 von 2)");
    expect(lines).toContain("Profil-Adresse mit Namen: nein");
    expect(lines).toContain("Eingefügte Headline: Malermeister bei Malerei Keller");
    expect(lines.some((l) => l.startsWith("Eingefügter Anfang des Info-Texts: Ich bin Malermeister"))).toBe(true);
    expect(lines).toContain("Zielgruppe: Familien in Gossau");
    expect(lines).toContain("Ergebnis für die Kundschaft: Fassadenanstrich und Farbberatung");
    expect(lines).toContain("Beleg: Referenzen in Gossau, Flawil und Herisau");
    expect(eingabeText(KELLER)).not.toMatch(/[{}\[\]]|undefined/);
  });

  it("lässt leere Angaben in der Eingabe weg und zählt die Adresse mit", () => {
    const text = eingabeText({ ...EMPTY_STATE, phase: "result", antworten: alle(2), urlAngepasst: true });
    expect(text.split("\n")).toHaveLength(9);
    expect(text).toContain("Profil-Adresse mit Namen: ja");
    expect(text).not.toContain("Betrieb:");
    expect(text).not.toContain("Eingefügte Headline");
    expect(eingabeText(KELLER).length).toBeLessThan(1900);
  });

  it("schreibt die Ausgabe fürs CRM als Markdown mit Punktwert oben", () => {
    const md = reportMarkdown(KELLER);
    expect(md.startsWith("# LinkedIn-Profil-Score\n\n_Punktwert 42 von 100, Stufe «Solide Basis»_")).toBe(true);
    expect(md).toContain("- **Punktwert:** 42 von 100");
    expect(md).toContain("| Frage | Antwort | Punkte | Gewicht |");
    expect(md).toContain("| Headline | Nur Jobtitel und Firma | 1 von 2 | 20 |");
    expect(md).toContain("1. Aktivität (14 Punkte offen). Was fehlt:");
    expect(md).toContain("1. Ich helfe Familien in Gossau bei Fassadenanstrich und Farbberatung – Referenzen in Gossau, Flawil und Herisau");
    expect(md).toContain(SELBSTEINSCHAETZUNG_HINWEIS);
    expect(md).toContain(RICHTWERT_HINWEIS);
    expect(md).toContain(STUFEN_HINWEIS);
    expect(md).not.toMatch(/undefined|\[object/);
  });

  it("verändert den Stand nicht und liefert bei gleichem Stand dasselbe Ergebnis", () => {
    const kopie = JSON.stringify(KELLER);
    expect(reportMarkdown(KELLER)).toBe(reportMarkdown(KELLER));
    toDocument(KELLER);
    auswerten(KELLER);
    expect(JSON.stringify(KELLER)).toBe(kopie);
  });
});

describe("linkedin-profil: Sprache und Sperrliste", () => {
  const alleTexte = (): string[] => {
    const fragen = FRAGEN.flatMap((f) => [f.text, f.kurz, ...f.antworten.flatMap((a) => [a.label, a.fehlt, a.anleitung])]);
    const zustaende: LinkedinState[] = [
      KELLER,
      { ...EMPTY_STATE, phase: "result", antworten: alle(0), urlAngepasst: false, headline: "Ihr kompetenter Ansprechpartner", about: `Ich bin Maler. ${woerter(40)}.` },
      { ...EMPTY_STATE, phase: "result", antworten: alle(2), urlAngepasst: true },
      { ...EMPTY_STATE, phase: "result", antworten: alle(1) },
    ];
    const ok = { antworten: alle(1), headline: "", about: "", zielgruppe: "", ergebnis: "", beweis: "" };
    const meldungen = [
      validate({ ...ok, antworten: {} }),
      validate({ ...ok, antworten: { headline: 1 } }),
      validate({ ...ok, headline: "x".repeat(LIMITS.headline + 1) }),
      validate({ ...ok, about: "x".repeat(LIMITS.about + 1) }),
      validate({ ...ok, zielgruppe: "x".repeat(LIMITS.zielgruppe + 1) }),
      validate({ ...ok, ergebnis: "x".repeat(LIMITS.ergebnis + 1) }),
      validate({ ...ok, beweis: "x".repeat(LIMITS.beweis + 1) }),
      headlineHinweis({ zielgruppe: "", ergebnis: "" }),
      headlineHinweis({ zielgruppe: "a", ergebnis: "" }),
      headlineHinweis({ zielgruppe: "", ergebnis: "a" }),
    ] as string[];
    return [...fragen, URL_LABEL, ...HINWEISE, ...meldungen, ...zustaende.flatMap((s) => [reportMarkdown(s), eingabeText(s)])];
  };

  it("hält die Sperrliste und die Stilregeln in allen eigenen Texten ein", () => {
    for (const text of alleTexte()) {
      expect(brandHits(text)).toEqual([]);
      expect(styleIssues(text)).toEqual([]);
      expect(text).not.toMatch(/\bTools?\b/);
    }
  });

  it("enthält in den eigenen Anleitungen keine Floskel aus dem Textcheck", () => {
    const eigene = FRAGEN.flatMap((f) => f.antworten.flatMap((a) => [a.fehlt, a.anleitung])).concat(HINWEISE);
    for (const text of eigene) expect(findingsOf(text).filter((f) => f.kind === "floskel")).toEqual([]);
  });

  it("macht keine Aussage über Algorithmen oder Reichweite und nennt keine fremden Zahlen", () => {
    const text = alleTexte().join("\n");
    expect(text).not.toMatch(/algorithm|reichweite|viral|mehr aufrufe|prozent/i);
    expect(text).not.toMatch(/\d+\s?%/);
  });

  it("sagt offen, dass das Werkzeug das Profil nicht liest und dass die Zahlen ein Richtwert sind", () => {
    expect(SELBSTEINSCHAETZUNG_HINWEIS).toMatch(/nicht gelesen/);
    expect(RICHTWERT_HINWEIS).toBe("Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn.");
    expect(HINWEISE[0]).toContain("Richtwert von Alperna");
    expect(HINWEISE[2]).toMatch(/Plattform ändert/);
  });
});
