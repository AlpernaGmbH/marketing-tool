/** Hinweis über der Werkzeugliste, solange eine Kategorie noch wenig Werkzeuge hat (ab drei entfällt er). */
export function buildNotice(count: number): string | null {
  if (count >= 3) return null;
  if (count <= 0) return "Dieser Bereich ist im Aufbau. Hier gibt es noch kein Werkzeug.";
  return `Dieser Bereich ist im Aufbau. Aktuell gibt es ${count === 1 ? "ein Werkzeug" : `${count} Werkzeuge`}.`;
}
