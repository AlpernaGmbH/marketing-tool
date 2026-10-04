# SWOT-Analyse (swot)

Klasse B (Generator mit KI, braucht den Server) mit deterministischem Teil, Stand 04.10.2026. Baut auf dem Generator-Baustein auf (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`), Vorbilder `tools/ideen-aus-website`, `tools/persona`, `tools/nutzenversprechen`. `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen, Inhaber und Vereinsvorstände, die wissen wollen, worauf ihr Marketing bauen kann und was es gefährdet: in rund fünf Minuten eine SWOT-Analyse (Stärken, Schwächen, Chancen, Risiken) mit gemessenen Fakten aus den eigenen Checks, einem Satz zur Lage und drei bis fünf Massnahmen («Daraus folgt»), die nennen, welche Stärke sie nutzen und welche Schwäche sie beheben.

## Kategorie und Verknüpfung
Kategorie: strategie (achter Schritt im Pfad «Strategie», `pathStep.order` 8), Zielgruppe: beide (KMU und Vereine)
Liest aus Profil: firma, branche, ort, groesse (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), positionierung (Hinweiszeile, geht als Hintergrund mit an die KI)
Liest aus dem Browser: `mt:digitaler-auftritt-check` (gespeichertes Check-Ergebnis, `parseCheckState`) und `mt:reifegrad-check` (Stand der QuestionnaireEngine, `parseState`)
Schreibt ins Profil: nichts (`writesProfile: []`). Die Grunddaten-Felder schreiben beim Tippen ins Profil, wie beim Marketing-Check.
Verwandte Tools: reifegrad-check, digitaler-auftritt-check, positionierung
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «SWOT erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Betrieb, Branche, Ort, Grösse, Ziel, die vier Felder, Positionierung, Fakten; je eine Zeile, Absätze mit « · » geglättet). Ausgabe = `reportMarkdown` (das Dokument als Markdown).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren ist frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deiner Firma oder deines Vereins an.» | «Firma, Branche, Ort und Grösse speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 | – |
| Grösse | single (`ProfileFieldsForm`, Liste je Organisationstyp) | nein | Profil `groesse` | Schlüssel wie `GROESSEN`; geht als Wort an die KI («10 bis 49 Mitarbeitende», `groesseLabel`) | – |
| Fakten aus deinen Checks | nur Anzeige (Liste) | – | aus `mt:digitaler-auftritt-check` und `mt:reifegrad-check` (`faktenAus`) | höchstens 12 Fakten à 200 Zeichen | je Fakt «Stärke:» oder «Schwäche:», Text, Herkunft «(aus deinem Marketing-Check)» / «(aus deinem Reifegrad-Check)». Ohne Ergebnisse: Hinweis mit Links zu beiden Werkzeugen. Mit Ergebnissen, aber ohne klaren Fakt: «Aus deinen Checks ergibt sich kein klarer Fakt …» |
| Stärken: Was läuft gut? | textarea | eines der vier | gespeicherter Stand | max. 600 Zeichen | «Im Betrieb: Angebot, Team, Stammkundschaft, Ruf in der Region, was Kundschaft lobt.» |
| Schwächen: Was fehlt oder nervt? | textarea | eines der vier | gespeicherter Stand | max. 600 | «Im Betrieb: keine Zeit fürs Marketing, Website veraltet, wenig Bewertungen, Auftritt nicht einheitlich.» |
| Chancen: Was verändert sich um dich herum? | textarea | eines der vier | gespeicherter Stand | max. 600 | «Neue Quartiere, Bauprojekte, Wegfall eines Mitbewerbers, Trends in der Region.» |
| Risiken: Was könnte dir schaden? | textarea | eines der vier | gespeicherter Stand | max. 600 | «Von aussen: neue Mitbewerber, Preisdruck, weniger Nachfrage, neue Vorschriften, Abhängigkeit von einem Kanal.» |
| Ziel für die nächsten zwölf Monate (freiwillig) | text | nein | gespeicherter Stand | max. 200 | «Zum Beispiel «mehr Anfragen von Privaten aus Gossau und Umgebung». Die Massnahmen führen dorthin.» |
| Positionierung | nur Anzeige | nein | Profil `positionierung` | max. 600 Zeichen an die KI | «Deine Positionierung aus dem Profil: «…». Sie geht als Hintergrund mit an die KI.» mit Link zu /profil |

