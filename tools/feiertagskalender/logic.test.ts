import { describe, expect, it } from "vitest";
import anlaesseJson from "@/data/anlaesse-ch.json";
import feiertageJson from "@/data/feiertage.json";
import schulferienJson from "@/data/schulferien.json";
import { brandHits } from "@/lib/brand-rules";
import { toMarkdown } from "@/lib/export/model";
import {
  ALARM_TRIGGER,
  CSV_BOM,
  CSV_HEADER,
  EMPTY_STATE,
  MAX_TERMINE,
  addDays,
  addTermin,
  FORMATE,
  VARIANTEN,
  MONATE,
  anlaesseDataSchema,
  artLabel,
  ausgabeText,
  brancheAusProfil,
  buildCalendar,
  buildCsv,
  buildIcs,
  byMonth,
  counts,
  countsText,
  csvCell,
  csvFilename,
  dateLabel,
  easterSunday,
  eingabeText,
  entriesFor,
  entryLine,
  feiertageKantone,
  ferienFor,
  ferienKantone,
  foldLine,
  formProblem,
  holidaysFor,
  icsFilename,
  inputFromState,
  isValidDatum,
  jahresRaster,
  kanaeleAusProfil,
  kanaeleVorschlag,
  nthWeekday,
  parseAnlaesse,
  parseFeiertage,
  parseSchulferien,
  parseState,
  removeTermin,
  resolveDatum,
  resolveRule,
  schulferienDataSchema,
  selectAnlaesse,
  toDocument,
  toIso,
  weekdayIndex,
  yearOptions,
  type Calendar,
  type Input,
  type KalenderData,
} from "./logic";

const DATA: KalenderData = { anlaesse: parseAnlaesse(anlaesseJson), ferien: parseSchulferien(schulferienJson), feiertage: parseFeiertage(feiertageJson) };
const NOW = new Date("2026-10-05T10:00:00Z");
const NO_DATA: KalenderData = { anlaesse: null, ferien: null, feiertage: null };

const input = (patch: Partial<Input> = {}): Input => ({ jahr: 2026, kanton: "SG", branche: "handwerk", kanaele: ["instagram", "google"], termine: [], ...patch });
const cal = (patch: Partial<Input> = {}, data: KalenderData = DATA): Calendar => buildCalendar(input(patch), data);
const find = (c: Calendar, titel: string) => c.entries.find((e) => e.titel === titel);

describe("feiertagskalender: Datum und Regeln", () => {
  it("rechnet den Ostersonntag (bekannte Jahre)", () => {
    expect(toIso(easterSunday(2024))).toBe("2024-03-31");
    expect(toIso(easterSunday(2025))).toBe("2025-04-20");
    expect(toIso(easterSunday(2026))).toBe("2026-04-05");
    expect(toIso(easterSunday(2027))).toBe("2027-03-28");
    expect(toIso(easterSunday(2038))).toBe("2038-04-25");
  });

  it("findet den n-ten Wochentag eines Monats und meldet null, wenn es ihn nicht gibt", () => {
    expect(nthWeekday(2026, 5, 6, 2)).toBe("2026-05-10"); // zweiter Sonntag im Mai
    expect(nthWeekday(2026, 2, 0, 5)).toBeNull(); // fünfter Montag im Februar 2026 gibt es nicht
    expect(nthWeekday(2026, 13, 0, 1)).toBeNull();
  });

  it("Muttertag 2026 ist der 10.05., 2027 der 09.05.", () => {
    expect(resolveRule("regel:2-sonntag-mai", 2026)).toEqual({ von: "2026-05-10", bis: "2026-05-10" });
    expect(resolveRule("regel:2-sonntag-mai", 2027)?.von).toBe("2027-05-09");
  });

  it("Vätertag ist der erste Sonntag im Juni", () => {
    expect(resolveRule("regel:1-sonntag-juni", 2026)?.von).toBe("2026-06-07");
    expect(weekdayIndex("2027-06-06")).toBe(6);
    expect(resolveRule("regel:1-sonntag-juni", 2027)?.von).toBe("2027-06-06");
  });

  it("Black Friday 2026 ist der 27.11. (Freitag nach dem vierten Donnerstag im November)", () => {
    expect(resolveRule("regel:black-friday", 2026)?.von).toBe("2026-11-27");
    expect(resolveRule("regel:black-friday", 2025)?.von).toBe("2025-11-28");
    expect(resolveRule("regel:black-friday", 2024)?.von).toBe("2024-11-29");
    expect(weekdayIndex("2026-11-27")).toBe(4);
  });

  it("Fasnacht liegt 52 bis 47 Tage vor Ostern, die Basler Fasnacht 41 bis 39 Tage", () => {
    expect(resolveRule("ostern:-52..-47", 2026)).toEqual({ von: "2026-02-12", bis: "2026-02-17" });
    expect(resolveRule("ostern:-52..-47", 2027)).toEqual({ von: "2027-02-04", bis: "2027-02-09" });
    expect(resolveRule("ostern:-41..-39", 2026)).toEqual({ von: "2026-02-23", bis: "2026-02-25" });
    expect(resolveRule("ostern:-41..-39", 2027)).toEqual({ von: "2027-02-15", bis: "2027-02-17" });
    expect(weekdayIndex("2026-02-12")).toBe(3); // Schmutziger Donnerstag
    expect(weekdayIndex("2026-02-23")).toBe(0); // Montag nach Aschermittwoch
  });

  it("rechnet Ostern mit Vorzeichen und feste Tage mit Bereichen", () => {
    expect(resolveRule("ostern:0", 2026)?.von).toBe("2026-04-05");
    expect(resolveRule("ostern:+39", 2026)?.von).toBe("2026-05-14"); // Auffahrt
    expect(resolveRule("ostern:-2", 2026)?.von).toBe("2026-04-03"); // Karfreitag
    expect(resolveRule("fix:12-01/12-24", 2026)).toEqual({ von: "2026-12-01", bis: "2026-12-24" });
    expect(resolveRule("fix:08-01", 2026)).toEqual({ von: "2026-08-01", bis: "2026-08-01" });
  });

  it("fix:02-29 gibt es nur in Schaltjahren; falsche Angaben ergeben null", () => {
    expect(resolveRule("fix:02-29", 2026)).toBeNull();
    expect(resolveRule("fix:02-29", 2028)?.von).toBe("2028-02-29");
    expect(resolveRule("fix:13-01", 2026)).toBeNull();
    expect(resolveRule("regel:gibt-es-nicht", 2026)).toBeNull();
    expect(resolveRule("irgendwas", 2026)).toBeNull();
    expect(resolveRule("fix:08-01", Number.NaN)).toBeNull();
  });

  it("fix-jahr gilt nur im genannten Jahr; eine Liste nimmt die erste passende Angabe", () => {
    const olma = ["fix-jahr:2026-10-08/2026-10-18", "fix-jahr:2027-10-14/2027-10-24"];
    expect(resolveDatum(olma, 2026)).toEqual({ von: "2026-10-08", bis: "2026-10-18" });
    expect(resolveDatum(olma, 2027)).toEqual({ von: "2027-10-14", bis: "2027-10-24" });
    expect(resolveDatum(olma, 2028)).toBeNull();
    expect(resolveRule("fix-jahr:2026-10-18/2026-10-08", 2026)).toBeNull();
  });

  it("Schulbeginn ist der Tag nach den Sommerferien des Kantons, ohne Sommerferien null", () => {
    const sg = DATA.ferien!.ferien.filter((f) => f.kanton === "SG");
    expect(resolveRule("regel:schulbeginn", 2026, sg)).toEqual({ von: "2026-08-10", bis: "2026-08-10" });
    expect(resolveRule("regel:schulbeginn", 2027, sg)?.von).toBe("2027-08-16");
    expect(resolveRule("regel:schulbeginn", 2026, [])).toBeNull();
    expect(resolveRule("regel:schulbeginn", 2029, sg)).toBeNull();
  });

  it("prüft die Schreibweise der Datumsangaben", () => {
    for (const ok of ["fix:01-01", "fix:12-01/12-24", "ostern:0", "ostern:+39", "ostern:-52..-47", "regel:black-friday", "fix-jahr:2026-10-08/2026-10-18"]) {
      expect(isValidDatum(ok), ok).toBe(true);
    }
    for (const bad of ["fix:2-1", "fix:12-24/12-01", "ostern:+999", "ostern:-47..-52", "regel:xyz", "fix-jahr:2026-02-30", "", "heute"]) {
      expect(isValidDatum(bad), bad).toBe(false);
    }
  });

  it("addDays geht über Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("kaputt", 3)).toBe("kaputt");
  });
});

