"use client";

import { useState } from "react";
import { useOptionalToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GENERATE_FAIL_MESSAGES, requestGenerate } from "@/lib/generate-client";
import { SCAN_FIELDS, profilScanGenerator, scanInput, scanPatch, scanProposals, type ScanField, type ScanProposal } from "@/lib/profile-scan";
import { readWebsite } from "@/lib/read-client";
import { useProfile } from "@/lib/use-profile";

/**
 * «Aus Website ausfüllen»: liest die Startseite, die KI schlägt Firma, Branche, Ort, Kanton und eine Kurzbeschreibung vor, der Besucher
 * bestätigt in einer Vorschau. Vorhandene Einträge werden nie still überschrieben (nicht vorgewählt). Ohne E-Mail-Fenster der Seite
 * (ToolShell) zeigt sich nichts. Die Adresse der Website steht im Feld «Website» darüber.
 */
export function ProfilScan() {
  const ctx = useOptionalToolContext();
  const { profile, update } = useProfile();
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ScanProposal[] | null>(null);
  const [chosen, setChosen] = useState<Set<ScanField>>(new Set());
  if (!ctx) return null;
  const shell = ctx;

  async function scan() {
    setError(null);
    const website = profile.website?.trim() ?? "";
    if (!website) return setError("Trag zuerst deine Website ein.");
    if (!(await shell.ensureEmail())) return;
    const stop = shell.startLoading(["Website lesen", "Angaben erkennen", "Angaben prüfen"]);
    try {
      let read = await readWebsite(website);
      // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
      if (!read.ok && read.reason === "gate") {
        if (!(await shell.renewEmail())) return;
        read = await readWebsite(website);
      }
      if (!read.ok) return setError(read.message);

      const input = scanInput(read.page);
      let out = await requestGenerate(profilScanGenerator, input);
      if (!out.ok && out.reason === "gate") {
        if (!(await shell.renewEmail())) return;
        out = await requestGenerate(profilScanGenerator, input);
      }
      if (!out.ok) return setError(GENERATE_FAIL_MESSAGES[out.reason]);

      const list = scanProposals(out.output, profile);
      if (list.length === 0) return setError("Auf der Startseite haben wir nichts gefunden, was dein Profil ergänzt.");
      setProposals(list);
      setChosen(new Set(list.filter((p) => p.preselected).map((p) => p.key)));
    } finally {
      stop();
    }
  }

  function toggle(key: ScanField) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function apply() {
    if (!proposals) return;
    update(scanPatch(proposals, chosen));
    setProposals(null);
  }

  return (
    <div className="grid gap-2 rounded-xl border border-line p-4" data-testid="profil-scan">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void scan()}>
          Aus Website ausfüllen
        </Button>
        <span className="text-sm text-muted-foreground">Wir lesen deine Startseite und schlagen Firma, Branche, Ort und eine Kurzbeschreibung vor.</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Dafür geht der Text deiner Startseite an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse. Unser Server speichert ihn nicht. Du bestätigst jede Angabe,
        bevor sie ins Profil kommt.
      </p>
      <p role="alert" className="min-h-5 text-sm text-destructive">
        {error}
      </p>

      <Dialog open={proposals !== null} onOpenChange={(open) => !open && setProposals(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stimmt das?</DialogTitle>
            <DialogDescription>Das haben wir auf deiner Startseite gefunden. Hake an, was ins Profil soll. Prüfe jede Angabe, sie stammt von einer KI.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-3">
            {proposals?.map((p) => (
              <li key={p.key}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-[:checked]:border-ink">
                  <input type="checkbox" className="mt-1 size-5 accent-ink" checked={chosen.has(p.key)} onChange={() => toggle(p.key)} />
                  <span className="grid gap-1">
                    <span className="font-medium">{SCAN_FIELDS.find((f) => f.key === p.key)?.label}</span>
                    <span>{p.proposed}</span>
                    {p.current && <span className="text-sm text-muted-foreground">Bisher im Profil: {p.current}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposals(null)}>
              Abbrechen
            </Button>
            <Button onClick={apply} disabled={chosen.size === 0}>
              Übernehmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
