import { describe, expect, it } from "vitest";
import { toMarkdown } from "@/lib/export/model";
import {
  ADD_BUTTON_ID,
  ANGABEN_LIMITS,
  EMPTY_ANGABEN,
  FINANZIERUNG,
  FIRMA_FIELD_ID,
  HINWEIS_BEZIEHUNG,
  LIMITS,
  MATRIX,
  MAX_GRUPPEN,
  QUADRANT_INFO,
  STRATEGIEN,
  VORLAGEN,
  achse,
  analysiere,
  aufTyp,
  ausgabeText,
  eingabeText,
  emptyState,
  feldId,
  formProblem,
  gruppenAusVorschlag,
  hatAngaben,
  hatWerte,
  hinweis,
  hinweise,
  istUnberuehrt,
  kiInput,
  leereGruppe,
  matrixLayout,
  neueGruppe,
  neueId,
  parseState,
  planFuer,
  pruefeGruppen,
  quadrant,
  setzePlanFeld,
  strategieSlug,
  toDocument,
  typWechselHinweis,
  vorlage,
  vorschlag,
  zusammenfassung,
  type Analyse,
  type Gruppe,
  type PlanEintrag,
  type Strategie,
} from "./logic";

const G = (id: string, name: string, interesse: number, einfluss: number, extra: Partial<Gruppe> = {}): Gruppe => ({
  ...leereGruppe(id, name),
  interesse,
  einfluss,
  ...extra,
});

/** Eine Auswahl von Gruppen des FC Trogen (fiktiv), alle vier Quadranten besetzt. */
const FC: Gruppe[] = [
  G("g1", "Mitglieder", 5, 4, { beziehung: "eng", erwartung: "Training, klare Termine", bedarf: "Mithilfe am Dorffest" }),
  G("g2", "Nachwuchs und Eltern", 5, 3, { beziehung: "gut" }),
  G("g3", "Vorstand", 5, 5, { beziehung: "eng" }),
  G("g4", "Sponsoren", 4, 4, { beziehung: "lose", erwartung: "Sichtbarkeit", bedarf: "Beiträge für die neue Ausrüstung" }),
  G("g5", "Gemeinde", 2, 5, { beziehung: "keine" }),
  G("g6", "Verbände", 2, 4, { beziehung: "lose" }),
  G("g7", "Medien", 3, 2),
  G("g8", "Helferinnen und Helfer", 4, 2, { beziehung: "gut" }),
];

const KONTEXT = { firma: "FC Trogen", typ: "verein" } as const;

function analyse(gruppen: Gruppe[] = FC): Analyse {
  const a = analysiere(gruppen);
  if (!a) throw new Error("Analyse erwartet");
  return a;
}

describe("anspruchsgruppen: quadrant", () => {
  it("liegt an der Grenze zwischen 3 und 4 (Einfluss und Interesse)", () => {
    expect(quadrant(4, 4)).toBe("eng einbinden");
    expect(quadrant(5, 5)).toBe("eng einbinden");
    expect(quadrant(3, 4)).toBe("zufriedenstellen");
    expect(quadrant(1, 5)).toBe("zufriedenstellen");
    expect(quadrant(4, 3)).toBe("informieren");
    expect(quadrant(5, 1)).toBe("informieren");
    expect(quadrant(3, 3)).toBe("beobachten");
    expect(quadrant(1, 1)).toBe("beobachten");
  });

  it("deckt alle 25 Wertepaare ab, jedes genau einem Quadranten", () => {
    const counts: Record<Strategie, number> = { "eng einbinden": 0, zufriedenstellen: 0, informieren: 0, beobachten: 0 };
    for (let interesse = 1; interesse <= 5; interesse++) {
      for (let einfluss = 1; einfluss <= 5; einfluss++) {
        const q = quadrant(interesse, einfluss);
        counts[q]++;
        const hochI = interesse >= 4;
        const hochE = einfluss >= 4;
        expect(q).toBe(hochE ? (hochI ? "eng einbinden" : "zufriedenstellen") : hochI ? "informieren" : "beobachten");
      }
    }
    expect(counts).toEqual({ "eng einbinden": 4, zufriedenstellen: 6, informieren: 6, beobachten: 9 });
  });

  it("nennt «Beziehung aufbauen» nur bei «eng einbinden» mit loser oder fehlender Beziehung", () => {
    expect(hinweis({ interesse: 5, einfluss: 5, beziehung: "keine" })).toBe(HINWEIS_BEZIEHUNG);
    expect(hinweis({ interesse: 4, einfluss: 4, beziehung: "lose" })).toBe("Beziehung aufbauen");
    expect(hinweis({ interesse: 4, einfluss: 4, beziehung: "gut" })).toBeNull();
    expect(hinweis({ interesse: 4, einfluss: 4, beziehung: "eng" })).toBeNull();
    expect(hinweis({ interesse: 4, einfluss: 4, beziehung: "" })).toBeNull();
    // andere Quadranten bekommen den Hinweis nicht, auch mit loser Beziehung
    expect(hinweis({ interesse: 2, einfluss: 5, beziehung: "keine" })).toBeNull();
    expect(hinweis({ interesse: 5, einfluss: 3, beziehung: "lose" })).toBeNull();
  });

  it("schlägt Kanal und Rhythmus je Quadrant vor", () => {
    expect(vorschlag("eng einbinden")).toEqual({ kanal: "persönliches Gespräch", rhythmus: "monatlich" });
    expect(vorschlag("zufriedenstellen")).toEqual({ kanal: "kurzer Bericht oder Anruf", rhythmus: "quartalsweise" });
    expect(vorschlag("informieren")).toEqual({ kanal: "Newsletter oder Beitrag", rhythmus: "monatlich" });
    expect(vorschlag("beobachten").rhythmus).toBe("jährlich, bei Anlass");
    expect(STRATEGIEN.map((s) => QUADRANT_INFO[s].titel)).toEqual(["Eng einbinden", "Zufriedenstellen", "Informieren", "Beobachten"]);
    expect(strategieSlug("eng einbinden")).toBe("eng-einbinden");
  });
});

