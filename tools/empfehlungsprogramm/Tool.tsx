"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { DocView } from "@/components/tool/DocView";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chf, dateCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { toMarkdown, type DocumentModel } from "@/lib/export/model";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  modellBlocks,
  ANREDEN,
  ANREIZ_KEYS,
  EMPTY_STATE,
  KANAL_KEYS,
  LIMITS,
  MAX_NUMMER,
  PLATZHALTER_HAND,
  RICHTWERT_NOTE,
  SLUG,
  TEMPLATE_INFO,
  TEMPLATE_KEYS,
  anreizLabel,
  anreizZeile,
  anredeFromProfile,
  anredeLabel,
  ausgabeText,
  begriffe,
  begruendung,
  brauchtNummer,
  eingabeText,
  formIssue,
  hinweise,
  isAnrede,
  kanalLabel,
  kartenFilename,
  kartenInhalt,
  kontextOf,
  kundschaftOf,
  mechanik,
  parseNumber,
  parseState,
  programm,
  readWhatsappNumber,
  anerkennung,
  richtwertHinweis,
  templateLabel,
  toDocument,
  zielFor,
  zielHinweis,
  type Anrede,
  type AnreizKey,
  type FeldKey,
  type FormFields,
  type KanalKey,
  type Kontext,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const QR_VIEW = 176;
const FIELD_ID: Record<FeldKey, string> = {
  firma: "ep-firma",
  kundenwert: "ep-kundenwert",
  marge: "ep-marge",
  kundschaft: "ep-kundschaft",
  anreiz: "ep-anreiz",
  kanal: "ep-kanal",
  nummer: "ep-nummer",
  anrede: "ep-anrede-du",
};

function Intro({ verein }: { verein: boolean }) {
  return (
    <>
      <p>
        {verein
          ? "Gib an, was ein Mitglied im Jahr bezahlt und wie viel davon bleibt. Daraus entsteht ein Programm, mit dem Mitglieder Mitglieder werben: ein Anreiz als Anteil des Deckungsbeitrags, der Ablauf in fünf Schritten, drei Textvorlagen in Du und Sie, ein Einseiter und eine Karte A6 mit QR-Code zum Drucken."
          : "Gib an, was eine Kundin im Jahr bei dir ausgibt und wie viel davon bleibt. Daraus entsteht dein Empfehlungsprogramm: ein Anreiz als Anteil des Deckungsbeitrags, der Ablauf in fünf Schritten, drei Textvorlagen in Du und Sie, ein Einseiter und eine Karte A6 mit QR-Code zum Drucken."}
      </p>
      <p>
        Alles rechnet in deinem Browser, ohne KI. Deine Angaben und das Ergebnis gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können.
        Die Spanne für den Anreiz ist ein {RICHTWERT_NOTE}.
      </p>
    </>
  );
}

type Download = "pdf" | "docx" | "karte";
const DOWNLOADS: { id: Download; label: string; event: string }[] = [
  { id: "pdf", label: "Einseiter (PDF)", event: "export_pdf" },
  { id: "docx", label: "Word", event: "export_docx" },
  { id: "karte", label: "Karte A6 (PDF)", event: "export_pdf" },
];

