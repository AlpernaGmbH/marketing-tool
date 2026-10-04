"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOutAndForget } from "@/lib/account-actions";
import { startSignIn } from "@/lib/konto-client";
import { clearAllLocal } from "@/lib/storage";
import { deleteAccountData } from "@/lib/sync";
import { useAccount } from "@/lib/use-account";

/** Konto auf der Profilseite: angemeldet oder nicht, und was beim Konto liegt. */
export function KontoKarte() {
  const info = useAccount();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Anmeldung nicht eingerichtet oder noch nicht geladen: keine Karte (und kein Platzhalter, der springt).
  if (!info || info.login === null) return null;

  async function signOut() {
    setError(null);
    if (await signOutAndForget(info?.storage === true)) window.location.reload();
    else setError("Das Abmelden hat nicht geklappt. Bitte versuch es noch einmal.");
  }

  async function signIn() {
    setError(null);
    setStarting(true);
    const ok = await startSignIn(window.location, "anmeldung", "anmelden");
    setStarting(false);
    if (!ok) setError("Die Anmeldung konnte nicht gestartet werden. Bitte versuch es noch einmal.");
  }

  async function wipe() {
    setError(null);
    if (await deleteAccountData()) {
      clearAllLocal();
      setConfirm(false);
      setNotice("Alle Daten in deinem Konto und auf diesem Gerät sind gelöscht.");
    } else {
      setError("Das Löschen hat nicht geklappt. Es wurde nichts gelöscht. Bitte versuch es noch einmal.");
    }
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
            {info.storage
              ? "Dein Firmenprofil, deine Zwischenstände und deine Merkliste liegen in deinem Konto. Du findest sie auf jedem Gerät wieder, auf dem du dich anmeldest. Beim Abmelden entfernen wir die Kopie von diesem Gerät."
              : "Der Speicher beim Konto ist gerade nicht erreichbar. Deine Daten bleiben vorerst in diesem Browser."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Abmelden
            </Button>
            {info.storage && !confirm && (
              <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
                Meine Daten im Konto löschen
              </Button>
            )}
          </div>
          {confirm && (
            <div role="alertdialog" aria-label="Daten im Konto löschen" className="mt-4 rounded-lg border border-line p-4">
              <p>Das löscht Firmenprofil, Zwischenstände und Merkliste in deinem Konto und auf diesem Gerät. Das lässt sich nicht rückgängig machen.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" onClick={() => void wipe()}>
                  Ja, alles löschen
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
          {notice && (
            <p role="status" className="mt-3 text-sm">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">
            Mit einem Konto liegen dein Firmenprofil, deine Zwischenstände und deine Merkliste bei deinem Konto. Du findest sie auf jedem Gerät wieder, bleibst
            freigeschaltet und bekommst zu deinem Check eine kurze Einordnung. Ohne Konto bleiben die Daten in diesem Browser.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={starting} onClick={() => void signIn()}>
              {starting ? "Wird geöffnet …" : "Anmelden"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
