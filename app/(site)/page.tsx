import { Contours } from "@/components/site/Contours";
import { TrustLine } from "@/components/site/TrustLine";

// Platzhalter. Die Startseite entsteht in Etappe 1b (Hero, Pfade, Meistgenutzt, Pitch, FAQ).
export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <Contours />
      <div className="container-page section">
        <h1 className="measure">
          Marketing-Werkzeuge für <span className="mark-yellow">Schweizer KMU</span> und Vereine
        </h1>
        <p className="measure mt-4 text-lg text-muted-foreground">
          Kostenlos, verständlich, nach Schweizer Recht.
        </p>
        <div className="mt-6">
          <TrustLine />
        </div>
      </div>
    </div>
  );
}
