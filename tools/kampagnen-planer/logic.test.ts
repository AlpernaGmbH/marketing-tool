import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import { isToolDone } from "@/lib/progress";
import { addDays } from "@/tools/content-kalender/logic";
import { KPIS, kpisFuer } from "@/tools/kpi-baum/logic";
import { tools } from "@/tools/index";
import config from "./tool.config";
import { MUSTER, PHASEN, PHASE_KEYS } from "./data";
import {
  BUDGET_MAX,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAL_KEYS,
  KPI_HINWEIS,
  MATERIAL_HINWEIS,
  RICHTWERT_HINWEIS,
  ZIELE,
  ausgabeText,
  betragText,
  botschaftVorschlag,
  budgetAnteile,
  budgetPlan,
  buildIcs,
  buildPlan,
  eingabeText,
  formFrom,
  formToRaw,
  icsFilename,
  kampagnenName,
  kpiVorschlaege,
  measures,
  parseBudget,
  parseState,
  phasePlan,
  phaseWochen,
  sanitizeInput,
  toDocument,
  validate,
  verteilungText,
  weekRange,
  weeksBetween,
  zeitraumKurz,
  zeitraumLang,
  type Plan,
  type PlanInput,
  type ZielKey,
} from "./logic";

const HEUTE = "2026-10-05"; // Montag
const START = "2026-10-12"; // Montag
const ENDE = "2026-12-06"; // Sonntag, 56 Tage inklusive Ende, acht Wochen

const base: PlanInput = {
  ziel: "angebot",
  zielgruppe: "Hausbesitzerinnen und Hausbesitzer in Gossau und Umgebung",
  botschaft: "Wir streichen deine Fassade sauber und zum vereinbarten Termin, mit Festpreis nach der Besichtigung.",
  angebot: "Herbstaktion Fassadenanstrich",
  kanaele: ["website", "instagram", "aushang"],
  start: START,
  ende: ENDE,
  budget: 1200,
  organisation: "kmu",
};
const mit = (over: Partial<PlanInput> = {}): PlanInput => ({ ...base, ...over });
const plan = (over: Partial<PlanInput> = {}, heute = HEUTE): Plan => buildPlan(mit(over), heute);
const ALLE = [...KANAL_KEYS];
/** Ende so, dass die Kampagne genau `wochen` Wochen dauert (volle Wochen). */
const endeFuer = (wochen: number, start = START): string => addDays(start, 7 * wochen - 1);
const SLUGS = new Set(tools.map((t) => t.slug));

describe("kampagnen-planer: Wochenzahl", () => {
  it("zählt acht Wochen von Montag bis Sonntag, das Ende zählt mit", () => {
    expect(weeksBetween(START, ENDE)).toBe(8);
    expect(plan().tage).toBe(56);
  });

  it("rundet auf: ein Tag mehr ergibt eine Woche mehr, die letzte Woche ist dann kürzer", () => {
    expect(weeksBetween(START, "2026-12-07")).toBe(9);
    const p = plan({ ende: "2026-12-07" });
    expect(p.wochen).toBe(9);
    expect(p.zeilen).toHaveLength(9);
    expect(p.zeilen[8]).toMatchObject({ von: "2026-12-07", bis: "2026-12-07" });
    expect(p.zeilen[7]).toMatchObject({ von: "2026-11-30", bis: "2026-12-06" });
  });

  it("kennt die Grenzen: 7, 8, 112 und 113 Tage", () => {
    expect(weeksBetween(START, addDays(START, 6))).toBe(1);
    expect(weeksBetween(START, addDays(START, 7))).toBe(2);
    expect(weeksBetween(START, addDays(START, 111))).toBe(16);
    expect(weeksBetween(START, addDays(START, 112))).toBe(17);
  });

  it("liefert 0 bei Ende vor dem Start oder ungültigen Daten", () => {
    expect(weeksBetween(START, "2026-10-11")).toBe(0);
    expect(weeksBetween("", ENDE)).toBe(0);
    expect(weeksBetween(START, "2026-02-30")).toBe(0);
  });

  it("rechnet über Jahreswechsel und Schalttag richtig", () => {
    expect(weeksBetween("2026-12-21", "2027-02-14")).toBe(8);
    expect(weeksBetween("2028-02-20", "2028-03-05")).toBe(3); // 15 Tage, 2028 hat einen 29. Februar
    expect(weekRange("2026-12-21", "2027-02-14", 2)).toEqual({ von: "2026-12-28", bis: "2027-01-03" });
  });
});

