import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { tools } from "@/tools/index";
import { GEMEINSAM, NACH_TYP, TYP_KEYS, KANAL_KEYS, vorlagenFor, type Vorlage } from "./data";
import {
  DEFAULT_KANAELE,
  EMPTY_FORM,
  EMPTY_STATE,
  KANAELE,
  TYPEN,
  aufgabenDatum,
  ausgabeText,
  buildIcs,
  buildPlan,
  cleanErledigt,
  datumKurz,
  diffDays,
  eingabeText,
  erledigtCount,
  faelligMeldung,
  formFrom,
  groupByWeek,
  icsEscape,
  icsFilename,
  kanaeleAusProfil,
  kanaeleVorschlag,
  kanalLabel,
  parseState,
  pdfFilename,
  toDocument,
  todayIso,
  toggleErledigt,
  toInput,
  typLabel,
  typenFor,
  validate,
  wochenLabel,
  type Plan,
  type PlanInput,
} from "./logic";
import { addDays, weekdayIndex } from "@/tools/content-kalender/logic";

const HEUTE = "2026-10-05"; // Montag
const ANLASS = "2026-11-14"; // Samstag, 40 Tage nach HEUTE

const base: PlanInput = {
  typ: "tag-der-offenen-tuer",
  name: "Tag der offenen Tür Malerei Keller",
  datum: ANLASS,
  kanaele: ["website", "instagram", "aushang"],
  inserate: false,
  organisation: "kmu",
};
const plan = (over: Partial<PlanInput> = {}, heute = HEUTE): Plan => buildPlan({ ...base, ...over }, heute);
const ids = (p: Plan): string[] => p.aufgaben.map((a) => a.id);
const titles = (p: Plan): string[] => p.aufgaben.map((a) => a.titel);
const ALLE_KANAELE = [...KANAL_KEYS];
const alleVorlagen = (): Vorlage[] => [...GEMEINSAM, ...TYP_KEYS.flatMap((t) => NACH_TYP[t])];

describe("anlass-planer: Arten und Kanäle", () => {
  it("kennt die sechs Arten mit ihren Bezeichnungen", () => {
    expect(TYPEN.map((t) => t.label)).toEqual(["Tag der offenen Tür", "Eröffnung", "Jubiläum", "Messe oder Marktstand", "Dorffest oder Vereinsfest", "Generalversammlung"]);
    expect(TYPEN.filter((t) => t.vereinFirst).map((t) => t.key)).toEqual(["dorffest", "generalversammlung"]);
    expect(typLabel("messe")).toBe("Messe oder Marktstand");
  });

  it("stellt für Vereine Dorffest und Generalversammlung zuerst, für KMU zuletzt, alle bleiben wählbar", () => {
    expect(typenFor("verein").map((t) => t.key).slice(0, 2)).toEqual(["dorffest", "generalversammlung"]);
    expect(typenFor("kmu").map((t) => t.key).slice(-2)).toEqual(["dorffest", "generalversammlung"]);
    expect(typenFor("kmu")[0].key).toBe("tag-der-offenen-tuer");
    for (const org of ["kmu", "verein"] as const) expect(typenFor(org).map((t) => t.key).sort()).toEqual([...TYP_KEYS].sort());
  });

  it("kennt die neun Kanäle mit Bezeichnung und nennt interne Aufgaben «intern»", () => {
    expect(KANAELE.map((k) => k.label)).toEqual([
      "Website",
      "Google-Unternehmensprofil",
      "Instagram",
      "Facebook",
      "LinkedIn",
      "Newsletter",
      "Aushang und Flyer",
      "Lokalzeitung und Anzeiger",
      "WhatsApp",
    ]);
    expect(kanalLabel("intern")).toBe("intern");
    expect(kanalLabel("presse")).toBe("Lokalzeitung und Anzeiger");
  });

  it("liest die Kanäle aus den Namen im Profil und fällt sonst auf Website, Instagram, Aushang zurück", () => {
    const profile = { kanaele: [{ name: "Instagram" }, { kanal: "Newsletter" }, { name: "Google Ads" }, { name: "Google Business Profil" }, {}, { name: "  " }] };
    expect(kanaeleAusProfil(profile)).toEqual(["gbp", "instagram", "newsletter"]);
    expect(kanaeleVorschlag(profile)).toEqual(["gbp", "instagram", "newsletter"]);
    expect(kanaeleAusProfil({ kanaele: [{ name: "Print und Anzeiger" }] })).toEqual(["aushang", "presse"]);
    expect(kanaeleVorschlag({})).toEqual(DEFAULT_KANAELE);
    expect(kanaeleVorschlag({ kanaele: [{ name: "Brieftaube" }] })).toEqual(["website", "instagram", "aushang"]);
  });
});

