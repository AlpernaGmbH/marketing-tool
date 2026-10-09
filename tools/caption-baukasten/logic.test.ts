import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { parseTextcheckState } from "@/tools/textcheck/logic";
import {
  CTAS,
  CTA_KEYS,
  EMPTY_FELDER,
  EMPTY_STATE,
  FOLD_NOTE,
  HOOKS,
  HOOK_KEYS,
  LIMITS,
  MAX_ENTWUERFE,
  PLATFORMS,
  PLATFORM_KEYS,
  STRUCTURES,
  STRUCTURE_KEYS,
  addDraft,
  ausgabeText,
  beispielFelder,
  captionTexts,
  charCount,
  cleanHashtags,
  compose,
  counterLabel,
  ctaVorschlaege,
  draftTitle,
  eingabeText,
  fieldLabel,
  fill,
  foldHint,
  foldInfo,
  hookExample,
  hookFieldId,
  hookText,
  inputProblem,
  newDraft,
  parseFelder,
  parseState,
  placeholdersOf,
  removeDraft,
  resolveAnrede,
  splitAtFold,
  splitSentences,
  stepProblem,
  switchCta,
  teileOf,
  textcheckState,
  type Entwurf,
  type Felder,
  type Parts,
} from "./logic";

const KELLER = beispielFelder("frage", "problem-loesung", "kommentar", "du");
const felder = (over: Partial<Felder> = {}): Felder => ({ ...KELLER, ...over });
const parts = (over: Partial<Parts> = {}): Parts => ({
  hook: "Hook.",
  teile: ["Eins. Zwei. Drei."],
  cta: "Schreib uns.",
  hashtags: "#a #b",
  ...over,
});
const rep = (ch: string, n: number): string => ch.repeat(n);

/** Alle Muster und Hinweise mit Du- und Sie-Fassung. */
function fassungen(): { where: string; du: string; sie: string }[] {
  return [
    ...HOOK_KEYS.map((k) => ({ where: `Hook ${k}`, ...HOOKS[k].pattern })),
    ...CTA_KEYS.flatMap((k) => CTAS[k].vorschlaege.map((v, i) => ({ where: `Ziel ${k} ${i + 1}`, ...v }))),
    ...STRUCTURE_KEYS.flatMap((k) => STRUCTURES[k].fields.map((f) => ({ where: `Feld ${k}/${f.key}`, ...f.hint }))),
  ];
}

describe("caption-baukasten: fill", () => {
  it("setzt alle Platzhalter ein, auch einen mehrfach vorkommenden", () => {
    expect(fill("[A] und [B], dann wieder [A].", { A: "eins", B: "zwei" })).toBe("eins und zwei, dann wieder eins.");
  });

  it("lässt fehlende, leere und nur aus Leerraum bestehende Werte in Klammern stehen", () => {
    expect(fill("[Zahl] [Begriff] für [Thema]", { Zahl: "Drei", Begriff: "  ", Thema: undefined })).toBe("Drei [Begriff] für [Thema]");
    expect(fill("Hallo [Name]", {})).toBe("Hallo [Name]");
  });

  it("fasst Leerraum und Zeilenumbrüche im Wert zusammen und lässt Sonderzeichen wörtlich stehen", () => {
    expect(fill("Preis: [X]", { X: "  CHF   $& \n $1  " })).toBe("Preis: CHF $& $1");
  });

  it("liest keine Schlüssel aus dem Prototyp", () => {
    expect(fill("[constructor] [toString]", {})).toBe("[constructor] [toString]");
  });

  it("verdoppelt das Satzzeichen des Musters nicht", () => {
    expect(fill("Was, wenn [S]?", { S: "es regnet?" })).toBe("Was, wenn es regnet?");
    expect(fill("Fehler: [F].", { F: "Zu früh gestrichen." })).toBe("Fehler: Zu früh gestrichen.");
    // anderes Zeichen am Ende des Werts: Das Satzzeichen des Musters bleibt
    expect(fill("Was, wenn [S]?", { S: "es regnet." })).toBe("Was, wenn es regnet.?");
  });

  it("entfernt Anführungszeichen und den Schlusspunkt, wenn das Muster schon «» setzt", () => {
    expect(fill("«[Z]», sagte [P].", { Z: "„Es ist hell geworden.“", P: "Frau Meier" })).toBe("«Es ist hell geworden», sagte Frau Meier.");
    expect(fill("«[Z]»", { Z: '""' })).toBe("«[Z]»");
  });

  it("placeholdersOf nennt jeden Platzhalter einmal", () => {
    expect(placeholdersOf("[Zahl] [Begriff] [Zahl] und [Thema mit Leerraum]")).toEqual(["Zahl", "Begriff", "Thema mit Leerraum"]);
    expect(placeholdersOf("Ohne Klammern")).toEqual([]);
  });
});