describe("feiertagskalender: Datensätze", () => {
  it("anlaesse-ch.json erfüllt das Schema, hat eine https-Quelle und löst jeden Anlass in 2026 oder 2027 auf", () => {
    const r = anlaesseDataSchema.safeParse(anlaesseJson);
    expect(r.success).toBe(true);
    const a = r.success ? r.data : null;
    expect(a?.meta.url.startsWith("https://")).toBe(true);
    expect(a?.meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a?.meta.source.length).toBeGreaterThan(20);
    for (const l of a?.meta.links ?? []) expect(l.url.startsWith("https://")).toBe(true);
    const sommer = DATA.ferien!.ferien.filter((f) => f.kanton === "SG");
    for (const x of a?.anlaesse ?? []) {
      const hit = [2026, 2027].some((y) => resolveDatum(x.datum, y, sommer) !== null);
      expect(hit, `${x.id} löst nicht auf`).toBe(true);
      for (const v of x.vorschlag.varianten) expect(v.hook, `${x.id}: ${v.hook}`).not.toMatch(/[!—]|\bjetzt\b/i);
    }
  });

  it("jeder Vorschlag hat drei Varianten mit drei verschiedenen Formaten aus der Liste, ohne «Foto mit kurzem Text»", () => {
    const rows = parseAnlaesse(anlaesseJson)!.anlaesse;
    expect(VARIANTEN).toBe(3);
    expect(FORMATE).not.toContain("Foto mit kurzem Text");
    for (const x of rows) {
      const formate = x.vorschlag.varianten.map((v) => v.format);
      expect(formate, `${x.id} ${x.branchen}`).toHaveLength(3);
      expect(new Set(formate).size, `${x.id} ${x.branchen}: drei verschiedene Formate`).toBe(3);
      for (const f of formate) expect(FORMATE as readonly string[]).toContain(f);
      expect(new Set(x.vorschlag.varianten.map((v) => v.hook)).size).toBe(3);
    }
    expect(JSON.stringify(rows)).not.toMatch(/Foto mit kurzem Text/);
  });

  it("die Texte der Varianten verletzen keine harte Regel der Alperna-Stimme und enthalten kein Ausrufezeichen", () => {
    for (const x of parseAnlaesse(anlaesseJson)!.anlaesse) {
      for (const v of x.vorschlag.varianten) {
        const hits = brandHits(`${v.bildidee}\n${v.hook}`).filter((h) => h.level === "hart");
        expect(hits, `${x.id}: ${v.hook}`).toEqual([]);
        expect(`${v.bildidee} ${v.hook}`).not.toMatch(/[!]|\bgarantiert\b|\bnur noch\b|\bNr\. 1\b/);
      }
      expect(x.vorschlag.titel).not.toMatch(/[!—]/);
    }
  });

  it("deckt jede Branchengruppe der gemeinsamen Branchenliste ab, jede mit mindestens einem Vorschlag je grossem Anlass", () => {
    const rows = parseAnlaesse(anlaesseJson)!.anlaesse;
    for (const b of ["handwerk", "gastronomie", "dienstleistung", "detailhandel", "verein"] as const) {
      const sel = selectAnlaesse(rows, "SG", b).map((a) => a.id);
      for (const id of ["neujahr", "ostern", "muttertag", "weihnachten", "jahresende", "halloween"]) expect(sel, `${b}: ${id}`).toContain(id);
    }
  });

  it("enthält Halloween, Räbeliechtli und Sechseläuten mit Quelle in den Links", () => {
    const d = parseAnlaesse(anlaesseJson)!;
    const ids = new Set(d.anlaesse.map((a) => a.id));
    for (const id of ["halloween", "raebeliechtli", "sechselaeuten"]) expect(ids.has(id), id).toBe(true);
    const urls = (d.meta.links ?? []).map((l) => l.url).join(" ");
    expect(urls).toContain("stadt-zuerich.ch");
    expect(urls).toContain("famigros-warum-feiern-wir-halloween");
    expect(urls).toContain("karussell-baden.ch");
  });

  it("schulferien.json erfüllt das Schema, hat eine https-Quelle und geordnete Blöcke", () => {
    const r = schulferienDataSchema.safeParse(schulferienJson);
    expect(r.success).toBe(true);
    const s = r.success ? r.data : null;
    expect(s?.meta.url.startsWith("https://")).toBe(true);
    expect(s?.ferien.length).toBeGreaterThan(100);
    for (const f of s?.ferien ?? []) expect(f.bis >= f.von).toBe(true);
    for (const k of ["SG", "AR", "AI", "TG", "ZH", "GR"]) expect(ferienKantone(s ?? null)).toContain(k);
  });

  it("feiertage.json wird defensiv gelesen: ein kaputter Eintrag fällt weg, ohne Quelle gilt der Datensatz als fehlend", () => {
    const ok = parseFeiertage(feiertageJson);
    expect(ok).not.toBeNull();
    expect(feiertageKantone(ok)).toContain("SG");
    const broken = { ...feiertageJson, feiertage: [...feiertageJson.feiertage, { id: "x", name: "Kaputt", datum: "irgendwann", kantone: "alle", art: "gesetzlich" }, 42] };
    const one = parseFeiertage(broken);
    expect(one?.feiertage.length).toBe(feiertageJson.feiertage.length);
    expect(parseFeiertage({ ...feiertageJson, meta: { ...feiertageJson.meta, url: "http://example.org" } })).toBeNull();
    expect(parseFeiertage({ ...feiertageJson, feiertage: [] })).toBeNull();
    expect(parseFeiertage(null)).toBeNull();
    expect(parseFeiertage("text")).toBeNull();
  });

  it("verwirft Datensätze ohne https-Quelle", () => {
    expect(parseAnlaesse({ ...anlaesseJson, meta: { ...anlaesseJson.meta, url: "http://feiertage.ch" } })).toBeNull();
    expect(parseSchulferien({ ...schulferienJson, meta: { ...schulferienJson.meta, url: "" } })).toBeNull();
    expect(parseAnlaesse({ meta: anlaesseJson.meta, anlaesse: [] })).toBeNull();
    expect(parseSchulferien(undefined)).toBeNull();
  });
});