describe("kampagnen-planer: Phasen", () => {
  it.each(Array.from({ length: 15 }, (_, i) => i + 2))("%i Wochen: Summe stimmt, jede Phase hat mindestens eine Woche, die Hauptphase ist die längste oder gleich lang", (w) => {
    const n = phaseWochen(w);
    expect(n.vorbereitung + n.anlauf + n.haupt + n.nachfassen).toBe(w);
    expect(n.vorbereitung).toBeGreaterThanOrEqual(1);
    expect(n.haupt).toBeGreaterThanOrEqual(1);
    const rows = phasePlan(w);
    expect(rows.reduce((s, r) => s + r.wochen, 0)).toBe(w);
    for (const r of rows) expect(r.wochen).toBeGreaterThanOrEqual(1);
    if (w >= 4) {
      expect(n.anlauf).toBeGreaterThanOrEqual(1);
      expect(n.nachfassen).toBeGreaterThanOrEqual(1);
      expect(n.haupt).toBeGreaterThanOrEqual(Math.max(n.vorbereitung, n.anlauf, n.nachfassen));
    }
  });

  it("nennt die Wochen für 2, 3, 4, 8, 10, 12 und 16 Wochen", () => {
    const f = (w: number) => Object.values(phaseWochen(w));
    expect(f(2)).toEqual([1, 0, 1, 0]);
    expect(f(3)).toEqual([1, 0, 1, 1]);
    expect(f(4)).toEqual([1, 1, 1, 1]);
    expect(f(8)).toEqual([1, 2, 4, 1]);
    expect(f(10)).toEqual([2, 2, 4, 2]); // 1,5 wird aufgerundet
    expect(f(12)).toEqual([2, 2, 6, 2]);
    expect(f(16)).toEqual([2, 3, 9, 2]);
  });

  it("lässt Phasen ohne Wochen weg und reiht die übrigen lückenlos aneinander", () => {
    expect(phasePlan(2).map((p) => p.key)).toEqual(["vorbereitung", "haupt"]);
    expect(phasePlan(3).map((p) => p.key)).toEqual(["vorbereitung", "haupt", "nachfassen"]);
    const rows = phasePlan(8);
    expect(rows.map((p) => [p.key, p.ersteWoche, p.letzteWoche])).toEqual([
      ["vorbereitung", 1, 1],
      ["anlauf", 2, 3],
      ["haupt", 4, 7],
      ["nachfassen", 8, 8],
    ]);
  });

  it("bleibt bei Randwerten ruhig: 0, 1, kaputte Zahl und lange Kampagnen", () => {
    expect(phasePlan(0)).toEqual([]);
    expect(phasePlan(Number.NaN)).toEqual([]);
    expect(phasePlan(1).map((p) => [p.key, p.wochen])).toEqual([["haupt", 1]]);
    for (const w of [17, 26, 52]) expect(Object.values(phaseWochen(w)).reduce((a, b) => a + b, 0)).toBe(w);
  });
});

