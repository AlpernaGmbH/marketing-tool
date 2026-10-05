"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  EMPTY_STATE,
  HINWEISE,
  MAX_INPUT,
  MAX_LABEL,
  MAX_TARGETS,
  SLUG,
  TARGET_KINDS,
  ausgabeText,
  buildCodes,
  defaultLabel,
  eingabeText,
  formProblem,
  initialTargets,
  isKind,
  kindInfo,
  labelAfterKindChange,
  parseState,
  readWhatsappNumber,
  rowProblems,
  setFilename,
  type QrCode,
  type QrSetState,
  type Target,
  type TargetKind,
} from "./logic";
import { qrSvgDataUrl } from "./qr";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Download = "pdf" | "zip";

function Intro() {
  return (
    <>
      <p>
        Trag bis zu sechs Ziele ein: Website, Instagram, LinkedIn, WhatsApp, Google-Bewertung, Speisekarte oder einen anderen Link, je mit einer
        Beschriftung. Daraus entstehen QR-Codes mit Text darunter: ein Druckbogen A4 als PDF für die Druckerei und ein ZIP mit allen Codes als SVG
        und PNG für Flyer, Aufkleber, Schaufenster und Fahrzeug.
      </p>
      <p>
        Die Codes entstehen in deinem Browser. Dein Ergebnis geht zusammen mit den Zielen und deiner E-Mail-Adresse an Alperna, damit wir dir bei
        Fragen weiterhelfen können.
      </p>
    </>
  );
}

function TargetRow({
  index,
  target,
  problem,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  target: Target;
  problem: string | null;
  canRemove: boolean;
  onChange: (next: Target) => void;
  onRemove: () => void;
}) {
  const info = kindInfo(target.kind);
  const id = (f: string) => `qr-${f}-${index}`;
  return (
    <li className="grid gap-3 rounded-xl border border-line p-4" data-testid={`ziel-${index + 1}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-heading font-medium">Ziel {index + 1}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={!canRemove} aria-label={`Ziel ${index + 1} entfernen`}>
          Entfernen
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor={id("art")}>Art</Label>
          <select
            id={id("art")}
            className={selectClass}
            value={target.kind}
            onChange={(e) => {
              const to = e.target.value;
              if (!isKind(to)) return;
              onChange({ ...target, kind: to, label: labelAfterKindChange(target.label, target.kind, to) });
            }}
          >
            {TARGET_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("adresse")}>Adresse</Label>
          <Input
            id={id("adresse")}
            type="text"
            inputMode={target.kind === "whatsapp" ? "tel" : "url"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={MAX_INPUT}
            placeholder={info.placeholder}
            value={target.input}
            onChange={(e) => onChange({ ...target, input: e.target.value })}
            aria-describedby={`${id("adresse-help")} ${id("fehler")}`}
            aria-invalid={Boolean(problem)}
          />
          <p id={id("adresse-help")} className="text-sm text-muted-foreground">
            {info.help}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("beschriftung")}>Beschriftung</Label>
          <Input
            id={id("beschriftung")}
            type="text"
            maxLength={MAX_LABEL}
            placeholder={info.suggestion || "Zum Beispiel: Zur Anmeldung"}
            value={target.label}
            onChange={(e) => onChange({ ...target, label: e.target.value })}
            aria-describedby={id("beschriftung-help")}
            lang="de-CH"
          />
          <p id={id("beschriftung-help")} className="mono text-sm text-muted-foreground">
            {target.label.length} von {MAX_LABEL} Zeichen
          </p>
        </div>
      </div>
      <p id={id("fehler")} role="alert" className="min-h-5 text-sm text-destructive">
        {problem}
      </p>
    </li>
  );
}

function CodeGrid({ codes }: { codes: QrCode[] }) {
  const items = useMemo(() => codes.map((c) => ({ code: c, src: qrSvgDataUrl(c.url) })), [codes]);
  return (
    <ul aria-label="QR-Codes" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="qr-codes">
      {items.map(({ code, src }) => (
        <li key={code.nr} className="grid justify-items-center gap-2 rounded-xl border border-line bg-white p-4 text-center" data-testid={`qr-code-${code.nr}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR-Code als data-URL, kein Bild zum Optimieren */}
          <img src={src} alt={`QR-Code: ${code.label}`} width={160} height={160} className="h-40 w-40" />
          <p className="font-heading font-medium">{code.label}</p>
          <p className="mono break-all text-sm text-muted-foreground">{code.display}</p>
          <p className="text-xs text-muted-foreground">{code.kindLabel}</p>
        </li>
      ))}
    </ul>
  );
}

