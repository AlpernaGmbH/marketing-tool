import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { parseToolMarkdown } from "@/lib/content";
import { checkToolContent } from "@/lib/content-rules";
import { buildDocx } from "@/lib/export/docx";
import { FONT_PATHS } from "@/lib/export/fonts";
import { buildPdf, type PdfFonts } from "@/lib/export/pdf";
import { isToolDone } from "@/lib/progress";
import { tools } from "@/tools/index";
import {
  BEGRUENDUNG,
  BERUEHRUNGSPUNKTE,
  EMPTY_STATE,
  GRUND,
  HINWEISE,
  HINWEIS_UNBEANTWORTET,
  HINWEIS_VERANTWORTLICH,
  INHALT_STUFEN,
  KEINE_LUECKE_TEXT,
  KEIN_INHALT_HINWEIS,
  LIMITS,
  PHASEN,
  PHASE_KEYS,
  PUNKT_KEYS,
  VORSCHLAG_FRAGE,
  WERKZEUGE,
  auswerten,
  beschriebenePhasen,
  eingabeText,
  emptyPhase,
  emptyPhasen,
  luecke,
  lueckenliste,
  mitVorschlag,
  parseState,
  phaseLabel,
  phasePlatzhalter,
  punkteAusProfil,
  reportMarkdown,
  summary,
  toDocument,
  validate,
  vorschlaege,
  wegName,
  werkzeugFuer,
  zeilen,
  type PhaseInput,
  type PhaseKey,
  type PunktKey,
  type WegInput,
} from "./logic";
import config from "./tool.config";

// ---- Beispiele ---------------------------------------------------------------------------------

const phase = (p: Partial<PhaseInput> = {}): PhaseInput => ({ frage: "Wer macht so etwas?", punkte: ["website"], inhalt: "ja", verantwortlich: "Anna Keller", ...p });

/** Malerei Keller, Gossau (Beispiel im Seitentext): vier Phasen abgedeckt, Entscheiden fehlt (rot), Vergleichen nur teilweise (gelb). */
const KELLER: WegInput = {
  typ: "kmu",
  phasen: [
    { frage: "Wer streicht Fassaden in Gossau?", punkte: ["website", "gbp"], inhalt: "ja", verantwortlich: "Anna Keller" },
    { frage: "Was kostet ein Anstrich, wie läuft es ab?", punkte: ["website"], inhalt: "ja", verantwortlich: "Anna Keller" },
    { frage: "Warum Keller und nicht der andere Maler?", punkte: ["website", "empfehlungen"], inhalt: "teilweise", verantwortlich: "Anna Keller" },
    { frage: "Kann ich dem vertrauen, und wie melde ich mich?", punkte: ["website", "telefon"], inhalt: "nein", verantwortlich: "Markus Keller" },
    { frage: "Was passiert nach meiner Zusage?", punkte: ["telefon"], inhalt: "ja", verantwortlich: "Markus Keller" },
    { frage: "Wem erzähle ich davon?", punkte: ["gbp", "empfehlungen"], inhalt: "ja", verantwortlich: "" },
  ],
};
const KONTEXT = { firma: "Malerei Keller, Gossau", branche: "Malerei und Gipserei", datum: "05.10.2026" };

const VEREIN: WegInput = {
  typ: "verein",
  phasen: [
    { frage: "Gibt es in Trogen einen Fussballverein?", punkte: ["website", "aushang"], inhalt: "ja", verantwortlich: "Lea Frei" },
    { frage: "Wann ist Training?", punkte: ["website"], inhalt: "ja", verantwortlich: "Lea Frei" },
    { frage: "", punkte: [], inhalt: "", verantwortlich: "" },
    { frage: "Kann ich zuerst schnuppern?", punkte: ["whatsapp"], inhalt: "teilweise", verantwortlich: "" },
    { frage: "Wie werde ich Mitglied?", punkte: ["website"], inhalt: "nein", verantwortlich: "Lea Frei" },
    { frage: "Wen kann ich mitbringen?", punkte: ["anlaesse"], inhalt: "ja", verantwortlich: "Lea Frei" },
  ],
};
const VEREIN_KONTEXT = { firma: "FC Trogen", branche: "Fussball", datum: "05.10.2026" };

/** Alle sechs Phasen ohne Lücke und mit Verantwortlichen. */
const VOLL: WegInput = { typ: "kmu", phasen: PHASEN.map(() => phase()) };

/** n Phasen abgedeckt (die ersten n), der Rest leer. */
const mitAbgedeckt = (n: number): WegInput => ({ typ: "kmu", phasen: PHASEN.map((_, i) => (i < n ? phase() : emptyPhase())) });

// ---- Phasen und Kataloge -----------------------------------------------------------------------

describe("kundenweg: Phasen und Berührungspunkte", () => {
  it("kennt sechs Phasen in fester Reihenfolge", () => {
    expect(PHASEN.map((p) => p.label)).toEqual(["Aufmerksam werden", "Informieren", "Vergleichen", "Entscheiden", "Kaufen oder Nutzen", "Weiterempfehlen"]);
    expect(PHASEN.map((p) => p.key)).toEqual([...PHASE_KEYS]);
  });

  it("benennt bei Vereinen die fünfte Phase «Mitmachen» und den Weg «Weg zur Mitgliedschaft»", () => {
    expect(PHASEN.map((p) => phaseLabel(p, "verein"))).toEqual(["Aufmerksam werden", "Informieren", "Vergleichen", "Entscheiden", "Mitmachen", "Weiterempfehlen"]);
    expect(wegName("kmu")).toBe("Kundenweg");
    expect(wegName("verein")).toBe("Weg zur Mitgliedschaft");
  });

  it("gibt je Phase den Platzhalter der Frage vor, bei Vereinen zwei andere", () => {
    expect(PHASEN.map((p) => phasePlatzhalter(p, "kmu"))).toEqual([
      "Wer macht so etwas in meiner Nähe?",
      "Was kostet das, wie läuft es ab?",
      "Warum dieser Betrieb und nicht der andere?",
      "Kann ich dem vertrauen, und wie melde ich mich?",
      "Was passiert nach meiner Zusage?",
      "Wem erzähle ich davon?",
    ]);
    const verein = PHASEN.map((p) => phasePlatzhalter(p, "verein"));
    expect(verein[0]).toBe("Gibt es in meiner Nähe einen Verein dafür?");
    expect(verein[4]).toBe("Wie werde ich Mitglied, und was passiert danach?");
    expect(verein.filter((t, i) => t !== phasePlatzhalter(PHASEN[i], "kmu"))).toHaveLength(2);
  });

  it("kennt zwölf Berührungspunkte in fester Reihenfolge, ohne Doppel", () => {
    expect(BERUEHRUNGSPUNKTE.map((p) => p.label)).toEqual([
      "Website",
      "Google-Unternehmensprofil",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "Newsletter",
      "Empfehlungen",
      "Anlässe",
      "Aushang und Flyer",
      "Lokalzeitung und Anzeiger",
      "Telefon und Gespräch",
      "WhatsApp",
    ]);
    expect(new Set(PUNKT_KEYS).size).toBe(12);
    expect(BERUEHRUNGSPUNKTE.map((p) => p.key)).toEqual([...PUNKT_KEYS]);
  });

  it("bietet «Ja», «Teilweise» und «Nein» an und sagt, was ohne Auswahl gilt", () => {
    expect(INHALT_STUFEN.map((s) => s.label)).toEqual(["Ja", "Teilweise", "Nein"]);
    expect(KEIN_INHALT_HINWEIS).toBe("Keine Auswahl zählt wie «Nein».");
  });
});

