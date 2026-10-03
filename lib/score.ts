/** Stufe in Worten, damit die Bedeutung eines Scores nie nur an einer Farbe hängt. */
export function scoreBand(ratio: number): { key: "tief" | "mittel" | "hoch"; text: string } {
  if (ratio >= 0.75) return { key: "hoch", text: "stark" };
  if (ratio >= 0.4) return { key: "mittel", text: "ausbaufähig" };
  return { key: "tief", text: "Handlungsbedarf" };
}
