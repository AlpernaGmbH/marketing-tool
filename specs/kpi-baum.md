# Ziel- und KPI-Baum (kpi-baum)

Klasse C (alles im Browser, ohne KI, ohne Server ausser dem Versand des Ergebnisses ins CRM), Stand 05.10.2026. Ein Formular mit Abschnitten, kein Fragebogen-Werkzeug. `logic.ts` und `Tool.tsx` sind getestet (`logic.test.ts`, `Tool.test.tsx`).

## Nutzen in einem Satz
Für Inhaberinnen, Inhaber und Vereinsvorstände, die ein Unternehmensziel haben, aber nicht wissen, welche Zahlen sie dafür messen sollen: in rund acht Minuten ein Baum vom Ziel über bis zu drei Marketingziele zu den Kennzahlen (KPI) mit Zielwert und Messquelle, dazu SMART-Check, Rückwärtsrechnung, Messplan und eine CSV-Vorlage für die monatliche Erfassung.

## Kategorie und Verknüpfung
Kategorie: strategie (elfter Schritt im Pfad «Strategie», nach dem Budget-Planer, vor dem Strategie-Einseiter), Zielgruppe: beide (KMU und Vereine)
Liest aus Profil: `organisationstyp`, `firma`, `branche` (Grunddaten über `ProfileFieldsForm`; nichts davon wird erneut gefragt, Harte Regel 10). Die Wahl «KMU oder Verein» ist als Auswahl im Formular, damit das Werkzeug auch ohne gefülltes Profil für Vereine erreichbar ist.
Schreibt ins Profil: nichts (`writesProfile: []`, kein `profilePatch`).
Verwandte Tools: budget-planer, reifegrad-check, strategie-einseiter
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis (Eingabe und Ausgabe) ins CRM.

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Baum erstellen» prüft das Werkzeug die Eingaben (`validate`), dann `await ctx.ensureEmail()` (false: Fenster geschlossen, Formular bleibt), dann `auswerten` und Speichern.
- **Jedes Ergebnis geht ins CRM:** nach dem sichtbaren Ergebnis einmal `ctx.sendResult({ eingabe, ausgabe })`. Eingabe = `eingabeText(ergebnis)` (Betrieb, Branche, Unternehmensziel, Marketingziele mit Kennzahlen, Annahmen der Rückwärtsrechnung, eine Angabe je Zeile). Ausgabe = `reportMarkdown(ergebnis)` (das Dokument als Markdown). Beide kürzt der Server auf 1'900 Zeichen; der Baum steht darum oben im Dokument. Nach dem Neuladen steht das Ergebnis wieder da, ohne neuen CRM-Eintrag; ein zweiter Durchlauf geht erneut ins CRM.
- **Downloads** (PDF, Word über `DocumentExport`, CSV über `ctx.guardDownload`): ohne Adresse erst das Fenster, bei «Später» kein Download. Text kopieren ist frei.

## Eingaben
Schritt 1 und 2 sind Pflicht (Marketingziel: mindestens eins), Schritt 3 ist freiwillig. Alle Felder haben ein `<label>`; Fehler stehen in `role="alert"`.