describe("kampagnen-planer: Budget", () => {
  it("verteilt 1'200 Franken auf acht Wochen: Anlauf 150, Hauptphase 180, Nachfassen 180", () => {
    const b = plan().budget!;
    expect(b.proWoche).toEqual([0, 150, 150, 180, 180, 180, 180, 180]);
    expect(b.proPhase).toEqual({ vorbereitung: 0, anlauf: 300, haupt: 720, nachfassen: 180 });
    expect(b.total).toBe(1200);
  });

  it("stimmt exakt für viele Beträge und alle Wochenzahlen", () => {
    for (const budget of [1, 5, 99, 100, 333, 1000, 1200, 1201, 9999, 12_345, 77_777, BUDGET_MAX]) {
      for (let w = 2; w <= 16; w++) {
        const b = budgetPlan(budget, phasePlan(w))!;
        expect(b.proWoche).toHaveLength(w);
        expect(b.proWoche.reduce((a, c) => a + c, 0)).toBe(budget);
        expect(Object.values(b.proPhase).reduce((a, c) => a + c, 0)).toBe(budget);
        for (const x of b.proWoche) expect(Number.isInteger(x) && x >= 0).toBe(true);
      }
    }
  });

  it("legt den Rundungsrest in die letzte Woche der Hauptphase", () => {
    const b = budgetPlan(1201, phasePlan(8))!;
    expect(b.proWoche).toEqual([0, 150, 150, 180, 180, 180, 181, 180]);
    const klein = budgetPlan(5, phasePlan(16))!;
    expect(klein.proWoche.filter((x) => x > 0)).toEqual([5]);
    expect(klein.proPhase.haupt).toBe(5);
  });

  it("schlägt fehlende Phasen der Hauptphase zu", () => {
    expect(budgetAnteile(phasePlan(2))).toEqual({ vorbereitung: 0, anlauf: 0, haupt: 100, nachfassen: 0 });
    expect(budgetAnteile(phasePlan(3))).toEqual({ vorbereitung: 0, anlauf: 0, haupt: 85, nachfassen: 15 });
    expect(budgetAnteile(phasePlan(8))).toEqual({ vorbereitung: 0, anlauf: 25, haupt: 60, nachfassen: 15 });
    expect(budgetPlan(1000, phasePlan(2))!.proWoche).toEqual([0, 1000]);
    expect(budgetPlan(1000, phasePlan(3))!.proWoche).toEqual([0, 850, 150]);
  });

  it("gibt der Vorbereitung nie Budget und die Anteile ergeben 100 Prozent", () => {
    for (let w = 2; w <= 16; w++) {
      const b = budgetPlan(5000, phasePlan(w))!;
      expect(b.proPhase.vorbereitung).toBe(0);
      expect(Object.values(b.anteile).reduce((a, c) => a + c, 0)).toBe(100);
    }
    expect(PHASEN.map((p) => p.anteil)).toEqual([0, 25, 60, 15]);
  });

  it("zeigt ohne Budget keine Beträge", () => {
    for (const budget of [0, -5, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(budgetPlan(budget, phasePlan(8))).toBeNull();
    const p = plan({ budget: 0 });
    expect(p.budget).toBeNull();
    expect(p.zeilen.every((z) => z.budget === null)).toBe(true);
    expect(p.phasen.every((x) => x.budget === null)).toBe(true);
    const doc = toDocument(p, mit({ budget: 0 }));
    expect(JSON.stringify(doc)).not.toContain("CHF");
    expect(toMarkdown(doc)).not.toMatch(/\*\*Budget:\*\*|\*\*Verteilung:\*\*|\| Budget \|/);
  });

  it("liest das Budget aus Feldern: ganze Franken, leer ist 0, Apostroph erlaubt", () => {
    expect([parseBudget(""), parseBudget(undefined), parseBudget("0"), parseBudget(" 1'200 "), parseBudget(1200), parseBudget("1000000")]).toEqual([0, 0, 0, 1200, 1200, 1_000_000]);
    for (const falsch of ["12.5", "-5", "abc", "1000001", "1e3", 1.5, -1, 1_000_001, {}, true]) expect(parseBudget(falsch)).toBeNull();
    expect(betragText(150)).toBe("CHF 150.-");
    expect(betragText(0)).toBe("–");
  });
});

describe("kampagnen-planer: Prüfung der Eingabe", () => {
  const ok = { ...base };
  const felder = (raw: Parameters<typeof validate>[0], heute = HEUTE) => validate(raw, heute).map((p) => p.feld);

  it("lässt eine gültige Eingabe durch, auch mit Start heute", () => {
    expect(validate(ok, HEUTE)).toEqual([]);
    expect(validate({ ...ok, start: HEUTE, ende: endeFuer(2, HEUTE) }, HEUTE)).toEqual([]);
  });

  it("meldet einen Start in der Vergangenheit", () => {
    const p = validate({ ...ok, start: "2026-10-04", ende: "2026-12-06" }, HEUTE);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ feld: "start" });
    expect(p[0].text).toContain("Vergangenheit");
  });

  it("meldet einen zu kurzen und einen zu langen Zeitraum, mit den Grenzen genau getroffen", () => {
    expect(validate({ ...ok, ende: addDays(START, 6) }, HEUTE)[0].text).toContain("weniger als 2 Wochen");
    expect(felder({ ...ok, ende: addDays(START, 7) })).toEqual([]); // 8 Tage: zwei Wochen
    expect(felder({ ...ok, ende: addDays(START, 111) })).toEqual([]); // 112 Tage: 16 Wochen
    const lang = validate({ ...ok, ende: addDays(START, 112) }, HEUTE);
    expect(lang).toHaveLength(1);
    expect(lang[0]).toMatchObject({ feld: "ende" });
    expect(lang[0].text).toContain("mehr als 16 Wochen");
  });

  it("meldet Ende vor dem Start und fehlende oder ungültige Daten", () => {
    expect(validate({ ...ok, ende: "2026-10-01" }, HEUTE)[0]).toMatchObject({ feld: "ende", text: "Das Ende liegt vor dem Start." });
    expect(felder({ ...ok, start: "", ende: "" })).toEqual(["start", "ende"]);
    expect(felder({ ...ok, start: "2026-13-01" })).toContain("start");
  });

  it("prüft Ziel, Zielgruppe, Kernbotschaft, Angebot und Kanäle", () => {
    expect(felder({ ...ok, ziel: "x" })).toEqual(["ziel"]);
    expect(felder({ ...ok, zielgruppe: "  " })).toEqual(["zielgruppe"]);
    expect(felder({ ...ok, zielgruppe: "a".repeat(161) })).toEqual(["zielgruppe"]);
    expect(felder({ ...ok, zielgruppe: "a".repeat(160) })).toEqual([]);
    expect(felder({ ...ok, botschaft: "Zu kurz" })).toEqual(["botschaft"]);
    expect(felder({ ...ok, botschaft: "a".repeat(10) })).toEqual([]);
    expect(felder({ ...ok, botschaft: "a".repeat(201) })).toEqual(["botschaft"]);
    expect(felder({ ...ok, angebot: "a".repeat(161) })).toEqual(["angebot"]);
    expect(felder({ ...ok, angebot: "" })).toEqual([]);
    expect(felder({ ...ok, kanaele: [] })).toEqual(["kanaele"]);
    expect(felder({ ...ok, kanaele: ["tiktok"] })).toEqual(["kanaele"]);
  });

  it("prüft das Budget und sammelt mehrere Probleme in der Reihenfolge des Formulars", () => {
    expect(felder({ ...ok, budget: "12.5" })).toEqual(["budget"]);
    expect(felder({ ...ok, budget: "1000001" })).toEqual(["budget"]);
    expect(felder({ ...ok, budget: "" })).toEqual([]);
    expect(felder({ ...ok, budget: "1'000'000" })).toEqual([]);
    expect(felder({ ziel: undefined, zielgruppe: "", botschaft: "", kanaele: [], start: "", ende: "", budget: "x" })).toEqual([
      "ziel",
      "zielgruppe",
      "botschaft",
      "kanaele",
      "start",
      "ende",
      "budget",
    ]);
  });
});