describe("caption-baukasten: Muster", () => {
  it("hat acht Hook-Formeln, vier Aufbauten mit zwei bis vier Feldern und fünf Ziele mit ein bis zwei Vorschlägen", () => {
    expect(HOOK_KEYS).toHaveLength(8);
    expect(STRUCTURE_KEYS).toHaveLength(4);
    for (const k of STRUCTURE_KEYS) {
      const n = STRUCTURES[k].fields.length;
      expect(n, k).toBeGreaterThanOrEqual(2);
      expect(n, k).toBeLessThanOrEqual(4);
      expect(new Set(STRUCTURES[k].fields.map((f) => f.key)).size, k).toBe(n);
    }
    expect(CTA_KEYS).toHaveLength(5);
    for (const k of CTA_KEYS) {
      expect(CTAS[k].vorschlaege.length, k).toBeGreaterThanOrEqual(1);
      expect(CTAS[k].vorschlaege.length, k).toBeLessThanOrEqual(2);
    }
  });

  it("hat zu jedem Muster eine Du- und eine Sie-Fassung mit denselben Platzhaltern", () => {
    for (const { where, du, sie } of fassungen()) {
      expect(du.trim(), where).not.toBe("");
      expect(sie.trim(), where).not.toBe("");
      expect(placeholdersOf(sie), where).toEqual(placeholdersOf(du));
    }
  });

  it("nennt in der Du-Fassung nie Sie und in der Sie-Fassung nie du", () => {
    for (const { where, du, sie } of fassungen()) {
      expect(du, where).not.toMatch(/\b(?:Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/);
      expect(sie, where).not.toMatch(/\b(?:du|dir|dich|dein|deine|deinen|deinem|deiner|deines)\b/i);
    }
  });

  it("stellt für jede Formel die Platzhalter des Musters als Felder bereit, in beiden Anreden", () => {
    for (const k of HOOK_KEYS) {
      const names = HOOKS[k].fields.map((f) => f.name);
      expect(placeholdersOf(HOOKS[k].pattern.du), k).toEqual(names);
      expect(placeholdersOf(HOOKS[k].pattern.sie), k).toEqual(names);
      expect(new Set(names).size, k).toBe(names.length);
    }
  });

  it("setzt in keinem Muster eine Zahl fest (Zahlen setzt die Person selbst ein)", () => {
    for (const k of HOOK_KEYS) {
      expect(HOOKS[k].pattern.du, k).not.toMatch(/\d/);
      expect(HOOKS[k].pattern.sie, k).not.toMatch(/\d/);
    }
  });

  it("hat in allen Mustern, Hinweisen und Beispielen keinen Treffer der Sperrliste", () => {
    const texts = [
      ...fassungen().flatMap((f) => [f.du, f.sie]),
      ...HOOK_KEYS.flatMap((k) => [HOOKS[k].label, HOOKS[k].beschreibung, ...HOOKS[k].fields.flatMap((f) => [f.name, f.hint, f.beispiel]), hookExample(k, "du"), hookExample(k, "sie")]),
      ...STRUCTURE_KEYS.flatMap((k) => [STRUCTURES[k].label, STRUCTURES[k].beschreibung, ...STRUCTURES[k].fields.flatMap((f) => [f.label, f.beispiel])]),
      ...CTA_KEYS.flatMap((k) => [CTAS[k].label, CTAS[k].beschreibung]),
      FOLD_NOTE,
      ...PLATFORM_KEYS.flatMap((p) => [PLATFORMS[p].label, PLATFORMS[p].copyLabel, foldHint(p, 0), foldHint(p, 1)]),
    ];
    for (const t of texts) expect(brandHits(t), t).toEqual([]);
    // auch keine Ausrufezeichen, kein jetzt, kein Gedankenstrich
    for (const t of texts) expect(t, t).not.toMatch(/!|\bjetzt\b|—/i);
  });

  it("füllt jede Formel mit den Beispielwerten ganz, ohne offene Klammern, in beiden Anreden", () => {
    for (const k of HOOK_KEYS) {
      for (const a of ["du", "sie"] as const) {
        const text = hookExample(k, a);
        expect(placeholdersOf(text), `${k} ${a}`).toEqual([]);
        expect(text.length, `${k} ${a}`).toBeGreaterThan(20);
      }
    }
    expect(hookExample("zahl", "du")).toBe("Drei Punkte, die du bei einer Offerte für den Neuanstrich prüfen solltest.");
    expect(hookExample("zahl", "sie")).toBe("Drei Punkte, die Sie bei einer Offerte für den Neuanstrich prüfen sollten.");
    expect(hookExample("gestaendnis", "sie")).toContain("Wir müssen Ihnen etwas gestehen");
  });

  it("hookText lässt offene Felder in Klammern und wendet die Schweizer Schreibweise an", () => {
    expect(hookText("zahl", "du", { Zahl: "Drei", Thema: "Preisen über 5%" })).toBe("Drei [Begriff], die du bei Preisen über 5 % prüfen solltest.");
    expect(hookText("frage", "du", { Situation: 'ein "Profi" kommt' })).toBe("Was machst du, wenn ein «Profi» kommt?");
    expect(hookFieldId("Geständnis")).toBe("cb-hook-gestaendnis");
  });

  it("fieldLabel kennzeichnet freiwillige Felder", () => {
    expect(fieldLabel(STRUCTURES.anleitung.fields[3])).toBe("Tipp (freiwillig)");
    expect(fieldLabel(STRUCTURES.anleitung.fields[0])).toBe("Schritt 1");
  });
});

describe("caption-baukasten: Sätze und Hauptteil", () => {
  it("trennt Sätze nach Punkt, Fragezeichen und Ausrufezeichen", () => {
    expect(splitSentences("Erster Satz. Zweiter Satz? Dritter Satz! Vierter.")).toEqual(["Erster Satz.", "Zweiter Satz?", "Dritter Satz!", "Vierter."]);
    expect(splitSentences("Ohne Satzzeichen")).toEqual(["Ohne Satzzeichen"]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("trennt nicht nach Kürzeln, Ordnungszahlen und Aufzählungszahlen", () => {
    expect(splitSentences("Wir malen z. B. Fassaden in St. Gallen. Danach kommt Wil.")).toEqual(["Wir malen z. B. Fassaden in St. Gallen.", "Danach kommt Wil."]);
    expect(splitSentences("Am 3. Oktober ist Tag der offenen Tür. Komm vorbei.")).toEqual(["Am 3. Oktober ist Tag der offenen Tür.", "Komm vorbei."]);
    expect(splitSentences("1. Wände abwaschen. 2. Risse füllen.")).toEqual(["1. Wände abwaschen.", "2. Risse füllen."]);
    expect(splitSentences("Seit 2019. Heute malen wir.")).toEqual(["Seit 2019.", "Heute malen wir."]);
  });

  it("nimmt Anführungszeichen nach dem Punkt zum Satz", () => {
    expect(splitSentences("Er sagte «Es passt.» Dann ging er.")).toEqual(["Er sagte «Es passt.»", "Dann ging er."]);
  });

  it("teileOf nummeriert ab zwei ausgefüllten Punkten fortlaufend und überspringt leere", () => {
    expect(teileOf("drei-punkte", { punkt1: "Eins.", punkt2: "", punkt3: "Drei." })).toEqual(["1. Eins.", "2. Drei."]);
    expect(teileOf("drei-punkte", { punkt1: "Nur einer." })).toEqual(["Nur einer."]);
    expect(teileOf("drei-punkte", {})).toEqual([]);
  });

  it("teileOf setzt dem Tipp ein «Tipp: » voran und nummeriert ihn nicht", () => {
    expect(teileOf("anleitung", { schritt1: "A.", schritt2: "B.", schritt3: "C.", tipp: "Langsam." })).toEqual(["1. A.", "2. B.", "3. C.", "Tipp: Langsam."]);
    expect(teileOf("problem-loesung", { problem: "P.", loesung: "L." })).toEqual(["P.", "L."]);
  });
});

describe("caption-baukasten: compose", () => {
  it("Instagram: jeder Satz auf eine eigene Zeile, Leerzeilen zwischen den Blöcken, Hashtags zuletzt", () => {
    expect(compose("instagram", parts())).toBe("Hook.\n\nEins.\nZwei.\nDrei.\n\nSchreib uns.\n\n#a #b");
  });

  it("Instagram: mehrere Teile durch Leerzeile getrennt, eigene Absätze bleiben Absätze", () => {
    const text = compose("instagram", parts({ teile: ["A eins. A zwei.", "B eins.\n\nC eins. C zwei."], hashtags: "" }));
    expect(text).toBe("Hook.\n\nA eins.\nA zwei.\n\nB eins.\n\nC eins.\nC zwei.\n\nSchreib uns.");
  });

  it("LinkedIn: kurze Absätze mit höchstens zwei Sätzen, keine Hashtags", () => {
    const text = compose("linkedin", parts({ teile: ["Eins. Zwei. Drei. Vier. Fünf."] }));
    expect(text).toBe("Hook.\n\nEins. Zwei.\n\nDrei. Vier.\n\nFünf.\n\nSchreib uns.");
    expect(text).not.toContain("#");
  });

  it("LinkedIn: jede eingegebene Zeile bleibt ein eigener Absatz", () => {
    const text = compose("linkedin", parts({ teile: ["- Erstens\n- Zweitens"] }));
    expect(text).toBe("Hook.\n\n- Erstens\n\n- Zweitens\n\nSchreib uns.");
  });

  it("Facebook: Teile als Absätze, wie eingegeben, keine Hashtags", () => {
    const text = compose("facebook", parts({ teile: ["Eins. Zwei.\nDrei.", "Vier."] }));
    expect(text).toBe("Hook.\n\nEins. Zwei.\nDrei.\n\nVier.\n\nSchreib uns.");
    expect(text).not.toContain("#");
  });

  it("Google-Beitrag: keine Leerzeilen und keine Hashtags", () => {
    const text = compose("google", parts({ teile: ["Eins.\n\nZwei.", "Drei."], cta: "A.\n\n\nB." }));
    expect(text).toBe("Hook.\nEins.\nZwei.\nDrei.\nA.\nB.");
    expect(text).not.toContain("\n\n");
    expect(text).not.toContain("#");
  });

  it("hängt Hashtags nur bei Instagram an", () => {
    const p = parts({ hashtags: "malerei Gossau" });
    expect(compose("instagram", p).endsWith("\n\n#malerei #Gossau")).toBe(true);
    for (const platform of ["linkedin", "facebook", "google"] as const) expect(compose(platform, p), platform).not.toContain("#");
  });

  it("wendet Schweizer Schreibweise auf alle Texte an und kürzt Leerraum", () => {
    const text = compose("facebook", parts({ hook: '  Der "beste" Preis ist 8%  ', teile: ["Die Straße kostet CHF 1000.   "], cta: "Ruf an.\r\n" }));
    expect(text).toBe("Der «beste» Preis ist 8 %\n\nDie Strasse kostet CHF 1'000.\n\nRuf an.");
  });

  it("lässt leere Teile weg und kommt mit nur einem Hook aus", () => {
    expect(compose("instagram", parts({ teile: ["", "  "], cta: "", hashtags: "" }))).toBe("Hook.");
    expect(compose("google", { hook: "", teile: [], cta: "", hashtags: "" })).toBe("");
  });

  it("captionTexts liefert die vier Texte; offene Felder bleiben im Hook in Klammern", () => {
    const texte = captionTexts(felder({ hook: {} }));
    expect(Object.keys(texte)).toEqual([...PLATFORM_KEYS]);
    for (const p of PLATFORM_KEYS) expect(texte[p], p).toContain("[Situation]");
  });

  it("setzt die Instagram-Caption der Malerei Keller so zusammen (Beispiel im Seitentext)", () => {
    const texte = captionTexts(KELLER);
    expect(texte.instagram).toBe(
      [
        "Was machst du, wenn der Anstrich schon nach wenigen Wintern abblättert?",
        "",
        "Meist ist der Untergrund beim Streichen noch feucht.",
        "Dann haftet die Farbe schlecht.",
        "",
        "Wir messen die Feuchtigkeit vor dem ersten Strich.",
        "Erst wenn die Wand trocken ist, streichen wir.",
        "",
        "Schreib uns in die Kommentare, was du dazu denkst.",
        "",
        "#MalereiKeller #Gossau #Fassadenanstrich",
      ].join("\n"),
    );
    expect(brandHits(texte.instagram)).toEqual([]);
  });

  it("liefert die Zahlen des Beispiels im Seitentext (content/tools/caption-baukasten.md)", () => {
    const texte = captionTexts(KELLER);
    expect(counterLabel("instagram", texte.instagram)).toBe("350 Zeichen, davon 125 vor der Faltkante");
    expect(charCount(texte.linkedin)).toBe(308);
    expect(charCount(texte.google)).toBe(305);
    // Vor der Faltkante stehen der Hook und der erste Satz des Hauptteils
    expect(splitAtFold("instagram", texte.instagram).before).toBe(
      "Was machst du, wenn der Anstrich schon nach wenigen Wintern abblättert?\n\nMeist ist der Untergrund beim Streichen noch feucht.",
    );
    expect(texte.linkedin).not.toContain("#");
    expect(texte.google).not.toContain("\n\n");
  });
});

describe("caption-baukasten: Faltkante", () => {
  it("Instagram: genau 125 Zeichen liegen vor der Faltkante, 126 haben ein Zeichen dahinter", () => {
    expect(foldInfo("instagram", rep("a", 125))).toEqual({ limit: 125, before: 125, over: 0 });
    expect(foldInfo("instagram", rep("a", 126))).toEqual({ limit: 125, before: 125, over: 1 });
    expect(foldInfo("instagram", rep("a", 124))).toEqual({ limit: 125, before: 124, over: 0 });
    expect(foldInfo("instagram", "")).toEqual({ limit: 125, before: 0, over: 0 });
  });

  it("LinkedIn: 210 Zeichen, 211 haben eins dahinter", () => {
    expect(foldInfo("linkedin", rep("a", 210))).toEqual({ limit: 210, before: 210, over: 0 });
    expect(foldInfo("linkedin", rep("a", 211))).toEqual({ limit: 210, before: 210, over: 1 });
  });

  it("LinkedIn: Die Faltkante liegt am Ende der dritten Zeile, wenn die vor 210 Zeichen endet", () => {
    expect(foldInfo("linkedin", "a\nb\nc\nd")).toEqual({ limit: 5, before: 5, over: 2 });
    // Leerzeilen zählen als Zeile: Hook, Leerzeile, erste Zeile des Hauptteils
    expect(foldInfo("linkedin", "Hook\n\nErste Zeile\n\nZweite")).toEqual({ limit: 17, before: 17, over: 8 });
  });

  it("LinkedIn: Endet die dritte Zeile nach 210 Zeichen, gilt die Zeichengrenze; bei nur drei Zeilen gibt es keine Zeilenkante", () => {
    const long = `${rep("a", 100)}\n${rep("b", 100)}\n${rep("c", 100)}\nd`;
    expect(foldInfo("linkedin", long)).toEqual({ limit: 210, before: 210, over: charCount(long) - 210 });
    expect(foldInfo("linkedin", "a\nb\nc")).toEqual({ limit: 210, before: 5, over: 0 });
  });

  it("Facebook: 480 und 481 Zeichen", () => {
    expect(foldInfo("facebook", rep("a", 480))).toEqual({ limit: 480, before: 480, over: 0 });
    expect(foldInfo("facebook", rep("a", 481))).toEqual({ limit: 480, before: 480, over: 1 });
  });

  it("Facebook kennt keine Zeilenkante: Mehrzeiler zählen nach Zeichen", () => {
    expect(foldInfo("facebook", "a\nb\nc\nd\ne")).toEqual({ limit: 480, before: 9, over: 0 });
  });

  it("Google-Beitrag: 1'500 sind die Grenze", () => {
    expect(foldInfo("google", rep("a", 1500))).toEqual({ limit: 1500, before: 1500, over: 0 });
    expect(foldInfo("google", rep("a", 1501))).toEqual({ limit: 1500, before: 1500, over: 1 });
  });

  it("zählt Unicode-Zeichen, nicht UTF-16-Einheiten", () => {
    expect(charCount("😀")).toBe(1);
    expect(foldInfo("instagram", rep("😀", 125))).toEqual({ limit: 125, before: 125, over: 0 });
    expect(foldInfo("instagram", rep("😀", 126)).over).toBe(1);
  });

  it("splitAtFold schneidet an derselben Stelle, auch mitten im Satz", () => {
    const text = `${rep("a", 120)} bcdefghij`;
    const { before, after } = splitAtFold("instagram", text);
    expect(charCount(before)).toBe(125);
    expect(before + after).toBe(text);
    expect(splitAtFold("instagram", "kurz")).toEqual({ before: "kurz", after: "" });
  });

  it("counterLabel nennt Gesamtzahl und Zahl vor der Faltkante, bei Google die Grenze", () => {
    expect(counterLabel("instagram", rep("a", 126))).toBe("126 Zeichen, davon 125 vor der Faltkante");
    expect(counterLabel("instagram", "Hallo")).toBe("5 Zeichen, davon 5 vor der Faltkante");
    expect(counterLabel("google", rep("a", 1600))).toBe("1'600 Zeichen, davon 1'500 innerhalb der Grenze von 1'500");
    expect(counterLabel("linkedin", "")).toBe("0 Zeichen, davon 0 vor der Faltkante");
  });

  it("foldHint sagt, was an der Stelle passiert", () => {
    expect(foldHint("instagram", 3)).toContain("«mehr»");
    expect(foldHint("instagram", 0)).toContain("vor der Faltkante");
    expect(foldHint("google", 3)).toContain("Grenze");
  });
});

describe("caption-baukasten: Hashtags", () => {
  it("setzt ein # davor, trennt an Leerraum und Komma und entfernt Duplikate", () => {
    expect(cleanHashtags("malerei, #Gossau  #MALEREI;ostschweiz")).toBe("#malerei #Gossau #ostschweiz");
  });

  it("entfernt Sonderzeichen und macht aus ß ss; leer bleibt leer", () => {
    expect(cleanHashtags("#St-Gallen #Straße! ## #")).toBe("#StGallen #Strasse");
    expect(cleanHashtags("   ")).toBe("");
    expect(cleanHashtags("")).toBe("");
  });
});

describe("caption-baukasten: Aufforderung und Anrede", () => {
  it("liefert die Vorschläge in der gewählten Anrede", () => {
    expect(ctaVorschlaege("kommentar", "du")[0]).toBe("Schreib uns in die Kommentare, was du dazu denkst.");
    expect(ctaVorschlaege("kommentar", "sie")[0]).toBe("Schreiben Sie uns in die Kommentare, was Sie dazu denken.");
  });

  it("switchCta stellt einen unveränderten Vorschlag um und lässt eigenen Text stehen", () => {
    expect(switchCta("nachricht", "Du hast eine Frage dazu? Schick uns eine Direktnachricht.", "du", "sie")).toBe(
      "Sie haben eine Frage dazu? Schicken Sie uns eine Direktnachricht.",
    );
    expect(switchCta("nachricht", "  Schreib uns eine Nachricht, wir antworten persönlich.  ", "du", "sie")).toBe(
      "Schreiben Sie uns eine Nachricht, wir antworten persönlich.",
    );
    expect(switchCta("nachricht", "Ruf uns an.", "du", "sie")).toBe("Ruf uns an.");
    expect(switchCta("nachricht", "", "du", "sie")).toBe("");
    // Vorschlag eines anderen Ziels zählt nicht
    expect(switchCta("profil", "Schreib uns eine Nachricht, wir antworten persönlich.", "du", "sie")).toBe("Schreib uns eine Nachricht, wir antworten persönlich.");
  });

  it("resolveAnrede: gewählt vor Profil vor Du", () => {
    expect(resolveAnrede("sie", "du")).toBe("sie");
    expect(resolveAnrede("", "sie")).toBe("sie");
    expect(resolveAnrede("", "")).toBe("du");
  });

  it("setzt Hook und Aufforderung in der Anrede der Felder zusammen", () => {
    const sie = captionTexts(beispielFelder("frage", "problem-loesung", "kommentar", "sie")).facebook;
    expect(sie).toContain("Was machen Sie, wenn");
    expect(sie).toContain("Schreiben Sie uns in die Kommentare");
  });
});

describe("caption-baukasten: Prüfung", () => {
  it("lässt vollständige Angaben durch", () => {
    expect(inputProblem(KELLER)).toBeNull();
    for (const hook of HOOK_KEYS) for (const aufbau of STRUCTURE_KEYS) {
      expect(inputProblem(beispielFelder(hook, aufbau, "link", "sie")), `${hook} ${aufbau}`).toBeNull();
    }
  });

  it("Schritt 1: nennt fehlende Platzhalter und springt in das erste Feld", () => {
    const f = felder({ formel: "zahl", hook: { Zahl: "Drei", Begriff: "  " } });
    expect(stepProblem(1, f)).toEqual({ step: 1, message: "Im Hook fehlt noch: Begriff, Thema.", fieldId: "cb-hook-begriff" });
    expect(inputProblem(f)?.step).toBe(1);
  });

  it("Schritt 1 verlangt nur die Felder der gewählten Formel", () => {
    expect(stepProblem(1, felder({ formel: "frage", hook: { Situation: "es regnet", Thema: "" } }))).toBeNull();
  });

  it("Schritt 2: freiwillige Felder dürfen leer sein, die übrigen nicht", () => {
    const teile = { schritt1: "A", schritt2: "B", schritt3: "C" };
    expect(stepProblem(2, felder({ aufbau: "anleitung", teile }))).toBeNull();
    expect(stepProblem(2, felder({ aufbau: "anleitung", teile: { schritt1: "A" } }))).toEqual({
      step: 2,
      message: "Im Hauptteil fehlt noch: Schritt 2, Schritt 3.",
      fieldId: "cb-teil-schritt2",
    });
    expect(stepProblem(2, felder({ teile: {} }))?.message).toBe("Im Hauptteil fehlt noch: Problem, Lösung.");
  });

  it("Schritt 3: verlangt eine Aufforderung ohne offene Klammern", () => {
    expect(stepProblem(3, felder({ cta: "  " }))).toEqual({ step: 3, message: "Die Aufforderung fehlt. Wähle einen Vorschlag oder schreib eine eigene.", fieldId: "cb-cta" });
    expect(stepProblem(3, felder({ cta: "Alle Angaben hier: [Link]" }))?.message).toContain("[Link]");
    expect(stepProblem(3, felder({ cta: "Alle Angaben hier: www.malerei-keller.ch" }))).toBeNull();
  });

  it("meldet das erste Problem über alle Schritte", () => {
    expect(inputProblem(EMPTY_FELDER)?.step).toBe(1);
    expect(inputProblem(felder({ teile: {} }))?.step).toBe(2);
    expect(inputProblem(felder({ cta: "" }))?.step).toBe(3);
  });
});

describe("caption-baukasten: Entwürfe", () => {
  const at = (n: number) => new Date(Date.UTC(2026, 9, 5, 8, 0, n));
  const make = (n: number): Entwurf => newDraft(felder(), at(n));

  it("legt einen Entwurf mit Titel, Zeit, Feldern und den vier Texten an", () => {
    const d = make(0);
    expect(d.titel).toBe("Was machst du, wenn der Anstrich schon nach wenigen Wintern…");
    expect(charCount(d.titel)).toBeLessThanOrEqual(60);
    expect(d.gespeichertAm).toBe("2026-10-05T08:00:00.000Z");
    expect(d.felder).toEqual(felder());
    expect(d.texte).toEqual(captionTexts(felder()));
    expect(d.id).toMatch(/^e-/);
  });

  it("kürzt lange Titel auf 60 Zeichen mit «…» und kennt den leeren Titel", () => {
    const t = draftTitle(rep("wort ", 30));
    expect(charCount(t)).toBe(60);
    expect(t.endsWith("…")).toBe(true);
    expect(draftTitle("Kurz")).toBe("Kurz");
    expect(draftTitle("   ")).toBe("Ohne Titel");
    expect(draftTitle(rep("a", 60))).toBe(rep("a", 60));
  });

  it("vergibt keine ID doppelt, auch bei gleicher Sekunde", () => {
    const a = newDraft(felder(), at(0));
    const b = newDraft(felder(), at(0), [a]);
    expect(b.id).not.toBe(a.id);
  });

  it("speichert den neuesten Entwurf zuerst und höchstens zehn: der älteste fällt weg", () => {
    let list: Entwurf[] = [];
    for (let n = 0; n < MAX_ENTWUERFE; n++) list = addDraft(list, make(n));
    expect(list).toHaveLength(10);
    const oldest = list[list.length - 1];
    const eleventh = make(10);
    list = addDraft(list, eleventh);
    expect(list).toHaveLength(10);
    expect(list[0]).toBe(eleventh);
    expect(list.some((d) => d.id === oldest.id)).toBe(false);
    expect(list.map((d) => d.gespeichertAm)[9]).toBe(at(1).toISOString());
  });

  it("ersetzt einen Entwurf mit derselben ID statt ihn doppelt zu führen", () => {
    const d = make(0);
    expect(addDraft([d], { ...d, titel: "Neu" })).toEqual([{ ...d, titel: "Neu" }]);
  });

  it("löscht nach ID; eine unbekannte ID ändert nichts", () => {
    const list = addDraft(addDraft([], make(0)), make(1));
    expect(removeDraft(list, list[0].id)).toEqual([list[1]]);
    expect(removeDraft(list, "gibt-es-nicht")).toEqual(list);
  });
});

describe("caption-baukasten: parseState", () => {
  const complete = {
    formel: "frage",
    aufbau: "problem-loesung",
    ziel: "kommentar",
    anrede: "du",
    hook: { Situation: "es regnet" },
    teile: { problem: "P.", loesung: "L." },
    cta: "Schreib uns.",
    hashtags: "#a",
  };

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 42, [], {}, { v: 2 }, { v: "1" }, { v: 1, felder: "x", entwuerfe: "y" }]) {
      const s = parseState(raw);
      expect(s.phase, JSON.stringify(raw)).toBe("edit");
      expect(s.entwuerfe, JSON.stringify(raw)).toEqual([]);
    }
    expect(parseState(null)).toEqual(EMPTY_STATE);
    expect(parseState({ v: 1 }).felder).toEqual(EMPTY_FELDER);
  });

  it("nimmt «result» nur mit vollständigen Angaben an", () => {
    expect(parseState({ v: 1, phase: "result", felder: complete }).phase).toBe("result");
    expect(parseState({ v: 1, phase: "result", felder: { ...complete, cta: "" } }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "result" }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "edit", felder: complete }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "quatsch", felder: complete }).phase).toBe("edit");
  });

  it("verwirft unbekannte Schlüssel und Werte falschen Typs", () => {
    const f = parseFelder({
      ...complete,
      formel: "gibt-es-nicht",
      aufbau: 7,
      ziel: null,
      anrede: "ihr",
      hook: { Situation: "ok", Unbekannt: "weg", Zahl: 5, __proto__: "x" },
      teile: { problem: ["Liste"], loesung: "ok", fremd: "weg" },
      cta: 5,
      hashtags: {},
    });
    expect(f).toEqual({
      modus: "selbst", // Stände ohne Weg stammen aus der Zeit vor dem 09.10.2026
      fragen: { idee: "", kategorie: "", ziel: "kommentar" },
      ki: null,
      formel: "frage",
      aufbau: "problem-loesung",
      ziel: "kommentar",
      anrede: "",
      hook: { Situation: "ok" },
      teile: { loesung: "ok" },
      cta: "",
      hashtags: "",
    });
  });

  it("kürzt Texte auf die Grenzen", () => {
    const f = parseFelder({ ...complete, hook: { Situation: rep("a", 500) }, teile: { problem: rep("b", 2000) }, cta: rep("c", 900), hashtags: rep("d", 900) });
    expect(f.hook.Situation).toHaveLength(LIMITS.hook);
    expect(f.teile.problem).toHaveLength(LIMITS.teil);
    expect(f.cta).toHaveLength(LIMITS.cta);
    expect(f.hashtags).toHaveLength(LIMITS.hashtags);
  });

  it("behält höchstens zehn gültige Entwürfe und wirft kaputte und doppelte weg", () => {
    const d = (id: string, over: Record<string, unknown> = {}) => ({ id, titel: `T ${id}`, gespeichertAm: "2026-10-05T08:00:00.000Z", felder: complete, ...over });
    const ok = Array.from({ length: 12 }, (_, i) => d(`id${i}`));
    const bad = [null, "x", d(""), d("zeit", { gespeichertAm: "gestern" }), d("leer", { felder: { ...complete, cta: "" } }), d("id0")];
    const s = parseState({ v: 1, felder: complete, entwuerfe: [...bad, ...ok] });
    expect(s.entwuerfe).toHaveLength(10);
    expect(s.entwuerfe.map((e) => e.id)).toEqual(Array.from({ length: 10 }, (_, i) => `id${i}`));
  });

  it("rechnet fehlende Texte eines Entwurfs aus den Feldern nach", () => {
    const s = parseState({ v: 1, felder: complete, entwuerfe: [{ id: "a", gespeichertAm: "2026-10-05T08:00:00.000Z", felder: complete, texte: { instagram: "gespeichert", linkedin: 5 } }] });
    const e = s.entwuerfe[0];
    expect(e.texte.instagram).toBe("gespeichert");
    expect(e.texte.linkedin).toBe(captionTexts(e.felder).linkedin);
    expect(e.titel).toBe("Was machst du, wenn es regnet?");
  });

  it("übersteht einen Durchlauf durch JSON", () => {
    const d = make();
    const s = parseState(JSON.parse(JSON.stringify({ v: 1, phase: "result", felder: complete, entwuerfe: [d] })));
    expect(s.phase).toBe("result");
    expect(s.entwuerfe).toEqual([d]);
  });

  function make(): Entwurf {
    return newDraft(parseFelder(complete), new Date(Date.UTC(2026, 9, 5, 8)));
  }
});