| Feld (Label) | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (KMU oder Verein) | Radio (`ProfileFieldsForm`) | ja | Profil `organisationstyp` | – | – |
| Firma / Name des Vereins | text (`ProfileFieldsForm`) | nein | Profil `firma` | – | «Firma und Branche speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche / Tätigkeit des Vereins | text (`ProfileFieldsForm`) | nein | Profil `branche` | – | – |
| Was willst du erreichen? | select | ja | – | KMU: «Umsatz in CHF», «Neue Kundinnen und Kunden», «Aufträge»; Verein: «Neue Mitglieder», «Anmeldungen zum Anlass» | – |
| Zielwert | number | ja | – | Zahl über 0, höchstens 1'000'000'000 | Umsatz: «In Franken, zum Beispiel 500000.»; sonst: «Die Zahl, die du am Ende erreicht haben willst, nicht der Zuwachs.» |
| Wo stehst du heute? | number | nein | – | Zahl ab 0 oder leer (leer = 0) | «Freiwillig, zum Beispiel die Aufträge, die du dieses Jahr schon hast. Leer heisst 0.» |
| Bis wann? | date | ja | – | gültiges Datum; höchstens 120 Monate entfernt; ein Datum in der Vergangenheit blockiert nicht (der SMART-Check zeigt es) | «Ein angebrochener Monat zählt für die Rechnung voll.» |
| Marketingziel n (n = 1 bis 3) | text | mindestens eins | – | 1 bis 140 Zeichen (unter 10 blockiert nicht, der SMART-Check zeigt es); Platzhalter «Mehr Anfragen über Google» (Vereine: «Mehr Mitglieder über Instagram») | «n von 140 Zeichen. Schreib mindestens 10, damit der SMART-Check «spezifisch» erfüllt ist.» |
| Kanal | select | nein | – | Website, Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Empfehlungen, Anlässe, Print | – |
| Kennzahl (1 oder 2 je Marketingziel) | select | wenn die Zeile benutzt wird | – | KMU: Anfragen, Profilaufrufe, Bewertungen, Newsletter-Abos, Website-Besuche, Termine, Anrufe, Offerten, Neukunden; Verein: dieselben ausser Offerten und Neukunden, dazu Neumitglieder und Anmeldungen | – |
| Zielwert (der Kennzahl) | number | nein | – | Zahl über 0 oder leer (leer: der SMART-Check meldet es) | «Eine Zahl über 0. Leer lassen, wenn du ihn noch nicht kennst.» |
| Zeitraum | select | ja (Vorgabe «pro Monat») | – | pro Monat, pro Quartal, gesamt bis zum Enddatum | – |
| Messquelle | select | nein | – | Vorschläge je Kennzahl (siehe unten) und «Andere» mit Textfeld «Eigene Messquelle» (bis 80 Zeichen); wechselt die Kennzahl, wird die Messquelle zurückgesetzt | – |
| Wie viele von 10 Anfragen werden zu Offerten? | select «0 von 10» bis «10 von 10» | nein | – | ganze Zahl 0 bis 10; nur bei «Neue Kundinnen und Kunden» und «Aufträge» sichtbar | «Das ist deine Annahme, keine Statistik. Schätze nach deinen letzten Monaten.» |
| Wie viele von 10 Offerten werden zu Aufträgen? | select | nein | – | wie oben; Rückwärtsrechnung nur, wenn beide gesetzt sind (steht nur eine, sagt ein `role="status"` es) | – |

Messquellen je Kennzahl (sachlich, ohne Produktversprechen):
- Anfragen: «Postfach und Telefonnotiz», «Kontaktformular», «CRM oder Excel»
- Profilaufrufe: «Statistik im Google-Unternehmensprofil», «Instagram Insights»
- Bewertungen: «Google-Unternehmensprofil»
- Newsletter-Abos: «Newsletter-Werkzeug»
- Website-Besuche: «Statistik des Hosters», «Umami oder ein anderes Statistikwerkzeug»
- Termine: «Kalender oder Buchungswerkzeug»
- Anrufe: «Telefonnotiz», «Anrufliste des Telefons»
- Offerten: «Ablage der Offerten», «CRM oder Excel»
- Neukunden: «Rechnungsliste», «CRM oder Excel»
- Neumitglieder: «Mitgliederliste», «Excel-Liste»
- Anmeldungen: «Anmeldeformular», «Teilnehmerliste»

Höchstens 3 Marketingziele und 2 Kennzahlen je Marketingziel: die Knöpfe «Marketingziel hinzufügen» und «Kennzahl hinzufügen» verschwinden bei der Grenze; `validate` lehnt mehr ab. Zeilen ohne jeden Inhalt zählen nicht.

## Logik
Alle Funktionen sind rein; das heutige Datum kommt als ISO-Text («JJJJ-MM-TT», in Schweizer Zeit aus `heuteIso(new Date())` im Browser) als Parameter, nie aus `new Date()` in `logic.ts`.

