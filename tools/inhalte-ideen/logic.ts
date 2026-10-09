import { z } from "zod";
import ideenData from "@/data/branchen-ideen.json";
import { brancheOf } from "@/lib/branchen";
import { safeFilename } from "@/lib/export/model";

// Beitragsideen nach Branche: reine Funktionen, kein React, kein DOM, kein fetch (CLAUDE.md, Harte Regel 3).
// Datensatz laden und prüfen, filtern, suchen, Zufall, Merkliste, CSV und Kalender-Entwurf, Texte fürs CRM, gespeicherter Stand.
// Browser-Dinge (Download, Fokus, Scrollen) stehen in Tool.tsx. Spec: specs/inhalte-ideen.md

export const SLUG = "inhalte-ideen";
export const STATE_KEY = `mt:${SLUG}`;
/** Schlüssel der Merkliste laut CLAUDE.md. Kein anderes Werkzeug nutzt ihn bisher; gespeichert wird `{ v: 1, ideen: [{ id, gemerktAm }] }`. */
export const MERKLISTE_KEY = "mt:merkliste";
/** Obergrenze der Merkliste, damit der Speicher und der Export klein bleiben. */
export const MAX_MERK = 200;
/** So viele Karten zeigt die Liste auf einmal; «Mehr Ideen anzeigen» legt nach. */
export const PAGE_SIZE = 24;
/** Schlüssel für Ideen, die zu jedem Betrieb passen (in den Daten `branche: "alle"`). */
export const ALLE = "alle";
/** Wert im Branchen-Filter: nur die Ideen für alle Betriebe. */
export const UEBERGREIFEND = "uebergreifend";

// ---- Auswahllisten und Beschriftungen -----------------------------------------------------------

export const FORMATE = ["reel", "carousel", "bild", "story", "linkedin-text", "gbp-post"] as const;
export const ZIELE = ["vertrauen", "sichtbarkeit", "anfragen", "bindung"] as const;
export const AUFWAENDE = ["S", "M", "L"] as const;
export const SAEULEN = ["arbeit", "wissen", "team", "angebot", "region"] as const;

export type Format = (typeof FORMATE)[number];
export type Ziel = (typeof ZIELE)[number];
export type Aufwand = (typeof AUFWAENDE)[number];
export type Saeule = (typeof SAEULEN)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  reel: "Reel",
  carousel: "Karussell",
  bild: "Bild",
  story: "Story",
  "linkedin-text": "LinkedIn-Text",
  "gbp-post": "Google-Beitrag",
};
export const ZIEL_LABELS: Record<Ziel, string> = {
  vertrauen: "Vertrauen",
  sichtbarkeit: "Sichtbarkeit",
  anfragen: "Anfragen",
  bindung: "Bindung",
};
export const AUFWAND_LABELS: Record<Aufwand, string> = { S: "klein", M: "mittel", L: "gross" };
export const AUFWAND_HINWEIS =
  "Aufwand: klein heisst, du schaffst es mit dem Handy in kurzer Zeit. Mittel braucht etwas Vorbereitung, gross mehrere Szenen oder Termine.";
export const SAEULE_LABELS: Record<Saeule, string> = {
  arbeit: "Arbeit",
  wissen: "Wissen",
  team: "Team",
  angebot: "Angebot",
  region: "Region",
};
export const MONAT_NAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"] as const;

export const isFormat = (v: unknown): v is Format => typeof v === "string" && (FORMATE as readonly string[]).includes(v);
export const isZiel = (v: unknown): v is Ziel => typeof v === "string" && (ZIELE as readonly string[]).includes(v);
export const isSaeule = (v: unknown): v is Saeule => typeof v === "string" && (SAEULEN as readonly string[]).includes(v);

// ---- Datensatz -----------------------------------------------------------------------------------

export const monateSchema = z.union([z.literal("alle"), z.array(z.number().int().min(1).max(12)).min(1).max(12)]);

export const ideaSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
  branche: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
  titel: z.string().trim().min(5).max(70),
  beschrieb: z.string().trim().min(20).max(220),
  hook: z.string().trim().min(10).max(120),
  format: z.enum(FORMATE),
  monate: monateSchema,
  ziel: z.enum(ZIELE),
  aufwand: z.enum(AUFWAENDE),
  saeule: z.enum(SAEULEN).optional(),
});
export type Idea = z.infer<typeof ideaSchema>;

export const brancheSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
  label: z.string().trim().min(3).max(60),
  beispiele: z.array(z.string().trim().min(2).max(40)).min(3).max(30),
});
export type Branche = z.infer<typeof brancheSchema>;

