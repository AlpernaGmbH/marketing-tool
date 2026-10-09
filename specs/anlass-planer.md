# Anlass-Rückwärtsplaner (anlass-planer)

Klasse C (alles im Browser), Stand 05.10.2026. Kein Server, keine KI (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM.

## Nutzen in einem Satz
Für KMU und Vereine, die einen Anlass planen: aus Anlass-Art und Datum ein Zeitplan, der rückwärts vom Anlass läuft, mit Aufgaben von zehn Wochen davor bis eine Woche danach, je Aufgabe Datum, Kanal und (wo es passt) einem Werkzeug der Werkstatt, in fünf Minuten, als Checkliste mit Abhaken, Kalenderdatei (.ics), Druck-PDF und Word.

## Kategorie und Verknüpfung
Kategorie: content (Schritt 9 im Pfad «Content»), Zielgruppe: beide
Liest aus Profil: firma, organisationstyp, kanaele
Schreibt ins Profil: nichts. Firma und Organisationstyp erfragt das Werkzeug über `ProfileFieldsForm`; die Felder gehören ins Profil und werden dort gepflegt.
Verwandte Werkzeuge: medienmitteilung, post-generator, feiertagskalender. Aufgaben verweisen zusätzlich auf caption-baukasten, qr-set, whatsapp-link, bewertungs-kit, sponsoring-dossier, vereins-kommunikation und newsletter-check, wenn das Werkzeug zur Aufgabe passt.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (KMU oder Verein) | single | ja | profile.organisationstyp, sonst KMU | – | bestimmt, welche Aufgaben erscheinen und welche Anlass-Arten zuerst stehen |
| Firma / Name des Vereins | text (Profil) | nein | profile.firma | – | steht im Kopf von PDF und Word |
| Was planst du? | single (Select) | ja | erste Art der Liste | eine der sechs Arten | Tag der offenen Tür, Eröffnung, Jubiläum, Messe oder Marktstand, Dorffest oder Vereinsfest, Generalversammlung; für Vereine stehen Dorffest und Generalversammlung zuerst, für KMU zuletzt, alle sind immer wählbar |
| Name des Anlasses | text | ja | – | 3 bis 80 Zeichen (nach Trim) | Platzhalter «Tag der offenen Tür Malerei Keller» |
| Datum des Anlasses | date | ja | – | gültiges Datum JJJJ-MM-TT, nicht vor dem heutigen Datum | Fehler in `role="alert"` |
| Kanäle | multi | ja, mindestens einer | profile.kanaele (Vergleich über Name), sonst Website, Instagram, Aushang und Flyer | Website, Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Aushang und Flyer, Lokalzeitung und Anzeiger, WhatsApp | – |
| Wir schalten bezahlte Inserate | boolean | nein | – | – | fügt «Inserat planen und buchen» und «Inserat prüfen» ein |

## Logik
Alle Regeln in `tools/anlass-planer/logic.ts`, die Vorlagen in `data.ts`. Datum immer als JJJJ-MM-TT und mit UTC-Teilen gerechnet (`addDays`, `parseIso` aus dem Content-Kalender), nie über die lokale Zeitzone. Das heutige Datum kommt als Parameter `heute` in die Funktionen; `todayIso(now)` bildet es in der Zeitzone Europe/Zurich.

1. **Vorlagen.** Eine Vorlage hat `id`, `titel`, `wochenVorher` (ganze Zahl von 10 bis -1; 0 = Anlasstag, 1 = eine Woche davor, -1 = eine Woche danach), optional `tageVorher` (feinerer Termin; sonst 7 × Wochen; negativ = nach dem Anlass), `kanal` (Schlüssel eines Kanals oder `intern`), optional `werkzeug` (Slug eines bestehenden Werkzeugs), optional `nurWenn` (Kanal-Schlüssel oder `inserate`), optional `hinweis` (ein kurzer Satz, etwa «Frist beim Anzeiger erfragen.») und `vereinsTyp` (`true` nur Vereine, `false` nur KMU, `"beide"`). `wochenVorher` ist die Woche, in der die Aufgabe steht; hat die Vorlage `tageVorher`, passt `wochenVorher` dazu (aufgerundet, Test).
2. **Gemeinsame Aufgaben aller Arten (neun):** Ziel und Budget klären, Datum und Ort sichern, Verantwortliche verteilen, Programm festlegen, Einladung gestalten, Erinnerung eine Woche vorher, Aufbau am Vortag, Besuchende und Anfragen zählen (Anlasstag), Rückblick mit Zahlen (eine Woche danach).
3. **Aufgaben je Kanal (`nurWenn` = Kanal):** Ankündigung, Erinnerung und Dank auf den gewählten Kanälen, Flyer und Plakate, Rückblick auf der Website, Bewertungen anfragen. Aufgaben für Kanäle, die nicht gewählt sind, entfallen: Hat eine Vorlage einen Kanal (nicht `intern`) und kein `nurWenn`, gilt der Kanal als Bedingung.
4. **Aufgaben je Art:** sieben bis elf eigene Aufgaben je Art (Tag der offenen Tür: Anmeldung oder Laufkundschaft klären, Führungen, Verpflegung, Wegweiser, Anfragen beantworten; Messe: Standplatz, Messeangebot, Standmaterial, Prospekte, Standbesetzung; Generalversammlung: Traktanden, Wahlen, Anträge, Jahresbericht und Rechnung, Einladung mit Hinweis «Frist laut Statuten prüfen», Protokoll; Dorffest: «Bei der Gemeinde nachfragen, ob eine Bewilligung nötig ist», Helferplan, Verkehr und Parkplätze, Sponsorenhinweis). Eine Medienmitteilung gibt es nur, wenn «Lokalzeitung und Anzeiger» gewählt ist.
5. **Vereinsflagge.** Der Organisationstyp aus dem Profil (`kmu` oder `verein`) filtert Aufgaben mit `vereinsTyp`: Sponsoren anfragen und Mitglieder informieren nur für Vereine, «Stammkundschaft und Partner persönlich einladen» und Bewertungen anfragen nur für KMU.
6. **Inserate.** Ist die Checkbox gesetzt, kommen genau zwei Aufgaben dazu: «Inserat planen und buchen» (fünf Wochen vorher, Hinweis «Frist beim Anzeiger erfragen.») und «Inserat prüfen» (zwei Wochen vorher). Kanal ist «Lokalzeitung und Anzeiger».
7. **Datum der Aufgabe** = Datum des Anlasses minus `tageVorher` (sonst 7 × `wochenVorher`). Fällt das Datum auf ein Wochenende, bleibt es (Anlässe finden am Wochenende statt). Ausnahme: Aufgaben mit Kanal `intern` und `tage` ungleich 0 rutschen auf den Freitag davor. Annahme: Aufgaben am Anlasstag selbst bleiben stehen, sonst läge «Besuchende zählen» vor dem Anlass. Annahme: Eine interne Aufgabe nach dem Anlass, deren Freitag vor dem Anlass läge, rutscht stattdessen auf den folgenden Montag.
8. **Fällig.** Liegt das Datum vor `heute`, bleibt die Aufgabe im Plan und trägt `faellig: true` («schon fällig»). Der Plan wird nie verschoben. `faelligAnzahl` zählt sie, `tageBis` = Tage von `heute` bis zum Anlass, `wochenBis` = `tageBis` durch 7, abgerundet. Meldung: «n Aufgaben sind schon fällig, weil bis zum Anlass x Wochen bleiben.» (bei einer Aufgabe und bei einer Woche in der Einzahl; unter einer Woche «weniger als eine Woche»; am Anlasstag «weil der Anlass heute ist»). Abweichung vom Auftrag: ohne «nur noch», weil CLAUDE.md das Wort im Ton verbietet.
9. **Sortierung** nach Datum, dann nach Titel (`localeCompare` de-CH).
10. **Gruppen** nach `wochenVorher` der Vorlage, absteigend: «10 Wochen vorher» bis «1 Woche vorher», «Anlasstag», «1 Woche danach».
11. **Abhaken.** `erledigt` ist eine Liste von Aufgaben-IDs im Stand. Unbekannte IDs werden beim Zählen ignoriert. Das Abhaken ändert den Plan nicht und löst kein `sendResult` aus. Erstellt die Person den Zeitplan erneut mit derselben Art und demselben Datum, bleiben die Haken, sonst beginnen sie neu.
12. **Annahme:** Die Vorlagen und ihre Vorlaufzeiten sind «Richtwert von Alperna, keine Statistik». Sie stehen im UI, im Dokument und im Seitentext so. Keine Rechtsaussagen und keine genannten Fristen: Bewilligungen heissen «bei der Gemeinde nachfragen», Fristen «Frist beim Anzeiger erfragen» oder «Frist laut Statuten prüfen». Titel und Hinweise enthalten keine Ziffern und nicht die Wörter «gesetzlich», «Pflicht», «Paragraf», «Art.» (Test).

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster) in der `ResultCard` «Dein Zeitplan»: Kopf (Name, Datum, Art, Zahl der Aufgaben), Hinweis zu fälligen Aufgaben, Fortschritt «n von m erledigt» (`role="status"`), Liste der Aufgaben (`ul`, `aria-label="Aufgaben"`) nach Wochen, je Zeile Checkbox mit dem Titel als Label, Datum, Kanal, Hinweis, «schon fällig» und, wo vorhanden, der Link «Werkzeug öffnen» (Name für Screenreader: «Werkzeug öffnen: <Titel der Aufgabe>»). Die Gruppen sind verschachtelte Listen: `ul` «Aufgaben» enthält je Woche ein `li` mit Überschrift und einer eigenen `ul`, benannt nach der Woche (zum Beispiel «Anlasstag»).
- Text kopieren (frei) und Word über `DocumentExport` (nur Word). Kalender (.ics) und Druck-PDF über `guardDownload`. Dokument: Steckbrief, Tabelle Datum, Aufgabe, Kanal, Erledigt (`[ ]`, erledigte `[x]`), Hinweis zur Vorlage.
- Kalenderdatei: ein ganztägiges Ereignis je Aufgabe und eines für den Anlass, UTF-8, Zeilen nach RFC 5545 gefaltet (Funktion `foldLine` aus dem Content-Kalender), Komma, Semikolon, Backslash und Zeilenumbruch maskiert, `DTSTART;VALUE=DATE`.
- Druck-PDF: A4 hoch, Tabelle mit Erledigt-Kästchen, Firma im Kopf, Fuss «Erstellt mit tools.alperna.ch» (`lib/export/pdf.ts`).
- CRM: `eingabe` = Art, Name, Datum, Kanäle, Inserate (eine Angabe je Zeile); `ausgabe` = Markdown des Zeitplans in kompakter Form: Titel, Untertitel mit Art und Datum, Meldung zu fälligen Aufgaben, Tabelle Datum, Aufgabe, Kanal (ohne Wochentage, Hinweise und Erledigt-Spalte). Der Server kürzt auf 1'900 Zeichen; mit den Standardkanälen bleibt jede Art darunter (Test).
- Stand `mt:anlass-planer`: `{ v: 1, phase: "edit" | "result", input, erledigt, output? }`; `phase: "result"` zählt im Pfad als erledigt (`lib/progress.ts`).