// ---- Lücke -------------------------------------------------------------------------------------

describe("kundenweg: Lücke je Phase", () => {
  it("ist rot, wenn kein Berührungspunkt gewählt ist", () => {
    const l = luecke(phase({ punkte: [] }));
    expect(l.stufe).toBe("rot");
    expect(l.gruende).toEqual([GRUND.punkt]);
  });

  it("ist rot, wenn der Inhalt «Nein» ist", () => {
    const l = luecke(phase({ inhalt: "nein" }));
    expect(l.stufe).toBe("rot");
    expect(l.gruende).toEqual([GRUND.inhalt]);
    expect(l.hinweise).not.toContain(HINWEIS_UNBEANTWORTET);
  });

  it("zählt einen ungewählten Inhalt wie «Nein» und sagt es im Hinweis", () => {
    const l = luecke(phase({ inhalt: "" }));
    expect(l.stufe).toBe("rot");
    expect(l.gruende).toEqual([GRUND.inhalt]);
    expect(l.hinweise).toEqual([HINWEIS_UNBEANTWORTET]);
  });

  it("ist gelb, wenn der Inhalt nur teilweise da ist", () => {
    const l = luecke(phase({ inhalt: "teilweise" }));
    expect(l.stufe).toBe("gelb");
    expect(l.gruende).toEqual([GRUND.teilweise]);
  });

  it("ist abgedeckt bei Berührungspunkt, Inhalt «Ja» und Frage", () => {
    expect(luecke(phase())).toEqual({ stufe: "ok", gruende: [], hinweise: [] });
  });

  it.each([
    { punkte: [] as PunktKey[], inhalt: "ja", stufe: "rot" },
    { punkte: [] as PunktKey[], inhalt: "teilweise", stufe: "rot" },
    { punkte: [] as PunktKey[], inhalt: "nein", stufe: "rot" },
    { punkte: [] as PunktKey[], inhalt: "", stufe: "rot" },
    { punkte: ["website"] as PunktKey[], inhalt: "ja", stufe: "ok" },
    { punkte: ["website"] as PunktKey[], inhalt: "teilweise", stufe: "gelb" },
    { punkte: ["website"] as PunktKey[], inhalt: "nein", stufe: "rot" },
    { punkte: ["website"] as PunktKey[], inhalt: "", stufe: "rot" },
  ])("gibt für Punkte $punkte und Inhalt «$inhalt» die Stufe $stufe", ({ punkte, inhalt, stufe }) => {
    expect(luecke(phase({ punkte, inhalt: inhalt as PhaseInput["inhalt"] })).stufe).toBe(stufe);
  });

  it("zählt eine Phase ohne Frage als gelb, auch bei nur einem Leerzeichen", () => {
    for (const frage of ["", "   "]) {
      const l = luecke(phase({ frage }));
      expect(l.stufe).toBe("gelb");
      expect(l.gruende).toEqual([GRUND.frage]);
    }
  });

  it("lässt eine rote Phase auch ohne Frage rot und nennt beide Gründe", () => {
    const l = luecke(phase({ frage: "", punkte: [] }));
    expect(l.stufe).toBe("rot");
    expect(l.gruende).toEqual([GRUND.punkt, GRUND.frage]);
  });

  it("macht «teilweise» ohne Frage nicht schlimmer als gelb", () => {
    const l = luecke(phase({ frage: "", inhalt: "teilweise" }));
    expect(l.stufe).toBe("gelb");
    expect(l.gruende).toEqual([GRUND.teilweise, GRUND.frage]);
  });

  it("weist «Niemand verantwortlich» als Hinweis aus, ohne die Stufe zu ändern", () => {
    for (const verantwortlich of ["", "  "]) {
      const l = luecke(phase({ verantwortlich }));
      expect(l.stufe).toBe("ok");
      expect(l.gruende).toEqual([]);
      expect(l.hinweise).toEqual([HINWEIS_VERANTWORTLICH]);
    }
    expect(HINWEIS_VERANTWORTLICH).toBe("Niemand verantwortlich");
  });

  it("zeigt bei einer ganz leeren Phase alle Gründe und beide Hinweise", () => {
    const l = luecke(emptyPhase());
    expect(l.stufe).toBe("rot");
    expect(l.gruende).toEqual([GRUND.punkt, GRUND.inhalt, GRUND.frage]);
    expect(l.hinweise).toEqual([HINWEIS_UNBEANTWORTET, HINWEIS_VERANTWORTLICH]);
  });
});

// ---- Vorschläge und Werkzeuge ------------------------------------------------------------------

