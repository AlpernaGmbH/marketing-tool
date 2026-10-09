import { describe, expect, it } from "vitest";
import ideenData from "@/data/branchen-ideen.json";
import { brandHits } from "@/lib/brand-rules";
import {
  ALLE,
  AUFWAENDE,
  BRANCHEN,
  CSV_HEADER,
  EMPTY_FILTER,
  EMPTY_MERKLISTE,
  EMPTY_STATE,
  FORMATE,
  IDEEN,
  MAX_MERK,
  META,
  PAGE_SIZE,
  SAEULEN,
  UEBERGREIFEND,
  ZIELE,
  ausgabeText,
  branchenKeyFor,
  brancheLabel,
  buildCsv,
  buildIcs,
  countText,
  datasetSchema,
  eigeneSaeulen,
  eingabeText,
  exportBasename,
  filterIdeen,
  foldIcsLine,
  foldText,
  ideaInMonth,
  ideaMeta,
  initialFilter,
  loadDataset,
  merkIdeen,
  merkSignature,
  merklisteMarkdown,
  monateLabel,
  monthOf,
  nextMonthDate,
  parseMerkliste,
  parseState,
  randomIdea,
  stateAfterMerk,
  toggleMerk,
  visibleLimit,
  type Filter,
  type Idea,
} from "./logic";

const idea = (patch: Partial<Idea> = {}): Idea => ({
  id: "test-01",
  branche: "handwerk",
  titel: "Eine Testidee",
  beschrieb: "Zeig eine Testidee in einem kurzen Satz, damit die Prüfung greift.",
  hook: "Das ist der erste Satz der Testidee.",
  format: "reel",
  monate: "alle",
  ziel: "vertrauen",
  aufwand: "S",
  saeule: "arbeit",
  ...patch,
});

const byId = (id: string): Idea => {
  const found = IDEEN.find((i) => i.id === id);
  if (!found) throw new Error(`Idee fehlt: ${id}`);
  return found;
};

const filter = (patch: Partial<Filter> = {}): Filter => ({ ...EMPTY_FILTER, ...patch });

const texts = (i: Idea) => [i.titel, i.beschrieb, i.hook];

// ---- Datensatz -------------------------------------------------------------------------------------