describe("anspruchsgruppen: Vorlagen und Karten", () => {
  it("liefert je Typ acht Gruppen mit den Namen aus dem Auftrag, ohne Werte", () => {
    const kmu = vorlage("kmu");
    const verein = vorlage("verein");
    expect(kmu.map((g) => g.name)).toEqual(["Kunden", "Mitarbeitende", "Lieferanten", "Gemeinde und Behörden", "Banken", "Verbände", "Medien", "Nachbarschaft"]);
    expect(verein.map((g) => g.name)).toEqual([
      "Mitglieder",
      "Nachwuchs und Eltern",
      "Vorstand",
      "Sponsoren",
      "Gemeinde",
      "Verbände",
      "Medien",
      "Helferinnen und Helfer",
    ]);
    for (const liste of [kmu, verein]) {
      expect(liste).toHaveLength(8);
      expect(new Set(liste.map((g) => g.id)).size).toBe(8);
      expect(liste.every((g) => !hatWerte(g))).toBe(true);
    }
    expect(VORLAGEN.kmu).toHaveLength(8);
  });

  it("vergibt neue IDs immer grösser als die vorhandenen und kennt nur eigene Muster", () => {
    expect(neueId([])).toBe("g1");
    expect(neueId(vorlage("verein"))).toBe("g9");
    expect(neueId([{ id: "g3" }, { id: "x" }, { id: "g12" }])).toBe("g13");
    // eine entfernte mittlere ID kehrt nicht zurück
    const ohne = vorlage("kmu").filter((g) => g.id !== "g4");
    expect(neueGruppe(ohne).id).toBe("g9");
    expect(neueGruppe(ohne)).toMatchObject({ name: "", interesse: 0, einfluss: 0, beziehung: "" });
  });

  it("erkennt Werte und eine unberührte Vorlage", () => {
    expect(hatWerte(leereGruppe("g1", "Kunden"))).toBe(false);
    expect(hatWerte(G("g1", "Kunden", 1, 0))).toBe(true);
    expect(hatWerte({ ...leereGruppe("g1", "Kunden"), beziehung: "gut" })).toBe(true);
    expect(hatWerte({ ...leereGruppe("g1", "Kunden"), erwartung: "  " })).toBe(false);
    expect(hatWerte({ ...leereGruppe("g1", "Kunden"), bedarf: "Aufträge" })).toBe(true);

    expect(istUnberuehrt(vorlage("verein"), "verein")).toBe(true);
    expect(istUnberuehrt(vorlage("verein"), "kmu")).toBe(false);
    const geaendert = vorlage("kmu");
    geaendert[0] = { ...geaendert[0], name: "Kundschaft" };
    expect(istUnberuehrt(geaendert, "kmu")).toBe(false);
    expect(istUnberuehrt(vorlage("kmu").slice(1), "kmu")).toBe(false);
    expect(istUnberuehrt([], "kmu")).toBe(false);
  });
});

describe("anspruchsgruppen: Prüfung", () => {
  it("verlangt mindestens zwei bewertete Gruppen", () => {
    const ein = pruefeGruppen([G("g1", "Mitglieder", 5, 4)]);
    expect(ein).toEqual({ ok: false, problem: { message: "Bewerte mindestens zwei Gruppen mit Interesse und Einfluss.", fieldId: ADD_BUTTON_ID } });
    const keine = pruefeGruppen(vorlage("verein"));
    expect(keine.ok).toBe(false);
    if (!keine.ok) expect(keine.problem.fieldId).toBe(feldId("g1", "interesse"));
    expect(pruefeGruppen([]).ok).toBe(false);
    expect(pruefeGruppen([G("g1", "A", 1, 1), G("g2", "B", 5, 5)]).ok).toBe(true);
  });

  it("meldet einen leeren Namen bei einer Karte mit Werten und überspringt leere Karten", () => {
    const p = pruefeGruppen([G("g1", "Mitglieder", 5, 4), G("g2", "  ", 3, 3), G("g3", "Vorstand", 5, 5)]);
    expect(p).toEqual({ ok: false, problem: { message: "Gruppe 2: Gib einen Namen an.", fieldId: feldId("g2", "name") } });
    const leer = pruefeGruppen([G("g1", "Mitglieder", 5, 4), leereGruppe("g2", ""), G("g3", "Vorstand", 5, 5)]);
    expect(leer.ok).toBe(true);
    if (leer.ok) expect(leer.bewertet.map((g) => g.name)).toEqual(["Mitglieder", "Vorstand"]);
  });

  it("meldet fehlendes Interesse oder fehlenden Einfluss mit dem Namen der Gruppe", () => {
    const a = pruefeGruppen([G("g1", "Mitglieder", 0, 4), G("g2", "Vorstand", 5, 5)]);
    expect(a).toMatchObject({ ok: false, problem: { message: "Mitglieder: Wähle das Interesse von 1 bis 5.", fieldId: "ag-g1-interesse" } });
    const b = pruefeGruppen([G("g1", "Mitglieder", 3, 0), G("g2", "Vorstand", 5, 5)]);
    expect(b).toMatchObject({ ok: false, problem: { message: "Mitglieder: Wähle den Einfluss von 1 bis 5.", fieldId: "ag-g1-einfluss" } });
    // nur eine Beziehung angegeben: die Karte zählt als angefangen
    const c = pruefeGruppen([{ ...leereGruppe("g1", "Mitglieder"), beziehung: "eng" }, G("g2", "Vorstand", 5, 5)]);
    expect(c).toMatchObject({ ok: false, problem: { fieldId: "ag-g1-interesse" } });
  });

  it("weist Werte ausserhalb von 1 bis 5 ab", () => {
    for (const bad of [6, 7, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const i = pruefeGruppen([G("g1", "Mitglieder", bad, 4), G("g2", "Vorstand", 5, 5)]);
      expect(i).toMatchObject({ ok: false, problem: { message: "Mitglieder: Das Interesse geht von 1 bis 5.", fieldId: "ag-g1-interesse" } });
      const e = pruefeGruppen([G("g1", "Mitglieder", 4, bad), G("g2", "Vorstand", 5, 5)]);
      expect(e).toMatchObject({ ok: false, problem: { message: "Mitglieder: Der Einfluss geht von 1 bis 5.", fieldId: "ag-g1-einfluss" } });
    }
  });

  it("begrenzt Name und Texte und prüft die Beziehung", () => {
    const lang = "x".repeat(LIMITS.name + 1);
    expect(pruefeGruppen([G("g1", lang, 3, 3), G("g2", "B", 3, 3)])).toMatchObject({ ok: false, problem: { fieldId: "ag-g1-name" } });
    const text = "t".repeat(LIMITS.text + 1);
    expect(pruefeGruppen([G("g1", "A", 3, 3, { erwartung: text }), G("g2", "B", 3, 3)])).toMatchObject({ ok: false, problem: { fieldId: "ag-g1-erwartung" } });
    expect(pruefeGruppen([G("g1", "A", 3, 3), G("g2", "B", 3, 3, { bedarf: text })])).toMatchObject({ ok: false, problem: { fieldId: "ag-g2-bedarf" } });
    expect(pruefeGruppen([G("g1", "A", 3, 3, { erwartung: "t".repeat(LIMITS.text) }), G("g2", "B", 3, 3)]).ok).toBe(true);
    const falsch = { ...G("g1", "A", 3, 3), beziehung: "nah" } as unknown as Gruppe;
    expect(pruefeGruppen([falsch, G("g2", "B", 3, 3)])).toMatchObject({ ok: false, problem: { fieldId: "ag-g1-beziehung" } });
  });

  it("begrenzt die Liste auf zwölf Karten", () => {
    const zwoelf = Array.from({ length: MAX_GRUPPEN }, (_, i) => G(`g${i + 1}`, `Gruppe ${i + 1}`, 3, 3));
    expect(pruefeGruppen(zwoelf).ok).toBe(true);
    const dreizehn = [...zwoelf, G("g13", "Gruppe 13", 3, 3)];
    expect(pruefeGruppen(dreizehn)).toMatchObject({ ok: false, problem: { fieldId: ADD_BUTTON_ID } });
  });

  it("zählt Karten nur mit Namen als nicht bewertet und kürzt Namen und Texte", () => {
    const p = pruefeGruppen([G("g1", "  Mitglieder  ", 5, 4, { erwartung: "  Training  " }), G("g2", "Vorstand", 5, 5), leereGruppe("g3", "Banken"), leereGruppe("g4", "Medien")]);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.nichtBewertet).toEqual(["Banken", "Medien"]);
      expect(p.bewertet[0]).toMatchObject({ name: "Mitglieder", erwartung: "Training" });
    }
  });

  it("stellt die Firma vor die Gruppen und nennt den Typ", () => {
    expect(formProblem("", "verein", FC)).toEqual({ message: "Gib den Namen deines Vereins an.", fieldId: FIRMA_FIELD_ID });
    expect(formProblem("   ", "kmu", FC)).toEqual({ message: "Gib den Namen deines Betriebs an.", fieldId: "ag-firma" });
    expect(formProblem(undefined, "kmu", [])?.message).toBe("Gib den Namen deines Betriebs an.");
    expect(formProblem("FC Trogen", "verein", FC)).toBeNull();
    expect(formProblem("FC Trogen", "verein", [G("g1", "A", 3, 3)])?.message).toContain("zwei Gruppen");
  });
});

