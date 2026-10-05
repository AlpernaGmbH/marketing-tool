import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { styleIssues } from "@/lib/content-rules";
import { toMarkdown } from "@/lib/export/model";
import { isToolDone } from "@/lib/progress";
import {
  CSV_BOM,
  EMPTY_STATE,
  LIMITS,
  MAX_POSTS,
  NOTE_BRANCHE,
  NUTZUNG,
  PLATTFORMEN,
  SAMPLE,
  addPost,
  chartLabel,
  chartSvg,
  csvFilename,
  csvHeader,
  eingabeText,
  emptyPost,
  interactions,
  isBlankPost,
  markedPost,
  niceScale,
  parseCount,
  parseState,
  plattformOf,
  postLabel,
  rateFollower,
  rateReichweite,
  removePost,
  reportMarkdown,
  setPost,
  summary,
  toCsv,
  toDocument,
  toInput,
  validate,
  type FormState,
  type Input,
  type PostForm,
} from "./logic";

const post = (a: number | string, b: number | string, c: number | string, d: number | string, reichweite: number | string = "", name = ""): PostForm => ({
  name,
  a: String(a),
  b: String(b),
  c: String(c),
  d: String(d),
  reichweite: String(reichweite),
});
const form = (over: Partial<FormState> = {}): FormState => ({ plattform: "instagram", follower: "1000", posts: [post(10, 0, 0, 0, 500)], ...over });
/** Eingabe als Zahlen; wirft, wenn das Formular etwas meldet. */
const input = (f: FormState): Input => {
  const i = toInput(f);
  if (!i) throw new Error(`Formular ungültig: ${validate(f).join(" | ")}`);
  return i;
};
const sum = (f: FormState) => summary(input(f));
const SAMPLE_SUMMARY = sum(SAMPLE);

describe("engagement-rate: Formeln mit Handrechnung", () => {
  it("Interaktionen sind die Summe der vier Felder", () => {
    expect(interactions({ a: 62, b: 8, c: 5, d: 11 })).toBe(86);
    expect(interactions({ a: 0, b: 0, c: 0, d: 0 })).toBe(0);
  });

  it("Rate auf Follower: 86 von 1'240 Followern sind 6,935 %, 50 von 1'000 sind 5 %", () => {
    expect(rateFollower(86, 1240)).toBeCloseTo(6.935483, 5);
    expect(rateFollower(50, 1000)).toBe(5);
    expect(rateFollower(0, 1000)).toBe(0);
  });

  it("Rate auf Reichweite: 86 von 1'520 sind 5,658 %; ohne Reichweite oder bei 0 gibt es keine zweite Rate", () => {
    expect(rateReichweite(86, 1520)).toBeCloseTo(5.657894, 5);
    expect(rateReichweite(50, 1000)).toBe(5);
    expect(rateReichweite(10, null)).toBeNull();
    expect(rateReichweite(10, 0)).toBeNull();
  });

  it("Follower 0: keine Rate auf Follower, Formular meldet einen Fehler", () => {
    expect(rateFollower(10, 0)).toBeNull();
    expect(validate(form({ follower: "0" }))).toEqual(["Follower: Trage eine ganze Zahl von 1 bis 100'000'000 ein."]);
    expect(toInput(form({ follower: "0" }))).toBeNull();
  });

  it("Beispiel Malerei Keller: Schnitt 5,5968 % auf Follower, 4,788 % auf Reichweite, Summe durch Summe 4,943 %", () => {
    const s = SAMPLE_SUMMARY;
    expect(s.posts.map((p) => p.interaktionen)).toEqual([86, 50, 123, 38, 50]);
    expect(s.schnittInteraktionen).toBeCloseTo(69.4, 10);
    expect(s.schnittFollower).toBeCloseTo(347 / 62, 10); // 347 Interaktionen, 5 Beiträge, 1'240 Follower
    expect(s.schnittReichweite).toBeCloseTo(4.788019, 5);
    expect(s.summenRate).toBeCloseTo((347 / 7020) * 100, 10);
    expect(s.mitReichweite).toBe(5);
    expect(s.hinweise).toEqual([]);
  });

  it("Schnitt der Raten und Summe durch Summe weichen ab: 5 % bei 1'000 und 15 % bei 200 ergeben 10 % und 6,67 %", () => {
    const s = sum(form({ posts: [post(50, 0, 0, 0, 1000), post(30, 0, 0, 0, 200), post(1, 0, 0, 0, 100)].slice(0, 2) }));
    expect(s.schnittReichweite).toBeCloseTo(10, 10);
    expect(s.summenRate).toBeCloseTo((80 / 1200) * 100, 10);
    expect(s.summenRate).toBeCloseTo(6.6667, 4);
    expect(s.schnittReichweite).not.toBeCloseTo(s.summenRate ?? 0, 1);
  });

  it("auf Follower sind Schnitt der Raten und Summe durch Summe gleich, weil die Followerzahl gleich bleibt", () => {
    const s = SAMPLE_SUMMARY;
    expect(s.schnittFollower).toBeCloseTo((s.posts.reduce((a, p) => a + p.interaktionen, 0) / (s.posts.length * s.follower)) * 100, 10);
  });
});

