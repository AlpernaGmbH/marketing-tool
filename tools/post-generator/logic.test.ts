import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { styleIssues } from "@/lib/content-rules";
import { PLATFORMS } from "@/tools/caption-baukasten/logic";
import { LIMITS, checkPost, postInput, postOutput, type PostInput, type PostOutput } from "./generator";
import {
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  FORMATE,
  KI_HINWEIS,
  MAX_ENTWUERFE,
  PLATTFORMEN,
  ZIELE,
  addDraft,
  anredeLabel,
  compose,
  counterLabel,
  draftText,
  draftTitle,
  eingabeText,
  foldHint,
  foldInfo,
  formatLabel,
  hatAnredeImProfil,
  hatHashtags,
  hinweisNamen,
  hinweisOf,
  ideeText,
  inputProblem,
  isAnrede,
  isFormat,
  isPlattform,
  isZiel,
  joinNamen,
  newDraft,
  paragraphs,
  parseState,
  personaText,
  plattformLabel,
  profilTeile,
  removeDraft,
  reportMarkdown,
  resolveAnrede,
  saeulenNamen,
  splitAtFold,
  tonalitaetText,
  toDocument,
  toForm,
  toInput,
  zielLabel,
  type Entwurf,
  type FormValues,
} from "./logic";

const profil = {
  firma: "Malerei Keller",
  branche: "Malerei",
  ort: "Gossau",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  marke: {
    werte: ["Verlässlich", "Sauber", "Ehrlich"],
    tonalitaet: { so: "ruhig und konkret", nichtSo: "laut und vollmundig", anrede: "du" },
    woerter: { verwenden: ["Termin"], vermeiden: ["günstig", "Top-Qualität"] },
  },
  contentSaeulen: [{ name: "Fassaden vorher und nachher" }, { name: "Team und Lehre" }],
  personas: [{ name: "Ruth Brunner" }, { name: "Peter Egli" }],
};

const form: FormValues = {
  idee: "Diese Woche haben wir in Gossau eine Fassade gestrichen, deren alter Anstrich nach wenigen Wintern abblätterte. Der Untergrund war beim letzten Mal noch feucht.",
  plattform: "instagram",
  format: "fachtipp",
  ziel: "kommentar",
  saeule: "Fassaden vorher und nachher",
  anrede: "du",
  emojis: false,
};

const input: PostInput = toInput(profil, form);

const output: PostOutput = {
  hooks: ["Warum blättert der Anstrich schon nach wenigen Wintern ab?", "Ein Anstrich hält nur so gut wie der Untergrund darunter."],
  hauptteil:
    "Diese Woche haben wir in Gossau eine Fassade neu gestrichen. Der alte Anstrich blätterte nach wenigen Wintern ab.\n\nDer Grund war einfach: Der Untergrund war beim letzten Mal noch feucht. Dann haftet die Farbe schlecht.\n\nDarum messen wir die Feuchtigkeit, bevor wir den ersten Strich setzen. Erst wenn die Wand trocken ist, streichen wir.",
  cta: "Was hast du an deiner Fassade erlebt? Schreib es uns in die Kommentare.",
  hinweis: "Ein Foto der Fassade vor und nach dem Anstrich würde den Beitrag stärken.",
};

const TAGS = "#MalereiKeller #Gossau #Fassadenanstrich";

