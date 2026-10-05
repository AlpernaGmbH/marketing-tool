"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadBytes } from "@/lib/download";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  EMPTY_STATE,
  MAX_TEXT,
  QR_HINWEIS,
  SLUG,
  TEMPLATES,
  TEMPLATE_KEYS,
  ausgabeText,
  buildWaLink,
  buttonSnippet,
  cleanText,
  eingabeText,
  isTemplateKey,
  isUntouched,
  messageFor,
  normalizePhone,
  parseState,
  phoneProblem,
  qrFilename,
  stickerFilename,
  type Phone,
  type TemplateKey,
  type WaState,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const QR_VIEW = 240;
const QR_PNG = 512;
const DOWNLOAD_ERROR = "Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Link.";

function Intro() {
  return (
    <>
      <p>
        Gib deine WhatsApp-Nummer an und wähle, was die Kundschaft als ersten Satz schicken soll. Du bekommst einen wa.me-Link zum Kopieren, einen QR-Code
        als PNG und SVG, einen Knopf für deine Website und einen Aufkleber-Bogen als PDF.
      </p>
      <p>
        Link, QR-Code und PDF entstehen in deinem Browser. Nummer, Vorlage und Nachricht gehen mit dem Ergebnis und deiner E-Mail-Adresse an Alperna, damit wir
        dir bei Fragen weiterhelfen können.
      </p>
    </>
  );
}

type Kind = "png" | "svg" | "pdf";

function ResultView({
  phone,
  text,
  firma,
  headingRef,
  onEdit,
  onNew,
}: {
  phone: Phone;
  text: string;
  firma: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  onEdit: () => void;
  onNew: () => void;
}) {
  const ctx = useToolContext();
  const link = buildWaLink(phone.e164, text);
  const snippet = buttonSnippet(link);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Der QR-Code für die Anzeige entsteht im Browser; bei jedem neuen Link neu.
  useEffect(() => {
    let alive = true;
    setQrUrl(null);
    setQrFailed(false);
    import("./export")
      .then(({ qrDataUrl }) => qrDataUrl(link, QR_VIEW))
      .then((url) => alive && setQrUrl(url))
      .catch(() => alive && setQrFailed(true));
    return () => {
      alive = false;
    };
  }, [link]);

  const download = (kind: Kind) =>
    ctx.guardDownload(async () => {
      setError(null);
      setBusy(kind);
      try {
        const ex = await import("./export");
        if (kind === "png") {
          downloadBytes(await ex.qrPng(link, QR_PNG), qrFilename(firma, "png"), "image/png");
        } else if (kind === "svg") {
          downloadBytes(new TextEncoder().encode(await ex.qrSvg(link)), qrFilename(firma, "svg"), "image/svg+xml");
        } else {
          const { loadPdfFonts } = await import("@/lib/export/fonts");
          const [fonts, qr] = await Promise.all([loadPdfFonts(), ex.qrPng(link, QR_PNG)]);
          const bytes = await ex.buildStickerPdf({ firma, display: phone.display, displayInternational: phone.displayInternational, qr, fonts });
          downloadBytes(bytes, stickerFilename(firma), "application/pdf");
        }
      } catch {
        setError(DOWNLOAD_ERROR);
      } finally {
        setBusy(null);
      }
    });

  return (
    <ResultCard
      title="Dein WhatsApp-Link"
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
      <section aria-label="Link" className="grid gap-3">
        <p className="mono break-all rounded-lg bg-surface px-3 py-2 text-sm" data-testid="wa-link">
          {link}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton text={link} label="Link kopieren" />
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">
            Link im neuen Fenster öffnen
          </a>
        </div>
        <p className="text-sm text-muted-foreground">
          Nummer {phone.displayInternational}
          {text ? "" : ", ohne vorausgefüllten Text"}.
        </p>
      </section>

      <section aria-label="QR-Code" className="grid gap-3">
        <h4 className="font-heading font-medium">QR-Code</h4>
        <div className="flex size-60 max-w-full items-center justify-center rounded-xl border border-line bg-white" data-testid="wa-qr">
          {qrUrl ? (
            // Data-URL aus dem Browser; next/image bringt hier nichts.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrUrl} alt="QR-Code zu deinem WhatsApp-Link" width={QR_VIEW} height={QR_VIEW} className="size-60 max-w-full" />
          ) : (
            <span role="status" aria-live="polite" className="p-4 text-sm text-muted-foreground">
              {qrFailed ? "Der QR-Code konnte nicht erzeugt werden. Der Link oben funktioniert trotzdem." : "QR-Code wird erzeugt …"}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{QR_HINWEIS}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("png")} data-umami-event="export_png" data-umami-event-tool={SLUG}>
            {busy === "png" ? "PNG wird erstellt …" : "PNG herunterladen"}
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("svg")} data-umami-event="export_svg" data-umami-event-tool={SLUG}>
            {busy === "svg" ? "SVG wird erstellt …" : "SVG herunterladen"}
          </Button>
        </div>
      </section>

      <section aria-label="Knopf für die Website" className="grid gap-3">
        <h4 className="font-heading font-medium">Knopf für deine Website</h4>
        <p className="text-sm text-muted-foreground">Füge diesen HTML-Code dort ein, wo der Knopf stehen soll. Er braucht kein Skript und keine weitere Datei.</p>
        <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs" data-testid="wa-snippet">
          <code>{snippet}</code>
        </pre>
        <div>
          <CopyButton text={snippet} label="HTML kopieren" />
        </div>
      </section>

      <section aria-label="Aufkleber" className="grid gap-3">
        <h4 className="font-heading font-medium">Aufkleber zum Drucken</h4>
        <p className="text-sm text-muted-foreground">
          Ein A4-Bogen mit vier Aufklebern in A7 (74 × 105 mm) und Schnittmarken: {firma ? `${firma}, ` : ""}«Schreib uns auf WhatsApp», QR-Code und Nummer.
          Für Tür, Theke, Fahrzeug oder Flyer.
        </p>
        <div>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => download("pdf")} data-umami-event="export_pdf" data-umami-event-tool={SLUG}>
            {busy === "pdf" ? "PDF wird erstellt …" : "Aufkleber-PDF herunterladen"}
          </Button>
        </div>
        {!ctx.email && <p className="text-sm text-muted-foreground">Für Dateien brauchen wir deine E-Mail-Adresse. Link und HTML kannst du immer kopieren.</p>}
        <p role="alert" className="min-h-6 text-sm text-destructive">
          {error}
        </p>
      </section>
    </ResultCard>
  );
}

