"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CopyButton } from "@/components/tool/CopyButton";
import { DocumentExport } from "@/components/tool/DocumentExport";
import { ProfileFieldsForm } from "@/components/tool/ProfileFieldsForm";
import { ResultCard } from "@/components/tool/ResultCard";
import { ToolShell } from "@/components/tool/ToolShell";
import { useGenerator } from "@/components/tool/useGenerator";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateCH } from "@/lib/ch";
import { placeholdersIn } from "@/lib/generator";
import { writeLocal } from "@/lib/storage";
import { useLocalJson, useLocalRaw } from "@/lib/use-local";
import { useProfile } from "@/lib/use-profile";
import { LIMITS, postGenerator, type PlattformKey, type PostInput } from "./generator";
import {
  ANREDEN,
  EMPTY_FORM,
  EMPTY_STATE,
  FOLD_NOTE,
  FORMATE,
  HASHTAGS_MAX,
  KI_HINWEIS,
  MAX_ENTWUERFE,
  MERKLISTE_KEY,
  PLATTFORMEN,
  STORAGE_KEY,
  TEXTCHECK_KEY,
  TEXTCHECK_PATH,
  ZIELE,
  addDraft,
  charCount,
  compose,
  counterLabel,
  eingabeText,
  foldHint,
  foldInfo,
  hatAnredeImProfil,
  hatHashtags,
  hinweisNamen,
  hinweisOf,
  ideeText,
  inputProblem,
  isAnrede,
  isFormat,
  isPlattform,
  isZiel,
  joinNamen,
  newDraft,
  parseState,
  plattformLabel,
  profilTeile,
  removeDraft,
  reportMarkdown,
  resolveAnrede,
  splitAtFold,
  textcheckState,
  toDocument,
  toForm,
  toInput,
  type Entwurf,
  type FormValues,
  type HookIndex,
  type MerkIdee,
} from "./logic";
import config from "./tool.config";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-paper px-3 text-base focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const choice =
  "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input px-4 py-3 has-[:checked]:border-ink has-[:checked]:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";

function Intro() {
  return (
    <p>
      Schreib deine Idee in ein bis drei Sätzen und wähl Plattform, Format und Ziel. Eine KI macht daraus einen Beitrag in deinem Ton: zwei Varianten für den
      ersten Satz, einen Hauptteil und eine Aufforderung. Die Hashtags schreibst du selbst.
    </p>
  );
}

/**
 * Die gemerkten Ideen aus dem Werkzeug «Content-Ideen» (mt:merkliste). Die Ideen kommen aus dem Datensatz dieses
 * Werkzeugs; er wird erst geladen, wenn es eine Merkliste gibt. Fehlt das Werkzeug oder ist die Liste kaputt, bleibt die Liste leer.
 */
function useMerkIdeen(): MerkIdee[] {
  const raw = useLocalRaw(MERKLISTE_KEY);
  const [geladen, setGeladen] = useState<{ raw: string; ideen: MerkIdee[] } | null>(null);
  useEffect(() => {
    if (!raw) return;
    let abgebrochen = false;
    import("@/tools/content-ideen/logic")
      .then((m) => {
        let data: unknown = null;
        try {
          data = JSON.parse(raw);
        } catch {
          data = null;
        }
        const ideen = m.merkIdeen(m.parseMerkliste(data).ideen).map((i) => ({ id: i.id, titel: i.titel, text: ideeText(i) }));
        if (!abgebrochen) setGeladen({ raw, ideen });
      })
      .catch(() => {
        if (!abgebrochen) setGeladen({ raw, ideen: [] });
      });
    return () => {
      abgebrochen = true;
    };
  }, [raw]);
  return raw && geladen?.raw === raw ? geladen.ideen : [];
}

// ---- Ergebnis --------------------------------------------------------------------------------------

function Preview({ platform, text }: { platform: PlattformKey; text: string }) {
  const { over } = foldInfo(platform, text);
  const { before, after } = splitAtFold(platform, text);
  return (
    <section aria-label={`Vorschau ${plattformLabel(platform)}`} className="grid gap-3">
      <div className="rounded-xl border border-line bg-paper p-4" data-testid="pg-preview">
        <p className="eyebrow mb-2">{plattformLabel(platform)}</p>
        <p lang="de-CH" className="break-words whitespace-pre-wrap" data-testid="pg-text">
          <span>{before}</span>
          {after && (
            <span className="rounded-sm bg-surface text-muted-foreground" data-testid="pg-over">
              {after}
            </span>
          )}
        </p>
      </div>
      <p className="mono text-sm" data-testid="pg-counter">
        {counterLabel(platform, text)}
      </p>
      <p className="text-sm text-muted-foreground">
        {foldHint(platform, over)} {FOLD_NOTE}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton text={text} label="Beitrag kopieren" />
      </div>
    </section>
  );
}

