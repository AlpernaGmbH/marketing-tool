"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startSignIn } from "@/lib/konto-client";

export type SignInMode = "anmelden" | "registrieren";

/**
 * Kurzer Halt vor dem Fenster von Clerk: Was die Person bekommt und was wir speichern. Clerk führt Anmelden und Registrieren
 * in einem Fenster zusammen (beim ersten Mal entsteht das Konto). Die Anmeldung allein schaltet nichts frei und schickt nichts
 * an Alperna. Das passiert erst beim Werkzeug, mit Häkchen.
 */
export function SignInDialog({ open, mode, onOpenChange }: { open: boolean; mode: SignInMode; onOpenChange: (open: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // Zurück-Taste aus dem Cache des Browsers: Die Seite kommt so zurück, wie sie war, auch mit gesperrtem Knopf.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  async function go() {
    setError(null);
    setBusy(true);
    if (await startSignIn(window.location, "anmeldung", mode)) {
      // Das Fenster von Clerk liegt jetzt über der Seite. Dieses Fenster muss weg, sonst fängt es den Fokus ab.
      setBusy(false);
      onOpenChange(false);
    } else {
      setBusy(false);
      setError("Die Anmeldung konnte nicht gestartet werden. Bitte versuch es noch einmal.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="signin-dialog">
        <DialogHeader>
          <DialogTitle>{mode === "registrieren" ? "Konto erstellen" : "Anmelden"}</DialogTitle>
          <DialogDescription>
            Im nächsten Fenster wählst du, wie du dich anmeldest. Ein Passwort brauchst du nicht. Beim ersten Mal legen wir dein Konto an, danach meldest du dich damit an.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Mit Konto liegen dein Firmenprofil und deine Ergebnisse bei deinem Konto, du findest sie auf jedem Gerät wieder, bleibst freigeschaltet
            und bekommst zu deinem Check eine kurze Einordnung. Wir erhalten nur Name und E-Mail-Adresse. Die Anmeldung läuft über den Dienst Clerk. Mehr dazu in der{" "}
            <Link href="/datenschutz" className="underline underline-offset-4">
              Datenschutzerklärung
            </Link>
            .
          </p>
          <Button type="button" size="lg" onClick={() => void go()} disabled={busy}>
            {busy ? "Anmeldung wird geöffnet …" : mode === "registrieren" ? "Konto erstellen" : "Weiter zur Anmeldung"}
          </Button>
          <p role="alert" className="min-h-5 text-sm text-destructive">
            {error}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