function ResultView({
  form,
  kontext,
  headingRef,
  onEdit,
  onNew,
}: {
  form: FormFields;
  kontext: Kontext;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  const [anrede, setAnrede] = useState<Anrede>(isAnrede(form.anrede) ? form.anrede : "du");
  const [qr, setQr] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [busy, setBusy] = useState<Download | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = useMemo(() => programm(form, kontext, anrede), [form, kontext, anrede]);
  const ziel = useMemo(() => zielFor(form, kontext), [form, kontext]);
  const qrUrl = ziel?.url ?? null;
  const kanal: KanalKey = form.kanal === "" ? "whatsapp" : form.kanal;

  // Der QR-Code für die Anzeige entsteht im Browser; bei jedem neuen Ziel neu.
  useEffect(() => {
    let alive = true;
    setQr(null);
    setQrFailed(false);
    if (!qrUrl) return;
    import("./export")
      .then(({ qrDataUrl }) => qrDataUrl(qrUrl, QR_VIEW * 2))
      .then((data) => alive && setQr(data))
      .catch(() => alive && setQrFailed(true));
    return () => {
      alive = false;
    };
  }, [qrUrl]);

  if (!p) return null;
  const r = p.rechnung;
  const verein = kontext.verein;
  const doc = (): DocumentModel => ({ ...toDocument(p), datum: dateCH(new Date()) });
  const richtwert = richtwertHinweis(r);

  async function run(kind: Download) {
    if (!p) return;
    setError(null);
    setBusy(kind);
    try {
      const model = doc();
      if (kind === "pdf") {
        const [{ buildPdf }, { loadPdfFonts }] = await Promise.all([import("@/lib/export/pdf"), import("@/lib/export/fonts")]);
        downloadBytes(await buildPdf(model, await loadPdfFonts()), `${model.filename}.pdf`, "application/pdf");
      } else if (kind === "docx") {
        const { buildDocx } = await import("@/lib/export/docx");
        downloadBytes(await buildDocx(model), `${model.filename}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      } else {
        const [{ buildCardPdf }, { loadPdfFonts }] = await Promise.all([import("./export"), import("@/lib/export/fonts")]);
        const inhalt = kartenInhalt({ anrede, rechnung: p.rechnung, kontext, ziel });
        downloadBytes(await buildCardPdf(inhalt, await loadPdfFonts()), kartenFilename(kontext.firma), "application/pdf");
      }
    } catch {
      setError("Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResultCard
      title="Dein Empfehlungsprogramm"
      headingRef={headingRef}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <section aria-label="Anreiz" className="grid gap-2 rounded-xl border border-line bg-surface p-4" data-testid="anreiz-kasten">
        <p className="eyebrow">Anreiz</p>
        <p className="font-heading text-xl font-medium md:text-2xl" data-testid="anreiz-spanne">
          {anreizZeile(r)}
        </p>
        {begruendung(r, verein).map((text) => (
          <p key={text} className="text-sm">
            {text}
          </p>
        ))}
        {r.wirksam === "ideell" && (
          <ul aria-label="Formen der Anerkennung" className="grid list-disc gap-1 pl-5 text-sm" data-testid="anerkennung">
            {anerkennung(verein).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {richtwert && (
          <p className="text-sm text-muted-foreground" data-testid="anreiz-richtwert">
            {richtwert}
          </p>
        )}
      </section>

      <section aria-label="Was es dir bringt" className="grid gap-3" data-testid="modell">
        <DocView blocks={modellBlocks(r, kundschaftOf(form), verein).filter((b) => b.type !== "heading")} />
      </section>

      <section aria-label="Ablauf in fünf Schritten" className="grid gap-3">
        <h4 className="font-heading font-medium">Ablauf in fünf Schritten</h4>
        <ol aria-label="Mechanik" className="grid list-decimal gap-2 pl-5" data-testid="mechanik">
          {mechanik({ kanal, beide: r.beide, verein }).map((s) => (
            <li key={s.titel}>
              <span className="font-medium">{s.titel}.</span> {s.text}
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Textvorlagen" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-heading font-medium">Textvorlagen</h4>
          <div role="group" aria-label="Anrede der Vorlagen" className="flex gap-2">
            {ANREDEN.map((a) => (
              <Button
                key={a.value}
                type="button"
                size="sm"
                variant={anrede === a.value ? "default" : "outline"}
                aria-pressed={anrede === a.value}
                onClick={() => setAnrede(a.value)}
                data-testid={`anrede-${a.value}`}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Ersetze {PLATZHALTER_HAND}, bevor du den Text verschickst.
          {r.mitte !== null ? ` Der Betrag in den Texten ist die Mitte der Spanne, ${chf(r.mitte)}. Ändere ihn, wenn du einen anderen wählst.` : ""}
        </p>
        <ul className="grid gap-3" aria-label="Vorlagen">
          {TEMPLATE_KEYS.map((key) => (
            <li key={key} className="grid gap-2 rounded-xl border border-line bg-paper p-4" data-testid={`vorlage-${key}`}>
              <h5 className="font-medium">{templateLabel(key, verein)}</h5>
              <p className="whitespace-pre-wrap break-words text-sm">{p.texte[key]}</p>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={p.texte[key]} label={TEMPLATE_INFO[key].copyLabel} className="h-auto min-h-11 whitespace-normal py-2" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Karte A6" className="grid gap-3">
        <h4 className="font-heading font-medium">Karte A6 zum Drucken</h4>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div className="grid place-items-center rounded-xl border border-line bg-white p-2" style={{ width: QR_VIEW + 16, height: QR_VIEW + 16 }}>
            {qr ? (
              <Image src={qr} alt="QR-Code auf der Karte" width={QR_VIEW} height={QR_VIEW} unoptimized data-testid="qr-image" />
            ) : (
              <p role="status" className="p-2 text-center text-sm text-muted-foreground">
                {!qrUrl ? "Kein QR-Code ohne Ziel." : qrFailed ? "Der QR-Code konnte nicht erzeugt werden." : "QR-Code wird erzeugt."}
              </p>
            )}
          </div>
          <div className="grid gap-2 text-sm">
            <p data-testid="qr-hinweis">{zielHinweis(ziel)}</p>
            <p className="text-muted-foreground">
              Zwei Seiten, A6 hoch: vorn der Satz «{kartenInhalt({ anrede, rechnung: r, kontext, ziel }).titel}», der Anreiz ohne Betrag und der Code, hinten der Ablauf in drei Zeilen.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Hinweise" className="grid gap-2 rounded-xl bg-surface p-4 text-sm" data-testid="hinweise">
        <h4 className="font-heading font-medium">Hinweise</h4>
        <ul className="grid list-disc gap-1.5 pl-5">
          {hinweise({ kanal, verein }).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      <section aria-label="Downloads" className="grid gap-3">
        <h4 className="font-heading font-medium">Einseiter und Karte</h4>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton text={() => toMarkdown(doc())} label="Einseiter kopieren" />
          {DOWNLOADS.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => ctx.guardDownload(() => run(d.id))}
              data-testid={`download-${d.id}`}
              data-umami-event={d.event}
              data-umami-event-tool={ctx.slug}
            >
              {busy === d.id ? "Wird erstellt …" : d.label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Der Einseiter enthält Anreiz, Ablauf, Vorlagen in {anredeLabel(anrede)}-Form und Hinweise.
          {!ctx.email && " Für Dateien brauchen wir deine E-Mail-Adresse. Den Text kannst du immer kopieren."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
    </ResultCard>
  );
}

function EmpfehlungFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const kontext = useMemo(() => kontextOf(profile), [profile]);
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const { value: waNummer } = useLocalJson("mt:whatsapp-link", readWhatsappNumber);
  const verein = kontext.verein;
  const b = begriffe(verein);

  const [draft, setDraft] = useState<FormFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const kundenwertRef = useRef<HTMLInputElement>(null);
  const shouldFocus = useRef<"heading" | "kundenwert" | null>(null);

  // Nummer und Anrede kommen aus dem WhatsApp-Werkzeug und dem Firmenprofil, solange die Person nichts eingegeben hat (Harte Regel 10).
  const form: FormFields = draft ?? {
    ...saved.form,
    nummer: saved.form.nummer || waNummer || "",
    anrede: saved.form.anrede || (profileReady ? anredeFromProfile(profile) : ""),
  };
  const nummerVorbelegt = Boolean(waNummer) && form.nummer === waNummer;

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Der Entwurf lebt in den Feldern, der Speicher folgt mit etwas Verzögerung.
  useEffect(() => {
    if (draft === null) return;
    const f = savedRef.current.form;
    if (draft.kundenwert === f.kundenwert && draft.marge === f.marge && draft.anreiz === f.anreiz && draft.beide === f.beide && draft.kanal === f.kanal && draft.nummer === f.nummer && draft.anrede === f.anrede) return;
    const timer = setTimeout(() => set({ v: 1, phase: "edit", form: draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "kundenwert") kundenwertRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const edit = (patch: Partial<FormFields>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };

  async function start() {
    const issue = formIssue(form, kontext);
    if (issue) {
      setError(issue.text);
      document.getElementById(FIELD_ID[issue.feld])?.focus();
      return;
    }
    if (!isAnrede(form.anrede)) return;
    const clean: FormFields = { ...form, kundenwert: form.kundenwert.trim(), marge: form.marge.trim(), nummer: form.nummer.trim() };
    const p = programm(clean, kontext, form.anrede);
    if (!p) return;
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", form: clean });
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(clean, kontext), ausgabe: ausgabeText(p) });
    } finally {
      setBusy(false);
    }
  }

  const result = ready && profileReady && saved.phase === "result" && isAnrede(saved.form.anrede) ? programm(saved.form, kontext, saved.form.anrede) : null;
  if (result) {
    return (
      <ResultView
        form={saved.form}
        kontext={kontext}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "kundenwert";
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "kundenwert";
          setError(null);
          setDraft(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const disabled = !ready || !profileReady || busy;
  const kw = parseNumber(form.kundenwert);
  const marge = parseNumber(form.marge);
  const db = kw !== null && marge !== null && kw > 0 && marge > 0 ? Math.round(kw * marge) / 100 : null;

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!ready || !profileReady}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro verein={verein} />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={disabled}>
        <legend className="px-2 font-heading font-semibold">{b.legende}</legend>
        <div className="md:col-span-2">
          <ProfileFieldsForm idPrefix="ep" fields={["organisationstyp"]} />
        </div>
        <ProfileFieldsForm idPrefix="ep" fields={["firma", "website"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          {verein ? "Name des Vereins und Website" : "Firma und Website"} speichern wir in deinem Firmenprofil, in deinem Browser. Die Website steht im QR-Code auf der Karte, wenn keine WhatsApp-Nummer da ist.
        </p>
      </fieldset>

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Dein Programm</legend>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ep-kundenwert">{b.wertFeld}</Label>
            <Input
              id="ep-kundenwert"
              ref={kundenwertRef}
              type="number"
              inputMode="numeric"
              min={LIMITS.kundenwert.min}
              max={LIMITS.kundenwert.max}
              step={1}
              value={form.kundenwert}
              onChange={(e) => edit({ kundenwert: e.target.value })}
              aria-describedby="ep-kundenwert-help ep-error"
              required
            />
            <p id="ep-kundenwert-help" className="text-sm text-muted-foreground">
              {b.wertHilfe} {chf(LIMITS.kundenwert.min)} bis {chf(LIMITS.kundenwert.max)}.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ep-marge">Marge in Prozent</Label>
            <Input
              id="ep-marge"
              type="number"
              inputMode="decimal"
              min={LIMITS.marge.min}
              max={LIMITS.marge.max}
              step={0.5}
              value={form.marge}
              onChange={(e) => edit({ marge: e.target.value })}
              aria-describedby="ep-marge-help ep-db ep-error"
              required
            />
            <p id="ep-marge-help" className="text-sm text-muted-foreground">
              {b.margeHilfe} {LIMITS.marge.min} bis {LIMITS.marge.max} %.
            </p>
            <p id="ep-db" aria-live="polite" className="mono text-sm" data-testid="ep-db">
              {db !== null ? `Deckungsbeitrag: ${chf(db)} pro Jahr.` : "Der Deckungsbeitrag erscheint, sobald beide Zahlen da sind."}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ep-kundschaft">{b.kundschaftFeld}</Label>
            <Input
              id="ep-kundschaft"
              type="number"
              inputMode="numeric"
              min={LIMITS.kundschaft.min}
              max={LIMITS.kundschaft.max}
              step={1}
              value={form.kundschaft}
              onChange={(e) => edit({ kundschaft: e.target.value })}
              aria-describedby="ep-kundschaft-help ep-error"
            />
            <p id="ep-kundschaft-help" className="text-sm text-muted-foreground">
              {b.kundschaftHilfe}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ep-anreiz">Anreiz</Label>
            <select id="ep-anreiz" className={selectClass} value={form.anreiz} onChange={(e) => edit({ anreiz: e.target.value as AnreizKey | "" })} required>
              <option value="">Bitte wählen</option>
              {ANREIZ_KEYS.map((k) => (
                <option key={k} value={k}>
                  {anreizLabel(k, verein)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ep-kanal">Kanal der Ansprache</Label>
            <select id="ep-kanal" className={selectClass} value={form.kanal} onChange={(e) => edit({ kanal: e.target.value as KanalKey | "" })} required>
              <option value="">Bitte wählen</option>
              {KANAL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {kanalLabel(k, verein)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-h-11 items-start gap-3 md:col-span-2">
            <Checkbox id="ep-beide" aria-label="Beide Seiten belohnen" className="mt-1 size-6" checked={form.beide} onCheckedChange={(v) => edit({ beide: v === true })} aria-describedby="ep-beide-help" />
            <div className="grid gap-1">
              <label htmlFor="ep-beide" className="cursor-pointer">
                Beide Seiten belohnen
              </label>
              <p id="ep-beide-help" className="text-sm text-muted-foreground">
                Auch die empfohlene Person bekommt etwas. Dann erhält jede Seite die Hälfte der Spanne.
              </p>
            </div>
          </div>

          {brauchtNummer(form.kanal) && (
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="ep-nummer">WhatsApp-Nummer</Label>
              <Input
                id="ep-nummer"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="079 123 45 67"
                maxLength={MAX_NUMMER}
                value={form.nummer}
                onChange={(e) => edit({ nummer: e.target.value })}
                aria-describedby="ep-nummer-help ep-error"
              />
              <p id="ep-nummer-help" className="text-sm text-muted-foreground">
                {nummerVorbelegt ? "Vorbelegt aus deinem WhatsApp-Link. " : ""}Freiwillig, Schweizer Nummer. Mit Nummer führt der QR-Code auf der Karte in einen WhatsApp-Chat, ohne Nummer auf deine Website.
              </p>
            </div>
          )}
        </div>
      </fieldset>

      <fieldset className="grid gap-2" disabled={disabled}>
        <legend className="mb-1 font-medium">{b.anredeLegende}</legend>
        <div className="flex flex-wrap gap-3">
          {ANREDEN.map((a) => (
            <label
              key={a.value}
              htmlFor={`ep-anrede-${a.value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
            >
              <input
                id={`ep-anrede-${a.value}`}
                type="radio"
                name="ep-anrede"
                value={a.value}
                checked={form.anrede === a.value}
                onChange={() => edit({ anrede: a.value })}
                className="size-5 accent-ink"
              />
              {a.label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{b.anredeHilfe}</p>
      </fieldset>

      <p id="ep-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled}>
          Programm entwerfen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert etwa vier Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <EmpfehlungFlow />
    </ToolShell>
  );
}