describe("kampagnen-planer: Massnahmen", () => {
  const kanalSet = (p: Plan) => new Set(p.zeilen.flatMap((z) => z.massnahmen.map((m) => m.kanal)));

  it("zeigt Massnahmen mit Kanal nur bei gewähltem Kanal und interne immer", () => {
    expect(kanalSet(plan({ kanaele: ["instagram"] }))).toEqual(new Set(["intern", "instagram"]));
    expect(kanalSet(plan({ kanaele: ["newsletter", "whatsapp"] }))).toEqual(new Set(["intern", "newsletter", "whatsapp"]));
    expect(kanalSet(plan({ kanaele: ALLE }))).toEqual(new Set(["intern", ...ALLE]));
    const ohne = measures({ kanaele: [] }, phasePlan(8));
    expect(ohne.flat().every((m) => m.kanal === "intern")).toBe(true);
    expect(ohne.flat().length).toBeGreaterThan(0);
  });

  it("gibt jeder Phase mindestens eine interne Massnahme, der Hauptphase in jeder Woche", () => {
    for (let w = 2; w <= 16; w++) {
      const rows = phasePlan(w);
      const m = measures({ kanaele: [] }, rows);
      for (const r of rows) expect(m.slice(r.ersteWoche - 1, r.letzteWoche).flat().length).toBeGreaterThanOrEqual(1);
      const haupt = rows.find((r) => r.key === "haupt")!;
      for (let nr = haupt.ersteWoche; nr <= haupt.letzteWoche; nr++) expect(m[nr - 1].some((x) => x.id === "haupt-intern-1")).toBe(true);
    }
  });

  it("plant je Woche höchstens zwei Massnahmen je Kanal, bei allen Wochenzahlen", () => {
    for (let w = 2; w <= 16; w++) {
      const m = measures({ kanaele: ALLE }, phasePlan(w));
      expect(m).toHaveLength(w);
      for (const woche of m) {
        const je = new Map<string, number>();
        for (const x of woche) je.set(x.kanal, (je.get(x.kanal) ?? 0) + 1);
        for (const n of je.values()) expect(n).toBeLessThanOrEqual(2);
      }
    }
  });

  it("setzt die erste, mittlere und letzte Woche einer Phase richtig", () => {
    const p = plan({ kanaele: ["instagram", "website"] });
    const woche = (nr: number) => p.zeilen[nr - 1].massnahmen.map((m) => m.id);
    expect(woche(2)).toContain("anlauf-instagram-1"); // Anlauf erste Woche
    expect(woche(3)).toContain("anlauf-instagram-2"); // Anlauf letzte Woche
    expect(woche(5)).toContain("haupt-instagram-2"); // Hauptphase Woche 4 bis 7: Mitte ist die zweite Woche
    for (const nr of [4, 5, 6, 7]) expect(woche(nr)).toContain("haupt-instagram-1"); // jede Woche
    expect(woche(7)).toContain("haupt-website-2"); // letzte Woche der Hauptphase
    expect(woche(8)).toContain("nachfassen-instagram-1");
    // Phase mit einer Woche: alle Positionen fallen zusammen
    const kurz = plan({ kanaele: ["instagram"], ende: endeFuer(4) });
    expect(kurz.zeilen[2].massnahmen.map((m) => m.id)).toEqual(expect.arrayContaining(["haupt-instagram-1", "haupt-instagram-2"]));
  });

  it("stellt interne Massnahmen vor die Kanäle und hält die Reihenfolge der Auswahl", () => {
    const woche = plan({ kanaele: ALLE }).zeilen[0].massnahmen;
    expect(woche[0].kanal).toBe("intern");
    const kanaele = woche.map((m) => m.kanal).filter((k, i, a) => a.indexOf(k) === i);
    expect(kanaele).toEqual(["intern", ...ALLE.filter((k) => kanaele.includes(k))]);
  });

  it("verweist nur auf Werkzeuge, die es gibt, und nennt die erwarteten", () => {
    const slugs = new Set(MUSTER.flatMap((m) => (m.werkzeug ? [m.werkzeug] : [])));
    for (const s of slugs) expect(SLUGS.has(s), s).toBe(true);
    for (const s of ["post-generator", "caption-baukasten", "medienmitteilung", "qr-set", "whatsapp-link", "bewertungs-kit", "kpi-baum"]) expect(slugs.has(s), s).toBe(true);
  });

  it("hat eindeutige IDs, höchstens zwei Muster je Phase und Kanal und gültige Phasen", () => {
    expect(new Set(MUSTER.map((m) => m.id)).size).toBe(MUSTER.length);
    const je = new Map<string, number>();
    for (const m of MUSTER) {
      expect(PHASE_KEYS).toContain(m.phase);
      je.set(`${m.phase}|${m.kanal}`, (je.get(`${m.phase}|${m.kanal}`) ?? 0) + 1);
    }
    for (const n of je.values()) expect(n).toBeLessThanOrEqual(2);
  });

  it("enthält in den Mustern kein Wort der Sperrliste und keine Rechtsaussage", () => {
    const texte = [...MUSTER.flatMap((m) => [m.titel, m.hinweis ?? ""]), ...PHASEN.flatMap((p) => [p.label, p.kurz])].join("\n");
    expect(brandHits(texte)).toEqual([]);
    expect(texte).not.toMatch(/\bPflicht\b|gesetzlich|\bArt\.|Paragraf|\bGesetz|\bDSG\b|\bUWG\b|\bFrist von\b/i);
    expect(texte).not.toMatch(/\d/); // keine Zahlen, keine Fristen
    expect(texte).not.toMatch(/[!—]|\bjetzt\b|nur noch|garantiert/i);
  });

  it("nennt beim Anzeiger keine Frist und bei WhatsApp die Zustimmung", () => {
    const presse = MUSTER.filter((m) => m.kanal === "presse").map((m) => `${m.titel} ${m.hinweis ?? ""}`).join(" ");
    expect(presse).toContain("Frist beim Anzeiger erfragen");
    const wa = MUSTER.filter((m) => m.kanal === "whatsapp");
    expect(wa.every((m) => m.hinweis?.includes("zugestimmt"))).toBe(true);
    expect(MUSTER.find((m) => m.id === "haupt-whatsapp-1")!.titel).toBe("Nachricht an Bestandskundschaft senden, die zugestimmt hat");
  });
});

