import { brandHits } from "@/lib/brand-rules";
import { SECTION_ORDER, SECTION_TITLES, type ParsedToolContent } from "@/lib/content";
import { BAUSTEIN_NAMES } from "@/lib/pitch";

// Prüfregeln für content/tools/<slug>.md (CLAUDE.md, Harte Regel 12 und Seitentext-Vorlage).
// Reine Funktionen ohne Dateizugriff, damit sie testbar sind.

export type Issue = { level: "error" | "warn"; code: string; message: string };

const err = (code: string, message: string): Issue => ({ level: "error", code, message });
const warn = (code: string, message: string): Issue => ({ level: "warn", code, message });

/** Zählt Wörter im Fliesstext; Markdown-Zeichen und Zeilenschlüssel zählen nicht als Wörter. */
export function countWords(md: string): number {
  return md
    .replace(/[#*_`>|]/g, " ")
    .split(/\s+/)
    .filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

function listItems(md: string, kind: "ordered" | "bullet"): number {
  const re = kind === "ordered" ? /^\s*\d+[.)]\s+\S/ : /^\s*[-*]\s+\S/;
  return md.split("\n").filter((l) => re.test(l)).length;
}

type Banned = { re: RegExp; what: string };
const BANNED: Banned[] = [
  { re: /\bjetzt\b/i, what: "«jetzt» ist gestrichen" },
  { re: /\bnur noch\b/i, what: "«nur noch» ist gestrichen" },
  { re: /\bgarantiert\b/i, what: "«garantiert» ist gestrichen" },
  { re: /\bNr\.\s?1\b/i, what: "«Nr. 1» ist gestrichen" },
  { re: /!/, what: "Ausrufezeichen sind nicht erlaubt" },
  { re: /\p{Extended_Pictographic}/u, what: "Emojis sind nicht erlaubt" },
  { re: /ß/, what: "Schweizer Rechtschreibung: ss statt ß" },
  { re: /["“”„]/, what: "Anführungszeichen sind «» (nicht \" oder “”)" },
  { re: /CHF\s?\d{4,}(?![\d'])/, what: "CHF-Beträge ab 1000 mit Apostroph: CHF 1'000.-" },
  { re: /\d%/, what: "Prozent mit Leerzeichen: 8,1 %" },
];

const SOURCE_RE = /\([^)]*(?:Quelle|BFS|Bundesamt|SECO|EDÖB|digiMONITOR|https?:|\b20\d{2}\b)[^)]*\)/i;

/** Platzhalter dürfen nie auf eine öffentliche Seite. `extra` sind weitere Texte, z. B. Kopfdaten. */
export function todoIssues(body: string, extra: string[] = []): Issue[] {
  if (!/\bTODO\b/.test([body, ...extra].join("\n"))) return [];
  const line = body.slice(0, Math.max(body.search(/\bTODO\b/), 0)).split("\n").length;
  return [err("todo-left", `Platzhalter «TODO» steht noch im Text (Textzeile ${line}) oder in den Kopfdaten`)];
}

/** Stilregeln aus CLAUDE.md (Ton, Rechtschreibung, Formate). */
export function styleIssues(body: string): Issue[] {
  const out: Issue[] = [];
  for (const { re, what } of BANNED) {
    const m = re.exec(body);
    if (m) {
      const line = body.slice(0, m.index).split("\n").length;
      out.push(err("style", `${what} (Textzeile ${line}: «${m[0]}»)`));
    }
  }
  // Sperrliste aus ANTI-PATTERNS.md und BRAND-VOICE-CORE.md
  for (const h of brandHits(body)) {
    const message = `Alperna-Voice: ${h.what} (Textzeile ${h.line}: «${h.text}»)`;
    out.push(h.level === "hart" ? err("voice", message) : warn("voice-soft", message));
  }
  return out;
}

/** Alle Prüfungen für einen Seitentext. `keyword` und `audience` kommen aus der Tool-Konfiguration. */
export function checkToolContent(parsed: ParsedToolContent): Issue[] {
  const issues: Issue[] = [];
  const fm = parsed.frontmatter;

  for (const m of parsed.frontmatterIssues) issues.push(err("frontmatter", m));
  if (fm.title) {
    if (fm.title.length > 60) issues.push(err("title-length", `title hat ${fm.title.length} Zeichen (höchstens 60)`));
    if (!/schweiz/i.test(fm.title)) issues.push(err("title-schweiz", "title enthält «Schweiz» nicht"));
  }
  if (fm.description && fm.description.length > 155) {
    issues.push(err("description-length", `description hat ${fm.description.length} Zeichen (höchstens 155)`));
  }
  if (fm.tagline && fm.tagline.length > 110) {
    issues.push(err("tagline-length", `tagline hat ${fm.tagline.length} Zeichen (höchstens 110)`));
  }

  // Abschnitte: vorhanden und in Vorlagen-Reihenfolge
  for (const key of SECTION_ORDER) {
    if (parsed.sections[key] === undefined) {
      issues.push(err("section-missing", `Abschnitt «## ${SECTION_TITLES[key]}» fehlt`));
    }
  }
  const expected = SECTION_ORDER.map((k) => SECTION_TITLES[k]);
  const found = parsed.h2Order.filter((t) => expected.includes(t as (typeof expected)[number]));
  const present = expected.filter((t) => found.includes(t));
  if (found.join("|") !== present.join("|")) {
    issues.push(err("section-order", `Abschnitte stehen nicht in der Reihenfolge der Vorlage: ${expected.join(" → ")}`));
  }
  const unknown = parsed.h2Order.filter((t) => !expected.includes(t as (typeof expected)[number]));
  for (const t of unknown) issues.push(err("section-unknown", `Unbekannter Abschnitt «## ${t}»`));
  if (/^#\s+\S/m.test(parsed.body)) issues.push(err("h1-in-body", "Der Text enthält eine H1; die H1 kommt aus den Kopfdaten"));

  // Umfang
  const { warum, nutzen, fehler, beispiel } = parsed.sections;
  if (warum !== undefined) {
    const n = countWords(warum);
    if (n < 200 || n > 300) issues.push(err("warum-words", `«Warum das wichtig ist» hat ${n} Wörter (200 bis 300)`));
  }
  if (nutzen !== undefined) {
    const n = listItems(nutzen, "ordered");
    if (n < 3 || n > 5) issues.push(err("nutzen-steps", `«So nutzt du das Ergebnis» hat ${n} nummerierte Schritte (3 bis 5)`));
  }
  if (fehler !== undefined) {
    const n = listItems(fehler, "bullet");
    if (n < 3 || n > 5) issues.push(err("fehler-items", `«Häufige Fehler» hat ${n} Punkte (3 bis 5)`));
  }
  if (beispiel !== undefined && fm.beispielFirma && !beispiel.includes(fm.beispielFirma)) {
    issues.push(err("beispiel-firma", `«Beispiel» nennt die Beispielfirma «${fm.beispielFirma}» nicht`));
  }
  if (parsed.sections.fragen !== undefined) {
    const n = parsed.faq.length;
    if (n < 5 || n > 7) issues.push(err("faq-count", `Es gibt ${n} Fragen (5 bis 7)`));
    for (const f of parsed.faq) {
      if (!f.answer) issues.push(err("faq-empty", `Frage «${f.question}» hat keine Antwort`));
    }
  }
  if (parsed.sections.alperna !== undefined) {
    for (const key of ["problem", "baustein", "beweis"] as const) {
      if (!parsed.alperna[key]) issues.push(err("alperna-field", `Alperna-Feld «${key}» fehlt`));
    }
    const b = parsed.alperna.baustein;
    if (b && !(BAUSTEIN_NAMES as readonly string[]).includes(b)) {
      issues.push(err("alperna-baustein", `baustein «${b}» ist keiner von: ${BAUSTEIN_NAMES.join(", ")}`));
    }
  }
  const words = countWords(parsed.body);
  if (words < 800 || words > 1200) issues.push(err("total-words", `Der Text hat ${words} Wörter (800 bis 1'200)`));

  issues.push(...todoIssues(parsed.body, Object.values(parsed.frontmatter)));
  issues.push(...styleIssues(parsed.body));

  // Zahlen mit Quelle: Hinweis, kein Fehler (heuristisch). Das Beispiel ist fiktiv und ausgenommen.
  const sourced = Object.entries(parsed.sections)
    .filter(([k]) => k !== "beispiel" && k !== "alperna")
    .map(([, v]) => v ?? "");
  for (const text of sourced) {
    for (const para of text.split(/\n\s*\n/)) {
      if (/\d\s?%|CHF\s?\d/.test(para) && !SOURCE_RE.test(para)) {
        issues.push(warn("unsourced-number", `Zahl ohne Quelle in Klammern: «${para.trim().slice(0, 70)} …»`));
      }
    }
  }
  return issues;
}
