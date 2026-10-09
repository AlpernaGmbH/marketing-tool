import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import {
  BENCHMARKS,
  CSV_BOM,
  EMPTY_STATE,
  NOTE_VERGLEICHSWERT,
  SAMPLE,
  SAMPLE_KURZ,
  benchmarkFor,
  eingabeText,
  isBlankKurz,
  kurzOf,
  loadBenchmarks,
  modusOf,
  parseState,
  summary,
  toCsv,
  toDocument,
  toInput,
  validate,
  vergleichFor,
  type FormState,
  type KurzForm,
} from "./logic";

// Kurzmodus (Summen über mehrere Beiträge) und Vergleichswert (Socialinsider, Instagram und Facebook), Charge B1.
// Handrechnung für SAMPLE_KURZ: 245 + 30 + 24 + 48 = 347 Interaktionen über 5 Beiträge = 69,4 je Beitrag; bei 1'240 Followern 5,5968 %;
// Reichweite 7'020: 347 ÷ 7'020 = 4,943 %; nur Likes und Kommentare: 275 ÷ 5 = 55 je Beitrag = 4,4355 %.

const kurz = (over: Partial<KurzForm> = {}, form: Partial<FormState> = {}): FormState => ({
  ...SAMPLE_KURZ,
  ...form,
  kurz: { ...(SAMPLE_KURZ.kurz as KurzForm), ...over },
});
const sum = (f: FormState) => {
  const i = toInput(f);
  if (!i) throw new Error(`Formular ungültig: ${validate(f).join(" | ")}`);
  return summary(i);
};

describe("engagement-rate: Vergleichswerte aus data/engagement-benchmarks.json", () => {
  it("Quelle mit Name, Adresse und Datum; Werte nur für Instagram und Facebook", () => {
    expect(BENCHMARKS.meta?.name).toBe("Socialinsider");
    expect(BENCHMARKS.meta?.url).toMatch(/^https:\/\/www\.socialinsider\.io\//);
    expect(BENCHMARKS.meta?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BENCHMARKS.werte.map((w) => w.plattform).sort()).toEqual(["facebook", "instagram"]);
    expect(benchmarkFor("instagram")).toMatchObject({ wert: 0.48, jahr: 2025, formel: "likes_kommentare" });
    expect(benchmarkFor("facebook")).toMatchObject({ wert: 0.15, jahr: 2025, formel: "alle" });
  });

  it("LinkedIn und TikTok haben keinen Vergleichswert: keine Quelle mit passender Formel", () => {
    expect(benchmarkFor("linkedin")).toBeNull();
    expect(benchmarkFor("tiktok")).toBeNull();
  });

  it("kaputte oder unvollständige Daten ergeben keine Werte, nie einen Absturz", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { meta: {}, werte: [] }, { ...BENCHMARKS, werte: [{ plattform: "instagram", formel: "alle", formelText: "kurz", wert: -1, jahr: 2025 }] }]) {
      const b = loadBenchmarks(raw);
      expect(b.werte, JSON.stringify(raw)).toEqual([]);
      expect(benchmarkFor("instagram", b)).toBeNull();
    }
  });

  it("ohne Quelle (meta) gibt es keinen Wert; bei zwei Werten je Plattform gilt der erste", () => {
    const meta = { name: "Quelle", source: "Eine Quelle mit Beschreibung", url: "https://example.org/x", asOf: "2026-10-09" };
    const w = (wert: number) => ({ plattform: "instagram", formel: "alle", formelText: "Alles geteilt durch Follower", wert, jahr: 2025 });
    const b = loadBenchmarks({ meta, werte: [w(1), w(2)] });
    expect(b.werte).toHaveLength(1);
    expect(benchmarkFor("instagram", b)?.wert).toBe(1);
    expect(benchmarkFor("instagram", { meta: null, werte: b.werte })).toBeNull();
  });
});

