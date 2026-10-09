import { z } from "zod";
import benchmarkData from "@/data/engagement-benchmarks.json";
import { numberCH, pctCH } from "@/lib/ch";
import { safeFilename, toMarkdown, type DocBlock, type DocumentModel } from "@/lib/export/model";

// Engagement-Rate-Rechner: reine Funktionen, kein React, kein DOM, kein Netz (CLAUDE.md, Harte Regel 3).
// Die Person tippt die Zahlen aus der Statistik der Plattform ab; Instagram, LinkedIn, Facebook und TikTok lassen sich nicht
// auslesen. Gerechnet wird nach zwei Formeln (auf Follower, auf Reichweite). Zwei Wege der Eingabe: «kurz» (Summen über alle
// Beiträge und deren Zahl, ein Durchschnittsbeitrag) und «einzeln» (bis zu zehn Beiträge). Ein Vergleichswert («Du hast X, der
// Durchschnitt internationaler Marken lag bei Y») erscheint nur dort, wo die Formel der Quelle genau zur Formel des Werkzeugs
// passt (data/engagement-benchmarks.json, Harte Regel 7); sonst entfällt der Satz.

export const SLUG = "engagement-rate";

// ---- Plattformen -----------------------------------------------------------------------------------

export const PLATTFORM_KEYS = ["instagram", "linkedin", "facebook", "tiktok"] as const;
export type PlattformKey = (typeof PLATTFORM_KEYS)[number];
export type FeldKey = "a" | "b" | "c" | "d";
export type Feld = { key: FeldKey; label: string };

export type Plattform = {
  key: PlattformKey;
  label: string;
  /** Die Interaktionen der Plattform, abgebildet auf a bis d. LinkedIn und Facebook haben nur drei. */
  felder: readonly Feld[];
  /** Beschriftung der Zahl, durch die die zweite Formel teilt. */
  reichweiteLabel: string;
  /** Ein Satz: wo die Person die Zahlen findet. Nur Menübezeichnungen, die gesichert sind. */
  fundort: string;
  /** Wo die Zahl nicht Personen zählt, sondern Anzeigen oder Wiedergaben. */
  reichweiteHinweis?: string;
};

export const PLATTFORMEN: readonly Plattform[] = [
  {
    key: "instagram",
    label: "Instagram",
    felder: [
      { key: "a", label: "Likes" },
      { key: "b", label: "Kommentare" },
      { key: "c", label: "Teilen" },
      { key: "d", label: "Gespeichert" },
    ],
    reichweiteLabel: "Reichweite",
    fundort: "Auf Instagram stehen die Zahlen in den «Insights» des Beitrags.",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    felder: [
      { key: "a", label: "Reaktionen" },
      { key: "b", label: "Kommentare" },
      { key: "c", label: "Reposts" },
    ],
    reichweiteLabel: "Impressionen",
    fundort: "Auf LinkedIn stehen die Zahlen in den «Beitragsanalysen» des Beitrags.",
    reichweiteHinweis:
      "«Impressionen» zählen, wie oft LinkedIn den Beitrag angezeigt hat, nicht, wie viele Personen ihn gesehen haben. Die Rechnung ist dieselbe.",
  },
  {
    key: "facebook",
    label: "Facebook",
    felder: [
      { key: "a", label: "Reaktionen" },
      { key: "b", label: "Kommentare" },
      { key: "c", label: "Teilen" },
    ],
    reichweiteLabel: "Reichweite",
    fundort: "Auf Facebook stehen die Zahlen in den «Insights» deiner Seite, beim einzelnen Beitrag.",
  },
  {
    key: "tiktok",
    label: "TikTok",
    felder: [
      { key: "a", label: "Likes" },
      { key: "b", label: "Kommentare" },
      { key: "c", label: "Teilen" },
      { key: "d", label: "Gespeichert" },
    ],
    reichweiteLabel: "Aufrufe",
    fundort: "Auf TikTok stehen die Zahlen in den «Analysen» deines Kontos, getrennt für jedes Video.",
    reichweiteHinweis: "«Aufrufe» zählen, wie oft das Video angesehen wurde, nicht, wie viele Personen es gesehen haben. Die Rechnung ist dieselbe.",
  },
];

export const FELD_KEYS: readonly FeldKey[] = ["a", "b", "c", "d"];

export function isPlattformKey(v: unknown): v is PlattformKey {
  return typeof v === "string" && (PLATTFORM_KEYS as readonly string[]).includes(v);
}

/** Die Plattform zu einem Schlüssel; unbekannte Schlüssel ergeben Instagram. */
export function plattformOf(key: string): Plattform {
  return PLATTFORMEN.find((p) => p.key === key) ?? PLATTFORMEN[0];
}

// ---- Vergleichswerte (data/engagement-benchmarks.json) ----------------------------------------------

export const BENCHMARK_FORMELN = ["likes_kommentare", "alle"] as const;
export type BenchmarkFormel = (typeof BENCHMARK_FORMELN)[number];

const benchmarkSchema = z.object({
  meta: z.object({
    name: z.string().min(2),
    source: z.string().min(10),
    url: z.string().url(),
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().optional(),
  }),
  werte: z.array(
    z.object({
      plattform: z.enum(PLATTFORM_KEYS),
      formel: z.enum(BENCHMARK_FORMELN),
      formelText: z.string().min(5),
      wert: z.number().positive().max(100),
      jahr: z.number().int().min(2020).max(2100),
    }),
  ),
});
export type BenchmarkWert = z.infer<typeof benchmarkSchema>["werte"][number];
export type BenchmarkMeta = z.infer<typeof benchmarkSchema>["meta"];

/**
 * Liest die Vergleichswerte. Ohne gültige Quelle (meta) oder bei kaputten Daten gibt es keine Werte; dann entfällt der Vergleichssatz.
 * Zwei Werte für dieselbe Plattform: der erste gilt.
 */
export function loadBenchmarks(raw: unknown): { meta: BenchmarkMeta | null; werte: BenchmarkWert[] } {
  const r = benchmarkSchema.safeParse(raw);
  if (!r.success) return { meta: null, werte: [] };
  const seen = new Set<string>();
  const werte = r.data.werte.filter((w) => (seen.has(w.plattform) ? false : (seen.add(w.plattform), true)));
  return { meta: r.data.meta, werte };
}

export const BENCHMARKS = loadBenchmarks(benchmarkData);

/** Der Vergleichswert zu einer Plattform, oder null, wenn keine Quelle mit passender Formel vorliegt. */
export function benchmarkFor(plattform: PlattformKey, bm = BENCHMARKS): BenchmarkWert | null {
  return bm.meta ? (bm.werte.find((w) => w.plattform === plattform) ?? null) : null;
}

// ---- Grenzen und Texte -----------------------------------------------------------------------------

export const LIMITS = {
  follower: { min: 1, max: 100_000_000 },
  /** Obergrenze für jede Zahl eines Beitrags. */
  zahl: { max: 1_000_000_000 },
  name: 60,
  beitraege: { min: 1, max: 10, start: 3 },
  /** Zahl der Beiträge, über die im Kurzmodus summiert wird. */
  beitraegeKurz: { min: 1, max: 1_000 },
} as const;
export const MAX_POSTS = LIMITS.beitraege.max;

