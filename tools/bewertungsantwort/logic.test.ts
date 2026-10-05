import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { placeholdersIn } from "@/lib/generator";
import { mergeProfile, sanitizeProfile } from "@/lib/profile";
import { isToolDone } from "@/lib/progress";
import { LIMITS, PLATZHALTER, bewertungOutput, checkBewertung, hasSieForm, type BewertungInput, type BewertungOutput } from "./generator";
import { hasDuForm } from "@/tools/markenplattform/generator";
import {
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  KI_HINWEIS,
  LAENGEN,
  STERNE,
  VORLAGE_AUSGABE,
  VORLAGE_HINWEIS,
  anredeFromProfile,
  anredeLabel,
  charCount,
  eingabeText,
  fallbackVorlagen,
  hinweisNamen,
  hinweisText,
  inputProblem,
  isAnrede,
  isLaenge,
  istKritik,
  kopierLabel,
  laengeLabel,
  parseState,
  profilHinweise,
  profilRegeln,
  profilVermeiden,
  profilWerte,
  profilePatch,
  regelnVorschlag,
  reportMarkdown,
  shorten,
  shownVarianten,
  sterneLabel,
  toDocument,
  toForm,
  toInput,
  varianteTitel,
  type FormValues,
} from "./logic";

const form: FormValues = {
  bewertung: "Die Fassade sieht gut aus, aber der Maler kam zwei Tage später als abgemacht und hat vorher nicht angerufen.",
  sterne: 3,
  anrede: "sie",
  laenge: "kurz",
  unterschrift: "Ruth Keller, Malerei Keller",
  regeln: ["bei Kritik Gesprächsangebot machen", "nie Rabatte versprechen", ""],
};

const profile = {
  firma: "Malerei Keller",
  marke: {
    werte: ["Zuverlässigkeit", "Klarheit"],
    woerter: { verwenden: ["Termin"], vermeiden: ["perfekt", "günstig"] },
    bewertungsregeln: ["immer zum Besuch im Laden einladen"],
    tonalitaet: { so: "ruhig", anrede: "sie" },
  },
};

const input: BewertungInput = {
  betrieb: "Malerei Keller",
  anrede: "sie",
  laenge: "kurz",
  unterschrift: "Ruth Keller, Malerei Keller",
  bewertung: form.bewertung,
  sterne: 3,
  regeln: ["bei Kritik Gesprächsangebot machen", "nie Rabatte versprechen"],
  werte: ["Zuverlässigkeit", "Klarheit"],
  vermeiden: ["perfekt", "günstig"],
};

const output: BewertungOutput = {
  varianten: [
    { ton: "sachlich", text: `Guten Tag\nDanke für Ihre Rückmeldung. Wir sprechen gern mit Ihnen: ${PLATZHALTER}.\nFreundliche Grüsse\n${input.unterschrift}` },
    { ton: "herzlich", text: `Guten Tag\nVielen Dank für das Lob für die Fassade. Rufen Sie uns an: ${PLATZHALTER}.\nFreundliche Grüsse\n${input.unterschrift}` },
  ],
};

describe("bewertungsantwort: Labels", () => {
  it("nennt Sterne, Länge, Anrede und Kritik wie das Formular", () => {
    expect(STERNE).toEqual([1, 2, 3, 4, 5]);
    expect(sterneLabel(1)).toBe("1 Stern");
    expect(sterneLabel(4)).toBe("4 Sterne");
    expect(LAENGEN.map((l) => l.key)).toEqual(["kurz", "mittel"]);
    expect(laengeLabel("mittel")).toBe("Mittel");
    expect(isLaenge("kurz")).toBe(true);
    expect(isLaenge("lang")).toBe(false);
    expect(isLaenge(undefined)).toBe(false);
    expect(ANREDEN.map((a) => a.value)).toEqual(["du", "sie"]);
    expect(isAnrede("sie")).toBe(true);
    expect(isAnrede("ihr")).toBe(false);
    expect(anredeLabel("du")).toBe("Du");
    expect(istKritik(1)).toBe(true);
    expect(istKritik(3)).toBe(true);
    expect(istKritik(4)).toBe(false);
    expect(kopierLabel(0)).toBe("Variante 1 kopieren");
    expect(varianteTitel(output.varianten[1], 1)).toBe("Variante 2: herzlich");
    expect(charCount("Grüsse 😀")).toBe(8);
  });
});