describe("engagement-rate: Vergleich «Du hast X, üblich ist Y»", () => {
  it("Instagram rechnet nur Likes und Kommentare (so wie die Quelle), nicht Teilen und Gespeichert", () => {
    const s = sum(SAMPLE);
    expect(s.vergleich).toMatchObject({ formel: "likes_kommentare", ueblich: 0.48, jahr: 2025, quelle: "Socialinsider" });
    expect(s.vergleich?.du).toBeCloseTo((55 / 1240) * 100, 6); // 4,4355 %
    expect(s.schnittFollower).toBeCloseTo((69.4 / 1240) * 100, 6); // 5,5968 % mit allen vier Feldern
    expect(s.vergleich?.du).toBeLessThan(s.schnittFollower);
  });

  it("Facebook rechnet alle Felder (Reaktionen, Kommentare, Teilen), gleich wie die Quelle", () => {
    const s = sum({
      plattform: "facebook",
      follower: "2000",
      posts: [
        { name: "", a: "30", b: "10", c: "10", d: "", reichweite: "" },
        { name: "", a: "20", b: "0", c: "0", d: "", reichweite: "" },
        { name: "", a: "10", b: "5", c: "5", d: "", reichweite: "" },
      ],
      modus: "einzeln",
    });
    expect(s.vergleich).toMatchObject({ formel: "alle", ueblich: 0.15 });
    expect(s.vergleich?.du).toBeCloseTo(s.schnittFollower, 9);
    expect(s.schnittFollower).toBeCloseTo((((50 + 20 + 20) / 3) / 2000) * 100, 6); // 1,5 %
  });

  it("LinkedIn und TikTok: kein Vergleich", () => {
    for (const plattform of ["linkedin", "tiktok"] as const) expect(sum({ ...SAMPLE, plattform }).vergleich).toBeNull();
  });

  it("vergleichFor ohne Follower, ohne Beitrag oder ohne Quelle: null", () => {
    const s = sum(SAMPLE);
    expect(vergleichFor("instagram", 0, s.posts, s.schnittFollower)).toBeNull();
    expect(vergleichFor("instagram", 1240, [], 0)).toBeNull();
    expect(vergleichFor("instagram", 1240, s.posts, s.schnittFollower, { meta: null, werte: [] })).toBeNull();
  });

  it("das Dokument zeigt Satz und zwei Balken, nennt die Quelle mit Adresse und wertet nicht", () => {
    const doc = toDocument(sum(SAMPLE), { firma: "Malerei Keller, Gossau" });
    const bars = doc.blocks.find((b) => b.type === "bars");
    if (bars?.type !== "bars") throw new Error("keine Balken");
    expect(bars.items.map((i) => [i.label, i.value])).toEqual([
      ["Deine Beiträge", 4.44],
      ["Durchschnitt internationaler Marken, 2025", 0.48],
    ]);
    const md = toMarkdown(doc);
    expect(md).toContain("Du hast 4,44 % (Likes und Kommentare, geteilt durch Follower, je Beitrag im Schnitt).");
    expect(md).toContain("Der Durchschnitt internationaler Marken lag 2025 bei 0,48 % (Socialinsider, nicht Schweiz).");
    expect(md).toContain(NOTE_VERGLEICHSWERT);
    expect(md).not.toMatch(/überdurchschnittlich|unterdurchschnittlich|schlecht|Branchenschnitt/i);
    expect(brandHits(md)).toEqual([]);
  });
});

