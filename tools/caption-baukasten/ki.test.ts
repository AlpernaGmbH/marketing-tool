import { describe, expect, it } from "vitest";
import { postInput, postOutput, type PostOutput } from "@/tools/post-generator/generator";
import { FORMAT_JE_KATEGORIE, kiInput, kiProblem, kiTextVon } from "./ki";
import {
  EMPTY_FELDER,
  EMPTY_FRAGEN,
  KI_IDEE_MAX,
  KI_IDEE_MIN,
  ausgabeText,
  captionTexts,
  eingabeText,
  fragenProblem,
  inputProblem,
  newDraft,
  parseFelder,
  parseState,
  partsOf,
  type Felder,
  type KiFragen,
} from "./logic";

// Weg «ki» des Caption-Baukastens: drei Fragen, Eingabe für den Generator, Ergebnis als Texte aller vier Plattformen.

const IDEE = "Diese Woche haben wir in Gossau eine Fassade gestrichen, deren alter Anstrich nach wenigen Wintern abblätterte.";
const fragen: KiFragen = { idee: IDEE, kategorie: "kundenprojekt", ziel: "nachricht" };
const profil = { firma: "Malerei Keller", branche: "Malerei", ort: "Gossau" };

const output: PostOutput = {
  hooks: ["Warum blättert der Anstrich schon nach wenigen Wintern ab?", "Ein Anstrich hält nur so gut wie der Untergrund darunter."],
  hauptteil:
    "Diese Woche haben wir in Gossau eine Fassade neu gestrichen. Der alte Anstrich blätterte nach wenigen Wintern ab.\n\nDer Grund war einfach: Der Untergrund war noch feucht. Dann haftet die Farbe schlecht.\n\nDarum messen wir die Feuchtigkeit, bevor wir den ersten Strich setzen.",
  cta: "Schreib uns eine Nachricht, wenn deine Fassade ähnlich aussieht.",
  hinweis: "",
};

const felderKi = (patch: Partial<Felder> = {}): Felder => ({ ...EMPTY_FELDER, anrede: "du", fragen, ki: kiTextVon(output), ...patch });

describe("caption-baukasten: Weg mit KI, Eingabe", () => {
  it("macht aus den drei Fragen eine gültige Eingabe des Generators (Instagram, ohne Emojis)", () => {
    const input = kiInput(profil, fragen, "du");
    expect(postInput.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ betrieb: "Malerei Keller", ort: "Gossau", plattform: "instagram", ziel: "nachricht", kategorie: "kundenprojekt", anrede: "du", emojis: false });
    expect(input.format).toBe(FORMAT_JE_KATEGORIE.kundenprojekt);
    expect(input.saeule).toBe("");
  });

  it("lässt die Kategorie weg, wenn sie leer ist, und wählt das Format dazu", () => {
    const input = kiInput(profil, { ...fragen, kategorie: "" }, "sie");
    expect("kategorie" in input).toBe(false);
    expect(input.format).toBe("geschichte");
    expect(input.anrede).toBe("sie");
    expect(kiInput(profil, { ...fragen, kategorie: "tipp" }, "du").format).toBe("fachtipp");
    expect(kiInput(profil, { ...fragen, kategorie: "angebot" }, "du").format).toBe("liste");
  });

  it("schickt nur Angaben, die das Werkzeug nennt: weder E-Mail noch das ganze Profil", () => {
    const text = JSON.stringify(kiInput({ ...profil, positionierung: "Der Malerbetrieb in Gossau.", marke: { werte: ["Verlässlich"] }, contentSaeulen: [{ name: "Team" }], personas: [{ name: "Ruth" }] }, fragen, "du"));
    expect(text).not.toMatch(/@/);
    expect(text).toContain("Der Malerbetrieb in Gossau.");
  });

  it("meldet fehlenden Betrieb, zu kurze und zu lange Idee mit dem Feld", () => {
    expect(kiProblem({ firma: "" }, fragen)).toMatchObject({ fieldId: "cb-firma" });
    expect(kiProblem({ firma: "Malerei Keller" }, { ...fragen, idee: "kurz" })).toMatchObject({ fieldId: "cb-ki-idee" });
    expect(kiProblem({ firma: "Malerei Keller" }, { ...fragen, idee: "x".repeat(KI_IDEE_MAX + 1) })?.message).toMatch(/Kürze die Idee/);
    expect(kiProblem({ firma: "Malerei Keller" }, fragen)).toBeNull();
    expect(fragenProblem({ ...EMPTY_FRAGEN, idee: "x".repeat(KI_IDEE_MIN) })).toBeNull();
    expect(fragenProblem({ ...EMPTY_FRAGEN, idee: "x".repeat(KI_IDEE_MIN - 1) })).not.toBeNull();
  });
});

