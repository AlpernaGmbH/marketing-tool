import { OG_SIZE, renderOg } from "@/lib/og";

// Standard-Bild für alle Seiten. Kategorieseiten bekommen ihr eigenes (Etappe 1b).
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Marketing-Werkzeuge für Schweizer KMU und Vereine";

export default function OgImage() {
  return renderOg({ eyebrow: "Marketing-Werkzeuge", title: "Marketing für Schweizer KMU und Vereine" });
}