describe("post-generator: Auswahl aus dem Profil", () => {
  it("liest Positionierung, Werte, Tonalität, zu vermeidende Wörter, Persona-Namen und Säulen", () => {
    const t = profilTeile(profil);
    expect(t.positionierung).toBe(profil.positionierung);
    expect(t.werte).toEqual(["Verlässlich", "Sauber", "Ehrlich"]);
    expect(t.tonalitaet).toBe("So schreiben wir: ruhig und konkret. So nicht: laut und vollmundig.");
    expect(t.vermeiden).toEqual(["günstig", "Top-Qualität"]);
    expect(t.persona).toBe("Ruth Brunner, Peter Egli");
    expect(t.saeulen).toEqual(["Fassaden vorher und nachher", "Team und Lehre"]);
  });

  it("liefert bei leerem oder kaputtem Profil leere Teile und stürzt nicht ab", () => {
    const leer = { positionierung: "", werte: [], tonalitaet: "", vermeiden: [], persona: "", saeulen: [] };
    expect(profilTeile({})).toEqual(leer);
    expect(profilTeile({ marke: { werte: "nicht eine Liste", tonalitaet: 5, woerter: "x" }, personas: [null, 5, { name: 3 }], contentSaeulen: [{}, { name: " " }] } as never)).toEqual(leer);
  });

  it("kürzt Werte, Wörter, Persona-Namen und Positionierung auf die Grenzen des Schemas und lässt Doppel weg", () => {
    const marke = {
      werte: ["a", "A", "b", "c", "d", "e", "f", "g", "w".repeat(60)],
      woerter: { vermeiden: Array.from({ length: 14 }, (_, i) => `Wort${i}`) },
      tonalitaet: { so: "t".repeat(500) },
    };
    const t = profilTeile({
      positionierung: "p".repeat(700),
      marke,
      personas: Array.from({ length: 8 }, (_, i) => ({ name: `Persona-mit-langem-Namen-${i}-${"n".repeat(40)}` })),
      contentSaeulen: [{ name: "s".repeat(90) }],
    });
    expect(t.positionierung).toHaveLength(LIMITS.positionierung);
    expect(t.werte).toEqual(["a", "b", "c", "d", "e"]);
    expect(t.vermeiden).toHaveLength(LIMITS.vermeiden);
    expect(t.tonalitaet.length).toBeLessThanOrEqual(LIMITS.tonalitaet);
    expect(t.persona.length).toBeLessThanOrEqual(LIMITS.persona);
    expect(t.saeulen[0]).toHaveLength(LIMITS.saeule);
    expect(profilTeile({ marke: { werte: ["w".repeat(60)] } }).werte[0]).toHaveLength(LIMITS.wert);
  });

  it("liest die Tonalität als «So schreiben wir» und «So nicht», sonst aus den Texten ohne die Anrede", () => {
    expect(tonalitaetText({ tonalitaet: { so: "ruhig." } })).toBe("So schreiben wir: ruhig.");
    expect(tonalitaetText({ tonalitaet: { nichtSo: "laut" } })).toBe("So nicht: laut.");
    expect(tonalitaetText({ tonalitaet: { anrede: "du", stil: "ruhig und nah", ziel: "Vertrauen" } })).toBe("ruhig und nah Vertrauen");
    expect(tonalitaetText({ tonalitaet: { anrede: "du" } })).toBe("");
    expect(tonalitaetText({})).toBe("");
    expect(tonalitaetText(undefined)).toBe("");
  });

  it("nennt Namen von Säulen und Personas ohne Leere und Doppel", () => {
    expect(saeulenNamen({ contentSaeulen: [{ name: " Team " }, { name: "team" }, { name: "" }, { name: "Region" }] })).toEqual(["Team", "Region"]);
    expect(saeulenNamen({})).toEqual([]);
    expect(personaText({ personas: [{ name: "Ruth" }, { name: "ruth" }, { name: "Peter" }] })).toBe("Ruth, Peter");
    expect(personaText({})).toBe("");
  });

  it("nennt die mitgehenden Teile für den Hinweis; die Säule nur, wenn sie gewählt ist und im Profil steht", () => {
    const t = profilTeile(profil);
    expect(hinweisNamen(t)).toEqual(["Positionierung", "Werte", "Tonalität", "zu vermeidende Wörter", "Persona-Namen"]);
    expect(hinweisNamen(t, "Team und Lehre")).toContain("Säule");
    expect(hinweisNamen(t, "Etwas anderes")).not.toContain("Säule");
    expect(hinweisNamen(profilTeile({}))).toEqual([]);
    expect(joinNamen(["Positionierung", "Werte", "Tonalität"])).toBe("Positionierung, Werte und Tonalität");
    expect(joinNamen(["Werte"])).toBe("Werte");
    expect(joinNamen([])).toBe("");
  });

  it("wählt die Anrede: gewählt, sonst aus der Tonalität im Profil, sonst Du", () => {
    expect(resolveAnrede("sie", { marke: { tonalitaet: { anrede: "du" } } })).toBe("sie");
    expect(resolveAnrede("", { marke: { tonalitaet: { anrede: "sie" } } })).toBe("sie");
    expect(resolveAnrede("", { marke: { tonalitaet: { anrede: "du" } } })).toBe("du");
    expect(resolveAnrede("", {})).toBe("du");
    expect(hatAnredeImProfil({ marke: { tonalitaet: { anrede: "sie" } } })).toBe(true);
    expect(hatAnredeImProfil({})).toBe(false);
  });
});