describe("bewertungsantwort: Profil", () => {
  it("shorten kürzt an der Wortgrenze, ohne Satzzeichen am Ende, und lässt Kurzes stehen", () => {
    expect(shorten("  kurz   und gut ", 40)).toBe("kurz und gut");
    const lang = "Wir laden zum Besuch im Laden ein, weil man dort die Farben sehen kann und die Beratung bekommt";
    const kurz = shorten(lang, 60);
    expect(kurz.length).toBeLessThanOrEqual(60);
    expect(lang.startsWith(kurz)).toBe(true);
    expect(kurz).not.toMatch(/[\s,;:]$/);
    expect(kurz.endsWith("Farben")).toBe(true);
    expect(shorten("x".repeat(100), 40)).toBe("x".repeat(40));
    expect(shorten("", 10)).toBe("");
  });
  it("liest Werte, zu vermeidende Wörter und Regeln und begrenzt sie", () => {
    expect(profilWerte(profile)).toEqual(["Zuverlässigkeit", "Klarheit"]);
    expect(profilVermeiden(profile)).toEqual(["perfekt", "günstig"]);
    expect(profilRegeln(profile)).toEqual(["immer zum Besuch im Laden einladen"]);
    const viele = {
      marke: {
        werte: ["a", "A", "b", "c", "d", "e", "f", "x".repeat(60)],
        woerter: { vermeiden: Array.from({ length: 12 }, (_, i) => `wort${i}`).concat(["x".repeat(41)]) },
        bewertungsregeln: ["eins", " ", "zwei", "drei", "vier", "x".repeat(300)],
      },
    };
    expect(profilWerte(viele)).toEqual(["a", "b", "c", "d", "e"]);
    expect(profilVermeiden(viele)).toHaveLength(10);
    expect(profilVermeiden({ marke: { woerter: { vermeiden: ["x".repeat(41), "kurz"] } } })).toEqual(["kurz"]);
    expect(profilRegeln(viele)).toEqual(["eins", "zwei", "drei", "vier", "x".repeat(300)]);
    expect(regelnVorschlag(viele)).toEqual(["eins", "zwei", "drei"]);
    expect(regelnVorschlag({ marke: { bewertungsregeln: ["x".repeat(300)] } })[0]).toHaveLength(LIMITS.regel);
  });
  it("liefert leere Listen bei fehlender oder kaputter Marke", () => {
    for (const p of [{}, { marke: {} }, { marke: { werte: "kein Array", woerter: "x", bewertungsregeln: [1, null, {}] } }, { marke: { woerter: { vermeiden: "a, b" } } }]) {
      expect(profilWerte(p as never)).toEqual([]);
      expect(profilVermeiden(p as never)).toEqual([]);
      expect(profilRegeln(p as never)).toEqual([]);
      expect(regelnVorschlag(p as never)).toEqual([]);
    }
  });
  it("baut den Hinweis «Aus deinem Profil geht mit» nur aus vorhandenen Teilen", () => {
    const h = profilHinweise(profile);
    expect(h).toEqual({ werte: ["Zuverlässigkeit", "Klarheit"], vermeiden: ["perfekt", "günstig"] });
    expect(hinweisText(h)).toBe("Aus deinem Profil geht mit: Werte: Zuverlässigkeit, Klarheit; zu vermeidende Wörter: perfekt, günstig.");
    expect(hinweisNamen(h)).toEqual(["Werte", "zu vermeidende Wörter"]);
    expect(hinweisText({ werte: ["Klarheit"], vermeiden: [] })).toBe("Aus deinem Profil geht mit: Werte: Klarheit.");
    expect(hinweisNamen({ werte: [], vermeiden: ["perfekt"] })).toEqual(["zu vermeidende Wörter"]);
    expect(hinweisText({ werte: [], vermeiden: [] })).toBe("");
    expect(hinweisNamen({ werte: [], vermeiden: [] })).toEqual([]);
  });
  it("liest die Anrede aus der Tonalität des Profils", () => {
    expect(anredeFromProfile(profile)).toBe("sie");
    expect(anredeFromProfile({ marke: { tonalitaet: { so: "Du-Form, ruhig" } } })).toBe("du");
    expect(anredeFromProfile({})).toBe("");
  });
});