describe("caption-baukasten: Weg mit KI, Ergebnis", () => {
  it("übernimmt Hooks, Absätze und Aufforderung der KI; der erste Hook gilt, der zweite ist wählbar", () => {
    expect(postOutput.safeParse(output).success).toBe(true);
    const ki = kiTextVon(output);
    expect(ki.hooks).toEqual(output.hooks);
    expect(ki.hook).toBe(0);
    expect(ki.teile).toHaveLength(3);
    expect(partsOf(felderKi()).hook).toBe(output.hooks[0]);
    expect(partsOf(felderKi({ ki: { ...ki, hook: 1 } })).hook).toBe(output.hooks[1]);
  });

  it("setzt daraus die Texte aller vier Plattformen; Hashtags nur unter Instagram", () => {
    const t = captionTexts(felderKi({ hashtags: "#MalereiKeller #Gossau" }));
    expect(t.instagram.startsWith(output.hooks[0])).toBe(true);
    expect(t.instagram).toContain("#MalereiKeller");
    for (const p of ["linkedin", "facebook", "google"] as const) {
      expect(t[p]).toContain(output.cta);
      expect(t[p]).not.toContain("#");
    }
    expect(t.google).not.toContain("\n\n");
    expect(Array.from(t.google).length).toBeLessThanOrEqual(1500);
  });

  it("gilt als vollständig, sobald die KI geschrieben hat, und nicht vorher", () => {
    expect(inputProblem({ ...EMPTY_FELDER, fragen })?.fieldId).toBe("cb-ki-idee");
    expect(inputProblem(felderKi())).toBeNull();
  });

  it("schreibt die CRM-Texte lesbar: drei Fragen als Eingabe, die vier Texte als Ausgabe", () => {
    const f = felderKi({ hashtags: "#Gossau" });
    const lines = eingabeText(f).split("\n");
    expect(lines).toEqual([
      "Weg: KI in drei Fragen",
      `Idee: ${IDEE}`,
      "Worum geht es: Kundenprojekt",
      "Ziel: Direktnachricht",
      "Anrede: Du",
      "Hashtags: #Gossau",
    ]);
    expect(eingabeText(felderKi({ fragen: { ...fragen, kategorie: "" } }))).toContain("Worum geht es: keine Angabe");
    const out = ausgabeText(captionTexts(f));
    expect(out).toContain("Instagram (");
    expect(out).toContain(output.hooks[0]);
  });
});

describe("caption-baukasten: Weg mit KI, gespeicherter Stand", () => {
  it("speichert und liest Fragen und Ergebnis; ein Entwurf trägt den Hook, der gewählt war", () => {
    const f = felderKi({ ki: { ...kiTextVon(output), hook: 1 } });
    const back = parseFelder(JSON.parse(JSON.stringify(f)));
    expect(back).toEqual(f);
    expect(newDraft(f, new Date("2026-10-09T10:00:00Z")).titel).toBe(output.hooks[1]);
    const state = parseState({ v: 1, phase: "result", felder: f, entwuerfe: [newDraft(f, new Date("2026-10-09T10:00:00Z"))] });
    expect(state.phase).toBe("result");
    expect(state.entwuerfe).toHaveLength(1);
  });

  it("ohne Ergebnis der KI bleibt der Stand im Formular, auch wenn «result» gespeichert ist", () => {
    expect(parseState({ v: 1, phase: "result", felder: { ...EMPTY_FELDER, fragen }, entwuerfe: [] }).phase).toBe("edit");
  });

  it("verwirft kaputte Ergebnisse der KI und unbekannte Auswahl", () => {
    const base = JSON.parse(JSON.stringify(felderKi()));
    expect(parseFelder({ ...base, ki: { hooks: ["nur einer"], hook: 0, teile: ["x"], cta: "y" } }).ki).toBeNull();
    expect(parseFelder({ ...base, ki: { hooks: ["a", "b"], hook: 0, teile: [], cta: "y" } }).ki).toBeNull();
    expect(parseFelder({ ...base, ki: { hooks: ["a", "b"], hook: 0, teile: ["x"], cta: "" } }).ki).toBeNull();
    expect(parseFelder({ ...base, ki: { hooks: ["a", "b"], hook: 7, teile: ["x"], cta: "y" } }).ki?.hook).toBe(0);
    expect(parseFelder({ ...base, fragen: { idee: 5, kategorie: "werbung", ziel: "kaufen" } }).fragen).toEqual(EMPTY_FRAGEN);
    expect(parseFelder({ ...base, modus: "ueberall" }).modus).toBe("selbst");
    expect(parseFelder({ ...base, fragen: { ...fragen, idee: "x".repeat(KI_IDEE_MAX + 50) } }).fragen.idee).toHaveLength(KI_IDEE_MAX);
  });

  it("liest Stände ohne Weg als «selbst», der leere Stand beginnt mit «ki»", () => {
    const { modus: _weg, fragen: _f, ki: _k, ...alt } = felderKi({ modus: "selbst" });
    void _weg;
    void _f;
    void _k;
    expect(parseFelder(alt).modus).toBe("selbst");
    expect(EMPTY_FELDER.modus).toBe("ki");
    expect(parseFelder(null)).toEqual(EMPTY_FELDER);
  });
});