describe("post-generator: Eingabe", () => {
  it("meldet, was fehlt, in dieser Reihenfolge und mit dem Feld, das gemeint ist", () => {
    expect(inputProblem({ firma: "" }, form)).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: "pg-firma" });
    expect(inputProblem({ firma: "  " }, form)?.fieldId).toBe("pg-firma");
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, idee: "zu kurz" })?.fieldId).toBe("pg-idee");
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, idee: "zu kurz" })?.message).toContain(`mindestens ${LIMITS.ideeMin} Zeichen`);
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, idee: "x".repeat(LIMITS.idee + 1) })?.message).toBe(`Kürze die Idee auf ${LIMITS.idee} Zeichen.`);
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, plattform: "" })).toEqual({ message: "Wähle die Plattform.", fieldId: "pg-plattform" });
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, format: "" })?.fieldId).toBe("pg-format");
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, ziel: "" })?.fieldId).toBe("pg-ziel");
    expect(inputProblem({ firma: "Malerei Keller" }, form)).toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, idee: `${"x".repeat(10)}   \n\n  ${"y".repeat(9)}` })).toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, { ...form, idee: `${"x".repeat(9)}   \n\n  ${"y".repeat(5)}` })).not.toBeNull();
    expect(inputProblem({ firma: "Malerei Keller" }, { ...EMPTY_FORM, idee: form.idee })).toBeNull();
  });

  it("baut mit Profil die Eingabe für die KI: Betrieb, Auswahl, Positionierung, Werte, Tonalität, Wörter, Persona, Säule", () => {
    expect(postInput.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({
      betrieb: "Malerei Keller",
      branche: "Malerei",
      ort: "Gossau",
      plattform: "instagram",
      format: "fachtipp",
      ziel: "kommentar",
      saeule: "Fassaden vorher und nachher",
      anrede: "du",
      emojis: false,
      positionierung: profil.positionierung,
      werte: ["Verlässlich", "Sauber", "Ehrlich"],
      tonalitaet: "So schreiben wir: ruhig und konkret. So nicht: laut und vollmundig.",
      vermeiden: ["günstig", "Top-Qualität"],
      persona: "Ruth Brunner, Peter Egli",
    });
    // Nur diese Felder gehen an die KI: weder E-Mail noch Name der Person noch das ganze Profil.
    expect(Object.keys(input).sort()).toEqual(
      ["anrede", "betrieb", "branche", "emojis", "format", "idee", "ort", "persona", "plattform", "positionierung", "saeule", "tonalitaet", "vermeiden", "werte", "ziel"].sort(),
    );
  });

  it("baut ohne Profil eine gültige Eingabe mit leeren Hintergrundfeldern und Du als Anrede", () => {
    const i = toInput({ firma: "FC Trogen" }, { ...EMPTY_FORM, idee: "Am Samstag spielt die erste Mannschaft gegen den Nachbarn aus Speicher." });
    expect(postInput.safeParse(i).success).toBe(true);
    expect(i).toMatchObject({ betrieb: "FC Trogen", branche: "", ort: "", saeule: "", anrede: "du", emojis: false, positionierung: "", werte: [], tonalitaet: "", vermeiden: [], persona: "" });
    expect(i.plattform).toBe("instagram");
  });

  it("nimmt eine Säule nur, wenn sie im Profil steht, folgt der Anrede im Profil und bereinigt die Idee", () => {
    expect(toInput(profil, { ...form, saeule: "Gibt es nicht" }).saeule).toBe("");
    expect(toInput({ ...profil, contentSaeulen: [] }, form).saeule).toBe("");
    expect(toInput({ ...profil, marke: { tonalitaet: { anrede: "sie" } } }, { ...form, anrede: "" }).anrede).toBe("sie");
    expect(toInput({ ...profil, marke: { tonalitaet: { anrede: "sie" } } }, { ...form, anrede: "du" }).anrede).toBe("du");
    expect(toInput(profil, { ...form, emojis: true }).emojis).toBe(true);
    const i = toInput(profil, { ...form, idee: "  Zeile   eins \n\n\n\n  Zeile zwei   " });
    expect(i.idee).toBe("Zeile eins\n\nZeile zwei");
    // Unbekannte Auswahl fällt auf die Standardwerte zurück; inputProblem lässt sie vorher nicht durch.
    expect(toInput(profil, { ...form, plattform: "", format: "", ziel: "" })).toMatchObject({ plattform: "instagram", format: "geschichte", ziel: "kommentar" });
  });

  it("bleibt auch mit riesigem Profil und langer Idee innerhalb des Schemas", () => {
    const gross = {
      firma: "F".repeat(300),
      branche: "B".repeat(300),
      ort: "O".repeat(300),
      positionierung: "P".repeat(2000),
      marke: { werte: Array.from({ length: 12 }, (_, i) => `Wert ${i} ${"w".repeat(80)}`), woerter: { vermeiden: Array.from({ length: 30 }, (_, i) => `Wort ${i}`) }, tonalitaet: { so: "s".repeat(2000), nichtSo: "n".repeat(2000) } },
      contentSaeulen: [{ name: "S".repeat(200) }],
      personas: Array.from({ length: 10 }, (_, i) => ({ name: `Persona ${i} ${"p".repeat(100)}` })),
    };
    const i = toInput(gross, { ...form, idee: "i".repeat(2000), saeule: "S".repeat(60) });
    expect(postInput.safeParse(i).success).toBe(true);
    expect(i.idee).toHaveLength(LIMITS.idee);
  });

  it("gibt aus der gespeicherten Eingabe das Formular zurück", () => {
    expect(toForm(input)).toEqual({ ...form });
    expect(toForm({ ...input, saeule: "", anrede: "sie", emojis: true })).toMatchObject({ saeule: "", anrede: "sie", emojis: true });
  });

  it("macht aus einer gemerkten Beitragsidee den Text für das Feld, höchstens 600 Zeichen", () => {
    expect(ideeText({ titel: "Ein Tag auf der Baustelle", beschrieb: "Zeig, wie ein Morgen im Team aussieht." })).toBe("Ein Tag auf der Baustelle. Zeig, wie ein Morgen im Team aussieht.");
    expect(ideeText({ titel: "Wie lange hält ein Anstrich?", beschrieb: "Beantworte die Frage vom Telefon." })).toBe("Wie lange hält ein Anstrich? Beantworte die Frage vom Telefon.");
    expect(ideeText({ titel: "", beschrieb: "Nur ein Beschrieb ohne Titel." })).toBe("Nur ein Beschrieb ohne Titel.");
    expect(ideeText({ titel: "T".repeat(300), beschrieb: "b".repeat(600) })).toHaveLength(LIMITS.idee);
  });

  it("schreibt die Angaben fürs CRM, eine je Zeile, leere Felder fallen weg, das Wichtigste steht oben", () => {
    const text = eingabeText(input);
    const zeilen = text.split("\n");
    expect(zeilen.slice(0, 7)).toEqual([
      "Betrieb: Malerei Keller",
      "Ort: Gossau",
      "Branche: Malerei",
      "Plattform: Instagram",
      "Format: Fachtipp",
      "Ziel der Aufforderung: Kommentar",
      "Anrede: Du",
    ]);
    expect(text).toContain("Emojis: nicht erlaubt");
    expect(text).toContain("Säule: Fassaden vorher und nachher");
    expect(text).toContain("Idee: Diese Woche haben wir in Gossau");
    expect(text).toContain("Zu vermeidende Wörter: günstig, Top-Qualität");
    expect(text).toContain("Persona: Ruth Brunner, Peter Egli");
    const knapp = eingabeText(toInput({ firma: "FC Trogen" }, { ...EMPTY_FORM, idee: "Am Samstag spielt die erste Mannschaft gegen den Nachbarn.", emojis: true }));
    expect(knapp).not.toMatch(/Ort:|Branche:|Säule:|Positionierung:|Werte:|Tonalität:|vermeidende|Persona:/);
    expect(knapp).toContain("Emojis: erlaubt");
    expect(eingabeText({ ...input, idee: "Zeile eins\n\nZeile zwei zur Fassade" })).toContain("Idee: Zeile eins / Zeile zwei zur Fassade");
  });
});

