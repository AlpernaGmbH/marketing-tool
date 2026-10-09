"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { FormatCards, PreviewTabs } from "@/components/tool/FormatPicker";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { numberCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { IMAGE_FORMATS, imageFormat, loadCanvasFonts, loadImageFile, normalizeHex, type ImageFormat, type ImageFormatKey, type LoadedImage } from "@/lib/export/png";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  AUFFORDERUNGEN,
  COLOR_HINT,
  EMPTY_STATE,
  FARBEN,
  LIMITS,
  LOGO_HINWEIS,
  PREIS_HINWEIS,
  SLUG,
  TEMPLATES,
  accentFor,
  ausgabeText,
  buildOutput,
  describeOffer,
  eingabeText,
  formOf,
  hinweise,
  isFarbeKey,
  kontaktVorschlag,
  modelOf,
  orderFormats,
  parseState,
  pngFilename,
  previewModel,
  stateOf,
  styleHints,
  todayIso,
  validate,
  zipName,
  type FieldKey,
  type Form,
  type OfferInput,
  type OfferModel,
  type OfferState,
  type Output,
  type Problem,
} from "./logic";
import { buildZip, paintCanvas, renderFormat } from "./render";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
/** Lange Knopftexte brechen um, damit sie bei 375 px nicht über den Rand laufen. */
const WRAP_BUTTON = "h-auto min-h-11 whitespace-normal py-2 text-center";
const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal.";
/** Meldungen zu diesen Feldern erscheinen schon beim Tippen, die übrigen nach dem ersten Klick auf den Knopf. */
const LIVE_FIELDS: readonly FieldKey[] = ["preis", "frueher", "gueltigBis", "hex", "kontakt"];
const FIELD_ID: Record<FieldKey, string> = {
  firma: "ag-firma",
  titel: "ag-titel",
  angebot: "ag-angebot",
  preis: "ag-preis",
  frueher: "ag-frueher",
  gueltigBis: "ag-gueltig",
  aufforderung: "ag-aufforderung",
  kontakt: "ag-kontakt",
  hex: "ag-hex",
  formate: "ag-formate",
};

