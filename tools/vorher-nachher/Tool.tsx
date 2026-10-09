"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormatCards, PreviewTabs } from "@/components/tool/FormatPicker";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pctCH, numberCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { IMAGE_LIMITS, imageFileProblem, loadCanvasFonts, loadImageFile, type LoadedImage } from "@/lib/export/png";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  BESCHRIFTUNGEN,
  ECKEN,
  EMPTY_STATE,
  FIELD_IDS,
  FORMATE,
  GEO,
  LAYOUTS,
  LOGO_GROESSE,
  MAX_WORT,
  PAN,
  POSITION,
  RICHTWERT_NOTE,
  STATE_KEY,
  ZOOM,
  ausgabeText,
  eingabeText,
  ergebnisSatz,
  formatOf,
  formatPixel,
  hitImage,
  imageErrorMessage,
  layoutFor,
  panByDrag,
  parseState,
  pngName,
  settingsOf,
  toggleFormat,
  validate,
  vorschauText,
  zipName,
  type Crop,
  type Ecke,
  type FormatKey,
  type Settings,
} from "./logic";
import { THUMB_WIDTH, buildZip, drawPreview, renderPng } from "./render";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const fileClass =
  "block w-full cursor-pointer text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-full file:border file:border-input file:bg-paper file:px-4 file:py-2 file:text-sm file:font-medium";
const choiceClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface";

// ---- Bilder lesen -------------------------------------------------------------------------------------

type Slot = { name: string; width: number; height: number; img: LoadedImage };

/**
 * Ein Bild im Arbeitsspeicher (ImageBitmap). Es wird freigegeben, sobald es ersetzt oder entfernt wird und wenn die Seite
 * verlassen wird. Wählt die Person schnell hintereinander zwei Dateien, gilt die zuletzt gewählte.
 */
