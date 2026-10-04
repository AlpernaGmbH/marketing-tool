// Sperrliste aus ANTI-PATTERNS.md und BRAND-VOICE-CORE.md (Alperna, Version 2.0 vom 24.07.2026).
// «hart» = Fehler (Build rot), «vermeiden» = Hinweis. Die Liste gilt für alle Seitentexte unter content/.
// Quelle der Regeln: die beiden Dokumente von Alperna. Änderungen dort zuerst, dann hier nachziehen.

export type BrandRule = { re: RegExp; what: string; level: "hart" | "vermeiden" };

const hart = (re: RegExp, what: string): BrandRule => ({ re, what, level: "hart" });
const meiden = (re: RegExp, what: string): BrandRule => ({ re, what, level: "vermeiden" });

export const BRAND_RULES: BrandRule[] = [
  // 1.1 KI-Tells
  hart(/in der heutigen schnelllebigen welt/i, "KI-Floskel «In der heutigen schnelllebigen Welt»"),
  hart(/\blass(?:t)? uns\b/i, "«Lass uns» / «Lasst uns» (stattdessen «wir» oder direkt loslegen)"),
  hart(/es ist wichtig,? (?:zu erwähnen|zu verstehen)/i, "«Es ist wichtig zu erwähnen/verstehen»: den Punkt einfach machen"),
  hart(/\bletztendlich\b|\bletzten endes\b/i, "«Letztendlich»: «am Ende» oder weglassen"),
  hart(/\bim wesentlichen\b|\bgrundsätzlich\b/i, "«Im Wesentlichen» / «Grundsätzlich»: weglassen"),
  hart(/es lohnt sich zu erwähnen/i, "«Es lohnt sich zu erwähnen»: einfach sagen"),
  hart(/wie bereits erwähnt/i, "«Wie bereits erwähnt»: weglassen"),
  hart(/\bin diesem sinne\b/i, "«In diesem Sinne»: weglassen"),
  hart(/zusammenfassend lässt sich sagen/i, "«Zusammenfassend lässt sich sagen»: Schlussfolgerung direkt aussprechen"),
  hart(/tauche ein in|begib dich auf eine reise|entfessle dein potenzial/i, "KI-Floskel («Tauche ein», «Reise», «Entfessle»)"),
  hart(/die zukunft gehört|eine welt, in der|sei der erste, der/i, "KI-Floskel («Die Zukunft gehört», «Eine Welt, in der», «Sei der Erste»)"),
  hart(/bist du bereit,/i, "«Bist du bereit, …?»"),
  hart(/(?:^|[.!?]\s+)stell(?:en sie)? (?:dir|sich) vor\b/im, "«Stell dir vor» als Einstieg"),
  hart(/wussten sie schon|haben sie sich jemals gefragt|\bim folgenden\b|lange rede, kurzer sinn/i, "verbotener Satzanfang (ANTI-PATTERNS 2.1)"),
  hart(/hot take:|unpopuläre meinung:|spoiler:/i, "Hot-Take-Opener"),
  // 1.2 Business-Schwurbel
  hart(/\bsynergie/i, "«Synergien»: konkret sagen, was zusammenwirkt"),
  hart(/\bganzheitlich|\bholistisch/i, "«ganzheitlich» / «holistisch»: konkret sagen, was die Lösung umfasst"),
  hart(/massgeschneidert/i, "«massgeschneiderte Lösung»: «auf dich zugeschnitten» oder weglassen"),
  hart(/state of the art|best practice/i, "«State of the Art» / «Best Practice»: «Erfahrungswert» oder konkret"),
  hart(/\bmehrwert|\bwin-win\b/i, "«Mehrwert» / «Win-Win»: konkret sagen"),
  hart(/\bstakeholder|customer[- ]journey|touchpoint/i, "«Stakeholder» / «Customer Journey» / «Touchpoint»: «Beteiligte» / «Kundenweg» / «Berührungspunkt»"),
  hart(/\bmindset\b|pain[- ]points?\b/i, "«Mindset» / «Pain Points»: «Haltung» / «Probleme, Frust»"),
  hart(/\bführend|\bmarktführer/i, "«führend» / «Marktführer»: nie"),
  hart(/\binnovativ|\bdisruptiv|game[- ]changer/i, "«innovativ» / «disruptiv» / «Game-Changer»: nie"),
  hart(/next level|out[- ]of[- ]the[- ]box/i, "«Next Level» / «Out-of-the-Box»: nie"),
  hart(/\bskalierbar/i, "«skalierbar» als Verkaufsargument: wir reden mit KMU, nicht mit Investoren"),
  // 1.3 und 2.2 vermeiden
  meiden(/\bauthentisch|\bleidenschaft|\bherzblut|\bhingabe\b/i, "abgenutzt: «authentisch», «Leidenschaft», «Herzblut», «Hingabe»"),
  meiden(/wir geben unser bestes|auf den punkt gebracht|\bkurz gesagt\b/i, "abgenutzt: «Wir geben unser Bestes», «Auf den Punkt gebracht», «Kurz gesagt»"),
  meiden(/\bstorytelling\b/i, "«Storytelling» nur selten"),
  meiden(/ehrlich gesagt|um ehrlich zu sein|persönlich finde ich|meiner meinung nach/i, "Füllsatz («Ehrlich gesagt», «Meiner Meinung nach»)"),
  // 4 Tonalitäten
  hart(/nur diese woche|nur heute/i, "falsche Dringlichkeit"),
  hart(/\bdu verlierst kunden\b|\bwer .{0,40} verschwindet\b/i, "Angst- oder Schuld-Marketing"),
  hart(/explodierend/i, "laute Sprache («explodierende Reichweite»)"),
  // 6 Selbstbeschreibungen
  hart(/\bexperten? für\b|award-winning|boutique-agentur|innovative agentur/i, "verbotene Selbstbeschreibung (ANTI-PATTERNS 6.1)"),
  hart(/\bwir sind (?:eine|die|unsere) agentur\b|\bals agentur\b/i, "«Agentur»: Alperna ist Partner für den digitalen Auftritt, keine Agentur"),
  meiden(/\bviral\b/i, "«viral» ist nie ein Verkaufsargument"),
  // 7.1 Formatierung
  hart(/—/, "Gedankenstrich «—» (Em-Dash) ist als Standard-Interpunktion verboten"),
  hart(/\s[,.;:!?]/, "Leerzeichen vor Satzzeichen"),
];

export type BrandHit = { level: "hart" | "vermeiden"; what: string; line: number; text: string };

/** Alle Treffer (je Regel der erste) mit Zeilennummer im übergebenen Text. */
export function brandHits(body: string): BrandHit[] {
  const out: BrandHit[] = [];
  for (const rule of BRAND_RULES) {
    const m = rule.re.exec(body);
    if (!m) continue;
    out.push({ level: rule.level, what: rule.what, line: body.slice(0, m.index).split("\n").length, text: m[0].trim() });
  }
  return out;
}
