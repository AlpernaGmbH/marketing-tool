# Vereins-Kommunikationskonzept (vereins-kommunikation)

Klasse B (Generator mit KI, braucht den Server), Stand 05.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`) nach dem Vorbild `tools/swot` (Angaben aus einem anderen Stand) und `tools/inhalte-saeulen` (Kanäle, Profil-Vorbelegung). `generator.ts`, `logic.ts` und die Oberfläche sind getestet.

## Nutzen in einem Satz
Für Vorstände von Schweizer Vereinen, die für die Generalversammlung ein Kommunikationskonzept brauchen: in rund acht Minuten ein Dokument mit Ausgangslage, Zielen mit Messgrösse, Zielgruppen, Kernbotschaft, Kanalplan, Jahreskalender aus den Anlässen, Rollen mit Stunden und Erfolgsmessung, als Text, PDF und Word.

## Kategorie und Verknüpfung
Kategorie: strategie, Zielgruppe: verein, zweiter Schritt im Pfad «Für Vereine» (`pathStep` vereine, 2; nach der Anspruchsgruppen-Analyse). Auf der Startseite hervorgehoben (`featured`).
Liest aus Profil: organisationstyp, firma, ort, kanton (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), kanaele (Vorbelegung der Kanäle heute).
Liest aus anderen Ständen: `mt:anspruchsgruppen` (Gruppen mit Interesse und Einfluss, nur lesen).
Schreibt ins Profil: organisationstyp = «verein», nur wenn das Feld leer ist (beim ersten Laden); kanaele = `[{ name }]` mit den Kanälen heute, nur wenn das Feld leer ist (nach einem frisch erzeugten Entwurf). Die Grunddaten-Felder schreiben beim Tippen ins Profil.
Verwandte Tools: anspruchsgruppen (liefert die Zielgruppen), sponsoring-dossier, feiertagskalender.
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Konzept erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Verein mit Ort und Kanton, Mitglieder mit Entwicklung, Ziele, Anlässe mit Monat, Kanäle heute, wer macht es mit Stunden, Budget, Anspruchsgruppen, Zweck; eine Angabe je Zeile). Ausgabe = das Dokument als Markdown (`reportMarkdown`). Der Server kürzt beide auf 1'900 Zeichen; das Wichtigste steht darum oben.
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren ist frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (Typ) | Auswahl (`ProfileFieldsForm`) | – | Profil `organisationstyp`; ist es leer, setzt das Werkzeug beim ersten Laden «Verein» | – | – |
| Name des Vereins | text | ja | Profil `firma` | 1 bis 120; leer → «Gib den Namen deines Vereins an.» | «Name, Ort und Kanton speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Ort, Kanton | text, Auswahl | nein | Profil `ort`, `kanton` (der Kanton geht als Name, zum Beispiel «Appenzell Ausserrhoden») | Ort max. 120 | – |
| Vereinszweck | textarea | ja | – | 20 bis 400 Zeichen | «Ein bis drei Sätze: Was tut der Verein, für wen, und was verbindet die Mitglieder? …» mit Zeichenzähler |
| Mitgliederzahl | number | ja | gespeicherte Eingabe («Angaben ändern») | ganze Zahl 1 bis 100'000 | «Aktive und Passive zusammen, ganze Zahl.» |
| Entwicklung der Mitgliederzahl | single (wächst, stabil, schrumpft) | ja | – | `ENTWICKLUNG_KEYS` | – |
| Ziele | multi (Mitglieder gewinnen, Nachwuchs, Helferinnen und Helfer, Sponsoren, Sichtbarkeit in der Gemeinde) | mindestens eines | – | `ZIEL_KEYS` | – |
| Anlässe im Jahr | Liste bis 8: Name (text) und Monat (single 1 bis 12) | nein | gespeicherte Eingabe | Name 3 bis 80 Zeichen (die Antwort der KI verlangt mindestens 3, darum meldet das Formular «GV» als zu kurz), Monat Pflicht, sobald ein Name da ist; leere Zeilen zählen nicht | «Bis zu 8 Anlässe mit Monat, zum Beispiel Generalversammlung, Dorffest, Turnier oder Vereinsreise. Sie bilden den Jahreskalender.» |
| Kanäle heute | multi (Website, Instagram, Facebook, WhatsApp-Gruppen, Newsletter oder Mail, Gemeindeblatt oder Anzeiger, Aushang, Lokalpresse) | nein | Profil `kanaele` (Einträge mit `name` oder `kanal`, erkannt an Wörtern); gilt, bis die Person ein Kästchen anfasst | `KANAL_KEYS` | «Vorbelegt aus deinem Firmenprofil.» (nur bei Vorbelegung) «Wähle die Kanäle, auf denen dein Verein heute Neuigkeiten verbreitet. …» |
| Wer macht die Kommunikation? | text | nein | – | max. 80 | «Zum Beispiel: zwei Vorstandsmitglieder.» |
| Stunden pro Monat für die Kommunikation | number | ja (0 ist erlaubt) | gespeicherte Eingabe | ganze Zahl 0 bis 200 | «Alle zusammen, von 0 bis 200. Die Rollen im Konzept bleiben darunter.» |
| Budget pro Jahr in CHF | number | nein | – | leer = 0, sonst ganze Zahl 0 bis 1'000'000 | «Leer heisst: kein Budget.» |
| Anspruchsgruppen | nur Anzeige | nein | `mt:anspruchsgruppen` | Gruppen mit Namen und Interesse und Einfluss von 1 bis 5, höchstens 12 | «Deine Anspruchsgruppen gehen mit: Mitglieder, Sponsoren. Sie bilden die Zielgruppen im Konzept.» mit Link zur Analyse; fehlen sie, steht dort der Link zur Analyse und der Satz, dass die KI die Zielgruppen aus den Angaben ableitet |

Vor dem Knopf steht, was an die KI geht: Name, Ort und Kanton des Vereins, Zweck, Mitgliederzahl und Entwicklung, Ziele, Anlässe, Kanäle, die Angabe, wer die Kommunikation macht, die Stunden und das Budget, dazu (nur wenn da) die Namen der Anspruchsgruppen mit Interesse und Einfluss; nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein, zum Beispiel keine Namen von Mitgliedern.»

## Logik
1. **Typ im Profil** (`profilePatch(profile, [])`): Beim ersten Laden, sobald das Profil gelesen ist, schreibt das Werkzeug `organisationstyp = "verein"`, wenn das Feld leer ist. Steht dort «kmu», bleibt es.
2. **Vorbelegung der Kanäle** (`kanaeleAusProfil`, `effectiveKanaele`): Solange die Person kein Kästchen anfasst (`form.kanaele === null`), gelten die Kanäle aus dem Profil (Einträge mit `name` oder `kanal`, Wortvergleich ohne Gross/Klein, feste Reihenfolge, ohne Doppel); sonst keine. Beim ersten Klick wird die ganze Auswahl übernommen.
3. **Anspruchsgruppen lesen** (`gruppenAus(raw)`): liest den Stand von `mt:anspruchsgruppen` mit `parseState` aus `tools/anspruchsgruppen/logic.ts` und nimmt die Gruppen mit Namen und Interesse und Einfluss von 1 bis 5 (höchstens 12). Unbewertete Karten, Karten ohne Namen und kaputte Stände ergeben keine Gruppen.
4. **Eingabe prüfen** (`inputProblem(fields, form)`), in der Reihenfolge des Formulars, mit Meldung und ID des Felds (die Oberfläche setzt den Fokus dorthin): Verein leer; Zweck unter 20 oder über 400 Zeichen; Mitglieder keine ganze Zahl von 1 bis 100'000; Entwicklung nicht gewählt; kein Ziel; Anlässe (mehr als 8; Name leer, unter 3 oder über 80 Zeichen; Monat fehlt); wer über 80 Zeichen; Stunden keine ganze Zahl von 0 bis 200; Budget, wenn ausgefüllt, keine ganze Zahl von 0 bis 1'000'000. Meldung in `role="alert"`, kein Aufruf des Servers.
5. **Eingabe für die KI** (`toInput(fields, form, gruppen, kanaele)`): verein, ort, kanton (Name statt Kürzel), zweck, mitglieder, entwicklung, ziele und kanaele in fester Reihenfolge, anlaesse ohne leere Zeilen, wer, stundenProMonat, budget (leer = 0), gruppen. Schema `vereinInput` (zod) im Browser und in der Route; schlägt es fehl, gibt `toInput` null und das Werkzeug meldet «Bitte prüfe deine Angaben».
6. **Entwurf** (`useGenerator(vereinGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Kommunikationskonzept eines Schweizer Vereins, nüchtern, als Vorlage für die Generalversammlung, Du-Form gegenüber dem Vorstand; Aufgabe je Feld; keine Benchmarks; Kanäle nur aus den Angaben plus höchstens zwei Vorschläge mit «(neu)»; Kalender nur aus den Anlässen; Stunden der Rollen höchstens die angegebenen; Ziffern nur aus den Angaben; keinen Vereinsnamen erfinden; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zum Verein", promptData(input))`: die Schlüssel werden zu den Wörtern des Formulars («wächst», «WhatsApp-Gruppen»), der Monat bekommt seinen Namen dazu. `maxTokens` 1'800, `temperature` 0.4.
7. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): JSON, Schema `vereinOutput` (ausgangslage 120..700; ziele 2 bis 5 mit ziel 10..120 und messgroesse 5..80; zielgruppen 2 bis 6 mit name 3..60 und erwartung 10..200; kernbotschaft 30..200; kanalplan 2 bis 8 mit kanal 3..40, zweck 10..160, rhythmus 3..60, verantwortlich 0..60; jahreskalender 0 bis 12 mit monat 1..12, anlass 3..80, kommunikation 10..200; rollen 1 bis 5 mit rolle 3..60, aufgaben 10..200, stundenProMonat 0..200; erfolgsmessung 2 bis 5 Sätze à 10..160), Sperrliste, Regeln (keine Emojis: `allowEmoji` ist nicht gesetzt), Links nur aus den Angaben. Eigene Prüfung `checkVerein`, in dieser Reihenfolge:
   - «zahl»: eine Ziffernfolge in den Texten der Antwort steht nicht in den Angaben (`numbersIn`; Angaben sind Verein, Ort, Kanton, Zweck, Mitglieder, Stunden, Budget, wer, Namen der Anlässe, Anspruchsgruppen mit ihren Werten);
   - «stunden»: die Stunden aller Rollen ergeben zusammen mehr als `stundenProMonat`;
   - «kalender»: ein Eintrag im Jahreskalender nennt einen Anlass, den es mit diesem Namen (ohne Gross/Klein, Leerraum zu einem Leerzeichen) und diesem Monat in den Angaben nicht gibt;
   - «kanal»: ein Kanal im Kanalplan steht nicht in den Angaben (Name, Schlüssel oder Kurzform wie «WhatsApp», «Anzeiger», «Mail»; ohne Gross/Klein, Bindestrich und Leerzeichen) und trägt nicht den Zusatz «(neu)», oder es sind mehr als zwei Kanäle mit «(neu)».
   Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Monat und Stunden dürfen im JSON auch als Text stehen («6») und werden gelesen (`z.coerce`), Kommazahlen fallen weg. Annahme: Zahlen als Wort («zweimal im Jahr») sind erlaubt, nur Ziffern werden geprüft. Annahme: Die Namen der Zielgruppen werden nicht gegen die Anspruchsgruppen geprüft (die KI darf kürzen und auswählen); die Anweisung verlangt den Namen wie in den Angaben. Annahme: Die Kurzformen der Kanäle (`KANAL_ALIASE`) sind eine Duldung dieses Werkzeugs, keine Statistik.
