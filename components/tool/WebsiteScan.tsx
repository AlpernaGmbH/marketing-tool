"use client";

import { useState, type ReactNode } from "react";
import { ProfileFieldsForm, type BasicField } from "@/components/tool/ProfileFieldsForm";
import { useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { runCheck } from "@/lib/check/client";
import type { CheckResult } from "@/lib/check/types";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { SLUG as CHECK_SLUG, buildInput, formProblem, industryFor, parseCheckState, type SavedCheck } from "@/tools/digitaler-auftritt-check/logic";

const SCAN_STEPS = ["Website lesen", "Google-Profil und Kanäle suchen", "Auswerten"];

type Props = {
  /** Präfix für die Feld-IDs und die Überschrift (`<präfix>-scan`). */
  idPrefix: string;
  /** Erklärung über dem Knopf: wozu das Werkzeug die Website liest. */
  intro: ReactNode;
  /** Felder des Firmenprofils, die der Scan braucht und die das Werkzeug nicht schon selbst zeigt. */
  fields: BasicField[];
  /** Satz über dem gespeicherten Scan; null, wenn keiner gespeichert ist. */
  stand: (saved: SavedCheck) => string | null;
  /** Läuft, nachdem ein neues Ergebnis gespeichert ist. */
  onScanned?: (result: CheckResult) => void;
};

/**
 * Der Website-Scan für Werkzeuge, die Angaben aus der Website lesen (Reifegrad-Check, Kommunikationskonzept): derselbe Marketing-Check wie
 * auf seiner eigenen Seite, mit Firma, Branche und Website aus dem Firmenprofil. Das Ergebnis liegt unter dem Schlüssel des
 * Marketing-Checks; alle Werkzeuge lesen es dort, und es muss nur einmal laufen. Die Adresse der Website geht an unseren Server, nicht
 * die E-Mail-Adresse.
 */
export function WebsiteScan({ idPrefix, intro, fields, stand, onScanned }: Props) {
  const ctx = useToolContext();
  const { profile } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${CHECK_SLUG}`, parseCheckState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const standText = ready ? stand(saved) : null;

  async function scan() {
    setError(null);
    const industry = industryFor(profile, saved.form) || "other";
    const input = buildInput(profile, { ...saved.form, industry });
    const problem = formProblem(input);
    if (problem) return setError(problem);
    setBusy(true);
    let stop = () => {};
    try {
      if (!(await ctx.ensureEmail())) return;
      stop = ctx.startLoading(SCAN_STEPS);
      let outcome = await runCheck(input, () => {});
      // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
      if (!outcome.ok && outcome.code === "gate" && (await ctx.renewEmail())) outcome = await runCheck(input, () => {});
      if (!outcome.ok) return setError(outcome.message);
      set({ v: 1, phase: "result", step: 0, answers: {}, form: { ...saved.form, industry }, result: outcome.result });
      onScanned?.(outcome.result);
    } finally {
      stop();
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${idPrefix}-scan`} className="grid gap-4 rounded-xl border border-line p-4 md:p-5" data-testid="website-scan">
      <h4 id={`${idPrefix}-scan`}>Website-Scan</h4>
      <p className="text-sm text-muted-foreground">{intro}</p>
      {fields.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <ProfileFieldsForm idPrefix={idPrefix} fields={fields} />
        </div>
      )}
      {standText && (
        <p role="status" className="rounded-lg bg-surface px-4 py-3 text-sm" data-testid="scan-stand">
          {standText}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={standText ? "outline" : "default"} disabled={busy || !ready} onClick={() => void scan()}>
          {busy ? "Die Website wird gelesen …" : standText ? "Website noch einmal prüfen" : "Website prüfen"}
        </Button>
        <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
      </div>
      {error && (
        <p role="alert" className="text-destructive" data-testid="scan-fehler">
          {error}
        </p>
      )}
    </section>
  );
}