describe("anlass-planer: Vorlagen", () => {
  it("hat eindeutige IDs", () => {
    const all = alleVorlagen().map((v) => v.id);
    // gemeinsame Aufgaben stehen einmal; die Aufgaben je Art tragen ein eigenes Kürzel
    expect(new Set(all).size).toBe(all.length);
    for (const typ of TYP_KEYS) {
      const own = vorlagenFor(typ).map((v) => v.id);
      expect(new Set(own).size).toBe(own.length);
    }
  });

  it("liegt zwischen zehn Wochen davor und einer Woche danach, und wochenVorher passt zu tageVorher", () => {
    for (const v of alleVorlagen()) {
      expect(Number.isInteger(v.wochenVorher)).toBe(true);
      expect(v.wochenVorher).toBeGreaterThanOrEqual(-1);
      expect(v.wochenVorher).toBeLessThanOrEqual(10);
      if (v.tageVorher !== undefined) {
        const tage = v.tageVorher;
        const woche = tage === 0 ? 0 : tage > 0 ? Math.ceil(tage / 7) : -Math.ceil(-tage / 7);
        expect(woche, v.id).toBe(v.wochenVorher);
        expect(Math.abs(tage), v.id).toBeLessThanOrEqual(70);
      }
    }
  });

  it("gibt jeder Art zwölf bis zwanzig Grundaufgaben (intern, ohne Bedingung, für KMU)", () => {
    for (const typ of TYP_KEYS) {
      const grund = vorlagenFor(typ).filter((v) => v.kanal === "intern" && v.nurWenn === undefined && v.vereinsTyp !== true);
      expect(grund.length, typ).toBeGreaterThanOrEqual(12);
      expect(grund.length, typ).toBeLessThanOrEqual(20);
    }
  });

  it("enthält in jeder Art die gemeinsamen Aufgaben", () => {
    for (const typ of TYP_KEYS) {
      const t = titles(plan({ typ }));
      for (const titel of [
        "Ziel und Budget klären",
        "Datum und Ort sichern",
        "Verantwortliche verteilen",
        "Programm festlegen",
        "Einladung gestalten",
        "Aufbau am Vortag",
      ]) {
        expect(t, typ).toContain(titel);
      }
      expect(t.some((x) => x.startsWith("Erinnerung eine Woche vorher")), typ).toBe(true);
      expect(t.some((x) => x.startsWith("Rückblick mit Zahlen")), typ).toBe(true);
      expect(t.some((x) => x.includes("Danke")), typ).toBe(true);
    }
  });

  it("verweist nur auf bestehende Werkzeuge (tools/index.ts)", () => {
    const bekannt = new Set(tools.map((t) => t.slug));
    const genutzt = new Set(alleVorlagen().flatMap((v) => (v.werkzeug ? [v.werkzeug] : [])));
    expect(genutzt.size).toBeGreaterThan(5);
    for (const slug of genutzt) expect(bekannt.has(slug), slug).toBe(true);
  });

  it("macht keine Rechtsaussage, nennt keine Zahlen und hält die Sperrliste ein", () => {
    const texte = alleVorlagen().flatMap((v) => [v.titel, ...(v.hinweis ? [v.hinweis] : [])]);
    for (const t of texte) {
      expect(t, t).not.toMatch(/gesetzlich|Pflicht|Paragraf|Art\./i);
      expect(t, t).not.toMatch(/\d/);
      expect(t, t).not.toMatch(/[!—]/);
      expect(brandHits(t), t).toEqual([]);
    }
  });

  it("nennt Fristen nur als Auftrag zum Nachfragen", () => {
    const hinweise = new Set(alleVorlagen().flatMap((v) => (v.hinweis ? [v.hinweis] : [])));
    expect([...hinweise].sort()).toEqual(["Frist beim Anzeiger erfragen.", "Frist laut Statuten prüfen."]);
    const bewilligung = alleVorlagen().filter((v) => /Bewilligung/.test(v.titel));
    expect(bewilligung.map((v) => v.titel)).toEqual(["Bei der Gemeinde nachfragen, ob eine Bewilligung nötig ist"]);
    expect(NACH_TYP.dorffest.map((v) => v.titel)).toContain("Bei der Gemeinde nachfragen, ob eine Bewilligung nötig ist");
    const gv = NACH_TYP.generalversammlung.find((v) => v.id === "gv-einladung");
    expect(gv?.titel).toBe("Einladung samt Traktanden versenden");
    expect(gv?.hinweis).toBe("Frist laut Statuten prüfen.");
  });
});

