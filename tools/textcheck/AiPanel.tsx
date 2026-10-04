"use client";

import { useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { useToolContext } from "@/components/tool/ToolShell";
import { Button } from "@/components/ui/button";
import { requestRewrite } from "@/tools/text-umschreiber/client";
import { FAIL_MESSAGES, MAX_INPUT_CHARS, parseCheckReply, type CheckSection } from "@/tools/text-umschreiber/logic";

// «Mit KI prüfen»: Rechtschreibung, Grammatik und Stil. Der Text geht erst beim Klick an den Server (und von dort an den
// KI-Anbieter), nie von selbst. Die festen Prüfungen im Browser bleiben davon unberührt.

type Status = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; text: string };

const LIMIT_LABEL = MAX_INPUT_CHARS.toLocaleString("en-US").replace(/,/g, "'");

function Sections({ sections }: { sections: CheckSection[] }) {
  return (
    <div className="grid gap-4">
      {sections.map((s) => (
        <section key={s.title} aria-label={s.title} className="grid gap-2">
          <h5 className="font-heading font-semibold">{s.title}</h5>
          {s.title === "Korrigierter Text" || s.title === "Gesamteindruck" ? (
            <p className="whitespace-pre-wrap">{s.lines.join("\n")}</p>
          ) : (
            <ul className="grid gap-2">
              {s.lines
                .filter((l) => l.trim())
                .map((l, i) => (
                  <li key={`${i}-${l}`} className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
                    {l}
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

export function AiPanel({ source }: { source: string }) {
  const ctx = useToolContext();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const tooLong = source.length > MAX_INPUT_CHARS;

  async function run() {
    setStatus({ kind: "loading" });
    let outcome = await requestRewrite({ text: source, styleId: "pruefen", anrede: "wie-im-text" });
    // Der freie Durchlauf ist mit der Prüfung im Browser gebraucht: erst das Formular, dann einmal wiederholen.
    if (!outcome.ok && outcome.reason === "gate") {
      if (!(await ctx.requestStart())) return setStatus({ kind: "idle" });
      outcome = await requestRewrite({ text: source, styleId: "pruefen", anrede: "wie-im-text" });
    }
    setStatus(outcome.ok ? { kind: "done", text: outcome.text } : { kind: "error", message: FAIL_MESSAGES[outcome.reason] });
  }

  const sections = status.kind === "done" ? parseCheckReply(status.text) : null;
  const corrected = sections?.find((s) => s.title === "Korrigierter Text");

  return (
    <section aria-labelledby="tc-ai" className="grid gap-3 rounded-xl border border-line p-4 md:p-5" data-testid="ki-pruefung">
      <h4 id="tc-ai">Rechtschreibung und Grammatik mit KI</h4>
      <p className="text-sm text-muted-foreground">
        Der Textcheck oben kennt keine Wörter. Die KI liest den Text wie eine Lektorin: Sie sucht Rechtschreib- und Grammatikfehler und schlägt Verbesserungen vor.
        Dafür geht dein Text an unseren Server und von dort an unseren KI-Anbieter. Wir speichern ihn nicht. Gib nichts Vertrauliches ein.
      </p>

      {tooLong ? (
        <p role="note" className="text-sm">
          Für die KI ist der Text zu lang (höchstens {LIMIT_LABEL} Zeichen). Prüfe ihn abschnittsweise.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void run()} disabled={status.kind === "loading"}>
            {status.kind === "loading" ? "Die KI liest …" : status.kind === "done" ? "Noch einmal prüfen" : ctx.unlocked ? "Mit KI prüfen" : "Mit KI prüfen (kurzes Formular)"}
          </Button>
        </div>
      )}

      <p role="status" className="sr-only">
        {status.kind === "loading" ? "Die KI liest deinen Text." : ""}
      </p>
      {status.kind === "error" && (
        <p role="alert" className="text-destructive">
          {status.message}
        </p>
      )}

      {status.kind === "done" && (
        <div className="grid gap-4" data-testid="ki-ergebnis">
          <p className="text-sm text-muted-foreground">Von einer KI formuliert. Prüfe jeden Vorschlag, bevor du ihn übernimmst.</p>
          {sections ? <Sections sections={sections} /> : <p className="whitespace-pre-wrap">{status.text}</p>}
          <div className="flex flex-wrap gap-3">
            {corrected && <CopyButton text={corrected.lines.join("\n")} label="Korrigierten Text kopieren" variant="default" />}
            <CopyButton text={status.text} label="Alles kopieren" />
          </div>
        </div>
      )}
    </section>
  );
}
