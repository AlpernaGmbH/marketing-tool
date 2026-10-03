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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KANTONE, chf } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { GROESSEN, RECHTSFORMEN, isProfileEmpty, type Profile, type ProfileKey } from "@/lib/profile";
import { useProfile } from "@/lib/use-profile";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
  const { profile, ready, update, clearEverything, exportJson, importFrom } = useProfile();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const type = profile.organisationstyp ?? "kmu";
  const set = (key: ProfileKey, value: string) => update({ [key]: value.trim() === "" ? undefined : value });

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

        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium">Ich bin</legend>
          <div className="flex flex-wrap gap-3">
            {(
              [
                ["kmu", "KMU oder Selbständige"],
                ["verein", "Verein"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
              >
                <input
                  type="radio"
                  name="organisationstyp"
                  value={value}
                  checked={ready && type === value}
                  onChange={() => update({ organisationstyp: value, groesse: undefined })}
                  className="size-5 accent-ink"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="p-firma">{type === "verein" ? "Name des Vereins" : "Firma"}</Label>
          <Input id="p-firma" autoComplete="organization" value={profile.firma ?? ""} onChange={(e) => set("firma", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-branche">{type === "verein" ? "Tätigkeit des Vereins" : "Branche"}</Label>
          <Input id="p-branche" value={profile.branche ?? ""} onChange={(e) => set("branche", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-rechtsform">Rechtsform</Label>
          <select id="p-rechtsform" className={selectClass} value={profile.rechtsform ?? ""} onChange={(e) => set("rechtsform", e.target.value)}>
            <option value="">Bitte wählen</option>
            {RECHTSFORMEN.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-ort">Ort</Label>
          <Input id="p-ort" autoComplete="address-level2" value={profile.ort ?? ""} onChange={(e) => set("ort", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-kanton">Kanton</Label>
          <select id="p-kanton" className={selectClass} value={profile.kanton ?? ""} onChange={(e) => set("kanton", e.target.value)}>
            <option value="">Bitte wählen</option>
            {KANTONE.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-groesse">Grösse</Label>
          <select id="p-groesse" className={selectClass} value={profile.groesse ?? ""} onChange={(e) => set("groesse", e.target.value)}>
            <option value="">Bitte wählen</option>
            {GROESSEN[type].map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
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
