"use client";

import { useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { dateCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { safeFilename, toMarkdown, type DocumentModel } from "@/lib/export/model";

type Format = "pdf" | "docx";

const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

type Props = {
  model: DocumentModel;
  /** Vereinsfarbe als Hex-Wert für Deckblatt, Kopf und Tabellenkopf im PDF. */
  farbe: string;
};

/**
 * Text kopieren (frei), PDF mit Vereinsfarbe und Word (erst nach der E-Mail-Adresse, über guardDownload). Wie
 * components/tool/DocumentExport, aber das PDF kommt aus ./export (mit Vereinsfarbe). Die Bibliotheken laden erst beim Klick.
 */
export function DossierExport({ model, farbe }: Props) {
  const ctx = useToolContext();
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  const full = (): DocumentModel => ({ ...model, datum: model.datum ?? dateCH(new Date()) });

  async function run(format: Format) {
    setError(null);
    setBusy(format);
    try {
      const doc = full();
      const name = `${safeFilename(doc.filename)}.${format}`;
      if (format === "pdf") {
        const [{ buildDossierPdf }, { loadPdfFonts }] = await Promise.all([import("./export"), import("@/lib/export/fonts")]);
        downloadBytes(await buildDossierPdf(doc, farbe, await loadPdfFonts()), name, MIME.pdf);
      } else {
        const { buildDocx } = await import("@/lib/export/docx");
        downloadBytes(await buildDocx(doc), name, MIME.docx);
      }
    } catch {
      setError("Der Download hat nicht geklappt. Versuch es noch einmal oder kopiere den Text.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={() => toMarkdown(full())} label="Text kopieren" />
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => ctx.guardDownload(() => run("pdf"))}
          data-umami-event="export_pdf"
          data-umami-event-tool={ctx.slug}
        >
          {busy === "pdf" ? "PDF wird erstellt …" : "PDF herunterladen"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => ctx.guardDownload(() => run("docx"))}
          data-umami-event="export_docx"
          data-umami-event-tool={ctx.slug}
        >
          {busy === "docx" ? "Word wird erstellt …" : "Word herunterladen"}
        </Button>
      </div>
      {!ctx.email && <p className="text-sm text-muted-foreground">Für Dateien brauchen wir deine E-Mail-Adresse. Das Dossier oben kannst du immer kopieren.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