describe("feiertagskalender: Filter nach Region und Branche", () => {
  const anl = DATA.anlaesse!.anlaesse;
  const ids = (kanton: string, branche: Parameters<typeof selectAnlaesse>[2]) => selectAnlaesse(anl, kanton, branche).map((a) => a.id);

  it("Fasnacht gibt es nur in belegten Kantonen, die Basler Fasnacht nur in Basel", () => {
    expect(ids("SG", "handwerk")).toContain("fasnacht");
    expect(ids("ZH", "handwerk")).not.toContain("fasnacht");
    expect(ids("BS", "handwerk")).toContain("basler-fasnacht");
    expect(ids("BL", "handwerk")).toContain("basler-fasnacht");
    expect(ids("SG", "handwerk")).not.toContain("basler-fasnacht");
    expect(ids("BS", "handwerk")).not.toContain("fasnacht");
  });

  it("die OLMA erscheint in SG, AR, AI und TG, nicht in Bern", () => {
    for (const k of ["SG", "AR", "AI", "TG"]) expect(ids(k, "handwerk")).toContain("olma");
    expect(ids("BE", "handwerk")).not.toContain("olma");
  });

  it("wählt die Variante der Branche, sonst die Variante «alle»", () => {
    const muttertag = (b: Parameters<typeof selectAnlaesse>[2]) => selectAnlaesse(anl, "SG", b).find((a) => a.id === "muttertag")!.vorschlag.titel;
    expect(muttertag("gastronomie")).toBe("Muttertagsbrunch");
    expect(muttertag("detailhandel")).toBe("Geschenkidee für Mama");
    expect(muttertag("handwerk")).toBe("Danke an alle Mütter");
    expect(muttertag("andere")).toBe("Danke an alle Mütter");
    expect(selectAnlaesse(anl, "SG", "gastronomie").filter((a) => a.id === "muttertag")).toHaveLength(1);
  });

  it("ein Anlass ohne Variante für die Branche und ohne Variante «alle» fehlt (Black Friday)", () => {
    expect(ids("SG", "detailhandel")).toContain("black-friday");
    expect(ids("SG", "dienstleistung")).toContain("black-friday");
    expect(ids("SG", "handwerk")).not.toContain("black-friday");
    expect(ids("SG", "verein")).not.toContain("black-friday");
    expect(ids("SG", "andere")).not.toContain("black-friday");
  });

  it("Vereine bekommen Vereins-Varianten", () => {
    const weihnachten = selectAnlaesse(anl, "SG", "verein").find((a) => a.id === "weihnachten")!;
    expect(weihnachten.vorschlag.titel).toBe("Weihnachtsgruss des Vereins");
  });

  it("das Sechseläuten gibt es nur in Zürich, Halloween überall, das Räbeliechtli in den belegten Kantonen", () => {
    expect(ids("ZH", "handwerk")).toContain("sechselaeuten");
    for (const k of ["SG", "BE", "GE", "TI"]) expect(ids(k, "handwerk"), k).not.toContain("sechselaeuten");
    for (const k of ["SG", "ZH", "BE", "GE", "TI", "VS"]) expect(ids(k, "handwerk"), k).toContain("halloween");
    for (const k of ["AG", "AR", "AI", "BL", "BS", "SG", "TG", "ZH"]) expect(ids(k, "handwerk"), k).toContain("raebeliechtli");
    for (const k of ["BE", "GE", "VS", "TI"]) expect(ids(k, "handwerk"), k).not.toContain("raebeliechtli");
  });
});

describe("feiertagskalender: Sechseläuten", () => {
  it("fällt auf den dritten Montag im April, bei Ostermontag auf den vierten", () => {
    expect(resolveRule("regel:sechselaeuten", 2026)).toEqual({ von: "2026-04-20", bis: "2026-04-20" });
    expect(resolveRule("regel:sechselaeuten", 2027)).toEqual({ von: "2027-04-19", bis: "2027-04-19" });
    expect(resolveRule("regel:sechselaeuten", 2024)).toEqual({ von: "2024-04-15", bis: "2024-04-15" });
    // 2025: Ostermontag ist der 21. April, der dritte Montag; das Fest rückt auf den 28. April (Stadt Zürich, Stadtratsbeschluss 1952).
    expect(toIso(easterSunday(2025))).toBe("2025-04-20");
    expect(resolveRule("regel:sechselaeuten", 2025)).toEqual({ von: "2025-04-28", bis: "2025-04-28" });
    // 2038: Ostersonntag am 25. April, der Ostermontag liegt nach dem dritten Montag (19.); der dritte bleibt.
    expect(resolveRule("regel:sechselaeuten", 2038)).toEqual({ von: "2038-04-19", bis: "2038-04-19" });
  });

  it("liegt in jedem Jahr auf einem Montag im April, nie auf dem Ostermontag", () => {
    for (let y = 2020; y <= 2060; y++) {
      const r = resolveRule("regel:sechselaeuten", y)!;
      expect(r.von.startsWith(`${y}-04-`), String(y)).toBe(true);
      expect(weekdayIndex(r.von), String(y)).toBe(0);
      expect(r.von === addDays(toIso(easterSunday(y)), 1), `${y}: nie am Ostermontag`).toBe(false);
    }
  });

  it("steht im Kalender von Zürich mit dem Hinweis zur Regel", () => {
    const c = cal({ kanton: "ZH", branche: "gastronomie" });
    const e = find(c, "Sechseläuten")!;
    expect(e).toMatchObject({ art: "anlass", von: "2026-04-20" });
    expect(e.hinweis).toMatch(/dritten Montag im April/);
    expect(e.vorschlag?.titel).toBe("Sechseläuten bei uns am Tisch");
    expect(find(cal({ kanton: "SG" }), "Sechseläuten")).toBeUndefined();
  });
});

describe("feiertagskalender: Halloween und Räbeliechtli", () => {
  it("Halloween ist der 31. Oktober", () => {
    expect(find(cal(), "Halloween")).toMatchObject({ art: "anlass", von: "2026-10-31", bis: "2026-10-31" });
    expect(find(cal({ jahr: 2027 }), "Halloween")?.von).toBe("2027-10-31");
  });

  it("das Räbeliechtli steht um den 11. November und trägt den Hinweis, dass jede Gemeinde das Datum festlegt", () => {
    const e = find(cal(), "Räbeliechtli")!;
    expect(e.von).toBe("2026-11-11");
    expect(e.hinweis).toMatch(/jede Gemeinde selbst/);
    expect(find(cal({ kanton: "BE" }), "Räbeliechtli")).toBeUndefined();
  });

  it("der Hinweis eines Anlasses bleibt neben dem Hinweis des Feiertags erhalten", () => {
    const basis = DATA.anlaesse!.anlaesse.find((a) => a.id === "neujahr" && a.branchen === "alle")!;
    const data: KalenderData = {
      anlaesse: { meta: DATA.anlaesse!.meta, anlaesse: [{ ...basis, hinweis: "Hinweis des Anlasses." }] },
      ferien: null,
      feiertage: { ...DATA.feiertage!, feiertage: [{ id: "neujahr", name: "Neujahrstag", datum: "fix:01-01", kantone: "alle", art: "gesetzlich", hinweis: "Hinweis des Feiertags." }] },
    };
    const e = entriesFor(input(), data).find((x) => x.titel === "Neujahr")!;
    expect(e.auchFeiertag).toBe(true);
    expect(e.hinweis).toBe("Hinweis des Anlasses. Hinweis des Feiertags.");
  });
});

