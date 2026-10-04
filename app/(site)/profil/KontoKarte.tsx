"use client";

import { useState } from "react";
import { SignInDialog, type SignInMode } from "@/components/site/SignInDialog";
import { Button } from "@/components/ui/button";
import { signOutAccount } from "@/lib/account-client";
import { useAccount } from "@/lib/use-account";

/** Konto auf der Profilseite: angemeldet oder nicht. Das Firmenprofil darunter bleibt in diesem Browser. */
export function KontoKarte() {
  const info = useAccount();
  const [dialog, setDialog] = useState<{ open: boolean; mode: SignInMode }>({ open: false, mode: "anmelden" });
  const [error, setError] = useState(false);

  // Anmeldung nicht eingerichtet oder noch nicht geladen: keine Karte (und kein Platzhalter, der springt).
  if (!info || info.login === null) return null;

  async function signOut() {
    setError(false);
    if (await signOutAccount()) window.location.reload();
    else setError(true);
  }

  return (
    <section aria-labelledby="konto-titel" className="mt-8 rounded-xl border border-line bg-paper p-5 md:p-6" data-testid="konto-karte">
      <h2 id="konto-titel" className="text-lg font-semibold">
        Konto
      </h2>
      {info.account ? (
        <>
          <p className="mt-2">
            Angemeldet als <strong className="font-medium">{info.account.name}</strong>
            <span className="text-muted-foreground"> ({info.account.email})</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Mit deinem Konto bleibst du auf jedem Gerät freigeschaltet. Das Firmenprofil unten bleibt in diesem Browser.
          </p>
          <div className="mt-4">
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Abmelden
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Das Abmelden hat nicht geklappt. Bitte versuch es noch einmal.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            Mit einem Konto bleibst du auf jedem Gerät freigeschaltet und bekommst zu deinem Check eine kurze Einordnung. Das Firmenprofil unten
            bleibt in diesem Browser, mit oder ohne Konto.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setDialog({ open: true, mode: "anmelden" })}>
              Anmelden
            </Button>
            <Button type="button" onClick={() => setDialog({ open: true, mode: "registrieren" })}>
              Registrieren
            </Button>
          </div>
          <SignInDialog open={dialog.open} mode={dialog.mode} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
        </>
      )}
    </section>
  );
}
