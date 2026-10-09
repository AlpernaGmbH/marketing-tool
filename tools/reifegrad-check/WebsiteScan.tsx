"use client";

import { useState } from "react";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { runCheck } from "@/lib/check/client";
import { dateCH } from "@/lib/ch";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { SLUG as CHECK_SLUG, buildInput, formProblem, industryFor, parseCheckState } from "@/tools/digitaler-auftritt-check/logic";
import { checkInfo } from "./logic";

const SCAN_STEPS = ["Website lesen", "Google-Profil und Kanäle suchen", "Auswerten"];

/**
 * Der Website-Scan des Reifegrad-Checks: derselbe Marketing-Check wie auf seiner eigenen Seite, mit Firma, Branche und Website aus dem
 * Firmenprofil. Das Ergebnis liegt unter dem Schlüssel des Marketing-Checks; beide Werkzeuge nutzen es, und es muss nur einmal laufen.
 * Ohne Scan sind «Auftritt» und «Inhalte» nicht bewertet.
 */
export function WebsiteScan() {
  const ctx = useToolContext();
  const { profile } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${CHECK_SLUG}`, parseCheckState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = checkInfo(saved);

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
    } finally {
      stop();
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="rg-scan" className="grid gap-4 rounded-xl border border-line p-4 md:p-5" data-testid="website-scan">
      <h4 id="rg-scan">Website-Scan</h4>
      <p className="text-sm text-muted-foreground">
        Auftritt und Inhalte liest das Werkzeug aus deiner Website, statt dich zu fragen. Dafür läuft der Marketing-Check über deine Startseite. Die Adresse deiner
        Website geht an unseren Server, nicht deine E-Mail-Adresse. Ohne Scan sind diese beiden Dimensionen nicht bewertet.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <ProfileFieldsForm idPrefix="rg" fields={["firma", "website"]} />
      </div>
      {ready && info && (
        <p role="status" className="rounded-lg bg-surface px-4 py-3 text-sm" data-testid="scan-stand">
          Gespeicherter Scan{info.checkedAt ? ` vom ${dateCH(info.checkedAt)}` : ""}: Marketing-Check {info.score} von 100. Er zählt für Auftritt, Inhalte und eine Frage in
          Steuerung.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant={info ? "outline" : "default"} disabled={busy || !ready} onClick={() => void scan()}>
          {busy ? "Die Website wird gelesen …" : info ? "Website noch einmal prüfen" : "Website prüfen"}
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