describe("post-generator: der fertige Beitrag", () => {
  it("setzt bei Instagram Hook, Hauptteil, Aufforderung und die Hashtags der Person mit Leerzeilen zusammen", () => {
    const text = compose(output, 0, TAGS, "instagram");
    expect(text).toBe([output.hooks[0], output.hauptteil, output.cta, TAGS].join("\n\n"));
    expect(compose(output, 1, TAGS, "instagram").startsWith(output.hooks[1])).toBe(true);
    expect(compose(output, 0, "", "instagram")).toBe([output.hooks[0], output.hauptteil, output.cta].join("\n\n"));
  });

  it("bereinigt die Hashtags: Raute ergänzt, Doppel und Sonderzeichen weg", () => {
    expect(compose(output, 0, "malerei, #Gossau #malerei Fassade!", "instagram").endsWith("\n\n#malerei #Gossau #Fassade")).toBe(true);
    expect(compose(output, 0, "   ", "instagram").endsWith(output.cta)).toBe(true);
  });

  it("hängt nur bei Instagram Hashtags an", () => {
    expect(hatHashtags("instagram")).toBe(true);
    for (const p of ["linkedin", "facebook", "google"] as const) {
      expect(hatHashtags(p)).toBe(false);
      expect(compose(output, 0, TAGS, p)).not.toContain("#");
    }
    expect(compose(output, 0, TAGS, "linkedin")).toBe([output.hooks[0], output.hauptteil, output.cta].join("\n\n"));
    expect(compose(output, 0, TAGS, "facebook")).toBe([output.hooks[0], output.hauptteil, output.cta].join("\n\n"));
  });

  it("schreibt den Google-Beitrag ohne Leerzeilen, mit einfachen Zeilenumbrüchen", () => {
    const text = compose(output, 0, TAGS, "google");
    expect(text).not.toContain("\n\n");
    expect(text.split("\n")[0]).toBe(output.hooks[0]);
    expect(text.endsWith(output.cta)).toBe(true);
    expect(text).toContain("feucht. Dann haftet die Farbe schlecht.\nDarum messen wir");
  });

  it("räumt Schreibweise und Leerraum auf und wählt bei einem ungültigen Hook-Index den ersten", () => {
    const o = { ...output, hooks: ["Warum  heisst es \"Anstrich\" ?  ", "Ein Anstrich hält nur so gut wie der Untergrund darunter."] as [string, string] };
    expect(compose(o, 0, "", "linkedin").startsWith("Warum heisst es «Anstrich» ?")).toBe(true);
    expect(compose(output, 7 as never, "", "linkedin").startsWith(output.hooks[0])).toBe(true);
  });

  it("nutzt die Faltkante und den Zähler des Caption-Baukastens für die Vorschau", () => {
    const text = compose(output, 0, TAGS, "instagram");
    const info = foldInfo("instagram", text);
    expect(info).toEqual({ limit: 125, before: 125, over: Array.from(text).length - 125 });
    const { before, after } = splitAtFold("instagram", text);
    expect(before + after).toBe(text);
    expect(Array.from(before)).toHaveLength(125);
    expect(counterLabel("instagram", text)).toBe("512 Zeichen, davon 125 vor der Faltkante");
    expect(counterLabel("google", compose(output, 0, "", "google"))).toBe("466 Zeichen, davon 466 innerhalb der Grenze von 1'500");
    expect(foldHint("instagram", info.over)).toContain("«mehr»");
    expect(foldHint("google", 0)).toBe("Der Text passt in die Grenze.");
    expect(PLATFORMS.instagram.limit).toBe(125);
  });

  it("zerlegt einen Text in Absätze und liest den Hinweis der KI", () => {
    expect(paragraphs("Eins.\n\nZwei.\n\n\nDrei.\nVier.")).toEqual(["Eins.", "Zwei.", "Drei.\nVier."]);
    expect(paragraphs("  \n\n ")).toEqual([]);
    expect(hinweisOf(output)).toBe(output.hinweis);
    expect(hinweisOf({ ...output, hinweis: undefined })).toBe("");
    expect(hinweisOf({ ...output, hinweis: "  Mit   Leerraum.  " })).toBe("Mit Leerraum.");
  });
});