describe("anspruchsgruppen: Auswertung", () => {
  it("sortiert nach Quadrant, Einfluss, Interesse und Eingabe und zählt die Nummern in dieser Reihenfolge", () => {
    const a = analyse();
    expect(a.gruppen.map((g) => `${g.nr} ${g.name} ${g.strategie}`)).toEqual([
      "1 Vorstand eng einbinden",
      "2 Mitglieder eng einbinden",
      "3 Sponsoren eng einbinden",
      "4 Gemeinde zufriedenstellen",
      "5 Verbände zufriedenstellen",
      "6 Nachwuchs und Eltern informieren",
      "7 Helferinnen und Helfer informieren",
      "8 Medien beobachten",
    ]);
    expect(a.je["eng einbinden"].map((g) => g.name)).toEqual(["Vorstand", "Mitglieder", "Sponsoren"]);
    expect(a.je.beobachten.map((g) => g.name)).toEqual(["Medien"]);
  });

  it("behält bei gleichen Werten die Reihenfolge der Eingabe", () => {
    const a = analyse([G("g1", "Zeta", 3, 3), G("g2", "Alpha", 3, 3), G("g3", "Mitte", 3, 3)]);
    expect(a.gruppen.map((g) => g.name)).toEqual(["Zeta", "Alpha", "Mitte"]);
  });

  it("hängt den Hinweis an die Gruppen, die ihn brauchen, und liefert null bei ungültiger Eingabe", () => {
    const a = analyse();
    expect(a.gruppen.filter((g) => g.hinweis).map((g) => g.name)).toEqual(["Sponsoren"]);
    expect(analysiere([G("g1", "A", 3, 3)])).toBeNull();
    expect(analysiere([G("g1", "A", 9, 3), G("g2", "B", 3, 3)])).toBeNull();
  });

  it("fasst zusammen und nennt nicht bewertete Gruppen", () => {
    expect(zusammenfassung(analyse())).toBe("8 Gruppen bewertet. Eng einbinden: 3, zufriedenstellen: 2, informieren: 2, beobachten: 1.");
    const klein = analyse([G("g1", "A", 1, 1), G("g2", "B", 2, 2), leereGruppe("g3", "Banken")]);
    expect(zusammenfassung(klein)).toBe("2 Gruppen bewertet. Beobachten: 2. Nicht bewertet: Banken.");
  });
});

describe("anspruchsgruppen: Plan", () => {
  it("füllt den Vorschlag je Quadrant, ohne Verantwortliche", () => {
    const a = analyse();
    const plan = planFuer(a.gruppen, []);
    expect(plan).toHaveLength(8);
    expect(plan[0]).toEqual({ id: "g3", strategie: "eng einbinden", kanal: "persönliches Gespräch", rhythmus: "monatlich", verantwortlich: "" });
    expect(plan[3]).toMatchObject({ id: "g5", kanal: "kurzer Bericht oder Anruf", rhythmus: "quartalsweise" });
    expect(plan[7]).toMatchObject({ id: "g7", rhythmus: "jährlich, bei Anlass" });
  });

  it("behält gespeicherte Einträge bei gleichem Quadranten, auch leer gelöschte Felder", () => {
    const a = analyse();
    const gespeichert: PlanEintrag[] = [{ id: "g3", strategie: "eng einbinden", kanal: "Telefon", rhythmus: "", verantwortlich: "Anna Keller" }];
    const plan = planFuer(a.gruppen, gespeichert);
    expect(plan[0]).toEqual(gespeichert[0]);
  });

  it("nimmt bei einem Quadrantenwechsel den neuen Vorschlag und behält die Verantwortlichen", () => {
    const a = analyse();
    const gespeichert: PlanEintrag[] = [{ id: "g3", strategie: "beobachten", kanal: "alt", rhythmus: "alt", verantwortlich: "Anna Keller" }];
    expect(planFuer(a.gruppen, gespeichert)[0]).toEqual({
      id: "g3",
      strategie: "eng einbinden",
      kanal: "persönliches Gespräch",
      rhythmus: "monatlich",
      verantwortlich: "Anna Keller",
    });
  });

  it("lässt Einträge entfernter Gruppen weg und ändert einzelne Felder sauber", () => {
    const a = analyse([G("g1", "A", 5, 5), G("g2", "B", 1, 1)]);
    const gespeichert: PlanEintrag[] = [{ id: "g9", strategie: "informieren", kanal: "x", rhythmus: "y", verantwortlich: "z" }];
    const plan = planFuer(a.gruppen, gespeichert);
    expect(plan.map((p) => p.id)).toEqual(["g1", "g2"]);
    const neu = setzePlanFeld(plan, "g2", "verantwortlich", "Anna\nKeller");
    expect(neu[1].verantwortlich).toBe("Anna Keller");
    expect(neu[0]).toBe(plan[0]);
    expect(setzePlanFeld(plan, "g1", "kanal", "k".repeat(200))[0].kanal).toHaveLength(LIMITS.plan);
    expect(setzePlanFeld(plan, "gX", "kanal", "n")).toEqual(plan);
  });
});

