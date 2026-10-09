import { parseAnlaesse, parseFeiertage, parseSchulferien, type KalenderData } from "./logic";

// Die drei Datensätze (rund 65 KB) liegen in einem eigenen Chunk und laden erst, wenn das Ergebnis gebraucht wird.
// Jeder Datensatz wird mit zod geprüft; ein kaputter oder fehlender wird null, und das Werkzeug arbeitet ohne ihn weiter.

export async function loadKalenderData(): Promise<KalenderData> {
  const [anlaesse, ferien, feiertage] = await Promise.all([
    import("@/data/anlaesse-ch.json"),
    import("@/data/schulferien.json"),
    import("@/data/feiertage.json"),
  ]);
  return {
    anlaesse: parseAnlaesse(anlaesse.default),
    ferien: parseSchulferien(ferien.default),
    feiertage: parseFeiertage(feiertage.default),
  };
}