export const RICHTWERT_NOTE = "Richtwert von Alperna, keine Statistik";
/** Faustregeln von Alperna, keine Statistik (im UI und im Dokument so benannt). */
export const RICHTWERT = { hinweisUnter: 3, empfohlen: 5 } as const;

export const NOTE_BRANCHE = "Keine Einordnung gegen Branchenwerte, weil uns eine belastbare Quelle fehlt.";
/** Statt NOTE_BRANCHE, wo ein Vergleichswert mit passender Formel vorliegt. */
export const NOTE_VERGLEICHSWERT =
  "Der Vergleichswert ist ein Durchschnitt internationaler Marken jeder Grösse und Branche, nicht der Schweiz. Er sagt nicht, was für dein Konto gut ist.";
export const NOTE_VERGLEICH = "Verglichen werden nur deine Beiträge untereinander.";

export const NUTZUNG: readonly string[] = [
  "Vergleiche gleiche Zeiträume: Miss alle Beiträge nach derselben Zeit seit der Veröffentlichung, sonst ist der ältere im Vorteil.",
  "Zähle nur eigene Beiträge ohne bezahlte Reichweite: Beworbene Beiträge verfälschen die Rate, also rechne sie getrennt.",
  `Werte mindestens fünf Beiträge aus (${RICHTWERT_NOTE}), bevor du aus dem Schnitt etwas ableitest.`,
];

const fmtLimit = (n: number) => numberCH(n, 0);

// ---- Eingaben --------------------------------------------------------------------------------------

/** Eine Zeile des Formulars: alles Text, so wie die Person es tippt. */
export type PostForm = { name: string; a: string; b: string; c: string; d: string; reichweite: string };
/** Eingabe: «kurz» = Summen über alle Beiträge und deren Zahl (wenige Zahlen), «einzeln» = Zahlen je Beitrag (Diagramm, bester Beitrag). */
export const MODI = ["kurz", "einzeln"] as const;
export type Modus = (typeof MODI)[number];
export const isModus = (v: unknown): v is Modus => v === "kurz" || v === "einzeln";
export const MODUS_LABELS: Record<Modus, string> = { kurz: "Summen über mehrere Beiträge", einzeln: "Beiträge einzeln" };

/** Kurzmodus, alles Text: Zahl der Beiträge und die Summen der Felder über diese Beiträge. */
export type KurzForm = { beitraege: string; a: string; b: string; c: string; d: string; reichweite: string };
/** Ohne `modus` gilt «einzeln» (so wurden ältere Stände gespeichert). */
export type FormState = { plattform: PlattformKey; follower: string; posts: PostForm[]; modus?: Modus; kurz?: KurzForm };

export const emptyPost = (): PostForm => ({ name: "", a: "", b: "", c: "", d: "", reichweite: "" });
export const emptyKurz = (): KurzForm => ({ beitraege: "", a: "", b: "", c: "", d: "", reichweite: "" });
export const startPosts = (): PostForm[] => Array.from({ length: LIMITS.beitraege.start }, emptyPost);
/** Neues Formular: Standard ist der Kurzmodus (wenige Zahlen statt bis zu 50). */
export const newForm = (): FormState => ({ plattform: "instagram", follower: "", posts: startPosts(), modus: "kurz", kurz: emptyKurz() });
export const modusOf = (form: Pick<FormState, "modus">): Modus => form.modus ?? "einzeln";
export const kurzOf = (form: Pick<FormState, "kurz">): KurzForm => form.kurz ?? emptyKurz();

/**
 * Zahl aus einem Textfeld. Leer ergibt null, etwas anderes als eine ganze Zahl ab 0 ergibt NaN.
 * Leerzeichen und Apostrophe (1'240) stören nicht.
 */