Jede Textarea zeigt «n von 600 Zeichen» (`charCount`, je Schriftzeichen). Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, Grösse, die vier Felder und das Ziel, dazu die Positionierung (wenn vorhanden) und die Fakten (wenn vorhanden), nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein, zum Beispiel keine Zahlen aus der Buchhaltung.»

## Logik
1. **Fakten sammeln** (`faktenAus(checkRaw, reifegradRaw)`, deterministisch, getestet). Beide Stände kommen roh aus dem Browser und werden hier geprüft; kaputte Stände ergeben keine Fakten.
   - Marketing-Check (`faktenAusCheck`): nur bei `phase === "result"` mit gültigem Ergebnis (`parseCheckState`). Je Bereich mit `weight > 0`, Titel und endlicher `score` (0 bis 1): `n = round(clamp(score) × 100)`; `score ≥ 0,75` → Stärke «Bereich «<Titel>» ist stark (n von 100)»; `score < 0,4` → Schwäche «Bereich «<Titel>» ist schwach (n von 100)»; dazwischen kein Fakt. Herkunft «aus deinem Marketing-Check».
     Annahme: Die Schwellen 0,75 und 0,4 sind Richtwerte dieses Werkzeugs, keine Statistik (im Code `CHECK_STARK`, `CHECK_SCHWACH`). Bereiche ohne Gewicht (zum Beispiel «Online-Shop» bei einem Handwerksbetrieb) zählen nicht.
   - Reifegrad (`faktenAusReifegrad`): nur bei `phase === "result"` (Format der QuestionnaireEngine, `parseState`). `evaluate(answers, checkInfo(check))` wie im Werkzeug selbst, also mit dem Marketing-Check zur Hälfte in «Auftritt». Stärkste Dimension (erste bei Gleichstand) → Stärke «Reifegrad: «<Name>» ist die stärkste Dimension (n von 100, Stufe «…»)»; schwächste (erste bei Gleichstand) → Schwäche. Liegen alle fünf gleichauf: ein Fakt «Reifegrad: alle fünf Dimensionen liegen bei n von 100 (Stufe «…»)», ab 50 als Stärke, darunter als Schwäche (Annahme: Mitte der Skala, `REIFEGRAD_MITTE`).
   - Reihenfolge: erst Check, dann Reifegrad; jeder Text auf 200 Zeichen gekürzt, höchstens 12 Fakten (`MAX_FAKTEN`). Dazu `hatCheck` und `hatReifegrad` für den Hinweis im Formular.