describe("engagement-rate: fehlende und auffällige Reichweite", () => {
  it("ohne Reichweite entfällt die zweite Formel nur für diesen Beitrag; der Schnitt zählt die übrigen", () => {
    const s = sum(form({ posts: [post(50, 0, 0, 0, 1000), post(40, 0, 0, 0, ""), post(30, 0, 0, 0, 200)] }));
    expect(s.posts[1].rateReichweite).toBeNull();
    expect(s.mitReichweite).toBe(2);
    expect(s.schnittReichweite).toBeCloseTo(10, 10);
    expect(s.summenRate).toBeCloseTo((80 / 1200) * 100, 10);
    expect(s.hinweise.join(" ")).toMatch(/Bei Beitrag 2 fehlt die Reichweite/);
  });

  it("ganz ohne Reichweite: keine Schnitte auf Reichweite, ein Hinweis, kein Fehler", () => {
    const s = sum(form({ posts: [post(10, 1, 0, 0), post(5, 0, 0, 0), post(2, 0, 0, 0)] }));
    expect(s.schnittReichweite).toBeNull();
    expect(s.summenRate).toBeNull();
    expect(s.hinweise).toContain("Ohne Reichweite rechnet nur die Formel auf Follower.");
    expect(s.schnittFollower).toBeGreaterThan(0);
  });

  it("Reichweite 0 mit Interaktionen: keine zweite Rate und der Hinweis «Prüfe die Reichweite»", () => {
    const s = sum(form({ posts: [post(10, 0, 0, 0, 0), post(5, 0, 0, 0, 100), post(5, 0, 0, 0, 100)] }));
    expect(s.posts[0].rateReichweite).toBeNull();
    expect(s.hinweise.join(" ")).toMatch(/Bei Beitrag 1 ist die Reichweite 0, obwohl es Interaktionen gibt\. Prüfe die Reichweite\./);
    expect(s.mitReichweite).toBe(2);
  });

  it("Interaktionen über der Reichweite (Rate über 100 %) sind ein Hinweis, kein Fehler", () => {
    const f = form({ posts: [post(60, 50, 0, 0, 100), post(5, 0, 0, 0, 100), post(5, 0, 0, 0, 100)] });
    expect(validate(f)).toEqual([]);
    const s = sum(f);
    expect(s.posts[0].rateReichweite).toBeCloseTo(110, 10);
    expect(s.hinweise.join(" ")).toMatch(/Bei Beitrag 1 sind die Interaktionen grösser als die Reichweite\. Prüfe die Reichweite\./);
  });

  it("genau 100 % auf Reichweite löst keinen Hinweis aus", () => {
    const s = sum(form({ posts: [post(100, 0, 0, 0, 100), post(5, 0, 0, 0, 100), post(5, 0, 0, 0, 100)] }));
    expect(s.hinweise.join(" ")).not.toMatch(/Prüfe die Reichweite/);
  });

  it("mehr Interaktionen als Follower: Hinweis, aber ein gültiges Ergebnis", () => {
    const s = sum(form({ follower: "100", posts: [post(150, 0, 0, 0, 5000), post(5, 0, 0, 0, 100), post(5, 0, 0, 0, 100)] }));
    expect(s.hinweise.join(" ")).toMatch(/Bei Beitrag 1 gibt es mehr Interaktionen als Follower/);
    expect(s.posts[0].rateFollower).toBe(150);
  });
});

describe("engagement-rate: Anzahl der Beiträge", () => {
  it("ein Beitrag: bester und schwächster sind derselbe, der Schnitt sagt wenig", () => {
    const s = sum(form());
    expect(s.best?.post.nr).toBe(1);
    expect(s.worst?.post.nr).toBe(1);
    expect(s.hinweise.join(" ")).toContain("Mit weniger als drei Beiträgen sagt der Schnitt wenig");
    const text = JSON.stringify(toDocument(s).blocks);
    expect(text).toContain("Mit einem Beitrag gibt es nichts zu vergleichen");
    expect(text).not.toContain("Bester Beitrag:");
  });

  it("zwei Beiträge: derselbe Hinweis; ab drei entfällt er", () => {
    const two = sum(form({ posts: [post(10, 0, 0, 0), post(20, 0, 0, 0)] }));
    const three = sum(form({ posts: [post(10, 0, 0, 0), post(20, 0, 0, 0), post(30, 0, 0, 0)] }));
    expect(two.hinweise.join(" ")).toContain("weniger als drei Beiträgen");
    expect(three.hinweise.join(" ")).not.toContain("weniger als drei Beiträgen");
  });

  it("zehn Beiträge sind erlaubt, der elfte wird abgelehnt", () => {
    const ten = form({ posts: Array.from({ length: 10 }, (_, i) => post(i + 1, 0, 0, 0)) });
    expect(validate(ten)).toEqual([]);
    expect(sum(ten).posts).toHaveLength(10);
    const eleven = form({ posts: Array.from({ length: 11 }, (_, i) => post(i + 1, 0, 0, 0)) });
    expect(validate(eleven)).toContain(`Du kannst höchstens ${MAX_POSTS} Beiträge auswerten.`);
    expect(toInput(eleven)).toBeNull();
  });

  it("addPost hört bei zehn auf, removePost lässt mindestens einen stehen, setPost ändert nur eine Zeile", () => {
    let posts: PostForm[] = [emptyPost()];
    for (let i = 0; i < 15; i++) posts = addPost(posts);
    expect(posts).toHaveLength(MAX_POSTS);
    expect(addPost(posts)).toBe(posts);
    expect(removePost([emptyPost()], 0)).toHaveLength(1);
    expect(removePost(posts, 3)).toHaveLength(9);
    expect(removePost(posts, 99)).toBe(posts);
    const changed = setPost(posts, 2, { a: "7" });
    expect(changed[2].a).toBe("7");
    expect(changed[1]).toBe(posts[1]);
    expect(posts[2].a).toBe("");
  });

  it("Zeilen ohne Zahlen zählen nicht mit, die Nummern bleiben wie im Formular", () => {
    const f = form({ posts: [post(10, 0, 0, 0, 100, "Erster"), emptyPost(), { ...emptyPost(), name: "Nur ein Name" }, post(30, 0, 0, 0, 100, "Vierter")] });
    expect(isBlankPost(f.posts[1], "instagram")).toBe(true);
    expect(isBlankPost(f.posts[2], "instagram")).toBe(true);
    expect(isBlankPost(f.posts[3], "instagram")).toBe(false);
    const s = sum(f);
    expect(s.posts.map((p) => p.nr)).toEqual([1, 4]);
    expect(postLabel(s.posts[1])).toBe("Beitrag 4: Vierter");
    expect(postLabel({ nr: 2, name: "" })).toBe("Beitrag 2");
  });

  it("die Startzeilen ohne Zahlen ergeben einen Fehler, kein Ergebnis", () => {
    expect(validate(EMPTY_STATE)).toEqual(["Trage ein, wie viele Follower du am Tag der Auswertung hast.", "Trage für mindestens einen Beitrag Zahlen ein."]);
    expect(EMPTY_STATE.posts).toHaveLength(LIMITS.beitraege.start);
  });
});

