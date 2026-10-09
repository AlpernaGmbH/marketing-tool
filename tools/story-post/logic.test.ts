import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import {
  EMPTY_FELDER,
  EMPTY_STATE,
  FELDER,
  HOOK_MAX,
  INSTAGRAM_MAX,
  INSTAGRAM_TOO_LONG,
  LESEZEIT_NOTE,
  PFLICHT_KEYS,
  RICHTWERT_NOTE,
  SAETZE_NOTE,
  absaetze,
  ausgabeText,
  beispielFelder,
  beispielOf,
  charCount,
  compose,
  effectiveHook,
  eingabeText,
  fieldLabel,
  foldInfo,
  hookSaetze,
  hooks,
  instagram,
  instagramZeile,
  parseFelder,
  parseState,
  platzhalter,
  readingTime,
  readyCount,
  shorten,
  tidy,
  toDocument,
  validate,
  wordCount,
  type Absatz,
  type AbsatzKey,
  type Felder,
  type HookWahl,
} from "./logic";

const KELLER = beispielFelder("du");
const felder = (over: Partial<Felder> = {}): Felder => ({ ...KELLER, ...over });
const story = (over: Partial<Felder> = {}, hook: HookWahl = 1, anrede: "du" | "sie" = "du") => compose({ anrede, felder: felder(over), hook });

/** Ein Satz mit genau n Zeichen, Wörter aus vier Buchstaben, Punkt am Ende. */
const sent = (n: number): string => "abcd ".repeat(Math.ceil(n / 5) + 1).slice(0, n - 1).replace(/ $/, "e") + ".";
const para = (key: AbsatzKey, len: number): Absatz => ({ key, text: "x".repeat(len) });
const KEYS: AbsatzKey[] = ["hook", "ausgangslage", "problem", "wendepunkt", "ergebnis", "lehre", "bezug"];
/** Absätze mit den Längen in `lens` (in der Reihenfolge der Geschichte). */
const paras = (lens: Partial<Record<AbsatzKey, number>>): Absatz[] => KEYS.filter((k) => lens[k] !== undefined).map((k) => para(k, lens[k]!));
const total = (teile: Absatz[]): number => teile.map((a) => a.text).join("\n\n").length;

// ---- Felder und Prüfung ------------------------------------------------------------------------

describe("story-post: Felder", () => {
  it("hat sechs Felder in der Reihenfolge der Geschichte, nur der Bezug ist freiwillig, Grenzen 20 bis 400", () => {
    expect(FELDER.map((f) => f.key)).toEqual(["ausgangslage", "problem", "wendepunkt", "ergebnis", "lehre", "bezug"]);
    expect(FELDER.filter((f) => !f.pflicht).map((f) => f.key)).toEqual(["bezug"]);
    expect(PFLICHT_KEYS).toHaveLength(5);
    for (const f of FELDER) {
      expect([f.min, f.max]).toEqual([f.pflicht ? 20 : 10, 400]);
      expect(f.hinweis).not.toBe("");
      expect(f.beispiel.length).toBeGreaterThanOrEqual(20);
    }
  });

  it("beschriftet das freiwillige Feld mit dem Zusatz und stellt das Beispiel des Bezugs auf die Anrede um", () => {
    expect(fieldLabel(FELDER[0])).toBe("Ausgangslage");
    expect(fieldLabel(FELDER[5])).toBe("Bezug zur Leserin (freiwillig)");
    expect(beispielOf(FELDER[5], "du")).toBe("Wie ist das bei deinem Haus?");
    expect(beispielOf(FELDER[5], "sie")).toBe("Wie ist das bei Ihrem Haus?");
    expect(beispielOf(FELDER[0], "sie")).toBe(FELDER[0].beispiel);
  });

  it("besteht die Prüfung mit den Beispielen der Malerei Keller, in Du und Sie", () => {
    expect(validate(beispielFelder("du"))).toEqual([]);
    expect(validate(beispielFelder("sie"))).toEqual([]);
  });
});

