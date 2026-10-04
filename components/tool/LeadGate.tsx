"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
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
import { submitLead, type LoginProvider } from "@/lib/access-client";
import { clearPending, savePending, startGoogleSignIn } from "@/lib/konto-client";
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
  /** Nach erfolgreichem Absenden: Tool starten oder Download auslösen, ohne Reload. */
  onSuccess: () => void;
};

const ERRORS = {
  invalid: "Bitte prüfe deine Angaben und versuch es noch einmal.",
  rate_limited: "Es gab zu viele Versuche. Bitte versuch es in einer Stunde noch einmal.",
  network: "Das Senden hat nicht geklappt. Prüfe deine Verbindung und versuch es noch einmal.",
} as const;

export function LeadGate({ open, onOpenChange, tool, reason, login = null, onSuccess }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { profile } = useProfile();
  const [googleConsent, setGoogleConsent] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", firma: "", email: "", telefon: "", honeypot: "" },
  });

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

  async function onGoogle() {
    if (!googleConsent) return setGoogleError("Bitte stimm der Kontaktaufnahme zu.");
    setGoogleError(null);
    setGoogleBusy(true);
    // Die Anmeldung verlässt die Seite: Werkzeug und Einwilligung bleiben kurz im Browser, bis wir zurück sind.
    savePending({ tool, firma: profile.firma?.trim() || undefined });
    if (!(await startGoogleSignIn(window.location))) {
      clearPending();
      setGoogleError("Die Anmeldung konnte nicht gestartet werden. Versuch es noch einmal oder nutze das Formular.");
      setGoogleBusy(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-reason={reason} className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dein erstes Ergebnis war gratis.</DialogTitle>
          <DialogDescription>
            {login === "google"
              ? "Melde dich kurz mit Google an – dann sind alle Werkzeuge und Downloads offen, und wir melden uns persönlich, falls du Fragen hast."
              : "Hinterlass uns Name, Firma und E-Mail – dann sind alle Werkzeuge und Downloads offen, und wir melden uns persönlich, falls du Fragen hast."}
          </DialogDescription>
        </DialogHeader>

        {login === "google" && (
          <div className="grid gap-4" data-testid="konto-google">
            <div className="flex items-start gap-2">
              <Checkbox
                id="konto-consent"
                checked={googleConsent}
                onCheckedChange={(v) => {
                  setGoogleConsent(v === true);
                  if (v === true) setGoogleError(null);
                }}
                aria-invalid={!!googleError}
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
            {googleError && (
              <p role="alert" className="text-sm text-destructive">
                {googleError}
              </p>
            )}
            <Button type="button" size="lg" onClick={onGoogle} disabled={googleBusy}>
              {googleBusy ? "Weiter zu Google …" : "Mit Google anmelden"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Wir erhalten von Google deinen Namen und deine E-Mail-Adresse, sonst nichts. Deine Eingaben im Werkzeug bleiben in deinem Browser.
            </p>
          </div>
        )}

        {login === "google" ? (
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Lieber ohne Google-Konto? Formular ausfüllen</summary>
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
