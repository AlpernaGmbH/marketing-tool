"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBytes } from "@/lib/download";
import { safeFilename } from "@/lib/export/model";
import { useLocalJson } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import {
  ANREDEN,
  DEFAULT_FARBE,
  EMPTY_STATE,
  HELP,
  HINWEIS_GEGENLEISTUNG,
  KANAELE,
  LINK_SCHRITTE,
  PLACE_ID,
  SLUG,
  SMS_MAX,
  STAND_LABELS,
  anredeFromProfile,
  anredeLabel,
  ausgabeText,
  buildTexts,
  eingabeText,
  formProblem,
  isAnrede,
  normalizeHex,
  parseState,
  resolveUrl,
  type Anrede,
  type FormFields,
  type KitState,
  type StandSize,
} from "./logic";
import config from "./tool.config";

const QR_PX = 240;

type Download = StandSize | "aufkleber" | "png";
const DOWNLOADS: { id: Download; label: string }[] = [
  { id: "a6", label: STAND_LABELS.a6 },
  { id: "a5", label: STAND_LABELS.a5 },
  { id: "aufkleber", label: "Aufkleber-Bogen (PDF)" },
  { id: "png", label: "QR als PNG" },
];

function Intro() {
  return (
    <>
      <p>
        Gib den Bewertungslink deines Google-Unternehmensprofils an. Daraus entstehen ein QR-Code, Tischaufsteller in A6 und A5 mit je zwei Layouts, ein
        Bogen mit acht Aufklebern und drei Anfrage-Texte für SMS, WhatsApp und E-Mail, in Du- und Sie-Fassung.
      </p>
      <p>
        Alles entsteht in deinem Browser. Link, Anrede und Farbe gehen mit deiner E-Mail-Adresse und den Vorlagen an Alperna, damit wir dir bei Fragen
        weiterhelfen können.
      </p>
    </>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
      {children}
    </a>
  );
}