export function parseCount(raw: string): number | null {
  const s = raw.replace(/[\s'’]/g, "");
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : NaN;
}

/** Zeile ohne Zahlen: zählt nicht mit. Gezählt werden nur die Felder, die die Plattform anbietet. */
export function isBlankPost(p: PostForm, plattform: PlattformKey): boolean {
  const keys = [...plattformOf(plattform).felder.map((f) => f.key), "reichweite" as const];
  return keys.every((k) => p[k].trim() === "");
}

export function addPost(posts: PostForm[]): PostForm[] {
  return posts.length >= MAX_POSTS ? posts : [...posts, emptyPost()];
}

export function removePost(posts: PostForm[], index: number): PostForm[] {
  if (posts.length <= LIMITS.beitraege.min || index < 0 || index >= posts.length) return posts;
  return posts.filter((_, i) => i !== index);
}

export function setPost(posts: PostForm[], index: number, patch: Partial<PostForm>): PostForm[] {
  return posts.map((p, i) => (i === index ? { ...p, ...patch } : p));
}

/** Ob im Kurzmodus keine Summe der Interaktionsfelder (und keine Reichweite) steht. */
export function isBlankKurz(k: KurzForm, plattform: PlattformKey): boolean {
  const keys = [...plattformOf(plattform).felder.map((f) => f.key), "reichweite" as const];
  return keys.every((key) => k[key].trim() === "");
}

function validateKurz(form: FormState): string[] {
  const out: string[] = [];
  const k = kurzOf(form);
  const n = parseCount(k.beitraege);
  const { min, max } = LIMITS.beitraegeKurz;
  if (n === null) out.push("Trage ein, über wie viele Beiträge du die Summen bildest.");
  else if (Number.isNaN(n) || n < min || n > max) out.push(`Beiträge: Trage eine ganze Zahl von ${fmtLimit(min)} bis ${fmtLimit(max)} ein.`);
  const p = plattformOf(form.plattform);
  const labels: [KeyOfKurz, string][] = [...p.felder.map((x): [KeyOfKurz, string] => [x.key, x.label]), ["reichweite", p.reichweiteLabel]];
  for (const [key, label] of labels) {
    const v = parseCount(k[key]);
    if (v !== null && (Number.isNaN(v) || v > LIMITS.zahl.max)) out.push(`${label}: Trage eine ganze Zahl von 0 bis ${fmtLimit(LIMITS.zahl.max)} ein.`);
  }
  if (isBlankKurz(k, form.plattform)) out.push(`Trage mindestens eine Summe ein, zum Beispiel die ${p.felder[0].label}.`);
  return out;
}
type KeyOfKurz = keyof KurzForm;

/**
 * Prüft das Formular. Jede Meldung ist ein Fehler, der das Ergebnis verhindert; Auffälligkeiten, die das Ergebnis nicht
 * verhindern, stehen als Hinweise in `summary().hinweise`.
 */
export function validate(form: FormState): string[] {
  const out: string[] = [];
  const f = parseCount(form.follower);
  if (f === null) out.push("Trage ein, wie viele Follower du am Tag der Auswertung hast.");
  else if (Number.isNaN(f) || f < LIMITS.follower.min || f > LIMITS.follower.max) {
    out.push(`Follower: Trage eine ganze Zahl von ${fmtLimit(LIMITS.follower.min)} bis ${fmtLimit(LIMITS.follower.max)} ein.`);
  }

  if (modusOf(form) === "kurz") return [...out, ...validateKurz(form)];

  if (form.posts.length > MAX_POSTS) out.push(`Du kannst höchstens ${MAX_POSTS} Beiträge auswerten.`);

  const p = plattformOf(form.plattform);
  const labels: [string, string][] = [...p.felder.map((x): [string, string] => [x.key, x.label]), ["reichweite", p.reichweiteLabel]];
  let active = 0;
  form.posts.forEach((post, i) => {
    const nr = i + 1;
    if (post.name.trim().length > LIMITS.name) out.push(`Beitrag ${nr}: Die Bezeichnung darf höchstens ${LIMITS.name} Zeichen lang sein.`);
    if (isBlankPost(post, form.plattform)) return;
    active++;
    for (const [key, label] of labels) {
      const n = parseCount(post[key as keyof PostForm]);
      if (n !== null && (Number.isNaN(n) || n > LIMITS.zahl.max)) {
        out.push(`Beitrag ${nr}, ${label}: Trage eine ganze Zahl von 0 bis ${fmtLimit(LIMITS.zahl.max)} ein.`);
      }
    }
  });
  if (active === 0) out.push("Trage für mindestens einen Beitrag Zahlen ein.");
  return out;
}

/** Ein Beitrag mit Zahlen. Felder, die die Plattform nicht anbietet, stehen auf 0. */
export type PostInput = {
  /** Nummer der Zeile im Formular (Beitrag 3 bleibt Beitrag 3, auch wenn Zeile 2 leer ist). */
  nr: number;
  name: string;
  a: number;
  b: number;
  c: number;
  d: number;
  /** null: nicht angegeben. */
  reichweite: number | null;
};
/** Summen des Kurzmodus (ganze Zahlen); `reichweite` null, wenn nicht angegeben. */
export type Summen = { a: number; b: number; c: number; d: number; reichweite: number | null };
/**
 * `modus` fehlt bei «einzeln». Im Kurzmodus steht in `posts` ein einziger Durchschnittsbeitrag (Summen geteilt durch die Zahl der
 * Beiträge, daher mit Nachkommastellen), `anzahl` ist die Zahl der Beiträge und `summen` sind die eingegebenen Summen.
 */
export type Input = { plattform: PlattformKey; follower: number; posts: PostInput[]; modus?: "kurz"; anzahl?: number; summen?: Summen };

/** Das Formular als Zahlen, oder null, wenn `validate` etwas meldet. */
export function toInput(form: FormState): Input | null {
  if (validate(form).length > 0) return null;
  const follower = parseCount(form.follower);
  if (follower === null || Number.isNaN(follower)) return null;
  if (modusOf(form) === "kurz") {
    const k = kurzOf(form);
    const n = parseCount(k.beitraege);
    if (n === null || Number.isNaN(n)) return null;
    const offeredKurz = new Set<string>(plattformOf(form.plattform).felder.map((f) => f.key));
    const sumOf = (key: FeldKey) => (offeredKurz.has(key) ? (parseCount(k[key]) ?? 0) : 0);
    const summen: Summen = { a: sumOf("a"), b: sumOf("b"), c: sumOf("c"), d: sumOf("d"), reichweite: parseCount(k.reichweite) };
    const avg: PostInput = {
      nr: 1,
      name: `Durchschnitt von ${n} ${n === 1 ? "Beitrag" : "Beiträgen"}`,
      a: summen.a / n,
      b: summen.b / n,
      c: summen.c / n,
      d: summen.d / n,
      reichweite: summen.reichweite === null ? null : summen.reichweite / n,
    };
    return { plattform: form.plattform, follower, posts: [avg], modus: "kurz", anzahl: n, summen };
  }
  const offered = new Set<string>(plattformOf(form.plattform).felder.map((f) => f.key));
  const posts: PostInput[] = [];
  form.posts.forEach((p, i) => {
    if (isBlankPost(p, form.plattform)) return;
    const num = (k: FeldKey) => (offered.has(k) ? (parseCount(p[k]) ?? 0) : 0);
    posts.push({ nr: i + 1, name: p.name.trim(), a: num("a"), b: num("b"), c: num("c"), d: num("d"), reichweite: parseCount(p.reichweite) });
  });
  return { plattform: form.plattform, follower, posts };
}

// ---- Rechnung --------------------------------------------------------------------------------------

/** Interaktionen eines Beitrags: die vier Felder zusammen. */
export function interactions(post: Pick<PostInput, "a" | "b" | "c" | "d">): number {
  return post.a + post.b + post.c + post.d;
}

/** Interaktionen geteilt durch Follower, mal 100. null, wenn es keine Follower gibt. */
export function rateFollower(interaktionen: number, follower: number): number | null {
  return follower > 0 && Number.isFinite(interaktionen) ? (interaktionen / follower) * 100 : null;
}

/** Interaktionen geteilt durch Reichweite, mal 100. null, wenn die Reichweite fehlt oder 0 ist. */
export function rateReichweite(interaktionen: number, reichweite: number | null): number | null {
  return reichweite !== null && reichweite > 0 && Number.isFinite(interaktionen) ? (interaktionen / reichweite) * 100 : null;
}

export type PostResult = {
  nr: number;
  name: string;
  werte: Record<FeldKey, number>;
  interaktionen: number;
  reichweite: number | null;
  rateFollower: number;
  rateReichweite: number | null;
};

export type Abstand = {
  post: PostResult;
  /** Rate auf Follower minus Schnitt, in Prozentpunkten. */
  punkte: number;
  /** Abstand in Prozent des Schnitts; null, wenn der Schnitt 0 ist. */
  prozent: number | null;
};

/** «Du hast X, der Durchschnitt internationaler Marken lag bei Y»: nur, wenn die Formel der Quelle zur Rechnung passt. */
export type Vergleich = {
  formel: BenchmarkFormel;
  /** Was gezählt wurde, zum Beispiel «Likes und Kommentare, geteilt durch Follower». */
  formelText: string;
  /** Mittel der Raten der Person nach dieser Formel, in Prozent. */
  du: number;
  /** Wert der Quelle, in Prozent. */
  ueblich: number;
  jahr: number;
  /** Kurzname der Quelle und Adresse (aus meta in data/engagement-benchmarks.json). */
  quelle: string;
  url: string;
};

export type Summary = {
  plattform: PlattformKey;
  follower: number;
  /** Im Kurzmodus ein einziger Durchschnittsbeitrag. */
  modus: Modus;
  /** Zahl der ausgewerteten Beiträge (im Kurzmodus die eingegebene Zahl). */
  anzahl: number;
  /** Summen des Kurzmodus. */
  summen?: Summen;
  /** Vergleichswert der Quelle; null bei Plattformen ohne passende Formel. */
  vergleich: Vergleich | null;
  posts: PostResult[];
  /** Mittel der Interaktionen je Beitrag. */
  schnittInteraktionen: number;
  /** Mittel der Raten auf Follower; jeder Beitrag zählt gleich. */
  schnittFollower: number;
  /** Mittel der Raten auf Reichweite, über die Beiträge mit Reichweite; null, wenn keiner eine hat. */
  schnittReichweite: number | null;
  /** Summe der Interaktionen durch Summe der Reichweiten, über die Beiträge mit Reichweite. */
  summenRate: number | null;
  /** Anzahl der Beiträge mit Reichweite grösser als 0. */
  mitReichweite: number;
  best: Abstand | null;
  worst: Abstand | null;
  hinweise: string[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);

function abstand(post: PostResult, schnitt: number): Abstand {
  const punkte = post.rateFollower - schnitt;
  return { post, punkte, prozent: schnitt > 0 ? (punkte / schnitt) * 100 : null };
}

const beitraege = (nrs: number[]) =>
  `Beitrag ${nrs.length <= 1 ? String(nrs[0]) : `${nrs.slice(0, -1).join(", ")} und ${nrs[nrs.length - 1]}`}`;

/** Hinweise im Kurzmodus: ohne Nummern einzelner Beiträge, weil es nur den Durchschnittsbeitrag gibt. */
function hinweiseKurz(plattform: Plattform, follower: number, avg: PostResult | undefined, anzahl: number): string[] {
  const out: string[] = [];
  if (!avg) return out;
  if (follower <= 0) out.push("Ohne Follower lässt sich keine Rate auf Follower rechnen.");
  if (avg.interaktionen === 0) out.push("Die Summen ergeben 0 Interaktionen. Prüfe, ob du die Zahlen aus der richtigen Spalte der Statistik übernommen hast.");
  if (anzahl < RICHTWERT.hinweisUnter) out.push(`Mit weniger als drei Beiträgen sagt der Schnitt wenig (${RICHTWERT_NOTE}).`);
  if (avg.rateReichweite !== null && avg.rateReichweite > 100) out.push(`Die Interaktionen sind grösser als die ${plattform.reichweiteLabel}. Prüfe die ${plattform.reichweiteLabel}.`);
  if (avg.reichweite === 0 && avg.interaktionen > 0) out.push(`Die ${plattform.reichweiteLabel} ist 0, obwohl es Interaktionen gibt. Prüfe die ${plattform.reichweiteLabel}.`);
  if (follower > 0 && avg.interaktionen > follower) {
    out.push("Im Schnitt gibt es mehr Interaktionen je Beitrag als Follower. Das ist möglich, wenn Beiträge weit über deine Follower hinaus verteilt wurden. Prüfe die Zahlen trotzdem.");
  }
  if (avg.reichweite === null) out.push(`Ohne ${plattform.reichweiteLabel} rechnet nur die Formel auf Follower.`);
  return out;
}

/** Auffälligkeiten, die das Ergebnis nicht verhindern (Hinweis statt Fehler). */
function hinweiseFor(plattform: Plattform, follower: number, posts: PostResult[], kurz?: { anzahl: number }): string[] {
  if (kurz) return hinweiseKurz(plattform, follower, posts[0], kurz.anzahl);
  const out: string[] = [];
  if (follower <= 0) out.push("Ohne Follower lässt sich keine Rate auf Follower rechnen.");
  if (posts.length > 0 && posts.every((p) => p.interaktionen === 0)) {
    out.push("Alle Beiträge haben 0 Interaktionen. Prüfe, ob du die Zahlen aus der richtigen Spalte der Statistik übernommen hast.");
  }
  if (posts.length < RICHTWERT.hinweisUnter) {
    out.push(`Mit weniger als drei Beiträgen sagt der Schnitt wenig (${RICHTWERT_NOTE}).`);
  }
  const ueber = posts.filter((p) => p.rateReichweite !== null && p.rateReichweite > 100).map((p) => p.nr);
  if (ueber.length > 0) out.push(`Bei ${beitraege(ueber)} sind die Interaktionen grösser als die ${plattform.reichweiteLabel}. Prüfe die ${plattform.reichweiteLabel}.`);
  const nullReichweite = posts.filter((p) => p.reichweite === 0 && p.interaktionen > 0).map((p) => p.nr);
  if (nullReichweite.length > 0) {
    out.push(`Bei ${beitraege(nullReichweite)} ist die ${plattform.reichweiteLabel} 0, obwohl es Interaktionen gibt. Prüfe die ${plattform.reichweiteLabel}.`);
  }
  const mehrAlsFollower = posts.filter((p) => follower > 0 && p.interaktionen > follower).map((p) => p.nr);
  if (mehrAlsFollower.length > 0) {
    out.push(
      `Bei ${beitraege(mehrAlsFollower)} gibt es mehr Interaktionen als Follower. Das ist möglich, wenn ein Beitrag weit über deine Follower hinaus verteilt wurde. Prüfe die Zahlen trotzdem.`,
    );
  }
  const ohne = posts.filter((p) => p.rateReichweite === null && !nullReichweite.includes(p.nr));
  if (posts.length > 0 && ohne.length === posts.length) {
    out.push(`Ohne ${plattform.reichweiteLabel} rechnet nur die Formel auf Follower.`);
  } else if (ohne.length > 0) {
    out.push(`Bei ${beitraege(ohne.map((p) => p.nr))} fehlt die ${plattform.reichweiteLabel}, darum gibt es dort keine Rate auf ${plattform.reichweiteLabel}.`);
  }
  return out;
}

/** Die Auswertung. Rechnet auch mit leeren oder ungeprüften Eingaben ohne NaN (die Hinweise nennen dann den Grund). */
export function summary(input: Input): Summary {
  const plattform = plattformOf(input.plattform);
  const posts: PostResult[] = input.posts.map((p) => {
    const interaktionen = interactions(p);
    return {
      nr: p.nr,
      name: p.name,
      werte: { a: p.a, b: p.b, c: p.c, d: p.d },
      interaktionen,
      reichweite: p.reichweite,
      rateFollower: rateFollower(interaktionen, input.follower) ?? 0,
      rateReichweite: rateReichweite(interaktionen, p.reichweite),
    };
  });

  const mitReichweite = posts.filter((p) => p.rateReichweite !== null);
  const reichSumme = sum(mitReichweite.map((p) => p.reichweite ?? 0));
  const schnittFollower = mean(posts.map((p) => p.rateFollower));

  let bestI = 0;
  let worstI = 0;
  posts.forEach((p, i) => {
    if (p.interaktionen > posts[bestI].interaktionen) bestI = i;
    if (p.interaktionen < posts[worstI].interaktionen) worstI = i;
  });

  const kurz = input.modus === "kurz";
  return {
    plattform: input.plattform,
    follower: input.follower,
    modus: kurz ? "kurz" : "einzeln",
    anzahl: kurz ? (input.anzahl ?? posts.length) : posts.length,
    ...(input.summen ? { summen: input.summen } : {}),
    vergleich: vergleichFor(input.plattform, input.follower, posts, schnittFollower),
    posts,
    schnittInteraktionen: mean(posts.map((p) => p.interaktionen)),
    schnittFollower,
    schnittReichweite: mitReichweite.length > 0 ? mean(mitReichweite.map((p) => p.rateReichweite ?? 0)) : null,
    summenRate: reichSumme > 0 ? (sum(mitReichweite.map((p) => p.interaktionen)) / reichSumme) * 100 : null,
    mitReichweite: mitReichweite.length,
    best: !kurz && posts.length > 0 ? abstand(posts[bestI], schnittFollower) : null,
    worst: !kurz && posts.length > 0 ? abstand(posts[worstI], schnittFollower) : null,
    hinweise: hinweiseFor(plattform, input.follower, posts, kurz ? { anzahl: input.anzahl ?? posts.length } : undefined),
  };
}

/**
 * Vergleichswert zur Plattform. «likes_kommentare» rechnet nur Feld a und b (so rechnet die Quelle bei Instagram), «alle» alle Felder
 * der Plattform. Ohne Follower, ohne Beitrag oder ohne Quelle mit passender Formel: null.
 */
export function vergleichFor(plattform: PlattformKey, follower: number, posts: PostResult[], schnittFollower: number, bm = BENCHMARKS): Vergleich | null {
  const b = benchmarkFor(plattform, bm);
  if (!b || !bm.meta || follower <= 0 || posts.length === 0) return null;
  const du =
    b.formel === "likes_kommentare" ? mean(posts.map((x) => rateFollower(x.werte.a + x.werte.b, follower) ?? 0)) : schnittFollower;
  if (!Number.isFinite(du)) return null;
  return { formel: b.formel, formelText: b.formelText, du, ueblich: b.wert, jahr: b.jahr, quelle: bm.meta.name, url: bm.meta.url };
}

// ---- Dokument --------------------------------------------------------------------------------------

export type Kopf = { firma?: string; verein?: boolean };

const rate = (n: number | null) => (n === null ? "–" : pctCH(n, 2));

/** «Beitrag 2: Fassade Gossau» oder «Beitrag 2». */
export function postLabel(p: Pick<PostResult, "nr" | "name">): string {
  return p.name ? `Beitrag ${p.nr}: ${p.name}` : `Beitrag ${p.nr}`;
}

function abstandText(a: Abstand): string {
  if (Math.abs(a.punkte) < 1e-9) return "Das entspricht deinem Schnitt.";
  const ueber = a.punkte > 0;
  const punkte = `${numberCH(Math.abs(a.punkte), 2)} Prozentpunkte ${ueber ? "über" : "unter"} deinem Schnitt`;
  return a.prozent === null ? `Er liegt ${punkte}.` : `Er liegt ${punkte}, das sind ${pctCH(Math.abs(a.prozent), 0)} ${ueber ? "mehr" : "weniger"}.`;
}

function vergleichBlocks(s: Summary): DocBlock[] {
  const { best, worst } = s;
  if (!best || !worst) return [];
  const out: DocBlock[] = [{ type: "heading", level: 1, text: "Vergleich deiner Beiträge" }];
  if (s.posts.length === 1) {
    out.push({ type: "paragraph", text: "Mit einem Beitrag gibt es nichts zu vergleichen. Werte weitere Beiträge aus, dann siehst du, welcher aus dem Rahmen fällt." });
  } else if (best.post.nr === worst.post.nr) {
    out.push({ type: "paragraph", text: `Alle Beiträge liegen gleich auf (${pctCH(best.post.rateFollower, 2)} auf Follower). Es gibt keinen besten und keinen schwächsten.` });
  } else {
    out.push(
      {
        type: "paragraph",
        text: `Bester Beitrag: ${postLabel(best.post)} mit ${pctCH(best.post.rateFollower, 2)} auf Follower (${numberCH(best.post.interaktionen, 0)} Interaktionen). ${abstandText(best)}`,
      },
      {
        type: "paragraph",
        text: `Schwächster Beitrag: ${postLabel(worst.post)} mit ${pctCH(worst.post.rateFollower, 2)} auf Follower (${numberCH(worst.post.interaktionen, 0)} Interaktionen). ${abstandText(worst)}`,
      },
    );
  }
  out.push({ type: "paragraph", text: NOTE_VERGLEICH });
  return out;
}

/** «Zum Vergleich»: Satz und zwei Balken, nur wenn es einen Vergleichswert mit passender Formel gibt. */
function benchmarkBlocks(s: Summary): DocBlock[] {
  const v = s.vergleich;
  if (!v) return [];
  const du = Math.round(v.du * 100) / 100;
  const ueblich = Math.round(v.ueblich * 100) / 100;
  return [
    { type: "heading", level: 1, text: "Zum Vergleich" },
    {
      type: "paragraph",
      text: `Du hast ${pctCH(v.du, 2)} (${v.formelText}, je Beitrag im Schnitt). Der Durchschnitt internationaler Marken lag ${v.jahr} bei ${pctCH(v.ueblich, 2)} (${v.quelle}, nicht Schweiz).`,
    },
    {
      type: "bars",
      title: `Rate auf Follower in %, nach der Formel von ${v.quelle}`,
      unit: " %",
      items: [
        { label: "Deine Beiträge", value: du, highlight: true },
        { label: `Durchschnitt internationaler Marken, ${v.jahr}`, value: ueblich },
      ],
    },
    { type: "paragraph", text: `${NOTE_VERGLEICHSWERT} Quelle: ${v.quelle}, ${v.url}` },
  ];
}

function formelnKurz(p: Plattform): string[] {
  const felder = p.felder.map((f) => f.label);
  const reichweite = p.reichweiteLabel;
  return [
    `Als Interaktion zählen auf ${p.label}: ${felder.slice(0, -1).join(", ")} und ${felder[felder.length - 1]}, zusammengezählt.`,
    "Rate auf Follower = Interaktionen je Beitrag (die Summe geteilt durch die Zahl der Beiträge) geteilt durch Follower, mal 100.",
    `Rate auf ${reichweite} = alle Interaktionen geteilt durch alle ${reichweite}, mal 100. Sie zeigt, wie stark die Beiträge bei denen ankamen, die sie gesehen haben.`,
    "Mit Summen gibt es keinen besten und keinen schwächsten Beitrag. Wähle «Beiträge einzeln», wenn du die Beiträge vergleichen willst.",
  ];
}

/** Ergebnis im Kurzmodus: Kennzahlen, Tabelle der Summen, Vergleich, Hinweise. */
function toDocumentKurz(s: Summary, kopf: Kopf): DocumentModel {
  const p = plattformOf(s.plattform);
  const firma = kopf.firma?.trim() || undefined;
  const reichweite = p.reichweiteLabel;
  const sm: Summen = s.summen ?? { a: 0, b: 0, c: 0, d: 0, reichweite: null };
  const n = Math.max(1, s.anzahl);
  const avg = s.posts[0];
  const total = p.felder.reduce((a, f) => a + sm[f.key], 0);
  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: kopf.verein ? "Verein" : "Firma", value: firma ?? "nicht angegeben" },
        { label: "Plattform", value: p.label },
        { label: "Follower", value: numberCH(s.follower, 0) },
        { label: "Beiträge", value: `${numberCH(n, 0)} zusammen ausgewertet` },
      ],
    },
    { type: "heading", level: 1, text: "Ergebnis" },
    {
      type: "facts",
      items: [
        { label: "Interaktionen je Beitrag", value: numberCH(avg?.interaktionen ?? 0, 1) },
        { label: "Rate auf Follower", value: pctCH(s.schnittFollower, 2) },
        { label: `Rate auf ${reichweite}`, value: s.summenRate === null ? `keine ${reichweite} angegeben` : pctCH(s.summenRate, 2) },
      ],
    },
    {
      type: "table",
      header: ["Zahl", `Summe über ${numberCH(n, 0)} ${n === 1 ? "Beitrag" : "Beiträge"}`, "je Beitrag"],
      widths: [3, 2, 2],
      rows: [
        ...p.felder.map((f) => [f.label, numberCH(sm[f.key], 0), numberCH(sm[f.key] / n, 1)]),
        ["Interaktionen insgesamt", numberCH(total, 0), numberCH(total / n, 1)],
        [reichweite, sm.reichweite === null ? "–" : numberCH(sm.reichweite, 0), sm.reichweite === null ? "–" : numberCH(sm.reichweite / n, 1)],
      ],
    },
    ...benchmarkBlocks(s),
  ];
  if (s.hinweise.length > 0) blocks.push({ type: "heading", level: 1, text: "Hinweise zu deinen Zahlen" }, { type: "list", items: s.hinweise });
  const formeln = formelnKurz(p);
  if (p.reichweiteHinweis) formeln.push(p.reichweiteHinweis);
  blocks.push(
    { type: "heading", level: 1, text: "So rechnet das Werkzeug" },
    { type: "list", items: formeln },
    { type: "heading", level: 1, text: "Hinweise zur Auswertung" },
    { type: "list", items: [s.vergleich ? NOTE_VERGLEICHSWERT : NOTE_BRANCHE, ...NUTZUNG] },
  );
  return {
    title: "Engagement-Rate",
    subtitle: `${p.label}, ${numberCH(s.follower, 0)} Follower`,
    firma: firma ?? (kopf.verein ? "Verein" : undefined),
    blocks,
    filename: `engagement-rate-${safeFilename(firma ?? "", p.key)}`,
  };
}