describe("story-post: validate", () => {
  it("meldet jedes leere Pflichtfeld und lässt den Bezug leer zu", () => {
    const p = validate(EMPTY_FELDER);
    expect(p.map((x) => x.key)).toEqual(["ausgangslage", "problem", "wendepunkt", "ergebnis", "lehre"]);
    expect(p[0]).toEqual({ key: "ausgangslage", fieldId: "sp-ausgangslage", message: "«Ausgangslage» fehlt noch." });
    expect(p[1].message).toBe("«Problem oder Spannung» fehlt noch.");
  });

  it("zählt nur Leerraum als leer", () => {
    expect(validate(felder({ ergebnis: " \n\t  " })).map((x) => x.message)).toEqual(["«Ergebnis» fehlt noch."]);
  });

  it("prüft die Grenzen genau: 19 zu kurz, 20 und 400 gültig, 401 zu lang", () => {
    expect(validate(felder({ lehre: "a".repeat(19) })).map((x) => x.message)).toEqual(["«Lehre» ist zu kurz: mindestens 20 Zeichen, du hast 19."]);
    expect(validate(felder({ lehre: "a".repeat(20) }))).toEqual([]);
    expect(validate(felder({ lehre: "a".repeat(400) }))).toEqual([]);
    expect(validate(felder({ lehre: "a".repeat(401) })).map((x) => x.message)).toEqual(["«Lehre» ist zu lang: höchstens 400 Zeichen, du hast 401."]);
  });

  it("wendet beim freiwilligen Bezug eine kürzere Untergrenze an (10 Zeichen), sobald er gefüllt ist", () => {
    expect(validate(felder({ bezug: "" }))).toEqual([]);
    expect(validate(felder({ bezug: "Kennst du das?" }))).toEqual([]);
    expect(validate(felder({ bezug: "a".repeat(10) }))).toEqual([]);
    expect(validate(felder({ bezug: "a".repeat(9) })).map((x) => x.message)).toEqual([
      "«Bezug zur Leserin» ist zu kurz: mindestens 10 Zeichen, du hast 9.",
    ]);
    expect(validate(felder({ bezug: "a".repeat(401) }))).toHaveLength(1);
  });

  it("meldet mehrere Fehler in der Reihenfolge der Felder", () => {
    const p = validate(felder({ problem: "kurz", lehre: "", ausgangslage: "a".repeat(500) }));
    expect(p.map((x) => x.key)).toEqual(["ausgangslage", "problem", "lehre"]);
  });

  it("zählt nach dem Aufräumen und in Unicode-Zeichen", () => {
    // Zehn Wörter mit vielen Leerzeichen und Umbrüchen: nach tidy zählt nur ein Leerzeichen
    expect(validate(felder({ lehre: "Erst   messen,\n\n dann    streichen." }))).toEqual([]);
    expect(validate(felder({ lehre: "ab\n\n\n\ncd" })).map((x) => x.message)).toEqual(["«Lehre» ist zu kurz: mindestens 20 Zeichen, du hast 5."]);
    // Zwanzig Emojis sind zwanzig Zeichen (40 UTF-16-Einheiten)
    expect(validate(felder({ lehre: "😀".repeat(20) }))).toEqual([]);
  });

  it("zählt die bereiten Pflichtfelder", () => {
    expect(readyCount(EMPTY_FELDER)).toBe(0);
    expect(readyCount(KELLER)).toBe(5);
    expect(readyCount(felder({ lehre: "zu kurz", problem: "" }))).toBe(3);
  });
});

// ---- Aufräumen -----------------------------------------------------------------------------------

describe("story-post: tidy", () => {
  it("macht Zeilenumbrüche und Mehrfach-Leerzeichen zu einem Leerzeichen", () => {
    expect(tidy("  Wir  haben\n gemessen.\r\n\tDann gestrichen. ")).toBe("Wir haben gemessen. Dann gestrichen.");
  });

  it("schreibt Schweizer: ss, «», Punkte, Prozent", () => {
    expect(tidy('Er sagte "gut" und grüsste süß')).toBe("Er sagte «gut» und grüsste süss");
    expect(tidy("Warte... dann gehts")).toBe("Warte… dann gehts");
    expect(tidy("Ende..")).toBe("Ende.");
    expect(tidy("8% weniger")).toBe("8 % weniger");
  });

  it("lässt Platzhalter in eckigen Klammern stehen", () => {
    expect(tidy("[Name]   rief an")).toBe("[Name] rief an");
  });
});

// ---- Hook ----------------------------------------------------------------------------------------