describe("anlass-planer: Plan", () => {
  it("liefert in jeder Art und für beide Organisationen Aufgaben in zeitlicher Ordnung", () => {
    for (const typ of TYP_KEYS) {
      for (const organisation of ["kmu", "verein"] as const) {
        const p = plan({ typ, organisation, kanaele: ALLE_KANAELE, inserate: true });
        expect(p.aufgaben.length, typ).toBeGreaterThan(12);
        for (let i = 1; i < p.aufgaben.length; i++) {
          const a = p.aufgaben[i - 1];
          const b = p.aufgaben[i];
          expect(a.datum <= b.datum, `${typ}: ${a.id} vor ${b.id}`).toBe(true);
          if (a.datum === b.datum) expect(a.titel.localeCompare(b.titel, "de-CH")).toBeLessThanOrEqual(0);
        }
        // zehn Wochen davor (mit Freitag-Regel höchstens zwei Tage mehr) bis eine Woche danach
        for (const a of p.aufgaben) {
          expect(a.datum >= addDays(ANLASS, -72), a.id).toBe(true);
          expect(a.datum <= addDays(ANLASS, 7), a.id).toBe(true);
        }
      }
    }
  });

  it("rechnet das Datum aus dem Anlassdatum (Handrechnung)", () => {
    const byId = Object.fromEntries(plan().aufgaben.map((a) => [a.id, a.datum]));
    expect(byId["k-web-ankuendigung"]).toBe("2026-10-10"); // 5 Wochen = 35 Tage vor Sa 14.11., ein Samstag, kein interner Termin
    expect(byId["k-ig-ankuendigung"]).toBe("2026-10-17"); // 4 Wochen
    expect(byId["g-ziel"]).toBe("2026-09-04"); // 10 Wochen = Sa 05.09., intern, also Fr 04.09.
    expect(byId["g-aufbau"]).toBe("2026-11-13"); // ein Tag vorher
    expect(byId["k-ig-danke"]).toBe("2026-11-15"); // ein Tag danach, Instagram bleibt am Sonntag
    expect(byId["g-rueckblick"]).toBe("2026-11-20"); // 7 Tage danach = Sa 21.11., intern, also Fr 20.11.
  });

  it("rechnet über den Jahreswechsel", () => {
    const byId = Object.fromEntries(plan({ datum: "2027-01-16" }).aufgaben.map((a) => [a.id, a.datum]));
    expect(byId["k-ig-ankuendigung"]).toBe("2026-12-19"); // 28 Tage vor Sa 16.01.2027
    expect(byId["k-web-ankuendigung"]).toBe("2026-12-12"); // 35 Tage
    expect(byId["k-ig-danke"]).toBe("2027-01-17");
    expect(byId["g-ziel"]).toBe("2026-11-06"); // 70 Tage = Sa 07.11., intern, also Fr 06.11.
  });

  it("rechnet über den Schalttag", () => {
    const woche = { wochenVorher: 1, kanal: "website" } as const;
    expect(aufgabenDatum("2028-03-07", woche)).toBe("2028-02-29");
    expect(aufgabenDatum("2027-03-07", woche)).toBe("2027-02-28");
    expect(aufgabenDatum("2028-02-26", { wochenVorher: -1, tageVorher: -3, kanal: "website" })).toBe("2028-02-29");
    expect(diffDays("2028-02-28", "2028-03-01")).toBe(2);
    expect(diffDays("2027-02-28", "2027-03-01")).toBe(1);
  });

  it("lässt Samstag und Sonntag stehen, ausser bei internen Aufgaben: die rutschen auf den Freitag davor", () => {
    expect(weekdayIndex(ANLASS)).toBe(5);
    expect(aufgabenDatum(ANLASS, { wochenVorher: 5, kanal: "website" })).toBe("2026-10-10"); // Samstag bleibt
    expect(aufgabenDatum(ANLASS, { wochenVorher: 5, kanal: "intern" })).toBe("2026-10-09"); // Freitag
    expect(aufgabenDatum("2026-11-15", { wochenVorher: 5, kanal: "intern" })).toBe("2026-10-09"); // Sonntag 11.10. → Freitag 09.10.
    for (const a of plan().aufgaben) {
      if (a.kanal === "intern" && a.datum !== ANLASS) expect(weekdayIndex(a.datum), a.id).toBeLessThan(5);
    }
  });

  it("lässt Aufgaben am Anlasstag selbst stehen", () => {
    const zaehlen = plan().aufgaben.find((a) => a.id === "g-zaehlen");
    expect(zaehlen?.datum).toBe(ANLASS);
    expect(zaehlen?.wochenVorher).toBe(0);
  });

  it("legt interne Aufgaben nach dem Anlass nie vor den Anlass", () => {
    const danach = { wochenVorher: -1, tageVorher: -1, kanal: "intern" } as const;
    expect(aufgabenDatum("2026-11-14", danach)).toBe("2026-11-16"); // Sonntag → Freitag läge vor dem Anlass → Montag
    expect(aufgabenDatum("2026-11-13", danach)).toBe("2026-11-16"); // Samstag → Freitag ist der Anlass → Montag
    expect(aufgabenDatum("2026-11-12", danach)).toBe("2026-11-13"); // Freitag, kein Wochenende
    expect(aufgabenDatum("2026-11-14", { wochenVorher: -1, tageVorher: -7, kanal: "intern" })).toBe("2026-11-20"); // Samstag 21.11. → Freitag
    for (const a of plan({ kanaele: ALLE_KANAELE }).aufgaben) if (a.wochenVorher < 0) expect(a.datum > ANLASS, a.id).toBe(true);
  });

  it("plant bis eine Woche nach dem Anlass", () => {
    const danach = plan({ kanaele: ALLE_KANAELE }).aufgaben.filter((a) => a.wochenVorher < 0);
    expect(danach.length).toBeGreaterThanOrEqual(5);
    expect(danach.map((a) => a.datum).every((d) => d > ANLASS && d <= addDays(ANLASS, 7))).toBe(true);
  });

  it("zeigt Aufgaben mit Bedingung nur, wenn der Kanal gewählt ist", () => {
    for (const k of KANAL_KEYS) {
      const p = plan({ kanaele: [k] });
      expect(p.aufgaben.some((a) => a.kanal === k), k).toBe(true);
      for (const a of p.aufgaben) expect(["intern", k], `${k}: ${a.id}`).toContain(a.kanal);
    }
    expect(ids(plan({ kanaele: ["website"] })).some((id) => id.startsWith("k-ig-") || id.startsWith("k-print-"))).toBe(false);
    expect(ids(plan({ kanaele: ["instagram"] })).some((id) => id.startsWith("k-web-"))).toBe(false);
  });

  it("schreibt eine Medienmitteilung nur ein, wenn Lokalzeitung und Anzeiger gewählt ist", () => {
    expect(ids(plan())).not.toContain("tod-presse");
    const mit = plan({ kanaele: ["presse"] }).aufgaben.find((a) => a.id === "tod-presse");
    expect(mit?.titel).toBe("Medienmitteilung an die Lokalpresse schreiben");
    expect(mit?.werkzeug).toBe("medienmitteilung");
  });

  it("fügt mit Inseraten genau zwei Aufgaben ein", () => {
    const ohne = plan();
    const mit = plan({ inserate: true });
    expect(mit.aufgaben.length - ohne.aufgaben.length).toBe(2);
    const neu = mit.aufgaben.filter((a) => !ids(ohne).includes(a.id));
    expect(neu.map((a) => a.titel).sort()).toEqual(["Inserat planen und buchen", "Inserat prüfen"]);
    expect(neu.find((a) => a.titel === "Inserat planen und buchen")?.hinweis).toBe("Frist beim Anzeiger erfragen.");
    expect(titles(ohne)).not.toContain("Inserat prüfen");
  });

  it("filtert nach Verein und KMU", () => {
    const verein = titles(plan({ typ: "dorffest", organisation: "verein", kanaele: ["website"] }));
    const kmu = titles(plan({ typ: "dorffest", organisation: "kmu", kanaele: ["website"] }));
    expect(verein).toContain("Sponsoren anfragen");
    expect(verein).toContain("Mitglieder über Termin und Einsatz informieren");
    expect(verein).not.toContain("Stammkundschaft und Partner persönlich einladen");
    expect(kmu).not.toContain("Sponsoren anfragen");
    expect(kmu).not.toContain("Mitglieder über Termin und Einsatz informieren");
    expect(kmu).toContain("Stammkundschaft und Partner persönlich einladen");
    expect(titles(plan({ typ: "tag-der-offenen-tuer", organisation: "verein" }))).toContain("Mitglieder und Gönner persönlich einladen");
    // Bewertungen bei Google anfragen: nur KMU
    expect(titles(plan({ kanaele: ["gbp"], organisation: "kmu" }))).toContain("Bewertungen nach dem Anlass anfragen");
    expect(titles(plan({ kanaele: ["gbp"], organisation: "verein" }))).not.toContain("Bewertungen nach dem Anlass anfragen");
  });

  it("verweist bei den Beiträgen auf die passenden Werkzeuge", () => {
    const p = plan({ kanaele: ALLE_KANAELE });
    const w = (id: string) => p.aufgaben.find((a) => a.id === id)?.werkzeug;
    expect(w("k-ig-ankuendigung")).toBe("post-generator");
    expect(w("k-print-qr")).toBe("qr-set");
    expect(w("k-wa-einladung")).toBe("whatsapp-link");
    expect(w("k-gbp-bewertung")).toBe("bewertungs-kit");
    expect(w("g-ziel")).toBeUndefined();
  });

  it("markiert Aufgaben vor dem heutigen Datum als fällig, ohne den Plan zu verschieben", () => {
    const p = plan();
    expect(p.tageBis).toBe(40);
    expect(p.wochenBis).toBe(5);
    expect(p.faelligAnzahl).toBe(7);
    expect(p.aufgaben.filter((a) => a.faellig).length).toBe(p.faelligAnzahl);
    for (const a of p.aufgaben) expect(a.faellig, a.id).toBe(a.datum < HEUTE);
    expect(titles(p).slice(0, 2)).toEqual(["Datum und Ort sichern", "Ziel und Budget klären"]);
    // dieselben Daten, egal wie spät es ist: nur das Kennzeichen ändert sich
    const frueh = plan({}, "2026-01-01");
    expect(frueh.faelligAnzahl).toBe(0);
    expect(frueh.aufgaben.map((a) => [a.id, a.datum])).toEqual(p.aufgaben.map((a) => [a.id, a.datum]));
  });

  it("meldet fällige Aufgaben mit der Zahl der Wochen bis zum Anlass", () => {
    expect(faelligMeldung(plan())).toBe("7 Aufgaben sind schon fällig, weil bis zum Anlass 5 Wochen bleiben.");
    expect(faelligMeldung(plan({}, "2026-01-01"))).toBeNull();
    expect(faelligMeldung({ faelligAnzahl: 1, wochenBis: 5, tageBis: 40 })).toBe("1 Aufgabe ist schon fällig, weil bis zum Anlass 5 Wochen bleiben.");
    expect(faelligMeldung({ faelligAnzahl: 3, wochenBis: 1, tageBis: 9 })).toBe("3 Aufgaben sind schon fällig, weil bis zum Anlass 1 Woche bleibt.");
    expect(faelligMeldung({ faelligAnzahl: 3, wochenBis: 0, tageBis: 4 })).toBe("3 Aufgaben sind schon fällig, weil bis zum Anlass weniger als eine Woche bleibt.");
    expect(faelligMeldung({ faelligAnzahl: 4, wochenBis: 0, tageBis: 0 })).toBe("4 Aufgaben sind schon fällig, weil der Anlass heute ist.");
    expect(faelligMeldung({ faelligAnzahl: 4, wochenBis: 0, tageBis: -3 })).toBe("4 Aufgaben sind schon fällig, weil der Anlass vorbei ist.");
    const nah = plan({}, "2026-11-10");
    expect(nah.tageBis).toBe(4);
    expect(nah.wochenBis).toBe(0);
    expect(faelligMeldung(nah)).toMatch(/weniger als eine Woche bleibt\.$/);
    expect(faelligMeldung(nah)).not.toMatch(/nur noch/);
  });

  it("plant einen Anlass am heutigen Tag, ohne zu stürzen", () => {
    const p = plan({ datum: HEUTE });
    expect(p.tageBis).toBe(0);
    expect(p.aufgaben.length).toBeGreaterThan(10);
    expect(p.faelligAnzahl).toBeGreaterThan(0);
  });

  it("gruppiert nach Woche, früheste zuerst", () => {
    const groups = groupByWeek(plan({ kanaele: ALLE_KANAELE, inserate: true }).aufgaben);
    const labels = groups.map((g) => g.label);
    expect(labels[0]).toBe("10 Wochen vorher");
    expect(labels).toContain("1 Woche vorher");
    expect(labels).toContain("Anlasstag");
    expect(labels[labels.length - 1]).toBe("1 Woche danach");
    expect(groups.map((g) => g.woche)).toEqual([...groups.map((g) => g.woche)].sort((a, b) => b - a));
    for (const g of groups) for (const a of g.aufgaben) expect(a.wochenVorher).toBe(g.woche);
    expect(groups.reduce((n, g) => n + g.aufgaben.length, 0)).toBe(plan({ kanaele: ALLE_KANAELE, inserate: true }).aufgaben.length);
    expect(groupByWeek([])).toEqual([]);
    expect([wochenLabel(10), wochenLabel(2), wochenLabel(1), wochenLabel(0), wochenLabel(-1)]).toEqual(["10 Wochen vorher", "2 Wochen vorher", "1 Woche vorher", "Anlasstag", "1 Woche danach"]);
  });

  it("formatiert das Datum mit Wochentag", () => {
    expect(datumKurz("2026-11-14")).toBe("Sa 14.11.2026");
    expect(datumKurz("2026-11-16")).toBe("Mo 16.11.2026");
  });
});