describe("anspruchsgruppen: Matrix", () => {
  it("legt die Achse monoton und so, dass die Grenze zwischen 3 und 4 in der Mitte liegt", () => {
    const pos = [1, 2, 3, 4, 5].map(achse);
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    expect(achse(3)).toBeLessThan(0.5);
    expect(achse(4)).toBeGreaterThan(0.5);
    expect(pos.every((p) => p > 0 && p < 1)).toBe(true);
    expect(achse(0)).toBe(achse(1));
    expect(achse(9)).toBe(achse(5));
    expect(achse(Number.NaN)).toBe(achse(1));
  });

  it("hält unten einen Streifen frei und bleibt dabei monoton mit der Grenze in der Mitte", () => {
    const unten = MATRIX.band / MATRIX.plot.h;
    const pos = [1, 2, 3, 4, 5].map((v) => achse(v, unten));
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    expect(pos[0]).toBeGreaterThan(unten);
    expect(pos[2]).toBeLessThan(0.5);
    expect(pos[3]).toBeGreaterThan(0.5);
    expect(achse(1, 0)).toBe(achse(1));
    expect(achse(1, 9)).toBeLessThan(0.5); // unsinnige Streifen werden begrenzt
  });

  it("setzt Punkte nach Interesse (rechts) und Einfluss (oben) in den richtigen Quadranten", () => {
    const a = analyse();
    const layout = matrixLayout(a.gruppen);
    const mitteX = layout.plot.x + layout.plot.w / 2;
    const mitteY = layout.plot.y + layout.plot.h / 2;
    for (const p of layout.punkte) {
      expect(p.cx > mitteX).toBe(p.interesse >= 4);
      expect(p.cy < mitteY).toBe(p.einfluss >= 4);
    }
    const vorstand = layout.punkte.find((p) => p.name === "Vorstand")!;
    const medien = layout.punkte.find((p) => p.name === "Medien")!;
    expect(vorstand.cx).toBeGreaterThan(medien.cx);
    expect(vorstand.cy).toBeLessThan(medien.cy);
  });

  it("hält alle Punkte im Zeichenbereich und in der Plotfläche, auch an den Ecken", () => {
    const ecken = [G("g1", "A", 1, 1), G("g2", "B", 5, 1), G("g3", "C", 1, 5), G("g4", "D", 5, 5)];
    const layout = matrixLayout(analyse(ecken).gruppen);
    const { plot, r, width, height } = layout;
    expect(layout.punkte).toHaveLength(4);
    for (const p of layout.punkte) {
      expect(p.cx - r).toBeGreaterThanOrEqual(plot.x);
      expect(p.cx + r).toBeLessThanOrEqual(plot.x + plot.w);
      expect(p.cy - r).toBeGreaterThanOrEqual(plot.y);
      expect(p.cy + r).toBeLessThanOrEqual(plot.y + plot.h);
      expect(p.cx + r).toBeLessThanOrEqual(width);
      expect(p.cy + r).toBeLessThanOrEqual(height);
    }
  });

  it("versetzt Dubletten, sodass sich keine zwei Punkte decken", () => {
    for (const n of [2, 3, 4, 5]) {
      const gruppen = Array.from({ length: n }, (_, i) => G(`g${i + 1}`, `Gruppe ${i + 1}`, 4, 4));
      const punkte = matrixLayout(analyse(gruppen).gruppen).punkte;
      const keys = new Set(punkte.map((p) => `${p.cx}/${p.cy}`));
      expect(keys.size).toBe(n);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d = Math.hypot(punkte[i].cx - punkte[j].cx, punkte[i].cy - punkte[j].cy);
          expect(d).toBeGreaterThanOrEqual(MATRIX.r * 2 * 0.95);
        }
      }
    }
  });

  it("lässt am unteren Rand Platz für die Namen der Quadranten", () => {
    const layout = matrixLayout(analyse([G("g1", "A", 1, 1), G("g2", "B", 5, 1), G("g3", "C", 3, 1)]).gruppen);
    for (const p of layout.punkte) expect(p.cy + layout.r).toBeLessThanOrEqual(layout.plot.y + layout.plot.h - MATRIX.band);
    // die Namen der unteren Quadranten stehen unterhalb jedes Punkts
    for (const q of layout.quadranten.filter((x) => x.strategie === "beobachten" || x.strategie === "informieren")) {
      expect(q.textY).toBeGreaterThan(Math.max(...layout.punkte.map((p) => p.cy + layout.r)));
    }
  });

  it("hält auch zwölf Gruppen auf einem Wert in der Plotfläche und liefert Quadranten und Achsenmarken", () => {
    const gruppen = Array.from({ length: 12 }, (_, i) => G(`g${i + 1}`, `Gruppe ${i + 1}`, 1, 1));
    const layout = matrixLayout(analyse(gruppen).gruppen);
    expect(new Set(layout.punkte.map((p) => `${p.cx}/${p.cy}`)).size).toBe(12);
    for (const p of layout.punkte) {
      expect(p.cx).toBeGreaterThanOrEqual(layout.plot.x + layout.r);
      expect(p.cy).toBeLessThanOrEqual(layout.plot.y + layout.plot.h - layout.r);
    }
    expect(layout.quadranten.map((q) => q.strategie)).toEqual(["zufriedenstellen", "eng einbinden", "beobachten", "informieren"]);
    const eng = layout.quadranten.find((q) => q.strategie === "eng einbinden")!;
    expect(eng.x).toBe(layout.plot.x + layout.plot.w / 2);
    expect(eng.y).toBe(layout.plot.y);
    expect(layout.ticksX.map((t) => t.wert)).toEqual([1, 2, 3, 4, 5]);
    expect(layout.ticksY.map((t) => t.wert)).toEqual([1, 2, 3, 4, 5]);
    expect(layout.ticksY[4].y).toBeLessThan(layout.ticksY[0].y);
    expect(matrixLayout([]).punkte).toEqual([]);
  });
});