describe("story-post: hooks", () => {
  it("Hook 1 ist der erste Satz des Ergebnisses, Hook 2 hängt den Grund an", () => {
    expect(hooks(KELLER)).toEqual([
      "Die Fassade hält seit zwei Jahren.",
      "Die Fassade hält seit zwei Jahren. Der Grund: Wir haben erst die Feuchte im Putz gemessen.",
    ]);
  });

  it("nimmt bei mehreren Sätzen nur den ersten, auch mit Kürzel wie «Z.»", () => {
    const h = hooks(felder({ ergebnis: "Frau Z. ruft jedes Jahr an. Das war vorher anders. Wir freuen uns.", wendepunkt: "Wir messen. Dann streichen wir." }));
    expect(h[0]).toBe("Frau Z. ruft jedes Jahr an.");
    expect(h[1]).toBe("Frau Z. ruft jedes Jahr an. Der Grund: Wir messen.");
  });

  it("setzt kein doppeltes Satzzeichen, auch ohne Schlusspunkt und bei Ausrufe-, Frage- und Auslassungszeichen der Person", () => {
    const w = "Wir haben erst die Feuchte gemessen.";
    expect(hooks(felder({ ergebnis: "Die Fassade hält seit zwei Jahren", wendepunkt: w }))[1]).toBe("Die Fassade hält seit zwei Jahren. Der Grund: " + w);
    expect(hooks(felder({ ergebnis: "Die Fassade hält noch immer!", wendepunkt: w }))[1]).toBe("Die Fassade hält noch immer! Der Grund: " + w);
    expect(hooks(felder({ ergebnis: "Hält die Fassade noch?", wendepunkt: w }))[1]).toBe("Hält die Fassade noch? Der Grund: " + w);
    expect(hooks(felder({ ergebnis: "Sie hält und hält…", wendepunkt: w }))[1]).toBe("Sie hält und hält… Der Grund: " + w);
    expect(hooks(felder({ ergebnis: "Die Fassade hält seit zwei Jahren..", wendepunkt: w }))[1]).toBe("Die Fassade hält seit zwei Jahren. Der Grund: " + w);
    expect(hooks(felder({ ergebnis: "Die Fassade hält seit zwei Jahren,", wendepunkt: w }))[1]).toBe("Die Fassade hält seit zwei Jahren. Der Grund: " + w);
  });

  it("setzt Ausrufe- und Fragezeichen nur, wenn die Person sie getippt hat", () => {
    for (const h of hooks(KELLER)) expect(h).not.toMatch(/[!?]/);
    expect(hooks(felder({ ergebnis: "Es hält!" + " Wirklich lange." }))[0]).toBe("Es hält!");
  });

  it("lässt einen Hook mit genau 140 Zeichen stehen und kürzt einen mit 141", () => {
    const s140 = sent(140);
    const s141 = sent(141);
    expect(charCount(s140)).toBe(140);
    expect(charCount(s141)).toBe(141);
    expect(hooks(felder({ ergebnis: s140 }))[0]).toBe(s140);
    const cut = hooks(felder({ ergebnis: s141 }))[0];
    expect(cut.endsWith("…")).toBe(true);
    expect(charCount(cut)).toBeLessThanOrEqual(HOOK_MAX);
  });

  it("kürzt einen langen Hook am letzten Leerzeichen vor Zeichen 137 und beendet ihn mit «…»", () => {
    const long = sent(200);
    const cut = shorten(long);
    const body = cut.slice(0, -1);
    expect(cut.endsWith("…")).toBe(true);
    expect(charCount(body)).toBeLessThanOrEqual(137);
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length]).toBe(" "); // Schnitt an einer Wortgrenze
    expect(body.endsWith(" ")).toBe(false);
    // Das nächste Wort hätte nicht mehr in 137 Zeichen gepasst
    expect(long.indexOf(" ", body.length + 1)).toBeGreaterThan(137);
  });

  it("schneidet nicht mitten in eine Klammer", () => {
    const text = "abcd ".repeat(25) + "[Name der Kundschaft] hat zugestimmt und wir bleiben dran, weil es sich lohnt.";
    const cut = shorten(text);
    expect(cut).not.toContain("[");
    expect(cut.endsWith("…")).toBe(true);
    expect(charCount(cut)).toBeLessThanOrEqual(HOOK_MAX);
  });

  it("schneidet ein Wort ohne Leerzeichen hart bei 137 Zeichen", () => {
    const h = hooks(felder({ ergebnis: "x".repeat(150) + "." }));
    expect(h).toEqual(["x".repeat(137) + "…"]);
  });

  it("schneidet Hook 1 hart, wenn der Schnitt am Leerzeichen nur einen Stummel ergäbe", () => {
    const h = hooks(felder({ ergebnis: "Ein " + "x".repeat(200) + "." }));
    expect(h).toHaveLength(1);
    expect(charCount(h[0])).toBe(138);
    expect(h[0].startsWith("Ein xxx")).toBe(true);
  });

  it("kürzt auch Hook 2 auf 140 Zeichen und lässt «Der Grund:» stehen", () => {
    const h = hooks(felder({ wendepunkt: sent(200) }));
    expect(h).toHaveLength(2);
    expect(h[1].startsWith("Die Fassade hält seit zwei Jahren. Der Grund: abcd")).toBe(true);
    expect(h[1].endsWith("…")).toBe(true);
    expect(charCount(h[1])).toBeLessThanOrEqual(HOOK_MAX);
  });

  it("lässt Hook 2 weg, wenn der erste Satz des Ergebnisses schon die Grenze sprengt", () => {
    const h = hooks(felder({ ergebnis: sent(150) }));
    expect(h).toHaveLength(1);
    expect(h[0].endsWith("…")).toBe(true);
  });

  it("lässt Hook 2 weg, wenn er kürzer als 30 Zeichen ist, und behält ihn ab 30", () => {
    expect(hooks(felder({ ergebnis: "Es hält.", wendepunkt: "Gemessen." }))).toEqual(["Es hält."]);
    expect(hooks(felder({ ergebnis: "Es hält.", wendepunkt: "Gemessen1." }))[1]).toBe("Es hält. Der Grund: Gemessen1.");
    expect(charCount("Es hält. Der Grund: Gemessen1.")).toBe(30);
  });

  it("gibt keinen Hook ohne Ergebnis und nur Hook 1 ohne Wendepunkt", () => {
    expect(hooks(EMPTY_FELDER)).toEqual([]);
    expect(hooks(felder({ ergebnis: "   " }))).toEqual([]);
    expect(hooks(felder({ wendepunkt: "" }))).toEqual(["Die Fassade hält seit zwei Jahren."]);
  });

  it("enthält in keiner Variante doppelte Satzzeichen", () => {
    const ergebnisse = ["Läuft.", "Läuft!", "Läuft?", "Läuft…", "Läuft", "Läuft..", "Läuft...", "Läuft,", "Läuft:", sent(150), sent(139)];
    const wenden = ["Gemessen.", "Gemessen", "Gemessen!", sent(120), "Gemessen:"];
    for (const e of ergebnisse) {
      for (const w of wenden) {
        for (const h of hooks(felder({ ergebnis: e, wendepunkt: w }))) {
          expect(h, `${e} / ${w}`).not.toMatch(/\.\.|\.:|[!?]\.|:\.|,\.|\.,|[.,;:!?]…|…[.,;:]/);
        }
      }
    }
  });

  it("wählt wirksam: Hook 2 ohne zweiten Vorschlag fällt auf Hook 1, ohne Vorschläge auf «Ohne Hook»", () => {
    expect(effectiveHook(1, ["a", "b"])).toBe(1);
    expect(effectiveHook(2, ["a", "b"])).toBe(2);
    expect(effectiveHook(2, ["a"])).toBe(1);
    expect(effectiveHook(0, ["a", "b"])).toBe(0);
    expect(effectiveHook(1, [])).toBe(0);
    expect(effectiveHook(2, [])).toBe(0);
  });
});

// ---- Zusammenstellen -----------------------------------------------------------------------------