describe("kundenweg: Vorschläge", () => {
  it("nennt je Phase zwei bis drei Inhaltstypen, für Betriebe und Vereine", () => {
    for (const typ of ["kmu", "verein"] as const) {
      for (const key of PHASE_KEYS) {
        const v = vorschlaege(key, typ);
        expect(v.length, `${typ} ${key}`).toBeGreaterThanOrEqual(2);
        expect(v.length, `${typ} ${key}`).toBeLessThanOrEqual(3);
        expect(new Set(v).size).toBe(v.length);
      }
    }
  });

  it("nennt die Inhaltstypen der Vorgabe", () => {
    expect(vorschlaege("aufmerksam")).toEqual(["Google-Unternehmensprofil mit Fotos und Öffnungszeiten", "Regelmässige Beiträge, die zeigen, was du machst", "Empfehlungen sichtbar machen"]);
    expect(vorschlaege("informieren")).toEqual(["Leistungsseiten mit Ablauf", "Häufige Fragen mit klaren Antworten", "Preisrahmen oder «ab»-Angabe, nur wenn du Preise nennen willst"]);
    expect(vorschlaege("vergleichen")).toEqual(["Referenzen mit Ort und Namen", "Bewertungen von Kundschaft", "Vorher-Nachher-Fälle"]);
    expect(vorschlaege("entscheiden")).toEqual(["Klarer nächster Schritt: Anruf, WhatsApp oder Termin", "Offerte mit Frist", "Kontaktangaben an jeder Stelle"]);
    expect(vorschlaege("kaufen")).toEqual(["Bestätigung und Ablauf nach der Zusage", "Wer kommt wann", "Ansprechperson mit Telefonnummer"]);
    expect(vorschlaege("empfehlen")).toEqual(["Bitte um Bewertung nach dem Auftrag", "Empfehlungskarte", "Dank an alle, die weiterempfehlen"]);
  });

  it("kennt für Vereine «Mitmachen» mit Schnuppertraining und Willkommensmail", () => {
    expect(vorschlaege("kaufen", "verein")).toEqual(["Schnuppertraining oder Probetermin", "Beitritt in wenigen Schritten", "Willkommensmail"]);
    expect(vorschlaege("empfehlen", "verein")[0]).toBe("Bitte um Bewertung nach den ersten Wochen");
  });

  it("lässt die übrigen Phasen bei Vereinen gleich", () => {
    for (const key of ["aufmerksam", "informieren", "vergleichen", "entscheiden"] as PhaseKey[]) expect(vorschlaege(key, "verein")).toEqual(vorschlaege(key, "kmu"));
  });

  it("gibt eine Kopie zurück: Ändern wirkt nicht auf den nächsten Aufruf", () => {
    const v = vorschlaege("informieren");
    v.push("x");
    v[0] = "y";
    expect(vorschlaege("informieren")).toHaveLength(3);
    expect(vorschlaege("informieren")[0]).toBe("Leistungsseiten mit Ablauf");
  });
});

describe("kundenweg: nächstes Werkzeug", () => {
  const slugs = (key: PhaseKey, typ: "kmu" | "verein" = "kmu") => werkzeugFuer(key, typ).map((w) => w.slug);

  it("verweist je Phase auf das Werkzeug der Vorgabe", () => {
    expect(slugs("aufmerksam")).toEqual(["inhalte-saeulen", "gbp-feiertage"]);
    expect(slugs("informieren")).toEqual(["textcheck"]);
    expect(slugs("vergleichen")).toEqual(["bewertungs-kit"]);
    expect(slugs("entscheiden")).toEqual(["whatsapp-link"]);
    expect(slugs("kaufen")).toEqual([]);
    expect(slugs("empfehlen")).toEqual(["bewertungs-kit", "empfehlungsprogramm"]);
  });

  it("verweist bei Vereinen für das Weiterempfehlen auf Empfehlungsprogramm und Anspruchsgruppen, nie auf das Sponsoring-Dossier", () => {
    expect(slugs("empfehlen", "verein")).toEqual(["empfehlungsprogramm", "anspruchsgruppen"]);
    const alle = PHASE_KEYS.flatMap((k) => [...slugs(k, "kmu"), ...slugs(k, "verein")]);
    expect(alle).not.toContain("sponsoring-dossier");
  });

  it("nennt nur Slugs, die in tools/index.ts stehen, mit dem Namen aus der Konfiguration", () => {
    const bySlug = new Map(tools.map((t) => [t.slug, t]));
    const alle = new Set(PHASE_KEYS.flatMap((k) => [...slugs(k, "kmu"), ...slugs(k, "verein")]));
    expect(alle.size).toBeGreaterThanOrEqual(7);
    for (const slug of alle) {
      expect(bySlug.has(slug), slug).toBe(true);
      expect(WERKZEUGE[slug].name, slug).toBe(bySlug.get(slug)!.name);
    }
  });

  it("führt jedes Werkzeug der Tabelle auf einen Slug, der zu seinem Schlüssel passt", () => {
    for (const [key, w] of Object.entries(WERKZEUGE)) expect(w.slug).toBe(key);
  });
});

// ---- Reihenfolge der Lückenliste ---------------------------------------------------------------

describe("kundenweg: Priorität", () => {
  it("setzt rot vor gelb, auch wenn die rote Phase später kommt", () => {
    const input: WegInput = { typ: "kmu", phasen: [phase({ inhalt: "teilweise" }), phase(), phase(), phase({ inhalt: "nein" }), phase(), phase()] };
    expect(lueckenliste(input).map((l) => [l.nr, l.stufe])).toEqual([
      [4, "rot"],
      [1, "gelb"],
    ]);
  });

  it("setzt innerhalb derselben Stufe die frühere Phase zuerst", () => {
    const rot: WegInput = { typ: "kmu", phasen: [phase(), phase(), phase(), phase(), phase({ inhalt: "nein" }), phase({ punkte: [] })] };
    expect(lueckenliste(rot).map((l) => l.nr)).toEqual([5, 6]);
    const mix: WegInput = { typ: "kmu", phasen: [phase({ inhalt: "teilweise" }), phase({ punkte: [] }), phase({ inhalt: "teilweise" }), phase({ inhalt: "nein" }), phase(), phase()] };
    expect(lueckenliste(mix).map((l) => [l.nr, l.stufe])).toEqual([
      [2, "rot"],
      [4, "rot"],
      [1, "gelb"],
      [3, "gelb"],
    ]);
  });

  it("führt abgedeckte Phasen nicht in der Liste", () => {
    expect(lueckenliste(VOLL)).toEqual([]);
    expect(lueckenliste(KELLER).map((l) => l.key)).toEqual(["entscheiden", "vergleichen"]);
  });

  it("gibt jedem Eintrag Gründe, Vorschläge und Werkzeug der Phase", () => {
    const [entscheiden, vergleichen] = lueckenliste(KELLER);
    expect(entscheiden).toMatchObject({ nr: 4, label: "Entscheiden", stufe: "rot", gruende: [GRUND.inhalt] });
    expect(entscheiden.vorschlaege).toEqual(vorschlaege("entscheiden"));
    expect(entscheiden.werkzeuge.map((w) => w.slug)).toEqual(["whatsapp-link"]);
    expect(vergleichen).toMatchObject({ nr: 3, label: "Vergleichen", stufe: "gelb", gruende: [GRUND.teilweise] });
    expect(vergleichen.werkzeuge.map((w) => w.name)).toEqual(["Bewertungs-Kit für Google"]);
  });

  it("schlägt bei einer Lücke nur wegen der fehlenden Frage vor, die Frage aufzuschreiben, ohne Werkzeug", () => {
    const input: WegInput = { typ: "kmu", phasen: [phase({ frage: "" }), phase(), phase(), phase(), phase(), phase()] };
    const [eintrag] = lueckenliste(input);
    expect(eintrag).toMatchObject({ nr: 1, stufe: "gelb", gruende: [GRUND.frage], vorschlaege: [VORSCHLAG_FRAGE], werkzeuge: [] });
  });

  it("begründet die Reihenfolge als Richtwert von Alperna, keine Statistik", () => {
    expect(BEGRUENDUNG).toBe("Die frühere Phase kommt zuerst, weil ohne Aufmerksamkeit der Rest nichts bringt. Das ist ein Richtwert von Alperna, keine Statistik.");
  });

  it("nimmt für Vereine die Vereins-Werkzeuge und den Namen «Mitmachen»", () => {
    const l = lueckenliste(VEREIN);
    expect(l.map((e) => [e.nr, e.label, e.stufe])).toEqual([
      [3, "Vergleichen", "rot"],
      [5, "Mitmachen", "rot"],
      [4, "Entscheiden", "gelb"],
    ]);
    expect(l[1].vorschlaege).toEqual(vorschlaege("kaufen", "verein"));
    expect(l[1].werkzeuge).toEqual([]);
  });
});

