import { dateCH } from "@/lib/ch";

type Props = {
  /** Stand der Quelldatei in content/legal/ (ISO-Datum, z. B. «2026-10-03»). */
  stand: string;
  /** Hinweistext. Kommt aus content/legal/, nie aus dem Tool-Code (Harte Regel 8). */
  children: React.ReactNode;
};

/** Hinweisbox für Rechts-Tools mit dem Stand der Quelldatei. */
export function LegalDisclaimer({ stand, children }: Props) {
  return (
    <aside aria-label="Rechtlicher Hinweis" className="rounded-lg border border-line bg-surface p-4 text-sm">
      <div className="content">{children}</div>
      <p className="mt-2 text-muted-foreground">Stand der Rechtstexte: {dateCH(stand)}</p>
    </aside>
  );
}