/**
 * Ergebnis als Dokument für Bildschirm, PDF, Word und Markdown. Die Kennzahlen und die Tabelle stehen oben, weil der Server das
 * Ergebnis für das CRM auf 1'900 Zeichen kürzt. Im Bildschirm sitzt das Diagramm zwischen den Kennzahlen und der Tabelle.
 */
export function toDocument(s: Summary, kopf: Kopf = {}): DocumentModel {
  if (s.modus === "kurz") return toDocumentKurz(s, kopf);
  const p = plattformOf(s.plattform);
  const firma = kopf.firma?.trim() || undefined;
  const reichweite = p.reichweiteLabel;

  const blocks: DocBlock[] = [
    {
      type: "facts",
      items: [
        { label: kopf.verein ? "Verein" : "Firma", value: firma ?? "nicht angegeben" },
        { label: "Plattform", value: p.label },
        { label: "Follower", value: numberCH(s.follower, 0) },
        { label: "Beiträge", value: `${s.posts.length} ausgewertet` },
      ],
    },
    { type: "heading", level: 1, text: "Ergebnis" },
    {
      type: "facts",
      items: [
        { label: "Interaktionen je Beitrag", value: numberCH(s.schnittInteraktionen, 1) },
        { label: "Schnitt auf Follower", value: pctCH(s.schnittFollower, 2) },
        { label: `Schnitt auf ${reichweite}`, value: s.schnittReichweite === null ? `keine ${reichweite} angegeben` : pctCH(s.schnittReichweite, 2) },
        { label: "Summe durch Summe", value: s.summenRate === null ? `keine ${reichweite} angegeben` : pctCH(s.summenRate, 2) },
      ],
    },
    {
      type: "table",
      header: ["Beitrag", "Interaktionen", "Rate auf Follower", `Rate auf ${reichweite}`],
      widths: [3, 1.4, 1.5, 1.5],
      rows: [
        ...s.posts.map((x) => [postLabel(x), numberCH(x.interaktionen, 0), rate(x.rateFollower), rate(x.rateReichweite)]),
        ["Schnitt", numberCH(s.schnittInteraktionen, 1), pctCH(s.schnittFollower, 2), rate(s.schnittReichweite)],
      ],
    },
  ];

  if (s.summenRate !== null) {
    const mit = s.posts.filter((x) => x.rateReichweite !== null);
    const interaktionen = mit.reduce((a, x) => a + x.interaktionen, 0);
    const reich = mit.reduce((a, x) => a + (x.reichweite ?? 0), 0);
    blocks.push({
      type: "paragraph",
      text: `Summe durch Summe: ${numberCH(interaktionen, 0)} Interaktionen bei ${numberCH(reich, 0)} ${reichweite} ergeben ${pctCH(s.summenRate, 2)}. Der Schnitt der Raten (${rate(s.schnittReichweite)}) kann davon abweichen; die Erklärung steht unten.`,
    });
  }

  blocks.push(...benchmarkBlocks(s));

  if (s.hinweise.length > 0) {
    blocks.push({ type: "heading", level: 1, text: "Hinweise zu deinen Zahlen" }, { type: "list", items: s.hinweise });
  }

  blocks.push(...vergleichBlocks(s));

  const felder = p.felder.map((f) => f.label);
  const formeln = [
    `Als Interaktion zählen auf ${p.label}: ${felder.slice(0, -1).join(", ")} und ${felder[felder.length - 1]}, zusammengezählt.`,
    "Rate auf Follower = Interaktionen geteilt durch Follower, mal 100. Sie zeigt, welcher Anteil deiner Follower reagiert hat. Die Followerzahl ist für alle Beiträge gleich, darum lassen sich Beiträge damit vergleichen.",
    `Rate auf ${reichweite} = Interaktionen geteilt durch ${reichweite}, mal 100. Sie zeigt, wie stark ein Beitrag bei denen ankam, die ihn gesehen haben. Bei Beiträgen ohne ${reichweite} entfällt sie.`,
    "Schnitt der Raten: Jeder Beitrag zählt gleich. Summe durch Summe: Alle Interaktionen werden durch alle Reichweiten geteilt, darum zählen Beiträge mit grosser Reichweite mehr. Deshalb können die beiden Zahlen abweichen.",
  ];
  if (p.reichweiteHinweis) formeln.push(p.reichweiteHinweis);
  blocks.push(
    { type: "heading", level: 1, text: "So rechnet das Werkzeug" },
    { type: "list", items: formeln },
    { type: "heading", level: 1, text: "Hinweise zur Auswertung" },
    { type: "list", items: [s.vergleich ? NOTE_VERGLEICHSWERT : NOTE_BRANCHE, ...NUTZUNG] },
  );

  return {
    title: "Engagement-Rate",
    subtitle: `${p.label}, ${numberCH(s.follower, 0)} Follower`,
    firma: firma ?? (kopf.verein ? "Verein" : undefined),
    blocks,
    filename: `engagement-rate-${safeFilename(firma ?? "", p.key)}`,
  };
}