describe("bewertungsantwort: inputProblem", () => {
  const fields = { firma: "Malerei Keller" };
  it("lässt eine vollständige Eingabe durch, auch ohne Regeln", () => {
    expect(inputProblem(fields, form)).toBeNull();
    expect(inputProblem(fields, { ...form, regeln: [] })).toBeNull();
    expect(inputProblem(fields, { ...form, sterne: 1, anrede: "du", laenge: "mittel" })).toBeNull();
  });
  it("meldet in der Reihenfolge des Formulars, was fehlt", () => {
    expect(inputProblem({ firma: " " }, EMPTY_FORM)).toBe("Gib den Namen deines Betriebs an.");
    expect(inputProblem({}, form)).toBe("Gib den Namen deines Betriebs an.");
    expect(inputProblem(fields, EMPTY_FORM)).toBe("Wähle, ob du die Person duzt oder siezt.");
    expect(inputProblem(fields, { ...EMPTY_FORM, anrede: "du" })).toBe("Gib an, wie du die Antwort unterschreibst, zum Beispiel «Ruth Keller, Malerei Keller».");
    expect(inputProblem(fields, { ...EMPTY_FORM, anrede: "du", unterschrift: "Ruth" })).toBe("Füge den Text der Bewertung ein.");
    expect(inputProblem(fields, { ...EMPTY_FORM, anrede: "du", unterschrift: "Ruth", bewertung: "Gut" })).toBe("Wähle die Sterne der Bewertung.");
  });
  it("meldet zu lange Texte und ungültige Sterne", () => {
    expect(inputProblem(fields, { ...form, bewertung: "x".repeat(LIMITS.bewertung + 1) })).toBe("Die Bewertung ist zu lang. Es sind höchstens 1'500 Zeichen möglich.");
    expect(inputProblem(fields, { ...form, bewertung: "x".repeat(LIMITS.bewertung) })).toBeNull();
    expect(inputProblem(fields, { ...form, unterschrift: "x".repeat(LIMITS.unterschrift + 1) })).toBe("Die Unterschrift ist zu lang. Es sind höchstens 60 Zeichen möglich.");
    expect(inputProblem(fields, { ...form, regeln: ["ok", "x".repeat(LIMITS.regel + 1)] })).toBe("Regel 2 ist zu lang. Es sind höchstens 120 Zeichen möglich.");
    expect(inputProblem(fields, { ...form, sterne: 0 })).toBe("Wähle die Sterne der Bewertung.");
    expect(inputProblem(fields, { ...form, sterne: 6 })).toBe("Wähle die Sterne der Bewertung.");
    expect(inputProblem(fields, { ...form, sterne: 2.5 })).toBe("Wähle die Sterne der Bewertung.");
    expect(inputProblem(fields, { ...form, laenge: "lang" as never })).toBe("Wähle die Länge der Antwort.");
    expect(inputProblem(fields, { ...form, regeln: ["a", "b", "c", "d"] })).toBe("Es sind höchstens 3 Regeln möglich.");
  });
});