// ---- Gesamtaussage -----------------------------------------------------------------------------

describe("kundenweg: Gesamtaussage", () => {
  it.each([0, 1, 2, 3, 4, 5, 6])("zählt %i abgedeckte Phasen", (n) => {
    const s = summary(mitAbgedeckt(n));
    expect(s.abgedeckt).toBe(n);
    expect(s.total).toBe(6);
    expect(s.satz).toBe(`${n} von 6 Phasen ${n === 1 ? "ist" : "sind"} abgedeckt.`);
    expect(s.rot + s.gelb).toBe(6 - n);
    expect(s.luecken).toHaveLength(6 - n);
  });

  it("nennt die wichtigste Lücke mit Phase und erstem Grund", () => {
    const s = summary(KELLER);
    expect(s.satz).toBe("4 von 6 Phasen sind abgedeckt.");
    expect(s.wichtigste?.key).toBe("entscheiden");
    expect(s.wichtigsteSatz).toBe("Die wichtigste Lücke liegt in der Phase «Entscheiden»: Es gibt keinen Inhalt dafür.");
    expect([s.rot, s.gelb]).toEqual([1, 1]);
  });

  it("nennt bei Vereinen die Phase «Mitmachen»", () => {
    expect(summary({ typ: "verein", phasen: PHASEN.map((_, i) => (i === 4 ? phase({ inhalt: "nein" }) : phase())) }).wichtigsteSatz).toContain("«Mitmachen»");
  });

  it("sagt bei sechs abgedeckten Phasen, dass es keine Lücke gibt", () => {
    const s = summary(VOLL);
    expect(s.wichtigste).toBeNull();
    expect(s.wichtigsteSatz).toBe("Es gibt keine Lücke.");
    expect(s.ohneVerantwortliche).toBe(0);
  });

  it("nennt bei sechs abgedeckten Phasen die Phasen ohne verantwortliche Person", () => {
    const eine = summary({ typ: "kmu", phasen: VOLL.phasen.map((p, i) => (i === 2 ? { ...p, verantwortlich: "" } : p)) });
    expect(eine.wichtigsteSatz).toBe("Es gibt keine Lücke. Offen bleibt, wer sich um eine Phase kümmert.");
    const drei = summary({ typ: "kmu", phasen: VOLL.phasen.map((p, i) => (i < 3 ? { ...p, verantwortlich: " " } : p)) });
    expect(drei.wichtigsteSatz).toBe("Es gibt keine Lücke. Offen bleibt, wer sich um 3 Phasen kümmert.");
    expect(drei.ohneVerantwortliche).toBe(3);
  });

  it("rechnet eine Phase mit teilweisem Inhalt oder fehlender Frage nicht zu den abgedeckten", () => {
    const s = summary({ typ: "kmu", phasen: [phase({ inhalt: "teilweise" }), phase({ frage: "" }), phase(), phase(), phase(), phase()] });
    expect(s.abgedeckt).toBe(4);
    expect(s.gelb).toBe(2);
  });

  it("wertet eine ganz leere Eingabe als sechs rote Phasen", () => {
    const s = summary({ typ: "kmu", phasen: emptyPhasen() });
    expect([s.abgedeckt, s.rot, s.gelb, s.ohneVerantwortliche]).toEqual([0, 6, 0, 6]);
    expect(s.wichtigste?.key).toBe("aufmerksam");
  });

  it("baut Zeilen mit Stufentext, Berührungspunkten in fester Reihenfolge und Antwort «Nicht beantwortet»", () => {
    const rows = zeilen({ typ: "kmu", phasen: [phase({ punkte: ["whatsapp", "website"], inhalt: "" }), ...emptyPhasen().slice(1)] });
    expect(rows[0]).toMatchObject({ nr: 1, label: "Aufmerksam werden", punkte: ["Website", "WhatsApp"], inhaltText: "Nicht beantwortet", stufeText: "Lücke" });
    expect(zeilen(KELLER).map((z) => z.stufeText)).toEqual(["Abgedeckt", "Abgedeckt", "Teilweise", "Lücke", "Abgedeckt", "Abgedeckt"]);
  });
});

// ---- Vorschlag aus dem Profil ------------------------------------------------------------------

describe("kundenweg: Berührungspunkte aus dem Profil", () => {
  it("ordnet Kanäle per Wortvergleich auf den Namen zu, in fester Reihenfolge", () => {
    expect(
      punkteAusProfil([{ name: "WhatsApp" }, { name: "Instagram" }, { kanal: "Google Business Profil" }, { name: "Dorfanzeiger" }, { name: "Website" }]),
    ).toEqual(["website", "gbp", "instagram", "zeitung", "whatsapp"]);
    expect(punkteAusProfil([{ name: "Newsletter" }, { name: "Facebook" }, { name: "LinkedIn" }, { name: "Flyer" }, { name: "Anlässe" }, { name: "Empfehlungen" }, { name: "Telefon" }])).toEqual([
      "facebook",
      "linkedin",
      "newsletter",
      "empfehlungen",
      "anlaesse",
      "aushang",
      "telefon",
    ]);
  });

  it("lässt Kanäle ohne passenden Berührungspunkt weg und zählt doppelte einmal", () => {
    expect(punkteAusProfil([{ name: "Google Ads" }, { name: "TikTok" }, { foo: "bar" }, "x", null, 5, { name: "  " }])).toEqual([]);
    expect(punkteAusProfil([{ name: "Instagram" }, { name: "instagram reels" }, { kanal: "Instagram" }])).toEqual(["instagram"]);
    expect(punkteAusProfil(undefined)).toEqual([]);
    expect(punkteAusProfil([])).toEqual([]);
  });

  it("kreuzt die Punkte nur in der ersten und zweiten Phase an, solange das Formular leer ist", () => {
    const v = mitVorschlag(emptyPhasen(), [{ name: "Instagram" }, { name: "Website" }]);
    expect(v.map((p) => p.punkte)).toEqual([["website", "instagram"], ["website", "instagram"], [], [], [], []]);
    expect(v.every((p) => p.frage === "" && p.inhalt === "" && p.verantwortlich === "")).toBe(true);
  });

  it("macht keinen Vorschlag mehr, sobald irgendeine Angabe da ist, auch nicht in anderen Phasen", () => {
    for (const eingabe of [{ frage: "x" }, { inhalt: "ja" }, { verantwortlich: "Anna" }, { punkte: ["telefon"] }] as Partial<PhaseInput>[]) {
      const phasen = emptyPhasen();
      phasen[3] = { ...phasen[3], ...eingabe };
      expect(mitVorschlag(phasen, [{ name: "Instagram" }])).toEqual(phasen);
    }
  });

  it("lässt alles leer, wenn das Profil nichts Passendes hat", () => {
    expect(mitVorschlag(emptyPhasen(), [{ name: "TikTok" }])).toEqual(emptyPhasen());
    expect(mitVorschlag(emptyPhasen(), undefined)).toEqual(emptyPhasen());
  });

  it("gibt Kopien zurück, die den Stand nicht verändern", () => {
    const phasen = emptyPhasen();
    const v = mitVorschlag(phasen, [{ name: "Instagram" }]);
    v[0].punkte.push("telefon");
    expect(phasen[0].punkte).toEqual([]);
    expect(emptyPhasen()[0].punkte).toEqual([]);
  });
});