describe("anspruchsgruppen: Dokument", () => {
  it("baut die Tabellen: Überblick, Plan und, mit Texten, Erwartungen und Bedarf", () => {
    const doc = toDocument(analyse(), [], KONTEXT);
    expect(doc.title).toBe("Anspruchsgruppen-Analyse");
    expect(doc.firma).toBe("FC Trogen");
    expect(doc.filename).toBe("anspruchsgruppen-fc-trogen");
    const tables = doc.blocks.flatMap((b) => (b.type === "table" ? [b] : []));
    expect(tables.map((t) => t.header)).toEqual([
      ["Gruppe", "Interesse", "Einfluss", "Quadrant", "Strategie"],
      ["Gruppe", "Beziehung", "Was sie erwartet", "Was wir von ihr brauchen"],
      ["Gruppe", "Quadrant", "Strategie", "Kanal", "Rhythmus", "Verantwortlich"],
    ]);
    expect(tables[0].rows[0]).toEqual(["Vorstand", "5", "5", "Einfluss hoch, Interesse hoch", "eng einbinden"]);
    expect(tables[0].rows).toHaveLength(8);
    expect(tables[1].rows[1]).toEqual(["Mitglieder", "eng", "Training, klare Termine", "Mithilfe am Dorffest"]);
    expect(tables[1].rows[0]).toEqual(["Vorstand", "eng", "–", "–"]);
    expect(tables[2].rows[0]).toEqual(["Vorstand", "Einfluss hoch, Interesse hoch", "eng einbinden", "persönliches Gespräch", "monatlich", "noch offen"]);
    expect(tables[2].rows).toHaveLength(8);
    for (const t of tables) for (const row of t.rows) expect(row).toHaveLength(t.header.length);
  });

  it("lässt die Tabelle «Erwartungen und Bedarf» weg, wenn niemand Beziehung oder Text angibt", () => {
    const a = analyse([G("g1", "A", 5, 5), G("g2", "B", 1, 1)]);
    const doc = toDocument(a, [], KONTEXT);
    const headings = doc.blocks.flatMap((b) => (b.type === "heading" ? [b.text] : []));
    expect(headings).toEqual(["Die Gruppen im Überblick", "Strategie je Quadrant", "Kommunikationsplan", "Hinweise"]);
  });

  it("übernimmt Änderungen im Plan und zeigt «noch offen» nur ohne Verantwortliche", () => {
    const a = analyse();
    const plan = setzePlanFeld(planFuer(a.gruppen, []), "g3", "verantwortlich", "Anna Keller");
    const md = toMarkdown(toDocument(a, plan, KONTEXT));
    expect(md).toContain("| Vorstand | Einfluss hoch, Interesse hoch | eng einbinden | persönliches Gespräch | monatlich | Anna Keller |");
    expect(md).toContain("noch offen");
  });

  it("nennt die Quadranten mit ihren Gruppen und die Hinweise", () => {
    const doc = toDocument(analyse(), [], KONTEXT);
    const liste = doc.blocks.find((b) => b.type === "list" && !b.ordered);
    expect(liste?.type === "list" && liste.items[0]).toContain("Eng einbinden (Einfluss hoch, Interesse hoch): Vorstand, Mitglieder, Sponsoren.");
    const hinweisBlock = doc.blocks[doc.blocks.length - 1];
    expect(hinweisBlock.type === "list" && hinweisBlock.ordered).toBe(true);
    const texte = hinweise(analyse(), KONTEXT);
    expect(texte[0]).toMatch(/^Beziehung aufbauen: Sponsoren\./);
    expect(texte.some((t) => t.includes("vor der Generalversammlung"))).toBe(true);
    expect(hinweise(analyse(), { firma: "Malerei Keller", typ: "kmu" }).some((t) => t.includes("vor der Jahresplanung"))).toBe(true);
    // ohne «Beziehung aufbauen» fehlt dieser Hinweis; nicht bewertete Gruppen stehen am Ende
    const ohne = analyse([G("g1", "A", 1, 1), G("g2", "B", 2, 2), leereGruppe("g3", "Banken")]);
    const t2 = hinweise(ohne, KONTEXT);
    expect(t2.some((t) => t.startsWith("Beziehung aufbauen"))).toBe(false);
    expect(t2[t2.length - 1]).toMatch(/^Nicht bewertet: Banken\./);
  });

  it("kommt ohne Firma zurecht und hält Markdown, Sperrliste und Rechtschreibung ein", () => {
    const doc = toDocument(analyse(), [], { firma: "  ", typ: "kmu" });
    expect(doc.firma).toBeUndefined();
    expect(doc.filename).toBe("anspruchsgruppen-analyse");
    const md = toMarkdown(doc);
    expect(md).toContain("- **Betrieb:** keine Angabe");
    expect(md).not.toMatch(/ß|—|!/);
    expect(md).toContain("Grenze für «hoch»");
    expect(md).toContain("Richtwert von Alperna, keine Statistik");
  });

  it("maskiert Pipe-Zeichen und Zeilenumbrüche in Tabellenzellen", () => {
    const a = analyse([G("g1", "A | B", 5, 5, { erwartung: "Zeile 1\nZeile 2" }), G("g2", "C", 1, 1)]);
    const md = toMarkdown(toDocument(a, [], KONTEXT));
    expect(md).toContain("| A \\| B |");
    expect(md).toContain("Zeile 1 Zeile 2");
  });
});