describe("post-generator: Dokument", () => {
  it("heisst «Beitrag: <Plattform>» und enthält beide Hooks, den Hauptteil in Absätzen und die Aufforderung", () => {
    const doc = toDocument(output, input);
    expect(doc.title).toBe("Beitrag: Instagram");
    expect(doc.subtitle).toBe("Für Malerei Keller");
    expect(doc.filename).toBe("beitrag-instagram-malerei-keller");
    const facts = doc.blocks[0];
    expect(facts).toMatchObject({ type: "facts" });
    if (facts.type === "facts") {
      expect(facts.items.map((f) => `${f.label}: ${f.value}`)).toEqual([
        "Betrieb: Malerei Keller, Gossau",
        "Plattform: Instagram",
        "Format: Fachtipp",
        "Ziel der Aufforderung: Kommentar",
        "Anrede: Du",
      ]);
    }
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: KI_HINWEIS });
    expect(doc.blocks).toContainEqual({ type: "list", ordered: true, items: output.hooks });
    for (const p of paragraphs(output.hauptteil)) expect(doc.blocks).toContainEqual({ type: "paragraph", text: p });
    expect(doc.blocks).toContainEqual({ type: "paragraph", text: output.cta });
    expect(doc.blocks).toContainEqual({ type: "heading", level: 1, text: "Hinweis der KI" });
  });

  it("nimmt die Hashtags der Person nur bei Instagram auf und lässt den Hinweis weg, wenn die KI keinen liefert", () => {
    const mit = toDocument(output, input, TAGS);
    expect(mit.blocks).toContainEqual({ type: "paragraph", text: TAGS });
    expect(toDocument(output, input).blocks.some((b) => b.type === "heading" && b.text === "Hashtags")).toBe(false);
    const linkedin = toDocument(output, { ...input, plattform: "linkedin" }, TAGS);
    expect(linkedin.title).toBe("Beitrag: LinkedIn");
    expect(linkedin.blocks.some((b) => b.type === "paragraph" && b.text === TAGS)).toBe(false);
    const ohneHinweis = toDocument({ ...output, hinweis: "" }, input);
    expect(ohneHinweis.blocks.some((b) => b.type === "heading" && b.text === "Hinweis der KI")).toBe(false);
    expect(toDocument(output, { ...input, betrieb: "", ort: "" }).subtitle).toBe("Für Dein Betrieb");
  });

  it("gibt als Markdown fürs CRM den Beitrag mit beiden Hooks, ohne Gedankenstrich und innerhalb von 1'900 Zeichen für ein normales Ergebnis", () => {
    const md = reportMarkdown(output, input, TAGS);
    expect(md.startsWith("# Beitrag: Instagram")).toBe(true);
    expect(md).toContain("1. Warum blättert der Anstrich schon nach wenigen Wintern ab?");
    expect(md).toContain("2. Ein Anstrich hält nur so gut wie der Untergrund darunter.");
    expect(md).toContain(output.cta);
    expect(md).toContain(TAGS);
    expect(md).not.toContain("—");
    expect(md.length).toBeLessThan(1900);
  });
});