function useImageSlot() {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const run = useRef({ id: 0 });

  useEffect(() => {
    if (!slot) return;
    return () => slot.img.close();
  }, [slot]);
  useEffect(() => {
    const state = run.current;
    return () => {
      state.id += 1;
    };
  }, []);

  const load = useCallback(async (file: File) => {
    const mine = ++run.current.id;
    setError(null);
    const problem = imageFileProblem(file);
    if (problem) {
      setSlot(null);
      setError(problem);
      return;
    }
    try {
      const img = await loadImageFile(file);
      if (mine !== run.current.id) {
        img.close();
        return;
      }
      setSlot({ name: file.name, width: img.width, height: img.height, img });
    } catch (e) {
      if (mine !== run.current.id) return;
      setSlot(null);
      setError(imageErrorMessage(e));
    }
  }, []);

  const clear = useCallback(() => {
    run.current.id += 1;
    setSlot(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return { slot, error, inputRef, load, clear };
}
type ImageSlot = ReturnType<typeof useImageSlot>;

function ImageField({
  id,
  label,
  hint,
  field,
  invalid,
  clearText,
  clearAria,
  freiwillig,
}: {
  id: string;
  label: string;
  hint: React.ReactNode;
  field: ImageSlot;
  invalid: boolean;
  clearText: string;
  clearAria: string;
  freiwillig?: boolean;
}) {
  const { slot, inputRef, load, clear } = field;
  return (
    <div
      className="grid gap-2 rounded-xl border border-dashed border-line p-4"
      data-testid={`${id}-feld`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        try {
          if (inputRef.current) inputRef.current.files = e.dataTransfer.files;
        } catch {
          /* der Datei-Input bleibt leer, das Bild wird trotzdem gelesen */
        }
        void load(file);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className={fileClass}
        aria-describedby={`${id}-hinweis${invalid ? " vn-error" : ""}`}
        aria-invalid={invalid}
        required={!freiwillig}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void load(file);
        }}
      />
      <p id={`${id}-hinweis`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" aria-live="polite" data-testid={`${id}-datei`} className="min-h-6 text-sm">
          {slot && (
            <>
              Gelesen: <span className="break-all font-medium">{slot.name}</span> ({numberCH(slot.width, 0)} × {numberCH(slot.height, 0)} Pixel)
            </>
          )}
        </p>
        {slot && (
          <Button type="button" variant="ghost" onClick={clear} aria-label={clearAria}>
            {clearText}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---- Bedienelemente -----------------------------------------------------------------------------------

function Range({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <output htmlFor={id} className="mono text-sm text-muted-foreground">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-ink"
      />
    </div>
  );
}

function CropControls({ which, crop, disabled, onChange }: { which: "vorher" | "nachher"; crop: Crop; disabled: boolean; onChange: (c: Crop) => void }) {
  const kurz = which === "vorher" ? "Vorher" : "Nachher";
  return (
    <div className="grid gap-2">
      <p className="font-medium">{kurz}-Bild</p>
      <Range
        id={`vn-zoom-${which}`}
        label={`Zoom ${kurz}`}
        value={crop.zoom}
        min={ZOOM.min}
        max={ZOOM.max}
        step={ZOOM.step}
        display={`${numberCH(crop.zoom, 1)} ×`}
        disabled={disabled}
        onChange={(zoom) => onChange({ ...crop, zoom })}
      />
      <Range
        id={`vn-x-${which}`}
        label={`Ausschnitt waagrecht ${kurz}`}
        value={crop.x}
        min={PAN.min}
        max={PAN.max}
        step={1}
        display={numberCH(crop.x, 0)}
        disabled={disabled}
        onChange={(x) => onChange({ ...crop, x })}
      />
      <Range
        id={`vn-y-${which}`}
        label={`Ausschnitt senkrecht ${kurz}`}
        value={crop.y}
        min={PAN.min}
        max={PAN.max}
        step={1}
        display={numberCH(crop.y, 0)}
        disabled={disabled}
        onChange={(y) => onChange({ ...crop, y })}
      />
    </div>
  );
}

// ---- Vorschau -----------------------------------------------------------------------------------------

function Preview({
  settings,
  format,
  vorher,
  nachher,
  logo,
  fontsReady,
  onCrop,
}: {
  settings: Settings;
  format: FormatKey;
  vorher: Slot | null;
  nachher: Slot | null;
  logo: Slot | null;
  fontsReady: boolean;
  onCrop: (which: "vorher" | "nachher", crop: Crop) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; which: "vorher" | "nachher"; x0: number; y0: number; start: Crop } | null>(null);
  const f = formatOf(format);
  const k = Math.min(1, 720 / f.width);

  useEffect(() => {
    if (ref.current) drawPreview(ref.current, settings, format, vorher?.img ?? null, nachher?.img ?? null, logo?.img ?? null);
  }, [settings, format, vorher, nachher, logo, fontsReady]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    return { x: ((e.clientX - r.left) / r.width) * f.width, y: ((e.clientY - r.top) / r.height) * f.height };
  };

  return (
    <canvas
      ref={ref}
      width={Math.round(f.width * k)}
      height={Math.round(f.height * k)}
      role="img"
      aria-label={vorschauText({ format, settings, hatVorher: Boolean(vorher), hatNachher: Boolean(nachher), hatLogo: Boolean(logo) })}
      data-testid="vn-vorschau-canvas"
      className="h-auto max-h-[70vh] w-auto max-w-full cursor-grab rounded-lg border border-line active:cursor-grabbing"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(e) => {
        const p = point(e);
        if (!p) return;
        const which = hitImage(layoutFor(settings.layout, f.width, f.height, settings.position), p.x, p.y);
        if (!which || !(which === "vorher" ? vorher : nachher)) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { id: e.pointerId, which, x0: p.x, y0: p.y, start: settings.zuschnitt[which] };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const p = point(e);
        if (!d || !p || d.id !== e.pointerId) return;
        const img = (d.which === "vorher" ? vorher : nachher)?.img;
        if (!img) return;
        const l = layoutFor(settings.layout, f.width, f.height, settings.position);
        const dst = d.which === "vorher" ? l.vorher : l.nachher;
        onCrop(d.which, panByDrag({ w: img.width, h: img.height }, { w: dst.w, h: dst.h }, d.start, p.x - d.x0, p.y - d.y0));
      }}
      onPointerUp={(e) => {
        if (drag.current?.id === e.pointerId) drag.current = null;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}

function Thumb({
  settings,
  format,
  vorher,
  nachher,
  logo,
  fontsReady,
}: {
  settings: Settings;
  format: FormatKey;
  vorher: Slot;
  nachher: Slot;
  logo: Slot | null;
  fontsReady: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const f = formatOf(format);
  const k = Math.min(1, THUMB_WIDTH / f.width);
  useEffect(() => {
    if (ref.current) drawPreview(ref.current, settings, format, vorher.img, nachher.img, logo?.img ?? null, THUMB_WIDTH);
  }, [settings, format, vorher, nachher, logo, fontsReady]);
  return (
    <canvas
      ref={ref}
      width={Math.round(f.width * k)}
      height={Math.round(f.height * k)}
      role="img"
      aria-label={`Collage ${f.label}`}
      className="h-auto w-full max-w-[18rem] rounded-lg border border-line"
    />
  );
}

// ---- Ergebnis -----------------------------------------------------------------------------------------

const HINWEISE: readonly string[] = [
  `Nimm in beiden Bildern denselben Ausschnitt und dasselbe Licht. Dann sieht man die Veränderung und nicht den Unterschied der Fotos (${RICHTWERT_NOTE}).`,
  "Zeig Gesichter und Kennzeichen nur, wenn die Personen einverstanden sind. Frag vorher nach.",
  "Ergänze beim Veröffentlichen einen Alternativtext, der in einem Satz sagt, was vorher und nachher zu sehen ist.",
];

function ResultView({
  settings,
  firma,
  vorher,
  nachher,
  logo,
  fontsReady,
  headingRef,
  onEdit,
  onNew,
}: {
  settings: Settings;
  firma?: string;
  vorher: Slot;
  nachher: Slot;
  logo: Slot | null;
  fontsReady: boolean;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(what: string, action: () => Promise<void>) {
    setError(null);
    setBusy(what);
    try {
      await action();
    } catch {
      setError("Der Download hat nicht geklappt. Versuch es noch einmal.");
    } finally {
      setBusy(null);
    }
  }

  const png = (key: FormatKey) => renderPng(settings, key, vorher.img, nachher.img, logo?.img ?? null);

  return (
    <ResultCard
      title="Deine Collage"
      headingRef={headingRef}
      actions={
        <>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              ctx.guardDownload(() =>
                run("zip", async () => {
                  const files: { name: string; bytes: Uint8Array }[] = [];
                  for (const key of settings.formate) files.push({ name: pngName(firma, key), bytes: await png(key) });
                  downloadBytes(await buildZip(files), zipName(firma), "application/zip");
                }),
              )
            }
            data-umami-event="export_zip"
            data-umami-event-tool={ctx.slug}
          >
            {busy === "zip" ? "ZIP wird erstellt …" : "Alle als ZIP herunterladen"}
          </Button>
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
        {ergebnisSatz(settings)} Die PNG-Dateien entstehen in deinem Browser. Deine Bilder werden nirgends hochgeladen.
      </p>
      <ul aria-label="Collagen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="collagen">
        {settings.formate.map((key) => {
          const f = formatOf(key);
          return (
            <li key={key} className="grid content-start gap-2 rounded-xl border border-line bg-white p-4" data-testid={`collage-${key}`}>
              <Thumb settings={settings} format={key} vorher={vorher} nachher={nachher} logo={logo} fontsReady={fontsReady} />
              <p className="font-heading font-medium">{f.label}</p>
              <p className="mono text-sm text-muted-foreground">{formatPixel(key)}</p>
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  ctx.guardDownload(() => run(key, async () => downloadBytes(await png(key), pngName(firma, key), "image/png")))
                }
                data-umami-event="export_png"
                data-umami-event-tool={ctx.slug}
              >
                {busy === key ? "PNG wird erstellt …" : `PNG herunterladen: ${f.label}`}
              </Button>
            </li>
          );
        })}
      </ul>
      <section aria-labelledby="vn-hinweise" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="vn-hinweise" className="font-heading text-base font-semibold">
          Vor dem Veröffentlichen
        </h4>
        <ul className="grid gap-2 text-sm text-muted-foreground" aria-label="Hinweise zur Veröffentlichung">
          {HINWEISE.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <p className="text-sm">
          Fehlt noch der Text zum Beitrag?{" "}
          <Link href="/tools/caption-baukasten" className="underline underline-offset-4">
            Caption schreiben
          </Link>
        </p>
      </section>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {busy === "zip" ? "Das ZIP wird erstellt." : "Die PNG-Datei wird erstellt."}
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

// ---- Ablauf -------------------------------------------------------------------------------------------

function Intro() {
  return (
    <>
      <p>
        Wähle zwei Fotos, vorher und nachher. Daraus entsteht eine Collage als PNG in den Formaten Feed 1:1, Feed 4:5 und Story 9:16, mit
        Beschriftung und auf Wunsch mit deinem Logo.
      </p>
      <p>
        Deine Bilder werden nur in deinem Browser gelesen und verlassen ihn nie. An Alperna gehen deine E-Mail-Adresse, die Einstellungen und die
        Dateinamen, nie die Bilder.
      </p>
    </>
  );
}

const BILD_HINWEIS = `PNG, JPG oder WebP bis ${IMAGE_LIMITS.bytes / (1024 * 1024)} MB und 8'000 Pixel an einer Seite. Du kannst die Datei auch auf diese Fläche ziehen.`;

function CollageFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(STATE_KEY, parseState);
  const vorher = useImageSlot();
  const nachher = useImageSlot();
  const logo = useImageSlot();

  const savedSettings = useMemo(() => settingsOf(saved), [saved]);
  const [draft, setDraft] = useState<Settings | null>(null);
  const settings = draft ?? savedSettings;
  /** Die Einstellungen des Ergebnisses, das gerade am Bildschirm steht; null: das Formular steht. */
  const [made, setMade] = useState<Settings | null>(null);
  const [previewKey, setPreviewKey] = useState<FormatKey>("feed");
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  useEffect(() => {
    let on = true;
    void loadCanvasFonts().then(() => on && setFontsReady(true));
    return () => {
      on = false;
    };
  }, []);

  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") formRef.current?.querySelector<HTMLElement>("input, select")?.focus();
    shouldFocus.current = null;
  }, [made]);

  const firma = profile.firma?.trim() || undefined;
  const update = (fn: (s: Settings) => Settings) => setDraft((d) => fn(d ?? savedSettings));
  const patch = (p: Partial<Settings>) => update((s) => ({ ...s, ...p }));
  const setCrop = (which: "vorher" | "nachher", crop: Crop) => update((s) => ({ ...s, zuschnitt: { ...s.zuschnitt, [which]: crop } }));

  const problems = validate({
    hatVorher: Boolean(vorher.slot),
    hatNachher: Boolean(nachher.slot),
    beschriftung: settings.beschriftung,
    worte: settings.worte,
    formate: settings.formate,
    dateifehler: { vorher: vorher.error, nachher: nachher.error, logo: logo.error },
  });
  const shown = showProblems ? problems : problems.filter((p) => p.datei);
  const invalid = (field: string) => shown.some((p) => p.field === field);

  async function start() {
    if (problems.length > 0) {
      setShowProblems(true);
      document.getElementById(FIELD_IDS[problems[0].field])?.focus();
      return;
    }
    if (!vorher.slot || !nachher.slot) return;
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const next: Settings = { ...settings, worte: { erstes: settings.worte.erstes.trim(), zweites: settings.worte.zweites.trim() } };
      shouldFocus.current = "heading";
      set({ v: 1, phase: "result", ...next, output: { formate: next.formate, logo: Boolean(logo.slot) } });
      setDraft(null);
      setShowProblems(false);
      setMade(next);
      void ctx.sendResult({
        eingabe: eingabeText({ firma, settings: next, vorher: vorher.slot, nachher: nachher.slot, logo: Boolean(logo.slot) }),
        ausgabe: ausgabeText(next.formate),
      });
    } finally {
      setBusy(false);
    }
  }

  if (made && vorher.slot && nachher.slot) {
    return (
      <ResultView
        settings={made}
        firma={firma}
        vorher={vorher.slot}
        nachher={nachher.slot}
        logo={logo.slot}
        fontsReady={fontsReady}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "form";
          setDraft(made);
          setMade(null);
        }}
        onNew={() => {
          shouldFocus.current = "form";
          vorher.clear();
          nachher.clear();
          logo.clear();
          setShowProblems(false);
          setPreviewKey("feed");
          set(EMPTY_STATE);
          setDraft(null);
          setMade(null);
        }}
      />
    );
  }

  const previewFormat: FormatKey = settings.formate.includes(previewKey) ? previewKey : (settings.formate[0] ?? "feed");
  const layoutInfo = LAYOUTS.find((l) => l.key === settings.layout) ?? LAYOUTS[0];
  const bilderNeu = Boolean(saved.output) && !vorher.slot && !nachher.slot;
  const noImages = !vorher.slot || !nachher.slot;

  return (
    <form
      ref={formRef}
      className="grid gap-6"
      noValidate
      aria-busy={!ready || !profileReady}
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <div className="content">
        <Intro />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-x-8">
        <fieldset className="grid min-w-0 gap-4 rounded-xl border border-line p-4 md:grid-cols-2 lg:col-start-1" disabled={busy}>
          <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
          <ProfileFieldsForm idPrefix="vn" fields={["organisationstyp", "firma"]} />
          <p className="text-sm text-muted-foreground md:col-span-2">
            Typ und Name speichern wir in deinem Firmenprofil, in deinem Browser. Der Name steht im Dateinamen.
          </p>
        </fieldset>

        <fieldset className="grid min-w-0 gap-4 rounded-xl border border-line p-4 lg:col-start-1" disabled={busy}>
          <legend className="px-2 font-heading font-semibold">Deine Bilder</legend>
          {bilderNeu && (
            <p data-testid="vn-bilder-neu" className="rounded-lg bg-surface p-3 text-sm">
              Deine Einstellungen sind gespeichert. Bilder neu wählen: Die Bilder bleiben nicht im Speicher deines Browsers.
            </p>
          )}
          <ImageField
            id="vn-vorher"
            label="Vorher-Bild"
            clearText="Bild entfernen"
            clearAria="Bild entfernen: Vorher-Bild"
            hint={BILD_HINWEIS}
            field={vorher}
            invalid={invalid("vorher")}
          />
          <ImageField
            id="vn-nachher"
            label="Nachher-Bild"
            clearText="Bild entfernen"
            clearAria="Bild entfernen: Nachher-Bild"
            hint={BILD_HINWEIS}
            field={nachher}
            invalid={invalid("nachher")}
          />
        </fieldset>

        <fieldset className="grid min-w-0 gap-3 rounded-xl border border-line p-4 lg:col-start-1" disabled={busy} aria-describedby="vn-formate-hilfe">
          <legend className="px-2 font-heading font-semibold">Formate</legend>
          <FormatCards
            formats={FORMATE.map((f) => ({ key: f.key, label: f.label, width: f.width, height: f.height, detail: formatPixel(f.key) }))}
            selected={settings.formate}
            idPrefix="vn-format"
            invalidKey={invalid("formate") ? "feed" : undefined}
            describedBy={invalid("formate") ? "vn-error" : undefined}
            onToggle={(key) => patch({ formate: toggleFormat(settings.formate, key as FormatKey) })}
          />
          <p id="vn-formate-hilfe" className="text-sm text-muted-foreground">
            Ein Klick wählt ein Format. Pixelmasse: Richtwert von Alperna, keine Vorgabe der Plattformen.
          </p>
        </fieldset>

        <aside
          aria-label="Vorschau der Collage"
          className="grid min-w-0 content-start gap-3 rounded-xl border border-line p-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:row-span-6 lg:self-start"
        >
          <PreviewTabs
            label="Vorschau"
            formats={FORMATE.filter((f) => settings.formate.includes(f.key)).map((f) => ({ key: f.key, label: f.label }))}
            value={previewFormat}
            onChange={(key) => {
              const v = FORMATE.find((x) => x.key === key);
              if (v) setPreviewKey(v.key);
            }}
          />
          <div className="grid justify-items-center">
            <Preview
              settings={settings}
              format={previewFormat}
              vorher={vorher.slot}
              nachher={nachher.slot}
              logo={logo.slot}
              fontsReady={fontsReady}
              onCrop={setCrop}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {noImages ? "Die grauen Flächen zeigen, wo deine Bilder hinkommen. " : ""}
            Mit der Maus kannst du ein Bild in der Vorschau ziehen; die Regler tun dasselbe. Die Vorschau ist nur eine Ansicht. Die Dateien gibt es
            nach «Collage erstellen».
          </p>
        </aside>

        <fieldset className="grid min-w-0 gap-4 rounded-xl border border-line p-4 lg:col-start-1" disabled={busy}>
          <legend className="px-2 font-heading font-semibold">Zuschnitt</legend>
          <div className="grid gap-6 md:grid-cols-2">
            <CropControls which="vorher" crop={settings.zuschnitt.vorher} disabled={!vorher.slot} onChange={(c) => setCrop("vorher", c)} />
            <CropControls which="nachher" crop={settings.zuschnitt.nachher} disabled={!nachher.slot} onChange={(c) => setCrop("nachher", c)} />
          </div>
          <p className="text-sm text-muted-foreground">Zoom und Ausschnitt gelten für das jeweilige Bild. Die Regler gehen erst, wenn das Bild gewählt ist.</p>
        </fieldset>

        <fieldset className="grid min-w-0 gap-3 rounded-xl border border-line p-4 lg:col-start-1" disabled={busy}>
          <legend id="vn-layout-legend" className="px-2 font-heading font-semibold">
            Layout
          </legend>
          <div role="radiogroup" aria-labelledby="vn-layout-legend" aria-describedby="vn-layout-hilfe" className="flex flex-wrap gap-3">
            {LAYOUTS.map((l) => (
              <label key={l.key} className={choiceClass}>
                <input
                  type="radio"
                  name="vn-layout"
                  value={l.key}
                  checked={settings.layout === l.key}
                  onChange={() => patch({ layout: l.key })}
                  className="size-5 accent-ink"
                />
                {l.label}
              </label>
            ))}
          </div>
          <p id="vn-layout-hilfe" className="text-sm text-muted-foreground">
            {layoutInfo.hilfe} {RICHTWERT_NOTE}.
          </p>
          {settings.layout === "schieber" && (
            <Range
              id="vn-position"
              label="Trennlinie"
              value={settings.position}
              min={POSITION.min}
              max={POSITION.max}
              step={1}
              display={pctCH(settings.position, 0)}
              onChange={(position) => patch({ position })}
            />
          )}
        </fieldset>

        <fieldset className="grid min-w-0 gap-3 rounded-xl border border-line p-4 lg:col-start-1" disabled={busy}>
          <legend id="vn-beschriftung-legend" className="px-2 font-heading font-semibold">
            Beschriftung
          </legend>
          <div role="radiogroup" aria-labelledby="vn-beschriftung-legend" className="flex flex-wrap gap-3">
            {BESCHRIFTUNGEN.map((b) => (
              <label key={b.key} className={choiceClass}>
                <input
                  type="radio"
                  name="vn-beschriftung"
                  value={b.key}
                  checked={settings.beschriftung === b.key}
                  onChange={() => patch({ beschriftung: b.key })}
                  className="size-5 accent-ink"
                />
                {b.label}
              </label>
            ))}
          </div>
          {settings.beschriftung === "eigene" && (
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ["vn-wort1", "Wort für das erste Bild", "erstes", "wort1"],
                  ["vn-wort2", "Wort für das zweite Bild", "zweites", "wort2"],
                ] as const
              ).map(([id, label, key, field]) => (
                <div key={id} className="grid gap-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <Input
                    id={id}
                    type="text"
                    maxLength={MAX_WORT}
                    lang="de-CH"
                    value={settings.worte[key]}
                    onChange={(e) => patch({ worte: { ...settings.worte, [key]: e.target.value } })}
                    aria-invalid={invalid(field)}
                    aria-describedby={`${id}-zaehler${invalid(field) ? " vn-error" : ""}`}
                  />
                  <p id={`${id}-zaehler`} className="mono text-sm text-muted-foreground">
                    {settings.worte[key].length} von {MAX_WORT} Zeichen
                  </p>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">Die Wörter erscheinen als kleine Schilder oben im jeweiligen Bild.</p>
        </fieldset>

        <fieldset className="grid min-w-0 gap-4 rounded-xl border border-line p-4 lg:col-start-1" disabled={busy}>
          <legend className="px-2 font-heading font-semibold">Logo</legend>
          <ImageField
            id="vn-logo"
            label="Logo (freiwillig)"
            clearText="Logo entfernen"
            clearAria="Logo entfernen"
            freiwillig
            hint="Dein Logo verlässt den Browser nicht. Es kommt auf eine halbtransparente helle Fläche, damit es auf jedem Foto lesbar bleibt."
            field={logo}
            invalid={invalid("logo")}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="vn-ecke">Ecke des Logos</Label>
              <select id="vn-ecke" className={selectClass} value={settings.ecke} onChange={(e) => patch({ ecke: e.target.value as Ecke })}>
                {ECKEN.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <Range
              id="vn-logo-groesse"
              label="Grösse des Logos"
              value={settings.logoGroesse}
              min={LOGO_GROESSE.min}
              max={LOGO_GROESSE.max}
              step={1}
              display={`${pctCH(settings.logoGroesse, 0)} der Breite`}
              onChange={(logoGroesse) => patch({ logoGroesse })}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Steht die gewählte Ecke einer Beschriftung im Weg, rückt das Logo in eine freie Ecke. Abstand zum Rand: {pctCH(GEO.rand * 100, 0)} der Breite.
          </p>
        </fieldset>

        <div className="grid gap-4 lg:col-start-1">
          <div id="vn-error" role="alert" className="min-h-6 text-destructive" data-testid="vn-fehler">
            {shown.length === 1 && shown[0].message}
            {shown.length > 1 && (
              <ul className="list-disc pl-5">
                {shown.map((p) => (
                  <li key={`${p.field}-${p.message}`}>{p.message}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
              Collage erstellen
            </Button>
            <span className="text-sm text-muted-foreground">Ergebnis und Dateien gegen deine E-Mail-Adresse.</span>
          </div>
        </div>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <CollageFlow />
    </ToolShell>
  );
}
