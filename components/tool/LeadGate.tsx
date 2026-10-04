"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitLead, unlockWithAccount, type LoginProvider } from "@/lib/access-client";
import { clearPending, savePending, startSignIn } from "@/lib/konto-client";
import { leadSchema } from "@/lib/lead-schema";
import { useProfile } from "@/lib/use-profile";

const formSchema = leadSchema.omit({ tool: true });
type FormValues = z.input<typeof formSchema>;

export type LeadGateReason = "zweites_tool" | "download";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slug des Tools, das der Besucher gerade nutzt. */
  tool: string;
  reason: LeadGateReason;
  /** Angebotener Anmeldeweg (vom Server). Ohne: nur das Formular. */
  login?: LoginProvider | null;
  /** Der Besucher hat eine Sitzung: Dann genügt das Häkchen, eine erneute Anmeldung ist unnötig. */
  signedIn?: boolean;
  /** Nach erfolgreichem Absenden: Tool starten oder Download auslösen, ohne Reload. */
  onSuccess: () => void;
};

const ERRORS = {
  invalid: "Bitte prüfe deine Angaben und versuch es noch einmal.",
  rate_limited: "Es gab zu viele Versuche. Bitte versuch es in einer Stunde noch einmal.",
  network: "Das Senden hat nicht geklappt. Prüfe deine Verbindung und versuch es noch einmal.",
} as const;