8. **Stand speichern** (`mt:vereins-kommunikation`): `{ v: 1, input, output }`, erst nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputter Entwurf fällt allein weg, die Eingabe bleibt (für «Angaben ändern»). Das Formular selbst wird nicht gespeichert (Vorbild `inhalte-saeulen`).
9. **Profil** (`profilePatch(profile, kanaele)`): nach einem frisch erzeugten Entwurf `kanaele = [{ name }]` mit den Namen der Kanäle heute, nur wenn `profile.kanaele` leer ist oder fehlt und mindestens ein Kanal gewählt ist. Stehen dort schon Kanäle, bleibt das Profil, wie es ist.
10. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref).

## Ausgaben
- Ergebnis: `ResultCard` «Dein Kommunikationskonzept» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Liste der Platzhalter (`placeholdersIn`, zum Beispiel [Zielzahl]), `DocView` mit den Blöcken des Dokuments (ohne den KI-Satz: `screenBlocks`; Hülle `data-testid="konzept"`) und dem Hinweis, dass das Konzept eine Vorlage ist und der Vorstand es prüft und ergänzt.
- Dokument (`toDocument(output, input)`): Titel «Kommunikationskonzept», Untertitel «<Verein>, Vorlage für die Generalversammlung», Facts Verein (mit Ort und Kanton), Mitglieder (Zahl und Entwicklung), Zeit für die Kommunikation (wer und Stunden), Budget pro Jahr; KI-Hinweis; acht Kapitel: 1. Ausgangslage (Absatz), 2. Ziele (Tabelle Ziel | Messgrösse), 3. Zielgruppen (Tabelle), 4. Kernbotschaft (Absatz), 5. Kanalplan (Tabelle Kanal | Zweck | Rhythmus | Verantwortlich, «noch offen» wo leer; Satz zu «(neu)», wenn es Vorschläge gibt), 6. Jahreskalender (Tabelle Monat | Anlass | Kommunikation, nach Monat sortiert, Monatsname ausgeschrieben; ohne Einträge ein Satz), 7. Rollenverteilung (Tabelle Rolle | Aufgaben | Stunden pro Monat und «Zusammen n von m Stunden pro Monat.»), 8. Erfolgsmessung (Satz «Gemessen wird nur, was der Verein selbst zählt …» und Liste). Dateiname `kommunikationskonzept-<verein>`.
- Länge: Ein PDF mit durchschnittlich langen Antworten hat drei Seiten, eines mit allen Feldern an der Obergrenze fünf (gemessen mit `buildPdf`, A4). Der Seitentext nennt «meist drei bis fünf Seiten (Richtwert von Alperna, keine Statistik)».
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zeigt das Formular mit der gespeicherten Eingabe über dem Ergebnis, Fokus auf den Zweck; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Eingabe und Entwurf, die Kanäle fallen auf den Vorschlag aus dem Profil zurück, das Profil bleibt).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Status während der Anfrage mit `role="status"` («Die KI schreibt dein Kommunikationskonzept.»), Knopftext «Die KI schreibt …».
- Zählung: `popular:vereins-kommunikation` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Profil leer: Der Typ wird «Verein»; der Name des Vereins muss getippt werden (Meldung); Ort und Kanton gehen leer an die KI; keine Kanäle vorbelegt.
- Profil vom Typ «kmu»: bleibt; das Werkzeug zeigt die Labels für Betriebe (Firma statt Name des Vereins), die Person kann den Typ umstellen.
- Profil mit Kanälen, die das Werkzeug nicht kennt (TikTok): kein Treffer. Einträge ohne `name` und `kanal` zählen nicht.
- Keine Kanäle gewählt: erlaubt; der Kanalplan besteht dann aus Vorschlägen mit «(neu)», höchstens zwei.
- Keine Anlässe: erlaubt; der Kalender bleibt leer, das Dokument sagt es in einem Satz. Anlass mit Namen aber ohne Monat, Monat ohne Namen, Name unter drei Zeichen: Meldung am Feld. Neun Anlässe: Der Knopf «Anlass hinzufügen» ist ab acht Zeilen gesperrt.
- Stunden 0: erlaubt; alle Rollen haben 0 Stunden. Stunden 200: Obergrenze. Mitglieder 1 und 100'000: Grenzen. Budget leer: «kein Budget angegeben».
- Anspruchsgruppen fehlen, sind kaputt oder unbewertet: keine Gruppen, Hinweis mit Link zur Analyse; die KI leitet die Zielgruppen ab. Mehr als zwölf Gruppen: die ersten zwölf.
- Antwort mit Stunden der Rollen 7 bei 6 Angabe: verworfen («stunden»); genau 6: angenommen. Antwort mit «3 Beiträge im Monat» (3 steht nicht in den Angaben): verworfen («zahl»). Antwort mit Kalendereintrag «Vereinsreise» ohne diesen Anlass: verworfen («kalender»). Antwort mit «Facebook» bei nicht gewähltem Facebook: verworfen, «Facebook (neu)»: angenommen, drei Mal «(neu)»: verworfen.
- Platzhalter «[Zielzahl]» und ähnliche: erlaubt, Liste über dem Entwurf.
- Cookie fehlt (403): Fenster, einmal wiederholen (`useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Formular und Eingaben bleiben, es wird nichts gespeichert.
- Gespeicherter Stand kaputt oder von einer anderen Version: leerer Stand. Entwurf kaputt, Eingabe gültig: Eingabe bleibt für «Angaben ändern», das Formular erscheint.
- Keine Daten-Datei: das Werkzeug braucht keine `data/*.json`; es nennt keine Zahl mit Quelle und keine Benchmarks. Die einzigen Zahlen sind Grenzen des Werkzeugs und die Angaben der Person.

## Texte
- Tagline: «Ziele, Zielgruppen, Kernbotschaft, Kanalplan und Jahreskalender deines Vereins als Konzept für die GV.» (102 Zeichen).
- SEO-Title «Kommunikationskonzept Verein Schweiz: Vorlage für die GV» (56 Zeichen) und Meta-Description (155 Zeichen) in `content/tools/vereins-kommunikation.md`.
- H1 «Kommunikationskonzept für Schweizer Vereine». Keyword «Kommunikationskonzept Verein»: wörtlich in Title und Description; im Text steht das Stichwort «Kommunikationskonzept» viermal (H1 und Text zusammen), in der H1 und im ersten Absatz.
- Erklärtext nach der Lese-Vorlage, Beispiel «FC Trogen» (Ausschnitt aus Kernbotschaft, Kanalplan, Jahreskalender und Rollen; von Hand geschrieben und so gekennzeichnet, die Zahlen sind Angaben des fiktiven Vereins und halten die Prüfung des Werkzeugs ein), FAQ (6: für welche Vereine, was geht an die KI, wie lang ist das Konzept, muss der Vorstand das absegnen, kein Konto und E-Mail vor dem Ergebnis, was bleibt im Browser) und Alperna-Satz (Baustein Website, Beweis aus `content/pitch/bausteine.md`): `content/tools/vereins-kommunikation.md`.

## Tests
`tools/vereins-kommunikation/generator.test.ts` (35 Fälle: Listen und Labels, Eingabeschema mit allen Grenzen, Ausgabeschema mit Mengen, Längen und Zahlen als Text, Hilfen der Prüfung, `checkVerein` je Regel positiv und negativ und die Reihenfolge der Gründe, `checkGenerated` mit gültiger Antwort im Codeblock, kaputter Form, fremder Zahl, zu vielen Stunden, fremdem Anlass und Kanal, Emojis, Ausrufezeichen, Sperrliste, fremdem Link und Anführungszeichen; Prompt mit Wörtern statt Schlüsseln und Anweisung ohne Eingaben), `logic.test.ts` (59 Fälle: Konfiguration, Listen, Kanäle aus dem Profil, Anspruchsgruppen, Liste der Anlässe, `parseZahl`, `inputProblem` in Reihenfolge und ruhigem Ton, `toInput` mit und ohne Gruppen, bereinigt, begrenzt und mit null, `formFromInput` als Rundlauf, `eingabeText`, `toDocument` mit Kapiteln, Tabellen, sortiertem Kalender, «noch offen», Stundensumme und Fällen ohne Anlässe und Budget, `reportMarkdown`, `profilePatch` nur wenn leer, `parseState` bei kaputten Daten und als Rundlauf) und `Tool.test.tsx` (15 Fälle im Browser mit jsdom und einem Stub für `/api/generate`: Formular, Typ im Profil, Vorbelegung, Prüfung mit Fokus, Anlassliste, Durchlauf mit Anfrage, CRM, Stand und Profil, Anspruchsgruppen mit und ohne, Platzhalter, Neuladen, «Angaben ändern» und «Neu beginnen», zweites Konzept, Fehler der KI). Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Benchmarks und Vergleichswerte (Reichweite, Öffnungsraten, Mitgliederzuwachs anderer Vereine): ohne belegte Quelle keine Zahl; die Erfolgsmessung nennt nur Grössen, die der Verein selbst zählt.
- Rechtsaussagen zu Vereinsrecht, Datenschutz, Beschlüssen der Generalversammlung oder Aufgaben des Vorstands (Harte Regel 8): keine; das Konzept ist eine Vorlage.
- Prüfung, dass die Namen der Zielgruppen wörtlich den Anspruchsgruppen entsprechen (siehe Annahme in der Logik).
- Fertige Beiträge, Newsletter oder Texte für die Kanäle: nur der Plan; Beiträge liefern die Werkzeuge im Pfad «Content».
- Mehrjahrespläne, Budgetverteilung auf Kanäle (dafür der Budget-Planer) und Termine mit Datum: der Kalender kennt nur Monate.
- Speichern des halb ausgefüllten Formulars: nur der Stand nach dem Konzept.
- Bilder oder Logos erzeugen.