2. **Eingabe prüfen** (`inputProblem(fields, form)`), in dieser Reihenfolge: Firma leer → Meldung; alle vier Felder leer (nur Leerraum zählt als leer) → «Fülle mindestens eines der vier Felder aus: Stärken, Schwächen, Chancen oder Risiken.»; ein Feld über 600 Zeichen → Meldung mit Feldname; Ziel über 200 → Meldung. Meldung in `role="alert"`, kein Aufruf des Servers.
3. **Eingabe für die KI** (`toInput(fields, form, fakten)`): betrieb (≤ 120), branche (≤ 120), ort (≤ 80), groesse als Wort (≤ 60), positionierung (≤ 600), ziel (≤ 200), staerken, schwaechen, chancen, risiken (je ≤ 600, Absätze bleiben, doppelte Leerzeichen fallen weg), fakten (Texte der Fakten, ≤ 12 à ≤ 200, leere fallen weg). Schema `swotInput` (zod) im Browser und in der Route; kein `.default()`, kein `.transform()`.
4. **Entwurf** (`useGenerator(swotGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (SWOT fürs Marketing eines Schweizer KMU oder Vereins; Angaben und Fakten ordnen, schärfen, nur ergänzen, was sich daraus ergibt, nichts erfinden; innen/aussen erklärt; Chancen und Risiken auf Ort, Region und Branche beziehen, allgemeine Entwicklungen nur mit Platzhalter wie [Bauprojekt in deiner Gemeinde]; je Punkt «punkt» und «warum»; Mindestmengen; Folgerungen konkret und klein beginnend, «nutzt», «behebt», «aufwand», Ziel als Richtung; «einSatz» ruhig; Ziffern nur aus Angaben und Fakten; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben und Fakten", input)`. `maxTokens` 1'600, `temperature` 0.4.
5. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): JSON, Schema `swotOutput` (staerken, schwaechen, chancen je 3 bis 6 Punkte, risiken 2 bis 5, je {punkt 10..160, warum 10..200}; folgerungen 3 bis 5 à {massnahme 10..160, nutzt 3..80, behebt 0..80, aufwand klein|mittel|gross}; einSatz 40..240), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkSwot`: jede Ziffernfolge in irgendeinem Text der Antwort (Satz, alle Punkte und Gründe, Massnahme, nutzt, behebt) muss in den Angaben oder Fakten stehen (`numbersIn`, wie beim Text-Umschreiber: Listenmarken und Trennzeichen fallen weg) → sonst «zahl». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («zwölf Monate», «drei Tage») sind erlaubt, nur Ziffern werden geprüft. Die Zahlen der Fakten («76 von 100») sind damit erlaubt, sobald die Fakten mitgehen.
6. **Stand speichern** (`mt:swot`): `{ v: 1, form, input, output }`. `form` wird vor der Anfrage gespeichert (bleibt nach dem Neuladen und bei einem Fehler), `input` und `output` nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten oder falscher Version den leeren Stand; ein kaputter Entwurf oder eine kaputte Eingabe lässt beide zusammen wegfallen (das Dokument braucht beide), das Formular bleibt (auf die Grenzen gekürzt).
7. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref).

## Ausgaben
- Ergebnis: `ResultCard` «Deine SWOT-Analyse» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», dem KI-Satz zur Lage (`einSatz`, hervorgehoben), der Liste der Platzhalter (`placeholdersIn`), den vier Feldern als Raster (zwei Spalten ab `sm`, eine Spalte auf 375 px; je ein Abschnitt mit Überschrift Stärken, Schwächen, Chancen, Risiken und einer Liste mit `aria-label` gleich der Überschrift; je Punkt «punkt» fett und «warum» gedämpft), darunter «Daraus folgt» mit der Tabelle Massnahme | Nutzt | Behebt | Aufwand (`DocView` des Tabellenblocks) und, wenn Fakten mitgingen, dem Hinweis «Mit n Fakten aus deinen Checks erstellt».
- Dokument (`toDocument(output, input)`): Titel «SWOT-Analyse», Untertitel «Marketing von <Betrieb>», Kopf mit Firmenname, Facts Betrieb (mit Ort), Branche, Ziel (zwölf Monate) (leere fallen weg), KI-Hinweis, «Die Lage in einem Satz», vier Abschnitte als Listen «Punkt: Warum» (`punktZeile`, ohne doppelten Punkt), «Daraus folgt» als Tabelle (leeres «behebt» als «–»), «Fakten aus deinen Checks» als Liste (nur wenn vorhanden). Dateiname `swot-<betrieb>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zeigt das Formular mit dem gespeicherten Stand über dem Ergebnis, Fokus auf «Stärken»; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Formular, Eingabe und Entwurf; Profil und Fakten bleiben).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Status während der Anfrage mit `role="status"` («Die KI schreibt deine SWOT-Analyse.»).
- Zählung: `popular:swot` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Profil leer: Firma muss getippt werden (Meldung); Branche, Ort und Grösse gehen leer an die KI; keine Positionierungszeile.
- Keine Ergebnisse der Checks im Browser: Kasten «Fakten aus deinen Checks» mit Links zu beiden Werkzeugen; `fakten: []` an die KI; die Analyse geht trotzdem.
- Checks vorhanden, aber alle Bereiche in der Mitte (0,4 bis 0,75) oder Reifegrad mit Fragebogen vor dem Ergebnis: kein Fakt, Hinweis «kein klarer Fakt».
- Alle fünf Dimensionen des Reifegrads gleichauf (zum Beispiel alles auf der tiefsten Stufe): ein Fakt statt zwei.
- Bereiche ohne Gewicht, ohne Titel, mit `NaN` oder Text als Punktzahl: fallen weg. Punktzahl über 1: auf 100 begrenzt.
- Mehr als 12 Fakten (viele schwache Bereiche plus Reifegrad): die ersten 12, Check vor Reifegrad.
- Alle vier Felder leer (nur Ziel gefüllt): Meldung, kein Aufruf. Ein Feld reicht.
- Feld über 600 Zeichen oder Ziel über 200: `maxLength` begrenzt die Eingabe, `inputProblem` meldet, `toInput` kürzt zusätzlich.
- Antwort mit einer Ziffer, die weder in den Angaben noch in den Fakten steht (auch in «nutzt» oder «behebt»): verworfen, Meldung, kein CRM-Eintrag, Formular bleibt. Ohne mitgegebene Fakten sind auch die Check-Zahlen fremd.
- Antwort mit zu wenigen Punkten (zwei Stärken), zu vielen Folgerungen, fremdem Aufwand oder zu kurzem Satz: Schema, verworfen.
- Antwort mit Wörtern aus der Sperrliste («ganzheitlich») oder den Regeln («jetzt», Ausrufezeichen): verworfen durch `textIssue`.
- Platzhalter «[Bauprojekt in deiner Gemeinde]»: erlaubt, Liste über dem Ergebnis.
- Cookie fehlt (403 bei /api/generate): Fenster, einmal wiederholen (`useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz, Stand bleibt.
- Gespeicherter Stand kaputt, falsche Version: leerer Stand; nur kaputter Entwurf: Formular bleibt.
- Nach dem Neuladen steht die Analyse wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. Ändern sich die Checks danach, ändern sich die angezeigten Fakten im Formular, die gespeicherte Analyse bleibt, bis die Person neu erstellt.

## Texte
- Tagline: «Stärken, Schwächen, Chancen und Risiken deines Marketings, mit Fakten aus deinen Checks und Folgerungen.» (104 Zeichen; die Fassung mit «drei bis fünf Folgerungen» hätte 118 und überschreitet die Grenze von 110 in `defineTool`).
- SEO-Title: «SWOT-Analyse Schweiz: Marketing-SWOT für KMU mit KI»; Meta-Description in `content/tools/swot.md`.
- Keyword «SWOT-Analyse»: in H1 und Text, drei bis fünf Mal.
- Erklärtext, Beispiel (Malerei Keller, Gossau, je zwei Punkte pro Feld und zwei Folgerungen als Kasten, Fakten mit den Zahlen aus `sampleResult`: Website und SEO 76, Google-Business-Profil 25), FAQ (6) und Alperna-Satz (Baustein Website): `content/tools/swot.md`.

## Tests
`tools/swot/generator.test.ts` (Eingabeschema mit Grenzen je Feld, Fakten-Anzahl und -Länge, fehlendes Feld; Ausgabeschema an den Ober- und Untergrenzen, fremder Aufwand, fehlende Teile; `numbersIn`, `knownText`, `outputTexts`; `checkSwot` lässt Zahlen aus Angaben und Fakten durch und verwirft fremde Ziffern in Satz, Punkt, Grund, Massnahme und «nutzt», und ohne Fakten auch die Check-Zahlen; `checkGenerated` mit gültiger Antwort im Codeblock, mit Platzhaltern, mit fremder Zahl, mit kaputtem Schema, ohne JSON, mit verbotenem Wort, mit Sperrlisten-Wort; Prompt ohne Eingaben in der Anweisung, Daten in der Nutzernachricht, Slug, Tokens, Temperatur) und `logic.test.ts` (Konstanten; `faktenAusCheck` mit `sampleResult` und mit synthetischen Bereichen an den Schwellen; `faktenAusReifegrad` mit dem Rechenbeispiel, mit Check, bei Gleichstand, vor dem Ergebnis, kaputt; `faktenAus` ohne, mit einem, mit beiden Ständen, mit kaputten Ständen, Obergrenze 12 und 200 Zeichen; `inputProblem` je Fall; `toInput` mit Grösse als Wort, Kürzungen, Fakten; `eingabeText`; `toDocument` mit allen Abschnitten und Reihenfolge, ohne leere Facts; `punktZeile`, `folgerungenTabelle`, `reportMarkdown`; `parseState` bei kaputten Daten und als Rundlauf). Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Eigene Messung: keine neue Prüfung der Website, keine Fragen; die Fakten kommen nur aus gespeicherten Ergebnissen der beiden Checks.
- Auswahl einzelner Fakten (an- und abwählen): alle gültigen Fakten gehen mit; wer einen nicht will, ändert das Ergebnis im jeweiligen Werkzeug.
- Statistik zu Branche oder Region als Chancen und Risiken: keine Zahlen ohne Quelle; die KI nennt allgemeine Entwicklungen nur als Platzhalter.
- Gewichtung oder Punktzahl der SWOT (zum Beispiel eine TOWS-Matrix): nur die Felder und die Folgerungen.
- Schreiben ins Profil: nichts; die Positionierung kommt aus dem Werkzeug «Positionierung».
- Mehrere Analysen nebeneinander: eine je Betrieb; «Neu beginnen» ersetzt sie.
- Rechtsaussagen (Regel 8): keine; neue Vorschriften sind ein Beispiel im Hilfetext, keine Aussage.