describe("post-generator: Entwürfe", () => {
  const now = new Date("2026-10-05T08:00:00Z");

  it("kürzt den Titel auf den Hook, höchstens 60 Zeichen", () => {
    expect(draftTitle("  Warum  blättert der Anstrich ab?  ")).toBe("Warum blättert der Anstrich ab?");
    expect(draftTitle("")).toBe("Ohne Titel");
    const lang = draftTitle("W".repeat(100));
    expect(Array.from(lang)).toHaveLength(60);
    expect(lang.endsWith("…")).toBe(true);
  });

  it("legt einen Entwurf mit eindeutiger ID an und baut daraus den Text", () => {
    const a = newDraft(input, output, 1, TAGS, now);
    const b = newDraft(input, output, 0, TAGS, now, [a]);
    expect(a.id).not.toBe(b.id);
    expect(a.titel).toBe(output.hooks[1]);
    expect(a.gespeichertAm).toBe("2026-10-05T08:00:00.000Z");
    expect(draftText(a)).toBe(compose(output, 1, TAGS, "instagram"));
    expect(newDraft(input, output, 0, "#".repeat(500), now).hashtags).toHaveLength(300);
  });

  it("legt den neuen Entwurf nach vorn, hält höchstens zehn und entfernt gezielt", () => {
    let list: Entwurf[] = [];
    for (let i = 0; i < 12; i++) list = addDraft(list, newDraft(input, output, 0, "", new Date(now.getTime() + i * 1000), list));
    expect(list).toHaveLength(MAX_ENTWUERFE);
    expect(list[0].gespeichertAm).toBe(new Date(now.getTime() + 11 * 1000).toISOString());
    const weg = list[3];
    expect(removeDraft(list, weg.id)).toHaveLength(9);
    expect(removeDraft(list, weg.id).some((e) => e.id === weg.id)).toBe(false);
    expect(removeDraft(list, "gibt-es-nicht")).toHaveLength(10);
    expect(addDraft(list, { ...list[2] })).toHaveLength(10);
  });
});