// ---- Eingabe prüfen ----------------------------------------------------------------------------

describe("kundenweg: validate", () => {
  it("meldet eine ganz leere Eingabe", () => {
    expect(validate({ typ: "kmu", phasen: emptyPhasen() })).toBe("Beschreibe mindestens eine Phase: eine Frage, einen Berührungspunkt oder die Antwort bei «Gibt es dafür Inhalt?».");
  });

  it("lässt eine einzige Angabe genügen: Frage, Berührungspunkt oder Inhalt", () => {
    for (const eingabe of [{ frage: "Wer macht das?" }, { punkte: ["website"] }, { inhalt: "nein" }] as Partial<PhaseInput>[]) {
      const phasen = emptyPhasen();
      phasen[2] = { ...phasen[2], ...eingabe };
      expect(validate({ typ: "kmu", phasen })).toBeNull();
    }
    expect(validate(KELLER)).toBeNull();
    expect(validate(VEREIN)).toBeNull();
  });

  it("zählt einen Namen allein oder eine Frage aus Leerzeichen nicht als Angabe", () => {
    const phasen = emptyPhasen();
    phasen[0].verantwortlich = "Anna";
    phasen[1].frage = "   ";
    expect(validate({ typ: "kmu", phasen })).not.toBeNull();
  });

  it("lehnt zu lange Fragen und Namen mit der Nummer der Phase ab, die Grenze gilt", () => {
    const lang = (n: number) => "x".repeat(n);
    expect(validate({ typ: "kmu", phasen: VOLL.phasen.map((p, i) => (i === 2 ? { ...p, frage: lang(LIMITS.frage) } : p)) })).toBeNull();
    expect(validate({ typ: "kmu", phasen: VOLL.phasen.map((p, i) => (i === 2 ? { ...p, frage: lang(LIMITS.frage + 1) } : p)) })).toBe("Phase 3: Die Frage ist zu lang (höchstens 160 Zeichen).");
    expect(validate({ typ: "kmu", phasen: VOLL.phasen.map((p, i) => (i === 5 ? { ...p, verantwortlich: lang(LIMITS.verantwortlich) } : p)) })).toBeNull();
    expect(validate({ typ: "kmu", phasen: VOLL.phasen.map((p, i) => (i === 5 ? { ...p, verantwortlich: lang(LIMITS.verantwortlich + 1) } : p)) })).toBe(
      "Phase 6: Der Name ist zu lang (höchstens 60 Zeichen).",
    );
  });

  it("lehnt einen Stand mit falscher Phasenzahl ab", () => {
    expect(validate({ typ: "kmu", phasen: VOLL.phasen.slice(0, 5) })).toBe("Der Stand ist unvollständig. Beginne neu.");
    expect(validate({ typ: "kmu", phasen: [...VOLL.phasen, phase()] })).toBe("Der Stand ist unvollständig. Beginne neu.");
  });

  it("zählt beschriebene Phasen für die Fortschrittsanzeige", () => {
    expect(beschriebenePhasen(emptyPhasen())).toBe(0);
    expect(beschriebenePhasen(KELLER.phasen)).toBe(6);
    expect(beschriebenePhasen([phase(), emptyPhase(), phase({ frage: "" })])).toBe(2);
  });
});

// ---- Dokument ----------------------------------------------------------------------------------