describe("engagement-rate: Kurzmodus, Prüfung", () => {
  it("das Beispiel ist gültig und der Stand beginnt im Kurzmodus", () => {
    expect(validate(SAMPLE_KURZ)).toEqual([]);
    expect(modusOf(EMPTY_STATE)).toBe("kurz");
    expect(kurzOf({})).toEqual({ beitraege: "", a: "", b: "", c: "", d: "", reichweite: "" });
  });

  it("Zahl der Beiträge: leer, 0, 1'001, Dezimalzahl und Text werden gemeldet", () => {
    expect(validate(kurz({ beitraege: "" }))).toEqual(["Trage ein, über wie viele Beiträge du die Summen bildest."]);
    for (const v of ["0", "1001", "2.5", "x", "-3"]) expect(validate(kurz({ beitraege: v })), v).toEqual(["Beiträge: Trage eine ganze Zahl von 1 bis 1'000 ein."]);
    expect(validate(kurz({ beitraege: "1" }))).toEqual([]);
    expect(validate(kurz({ beitraege: "1000" }))).toEqual([]);
  });

  it("Summen: Buchstaben, negativ, Dezimalzahl und über einer Milliarde werden mit dem Namen des Feldes gemeldet", () => {
    expect(validate(kurz({ a: "abc" }))).toEqual(["Likes: Trage eine ganze Zahl von 0 bis 1'000'000'000 ein."]);
    expect(validate(kurz({ b: "-1" }))).toEqual(["Kommentare: Trage eine ganze Zahl von 0 bis 1'000'000'000 ein."]);
    expect(validate(kurz({ reichweite: "1000000001" }))).toEqual(["Reichweite: Trage eine ganze Zahl von 0 bis 1'000'000'000 ein."]);
    expect(validate(kurz({ a: "1'200", reichweite: "7 020" }))).toEqual([]);
  });

  it("ohne jede Summe: Meldung mit dem ersten Feld der Plattform; leere Reichweite allein genügt nicht", () => {
    const leer = { a: "", b: "", c: "", d: "", reichweite: "" };
    expect(validate(kurz(leer))).toEqual(["Trage mindestens eine Summe ein, zum Beispiel die Likes."]);
    expect(validate(kurz(leer, { plattform: "linkedin" }))).toEqual(["Trage mindestens eine Summe ein, zum Beispiel die Reaktionen."]);
    expect(isBlankKurz({ ...(SAMPLE_KURZ.kurz as KurzForm), ...leer }, "instagram")).toBe(true);
    expect(isBlankKurz({ ...(SAMPLE_KURZ.kurz as KurzForm), ...leer, reichweite: "5" }, "instagram")).toBe(false);
  });

  it("Felder, die die Plattform nicht anbietet, zählen nicht: Gespeichert auf LinkedIn bleibt 0", () => {
    const s = sum(kurz({ d: "999" }, { plattform: "linkedin" }));
    expect(s.summen?.d).toBe(0);
    expect(s.posts[0].interaktionen).toBeCloseTo((245 + 30 + 24) / 5, 9);
  });

  it("Follower werden auch im Kurzmodus geprüft", () => {
    expect(validate(kurz({}, { follower: "" }))).toEqual(["Trage ein, wie viele Follower du am Tag der Auswertung hast."]);
    expect(validate(kurz({}, { follower: "0" }))[0]).toMatch(/^Follower:/);
  });
});