1. **Eingabe prüfen** (`validate(state, typ, heute)`, erste Meldung oder null). Blockiert wird nur, was keine Rechnung zulässt: Art fehlt oder gibt es für die Organisation nicht; Zielwert keine Zahl über 0; Ausgangswert negativ oder Text; Enddatum fehlt oder ungültig oder mehr als 120 Monate entfernt; kein Marketingziel; mehr als 3 Marketingziele; mehr als 2 Kennzahlen; Text eines Marketingziels leer oder über 140 Zeichen; Kennzahlenzeile ohne Kennzahl oder mit einer, die es für die Organisation nicht gibt; Zielwert einer Kennzahl 0, negativ oder Text; Quote keine ganze Zahl von 0 bis 10; Quote 0, wenn die Rückwärtsrechnung gilt und beide Quoten gesetzt sind. Die Nummern in den Meldungen sind die Positionen im Formular. Was der SMART-Check anzeigt (kurzer Text, kein Kanal, Kennzahl ohne Zielwert oder Messquelle, Enddatum nicht nach heute) blockiert nicht: «Fehlt eines, ist das Ergebnis trotzdem sichtbar, mit dem Hinweis oben.»
2. **Monate bis zum Enddatum** (`monateBis(heute, ende)`). Annahme: Gezählt werden Monatsschritte ab heute, bis das Enddatum erreicht ist; ein angebrochener Monat zählt voll. Das kleinste n ≥ 0 mit `addMonths(heute, n) ≥ ende`, mindestens 1. `addMonths` setzt auf den letzten Tag des Zielmonats, wenn der Tag fehlt (31.01. + 1 Monat = 28.02.). Beispiele: 05.10.2026 bis 31.12.2026 = 3; bis 05.01.2027 = 3; bis 06.01.2027 = 4; 31.01.2026 bis 28.02.2026 = 1; bis 20.10.2026 (weniger als ein Monat) = 1; Enddatum heute oder früher = 1.
3. **Zeitraum umrechnen** (`kpiProZeitraum(zielwert, zeitraum, monate)`). «pro Monat» z: proMonat = z, proQuartal = 3 z, gesamt = z × Monate. «pro Quartal» z: proMonat = z / 3, proQuartal = z, gesamt = z / 3 × Monate. «gesamt bis zum Enddatum» z: proMonat = z / Monate, proQuartal = 3 z / Monate, gesamt = z. Auf zwei Stellen gerundet, Monate mindestens 1. Quartal = 3 Monate.
4. **SMART-Check je Marketingziel** (`smartCheck`), vier Prüfungen, je Prüfung ein Satz «Das fehlt noch»:
   - **spezifisch:** Text mindestens 10 Zeichen (nach Trim) und ein Kanal gewählt. Fehlt: «Der Text hat nur n Zeichen (mindestens 10) und es fehlt ein Kanal.» (je nach Fall nur ein Teil).
   - **messbar:** mindestens eine Kennzahl mit Zielwert und Messquelle (bei «Andere» muss der Text gefüllt sein). Fehlt: «Es fehlt eine Kennzahl mit Zielwert und Messquelle.» oder «Bei «Anfragen» fehlen Zielwert und Messquelle.»
   - **terminiert:** das Enddatum liegt nach heute (strikt; heute zählt nicht). Annahme: Das Enddatum gehört zum Unternehmensziel und gilt für jedes Marketingziel; «pro Monat» und «pro Quartal» geben nur den Takt, bei «gesamt bis zum Enddatum» ist das Enddatum die einzige Frist. Fehlt: «Das Enddatum 30.09.2026 liegt nicht nach heute (05.10.2026); wähl ein Datum in der Zukunft.»
   - **plausibel:** Annahme: Der Zielwert jeder Kennzahl, die dieselbe Einheit hat wie das Unternehmensziel und einen Zielwert trägt, wird auf «gesamt bis zum Enddatum» umgerechnet und darf den Zielwert des Unternehmensziels nicht übersteigen. Gleiche Einheit gibt es nur bei Neukunden (Ziel «Neue Kundinnen und Kunden»), Neumitglieder (Ziel «Neue Mitglieder») und Anmeldungen (Ziel «Anmeldungen zum Anlass»). Sonst steht «nicht prüfbar» (Status «offen», keine Lücke).
   - «Attraktiv» und «realistisch» lassen sich nicht prüfen; das Dokument sagt es offen in einem Satz.