describe("anlass-planer: Prüfung der Eingabe", () => {
  const ok = { typ: "dorffest", name: "Dorffest Trogen", datum: "2026-11-14", kanaele: ["website"] };

  it("lässt eine vollständige Eingabe durch, auch am heutigen Tag", () => {
    expect(validate(ok, HEUTE)).toEqual([]);
    expect(validate({ ...ok, datum: HEUTE }, HEUTE)).toEqual([]);
  });

  it("lehnt ein Datum in der Vergangenheit ab", () => {
    const p = validate({ ...ok, datum: "2026-10-04" }, HEUTE);
    expect(p).toHaveLength(1);
    expect(p[0].feld).toBe("datum");
    expect(p[0].text).toMatch(/Vergangenheit/);
  });

  it("verlangt ein gültiges Datum", () => {
    expect(validate({ ...ok, datum: "" }, HEUTE).map((x) => x.feld)).toEqual(["datum"]);
    expect(validate({ ...ok, datum: "2026-02-30" }, HEUTE).map((x) => x.feld)).toEqual(["datum"]);
  });

  it("verlangt einen Namen von drei bis achtzig Zeichen", () => {
    expect(validate({ ...ok, name: "ab" }, HEUTE).map((x) => x.feld)).toEqual(["name"]);
    expect(validate({ ...ok, name: "  ab  " }, HEUTE)).toHaveLength(1);
    expect(validate({ ...ok, name: "abc" }, HEUTE)).toEqual([]);
    expect(validate({ ...ok, name: "a".repeat(80) }, HEUTE)).toEqual([]);
    expect(validate({ ...ok, name: "a".repeat(81) }, HEUTE).map((x) => x.feld)).toEqual(["name"]);
  });

  it("verlangt mindestens einen Kanal und eine bekannte Art", () => {
    expect(validate({ ...ok, kanaele: [] }, HEUTE).map((x) => x.feld)).toEqual(["kanaele"]);
    expect(validate({ ...ok, kanaele: ["brieftaube"] }, HEUTE).map((x) => x.feld)).toEqual(["kanaele"]);
    expect(validate({ ...ok, typ: "hochzeit" }, HEUTE).map((x) => x.feld)).toEqual(["typ"]);
    expect(validate({ typ: "", name: "", datum: "", kanaele: [] }, HEUTE).map((x) => x.feld)).toEqual(["typ", "name", "datum", "kanaele"]);
  });

  it("baut die Eingabe aus Formular und Profil", () => {
    const leer = toInput(EMPTY_FORM, {});
    expect(leer).toMatchObject({ typ: "tag-der-offenen-tuer", organisation: "kmu", kanaele: DEFAULT_KANAELE, inserate: false, name: "", datum: "" });
    expect(toInput(EMPTY_FORM, { organisationstyp: "verein" }).typ).toBe("dorffest");
    const eigen = toInput({ typ: "messe", name: "  Stand OLMA  ", datum: "2026-10-15", kanaele: ["whatsapp", "website"], inserate: true }, { organisationstyp: "kmu", kanaele: [{ name: "Instagram" }] });
    expect(eigen).toEqual({ typ: "messe", name: "Stand OLMA", datum: "2026-10-15", kanaele: ["website", "whatsapp"], inserate: true, organisation: "kmu" });
    expect(toInput(EMPTY_FORM, { kanaele: [{ name: "Instagram" }] }).kanaele).toEqual(["instagram"]);
  });

  it("macht aus einer gespeicherten Eingabe wieder ein Formular", () => {
    expect(formFrom(null)).toEqual(EMPTY_FORM);
    const f = formFrom(base);
    expect(f).toEqual({ typ: base.typ, name: base.name, datum: base.datum, kanaele: base.kanaele, inserate: false });
    expect(f.kanaele).not.toBe(base.kanaele);
  });

  it("bildet das heutige Datum in der Schweizer Zeit", () => {
    expect(todayIso(new Date("2026-10-04T22:30:00Z"))).toBe("2026-10-05"); // Sommerzeit: 00:30 am 05.10.
    expect(todayIso(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01"); // Winterzeit: 00:30 am 01.01.
    expect(todayIso(new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
  });
});

describe("anlass-planer: Kalenderdatei", () => {
  const p = plan({ kanaele: ["website", "instagram", "aushang"] });
  const ics = buildIcs(p, base, { now: new Date("2026-10-05T08:30:15Z") });
  const unfold = (s: string) => s.replace(/\r\n /g, "");

  it("hat die Struktur einer Kalenderdatei mit einem Ereignis je Aufgabe und einem für den Anlass", () => {
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines[1]).toBe("VERSION:2.0");
    expect(lines[lines.length - 2]).toBe("END:VCALENDAR");
    expect(lines[lines.length - 1]).toBe("");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(p.aufgaben.length + 1);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(p.aufgaben.length + 1);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics).toContain("DTSTAMP:20261005T083015Z");
  });

  it("legt ganztägige Ereignisse an", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20261114\r\nDTEND;VALUE=DATE:20261115");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260904\r\nDTEND;VALUE=DATE:20260905");
    expect(ics).not.toMatch(/DTSTART:/);
    expect(unfold(ics)).toContain("SUMMARY:Tag der offenen Tür Malerei Keller");
    expect(unfold(ics)).toContain("SUMMARY:Ankündigung auf Instagram veröffentlichen (Tag der offenen Tür Malerei Keller)");
    const uids = unfold(ics).match(/^UID:.*$/gm) ?? [];
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids).toHaveLength(p.aufgaben.length + 1);
  });

  it("nennt das Werkzeug mit Adresse in der Beschreibung", () => {
    expect(unfold(ics)).toContain("Werkzeug: https://tools.alperna.ch/tools/post-generator");
    expect(unfold(ics)).toContain("Kanal: Instagram");
  });

  it("faltet jede Zeile auf höchstens 75 Oktette, ohne ein Zeichen zu trennen", () => {
    const lang = buildIcs(p, { ...base, name: "Tag der offenen Tür für Bäckerei Müller-Schönenberger in Gossau äöü ÄÖÜ ß" }, { now: new Date("2026-10-05T08:30:00Z") });
    const enc = new TextEncoder();
    const lines = lang.split("\r\n");
    for (const l of lines) expect(enc.encode(l).length, l).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    expect(unfold(lang)).toContain("SUMMARY:Tag der offenen Tür für Bäckerei Müller-Schönenberger in Gossau äöü ÄÖÜ ß");
    expect(lang).not.toContain("�");
  });

  it("maskiert Komma, Semikolon, Backslash und Zeilenumbruch", () => {
    expect(icsEscape("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
    expect(icsEscape("x\r\ny")).toBe("x\\ny");
    const ics2 = buildIcs(p, { ...base, name: "Fest, mit Musik; Tanz" }, { now: new Date("2026-10-05T08:30:00Z") });
    expect(unfold(ics2)).toContain("SUMMARY:Fest\\, mit Musik\\; Tanz");
    expect(unfold(ics2)).toContain("X-WR-CALNAME:Zeitplan: Fest\\, mit Musik\\; Tanz");
    expect(unfold(ics2)).not.toContain("SUMMARY:Fest, mit");
  });

  it("benennt die Dateien nach dem Anlass", () => {
    expect(icsFilename(base)).toBe("zeitplan-tag-der-offenen-tuer-malerei-keller.ics");
    expect(pdfFilename({ name: "Dorffest Trogen" })).toBe("zeitplan-dorffest-trogen.pdf");
    expect(icsFilename({ name: "???" })).toBe("zeitplan-dokument.ics");
  });
});

describe("anlass-planer: Stand im Browser", () => {
  const gut = { v: 1, phase: "result", input: base, erledigt: ["g-ziel", "g-team"], output: { erstellt: HEUTE } };

  it("liefert bei kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, "x", 7, [], {}, { v: 2, phase: "result", input: base }, { v: 1, input: "kaputt", phase: "result" }]) {
      expect(parseState(raw), String(JSON.stringify(raw))).toEqual(EMPTY_STATE);
    }
  });

  it("liest einen gültigen Stand unverändert", () => {
    expect(parseState(gut)).toEqual(gut);
    expect(parseState(JSON.parse(JSON.stringify(gut)))).toEqual(gut);
  });

  it("macht aus einem Ergebnis ohne gültige Eingabe wieder das Formular", () => {
    expect(parseState({ v: 1, phase: "result", erledigt: [] })).toEqual(EMPTY_STATE);
    expect(parseState({ ...gut, input: { ...base, name: "ab" } }).phase).toBe("edit");
    expect(parseState({ ...gut, input: { ...base, datum: "2026-02-30" } }).input).toBeNull();
    expect(parseState({ ...gut, input: { ...base, typ: "hochzeit" } }).input).toBeNull();
    expect(parseState({ ...gut, input: { ...base, kanaele: ["brieftaube"] } }).input).toBeNull();
    expect(parseState({ ...gut, phase: "unbekannt" }).phase).toBe("edit");
  });

  it("behält ein vergangenes Datum, wenn die Person das Ergebnis später wieder öffnet", () => {
    const alt = parseState({ ...gut, input: { ...base, datum: "2020-01-01" } });
    expect(alt.phase).toBe("result");
    expect(alt.input?.datum).toBe("2020-01-01");
  });

  it("räumt Kanäle, Haken und Datum der Erstellung auf", () => {
    const s = parseState({ ...gut, input: { ...base, kanaele: ["foo", "instagram", "website", "website"], inserate: "ja", organisation: "verein" }, erledigt: ["a", "a", 3, null, "", "x".repeat(81), "b"], output: { erstellt: "gestern" } });
    expect(s.input?.kanaele).toEqual(["website", "instagram"]);
    expect(s.input?.inserate).toBe(false);
    expect(s.input?.organisation).toBe("verein");
    expect(s.erledigt).toEqual(["a", "b"]);
    expect(s.output).toBeUndefined();
  });

  it("ignoriert unbekannte IDs beim Zählen und Aufräumen der Haken", () => {
    const p = plan();
    const erledigt = ["g-ziel", "g-team", "gibt-es-nicht", "g-ziel"];
    expect(cleanErledigt(p, erledigt)).toEqual(["g-ziel", "g-team"]);
    expect(erledigtCount(p, erledigt)).toBe(2);
    expect(erledigtCount(p, [])).toBe(0);
    expect(erledigtCount(p, ["k-wa-einladung"])).toBe(0); // WhatsApp ist in diesem Plan nicht gewählt
  });

  it("setzt und löscht Haken, ohne die Liste zu ändern", () => {
    const start = ["a"];
    const mit = toggleErledigt(start, "b", true);
    expect(mit).toEqual(["a", "b"]);
    expect(start).toEqual(["a"]);
    expect(toggleErledigt(mit, "b", true)).toEqual(["a", "b"]);
    expect(toggleErledigt(mit, "a", false)).toEqual(["b"]);
    expect(toggleErledigt([], "x", false)).toEqual([]);
  });
});