describe("kampagnen-planer: Kennzahlen", () => {
  const labels = (z: ZielKey, org: "kmu" | "verein" = "kmu") => kpiVorschlaege(z, org).map((k) => k.label);

  it("schlägt je Ziel die passenden Kennzahlen vor", () => {
    expect(labels("anfragen")).toEqual(["Anfragen", "Website-Besuche", "Profilaufrufe"]);
    expect(labels("anmeldungen")).toEqual(["Termine"]);
    expect(labels("kundschaft")).toEqual(["Neukunden", "Offerten"]);
    expect(labels("bekanntheit")).toEqual(["Profilaufrufe", "Website-Besuche"]);
    expect(labels("angebot")).toEqual(["Anfragen", "Termine"]);
  });

  it("wählt für Vereine Anmeldungen und Neumitglieder", () => {
    expect(labels("anmeldungen", "verein")).toEqual(["Anmeldungen"]);
    expect(labels("kundschaft", "verein")).toEqual(["Neumitglieder", "Anfragen"]);
  });

  it("nutzt nur Kennzahlen, die der Ziel- und KPI-Baum für die Organisation kennt, ohne Zielwerte", () => {
    for (const z of ZIELE) {
      for (const org of ["kmu", "verein"] as const) {
        const erlaubt = new Set(kpisFuer(org).map((k) => k.key));
        const liste = kpiVorschlaege(z.key, org);
        expect(liste.length).toBeGreaterThanOrEqual(1);
        for (const k of liste) {
          expect(erlaubt.has(k.key), `${z.key}/${org}/${k.key}`).toBe(true);
          expect(KPIS.some((d) => d.key === k.key && d.label === k.label)).toBe(true);
          expect(Object.keys(k).sort()).toEqual(["key", "label"]);
        }
      }
    }
    expect(kpiVorschlaege("x" as ZielKey)).toEqual([]);
  });

  it("verweist im Dokument auf den Ziel- und KPI-Baum", () => {
    const md = toMarkdown(toDocument(plan(), base));
    expect(md).toContain(KPI_HINWEIS);
    expect(KPI_HINWEIS).toBe("Zielwerte setzt du im Ziel- und KPI-Baum.");
    expect(plan().kennzahlen.map((k) => k.label)).toEqual(["Anfragen", "Termine"]);
  });
});

describe("kampagnen-planer: Plan", () => {
  it("baut Wochen, Phasen und Meilensteine für acht Wochen", () => {
    const p = plan();
    expect(p.wochen).toBe(8);
    expect(p.zeilen.map((z) => z.phase)).toEqual(["vorbereitung", "anlauf", "anlauf", "haupt", "haupt", "haupt", "haupt", "nachfassen"]);
    expect(p.zeilen[0]).toMatchObject({ nr: 1, von: "2026-10-12", bis: "2026-10-18" });
    expect(p.phasen.map((x) => [x.label, x.von, x.bis, x.budget])).toEqual([
      ["Vorbereitung", "2026-10-12", "2026-10-18", 0],
      ["Anlauf", "2026-10-19", "2026-11-01", 300],
      ["Hauptphase", "2026-11-02", "2026-11-29", 720],
      ["Nachfassen", "2026-11-30", "2026-12-06", 180],
    ]);
    expect(p.meilensteine.map((m) => [m.key, m.datum])).toEqual([
      ["vorbereitung", "2026-10-12"],
      ["anlauf", "2026-10-19"],
      ["haupt", "2026-11-02"],
      ["nachfassen", "2026-11-30"],
      ["ende", "2026-12-06"],
      ["auswertung", "2026-12-13"],
    ]);
  });

  it("setzt den Status der Wochen nach dem heutigen Datum und verschiebt nichts", () => {
    expect(plan({}, HEUTE).zeilen.every((z) => z.status === "folgt")).toBe(true);
    const mitte = plan({}, "2026-11-10");
    expect(mitte.zeilen.map((z) => z.status)).toEqual(["vorbei", "vorbei", "vorbei", "vorbei", "laeuft", "folgt", "folgt", "folgt"]);
    expect(plan({}, "2027-01-01").zeilen.every((z) => z.status === "vorbei")).toBe(true);
    const ohneStatus = (p: Plan) => p.zeilen.map((z) => ({ ...z, status: undefined }));
    expect(ohneStatus(plan({}, HEUTE))).toEqual(ohneStatus(plan({}, "2027-01-01")));
  });

  it("lässt bei zwei Wochen Anlauf und Nachfassen weg", () => {
    const p = plan({ ende: endeFuer(2) });
    expect(p.phasen.map((x) => x.key)).toEqual(["vorbereitung", "haupt"]);
    expect(p.meilensteine.map((m) => m.key)).toEqual(["vorbereitung", "haupt", "ende", "auswertung"]);
    expect(p.budget!.proWoche).toEqual([0, 1200]);
  });

  it("benennt die Kampagne nach dem Angebot, sonst nach dem Ziel", () => {
    expect(kampagnenName(base)).toBe("Herbstaktion Fassadenanstrich");
    expect(kampagnenName(mit({ angebot: "" }))).toBe("Ein Angebot bewerben");
    expect(kampagnenName(mit({ angebot: "  ", ziel: "anfragen" }))).toBe("Anfragen gewinnen");
  });

  it("formatiert Zeiträume", () => {
    expect(zeitraumLang("2026-10-12", "2026-10-18")).toBe("12.10.2026 bis 18.10.2026");
    expect(zeitraumKurz("2026-10-12", "2026-10-18")).toBe("12.10. bis 18.10.");
    expect(zeitraumKurz("2026-12-06", "2026-12-06")).toBe("06.12.");
    expect(verteilungText(plan())).toBe("Anlauf 25 %, Hauptphase 60 %, Nachfassen 15 %");
    expect(verteilungText(plan({ ende: endeFuer(2) }))).toBe("Hauptphase 100 %");
    expect(verteilungText(plan({ budget: 0 }))).toBe("");
  });
});