describe("engagement-rate: bester und schwächster Beitrag", () => {
  it("Beispiel: Beitrag 3 ist der beste, Beitrag 4 der schwächste, mit Abstand zum Schnitt", () => {
    const { best, worst } = SAMPLE_SUMMARY;
    expect(best?.post.nr).toBe(3);
    expect(worst?.post.nr).toBe(4);
    expect(best?.punkte).toBeCloseTo(4.32258, 4); // 9,919 minus 5,597
    expect(best?.prozent).toBeCloseTo(77.2334, 3);
    expect(worst?.punkte).toBeCloseTo(-2.53226, 4);
    expect(worst?.prozent).toBeCloseTo(-45.245, 3);
  });

  it("bei Gleichstand gilt der erste Beitrag, auch wenn alle gleich liegen", () => {
    const tie = sum(form({ posts: [post(10, 0, 0, 0), post(30, 0, 0, 0), post(30, 0, 0, 0), post(10, 0, 0, 0)] }));
    expect(tie.best?.post.nr).toBe(2);
    expect(tie.worst?.post.nr).toBe(1);
    const all = sum(form({ posts: [post(10, 0, 0, 0), post(10, 0, 0, 0), post(10, 0, 0, 0)] }));
    expect(all.best?.post.nr).toBe(1);
    expect(all.worst?.post.nr).toBe(1);
    expect(all.best?.punkte).toBeCloseTo(0, 10);
    expect(JSON.stringify(toDocument(all).blocks)).toContain("Alle Beiträge liegen gleich auf");
  });

  it("ohne Interaktionen: Hinweis, alle Raten 0, kein Abstand in Prozent, keine NaN", () => {
    const s = sum(form({ posts: [post(0, 0, 0, 0, 100), post(0, 0, 0, 0, 100), post(0, 0, 0, 0, 100)] }));
    expect(s.hinweise.join(" ")).toMatch(/Alle Beiträge haben 0 Interaktionen/);
    expect(s.schnittFollower).toBe(0);
    expect(s.best?.prozent).toBeNull();
    expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity|null,"punkte"/);
    expect(JSON.stringify(toDocument(s))).not.toMatch(/NaN|Infinity/);
  });
});

describe("engagement-rate: Plattformen", () => {
  it("jede der vier Plattformen bildet auf vier Interaktionen und eine Reichweite ab", () => {
    expect(PLATTFORMEN.map((p) => p.key)).toEqual(["instagram", "linkedin", "facebook", "tiktok"]);
    expect(plattformOf("instagram").felder.map((f) => f.label)).toEqual(["Likes", "Kommentare", "Teilen", "Gespeichert"]);
    expect(plattformOf("instagram").reichweiteLabel).toBe("Reichweite");
    expect(plattformOf("linkedin").felder.map((f) => f.label)).toEqual(["Reaktionen", "Kommentare", "Reposts"]);
    expect(plattformOf("linkedin").reichweiteLabel).toBe("Impressionen");
    expect(plattformOf("facebook").felder.map((f) => f.label)).toEqual(["Reaktionen", "Kommentare", "Teilen"]);
    expect(plattformOf("facebook").reichweiteLabel).toBe("Reichweite");
    expect(plattformOf("tiktok").felder.map((f) => f.label)).toEqual(["Likes", "Kommentare", "Teilen", "Gespeichert"]);
    expect(plattformOf("tiktok").reichweiteLabel).toBe("Aufrufe");
    expect(plattformOf("unbekannt").key).toBe("instagram");
  });

  it("LinkedIn und Facebook haben kein viertes Feld: ein alter Wert in d zählt nicht", () => {
    for (const plattform of ["linkedin", "facebook"] as const) {
      const i = input(form({ plattform, posts: [post(10, 5, 5, 99, 500)] }));
      expect(i.posts[0].d).toBe(0);
      expect(summary(i).posts[0].interaktionen).toBe(20);
    }
    expect(summary(input(form({ plattform: "tiktok", posts: [post(10, 5, 5, 99, 500)] }))).posts[0].interaktionen).toBe(119);
    expect(isBlankPost({ ...emptyPost(), d: "5" }, "linkedin")).toBe(true);
    expect(isBlankPost({ ...emptyPost(), d: "5" }, "instagram")).toBe(false);
  });

  it("jede Plattform hat einen Satz zum Fundort mit gesicherten Menünamen und LinkedIn und TikTok einen Hinweis zur Reichweite", () => {
    expect(plattformOf("instagram").fundort).toContain("«Insights»");
    expect(plattformOf("facebook").fundort).toContain("«Insights»");
    expect(plattformOf("linkedin").fundort).toContain("«Beitragsanalysen»");
    expect(plattformOf("tiktok").fundort).toContain("«Analysen»");
    for (const p of PLATTFORMEN) expect(p.fundort.endsWith(".")).toBe(true);
    expect(plattformOf("linkedin").reichweiteHinweis).toContain("Impressionen");
    expect(plattformOf("tiktok").reichweiteHinweis).toContain("Aufrufe");
    expect(plattformOf("instagram").reichweiteHinweis).toBeUndefined();
  });
});

