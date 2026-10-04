"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startGoogleSignIn } from "@/lib/konto-client";

export type SignInMode = "anmelden" | "registrieren";

/**
 * Anmelden und Registrieren sind bei Google ein Vorgang: Beim ersten Mal entsteht das Konto, sonst meldet es an.
 * Die Anmeldung allein schaltet nichts frei und schickt nichts an Alperna. Das passiert erst beim Werkzeug, mit Häkchen.
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
    if (!(await startGoogleSignIn(window.location, "anmeldung"))) {
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
            Mit deinem Google-Konto, ein Passwort brauchst du nicht. Beim ersten Mal legen wir dein Konto an, danach meldest du dich damit an.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Mit Konto liegen dein Firmenprofil und deine Ergebnisse bei deinem Konto, du findest sie auf jedem Gerät wieder, bleibst freigeschaltet
            und bekommst zu deinem Check eine kurze Einordnung. Von Google übernehmen wir nur Name und E-Mail-Adresse. Mehr dazu in der{" "}
            <Link href="/datenschutz" className="underline underline-offset-4">
              Datenschutzerklärung
            </Link>
            .
          </p>
          <Button type="button" size="lg" onClick={() => void go()} disabled={busy}>
            {busy ? "Weiter zu Google …" : "Mit Google anmelden"}
          </Button>
          <p role="alert" className="min-h-5 text-sm text-destructive">
            {error}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