export const metaSchema = z.object({
  source: z.string().min(3),
  url: z.string().min(3),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
});

/** Strenges Schema des ganzen Datensatzes: eindeutige IDs und Titel, jede Idee gehört zu einer Branche oder zu «alle». */
export const datasetSchema = z
  .object({ meta: metaSchema, branchen: z.array(brancheSchema).min(1), ideen: z.array(ideaSchema).min(1) })
  .superRefine((d, ctx) => {
    const keys = new Set(d.branchen.map((b) => b.key));
    if (keys.size !== d.branchen.length || keys.has(ALLE)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Branchen-Schlüssel doppelt oder «alle»" });
    const ids = new Set<string>();
    const titles = new Set<string>();
    for (const i of d.ideen) {
      if (ids.has(i.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `ID doppelt: ${i.id}` });
      ids.add(i.id);
      const t = i.titel.toLowerCase();
      if (titles.has(t)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Titel doppelt: ${i.titel}` });
      titles.add(t);
      if (i.branche !== ALLE && !keys.has(i.branche)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unbekannte Branche bei ${i.id}: ${i.branche}` });
    }
  });

export type Dataset = { meta: z.infer<typeof metaSchema> | null; branchen: Branche[]; ideen: Idea[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Liest den Datensatz robust: Ungültige Branchen und Ideen fallen weg, der Rest bleibt. Ideen einer unbekannten Branche und doppelte
 * IDs oder Titel fallen ebenfalls weg. Kaputte Daten ergeben eine leere Bibliothek, nie einen Absturz.
 */
export function loadDataset(raw: unknown): Dataset {
  if (!isRecord(raw)) return { meta: null, branchen: [], ideen: [] };
  const meta = metaSchema.safeParse(raw.meta);
  const branchen: Branche[] = [];
  const keys = new Set<string>();
  for (const b of Array.isArray(raw.branchen) ? raw.branchen : []) {
    const p = brancheSchema.safeParse(b);
    if (p.success && p.data.key !== ALLE && !keys.has(p.data.key)) {
      keys.add(p.data.key);
      branchen.push(p.data);
    }
  }
  const ideen: Idea[] = [];
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const i of Array.isArray(raw.ideen) ? raw.ideen : []) {
    const p = ideaSchema.safeParse(i);
    if (!p.success) continue;
    const idea = p.data;
    if (idea.branche !== ALLE && !keys.has(idea.branche)) continue;
    const t = idea.titel.toLowerCase();
    if (ids.has(idea.id) || titles.has(t)) continue;
    ids.add(idea.id);
    titles.add(t);
    ideen.push(idea);
  }
  return { meta: meta.success ? meta.data : null, branchen, ideen };
}

const DATA = loadDataset(ideenData);
export const BRANCHEN: readonly Branche[] = DATA.branchen;
export const IDEEN: readonly Idea[] = DATA.ideen;
export const META = DATA.meta;

export const brancheLabel = (key: string, branchen: readonly Branche[] = BRANCHEN): string => {
  if (key === ALLE) return "Alle Branchen";
  if (key === UEBERGREIFEND) return "Für alle Betriebe";
  return branchen.find((b) => b.key === key)?.label ?? key;
};

// ---- Branche aus dem Firmenprofil ---------------------------------------------------------------

/** Kleinbuchstaben, ohne Umlaute und Akzente («Küche» → «kuche», «Sanitär» → «sanitar»), ss statt ß; «ae/oe/ue» zählt wie «a/o/u». */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ae|oe|ue/g, (m) => m[0]);
}

/**
 * Welche Branche der Bibliothek passt zum Eintrag «Branche» im Firmenprofil? Die Zuordnung macht die gemeinsame Branchenliste
 * (lib/branchen.ts: Wortvergleich gegen Bezeichnung und Beispiele); hier wird ihr Ergebnis in eine Branche dieser Bibliothek übersetzt.
 * Ohne Treffer: «verein», wenn die Organisation ein Verein ist, sonst «alle».
 */
