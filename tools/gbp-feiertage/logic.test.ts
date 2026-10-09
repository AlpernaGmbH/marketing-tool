import { describe, expect, it } from "vitest";
import { brandHits } from "@/lib/brand-rules";
import { KANTONE, dateCH } from "@/lib/ch";
import {
  ALARM_DAYS,
  CSV_BOM,
  DATA,
  EMPTY_STATE,
  HELP_URL,
  ICS_HINT,
  RULE_KINDS,
  RULE_LABELS,
  SUNDAY,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  addDays,
  ausgabeText,
  buildCsv,
  buildIcs,
  buildPlan,
  checkedCantons,
  closedHint,
  copyText,
  csvFilename,
  dayText,
  defaultHours,
  defaultRule,
  defaultYear,
  easterSunday,
  eingabeText,
  effectiveWindows,
  escapeIcsText,
  foldIcsLine,
  formProblem,
  formatIso,
  hoursProblem,
  holidaysFor,
  icsFilename,
  icsStamp,
  icsUid,
  isChecked,
  isTime,
  isValidDatum,
  kantonLabel,
  kantonName,
  lineFor,
  loadData,
  noListMessage,
  parseIso,
  parseState,
  resolveDate,
  ruleProblem,
  sourcesFor,
  toIso,
  weekGrid,
  weekdayIndex,
  windowsOf,
  windowsText,
  yearOptions,
  type Entry,
  type FeiertageData,
  type Holiday,
  type Rule,
  type WeekHours,
} from "./logic";

const pad = (n: number) => String(n).padStart(2, "0");

/** Zweite, unabhängige Osterformel (Meeus/Jones/Butcher) als Gegenprobe zu easterSunday (Gauss). */
function meeus(y: number): string {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}

if (!DATA) throw new Error("data/feiertage.json ist ungültig");
const data: FeiertageData = DATA;

const quelle = { titel: "Testquelle der Kantone", url: "https://example.ch/quelle", stand: "01.01.2026" };
const miniRaw = {
  meta: { source: "Testdaten, keine echten Feiertage", url: "https://example.ch/quelle", asOf: "2026-10-05", note: "Nur für Tests." },
  jahre: [2026, 2027],
  bund: [quelle],
  quellen: { SG: quelle, TG: quelle },
  feiertage: [
    { id: "neujahr", name: "Neujahrstag", datum: "fix:01-01", kantone: "alle", art: "gesetzlich" },
    { id: "karfreitag", name: "Karfreitag", datum: "ostern:-2", kantone: ["SG", "TG"], art: "gesetzlich" },
    { id: "allerheiligen", name: "Allerheiligen", datum: "fix:11-01", kantone: ["SG"], art: "gesetzlich" },
    { id: "tag-der-arbeit", name: "Tag der Arbeit", datum: "fix:05-01", kantone: ["TG"], art: "gesetzlich" },
    { id: "lokalfest", name: "Lokalfest", datum: "fix:09-22", kantone: ["TG"], art: "ortsueblich", hinweis: "Gilt nur in einem Teil des Kantons." },
    { id: "fahrt", name: "Fahrt", datum: "fix-jahr:2026-04-09", kantone: ["SG"], art: "gesetzlich" },
    { id: "stephanstag", name: "Stephanstag", datum: "fix:12-26", kantone: ["TG"], art: "gesetzlich", bedingung: "weihnachten-nicht-mo-fr" },
  ],
};
const mini = loadData(miniRaw) as FeiertageData;

const hours = defaultHours();
const closedSunday = defaultHours();
const openSunday: WeekHours = defaultHours().map((d, i) => (i === SUNDAY ? { offen: true, f1: { von: "10:00", bis: "12:00" }, f2: { von: "14:00", bis: "16:00" } } : d));

const geschlossen: Rule = { kind: "geschlossen", von: "", bis: "" };
const normal: Rule = { kind: "normal", von: "", bis: "" };
const wieSonntag: Rule = { kind: "sonntag", von: "", bis: "" };
const zeiten = (von: string, bis: string): Rule => ({ kind: "zeiten", von, bis });

describe("gbp-feiertage: Osterformel", () => {
  // Belegt aus dem Kalender (zh.ch listet Karfreitag und Ostermontag): 2026 = 5. April, 2027 = 28. März.
  it("liefert Ostern 2026 und 2027 wie im Kalender", () => {
    expect(toIso(easterSunday(2026))).toBe("2026-04-05");
    expect(toIso(easterSunday(2027))).toBe("2027-03-28");
  });

  // Die übrigen Jahre sind nicht aus dem Kalender belegt, sondern stehen hier als Ergebnis der Formel; die Gegenprobe unten
  // vergleicht sie mit einer zweiten Formel.
  it("rechnet 2024 bis 2030 nach der Formel", () => {
    const expected: Record<number, string> = {
      2024: "2024-03-31",
      2025: "2025-04-20",
      2026: "2026-04-05",
      2027: "2027-03-28",
      2028: "2028-04-16",
      2029: "2029-04-01",
      2030: "2030-04-21",
    };
    for (const [y, iso] of Object.entries(expected)) expect(toIso(easterSunday(Number(y)))).toBe(iso);
  });

  it("stimmt von 1900 bis 2200 mit einer zweiten Osterformel überein", () => {
    for (let y = 1900; y <= 2200; y++) expect(toIso(easterSunday(y))).toBe(meeus(y));
  });

  it("trifft die Ausnahmejahre der Gauss-Formel (19. und 18. April)", () => {
    expect(toIso(easterSunday(1981))).toBe("1981-04-19");
    expect(toIso(easterSunday(2076))).toBe("2076-04-19");
    expect(toIso(easterSunday(1954))).toBe("1954-04-18");
    expect(toIso(easterSunday(2049))).toBe("2049-04-18");
  });

  it("fällt immer auf einen Sonntag", () => {
    for (let y = 2000; y <= 2100; y++) expect(weekdayIndex(toIso(easterSunday(y)))).toBe(SUNDAY);
  });
});

