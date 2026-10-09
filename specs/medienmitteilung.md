# Medienmitteilung für die Lokalpresse (medienmitteilung)

Klasse B (Generator mit KI, braucht den Server), Stand 05.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`) nach dem Vorbild `tools/nutzenversprechen` (Formular, Entwurf, Dokument) und `tools/positionierung` (regelbasierte Prüfung neben dem Entwurf). `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Betriebe, die einen Anlass in der Lokalpresse unterbringen wollen (Eröffnung, Jubiläum, Auszeichnung, Veranstaltung, neues Angebot, Personelles): in rund fünf Minuten eine Medienmitteilung im Nachrichtenstil mit Titel, Lead, Haupttext, Zitat, Boilerplate und Kontakt, geprüft auf Lead, Länge und Superlative, dazu eine Versand-Checkliste und eine Anleitung, wie du die Redaktionen deiner Region findest.

## Kategorie und Verknüpfung
Kategorie: content (achter Schritt im Pfad «Content», `pathStep.order` 8), Zielgruppe: kmu
Liest aus Profil: firma, ort, kanton, website (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt; «Wo?» ist mit dem Ort vorbelegt), positionierung (Hinweiszeile, geht als Grundlage für die Boilerplate mit an die KI)
Schreibt ins Profil: nichts (`writesProfile: []`). Die Grunddaten-Felder schreiben beim Tippen in das Profil, wie beim Marketing-Check.
Verwandte Tools: positionierung, textcheck, feiertagskalender
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Medienmitteilung erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Betrieb, Ort und Kanton, Anlass, Was, Wann, Wo, Wer, Warum, Zitat mit Name, Bildangebot, Website, Positionierung, je eine Zeile). Ausgabe = die Mitteilung als Markdown (`reportMarkdown`). **Weder Eingabe noch Ausgabe enthalten Kontaktdaten oder Empfänger:** Name, Telefon und E-Mail der Kontaktperson und die Liste der Medien bleiben im Browser.
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren und «Als E-Mail-Text kopieren» sind frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Betriebs an.» | «Firma, Ort, Kanton und Website speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Ort, Kanton, Website | text, Auswahl, text (`ProfileFieldsForm`) | nein | Profil | Ort bis 120, Kanton als Kürzel (geht mit Namen an die KI), Website bis 200 | – |
| Anlass | Auswahl | ja | – | Eröffnung, Jubiläum, Auszeichnung, Anlass oder Veranstaltung, Neues Angebot, Personelles, Anderes; leer → «Wähle den Anlass.» | – |
| Was ist passiert oder passiert? | textarea | ja | – | 20 bis 600 Zeichen | «Die Neuigkeit in ein paar Sätzen. …» |
| Wann? | text | ja | – | 1 bis 80 Zeichen; leer → «Sag, wann es stattfindet oder stattgefunden hat.» | «Datum und Uhrzeit, so wie sie im Lead stehen sollen. …» |
| Wo? | text | ja, wenn auch der Ort fehlt | Profil `ort`, bis die Person tippt | bis 120 Zeichen; beide leer → «Sag, wo es stattfindet, oder trag deinen Ort ein.» | «Vorschlag aus deinem Firmenprofil. Ort oder Lokal, …» |
| Wer ist beteiligt? | textarea | nein | – | bis 300 Zeichen | «Personen, Vereine, Partner, mit Funktion. …» |
| Warum ist das für die Region von Bedeutung? | textarea | ja | – | 10 bis 400 Zeichen | «Was die Gemeinde, die Kundschaft oder die Leserschaft davon hat. …» |
| Zitat einer Person (freiwillig) | textarea | nein | – | bis 300 Zeichen | «Ein Satz, den die Person wirklich sagen würde. Er erscheint wörtlich in der Mitteilung; die KI erfindet kein Zitat.» |
| Name und Funktion | text | ja, sobald ein Zitat steht | – | bis 80 Zeichen; sonst «Nenne Name und Funktion der Person, die du zitierst.» | «Wer das Zitat sagt, zum Beispiel «Anna Keller, Inhaberin». …» |
| Bildangebot (freiwillig) | textarea | nein | – | bis 200 Zeichen | «Was es zu sehen gibt und wer fotografiert hat. …» |
| Name der Kontaktperson | text | ja | – | bis 120 Zeichen; leer → «Gib eine Kontaktperson für Rückfragen an.» | «Die Kontaktdaten gehen nicht an die KI und nicht an Alperna. Dein Browser hängt sie unten an die Mitteilung an.» |
| Telefon / E-Mail der Kontaktperson (freiwillig) | text (tel), text (email) | nein | – | Telefon bis 40, E-Mail bis 120 und mit «@» und Punkt, sonst «Prüfe die E-Mail-Adresse der Kontaktperson.» | – |
| Deine Empfänger (freiwillig) | textarea | nein | – | je Zeile ein Medium, höchstens 20 Zeilen zu je 120 Zeichen, ohne Leerzeilen und Doppelte | «Je Zeile ein Medium, zum Beispiel «Appenzeller Zeitung, Redaktion Gossau». …» |
| Positionierung | nur Anzeige | nein | Profil `positionierung` | bis 600 Zeichen an die KI | «Deine Positionierung aus dem Profil: «…». Sie geht als Grundlage für die Boilerplate mit an die KI.» mit Link zu /profil. Fehlt sie: «Im Profil steht noch keine Positionierung. Die KI schreibt die Boilerplate dann aus Betrieb, Ort und deinen Angaben.» |