function ResultView({
  state,
  firma,
  url,
  onEdit,
  onNew,
  headingRef,
}: {
  state: KitState;
  firma: string;
  url: string;
  onEdit: () => void;
  onNew: () => void;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  const ctx = useToolContext();
  const [anrede, setAnrede] = useState<Anrede>(isAnrede(state.anrede) ? state.anrede : "du");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<Download | null>(null);
  const [error, setError] = useState<string | null>(null);
  const texte = useMemo(() => buildTexts(anrede, firma, url), [anrede, firma, url]);

  useEffect(() => {
    let alive = true;
    import("./export")
      .then(({ qrDataUrl }) => qrDataUrl(url, QR_PX * 2))
      .then((data) => {
        if (alive) setQr(data);
      })
      .catch(() => {
        if (alive) setError("Der QR-Code konnte nicht erzeugt werden. Prüfe den Link.");
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const input = { firma, link: url, anrede: isAnrede(state.anrede) ? state.anrede : anrede, farbe: normalizeHex(state.farbe) };
  const base = safeFilename(firma, "bewertung");

  async function run(kind: Download) {
    setError(null);
    setBusy(kind);
    try {
      const exp = await import("./export");
      if (kind === "png") {
        downloadBytes(await exp.qrPng(url), `qr-google-bewertung-${base}.png`, "image/png");
        return;
      }
      const { loadPdfFonts } = await import("@/lib/export/fonts");
      const fonts = await loadPdfFonts();
      if (kind === "aufkleber") {
        downloadBytes(await exp.buildStickerSheetPdf(input, fonts), `aufkleber-google-bewertung-${base}.pdf`, "application/pdf");
      } else {
        downloadBytes(await exp.buildStandPdf(kind, input, fonts), `aufsteller-${kind}-google-bewertung-${base}.pdf`, "application/pdf");
      }
    } catch {
      setError("Der Download hat nicht geklappt. Versuch es noch einmal.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ResultCard
      title="Dein Bewertungs-Kit"
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
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="rounded-xl border border-line bg-white p-2" style={{ width: QR_PX + 16, height: QR_PX + 16 }}>
          {qr ? (
            <Image src={qr} alt="QR-Code zu deiner Google-Bewertung" width={QR_PX} height={QR_PX} unoptimized data-testid="qr-image" />
          ) : (
            <p role="status" className="grid h-full place-items-center text-sm text-muted-foreground">
              QR-Code wird erzeugt.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <p className="eyebrow">Dein Bewertungslink</p>
          <p className="mono break-all text-sm" data-testid="review-link">
            {url}
          </p>
          <div>
            <CopyButton text={url} label="Link kopieren" />
          </div>
          <p className="text-sm text-muted-foreground">
            Für {firma}, Anrede {anredeLabel(input.anrede)}, Akzentfarbe <span className="mono">{input.farbe}</span>.
          </p>
        </div>
      </div>

      <section aria-label="Downloads" className="grid gap-3">
        <h4 className="font-heading font-medium">Zum Drucken</h4>
        <div className="flex flex-wrap items-center gap-3">
          {DOWNLOADS.map((d) => (
            <Button
              key={d.id}
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => ctx.guardDownload(() => run(d.id))}
              data-testid={`download-${d.id}`}
              data-umami-event={d.id === "png" ? "export_png" : "export_pdf"}
              data-umami-event-tool={ctx.slug}
            >
              {busy === d.id ? "Wird erstellt …" : d.label}
            </Button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Aufsteller mit zwei Layouts je Datei (A6 hoch, A5 hoch), Aufkleber-Bogen A4 mit acht Stück 50 × 50 mm und Schnittmarken, QR-Code {"1'024"} Pixel.
          {!ctx.email && " Für Dateien brauchen wir deine E-Mail-Adresse."}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <section aria-label="Anfrage-Vorlagen" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-heading font-medium">Anfrage-Vorlagen</h4>
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
        <p className="text-sm text-muted-foreground">Ersetze [Name] und [Auftrag], bevor du den Text verschickst.</p>
        <ul className="grid gap-3" aria-label="Vorlagen">
          {KANAELE.map((k) => (
            <li key={k.value} className="grid gap-2 rounded-xl border border-line bg-paper p-4" data-testid={`vorlage-${k.value}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{k.label}</span>
                {k.value === "sms" && (
                  <span className="mono text-sm text-muted-foreground">
                    {texte.sms.length} Zeichen, Richtwert {SMS_MAX}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{texte[k.value]}</p>
              <div>
                <CopyButton text={texte[k.value]} label={k.copyLabel} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Hinweis zu Gegenleistungen" className="grid gap-2 rounded-xl bg-surface p-4 text-sm" data-testid="hinweis-gegenleistung">
        <p>{HINWEIS_GEGENLEISTUNG}</p>
        <p className="text-muted-foreground">
          Nachzulesen bei Google: <ExternalLink href={HELP.richtlinie.url}>{HELP.richtlinie.title}</ExternalLink> und{" "}
          <ExternalLink href={HELP.tipps.url}>{HELP.tipps.title}</ExternalLink>.
        </p>
      </section>
    </ResultCard>
  );
}

function KitFlow() {
  const ctx = useToolContext();
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(`mt:${SLUG}`, parseState);
  const firma = (profile.firma ?? "").trim();

  const [draft, setDraft] = useState<FormFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const shouldFocus = useRef<"heading" | "link" | null>(null);

  // Die Anrede kommt aus dem Firmenprofil, solange im Werkzeug keine gewählt ist (Harte Regel 10).
  const form: FormFields = draft ?? {
    link: saved.link,
    placeId: saved.placeId,
    anrede: saved.anrede || (profileReady ? anredeFromProfile(profile) : ""),
    farbe: saved.farbe,
  };

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Der Entwurf lebt in den Feldern, der Speicher folgt mit etwas Verzögerung.
  useEffect(() => {
    if (draft === null) return;
    const s = savedRef.current;
    if (draft.link === s.link && draft.placeId === s.placeId && draft.anrede === s.anrede && draft.farbe === s.farbe) return;
    const timer = setTimeout(() => set({ ...savedRef.current, phase: "edit", ...draft }), 500);
    return () => clearTimeout(timer);
  }, [draft, set]);

  // Fokus nur nach einer Aktion des Besuchers, nicht beim Wiederherstellen aus dem Speicher.
  useEffect(() => {
    if (shouldFocus.current === "heading") headingRef.current?.focus();
    if (shouldFocus.current === "link") linkRef.current?.focus();
    shouldFocus.current = null;
  }, [saved.phase]);

  const edit = (patch: Partial<FormFields>) => {
    setDraft({ ...form, ...patch });
    setError(null);
  };

  async function start() {
    const problem = formProblem(form, profile);
    if (problem) return setError(problem);
    const url = resolveUrl(form);
    if (!url || !isAnrede(form.anrede)) return;
    setError(null);
    setBusy(true);
    try {
      if (!(await ctx.ensureEmail())) return;
      shouldFocus.current = "heading";
      const next: KitState = {
        v: 1,
        phase: "result",
        link: form.link.trim(),
        placeId: form.placeId.trim(),
        anrede: form.anrede,
        farbe: normalizeHex(form.farbe),
      };
      set(next);
      setDraft(null);
      void ctx.sendResult({ eingabe: eingabeText(next, firma), ausgabe: ausgabeText(url, form.anrede, buildTexts(form.anrede, firma, url)) });
    } finally {
      setBusy(false);
    }
  }

  const url = saved.phase === "result" ? resolveUrl(saved) : null;
  if (ready && profileReady && saved.phase === "result" && url) {
    return (
      <ResultView
        state={saved}
        firma={firma || "Dein Betrieb"}
        url={url}
        headingRef={headingRef}
        onEdit={() => {
          shouldFocus.current = "link";
          set({ ...saved, phase: "edit" });
        }}
        onNew={() => {
          shouldFocus.current = "link";
          setError(null);
          setDraft(null);
          set(EMPTY_STATE);
        }}
      />
    );
  }

  const disabled = !ready || !profileReady || busy;

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

      <fieldset className="grid gap-4 rounded-xl border border-line p-4" disabled={disabled}>
        <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
        <ProfileFieldsForm idPrefix="bk" fields={["firma"]} />
        <p className="text-sm text-muted-foreground">Die Firma steht auf den Aufstellern und in den Vorlagen. Wir speichern sie in deinem Firmenprofil, in deinem Browser.</p>
      </fieldset>

      <fieldset className="grid gap-5" disabled={disabled}>
        <legend className="mb-1 font-heading font-semibold">Dein Bewertungslink</legend>

        <div className="grid gap-1.5">
          <Label htmlFor="bk-link">Dein Google-Bewertungslink</Label>
          <Input
            id="bk-link"
            ref={linkRef}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={form.link}
            onChange={(e) => edit({ link: e.target.value })}
            placeholder="https://g.page/r/…/review"
            aria-describedby="bk-link-help bk-error"
            aria-invalid={Boolean(error)}
          />
          <details id="bk-link-help" className="rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium">So findest du den Link</summary>
            <ol className="mt-2 grid list-decimal gap-1.5 pl-5">
              {LINK_SCHRITTE.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="mt-2 text-muted-foreground">
              Anleitung von Google: <ExternalLink href={HELP.linkHilfe.url}>{HELP.linkHilfe.title}</ExternalLink>.
            </p>
          </details>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="bk-placeid">Oder die Place-ID</Label>
          <Input
            id="bk-placeid"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={PLACE_ID.max}
            value={form.placeId}
            onChange={(e) => edit({ placeId: e.target.value })}
            placeholder="ChIJ…"
            aria-describedby="bk-placeid-help"
          />
          <p id="bk-placeid-help" className="text-sm text-muted-foreground">
            Die Kennung deines Standorts bei Google, {PLACE_ID.min} bis {PLACE_ID.max} Zeichen ohne Leerzeichen. Daraus bauen wir den Bewertungslink. Ein
            eingetragener Link hat Vorrang.
          </p>
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <fieldset className="grid gap-2" disabled={disabled}>
          <legend className="mb-1 font-medium">Anrede deiner Kundschaft</legend>
          <div className="flex flex-wrap gap-3">
            {ANREDEN.map((a) => (
              <label
                key={a.value}
                htmlFor={`bk-anrede-${a.value}`}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input px-4 py-2 has-[:checked]:border-ink has-[:checked]:bg-surface"
              >
                <input
                  id={`bk-anrede-${a.value}`}
                  type="radio"
                  name="bk-anrede"
                  value={a.value}
                  checked={form.anrede === a.value}
                  onChange={() => edit({ anrede: a.value })}
                  className="size-5 accent-ink"
                />
                {a.label}
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Gilt für Aufsteller, Aufkleber und Vorlagen. Umschalten kannst du im Ergebnis.</p>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="bk-farbe">Akzentfarbe</Label>
          <div className="flex items-center gap-3">
            <Input
              id="bk-farbe"
              type="color"
              value={normalizeHex(form.farbe).toLowerCase()}
              onChange={(e) => edit({ farbe: e.target.value })}
              aria-describedby="bk-farbe-help"
              className="h-11 w-20 cursor-pointer p-1"
              disabled={disabled}
            />
            <span className="mono text-sm">{normalizeHex(form.farbe)}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => edit({ farbe: DEFAULT_FARBE })} disabled={disabled}>
              Zurücksetzen
            </Button>
          </div>
          <p id="bk-farbe-help" className="text-sm text-muted-foreground">
            Für Rahmen und Titel der Aufsteller. Der QR-Code bleibt schwarz, damit er lesbar bleibt. Zu helle Farben lehnt das Werkzeug ab.
          </p>
        </div>
      </div>

      <p id="bk-error" role="alert" className="min-h-6 text-destructive">
        {error}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={disabled}>
          Kit erstellen
        </Button>
        <span className="text-sm text-muted-foreground">Dauert etwa drei Minuten.</span>
      </div>
    </form>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <KitFlow />
    </ToolShell>
  );
}
