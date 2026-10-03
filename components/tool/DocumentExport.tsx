"use client";

import { useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { dateCH } from "@/lib/ch";
import { downloadBytes } from "@/lib/download";
import { safeFilename, toMarkdown, type DocumentModel } from "@/lib/export/model";
import { useProfile } from "@/lib/use-profile";

type Format = "pdf" | "docx";

type Props = {
  model: DocumentModel;
  /** Standard: PDF und Word. Text kopieren gibt es immer und ist nie gesperrt. */
  formats?: Format[];
};

const MIME: Record<Format, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Text kopieren (frei), PDF und Word (erst nach dem Formular). Die Bibliotheken laden erst beim Klick. */
export function DocumentExport({ model, formats = ["pdf", "docx"] }: Props) {
  const ctx = useToolContext();
  const { profile } = useProfile();
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  const full = (): DocumentModel => ({
    ...model,
    firma: model.firma ?? profile.firma,
    datum: model.datum ?? dateCH(new Date()),
  });

  async function run(format: Format) {
    setError(null);
    setBusy(format);
    try {
      const doc = full();
      const name = `${safeFilename(doc.filename)}.${format}`;
      if (format === "pdf") {
        const [{ buildPdf }, { loadPdfFonts }] = await Promise.all([import("@/lib/export/pdf"), import("@/lib/export/fonts")]);
        downloadBytes(await buildPdf(doc, await loadPdfFonts()), name, MIME.pdf);
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
        {formats.includes("pdf") && (
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
        )}
        {formats.includes("docx") && (
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
        )}
      </div>
      {!ctx.unlocked && <p className="text-sm text-muted-foreground">Dateien gibt es nach einem kurzen Formular. Das Ergebnis oben kannst du immer kopieren.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
