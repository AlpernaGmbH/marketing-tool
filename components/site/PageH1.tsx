import { Fragment, type ReactNode } from "react";

/** «Marketing-Analyse für Schweizer KMU» → die gelbe Markierung liegt hinter «Schweizer KMU» (eine pro Seite). */
export function splitH1(text: string): { lead: string; mark: string } {
  const i = text.indexOf(" für ");
  return i < 0 ? { lead: text, mark: "" } : { lead: text.slice(0, i + 5), mark: text.slice(i + 5) };
}

/**
 * Lange Wörter der Titel mit Stelle für den Umbruch (zwischen den Teilen). Browser ohne Trennwörterbuch (`hyphens: auto` greift nur mit
 * einem) brechen sonst mitten im Wort, bei 375 px zum Beispiel «Kommunikationsko / nzept». Ein `<wbr>` ändert weder den Text noch den
 * Namen der Überschrift.
 */
export const BREAK_WORDS: Record<string, string[]> = {
  Kommunikationskonzept: ["Kommunikations", "konzept"],
  Wettbewerbsvergleich: ["Wettbewerbs", "vergleich"],
  Empfehlungsprogramm: ["Empfehlungs", "programm"],
  Angebotsarchitektur: ["Angebots", "architektur"],
  Angebotsgrafik: ["Angebots", "grafik"],
  Verzeichniseinträge: ["Verzeichnis", "einträge"],
  Marketingstrategie: ["Marketing", "strategie"],
  Idealkundenprofil: ["Idealkunden", "profil"],
  Nutzenversprechen: ["Nutzen", "versprechen"],
  Feiertagskalender: ["Feiertags", "kalender"],
  Bewertungsantwort: ["Bewertungs", "antwort"],
  Medienmitteilung: ["Medien", "mitteilung"],
  Anspruchsgruppen: ["Anspruchs", "gruppen"],
  Inhaltsstrategie: ["Inhalts", "strategie"],
  Kernbotschaften: ["Kern", "botschaften"],
  Markenplattform: ["Marken", "plattform"],
  Kanalstrategie: ["Kanal", "strategie"],
  Beitragsideen: ["Beitrags", "ideen"],
  Öffnungszeiten: ["Öffnungs", "zeiten"],
};

const BREAK_RE = new RegExp(`(?<![\\p{L}])(${Object.keys(BREAK_WORDS).join("|")})(?![\\p{L}])`, "gu");

/** Teilt einen Text an den langen Wörtern aus `BREAK_WORDS`: gewöhnlicher Text und Wörter mit Umbruchstelle wechseln sich ab. */
export function breakParts(text: string): (string | string[])[] {
  const out: (string | string[])[] = [];
  let last = 0;
  for (const m of text.matchAll(BREAK_RE)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(BREAK_WORDS[m[1]]);
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string): ReactNode {
  return breakParts(text).map((part, i) =>
    typeof part === "string" ? (
      <Fragment key={i}>{part}</Fragment>
    ) : (
      <Fragment key={i}>
        {part.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <wbr />}
            {p}
          </Fragment>
        ))}
      </Fragment>
    ),
  );
}

export function PageH1({ text, className }: { text: string; className?: string }) {
  const { lead, mark } = splitH1(text);
  return (
    <h1 className={className}>
      {withBreaks(lead)}
      {mark && <mark className="mark-yellow">{withBreaks(mark)}</mark>}
    </h1>
  );
}
