/** «Marketing-Analyse für Schweizer KMU» → die gelbe Markierung liegt hinter «Schweizer KMU» (eine pro Seite). */
export function splitH1(text: string): { lead: string; mark: string } {
  const i = text.indexOf(" für ");
  return i < 0 ? { lead: text, mark: "" } : { lead: text.slice(0, i + 5), mark: text.slice(i + 5) };
}

export function PageH1({ text, className }: { text: string; className?: string }) {
  const { lead, mark } = splitH1(text);
  return (
    <h1 className={className}>
      {lead}
      {mark && <mark className="mark-yellow">{mark}</mark>}
    </h1>
  );
}