describe("bewertungsantwort: toInput", () => {
  it("bildet die Eingabe aus Formular und Profil, mit Werten und zu vermeidenden Wörtern", () => {
    expect(toInput(profile, form)).toEqual(input);
  });
  it("kommt ohne Marke aus: Werte und Wörter sind leer", () => {
    const i = toInput({ firma: "Malerei Keller" }, form);
    expect(i).not.toBeNull();
    expect(i?.werte).toEqual([]);
    expect(i?.vermeiden).toEqual([]);
    expect(i?.regeln).toEqual(["bei Kritik Gesprächsangebot machen", "nie Rabatte versprechen"]);
  });
  it("bereinigt Leerraum, behält Zeilenumbrüche der Bewertung und kürzt auf die Grenzen", () => {
    const i = toInput(profile, { ...form, bewertung: "  Erste   Zeile\n\n  Zweite Zeile  ", unterschrift: "  Ruth   Keller ", regeln: ["  eine   Regel ", "x".repeat(200), "", "vierte"] });
    expect(i?.bewertung).toBe("Erste Zeile\nZweite Zeile");
    expect(i?.unterschrift).toBe("Ruth Keller");
    expect(i?.regeln).toEqual(["eine Regel", "x".repeat(LIMITS.regel), "vierte"]);
    expect(toInput(profile, { ...form, bewertung: "x".repeat(2000) })?.bewertung).toHaveLength(LIMITS.bewertung);
    expect(toInput({ firma: "x".repeat(200), marke: profile.marke }, form)?.betrieb).toHaveLength(LIMITS.betrieb);
  });
  it("gibt null zurück, wenn das Schema nicht erfüllt ist", () => {
    expect(toInput(profile, { ...form, sterne: null })).toBeNull();
    expect(toInput(profile, { ...form, anrede: "" })).toBeNull();
    expect(toInput(profile, { ...form, unterschrift: " " })).toBeNull();
    expect(toInput(profile, { ...form, bewertung: "" })).toBeNull();
    expect(toInput({ marke: profile.marke }, form)).toBeNull();
  });
  it("macht aus einer gespeicherten Eingabe wieder ein Formular", () => {
    expect(toForm(input)).toEqual({ bewertung: form.bewertung, sterne: 3, anrede: "sie", laenge: "kurz", unterschrift: input.unterschrift, regeln: input.regeln });
    expect(toInput(profile, toForm(input))).toEqual(input);
  });
});

describe("bewertungsantwort: eingabeText", () => {
  it("nennt die Angaben je Zeile, lässt die Unterschrift weg und setzt die Bewertung ans Ende", () => {
    const t = eingabeText(input);
    const zeilen = t.split("\n");
    expect(zeilen.slice(0, 4)).toEqual(["Betrieb: Malerei Keller", "Sterne: 3", "Anrede: Sie", "Länge: Kurz"]);
    expect(t).toContain("Regel 1: bei Kritik Gesprächsangebot machen");
    expect(t).toContain("Regel 2: nie Rabatte versprechen");
    expect(t).toContain("Werte: Zuverlässigkeit, Klarheit");
    expect(t).toContain("Zu vermeiden: perfekt, günstig");
    expect(t).not.toContain("Ruth Keller");
    expect(t.endsWith(`Bewertung: ${form.bewertung}`)).toBe(true);
  });
  it("lässt leere Angaben weg", () => {
    const t = eingabeText({ ...input, regeln: [], werte: [], vermeiden: [], anrede: "du", laenge: "mittel" });
    expect(t).toBe(`Betrieb: Malerei Keller\nSterne: 3\nAnrede: Du\nLänge: Mittel\nBewertung: ${form.bewertung}`);
  });
});

