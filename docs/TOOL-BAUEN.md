# TOOL-BAUEN.md: So entsteht ein Werkzeug (Stand 04.10.2026, Zugang v3)

Diese Anleitung gilt für jedes neue Werkzeug, ob von Hand oder von einem Helfer-Agenten gebaut. CLAUDE.md bleibt die Wahrheit; hier steht, wie die Bausteine zusammenspielen. Vorbilder im Repo: `tools/digitaler-auftritt-check` (Klasse A mit Server), `tools/textcheck` (Klasse A im Browser), `tools/text-umschreiber` (KI mit Freitext). Für Generatoren (Klasse B) und Rechner (Klasse C) stehen die Muster unten.

## 1. Dateien je Werkzeug

Das Gerüst legt `npm run new-tool <slug> --name "<Name>" --category <kategorie>` an (Harte Regel 6) und trägt das Werkzeug in `tools/index.ts` und `tools/components.tsx` ein. Danach füllst du:

| Datei | Inhalt |
|---|---|
| `specs/<slug>.md` | Spec nach `specs/_TEMPLATE.md`: Nutzen, Eingaben, Logik (Formeln ausgeschrieben, Annahmen markiert), Ausgaben, Edge Cases, Tests, «Nicht Teil dieses Tools». Vor dem Code schreiben. |
| `tools/<slug>/tool.config.ts` | `defineTool({...})`: slug, name, category (`strategie | content | analyse | schweiz | ki`), audience (`kmu | verein | beide`), tagline (≤ 110 Zeichen, Nutzen in einem Satz), keyword, related (bis 3 Slugs; unbekannte werden übersprungen), needsServer, usesProfile, writesProfile (nur Felder aus `lib/profile-fields.ts`), outputs, estimatedMinutes, pathStep `{path, order}` (Reihenfolge im Pfad der Kategorie; vorhandene Nummern in `tools/*/tool.config.ts` nachsehen), featured. |
| `tools/<slug>/logic.ts` | Reine Funktionen: Fragen, Rechnen, Prüfen, `toDocument()` (DocumentModel für Anzeige und Export), `resultText()`/`reportMarkdown()` fürs CRM, `parse<State>()` für den gespeicherten Stand. Kein React, kein DOM, kein `fetch`. |
| `tools/<slug>/logic.test.ts` | Vitest, mindestens fünf Fälle, davon zwei Edge Cases aus der Spec. Jede Formel und jede Grenze getestet. |
| `tools/<slug>/generator.ts` | Nur Klasse B: `defineGenerator({...})` (siehe 4). Darf im Browser und auf dem Server laufen: nur zod, Strings, reine Funktionen. |
| `tools/<slug>/Tool.tsx` | Client-Komponente in `ToolShell`. Kein eigener Zugangscode (siehe 3). |
| `content/tools/<slug>.md` | Seitentext nach der Seitentext-Vorlage und der Lese-Vorlage in CLAUDE.md (siehe 6). |
| `data/<name>.json` | Nur wenn das Werkzeug Zahlen oder Listen braucht: mit `meta: {source, url, asOf}`. Ohne Quelle keine Zahl (Harte Regel 7). |

Nicht anfassen, wenn du als Helfer-Agent arbeitest: `tools/index.ts`, `tools/components.tsx`, `tools/generators.ts`, `CLAUDE.md`, `STATUS.md`, `PLAN.md`, Dateien anderer Werkzeuge, `components/*`, `lib/*`. Brauchst du dort etwas, beschreibe es im Abschlussbericht. Nicht committen.

## 2. Was jedes Werkzeug kann (Zugang v3)

- Das Werkzeug läuft ohne Hürde bis zum Punkt, an dem das Ergebnis erscheinen würde. Dort fragt `ToolShell` nach der E-Mail-Adresse (Fenster). Danach erscheint das Ergebnis sofort.
- Jedes Ergebnis geht mit Eingabe und Ausgabe ins CRM: `ctx.sendResult({ eingabe, ausgabe })`. Eingabe = die Angaben der Person als lesbarer Text (eine Angabe je Zeile, «Frage: Antwort»), Ausgabe = das Ergebnis als Markdown (`toMarkdown(toDocument(result))` oder ein eigener `reportMarkdown`). Beide werden serverseitig auf 1'900 Zeichen gekürzt; das Wichtigste steht darum oben.
- Ergebnis am Bildschirm immer vollständig und kopierbar (`CopyButton`). Dateien (PDF, Word) über `DocumentExport` (prüft die Adresse selbst).
- Zwischenstand und Ergebnis unter `mt:<slug>` (`useLocalJson` mit einer `parse`-Funktion, die bei kaputten Daten den leeren Stand liefert). Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag.
- Firmenprofil: Felder, die im Profil stehen, werden vorbefüllt und nie erneut gefragt (Harte Regel 10). Lesen über `useProfile()`; Grunddaten mit `ProfileFieldsForm` eingeben lassen; schreiben nur, was `writesProfile` nennt, und nur wenn das Feld leer ist (Vorbild `profilePatch` im Check).