describe("feiertagskalender: Jahr auf einen Blick", () => {
  it("setzt zwölf Monate als Zeilen und eine Spalte je vorhandener Art", () => {
    const raster = jahresRaster(cal({ termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür" }] }));
    expect(raster?.type).toBe("grid");
    if (raster?.type !== "grid") return;
    expect(raster.columns).toEqual(["Anlässe", "Feiertage", "Schulferien", "Eigene Termine"]);
    expect(raster.rows.map((r) => r.label)).toEqual([...MONATE]);
    const mai = raster.rows.find((r) => r.label === "Mai")!;
    expect(mai.cells[0]).toBe("10.05. Muttertag");
    expect(mai.cells[1]).toContain("14.05. Auffahrt");
    const juli = raster.rows.find((r) => r.label === "Juli")!;
    expect(juli.cells[2]).toBe("ab 04.07. Sommerferien");
    const november = raster.rows.find((r) => r.label === "November")!;
    expect(november.cells[3]).toBe("14.11. Tag der offenen Tür");
    expect(november.cells[0]).toContain("11.11. Räbeliechtli");
  });

  it("lässt Spalten ohne Einträge weg und gibt ohne jeden Eintrag nichts zurück", () => {
    const ohneTermine = jahresRaster(cal());
    expect(ohneTermine?.type === "grid" && ohneTermine.columns).toEqual(["Anlässe", "Feiertage", "Schulferien"]);
    expect(jahresRaster({ months: byMonth([], 2026) })).toBeNull();
  });

  it("steht in der Jahresübersicht nach dem Hinweis und vor den Monaten", () => {
    const doc = toDocument(cal(), "Malerei Keller, Gossau");
    const i = doc.blocks.findIndex((b) => b.type === "grid");
    expect(i).toBeGreaterThan(1);
    expect(doc.blocks[i - 1].type).toBe("paragraph");
    const md = toMarkdown(doc);
    expect(md).toContain("Dein Jahr auf einen Blick");
    expect(md).toContain("10.05. Muttertag");
  });
});

describe("feiertagskalender: Einträge", () => {
  it("liefert Anlässe, Feiertage und Schulferien sortiert nach Datum", () => {
    const c = cal();
    const dates = c.entries.map((e) => e.von);
    expect([...dates].sort()).toEqual(dates);
    expect(c.entries.length).toBeGreaterThan(20);
    expect(new Set(c.entries.map((e) => e.key)).size).toBe(c.entries.length);
  });

  it("enthält die belegten Anlässe von Malerei Keller (SG, Handwerk, 2026) mit richtigem Datum", () => {
    const c = cal();
    expect(find(c, "Muttertag")?.von).toBe("2026-05-10");
    expect(find(c, "Schweizer Vätertag")?.von).toBe("2026-06-07");
    expect(find(c, "Ostern")?.von).toBe("2026-04-05");
    expect(find(c, "Schulbeginn")?.von).toBe("2026-08-10");
    expect(find(c, "OLMA St. Gallen")).toMatchObject({ von: "2026-10-08", bis: "2026-10-18" });
    expect(find(c, "Fasnacht")).toMatchObject({ von: "2026-02-12", bis: "2026-02-17" });
    expect(find(c, "Black Friday")).toBeUndefined();
  });

  it("Black Friday 2026 steht für den Detailhandel am 27.11.", () => {
    expect(find(cal({ branche: "detailhandel" }), "Black Friday")?.von).toBe("2026-11-27");
  });

  it("ein Tag, der Anlass und Feiertag ist, steht einmal (Neujahr, 1. August, Weihnachten)", () => {
    const c = cal();
    for (const t of ["Neujahr", "Bundesfeier", "Weihnachten"]) {
      const same = c.entries.filter((e) => e.titel === t);
      expect(same, t).toHaveLength(1);
      expect(same[0].auchFeiertag).toBe(true);
      expect(artLabel(same[0])).toBe("Anlass und Feiertag");
    }
    expect(c.entries.filter((e) => e.titel === "Neujahrstag" || e.titel === "Bundesfeiertag")).toHaveLength(0);
  });

  it("zeigt die gesetzlichen Feiertage des Kantons mit Datum und Wochentag", () => {
    const c = cal();
    const karfreitag = find(c, "Karfreitag")!;
    expect(karfreitag).toMatchObject({ art: "feiertag", von: "2026-04-03" });
    expect(dateLabel(karfreitag)).toBe("03.04.2026, Freitag");
    expect(entryLine(karfreitag)).toBe("03.04.2026, Freitag: Karfreitag");
    expect(find(c, "Auffahrt")?.von).toBe("2026-05-14");
    expect(find(c, "Allerheiligen")?.art).toBe("feiertag"); // gilt in SG
    expect(find(cal({ kanton: "ZH" }), "Allerheiligen")).toBeUndefined();
  });

  it("Feiertage mit Bedingung entfallen (AR, Stephanstag, wenn der Weihnachtstag auf Montag oder Freitag fällt)", () => {
    expect(find(cal({ kanton: "AR", jahr: 2026 }), "Stephanstag")).toBeUndefined(); // 25.12.2026 ist ein Freitag
    expect(find(cal({ kanton: "AR", jahr: 2027 }), "Stephanstag")?.von).toBe("2027-12-26");
    expect(holidaysFor("AR", 2026, DATA.feiertage).entfallen[0].grund).toMatch(/Freitag/);
    expect(cal({ kanton: "AR", jahr: 2026 }).note.hinweise.join(" ")).toMatch(/Stephanstag gilt 2026 nicht/);
  });

  it("ortsübliche Tage stehen nicht im Kalender, aber im Hinweis (Aargau)", () => {
    const c = cal({ kanton: "AG" });
    expect(find(c, "Berchtoldstag")).toBeUndefined();
    expect(c.note.hinweise.join(" ")).toMatch(/Ortsübliche Feiertage.*Berchtoldstag/);
  });

  it("Freiburg hat geprüfte Feiertage (katholische Gemeinden), aber keine geprüften Schulferien und sagt es", () => {
    const c = cal({ kanton: "FR" });
    const feiertage = c.entries.filter((e) => e.art === "feiertag" || e.auchFeiertag).map((e) => e.titel);
    expect(feiertage).toEqual(expect.arrayContaining(["Auffahrt", "Bundesfeier", "Neujahr", "Weihnachten", "Karfreitag"]));
    // die reformierten Tage sind ortsüblich und stehen im Hinweis, nicht im Kalender
    expect(find(c, "Ostermontag")).toBeUndefined();
    expect(c.entries.some((e) => e.art === "ferien")).toBe(false);
    expect(find(c, "Schulbeginn")).toBeUndefined();
    const hinweise = c.note.hinweise.join(" ");
    expect(hinweise).toMatch(/Für Freiburg haben wir keine geprüften Schulferien/);
    expect(hinweise).not.toMatch(/keine geprüfte Feiertagsliste/);
    expect(hinweise).toMatch(/Feiertage Freiburg: Freiburg kennt zwei Listen/);
    expect(hinweise).toMatch(/Ortsübliche Feiertage.*Ostermontag/);
    expect(c.note.kantone.join(" ")).toMatch(/Es fehlen FR, GE, JU, SO, VS/);
  });

  it("Schulferien: ein Block je Zeile, über den Jahreswechsel auf das Jahr gekürzt", () => {
    const c = cal();
    const ferien = c.entries.filter((e) => e.art === "ferien");
    expect(ferien.map((e) => e.titel)).toEqual(["Weihnachtsferien", "Frühlingsferien", "Sommerferien", "Herbstferien", "Weihnachtsferien"]);
    expect(ferien[0]).toMatchObject({ von: "2026-01-01", bis: "2026-01-04", vonOrig: "2025-12-20", bisOrig: "2026-01-04" });
    expect(ferien[4]).toMatchObject({ von: "2026-12-19", bis: "2026-12-31", vonOrig: "2026-12-19", bisOrig: "2027-01-03" });
    expect(dateLabel(ferien[2])).toBe("04.07.2026 bis 09.08.2026");
    expect(artLabel(ferien[2])).toBe("Schulferien");
  });

  it("Schulferien je Kanton und Jahr stimmen mit der EDK-Liste überein (SG, ZH, AR 2027)", () => {
    expect(ferienFor("SG", 2027, DATA.ferien).map((f) => [f.name, f.von, f.bis])).toContainEqual(["Sommerferien", "2027-07-10", "2027-08-15"]);
    expect(ferienFor("ZH", 2027, DATA.ferien).find((f) => f.name === "Frühlingsferien")).toMatchObject({ von: "2027-04-24", bis: "2027-05-09" });
    expect(ferienFor("AR", 2027, DATA.ferien).find((f) => f.name === "Herbstferien")).toMatchObject({ von: "2027-10-09", bis: "2027-10-24" });
    expect(ferienFor("OW", 2027, DATA.ferien).some((f) => f.name === "Weihnachtsferien" && f.von === "2027-12-24")).toBe(true);
    expect(ferienFor("FR", 2026, DATA.ferien)).toEqual([]);
    expect(ferienFor("SG", 2030, DATA.ferien)).toEqual([]);
  });

  it("2027 beginnt mit den Weihnachtsferien aus 2026 und zeigt die OLMA 2027", () => {
    const c = cal({ jahr: 2027 });
    const erste = c.entries.find((e) => e.art === "ferien")!;
    expect(erste).toMatchObject({ titel: "Weihnachtsferien", von: "2027-01-01", bis: "2027-01-03", vonOrig: "2026-12-19" });
    expect(find(c, "OLMA St. Gallen")).toMatchObject({ von: "2027-10-14", bis: "2027-10-24" });
    expect(find(c, "Muttertag")?.von).toBe("2027-05-09");
  });

  it("ein Jahr ohne Daten (2030) ergibt Feiertage und Anlässe nach Regel, Schulferien fehlen und der Hinweis sagt es", () => {
    const c = cal({ jahr: 2030 });
    expect(c.entries.some((e) => e.art === "ferien")).toBe(false);
    expect(find(c, "Schulbeginn")).toBeUndefined();
    expect(find(c, "OLMA St. Gallen")).toBeUndefined();
    expect(find(c, "Ostern")).toBeDefined();
    const h = c.note.hinweise.join(" ");
    expect(h).toMatch(/Für 2030 liegen für St. Gallen keine Schulferien vor/);
    expect(h).toMatch(/Für 2030 sind sie nach denselben Regeln gerechnet/);
  });

  it("arbeitet ohne Datensätze weiter (alle null) und fällt bei den Feiertagen auf die kleine Liste zurück", () => {
    const c = cal({ termine: [{ datum: "2026-03-03", titel: "Messe" }] }, NO_DATA);
    expect(c.entries.map((e) => e.titel)).toEqual(["Neujahrstag", "Messe", "Auffahrt", "Bundesfeiertag", "Weihnachtstag"]);
    const h = c.note.hinweise.join(" ");
    expect(h).toMatch(/Liste der Anlässe konnte nicht gelesen werden/);
    expect(h).toMatch(/Schulferien konnten nicht gelesen werden/);
    expect(c.note.gruppen[0].titel).toBe("Feiertage");
    expect(c.note.gruppen[0].links.length).toBeGreaterThan(0);
  });

  it("Datensätze einzeln null: der Rest bleibt", () => {
    expect(entriesFor(input(), { ...DATA, ferien: null }).some((e) => e.art === "ferien")).toBe(false);
    expect(entriesFor(input(), { ...DATA, anlaesse: null }).some((e) => e.art === "anlass")).toBe(false);
    expect(entriesFor(input(), { ...DATA, feiertage: null }).some((e) => e.titel === "Karfreitag")).toBe(false);
  });
});

describe("feiertagskalender: eigene Termine", () => {
  it("sortiert die Termine in den Kalender und zählt Termine ausserhalb des Jahres", () => {
    const termine = [
      { datum: "2026-09-01", titel: "Tag der offenen Tür" },
      { datum: "2026-03-03", titel: "Messe in Wil" },
      { datum: "2027-01-15", titel: "Nächstes Jahr" },
    ];
    const c = cal({ termine });
    const mine = c.entries.filter((e) => e.art === "termin");
    expect(mine.map((e) => e.titel)).toEqual(["Messe in Wil", "Tag der offenen Tür"]);
    expect(artLabel(mine[0])).toBe("Eigener Termin");
    expect(c.note.hinweise.join(" ")).toMatch(/Ein eigener Termin liegt nicht in 2026 und fehlt im Kalender/);
    expect(cal({ termine, jahr: 2027 }).entries.filter((e) => e.art === "termin")).toHaveLength(1);
  });

  it("überspringt ungültige Daten und leere Titel, ohne abzustürzen", () => {
    const c = cal({ termine: [{ datum: "2026-02-30", titel: "Gibt es nicht" }, { datum: "kein Datum", titel: "x" }, { datum: "2026-05-05", titel: "  " }] });
    expect(c.entries.filter((e) => e.art === "termin")).toHaveLength(1); // der leere Titel wird zu «Termin»
    expect(c.entries.find((e) => e.art === "termin")?.titel).toBe("Termin");
  });

  it("addTermin sortiert, kürzt den Titel auf 60 Zeichen und lehnt Ungültiges ab", () => {
    const a = addTermin([], "2026-06-01", "  Sommerfest   im   Garten ");
    expect(a).toEqual({ ok: true, list: [{ datum: "2026-06-01", titel: "Sommerfest im Garten" }] });
    const b = addTermin(a.ok ? a.list : [], "2026-03-01", "x".repeat(100));
    expect(b.ok && b.list[0].datum).toBe("2026-03-01");
    expect(b.ok && b.list[0].titel.length).toBe(60);
    expect(addTermin([], "2026-02-30", "Titel")).toEqual({ ok: false, error: "Wähle ein gültiges Datum für den Termin." });
    expect(addTermin([], "", "Titel").ok).toBe(false);
    expect(addTermin([], "2026-06-01", "   ")).toEqual({ ok: false, error: "Gib dem Termin einen Titel." });
    expect(addTermin(a.ok ? a.list : [], "2026-06-01", "sommerfest im garten")).toEqual({ ok: false, error: "Diesen Termin gibt es schon." });
  });

  it(`erlaubt höchstens ${MAX_TERMINE} Termine`, () => {
    let list: { datum: string; titel: string }[] = [];
    for (let i = 0; i < MAX_TERMINE; i++) {
      const r = addTermin(list, `2026-01-${String(i + 1).padStart(2, "0")}`, `Termin ${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) list = r.list;
    }
    expect(list).toHaveLength(MAX_TERMINE);
    const over = addTermin(list, "2026-02-01", "Einer zu viel");
    expect(over).toEqual({ ok: false, error: `Du kannst höchstens ${MAX_TERMINE} eigene Termine eintragen.` });
    expect(removeTermin(list, 0)).toHaveLength(MAX_TERMINE - 1);
    expect(removeTermin(list, 99)).toHaveLength(MAX_TERMINE);
  });
});

describe("feiertagskalender: Monate", () => {
  it("liefert immer zwölf Monate, auch leere, und ordnet Mehrtägiges dem Startmonat zu", () => {
    const c = cal();
    expect(c.months).toHaveLength(12);
    expect(c.months.map((m) => m.name)[0]).toBe("Januar");
    expect(c.months[11].label).toBe("Dezember 2026");
    expect(c.months.find((m) => m.name === "März")?.entries).toEqual([]);
    expect(c.months.find((m) => m.name === "Juli")?.entries.map((e) => e.titel)).toEqual(["Sommerferien"]);
    expect(c.months.find((m) => m.name === "August")?.entries.map((e) => e.titel)).toEqual(["Bundesfeier", "Schulbeginn"]);
    expect(c.months.flatMap((m) => m.entries)).toHaveLength(c.entries.length);
    expect(byMonth([], 2026)).toHaveLength(12);
  });

  it("zählt Anlässe, Feiertage, Ferien und Termine", () => {
    const c = cal({ termine: [{ datum: "2026-03-03", titel: "Messe" }] });
    const n = counts(c.entries);
    expect(n.anlaesse).toBe(15);
    expect(n.feiertage).toBe(9);
    expect(n.ferien).toBe(5);
    expect(n.termine).toBe(1);
    expect(countsText(c.entries)).toBe("15 Anlässe, 9 Feiertage, 5 Schulferienblöcke, 1 eigener Termin");
  });
});

describe("feiertagskalender: Hinweis mit Quellen", () => {
  it("nennt die Quellen mit Links und die belegten Kantone", () => {
    const n = cal().note;
    expect(n.gruppen.map((g) => g.titel)).toEqual(["Anlässe", "Schulferien", "Feiertage"]);
    for (const g of n.gruppen) {
      expect(g.links.length).toBeGreaterThan(0);
      for (const l of g.links) expect(l.url.startsWith("https://")).toBe(true);
    }
    expect(n.gruppen[1].links.some((l) => l.url.includes("edk.ch"))).toBe(true);
    expect(n.gruppen[2].links[0].url).toContain("sg.ch");
    expect(n.kantone[0]).toMatch(/^Schulferien sind für 21 Kantone belegt/);
    expect(n.kantone[1]).toBe("Feiertage sind für alle 26 Kantone belegt.");
  });

  it("gibt die Hinweise des Datensatzes für den Kanton weiter (Graubünden)", () => {
    const h = cal({ kanton: "GR" }).note.hinweise.join(" ");
    expect(h).toMatch(/Schulferien Graubünden: Nur Herbst- und Weihnachtsferien/);
    expect(h).toMatch(/Feiertage Graubünden: Die Gemeinden/);
  });
});

describe("feiertagskalender: Kalenderdatei (.ics)", () => {
  const c = cal({ termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür, mit Apéro; 10 Uhr" }] });
  const ics = buildIcs(c, { firma: "Malerei Keller, Gossau", now: NOW });
  const lines = ics.split("\r\n");

  it("ist ein gültiges iCalendar-Gerüst mit CRLF und einem Termin je Eintrag", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(c.entries.length);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(c.entries.length);
    expect(ics).toContain("DTSTAMP:20261005T100000Z");
    expect(ics).toContain("X-WR-CALNAME:Feiertagskalender 2026 Malerei Keller\\, Gossau");
  });

  it("ist Ganztag: DTSTART und DTEND als Datum, DTEND am Tag nach dem Ende", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20260510\r\nDTEND;VALUE=DATE:20260511\r\n"); // Muttertag
    expect(ics).toContain("DTSTART;VALUE=DATE:20260704\r\nDTEND;VALUE=DATE:20260810\r\n"); // Sommerferien, mehrtägig
    expect(ics).toContain("DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261225\r\n"); // Adventsfenster
    expect(ics).toContain("DTSTART;VALUE=DATE:20260101\r\nDTEND;VALUE=DATE:20260105\r\n"); // Weihnachtsferien, auf das Jahr gekürzt
    expect(ics).not.toMatch(/DTSTART:\d/);
  });

  it("setzt das Präfix «Beitrag: » und den Vorschlag in die Beschreibung", () => {
    expect(ics).toContain("SUMMARY:Beitrag: Muttertag\r\n");
    expect(ics).toContain("SUMMARY:Beitrag: Sommerferien\r\n");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DESCRIPTION:Vorschlag: Danke an alle Mütter\\n\\nVariante 1\\, Einzelbild mit Frage\\nBild: Blumen im Betrieb\\nHook: Danke an alle Mütter.");
    expect(unfolded).toContain("Variante 2\\, Reel\\nBild:");
    expect(unfolded).toContain("Variante 3\\, Story mit Umfrage\\nBild:");
    expect(unfolded).toContain("Kanäle: Instagram\\, Google-Beitrag");
    expect(unfolded).toContain("SUMMARY:Beitrag: Tag der offenen Tür\\, mit Apéro\\; 10 Uhr");
  });

  it(`setzt die Erinnerung ${ALARM_TRIGGER} nur bei Anlässen`, () => {
    const anlaesse = c.entries.filter((e) => e.art === "anlass").length;
    expect(lines.filter((l) => l === "BEGIN:VALARM")).toHaveLength(anlaesse);
    expect(lines.filter((l) => l === `TRIGGER:${ALARM_TRIGGER}`)).toHaveLength(anlaesse);
    // Ein Feiertag ohne Anlass und ein eigener Termin haben keine Erinnerung.
    const events = ics.split("BEGIN:VEVENT").slice(1);
    const karfreitag = events.find((e) => e.includes("SUMMARY:Beitrag: Karfreitag"))!;
    const termin = events.find((e) => e.includes("Apéro"))!;
    expect(karfreitag).not.toContain("VALARM");
    expect(termin).not.toContain("VALARM");
  });

  it("faltet lange Zeilen auf höchstens 75 Oktette, ohne ein Zeichen zu zerreissen", () => {
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(ics).not.toContain("�");
    const line = "DESCRIPTION:" + "Öffnungszeiten für Gäste über die Festtage ".repeat(8);
    const folded = foldLine(line);
    expect(folded.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldLine("kurz")).toBe("kurz");
  });

  it("vergibt eindeutige, stabile UIDs", () => {
    const unfoldedLines = ics.replace(/\r\n /g, "").split("\r\n");
    const uids = unfoldedLines.filter((l) => l.startsWith("UID:"));
    expect(uids).toHaveLength(c.entries.length);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids.every((u) => u.endsWith("@tools.alperna.ch"))).toBe(true);
    expect(buildIcs(c, { firma: "Malerei Keller, Gossau", now: NOW })).toBe(ics);
    const doppelt = cal({ termine: [{ datum: "2026-05-05", titel: "Fest" }, { datum: "2026-05-05", titel: "fest" }] });
    const u2 = buildIcs(doppelt, { now: NOW }).replace(/\r\n /g, "").split("\r\n").filter((l) => l.startsWith("UID:"));
    expect(new Set(u2).size).toBe(u2.length);
  });

  it("Dateinamen enthalten Jahr und Firma ohne Sonderzeichen", () => {
    expect(icsFilename(2026, "Malerei Keller, Gossau")).toBe("feiertagskalender-2026-malerei-keller-gossau.ics");
    expect(csvFilename(2027)).toBe("feiertagskalender-2027.csv");
  });
});

describe("feiertagskalender: CSV", () => {
  const c = cal();
  const csv = buildCsv(c);

  it("beginnt mit BOM und Kopfzeile, trennt mit Semikolon und endet mit CRLF", () => {
    expect(csv.startsWith(CSV_BOM + CSV_HEADER.join(";") + "\r\n")).toBe(true);
    expect(CSV_HEADER).toEqual(["Datum", "Art", "Titel", "Vorschlag", "Variante 1", "Variante 2", "Variante 3", "Kanäle"]);
    expect(csv.endsWith("\r\n")).toBe(true);
    const rows = csv.slice(1).trimEnd().split("\r\n");
    expect(rows).toHaveLength(c.entries.length + 1);
  });

  it("schreibt Datum, Art, Vorschlag, drei Varianten und Kanäle; Mehrtägiges trägt das Ende im Titel", () => {
    const rows = csv.slice(1).split("\r\n");
    const mutter = rows.find((r) => r.startsWith("10.05.2026;Anlass;Muttertag;"))!;
    const cells = mutter.split(";");
    expect(cells).toHaveLength(8);
    expect(cells[3]).toBe("Danke an alle Mütter");
    expect(cells[4]).toBe("Einzelbild mit Frage. Bild: Blumen im Betrieb. Hook: Danke an alle Mütter. Was hat dir deine Mutter mitgegeben, das du bis heute brauchst?");
    expect(cells[5]).toMatch(/^Reel\. Bild: /);
    expect(cells[6]).toMatch(/^Story mit Umfrage\. Bild: /);
    expect(cells[7]).toBe("Instagram, Google-Beitrag");
    expect(rows).toContain("03.04.2026;Feiertag;Karfreitag;;;;;");
    expect(rows).toContain("04.07.2026;Schulferien;Sommerferien (bis 09.08.2026);;;;;");
    expect(rows).toContain("01.01.2026;Schulferien;Weihnachtsferien (bis 04.01.2026);;;;;"); // erster Tag im Jahr, nicht 20.12.2025
  });

  it("setzt Anführungszeichen bei Semikolon und Anführungszeichen und schützt vor Formeln", () => {
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('sie sagte "ja"')).toBe('"sie sagte ""ja"""');
    expect(csvCell("zwei\nZeilen")).toBe("zwei Zeilen");
    expect(csvCell("=SUMME(A1)")).toBe("'=SUMME(A1)");
    expect(csvCell("+41 79")).toBe("'+41 79");
    expect(csvCell("-5 Grad")).toBe("'-5 Grad");
    expect(csvCell("@Chef")).toBe("'@Chef");
    expect(csvCell("normal")).toBe("normal");
    const heikel = buildCsv(cal({ termine: [{ datum: "2026-05-05", titel: "=1+1" }] }));
    expect(heikel).toContain("05.05.2026;Eigener Termin;'=1+1;;;;;");
  });
});

describe("feiertagskalender: Dokument für PDF und Word", () => {
  const c = cal({ termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür" }] });
  const doc = toDocument(c, "Malerei Keller, Gossau");

  it("hat Titel, Firma, Dateinamen und einen Abschnitt je Monat", () => {
    expect(doc.title).toBe("Feiertagskalender 2026");
    expect(doc.subtitle).toBe("Malerei Keller, Gossau, St. Gallen, Handwerk");
    expect(doc.firma).toBe("Malerei Keller, Gossau");
    expect(doc.filename).toBe("feiertagskalender-2026-malerei-keller-gossau");
    const months = doc.blocks.filter((b) => b.type === "heading" && b.text.endsWith(" 2026") && b.level === 2);
    expect(months).toHaveLength(12);
  });

  it("setzt je Monat eine Tabelle, bei leeren Monaten einen Satz, am Ende Quellen und Hinweise", () => {
    const tables = doc.blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(11); // nur der März ist leer
    expect(doc.blocks.some((b) => b.type === "paragraph" && b.text === "Keine Einträge in diesem Monat.")).toBe(true);
    const first = tables[0];
    expect(first.type === "table" && first.header).toEqual(["Datum", "Art", "Anlass", "Vorschlag oder Hinweis"]);
    expect(first.type === "table" && first.rows[0]).toEqual([
      "01.01.2026, Donnerstag",
      "Anlass und Feiertag",
      "Neujahr",
      [
        "Guter Start ins neue Jahr",
        "1. Einzelbild mit Frage: Eingang oder Team im Winterlicht, ein Satz im Bild. Hook: Ein neues Jahr beginnt. Ab dem ersten Werktag sind wir wieder für dich da. Was steht bei dir dieses Jahr an?",
        "2. Karussell: Drei Bilder: ein Projekt vom letzten Jahr, ein Moment im Team, ein Ausblick. Hook: Drei Dinge nehmen wir aus dem letzten Jahr mit. Und eine Sache machen wir dieses Jahr anders.",
        "3. Story mit Umfrage: Bild vom Arbeitsplatz mit Umfrage-Sticker. Hook: Wir planen unser Jahr. Welches Thema soll bei uns mehr Platz bekommen?",
      ].join("\n"),
    ]);
    const heads = doc.blocks.filter((b) => b.type === "heading").map((b) => (b.type === "heading" ? b.text : ""));
    expect(heads[heads.length - 1]).toBe("Quellen und Hinweise");
  });

  it("lässt sich als Markdown ausgeben und enthält Steckbrief und Hinweis", () => {
    const md = toMarkdown(doc);
    expect(md).toContain("# Feiertagskalender 2026");
    expect(md).toContain("**Kanäle:** Instagram, Google-Beitrag");
    expect(md).toContain("Du musst nicht zu jedem Anlass etwas posten");
    expect(md).toContain("| Datum | Art | Anlass | Vorschlag oder Hinweis |");
    expect(md).toContain("Tag der offenen Tür");
    expect(toDocument(c).firma).toBeUndefined();
    expect(toDocument(c).filename).toBe("feiertagskalender-2026");
  });
});

describe("feiertagskalender: Texte fürs CRM", () => {
  it("eingabeText nennt Kanton, Jahr, Branche, Kanäle und Termine, eine Angabe je Zeile", () => {
    const text = eingabeText(input({ termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür" }, { datum: "2026-12-02", titel: "Chlausmarkt" }] }));
    expect(text.split("\n")).toEqual([
      "Kanton: St. Gallen (SG)",
      "Jahr: 2026",
      "Branche: Handwerk",
      "Kanäle: Instagram, Google-Beitrag",
      "Eigene Termine: 14.11.2026 Tag der offenen Tür; 02.12.2026 Chlausmarkt",
    ]);
    expect(eingabeText(input()).split("\n")[4]).toBe("Eigene Termine: keine");
  });

  it("ausgabeText ist ein kompaktes Markdown der Jahresübersicht und passt in die Grenze des CRM", () => {
    const c = cal({ termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür" }] });
    const text = ausgabeText(c, "Malerei Keller, Gossau");
    const lines = text.split("\n");
    expect(lines[0]).toBe("# Feiertagskalender 2026, Malerei Keller, Gossau");
    expect(lines[1]).toBe("St. Gallen, Handwerk, Instagram, Google-Beitrag");
    expect(lines[2]).toBe("15 Anlässe, 9 Feiertage, 5 Schulferienblöcke, 1 eigener Termin");
    expect(text).toContain("## Mai\n- 10.05. Muttertag (Anlass)");
    expect(text).toContain("- 04.07. bis 09.08. Sommerferien (Schulferien)");
    expect(text).not.toContain("## März"); // leere Monate fehlen
    expect(text.length).toBeLessThan(1900);
    expect(ausgabeText(c)).toContain("# Feiertagskalender 2026\n");
  });
});

describe("feiertagskalender: Auswahl aus dem Profil", () => {
  it("leitet die Branche für Vorschläge aus Organisationstyp und Freitext ab", () => {
    expect(brancheAusProfil({ organisationstyp: "verein", branche: "Fussball" })).toBe("verein");
    expect(brancheAusProfil({ branche: "Malerei und Gipserei" })).toBe("handwerk");
    expect(brancheAusProfil({ branche: "Restaurant und Catering" })).toBe("gastronomie");
    expect(brancheAusProfil({ branche: "Treuhand" })).toBe("dienstleistung");
    expect(brancheAusProfil({ branche: "Blumenladen" })).toBe("detailhandel");
    expect(brancheAusProfil({ branche: "Landwirtschaft" })).toBe("detailhandel"); // gemeinsame Liste: Produktion und Hofladen
    expect(brancheAusProfil({ branche: "Biergarten" })).not.toBe("handwerk");
    expect(brancheAusProfil({ branche: "  " })).toBe("andere");
    expect(brancheAusProfil({})).toBe("andere");
  });

  it("leitet die Kanäle aus dem Profil ab, Google Ads zählt nicht, ohne Profil gelten Instagram und Google-Beitrag", () => {
    expect(kanaeleAusProfil({ kanaele: [{ name: "Instagram" }, { name: "Google Unternehmensprofil" }, { kanal: "Newsletter" }] })).toEqual(["instagram", "google", "newsletter"]);
    expect(kanaeleAusProfil({ kanaele: [{ name: "Google Ads" }, { name: "Facebook-Seite" }, { name: 3 }, {}] })).toEqual(["facebook"]);
    expect(kanaeleAusProfil({})).toEqual([]);
    expect(kanaeleVorschlag({})).toEqual(["instagram", "google"]);
    expect(kanaeleVorschlag({ kanaele: [{ name: "LinkedIn" }] })).toEqual(["linkedin"]);
  });

  it("prüft das Formular", () => {
    expect(formProblem({ kanton: "", jahr: 2026, kanaele: ["instagram"] })).toMatch(/Kanton/);
    expect(formProblem({ kanton: "XX", jahr: 2026, kanaele: ["instagram"] })).toMatch(/Kanton/);
    expect(formProblem({ kanton: "SG", jahr: null, kanaele: ["instagram"] })).toMatch(/Jahr/);
    expect(formProblem({ kanton: "SG", jahr: 2026, kanaele: [] })).toMatch(/mindestens einen Kanal/);
    expect(formProblem({ kanton: "SG", jahr: 2026, kanaele: ["instagram"] })).toBeNull();
  });

  it("bietet das laufende und das nächste Jahr an", () => {
    expect(yearOptions(new Date("2026-10-05T10:00:00Z"))).toEqual([2026, 2027]);
    expect(yearOptions(new Date("2027-01-02T10:00:00Z"))).toEqual([2027, 2028]);
  });
});

describe("feiertagskalender: gespeicherter Stand", () => {
  const result = { v: 1, phase: "result", jahr: 2026, kanton: "SG", branche: "handwerk", kanaele: ["instagram", "google"], termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür" }] };

  it("kaputte Daten ergeben den leeren Stand", () => {
    for (const raw of [null, undefined, "text", 42, [], {}, { v: 2 }, { phase: "result" }]) expect(parseState(raw)).toEqual(EMPTY_STATE);
  });

  it("behält ein vollständiges Ergebnis (Form für den Pfad-Fortschritt: phase «result»)", () => {
    const s = parseState(result);
    expect(s.phase).toBe("result");
    expect(s).toMatchObject({ jahr: 2026, kanton: "SG", branche: "handwerk", kanaele: ["instagram", "google"] });
    expect(inputFromState(s)).toEqual({ jahr: 2026, kanton: "SG", branche: "handwerk", kanaele: ["instagram", "google"], termine: [{ datum: "2026-11-14", titel: "Tag der offenen Tür" }] });
  });

  it("ein Ergebnis mit fehlenden oder falschen Angaben fällt auf «edit» zurück", () => {
    expect(parseState({ ...result, kanton: "XX" }).phase).toBe("edit");
    expect(parseState({ ...result, kanton: "" }).phase).toBe("edit");
    expect(parseState({ ...result, jahr: "2026" }).phase).toBe("edit");
    expect(parseState({ ...result, jahr: 1999 }).phase).toBe("edit");
    expect(parseState({ ...result, branche: "bauer" }).phase).toBe("edit");
    expect(parseState({ ...result, kanaele: [] }).phase).toBe("edit");
    expect(parseState({ ...result, kanaele: ["tiktok"] }).phase).toBe("edit");
    expect(inputFromState(parseState({ ...result, kanaele: [] }))).toBeNull();
    expect(inputFromState(EMPTY_STATE)).toBeNull();
  });

  it("säubert Kanäle und Termine", () => {
    const s = parseState({ ...result, kanaele: ["google", "instagram", "instagram", "tiktok", 5], termine: [{ datum: "2026-13-01", titel: "falsch" }, { datum: "2026-03-01", titel: "  Erster  " }, { datum: "2026-01-01", titel: "Früher" }, null, "x", { datum: "2026-04-01" }] });
    expect(s.kanaele).toEqual(["instagram", "google"]);
    expect(s.termine).toEqual([{ datum: "2026-01-01", titel: "Früher" }, { datum: "2026-03-01", titel: "Erster" }]);
    const viele = parseState({ ...result, termine: Array.from({ length: 50 }, (_, i) => ({ datum: `2026-05-${String((i % 28) + 1).padStart(2, "0")}`, titel: `T${i}` })) });
    expect(viele.termine).toHaveLength(MAX_TERMINE);
  });

  it("im Bearbeiten bleibt eine leere Kanalwahl erhalten, damit das Formular nicht zurückspringt", () => {
    expect(parseState({ v: 1, phase: "edit", kanaele: [] }).kanaele).toEqual([]);
    expect(parseState({ v: 1, phase: "edit" }).kanaele).toBeNull();
  });
});

describe("feiertagskalender: Aufnahme ins Gesamtbild", () => {
  it("ein Kalender für jeden Kanton hat Feiertage, Anlässe und ohne Absturz zwölf Monate", () => {
    for (const k of ["AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH"]) {
      const c = cal({ kanton: k, branche: "verein" });
      expect(c.months).toHaveLength(12);
      expect(c.entries.some((e) => e.titel === "Weihnachten"), k).toBe(true);
      expect(buildIcs(c, { now: NOW }).split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), k).toBe(true);
      expect(ausgabeText(c).length, k).toBeLessThan(2600);
    }
  });
});