describe("inhalte-ideen: Datensatz", () => {
  it("besteht das strenge Schema (Pflichtfelder, Längen, bekannte Branchen)", () => {
    const result = datasetSchema.safeParse(ideenData);
    expect(result.success, result.success ? "" : JSON.stringify(result.error.issues.slice(0, 3))).toBe(true);
  });

  it("verliert beim Laden keine Idee und trägt eine Quelle", () => {
    const raw = ideenData as { ideen: unknown[] };
    expect(IDEEN.length).toBe(raw.ideen.length);
    expect(META).not.toBeNull();
    expect(META?.source).toBe("Redaktion Alperna");
    expect(META?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("enthält mindestens zwölf Branchen mit je mindestens 20 Ideen und mindestens 20 Ideen für alle", () => {
    expect(BRANCHEN.length).toBeGreaterThanOrEqual(12);
    for (const b of BRANCHEN) {
      expect(IDEEN.filter((i) => i.branche === b.key).length, b.key).toBeGreaterThanOrEqual(20);
    }
    expect(IDEEN.filter((i) => i.branche === ALLE).length).toBeGreaterThanOrEqual(20);
  });

  it("trägt mehrere hundert Ideen (die Tagline sagt «Hunderte»)", () => {
    expect(IDEEN.length).toBeGreaterThanOrEqual(300);
  });

  it("hat eindeutige IDs und eindeutige Titel (Gross/Klein egal)", () => {
    expect(new Set(IDEEN.map((i) => i.id)).size).toBe(IDEEN.length);
    expect(new Set(IDEEN.map((i) => i.titel.toLowerCase())).size).toBe(IDEEN.length);
  });

  it("beginnt jede ID mit dem Schlüssel ihrer Branche", () => {
    for (const i of IDEEN) expect(i.id.startsWith(`${i.branche}-`), i.id).toBe(true);
  });

  it("deckt alle Formate, Ziele, Aufwände und Säulen ab", () => {
    for (const f of FORMATE) expect(IDEEN.some((i) => i.format === f), f).toBe(true);
    for (const z of ZIELE) expect(IDEEN.some((i) => i.ziel === z), z).toBe(true);
    for (const a of AUFWAENDE) expect(IDEEN.some((i) => i.aufwand === a), a).toBe(true);
    for (const s of SAEULEN) expect(IDEEN.some((i) => i.saeule === s), s).toBe(true);
  });

  it("ist frei von Sperrwörtern (brandHits über Titel, Beschrieb und Hook, auch Hinweise)", () => {
    const hits = IDEEN.flatMap((i) => brandHits(texts(i).join("\n")).map((h) => `${i.id}: ${h.what} («${h.text}»)`));
    expect(hits).toEqual([]);
  });

  it("enthält keine Zahlen, keine Ausrufezeichen, kein ß und keine Wörter wie «jetzt» oder «garantiert»", () => {
    for (const i of IDEEN) {
      for (const t of texts(i)) {
        expect(t, i.id).not.toMatch(/\d/);
        expect(t, i.id).not.toMatch(/[!ß%]|\bCHF\b|\bjetzt\b|\bnur noch\b|\bgarantiert\b|\bNr\. ?1/i);
      }
    }
  });

  it("macht keine Rechtsaussagen", () => {
    const legal = /laut (?:Gesetz|Recht|Verordnung)|gesetzlich|gesetzeskonform|Paragraf|\bArt\. ?\d|\bnDSG\b|\bDSG\b|rechtlich verpflichtet|ist verboten|ist erlaubt|darfst du nicht/i;
    for (const i of IDEEN) for (const t of texts(i)) expect(t, i.id).not.toMatch(legal);
  });

  it("nennt bei Bildern von Personen oder Vorher-Nachher-Vergleichen das Einverständnis", () => {
    for (const i of IDEEN) {
      if (/vorher\W+(?:und\W+)?nachher|vor und nach/i.test(`${i.titel} ${i.beschrieb}`)) expect(i.beschrieb, i.id).toMatch(/Einverständnis/);
    }
  });

  it("fragt bei Kindern nach dem Einverständnis der Eltern", () => {
    expect(byId("verein-10").beschrieb).toMatch(/Kindern der Eltern/);
    expect(byId("verein-30").beschrieb).toMatch(/Kindern der Eltern/);
    expect(byId("verein-19").beschrieb).toMatch(/ohne Gesichter von Kindern/);
  });

  it("schreibt die Anrede an den Betrieb einheitlich («Zeig», «Stell», «Trag», «Schreib») und nie in der Sie-Form", () => {
    for (const i of IDEEN) {
      expect(i.beschrieb, i.id).not.toMatch(/(?:^|[.:?] )(?:Zeige|Stelle|Trage|Schreibe) /);
      expect(i.beschrieb, i.id).not.toMatch(/\b(?:Sie (?:können|haben|sollten|zeigen|stellen)|Ihre|Ihnen)\b/);
    }
  });

  it("hat Monate ohne Dubletten und nur von 1 bis 12", () => {
    for (const i of IDEEN) {
      if (i.monate === "alle") continue;
      expect(new Set(i.monate).size, i.id).toBe(i.monate.length);
      for (const m of i.monate) expect(m >= 1 && m <= 12, i.id).toBe(true);
    }
  });

  it("liefert für jede Branche und jeden Monat genug Ideen (mit den Ideen für alle)", () => {
    for (const b of BRANCHEN) {
      for (let m = 1; m <= 12; m++) {
        expect(filterIdeen(IDEEN, filter({ branche: b.key, monat: m })).length, `${b.key} ${m}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("hat zu jeder Branche mindestens drei Beispiele für die Profil-Zuordnung", () => {
    for (const b of BRANCHEN) expect(b.beispiele.length, b.key).toBeGreaterThanOrEqual(3);
  });
});

describe("inhalte-ideen: loadDataset", () => {
  const branche = { key: "handwerk", label: "Handwerk", beispiele: ["Maler", "Schreiner", "Sanitär"] };
  const meta = { source: "Test", url: "https://example.ch", asOf: "2026-10-05" };

  it("liefert bei Unsinn eine leere Bibliothek, nie einen Absturz", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { ideen: 3 }]) {
      const d = loadDataset(raw);
      expect(d.ideen).toEqual([]);
      expect(d.branchen).toEqual([]);
    }
  });

  it("lässt ungültige Ideen, unbekannte Branchen, doppelte IDs und doppelte Titel weg", () => {
    const good = idea();
    const raw = {
      meta,
      branchen: [branche, { key: "alle", label: "Alle", beispiele: ["a", "b", "c"] }, { key: "kaputt" }],
      ideen: [
        good,
        { ...good, titel: "Andere Idee", beschrieb: good.beschrieb }, // doppelte ID
        { ...good, id: "test-02", titel: "EINE TESTIDEE" }, // doppelter Titel
        { ...good, id: "test-03", titel: "Ohne Branche", branche: "gibt-es-nicht" },
        { ...good, id: "test-04", titel: "Zu kurz", beschrieb: "kurz" },
        { ...good, id: "test-05", titel: "Falsches Format", format: "podcast" },
        { ...good, id: "test-06", titel: "Für alle Betriebe", branche: "alle" },
        "kein Objekt",
      ],
    };
    const d = loadDataset(raw);
    expect(d.branchen.map((b) => b.key)).toEqual(["handwerk"]);
    expect(d.ideen.map((i) => i.id)).toEqual(["test-01", "test-06"]);
    expect(d.meta).toEqual(meta);
  });

  it("meldet Dubletten im strengen Schema", () => {
    const good = idea();
    const result = datasetSchema.safeParse({ meta, branchen: [branche], ideen: [good, { ...good, titel: "Zweiter Titel" }, { ...good, id: "test-02" }] });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message).join(" | ");
    expect(messages).toContain("ID doppelt");
    expect(messages).toContain("Titel doppelt");
  });
});

// ---- Branche aus dem Firmenprofil ------------------------------------------------------------------

describe("inhalte-ideen: Branche aus dem Profil", () => {
  it("erkennt Berufe über die Beispiele der Branchen", () => {
    expect(branchenKeyFor("Malerei", BRANCHEN)).toBe("handwerk");
    expect(branchenKeyFor("Schreinerei Keller", BRANCHEN)).toBe("handwerk");
    expect(branchenKeyFor("Physiotherapie", BRANCHEN)).toBe("gesundheit");
    expect(branchenKeyFor("Restaurant und Catering", BRANCHEN)).toBe("gastronomie");
    expect(branchenKeyFor("Treuhand", BRANCHEN)).toBe("treuhand-beratung");
    expect(branchenKeyFor("Garage", BRANCHEN)).toBe("garage-auto");
    expect(branchenKeyFor("Fitnessstudio", BRANCHEN)).toBe("fitness-sport");
    expect(branchenKeyFor("Blumenladen", BRANCHEN)).toBe("detailhandel");
    expect(branchenKeyFor("IT-Dienstleistungen", BRANCHEN)).toBe("it-digital");
  });

  it("vergleicht ohne Umlaute und ohne Gross/Klein (Sanitär, Sanitaer, SANITAR)", () => {
    for (const s of ["Sanitär", "Sanitaer", "SANITAR", "sanitär"]) expect(branchenKeyFor(s, BRANCHEN)).toBe("handwerk");
  });

  it("nimmt auch einen gemeinsamen Wortanfang ab fünf Buchstaben («Maler» zu «Malerei», «Blumen» zu «Blumenladen»)", () => {
    expect(branchenKeyFor("Malerbetrieb", BRANCHEN)).toBe("handwerk");
    expect(branchenKeyFor("Blumen", BRANCHEN)).toBe("detailhandel");
  });

  it("nimmt die Branche mit dem stärksten Treffer", () => {
    expect(branchenKeyFor("Gartenbau", BRANCHEN)).toBe("bau-garten");
    expect(branchenKeyFor("Bäckerei und Konditorei mit Café", BRANCHEN)).toBe("gastronomie");
    expect(branchenKeyFor("Elektro, Gartenbau und Landschaftsbau", BRANCHEN)).toBe("bau-garten");
  });

  it("lässt Füllwörter wie «und» nicht über die Branche entscheiden", () => {
    expect(branchenKeyFor("Restaurant und Catering", BRANCHEN)).toBe("gastronomie");
    expect(branchenKeyFor("und", BRANCHEN)).toBe(ALLE);
    expect(branchenKeyFor("Physio und Massage GmbH", BRANCHEN)).toBe("gesundheit");
    expect(branchenKeyFor("Keller AG", BRANCHEN)).toBe(ALLE);
  });

  it("fällt ohne Treffer auf «alle» zurück, bei einem Verein auf «verein»", () => {
    expect(branchenKeyFor(undefined, BRANCHEN)).toBe(ALLE);
    expect(branchenKeyFor("", BRANCHEN)).toBe(ALLE);
    expect(branchenKeyFor("   ", BRANCHEN)).toBe(ALLE);
    expect(branchenKeyFor("Raumfahrt", BRANCHEN)).toBe(ALLE);
    expect(branchenKeyFor("", BRANCHEN, "verein")).toBe("verein");
    expect(branchenKeyFor("Raumfahrt", BRANCHEN, "verein")).toBe("verein");
    expect(branchenKeyFor("", BRANCHEN, "kmu")).toBe(ALLE);
    expect(branchenKeyFor("Sportverein", BRANCHEN, "verein")).toBe("verein");
  });

  it("fällt auf «alle» zurück, wenn es keine Branche «verein» gibt", () => {
    expect(branchenKeyFor("", [{ key: "handwerk", label: "Handwerk", beispiele: ["a", "b", "c"] }], "verein")).toBe(ALLE);
  });

  it("foldText macht Umlaute und ß vergleichbar", () => {
    expect(foldText("Küche")).toBe("kuche");
    expect(foldText("kueche")).toBe("kuche");
    expect(foldText("Strasse")).toBe(foldText("Straße"));
    expect(foldText("ÄÖÜ")).toBe("aou");
  });

  it("initialFilter nimmt Branche aus dem Profil und den Monat in Schweizer Zeit", () => {
    expect(initialFilter({ branche: "Malerei" }, new Date("2026-10-05T10:00:00Z"))).toEqual({ ...EMPTY_FILTER, branche: "handwerk", monat: 10 });
    expect(initialFilter({}, new Date("2026-03-15T12:00:00Z"))).toEqual({ ...EMPTY_FILTER, branche: ALLE, monat: 3 });
    expect(initialFilter({ organisationstyp: "verein" }, new Date("2026-05-01T12:00:00Z")).branche).toBe("verein");
    // Silvester kurz vor Mitternacht UTC ist in der Schweiz schon der 1. Januar
    expect(initialFilter({}, new Date("2026-12-31T23:30:00Z")).monat).toBe(1);
  });
});

// ---- Filter ----------------------------------------------------------------------------------------

describe("inhalte-ideen: Filter", () => {
  const A = idea({ id: "a-01", branche: "handwerk", titel: "Alpha Wand", format: "reel", monate: [3, 4], ziel: "vertrauen", saeule: "arbeit" });
  const B = idea({ id: "a-02", branche: "handwerk", titel: "Beta Schrank", format: "carousel", monate: "alle", ziel: "anfragen", saeule: "wissen" });
  const C = idea({ id: "gastro-01", branche: "gastronomie", titel: "Gamma Menü", format: "reel", monate: [4], ziel: "anfragen", saeule: "angebot" });
  const D = idea({ id: "alle-01", branche: ALLE, titel: "Delta Team", format: "bild", monate: "alle", ziel: "vertrauen", saeule: "team" });
  const E = idea({ id: "alle-02", branche: ALLE, titel: "Epsilon Winter", format: "story", monate: [12, 1], ziel: "bindung", saeule: "region" });
  const LIST = [A, B, C, D, E];
  const ids = (list: Idea[]) => list.map((i) => i.id);

  it("ohne Einschränkung zeigt alles, in der Reihenfolge der Daten", () => {
    expect(ids(filterIdeen(LIST, EMPTY_FILTER))).toEqual(["a-01", "a-02", "gastro-01", "alle-01", "alle-02"]);
  });

  it("Branche: die gewählte zuerst, dann die Ideen für alle; andere Branchen fallen weg", () => {
    expect(ids(filterIdeen(LIST, filter({ branche: "handwerk" })))).toEqual(["a-01", "a-02", "alle-01", "alle-02"]);
    expect(ids(filterIdeen(LIST, filter({ branche: "gastronomie" })))).toEqual(["gastro-01", "alle-01", "alle-02"]);
  });

  it("Branche ohne die Ideen für alle", () => {
    expect(ids(filterIdeen(LIST, filter({ branche: "handwerk", mitAllgemein: false })))).toEqual(["a-01", "a-02"]);
  });

  it("«Für alle Betriebe» zeigt nur Ideen mit Branche «alle»", () => {
    expect(ids(filterIdeen(LIST, filter({ branche: UEBERGREIFEND })))).toEqual(["alle-01", "alle-02"]);
  });

  it("Format", () => {
    expect(ids(filterIdeen(LIST, filter({ format: "reel" })))).toEqual(["a-01", "gastro-01"]);
    expect(ids(filterIdeen(LIST, filter({ format: "gbp-post" })))).toEqual([]);
  });

  it("Ziel", () => {
    expect(ids(filterIdeen(LIST, filter({ ziel: "anfragen" })))).toEqual(["a-02", "gastro-01"]);
    expect(ids(filterIdeen(LIST, filter({ ziel: "bindung" })))).toEqual(["alle-02"]);
  });

  it("Säule nach festem Schlüssel", () => {
    expect(ids(filterIdeen(LIST, filter({ saeule: "team" })))).toEqual(["alle-01"]);
    expect(ids(filterIdeen(LIST, filter({ saeule: "region" })))).toEqual(["alle-02"]);
  });

  it("Monat: Ideen für das ganze Jahr passen immer, die mit passendem Monat stehen vorn", () => {
    expect(ids(filterIdeen(LIST, filter({ monat: 4 })))).toEqual(["a-01", "gastro-01", "a-02", "alle-01"]);
    expect(ids(filterIdeen(LIST, filter({ monat: 1 })))).toEqual(["alle-02", "a-02", "alle-01"]);
    expect(ids(filterIdeen(LIST, filter({ monat: 7 })))).toEqual(["a-02", "alle-01"]);
  });

  it("Monat über den Jahreswechsel", () => {
    expect(ideaInMonth(E, 12)).toBe(true);
    expect(ideaInMonth(E, 1)).toBe(true);
    expect(ideaInMonth(E, 6)).toBe(false);
  });

  it("ideaInMonth: «alle» und ungültige Monate schliessen nichts aus", () => {
    expect(ideaInMonth(A, "alle")).toBe(true);
    expect(ideaInMonth(A, 0)).toBe(true);
    expect(ideaInMonth(A, 13)).toBe(true);
    expect(ideaInMonth(A, 1.5)).toBe(true);
  });

  it("kombiniert alle Bedingungen mit UND", () => {
    const f = filter({ branche: "handwerk", format: "reel", monat: 3, ziel: "vertrauen", saeule: "arbeit" });
    expect(ids(filterIdeen(LIST, f))).toEqual(["a-01"]);
    expect(ids(filterIdeen(LIST, { ...f, ziel: "anfragen" }))).toEqual([]);
    expect(ids(filterIdeen(LIST, filter({ branche: "handwerk", monat: 12, ziel: "bindung" })))).toEqual(["alle-02"]);
  });

  it("verändert die übergebene Liste nicht und liefert eine Kopie", () => {
    const copy = [...LIST];
    const out = filterIdeen(LIST, filter({ monat: 4 }));
    expect(LIST).toEqual(copy);
    expect(out).not.toBe(LIST);
    expect(filterIdeen([], EMPTY_FILTER)).toEqual([]);
  });

  it("zeigt mit dem echten Datensatz für Handwerk im Oktober Ideen aus Handwerk und für alle", () => {
    const out = filterIdeen(IDEEN, filter({ branche: "handwerk", monat: 10 }));
    expect(out.length).toBeGreaterThan(20);
    expect(out.every((i) => i.branche === "handwerk" || i.branche === ALLE)).toBe(true);
    expect(out.every((i) => ideaInMonth(i, 10))).toBe(true);
    expect(out[0].branche).toBe("handwerk");
    expect(out.map((i) => i.id)).toContain("handwerk-01");
    expect(out.map((i) => i.id)).not.toContain("handwerk-02"); // Fassadenfarbe: März bis Mai
  });
});

describe("inhalte-ideen: Suche", () => {
  const K = idea({ id: "s-01", titel: "Küche neu lackieren", beschrieb: "Zeig, wie eine Küchenfront neu lackiert wird, Schritt für Schritt.", hook: "Geheimwort Quarz steht nur im Hook." });
  const L = idea({ id: "s-02", titel: "Badumbau", beschrieb: "Zeig die Etappen vom Abbruch bis zur Abnahme." });
  const LIST = [K, L];

  it("findet unabhängig von Gross und Klein", () => {
    expect(filterIdeen(LIST, EMPTY_FILTER, "KÜCHE").map((i) => i.id)).toEqual(["s-01"]);
    expect(filterIdeen(LIST, EMPTY_FILTER, "badumbau").map((i) => i.id)).toEqual(["s-02"]);
  });

  it("findet Umlaute mit und ohne Umlaut (kueche, kuche, Küche)", () => {
    for (const q of ["kueche", "kuche", "Küche", "küchenfront"]) expect(filterIdeen(LIST, EMPTY_FILTER, q).map((i) => i.id), q).toEqual(["s-01"]);
  });

  it("verlangt jedes Wort (UND) in Titel oder Beschrieb", () => {
    expect(filterIdeen(LIST, EMPTY_FILTER, "küche schritt").map((i) => i.id)).toEqual(["s-01"]);
    expect(filterIdeen(LIST, EMPTY_FILTER, "küche abnahme")).toEqual([]);
  });

  it("sucht nicht im Hook", () => {
    expect(filterIdeen(LIST, EMPTY_FILTER, "quarz")).toEqual([]);
  });

  it("ignoriert Leerraum und leere Suche", () => {
    expect(filterIdeen(LIST, EMPTY_FILTER, "").length).toBe(2);
    expect(filterIdeen(LIST, EMPTY_FILTER, "   ").length).toBe(2);
    expect(filterIdeen(LIST, EMPTY_FILTER, "  küche   ").map((i) => i.id)).toEqual(["s-01"]);
  });

  it("wirkt zusammen mit den Filtern", () => {
    expect(filterIdeen(LIST, filter({ format: "bild" }), "küche")).toEqual([]);
    expect(filterIdeen(LIST, filter({ format: "reel" }), "küche").length).toBe(1);
  });

  it("findet im echten Datensatz «Küche» und «Kueche» gleich", () => {
    const a = filterIdeen(IDEEN, EMPTY_FILTER, "Küche").map((i) => i.id);
    const b = filterIdeen(IDEEN, EMPTY_FILTER, "kueche").map((i) => i.id);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

describe("inhalte-ideen: Zahl und Seiten", () => {
  it("countText mit Einzahl und Mehrzahl", () => {
    expect(countText(0)).toBe("0 Ideen");
    expect(countText(1)).toBe("1 Idee");
    expect(countText(24)).toBe("24 Ideen");
  });

  it("visibleLimit zeigt mindestens eine Seite und holt die Zufallskarte dazu", () => {
    expect(visibleLimit(PAGE_SIZE)).toBe(PAGE_SIZE);
    expect(visibleLimit(PAGE_SIZE * 2)).toBe(PAGE_SIZE * 2);
    expect(visibleLimit(0)).toBe(PAGE_SIZE);
    expect(visibleLimit(Number.NaN)).toBe(PAGE_SIZE);
    expect(visibleLimit(-5)).toBe(PAGE_SIZE);
    expect(visibleLimit(PAGE_SIZE, 3)).toBe(PAGE_SIZE);
    expect(visibleLimit(PAGE_SIZE, PAGE_SIZE - 1)).toBe(PAGE_SIZE);
    expect(visibleLimit(PAGE_SIZE, PAGE_SIZE)).toBe(PAGE_SIZE * 2);
    expect(visibleLimit(PAGE_SIZE, PAGE_SIZE * 2 + 5)).toBe(PAGE_SIZE * 3);
  });

  it("brancheLabel", () => {
    expect(brancheLabel(ALLE)).toBe("Alle Branchen");
    expect(brancheLabel(UEBERGREIFEND)).toBe("Für alle Betriebe");
    expect(brancheLabel("gesundheit")).toBe("Gesundheit");
    expect(brancheLabel("gibt-es-nicht")).toBe("gibt-es-nicht");
  });
});

// ---- Zufall ----------------------------------------------------------------------------------------

describe("inhalte-ideen: Zufällige Idee", () => {
  it("wählt mit gleichem Seed immer dieselbe Idee (Zahl und Text)", () => {
    expect(randomIdea(IDEEN, 7)?.id).toBe(randomIdea(IDEEN, 7)?.id);
    expect(randomIdea(IDEEN, "abc")?.id).toBe(randomIdea(IDEEN, "abc")?.id);
  });

  it("wählt mit verschiedenen Seeds verschiedene Ideen", () => {
    const picks = new Set(Array.from({ length: 30 }, (_, n) => randomIdea(IDEEN, n)?.id));
    expect(picks.size).toBeGreaterThan(10);
  });

  it("gibt bei leerer Liste null zurück", () => {
    expect(randomIdea([], 1)).toBeNull();
    expect(randomIdea([])).toBeNull();
  });

  it("wählt die einzige Idee, auch wenn sie ausgeschlossen werden soll", () => {
    const one = idea();
    expect(randomIdea([one], 1, one.id)).toBe(one);
  });

  it("wählt nicht noch einmal dieselbe Idee, solange es eine andere gibt", () => {
    const list = [idea({ id: "x-01", titel: "Eins vorn" }), idea({ id: "x-02", titel: "Zwei vorn" })];
    for (let n = 0; n < 20; n++) expect(randomIdea(list, n, "x-01")?.id).toBe("x-02");
  });

  it("wählt ohne Seed aus der Liste (Math.random)", () => {
    const ids = new Set(IDEEN.map((i) => i.id));
    for (let n = 0; n < 20; n++) expect(ids.has(randomIdea(IDEEN)!.id)).toBe(true);
  });
});

// ---- Monate und Termine -----------------------------------------------------------------------------

describe("inhalte-ideen: Monate lesbar", () => {
  it("ganzjährig, einzelner Monat, zwei Monate, Bereich", () => {
    expect(monateLabel("alle")).toBe("ganzjährig");
    expect(monateLabel([3])).toBe("März");
    expect(monateLabel([3, 4])).toBe("März und April");
    expect(monateLabel([3, 4, 5])).toBe("März bis Mai");
  });

  it("über den Jahreswechsel", () => {
    expect(monateLabel([11, 12, 1])).toBe("November bis Januar");
    expect(monateLabel([12, 1])).toBe("Dezember und Januar");
    expect(monateLabel([1, 12, 11])).toBe("November bis Januar");
  });

  it("mehrere Stücke mit Komma, Dubletten und Unsinn ignoriert", () => {
    expect(monateLabel([3, 4, 5, 9, 10])).toBe("März bis Mai, September und Oktober");
    expect(monateLabel([4, 6])).toBe("April, Juni");
    expect(monateLabel([3, 3, 3])).toBe("März");
    expect(monateLabel([0, 13, 3] as number[])).toBe("März");
  });

  it("alle zwölf Monate oder eine leere Liste heissen ganzjährig", () => {
    expect(monateLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("ganzjährig");
    expect(monateLabel([])).toBe("ganzjährig");
  });

  it("ideaMeta fasst Format, Ziel, Aufwand und Monate zusammen", () => {
    expect(ideaMeta(idea({ format: "carousel", ziel: "anfragen", aufwand: "M", monate: [3, 4, 5] }))).toBe("Karussell, Ziel Anfragen, Aufwand mittel, März bis Mai");
    expect(ideaMeta(idea({ format: "gbp-post", ziel: "bindung", aufwand: "L", monate: "alle" }))).toBe("Google-Beitrag, Ziel Bindung, Aufwand gross, ganzjährig");
  });
});

describe("inhalte-ideen: Datum des Termins", () => {
  it("passt der laufende Monat, gilt heute", () => {
    expect(nextMonthDate([10, 11], new Date("2026-10-05T10:00:00Z"))).toBe("2026-10-05");
  });

  it("sonst der Erste des nächsten passenden Monats im selben Jahr", () => {
    expect(nextMonthDate([3, 4], new Date("2026-01-20T10:00:00Z"))).toBe("2026-03-01");
    expect(nextMonthDate([12], new Date("2026-10-05T10:00:00Z"))).toBe("2026-12-01");
  });

  it("über den Jahreswechsel", () => {
    expect(nextMonthDate([2, 3], new Date("2026-11-15T10:00:00Z"))).toBe("2027-02-01");
    expect(nextMonthDate([1], new Date("2026-12-10T10:00:00Z"))).toBe("2027-01-01");
    expect(nextMonthDate([3], new Date("2026-10-05T10:00:00Z"))).toBe("2027-03-01");
  });

  it("nimmt den frühesten passenden Monat, nicht den ersten in der Liste", () => {
    expect(nextMonthDate([9, 3], new Date("2026-05-10T10:00:00Z"))).toBe("2026-09-01");
    expect(nextMonthDate([1, 12], new Date("2026-10-10T10:00:00Z"))).toBe("2026-12-01");
  });

  it("ein Monat, der gerade vorbei ist, kommt erst nächstes Jahr", () => {
    expect(nextMonthDate([9], new Date("2026-10-05T10:00:00Z"))).toBe("2027-09-01");
  });

  it("«alle», leere Liste und Unsinn ergeben heute", () => {
    const today = new Date("2026-10-05T10:00:00Z");
    expect(nextMonthDate("alle", today)).toBe("2026-10-05");
    expect(nextMonthDate([], today)).toBe("2026-10-05");
    expect(nextMonthDate([0, 13], today)).toBe("2026-10-05");
  });

  it("rechnet in Schweizer Zeit (Mitternacht über den Jahreswechsel)", () => {
    // 31.12.2026, 23:30 UTC ist in Zürich schon der 01.01.2027
    expect(monthOf(new Date("2026-12-31T23:30:00Z"))).toBe(1);
    expect(nextMonthDate([1], new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(nextMonthDate([12], new Date("2026-12-31T23:30:00Z"))).toBe("2027-12-01");
    // Sommerzeit: 30.06.2026, 22:30 UTC ist in Zürich schon der 01.07.
    expect(monthOf(new Date("2026-06-30T22:30:00Z"))).toBe(7);
  });
});

// ---- Merkliste -------------------------------------------------------------------------------------

describe("inhalte-ideen: Merkliste", () => {
  const now = new Date("2026-10-05T10:00:00.000Z");

  it("merkt eine Idee mit Zeitpunkt und entfernt sie beim zweiten Mal", () => {
    const one = toggleMerk([], "handwerk-01", now);
    expect(one).toEqual([{ id: "handwerk-01", gemerktAm: "2026-10-05T10:00:00.000Z" }]);
    expect(toggleMerk(one, "handwerk-01", now)).toEqual([]);
  });

  it("behält die Reihenfolge und verändert die alte Liste nicht", () => {
    const a = toggleMerk([], "a-01", now);
    const b = toggleMerk(a, "b-01", now);
    expect(b.map((e) => e.id)).toEqual(["a-01", "b-01"]);
    expect(a.length).toBe(1);
    const c = toggleMerk(b, "a-01", now);
    expect(c.map((e) => e.id)).toEqual(["b-01"]);
    expect(b.length).toBe(2);
  });

  it("nimmt bei voller Liste nichts mehr auf, Entfernen geht immer", () => {
    const full = Array.from({ length: MAX_MERK }, (_, n) => ({ id: `x-${n + 1}`, gemerktAm: "" }));
    expect(toggleMerk(full, "neu-01", now)).toEqual(full);
    expect(toggleMerk(full, "x-5", now).length).toBe(MAX_MERK - 1);
  });

  it("liest eine gültige Merkliste", () => {
    const raw = { v: 1, ideen: [{ id: "handwerk-01", gemerktAm: "2026-10-05T10:00:00.000Z" }, { id: "alle-02", gemerktAm: "2026-10-06T08:00:00.000Z" }] };
    expect(parseMerkliste(raw)).toEqual(raw);
  });

  it("liest auch eine blosse Liste von IDs oder von Einträgen", () => {
    expect(parseMerkliste(["a-01", "b-02"])).toEqual({ v: 1, ideen: [{ id: "a-01", gemerktAm: "" }, { id: "b-02", gemerktAm: "" }] });
    expect(parseMerkliste([{ id: "a-01" }]).ideen).toEqual([{ id: "a-01", gemerktAm: "" }]);
    expect(parseMerkliste([])).toEqual(EMPTY_MERKLISTE);
  });

  it("macht aus kaputten Daten eine leere Merkliste", () => {
    for (const raw of [null, undefined, 5, "text", true, {}, { ideen: "x" }, { ideen: 3 }, { v: 1 }]) {
      expect(parseMerkliste(raw), String(raw)).toEqual(EMPTY_MERKLISTE);
    }
  });

  it("lässt ungültige Einträge, doppelte IDs und schlechte Daten einzeln weg", () => {
    const raw = {
      ideen: [
        { id: "a-01", gemerktAm: "kein Datum" },
        { id: "a-01", gemerktAm: "2026-10-05T10:00:00.000Z" },
        { id: "B GROSS" },
        { id: 5 },
        null,
        "",
        "x".repeat(41),
        { id: "ok-02", gemerktAm: 12 },
        "ok-03",
      ],
    };
    expect(parseMerkliste(raw).ideen).toEqual([
      { id: "a-01", gemerktAm: "" },
      { id: "ok-02", gemerktAm: "" },
      { id: "ok-03", gemerktAm: "" },
    ]);
  });

  it("kappt eine zu lange Liste bei der Obergrenze", () => {
    const raw = Array.from({ length: MAX_MERK + 50 }, (_, n) => `x-${n + 1}`);
    expect(parseMerkliste(raw).ideen.length).toBe(MAX_MERK);
  });

  it("merkIdeen löst IDs auf und lässt unbekannte weg, in der Reihenfolge der Liste", () => {
    const liste = [{ id: "handwerk-03", gemerktAm: "" }, { id: "gibt-es-nicht", gemerktAm: "" }, { id: "alle-01", gemerktAm: "" }];
    expect(merkIdeen(liste).map((i) => i.id)).toEqual(["handwerk-03", "alle-01"]);
    expect(merkIdeen([])).toEqual([]);
  });

  it("merkSignature ist für dieselbe Liste gleich und für eine andere verschieden", () => {
    const a = [byId("handwerk-01"), byId("handwerk-03")];
    expect(merkSignature(a)).toBe(merkSignature([...a]));
    expect(merkSignature(a)).not.toBe(merkSignature([a[1], a[0]]));
    expect(merkSignature([])).toBe("");
  });
});

describe("inhalte-ideen: Merkliste als Text", () => {
  const drei = [byId("handwerk-01"), byId("handwerk-03"), byId("handwerk-21")];

  it("leere Liste", () => {
    expect(merklisteMarkdown([])).toBe("# Beitragsideen: Merkliste (0 Ideen)\n\nNoch nichts gemerkt.");
  });

  it("ausführlich: Titel, Eckdaten, Beschrieb und erster Satz", () => {
    const md = merklisteMarkdown(drei);
    expect(md.startsWith("# Beitragsideen: Merkliste (3 Ideen)")).toBe(true);
    expect(md).toContain("- **Eine Wand erhält neue Farbe, Schritt für Schritt** (Reel, Ziel Sichtbarkeit, Aufwand mittel, März bis Mai, September und Oktober)");
    expect(md).toContain("  Erster Satz: «Das Wichtigste an einem guten Anstrich sieht später niemand mehr.»");
    expect(md).toContain(byId("handwerk-21").beschrieb);
  });

  it("kompakt: nur Titel mit Eckdaten, eine Zeile je Idee", () => {
    const md = merklisteMarkdown(drei, { kompakt: true });
    expect(md.split("\n").filter((l) => l.startsWith("- ")).length).toBe(3);
    expect(md).not.toContain("Erster Satz");
  });

  it("Einzahl", () => {
    expect(merklisteMarkdown([drei[0]])).toContain("(1 Idee)");
  });

  it("eingabeText nennt Filter, Suche, Art des Exports und die gemerkten Titel", () => {
    const text = eingabeText(filter({ branche: "handwerk", monat: 10, format: "reel" }), " Wand ", drei, "csv");
    expect(text.split("\n")).toEqual([
      "Branche: Handwerk (mit Ideen für alle Betriebe)",
      "Monat: Oktober",
      "Format: Reel",
      "Ziel: alle",
      "Säule: alle",
      "Suche: Wand",
      "Export: CSV",
      "Gemerkt: 3 Ideen",
      "- Eine Wand erhält neue Farbe, Schritt für Schritt",
      "- Warum wir vor dem Streichen schleifen",
      "- Eine Offerte, Zeile für Zeile erklärt",
    ]);
  });

  it("eingabeText ohne Filter, ohne Suche, mit Kalender-Export", () => {
    const text = eingabeText(EMPTY_FILTER, "", [], "ics");
    expect(text).toContain("Branche: Alle Branchen");
    expect(text).toContain("Monat: alle");
    expect(text).toContain("Suche: –");
    expect(text).toContain("Export: Kalender-Entwurf (.ics)");
    expect(text).toContain("Gemerkt: 0 Ideen");
    expect(eingabeText(filter({ branche: UEBERGREIFEND }), "", [], "csv")).toContain("Branche: Für alle Betriebe");
    expect(eingabeText(filter({ branche: "handwerk", mitAllgemein: false }), "", [], "csv")).toContain("Branche: Handwerk\n");
  });

  it("ausgabeText ist die kompakte Merkliste und bleibt mit vielen Ideen lesbar", () => {
    expect(ausgabeText(drei)).toBe(merklisteMarkdown(drei, { kompakt: true }));
    expect(ausgabeText([])).toContain("Noch nichts gemerkt.");
  });

  it("exportBasename mit und ohne Firma", () => {
    expect(exportBasename("Malerei Keller, Gossau")).toBe("inhalte-ideen-malerei-keller-gossau");
    expect(exportBasename()).toBe("inhalte-ideen");
    expect(exportBasename("   ")).toBe("inhalte-ideen");
  });
});

// ---- Export ----------------------------------------------------------------------------------------

describe("inhalte-ideen: CSV", () => {
  const drei = [byId("handwerk-01"), byId("handwerk-03"), byId("handwerk-21")];

  it("beginnt mit BOM, hat die Kopfzeile, CRLF und endet mit Zeilenende", () => {
    const csv = buildCsv(drei);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")[0]).toBe("Titel;Beschrieb;Hook;Format;Ziel;Aufwand;Monate");
    expect(CSV_HEADER.join(";")).toBe("Titel;Beschrieb;Hook;Format;Ziel;Aufwand;Monate");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("schreibt eine Zeile je Idee mit sieben Feldern und lesbaren Beschriftungen", () => {
    const rows = buildCsv(drei).trim().split("\r\n");
    expect(rows.length).toBe(4);
    expect(rows[1].endsWith(";Reel;Sichtbarkeit;mittel;März bis Mai, September und Oktober")).toBe(true);
    expect(rows[3]).toContain(";Karussell;Vertrauen;mittel;ganzjährig");
  });

  it("setzt Felder mit Semikolon, Anführungszeichen oder Zeilenumbruch in Anführungszeichen", () => {
    const csv = buildCsv([idea({ titel: 'Mit "Zitat"; und Semikolon', beschrieb: "Erste Zeile\nZweite Zeile, mit Komma", hook: "Einfacher Hook ohne Besonderheit." })]);
    const body = csv.slice(1).split("\r\n")[1];
    expect(body.startsWith('"Mit ""Zitat""; und Semikolon";"Erste Zeile\nZweite Zeile, mit Komma";Einfacher Hook ohne Besonderheit.;')).toBe(true);
  });

  it("leere Liste: nur die Kopfzeile", () => {
    expect(buildCsv([])).toBe("﻿Titel;Beschrieb;Hook;Format;Ziel;Aufwand;Monate\r\n");
  });

  it("bleibt als UTF-8 mit BOM lesbar (Umlaute überstehen die Kodierung)", () => {
    const bytes = new TextEncoder().encode(buildCsv([byId("alle-18")]));
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain("Jahresrückblick mit Dank");
  });
});

describe("inhalte-ideen: Kalender-Entwurf (.ics)", () => {
  const today = new Date("2026-10-05T10:00:00Z");
  const liste = [byId("handwerk-02"), byId("handwerk-01"), byId("alle-18")];

  const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

  it("hat die Rahmenzeilen, CRLF und ein Ende mit Zeilenumbruch", () => {
    const ics = buildIcs(liste, today);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
    expect(ics).toContain("PRODID:-//Alperna//tools.alperna.ch//DE");
  });

  it("schreibt je Idee genau einen Termin mit gleich vielen BEGIN und END", () => {
    const lines = unfold(buildIcs(liste, today));
    expect(lines.filter((l) => l === "BEGIN:VEVENT").length).toBe(3);
    expect(lines.filter((l) => l === "END:VEVENT").length).toBe(3);
    expect(lines.filter((l) => l.startsWith("SUMMARY:")).length).toBe(3);
  });

  it("nimmt den ersten Tag des nächsten passenden Monats als Ganztagstermin", () => {
    const lines = unfold(buildIcs(liste, today));
    // handwerk-02 (März bis Mai) → 01.03.2027, handwerk-01 (inkl. Oktober) → heute, alle-18 (Dezember, Januar) → 01.12.2026
    expect(lines).toContain("DTSTART;VALUE=DATE:20270301");
    expect(lines).toContain("DTEND;VALUE=DATE:20270302");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261005");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261201");
  });

  it("DTEND ist der Folgetag, auch am Monats- und Jahresende", () => {
    const monatsende = unfold(buildIcs([idea({ monate: "alle" })], new Date("2026-10-31T10:00:00Z")));
    expect(monatsende).toContain("DTSTART;VALUE=DATE:20261031");
    expect(monatsende).toContain("DTEND;VALUE=DATE:20261101");
    const jahresende = unfold(buildIcs([idea({ monate: "alle" })], new Date("2026-12-31T10:00:00Z")));
    expect(jahresende).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("SUMMARY lautet «Idee: <Titel>», DESCRIPTION trägt Beschrieb und ersten Satz", () => {
    const lines = unfold(buildIcs([byId("alle-18")], today));
    expect(lines).toContain("SUMMARY:Idee: Jahresrückblick mit Dank");
    const description = lines.find((l) => l.startsWith("DESCRIPTION:")) ?? "";
    expect(description).toContain(byId("alle-18").beschrieb.replace(/,/g, "\\,"));
    expect(description).toContain("\\n\\nErster Satz: Das Jahr geht zu Ende\\, und wir sagen danke.");
  });

  it("maskiert Komma, Semikolon, Backslash und Zeilenumbruch", () => {
    const lines = unfold(buildIcs([idea({ titel: "A, B; C \\ D", beschrieb: "Zeile eins\nZeile zwei, mit Komma; und Semikolon", hook: "Hook, ohne Ende." })], today));
    expect(lines).toContain("SUMMARY:Idee: A\\, B\\; C \\\\ D");
    const description = lines.find((l) => l.startsWith("DESCRIPTION:")) ?? "";
    expect(description).toContain("Zeile eins\\nZeile zwei\\, mit Komma\\; und Semikolon");
  });

  it("markiert Termine als vorläufig und frei, mit eindeutiger UID und Zeitstempel", () => {
    const ics = buildIcs(liste, today);
    expect(ics.match(/STATUS:TENTATIVE/g)?.length).toBe(3);
    expect(ics.match(/TRANSP:TRANSPARENT/g)?.length).toBe(3);
    expect(ics).toContain("DTSTAMP:20261005T100000Z");
    const uids = unfold(ics).filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(3);
    expect(uids[0]).toBe("UID:handwerk-02-20270301@tools.alperna.ch");
  });

  it("faltet jede Zeile auf höchstens 75 Byte, ohne Zeichen zu zerreissen", () => {
    const enc = new TextEncoder();
    const ics = buildIcs([idea({ titel: "Ü".repeat(60), beschrieb: "ä".repeat(150), hook: "ö".repeat(80) })], today);
    for (const line of ics.split("\r\n")) expect(enc.encode(line).length, line).toBeLessThanOrEqual(75);
    const joined = unfold(ics).find((l) => l.startsWith("SUMMARY:"));
    expect(joined).toBe(`SUMMARY:Idee: ${"Ü".repeat(60)}`);
  });

  it("leere Liste: gültiger Kalender ohne Termine", () => {
    const ics = buildIcs([], today);
    expect(ics).not.toContain("BEGIN:VEVENT");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("foldIcsLine lässt kurze Zeilen stehen und hängt lange mit Leerzeichen an", () => {
    expect(foldIcsLine("SUMMARY:kurz")).toBe("SUMMARY:kurz");
    const folded = foldIcsLine(`X:${"a".repeat(200)}`);
    expect(folded.split("\r\n").length).toBe(3);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`X:${"a".repeat(200)}`);
  });
});

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

describe("inhalte-ideen: Stand unter mt:inhalte-ideen", () => {
  it("liest einen gültigen Stand", () => {
    expect(parseState({ v: 1, output: { gemerkt: 3 } })).toEqual({ v: 1, output: { gemerkt: 3 } });
  });

  it("macht aus kaputten Daten den leeren Stand", () => {
    for (const raw of [null, undefined, 5, "x", [], {}, { v: 1 }, { output: 3 }, { output: {} }, { output: { gemerkt: "3" } }, { output: { gemerkt: -1 } }, { output: { gemerkt: Number.NaN } }, { output: { gemerkt: Infinity } }]) {
      expect(parseState(raw), JSON.stringify(raw)).toEqual(EMPTY_STATE);
    }
  });

  it("rundet ab und deckelt bei der Obergrenze", () => {
    expect(parseState({ output: { gemerkt: 2.9 } }).output?.gemerkt).toBe(2);
    expect(parseState({ output: { gemerkt: 100000 } }).output?.gemerkt).toBe(MAX_MERK);
  });

  it("stateAfterMerk schreibt die Zahl, sobald etwas gemerkt ist, und lässt sie bei leerer Liste stehen", () => {
    expect(stateAfterMerk(EMPTY_STATE, 1)).toEqual({ v: 1, output: { gemerkt: 1 } });
    expect(stateAfterMerk({ v: 1, output: { gemerkt: 4 } }, 0)).toEqual({ v: 1, output: { gemerkt: 4 } });
    expect(stateAfterMerk(EMPTY_STATE, 0)).toEqual(EMPTY_STATE);
    expect(stateAfterMerk(EMPTY_STATE, MAX_MERK + 5).output?.gemerkt).toBe(MAX_MERK);
  });

  it("hat die Form, die lib/progress.ts als erledigt erkennt (Objekt unter output)", async () => {
    const { isToolDone } = await import("@/lib/progress");
    expect(isToolDone(JSON.stringify(stateAfterMerk(EMPTY_STATE, 1)))).toBe(true);
    expect(isToolDone(JSON.stringify(EMPTY_STATE))).toBe(false);
  });

  it("eigeneSaeulen liest die Namen aus dem Profil und überspringt Leeres und Unsinn", () => {
    expect(eigeneSaeulen([{ name: "Handwerk zeigen" }, { name: "  Team  " }, { name: "" }, { name: 5 }, null, "x", {}])).toEqual(["Handwerk zeigen", "Team"]);
    expect(eigeneSaeulen(undefined)).toEqual([]);
    expect(eigeneSaeulen("x")).toEqual([]);
    expect(eigeneSaeulen([])).toEqual([]);
  });
});

// ---- Beispiel im Seitentext -------------------------------------------------------------------------

describe("inhalte-ideen: Beispiel Malerei Keller, Gossau", () => {
  const ids = ["handwerk-01", "handwerk-03", "handwerk-21"];

  it("die drei Ideen des Beispiels gibt es und sie passen zu Handwerk im Oktober", () => {
    const list = filterIdeen(IDEEN, filter({ branche: "handwerk", monat: 10 })).map((i) => i.id);
    for (const id of ids) expect(list, id).toContain(id);
  });

  it("die Eckdaten im Seitentext stimmen mit der Logik überein", () => {
    expect(ids.map((id) => ideaMeta(byId(id)))).toEqual([
      "Reel, Ziel Sichtbarkeit, Aufwand mittel, März bis Mai, September und Oktober",
      "Reel, Ziel Vertrauen, Aufwand klein, ganzjährig",
      "Karussell, Ziel Vertrauen, Aufwand mittel, ganzjährig",
    ]);
  });

  it("Malerei Keller wird als Handwerk erkannt", () => {
    expect(branchenKeyFor("Malerei", BRANCHEN)).toBe("handwerk");
  });
});