describe("kundenweg: toDocument", () => {
  const doc = toDocument(auswerten(KELLER, KONTEXT));
  const headings = doc.blocks.flatMap((b) => (b.type === "heading" ? [b.text] : []));
  const tables = doc.blocks.flatMap((b) => (b.type === "table" ? [b] : []));

  it("hat Kopf, Querformat und die Abschnitte in fester Reihenfolge", () => {
    expect(doc.title).toBe("Kundenweg: Malerei Keller, Gossau");
    expect(doc.subtitle).toBe("Sechs Phasen von «Aufmerksam werden» bis «Weiterempfehlen»");
    expect(doc.firma).toBe("Malerei Keller, Gossau");
    expect(doc.datum).toBe("05.10.2026");
    expect(doc.filename).toBe("kundenweg-malerei-keller-gossau");
    expect(doc.landscape).toBe(true);
    expect(headings).toEqual(["Auf einen Blick", "Der Weg in sechs Phasen", "Lückenliste", "Drei Hinweise"]);
  });

  it("stellt Gesamtaussage und Steckbrief an den Anfang", () => {
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts).toEqual({
      type: "facts",
      items: [
        { label: "Betrieb", value: "Malerei Keller, Gossau" },
        { label: "Branche", value: "Malerei und Gipserei" },
        { label: "Abgedeckte Phasen", value: "4 von 6" },
        { label: "Wichtigste Lücke", value: "Entscheiden" },
      ],
    });
    const absatz = doc.blocks.find((b) => b.type === "paragraph");
    expect(absatz).toEqual({
      type: "paragraph",
      text: "4 von 6 Phasen sind abgedeckt. Die wichtigste Lücke liegt in der Phase «Entscheiden»: Es gibt keinen Inhalt dafür.",
    });
  });

  it("zeigt den Weg als Tabelle Phase | Frage | Berührungspunkte | Inhalt | Verantwortlich | Lücke", () => {
    const weg = tables[0];
    expect(weg.header).toEqual(["Phase", "Frage", "Berührungspunkte", "Inhalt", "Verantwortlich", "Lücke"]);
    expect(weg.rows).toHaveLength(6);
    expect(weg.rows[0]).toEqual(["1. Aufmerksam werden", "Wer streicht Fassaden in Gossau?", "Website, Google-Unternehmensprofil", "Ja", "Anna Keller", "Abgedeckt"]);
    expect(weg.rows[2][3]).toBe("Teilweise");
    expect(weg.rows[2][5]).toBe("Teilweise");
    expect(weg.rows[3].slice(3)).toEqual(["Nein", "Markus Keller", "Lücke"]);
    expect(weg.rows[5][4]).toBe("Niemand verantwortlich");
    expect(weg.widths).toHaveLength(6);
  });

  it("zeigt Lücken ohne Angaben mit Klartext statt leerer Zellen", () => {
    const leer = toDocument(auswerten({ typ: "kmu", phasen: [phase({ punkte: [] }), ...emptyPhasen().slice(1)] }, { firma: "", branche: "" }));
    const row = (leer.blocks.find((b) => b.type === "table") as { rows: string[][] }).rows[1];
    expect(row).toEqual(["2. Informieren", "Die Frage fehlt", "keine", "Nicht beantwortet", "Niemand verantwortlich", "Lücke"]);
  });

  it("führt die Lückenliste nach Dringlichkeit mit Gründen, Vorschlägen und Werkzeug", () => {
    const liste = tables[1];
    expect(liste.header).toEqual(["Phase", "Was fehlt", "Vorschläge", "Nächstes Werkzeug"]);
    expect(liste.rows).toEqual([
      [
        "4. Entscheiden (Lücke)",
        "Es gibt keinen Inhalt dafür",
        "• Klarer nächster Schritt: Anruf, WhatsApp oder Termin\n• Offerte mit Frist\n• Kontaktangaben an jeder Stelle",
        "WhatsApp-Link mit QR",
      ],
      [
        "3. Vergleichen (Teilweise)",
        "Der Inhalt ist nur teilweise da",
        "• Referenzen mit Ort und Namen\n• Bewertungen von Kundschaft\n• Vorher-Nachher-Fälle",
        "Bewertungs-Kit für Google",
      ],
    ]);
    const idx = doc.blocks.findIndex((b) => b.type === "heading" && b.text === "Lückenliste");
    expect(doc.blocks[idx + 1]).toEqual({ type: "paragraph", text: BEGRUENDUNG });
  });

  it("nennt «keines», wenn für die Phase kein Werkzeug passt, und «oder» bei zwei", () => {
    const input: WegInput = { typ: "kmu", phasen: [phase({ punkte: [] }), phase(), phase(), phase(), phase({ inhalt: "nein" }), phase()] };
    const liste = (toDocument(auswerten(input, KONTEXT)).blocks.filter((b) => b.type === "table")[1] as { rows: string[][] }).rows;
    expect(liste[0][3]).toBe("Themensäulen oder Feiertagsplaner für das Google-Unternehmensprofil");
    expect(liste[1][0]).toBe("5. Kaufen oder Nutzen (Lücke)");
    expect(liste[1][3]).toBe("keines");
  });

  it("ersetzt die Tabelle der Lückenliste durch einen Satz, wenn es keine Lücke gibt", () => {
    const d = toDocument(auswerten(VOLL, KONTEXT));
    expect(d.blocks.filter((b) => b.type === "table")).toHaveLength(1);
    const idx = d.blocks.findIndex((b) => b.type === "heading" && b.text === "Lückenliste");
    expect(d.blocks[idx + 1]).toEqual({ type: "paragraph", text: KEINE_LUECKE_TEXT });
  });

  it("schliesst mit drei nummerierten Hinweisen, der erste als Richtwert von Alperna", () => {
    const last = doc.blocks[doc.blocks.length - 1];
    expect(last).toEqual({ type: "list", ordered: true, items: [...HINWEISE] });
    expect(HINWEISE).toHaveLength(3);
    expect(HINWEISE[0]).toContain("Richtwert von Alperna, keine Statistik");
    expect(HINWEISE[2]).toContain("verantwortliche Person");
  });

  it("nennt bei Vereinen den Weg zur Mitgliedschaft und die Phase «Mitmachen»", () => {
    const d = toDocument(auswerten(VEREIN, VEREIN_KONTEXT));
    expect(d.title).toBe("Weg zur Mitgliedschaft: FC Trogen");
    expect(d.filename).toBe("weg-zur-mitgliedschaft-fc-trogen");
    expect(d.blocks.find((b) => b.type === "facts")).toMatchObject({ items: [{ label: "Verein", value: "FC Trogen" }, { label: "Tätigkeit", value: "Fussball" }, expect.anything(), expect.anything()] });
    expect(d.blocks.flatMap((b) => (b.type === "heading" ? [b.text] : []))[1]).toBe("Der Weg zur Mitgliedschaft in sechs Phasen");
    const rows = (d.blocks.find((b) => b.type === "table") as { rows: string[][] }).rows;
    expect(rows[4][0]).toBe("5. Mitmachen");
    expect(rows[2].slice(1)).toEqual(["Die Frage fehlt", "keine", "Nicht beantwortet", "Niemand verantwortlich", "Lücke"]);
  });

  it("kommt ohne Firma, Branche und Datum aus", () => {
    const d = toDocument(auswerten(KELLER, { firma: "  ", branche: "" }));
    expect(d.title).toBe("Kundenweg");
    expect(d.firma).toBeUndefined();
    expect(d.datum).toBeUndefined();
    expect(d.filename).toBe("kundenweg");
    expect(d.blocks.find((b) => b.type === "facts")).toMatchObject({ items: [{ label: "Betrieb", value: "keine Angabe" }, { label: "Abgedeckte Phasen" }, { label: "Wichtigste Lücke" }] });
  });

  it("gibt als Markdown die Gesamtaussage weit oben aus, damit das Kürzen im CRM sie nicht abschneidet", () => {
    const md = reportMarkdown(auswerten(KELLER, KONTEXT));
    expect(md.startsWith("# Kundenweg: Malerei Keller, Gossau")).toBe(true);
    expect(md).toContain("| Phase | Frage | Berührungspunkte | Inhalt | Verantwortlich | Lücke |");
    expect(md).toContain("| 4. Entscheiden | Kann ich dem vertrauen, und wie melde ich mich? | Website, Telefon und Gespräch | Nein | Markus Keller | Lücke |");
    expect(md.indexOf("4 von 6 Phasen sind abgedeckt.")).toBeLessThan(400);
    expect(md.endsWith("\n")).toBe(false);
  });
});