describe("bewertungsantwort: feste Vorlage", () => {
  const kombis: [number, "du" | "sie"][] = [1, 2, 3, 4, 5].flatMap((s) => (["du", "sie"] as const).map((a) => [s, a] as [number, "du" | "sie"]));

  it("liefert zu jeder Kombination aus Sternen und Anrede zwei gültige, verschiedene Varianten mit Unterschrift", () => {
    for (const [sterne, anrede] of kombis) {
      const v = fallbackVorlagen(sterne, anrede, "Malerei Keller", "Ruth Keller, Malerei Keller");
      expect(v).toHaveLength(2);
      expect(bewertungOutput.safeParse({ varianten: v }).success).toBe(true);
      expect(v[0].ton).not.toBe(v[1].ton);
      expect(v[0].text).not.toBe(v[1].text);
      for (const x of v) {
        expect(x.text.endsWith("\nRuth Keller, Malerei Keller")).toBe(true);
        expect(x.text).not.toMatch(/\d/);
      }
    }
  });
  it("bedauert bei 1 bis 3 Sternen mit Gesprächsangebot und dankt bei 4 und 5 ohne Platzhalter", () => {
    for (const sterne of [1, 2, 3]) {
      const v = fallbackVorlagen(sterne, "sie", "Malerei Keller", "Ruth");
      expect(placeholdersIn(v)).toEqual([PLATZHALTER]);
      for (const x of v) expect(x.text).toMatch(/leid|bedauern/);
    }
    for (const sterne of [4, 5]) {
      const v = fallbackVorlagen(sterne, "du", "Malerei Keller", "Ruth");
      expect(placeholdersIn(v)).toEqual([]);
      for (const x of v) expect(x.text).toMatch(/Danke|Dank/);
    }
  });
  it("bleibt in der gewählten Anrede", () => {
    for (const [sterne, anrede] of kombis) {
      for (const x of fallbackVorlagen(sterne, anrede, "Malerei Keller", "Ruth")) {
        if (anrede === "sie") {
          expect(hasDuForm(x.text)).toBe(false);
          expect(x.text).toMatch(/Ihr|Sie/);
        } else {
          expect(hasSieForm(x.text)).toBe(false);
          expect(x.text).toMatch(/dein|dich|dir|du/);
        }
      }
    }
  });
  it("besteht dieselbe Prüfung wie ein KI-Entwurf und enthält keine Sperrwörter", () => {
    for (const [sterne, anrede] of kombis) {
      const v = fallbackVorlagen(sterne, anrede, "Malerei Keller", "Ruth Keller, Malerei Keller");
      expect(checkBewertung({ varianten: v }, { ...input, sterne, anrede, vermeiden: [] })).toBeNull();
      for (const x of v) {
        expect(brandHits(x.text).filter((h) => h.level === "hart")).toEqual([]);
        expect(x.text).not.toMatch(/[!—]|\bjetzt\b|\bgarantiert\b|Rabatt|Gutschein|Prozent|gratis/i);
      }
    }
  });
  it("kommt ohne Firma und ohne Unterschrift aus, ohne leere Zeile am Ende", () => {
    const v = fallbackVorlagen(4, "sie", "", "");
    expect(v[1].text).toContain("Vielen Dank für Ihre Rückmeldung.");
    for (const x of v) expect(x.text.endsWith("\n")).toBe(false);
    expect(fallbackVorlagen(2, "du", "Malerei Keller", "Ruth")[1].text).toContain("Rückmeldung zu Malerei Keller.");
    expect(bewertungOutput.safeParse({ varianten: v }).success).toBe(true);
  });
});