export function LeadGate({ open, onOpenChange, tool, reason, login = null, signedIn = false, onSuccess }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { profile } = useProfile();
  const [kontoConsent, setKontoConsent] = useState(false);
  const [kontoError, setKontoError] = useState<string | null>(null);
  const [kontoBusy, setKontoBusy] = useState(false);
  // Eine Sitzung, die der Server nicht mehr kennt: dann doch wieder der Weg über die Anmeldung.
  const [sessionStale, setSessionStale] = useState(false);
  const direct = login === "clerk" && signedIn && !sessionStale;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", firma: "", email: "", telefon: "", honeypot: "" },
  });

  // Zurück-Taste aus dem Cache des Browsers (bfcache): Die Seite kommt so zurück, wie sie war, auch mit gesperrtem Knopf.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setKontoBusy(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setSubmitError(null);
      setKontoError(null);
      setKontoBusy(false);
    }
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    const result = await submitLead({ ...values, tool });
    if (result.ok) {
      // Erst onSuccess (löst das wartende Tool oder den Download aus), dann schliessen.
      onSuccess();
      onOpenChange(false);
      return;
    }
    setSubmitError(ERRORS[result.reason]);
  }

  async function onSignIn() {
    if (!kontoConsent) return setKontoError("Bitte stimm der Kontaktaufnahme zu.");
    setKontoError(null);
    setKontoBusy(true);
    // Die Anmeldung kann die Seite verlassen (Weiterleitung zum Anbieter): Werkzeug und Einwilligung bleiben kurz im Browser, bis wir zurück sind.
    savePending({ tool, firma: profile.firma?.trim() || undefined });
    if (await startSignIn(window.location)) {
      // Das Fenster von Clerk liegt jetzt über der Seite. Dieses Fenster muss weg, sonst fängt es den Fokus ab.
      setKontoBusy(false);
      onOpenChange(false);
    } else {
      clearPending();
      setKontoError("Die Anmeldung konnte nicht gestartet werden. Versuch es noch einmal oder nutze das Formular.");
      setKontoBusy(false);
    }
  }

  async function onUnlock() {
    if (!kontoConsent) return setKontoError("Bitte stimm der Kontaktaufnahme zu.");
    setKontoError(null);
    setKontoBusy(true);
    const result = await unlockWithAccount(tool, profile.firma?.trim() || undefined);
    setKontoBusy(false);
    if (result === "ok") {
      onSuccess();
      onOpenChange(false);
    } else if (result === "not_signed_in") {
      setSessionStale(true);
      setKontoError("Deine Anmeldung ist abgelaufen. Bitte melde dich noch einmal an.");
    } else {
      setKontoError("Das Freischalten hat nicht geklappt. Bitte versuch es noch einmal.");
    }
  }

  const formBlock = (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <Field id="lead-name" label="Name" error={errors.name?.message}>
        <Input id="lead-name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
      </Field>
      <Field id="lead-firma" label="Firma" error={errors.firma?.message}>
        <Input
          id="lead-firma"
          autoComplete="organization"
          aria-invalid={!!errors.firma}
          {...register("firma")}
        />
      </Field>
      <Field id="lead-email" label="E-Mail" error={errors.email?.message}>
        <Input
          id="lead-email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
      </Field>
      <Field id="lead-telefon" label="Telefon (optional)" error={errors.telefon?.message}>
        <Input
          id="lead-telefon"
          type="tel"
          autoComplete="tel"
          aria-invalid={!!errors.telefon}
          {...register("telefon")}
        />
      </Field>

      {/* Honeypot: für Menschen unsichtbar, Bots füllen es aus. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="lead-website">Website (nicht ausfüllen)</label>
        <input id="lead-website" tabIndex={-1} autoComplete="off" {...register("honeypot")} />
      </div>

      <div className="grid gap-1">
        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="consent"
            render={({ field }) => (
              <Checkbox
                id="lead-consent"
                checked={field.value === true}
                onCheckedChange={(v) => field.onChange(v === true ? true : undefined)}
                aria-invalid={!!errors.consent}
                aria-describedby="lead-consent-text"
              />
            )}
          />
          {/* Bewusst ein einfaches <label>: shadcn «Label» ist ein Flex-Container und würde Text und Link trennen. */}
          <label htmlFor="lead-consent" id="lead-consent-text" className="text-sm leading-snug">
            Alperna darf mich zu meinem Ergebnis kontaktieren. Mehr dazu in der{" "}
            <Link href="/datenschutz" className="underline underline-offset-2">
              Datenschutzerklärung
            </Link>
            .
          </label>
        </div>
        {errors.consent && (
          <p role="alert" className="text-sm text-destructive">
            Bitte stimm der Kontaktaufnahme zu.
          </p>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Später
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Wird gesendet …" : "Freischalten"}
        </Button>
      </div>
    </form>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent data-reason={reason} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dein erstes Ergebnis war gratis.</DialogTitle>
          <DialogDescription>
            {direct
              ? "Du bist angemeldet. Setz das Häkchen, dann sind alle Werkzeuge und Downloads offen, und wir melden uns persönlich, falls du Fragen hast."
              : login === "clerk"
              ? "Melde dich kurz an – dann sind alle Werkzeuge und Downloads offen, und wir melden uns persönlich, falls du Fragen hast."
              : "Hinterlass uns Name, Firma und E-Mail – dann sind alle Werkzeuge und Downloads offen, und wir melden uns persönlich, falls du Fragen hast."}
          </DialogDescription>
        </DialogHeader>

        {login === "clerk" && (
          <div className="grid gap-4" data-testid="konto-anmeldung">
            <div className="flex items-start gap-2">
              <Checkbox
                id="konto-consent"
                checked={kontoConsent}
                onCheckedChange={(v) => {
                  setKontoConsent(v === true);
                  if (v === true) setKontoError(null);
                }}
                aria-invalid={!!kontoError}
                aria-describedby="konto-consent-text"
              />
              <label htmlFor="konto-consent" id="konto-consent-text" className="text-sm leading-snug">
                Alperna darf mich zu meinem Ergebnis kontaktieren. Mehr dazu in der{" "}
                <Link href="/datenschutz" className="underline underline-offset-2">
                  Datenschutzerklärung
                </Link>
                .
              </label>
            </div>
            {kontoError && (
              <p role="alert" className="text-sm text-destructive">
                {kontoError}
              </p>
            )}
            {direct ? (
              <Button type="button" size="lg" onClick={() => void onUnlock()} disabled={kontoBusy}>
                {kontoBusy ? "Wird freigeschaltet …" : "Freischalten"}
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={onSignIn} disabled={kontoBusy}>
                {kontoBusy ? "Anmeldung wird geöffnet …" : "Anmelden und freischalten"}
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              Wir erhalten deinen Namen und deine E-Mail-Adresse. Die Anmeldung läuft über den Dienst Clerk. Deine Eingaben im Werkzeug speichern wir in deinem Konto, damit du sie auf jedem Gerät wiederfindest.
            </p>
          </div>
        )}

        {login === "clerk" ? (
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {direct ? "Stattdessen das Formular ausfüllen" : "Lieber ohne Konto? Formular ausfüllen"}
            </summary>
            <div className="mt-4">{formBlock}</div>
          </details>
        ) : (
          formBlock
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