describe("engagement-rate: Prüfung der Eingaben", () => {
  it("parseCount: ganze Zahlen ab 0, leer ist null, alles andere NaN", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("  ")).toBeNull();
    expect(parseCount("0")).toBe(0);
    expect(parseCount("1240")).toBe(1240);
    expect(parseCount("1'240")).toBe(1240);
    expect(parseCount(" 12 ")).toBe(12);
    for (const bad of ["-1", "1.5", "1,5", "abc", "1e3", "+4"]) expect(parseCount(bad)).toBeNaN();
  });

  it("Follower: Pflicht, ganze Zahl von 1 bis 100'000'000", () => {
    expect(validate(form({ follower: "" }))[0]).toMatch(/Trage ein, wie viele Follower/);
    for (const bad of ["abc", "-5", "1.5", "100000001"]) expect(validate(form({ follower: bad }))[0]).toMatch(/^Follower: Trage eine ganze Zahl von 1 bis 100'000'000 ein\.$/);
    expect(validate(form({ follower: "1" }))).toEqual([]);
    expect(validate(form({ follower: "100000000" }))).toEqual([]);
  });

  it("Zahlen eines Beitrags: Fehler nennt Beitrag und Feld; leer zählt als 0", () => {
    expect(validate(form({ posts: [post("x", 0, 0, 0)] }))).toEqual(["Beitrag 1, Likes: Trage eine ganze Zahl von 0 bis 1'000'000'000 ein."]);
    expect(validate(form({ posts: [post(1, 0, 0, 0), post(1, "-3", 0, 0)] }))).toEqual(["Beitrag 2, Kommentare: Trage eine ganze Zahl von 0 bis 1'000'000'000 ein."]);
    expect(validate(form({ posts: [post(1, 0, 0, 0, "1.5")] }))[0]).toMatch(/^Beitrag 1, Reichweite:/);
    expect(validate(form({ plattform: "linkedin", posts: [post(1, 0, 0, 0, "x")] }))[0]).toMatch(/^Beitrag 1, Impressionen:/);
    expect(validate(form({ posts: [post(1_000_000_001, 0, 0, 0)] }))).toHaveLength(1);
    const leer = input(form({ posts: [post(5, "", "", "", "")] }));
    expect(leer.posts[0]).toMatchObject({ a: 5, b: 0, c: 0, d: 0, reichweite: null });
  });

  it("Bezeichnung: bis 60 Zeichen", () => {
    expect(validate(form({ posts: [post(1, 0, 0, 0, "", "x".repeat(60))] }))).toEqual([]);
    expect(validate(form({ posts: [post(1, 0, 0, 0, "", "x".repeat(61))] }))).toEqual(["Beitrag 1: Die Bezeichnung darf höchstens 60 Zeichen lang sein."]);
  });

  it("summary rechnet auch mit leeren Beiträgen und ohne Follower ohne NaN", () => {
    const leer = summary({ plattform: "instagram", follower: 0, posts: [] });
    expect(leer.best).toBeNull();
    expect(leer.schnittFollower).toBe(0);
    expect(JSON.stringify(leer)).not.toMatch(/NaN|Infinity/);
    const ohneFollower = summary({ plattform: "instagram", follower: 0, posts: [{ nr: 1, name: "", a: 5, b: 0, c: 0, d: 0, reichweite: 10 }] });
    expect(ohneFollower.posts[0].rateFollower).toBe(0);
    expect(ohneFollower.hinweise).toContain("Ohne Follower lässt sich keine Rate auf Follower rechnen.");
    expect(chartSvg(leer)).toContain("Kein Diagramm");
  });
});