## 3. Oberfläche: Bausteine und Verträge

```tsx
"use client";
import { ToolShell, useToolContext } from "@/components/tool/ToolShell";
// ctx = useToolContext(): { slug, email, ensureEmail(), renewEmail(), sendResult(), guardDownload(), changeEmail() }
```

- **Fragebogen (Klasse C mit Fragen):** `QuestionnaireEngine` mit `questions`, `scoreFn`, `renderResult`, `prefill` aus dem Profil, `onResult` (Profil schreiben), `resultText` (Ausgabe fürs CRM). Macht Fenster, Speichern und CRM selbst. Höchstens 10 Fragen.
- **Rechner und Formulare (Klasse C ohne Fragen):** eigenes `<form>`; beim Klick auf den Ergebnis-Knopf: Eingaben prüfen (Meldung in `role="alert"`), `if (!(await ctx.ensureEmail())) return;`, Ergebnis berechnen, speichern, `void ctx.sendResult(...)`.
- **Generator (Klasse B):** `useGenerator(def, { eingabe, ausgabe })` liefert `{ busy, error, generate }`. `generate(input)` macht Fenster, Anfrage, Wiederholung bei 403 und CRM selbst; es gibt `output | null` zurück. Das Werkzeug speichert `input` und `output` unter `mt:<slug>`.
- **Website lesen (Klasse A/B):** `readWebsite(url)` aus `lib/read-client.ts` nach `ctx.ensureEmail()`; bei `reason === "gate"`: `ctx.renewEmail()` und einmal wiederholen. Liefert Titel, Beschreibung, Überschriften und bis 8'000 Zeichen Text.
- **Marketing-Check nutzen:** `runCheck(input, onStep)` aus `lib/check/client.ts` (Vorbild `tools/digitaler-auftritt-check/Tool.tsx`). Ein gespeichertes Check-Ergebnis liegt unter `mt:digitaler-auftritt-check` (`parseCheckState`).
- **Ergebnis zeigen:** `ResultCard` (Titel, `headingRef` für den Fokus nach einer Aktion) mit `DocView blocks={doc.blocks}` für Dokumente, `ScoreBadge` für Punktzahlen, eigene Tabellen nur, wenn das Modell nicht reicht. Knöpfe unten: `CopyButton`, `DocumentExport model={doc}`, «Ändern», «Neu beginnen».
- Formularfelder: `Input`, `Textarea`, `Label`, `Checkbox` aus `components/ui`, `select` mit `selectClass` wie im Check. Jedes Feld mit `Label htmlFor`, Fehler mit `role="alert"`, Fortschritt mit `role="status"`. 44-px-Ziele, 375 px ohne Überlauf, Tastatur durchgehend.
- Fokus nach einer Aktion auf die Ergebnis-Überschrift (`shouldFocus`-Muster im Check), nicht beim Wiederherstellen.
- Du-Form, keine Ausrufezeichen, keine Emojis, Schweizer Schreibweise, ruhiger Ton (docs/MARKE.md). Bezeichnungen: «Werkzeug», nie «Tool» im UI; «Entwurf» für KI-Texte, immer mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.»

## 4. Generator (Klasse B): `tools/<slug>/generator.ts`

```ts
import { z } from "zod";
import { dataPrompt, defineGenerator } from "@/lib/generator";

export const personaInput = z.object({
  betrieb: z.string().trim().min(1).max(120),
  branche: z.string().trim().max(120),
  ort: z.string().trim().max(80),
  angebot: z.string().trim().min(10).max(1500),
  kundschaft: z.string().trim().max(600),
});
export type PersonaInput = z.infer<typeof personaInput>;

export const personaOutput = z.object({
  name: z.string().min(2).max(60),
  kurzprofil: z.string().min(40).max(600),
  ziele: z.array(z.string().min(5).max(200)).min(2).max(5),
  // …
});
export type PersonaOutput = z.infer<typeof personaOutput>;

export const personaGenerator = defineGenerator({
  slug: "persona",
  input: personaInput,
  output: personaOutput,
  instruction: `Schreib eine Persona für die Kundschaft des Betriebs …
Form: {"name": "…", "kurzprofil": "…", "ziele": ["…"], …}`,
  prompt: (i) => dataPrompt("Angaben zum Betrieb", i),
  maxTokens: 900,
  check: (o, i) => (o.name.toLowerCase() === i.betrieb.toLowerCase() ? "name" : null),
});
```