/** Markdown des Dokuments: «Text kopieren» und die Ausgabe fürs CRM. */
export function reportMarkdown(s: Summary, kopf: Kopf = {}): string {
  return toMarkdown(toDocument(s, kopf));
}

/** Die Angaben der Person als lesbarer Text fürs CRM: Plattform, Follower, je Beitrag eine Zeile. */
export function eingabeText(input: Input): string {
  const p = plattformOf(input.plattform);
  const lines = [`Plattform: ${p.label}`, `Follower: ${numberCH(input.follower, 0)}`];
  if (input.modus === "kurz" && input.summen) {
    const n = input.anzahl ?? 1;
    const werte = p.felder.map((f) => `${f.label} ${numberCH(input.summen?.[f.key] ?? 0, 0)}`);
    werte.push(input.summen.reichweite === null ? `${p.reichweiteLabel} nicht angegeben` : `${p.reichweiteLabel} ${numberCH(input.summen.reichweite, 0)}`);
    lines.push(`Summen über ${numberCH(n, 0)} ${n === 1 ? "Beitrag" : "Beiträge"}: ${werte.join(", ")}`);
    return lines.join("\n");
  }
  for (const post of input.posts) {
    const werte = p.felder.map((f) => `${f.label} ${numberCH(post[f.key], 0)}`);
    werte.push(post.reichweite === null ? `${p.reichweiteLabel} nicht angegeben` : `${p.reichweiteLabel} ${numberCH(post.reichweite, 0)}`);
    lines.push(`Beitrag ${post.nr}${post.name ? ` «${post.name}»` : ""}: ${werte.join(", ")}`);
  }
  return lines.join("\n");
}