function ResultView({
  state,
  firma,
  onEdit,
  onNew,
  headingRef,
}: {
  state: QrSetState;
  firma?: string;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const ctx = useToolContext();
  const codes = useMemo(() => buildCodes(state.ziele), [state.ziele]);
  const [busy, setBusy] = useState<Download | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = setFilename(firma);

  async function run(kind: Download) {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "pdf") {
        const [{ buildSheetPdf }, { loadPdfFonts }] = await Promise.all([import("./export"), import("@/lib/export/fonts")]);
        const bytes = await buildSheetPdf({ codes, firma, datum: dateCH(new Date()), fonts: await loadPdfFonts() });
        downloadBytes(bytes, `${name}.pdf`, "application/pdf");
      } else {
        const { buildZip } = await import("./export");
        downloadBytes(await buildZip(codes), `${name}.zip`, "application/zip");
      }
    } catch {
      setError("Der Download hat nicht geklappt. Versuch es noch einmal.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResultCard
      title="Dein QR-Set"
      headingRef={headingRef}
      actions={
        <>
          <Button type="button" disabled={busy !== null} onClick={() => ctx.guardDownload(() => run("pdf"))} data-umami-event="export_pdf" data-umami-event-tool={ctx.slug}>
            {busy === "pdf" ? "PDF wird erstellt …" : "Druckbogen (PDF) herunterladen"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => ctx.guardDownload(() => run("zip"))}
            data-umami-event="export_zip"
            data-umami-event-tool={ctx.slug}
          >
            {busy === "zip" ? "ZIP wird erstellt …" : "ZIP mit SVG und PNG herunterladen"}
          </Button>
          <CopyButton text={() => ausgabeText(codes)} label="Liste kopieren" />
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
        {codes.length} {codes.length === 1 ? "QR-Code" : "QR-Codes"}
        {firma ? ` für ${firma}` : ""}. Der Druckbogen zeigt jeden Code 50 mm breit mit Beschriftung und Adresse; im ZIP liegt jeder Code als SVG und
        als PNG mit {"1'024"} Pixeln.
      </p>
      <CodeGrid codes={codes} />
      <section aria-labelledby="qr-hinweise" className="grid gap-2 rounded-xl bg-surface p-4">
        <h4 id="qr-hinweise" className="font-heading text-base font-semibold">
          Vor dem Druck
        </h4>
        <ul className="grid gap-2 text-sm text-muted-foreground" aria-label="Hinweise zum Druck">
          {HINWEISE.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>
      {busy && (
        <p role="status" aria-live="polite" className="text-sm font-medium">
          {busy === "pdf" ? "Der Druckbogen wird erstellt." : "Das ZIP wird erstellt."}
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

function QrSetFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const { value: waNummer } = useLocalJson("mt:whatsapp-link", readWhatsappNumber);

  // Der Entwurf lebt in den Feldern; ohne Entwurf gilt der gespeicherte Stand, und ohne den ein Vorschlag aus Profil und WhatsApp-Werkzeug.
  const [draft, setDraft] = useState<Target[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstFieldRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef<"heading" | "form" | null>(null);

  const ziele: Target[] = draft ?? (saved.ziele.length > 0 ? saved.ziele : initialTargets(profile.website, waNummer));
  const problems = useMemo(() => (showProblems ? rowProblems(ziele) : ziele.map(() => null)), [ziele, showProblems]);

  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "form") firstFieldRef.current?.querySelector<HTMLElement>("select, input")?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const edit = (next: Target[]) => {
    setDraft(next);
    setError(null);
  };

  async function start() {
    const problem = formProblem(ziele);
    if (problem) {
      setShowProblems(true);
      return setError(problem);
    }
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      shouldFocus.current = "heading";
      const next: QrSetState = { v: 1, phase: "result", ziele: ziele.map((z) => ({ ...z, input: z.input.trim(), label: z.label.trim() })) };
      set(next);
      setDraft(null);
      setShowProblems(false);
      void ctx.sendResult({ eingabe: eingabeText(next.ziele, profile.firma), ausgabe: ausgabeText(buildCodes(next.ziele)) });
    } finally {
      setBusy(false);
    }
  }

  if (ready && saved.phase === "result") {
    return (
      <ResultView
        state={saved}
        firma={profile.firma?.trim() || undefined}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "form";
          setDraft(saved.ziele);
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "form";
          setError(null);
          setShowProblems(false);
          setDraft([{ kind: "website", input: "", label: defaultLabel("website") }]);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const addKind: TargetKind = ziele.some((z) => z.kind === "website") ? "instagram" : "website";

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
        <Intro />
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-2" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="qr" fields={["firma", "website"]} />
        <p className="text-sm text-muted-foreground md:col-span-2">
          Firma und Website speichern wir in deinem Firmenprofil, in deinem Browser. Die Firma steht im Kopf des Druckbogens, die Website ist das erste
          Ziel.
        </p>
      </fieldset>

      <fieldset className="grid gap-4" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Deine Ziele</legend>
        <div ref={firstFieldRef} className="grid gap-4">
          <ul aria-label="Ziele" className="grid gap-4" data-testid="ziele">
            {ziele.map((z, i) => (
              <TargetRow
                key={i}
                index={i}
                target={z}
                problem={problems[i] ?? null}
                canRemove={ziele.length > 1}
                onChange={(next) => edit(ziele.map((x, j) => (j === i ? next : x)))}
                onRemove={() => edit(ziele.filter((_, j) => j !== i))}
              />
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={!ready || ziele.length >= MAX_TARGETS}
            onClick={() => edit([...ziele, { kind: addKind, input: "", label: defaultLabel(addKind) }])}
          >
            Ziel hinzufügen
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {ziele.length} von {MAX_TARGETS} Zielen
          </span>
        </div>
      </fieldset>

      <p id="qr-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
          QR-Set erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Ergebnis sofort, Dateien gegen deine E-Mail-Adresse.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <QrSetFlow />
    </ToolShell>
  );
}