- Die Regeln der Alperna-Stimme, «nichts erfinden», «Platzhalter in eckigen Klammern», «nur JSON» stehen schon in `GENERATOR_RULES`; wiederhole sie nicht, beschreibe nur Aufgabe und Form.
- Eingaben nur in `prompt` (Nutzernachricht), nie in `instruction`. `dataPrompt()` kennzeichnet sie als Daten.
- Schemas mit Grenzen (`min`, `max`); die Route prüft Eingaben und Ausgaben damit, der Browser die Ausgabe noch einmal. Was die KI zusätzlich liefert, fällt weg (zod lässt unbekannte Felder weg). Kein `.default()` und kein `.transform()` im Eingabeschema: Ein- und Ausgabetyp müssen gleich sein (`z.ZodType<I>`), sonst scheitert `defineGenerator` am Typ. Leere Felder liefert `toInput()` als leere Zeichenkette.
- `check` für Prüfungen, die nur das Werkzeug kennt (zum Beispiel: keine Zahlen, die nicht in den Angaben stehen; `numbersIn` aus `tools/text-umschreiber/logic.ts` als Vorbild).
- Der Generator steht in `tools/generators.ts` (trägt der Hauptagent ein). Ohne Eintrag antwortet `/api/generate` mit 400.
- Eingaben an die KI: Betrieb, Branche, Ort, Angebot und was die Person tippt. Nie E-Mail, nie Name der Person, nie das ganze Profil. Die Seite sagt vor dem Knopf, was an die KI geht («Dafür gehen … an unseren KI-Anbieter. Gib nichts Vertrauliches ein.»).
- Platzhalter in der Ausgabe (`placeholdersIn(output)`) als Liste über dem Entwurf zeigen («Platzhalter ausfüllen: [Telefonnummer]»).

## 5. Daten und Zahlen

- Jede Zahl im Werkzeug oder im Seitentext braucht eine Quelle: `data/<name>.json` mit `meta: { source, url, asOf }` oder eine Klammer im Text «(Quelle: BFS, STATPOP 2024)». Richtwerte von Alperna heissen so: «Richtwert von Alperna, keine Statistik» und stehen in `meta.source`.
- Gibt es keine Quelle, gibt es keine Zahl. Lieber eine Schätzung als Eingabe der Person verlangen als eine erfundene Vorgabe.
- Feiertage, Schulferien, Gemeinden, Kantone: öffentliche Quellen (ch.ch, kantonale Websites, BFS) mit Adresse und Abrufdatum in `meta`. Steht etwas nur auf einer Website, die du nicht lesen kannst, lass es weg und sag es im Bericht.
- Rechtstexte: nur aus `content/legal/` (Harte Regel 8). Fehlt die Datei, wird das Werkzeug nicht gebaut.

## 6. Seitentext `content/tools/<slug>.md`

Kopfdaten: `title` (≤ 60 Zeichen, mit «Schweiz»), `description` (≤ 155), `h1` («<Name> für Schweizer KMU» oder «… für Schweizer Vereine»), `tagline` (≤ 110), `beispielFirma` («Malerei Keller, Gossau»; Vereins-Werkzeuge «FC Trogen»), `kurz` (genau drei Punkte: was du bekommst, was du dafür tust, was danach klar ist), `ablauf` (genau drei kurze Schritte).

Abschnitte in dieser Reihenfolge, alle Pflicht: `## Warum das wichtig ist` (50 bis 140 Wörter, ein Satz mit der Aussage, 3 bis 6 Aufzählungspunkte, am Ende eine offene Schleife `=> …`), `## So nutzt du das Ergebnis` (3 bis 5 nummerierte Schritte, fett beginnend, offene Schleife), `## Häufige Fehler` (3 bis 5 Punkte, je «**Problem.** Lösung.»), `## Beispiel` (ein fertiges Ergebnis der Beispielfirma, mit den Zahlen aus der eigenen Logik berechnet, nicht erfunden), `## Häufige Fragen` (5 bis 7 `### Frage`, Antworten ≤ 80 Wörter), `## Alperna` (`problem:`, `baustein:` einer von Website, Google Business Profil, Social Media, Online-Shop, Buchungstool, `beweis: @baustein`).

Gesamt 350 bis 700 Wörter. Keyword 3 bis 5 Mal (H1 und Text). Schweizer Bezug in jedem Abschnitt (Gemeinden, Kantone, Behörden, Gesetze beim Namen). Keine Zahl ohne Quelle in Klammern. Kein «TODO». Stil: ss statt ß, «» als Anführungszeichen, CHF 1'000.-, 8 %, keine Ausrufezeichen, kein «jetzt», «garantiert», «Nr. 1», kein Gedankenstrich «—», nichts von der Sperrliste (`lib/brand-rules.ts`). Die FAQ nennt den Zugang richtig: kein Konto, E-Mail-Adresse vor dem Ergebnis, Eingaben und Ergebnis gehen an Alperna.

Prüfen mit `npm run content-check` (muss «0 Fehler» melden; Hinweise sind erlaubt).

## 7. Prüfen, bevor du fertig bist

```
npx tsc --noEmit
npx vitest run tools/<slug>
npm run content-check
```

Nicht als Helfer-Agent: `npm run build`, `npm run smoke`, `npm run lh` (macht der Hauptagent je Welle, weil sie sich gegenseitig stören).

Abschlussbericht des Helfer-Agenten (kurz): was das Werkzeug tut, Dateien, Annahmen und Richtwerte mit Quelle, was bewusst weggelassen wurde, offene Punkte, der Eintrag für `tools/generators.ts` (falls Generator), und ein Absatz für STATUS.md.