describe("anspruchsgruppen: Eingabe und Ausgabe fürs CRM", () => {
  it("nennt die Gruppen je Zeile mit Werten, danach nicht bewertete Gruppen und die Texte", () => {
    const text = eingabeText(KONTEXT, [...FC, leereGruppe("g9", "Banken")]);
    const zeilen = text.split("\n");
    expect(zeilen[0]).toBe("Verein: FC Trogen");
    expect(zeilen[1]).toBe("Gruppen (8 bewertet, Interesse und Einfluss von 1 bis 5):");
    expect(zeilen[2]).toBe("Mitglieder: Interesse 5, Einfluss 4, Beziehung eng");
    expect(zeilen).toContain("Medien: Interesse 3, Einfluss 2, Beziehung nicht angegeben");
    expect(zeilen).toContain("Nicht bewertet: Banken");
    expect(zeilen).toContain("Erwartungen und Bedarf:");
    expect(zeilen).toContain("Mitglieder: erwartet Training, klare Termine; braucht Mithilfe am Dorffest");
    expect(zeilen).toContain("Sponsoren: erwartet Sichtbarkeit; braucht Beiträge für die neue Ausrüstung");
    // die Zahlen stehen vor den Texten
    expect(text.indexOf("Medien: Interesse")).toBeLessThan(text.indexOf("Erwartungen und Bedarf:"));
  });

  it("schreibt ohne Firma «keine Angabe» und bei ungültiger Eingabe nur den Kopf", () => {
    expect(eingabeText({ firma: "", typ: "kmu" }, FC).startsWith("Betrieb: keine Angabe\n")).toBe(true);
    expect(eingabeText(KONTEXT, [G("g1", "A", 3, 3)])).toBe("Verein: FC Trogen\nGruppen (0 bewertet, Interesse und Einfluss von 1 bis 5):");
  });

  it("liefert die Ausgabe als Markdown mit Quadranten und Plan", () => {
    const a = analyse();
    const plan = setzePlanFeld(planFuer(a.gruppen, []), "g3", "verantwortlich", "Anna Keller");
    const md = ausgabeText(KONTEXT, a, plan);
    expect(md.startsWith("# Anspruchsgruppen-Analyse: FC Trogen\nVerein, 8 Gruppen bewertet. Eng einbinden: 3, zufriedenstellen: 2, informieren: 2, beobachten: 1.\n")).toBe(true);
    expect(md).toContain("## Eng einbinden\n- Vorstand (Interesse 5, Einfluss 5)\n- Mitglieder (Interesse 5, Einfluss 4)\n- Sponsoren (Interesse 4, Einfluss 4), Beziehung aufbauen");
    expect(md).toContain("## Kommunikationsplan\n- Vorstand: persönliches Gespräch, monatlich, Verantwortlich: Anna Keller\n- Mitglieder: persönliches Gespräch, monatlich\n");
    expect(md).toContain("- Medien: Einladung oder Gruss, jährlich, bei Anlass");
  });

  it("lässt leere Quadranten weg und bleibt bei zwölf Gruppen unter 1'900 Zeichen", () => {
    const namen = ["Mitglieder", "Nachwuchs und Eltern", "Vorstand", "Sponsoren", "Gemeinde", "Verbände", "Medien", "Helferinnen und Helfer", "Trainerinnen", "Schulen", "Nachbarschaft", "Landi Trogen"];
    const zwoelf = namen.map((n, i) => G(`g${i + 1}`, n, (i % 5) + 1, ((i * 2) % 5) + 1, { erwartung: "e".repeat(200), bedarf: "b".repeat(200) }));
    const a = analyse(zwoelf);
    const md = ausgabeText(KONTEXT, a, []);
    expect(md.length).toBeLessThan(1900);
    const klein = ausgabeText(KONTEXT, analyse([G("g1", "A", 1, 1), G("g2", "B", 2, 2)]), []);
    expect(klein).not.toContain("## Eng einbinden");
    expect(klein).toContain("## Beobachten");
    // die Eingabe ist lang, aber die Zahlen aller zwölf Gruppen stehen in den ersten 1'900 Zeichen
    const eingabe = eingabeText(KONTEXT, zwoelf);
    const kopf = eingabe.slice(0, 1900);
    for (const n of namen) expect(kopf).toContain(`${n}: Interesse`);
  });
});