describe("bewertungsantwort: Dokument", () => {
  it("baut Titel, Facts und je Variante eine Überschrift und einen Absatz", () => {
    const doc = toDocument(output, input);
    expect(doc.title).toBe("Antwort auf eine Bewertung");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.filename).toBe("bewertungsantwort-malerei-keller");
    expect(doc.blocks[0]).toEqual({ type: "facts", items: [{ label: "Sterne", value: "3 Sterne" }, { label: "Anrede", value: "Sie" }] });
    expect(doc.blocks.slice(1)).toEqual([
      { type: "heading", level: 1, text: "Variante 1: sachlich" },
      { type: "paragraph", text: output.varianten[0].text },
      { type: "heading", level: 1, text: "Variante 2: herzlich" },
      { type: "paragraph", text: output.varianten[1].text },
    ]);
  });
  it("macht daraus Markdown fürs CRM, das beide Varianten vollständig enthält", () => {
    const md = reportMarkdown(output, input);
    expect(md).toContain("# Antwort auf eine Bewertung");
    expect(md).toContain("## Variante 1: sachlich");
    expect(md).toContain("## Variante 2: herzlich");
    expect(md).toContain("- **Sterne:** 3 Sterne");
    for (const v of output.varianten) expect(md).toContain(v.text);
    expect(md.length).toBeLessThan(1900);
  });
  it("hat auch ohne Betrieb einen Untertitel", () => {
    expect(toDocument(output, { ...input, betrieb: "" }).subtitle).toBe("Für Dein Betrieb");
  });
});

describe("bewertungsantwort: Profil schreiben", () => {
  it("schreibt die Regeln unter marke.bewertungsregeln und behält die anderen Schlüssel", () => {
    const patch = profilePatch(profile, ["bei Kritik Gesprächsangebot machen", " nie Rabatte versprechen ", ""]);
    expect(patch).toEqual({ marke: { ...profile.marke, bewertungsregeln: ["bei Kritik Gesprächsangebot machen", "nie Rabatte versprechen"] } });
    const merged = mergeProfile(sanitizeProfile(profile), patch);
    expect(merged.marke?.werte).toEqual(["Zuverlässigkeit", "Klarheit"]);
    expect(merged.marke?.tonalitaet).toEqual({ so: "ruhig", anrede: "sie" });
    expect(merged.marke?.bewertungsregeln).toEqual(["bei Kritik Gesprächsangebot machen", "nie Rabatte versprechen"]);
  });
  it("ersetzt, was vorher im Profil stand, auch wenn es mehr als drei Regeln waren", () => {
    const viele = { marke: { bewertungsregeln: ["eins", "zwei", "drei", "vier", "fünf"], werte: ["Klarheit"] } };
    expect(profilePatch(viele, ["eins", "zwei", "drei"])).toEqual({ marke: { bewertungsregeln: ["eins", "zwei", "drei"], werte: ["Klarheit"] } });
    expect(profilePatch(viele, [])).toEqual({ marke: { bewertungsregeln: [], werte: ["Klarheit"] } });
  });
  it("legt die Marke auch an, wenn das Profil keine hat", () => {
    expect(profilePatch({}, ["immer zum Besuch im Laden einladen"])).toEqual({ marke: { bewertungsregeln: ["immer zum Besuch im Laden einladen"] } });
  });
  it("schreibt nichts, wenn sich nichts ändert oder nichts da ist", () => {
    expect(profilePatch(profile, ["immer zum Besuch im Laden einladen"])).toEqual({});
    expect(profilePatch({}, [])).toEqual({});
    expect(profilePatch({}, ["", " "])).toEqual({});
    expect(profilePatch({ marke: { werte: ["Klarheit"] } }, [])).toEqual({});
  });
  it("lässt eine Regel über 120 Zeichen im Profil in voller Länge stehen, wenn die Person sie nicht geändert hat", () => {
    const lang = "Wir laden bei Lob immer zum Besuch im Laden ein und bei Kritik zu einem Gespräch am Telefon, weil wir Missverständnisse am liebsten gleich klären";
    const p = { marke: { bewertungsregeln: [lang, "zweite Regel"] } };
    const gezeigt = regelnVorschlag(p);
    expect(gezeigt[0].length).toBeLessThanOrEqual(LIMITS.regel);
    expect(gezeigt[0]).not.toBe(lang);
    // Unverändert: Profil bleibt, wie es ist.
    expect(profilePatch(p, gezeigt)).toEqual({});
    // Zweite Regel geändert: die erste bleibt in voller Länge.
    expect(profilePatch(p, [gezeigt[0], "neue zweite Regel"])).toEqual({ marke: { bewertungsregeln: [lang, "neue zweite Regel"] } });
    // Erste Regel geändert: die neue Fassung gilt.
    expect(profilePatch(p, ["kurze neue Regel", gezeigt[1]])).toEqual({ marke: { bewertungsregeln: ["kurze neue Regel", "zweite Regel"] } });
  });
});