describe("post-generator: gespeicherter Stand", () => {
  const stand = (over: Record<string, unknown> = {}) => ({ v: 1, input, output, hook: 1, hashtags: TAGS, entwuerfe: [], ...over });

  it("liefert bei kaputten Daten, falscher Version und Nicht-Objekten den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 5, [], {}, { v: 2, input, output }, { v: 1, input: "kaputt" }]) {
      const s = parseState(raw);
      expect(s.input).toBeNull();
      expect(s.output).toBeNull();
      expect(s.entwuerfe).toEqual([]);
    }
    expect(parseState(null)).toEqual(EMPTY_STATE);
  });

  it("liest einen vollständigen Stand mit Hook und Hashtags und gibt beim Speichern und Lesen dasselbe zurück", () => {
    const s = parseState(stand());
    expect(s.v).toBe(1);
    expect(s.input).toEqual(input);
    expect(s.output).toEqual(output);
    expect(s.hook).toBe(1);
    expect(s.hashtags).toBe(TAGS);
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    // Der Pfad-Fortschritt erkennt ein Objekt unter «output» als erledigt.
    expect(typeof JSON.parse(JSON.stringify(s)).output).toBe("object");
  });

  it("lässt bei einem kaputten Ergebnis die Eingabe stehen und setzt Hook und Hashtags zurück", () => {
    const s = parseState(stand({ output: { hooks: ["nur einer"] } }));
    expect(s.input).toEqual(input);
    expect(s.output).toBeNull();
    expect(s.hook).toBe(0);
    expect(s.hashtags).toBe("");
    expect(parseState(stand({ output: null })).output).toBeNull();
  });

  it("verwirft das Ergebnis ohne gültige Eingabe, auch ein Ergebnis mit gültigem Schema", () => {
    const s = parseState(stand({ input: { ...input, plattform: "tiktok" } }));
    expect(s.input).toBeNull();
    expect(s.output).toBeNull();
    expect(postOutput.safeParse(output).success).toBe(true);
  });

  it("macht aus einem falschen Hook 0 und kürzt zu lange Hashtags", () => {
    expect(parseState(stand({ hook: 5 })).hook).toBe(0);
    expect(parseState(stand({ hook: "1" })).hook).toBe(0);
    expect(parseState(stand({ hashtags: 5 })).hashtags).toBe("");
    expect(parseState(stand({ hashtags: "#".padEnd(500, "a") })).hashtags).toHaveLength(300);
  });

  it("behält gültige Entwürfe, wirft kaputte und doppelte weg und hält höchstens zehn", () => {
    const gut = (id: string) => ({ id, titel: "Mein Entwurf", gespeichertAm: "2026-10-05T08:00:00.000Z", input, output, hook: 0, hashtags: "" });
    const s = parseState(
      stand({
        entwuerfe: [
          gut("a"),
          gut("a"),
          { ...gut("b"), input: { ...input, anrede: "ihr" } },
          { ...gut("c"), output: { hooks: [] } },
          { ...gut("d"), gespeichertAm: "gestern" },
          { ...gut(""), titel: "x" },
          "kein Objekt",
          { ...gut("e"), titel: "", hook: 1 },
          ...Array.from({ length: 14 }, (_, i) => gut(`n${i}`)),
        ],
      }),
    );
    expect(s.entwuerfe.map((e) => e.id).slice(0, 2)).toEqual(["a", "e"]);
    expect(s.entwuerfe).toHaveLength(MAX_ENTWUERFE);
    expect(s.entwuerfe[1].titel).toBe(output.hooks[1]);
    expect(parseState(stand({ entwuerfe: "kaputt" })).entwuerfe).toEqual([]);
  });

  it("behält Entwürfe auch dann, wenn die aktuelle Eingabe kaputt ist", () => {
    const gut = { id: "a", titel: "Mein Entwurf", gespeichertAm: "2026-10-05T08:00:00.000Z", input, output, hook: 0, hashtags: "" };
    const s = parseState({ v: 1, input: null, output: null, entwuerfe: [gut] });
    expect(s.input).toBeNull();
    expect(s.entwuerfe).toHaveLength(1);
  });
});