// ---- CSV -------------------------------------------------------------------------------------------

export const CSV_BOM = "﻿";

/** Textzellen, die ein Tabellenprogramm als Formel lesen würde, bekommen ein Hochkomma vorangestellt. */
const csvCell = (s: string) => {
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** Zahl mit Dezimalpunkt, ohne Tausendertrennzeichen, höchstens zwei Nachkommastellen. */
const csvNum = (n: number | null) => (n === null ? "" : String(Number(n.toFixed(2))));

export function csvHeader(plattform: PlattformKey): string[] {
  const p = plattformOf(plattform);
  return ["Plattform", "Follower", "Beitrag", "Bezeichnung", ...p.felder.map((f) => f.label), p.reichweiteLabel, "Interaktionen", "Rate auf Follower in %", `Rate auf ${p.reichweiteLabel} in %`];
}

/**
 * CSV mit Semikolon, UTF-8 mit BOM, Zeilenende CRLF, Dezimalpunkt. Eine Zeile je Beitrag, danach «Schnitt der Raten» und
 * «Summe durch Summe».
 */
export function toCsv(s: Summary): string {
  const p = plattformOf(s.plattform);
  const head = [p.label, String(s.follower)];
  const blank = Array(p.felder.length + 1).fill("") as string[];
  const rows: string[][] = [csvHeader(s.plattform)];
  if (s.modus === "kurz" && s.summen) {
    const sm = s.summen;
    const n = Math.max(1, s.anzahl);
    const avg = s.posts[0];
    rows.push([...head, "", `Summe über ${n} ${n === 1 ? "Beitrag" : "Beiträge"}`, ...p.felder.map((f) => String(sm[f.key])), sm.reichweite === null ? "" : String(sm.reichweite), String(p.felder.reduce((a, f) => a + sm[f.key], 0)), "", ""]);
    rows.push([
      ...head,
      "",
      "Durchschnitt je Beitrag",
      ...p.felder.map((f) => csvNum(sm[f.key] / n)),
      sm.reichweite === null ? "" : csvNum(sm.reichweite / n),
      csvNum(avg?.interaktionen ?? 0),
      csvNum(s.schnittFollower),
      csvNum(s.summenRate),
    ]);
    return CSV_BOM + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
  }
  for (const x of s.posts) {
    rows.push([
      ...head,
      String(x.nr),
      x.name,
      ...p.felder.map((f) => String(x.werte[f.key])),
      x.reichweite === null ? "" : String(x.reichweite),
      String(x.interaktionen),
      csvNum(x.rateFollower),
      csvNum(x.rateReichweite),
    ]);
  }
  rows.push([...head, "", "Schnitt der Raten", ...blank, csvNum(s.schnittInteraktionen), csvNum(s.schnittFollower), csvNum(s.schnittReichweite)]);
  const mit = s.posts.filter((x) => x.rateReichweite !== null);
  rows.push([
    ...head,
    "",
    "Summe durch Summe",
    ...p.felder.map(() => ""),
    s.summenRate === null ? "" : String(mit.reduce((a, x) => a + (x.reichweite ?? 0), 0)),
    s.summenRate === null ? "" : String(mit.reduce((a, x) => a + x.interaktionen, 0)),
    "",
    csvNum(s.summenRate),
  ]);
  return CSV_BOM + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function csvFilename(plattform: PlattformKey, firma?: string): string {
  return `engagement-rate-${safeFilename(firma ?? "", plattform)}.csv`;
}

// ---- Diagramm --------------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const fix = (n: number) => String(Math.round(n * 100) / 100);

/** Teilstrich-Abstand und Obergrenze der Achse: runde Werte (1, 2, 2,5, 5 mal Zehnerpotenz), etwa vier Teilstriche. */
export function niceScale(max: number): { step: number; top: number } {
  if (!Number.isFinite(max) || max <= 0) return { step: 1, top: 1 };
  const target = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const f = target / pow;
  const mult = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  const step = mult * pow;
  return { step, top: Math.round(Math.ceil(max / step - 1e-9) * step * 1e6) / 1e6 };
}

/** Beschreibung des Diagramms für Screenreader (aria-label). */
export function chartLabel(s: Summary): string {
  const p = plattformOf(s.plattform);
  if (s.posts.length === 0) return "Kein Diagramm: Es gibt keine Beiträge.";
  return `Balkendiagramm der Rate auf Follower je Beitrag auf ${p.label}. Schnitt ${pctCH(s.schnittFollower, 2)}. ${s.posts.map((x) => `Beitrag ${x.nr}: ${pctCH(x.rateFollower, 2)}`).join(", ")}.`;
}

/** Nummer des Beitrags, den das Diagramm in Gold markiert: der beste, aber nur wenn es etwas zu vergleichen gibt. */
export function markedPost(s: Summary): number | null {
  return s.posts.length > 1 && s.best && s.worst && s.best.post.nr !== s.worst.post.nr ? s.best.post.nr : null;
}

/**
 * Balkendiagramm als SVG-Text: ein Balken je Beitrag (Rate auf Follower), gestrichelte Linie für den Schnitt, Gold nur als
 * Markierung des besten Beitrags (mit Rand in Ink, damit der Unterschied nicht an der Farbe hängt). Farben: Ink über
 * `currentColor`, Papier und Gold über die Tokens. Reine Funktion ohne DOM; Texte sind maskiert, Zahlen immer endlich.
 */
export function chartSvg(s: Summary): string {
  const W = 480;
  const H = 292;
  const M = { l: 52, r: 12, t: 40, b: 44 };
  const plotW = W - M.l - M.r;
  const plotH = H - M.t - M.b;
  const n = s.posts.length;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(chartLabel(s))}" font-size="13" style="display:block;width:100%;height:auto">`;
  if (n === 0) return `${open}</svg>`;

  const rates = s.posts.map((x) => (Number.isFinite(x.rateFollower) ? x.rateFollower : 0));
  const avg = Number.isFinite(s.schnittFollower) ? s.schnittFollower : 0;
  const { step, top } = niceScale(Math.max(...rates, avg));
  const y = (v: number) => M.t + plotH * (1 - v / top);
  const marked = markedPost(s);
  // Papier als Umrandung hinter Zahlen und Linien, die über dunklen Balken liegen.
  const halo = "paint-order:stroke;stroke:var(--paper,#fffdf8);stroke-width:4px;stroke-linejoin:round";

  const parts: string[] = [open];
  // Legende oben: Schnittlinie und, falls es einen gibt, der markierte Beitrag
  parts.push(`<line x1="${M.l}" x2="${M.l + 30}" y1="12" y2="12" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>`);
  parts.push(`<text x="${M.l + 36}" y="17" fill="currentColor">${esc(`Schnitt ${pctCH(avg, 2)}`)}</text>`);
  if (marked !== null) {
    parts.push(`<rect x="${M.l + 168}" y="6" width="12" height="12" style="fill:var(--yellow,#ffd700)" stroke="currentColor" stroke-width="1.5"/>`);
    parts.push(`<text x="${M.l + 186}" y="17" fill="currentColor">Bester Beitrag</text>`);
  }
  // Raster und Achse
  const ticks = Math.round(top / step);
  for (let k = 0; k <= ticks; k++) {
    const v = Math.round(k * step * 1e6) / 1e6;
    const yy = fix(y(v));
    parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${yy}" y2="${yy}" stroke="currentColor" stroke-opacity="${k === 0 ? 0.6 : 0.14}"/>`);
    parts.push(`<text x="${M.l - 6}" y="${fix(y(v) + 4)}" text-anchor="end" fill="currentColor" fill-opacity="0.75">${esc(pctCH(v, 2))}</text>`);
  }
  // Balken
  const slot = plotW / n;
  const bw = Math.min(slot * 0.6, 56);
  const bars = s.posts.map((x, i) => {
    const h = plotH * (rates[i] / top);
    const bx = M.l + slot * i + (slot - bw) / 2;
    return { x, h, bx, mid: bx + bw / 2, gold: x.nr === marked, rate: rates[i] };
  });
  for (const b of bars) {
    const fill = b.gold ? `style="fill:var(--yellow,#ffd700)" stroke="currentColor" stroke-width="1.5"` : `fill="currentColor"`;
    parts.push(`<rect data-nr="${b.x.nr}" x="${fix(b.bx)}" y="${fix(M.t + plotH - b.h)}" width="${fix(bw)}" height="${fix(b.h)}" ${fill}/>`);
  }
  // Schnittlinie über den Balken, darunter eine Papierlinie, damit sie auch auf dunklem Grund zu sehen ist
  const ya = fix(y(avg));
  parts.push(`<line x1="${M.l}" x2="${W - M.r}" y1="${ya}" y2="${ya}" style="stroke:var(--paper,#fffdf8);stroke-width:5px"/>`);
  parts.push(`<line data-schnitt="1" x1="${M.l}" x2="${W - M.r}" y1="${ya}" y2="${ya}" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/>`);
  // Zahlen und Beschriftung zuletzt, damit keine Linie sie überdeckt
  for (const b of bars) {
    parts.push(
      `<text x="${fix(b.mid)}" y="${fix(M.t + plotH - b.h - 5)}" text-anchor="middle" fill="currentColor"${b.gold ? ` font-weight="600"` : ""} style="${halo}">${esc(numberCH(b.rate, 2))}</text>`,
    );
    parts.push(`<text x="${fix(b.mid)}" y="${fix(M.t + plotH + 17)}" text-anchor="middle" fill="currentColor" fill-opacity="0.75">${esc(String(b.x.nr))}</text>`);
  }
  parts.push(`<text x="${fix(M.l + plotW / 2)}" y="${H - 6}" text-anchor="middle" fill="currentColor" fill-opacity="0.75">Beitrag</text>`);
  parts.push("</svg>");
  return parts.join("");
}

// ---- Gespeicherter Stand ---------------------------------------------------------------------------

export type State = FormState & {
  v: 1;
  phase: "edit" | "result";
  /** Die Auswertung, damit lib/progress.ts das Werkzeug als erledigt zählt. Wird beim Lesen neu gerechnet. */
  output?: Summary;
};

export const EMPTY_STATE: State = { v: 1, phase: "edit", ...newForm() };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(Math.trunc(v)).slice(0, max) : "");

