# Strategie-Einseiter (strategie-einseiter)

Klasse C (setzt im Browser zusammen, keine KI, kein Server), Stand 05.10.2026. Vorbilder: `tools/icp-builder` (ResultCard mit DocView), `tools/swot` (liest die Stände anderer Werkzeuge über deren `parseState`). `logic.ts` ist getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber, die mehrere Strategie-Werkzeuge durchlaufen haben: in rund zwei Minuten eine Seite mit Positionierung, Zielgruppe, Nutzen, Marke, Botschaft, Kanälen, Budget, Lage und Massnahmen, zusammengezogen aus dem Firmenprofil und den Ergebnissen im Browser, mit Platzhaltern für alles, was noch fehlt («x von 8 Bausteinen»).

## Kategorie und Verknüpfung
Kategorie: strategie (zehnter und letzter Schritt im Pfad «Strategie», `pathStep.order` 10), Zielgruppe: kmu
Liest aus Profil: firma, ort, branche, positionierung, primaersegment, zielgruppen, personas, marke (werte, tonalitaet.so, woerter.verwenden), kanaele (name oder kanal), budgetJahr, contentSaeulen (name, anteil)
Liest aus dem Browser (je über die exportierte `parseState` des Werkzeugs, alles rein): `mt:positionierung`, `mt:icp-builder`, `mt:persona`, `mt:nutzenversprechen`, `mt:markenplattform`, `mt:botschaften`, `mt:inhalte-saeulen`, `mt:budget-planer` (angenommene Form `{ v: 1, input, output: { jahr, monat, kanaele: [{ label, anteil, jahr }], summe } }`, defensiv gelesen in `parseBudget`, ohne Import aus dem Werkzeug), `mt:swot`, `mt:reifegrad-check` (Stand der QuestionnaireEngine, `evaluate` aus `tools/reifegrad-check/logic.ts` mit dem Marketing-Check zur Hälfte in «Auftritt», wie in `tools/swot/logic.ts`), `mt:digitaler-auftritt-check` (`parseCheckState`)
Schreibt ins Profil: nichts (`writesProfile: []`)
Verwandte Tools: swot, budget-planer, reifegrad-check
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis über `/api/result` (Zugang v3).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Einseiter erstellen» ruft das Werkzeug `ctx.ensureEmail()`; false lässt die Übersicht stehen. Danach erscheint das Dokument, der Stand wird gespeichert, und `ctx.sendResult({ eingabe, ausgabe })` geht einmal ins CRM.
- **Eingabe fürs CRM** (`eingabeText`): Betrieb mit Quelle, Vollständigkeit, je Baustein eine Zeile «Label: vorhanden (Quellen)» oder «Label: fehlt (Werkzeug X)». **Ausgabe** (`reportMarkdown`): das Dokument als Markdown.
- **Downloads:** `DocumentExport` (Text kopieren, PDF, Word) läuft über `guardDownload`.
- **Nach dem Neuladen** steht das Ergebnis wieder da (gespeicherter Stand hat `output`), ohne zweiten CRM-Eintrag; der Inhalt wird trotzdem frisch aus dem Browser gelesen. «Neu zusammenstellen» liest alles neu, speichert ein neues `erstelltAm` und schickt das Ergebnis erneut ins CRM.

## Eingaben
Keine. Das Werkzeug fragt nichts ab ausser einem Knopf. Fehlende Teile werden nie abgefragt; sie stehen als Platzhalter mit Link zum Werkzeug.

| Element | Typ | Inhalt |
|---|---|---|
| Betrieb | nur Anzeige | «Betrieb: Malerei Keller, Gossau, Malerei (Firmenprofil)» oder «Betrieb: noch nicht im Firmenprofil» mit Link zu /profil |
| Zähler | `role="status"` | «x von 8 Bausteinen» |
| Übersicht | `ol` mit `aria-label="Bausteine"` | je Baustein: Name, Status «vorhanden» oder «fehlt», bei vorhanden «Quelle: …» (in Worten), bei fehlt «Quelle wäre: …» und Link «<Werkzeug> öffnen» |
| Knopf | `button` | «Einseiter erstellen» (auch mit 0 Bausteinen, dann nur Platzhalter) |