function Entwuerfe({ list, onLoad, onDelete, showEmpty }: { list: Entwurf[]; onLoad: (d: Entwurf) => void; onDelete: (d: Entwurf) => void; showEmpty: boolean }) {
  const uid = useId();
  if (list.length === 0 && !showEmpty) return null;
  return (
    <section aria-label="Deine Entwürfe" className="grid gap-3 rounded-xl border border-line p-4">
      <h3 className="font-heading text-lg font-medium">Deine Entwürfe</h3>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch kein Entwurf gemerkt. Es passen bis zu {MAX_ENTWUERFE}; beim nächsten fällt der älteste weg. Entwürfe bleiben in deinem Browser.
        </p>
      ) : (
        <ul aria-label="Gemerkte Entwürfe" className="grid gap-2">
          {list.map((d) => {
            const titleId = `${uid}-${d.id}`;
            return (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                <p id={titleId} className="min-w-0 break-words">
                  <span className="block font-medium">{d.titel}</span>
                  <span className="mono block text-sm text-muted-foreground">
                    {plattformLabel(d.input.plattform)}, {dateCH(d.gespeichertAm)}
                  </span>
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onLoad(d)} aria-describedby={titleId}>
                    Laden
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(d)} aria-describedby={titleId}>
                    Löschen
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---- Ablauf ----------------------------------------------------------------------------------------

function PostFlow() {
  const { profile, ready: profileReady } = useProfile();
  const { value: saved, ready, set } = useLocalJson(STORAGE_KEY, parseState);
  const merk = useMerkIdeen();

  // useGenerator hält seine Optionen fest; die Eingabe für das CRM-Dokument kommt darum über einen Ref.
  const inputRef = useRef<PostInput | null>(null);
  const gen = useGenerator(postGenerator, {
    eingabe: eingabeText,
    ausgabe: (o) => (inputRef.current ? reportMarkdown(o, inputRef.current) : ""),
  });

  // null: die Person hat noch nichts getippt. Dann gelten die gespeicherten Angaben (auch ohne Ergebnis), sonst die Standardwerte.
  const [typed, setTyped] = useState<FormValues | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);

  const savedRef = useRef(saved);
  useEffect(() => {
    savedRef.current = saved;
  }, [saved]);

  // Fokus nur nach einer Aktion der Person, nicht beim Wiederherstellen aus dem Speicher; erst wenn die Karte da ist.
  useEffect(() => {
    if (!shouldFocus.current || gen.busy) return;
    headingRef.current?.focus();
    shouldFocus.current = false;
  }, [saved.output, gen.busy]);

  const busy = gen.busy;
  const shownError = error ?? gen.error;
  const output = ready ? saved.output : null;
  const savedInput = ready ? saved.input : null;
  const showForm = !output || editing;
  const form = typed ?? (savedInput ? toForm(savedInput) : EMPTY_FORM);

  const teile = profilTeile(profile);
  const namen = hinweisNamen(teile, form.saeule);
  const anrede = resolveAnrede(form.anrede, profile);
  const anredeAusProfil = form.anrede === "" && hatAnredeImProfil(profile);

  const patch = (p: Partial<FormValues>) => {
    setError(null);
    setNote("");
    setTyped({ ...form, ...p });
  };

  async function run(input: PostInput) {
    setError(null);
    setNote("");
    gen.clearError();
    inputRef.current = input;
    // generate() macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; bei einem Fehler steht gen.error.
    const result = await gen.generate(input);
    if (!result) return;
    shouldFocus.current = true;
    setEditing(false);
    set({ ...savedRef.current, v: 1, input, output: result, hook: 0 });
  }

  async function start() {
    const problem = inputProblem({ firma: profile.firma }, form);
    if (problem) {
      setError(problem.message);
      document.getElementById(problem.fieldId)?.focus();
      return;
    }
    await run(toInput(profile, form));
  }

  const edit = () => {
    if (!savedInput) return;
    setError(null);
    setNote("");
    gen.clearError();
    setTyped(toForm(savedInput));
    setEditing(true);
    // Das Formular erscheint erst mit dem nächsten Rendern; der Fokus folgt danach.
    setTimeout(() => document.getElementById("pg-idee")?.focus(), 0);
  };

  const restart = () => {
    setError(null);
    setNote("");
    gen.clearError();
    setTyped(EMPTY_FORM);
    setEditing(false);
    set({ ...EMPTY_STATE, entwuerfe: saved.entwuerfe });
  };

  const chooseHook = (hook: HookIndex) => {
    setNote("");
    set({ ...saved, hook });
  };

  const saveDraft = () => {
    if (!output || !savedInput) return;
    const draft = newDraft(savedInput, output, saved.hook, saved.hashtags, new Date(), saved.entwuerfe);
    set({ ...saved, entwuerfe: addDraft(saved.entwuerfe, draft) });
    setNote("Entwurf gemerkt.");
  };

  const loadDraft = (d: Entwurf) => {
    setError(null);
    gen.clearError();
    setEditing(false);
    set({ ...saved, input: d.input, output: d.output, hook: d.hook, hashtags: d.hashtags });
    setNote("Entwurf geladen.");
    shouldFocus.current = true;
  };

  const deleteDraft = (d: Entwurf) => {
    set({ ...saved, entwuerfe: removeDraft(saved.entwuerfe, d.id) });
    setNote("Entwurf gelöscht.");
  };

  const platform = savedInput?.plattform ?? "instagram";
  const text = output && savedInput ? compose(output, saved.hook, saved.hashtags, platform) : "";
  const doc = output && savedInput ? toDocument(output, savedInput, saved.hashtags) : null;
  const placeholders = output ? placeholdersIn(output) : [];
  const hinweis = output ? hinweisOf(output) : "";
  const idee = form.idee;

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-6"
        noValidate
        aria-busy={busy || !ready}
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <div className="content">
          <Intro />
        </div>

        {showForm && (
          <>
            <fieldset className="grid gap-4 rounded-xl border border-line p-4 md:grid-cols-3" disabled={busy}>
              <legend className="px-2 font-heading font-semibold">Dein Betrieb</legend>
              <ProfileFieldsForm idPrefix="pg" fields={["firma", "branche", "ort"]} />
              <p className="text-sm text-muted-foreground md:col-span-3">Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.</p>
              {namen.length > 0 && (
                <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm md:col-span-3" data-testid="profil-hinweis">
                  Aus deinem Profil geht mit: {joinNamen(namen)}.{" "}
                  <Link href="/profil" className="underline underline-offset-4">
                    Bearbeiten
                  </Link>
                </p>
              )}
            </fieldset>

            <fieldset className="grid gap-5" disabled={busy}>
              <legend className="mb-1 font-heading font-semibold">Idee und Auswahl</legend>

              <div className="grid gap-1.5">
                <Label htmlFor="pg-idee">Deine Idee in ein bis drei Sätzen</Label>
                <Textarea
                  id="pg-idee"
                  rows={4}
                  maxLength={LIMITS.idee}
                  value={idee}
                  onChange={(e) => patch({ idee: e.target.value })}
                  aria-describedby="pg-idee-help pg-idee-count"
                  aria-required="true"
                  lang="de-CH"
                  spellCheck
                />
                <p id="pg-idee-help" className="text-sm text-muted-foreground">
                  Was ist passiert, was hast du gelernt, was fragt dich die Kundschaft? Zum Beispiel: «Diese Woche haben wir in Gossau eine Fassade gestrichen, deren
                  alter Anstrich nach wenigen Wintern abblätterte. Der Untergrund war noch feucht.»
                </p>
                <p id="pg-idee-count" className="mono text-sm text-muted-foreground">
                  {charCount(idee)} von {LIMITS.idee} Zeichen, mindestens {LIMITS.ideeMin}
                </p>
              </div>

              {merk.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pg-merk">Gemerkte Idee übernehmen</Label>
                  <select
                    id="pg-merk"
                    className={selectClass}
                    value=""
                    onChange={(e) => {
                      const gewaehlt = merk.find((m) => m.id === e.target.value);
                      if (gewaehlt) patch({ idee: gewaehlt.text });
                    }}
                    aria-describedby="pg-merk-help"
                  >
                    <option value="">Bitte wählen</option>
                    {merk.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.titel}
                      </option>
                    ))}
                  </select>
                  <p id="pg-merk-help" className="text-sm text-muted-foreground">
                    Aus deiner Merkliste im Werkzeug «Content-Ideen». Die Idee füllt das Feld oben, du kannst sie danach ändern.
                  </p>
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="pg-plattform">Plattform</Label>
                  <select
                    id="pg-plattform"
                    className={selectClass}
                    value={form.plattform}
                    onChange={(e) => patch({ plattform: isPlattform(e.target.value) ? e.target.value : "" })}
                    aria-required="true"
                  >
                    {PLATTFORMEN.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-muted-foreground">Die Länge des Beitrags richtet sich nach der Plattform.</p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="pg-format">Format</Label>
                  <select
                    id="pg-format"
                    className={selectClass}
                    value={form.format}
                    onChange={(e) => patch({ format: isFormat(e.target.value) ? e.target.value : "" })}
                    aria-describedby="pg-format-help"
                    aria-required="true"
                  >
                    {FORMATE.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <p id="pg-format-help" className="text-sm text-muted-foreground">
                    {FORMATE.find((f) => f.key === form.format)?.hint}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="pg-ziel">Ziel der Aufforderung</Label>
                  <select
                    id="pg-ziel"
                    className={selectClass}
                    value={form.ziel}
                    onChange={(e) => patch({ ziel: isZiel(e.target.value) ? e.target.value : "" })}
                    aria-describedby="pg-ziel-help"
                    aria-required="true"
                  >
                    {ZIELE.map((z) => (
                      <option key={z.key} value={z.key}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                  <p id="pg-ziel-help" className="text-sm text-muted-foreground">
                    {ZIELE.find((z) => z.key === form.ziel)?.hint}
                  </p>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="pg-anrede">Anrede</Label>
                  <select
                    id="pg-anrede"
                    className={selectClass}
                    value={anrede}
                    onChange={(e) => patch({ anrede: isAnrede(e.target.value) ? e.target.value : "" })}
                    aria-describedby="pg-anrede-help"
                  >
                    {ANREDEN.map((a) => (
                      <option key={a.key} value={a.key}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <p id="pg-anrede-help" className="text-sm text-muted-foreground">
                    {anredeAusProfil ? "Vorbelegt aus der Tonalität in deinem Firmenprofil. " : ""}Wie du deine Leserinnen und Leser ansprichst.
                  </p>
                </div>

                {teile.saeulen.length > 0 && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="pg-saeule">Säule</Label>
                    <select id="pg-saeule" className={selectClass} value={form.saeule} onChange={(e) => patch({ saeule: e.target.value })} aria-describedby="pg-saeule-help">
                      <option value="">keine</option>
                      {teile.saeulen.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <p id="pg-saeule-help" className="text-sm text-muted-foreground">
                      Aus deinen Content-Säulen im Firmenprofil. Die gewählte Säule gibt das Themenfeld vor.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  id="pg-emojis"
                  checked={form.emojis}
                  onChange={(e) => patch({ emojis: e.target.checked })}
                  className="size-5 shrink-0 accent-ink"
                  aria-describedby="pg-emojis-help"
                />
                <div className="grid">
                  <label htmlFor="pg-emojis" className="cursor-pointer">
                    Emojis erlauben
                  </label>
                  <span id="pg-emojis-help" className="text-sm text-muted-foreground">
                    Ohne Haken schreibt die KI keine Emojis.
                  </span>
                </div>
              </div>
            </fieldset>

            <p className="text-sm text-muted-foreground">
              Dafür gehen Betrieb, Branche, Ort, deine Idee und deine Auswahl (Plattform, Format, Ziel, Anrede, Emojis)
              {namen.length > 0 ? `, dazu ${joinNamen(namen)} aus deinem Profil,` : ""} an unseren Server und von dort an unseren KI-Anbieter, nicht deine
              E-Mail-Adresse. Unser Server speichert die Angaben nicht. Deine Angaben und der Beitrag gehen mit deiner E-Mail-Adresse an Alperna, damit wir dir bei
              Fragen weiterhelfen können. Gib nichts Vertrauliches ein.
            </p>

            <p id="pg-error" role="alert" className="min-h-6 text-destructive">
              {shownError}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" disabled={!ready || !profileReady || busy}>
                {busy ? "Die KI schreibt …" : "Beitrag schreiben"}
              </Button>
              {editing && output && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                  Abbrechen
                </Button>
              )}
              <span className="text-sm text-muted-foreground">Dauert meist unter einer Minute.</span>
            </div>
          </>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {busy ? "Die KI schreibt deinen Beitrag." : ""}
        </p>
      </form>

      {output && savedInput && doc && (
        <ResultCard
          title="Dein Beitrag"
          headingRef={headingRef}
          actions={
            <>
              <Button type="button" onClick={saveDraft} disabled={busy}>
                Als Entwurf merken
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void run(savedInput)}>
                {busy ? "Die KI schreibt …" : "Neu formulieren"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={edit}>
                Angaben ändern
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={restart}>
                Neu beginnen
              </Button>
              <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {note}
              </span>
            </>
          }
        >
          {!showForm && shownError && (
            <p role="alert" className="text-destructive">
              {shownError}
            </p>
          )}
          <p className="text-sm text-muted-foreground" data-testid="ki-hinweis">
            {KI_HINWEIS}
          </p>
          {placeholders.length > 0 && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="platzhalter">
              Platzhalter ausfüllen: {placeholders.join(", ")}
            </p>
          )}

          <fieldset role="radiogroup" className="grid gap-2" disabled={busy}>
            <legend className="mb-1 font-heading font-semibold">Hook</legend>
            <p className="text-sm text-muted-foreground">Zwei Varianten für den ersten Satz. Wähl die, die zu deiner Kundschaft passt; die Vorschau folgt.</p>
            <div className="grid gap-2">
              {output.hooks.map((h, i) => (
                <label key={i} className={choice}>
                  <input
                    type="radio"
                    name="pg-hook"
                    value={i}
                    checked={saved.hook === i}
                    onChange={() => chooseHook(i === 1 ? 1 : 0)}
                    className="mt-0.5 size-5 shrink-0 accent-ink"
                  />
                  <span className="break-words">{h}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {hatHashtags(platform) && (
            <div className="grid gap-1.5">
              <Label htmlFor="pg-hashtags">Hashtags (freiwillig)</Label>
              <Textarea
                id="pg-hashtags"
                rows={2}
                maxLength={HASHTAGS_MAX}
                value={saved.hashtags}
                onChange={(e) => set({ ...saved, hashtags: e.target.value })}
                aria-describedby="pg-hashtags-help"
                lang="de-CH"
                spellCheck={false}
              />
              <p id="pg-hashtags-help" className="text-sm text-muted-foreground">
                Die KI schreibt keine Hashtags. Setz deine eigenen, getrennt durch Leerzeichen; sie stehen unter dem Beitrag.
              </p>
            </div>
          )}

          <Preview platform={platform} text={text} />

          {hinweis && (
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="hinweis">
              <span className="font-medium">Hinweis der KI:</span> {hinweis}
            </p>
          )}

          <section aria-label="Prüfen" className="grid gap-2">
            <h4 className="font-heading font-medium">Prüfen</h4>
            <p className="text-sm text-muted-foreground">
              Der Textcheck sucht Floskeln, doppelte Wörter und Formfehler. Er übernimmt den Beitrag und ersetzt dabei den Text, der dort gespeichert ist.
            </p>
            <div>
              <Link href={TEXTCHECK_PATH} className={buttonVariants({ variant: "outline" })} onClick={() => writeLocal(TEXTCHECK_KEY, JSON.stringify(textcheckState(text)))}>
                Im Textcheck prüfen
              </Link>
            </div>
          </section>

          <section aria-label="Beide Hooks als Text" className="grid gap-2">
            <h4 className="font-heading font-medium">Beide Hooks als Text</h4>
            <p className="text-sm text-muted-foreground">Der Text enthält beide Hooks, den Hauptteil und die Aufforderung, damit du sie in Ruhe vergleichen kannst.</p>
            <DocumentExport model={doc} formats={[]} />
          </section>
        </ResultCard>
      )}

      <Entwuerfe list={saved.entwuerfe} onLoad={loadDraft} onDelete={deleteDraft} showEmpty={Boolean(output)} />
      {!output && note && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

export default function Tool() {
  return (
    <ToolShell slug={config.slug} name={config.name} usesProfile={config.usesProfile.length > 0}>
      <PostFlow />
    </ToolShell>
  );
}