describe("kampagnen-planer: Kampagnenbrief", () => {
  it("baut Steckbrief, Phasen, Wochenplan, drei Hinweise und den Richtwert", () => {
    const doc = toDocument(plan(), base, { firma: "Malerei Keller" });
    expect(doc.title).toBe("Kampagnenbrief");
    expect(doc.subtitle).toBe("Herbstaktion Fassadenanstrich, 12.10.2026 bis 06.12.2026");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("kampagnenbrief-herbstaktion-fassadenanstrich");
    expect(doc.blocks.map((b) => (b.type === "heading" ? `${b.type}:${b.text}` : b.type))).toEqual(["facts", "heading:Phasen", "table", "heading:Wochenplan", "table", "heading:Hinweise", "list", "paragraph"]);
    const facts = doc.blocks[0];
    expect(facts.type === "facts" && facts.items.map((f) => f.label)).toEqual(["Ziel", "Zielgruppe", "Kernbotschaft", "Angebot", "Zeitraum", "Kanäle", "Budget", "Verteilung", "Kennzahlen"]);
    const tabellen = doc.blocks.filter((b) => b.type === "table");
    expect(tabellen[0].type === "table" && tabellen[0].header).toEqual(["Phase", "Wochen", "Zeitraum", "Budget"]);
    expect(tabellen[0].type === "table" && tabellen[0].rows[1]).toEqual(["Anlauf", "Woche 2 bis 3", "19.10.2026 bis 01.11.2026", "CHF 300.-"]);
    expect(tabellen[1].type === "table" && tabellen[1].header).toEqual(["Woche", "Phase", "Zeitraum", "Massnahmen", "Budget"]);
    expect(tabellen[1].type === "table" && tabellen[1].rows).toHaveLength(8);
    const hinweise = doc.blocks.find((b) => b.type === "list");
    expect(hinweise?.type === "list" && hinweise.items).toHaveLength(3);
    expect(doc.blocks.at(-1)).toEqual({ type: "paragraph", text: `${RICHTWERT_HINWEIS} ${MATERIAL_HINWEIS}` });
    const ohneBudget = toDocument(plan({ budget: 0 }), mit({ budget: 0 }));
    expect(ohneBudget.blocks.at(-1)).toEqual({ type: "paragraph", text: RICHTWERT_HINWEIS });
    expect(RICHTWERT_HINWEIS).toContain("Richtwert von Alperna, keine Statistik");
  });

  it("lässt ohne Angebot die Zeile Angebot weg und nennt das Ziel als Namen", () => {
    const i = mit({ angebot: "", budget: 0 });
    const doc = toDocument(buildPlan(i, HEUTE), i);
    const facts = doc.blocks[0];
    expect(facts.type === "facts" && facts.items.map((f) => f.label)).toEqual(["Ziel", "Zielgruppe", "Kernbotschaft", "Zeitraum", "Kanäle", "Kennzahlen"]);
    expect(doc.subtitle).toBe("Ein Angebot bewerben, 12.10.2026 bis 06.12.2026");
    const tabellen = doc.blocks.filter((b) => b.type === "table");
    expect(tabellen[0].type === "table" && tabellen[0].header).toEqual(["Phase", "Wochen", "Zeitraum"]);
    expect(tabellen[1].type === "table" && tabellen[1].header).toEqual(["Woche", "Phase", "Zeitraum", "Massnahmen"]);
  });

  it("zeigt Massnahmen mit Kanal als Aufzählung in der Zelle und nennt Hinweise in Klammern", () => {
    const i = mit({ kanaele: ["whatsapp"] });
    const doc = toDocument(buildPlan(i, HEUTE), i);
    const tabelle = doc.blocks.filter((b) => b.type === "table")[1];
    const zeilen = tabelle.type === "table" ? tabelle.rows : [];
    expect(zeilen[0][3]).toContain("• Intern: Kernbotschaft festhalten und im Team abstimmen");
    expect(zeilen[4][3]).toContain("• WhatsApp: Nachricht an Bestandskundschaft senden, die zugestimmt hat (Nur an Personen, die zugestimmt haben)");
  });

  it("besteht die Sperrliste und die Stilregeln in allen festen Texten", () => {
    const md = toMarkdown(toDocument(plan({ kanaele: ALLE }), mit({ kanaele: ALLE })));
    expect(brandHits(md)).toEqual([]);
    expect(md).not.toMatch(/[!—ß]|\bjetzt\b|nur noch/i);
  });
});

describe("kampagnen-planer: Eingabe und Ausgabe fürs CRM", () => {
  it("schreibt die Eingabe mit einer Angabe je Zeile", () => {
    expect(eingabeText(base).split("\n")).toEqual([
      "Ziel: Ein Angebot bewerben",
      "Zielgruppe: Hausbesitzerinnen und Hausbesitzer in Gossau und Umgebung",
      "Kernbotschaft: Wir streichen deine Fassade sauber und zum vereinbarten Termin, mit Festpreis nach der Besichtigung.",
      "Angebot: Herbstaktion Fassadenanstrich",
      "Kanäle: Website, Instagram, Aushang und Flyer",
      "Zeitraum: 12.10.2026 bis 06.12.2026 (8 Wochen)",
      "Budget: CHF 1'200.-",
    ]);
    const leer = eingabeText(mit({ angebot: "", budget: 0 }));
    expect(leer).toContain("Angebot: keines angegeben");
    expect(leer).toContain("Budget: kein Budget angegeben");
  });

  it("hält die ersten 1'900 Zeichen der Ausgabe aussagekräftig: Brief, Phasen, Anfang des Wochenplans", () => {
    const md = ausgabeText(plan(), base, { firma: "Malerei Keller" });
    expect(md.startsWith("# Kampagnenbrief\n")).toBe(true);
    const kopf = md.slice(0, 1900);
    expect(kopf).toContain("Ein Angebot bewerben");
    expect(kopf).toContain("12.10.2026 bis 06.12.2026 (8 Wochen)");
    expect(kopf).toContain("CHF 1'200.-");
    expect(kopf).toContain("## Phasen");
    expect(kopf).toContain("## Wochenplan");
    expect(kopf.indexOf("## Phasen")).toBeLessThan(kopf.indexOf("## Wochenplan"));
    expect(md).toContain("Richtwert von Alperna, keine Statistik");
  });

  it("hält auch die längste Eingabe lesbar: der Brief steht vor dem Wochenplan", () => {
    const lang = mit({ kanaele: ALLE, ende: endeFuer(16), zielgruppe: "z".repeat(160), botschaft: "b".repeat(200), angebot: "a".repeat(160) });
    const md = ausgabeText(buildPlan(lang, HEUTE), lang);
    expect(md.indexOf("**Zeitraum:**")).toBeLessThan(1900);
    expect(md.indexOf("**Ziel:**")).toBeLessThan(400);
  });
});