5. **Rückwärtsrechnung** (`rueckwaerts`), nur bei «Neue Kundinnen und Kunden» und «Aufträge» und nur, wenn beide Quoten gesetzt sind; sonst fehlt der Abschnitt (bei diesen Arten mit einem Hinweis, dass die Quoten fehlen). Alles in ganzen Zahlen, aufgerundet:
   - Aufträge = Zielwert − Ausgangswert (leer = 0), mindestens 0.
   - Offerten = aufrunden(Aufträge × 10 / Quote Offerten→Aufträge)
   - Anfragen = aufrunden(Offerten × 10 / Quote Anfragen→Offerten)
   - pro Monat = aufrunden(Wert / Monate bis zum Enddatum) für Aufträge, Offerten und Anfragen.
   - Annahme: Bei «Neue Kundinnen und Kunden» bringt jede Kundin und jeder Kunde einen Auftrag; das Dokument sagt es.
   - Alles ist als Rechnung der Person gekennzeichnet: «Das ist deine Annahme, keine Statistik.»
   - Handrechnung (auch im Seitentext): Ziel 30, Ausgangswert 18, 4 von 10 Offerten werden Aufträge, 6 von 10 Anfragen werden Offerten, 3 Monate: 12 Aufträge, 30 Offerten, 50 Anfragen, pro Monat 4, 10 und 17.
6. **Messplan** (`messplan`): eine Zeile je Kennzahl mit KPI | Zielwert | Zeitraum | Ist | Messquelle | Rhythmus. «Ist» bleibt leer. Zeitraum als Text mit Umrechnung: «pro Monat (= 51 pro Quartal, 51 bis 31.12.2026)». Bei mehr als einem Marketingziel steht «(Ziel n)» hinter der Kennzahl. Fehlende Angaben stehen als «offen». Rhythmus (Richtwert von Alperna, keine Statistik): monatlich, bei Website-Besuchen wöchentlich.
7. **Baum** (`baumModell`, `treeSvg`): links das Unternehmensziel, in der Mitte die Marketingziele, rechts die Kennzahlen mit Zielwert und Quelle, Linien als Kurven. Reine Funktion, die einen SVG-Text liefert (ViewBox 764 breit, Schrift 16 Einheiten, Umbruch nach Zeichenzahl mit Trennung nach Bindestrich, alle Texte maskiert, Farben als `var(--ink, …)` mit Rückfallwert, keine Verläufe, Gold nur als Punkt im Unternehmensziel). `role="img"` mit `aria-label` («Baum: Unternehmensziel 30 Aufträge bis 31.12.2026; 2 Marketingziele; 3 Kennzahlen.»). Darunter immer der Baum als verschachtelte Liste (`ul`, `aria-label="Der Baum als Liste"`) als Textalternative. Die Grafik erscheint ab 768 Pixel Breite (`hidden md:block`), weil die Schrift dort mindestens 12 Pixel hat; darunter, auch bei 375 Pixel, steht nur die Liste.
8. **Dokument** (`toDocument` als `DocumentModel`; `documentParts` teilt es in Kopf, Baum, Rest für die Anzeige): Hinweis oben (nur bei Lücken: «Hinweis: Bei 1 von 2 Marketingzielen fehlt noch etwas. Der Baum steht trotzdem; die Lücken stehen im SMART-Check.»), Steckbrief (Betrieb oder Verein, Branche oder Tätigkeit, Zeitraum mit Monaten), «Das Ziel in einem Satz», «Der Baum» (Unternehmensziel als Absatz, Marketingziele als Liste mit eingerückten Kennzahlen), «SMART-Check» (Tabelle Marketingziel | Spezifisch | Messbar | Terminiert | Plausibel | Hinweis, Zellen «erfüllt», «fehlt», «nicht prüfbar»), «Rückwärtsrechnung» (Tabelle Schritt | Gesamt | Pro Monat und Rechnung in Worten), «Messplan» (Tabelle), «Drei Hinweise» (weniger Kennzahlen sind besser; eine Zahl, die du nicht erhebst, ist keine Kennzahl; Ist-Werte immer am gleichen Tag des Monats notieren). Dateiname `kpi-baum-<betrieb>`. Datum im Kopf = Datum der Erstellung.
9. **CSV-Vorlage** (`toCsv`): Semikolon, UTF-8 mit BOM, Zeilenende CRLF. Spalten `KPI;Zielwert;Quelle;` und zwölf Monatskürzel ab dem Monat des Erstellungsdatums über den Jahreswechsel (05.10.2026: Okt, Nov, Dez, Jan, … Sep). Eine Zeile je Kennzahl, Zielwert als Text mit Zeitraum («17 pro Monat»), Monatsspalten leer. Dateiname `kpi-messplan-<betrieb>.csv`.
10. **Stand speichern** (`mt:kpi-baum`): `{ v: 1, phase: "edit" | "result", ziel, ziele, rueckwaerts, output? }`. `output` = `{ datum, typ, firma, branche }` zum Zeitpunkt der Erstellung; das Ergebnis wird daraus neu gerechnet (deterministisch), sodass es nach dem Neuladen gleich aussieht. Das Formular speichert den Entwurf mit 500 ms Verzögerung (`phase: "edit"`). `parseState` liefert bei kaputten Daten den leeren Stand, schneidet mehr als 3 Ziele und mehr als 2 Kennzahlen ab, verwirft ungültige Felder einzeln und bleibt bei `phase: "edit"`, wenn `output` fehlt oder die Eingabe die Prüfung nicht besteht. `phase: "result"` genügt `lib/progress.ts` für «erledigt».