describe("engagement-rate: Balkendiagramm (SVG)", () => {
  const svg = chartSvg(SAMPLE_SUMMARY);
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  it("ein Balken je Beitrag, eine gestrichelte Schnittlinie, role=img und aria-label", () => {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain(`aria-label="${chartLabel(SAMPLE_SUMMARY)}"`);
    expect(count(svg, /<rect data-nr="/g)).toBe(5);
    expect(count(svg, /<line data-schnitt="1"[^>]*stroke-dasharray="6 4"/g)).toBe(1);
    expect(svg).toContain(">Schnitt 5,6 %<");
    expect(chartLabel(SAMPLE_SUMMARY)).toMatch(/^Balkendiagramm der Rate auf Follower je Beitrag auf Instagram\. Schnitt 5,6 %\. Beitrag 1: 6,94 %,/);
    const ten = chartSvg(sum(form({ posts: Array.from({ length: 10 }, (_, i) => post(i + 1, 0, 0, 0)) })));
    expect(count(ten, /<rect data-nr="/g)).toBe(10);
  });

  it("Gold nur für eine Markierung: der beste Beitrag, mit Rand in Ink; bei einem Beitrag oder Gleichstand gar nicht", () => {
    expect(count(svg, /<rect data-nr="\d+"[^>]*var\(--yellow/g)).toBe(1);
    expect(svg).toMatch(/<rect data-nr="3"[^>]*style="fill:var\(--yellow,#ffd700\)" stroke="currentColor"/);
    expect(svg).toContain("Bester Beitrag");
    expect(chartSvg(sum(form()))).not.toContain("--yellow");
    const gleich = chartSvg(sum(form({ posts: [post(10, 0, 0, 0), post(10, 0, 0, 0), post(10, 0, 0, 0)] })));
    expect(gleich).not.toContain("--yellow");
    expect(svg).not.toMatch(/gradient|filter|shadow/i);
  });

  it("markedPost: nur der beste Beitrag, und nur wenn es etwas zu vergleichen gibt", () => {
    expect(markedPost(SAMPLE_SUMMARY)).toBe(3);
    expect(markedPost(sum(form()))).toBeNull();
    expect(markedPost(sum(form({ posts: [post(10, 0, 0, 0), post(10, 0, 0, 0)] })))).toBeNull();
    expect(markedPost(summary({ plattform: "instagram", follower: 10, posts: [] }))).toBeNull();
  });

  it("keine NaN oder Unendlich bei Nullwerten, bei Follower 0 und bei sehr grossen Zahlen", () => {
    const nullen = chartSvg(sum(form({ posts: [post(0, 0, 0, 0), post(0, 0, 0, 0), post(0, 0, 0, 0)] })));
    expect(nullen).not.toMatch(/NaN|Infinity|undefined/);
    expect(count(nullen, /<rect data-nr="/g)).toBe(3);
    const ohneFollower = chartSvg(summary({ plattform: "instagram", follower: 0, posts: [{ nr: 1, name: "", a: 5, b: 0, c: 0, d: 0, reichweite: null }] }));
    expect(ohneFollower).not.toMatch(/NaN|Infinity|undefined/);
    const gross = chartSvg(sum(form({ follower: "1", posts: [post(999_999_999, 0, 0, 0), post(1, 0, 0, 0), post(1, 0, 0, 0)] })));
    expect(gross).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("enthält keine Bezeichnungen der Beiträge, nur Nummern und Zahlen; Zeichen werden maskiert", () => {
    const s = sum(form({ posts: [post(10, 0, 0, 0, "", '<script>alert("x")</script> & Co')] }));
    const out = chartSvg(s);
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(chartLabel({ ...s, plattform: "instagram" })).not.toContain("<");
  });

  it("niceScale wählt runde Teilstriche über dem höchsten Wert", () => {
    expect(niceScale(9.92)).toEqual({ step: 2.5, top: 10 });
    expect(niceScale(5.6)).toEqual({ step: 2, top: 6 });
    expect(niceScale(0.4)).toEqual({ step: 0.1, top: 0.4 });
    expect(niceScale(100)).toEqual({ step: 25, top: 100 });
    expect(niceScale(0)).toEqual({ step: 1, top: 1 });
    expect(niceScale(Number.NaN)).toEqual({ step: 1, top: 1 });
    for (const m of [0.03, 1, 3.3, 7.77, 12, 48, 150, 2300]) expect(niceScale(m).top).toBeGreaterThanOrEqual(m);
  });
});

describe("engagement-rate: CSV", () => {
  const csv = toCsv(SAMPLE_SUMMARY);
  const lines = csv.slice(1).split("\r\n");

  it("UTF-8 mit BOM, Semikolon, CRLF, eine Zeile je Beitrag plus Schnitt und Summe durch Summe", () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(lines[0]).toBe(csvHeader("instagram").join(";"));
    expect(lines[0]).toBe("Plattform;Follower;Beitrag;Bezeichnung;Likes;Kommentare;Teilen;Gespeichert;Reichweite;Interaktionen;Rate auf Follower in %;Rate auf Reichweite in %");
    expect(lines).toHaveLength(1 + 5 + 2 + 1); // Kopf, fünf Beiträge, Schnitt, Summe, leere Zeile nach dem letzten CRLF
    const widths = new Set(lines.filter(Boolean).map((l) => l.split(";").length));
    expect([...widths]).toEqual([12]);
  });

  it("Dezimalpunkt, keine Tausendertrennzeichen, keine Prozentzeichen in den Zahlen", () => {
    expect(lines[1]).toBe("Instagram;1240;1;Fassade Gossau;62;8;5;11;1520;86;6.94;5.66");
    expect(lines[6]).toBe("Instagram;1240;;Schnitt der Raten;;;;;;69.4;5.6;4.79");
    expect(lines[7]).toBe("Instagram;1240;;Summe durch Summe;;;;;7020;347;;4.94");
    expect(csv).not.toMatch(/\d'\d/);
    expect(csv).not.toMatch(/\d %/);
  });

  it("LinkedIn hat eine Spalte weniger; Beiträge ohne Reichweite lassen die Zelle leer", () => {
    const li = toCsv(sum(form({ plattform: "linkedin", posts: [post(10, 5, 5, 0, ""), post(4, 1, 1, 0, 200), post(4, 1, 1, 0, 100)] })));
    const rows = li.slice(1).split("\r\n");
    expect(rows[0].split(";")).toHaveLength(11);
    expect(rows[0]).toContain("Impressionen");
    expect(rows[1].split(";")[7]).toBe(""); // Reichweite fehlt
    expect(rows[1].endsWith(";20;2;")).toBe(true);
  });

  it("Zellen mit Semikolon oder Anführungszeichen werden eingefasst, Formeln bekommen ein Hochkomma", () => {
    const s = sum(form({ posts: [post(1, 0, 0, 0, "", 'Sommer; "Fest"'), post(1, 0, 0, 0, "", "=SUMME(A1)"), post(1, 0, 0, 0, "", "@Name")] }));
    const out = toCsv(s);
    expect(out).toContain('"Sommer; ""Fest"""');
    expect(out).toContain(";'=SUMME(A1);");
    expect(out).toContain(";'@Name;");
  });

  it("Dateiname mit Plattform oder Firma", () => {
    expect(csvFilename("instagram")).toBe("engagement-rate-instagram.csv");
    expect(csvFilename("tiktok", "Malerei Keller, Gossau")).toBe("engagement-rate-malerei-keller-gossau.csv");
  });
});

describe("engagement-rate: Dokument", () => {
  const doc = toDocument(SAMPLE_SUMMARY, { firma: "Malerei Keller, Gossau" });
  const table = doc.blocks.find((b) => b.type === "table");

  it("Kopf mit Firma, Plattform und Follower; Titel, Datei und Firma für den Export", () => {
    expect(doc.blocks[0]).toEqual({
      type: "facts",
      items: [
        { label: "Firma", value: "Malerei Keller, Gossau" },
        { label: "Plattform", value: "Instagram" },
        { label: "Follower", value: "1'240" },
        { label: "Beiträge", value: "5 ausgewertet" },
      ],
    });
    expect(doc.title).toBe("Engagement-Rate");
    expect(doc.subtitle).toBe("Instagram, 1'240 Follower");
    expect(doc.firma).toBe("Malerei Keller, Gossau");
    expect(doc.filename).toBe("engagement-rate-malerei-keller-gossau");
  });

  it("Vereine zeigen «Verein», auch ohne Namen", () => {
    const verein = toDocument(SAMPLE_SUMMARY, { verein: true });
    expect(verein.firma).toBe("Verein");
    const kopf = (d: typeof verein) => (d.blocks[0].type === "facts" ? d.blocks[0].items[0] : null);
    expect(kopf(verein)).toEqual({ label: "Verein", value: "nicht angegeben" });
    expect(verein.filename).toBe("engagement-rate-instagram");
    expect(kopf(toDocument(SAMPLE_SUMMARY, { verein: true, firma: "FC Trogen" }))).toEqual({ label: "Verein", value: "FC Trogen" });
    expect(toDocument(SAMPLE_SUMMARY).firma).toBeUndefined();
  });

  it("Tabelle Beitrag | Interaktionen | Rate auf Follower | Rate auf Reichweite mit Zeile Schnitt", () => {
    expect(table).toMatchObject({
      type: "table",
      header: ["Beitrag", "Interaktionen", "Rate auf Follower", "Rate auf Reichweite"],
    });
    if (table?.type !== "table") throw new Error("keine Tabelle");
    expect(table.rows).toHaveLength(6);
    expect(table.rows[0]).toEqual(["Beitrag 1: Fassade Gossau", "86", "6,94 %", "5,66 %"]);
    expect(table.rows[2]).toEqual(["Beitrag 3: Vorher nachher Treppenhaus", "123", "9,92 %", "5,32 %"]);
    expect(table.rows[5]).toEqual(["Schnitt", "69,4", "5,6 %", "4,79 %"]);
  });

  it("Kennzahlen, Summe durch Summe, bester und schwächster Beitrag in Worten", () => {
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain("Summe durch Summe: 347 Interaktionen bei 7'020 Reichweite ergeben 4,94 %");
    expect(text).toContain("Bester Beitrag: Beitrag 3: Vorher nachher Treppenhaus mit 9,92 % auf Follower (123 Interaktionen). Er liegt 4,32 Prozentpunkte über deinem Schnitt, das sind 77 % mehr.");
    expect(text).toContain("Schwächster Beitrag: Beitrag 4: Farbtrends Herbst mit 3,06 % auf Follower (38 Interaktionen). Er liegt 2,53 Prozentpunkte unter deinem Schnitt, das sind 45 % weniger.");
    expect(doc.blocks[2]).toEqual({
      type: "facts",
      items: [
        { label: "Interaktionen je Beitrag", value: "69,4" },
        { label: "Schnitt auf Follower", value: "5,6 %" },
        { label: "Schnitt auf Reichweite", value: "4,79 %" },
        { label: "Summe durch Summe", value: "4,94 %" },
      ],
    });
  });

  it("erklärt beide Formeln und nennt die Abweichung", () => {
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain("Rate auf Follower = Interaktionen geteilt durch Follower, mal 100.");
    expect(text).toContain("Rate auf Reichweite = Interaktionen geteilt durch Reichweite, mal 100.");
    expect(text).toContain("Deshalb können die beiden Zahlen abweichen.");
    expect(text).toContain("Als Interaktion zählen auf Instagram: Likes, Kommentare, Teilen und Gespeichert, zusammengezählt.");
    const tiktok = JSON.stringify(toDocument(sum(form({ plattform: "tiktok", posts: [post(1, 1, 1, 1, 100), post(1, 1, 1, 1, 100), post(1, 1, 1, 1, 100)] }))).blocks);
    expect(tiktok).toContain("Rate auf Aufrufe = Interaktionen geteilt durch Aufrufe");
    expect(tiktok).toContain("«Aufrufe» zählen, wie oft das Video angesehen wurde");
  });

  it("keine Einordnung gegen Branchenwerte: der Hinweis steht da, Wertungen gegenüber dem Markt nicht", () => {
    const text = JSON.stringify(doc.blocks);
    expect(text).toContain(NOTE_BRANCHE);
    expect(NOTE_BRANCHE).toBe("Keine Einordnung gegen Branchenwerte, weil uns eine belastbare Quelle fehlt.");
    expect(text).not.toMatch(/überdurchschnittlich|unterdurchschnittlich|schlecht|Branchenschnitt|Benchmark/i);
    expect(text).toContain("Verglichen werden nur deine Beiträge untereinander.");
  });

  it("drei Hinweise zur Nutzung, der Richtwert ist so benannt", () => {
    expect(NUTZUNG).toHaveLength(3);
    const last = doc.blocks[doc.blocks.length - 1];
    expect(last).toEqual({ type: "list", items: [NOTE_BRANCHE, ...NUTZUNG] });
    expect(NUTZUNG[0]).toMatch(/^Vergleiche gleiche Zeiträume/);
    expect(NUTZUNG[1]).toMatch(/^Zähle nur eigene Beiträge ohne bezahlte Reichweite/);
    expect(NUTZUNG[2]).toContain("mindestens fünf Beiträge");
    expect(NUTZUNG[2]).toContain("Richtwert von Alperna, keine Statistik");
  });

  it("Hinweise der Prüfung erscheinen vor dem Vergleich; ohne Auffälligkeit gibt es die Überschrift nicht", () => {
    expect(JSON.stringify(doc.blocks)).not.toContain("Hinweise zu deinen Zahlen");
    const eng = toDocument(sum(form()));
    const headings = eng.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(headings).toEqual(["Ergebnis", "Hinweise zu deinen Zahlen", "Vergleich deiner Beiträge", "So rechnet das Werkzeug", "Hinweise zur Auswertung"]);
  });

  it("Formatierung: 81 Interaktionen bei 1'000 Followern sind 8,1 %", () => {
    const s = sum(form({ posts: [post(80, 1, 0, 0, 900), post(40, 0, 0, 0, 900), post(20, 0, 0, 0, 900)] }));
    const t = toDocument(s).blocks.find((b) => b.type === "table");
    if (t?.type !== "table") throw new Error("keine Tabelle");
    expect(t.rows[0].slice(1)).toEqual(["81", "8,1 %", "9 %"]);
    expect(reportMarkdown(s)).toContain("| Beitrag 1 | 81 | 8,1 % | 9 % |");
  });

  it("ohne Reichweite steht in der Tabelle ein Strich und in den Kennzahlen ein Satz", () => {
    const s = sum(form({ posts: [post(10, 0, 0, 0), post(5, 0, 0, 0), post(2, 0, 0, 0)] }));
    const d = toDocument(s);
    const t = d.blocks.find((b) => b.type === "table");
    if (t?.type !== "table") throw new Error("keine Tabelle");
    expect(t.rows[0][3]).toBe("–");
    expect(t.rows[3][3]).toBe("–");
    expect(JSON.stringify(d.blocks)).toContain("keine Reichweite angegeben");
    expect(JSON.stringify(d.blocks)).not.toMatch(/Summe durch Summe: \d/);
  });

  it("Markdown: Kopf, Kennzahlen und Tabelle stehen innerhalb der ersten 1'900 Zeichen, auch bei zehn Beiträgen", () => {
    const zehn = sum(form({ posts: Array.from({ length: 10 }, (_, i) => post(10 + i, 3, 1, 0, 800 + i * 10, `Beitrag-Name ${i + 1}`)) }));
    const md = reportMarkdown(zehn, { firma: "Malerei Keller, Gossau" });
    expect(md.startsWith("# Engagement-Rate\n")).toBe(true);
    expect(md).toContain("- **Plattform:** Instagram");
    const end = md.indexOf("| Schnitt |");
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThan(1900);
  });
});

describe("engagement-rate: Eingabetext fürs CRM", () => {
  it("Plattform, Follower und je Beitrag eine Zeile mit den Zahlen", () => {
    const text = eingabeText(input(SAMPLE));
    const lines = text.split("\n");
    expect(lines[0]).toBe("Plattform: Instagram");
    expect(lines[1]).toBe("Follower: 1'240");
    expect(lines[2]).toBe("Beitrag 1 «Fassade Gossau»: Likes 62, Kommentare 8, Teilen 5, Gespeichert 11, Reichweite 1'520");
    expect(lines).toHaveLength(2 + 5);
    expect(text).not.toMatch(/[{}\[\]]/);
  });

  it("ohne Bezeichnung, ohne Reichweite und mit den Feldern der Plattform", () => {
    const text = eingabeText(input(form({ plattform: "linkedin", follower: "2500", posts: [post(10, 2, 1, 99, "")] })));
    expect(text).toBe("Plattform: LinkedIn\nFollower: 2'500\nBeitrag 1: Reaktionen 10, Kommentare 2, Reposts 1, Impressionen nicht angegeben");
  });
});

describe("engagement-rate: gespeicherter Stand", () => {
  it("kaputte Daten ergeben den leeren Stand", () => {
    for (const bad of [null, undefined, "x", 5, [], {}, { v: 2 }, { v: 1, phase: "result" }]) {
      const s = parseState(bad);
      if (bad !== null && typeof bad === "object" && !Array.isArray(bad) && (bad as { v?: unknown }).v === 1) {
        expect(s.phase).toBe("edit");
        expect(s.plattform).toBe("instagram");
        expect(s.posts).toHaveLength(3);
      } else {
        expect(s).toBe(EMPTY_STATE);
      }
      expect(s.output).toBeUndefined();
    }
  });

  it("unbekannte Plattform, Beiträge als Text, Zahlen als Typ number und zu lange Felder werden bereinigt", () => {
    expect(parseState({ v: 1, phase: "edit", plattform: "myspace", follower: 1240, posts: "nope" })).toMatchObject({ plattform: "instagram", follower: "1240", phase: "edit" });
    const s = parseState({ v: 1, phase: "edit", plattform: "tiktok", follower: "1".repeat(50), posts: [{ name: "x".repeat(200), a: 5, b: { x: 1 }, c: null }, 7, null] });
    expect(s.plattform).toBe("tiktok");
    expect(s.follower).toHaveLength(12);
    expect(s.posts).toHaveLength(3);
    expect(s.posts[0]).toMatchObject({ a: "5", b: "", c: "" });
    expect(s.posts[0].name).toHaveLength(LIMITS.name);
    expect(s.posts[1]).toEqual(emptyPost());
  });

  it("ein Ergebnis mit stimmenden Angaben wird neu gerechnet und zählt im Pfad als erledigt", () => {
    const stored = { v: 1, phase: "result", ...SAMPLE, output: { kaputt: true } };
    const s = parseState(stored);
    expect(s.phase).toBe("result");
    expect(s.output?.schnittFollower).toBeCloseTo(5.5968, 3);
    expect(s.output?.posts).toHaveLength(5);
    expect(isToolDone(JSON.stringify(s))).toBe(true);
  });

  it("ein Ergebnis mit unstimmigen Angaben fällt auf «edit» zurück und zählt nicht als erledigt", () => {
    const s = parseState({ v: 1, phase: "result", ...SAMPLE, follower: "" });
    expect(s.phase).toBe("edit");
    expect(s.output).toBeUndefined();
    expect(isToolDone(JSON.stringify(s))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });

  it("mehr als zehn gespeicherte Beiträge werden auf zehn gekürzt", () => {
    const s = parseState({ v: 1, phase: "edit", plattform: "instagram", follower: "100", posts: Array.from({ length: 14 }, () => ({ a: "1" })) });
    expect(s.posts).toHaveLength(MAX_POSTS);
  });

  it("Beispiel: gültig, bester und schwächster wie dokumentiert", () => {
    expect(validate(SAMPLE)).toEqual([]);
    expect(SAMPLE.posts).toHaveLength(5);
  });
});

describe("engagement-rate: Ton und Sperrliste", () => {
  it("Dokumente, Hinweise und Texte der Plattformen verstossen gegen keine Regel aus CLAUDE.md und lib/brand-rules.ts", () => {
    const texts: string[] = [];
    for (const p of PLATTFORMEN) {
      texts.push(p.fundort, p.reichweiteHinweis ?? "");
      // Beiträge, die alle Hinweise auslösen: über 100 %, Reichweite 0, fehlende Reichweite, mehr Interaktionen als Follower
      const f = form({
        plattform: p.key,
        follower: "50",
        posts: [post(80, 30, 10, 5, 100, "Eins"), post(9, 0, 0, 0, 0, "Zwei"), post(1, 0, 0, 0, "", "Drei")],
      });
      texts.push(reportMarkdown(sum(f), { firma: "Malerei Keller, Gossau" }), reportMarkdown(sum(f), { verein: true }));
      texts.push(reportMarkdown(sum(form({ plattform: p.key, posts: [post(0, 0, 0, 0)] }))));
    }
    texts.push(reportMarkdown(SAMPLE_SUMMARY), NOTE_BRANCHE, ...NUTZUNG);
    const all = texts.join("\n");
    expect(brandHits(all)).toEqual([]);
    expect(styleIssues(all)).toEqual([]);
    expect(all).not.toMatch(/\bTools?\b/);
  });

  it("toMarkdown des Beispiels enthält den Kopf und keine Zeichen, die das CRM durcheinanderbringen", () => {
    const md = toMarkdown(toDocument(SAMPLE_SUMMARY, { firma: "Malerei Keller, Gossau" }));
    expect(md).toContain("- **Firma:** Malerei Keller, Gossau");
    expect(md).not.toMatch(/undefined|NaN|\[object/);
  });
});