describe("kampagnen-planer: Kalenderdatei", () => {
  const NOW = new Date("2026-10-05T08:30:00Z");
  const unfold = (s: string) => s.replace(/\r\n /g, "");

  it("baut ein ganztägiges Ereignis je Meilenstein mit CRLF und gefalteten Zeilen", () => {
    const p = plan();
    const ics = buildIcs(p, base, { now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(6);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(6);
    expect(ics).toContain("PRODID:-//Alperna//Kampagnen-Planer//DE");
    expect(ics).toContain("DTSTAMP:20261005T083000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261012\r\nDTEND;VALUE=DATE:20261013");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261213\r\nDTEND;VALUE=DATE:20261214");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const uids = ics.match(/UID:[^\r]+/g)!;
    expect(new Set(uids).size).toBe(uids.length);
    const text = unfold(ics);
    expect(text).toContain("SUMMARY:Herbstaktion Fassadenanstrich: Start der Vorbereitung");
    expect(text).toContain("SUMMARY:Herbstaktion Fassadenanstrich: Ende der Kampagne");
    expect(text).toContain("SUMMARY:Herbstaktion Fassadenanstrich: Auswertung");
  });

  it("maskiert Komma, Semikolon, Backslash und Zeilenumbruch", () => {
    const i = mit({ angebot: "Aktion, Sommer; Herbst \\ Winter" });
    const text = unfold(buildIcs(buildPlan(i, HEUTE), i, { now: NOW }));
    expect(text).toContain("SUMMARY:Aktion\\, Sommer\\; Herbst \\\\ Winter: Start der Vorbereitung");
    expect(text).toContain("Massnahmen in der ersten Woche:\\n- Intern: Kernbotschaft festhalten");
    expect(text).not.toMatch(/DESCRIPTION:[^\r\n]*\n/);
  });

  it("schreibt Phase, Zeitraum und Massnahmen der ersten Woche in die Beschreibung", () => {
    const m = plan().meilensteine.find((x) => x.key === "anlauf")!;
    expect(m.beschreibung.split("\n")).toEqual([
      "Kampagne: Herbstaktion Fassadenanstrich",
      "Phase: Anlauf, 2 Wochen",
      "Zeitraum: 19.10.2026 bis 01.11.2026",
      "Massnahmen in der ersten Woche:",
      "- Website: Landeseite oder Abschnitt veröffentlichen",
      "- Instagram: Ankündigung veröffentlichen",
      "- Aushang und Flyer: Flyer verteilen und Plakate aufhängen",
    ]);
  });

  it("benennt die Datei nach der Kampagne", () => {
    expect(icsFilename(base)).toBe("kampagne-herbstaktion-fassadenanstrich.ics");
    expect(icsFilename(mit({ angebot: "" }))).toBe("kampagne-ein-angebot-bewerben.ics");
  });
});

describe("kampagnen-planer: Vorbefüllung", () => {
  const profil = { organisationstyp: "kmu" as const, primaersegment: "Hausbesitzer in Gossau", kanaele: [{ name: "Instagram" }, { name: "Newsletter" }] };
  const bot = "Wir streichen deine Fassade sauber und termingerecht.";

  it("füllt Zielgruppe, Kanäle und Kernbotschaft vor und nimmt die erste Option als Ziel", () => {
    const raw = formToRaw(EMPTY_FORM, profil, bot);
    expect(raw).toMatchObject({ ziel: "anfragen", zielgruppe: "Hausbesitzer in Gossau", botschaft: bot, kanaele: ["instagram", "newsletter"], organisation: "kmu", budget: "" });
  });

  it("nimmt ohne Profil Website, Instagram sowie Aushang und Flyer und lässt Zielgruppe und Kernbotschaft leer", () => {
    const raw = formToRaw(EMPTY_FORM, {}, "");
    expect(raw).toMatchObject({ zielgruppe: "", botschaft: "", kanaele: ["website", "instagram", "aushang"], organisation: "kmu" });
    expect(validate({ ...raw, start: START, ende: ENDE }, HEUTE).map((p) => p.feld)).toEqual(["zielgruppe", "botschaft"]);
  });

  it("gibt der Eingabe der Person Vorrang, auch einer bewusst leeren", () => {
    const raw = formToRaw({ ...EMPTY_FORM, zielgruppe: "", botschaft: "Eigener Satz zur Kampagne", kanaele: ["facebook"] }, profil, bot);
    expect(raw).toMatchObject({ zielgruppe: "", botschaft: "Eigener Satz zur Kampagne", kanaele: ["facebook"] });
  });

  it("erkennt Vereine über das Profil", () => {
    expect(formToRaw(EMPTY_FORM, { organisationstyp: "verein" }, "").organisation).toBe("verein");
  });

  it("übernimmt aus dem Stand von «Kernbotschaften» nur die Hauptbotschaft, und nur wenn die Form passt", () => {
    const stand = {
      v: 1,
      input: { betrieb: "Malerei Keller", branche: "Malerei", ort: "Gossau", zielgruppe: "Hausbesitzer", angebot: "Fassaden streichen und Wände malen", wirkung: "Vertrauen in saubere Arbeit", beweise: "", anrede: "du", positionierung: "", primaersegment: "", personas: [] },
      output: {
        hauptbotschaft: "Wir streichen deine Fassade sauber und zum vereinbarten Termin.",
        botschaften: [1, 2, 3].map((n) => ({ fuer: `Gruppe ${n}`, satz: `Ein Satz für die Gruppe ${n} mit genug Zeichen`, beleg: `Beleg für die Gruppe ${n}` })),
        kanaele: { website: "w".repeat(50), googleProfil: "g".repeat(50), instagram: "i".repeat(40), offerteOderMail: "o".repeat(70) },
        telefonsatz: "t".repeat(40),
        nichtSagen: ["Dass wir alles können", "Dass wir die Günstigsten sind", "Ein Preis ohne Besichtigung"],
      },
    };
    expect(botschaftVorschlag(stand)).toBe("Wir streichen deine Fassade sauber und zum vereinbarten Termin.");
    expect(botschaftVorschlag({ ...stand, output: null })).toBe("");
    expect(botschaftVorschlag({ ...stand, v: 2 })).toBe("");
    expect(botschaftVorschlag({ ...stand, output: { ...stand.output, hauptbotschaft: "zu kurz" } })).toBe("");
    for (const kaputt of [null, undefined, "text", 42, [], {}, { v: 1 }, { v: 1, input: {}, output: {} }]) expect(botschaftVorschlag(kaputt)).toBe("");
  });

  it("zeigt gespeicherte Angaben wieder im Formular", () => {
    const f = formFrom(base);
    expect(f).toMatchObject({ ziel: "angebot", angebot: "Herbstaktion Fassadenanstrich", start: START, ende: ENDE, budget: "1200", kanaele: ["website", "instagram", "aushang"] });
    expect(formFrom(mit({ budget: 0 })).budget).toBe("");
    expect(formFrom(null)).toEqual(EMPTY_FORM);
    expect(formFrom(base).kanaele).not.toBe(base.kanaele);
  });
});

describe("kampagnen-planer: gespeicherter Stand", () => {
  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const kaputt of [null, undefined, "text", 42, [], {}, { v: 2, phase: "result", input: base }, { v: 1, phase: "result" }]) {
      expect(parseState(kaputt)).toEqual(EMPTY_STATE);
    }
  });

  it("macht aus einem Ergebnis ohne gültige Eingabe das Formular", () => {
    expect(parseState({ v: 1, phase: "result", input: { ...base, kanaele: [] } })).toEqual(EMPTY_STATE);
    expect(parseState({ v: 1, phase: "result", input: { ...base, ende: addDays(START, 6) } })).toEqual(EMPTY_STATE); // unter zwei Wochen
    expect(parseState({ v: 1, phase: "result", input: { ...base, ende: addDays(START, 112) } })).toEqual(EMPTY_STATE); // über 16 Wochen
    expect(parseState({ v: 1, phase: "result", input: { ...base, budget: "viel" } })).toEqual(EMPTY_STATE);
    const edit = parseState({ v: 1, phase: "edit", input: base });
    expect(edit).toEqual({ v: 1, phase: "edit", input: base });
  });

  it("liest ein gültiges Ergebnis, erlaubt einen vergangenen Start und bereinigt die Eingabe", () => {
    const s = parseState({ v: 1, phase: "result", input: { ...base, start: "2020-01-06", ende: "2020-03-01", kanaele: ["instagram", "tiktok", "instagram", "website"], zielgruppe: "  Hausbesitzer  ", organisation: "x" }, output: { erstellt: "2020-01-01" } });
    expect(s.phase).toBe("result");
    expect(s.input).toMatchObject({ start: "2020-01-06", kanaele: ["website", "instagram"], zielgruppe: "Hausbesitzer", organisation: "kmu" });
    expect(s.output).toEqual({ erstellt: "2020-01-01" });
    expect(parseState({ v: 1, phase: "result", input: base, output: { erstellt: "kaputt" } }).output).toBeUndefined();
  });

  it("zählt im Pfad erst als erledigt, wenn das Ergebnis da ist", () => {
    expect(isToolDone(JSON.stringify({ v: 1, phase: "result", input: base, output: { erstellt: HEUTE } }))).toBe(true);
    expect(isToolDone(JSON.stringify({ v: 1, phase: "edit", input: base }))).toBe(false);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });

  it("sanitizeInput lehnt Unfertiges ab und liest Zahlen und Texte für das Budget", () => {
    expect(sanitizeInput(null)).toBeNull();
    expect(sanitizeInput({ ...base, ziel: "x" })).toBeNull();
    expect(sanitizeInput({ ...base, botschaft: "kurz" })).toBeNull();
    expect(sanitizeInput({ ...base, zielgruppe: "" })).toBeNull();
    expect(sanitizeInput({ ...base, budget: "1'200" })?.budget).toBe(1200);
    expect(sanitizeInput({ ...base, budget: undefined })?.budget).toBe(0);
    expect(sanitizeInput(base)).toEqual(base);
  });
});

describe("kampagnen-planer: Konfiguration", () => {
  it("hat eine Tagline bis 110 Zeichen, das Keyword und verwandte Werkzeuge, die es gibt", () => {
    expect(config.tagline.length).toBeLessThanOrEqual(110);
    expect(config.tagline).toBe("Eine Kampagne in vier Phasen: Wochenplan, Massnahmen je Kanal, Budget je Woche und Kampagnenbrief.");
    expect(config.keyword).toBe("Kampagne planen");
    expect(config.related).toEqual(["kpi-baum", "botschaften", "budget-planer"]);
    for (const s of config.related) expect(SLUGS.has(s), s).toBe(true);
    expect(config.outputs).toEqual(["copy", "pdf", "docx", "ics"]);
    expect(config.needsServer).toBe(false);
    expect(config.writesProfile).toEqual([]);
  });
});
