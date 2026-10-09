"use client";

import { useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button } from "@/components/ui/button";
import {
  ARTEN,
  ART_TITEL,
  TEXT_MAX,
  anwenden,
  kiReport,
  textcheckGenerator,
  type Aenderung,
  type Art,
  type CheckOutput,
} from "./generator";

// «Mit KI prüfen»: Rechtschreibung, Grammatik und Stil als Liste einzelner Änderungen. Der Text geht erst beim Klick an den Server
// (und von dort an den KI-Anbieter), nie von selbst. Jedes Original steht nachweislich im Text; die korrigierte Fassung setzt das
// Werkzeug selbst aus den Änderungen zusammen. Die festen Prüfungen im Browser bleiben davon unberührt.

const LIMIT_LABEL = TEXT_MAX.toLocaleString("en-US").replace(/,/g, "'");
const LOADING_STEPS = ["Text lesen", "Fehler suchen", "Änderungen kontrollieren"];

type Shown = { text: string; output: CheckOutput };

function Liste({ art, items, offset }: { art: Art; items: Aenderung[]; offset: number }) {
  return (
    <section aria-label={ART_TITEL[art]} className="grid gap-2">
      <h5 className="font-heading font-semibold">{ART_TITEL[art]}</h5>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{art === "fehler" ? "Die KI hat keine Fehler gefunden." : "Die KI schlägt keine Verbesserungen vor."}</p>
      ) : (
        <ol className="grid gap-2">
          {items.map((a, i) => (
            <li key={`${a.original}-${i}`} className="grid gap-1.5 rounded-xl border border-line bg-paper px-4 py-3 text-sm" data-testid="ki-aenderung">
              <p>
                <span className="text-muted-foreground">Original: </span>
                <span className="break-words line-through decoration-1">{a.original}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Vorschlag: </span>
                <span className="break-words font-medium">{a.vorschlag}</span>
              </p>
              <p className="text-muted-foreground">{a.grund}</p>
              <div>
                <CopyButton text={a.vorschlag} label={`Vorschlag ${offset + i + 1} kopieren`} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AiPanel({ source }: { source: string }) {
  const text = source.trim();
  const textRef = useRef(text);
  const gen = useGenerator(textcheckGenerator, {
    eingabe: (i) => i.text,
    ausgabe: (o) => kiReport(textRef.current, o),
    loadingSteps: LOADING_STEPS,
  });
  const [shown, setShown] = useState<Shown | null>(null);
  const tooLong = text.length > TEXT_MAX;
  const busy = gen.busy;

  async function run() {
    textRef.current = text;
    const output = await gen.generate({ text });
    if (output) setShown({ text, output });
  }

  const korrigiert = shown ? anwenden(shown.text, shown.output.aenderungen) : null;
  const fehler = shown?.output.aenderungen.filter((a) => a.art === "fehler") ?? [];
  const stil = shown?.output.aenderungen.filter((a) => a.art === "stil") ?? [];
  const veraltet = shown !== null && shown.text !== text;

  return (
    <section aria-labelledby="tc-ai" className="grid gap-3 rounded-xl border border-line p-4 md:p-5" data-testid="ki-pruefung">
      <h4 id="tc-ai">Rechtschreibung und Grammatik mit KI</h4>
      <p className="text-sm text-muted-foreground">
        Der Textcheck oben kennt keine Wörter. Die KI liest den Text wie eine Lektorin: Sie nennt einzelne Stellen mit Fehlern oder Verbesserungen und schlägt
        je einen Ersatz vor. Dafür geht dein Text an unseren Server und von dort an unseren KI-Anbieter, nicht deine E-Mail-Adresse. Unser Server speichert ihn
        nicht. Der Text und die Prüfung gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
      </p>

      {tooLong ? (
        <p role="note" className="text-sm">
          Für die KI ist der Text zu lang (höchstens {LIMIT_LABEL} Zeichen). Prüfe ihn abschnittsweise.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void run()} disabled={busy || text === ""}>
            {busy ? "Die KI liest …" : shown ? "Noch einmal prüfen" : "Mit KI prüfen"}
          </Button>
        </div>
      )}

      <p role="status" className="sr-only">
        {busy ? "Die KI liest deinen Text." : ""}
      </p>
      {gen.error && (
        <p role="alert" className="text-destructive">
          {gen.error}
        </p>
      )}

      {shown && korrigiert && (
        <div className="grid gap-4" data-testid="ki-ergebnis">
          <p className="text-sm text-muted-foreground">Von einer KI formuliert. Prüfe jeden Vorschlag, bevor du ihn übernimmst.</p>
          {veraltet && (
            <p role="note" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="ki-veraltet">
              Du hast den Text seit der Prüfung geändert. Prüfe noch einmal, dann passen die Stellen wieder.
            </p>
          )}
          <section aria-label="Gesamteindruck" className="grid gap-1">
            <h5 className="font-heading font-semibold">Gesamteindruck</h5>
            <p>{shown.output.gesamt}</p>
          </section>
          {ARTEN.map((art) => (
            <Liste key={art} art={art} items={art === "fehler" ? fehler : stil} offset={art === "fehler" ? 0 : fehler.length} />
          ))}
          {korrigiert.angewendet > 0 && (
            <section aria-label="Korrigierter Text" className="grid gap-2">
              <h5 className="font-heading font-semibold">Korrigierter Text</h5>
              <p className="text-sm text-muted-foreground">
                {korrigiert.angewendet === 1 ? "Eine Stelle ist korrigiert." : `${korrigiert.angewendet} Stellen sind korrigiert.`} Die Verbesserungen übernimmst du selbst.
              </p>
              <p className="whitespace-pre-wrap">{korrigiert.text}</p>
            </section>
          )}
          <div className="flex flex-wrap gap-3">
            {korrigiert.angewendet > 0 && <CopyButton text={korrigiert.text} label="Korrigierten Text kopieren" variant="default" />}
            <CopyButton text={kiReport(shown.text, shown.output)} label="Alles kopieren" />
          </div>
        </div>
      )}
    </section>
  );
}