function parseKurz(raw: unknown): KurzForm {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return emptyKurz();
  const r = raw as Record<string, unknown>;
  return { beitraege: text(r.beitraege, 6), a: text(r.a, 12), b: text(r.b, 12), c: text(r.c, 12), d: text(r.d, 12), reichweite: text(r.reichweite, 12) };
}

function parsePost(raw: unknown): PostForm {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return emptyPost();
  const r = raw as Record<string, unknown>;
  return { name: text(r.name, LIMITS.name), a: text(r.a, 12), b: text(r.b, 12), c: text(r.c, 12), d: text(r.d, 12), reichweite: text(r.reichweite, 12) };
}

/** Liest den Stand aus dem Browser. Kaputte Daten ergeben den leeren Stand; ein Ergebnis wird aus den Angaben neu gerechnet. */
export function parseState(raw: unknown): State {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return EMPTY_STATE;
  const posts = Array.isArray(r.posts) ? r.posts.slice(0, MAX_POSTS).map(parsePost) : [];
  const form: FormState = {
    plattform: isPlattformKey(r.plattform) ? r.plattform : "instagram",
    follower: text(r.follower, 12),
    posts: posts.length > 0 ? posts : startPosts(),
    modus: isModus(r.modus) ? r.modus : "einzeln",
    kurz: parseKurz(r.kurz),
  };
  const input = r.phase === "result" ? toInput(form) : null;
  return input ? { v: 1, phase: "result", ...form, output: summary(input) } : { v: 1, phase: "edit", ...form };
}