// ---- Eingabe fürs CRM --------------------------------------------------------------------------

describe("kundenweg: eingabeText", () => {
  it("schreibt je Phase eine Zeile mit Frage, Berührungspunkten, Inhalt und Verantwortlichem", () => {
    const lines = eingabeText(KELLER).split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe("1. Aufmerksam werden: Frage: Wer streicht Fassaden in Gossau? | Berührungspunkte: Website, Google-Unternehmensprofil | Inhalt: Ja | Verantwortlich: Anna Keller");
    expect(lines[3]).toBe("4. Entscheiden: Frage: Kann ich dem vertrauen, und wie melde ich mich? | Berührungspunkte: Website, Telefon und Gespräch | Inhalt: Nein | Verantwortlich: Markus Keller");
    expect(lines[5]).toContain("Verantwortlich: niemand");
  });

  it("schreibt auch leere Phasen lesbar und nennt bei Vereinen «Mitmachen»", () => {
    const lines = eingabeText({ typ: "verein", phasen: emptyPhasen() }).split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[4]).toBe("5. Mitmachen: Frage: keine Angabe | Berührungspunkte: keine | Inhalt: Nicht beantwortet | Verantwortlich: niemand");
  });

  it("schreibt keine JSON-Klötze", () => {
    for (const text of [eingabeText(KELLER), eingabeText(VEREIN), reportMarkdown(auswerten(KELLER, KONTEXT))]) expect(text).not.toMatch(/[{}]|\[object|undefined/);
  });
});

// ---- Sperrliste und Schreibweise ---------------------------------------------------------------

describe("kundenweg: Wortwahl", () => {
  const alleTexte = (): string[] => {
    const eingaben = [KELLER, VEREIN, VOLL, { typ: "kmu", phasen: emptyPhasen() } as WegInput, { typ: "verein", phasen: emptyPhasen() } as WegInput];
    const dokumente = eingaben.map((i) => reportMarkdown(auswerten(i, KONTEXT)));
    const konstanten = [
      ...PHASEN.flatMap((p) => [p.label, p.labelVerein ?? "", p.platzhalter, p.platzhalterVerein ?? ""]),
      ...BERUEHRUNGSPUNKTE.map((p) => p.label),
      ...PHASE_KEYS.flatMap((k) => [...vorschlaege(k, "kmu"), ...vorschlaege(k, "verein"), ...werkzeugFuer(k, "kmu").map((w) => w.name), ...werkzeugFuer(k, "verein").map((w) => w.name)]),
      ...HINWEISE,
      ...Object.values(GRUND),
      BEGRUENDUNG,
      KEINE_LUECKE_TEXT,
      KEIN_INHALT_HINWEIS,
      HINWEIS_UNBEANTWORTET,
      HINWEIS_VERANTWORTLICH,
      VORSCHLAG_FRAGE,
      wegName("kmu"),
      wegName("verein"),
      config.tagline,
      config.name,
    ];
    const summaries = [KELLER, VEREIN, VOLL, mitAbgedeckt(0), mitAbgedeckt(1)].flatMap((i) => {
      const s = summary(i);
      return [s.satz, s.wichtigsteSatz];
    });
    return [...dokumente, ...konstanten, ...summaries, ...eingaben.map(eingabeText)];
  };

  it("nennt weder «Customer Journey» noch «Touchpoint» noch «Funnel»", () => {
    const text = alleTexte().join("\n");
    expect(text).not.toMatch(/customer[- ]?journey|touch ?point|funnel/i);
  });

  it("trifft in keinem erzeugten Text die Sperrliste von Alperna", () => {
    for (const t of alleTexte()) expect(brandHits(t), t.slice(0, 60)).toEqual([]);
  });

  it("verwendet keine Ausrufezeichen, kein ß, keinen Gedankenstrich und kein «jetzt»", () => {
    const text = alleTexte().join("\n");
    expect(text).not.toMatch(/[!ß—]|\bjetzt\b|\bnur noch\b|\bgarantiert\b/i);
  });
});

// ---- Gespeicherter Stand -----------------------------------------------------------------------

describe("kundenweg: parseState", () => {
  const ergebnis = { v: 1, phase: "result", typ: "kmu", phasen: KELLER.phasen, output: { firma: "Malerei Keller, Gossau", branche: "Malerei", datum: "05.10.2026" } };

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 5, true, [], {}, { v: 2, phase: "result" }, { v: "1" }, JSON.parse("[1,2]")]) expect(parseState(raw)).toEqual(EMPTY_STATE);
    expect(EMPTY_STATE.phasen).toHaveLength(6);
    expect(EMPTY_STATE.phasen.every((p) => p.frage === "" && p.punkte.length === 0 && p.inhalt === "" && p.verantwortlich === "")).toBe(true);
  });

  it("liest ein gespeichertes Ergebnis unverändert", () => {
    expect(parseState(ergebnis)).toEqual(ergebnis);
    expect(parseState(JSON.parse(JSON.stringify(ergebnis)))).toEqual(ergebnis);
  });

  it("erkennt das Ergebnis für den Fortschritt im Pfad als erledigt, den Entwurf nicht", () => {
    expect(isToolDone(JSON.stringify(parseState(ergebnis)))).toBe(true);
    expect(isToolDone(JSON.stringify(parseState({ ...ergebnis, phase: "edit" })))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });

  it("bleibt bei «edit», wenn die Ausgabe fehlt oder die Eingabe die Prüfung nicht besteht", () => {
    expect(parseState({ ...ergebnis, output: undefined }).phase).toBe("edit");
    expect(parseState({ ...ergebnis, output: "x" }).phase).toBe("edit");
    expect(parseState({ ...ergebnis, phasen: [] }).phase).toBe("edit");
    expect(parseState({ ...ergebnis, phasen: [] }).phasen).toEqual(emptyPhasen());
    expect(parseState({ ...ergebnis, phase: "unbekannt" }).phase).toBe("edit");
    expect(parseState({ ...ergebnis, phase: "edit" })).toEqual({ v: 1, phase: "edit", typ: "kmu", phasen: KELLER.phasen });
  });

  it("verwirft ungültige Felder einzeln und kürzt zu lange Texte", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      typ: "irgendwas",
      phasen: [
        { frage: "x".repeat(300), punkte: ["telefon", "website", "tiktok", 5, "website"], inhalt: "vielleicht", verantwortlich: "y".repeat(100) },
        "kaputt",
        { frage: 5, punkte: "website", inhalt: 1, verantwortlich: null },
      ],
    });
    expect(s.typ).toBe("kmu");
    expect(s.phasen[0]).toEqual({ frage: "x".repeat(160), punkte: ["website", "telefon"], inhalt: "", verantwortlich: "y".repeat(60) });
    expect(s.phasen[1]).toEqual(emptyPhase());
    expect(s.phasen[2]).toEqual(emptyPhase());
  });

  it("bringt die Phasen auf sechs: ergänzt fehlende und schneidet überzählige ab", () => {
    expect(parseState({ v: 1, phase: "edit", typ: "verein", phasen: [phase()] }).phasen).toHaveLength(6);
    expect(parseState({ v: 1, phase: "edit", typ: "verein", phasen: [phase()] }).typ).toBe("verein");
    expect(parseState({ v: 1, phase: "edit", typ: "kmu", phasen: Array.from({ length: 9 }, () => phase()) }).phasen).toHaveLength(6);
  });

  it("verwirft ein ungültiges Datum der Ausgabe, behält aber das Ergebnis", () => {
    const s = parseState({ ...ergebnis, output: { firma: "Keller", branche: 5, datum: "gestern" } });
    expect(s.phase).toBe("result");
    expect(s.output).toEqual({ firma: "Keller", branche: "", datum: "" });
  });

  it("gibt Phasen zurück, die sich nicht mit dem leeren Stand teilen", () => {
    const s = parseState({ v: 1, phase: "edit", typ: "kmu", phasen: [] });
    s.phasen[0].punkte.push("website");
    expect(EMPTY_STATE.phasen[0].punkte).toEqual([]);
  });
});