## Ausgaben
- Ergebnis: `ResultCard` «Dein Ziel- und KPI-Baum» mit Hinweis oben (nur bei Lücken, `role="status"`), Steckbrief und «Ziel in einem Satz», dem Baum (Grafik ab 768 Pixel, immer die Liste), SMART-Check mit Tabelle, Rückwärtsrechnung, Messplan und den drei Hinweisen. Tabellen liegen in `overflow-x-auto` (`DocView`).
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «CSV-Vorlage herunterladen», «Angaben ändern» (Formular mit den gespeicherten Angaben, Ergebnis gilt als nicht mehr aktuell), «Neu beginnen» (leerer Stand).
- Hinter dem E-Mail-Fenster: das Ergebnis selbst und alle Downloads (PDF, Word, CSV).

## Edge Cases
- Nichts ausgefüllt: Meldung «Wähl, was du erreichen willst.», dann der Reihe nach die weiteren Pflichtfelder; kein Fenster, kein CRM.
- Profil leer: Firma und Branche leer; Dokument zeigt «Betrieb: keine Angabe», der Kopf der Dateien «Alperna».
- Organisationstyp wechselt nach dem Speichern: Art oder Kennzahl, die es nicht mehr gibt, zeigt «Bitte wählen»; `validate` meldet es.
- Enddatum heute oder in der Vergangenheit: Ergebnis mit Lücke bei «terminiert», Rückwärtsrechnung mit 1 Monat.
- Enddatum mehr als 120 Monate entfernt: Meldung.
- Ausgangswert gleich oder über dem Zielwert: Rückwärtsrechnung nennt, dass das Ziel schon erreicht ist (alle Werte 0).
- Quote 0: Meldung im Formular; die Funktion `rueckwaerts` gibt einen Fehler statt einer Division durch 0 zurück (kein `Infinity`, kein `NaN`).
- Nur eine Quote gesetzt: keine Rückwärtsrechnung, ein Satz im Formular.
- Gleiche Kennzahl in zwei Marketingzielen: beide Zeilen im Messplan, mit «(Ziel n)».
- Messquelle «Andere» ohne Text: zählt als fehlend.
- Sehr lange Texte (140 Zeichen) und lange Wörter: Umbruch im SVG, keine Zeile über der Spaltenbreite.
- Gespeicherter Stand kaputt, falsche Version oder mit mehr als 3 Zielen: leerer oder gekürzter Stand.
- Gleiche Daten in zwei Tabs: der Speicher gilt, der Entwurf lebt im Tab.
- Ohne JavaScript steht das Werkzeug nicht; der Seitentext bleibt lesbar.