type Draft = Pick<WaState, "nummer" | "vorlage" | "text">;

function WhatsappFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const firma = profile.firma?.trim() ?? "";
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);

  // Der Entwurf lebt in den Feldern; solange noch nichts eingegeben ist, folgt der Text der Vorlage mit der Firma.
  const [draft, setDraft] = useState<Draft | null>(null);
  const form: Draft = draft ?? (isUntouched(saved) ? { ...saved, text: messageFor(saved.vorlage, firma) } : saved);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nummerRef = useRef<HTMLInputElement>(null);
  const shouldFocus = useRef<"heading" | "nummer" | null>(null);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "nummer") nummerRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };

  const chooseTemplate = (value: string) => {
    const key: TemplateKey = isTemplateKey(value) ? value : "eigener";
    edit({ vorlage: key, text: messageFor(key, firma) });
  };

  async function start() {
    const problem = phoneProblem(form.nummer);
    if (problem) {
      setError(problem);
      nummerRef.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      const phone = normalizePhone(form.nummer);
      if (!phone) return setError(phoneProblem(form.nummer));
      const next: WaState = { v: 1, phase: "result", nummer: form.nummer.trim(), vorlage: form.vorlage, text: cleanText(form.text) };
      shouldFocus.current = "heading";
      set(next);
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(next), ausgabe: ausgabeText({ phone, text: next.text, firma }) });
    } finally {
      setBusy(false);
    }
  }

  const phone = saved.phase === "result" ? normalizePhone(saved.nummer) : null;
  if (ready && phone) {
    return (
      <ResultView
        phone={phone}
        text={saved.text}
        firma={firma}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "nummer";
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "nummer";
          setError(null);
          setDraft(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const len = form.text.length;

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

      <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={busy}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="wa" fields={["firma"]} />
        <p className="text-sm text-muted-foreground">Die Firma steht auf dem Aufkleber und in den Vorlagen. Wir speichern sie in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-5" disabled={busy}>
        <legend className="mb-1 font-heading font-semibold">Dein Link</legend>

        <div className="grid gap-1.5">
          <Label htmlFor="wa-nummer">WhatsApp-Nummer</Label>
          <Input
            id="wa-nummer"
            ref={nummerRef}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="079 123 45 67"
            value={form.nummer}
            maxLength={40}
            onChange={(e) => edit({ nummer: e.target.value })}
            aria-describedby="wa-nummer-help wa-error"
            aria-invalid={Boolean(error)}
            disabled={!ready}
          />
          <p id="wa-nummer-help" className="text-sm text-muted-foreground">
            Die Nummer, auf der WhatsApp läuft. Schweizer Nummern, mit oder ohne +41.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="wa-vorlage">Nachricht</Label>
          <select id="wa-vorlage" className={selectClass} value={form.vorlage} onChange={(e) => chooseTemplate(e.target.value)} disabled={!ready} data-testid="wa-vorlage">
            {TEMPLATE_KEYS.map((k) => (
              <option key={k} value={k}>
                {TEMPLATES[k].label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="wa-text">Vorausgefüllter Text</Label>
          <Textarea
            id="wa-text"
            rows={4}
            value={form.text}
            maxLength={MAX_TEXT}
            onChange={(e) => edit({ text: e.target.value })}
            aria-describedby="wa-text-count"
            lang="de-CH"
            disabled={!ready}
          />
          <p id="wa-text-count" className="mono text-sm text-muted-foreground">
            {len} von {MAX_TEXT} Zeichen. Das steht im Chat der Kundschaft, bevor sie auf Senden tippt. Leer lassen geht auch.
          </p>
        </div>
      </fieldset>

      <p id="wa-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={!ready || busy}>
          Link erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert eine Minute.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <WhatsappFlow />
    </ToolShell>
  );
}
