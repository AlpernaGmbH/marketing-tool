"use client";

import { useCallback, useState } from "react";
import { useToolContext } from "@/components/tool/ToolShell";
import { GENERATE_FAIL_MESSAGES, requestGenerate } from "@/lib/generate-client";
import type { GeneratorDef } from "@/lib/generator";

type Options<I, O> = {
  /** Die Eingaben als lesbarer Text fürs CRM (Zugang v3). */
  eingabe: (input: I) => string;
  /** Der Entwurf als lesbarer Text fürs CRM (zum Beispiel toMarkdown(toDocument(output))). */
  ausgabe: (output: O) => string;
};

/**
 * Ablauf eines Generator-Werkzeugs (Zugang v3): Adresse sicherstellen, Entwurf holen, bei 403 das Fenster zeigen und
 * einmal wiederholen, danach Eingabe und Entwurf ins CRM geben. Den Stand (Eingaben, Entwurf) hält das Werkzeug selbst
 * (useLocalJson), damit er nach dem Neuladen noch da ist.
 */
export function useGenerator<I, O>(def: GeneratorDef<I, O>, opts: Options<I, O>) {
  const ctx = useToolContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (input: I): Promise<O | null> => {
      setError(null);
      setBusy(true);
      try {
        if (!(await ctx.ensureEmail())) return null;
        let outcome = await requestGenerate(def, input);
        // Der Server kennt keine Adresse (Cookie fehlt): erst das Fenster, dann einmal wiederholen.
        if (!outcome.ok && outcome.reason === "gate") {
          if (!(await ctx.renewEmail())) return null;
          outcome = await requestGenerate(def, input);
        }
        if (!outcome.ok) {
          setError(GENERATE_FAIL_MESSAGES[outcome.reason]);
          return null;
        }
        void ctx.sendResult({ eingabe: opts.eingabe(input), ausgabe: opts.ausgabe(outcome.output) });
        return outcome.output;
      } finally {
        setBusy(false);
      }
    },
    // def und opts sind pro Werkzeug fest definiert
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, def.slug],
  );

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, generate, clearError };
}