describe("anlass-planer: Dokument, Eingabe und Ausgabe", () => {
  it("schreibt die Eingabe fürs CRM, eine Angabe je Zeile", () => {
    expect(eingabeText(base)).toBe(
      ["Art: Tag der offenen Tür", "Name: Tag der offenen Tür Malerei Keller", "Datum: 14.11.2026", "Kanäle: Website, Instagram, Aushang und Flyer", "Bezahlte Inserate: nein"].join("\n"),
    );
    expect(eingabeText({ ...base, inserate: true, kanaele: ["presse"] })).toContain("Kanäle: Lokalzeitung und Anzeiger\nBezahlte Inserate: ja");
  });

  it("schreibt die Ausgabe als Markdown mit der Meldung vor der Tabelle", () => {
    const md = ausgabeText(plan(), base, { firma: "Malerei Keller" });
    expect(md.startsWith("# Zeitplan: Tag der offenen Tür Malerei Keller\n")).toBe(true);
    expect(md).toContain("_Tag der offenen Tür, Samstag, 14.11.2026_");
    expect(md.indexOf("7 Aufgaben sind schon fällig")).toBeLessThan(md.indexOf("| Datum | Aufgabe | Kanal |"));
    expect(md).toContain("| 04.09.2026 | Ziel und Budget klären | intern |");
    expect(md).toContain("| 14.11.2026 | Stories vom Anlass veröffentlichen | Instagram |");
    expect(md).not.toContain("[ ]");
  });

  it("hält die Ausgabe in jeder Art mit den Standardkanälen unter 1'900 Zeichen", () => {
    for (const typ of TYP_KEYS) {
      for (const organisation of ["kmu", "verein"] as const) {
        const input: PlanInput = { ...base, typ, organisation };
        expect(ausgabeText(buildPlan(input, HEUTE), input).length, `${typ} ${organisation}`).toBeLessThanOrEqual(1900);
      }
    }
  });

  it("baut das Dokument für Word, PDF und Kopieren mit Kästchen zum Abhaken", () => {
    const p = plan();
    const doc = toDocument(p, base, { firma: " Malerei Keller ", erledigt: ["g-ziel", "gibt-es-nicht"] });
    expect(doc.title).toBe("Zeitplan: Tag der offenen Tür Malerei Keller");
    expect(doc.subtitle).toBe("Tag der offenen Tür, Samstag, 14.11.2026");
    expect(doc.firma).toBe("Malerei Keller");
    expect(doc.filename).toBe("zeitplan-tag-der-offenen-tuer-malerei-keller");
    const table = doc.blocks.find((b) => b.type === "table");
    expect(table?.type === "table" && table.header).toEqual(["Datum", "Aufgabe", "Kanal", "Erledigt"]);
    if (table?.type !== "table") throw new Error("keine Tabelle");
    expect(table.rows).toHaveLength(p.aufgaben.length);
    expect(table.rows.filter((r) => r[3] === "[x]")).toHaveLength(1);
    expect(table.rows.find((r) => r[3] === "[x]")?.[1]).toContain("Ziel und Budget klären");
    expect(table.rows[0][0]).toBe("Fr 04.09.2026");
    expect(table.rows[0][1]).toContain("(schon fällig)");
    const facts = doc.blocks.find((b) => b.type === "facts");
    expect(facts?.type === "facts" && facts.items.map((i) => i.label)).toEqual(["Anlass", "Art", "Datum", "Kanäle", "Bezahlte Inserate", "Aufgaben"]);
    const last = doc.blocks[doc.blocks.length - 1];
    expect(last.type === "paragraph" && last.text).toContain("Richtwert von Alperna, keine Statistik");
    expect(toDocument(p, base).firma).toBeUndefined();
  });

  it("nennt Hinweise zu Fristen in der Zeile der Aufgabe", () => {
    const gv: PlanInput = { ...base, typ: "generalversammlung", name: "Generalversammlung FC Trogen", organisation: "verein" };
    const doc = toDocument(buildPlan(gv, "2026-01-01"), gv);
    const table = doc.blocks.find((b) => b.type === "table");
    if (table?.type !== "table") throw new Error("keine Tabelle");
    const zeile = table.rows.find((r) => r[1].startsWith("Einladung samt Traktanden"));
    expect(zeile?.[1]).toBe("Einladung samt Traktanden versenden (Frist laut Statuten prüfen)");
  });
});