describe("story-post: compose", () => {
  it("setzt die Absätze in der Reihenfolge Hook, Ausgangslage, Problem, Wendepunkt, Lehre, Bezug zusammen; das Ergebnis steht schon im Hook", () => {
    const s = story();
    expect(s.absaetze.map((a) => a.key)).toEqual(["hook", "ausgangslage", "problem", "wendepunkt", "lehre", "bezug"]);
    expect(s.linkedin).toBe(
      [
        "Die Fassade hält seit zwei Jahren.",
        "Frau Z. aus Gossau rief an: Ihre Fassade blätterte nach drei Wintern ab.",
        "Zwei andere Maler hatten nur übergestrichen.",
        "Wir haben erst die Feuchte im Putz gemessen.",
        "Erst messen, dann streichen.",
        "Wie ist das bei deinem Haus?",
      ].join("\n\n"),
    );
  });

  it("sagt keinen Satz doppelt: Der Hook ersetzt den ersten Satz des Ergebnisses (und bei Hook 2 den des Wendepunkts) im Haupttext", () => {
    const mehr = { ergebnis: "Die Fassade hält seit zwei Jahren. Frau Z. ist zufrieden.", wendepunkt: "Wir haben erst die Feuchte im Putz gemessen. Dann haben wir getrocknet." };
    const eins = story(mehr, 1);
    expect(eins.absaetze.find((a) => a.key === "ergebnis")?.text).toBe("Frau Z. ist zufrieden.");
    expect(eins.absaetze.find((a) => a.key === "wendepunkt")?.text).toBe(mehr.wendepunkt);
    const zwei = story(mehr, 2);
    expect(zwei.absaetze.find((a) => a.key === "ergebnis")?.text).toBe("Frau Z. ist zufrieden.");
    expect(zwei.absaetze.find((a) => a.key === "wendepunkt")?.text).toBe("Dann haben wir getrocknet.");
    // Mit nur einem Satz entfällt der Absatz ganz
    expect(story({}, 2).absaetze.map((a) => a.key)).toEqual(["hook", "ausgangslage", "problem", "lehre", "bezug"]);
    // Kein Satz der Geschichte erscheint zweimal im Beitrag
    for (const wahl of [1, 2] as const) {
      const saetze = story(mehr, wahl).linkedin.split(/\n\n|(?<=[.!?])\s+/).filter((x) => x.length > 20);
      expect(saetze.filter((x) => x === "Die Fassade hält seit zwei Jahren.")).toHaveLength(1);
      expect(saetze.filter((x) => x === "Wir haben erst die Feuchte im Putz gemessen.")).toHaveLength(wahl === 1 ? 1 : 0);
    }
  });

  it("lässt den Haupttext unberührt, wenn der Hook gekürzt ist oder fehlt", () => {
    const lang = sent(200);
    const s = story({ ergebnis: `${lang} Danach war Ruhe.` }, 1);
    expect(s.hooks[0].endsWith("…")).toBe(true);
    expect(s.absaetze.find((a) => a.key === "ergebnis")?.text).toBe(`${lang} Danach war Ruhe.`);
    const ohne = story({}, 0);
    expect(ohne.absaetze.map((a) => a.key)).toEqual(["ausgangslage", "problem", "wendepunkt", "ergebnis", "lehre", "bezug"]);
    expect(hookSaetze(KELLER, "")).toEqual({});
    expect(hookSaetze(KELLER, "Etwas anderes.")).toEqual({});
    expect(hookSaetze(EMPTY_FELDER, "Hook.")).toEqual({});
  });

  it("lässt leere Teile weg und setzt den Hook nur, wenn einer übergeben wird", () => {
    expect(absaetze(EMPTY_FELDER, "")).toEqual([]);
    expect(absaetze(felder({ problem: "  ", bezug: "" }), "Hook.").map((a) => a.key)).toEqual(["hook", "ausgangslage", "wendepunkt", "ergebnis", "lehre"]);
    expect(absaetze(KELLER, "").map((a) => a.key)).toEqual(["ausgangslage", "problem", "wendepunkt", "ergebnis", "lehre", "bezug"]);
  });

  it("trennt die Absätze durch genau eine Leerzeile und schliesst ohne Leerzeile", () => {
    const text = story().linkedin;
    expect(text).not.toMatch(/\n{3,}/);
    expect(text.split("\n\n")).toHaveLength(6);
    expect(text.split("\n\n").every((p) => !p.includes("\n"))).toBe(true);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("nimmt Hook 2 oder lässt den Hook weg, wie gewählt", () => {
    expect(story({}, 2).linkedin.split("\n\n")[0]).toBe("Die Fassade hält seit zwei Jahren. Der Grund: Wir haben erst die Feuchte im Putz gemessen.");
    const ohne = story({}, 0);
    expect(ohne.absaetze).toHaveLength(6);
    expect(ohne.linkedin.startsWith("Frau Z. aus Gossau")).toBe(true);
    expect(ohne.hook).toBe(0);
  });

  it("fällt auf Hook 1 zurück, wenn es keinen Hook 2 gibt", () => {
    const s = story({ wendepunkt: "Gemessen.", ergebnis: "Es hält." }, 2);
    expect(s.hooks).toHaveLength(1);
    expect(s.hook).toBe(1);
  });

  it("lässt den Absatz des freiwilligen Bezugs weg, wenn er leer ist", () => {
    const s = story({ bezug: "" });
    expect(s.absaetze.map((a) => a.key)).not.toContain("bezug");
    expect(s.linkedin.endsWith("Erst messen, dann streichen.")).toBe(true);
  });

  it("formuliert nichts um und fügt kein Emoji, keinen Hashtag und kein Ausrufezeichen hinzu", () => {
    for (const hook of [0, 1, 2] as const) {
      const text = story({}, hook).linkedin;
      for (const f of FELDER) expect(text).toContain(tidy(KELLER[f.key]));
      expect(text).not.toMatch(/[!#]|\p{Extended_Pictographic}/u);
    }
  });

  it("räumt die Eingaben auf, bevor sie in den Beitrag kommen", () => {
    const s = story({ problem: "Zwei   andere\nMaler hatten\n\nnur übergestrichen." });
    expect(s.linkedin).toContain("\n\nZwei andere Maler hatten nur übergestrichen.\n\n");
  });

  it("meldet einen Teil mit mehr als drei Sätzen und lässt ihn unverändert; drei Sätze sind in Ordnung", () => {
    const vier = "Erster Satz. Zweiter Satz. Dritter Satz. Vierter Satz.";
    const s = story({ problem: vier });
    expect(s.hinweise).toContain("Teil 2 hat mehr als drei Sätze (Problem oder Spannung). Das Werkzeug lässt ihn unverändert.");
    expect(s.linkedin).toContain(vier);
    expect(story({ problem: "Erster Satz. Zweiter Satz. Dritter Satz." }).hinweise).toEqual([]);
    expect(story({ bezug: `${vier} Fünfter Satz.` }).hinweise[0]).toMatch(/^Teil 6 hat mehr als drei Sätze/);
  });

  it("meldet Platzhalter in eckigen Klammern, jeden einmal, und lässt sie stehen", () => {
    const s = story({ ausgangslage: "[Name] aus [Ort] rief an: [Name] wollte wissen, warum die Farbe abblättert." });
    expect(s.platzhalter).toEqual(["Name", "Ort"]);
    expect(s.linkedin).toContain("[Name] aus [Ort] rief an");
    expect(platzhalter(KELLER)).toEqual([]);
    expect(story().platzhalter).toEqual([]);
  });

  it("meldet Treffer der Sperrliste, ohne sie zu entfernen", () => {
    const s = story({ lehre: "Das bringt echten Mehrwert für die Kundschaft." });
    expect(s.hinweise).toContain("In deinem Text steht ‹Mehrwert›, das wir nicht empfehlen.");
    expect(s.linkedin).toContain("echten Mehrwert für die Kundschaft");
  });

  it("meldet auch «jetzt», «garantiert» und ein getipptes Ausrufezeichen", () => {
    const h = story({ ergebnis: "Jetzt hält die Fassade, garantiert!" }).hinweise;
    expect(h).toContain("In deinem Text steht ‹Jetzt›, das wir nicht empfehlen.");
    expect(h).toContain("In deinem Text steht ‹garantiert›, das wir nicht empfehlen.");
    expect(h).toContain("In deinem Text steht ‹!›, das wir nicht empfehlen.");
  });

  it("meldet ein Leerzeichen vor dem Satzzeichen und den Gedankenstrich", () => {
    expect(story({ problem: "Zwei andere Maler strichen nur über ." }).hinweise).toContain("Vor einem Satzzeichen steht ein Leerzeichen, das wir nicht empfehlen.");
    expect(story({ problem: "Zwei andere Maler — nur übergestrichen." }).hinweise).toContain("In deinem Text steht ‹—›, das wir nicht empfehlen.");
  });

  it("gibt für die Beispiele der Malerei Keller keinen Hinweis", () => {
    expect(story().hinweise).toEqual([]);
    expect(compose({ anrede: "sie", felder: beispielFelder("sie"), hook: 2 }).hinweise).toEqual([]);
  });

  it("meldet eine andere Anrede in Lehre und Bezug, nicht in den anderen Teilen", () => {
    expect(story({}, 1, "du").hinweise).toEqual([]);
    expect(story({ bezug: "Wie ist das bei Ihrem Haus?" }, 1, "du").hinweise).toEqual([
      "In «Bezug zur Leserin» steht ‹Ihrem›, gewählt ist aber Du. Passe die Anrede oder den Text an.",
    ]);
    expect(story({}, 1, "sie").hinweise).toEqual([
      "In «Bezug zur Leserin» steht ‹deinem›, gewählt ist aber Sie. Passe die Anrede oder den Text an.",
    ]);
    expect(story({ bezug: "Wie ist das bei Ihrem Haus?" }, 1, "sie").hinweise).toEqual([]);
    expect(story({ lehre: "Frag nach, ob Sie es wollen." }, 1, "du").hinweise[0]).toContain("‹Sie›");
    // «Sie» am Satzanfang kann «sie» meinen und zählt nicht
    expect(story({ lehre: "Sie wollten es genau wissen, das war gut." }, 1, "du").hinweise).toEqual([]);
    // Die Ausgangslage erzählt von anderen Personen: kein Hinweis
    expect(story({ ausgangslage: "Frau Z. fragte dich nach deinem Preis, ja wirklich.", bezug: "" }, 1, "sie").hinweise).toEqual([]);
  });
});

// ---- Lesezeit ------------------------------------------------------------------------------------

describe("story-post: readingTime", () => {
  const words = (n: number) => Array.from({ length: n }, () => "wort").join(" ");

  it("zeigt «unter 1 Minute» bei 0 und 199 Wörtern", () => {
    expect(readingTime("")).toEqual({ woerter: 0, minuten: 0, label: "unter 1 Minute" });
    expect(readingTime(words(199))).toEqual({ woerter: 199, minuten: 0, label: "unter 1 Minute" });
  });

  it("zeigt bei 200 Wörtern eine Minute und rundet darüber auf halbe Minuten auf", () => {
    expect(readingTime(words(200))).toEqual({ woerter: 200, minuten: 1, label: "1 Minute" });
    expect(readingTime(words(201)).label).toBe("1,5 Minuten");
    expect(readingTime(words(300)).label).toBe("1,5 Minuten");
    expect(readingTime(words(301)).label).toBe("2 Minuten");
    expect(readingTime(words(400)).label).toBe("2 Minuten");
    expect(readingTime(words(401)).label).toBe("2,5 Minuten");
    expect(readingTime(words(600))).toEqual({ woerter: 600, minuten: 3, label: "3 Minuten" });
  });

  it("zählt Wörter über Leerzeilen hinweg und ignoriert Satzzeichen allein", () => {
    expect(wordCount("Eins zwei\n\ndrei – vier . fünf")).toBe(5);
    expect(readingTime(story().linkedin).woerter).toBe(wordCount(story().linkedin));
    expect(readingTime(story().linkedin).label).toBe("unter 1 Minute");
  });

  it("nennt die Annahme als Annahme von Alperna, nicht als Statistik", () => {
    expect(LESEZEIT_NOTE).toContain("Annahme von Alperna");
    expect(LESEZEIT_NOTE).toContain("keine Statistik");
  });
});

// ---- Instagram -----------------------------------------------------------------------------------

describe("story-post: instagram", () => {
  // Fünf Absätze mit 1'708 Zeichen (inklusive Leerzeilen); dazu kommen Lehre und Bezug, damit die Summe stimmt.
  const base = { hook: 100, ausgangslage: 500, problem: 500, wendepunkt: 500, ergebnis: 100 } as const;
  // Fünf Absätze mit 2'108 Zeichen: Schon Lehre oder Bezug allein bringen den Text über die Grenze.
  const big = { hook: 100, ausgangslage: 500, problem: 500, wendepunkt: 500, ergebnis: 500 } as const;

  it("lässt einen Text mit genau 2'200 Zeichen unverändert", () => {
    const teile = paras({ ...base, lehre: 100, bezug: 388 });
    expect(total(teile)).toBe(INSTAGRAM_MAX);
    const ig = instagram(teile);
    expect(ig).toMatchObject({ zeichen: 2200, weggelassen: [], zuLang: false, hinweis: null });
    expect(ig.text).toBe(teile.map((a) => a.text).join("\n\n"));
  });

  it("streicht bei 2'201 Zeichen zuerst den Bezug zur Leserin und nennt ihn", () => {
    const teile = paras({ ...base, lehre: 100, bezug: 389 });
    expect(total(teile)).toBe(2201);
    const ig = instagram(teile);
    expect(ig.weggelassen).toEqual(["bezug"]);
    expect(ig.hinweis).toBe("Gekürzt: Bezug zur Leserin fehlt");
    expect(ig.text.split("\n\n").map((p) => p.length)).toEqual([100, 500, 500, 500, 100, 100]);
    expect(ig.zeichen).toBeLessThanOrEqual(INSTAGRAM_MAX);
  });

  it("streicht danach die Lehre und nennt beide in der Reihenfolge der Geschichte", () => {
    const teile = paras({ ...big, lehre: 400, bezug: 30 });
    expect(total(teile)).toBe(2542);
    const ig = instagram(teile);
    expect(ig.weggelassen).toEqual(["lehre", "bezug"]);
    expect(ig.hinweis).toBe("Gekürzt: Lehre und Bezug zur Leserin fehlen");
    expect(ig.text.split("\n\n").map((p) => p.length)).toEqual([100, 500, 500, 500, 500]);
  });

  it("streicht nur die Lehre, wenn es keinen Bezug gibt", () => {
    const ig = instagram(paras({ ...big, lehre: 400 }));
    expect(ig.weggelassen).toEqual(["lehre"]);
    expect(ig.hinweis).toBe("Gekürzt: Lehre fehlt");
  });

  it("lässt den vollen Text stehen und sagt «kürze von Hand», wenn auch das nicht reicht", () => {
    const teile = paras({ hook: 100, ausgangslage: 600, problem: 600, wendepunkt: 600, ergebnis: 600, lehre: 100, bezug: 100 });
    const ig = instagram(teile);
    expect(ig.text).toBe(teile.map((a) => a.text).join("\n\n"));
    expect(ig.zuLang).toBe(true);
    expect(ig.weggelassen).toEqual([]);
    expect(ig.hinweis).toBe(INSTAGRAM_TOO_LONG);
    expect(ig.hinweis).toBe("Zu lang für Instagram: kürze von Hand");
    expect(ig.zeichen).toBeGreaterThan(INSTAGRAM_MAX);
  });

  it("schneidet nie mitten im Satz ab: Es bleiben nur ganze Absätze", () => {
    const teile = paras({ ...big, lehre: 400, bezug: 30 });
    const ids = new Set(teile.map((a) => a.text));
    for (const p of instagram(teile).text.split("\n\n")) expect(ids.has(p)).toBe(true);
  });

  it("zählt Unicode-Zeichen: 2'200 Emojis passen, obwohl sie 4'400 UTF-16-Einheiten haben", () => {
    const passt: Absatz[] = [
      { key: "hook", text: "😀".repeat(1099) },
      { key: "ergebnis", text: "😀".repeat(1099) },
    ];
    const ig = instagram(passt);
    expect(ig.zeichen).toBe(2200);
    expect(ig.text.length).toBeGreaterThan(4000);
    expect(ig.hinweis).toBeNull();
    const zuLang: Absatz[] = [
      { key: "hook", text: "😀".repeat(1100) },
      { key: "ergebnis", text: "😀".repeat(1099) },
    ];
    expect(instagram(zuLang).zeichen).toBe(2201);
    expect(instagram(zuLang).zuLang).toBe(true);
  });

  it("behält den Hook in der Instagram-Fassung", () => {
    const s = story();
    expect(s.instagram.text).toBe(s.linkedin);
    expect(s.instagram.hinweis).toBeNull();
    expect(s.instagram.text.startsWith("Die Fassade hält seit zwei Jahren.")).toBe(true);
  });

  it("formuliert die Instagram-Zeile fürs CRM und Dokument", () => {
    expect(instagramZeile(story().instagram)).toBe("Instagram: 260 Zeichen, nichts gekürzt.");
    expect(instagramZeile(instagram(paras({ ...big, lehre: 400 })))).toBe("Instagram: 2'108 Zeichen. Gekürzt: Lehre fehlt.");
    expect(instagramZeile(instagram(paras({ hook: 2300 })))).toBe("Instagram: 2'300 Zeichen. Zu lang für Instagram: kürze von Hand.");
  });

  it("liefert die Faltkante der beiden Fassungen über foldInfo (Richtwert von Alperna)", () => {
    const s = story();
    expect(RICHTWERT_NOTE).toBe("Richtwert von Alperna, keine Statistik");
    expect(foldInfo("instagram", s.instagram.text)).toEqual({ limit: 125, before: 125, over: 135 });
    // LinkedIn: Die Vorschau endet nach der dritten Zeile (hier: nach dem zweiten Absatz), früher als 210 Zeichen
    expect(foldInfo("linkedin", s.linkedin)).toEqual({ limit: 108, before: 108, over: 152 });
  });

  it("kürzt mit gültigen Angaben höchstens den Bezug: Hook, fünf Teile zu 400 Zeichen und Lehre bleiben unter 2'200", () => {
    // Mit 400 Zeichen je Feld und höchstens 140 Zeichen Hook sind es ohne Bezug höchstens 2'150 Zeichen.
    const max = Object.fromEntries(FELDER.map((f) => [f.key, "a".repeat(400)])) as Felder;
    const s = compose({ anrede: "du", felder: max, hook: 1 });
    expect(validate(max)).toEqual([]);
    expect(s.instagram.weggelassen).toEqual(["bezug"]);
    expect(s.instagram.zeichen).toBeLessThanOrEqual(2150);
  });
});

// ---- Dokument und CRM ----------------------------------------------------------------------------

describe("story-post: toDocument", () => {
  const doc = toDocument(story(), { firma: "Malerei Keller" });

  it("baut Kopf, Hook-Wahl, Lesezeit, beide Fassungen und kennt den Firmennamen", () => {
    expect(doc.title).toBe("Story-Post");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("story-post-malerei-keller");
    const types = doc.blocks.map((b) => b.type);
    expect(types[0]).toBe("facts");
    const facts = doc.blocks[0];
    if (facts.type !== "facts") throw new Error("facts erwartet");
    expect(facts.items.map((f) => f.label)).toEqual(["Hook", "Lesezeit", "LinkedIn", "Instagram"]);
    expect(facts.items[0].value).toBe("Hook 1: Die Fassade hält seit zwei Jahren.");
    expect(facts.items[1].value).toBe(`unter 1 Minute (${LESEZEIT_NOTE})`);
    expect(facts.items[2].value).toBe("260 Zeichen, davon 108 vor der Faltkante (Richtwert von Alperna, keine Statistik)");
    expect(facts.items[3].value).toContain("260 Zeichen, höchstens 2'200");
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["LinkedIn-Fassung", "Instagram-Fassung"]);
  });

  it("legt jeden Absatz als eigenen Block ab, je einmal pro Fassung", () => {
    const paragraphs = doc.blocks.filter((b) => b.type === "paragraph").map((b) => (b.type === "paragraph" ? b.text : ""));
    expect(paragraphs[0]).toBe(SAETZE_NOTE);
    expect(paragraphs.filter((p) => p === "Erst messen, dann streichen.")).toHaveLength(2);
    expect(paragraphs).toHaveLength(1 + 6 + 6);
  });

  it("nennt ohne Hook «Ohne Hook», führt Platzhalter und Hinweise auf und zeigt den Instagram-Hinweis", () => {
    const d = toDocument(story({ ausgangslage: "[Name] rief an: Ihre Fassade blätterte nach drei Wintern ab.", lehre: "Das bringt Mehrwert und hält." }, 0));
    const md = toMarkdown(d);
    expect(md).toContain("**Hook:** Ohne Hook");
    expect(md).toContain("## Noch ausfüllen");
    expect(md).toContain("- [Name]");
    expect(md).toContain("## Hinweise");
    expect(md).toContain("‹Mehrwert›");
    const s = story({ ausgangslage: "a".repeat(400), problem: "b".repeat(400), wendepunkt: "c".repeat(400), ergebnis: "d".repeat(400), lehre: "e".repeat(400), bezug: "f".repeat(400) }, 0);
    expect(s.instagram.hinweis).toBe("Gekürzt: Bezug zur Leserin fehlt");
    expect(toMarkdown(toDocument(s))).toContain("Gekürzt: Bezug zur Leserin fehlt.");
  });

  it("nimmt ohne Firma den Standard-Dateinamen und schreibt sonst nach den Regeln der Seite", () => {
    expect(toDocument(story()).filename).toBe("story-post-beitrag");
    expect(toDocument(story()).firma).toBeUndefined();
    const md = toMarkdown(doc);
    expect(md).not.toMatch(/!|—|ß/);
    expect(brandHits(md)).toEqual([]);
  });
});

describe("story-post: CRM-Texte", () => {
  it("nennt in der Eingabe die sechs Felder je Zeile, dann Anrede und Hook", () => {
    const lines = eingabeText({ anrede: "du", felder: KELLER, hook: 1 }).split("\n");
    expect(lines).toEqual([
      "Weg: Sätze der Person geordnet",
      "Ausgangslage: Frau Z. aus Gossau rief an: Ihre Fassade blätterte nach drei Wintern ab.",
      "Problem oder Spannung: Zwei andere Maler hatten nur übergestrichen.",
      "Wendepunkt: Wir haben erst die Feuchte im Putz gemessen.",
      "Ergebnis: Die Fassade hält seit zwei Jahren.",
      "Lehre: Erst messen, dann streichen.",
      "Bezug zur Leserin: Wie ist das bei deinem Haus?",
      "Anrede: Du",
      "Hook: Hook 1",
    ]);
  });

  it("schreibt «keine Angabe» für einen leeren Bezug, räumt Zeilenumbrüche auf und nennt Sie und «Ohne Hook»", () => {
    const text = eingabeText({ anrede: "sie", felder: felder({ bezug: "", lehre: "Erst messen,\ndann streichen." }), hook: 0 });
    expect(text).toContain("Bezug zur Leserin: keine Angabe");
    expect(text).toContain("Lehre: Erst messen, dann streichen.");
    expect(text).toContain("Anrede: Sie");
    expect(text.endsWith("Hook: Ohne Hook")).toBe(true);
    expect(text.split("\n")).toHaveLength(9);
  });

  it("gibt als Ausgabe die LinkedIn-Fassung und die Instagram-Zeile", () => {
    const s = story();
    expect(ausgabeText(s)).toBe(`${s.linkedin}\n\nInstagram: 260 Zeichen, nichts gekürzt.`);
    const lang = story({ ausgangslage: "a".repeat(400), problem: "b".repeat(400), wendepunkt: "c".repeat(400), ergebnis: "d".repeat(400), lehre: "e".repeat(400), bezug: "f".repeat(400) }, 0);
    expect(ausgabeText(lang).endsWith("Instagram: 2'008 Zeichen. Gekürzt: Bezug zur Leserin fehlt.")).toBe(true);
  });
});

// ---- Gespeicherter Stand -------------------------------------------------------------------------

describe("story-post: parseState", () => {
  it("liefert bei kaputten Daten und fremder Version den leeren Stand", () => {
    for (const raw of [null, undefined, 5, "text", [], {}, { v: 2, phase: "result", felder: KELLER }, { phase: "result" }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
    expect(EMPTY_STATE).toEqual({ v: 1, phase: "edit", modus: "ki", anrede: "", felder: EMPTY_FELDER, hook: 1 });
  });

  it("liest einen gültigen Stand mit Ergebnis vollständig zurück", () => {
    const raw = { v: 1, phase: "result", modus: "ordnen", anrede: "sie", felder: KELLER, hook: 2, output: { linkedin: "L", instagram: "I" } };
    expect(parseState(raw)).toEqual(raw);
  });

  it("setzt «result» nur bei vollständigen Angaben, sonst «edit» ohne Ergebnis", () => {
    const s = parseState({ v: 1, phase: "result", felder: felder({ ergebnis: "" }), output: { linkedin: "L", instagram: "I" } });
    expect(s.phase).toBe("edit");
    expect(s.output).toBeUndefined();
    expect(s.felder.ergebnis).toBe("");
    expect(parseState({ v: 1, phase: "edit", felder: KELLER }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "irgendwas", felder: KELLER }).phase).toBe("edit");
  });

  it("macht aus Werten falschen Typs leere oder Standardwerte", () => {
    const s = parseState({ v: 1, phase: "edit", anrede: "ihr", hook: 7, felder: { ausgangslage: 5, problem: null, wendepunkt: ["x"], ergebnis: "Läuft gut seit Jahren.", unbekannt: "x" } });
    expect(s.anrede).toBe("");
    expect(s.hook).toBe(1);
    expect(s.felder).toEqual({ ...EMPTY_FELDER, ergebnis: "Läuft gut seit Jahren." });
    expect(Object.keys(s.felder)).toEqual(FELDER.map((f) => f.key));
  });

  it("kürzt zu lange Texte auf die Grenze und lässt ein ungültiges Ergebnis weg", () => {
    expect(parseFelder({ lehre: "a".repeat(900) }).lehre).toHaveLength(400);
    expect(parseFelder("kaputt")).toEqual(EMPTY_FELDER);
    const s = parseState({ v: 1, phase: "result", felder: KELLER, output: { linkedin: 5, instagram: "I" } });
    expect(s.phase).toBe("result");
    expect(s.output).toBeUndefined();
  });

  it("behält Hook 0 und die Anrede Du", () => {
    const s = parseState({ v: 1, phase: "edit", anrede: "du", hook: 0, felder: KELLER });
    expect(s.hook).toBe(0);
    expect(s.anrede).toBe("du");
  });
});

// ---- Ton der Seite -------------------------------------------------------------------------------

describe("story-post: Texte im Werkzeug", () => {
  it("halten die Sperrliste und die Schreibregeln ein", () => {
    const texts = [
      SAETZE_NOTE,
      LESEZEIT_NOTE,
      RICHTWERT_NOTE,
      INSTAGRAM_TOO_LONG,
      ...FELDER.flatMap((f) => [f.label, f.hinweis, f.beispiel, f.beispielSie ?? ""]),
      toMarkdown(toDocument(story({}, 2))),
      eingabeText({ anrede: "du", felder: KELLER, hook: 1 }),
      ausgabeText(story()),
    ];
    for (const t of texts) {
      expect(brandHits(t), t).toEqual([]);
      expect(t, t).not.toMatch(/!|\bjetzt\b|—|ß/i);
    }
  });
});