// ---- Konfiguration -----------------------------------------------------------------------------

describe("kundenweg: Konfiguration", () => {
  it("stimmt mit dem Auftrag überein", () => {
    expect(config).toMatchObject({
      slug: "kundenweg",
      name: "Kundenweg-Mapper",
      category: "strategie",
      audience: "beide",
      keyword: "Kundenweg",
      related: ["positionierung", "bewertungs-kit", "empfehlungsprogramm"],
      needsServer: false,
      usesProfile: ["firma", "branche", "kanaele", "organisationstyp"],
      writesProfile: [],
      outputs: ["copy", "pdf", "docx"],
      estimatedMinutes: 8,
      pathStep: { path: "strategie", order: 11 },
      featured: false,
    });
    expect(config.tagline).toBe("Der Weg deiner Kundschaft in sechs Phasen: wo sie dir begegnet, was fehlt, und was du zuerst ergänzt.");
    expect(config.tagline.length).toBeLessThanOrEqual(110);
  });

  it("verweist nur auf Werkzeuge, die es gibt", () => {
    const slugs = new Set(tools.map((t) => t.slug));
    for (const r of config.related) expect(slugs.has(r), r).toBe(true);
  });
});

// ---- Export ------------------------------------------------------------------------------------

describe("kundenweg: PDF quer und Word", () => {
  const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", p)));
  const fonts: PdfFonts = { title: read(FONT_PATHS.title), heading: read(FONT_PATHS.heading), body: read(FONT_PATHS.body), bodyMedium: read(FONT_PATHS.bodyMedium) };
  const doc = toDocument(auswerten(KELLER, KONTEXT));

  it("baut ein PDF im Querformat, in dem jedes Zeichen des Dokuments in der Schrift vorkommt", async () => {
    const bytes = await buildPdf(doc, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      expect([Math.round(width), Math.round(height)]).toEqual([842, 595]);
    }
    const probe = await PDFDocument.create();
    probe.registerFontkit(fontkit);
    const set = new Set((await probe.embedFont(fonts.body, { subset: true })).getCharacterSet());
    const text = [doc.title, doc.subtitle ?? "", reportMarkdown(auswerten(KELLER, KONTEXT)), reportMarkdown(auswerten(VEREIN, VEREIN_KONTEXT))].join("\n");
    const missing = [...new Set([...text].filter((c) => c !== "\n" && c !== "#" && !set.has(c.codePointAt(0)!)))];
    expect(missing).toEqual([]);
  });

  it("baut Word mit beiden Tabellen und den Hinweisen", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(doc));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Der Weg in sechs Phasen");
    expect(xml).toContain("Lückenliste");
    expect(xml).toContain("WhatsApp-Link mit QR");
    expect(xml.match(/<w:tbl>/g)).toHaveLength(3); // Steckbrief, Weg, Lückenliste
  });
});

// ---- Seitentext --------------------------------------------------------------------------------

describe("kundenweg: Seitentext", () => {
  // Das Werkzeug steht beim Bau noch nicht in tools/index.ts, `npm run content-check` meldet es dann nicht: Hier wird es geprüft.
  const raw = fs.readFileSync(path.join(process.cwd(), "content", "tools", "kundenweg.md"), "utf8");
  const parsed = parseToolMarkdown(raw);
  const norm = (t: string) => t.toLowerCase().replace(/[-–]/g, " ");

  it("besteht die Prüfung der Seitentexte ohne Fehler", () => {
    expect(checkToolContent(parsed).filter((i) => i.level === "error")).toEqual([]);
  });

  it("trägt das Keyword in der H1 und im ersten Absatz und kommt auf 3 bis 5 Nennungen", () => {
    const kw = norm(config.keyword);
    expect(norm(parsed.frontmatter.h1 ?? "")).toContain(kw);
    expect(norm((parsed.sections.warum ?? "").split(/\n\s*\n/)[0])).toContain(kw);
    const n = (norm(`${parsed.frontmatter.h1}\n${parsed.body}`).match(new RegExp(kw, "g")) ?? []).length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  });

  it("nennt dieselbe Tagline wie die Konfiguration und den Baustein «Google Business Profil»", () => {
    expect(parsed.frontmatter.tagline).toBe(config.tagline);
    expect(parsed.alperna).toMatchObject({ baustein: "Google Business Profil", beweis: "@baustein" });
    expect(parsed.frontmatter.h1).toBe("Kundenweg-Mapper für Schweizer KMU");
  });

  it("zeigt im Beispiel dasselbe Ergebnis, das das Werkzeug für Malerei Keller berechnet", () => {
    const s = summary(KELLER);
    const beispiel = parsed.sections.beispiel ?? "";
    expect(beispiel).toContain(`${s.satz} ${s.wichtigsteSatz}`);
    for (const [i, l] of lueckenliste(KELLER).entries()) {
      expect(beispiel).toContain(`Lücke ${i + 1}, ${l.label}`);
      for (const w of l.werkzeuge) expect(beispiel).toContain(w.name);
    }
  });

  it("verspricht keine Dauer und nennt keine Zahl ohne Herkunft", () => {
    expect(raw).not.toMatch(/\d\s?%|CHF/);
    expect(parsed.faq.find((f) => /wie lange/i.test(f.question))?.answer).toMatch(/nicht beziffern/);
  });
});
