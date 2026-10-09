// Wortwahl der Website (Entscheid 09.10.2026): Die Kategorien heissen Strategie, Analyse, Inhalte und Praktisches.
// «KI», «Schweiz», «Content» und «Vereine» sind weder Kategorie noch Menüpunkt. «Content» kommt in keinem Namen
// und keinem Text mehr vor, «Schweiz» bleibt im Seitentitel (SEO-Regel in CLAUDE.md), «KI» bleibt dort, wo ein Werkzeug
// wirklich eine KI einsetzt (Transparenz). «Verein» ist eine Rechtsform, keine Zielgruppe; die Werkzeuge, die noch
// «Vereine» ansprechen, bekommen in Phase P3 ihren KMU-Wortlaut und stehen bis dahin als Hinweis in der Liste.
// Reine Funktionen ohne Dateizugriff, damit sie testbar sind (Aufruf in scripts/wording-check.ts).

export type WordingIssue = { level: "error" | "warn"; scope: string; message: string };

const NAV_BANNED = /\b(KI|Content\w*|Vereine\w*|Vereins\w*)\b/;
const CONTENT_WORD = /\bContent\b|\bContent-/;
const VEREIN_WORD = /\b(Vereine|Vereinen|Vereins\w*)\b/g;

/**
 * Menü, Fusszeile und Kategorieköpfe: keines der vier alten Kategoriewörter. «Schweiz» als eigener Menüpunkt ist gestrichen;
 * «Schweizer KMU» in einer Überschrift bleibt erlaubt.
 */
export function checkNavigation(entries: { scope: string; text: string }[]): WordingIssue[] {
  return entries.flatMap(({ scope, text }) => {
    const m = NAV_BANNED.exec(text);
    const word = m ? m[1] : text.trim() === "Schweiz" ? "Schweiz" : null;
    return word ? [{ level: "error" as const, scope, message: `«${word}» gehört nicht in Menü, Kategorienamen und Kategorieköpfe: «${text}»` }] : [];
  });
}

/** Namen, Titel, Überschriften, Taglines, Schlüsselwörter und Fliesstext: das Wort «Content» ist gestrichen. */
export function checkContentWord(entries: { scope: string; text: string }[]): WordingIssue[] {
  return entries.flatMap(({ scope, text }) => {
    const n = (text.match(new RegExp(CONTENT_WORD.source, "g")) ?? []).length;
    return n ? [{ level: "error" as const, scope, message: `«Content» kommt ${n}× vor (Inhalte, Beitrag oder ein Kompositum wie «Inhaltsstrategie» schreiben)` }] : [];
  });
}

/** Slugs: kein Werkzeug und keine Kategorie heisst nach den alten Wörtern. */
export function checkSlugs(slugs: string[]): WordingIssue[] {
  return slugs.filter((s) => /^(content|ki|schweiz|vereine?)(-|$)/.test(s)).map((s) => ({ level: "error" as const, scope: s, message: `Der Slug «${s}» beginnt mit einem gestrichenen Kategoriewort` }));
}

/** «Vereine» als Zielgruppe in einem Text: Hinweis mit Anzahl, bis das Werkzeug seinen KMU-Wortlaut hat (Phase P3). */
export function checkVereinWording(scope: string, text: string): WordingIssue[] {
  const n = (text.match(VEREIN_WORD) ?? []).length;
  return n ? [{ level: "warn", scope, message: `«Vereine» kommt ${n}× vor (Wortlaut KMU folgt in P3)` }] : [];
}
