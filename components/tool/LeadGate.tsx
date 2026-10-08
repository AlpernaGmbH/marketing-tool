"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitEmail } from "@/lib/access-client";
import { leadSchema } from "@/lib/lead-schema";

const formSchema = leadSchema.omit({ tool: true });
type FormValues = z.input<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Slug des Tools, das der Besucher gerade nutzt. */
  tool: string;
  /** Vorbelegung, wenn die Person ihre Adresse ändert. */
  email?: string | null;
  /** Nach dem Absenden: das Ergebnis zeigen oder den Download auslösen, ohne Reload. */
  onSuccess: (email: string) => void;
};

const ERRORS = {
  invalid: "Bitte prüfe deine Angaben und versuch es noch einmal.",
  rate_limited: "Es gab zu viele Versuche. Bitte versuch es in einer Stunde noch einmal.",
  network: "Das Senden hat nicht geklappt. Prüfe deine Verbindung und versuch es noch einmal.",
} as const;

/**
 * Das E-Mail-Fenster (Zugang v3): erscheint, bevor ein Werkzeug sein erstes Ergebnis zeigt, und vor Downloads.
 * Die Adresse ist Pflicht, die Einwilligung zur Kontaktaufnahme freiwillig. Danach gehen Ergebnisse mit Werkzeug, Eingabe und Ausgabe an Alperna.
 */
export function LeadGate({ open, onOpenChange, tool, email = null, onSuccess }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: email ?? "", consent: false, honeypot: "" },
  });

  // Das Fenster bleibt eingehängt; bei jedem Öffnen gilt die aktuell bekannte Adresse (leer, wenn der Server sie vergessen hat).
  useEffect(() => {
    if (open) {
      reset({ email: email ?? "", consent: false, honeypot: "" });
      setSubmitError(null);
    }
  }, [open, email, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) setSubmitError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: FormValues) {
    setSubmitError(null);
    const result = await submitEmail({ ...(values as z.output<typeof formSchema>), tool });
    if (result.ok) {
      // Erst onSuccess (zeigt das wartende Ergebnis oder löst den Download aus), dann schliessen.
      onSuccess(values.email.trim().toLowerCase());
      onOpenChange(false);
      return;
    }
    setSubmitError(ERRORS[result.reason]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dein Ergebnis ist bereit.</DialogTitle>
          <DialogDescription>
            Gib deine E-Mail-Adresse an, dann zeigen wir es dir. Dein Ergebnis und deine Eingaben gehen mit der Adresse an Alperna, damit wir dir bei Fragen
            weiterhelfen können.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="lead-email">E-Mail</Label>
            <Input id="lead-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
            {errors.email && (
              <p role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

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
                    onCheckedChange={(v) => field.onChange(v === true)}
                    aria-describedby="lead-consent-text"
                  />
                )}
              />
              {/* Bewusst ein einfaches <label>: shadcn «Label» ist ein Flex-Container und würde Text und Link trennen. */}
              <label htmlFor="lead-consent" id="lead-consent-text" className="text-sm leading-snug">
                Alperna darf mich zu meinem Ergebnis kontaktieren (freiwillig). Mehr dazu in der{" "}
                <Link href="/datenschutz" className="underline underline-offset-2">
                  Datenschutzerklärung
                </Link>
                .
              </label>
            </div>
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
              {isSubmitting ? "Wird gesendet …" : "Ergebnis anzeigen"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