## Logik
1. **Lesen** (`collect(read, profile)`): `read(key)` liefert den rohen Text zu `mt:<slug>`; JSON wird sicher gelesen, Kaputtes wird null. Jeder Werkzeug-Stand geht durch die `parseState` des Werkzeugs; kaputte oder alte Stände ergeben dort den leeren Stand und zählen hier als «fehlt». Texte werden auf eine Zeile gebracht und gekürzt. **Vorrang: Profil vor Werkzeug-Stand.**
   - Positionierung: `profile.positionierung`, sonst `mt:positionierung` → `output.kernsatz` (dazu `fuerWen`, `wasAnders` aus dem Werkzeug). Vorhanden, wenn ein Kernsatz da ist.
   - Zielgruppe: Segment = `profile.primaersegment`, sonst erste `profile.zielgruppen[].name`, sonst `mt:icp-builder` → `output.segmentName`; Merkmale = erste drei `output.merkmale`; Persona = erste `profile.personas[]` mit Name (dazu `kurz`), sonst `mt:persona` → `output.name`, `output.kurz`. Vorhanden, wenn Segment oder Persona da ist.
   - Nutzen: `mt:nutzenversprechen` → `output.kurz`, erste drei `output.nutzen`. Vorhanden mit `kurz`.
   - Marke: Werte = `profile.marke.werte` (erste drei), sonst Namen der `output.werte` der Markenplattform; Tonalität = `profile.marke.tonalitaet.so`, sonst `output.tonalitaet.so`; Wörter = `profile.marke.woerter.verwenden` (fünf), sonst `output.woerter.verwenden`; Versprechen nur aus `mt:markenplattform`. Vorhanden mit Versprechen oder Werten.
   - Botschaft: `mt:botschaften` → `output.hauptbotschaft`, erste drei `output.botschaften` (fuer, satz). Vorhanden mit Hauptbotschaft.
   - Kanäle und Säulen: Kanäle = `profile.kanaele[].name|kanal`, sonst die gewählten Kanäle aus `mt:inhalte-saeulen` (`input.kanaele` als Namen); Säulen = `profile.contentSaeulen[]` (name, anteil), sonst `output.saeulen` (Name, Anteil); Rhythmus = `output.rhythmus.satz`. Vorhanden mit Kanälen oder Säulen.
   - Budget: Jahr = `profile.budgetJahr`, sonst `output.jahr` des Budget-Planers; Monat nur aus dem Budget-Planer (keine eigene Rechnung); grösste drei Kanäle nach `jahr` absteigend. Vorhanden mit Jahr.
   - Lage und Massnahmen: `mt:swot` → `output.einSatz`, `output.folgerungen`; `mt:reifegrad-check` → gesamt, Stufe, stärkste und schwächste Dimension (erste bei Gleichstand; sind alle gleich, ist stärkste gleich schwächste) mit ihren zwei Schritten; `mt:digitaler-auftritt-check` → `result.score`, Host, Datum. Vorhanden mit SWOT-Satz, Reifegrad oder Check.
   - Quellen in Worten je Baustein: «Firmenprofil» und/oder «Werkzeug <Name>», nur für vorhandene Bausteine.
2. **Vollständigkeit** (`vollstaendigkeit`): «x von 8 Bausteinen», x = Zahl der vorhandenen.
3. **Massnahmen** (`massnahmen`): die Folgerungen der SWOT (Woher «SWOT-Analyse», Aufwand aus der SWOT) und die zwei Schritte der schwächsten Reifegrad-Dimension (Woher «Reifegrad-Check, Dimension «…»», Aufwand «keine Angabe», weil das Werkzeug ihn nicht kennt; keine Bewertung ohne Grundlage). Leer, wenn beides fehlt.
4. **Dokument** (`toDocument(einseiter, now)`): Titel «Marketingstrategie auf einer Seite», Untertitel «<Firma>, <dateCH(now)>» («Dein Betrieb» ohne Firma), Kopf mit Firma und Datum, Dateiname `strategie-einseiter-<firma>`. Seite 1, kompakt: Facts Betrieb (Firma, Ort, Branche), Satz zur Vollständigkeit mit den offenen Werkzeugen, Positionierung (Kernsatz), Für wen (Segment, Persona, Merkmale als Liste), Nutzen (Satz, Liste), Marke (Versprechen, Werte, Tonalität, Wörter), Botschaft (Hauptbotschaft, Liste), Kanäle und Säulen (Liste mit Anteilen als «35 %»), Budget (Jahr und Monat als `chf`, grösste drei Kanäle), Lage (SWOT-Satz, Reifegrad mit stärkster und schwächster Dimension, Digitaler Auftritt mit Punktzahl, Host, Datum). Seite 2: Massnahmen als Tabelle Massnahme | Woher | Aufwand, sonst ein Satz mit Platzhaltern. Schluss: ein Satz, dass nichts neu bewertet ist. Fehlendes überall als «[Noch offen: <Werkzeug>]» (`offen`), fehlende Betriebsdaten als «[Noch offen: Firmenprofil]». Das PDF kennt keinen Seitenumbruch im Modell; «Seite 2» beginnt mit der Überschrift «Massnahmen».
   Annahme: keine Zahl, die nicht aus einem Stand oder dem Profil stammt; der Monatsbetrag wird nicht aus dem Jahr gerechnet.
