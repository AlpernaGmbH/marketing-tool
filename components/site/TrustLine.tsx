import { getTools } from "@/lib/registry";

/** Vertrauenszeile unter dem Hero. Die Werkzeugzahl kommt aus der Registry, nie von Hand. */
export function TrustLine() {
  const count = getTools().length;
  const parts = [
    "Alperna GmbH, Speicher AR",
    ...(count > 0 ? [`${count} Werkzeuge`] : []),
    "kein Konto nötig",
    "keine Tracking-Cookies",
  ];
  return (
    <p className="flex flex-col gap-y-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-3">
      {parts.map((part, i) => (
        <span key={part} className="flex gap-3">
          {i > 0 && (
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}