Jede grosse Textarea zeigt «n von max Zeichen, mindestens min» (`charCount`, je Zeichen). Vor dem Knopf steht, was an die KI geht: Betrieb, Ort, Kanton, Website, Anlass, die Angaben zur Meldung, Zitat samt Name und Funktion, Bildangebot (und die Positionierung, wenn vorhanden), nicht die E-Mail-Adresse und nicht die Kontaktdaten; «Gib nichts Vertrauliches ein.»

## Logik
1. **Eingabe prüfen** (`inputProblem(fields, values)`), in dieser Reihenfolge: Firma leer; Anlass nicht gewählt; «Was» unter 20 Zeichen; «Wann» leer; «Wo» und Ort leer; «Warum» unter 10 Zeichen; Zitat über 300 Zeichen; Zitat ohne Name und Funktion; Kontaktperson leer; E-Mail der Kontaktperson ohne «@». Meldung in `role="alert"`, kein Aufruf des Servers.
2. **Eingabe für die KI** (`toInput(profile, values)`): betrieb (≤ 120), ort (≤ 120), kanton (Name statt Kürzel, ≤ 40), website (≤ 200), positionierung (≤ 600), anlass (Schlüssel), was (≤ 600), wann (≤ 80), wo (≤ 120), wer (≤ 300), warum (≤ 400), zitat (≤ 300), zitatVon (≤ 80, leer ohne Zitat), bild (≤ 200). Einzeilige Felder werden einzeilig, mehrfache Leerzeichen eins. **Keine Kontaktdaten:** `toKontakt` und `parseEmpfaenger` bleiben im Browser. Schema `medienInput` (zod) im Browser und in der Route.
3. **Entwurf** (`useGenerator(medienGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Medienmitteilung für Schweizer Lokalmedien im Nachrichtenstil, dritte Person, sachlich, ohne Werbesprache und Superlative; das ersetzt die Du-Form der allgemeinen Regeln; Lead beantwortet wer, was, wann, wo in höchstens 40 Wörtern; Haupttext 2 bis 5 Absätze; Gesamtlänge 280 bis 360 Wörter, damit die Grenzen 250 bis 400 sicher gehalten werden; Ziffern nur aus den Angaben, Datum und Uhrzeit wie in «wann»; Zitat nur wörtlich aus den Angaben, sonst leer; Boilerplate drei Sätze, beginnt mit dem Betriebsnamen, aus Positionierung, Betrieb, Ort; Bildzeile nur aus «bild»; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zur Mitteilung", input)`. `maxTokens` 1'400, `temperature` 0.4.
4. **Prüfung der Antwort** (`checkGenerated` in der Route und Schema im Browser): JSON, Schema `medienOutput` (titel 20..90, lead 40..320, text 2 bis 5 Absätze à 80..600, zitat 0..320, boilerplate 80..400, bildzeile 0..200), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkMitteilung`, erster Grund gilt: «lead» (mehr als 40 Wörter), «w-fragen» (der Betriebsname, ohne Rechtsform und ohne Ortszusatz, oder der Ort bzw. ein Begriff aus «wo» steht nicht im Lead; Wörter aus dem Betriebsnamen zählen bei «wo» nicht), «zahl» (eine Ziffernfolge steht nicht in den Angaben; Datum und Uhrzeit dürfen anders geschrieben sein, Nullen zählen nicht), «laenge» (Titel, Lead, Haupttext, Zitat und Boilerplate zusammen unter 250 oder über 400 Wörter), «zitat» (die Angaben haben kein Zitat, der Entwurf aber eins; oder weniger als drei Viertel der Wörter des Zitats stehen in der Angabe). Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Lead höchstens 40 Wörter und Gesamtlänge 150 bis 400 Wörter sind Richtwerte von Alperna, keine Statistik; im UI steht der Satz «Lead höchstens 40 Wörter, Gesamtlänge 150 bis 400 Wörter: Richtwert von Alperna, keine Statistik.»
   Annahme: Zahlen als Wort («zwölf Malerinnen und Maler») sind erlaubt, nur Ziffern werden geprüft (wie beim Text-Umschreiber).
5. **Dokument** (`toDocument(output, input, kontakt, datum)`): Kopf «Medienmitteilung» mit «Ort, Datum» (`dateCH`), Titel, Lead (als Überschrift der dritten Stufe, damit er in PDF und Word fett steht), Absätze mit dem Zitat nach dem ersten Absatz (`«Zitat», sagt Name, Funktion.`), «Bildmaterial: …», Boilerplate unter «Über <Betrieb>», «Kontakt für Rückfragen» mit Name, Telefon, E-Mail (nur ausgefüllte Zeilen). Das Zitat erscheint nur, wenn die Angaben eins haben; lässt der Entwurf es weg, gilt der Wortlaut der Angabe. Die Bildzeile erscheint nur bei einem Bildangebot; fehlt sie im Entwurf, gilt die Angabe. Die Empfänger stehen nicht im Dokument: Es geht so an die Redaktionen. Dateiname `medienmitteilung-<betrieb>`.
6. **Prüfung für die Person** (`checkDraft(output, input)`): sieben Regeln, je mit `ok`, Bezeichnung und einem Satz: Lead höchstens 40 Wörter; Lead nennt wer und wo; Lead nennt wann (ein Begriff der Zeitangabe, nur Hinweis); Zahlen stammen aus den Angaben; Länge 150 bis 400 Wörter; Zitat stammt von dir; keine Superlative und keine Werbesprache (`superlativeIn`: eigene Liste wie «beste», «schönste», «einzigartig» plus die Sperrliste der Marke aus `lib/brand-rules.ts`; das Zitat ist ausgenommen). Nach der Prüfung der Antwort sind Lead, Wer und Wo, Zahlen, Länge und Zitat erfüllt; Hinweise kommen vor allem bei Wann und Superlativen.
7. **Versand-Checkliste** (`versandCheckliste(empfaenger, { titel, bild })`): Fakten prüfen und Zitat freigeben lassen; je Empfänger «Senden an: …» (ohne Empfänger: Empfänger festlegen mit Verweis auf «Empfänger finden»); Betreffzeile «Medienmitteilung: <Titel>»; Text in die E-Mail und Word zusätzlich anhängen; Bild als Anhang in Druckauflösung (mit Bildangebot als Aufgabe, sonst als «Falls du ein Bild hast»); am Vormittag unter der Woche senden (Richtwert von Alperna, keine Statistik); am Versandtag erreichbar sein; nach einigen Tagen nachfassen (Richtwert von Alperna, keine Statistik); Mitteilung auf die eigene Website und als Beitrag ins Google-Unternehmensprofil.
8. **Empfänger finden** (`empfaengerHinweise(ort, kanton)`): sechs Hinweise mit Suchbegriffen, die Gemeinde und Kanton einsetzen («Gossau Anzeiger Redaktion», «St. Gallen Regionalradio Redaktion»): Lokalzeitung und Anzeiger, Gemeindeblatt, Regionalradio und Regionalfernsehen, Online-Portale, Branche und Verband, persönlich anschreiben. Keine Adressen und keine Datei mit Redaktionen: E-Mail-Adressen lassen sich hier nicht belegen.
9. **Stand speichern** (`mt:medienmitteilung`): `{ v: 1, input, output, kontakt, empfaenger }`, erst nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputter Entwurf fällt allein weg, die Eingabe bleibt (für «Angaben ändern»); kaputte Kontaktdaten oder Empfänger fallen einzeln weg. Der Pfad-Fortschritt erkennt das Ergebnis am Objekt unter `output`.
10. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Medienmitteilung» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.» (`data-testid="ki-hinweis"`), der Liste der Platzhalter (`placeholdersIn`, `data-testid="platzhalter"`), der Prüfung (`ul` mit `aria-label="Prüfung"`, je Regel «ok» oder «Hinweis» und ein Satz, `data-testid="pruefung-<id>"`), `DocView` mit der Mitteilung (`data-testid="mitteilung"`), dem Kasten «Versand-Checkliste» (`ol`) und dem Abschnitt «Empfänger finden» (`ul`).
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Als E-Mail-Text kopieren» (reiner Text ohne Markdown, mit Kopfzeile und Kontakt), «Angaben ändern» (zeigt das Formular mit der gespeicherten Eingabe, dem Kontakt und den Empfängern über dem Ergebnis; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Eingabe, Entwurf, Kontakt und Empfänger, das Profil bleibt).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Status während der Anfrage mit `role="status"` («Die KI schreibt deine Medienmitteilung.»).
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Firma leer: Meldung, kein Aufruf. Ort, Kanton, Website leer: gehen leer an die KI; sind Ort und «Wo» leer, verlangt das Werkzeug eine Angabe.
- Profil ganz leer: «Wo?» ist leer, keine Positionierungszeile mit Text, nur der Hinweis, dass die KI die Boilerplate aus Betrieb, Ort und Angaben schreibt.
- Zitat ohne Name: Meldung. Name ohne Zitat: der Name fällt weg.
- Kontaktperson leer: Meldung. Telefon und E-Mail leer: erlaubt, das Dokument zeigt nur den Namen. Ungültige E-Mail: Meldung.
- Empfänger leer: die Checkliste fordert auf, Empfänger festzulegen. Mehr als 20 Zeilen: die ersten 20.
- Sehr wenig Stoff in den Angaben: Die KI soll Platzhalter in eckigen Klammern setzen statt Füllsätze; reicht es trotzdem nicht für 150 Wörter, wird der Entwurf verworfen (Meldung, kein CRM-Eintrag, Formular und Eingaben bleiben).
- Antwort mit fremder Ziffer, Lead über 40 Wörtern, Lead ohne Betrieb oder Ort, Länge ausserhalb von 150 bis 400 Wörtern oder erfundenem Zitat: verworfen.
- Datum in anderer Schreibweise (14. November statt 14.11.): erlaubt; der Monat als Zahl, wenn die Angabe den Namen nennt: «zahl».
- Cookie fehlt (403): Fenster, einmal wiederholen (`useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Stand bleibt.
- Gespeicherter Stand kaputt oder von einer anderen Version: leerer Stand.
- Keine Daten-Datei: Das Werkzeug braucht keine `data/*.json`; die Grenzen 40, 150 und 400 sind Richtwerte von Alperna.

## Texte
- Tagline: «Aus Anlass und W-Fragen eine Medienmitteilung im Nachrichtenstil, geprüft auf Lead, Länge und Superlative.»
- SEO-Title und Meta-Description in `content/tools/medienmitteilung.md` (Title mit «Schweiz», ≤ 60 Zeichen).
- Keyword «Medienmitteilung»: in der H1, im ersten Absatz und drei- bis fünfmal insgesamt.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau, Jubiläum: Titel, Lead, Auszug aus dem Haupttext, Zitat, Prüfung; von Hand geschrieben und so gekennzeichnet), FAQ (5: Drucken Lokalmedien so etwas, an wen schicke ich das, was geht an die KI, brauche ich ein Konto, erfindet die KI Zahlen oder Zitate) und Alperna-Satz (Baustein Website): `content/tools/medienmitteilung.md`.