export function branchenKeyFor(branche: string | undefined, branchen: readonly Branche[] = BRANCHEN, organisationstyp?: string): string {
  const hasVerein = branchen.some((b) => b.key === "verein");
  const fallback = organisationstyp === "verein" && hasVerein ? "verein" : ALLE;
  // Vereine stehen nicht in der gemeinsamen Liste (Rechtsform, nicht Branche); «Sportverein» soll nicht bei «Sport» landen.
  if (hasVerein && /verein/i.test(branche ?? "")) return "verein";
  // Die Zuordnung steht in der gemeinsamen Branchenliste (lib/branchen.ts); hier nur die Übersetzung in die Branchen dieser Bibliothek.
  const key = brancheOf(branche)?.ideen;
  return key && key !== ALLE && branchen.some((b) => b.key === key) ? key : fallback;
}

// ---- Filter und Suche ---------------------------------------------------------------------------

export type Filter = {
  /** «alle»: keine Einschränkung. «uebergreifend»: nur Ideen für alle Betriebe. Sonst der Schlüssel einer Branche. */
  branche: string;
  /** Bei einer Branche auch die Ideen für alle Betriebe zeigen. */
  mitAllgemein: boolean;
  format: Format | "alle";
  monat: number | "alle";
  ziel: Ziel | "alle";
  saeule: Saeule | "alle";
};

export const EMPTY_FILTER: Filter = { branche: ALLE, mitAllgemein: true, format: "alle", monat: "alle", ziel: "alle", saeule: "alle" };

const isMonth = (m: unknown): m is number => typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12;

/** Ob `value` ein Monat von 1 bis 12 ist (für den Monats-Filter, der auch «alle» kennt). */
export const isMonatWert = (value: unknown): value is number => isMonth(value);

/**
 * Startwerte der Filter: die Branche aus dem Firmenprofil (Wortvergleich, sonst «alle») und der laufende Monat in Schweizer Zeit.
 * Format, Ziel und Säule bleiben offen.
 */
export function initialFilter(
  profile: { branche?: string; organisationstyp?: string },
  today: Date,
  branchen: readonly Branche[] = BRANCHEN,
): Filter {
  return { ...EMPTY_FILTER, branche: branchenKeyFor(profile.branche, branchen, profile.organisationstyp), monat: monthOf(today) };
}

/** Passt die Idee zum Monat? Ideen für das ganze Jahr passen immer. */
export function ideaInMonth(idea: Pick<Idea, "monate">, monat: number | "alle"): boolean {
  if (monat === "alle" || !isMonth(monat)) return true;
  return idea.monate === "alle" || idea.monate.includes(monat);
}