describe("gbp-feiertage: Datum", () => {
  it("rechnet mit UTC-Teilen und kennt Schaltjahre und Jahreswechsel", () => {
    expect(parseIso("2028-02-29")).not.toBeNull();
    expect(parseIso("2027-02-29")).toBeNull();
    expect(parseIso("2026-13-01")).toBeNull();
    expect(parseIso("26-04-03")).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-04-05", -2)).toBe("2026-04-03");
    expect(addDays("kaputt", 3)).toBe("kaputt");
  });

  it("bestimmt den Wochentag mit Montag = 0", () => {
    expect(weekdayIndex("2026-04-03")).toBe(4); // Karfreitag 2026: Freitag
    expect(weekdayIndex("2026-04-06")).toBe(0); // Ostermontag: Montag
    expect(weekdayIndex("2026-11-01")).toBe(SUNDAY);
    expect(WEEKDAYS[4]).toBe("Freitag");
    expect(WEEKDAYS_SHORT[4]).toBe("Fr");
  });

  it("schreibt das Datum wie dateCH()", () => {
    expect(formatIso("2026-04-03")).toBe("03.04.2026");
    expect(formatIso("2026-04-03")).toBe(dateCH(new Date("2026-04-03T12:00:00Z")));
    expect(formatIso("2027-12-26")).toBe(dateCH(new Date("2027-12-26T12:00:00Z")));
  });

  it("löst feste, bewegliche und jahresbezogene Angaben auf", () => {
    expect(resolveDate({ datum: "fix:08-01" }, 2026)).toBe("2026-08-01");
    expect(resolveDate({ datum: "ostern:-2" }, 2026)).toBe("2026-04-03");
    expect(resolveDate({ datum: "ostern:+1" }, 2027)).toBe("2027-03-29");
    expect(resolveDate({ datum: "ostern:+39" }, 2026)).toBe("2026-05-14");
    expect(resolveDate({ datum: "ostern:+50" }, 2026)).toBe("2026-05-25");
    expect(resolveDate({ datum: "ostern:+60" }, 2026)).toBe("2026-06-04");
    expect(resolveDate({ datum: "ostern:+60" }, 2027)).toBe("2027-05-27");
    expect(resolveDate({ datum: "fix-jahr:2026-04-09" }, 2026)).toBe("2026-04-09");
  });

  it("gibt null, wenn die Angabe für das Jahr nicht gilt", () => {
    expect(resolveDate({ datum: "fix-jahr:2026-04-09" }, 2027)).toBeNull();
    expect(resolveDate({ datum: "fix:02-29" }, 2027)).toBeNull();
    expect(resolveDate({ datum: "fix:02-29" }, 2028)).toBe("2028-02-29");
    expect(resolveDate({ datum: "irgendwas" }, 2026)).toBeNull();
    expect(resolveDate({ datum: "fix:01-01" }, 2026.5)).toBeNull();
  });

  it("prüft die Schreibweise von datum", () => {
    expect(isValidDatum("fix:12-26")).toBe(true);
    expect(isValidDatum("fix:02-29")).toBe(true);
    expect(isValidDatum("fix:13-01")).toBe(false);
    expect(isValidDatum("fix:2-1")).toBe(false);
    expect(isValidDatum("ostern:+39")).toBe(true);
    expect(isValidDatum("ostern:-2")).toBe(true);
    expect(isValidDatum("ostern:39")).toBe(false);
    expect(isValidDatum("ostern:+900")).toBe(false);
    expect(isValidDatum("fix-jahr:2026-02-30")).toBe(false);
    expect(isValidDatum("fix-jahr:2026-04-09")).toBe(true);
  });
});