## Texte
- Tagline: «Vom Unternehmensziel zu den Kennzahlen: Baum, SMART-Check, Rückwärtsrechnung und Messplan als PDF und CSV.»
- SEO-Title und Meta-Description: `content/tools/kpi-baum.md`. Keyword «KPI»: in der H1 («Ziel- und KPI-Baum für Schweizer KMU»), im ersten Absatz und in der Beispielüberschrift.
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit den Zahlen aus `logic.test.ts`, «Beispiel aus dem Seitentext»), FAQ (6) und Alperna-Satz (Baustein Website): `content/tools/kpi-baum.md`.
- Keine Zahl ohne Herkunft: Zahlen im Seitentext stammen aus dem Beispiel (fiktiv, mit dem Werkzeug gerechnet) oder sind Richtwerte von Alperna, keine Statistik.

## Tests
`tools/kpi-baum/logic.test.ts` (119 Fälle): Datum (ISO, `addMonths`, `monateBis` an Monatsende, Jahreswechsel, Schaltjahr, weniger als ein Monat, Vergangenheit, `heuteIso` in Winter- und Sommerzeit), Zahlen, Kataloge (Arten und Kennzahlen für KMU und Vereine, Messquellen, Rhythmus), Umrechnung der Zeiträume, SMART je Prüfung positiv und negativ (Grenze 9 und 10 Zeichen, Enddatum heute und gestern), Rückwärtsrechnung (Handrechnung, Aufrunden, 0 Aufträge, Quote 0, ungültige Quoten, Monate), `validate` (alle Meldungen, mehr als 3 Ziele und mehr als 2 Kennzahlen, leere Zeilen), `auswerten`, Vereinsvariante, Messplan-Zeilen, Baum-SVG (Knoten- und Linienzahl, `aria-label`, Umbruch, Maskierung, keine NaN, keine Verläufe, keine Überlappung), Textumbruch, CSV (BOM, Semikolon, Monatsspalten über den Jahreswechsel, Maskierung), Dokument (Reihenfolge, Tabellen, Hinweis oben), `eingabeText`, Sperrliste, `parseState` bei kaputten Daten, Konfiguration, PDF (jedes Zeichen des Dokuments kommt in der Schrift vor) und Word.
`tools/kpi-baum/Tool.test.tsx` (18 Fälle, jsdom): Beschriftungen, Arten und Kennzahlen für KMU und Vereine, Rückwärtsrechnung nur bei Kundschaft und Aufträgen, Grenzen für Ziele und Kennzahlen, Messquellen, Meldungen, Entwurf nach dem Neuladen, Ergebnis mit Baum (Grafik und Liste) und Tabellen, CRM-Aufruf mit Eingabe und Ausgabe, Hinweis bei Lücken, Enddatum in der Vergangenheit, «Später», CSV-Download, Neuladen ohne zweiten CRM-Eintrag, «Angaben ändern» und «Neu beginnen», Vereinsvariante, Sperrliste.

## Nicht Teil dieses Tools
- Keine KI und kein Abruf von Daten: Der Baum rechnet nur mit deinen Angaben.
- Keine Branchenwerte für Zielwerte oder Quoten: Es gibt keine belastbare Statistik dafür; die Quoten sind deine Annahme.
- Keine Verbindung zu Messwerkzeugen: Die «Ist»-Werte trägst du von Hand in die CSV-Vorlage ein.
- Kein Vergleich von Kennzahl und Rückwärtsrechnung (zum Beispiel «dein Zielwert für Anfragen liegt unter dem nötigen»): möglich, aber nicht Teil der ersten Fassung (IDEAS.md).
- Kein Beispiel-Knopf im Formular: Das Beispiel steht im Seitentext.
- Keine zweite Ebene unter den Kennzahlen und kein Wechsel der Gewichtung: höchstens drei Marketingziele mit je zwei Kennzahlen.