/** Suchbegriff in Wörter zerlegt und gefaltet (Gross/Klein und Umlaute egal). */
export function queryTokens(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

/**
 * Filtert die Ideen. Alle Bedingungen gelten zugleich (UND). Die Suche trifft Titel und Beschrieb, jedes Wort muss vorkommen.
 * Reihenfolge: zuerst Ideen der gewählten Branche, dann die für alle Betriebe; innerhalb davon zuerst die, die ausdrücklich zum gewählten Monat
 * passen; sonst bleibt die Reihenfolge der Daten.
 */
export function filterIdeen(ideen: readonly Idea[], filter: Filter, query = ""): Idea[] {
  const tokens = queryTokens(query);
  const specific = filter.branche !== ALLE && filter.branche !== UEBERGREIFEND;
  const picked = ideen.filter((i) => {
    if (filter.branche === UEBERGREIFEND && i.branche !== ALLE) return false;
    if (specific && !(i.branche === filter.branche || (filter.mitAllgemein && i.branche === ALLE))) return false;
    if (filter.format !== "alle" && i.format !== filter.format) return false;
    if (filter.ziel !== "alle" && i.ziel !== filter.ziel) return false;
    if (filter.saeule !== "alle" && i.saeule !== filter.saeule) return false;
    if (!ideaInMonth(i, filter.monat)) return false;
    if (tokens.length > 0) {
      const hay = foldText(`${i.titel} ${i.beschrieb}`);
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  const monat = isMonth(filter.monat) ? filter.monat : null;
  const rank = (i: Idea) => (specific && i.branche === ALLE ? 2 : 0) + (monat !== null && i.monate !== "alle" && i.monate.includes(monat) ? 0 : 1);
  // Array.prototype.sort ist stabil: gleicher Rang behält die Reihenfolge der Daten.
  return picked
    .map((idea, index) => ({ idea, index }))
    .sort((a, b) => rank(a.idea) - rank(b.idea) || a.index - b.index)
    .map((x) => x.idea);
}

/** Zahl der Treffer als Satz für die Statuszeile. */
export function countText(n: number): string {
  return `${n} ${n === 1 ? "Idee" : "Ideen"}`;
}

/**
 * So viele Karten zeigt die Liste: mindestens eine Seite, so viele wie `limit` sagt, und immer genug, dass die Karte an Stelle `index`
 * (zum Beispiel die zufällige Idee) dabei ist. Ungültige Werte ergeben eine Seite.
 */
export function visibleLimit(limit: number, index = -1): number {
  const base = Number.isFinite(limit) ? Math.max(PAGE_SIZE, Math.floor(limit)) : PAGE_SIZE;
  return index >= base ? Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE : base;
}

// ---- Zufall ---------------------------------------------------------------------------------------

function hashSeed(seed: number | string): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Kleiner, deterministischer Zufallsgenerator (mulberry32). */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Eine zufällige Idee aus der Liste. Mit `seed` immer dieselbe Wahl; ohne `seed` entscheidet Math.random.
 * `exceptId`: diese Idee nicht noch einmal wählen, solange es eine andere gibt. Leere Liste: null.
 */
export function randomIdea(ideen: readonly Idea[], seed?: number | string, exceptId?: string): Idea | null {
  if (ideen.length === 0) return null;
  const pool = exceptId && ideen.length > 1 ? ideen.filter((i) => i.id !== exceptId) : ideen;
  const rnd = seed === undefined ? Math.random() : mulberry32(hashSeed(seed))();
  return pool[Math.min(pool.length - 1, Math.floor(rnd * pool.length))];
}

// ---- Monate und Termine -------------------------------------------------------------------------

/**
 * Monate lesbar: «ganzjährig», «März», «März bis Mai», «November bis Januar» (über den Jahreswechsel), mehrere Stücke mit Komma.
 * Zwei aufeinanderfolgende Monate heissen «März und April».
 */
export function monateLabel(monate: Idea["monate"]): string {
  if (monate === "alle") return "ganzjährig";
  const present = Array.from({ length: 13 }, () => false);
  for (const m of monate) if (isMonth(m)) present[m] = true;
  const count = present.filter(Boolean).length;
  if (count === 0 || count === 12) return "ganzjährig";
  const prev = (m: number) => (m === 1 ? 12 : m - 1);
  const next = (m: number) => (m === 12 ? 1 : m + 1);
  const parts: string[] = [];
  for (let m = 1; m <= 12; m++) {
    if (!present[m] || present[prev(m)]) continue; // nur der Anfang eines Stücks
    let end = m;
    let len = 1;
    while (present[next(end)]) {
      end = next(end);
      len++;
    }
    const a = MONAT_NAMEN[m - 1];
    const b = MONAT_NAMEN[end - 1];
    parts.push(len === 1 ? a : len === 2 ? `${a} und ${b}` : `${a} bis ${b}`);
  }
  return parts.join(", ");
}

type Ymd = { y: number; m: number; d: number };

/** Jahr, Monat und Tag in Schweizer Zeit. */
export function zurichYmd(date: Date): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Aktueller Monat (1 bis 12) in Schweizer Zeit. */
export const monthOf = (date: Date): number => zurichYmd(date).m;

const two = (n: number) => String(n).padStart(2, "0");
const isoDate = ({ y, m, d }: Ymd) => `${y}-${two(m)}-${two(d)}`;

/**
 * Datum des Termins für eine Idee, als «JJJJ-MM-TT». Passt der laufende Monat, gilt heute (der Erste dieses Monats läge in der Vergangenheit).
 * Sonst der erste Tag des nächsten passenden Monats, auch über den Jahreswechsel. «alle» oder eine leere Liste passen immer: heute.
 */
export function nextMonthDate(monate: Idea["monate"], today: Date): string {
  const t = zurichYmd(today);
  const valid = monate === "alle" ? [] : monate.filter(isMonth);
  if (valid.length === 0 || valid.includes(t.m)) return isoDate(t);
  for (let k = 1; k <= 12; k++) {
    const idx = t.m - 1 + k;
    const m = (idx % 12) + 1;
    if (valid.includes(m)) return isoDate({ y: t.y + Math.floor(idx / 12), m, d: 1 });
  }
  return isoDate(t);
}

// ---- Merkliste ------------------------------------------------------------------------------------

export type MerkEintrag = { id: string; gemerktAm: string };
export type Merkliste = { v: 1; ideen: MerkEintrag[] };
export const EMPTY_MERKLISTE: Merkliste = { v: 1, ideen: [] };

/** Liest die Merkliste aus beliebigen Daten (auch eine blosse Liste von IDs). Kaputtes fällt weg, doppelte IDs zählen einmal. */
export function parseMerkliste(raw: unknown): Merkliste {
  const source = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.ideen) ? raw.ideen : null;
  if (!source) return EMPTY_MERKLISTE;
  const seen = new Set<string>();
  const out: MerkEintrag[] = [];
  for (const e of source) {
    const id = typeof e === "string" ? e : isRecord(e) && typeof e.id === "string" ? e.id : "";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 40 || seen.has(id)) continue;
    seen.add(id);
    const am = isRecord(e) && typeof e.gemerktAm === "string" && !Number.isNaN(Date.parse(e.gemerktAm)) ? e.gemerktAm : "";
    out.push({ id, gemerktAm: am });
    if (out.length >= MAX_MERK) break;
  }
  return { v: 1, ideen: out };
}

/** Merkt die Idee oder entfernt sie wieder. Eine volle Liste nimmt nichts mehr auf (Entfernen geht immer). */
export function toggleMerk(liste: readonly MerkEintrag[], id: string, now: Date = new Date()): MerkEintrag[] {
  if (liste.some((e) => e.id === id)) return liste.filter((e) => e.id !== id);
  if (liste.length >= MAX_MERK) return [...liste];
  return [...liste, { id, gemerktAm: now.toISOString() }];
}

/** Die gemerkten Ideen in der Reihenfolge der Merkliste. IDs, die es nicht mehr gibt, fallen weg. */
export function merkIdeen(liste: readonly MerkEintrag[], ideen: readonly Idea[] = IDEEN): Idea[] {
  const byId = new Map(ideen.map((i) => [i.id, i]));
  return liste.flatMap((e) => {
    const idea = byId.get(e.id);
    return idea ? [idea] : [];
  });
}

/** Kurzbeschreibung einer Idee in einer Zeile: «Reel, Ziel Vertrauen, Aufwand klein, März bis Mai». */
export function ideaMeta(i: Idea): string {
  return `${FORMAT_LABELS[i.format]}, Ziel ${ZIEL_LABELS[i.ziel]}, Aufwand ${AUFWAND_LABELS[i.aufwand]}, ${monateLabel(i.monate)}`;
}

/**
 * Merkliste als Markdown. Kompakt (fürs CRM, das auf 1'900 Zeichen kürzt): Titel mit Eckdaten. Ausführlich (zum Kopieren): dazu Beschrieb
 * und erster Satz.
 */
export function merklisteMarkdown(ideen: readonly Idea[], opts: { kompakt?: boolean } = {}): string {
  const head = `# Beitragsideen: Merkliste (${countText(ideen.length)})`;
  if (ideen.length === 0) return `${head}\n\nNoch nichts gemerkt.`;
  const items = ideen.map((i) =>
    opts.kompakt ? `- **${i.titel}** (${ideaMeta(i)})` : `- **${i.titel}** (${ideaMeta(i)})\n  ${i.beschrieb}\n  Erster Satz: «${i.hook}»`,
  );
  return `${head}\n\n${items.join("\n")}`;
}

// ---- Export: CSV und Kalender-Entwurf ------------------------------------------------------------

export const CSV_HEADER = ["Titel", "Beschrieb", "Hook", "Format", "Ziel", "Aufwand", "Monate"] as const;

function csvCell(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV für Excel (Schweiz): Semikolon, Zeilenende CRLF, UTF-8 mit BOM, damit Umlaute stimmen. */
export function buildCsv(ideen: readonly Idea[]): string {
  const rows = ideen.map((i) =>
    [i.titel, i.beschrieb, i.hook, FORMAT_LABELS[i.format], ZIEL_LABELS[i.ziel], AUFWAND_LABELS[i.aufwand], monateLabel(i.monate)].map(csvCell).join(";"),
  );
  return `\uFEFF${[CSV_HEADER.join(";"), ...rows].join("\r\n")}\r\n`;
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Faltet eine Zeile nach RFC 5545 auf höchstens 75 Byte (UTF-8); Folgezeilen beginnen mit einem Leerzeichen. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // das führende Leerzeichen zählt mit
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}${two(t.getUTCMonth() + 1)}${two(t.getUTCDate())}`;
}

/**
 * Kalender-Entwurf (.ics): je Idee ein Ganztagstermin (siehe nextMonthDate), SUMMARY «Idee: <Titel>», DESCRIPTION Beschrieb und erster Satz.
 * Die Termine sind als vorläufig und «frei» markiert und lassen sich im Kalender verschieben.
 */
export function buildIcs(ideen: readonly Idea[], today: Date = new Date()): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alperna//tools.alperna.ch//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Beitragsideen"];
  const stamp = icsStamp(today);
  for (const i of ideen) {
    const start = nextMonthDate(i.monate, today);
    const compact = start.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${i.id}-${compact}@tools.alperna.ch`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact}`,
      `DTEND;VALUE=DATE:${addDays(start, 1)}`,
      `SUMMARY:${icsEscape(`Idee: ${i.titel}`)}`,
      `DESCRIPTION:${icsEscape(`${i.beschrieb}\n\nErster Satz: ${i.hook}`)}`,
      "STATUS:TENTATIVE",
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Dateiname ohne Endung: «inhalte-ideen-malerei-keller» oder «inhalte-ideen». */
export function exportBasename(firma?: string): string {
  return safeFilename(`${SLUG} ${firma ?? ""}`, SLUG);
}

// ---- Texte fürs CRM -------------------------------------------------------------------------------

export type ExportKind = "csv" | "ics";
export const EXPORT_LABELS: Record<ExportKind, string> = { csv: "CSV", ics: "Kalender-Entwurf (.ics)" };

/** Die Angaben der Person, eine Zeile je Angabe: Filter, Suche, Art des Exports, gemerkte Titel. */
export function eingabeText(filter: Filter, query: string, gemerkt: readonly Idea[], kind: ExportKind, branchen: readonly Branche[] = BRANCHEN): string {
  const specific = filter.branche !== ALLE && filter.branche !== UEBERGREIFEND;
  const lines = [
    `Branche: ${brancheLabel(filter.branche, branchen)}${specific && filter.mitAllgemein ? " (mit Ideen für alle Betriebe)" : ""}`,
    `Monat: ${isMonth(filter.monat) ? MONAT_NAMEN[filter.monat - 1] : "alle"}`,
    `Format: ${filter.format === "alle" ? "alle" : FORMAT_LABELS[filter.format]}`,
    `Ziel: ${filter.ziel === "alle" ? "alle" : ZIEL_LABELS[filter.ziel]}`,
    `Säule: ${filter.saeule === "alle" ? "alle" : SAEULE_LABELS[filter.saeule]}`,
    `Suche: ${query.trim() || "–"}`,
    `Export: ${EXPORT_LABELS[kind]}`,
    `Gemerkt: ${countText(gemerkt.length)}`,
    ...gemerkt.map((i) => `- ${i.titel}`),
  ];
  return lines.join("\n");
}

/** Das Ergebnis fürs CRM: die Merkliste, kompakt. */
export const ausgabeText = (gemerkt: readonly Idea[]): string => merklisteMarkdown(gemerkt, { kompakt: true });

/** Wer dieselbe Merkliste noch einmal exportiert, löst keinen zweiten CRM-Eintrag aus: Unterschrift der Liste. */
export const merkSignature = (gemerkt: readonly Idea[]): string => gemerkt.map((i) => i.id).join(",");

// ---- Gespeicherter Stand --------------------------------------------------------------------------

/** Stand unter mt:inhalte-ideen. `output` erscheint beim ersten Merken; lib/progress.ts zählt das Werkzeug dann als erledigt. */
export type ContentIdeenState = { v: 1; output?: { gemerkt: number } };
export const EMPTY_STATE: ContentIdeenState = { v: 1 };

/** Liest den Stand aus beliebigen Daten; Kaputtes ergibt den leeren Stand. */
export function parseState(raw: unknown): ContentIdeenState {
  if (!isRecord(raw) || !isRecord(raw.output)) return EMPTY_STATE;
  const n = raw.output.gemerkt;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return EMPTY_STATE;
  return { v: 1, output: { gemerkt: Math.min(Math.floor(n), MAX_MERK) } };
}

/** Der Stand nach einer Änderung der Merkliste: mit Ideen wird die Zahl geschrieben, eine leere Liste lässt den bisherigen Stand stehen. */
export function stateAfterMerk(prev: ContentIdeenState, anzahl: number): ContentIdeenState {
  return anzahl > 0 ? { v: 1, output: { gemerkt: Math.min(anzahl, MAX_MERK) } } : prev;
}

/** Namen der eigenen Säulen aus dem Firmenprofil (Feld contentSaeulen), für den Hinweis «Deine Säulen». */
export function eigeneSaeulen(saeulen: unknown): string[] {
  if (!Array.isArray(saeulen)) return [];
  return saeulen.flatMap((s) => (isRecord(s) && typeof s.name === "string" && s.name.trim() ? [s.name.trim()] : []));
}