function Intro() {
  return (
    <>
      <p>
        Trag Titel und Angebot ein, auf Wunsch Preis, früheren Preis und ein Datum, und wähle Vorlage, Farbe und Formate. Die Vorschau zeigt die Grafik beim Tippen.
        Mit «Grafiken erstellen» bekommst du je Format ein PNG und alle zusammen als ZIP.
      </p>
      <p>
        Die Grafiken entstehen in deinem Browser. Dein Logo und deine Bilder verlassen ihn nicht. Dein Ergebnis geht zusammen mit den Angaben und deiner E-Mail-Adresse an
        Alperna, damit wir dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

/** Canvas, das sich bei jeder Änderung neu zeichnet. Die Pixelgrösse ist die des Formats, die Anzeige skaliert per CSS. */
function OfferCanvas({
  model,
  format,
  logo,
  fontsReady,
  label,
  describedBy,
  testId,
}: {
  model: OfferModel;
  format: ImageFormat;
  logo: LoadedImage | null;
  fontsReady: boolean;
  label: string;
  describedBy?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const signature = JSON.stringify(model);
  useEffect(() => {
    if (ref.current) paintCanvas(ref.current, model, format, logo);
    // model steckt in signature; format und logo ändern sich selten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, format.key, logo, fontsReady]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      aria-describedby={describedBy}
      width={format.width}
      height={format.height}
      data-testid={testId}
      style={{ aspectRatio: `${format.width} / ${format.height}` }}
      className="h-auto w-full max-w-full rounded-lg border border-line bg-white"
    />
  );
}

function ResultView({
  state,
  output,
  model,
  logo,
  fontsReady,
  onEdit,
  onNew,
  headingRef,
}: {
  state: OfferState;
  output: Output;
  model: OfferModel;
  logo: LoadedImage | null;
  fontsReady: boolean;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const ctx = useToolContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keys = output.dateien.map((d) => d.key);

  async function run(id: string, action: () => Promise<void>) {
    setError(null);
    setBusy(id);
    try {
      await action();
    } catch {
      setError(DOWNLOAD_ERROR);
    } finally {
      setBusy(null);
    }
  }

  const downloadPng = (key: ImageFormatKey) =>
    ctx.guardDownload(() =>
      run(key, async () => {
        downloadBytes(await renderFormat(model, key, logo), pngFilename(output.titel, key), "image/png");
      }),
    );

  const downloadZip = () =>
    ctx.guardDownload(() =>
      run("zip", async () => {
        const files: { name: string; bytes: Uint8Array }[] = [];
        for (const d of output.dateien) files.push({ name: d.datei, bytes: await renderFormat(model, d.key, logo) });
        downloadBytes(await buildZip(files), zipName(output.titel), "application/zip");
      }),
    );

  const alt = describeOffer(model);

  return (
    <ResultCard
      title="Deine Angebotsgrafik"
      headingRef={headingRef}
      actions={
        <>
          <Button
            type="button"
            className={WRAP_BUTTON}
            disabled={busy !== null}
            onClick={downloadZip}
            data-testid="ag-zip"
            data-umami-event="export_zip"
            data-umami-event-tool={SLUG}
          >
            {busy === "zip" ? "ZIP wird erstellt …" : "Alle als ZIP herunterladen"}
          </Button>
          <CopyButton text={alt} label="Alternativtext kopieren" className={WRAP_BUTTON} />
          <Button type="button" variant="outline" onClick={onEdit}>
            Angaben ändern
          </Button>
          <Button type="button" variant="ghost" onClick={onNew}>
            Neu beginnen
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        {output.dateien.length} {output.dateien.length === 1 ? "Format" : "Formate"}
        {output.firma ? ` für ${output.firma}` : ""}. Jedes PNG hat die Pixelmasse des Formats; das ZIP enthält alle gewählten Formate.
      </p>
      {state.logo && !logo && (
        <p role="status" className="rounded-xl bg-surface p-4 text-sm" data-testid="ag-logo-neu">
          Logo neu wählen: Dein Logo wird nicht gespeichert. Die Grafiken zeigen darum den Namen deiner Firma. Wähle das Logo unter «Angaben ändern» noch einmal.
        </p>
      )}
      <ul aria-label="Grafiken" className="grid gap-6 sm:grid-cols-2" data-testid="ag-grafiken">
        {output.dateien.map((d) => (
          <li key={d.key} className="grid content-start gap-3" data-testid={`ag-grafik-${d.key}`}>
            <OfferCanvas model={model} format={imageFormat(d.key)} logo={logo} fontsReady={fontsReady} label={`Grafik ${d.label}`} describedBy={`ag-beschreibung-${d.key}`} />
            <p id={`ag-beschreibung-${d.key}`} className="sr-only">
              {alt}
            </p>
            <p className="mono text-sm text-muted-foreground">
              {d.width} × {d.height} Pixel
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                className={WRAP_BUTTON}
                disabled={busy !== null}
                onClick={() => downloadPng(d.key)}
                data-testid={`ag-png-${d.key}`}
                data-umami-event="export_png"
                data-umami-event-tool={SLUG}
              >
                {busy === d.key ? "PNG wird erstellt …" : `PNG herunterladen: ${d.label}`}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <section aria-labelledby="ag-hinweise" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="ag-hinweise" className="font-heading text-base font-semibold">
          Vor dem Veröffentlichen
        </h4>
        <ul className="grid gap-2 text-sm text-muted-foreground" aria-label="Hinweise zum Veröffentlichen">
          {hinweise(keys).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {busy === "zip" ? "Das ZIP wird erstellt." : "Das PNG wird erstellt."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </ResultCard>
  );
}

function AngebotFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const live = ready && profileReady;
  const vorschlag = kontaktVorschlag(profile);
  const firma = profile.firma?.trim() ?? "";

  const [draft, setDraft] = useState<Form | null>(null);
  const [logo, setLogo] = useState<LoadedImage | null>(null);
  /** null: noch nicht angefasst, dann gilt der gespeicherte Stand. */
  const [logoUsed, setLogoUsed] = useState<boolean | null>(null);
  const [logoProblem, setLogoProblem] = useState<string | null>(null);
  const [logoKey, setLogoKey] = useState(0);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [previewKey, setPreviewKey] = useState<ImageFormatKey>("feed");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef<"heading" | "titel" | null>(null);

  const form: Form = draft ?? formOf(saved, vorschlag);
  const heute = todayIso(new Date());
  const hasLogo = logo !== null;
  const input: OfferInput = { ...form, firma, logo: hasLogo };

  // Schriften einmal laden, danach neu zeichnen.
  useEffect(() => {
    let alive = true;
    void loadCanvasFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Das Logo-Bild frei geben, wenn die Seite geschlossen wird.
  const logoRef = useRef<LoadedImage | null>(null);
  useEffect(() => {
    logoRef.current = logo;
  }, [logo]);
  useEffect(() => () => logoRef.current?.close(), []);

  // Der Entwurf lebt in den Feldern, der Speicher folgt mit etwas Verzögerung (nicht bei jedem Tastendruck).
  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);
  const logoFlag = logoUsed ?? saved.logo;
  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => set(stateOf({ ...savedRef.current, phase: "edit" }, draft, logoFlag)), 500);
    return () => clearTimeout(timer);
  }, [draft, logoFlag, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "titel") document.getElementById("ag-titel")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const problems = validate(input, heute);
  const shown = problems.filter((p) => showProblems || LIVE_FIELDS.includes(p.field));
  const problemOf = (field: FieldKey): Problem | undefined => shown.find((p) => p.field === field);
  const hints = styleHints(form);
  const palette = accentFor(form.farbe, form.hex);
  const formate = orderFormats(form.formate);
  const previewFormat = formate.includes(previewKey) ? previewKey : (formate[0] ?? "feed");
  const preview = previewModel(input);

  const patch = (p: Partial<Form>) => setDraft({ ...form, ...p });
  const toggleFormat = (key: ImageFormatKey, on: boolean) =>
    patch({ formate: IMAGE_FORMATS.map((f) => f.key).filter((k) => (k === key ? on : form.formate.includes(k))) });

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    try {
      const img = await loadImageFile(file);
      logo?.close();
      setLogo(img);
      setLogoUsed(true);
      setLogoProblem(null);
    } catch (e) {
      setLogoProblem(e instanceof Error ? e.message : "Das Logo konnte nicht gelesen werden.");
    }
  }

  function removeLogo() {
    logo?.close();
    setLogo(null);
    setLogoUsed(false);
    setLogoProblem(null);
    setLogoKey((k) => k + 1);
  }

  async function create() {
    const found = validate(input, heute);
    if (found.length > 0) {
      setShowProblems(true);
      document.getElementById(FIELD_ID[found[0].field])?.focus();
      return;
    }
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const output = buildOutput(input);
      shouldFocus.current = "heading";
      set({ ...stateOf(saved, form, hasLogo), phase: "result", output });
      setDraft(null);
      setShowProblems(false);
      void ctx.sendResult({ eingabe: eingabeText(input), ausgabe: ausgabeText(output) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && saved.phase === "result" && saved.output) {
    const out = saved.output;
    const resultInput: OfferInput = { ...formOf(saved, vorschlag), firma: out.firma, logo: hasLogo };
    return (
      <ResultView
        state={saved}
        output={out}
        model={modelOf(resultInput)}
        logo={logo}
        fontsReady={fontsReady}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "titel";
          setDraft(null);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "titel";
          setDraft(null);
          setShowProblems(false);
          set({ ...EMPTY_STATE, formate: [...EMPTY_STATE.formate], felder: { ...EMPTY_STATE.felder }, logo: hasLogo });
        }}
      />
    );
  }

  const error = (field: FieldKey) => problemOf(field)?.message ?? null;
  const hintsFor = (field: string) => hints.filter((h) => h.field === field);
  const fieldHints = (field: "titel" | "angebot" | "aufforderung" | "kontakt") => (
    <div id={`${FIELD_ID[field]}-hinweis`} role="status" aria-live="polite" className="grid gap-1 text-sm text-muted-foreground" data-testid={`ag-hinweis-${field}`}>
      {hintsFor(field).map((h) => (
        <p key={h.message}>{h.message}</p>
      ))}
    </div>
  );
  const fieldError = (field: FieldKey) => (
    <p id={`${FIELD_ID[field]}-fehler`} role="alert" className="min-h-5 text-sm text-destructive">
      {error(field)}
    </p>
  );
  const describedBy = (field: FieldKey, ...more: string[]) => [...more, `${FIELD_ID[field]}-fehler`].join(" ");
  const count = (value: string, max: number) => `${[...value.trim()].length} von ${max} Zeichen`;

  return (
    <form
      className="grid gap-6"
      noValidate
      aria-busy={!live}
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="grid content-start gap-6">
          <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
            <ProfileFieldsForm idPrefix="ag" fields={["organisationstyp", "firma"]} />
            <p className="text-sm text-muted-foreground">
              Der Name steht auf der Grafik, solange du kein Logo wählst. Wir speichern ihn in deinem Firmenprofil, in deinem Browser.
            </p>
            {fieldError("firma")}
          </fieldset>

          <fieldset id="ag-formate" className="grid gap-3 rounded-xl border border-line p-4" disabled={busy} tabIndex={-1}>
            <legend className="px-2 font-heading font-semibold">Formate</legend>
            <p className="text-sm text-muted-foreground">Wähle mindestens ein Format, ein Klick genügt. Die Pixelmasse sind ein Richtwert von Alperna, keine Statistik.</p>
            <FormatCards
              formats={IMAGE_FORMATS.map((f) => ({ key: f.key, label: f.label, width: f.width, height: f.height, detail: `${numberCH(f.width, 0)} × ${numberCH(f.height, 0)} Pixel, ${f.note}` }))}
              selected={live ? form.formate : []}
              idPrefix="ag-format"
              disabled={!live}
              onToggle={(key, on) => toggleFormat(key as ImageFormatKey, on)}
            />
            {fieldError("formate")}
          </fieldset>

          <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Das Angebot</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="ag-titel">Titel</Label>
              <Input
                id="ag-titel"
                value={form.titel}
                maxLength={LIMITS.titel.max}
                placeholder="Herbstaktion"
                onChange={(e) => patch({ titel: e.target.value })}
                disabled={!live}
                aria-invalid={Boolean(error("titel"))}
                aria-describedby={describedBy("titel", "ag-titel-zaehler", "ag-titel-hinweis")}
                lang="de-CH"
              />
              <p id="ag-titel-zaehler" className="mono text-sm text-muted-foreground">
                {count(form.titel, LIMITS.titel.max)}
              </p>
              {fieldHints("titel")}
              {fieldError("titel")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ag-angebot">Angebot</Label>
              <Textarea
                id="ag-angebot"
                rows={3}
                value={form.angebot}
                maxLength={LIMITS.angebot.max}
                placeholder="Fassadenanstrich inklusive Gerüst"
                onChange={(e) => patch({ angebot: e.target.value })}
                disabled={!live}
                aria-invalid={Boolean(error("angebot"))}
                aria-describedby={describedBy("angebot", "ag-angebot-zaehler", "ag-angebot-hinweis")}
                lang="de-CH"
              />
              <p id="ag-angebot-zaehler" className="mono text-sm text-muted-foreground">
                {count(form.angebot, LIMITS.angebot.max)}
              </p>
              {fieldHints("angebot")}
              {fieldError("angebot")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ag-preis">Preis in CHF (freiwillig)</Label>
                <Input
                  id="ag-preis"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={LIMITS.preisMax}
                  step="any"
                  value={form.preis}
                  onChange={(e) => patch({ preis: e.target.value })}
                  disabled={!live}
                  aria-invalid={Boolean(error("preis"))}
                  aria-describedby={describedBy("preis")}
                />
                {fieldError("preis")}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ag-frueher">Früherer Preis in CHF (freiwillig)</Label>
                <Input
                  id="ag-frueher"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={LIMITS.preisMax}
                  step="any"
                  value={form.frueher}
                  onChange={(e) => patch({ frueher: e.target.value })}
                  disabled={!live}
                  aria-invalid={Boolean(error("frueher"))}
                  aria-describedby={describedBy("frueher", "ag-frueher-hilfe")}
                />
                <p id="ag-frueher-hilfe" className="text-sm text-muted-foreground">
                  {PREIS_HINWEIS}
                </p>
                {fieldError("frueher")}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ag-gueltig">Gültig bis (freiwillig)</Label>
              <Input
                id="ag-gueltig"
                type="date"
                min={heute}
                value={form.gueltigBis}
                onChange={(e) => patch({ gueltigBis: e.target.value })}
                disabled={!live}
                aria-invalid={Boolean(error("gueltigBis"))}
                aria-describedby={describedBy("gueltigBis")}
              />
              {fieldError("gueltigBis")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ag-aufforderung">Aufforderung</Label>
              <Input
                id="ag-aufforderung"
                value={form.aufforderung}
                maxLength={LIMITS.aufforderung.max}
                placeholder="Termin vereinbaren"
                onChange={(e) => patch({ aufforderung: e.target.value })}
                disabled={!live}
                aria-invalid={Boolean(error("aufforderung"))}
                aria-describedby={describedBy("aufforderung", "ag-aufforderung-zaehler", "ag-aufforderung-vorschlaege", "ag-aufforderung-hinweis")}
                lang="de-CH"
              />
              <p id="ag-aufforderung-zaehler" className="mono text-sm text-muted-foreground">
                {count(form.aufforderung, LIMITS.aufforderung.max)}
              </p>
              <ul id="ag-aufforderung-vorschlaege" aria-label="Vorschläge für die Aufforderung" className="flex flex-wrap gap-2">
                {AUFFORDERUNGEN.map((v) => (
                  <li key={v}>
                    <Button type="button" variant="outline" size="sm" className="h-auto min-h-9 whitespace-normal py-1.5 text-center" disabled={!live} onClick={() => patch({ aufforderung: v })}>
                      {v}
                    </Button>
                  </li>
                ))}
              </ul>
              {fieldHints("aufforderung")}
              {fieldError("aufforderung")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ag-kontakt">Telefon, Website oder Ort (freiwillig)</Label>
              <Input
                id="ag-kontakt"
                value={form.kontakt}
                maxLength={LIMITS.kontakt.max}
                placeholder="malerei-keller.ch"
                onChange={(e) => patch({ kontakt: e.target.value })}
                disabled={!live}
                aria-invalid={Boolean(error("kontakt"))}
                aria-describedby={describedBy("kontakt", "ag-kontakt-zaehler", "ag-kontakt-hinweis")}
                lang="de-CH"
              />
              <p id="ag-kontakt-zaehler" className="mono text-sm text-muted-foreground">
                {count(form.kontakt, LIMITS.kontakt.max)}
                {vorschlag && draft === null && saved.felder.kontakt === null ? ". Vorgeschlagen aus deinem Firmenprofil." : ""}
              </p>
              {fieldHints("kontakt")}
              {fieldError("kontakt")}
            </div>
          </fieldset>

          <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
            <legend className="px-2 font-heading font-semibold">Aussehen</legend>
            <div className="grid gap-1.5">
              <Label htmlFor="ag-logo">Logo (freiwillig)</Label>
              <Input
                key={logoKey}
                id="ag-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void pickLogo(e.target.files?.[0])}
                disabled={!live}
                aria-describedby="ag-logo-hilfe ag-logo-fehler"
              />
              <p id="ag-logo-hilfe" className="text-sm text-muted-foreground">
                PNG, JPG oder WebP bis 15 MB. {LOGO_HINWEIS}
              </p>
              {saved.logo && !logo && logoUsed === null && (
                <p role="status" className="text-sm text-muted-foreground" data-testid="ag-logo-neu">
                  Logo neu wählen: Dein Logo wird nicht gespeichert.
                </p>
              )}
              <p id="ag-logo-fehler" role="alert" className="min-h-5 text-sm text-destructive">
                {logoProblem}
              </p>
              {logo && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={removeLogo}>
                    Logo entfernen
                  </Button>
                </div>
              )}
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ag-farbe">Farbe</Label>
                <select
                  id="ag-farbe"
                  className={selectClass}
                  value={form.farbe}
                  onChange={(e) => isFarbeKey(e.target.value) && patch({ farbe: e.target.value })}
                  disabled={!live}
                >
                  {FARBEN.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.farbe === "eigen" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="ag-hex">Farbe als Hex-Wert</Label>
                  <Input
                    id="ag-hex"
                    value={form.hex}
                    maxLength={7}
                    placeholder="#1B5E20"
                    autoCapitalize="characters"
                    spellCheck={false}
                    onChange={(e) => patch({ hex: e.target.value })}
                    onBlur={() => {
                      const n = normalizeHex(form.hex);
                      if (n && n !== form.hex) patch({ hex: n });
                    }}
                    disabled={!live}
                    aria-invalid={Boolean(error("hex"))}
                    aria-describedby={describedBy("hex")}
                  />
                  {fieldError("hex")}
                </div>
              )}
            </div>
            <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground" data-testid="ag-farbhinweis">
              {palette.lowContrast ? COLOR_HINT : ""}
            </p>

            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium">Vorlage</legend>
              <ul className="grid gap-2" aria-label="Vorlagen">
                {TEMPLATES.map((t) => (
                  <li key={t.key} className="grid gap-1">
                    <label
                      htmlFor={`ag-vorlage-${t.key}`}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
                    >
                      <input
                        id={`ag-vorlage-${t.key}`}
                        type="radio"
                        name="ag-vorlage"
                        value={t.key}
                        checked={form.vorlage === t.key}
                        onChange={() => patch({ vorlage: t.key })}
                        disabled={!live}
                        aria-describedby={`ag-vorlage-${t.key}-hilfe`}
                        className="size-5 accent-ink"
                      />
                      {t.label}
                    </label>
                    <p id={`ag-vorlage-${t.key}-hilfe`} className="pl-1 text-sm text-muted-foreground">
                      {t.beschreibung}
                    </p>
                  </li>
                ))}
              </ul>
            </fieldset>
          </fieldset>
        </div>

        <aside aria-labelledby="ag-vorschau-titel" className="grid content-start gap-3 md:sticky md:top-4 md:self-start">
          <h4 id="ag-vorschau-titel" className="font-heading font-semibold">
            Vorschau
          </h4>
          <PreviewTabs
            label="Vorschau-Format"
            formats={formate.map((k) => ({ key: k, label: imageFormat(k).label }))}
            value={previewFormat}
            onChange={(key) => setPreviewKey(key as ImageFormatKey)}
          />
          <div className="mx-auto w-full max-w-[320px]" data-testid="ag-vorschau">
            <OfferCanvas
              model={preview.model}
              format={imageFormat(previewFormat)}
              logo={logo}
              fontsReady={fontsReady}
              label={`Vorschau ${imageFormat(previewFormat).label}: ${describeOffer(preview.model)}`}
              testId="ag-vorschau-canvas"
            />
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {preview.platzhalter ? "Leere Felder zeigt die Vorschau mit Beispieltexten. " : ""}Die Vorschau ist eine Bedienhilfe; die Dateien entstehen mit «Grafiken erstellen».
          </p>
        </aside>
      </div>

      <p id="ag-error" role="alert" className="min-h-6 text-destructive">
        {showProblems && problems.length > 0 ? `Bitte prüfe ${problems.length === 1 ? "eine Angabe" : `${problems.length} Angaben`}. Die Hinweise stehen bei den Feldern.` : ""}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!live || busy}>
          Grafiken erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Ergebnis und Dateien gegen deine E-Mail-Adresse.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <AngebotFlow />
    </ToolShell>
  );
}