describe("post-generator: Labels und Texte der Oberfläche", () => {
  it("kennt Plattformen, Formate, Ziele und Anreden mit Labels", () => {
    expect(PLATTFORMEN.map((p) => p.label)).toEqual(["Instagram", "LinkedIn", "Facebook", "Google-Beitrag"]);
    expect(FORMATE.map((f) => f.label)).toEqual(["Geschichte", "Liste", "Meinung", "Fachtipp"]);
    expect(ZIELE.map((z) => z.label)).toEqual(["Kommentar", "Nachricht", "Profil besuchen", "Link", "Speichern"]);
    expect(ANREDEN.map((a) => a.label)).toEqual(["Du", "Sie"]);
    expect(plattformLabel("google")).toBe("Google-Beitrag");
    expect(formatLabel("liste")).toBe("Liste");
    expect(zielLabel("profil")).toBe("Profil besuchen");
    expect(anredeLabel("sie")).toBe("Sie");
    expect(isPlattform("google") && isFormat("meinung") && isZiel("link") && isAnrede("du")).toBe(true);
    expect(isPlattform("tiktok") || isFormat("reel") || isZiel("kaufen") || isAnrede("ihr") || isPlattform(undefined)).toBe(false);
  });

  it("enthält in Labels, Hinweisen und Meldungen nichts von der Sperrliste und keine Stilverstösse", () => {
    const texte = [
      KI_HINWEIS,
      ...FORMATE.flatMap((f) => [f.label, f.hint]),
      ...ZIELE.flatMap((z) => [z.label, z.hint]),
      ...PLATTFORMEN.map((p) => p.label),
      inputProblem({ firma: "" }, form)?.message ?? "",
      inputProblem({ firma: "x" }, { ...form, idee: "" })?.message ?? "",
      inputProblem({ firma: "x" }, { ...form, idee: "y".repeat(700) })?.message ?? "",
      inputProblem({ firma: "x" }, { ...form, plattform: "" })?.message ?? "",
      inputProblem({ firma: "x" }, { ...form, format: "" })?.message ?? "",
      inputProblem({ firma: "x" }, { ...form, ziel: "" })?.message ?? "",
    ].join("\n");
    expect(brandHits(texte)).toEqual([]);
    expect(styleIssues(texte).filter((i) => i.level === "error")).toEqual([]);
  });

  it("besteht mit dem Beispiel der Malerei Keller aus dem Seitentext die eigene Prüfung", () => {
    expect(checkPost(output, input)).toBeNull();
    expect(input.plattform).toBe("instagram");
    expect(compose(output, 0, TAGS, "instagram")).toContain("Was hast du an deiner Fassade erlebt?");
    expect(Array.from(compose(output, 0, TAGS, "instagram"))).toHaveLength(512);
    expect(Array.from(compose(output, 1, TAGS, "instagram"))).toHaveLength(511);
    expect(Array.from(compose(output, 0, TAGS, "linkedin"))).toHaveLength(470);
    expect(counterLabel("linkedin", compose(output, 0, TAGS, "linkedin"))).toBe("470 Zeichen, davon 173 vor der Faltkante");
  });
});