5. **Stand** (`mt:strategie-einseiter`): `{ v: 1, output: { bausteine: [{ key, vorhanden }], erstelltAm } }` nach dem ersten Erstellen (`toState`), damit der Pfad das Werkzeug als erledigt zählt (`output` ist ein Objekt). `parseState` liefert bei allem, was nicht genau diese Form hat, den leeren Stand `{ v: 1, output: null }`. Beim nächsten Besuch wird trotzdem frisch gelesen; der Stand dient nur als Merker.

## Ausgaben
- Übersicht der acht Bausteine (immer sichtbar, live aus dem Browser, auch nach Änderungen in anderen Tabs) und der Zähler.
- Ergebnis: `ResultCard` «Deine Marketingstrategie auf einer Seite» mit Hinweis zu den Platzhaltern und `DocView` des Dokuments.
- Knöpfe: `DocumentExport` (Text kopieren, PDF, Word) und «Neu zusammenstellen».
- Fokus auf die Ergebnis-Überschrift nach dem Klick, nicht beim Wiederherstellen.
- Zählung: `popular:strategie-einseiter` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Leerer Browser (kein Profil, keine Stände): 0 von 8, Knopf trotzdem aktiv, Dokument nur mit Platzhaltern, keine Massnahmen-Tabelle.
- Profil leer, aber Stände da: Betrieb als «[Noch offen: Firmenprofil]», Bausteine aus den Werkzeugen.
- Kaputte Stände (kein JSON, falsche Version, fehlende Felder, Text statt Zahl): zählen als «fehlt», nie ein Fehler.
- Reifegrad vor dem Ergebnis (`phase` nicht «result»): zählt nicht. Check ohne Ergebnis: zählt nicht; der Reifegrad rechnet dann ohne Check.
- Alle fünf Reifegrad-Dimensionen gleich: ein Satz «alle fünf Dimensionen liegen bei n von 100».
- Budget-Planer mit anderer Form als angenommen: `parseBudget` liefert null, der Baustein fehlt; Kanäle ohne Label oder mit Text als Zahl fallen weg.
- Profil mit Zielgruppen, aber ohne Primärsegment: die erste Zielgruppe ist das Segment.
- Lange Texte: jede Zeile gekürzt (Kernsatz 600, Persona-Kurz 300, Listen je 200 Zeichen).
- Tool-Stand kaputt: leerer Stand, die Übersicht und der Knopf bleiben; nach dem Erstellen wird neu gespeichert.

## Texte
- Tagline: «Alle Ergebnisse deiner Strategie-Werkzeuge auf einer Seite, mit Platzhaltern für das, was noch fehlt.» (103 Zeichen)
- SEO-Title: «Strategie-Einseiter Schweiz: Marketingstrategie auf 1 Seite»; Meta-Description in `content/tools/strategie-einseiter.md`.
- Keyword «Marketingstrategie»: im ersten Absatz und drei bis fünf Mal im Text; die H1 heisst nach Auftrag «Strategie-Einseiter für Schweizer KMU».
- Erklärtext, Beispiel (Malerei Keller, Gossau, als fertige Seite mit sieben von acht Bausteinen; das Budget bleibt offen, damit der Platzhalter sichtbar ist), FAQ (6) und Alperna-Satz (Baustein Website): `content/tools/strategie-einseiter.md`.

## Tests
`tools/strategie-einseiter/logic.test.ts` (22 Fälle): Bausteine und Schlüssel; `collect` mit leerem Browser, mit vollständigen Ständen je Werkzeug (gültig nach deren Schemas), mit Quellen in Worten, mit kaputten Ständen, mit Vorrang des Profils, mit Zielgruppe und Persona nur aus dem Profil, mit Reifegrad ohne Check und bei Gleichstand, mit Listengrenzen und Budget-Sortierung; `parseBudget` defensiv; `massnahmen` aus SWOT und Reifegrad, nur eines, nichts; `toDocument` leer (alle Platzhalter), vollständig (Titel, Untertitel, Reihenfolge, Schweizer Schreibweise, Tabelle), teilweise, Gleichstand; `eingabeText` voll und leer; `parseState` kaputt und Rundlauf mit `isToolDone`.

## Nicht Teil dieses Tools
- Keine Fragen, keine Formulare, kein Nachtragen fehlender Teile; dafür führt der Link zum Werkzeug.
- Keine Bewertung («gut», «schlecht», Ampeln) und keine Zahl, die nicht aus einem Stand stammt; auch kein Monatsbudget aus dem Jahresbudget.
- Kein Schreiben ins Profil.
- Keine Zusammenführung mehrerer Betriebe; eine Seite je Browser.
- Kein Import aus `tools/budget-planer`; die Form ist angenommen und wird defensiv gelesen (Bericht).