describe("anspruchsgruppen: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten die Vorlage «kmu» im Zustand «edit»", () => {
    for (const bad of [null, undefined, "text", 42, [], {}, { v: 2 }, { v: "1" }, true]) {
      const s = parseState(bad);
      expect(s).toEqual(emptyState());
      expect(s.phase).toBe("edit");
      expect(s.typ).toBe("kmu");
      expect(s.gruppen).toHaveLength(8);
    }
  });

  it("nimmt die Vorlage des Typs, wenn die Liste fehlt, und lässt eine leere Liste leer", () => {
    expect(parseState({ v: 1, typ: "verein" }).gruppen.map((g) => g.name)[0]).toBe("Mitglieder");
    expect(parseState({ v: 1, typ: "verein", gruppen: "x" }).gruppen).toHaveLength(8);
    expect(parseState({ v: 1, typ: "verein", gruppen: [] }).gruppen).toEqual([]);
    expect(parseState({ v: 1, typ: "firma" }).typ).toBe("kmu");
  });

  it("bereinigt kaputte Gruppen einzeln: Werte, Beziehung, Länge, IDs", () => {
    const s = parseState({
      v: 1,
      typ: "kmu",
      gruppen: [
        null,
        "x",
        { id: "g1", name: "Kunden", interesse: 7, einfluss: 2.5, beziehung: "nah", erwartung: 5, bedarf: "b".repeat(500) },
        { id: "g1", name: "Doppelt\nund zwei Zeilen", interesse: "3", einfluss: 3 },
        { name: "Ohne ID", interesse: 4, einfluss: 5, beziehung: "gut" },
        { id: "Gross Schreibung!", name: "Ungültige ID" },
      ],
    });
    expect(s.gruppen).toHaveLength(4);
    expect(s.gruppen[0]).toEqual({ id: "g1", name: "Kunden", interesse: 0, einfluss: 0, beziehung: "", erwartung: "", bedarf: "b".repeat(LIMITS.text) });
    expect(s.gruppen[1].id).toBe("g2");
    expect(s.gruppen[1]).toMatchObject({ name: "Doppelt und zwei Zeilen", interesse: 0, einfluss: 3 });
    expect(s.gruppen[2]).toMatchObject({ id: "g3", name: "Ohne ID", interesse: 4, einfluss: 5, beziehung: "gut" });
    expect(new Set(s.gruppen.map((g) => g.id)).size).toBe(4);
  });

  it("schneidet die Liste bei zwölf Karten ab und kürzt den Namen", () => {
    const viele = Array.from({ length: 20 }, (_, i) => ({ id: `g${i + 1}`, name: `G${i}` }));
    expect(parseState({ v: 1, typ: "kmu", gruppen: viele }).gruppen).toHaveLength(MAX_GRUPPEN);
    expect(parseState({ v: 1, typ: "kmu", gruppen: [{ id: "g1", name: "n".repeat(100) }] }).gruppen[0].name).toHaveLength(LIMITS.name);
  });

  it("behält «result» nur bei gültigen Gruppen", () => {
    const gut = parseState({ v: 1, phase: "result", typ: "verein", gruppen: FC });
    expect(gut.phase).toBe("result");
    expect(gut.typ).toBe("verein");
    expect(gut.gruppen).toEqual(FC);
    expect(parseState({ v: 1, phase: "result", typ: "verein" }).phase).toBe("edit"); // Vorlage ohne Werte
    expect(parseState({ v: 1, phase: "result", typ: "verein", gruppen: [FC[0]] }).phase).toBe("edit");
    expect(parseState({ v: 1, phase: "fertig", typ: "verein", gruppen: FC }).phase).toBe("edit");
  });

  it("liest den Plan nur für vorhandene Gruppen, ohne Doppel und mit gültigem Quadranten", () => {
    const plan = [
      { id: "g3", strategie: "eng einbinden", kanal: "Telefon", rhythmus: "wöchentlich", verantwortlich: "Anna" },
      { id: "g3", strategie: "eng einbinden", kanal: "doppelt", rhythmus: "", verantwortlich: "" },
      { id: "g99", strategie: "eng einbinden", kanal: "x", rhythmus: "x", verantwortlich: "x" },
      { id: "g1", strategie: "wichtig", kanal: "x", rhythmus: "x", verantwortlich: "x" },
      { id: "g2", strategie: "informieren", kanal: "k".repeat(300), rhythmus: 5, verantwortlich: "Zeile\nzwei" },
      "kaputt",
    ];
    const s = parseState({ v: 1, phase: "edit", typ: "verein", gruppen: FC, plan });
    expect(s.plan).toEqual([
      { id: "g3", strategie: "eng einbinden", kanal: "Telefon", rhythmus: "wöchentlich", verantwortlich: "Anna" },
      { id: "g2", strategie: "informieren", kanal: "k".repeat(LIMITS.plan), rhythmus: "", verantwortlich: "Zeile zwei" },
    ]);
    expect(parseState({ v: 1, typ: "kmu", plan: "x" }).plan).toEqual([]);
  });

  it("übersteht einen Durchlauf durch JSON unverändert", () => {
    const s = parseState({ v: 1, phase: "result", typ: "verein", gruppen: FC, plan: planFuer(analyse().gruppen, []) });
    expect(parseState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe("anspruchsgruppen: Typwechsel", () => {
  it("lädt die andere Vorlage, solange die Liste unberührt ist", () => {
    const kmu = emptyState("kmu");
    const verein = aufTyp(kmu, "verein");
    expect(verein.typ).toBe("verein");
    expect(verein.gruppen.map((g) => g.name)[0]).toBe("Mitglieder");
    expect(typWechselHinweis(kmu, "verein")).toBe(false);
    expect(aufTyp(kmu, "kmu")).toBe(kmu);
  });

  it("lässt die Liste stehen, sobald Werte eingetragen sind, und meldet den Hinweis", () => {
    const state = { ...emptyState("kmu"), gruppen: vorlage("kmu").map((g, i) => (i === 0 ? { ...g, interesse: 5 } : g)) };
    expect(aufTyp(state, "verein")).toBe(state);
    expect(typWechselHinweis(state, "verein")).toBe(true);
    expect(typWechselHinweis(state, "kmu")).toBe(false);
    // umbenannte Gruppe zählt ebenfalls als bearbeitet
    const umbenannt = { ...emptyState("kmu"), gruppen: vorlage("kmu").map((g, i) => (i === 1 ? { ...g, name: "Team" } : g)) };
    expect(typWechselHinweis(umbenannt, "verein")).toBe(true);
  });

  it("wechselt im Ergebnis nicht und meldet bei leerer Liste keinen Hinweis", () => {
    const result = { ...emptyState("kmu"), phase: "result" as const };
    expect(aufTyp(result, "verein")).toBe(result);
    expect(typWechselHinweis(result, "verein")).toBe(false);
    const leer = { ...emptyState("kmu"), gruppen: [] };
    expect(typWechselHinweis(leer, "verein")).toBe(false);
    expect(aufTyp(leer, "verein")).toBe(leer);
  });
});

describe("anspruchsgruppen: Angaben für den Vorschlag der KI", () => {
  it("kennt je Typ fünf Möglichkeiten für die Finanzierung mit eindeutigen Schlüsseln", () => {
    for (const typ of ["kmu", "verein"] as const) {
      expect(FINANZIERUNG[typ]).toHaveLength(5);
      expect(new Set(FINANZIERUNG[typ].map((f) => f.key)).size).toBe(5);
    }
    expect(FINANZIERUNG.verein.map((f) => f.label)).toContain("Mitgliederbeiträge");
    expect(FINANZIERUNG.kmu.map((f) => f.label)).toContain("Aufträge von Firmen");
  });

  it("hat leere Angaben im leeren Stand und erkennt, ob die Person etwas eingetragen hat", () => {
    expect(emptyState().angaben).toEqual(EMPTY_ANGABEN);
    expect(hatAngaben(EMPTY_ANGABEN)).toBe(false);
    expect(hatAngaben({ ...EMPTY_ANGABEN, vorhaben: "  " })).toBe(false);
    expect(hatAngaben({ ...EMPTY_ANGABEN, finanzierung: ["spenden"] })).toBe(true);
    expect(hatAngaben({ ...EMPTY_ANGABEN, bekannte: "Sponsoren" })).toBe(true);
  });

  it("macht die Eingabe für die KI aus Profil und Angaben: Finanzierung in Worten, Texte aufgeräumt und gekürzt", () => {
    const i = kiInput(
      { firma: "  FC   Trogen ", rechtsform: "Verein", branche: "Fussball", ort: "Trogen" },
      "verein",
      { finanzierung: ["sponsoren", "mitglieder", "unbekannt"], vorhaben: "Neues\n Vereinshaus", bekannte: "Sponsoren,  Gemeinde" },
    );
    expect(i).toEqual({
      betrieb: "FC Trogen",
      typ: "verein",
      rechtsform: "Verein",
      branche: "Fussball",
      ort: "Trogen",
      // in der Reihenfolge der Auswahl, nicht der Anklicks; unbekannte Schlüssel fallen weg
      finanzierung: ["Mitgliederbeiträge", "Sponsoren"],
      vorhaben: "Neues Vereinshaus",
      bekannte: "Sponsoren, Gemeinde",
    });
    expect(kiInput({}, "kmu", EMPTY_ANGABEN)).toMatchObject({ betrieb: "", rechtsform: "", finanzierung: [], vorhaben: "", bekannte: "" });
    expect(kiInput({ firma: "x".repeat(300) }, "kmu", { ...EMPTY_ANGABEN, vorhaben: "y".repeat(500) }).vorhaben).toHaveLength(ANGABEN_LIMITS.vorhaben);
  });

  it("macht aus dem Vorschlag Gruppen der Liste mit den IDs g1, g2, … und besteht damit die Prüfung der Analyse", () => {
    const vorschlag = {
      gruppen: [
        { name: "Mitglieder", interesse: 5, einfluss: 4, beziehung: "eng" as const, erwartung: "Erwartet klare Termine.", bedarf: "Braucht ihre Mithilfe am Fest." },
        { name: "Sponsoren", interesse: 3, einfluss: 5, beziehung: "lose" as const, erwartung: "Erwartet Sichtbarkeit.", bedarf: "Braucht ihre Beiträge im Jahr." },
        { name: "Gemeinde", interesse: 2, einfluss: 5, beziehung: "keine" as const, erwartung: "Erwartet Berichte.", bedarf: "Braucht Beiträge und einen Platz." },
        { name: "Medien", interesse: 2, einfluss: 2, beziehung: "lose" as const, erwartung: "Erwartet Neuigkeiten.", bedarf: "Braucht ihre Berichte vor Anlässen." },
        { name: "Eltern", interesse: 5, einfluss: 2, beziehung: "gut" as const, erwartung: "Erwartet Sicherheit.", bedarf: "Braucht ihre Unterstützung beim Fahren." },
        { name: "Vorstand", interesse: 5, einfluss: 5, beziehung: "eng" as const, erwartung: "Erwartet Einsatz.", bedarf: "Braucht Zeit für Sitzungen." },
      ],
    };
    const gruppen = gruppenAusVorschlag(vorschlag);
    expect(gruppen.map((g) => g.id)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6"]);
    expect(gruppen[1]).toEqual({ id: "g2", name: "Sponsoren", interesse: 3, einfluss: 5, beziehung: "lose", erwartung: "Erwartet Sichtbarkeit.", bedarf: "Braucht ihre Beiträge im Jahr." });
    const p = pruefeGruppen(gruppen);
    expect(p.ok && p.bewertet).toHaveLength(6);
    expect(analysiere(gruppen)).not.toBeNull();
    expect(istUnberuehrt(gruppen, "verein")).toBe(false);
  });

  it("nimmt höchstens zwölf Gruppen und kürzt Namen und Texte auf die Grenzen der Liste", () => {
    const viele = { gruppen: Array.from({ length: 14 }, (_, i) => ({ name: `Gruppe ${i}`, interesse: 3, einfluss: 3, beziehung: "gut" as const, erwartung: "e".repeat(300), bedarf: "b".repeat(300) })) };
    const gruppen = gruppenAusVorschlag(viele as never);
    expect(gruppen).toHaveLength(MAX_GRUPPEN);
    expect(gruppen[0].erwartung).toHaveLength(LIMITS.text);
  });

  it("liest die Angaben aus dem gespeicherten Stand, verwirft Unbekanntes und Doppeltes und kürzt", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      typ: "verein",
      gruppen: [],
      plan: [],
      angaben: { finanzierung: ["spenden", "spenden", "erfunden", 7, "sponsoren"], vorhaben: `a\nb${"x".repeat(300)}`, bekannte: 3 },
    });
    expect(s.angaben.finanzierung).toEqual(["spenden", "sponsoren"]);
    expect(s.angaben.vorhaben).toHaveLength(ANGABEN_LIMITS.vorhaben);
    expect(s.angaben.vorhaben.startsWith("a b")).toBe(true);
    expect(s.angaben.bekannte).toBe("");
    // Stände ohne Angaben (frühere Fassung) und kaputte Angaben ergeben leere Angaben
    expect(parseState({ v: 1, phase: "edit", typ: "kmu", gruppen: [], plan: [] }).angaben).toEqual(EMPTY_ANGABEN);
    expect(parseState({ v: 1, phase: "edit", typ: "kmu", gruppen: [], plan: [], angaben: "x" }).angaben).toEqual(EMPTY_ANGABEN);
  });

  it("schreibt Rechtsform, Ort und Angaben ins CRM, hinter die Gruppen; ohne Angaben bleibt die Eingabe wie vorher", () => {
    const ohne = eingabeText(KONTEXT, FC);
    expect(ohne).not.toContain("Rechtsform:");
    expect(ohne).not.toContain("Finanzierung:");
    const mit = eingabeText(
      { ...KONTEXT, rechtsform: "Verein", ort: "Trogen", angaben: { finanzierung: ["mitglieder", "sponsoren"], vorhaben: "Neues Vereinshaus", bekannte: "Sponsoren, Gemeinde" } },
      FC,
    );
    const zeilen = mit.split("\n");
    expect(zeilen[0]).toBe("Verein: FC Trogen");
    expect(zeilen.indexOf("Rechtsform: Verein")).toBeGreaterThan(zeilen.findIndex((z) => z.startsWith("Mitglieder: Interesse")));
    expect(mit).toContain("Ort: Trogen");
    expect(mit).toContain("Finanzierung: Mitgliederbeiträge, Sponsoren");
    expect(mit).toContain("Vorhaben: Neues Vereinshaus");
    expect(mit).toContain("Bekannte Gruppen: Sponsoren, Gemeinde");
    // Die Zahlen stehen vorn: Die Gruppen kommen vor den Angaben.
    expect(mit.indexOf("Sponsoren: Interesse 4")).toBeLessThan(mit.indexOf("Finanzierung:"));
  });
});