## Edge Cases
- Datum in der Vergangenheit: Fehler in `role="alert"`; heute ist erlaubt (Anlass am selben Tag: nahezu alles fällig).
- Anlass in wenigen Tagen: viele fällige Aufgaben, Meldung nennt «weniger als eine Woche».
- Jahreswechsel und Schalttag: Datum der Aufgabe läuft über den 31.12. und den 29.02.2028 richtig (Test).
- Name unter drei Zeichen, über 80 Zeichen, kein Kanal, ungültiges Datum: Meldung je Feld.
- Kaputter Stand im Speicher (kein JSON, falsche Form, Phase «result» ohne gültige Eingabe): leerer Stand, Formular.
- Profil leer: KMU, Kanäle Website, Instagram, Aushang und Flyer.
- Der Anlass liegt in der Vergangenheit, wenn die Person das Ergebnis später wieder öffnet: der Plan wird aus der gespeicherten Eingabe neu gerechnet, alle früheren Aufgaben gelten als fällig; die Prüfung auf ein vergangenes Datum gilt nur beim Erstellen.

## Texte
- Tagline: «Vom Datum rückwärts planen: Zeitplan mit Aufgaben, Kanälen und Werkzeugen, als Kalender, Checkliste und PDF.» (108 Zeichen; die Fassung mit «passenden» hat 118 und überschreitet die Grenze von 110 in `lib/define-tool.ts`)
- SEO-Title (≤ 60, mit «Schweiz») und Meta-Description (≤ 155): siehe content/tools/anlass-planer.md.
- Seitentext: 350 bis 700 Wörter, Beispiel Malerei Keller, Gossau, «Tag der offenen Tür» am 14.11.2026 mit Zeilen aus dem echten Ergebnis. Keyword «Anlass planen».
- FAQ: Wie früh sollte ich anfangen? (Richtwert von Alperna), Was ist mit Bewilligungen?, Kann ich Aufgaben ändern?, Brauche ich ein Konto?, Was bekommt Alperna, was bleibt im Browser?
- Alperna-Baustein: Social Media.

## Tests
Mindestens 26 Fälle in logic.test.ts (Arten und Kanäle, Vorlagen, Datum mit Jahreswechsel und Schalttag, Kanal-Filter, Inserate, Vereinsflagge, fällige Aufgaben und Meldung, Freitag-Regel, Aufgaben nach dem Anlass, Werkzeug-Slugs gegen tools/index.ts, keine Rechtsaussage, Gruppen, Prüfung, ICS, Stand, Abhaken, eingabe/ausgabe), dazu export.test.ts (PDF, ICS-Datei) und Tool.test.tsx (Ablauf im Browser).

## Nicht Teil dieses Tools
Kein Server, keine KI, keine eigenen Aufgaben im Werkzeug (die ergänzt die Person im Kalender), kein Verschieben des Plans, keine Erinnerungen per E-Mail, keine Rechtsaussagen, keine Fristen, keine Zahlen zu Wirkung oder Besucherzahlen.