describe("engagement-rate: Kurzmodus, Rechnung", () => {
  const s = sum(SAMPLE_KURZ);

  it("ein Durchschnittsbeitrag aus den Summen: 347 Interaktionen über 5 Beiträge sind 69,4 je Beitrag", () => {
    expect(s.modus).toBe("kurz");
    expect(s.anzahl).toBe(5);
    expect(s.summen).toEqual({ a: 245, b: 30, c: 24, d: 48, reichweite: 7020 });
    expect(s.posts).toHaveLength(1);
    expect(s.posts[0].name).toBe("Durchschnitt von 5 Beiträgen");
    expect(s.schnittInteraktionen).toBeCloseTo(69.4, 9);
  });

  it("Rate auf Follower wie im Einzelmodus mit denselben fünf Beiträgen; Rate auf Reichweite ist Summe durch Summe", () => {
    const einzeln = sum(SAMPLE);
    expect(s.schnittFollower).toBeCloseTo(einzeln.schnittFollower, 9);
    expect(s.summenRate).toBeCloseTo((347 / 7020) * 100, 9);
    expect(s.summenRate).toBeCloseTo(einzeln.summenRate as number, 9);
    expect(s.vergleich?.du).toBeCloseTo(einzeln.vergleich?.du as number, 9);
  });

  it("kein bester und kein schwächster Beitrag", () => {
    expect(s.best).toBeNull();
    expect(s.worst).toBeNull();
  });

  it("ohne Reichweite rechnet nur die Formel auf Follower", () => {
    const o = sum(kurz({ reichweite: "" }));
    expect(o.summenRate).toBeNull();
    expect(o.hinweise).toContain("Ohne Reichweite rechnet nur die Formel auf Follower.");
  });

  it("Hinweise ohne Nummern einzelner Beiträge: wenige Beiträge, Reichweite zu klein, mehr Interaktionen als Follower, alles 0", () => {
    expect(sum(kurz({ beitraege: "2" })).hinweise.join("|")).toContain("Mit weniger als drei Beiträgen sagt der Schnitt wenig");
    expect(s.hinweise.join("|")).not.toContain("weniger als drei");
    expect(sum(kurz({ reichweite: "100" })).hinweise.join("|")).toContain("Die Interaktionen sind grösser als die Reichweite. Prüfe die Reichweite.");
    expect(sum(kurz({ reichweite: "0" })).hinweise.join("|")).toContain("Die Reichweite ist 0, obwohl es Interaktionen gibt.");
    expect(sum(kurz({}, { follower: "50" })).hinweise.join("|")).toContain("mehr Interaktionen je Beitrag als Follower");
    expect(sum(kurz({ a: "0", b: "0", c: "0", d: "0", reichweite: "" })).hinweise.join("|")).toContain("Die Summen ergeben 0 Interaktionen.");
    for (const h of s.hinweise) expect(h).not.toMatch(/Beitrag \d/);
  });

  it("ein Beitrag: Name im Singular", () => {
    expect(sum(kurz({ beitraege: "1" })).posts[0].name).toBe("Durchschnitt von 1 Beitrag");
  });

  it("alles wird auch bei grossen Summen endlich gerechnet", () => {
    const g = sum(kurz({ beitraege: "1000", a: "1000000000", b: "1000000000", c: "0", d: "0", reichweite: "1000000000" }, { follower: "1" }));
    for (const v of [g.schnittFollower, g.schnittInteraktionen, g.summenRate ?? 0, g.vergleich?.du ?? 0]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("engagement-rate: Kurzmodus, Dokument, CRM-Text, CSV, Stand", () => {
  const s = sum(SAMPLE_KURZ);
  const doc = toDocument(s, { firma: "Malerei Keller, Gossau" });

  it("Dokument: Kopf, Kennzahlen, Tabelle der Summen mit «je Beitrag», Vergleich, Hinweise, keine Beitragsliste", () => {
    const facts = doc.blocks.filter((b) => b.type === "facts");
    expect(facts[0]).toMatchObject({ items: [{ label: "Firma", value: "Malerei Keller, Gossau" }, { label: "Plattform", value: "Instagram" }, { label: "Follower", value: "1'240" }, { label: "Beiträge", value: "5 zusammen ausgewertet" }] });
    expect(facts[1]).toMatchObject({
      items: [
        { label: "Interaktionen je Beitrag", value: "69,4" },
        { label: "Rate auf Follower", value: "5,6 %" },
        { label: "Rate auf Reichweite", value: "4,94 %" },
      ],
    });
    const table = doc.blocks.find((b) => b.type === "table");
    if (table?.type !== "table") throw new Error("keine Tabelle");
    expect(table.header).toEqual(["Zahl", "Summe über 5 Beiträge", "je Beitrag"]);
    expect(table.rows).toEqual([
      ["Likes", "245", "49"],
      ["Kommentare", "30", "6"],
      ["Teilen", "24", "4,8"],
      ["Gespeichert", "48", "9,6"],
      ["Interaktionen insgesamt", "347", "69,4"],
      ["Reichweite", "7'020", "1'404"],
    ]);
    const headings = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Ergebnis", "Zum Vergleich", "So rechnet das Werkzeug", "Hinweise zur Auswertung"]);
    const text = JSON.stringify(doc.blocks);
    expect(text).not.toContain("Bester Beitrag");
    expect(text).toContain("Mit Summen gibt es keinen besten und keinen schwächsten Beitrag.");
    expect(text).toContain("Rate auf Follower = Interaktionen je Beitrag");
  });

  it("Dokument ohne Reichweite und für LinkedIn (ohne Vergleichswert): Hinweis zu Branchenwerten, kein «Zum Vergleich»", () => {
    const li = toDocument(sum(kurz({ reichweite: "" }, { plattform: "linkedin" })));
    const text = JSON.stringify(li.blocks);
    expect(text).toContain("keine Impressionen angegeben");
    expect(text).toContain("Keine Einordnung gegen Branchenwerte");
    expect(text).not.toContain("Zum Vergleich");
  });

  it("Dokument besteht den Ton-Test (keine Wörter der Sperrliste)", () => {
    expect(brandHits(toMarkdown(doc))).toEqual([]);
  });

  it("CRM-Text: eine Zeile mit den Summen und der Zahl der Beiträge", () => {
    const input = toInput(SAMPLE_KURZ);
    expect(input).not.toBeNull();
    expect(eingabeText(input!).split("\n")).toEqual([
      "Plattform: Instagram",
      "Follower: 1'240",
      "Summen über 5 Beiträge: Likes 245, Kommentare 30, Teilen 24, Gespeichert 48, Reichweite 7'020",
    ]);
    const ohne = toInput(kurz({ reichweite: "", beitraege: "1" }));
    expect(eingabeText(ohne!)).toContain("Summen über 1 Beitrag: Likes 245, Kommentare 30, Teilen 24, Gespeichert 48, Reichweite nicht angegeben");
  });

  it("CSV: Kopfzeile wie im Einzelmodus, eine Zeile «Summe über 5 Beiträge» und eine «Durchschnitt je Beitrag»", () => {
    const csv = toCsv(s);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Plattform;Follower;Beitrag;Bezeichnung;Likes;Kommentare;Teilen;Gespeichert;Reichweite;Interaktionen;Rate auf Follower in %;Rate auf Reichweite in %");
    expect(lines[1]).toBe("Instagram;1240;;Summe über 5 Beiträge;245;30;24;48;7020;347;;");
    expect(lines[2]).toBe("Instagram;1240;;Durchschnitt je Beitrag;49;6;4.8;9.6;1404;69.4;5.6;4.94");
  });

  it("Stand: Kurzmodus bleibt erhalten, ein Ergebnis wird neu gerechnet, ein Stand ohne Modus ist «einzeln»", () => {
    const saved = parseState({ v: 1, phase: "result", ...SAMPLE_KURZ });
    expect(saved.phase).toBe("result");
    expect(saved.modus).toBe("kurz");
    expect(saved.kurz).toEqual(SAMPLE_KURZ.kurz);
    expect(saved.output?.modus).toBe("kurz");
    expect(saved.output?.schnittInteraktionen).toBeCloseTo(69.4, 9);

    const alt = parseState({ v: 1, phase: "result", plattform: SAMPLE.plattform, follower: SAMPLE.follower, posts: SAMPLE.posts });
    expect(alt.modus).toBe("einzeln");
    expect(alt.output?.modus).toBe("einzeln");
    expect(alt.output?.posts).toHaveLength(5);

    const kaputt = parseState({ v: 1, plattform: "instagram", follower: "5", posts: [], modus: "quatsch", kurz: 5 });
    expect(kaputt.modus).toBe("einzeln");
    expect(kaputt.kurz).toEqual(kurzOf({}));
  });

  it("ein Kurzstand mit ungültiger Zahl der Beiträge wird beim Lesen zum Entwurf, nicht zum Ergebnis", () => {
    const r = parseState({ v: 1, phase: "result", ...kurz({ beitraege: "0" }) });
    expect(r.phase).toBe("edit");
    expect(r.output).toBeUndefined();
  });
});