describe("bewertungsantwort: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 42, [], {}, { v: 2, input }, { v: 1 }, { v: 1, input: null }, { v: 1, input: { ...input, sterne: 9 } }, { v: 1, input: { ...input, anrede: "ihr" } }]) {
      expect(parseState(raw)).toEqual(EMPTY_STATE);
    }
  });
  it("liest einen vollständigen Stand zurück", () => {
    const stand = { v: 1 as const, input, output, vorlage: false };
    expect(parseState(JSON.parse(JSON.stringify(stand)))).toEqual(stand);
  });
  it("behält die Eingabe, wenn der Entwurf kaputt ist", () => {
    expect(parseState({ v: 1, input, output: { varianten: [output.varianten[0]] } })).toEqual({ v: 1, input, output: null, vorlage: false });
    expect(parseState({ v: 1, input, output: "kaputt" })).toEqual({ v: 1, input, output: null, vorlage: false });
    expect(parseState({ v: 1, input })).toEqual({ v: 1, input, output: null, vorlage: false });
  });
  it("kennt das Kennzeichen der festen Vorlage nur ohne Entwurf", () => {
    expect(parseState({ v: 1, input, output: null, vorlage: true })).toEqual({ v: 1, input, output: null, vorlage: true });
    expect(parseState({ v: 1, input, output, vorlage: true })).toEqual({ v: 1, input, output, vorlage: false });
    expect(parseState({ v: 1, input, output: null, vorlage: "ja" })).toEqual({ v: 1, input, output: null, vorlage: false });
  });
  it("zählt im Pfad nur mit Entwurf als erledigt, nicht mit der festen Vorlage", () => {
    expect(isToolDone(JSON.stringify({ v: 1, input, output, vorlage: false }))).toBe(true);
    expect(isToolDone(JSON.stringify({ v: 1, input, output: null, vorlage: true }))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });
  it("zeigt Entwurf oder Vorlage, sonst nichts", () => {
    expect(shownVarianten(EMPTY_STATE)).toBeNull();
    expect(shownVarianten({ v: 1, input, output: null, vorlage: false })).toBeNull();
    expect(shownVarianten({ v: 1, input: null, output: null, vorlage: true })).toBeNull();
    expect(shownVarianten({ v: 1, input, output, vorlage: false })).toEqual({ varianten: output.varianten, vorlage: false });
    const vorlage = shownVarianten({ v: 1, input, output: null, vorlage: true });
    expect(vorlage?.vorlage).toBe(true);
    expect(vorlage?.varianten).toEqual(fallbackVorlagen(3, "sie", "Malerei Keller", "Ruth Keller, Malerei Keller"));
  });
});

describe("bewertungsantwort: Texte", () => {
  it("nennt den KI-Hinweis und die Vorlagen-Meldungen wörtlich", () => {
    expect(KI_HINWEIS).toBe("Von einer KI formuliert. Prüfe die Antwort, bevor du sie veröffentlichst.");
    expect(VORLAGE_HINWEIS).toBe("Die KI ist gerade nicht erreichbar; hier eine feste Vorlage.");
    expect(VORLAGE_AUSGABE).toBe("Vorlage (ohne KI)");
  });
  it("hält die eigenen Texte frei von Sperrwörtern", () => {
    const texte = [KI_HINWEIS, VORLAGE_HINWEIS, ...ANREDEN.map((a) => a.label), ...LAENGEN.map((l) => `${l.label} ${l.hint}`)];
    for (const t of texte) expect(brandHits(t).filter((h) => h.level === "hart")).toEqual([]);
  });
});