// ---- Beispiel --------------------------------------------------------------------------------------

/** Fiktive Zahlen der Malerei Keller, Gossau, für den Knopf «Beispiel einfügen» und den Seitentext. */
export const SAMPLE: FormState = {
  plattform: "instagram",
  follower: "1240",
  posts: [
    { name: "Fassade Gossau", a: "62", b: "8", c: "5", d: "11", reichweite: "1520" },
    { name: "Team beim Streichen", a: "41", b: "3", c: "2", d: "4", reichweite: "1180" },
    { name: "Vorher nachher Treppenhaus", a: "78", b: "12", c: "9", d: "24", reichweite: "2310" },
    { name: "Farbtrends Herbst", a: "29", b: "2", c: "1", d: "6", reichweite: "960" },
    { name: "Lehrling gesucht", a: "35", b: "5", c: "7", d: "3", reichweite: "1050" },
  ],
};

/** Dieselben fünf Beiträge als Summen (Kurzmodus): Zahlen der Malerei Keller, zusammengezählt. */
export const SAMPLE_KURZ: FormState = {
  plattform: "instagram",
  follower: "1240",
  posts: startPosts(),
  modus: "kurz",
  kurz: { beitraege: "5", a: "245", b: "30", c: "24", d: "48", reichweite: "7020" },
};