describe("gbp-feiertage: Datensatz data/feiertage.json", () => {
  it("entspricht dem Schema und hat eine https-Quelle mit Datum", () => {
    expect(loadData(JSON.parse(JSON.stringify(data)))).not.toBeNull();
    expect(data.meta.url.startsWith("https://")).toBe(true);
    expect(data.meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.meta.source.length).toBeGreaterThan(20);
    expect(data.meta.note.length).toBeGreaterThan(20);
    expect(data.jahre).toEqual([2026, 2027]);
  });

  it("belegt jeden Kanton mit einer https-Quelle und Stand, und jede Quelle gehört zu einem Kanton", () => {
    const covered = checkedCantons(data);
    expect(covered).toEqual(["AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH"]);
    expect(Object.keys(data.quellen).sort()).toEqual([...covered].sort());
    for (const k of covered) {
      const q = data.quellen[k];
      expect(q.url.startsWith("https://")).toBe(true);
      expect(q.stand.length).toBeGreaterThan(2);
      expect(q.titel.length).toBeGreaterThan(5);
    }
    for (const q of data.bund) expect(q.url.startsWith("https://")).toBe(true);
    for (const k of Object.keys(data.hinweise ?? {})) expect(covered).toContain(k);
  });

  it("nennt nur bekannte Kantone und hat keinen Eintrag doppelt", () => {
    const codes = KANTONE.map(([k]) => k as string);
    const keys = new Set<string>();
    for (const f of data.feiertage) {
      for (const k of f.kantone === "alle" ? [] : f.kantone) {
        expect(codes).toContain(k);
        const key = `${f.id}|${k}|${f.datum.startsWith("fix-jahr") ? f.datum : ""}`;
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }
  });

  it("liefert für jeden Kanton und jedes Jahr höchstens einen Tag je id und aufsteigende Daten", () => {
    for (const [code] of KANTONE) {
      for (const y of data.jahre) {
        const list = holidaysFor(code, y, data);
        const ids = list.map((h) => h.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(list.map((h) => h.date)).toEqual([...list.map((h) => h.date)].sort());
        for (const h of list) expect(h.date.startsWith(`${y}-`)).toBe(true);
      }
    }
  });

  it("weist ein Jahr ohne gültige Angaben nicht ins Leere: Näfelser Fahrt gibt es nur 2026 und 2027", () => {
    expect(holidaysFor("GL", 2028, data).some((h) => h.id === "fahrtsfest")).toBe(false);
  });

  it("verwendet keine Wörter der Sperrliste und kein «jetzt» in den Texten des Datensatzes", () => {
    const texts = [data.meta.note, ...Object.values(data.hinweise ?? {}), ...data.feiertage.flatMap((f) => [f.name, f.hinweis ?? ""])];
    for (const t of texts) {
      expect(brandHits(t).filter((h) => h.level === "hart")).toEqual([]);
      expect(t).not.toMatch(/\bjetzt\b|!/);
    }
  });

  it("weist kaputte Daten ab: fehlende oder unsichere Quelle, falsches Datum, unbekannter Kanton", () => {
    expect(loadData(null)).toBeNull();
    expect(loadData("text")).toBeNull();
    expect(loadData({})).toBeNull();
    expect(loadData({ ...miniRaw, meta: { ...miniRaw.meta, url: "http://example.ch/quelle" } })).toBeNull();
    expect(loadData({ ...miniRaw, meta: { ...miniRaw.meta, url: undefined } })).toBeNull();
    expect(loadData({ ...miniRaw, feiertage: [{ ...miniRaw.feiertage[0], datum: "1. Januar" }] })).toBeNull();
    expect(loadData({ ...miniRaw, feiertage: [{ ...miniRaw.feiertage[1], kantone: ["XX"] }] })).toBeNull();
    expect(loadData({ ...miniRaw, feiertage: [{ ...miniRaw.feiertage[1], art: "gesetz" }] })).toBeNull();
    expect(loadData({ ...miniRaw, feiertage: [] })).toBeNull();
    expect(loadData(miniRaw)).not.toBeNull();
  });
});

describe("gbp-feiertage: Gegenprobe der Tage je Kanton gegen die Quellen vom 05.10. und 09.10.2026", () => {
  // Diese Tabelle wurde von Hand aus den Seiten unter data/feiertage.json «quellen» übertragen (Gesetze und Merkblätter der Kantone).
  // Ändert jemand den Datensatz, muss er hier bewusst nachziehen und die Quelle erneut öffnen.
  const base = ["auffahrt", "bundesfeier", "neujahr", "weihnachten"];
  const alle = ["karfreitag", "ostermontag", "pfingstmontag", "stephanstag"];
  const katholisch = ["fronleichnam", "maria-himmelfahrt", "allerheiligen", "maria-empfaengnis"];
  const expected: Record<string, string[]> = {
    AG: [...base, "karfreitag", "berchtoldstag", "ostermontag", "pfingstmontag", "fronleichnam", "maria-himmelfahrt", "allerheiligen", "maria-empfaengnis", "stephanstag"],
    AI: [...base, ...alle, ...katholisch, "mauritiustag"],
    AR: [...base, ...alle],
    BE: [...base, ...alle, "berchtoldstag"],
    BL: [...base, ...alle, "tag-der-arbeit"],
    BS: [...base, ...alle, "tag-der-arbeit"],
    GL: [...base, ...alle, "allerheiligen", "fahrtsfest"],
    GR: [...base, ...alle],
    LU: [...base, "karfreitag", "stephanstag", ...katholisch],
    NW: [...base, "karfreitag", "josefstag", ...katholisch],
    OW: [...base, "karfreitag", "bruderklausenfest", ...katholisch],
    SG: [...base, ...alle, "allerheiligen"],
    SH: [...base, ...alle, "tag-der-arbeit"],
    SZ: [...base, ...alle, "dreikoenig", "josefstag", ...katholisch],
    TG: [...base, ...alle, "berchtoldstag", "tag-der-arbeit"],
    UR: [...base, ...alle, "dreikoenig", "josefstag", ...katholisch],
    ZG: [...base, "karfreitag", ...katholisch],
    ZH: [...base, ...alle, "tag-der-arbeit"],
    // 09.10.2026: FR (BAMG Art. 49, katholische und reformierte Gemeinden), GE (LJF Art. 1), JU (RSJU 555.1 Art. 3), NE (RSN 941.02 Art. 3 und ne.ch),
    // SO (RTG § 2), TI (RL 843.200 Art. 1), VD (LEmp Art. 47), VS (VEkArG Art. 7)
    FR: [...base, "karfreitag", ...katholisch, "berchtoldstag", "ostermontag", "pfingstmontag", "stephanstag"],
    GE: [...base, "karfreitag", "ostermontag", "pfingstmontag", "genfer-bettag", "restauration-ge"],
    JU: [...base, "berchtoldstag", "karfreitag", "ostermontag", "tag-der-arbeit", "pfingstmontag", "fronleichnam", "plebiszit-ju", "maria-himmelfahrt", "allerheiligen"],
    NE: [...base, "republik-ne", "karfreitag", "tag-der-arbeit"],
    SO: [...base, "karfreitag", "tag-der-arbeit", "fronleichnam", "maria-himmelfahrt", "allerheiligen"],
    TI: [...base, "dreikoenig", "josefstag", "ostermontag", "tag-der-arbeit", "pfingstmontag", "fronleichnam", "peter-paul", "maria-himmelfahrt", "allerheiligen", "maria-empfaengnis", "stephanstag"],
    VD: [...base, "berchtoldstag", "karfreitag", "ostermontag", "pfingstmontag", "bettagsmontag"],
    VS: [...base, "josefstag", "fronleichnam", "maria-himmelfahrt", "allerheiligen", "maria-empfaengnis"],
  };

  it("nennt je Kanton genau die Tage, die die Quelle nennt (2026 und 2027)", () => {
    expect(Object.keys(expected).sort()).toEqual(checkedCantons(data));
    for (const [kanton, ids] of Object.entries(expected)) {
      for (const y of [2026, 2027]) {
        expect(holidaysFor(kanton, y, data).map((h) => h.id).sort(), `${kanton} ${y}`).toEqual([...ids].sort());
      }
    }
  });

  it("führt im Aargau nur vier Tage als gesetzlich und die übrigen als ortsüblich mit Hinweis", () => {
    const list = holidaysFor("AG", 2026, data);
    expect(list.filter((h) => h.art === "gesetzlich").map((h) => h.id).sort()).toEqual(["auffahrt", "bundesfeier", "karfreitag", "neujahr", "weihnachten"]);
    for (const h of list.filter((x) => x.art === "ortsueblich")) expect(h.hinweis, h.id).toMatch(/Bezirk|Gemeinde/);
  });

  it("kennt den Berchtoldstag in Bern, Thurgau, Jura und der Waadt, ortsüblich im Aargau und in Freiburg (reformierte Gemeinden)", () => {
    const withBerchtold = KANTONE.map(([k]) => k as string).filter((k) => holidaysFor(k, 2026, data).some((h) => h.id === "berchtoldstag"));
    expect(withBerchtold).toEqual(["AG", "BE", "FR", "JU", "TG", "VD"]);
  });

  it("gibt Glarus eine zweite Quelle mit der Seite zur Näfelser Fahrt und verlangt dafür eine https-Adresse", () => {
    const gl = data.quellen.GL;
    expect(gl.weitere?.length).toBe(1);
    expect(gl.weitere?.[0].url.startsWith("https://www.gl.ch/")).toBe(true);
    expect(sourcesFor("GL", data).kanton?.weitere).toEqual(gl.weitere);
    const raw = JSON.parse(JSON.stringify(miniRaw)) as { quellen: Record<string, unknown> } & Record<string, unknown>;
    raw.quellen.SG = { ...quelle, weitere: [{ ...quelle, url: "http://example.ch/zusatz" }] };
    expect(loadData(raw)).toBeNull();
    raw.quellen.SG = { ...quelle, weitere: [{ ...quelle, url: "https://example.ch/zusatz" }] };
    expect(loadData(raw)).not.toBeNull();
  });

  it("legt die kirchlichen Feiertage auf die Daten, die NW, OW und das Verzeichnis des Bundes nennen", () => {
    const dates = (k: string) => Object.fromEntries(holidaysFor(k, 2026, data).map((h) => [h.id, h.date.slice(5)]));
    expect(dates("NW")).toMatchObject({ josefstag: "03-19", "maria-himmelfahrt": "08-15", allerheiligen: "11-01", "maria-empfaengnis": "12-08" });
    expect(dates("OW")).toMatchObject({ bruderklausenfest: "09-25", allerheiligen: "11-01" });
    expect(dates("UR")).toMatchObject({ dreikoenig: "01-06", josefstag: "03-19" });
    expect(dates("AI")).toMatchObject({ mauritiustag: "09-22" });
  });
});

describe("gbp-feiertage: Feiertage je Kanton", () => {
  // Belegt: zh.ch, «Feiertage», Tabelle 2026 und 2027 (neun gesetzliche Feiertage).
  it("stimmt für Zürich mit der Tabelle des Kantons überein", () => {
    const zh = (y: number) => holidaysFor("ZH", y, data).map((h) => [h.name, h.date]);
    expect(zh(2026)).toEqual([
      ["Neujahrstag", "2026-01-01"],
      ["Karfreitag", "2026-04-03"],
      ["Ostermontag", "2026-04-06"],
      ["Tag der Arbeit", "2026-05-01"],
      ["Auffahrt", "2026-05-14"],
      ["Pfingstmontag", "2026-05-25"],
      ["Bundesfeiertag", "2026-08-01"],
      ["Weihnachtstag", "2026-12-25"],
      ["Stephanstag", "2026-12-26"],
    ]);
    expect(zh(2027)).toEqual([
      ["Neujahrstag", "2027-01-01"],
      ["Karfreitag", "2027-03-26"],
      ["Ostermontag", "2027-03-29"],
      ["Tag der Arbeit", "2027-05-01"],
      ["Auffahrt", "2027-05-06"],
      ["Pfingstmontag", "2027-05-17"],
      ["Bundesfeiertag", "2027-08-01"],
      ["Weihnachtstag", "2027-12-25"],
      ["Stephanstag", "2027-12-26"],
    ]);
  });

  // Belegt: bs.ch, «Feiertage im Kanton Basel-Stadt», Tabelle 2026 (neun gesetzliche Feiertage).
  it("stimmt für Basel-Stadt 2026 mit der Tabelle des Kantons überein", () => {
    const bs = holidaysFor("BS", 2026, data).map((h) => `${h.date} ${WEEKDAYS[h.weekday]} ${h.name}`);
    expect(bs).toEqual([
      "2026-01-01 Donnerstag Neujahrstag",
      "2026-04-03 Freitag Karfreitag",
      "2026-04-06 Montag Ostermontag",
      "2026-05-01 Freitag Tag der Arbeit",
      "2026-05-14 Donnerstag Auffahrt",
      "2026-05-25 Montag Pfingstmontag",
      "2026-08-01 Samstag Bundesfeiertag",
      "2026-12-25 Freitag Weihnachtstag",
      "2026-12-26 Samstag Stephanstag",
    ]);
  });

  it("kennt in St. Gallen Allerheiligen, aber nicht den 1. Mai und nicht den Berchtoldstag", () => {
    const ids = holidaysFor("SG", 2026, data).map((h) => h.id);
    expect(ids).toEqual(["neujahr", "karfreitag", "ostermontag", "auffahrt", "pfingstmontag", "bundesfeier", "allerheiligen", "weihnachten", "stephanstag"]);
  });

  it("unterscheidet Kantone: Thurgau hat den 1. Mai und den 2. Januar, aber nicht Allerheiligen", () => {
    const tg = holidaysFor("TG", 2026, data).map((h) => h.id);
    expect(tg).toContain("tag-der-arbeit");
    expect(tg).toContain("berchtoldstag");
    expect(tg).not.toContain("allerheiligen");
  });

  it("gibt Beispielen aus katholischen Kantonen ihre Tage mit festem Datum", () => {
    const lu = holidaysFor("LU", 2026, data);
    expect(lu.find((h) => h.id === "fronleichnam")?.date).toBe("2026-06-04");
    expect(lu.find((h) => h.id === "maria-himmelfahrt")?.date).toBe("2026-08-15");
    expect(lu.find((h) => h.id === "allerheiligen")?.date).toBe("2026-11-01");
    expect(lu.find((h) => h.id === "maria-empfaengnis")?.date).toBe("2026-12-08");
    expect(lu.some((h) => h.id === "ostermontag")).toBe(false);
    expect(holidaysFor("UR", 2026, data).find((h) => h.id === "josefstag")?.date).toBe("2026-03-19");
    expect(holidaysFor("OW", 2026, data).find((h) => h.id === "bruderklausenfest")?.date).toBe("2026-09-25");
  });

  it("setzt die Näfelser Fahrt in Glarus auf den Tag, den der Kanton nennt", () => {
    expect(holidaysFor("GL", 2026, data).find((h) => h.id === "fahrtsfest")?.date).toBe("2026-04-09");
    expect(holidaysFor("GL", 2027, data).find((h) => h.id === "fahrtsfest")?.date).toBe("2027-04-01");
  });

  it("führt ortsübliche Tage mit Hinweis, im Aargau und in Appenzell Innerrhoden", () => {
    const ag = holidaysFor("AG", 2026, data);
    expect(ag.filter((h) => h.art === "gesetzlich").map((h) => h.id)).toEqual(["neujahr", "karfreitag", "auffahrt", "bundesfeier", "weihnachten"]);
    const ostermontag = ag.find((h) => h.id === "ostermontag");
    expect(ostermontag?.art).toBe("ortsueblich");
    expect(ostermontag?.hinweis).toMatch(/Bezirken/);
    const mauritius = holidaysFor("AI", 2026, data).find((h) => h.id === "mauritiustag");
    expect(mauritius?.art).toBe("ortsueblich");
    expect(mauritius?.date).toBe("2026-09-22");
    expect(sourcesFor("AG", data).hinweis).toMatch(/bezirk/i);
  });

  it("lässt den Stephanstag in Appenzell Ausserrhoden entfallen, wenn Weihnachten auf Montag oder Freitag fällt", () => {
    const y2026 = holidaysFor("AR", 2026, data).find((h) => h.id === "stephanstag"); // 25.12.2026 ist ein Freitag
    expect(y2026?.entfaellt).toMatch(/Freitag/);
    const y2027 = holidaysFor("AR", 2027, data).find((h) => h.id === "stephanstag"); // 25.12.2027 ist ein Samstag
    expect(y2027?.entfaellt).toBeUndefined();
    const y2028 = holidaysFor("AR", 2028, data).find((h) => h.id === "stephanstag"); // 25.12.2028 ist ein Montag
    expect(y2028?.entfaellt).toMatch(/Montag/);
    expect(holidaysFor("SG", 2026, data).find((h) => h.id === "stephanstag")?.entfaellt).toBeUndefined();
  });

  it("zeigt den Hinweis zum Stephanstag in Appenzell Innerrhoden, ohne ihn zu streichen", () => {
    const h = holidaysFor("AI", 2026, data).find((x) => x.id === "stephanstag");
    expect(h?.entfaellt).toBeUndefined();
    expect(h?.hinweis).toMatch(/drei Ruhetage/);
  });

  it("zeigt für einen Kanton ohne Quelle nur die eidgenössischen Tage und sagt, dass die Liste nicht geprüft ist", () => {
    // Alle 26 Kantone sind belegt; der Rückfall gilt für einen unbekannten Code und für einen Datensatz, dem eine Quelle fehlt.
    expect(isChecked("XX", data)).toBe(false);
    expect(holidaysFor("XX", 2026, data).map((h) => h.id)).toEqual(["neujahr", "auffahrt", "bundesfeier", "weihnachten"]);
    expect(isChecked("ZH", mini)).toBe(false);
    expect(holidaysFor("ZH", 2026, mini).map((h) => h.id)).toEqual(["neujahr"]);
    expect(noListMessage("VD")).toBe("Für Waadt haben wir noch keine geprüfte Liste. Prüfe die Feiertage bei deinem Kanton.");
    expect(noListMessage("FR")).toBe("Für Freiburg haben wir noch keine geprüfte Liste. Prüfe die Feiertage bei deinem Kanton.");
    expect(sourcesFor("ZH", mini).kanton).toBeNull();
    expect(sourcesFor("XX", data).bund.length).toBeGreaterThan(0);
  });

  it("belegt die acht Kantone vom 09.10.2026 mit Tagen, Daten und Hinweisen aus den Quellen", () => {
    const by = (k: string, y = 2026) => Object.fromEntries(holidaysFor(k, y, data).map((h) => [h.id, h]));
    // GE: Genfer Bettag = Donnerstag nach dem ersten Sonntag im September
    expect(by("GE")["genfer-bettag"].date).toBe("2026-09-10");
    expect(by("GE", 2027)["genfer-bettag"].date).toBe("2027-09-09");
    expect(by("GE")["restauration-ge"].date).toBe("2026-12-31");
    // VD: Bettagsmontag = Montag nach dem dritten Sonntag im September
    expect(by("VD").bettagsmontag.date).toBe("2026-09-21");
    expect(by("VD", 2027).bettagsmontag.date).toBe("2027-09-20");
    // JU, TI, NE: eigene Tage mit festem Datum
    expect(by("JU")["plebiszit-ju"].date).toBe("2026-06-23");
    expect(by("TI")["peter-paul"].date).toBe("2026-06-29");
    expect(by("NE")["republik-ne"].date).toBe("2026-03-01");
    expect(by("NE")["republik-ne"].weekday).toBe(6); // Sonntag
    // TI hat keinen Karfreitag, VS keinen Ostermontag
    expect(by("TI").karfreitag).toBeUndefined();
    expect(by("VS").ostermontag).toBeUndefined();
    // FR: katholische Tage gesetzlich mit Hinweis, reformierte Tage ortsüblich mit der Liste der Gemeinden
    const fr = by("FR");
    for (const id of ["fronleichnam", "maria-himmelfahrt", "allerheiligen", "maria-empfaengnis"]) {
      expect(fr[id].art, id).toBe("gesetzlich");
      expect(fr[id].hinweis, id).toContain("römisch-katholisch");
    }
    for (const id of ["berchtoldstag", "ostermontag", "pfingstmontag", "stephanstag"]) {
      expect(fr[id].art, id).toBe("ortsueblich");
      expect(fr[id].hinweis, id).toContain("Murten");
    }
    // SO: 1. Mai ab 12 Uhr, kirchliche Tage nicht im Bucheggberg
    const so = by("SO");
    expect(so["tag-der-arbeit"].hinweis).toBe("Gilt erst ab 12.00 Uhr.");
    for (const id of ["fronleichnam", "maria-himmelfahrt", "allerheiligen"]) expect(so[id].hinweis, id).toBe("Gilt nicht im Bezirk Bucheggberg.");
    // jeder der acht Kantone hat eine Quelle mit https-Adresse, Stand vom 09.10.2026 und einen Hinweis
    for (const k of ["FR", "GE", "JU", "NE", "SO", "TI", "VD", "VS"]) {
      expect(data.quellen[k].url.startsWith("https://"), k).toBe(true);
      expect(data.quellen[k].stand, k).toContain("09.10.2026");
      expect(data.hinweise?.[k]?.length, k).toBeGreaterThan(20);
    }
  });

  it("filtert nach Kanton aus einem Testdatensatz und überspringt Angaben, die für das Jahr nicht gelten", () => {
    const ids = (k: string, y: number) => holidaysFor(k, y, mini).map((h) => h.id);
    expect(ids("SG", 2026)).toEqual(["neujahr", "karfreitag", "fahrt", "allerheiligen"]);
    expect(ids("SG", 2027)).toEqual(["neujahr", "karfreitag", "allerheiligen"]); // «fahrt» gilt nur 2026
    expect(ids("TG", 2026)).toEqual(["neujahr", "karfreitag", "tag-der-arbeit", "lokalfest", "stephanstag"]);
    expect(ids("ZH", 2026)).toEqual(["neujahr"]); // ohne Quelle nur «alle»
  });

  it("gibt Namen und Beschriftung der Kantone", () => {
    expect(kantonName("SG")).toBe("St. Gallen");
    expect(kantonLabel("SG")).toBe("St. Gallen (SG)");
    expect(kantonLabel("ZZ")).toBe("ZZ");
    expect(kantonName("ZZ")).toBe("ZZ");
  });

  it("wählt die Jahre: laufendes und nächstes Jahr aus dem Datensatz", () => {
    expect(yearOptions(data, new Date(2026, 9, 5))).toEqual([2026, 2027]);
    expect(yearOptions(data, new Date(2027, 0, 2))).toEqual([2027]);
    expect(yearOptions(data, new Date(2025, 5, 1))).toEqual([2026, 2027]);
    expect(yearOptions(data, new Date(2031, 0, 1))).toEqual([2026, 2027]); // Datensatz veraltet: die letzten Jahre
    expect(defaultYear(data, new Date(2026, 9, 5))).toBe(2026);
  });
});

describe("gbp-feiertage: Öffnungszeiten", () => {
  it("startet mit Montag bis Freitag zweimal am Tag, Samstag und Sonntag geschlossen", () => {
    const h = defaultHours();
    expect(h).toHaveLength(7);
    expect(dayText(h[0])).toBe("08:00 bis 12:00 und 13:30 bis 17:30");
    expect(dayText(h[4])).toBe("08:00 bis 12:00 und 13:30 bis 17:30");
    expect(dayText(h[5])).toBe("geschlossen");
    expect(dayText(h[SUNDAY])).toBe("geschlossen");
    expect(hoursProblem(h)).toBeNull();
  });

  it("erkennt Uhrzeiten", () => {
    expect(isTime("08:00")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("8:00")).toBe(false);
    expect(isTime("12:60")).toBe(false);
    expect(isTime("")).toBe(false);
    expect(isTime(1200)).toBe(false);
  });

  it("sammelt nur gültige Zeitfenster in Reihenfolge", () => {
    expect(windowsOf({ offen: true, f1: { von: "08:00", bis: "12:00" }, f2: { von: "", bis: "" } })).toEqual([{ von: "08:00", bis: "12:00" }]);
    expect(windowsOf({ offen: false, f1: { von: "08:00", bis: "12:00" }, f2: { von: "", bis: "" } })).toEqual([]);
    expect(windowsOf({ offen: true, f1: { von: "12:00", bis: "08:00" }, f2: { von: "13:00", bis: "17:00" } })).toEqual([{ von: "13:00", bis: "17:00" }]);
    expect(windowsText([])).toBe("geschlossen");
    expect(windowsText([{ von: "09:00", bis: "12:00" }])).toBe("09:00 bis 12:00");
  });

  it("zeigt die normale Woche als Raster mit sieben Zeilen und dem Wort «geschlossen»", () => {
    const g = weekGrid(defaultHours());
    expect(g.type).toBe("grid");
    if (g.type !== "grid") return;
    expect(g.columns).toEqual(["Zeitfenster 1", "Zeitfenster 2"]);
    expect(g.rows).toHaveLength(7);
    expect(g.rows[0]).toEqual({ label: "Montag", cells: ["08:00 bis 12:00", "13:30 bis 17:30"] });
    expect(g.rows[5]).toEqual({ label: "Samstag", cells: ["geschlossen"] });
    expect(g.rows[SUNDAY]).toEqual({ label: "Sonntag", cells: ["geschlossen"] });
    const half = defaultHours();
    half[1] = { offen: true, f1: { von: "09:00", bis: "12:00" }, f2: { von: "", bis: "" } };
    const grid = weekGrid(half);
    expect(grid.type === "grid" && grid.rows[1]).toEqual({ label: "Dienstag", cells: ["09:00 bis 12:00"] });
  });

  it("meldet fehlerhafte Zeiten mit dem Wochentag", () => {
    const bad = defaultHours();
    bad[1] = { offen: true, f1: { von: "", bis: "" }, f2: { von: "", bis: "" } };
    expect(hoursProblem(bad)).toMatch(/^Dienstag: /);
    const reversed = defaultHours();
    reversed[0].f1 = { von: "12:00", bis: "08:00" };
    expect(hoursProblem(reversed)).toMatch(/^Montag: /);
    const half = defaultHours();
    half[2].f2 = { von: "13:00", bis: "" };
    expect(hoursProblem(half)).toMatch(/^Mittwoch: Das zweite Zeitfenster/);
    const overlap = defaultHours();
    overlap[3].f2 = { von: "11:00", bis: "16:00" };
    expect(hoursProblem(overlap)).toMatch(/^Donnerstag: .*vor dem Ende/);
    const closedBroken = defaultHours();
    closedBroken[5] = { offen: false, f1: { von: "xx", bis: "" }, f2: { von: "", bis: "" } };
    expect(hoursProblem(closedBroken)).toBeNull(); // geschlossene Tage werden nicht geprüft
    expect(hoursProblem([])).toMatch(/^Montag: /);
  });
});

describe("gbp-feiertage: Regeln und Zeilen zum Abtippen", () => {
  const karfreitag: Holiday = { id: "karfreitag", name: "Karfreitag", date: "2026-04-03", weekday: 4, art: "gesetzlich" };
  const allerheiligen: Holiday = { id: "allerheiligen", name: "Allerheiligen", date: "2026-11-01", weekday: SUNDAY, art: "gesetzlich" };
  const samstag: Holiday = { id: "bundesfeier", name: "Bundesfeiertag", date: "2026-08-01", weekday: 5, art: "gesetzlich" };

  it("startet gesetzliche Tage auf «geschlossen» und ortsübliche auf «nicht eintragen»", () => {
    expect(defaultRule({ art: "gesetzlich" }).kind).toBe("geschlossen");
    expect(defaultRule({ art: "ortsueblich" }).kind).toBe("normal");
    expect([...RULE_KINDS]).toEqual(["geschlossen", "sonntag", "zeiten", "normal"]);
    expect(RULE_LABELS.sonntag).toBe("wie Sonntag");
  });

  it("schreibt «Fr 03.04.2026, Karfreitag: geschlossen»", () => {
    expect(lineFor(karfreitag, geschlossen, hours)).toBe("Fr 03.04.2026, Karfreitag: geschlossen");
  });

  it("schreibt Sonderzeiten als «von bis»", () => {
    expect(lineFor(karfreitag, zeiten("09:00", "12:00"), hours)).toBe("Fr 03.04.2026, Karfreitag: 09:00 bis 12:00");
  });

  it("übernimmt bei «wie Sonntag» die Zeiten des Sonntags, auch mit zwei Zeitfenstern", () => {
    expect(lineFor(karfreitag, wieSonntag, closedSunday)).toBe("Fr 03.04.2026, Karfreitag: geschlossen");
    expect(lineFor(karfreitag, wieSonntag, openSunday)).toBe("Fr 03.04.2026, Karfreitag: 10:00 bis 12:00 und 14:00 bis 16:00");
  });

  it("schreibt nichts bei «nicht eintragen»", () => {
    expect(lineFor(karfreitag, normal, hours)).toBeNull();
    expect(effectiveWindows(normal, hours)).toBeNull();
  });

  it("behandelt unvollständige Sonderzeiten wie geschlossen und meldet sie im Formular", () => {
    expect(effectiveWindows(zeiten("", ""), hours)).toEqual([]);
    expect(effectiveWindows(zeiten("13:00", "09:00"), hours)).toEqual([]);
    expect(ruleProblem(karfreitag, zeiten("", ""))).toMatch(/^Karfreitag: /);
    expect(ruleProblem(karfreitag, zeiten("13:00", "09:00"))).toMatch(/«von» vor «bis»/);
    expect(ruleProblem(karfreitag, zeiten("09:00", "12:00"))).toBeNull();
    expect(ruleProblem(karfreitag, geschlossen)).toBeNull();
    expect(ruleProblem({ ...karfreitag, entfaellt: "Entfällt 2026." }, zeiten("", ""))).toBeNull();
    expect(formProblem([karfreitag], { karfreitag: zeiten("", "") }, hours)).toMatch(/^Karfreitag/);
    expect(formProblem([karfreitag], {}, hours)).toBeNull();
    const bad = defaultHours();
    bad[0].f1 = { von: "", bis: "" };
    expect(formProblem([karfreitag], {}, bad)).toMatch(/^Montag/);
  });

  it("gibt den Hinweis «fällt auf einen Sonntag», wenn sonntags ohnehin zu ist", () => {
    expect(closedHint(allerheiligen, closedSunday)).toBe("fällt auf einen Sonntag");
    expect(closedHint(allerheiligen, openSunday)).toBeNull();
    expect(closedHint(samstag, hours)).toBe("fällt auf einen Samstag, an dem du ohnehin geschlossen hast");
    expect(closedHint(karfreitag, hours)).toBeNull();
  });

  it("trennt im Plan Einträge, unnötige Tage und entfallene Tage", () => {
    const entfallen: Holiday = { id: "stephanstag", name: "Stephanstag", date: "2026-12-26", weekday: 5, art: "gesetzlich", entfaellt: "Entfällt 2026: Der Weihnachtstag fällt auf einen Freitag." };
    const ortsueblich: Holiday = { id: "mauritiustag", name: "Mauritiustag", date: "2026-09-22", weekday: 1, art: "ortsueblich" };
    const plan = buildPlan([karfreitag, allerheiligen, samstag, entfallen, ortsueblich], {}, hours);
    expect(plan.entries.map((e) => e.line)).toEqual(["Fr 03.04.2026, Karfreitag: geschlossen"]);
    expect(plan.unnoetig.map((s) => s.holiday.id)).toEqual(["allerheiligen", "bundesfeier"]);
    expect(plan.unnoetig[0].grund).toBe("fällt auf einen Sonntag");
    expect(plan.entfallen.map((s) => s.holiday.id)).toEqual(["stephanstag"]);
    // ortsüblicher Tag steht auf «nicht eintragen» und taucht nirgends auf
    expect(plan.entries.some((e) => e.holiday.id === "mauritiustag")).toBe(false);
    // gewählt wird er mit einer Regel
    const mit = buildPlan([ortsueblich], { mauritiustag: geschlossen }, hours);
    expect(mit.entries).toHaveLength(1);
  });

  it("trägt einen Sonntagstag ein, wenn sonntags geöffnet ist", () => {
    const plan = buildPlan([allerheiligen], {}, openSunday);
    expect(plan.entries.map((e) => e.line)).toEqual(["So 01.11.2026, Allerheiligen: geschlossen"]);
    expect(plan.unnoetig).toEqual([]);
  });

  it("rechnet für St. Gallen 2027 mit Standardzeiten sechs Einträge und drei Wochenendtage", () => {
    const plan = buildPlan(holidaysFor("SG", 2027, data), {}, hours);
    expect(plan.entries.map((e) => e.line)).toEqual([
      "Fr 01.01.2027, Neujahrstag: geschlossen",
      "Fr 26.03.2027, Karfreitag: geschlossen",
      "Mo 29.03.2027, Ostermontag: geschlossen",
      "Do 06.05.2027, Auffahrt: geschlossen",
      "Mo 17.05.2027, Pfingstmontag: geschlossen",
      "Mo 01.11.2027, Allerheiligen: geschlossen",
    ]);
    expect(plan.unnoetig.map((s) => s.holiday.name)).toEqual(["Bundesfeiertag", "Weihnachtstag", "Stephanstag"]);
    expect(copyText(plan)).toBe(plan.entries.map((e) => e.line).join("\n"));
  });
});

describe("gbp-feiertage: Kalender (.ics)", () => {
  const now = new Date(Date.UTC(2026, 9, 5, 12, 30, 45));
  const plan = buildPlan(holidaysFor("SG", 2026, data), { auffahrt: zeiten("09:00", "12:00") }, hours);
  const ics = buildIcs(plan.entries, 2026, { now, firma: "Malerei Keller, Gossau" });
  const lines = ics.split("\r\n");

  it("hat Rahmen, Version und ein Ereignis je Eintrag", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-2)).toBe("END:VCALENDAR");
    expect(lines.at(-1)).toBe("");
    expect(lines).toContain("VERSION:2.0");
    const begin = lines.filter((l) => l === "BEGIN:VEVENT").length;
    const end = lines.filter((l) => l === "END:VEVENT").length;
    expect(begin).toBe(plan.entries.length);
    expect(end).toBe(plan.entries.length);
    expect(lines.filter((l) => l === "BEGIN:VALARM")).toHaveLength(plan.entries.length);
    expect(lines.filter((l) => l === "END:VALARM")).toHaveLength(plan.entries.length);
  });

  it("nutzt nur CRLF als Zeilenende", () => {
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("setzt je Eintrag Ganztagstermin, Titel mit Regel, Hinweis und Erinnerung zehn Tage vorher", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20260403");
    expect(unfolded).toContain("DTEND;VALUE=DATE:20260404");
    expect(unfolded).toContain("SUMMARY:Karfreitag: geschlossen");
    expect(unfolded).toContain("SUMMARY:Auffahrt: 09:00 bis 12:00");
    expect(unfolded).toContain(`DESCRIPTION:${ICS_HINT}`);
    expect(unfolded).toContain(HELP_URL);
    expect(unfolded.split("TRIGGER:-P10D")).toHaveLength(plan.entries.length + 1);
    expect(ALARM_DAYS).toBe(10);
    expect(unfolded).toContain("ACTION:DISPLAY");
    expect(unfolded).toContain("DTSTAMP:20261005T123045Z");
    expect(unfolded).toContain("X-WR-CALNAME:Sonderöffnungszeiten 2026\\, Malerei Keller\\, Gossau");
  });

  it("macht die UID aus Jahr und id, stabil und eindeutig", () => {
    const uids = lines.filter((l) => l.startsWith("UID:"));
    expect(uids).toHaveLength(plan.entries.length);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids).toContain("UID:2026-karfreitag@tools.alperna.ch");
    expect(icsUid(2027, "auffahrt")).toBe("2027-auffahrt@tools.alperna.ch");
    const again = buildIcs(plan.entries, 2026, { now: new Date(Date.UTC(2027, 0, 1)) });
    expect(again.split("\r\n").filter((l) => l.startsWith("UID:"))).toEqual(uids);
  });

  it("faltet Zeilen bei 75 Oktetten und fängt Fortsetzungen mit einem Leerzeichen an", () => {
    const enc = new TextEncoder();
    for (const l of lines) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(" "))).toBe(true);
    // Entfaltet ergibt sich wieder die volle Beschreibung
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${ICS_HINT}. Anleitung: ${HELP_URL}`);
  });

  it("faltet mehrbyteige Zeichen nicht in der Mitte", () => {
    const long = "SUMMARY:" + "ö".repeat(60);
    const parts = foldIcsLine(long);
    expect(parts.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(long);
    expect(foldIcsLine("kurz")).toEqual(["kurz"]);
  });

  it("maskiert Sonderzeichen in Texten", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    expect(icsStamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe("20260102T030405Z");
  });

  it("macht aus einer leeren Liste einen gültigen leeren Kalender", () => {
    const empty = buildIcs([], 2026, { now });
    expect(empty.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(empty).not.toContain("BEGIN:VEVENT");
    expect(empty.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("gbp-feiertage: CSV", () => {
  const entries: Entry[] = buildPlan(holidaysFor("SG", 2026, data), { auffahrt: zeiten("09:00", "12:00"), pfingstmontag: wieSonntag }, openSunday).entries;
  const csv = buildCsv(entries);

  it("beginnt mit BOM und Kopfzeile, trennt mit Semikolon und endet mit CRLF", () => {
    expect(csv.startsWith(CSV_BOM + "Datum;Feiertag;Regel;von;bis\r\n")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("schreibt geschlossene Tage mit leeren Zeiten und Sonderzeiten in von und bis", () => {
    const rows = csv.slice(1).split("\r\n");
    expect(rows).toContain("01.01.2026;Neujahrstag;geschlossen;;");
    expect(rows).toContain("14.05.2026;Auffahrt;Sonderzeiten;09:00;12:00");
  });

  it("schreibt zwei Zeitfenster in zwei Zeilen", () => {
    const rows = csv.slice(1).split("\r\n");
    expect(rows).toContain("25.05.2026;Pfingstmontag;wie Sonntag;10:00;12:00");
    expect(rows).toContain("25.05.2026;Pfingstmontag;wie Sonntag;14:00;16:00");
  });

  it("setzt Zellen mit Semikolon oder Anführungszeichen in Anführungszeichen", () => {
    const odd: Entry = {
      holiday: { id: "x", name: 'Tag; "Test"', date: "2026-05-01", weekday: 4, art: "gesetzlich" },
      rule: "geschlossen",
      windows: [],
      text: "geschlossen",
      line: "",
    };
    expect(buildCsv([odd])).toContain('01.05.2026;"Tag; ""Test""";geschlossen;;');
  });

  it("macht aus einer leeren Liste nur die Kopfzeile", () => {
    expect(buildCsv([])).toBe(CSV_BOM + "Datum;Feiertag;Regel;von;bis\r\n");
  });

  it("benennt die Dateien nach Kanton und Jahr", () => {
    expect(icsFilename("SG", 2026)).toBe("sonderoeffnungszeiten-sg-2026.ics");
    expect(csvFilename("SG", 2026)).toBe("sonderoeffnungszeiten-sg-2026.csv");
  });
});

describe("gbp-feiertage: gespeicherter Stand", () => {
  it("liest kaputte Daten als leeren Stand", () => {
    for (const bad of [null, undefined, "text", 42, [], {}, { v: 2 }, { v: 1, phase: "result" }]) {
      const s = parseState(bad);
      expect(s.phase).toBe("edit");
      expect(s.kanton).toBe("");
      expect(s.jahr).toBe(0);
      expect(s.zeiten).toEqual(defaultHours());
      expect(s.regeln).toEqual({});
    }
    expect(EMPTY_STATE.phase).toBe("edit");
  });

  it("gibt bei jedem Aufruf frische Zeiten, damit niemand den Standard verändert", () => {
    const a = parseState(null);
    a.zeiten[0].offen = false;
    expect(parseState(null).zeiten[0].offen).toBe(true);
  });

  it("behält einen gültigen Stand mit Ergebnis", () => {
    const ok = { v: 1, phase: "result", kanton: "SG", jahr: 2027, zeiten: defaultHours(), regeln: { karfreitag: zeiten("09:00", "12:00") } };
    expect(parseState(JSON.parse(JSON.stringify(ok)))).toEqual(ok);
  });

  it("fällt auf «edit» zurück, wenn zum Ergebnis Kanton, Jahr oder gültige Zeiten fehlen", () => {
    const base = { v: 1, phase: "result", kanton: "SG", jahr: 2027, zeiten: defaultHours(), regeln: {} };
    expect(parseState({ ...base, kanton: "" }).phase).toBe("edit");
    expect(parseState({ ...base, kanton: "XX" }).kanton).toBe("");
    expect(parseState({ ...base, jahr: 1999 }).phase).toBe("edit");
    expect(parseState({ ...base, jahr: "2027" }).jahr).toBe(0);
    expect(parseState({ ...base, jahr: 2027.5 }).phase).toBe("edit");
    const broken = defaultHours();
    broken[0].f1 = { von: "18:00", bis: "08:00" };
    expect(parseState({ ...base, zeiten: broken }).phase).toBe("edit");
  });

  it("ersetzt kaputte Tage und Regeln einzeln, ohne den Rest zu verlieren", () => {
    const s = parseState({
      v: 1,
      phase: "edit",
      kanton: "TG",
      jahr: 2026,
      zeiten: [null, { offen: "ja", f1: { von: "25:00", bis: "12:00" } }, { offen: false, f1: { von: "09:00", bis: "11:00" }, f2: 5 }, "x"],
      regeln: {
        karfreitag: { kind: "zeiten", von: "09:00", bis: "99:99" },
        ostermontag: { kind: "unbekannt" },
        "Böse Id!": { kind: "geschlossen" },
        auffahrt: "geschlossen",
        neujahr: { kind: "sonntag" },
      },
    });
    expect(s.zeiten).toHaveLength(7);
    expect(s.zeiten[0]).toEqual(defaultHours()[0]);
    expect(s.zeiten[1].offen).toBe(true); // fällt auf den Standard zurück
    expect(s.zeiten[1].f1).toEqual({ von: "08:00", bis: "12:00" });
    expect(s.zeiten[2]).toEqual({ offen: false, f1: { von: "09:00", bis: "11:00" }, f2: { von: "13:30", bis: "17:30" } });
    expect(Object.keys(s.regeln).sort()).toEqual(["karfreitag", "neujahr"]);
    expect(s.regeln.karfreitag).toEqual({ kind: "zeiten", von: "09:00", bis: "" });
    expect(s.regeln.neujahr).toEqual({ kind: "sonntag", von: "", bis: "" });
  });
});

describe("gbp-feiertage: Texte fürs CRM", () => {
  const holidays = holidaysFor("SG", 2027, data);
  const state = { kanton: "SG", jahr: 2027, zeiten: hours, regeln: { auffahrt: zeiten("09:00", "12:00"), pfingstmontag: wieSonntag } as Record<string, Rule> };

  it("nennt in der Eingabe zuerst Kanton und Jahr, dann die Öffnungszeiten je Tag und die Regeln", () => {
    const lines = eingabeText(state, holidays).split("\n");
    expect(lines[0]).toBe("Kanton: St. Gallen (SG)");
    expect(lines[1]).toBe("Jahr: 2027");
    expect(lines).toContain("Mo: 08:00 bis 12:00 und 13:30 bis 17:30");
    expect(lines).toContain("So: geschlossen");
    expect(lines).toContain("Karfreitag (Fr 26.03.2027): geschlossen");
    expect(lines).toContain("Auffahrt (Do 06.05.2027): Sonderzeiten 09:00 bis 12:00");
    expect(lines).toContain("Pfingstmontag (Mo 17.05.2027): wie Sonntag");
  });

  it("schreibt in der Eingabe «entfällt» für Tage, die nicht gelten, und «nicht eintragen» für ortsübliche", () => {
    const ar = holidaysFor("AR", 2026, data);
    expect(eingabeText({ ...state, kanton: "AR", jahr: 2026 }, ar)).toContain("Stephanstag (Sa 26.12.2026): entfällt in diesem Jahr");
    const ag = holidaysFor("AG", 2026, data);
    expect(eingabeText({ ...state, kanton: "AG", jahr: 2026 }, ag)).toContain("Ostermontag (Mo 06.04.2026): nicht eintragen");
  });

  it("hält die Eingabe bei allen Kantonen unter dem Limit von 1'900 Zeichen", () => {
    for (const [code] of KANTONE) {
      for (const y of data.jahre) {
        expect(eingabeText({ ...state, kanton: code, jahr: y }, holidaysFor(code, y, data)).length).toBeLessThan(1900);
      }
    }
  });

  it("gibt als Ausgabe die Liste zum Abtippen und nennt die Tage ohne Eintrag", () => {
    const out = ausgabeText(buildPlan(holidays, state.regeln, hours), "SG", 2027).split("\n");
    expect(out[0]).toBe("Sonderöffnungszeiten St. Gallen (SG) 2027");
    expect(out).toContain("Do 06.05.2027, Auffahrt: 09:00 bis 12:00");
    expect(out).toContain("Mo 17.05.2027, Pfingstmontag: geschlossen");
    expect(out.some((l) => l.startsWith("Nichts einzutragen: Bundesfeiertag (So 01.08.2027), fällt auf einen Sonntag"))).toBe(true);
  });

  it("nennt in der Ausgabe auch entfallene Tage", () => {
    const plan = buildPlan(holidaysFor("AR", 2026, data), {}, hours);
    expect(ausgabeText(plan, "AR", 2026)).toContain("Stephanstag: Entfällt 2026: Der Weihnachtstag fällt auf einen Freitag.");
  });
});
