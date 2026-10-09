"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
import { forgetGateEmail } from "@/lib/access-client";
import { chf } from "@/lib/ch";
import { dateCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { PROFILE_EXPIRED_KEY, isProfileEmpty, profileValidUntil, type Profile } from "@/lib/profile";
import { canPersist, removeLocal } from "@/lib/storage";
import { useLocalRaw } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { ProfilScan } from "./ProfilScan";

type Notice = { kind: "ok" | "error"; text: string } | null;

/** Was die Werkzeuge ins Profil geschrieben haben, mit dem Werkzeug, das die Angabe füllt. */
export function summaryRows(p: Profile): { label: string; value: string; slug: string }[] {
  const names = (list?: { name?: unknown }[]) => (list ?? []).map((x) => String(x.name ?? "")).filter(Boolean).join(", ");
  const rows: { label: string; value: string | undefined; slug: string }[] = [
    { label: "Zielgruppen", value: names(p.zielgruppen), slug: "zielgruppen-segmente" },
    { label: "Primärsegment", value: p.primaersegment, slug: "zielgruppen-segmente" },
    { label: "Personas", value: names(p.personas), slug: "persona" },
    { label: "Positionierung", value: p.positionierung, slug: "positionierung" },
    { label: "Markenwerte", value: p.marke?.werte?.join(", "), slug: "markenplattform" },
    { label: "Kanäle", value: p.kanaele?.length ? `${p.kanaele.length} Kanäle` : undefined, slug: "kanalstrategie" },
    { label: "Marketingbudget pro Jahr", value: p.budgetJahr !== undefined ? chf(p.budgetJahr) : undefined, slug: "budget-planer" },
    { label: "Themensäulen", value: p.contentSaeulen?.length ? `${p.contentSaeulen.length} Säulen` : undefined, slug: "inhalte-saeulen" },
  ];
  return rows.map((r) => ({ label: r.label, value: r.value?.trim() ? r.value : "noch leer", slug: r.slug }));
}

/** Die fünf Angaben, die fast jedes Werkzeug braucht. */
const CORE: (keyof Profile)[] = ["firma", "website", "branche", "ort", "kanton"];

export function ProfilEditor() {
  const { profile, savedAt, clearEverything, exportJson, importFrom } = useProfile();
  const [notice, setNotice] = useState<Notice>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [persistent, setPersistent] = useState(true);
  const expiredNotice = useLocalRaw(PROFILE_EXPIRED_KEY) === "1";
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setPersistent(canPersist()), []);

  const filled = CORE.filter((k) => String(profile[k] ?? "").trim() !== "").length;
  const rows = summaryRows(profile);

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
    <div className="mt-10 grid gap-10">
      {!persistent && (
        <p role="alert" className="max-w-2xl rounded-xl border border-ink p-4">
          Dein Browser speichert nichts dauerhaft (zum Beispiel im privaten Fenster). Das Profil bleibt nur, bis du die Seite neu lädst. Sichere es unten als Datei.
        </p>
      )}
      {expiredNotice && (
        <div role="status" className="flex max-w-2xl flex-wrap items-center gap-3 rounded-xl border border-line p-4">
          <span>Dein Profil war länger als zwölf Monate ungenutzt und wurde gelöscht.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => removeLocal(PROFILE_EXPIRED_KEY)}>
            Verstanden
          </Button>
        </div>
      )}

      <section aria-labelledby="betrieb" className="grid max-w-2xl gap-6">
        <div className="grid gap-3">
          <h2 id="betrieb">Dein Betrieb</h2>
          <div className="flex items-center gap-3" data-testid="profil-fortschritt">
            <div
              role="meter"
              aria-label="Angaben im Profil"
              aria-valuemin={0}
              aria-valuemax={CORE.length}
              aria-valuenow={filled}
              aria-valuetext={`${filled} von ${CORE.length} Angaben`}
              className="h-2 w-40 overflow-hidden rounded-full bg-line"
            >
              <div className="h-full bg-ink" style={{ width: `${(filled / CORE.length) * 100}%` }} />
            </div>
            <span className="text-sm text-muted-foreground">
              {filled} von {CORE.length} Angaben
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Die Werkzeuge fragen diese Angaben nie ein zweites Mal.
            {savedAt && !isProfileEmpty(profile) ? ` Das Profil gilt bis ${dateCH(profileValidUntil(savedAt))} und verlängert sich mit jeder Nutzung.` : ""}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <ProfileFieldsForm fields={["website", "firma"]} />
        </div>
        <ProfilScan />
        <ProfileFieldsForm fields={["branche"]} brancheChips />
        <div className="grid gap-5 md:grid-cols-2">
          <ProfileFieldsForm fields={["ort", "kanton"]} />
        </div>

        <details className="rounded-xl border border-line p-4" open={Boolean(profile.rechtsform || profile.groesse)}>
          <summary className="cursor-pointer font-medium">Mehr Angaben: Rechtsform und Grösse</summary>
          <div className="mt-5 grid gap-5">
            <ProfileFieldsForm fields={["rechtsform", "groesse"]} />
          </div>
        </details>
        <p className="text-sm text-muted-foreground">Änderungen werden sofort in deinem Browser gespeichert.</p>
      </section>

      <section aria-labelledby="aus-werkzeugen" className="max-w-2xl">
        <h2 id="aus-werkzeugen">Das haben deine Werkzeuge gemerkt</h2>
        <p className="mt-2 text-muted-foreground">Diese Angaben tragen die Werkzeuge selbst ein. Was noch fehlt, füllst du mit dem Werkzeug daneben.</p>
        <ul className="mt-6 flex flex-wrap gap-3">
          {rows.map((r) =>
            r.value === "noch leer" ? (
              <li key={r.label}>
                <Link href={`/tools/${r.slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line-strong px-4 py-2 text-muted-foreground hover:border-ink hover:text-ink">
                  {r.label}
                  <span className="text-sm">ausfüllen</span>
                </Link>
              </li>
            ) : (
              <li key={r.label} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-ink px-4 py-2 text-paper">
                <span aria-hidden="true">✓</span>
                <span className="font-medium">{r.label}:</span>
                <span className="truncate">{r.value}</span>
              </li>
            ),
          )}
        </ul>
      </section>

      <section aria-labelledby="sichern" className="max-w-2xl">
        <h2 id="sichern">Sicherung</h2>
        <p className="mt-2 text-muted-foreground">
          Dein Profil liegt nur in diesem Browser. Manche Browser räumen lokale Daten nach einigen Tagen ohne Besuch auf. Wer das Profil behalten will, sichert es als Datei.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" variant="outline" size="lg" onClick={doExport} disabled={isProfileEmpty(profile)}>
            Profil exportieren (JSON)
          </Button>
        </div>
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground">Gesicherte Datei laden</summary>
          <div className="mt-3">
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Profil importieren
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" tabIndex={-1} aria-label="Profil-Datei auswählen" onChange={onFile} />
          </div>
        </details>
        {notice && (
          <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-4 ${notice.kind === "error" ? "text-destructive" : ""}`}>
            {notice.text}
          </p>
        )}
        <p className="mt-10 text-sm text-muted-foreground">
          Alles zurücksetzen?{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => setConfirmDelete(true)}>
            Alles löschen
          </button>
        </p>
      </section>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alles löschen?</DialogTitle>
            <DialogDescription>
              Das löscht dein Firmenprofil, deine Zwischenstände, deine Merkliste und die gemerkte E-Mail-Adresse in diesem Browser. Beim nächsten Ergebnis fragen wir wieder nach einer Adresse. Das lässt sich nicht rückgängig machen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                clearEverything();
                void forgetGateEmail(); // auch das Cookie: Das nächste Ergebnis fragt wieder nach einer Adresse
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