## Tests
`tools/medienmitteilung/generator.test.ts` (Eingabeschema mit allen Grenzen, Ausgabeschema, Wörter und Namen, `checkMitteilung` je Regel positiv und negativ: Lead mit 41 Wörtern, fehlender Ort und fehlender Betrieb, «wo» statt Ort, fremde Ziffer in jedem Feld, Datumsschreibweisen, Länge mit 249, 250, 400 und 401 Wörtern sowie 240 und 410, erfundenes und umformuliertes Zitat, `checkGenerated` mit gültiger Antwort im Codeblock, Platzhalter, fremder Zahl, Ausrufezeichen, fremdem Link, Sperrliste, falscher Form und ohne JSON, Prompt ohne Eingaben in der Anweisung), `logic.test.ts` (`inputProblem` in Reihenfolge, `toInput` mit und ohne Positionierung, `toForm`, Empfänger, `eingabeText` ohne Kontaktdaten, Zitat, `toDocument` mit und ohne Zitat, Bild und Kontakt, Mailtext, CRM-Markdown ohne Kontakt, Superlative, `checkDraft` je Regel, Checkliste mit und ohne Empfänger, Empfänger-Hinweise, Stimme der Texte, `parseState` bei kaputten Daten und als Rundlauf) und `Tool.test.tsx` (Formular, Ablauf gegen Stubs von `/api/generate` und `/api/result`, CRM ohne Kontaktdaten, Neuladen, Ausfall). `beispiel.ts` hält den Beispiel-Entwurf der Malerei Keller, den die Tests als gültigen Entwurf nutzen. 85 Fälle.

## Nicht Teil dieses Tools
- Empfänger-Datenbank oder Adressliste der Redaktionen: Adressen ändern sich und lassen sich hier nicht belegen; es gibt Suchbegriffe und eine Checkliste.
- Versand aus dem Werkzeug: Die Person verschickt die Mitteilung selbst.
- Bearbeiten des Entwurfs im Werkzeug: Word oder der Mailtext, danach der Textcheck.
- Mehrere Sprachen (Französisch, Italienisch) und mehrere Varianten in einem Durchlauf.
- Rechtsaussagen (Regel 8), etwa zu Bildrechten: keine; die Checkliste lässt nur die zitierte Person ihren Satz vor dem Versand lesen.
- Schreiben ins Profil.
