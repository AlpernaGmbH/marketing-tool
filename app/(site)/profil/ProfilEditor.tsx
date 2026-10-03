"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { chf } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { isProfileEmpty, type Profile } from "@/lib/profile";
import { useProfile } from "@/lib/use-profile";

type Notice = { kind: "ok" | "error"; text: string } | null;

/** Kurzfassung dessen, was die Werkzeuge ins Profil geschrieben haben. */
export function summaryRows(p: Profile): { label: string; value: string }[] {
  const names = (list?: { name?: unknown }[]) => (list ?? []).map((x) => String(x.name ?? "")).filter(Boolean).join(", ");
  const rows: { label: string; value: string | undefined }[] = [
    { label: "Zielgruppen", value: names(p.zielgruppen) },
    { label: "Primärsegment", value: p.primaersegment },
    { label: "Personas", value: names(p.personas) },
    { label: "Positionierung", value: p.positionierung },
    { label: "Markenwerte", value: p.marke?.werte?.join(", ") },
    { label: "Kanäle", value: p.kanaele?.length ? `${p.kanaele.length} Kanäle` : undefined },
    { label: "Marketingbudget pro Jahr", value: p.budgetJahr !== undefined ? chf(p.budgetJahr) : undefined },
    { label: "Content-Säulen", value: p.contentSaeulen?.length ? `${p.contentSaeulen.length} Säulen` : undefined },
  ];
  return rows.map((r) => ({ label: r.label, value: r.value?.trim() ? r.value : "noch leer" }));
}

export function ProfilEditor() {
  const { profile, clearEverything, exportJson, importFrom } = useProfile();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    const { text, filename } = exportJson();
    downloadBytes(new TextEncoder().encode(text), filename, "application/json");
    setNotice({ kind: "ok", text: "Dein Profil ist als Datei gespeichert. Bewahre sie gut auf." });
  }

  function applyImport(text: string) {
    const result = importFrom(text);
    setPendingImport(null);
    setNotice(
      result.ok
        ? {
            kind: "ok",
            text: `Profil geladen.${result.ignored > 0 ? ` ${result.ignored} unbekannte oder ungültige Angaben wurden nicht übernommen.` : ""}`,
          }
        : { kind: "error", text: result.error },
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setNotice({ kind: "error", text: "Die Datei konnte nicht gelesen werden." });
    }
    // Ein vorhandenes Profil nicht ohne Rückfrage überschreiben.
    if (!isProfileEmpty(profile)) setPendingImport(text);
    else applyImport(text);
  }

  return (
    <div className="mt-10 grid gap-12">
      <section aria-labelledby="grunddaten" className="grid max-w-2xl gap-6">
        <h2 id="grunddaten">Grunddaten</h2>

        <ProfileFieldsForm fields={["organisationstyp", "firma", "branche", "rechtsform", "ort", "kanton", "groesse"]} />
        <p className="text-sm text-muted-foreground">Änderungen werden sofort in deinem Browser gespeichert.</p>
      </section>

      <section aria-labelledby="aus-werkzeugen" className="max-w-2xl">
        <h2 id="aus-werkzeugen">Aus deinen Werkzeugen</h2>
        <p className="mt-2 text-muted-foreground">Diese Angaben tragen die Werkzeuge selbst ein, sobald du sie benutzt hast.</p>
        <dl className="mt-6 grid gap-4">
          {summaryRows(profile).map((r) => (
            <div key={r.label} className="grid gap-1 border-b border-line pb-4 sm:grid-cols-3">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="sm:col-span-2">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="sichern" className="max-w-2xl">
        <h2 id="sichern">Sichern, laden, löschen</h2>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="outline" size="lg" onClick={doExport} disabled={isProfileEmpty(profile)}>
            Profil exportieren (JSON)
          </Button>
          <Button type="button" variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
            Profil importieren
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Profil-Datei auswählen" onChange={onFile} />
          <Button type="button" variant="ghost" size="lg" onClick={() => setConfirmDelete(true)}>
            Alles löschen
          </Button>
        </div>
        {notice && (
          <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 ${notice.kind === "error" ? "text-destructive" : ""}`}>
            {notice.text}
          </p>
        )}
      </section>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alles löschen?</DialogTitle>
            <DialogDescription>
              Das löscht dein Firmenprofil, deine Zwischenstände und deine Merkliste in diesem Browser. Das lässt sich nicht rückgängig machen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                clearEverything();
                setConfirmDelete(false);
                setNotice({ kind: "ok", text: "Alles gelöscht." });
              }}
            >
              Alles löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingImport !== null} onOpenChange={(o) => !o && setPendingImport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profil ersetzen?</DialogTitle>
            <DialogDescription>Dein aktuelles Firmenprofil wird durch die Datei ersetzt.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingImport(null)}>
              Abbrechen
            </Button>
            <Button onClick={() => pendingImport !== null && applyImport(pendingImport)}>Ersetzen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