describe("caption-baukasten: CRM und Übergabe", () => {
  it("eingabeText nennt Formel, Anrede, Aufbau, Ziel und alle Felder, eine je Zeile", () => {
    const lines = eingabeText(KELLER).split("\n");
    expect(lines).toEqual([
      "Hook-Formel: Frage",
      "Anrede: Du",
      "Situation: der Anstrich schon nach wenigen Wintern abblättert",
      "Aufbau: Problem und Lösung",
      "Problem: Meist ist der Untergrund beim Streichen noch feucht. Dann haftet die Farbe schlecht.",
      "Lösung: Wir messen die Feuchtigkeit vor dem ersten Strich. Erst wenn die Wand trocken ist, streichen wir.",
      "Ziel: Kommentar",
      "Aufforderung: Schreib uns in die Kommentare, was du dazu denkst.",
      "Hashtags: #MalereiKeller #Gossau #Fassadenanstrich",
    ]);
  });

  it("eingabeText kommt mit leeren Feldern aus und führt jeden Zeilenumbruch in eine Zeile", () => {
    const text = eingabeText(felder({ aufbau: "anleitung", teile: { schritt1: "A\nB" }, hashtags: "", anrede: "sie" }));
    expect(text).toContain("Anrede: Sie");
    expect(text).toContain("Schritt 1: A B");
    expect(text).toContain("Schritt 2: keine Angabe");
    expect(text).toContain("Tipp: keine Angabe");
    expect(text).toContain("Hashtags: keine");
    expect(text.split("\n").every((l) => l.includes(": "))).toBe(true);
  });

  it("ausgabeText nennt die vier Texte mit Plattform und Zeichenzahl", () => {
    const texte = captionTexts(KELLER);
    const out = ausgabeText(texte);
    expect(out.startsWith(`Instagram (${charCount(texte.instagram)} Zeichen)\nWas machst du`)).toBe(true);
    for (const p of PLATFORM_KEYS) {
      expect(out).toContain(`${PLATFORMS[p].label} (`);
      expect(out).toContain(texte[p]);
    }
    expect(out.indexOf("Instagram")).toBeLessThan(out.indexOf("LinkedIn"));
    expect(out.indexOf("Facebook")).toBeLessThan(out.indexOf("Google-Beitrag"));
  });

  it("der Stand für den Textcheck wird dort als Eingabe gelesen", () => {
    const state = textcheckState("Hallo Welt.");
    expect(state).toEqual({ v: 1, phase: "edit", text: "Hallo Welt." });
    expect(parseTextcheckState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});
