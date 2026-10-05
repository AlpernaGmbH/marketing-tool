# Marketing-Budget-Planer (budget-planer)

Klasse C (Rechner im Browser, kein Server, keine KI), Stand 05.10.2026. Formular mit Grunddaten aus dem Profil (`ProfileFieldsForm`), eigenem `<form>` und Ergebnis als `DocumentModel` (`ResultCard`, `DocView`, `DocumentExport`, eigener CSV-Knopf). Vorbilder: `tools/icp-builder` (Formular, Stand `{ v, input, output }`) und `tools/newsletter-check` (alles im Browser, `sendResult`).

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU und für Vereinsvorstände, die vor dem Jahr wissen wollen, wie viel Geld in welchen Kanal geht: in rund vier Minuten ein Marketing-Budget für zwölf Monate aus Umsatz, Phase, Ziel, Anteil und Kanälen, mit Trennung in Fremdkosten und Werbebudget, Monatsübersicht und Eigenleistung, als Tabelle, CSV, PDF und Word.

## Kategorie und Verknüpfung
Kategorie: strategie (`pathStep.order` 9, nach der SWOT), Zielgruppe: beide (KMU und Vereine; bei Vereinen heisst der Umsatz «Jahresbudget des Vereins»)
Liest aus Profil: organisationstyp, firma, branche, groesse (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), kanaele (Vorbelegung der Kanäle), budgetJahr (nur zur Prüfung, ob das Feld leer ist)
Schreibt ins Profil: budgetJahr = Geldbudget pro Jahr (ganze Zahl), nur wenn dort nichts steht (`profilePatch`)
Verwandte Tools: swot, content-saeulen, reifegrad-check
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis ins CRM (Zugang v3).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Budget berechnen» prüft das Werkzeug die Eingaben (`formProblem`), dann `await ctx.ensureEmail()`; false lässt das Formular stehen. Danach rechnet `budget(input)`, der Stand wird gespeichert, das Ergebnis erscheint, Fokus auf die Überschrift.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText(input)` (Betrieb oder Verein, Umsatz, Phase, Ziel, Anteil, Kanäle, Eigenleistung; eine Angabe je Zeile). Ausgabe = `reportMarkdown(result, input)` (das Dokument als Markdown).
- **Downloads:** PDF und Word über `DocumentExport` (prüft die Adresse selbst), CSV über `ctx.guardDownload(() => downloadBytes(...))`. Text kopieren ist frei.
- Nach dem Neuladen steht das Ergebnis wieder da, ohne zweiten CRM-Eintrag (`parseState` rechnet es aus der gespeicherten Eingabe neu).

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (KMU oder Verein) | radio (`ProfileFieldsForm`) | nein | Profil `organisationstyp` | kmu / verein | – |
| Firma / Name des Vereins | text (`ProfileFieldsForm`) | ja | Profil `firma` | nicht leer → sonst «Gib den Namen deines Betriebs an.» / «… deines Vereins an.» | «Firma, Branche und Grösse speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche / Tätigkeit des Vereins | text (`ProfileFieldsForm`) | nein | Profil `branche` | – | – |
| Grösse | select (`ProfileFieldsForm`) | nein | Profil `groesse` | – | – |
| Jahresumsatz in CHF (ungefähr) / Jahresbudget des Vereins in CHF | number (`bp-umsatz`) | ja | gespeicherte Eingabe | 1'000 bis 100'000'000, Apostrophe und Komma werden gelesen | «CHF 1'000.- bis CHF 100'000'000.-. Eine Schätzung reicht …» |
| Phase | select (`bp-phase`) | ja | gespeicherte Eingabe | start / wachstum / etabliert | – |
| Ziel für dieses Jahr | select (`bp-ziel`) | ja | gespeicherte Eingabe | halten / leicht / stark | mit Spanne: «Verschiebt den Anteil innerhalb der Spanne …»; ohne: «Ohne Spanne aus Daten wirkt das Ziel nur als Hinweis; den Anteil setzt du selbst.» |
| Anteil vom Umsatz in % | number, Schritt 0,5 (`bp-anteil`) | ja | `anteilVorschlag(phase, ziel)`: mit Spanne aus Daten und Ziel, sonst 3 mit dem Satz «Startwert, kein Richtwert; passe ihn an.»; gilt, bis die Person tippt (`form.anteil === null`) | 0,5 bis 30 | darunter der Betrag «Das sind CHF … im Jahr, CHF … pro Monat.» (`aria-live`) |
| Kanäle | multi (Checkboxen `bp-kanal-<key>`) | mindestens einer | Profil `kanaele` (Wortvergleich auf `name` oder `kanal`), sonst Website, Google-Unternehmensprofil, Instagram; gilt, bis die Person ein Kästchen anfasst | `KANAL_KEYS` | «Vorbelegt aus deinem Firmenprofil.» (nur bei Vorbelegung) «Wähle nur Kanäle, die ihr in diesem Jahr wirklich bedient …» |
| Stunden pro Monat, die ihr selbst für Marketing einsetzt | number, Schritt 0,5 (`bp-stunden`) | nein (leer = 0) | gespeicherte Eingabe | 0 bis 400 | «Beiträge, Fotos, Newsletter, Gespräche mit Partnern.» |
| Interner Stundensatz in CHF | number (`bp-stundensatz`) | nein (leer = kein Satz) | gespeicherte Eingabe | 0 bis 500 | «Leer lassen, wenn du ihn nicht kennst. Die Eigenleistung ist Information, nicht Teil des Geldbudgets.» |

Die zehn Kanäle: Website, Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Print und Anzeiger, Anlässe und Sponsoring, Google Ads, Empfehlungen und Bewertungen. Google Ads steht in der Liste ohne Empfehlung (docs/MARKE.md).

## Logik
1. **Daten** (`data/budget-richtwerte.json`, `rahmen(phase, data)`): Schema `{ meta: { source, url, asOf, note }, phasen: { start?, wachstum?, etabliert? }, vergleich? }`. `rahmen` liefert `{ min, max, source }` nur, wenn die Phase eine Spanne mit 0 < min ≤ max ≤ 100 trägt und `meta.source` gefüllt ist, sonst null. **Stand 05.10.2026 ist `phasen` leer:** Keine geöffnete Quelle nennt Spannen in Prozent des Umsatzes nach Phase für kleine Betriebe, Schweizer Agentur-Seiten nennen Spannen ohne Quelle (nicht übernommen). `vergleich` sind Mittelwerte aus The CMO Survey 2026 (US-Firmen, n = 308): alle 9,0 %, Firmen mit weniger als 50 Mitarbeitenden 16,3 %, Firmen unter 10 Mio. US-Dollar Umsatz 13,3 %; sie erscheinen nur als Satz im Dokument («Zum Vergleich, als Durchschnitt von US-Firmen und nicht als Empfehlung …»), nie als Vorbelegung. Beide Wege (mit und ohne Spanne) sind gebaut und getestet.
2. **Anteil vorschlagen** (`anteilVorschlag(phase, ziel, data)`): mit Spanne die Mitte des unteren Drittels (Halten: min + Breite/6), die Mitte (Leicht wachsen) oder die Mitte des oberen Drittels (Stark wachsen: min + 5·Breite/6), auf 0,5 gerundet und auf 0,5 bis 30 begrenzt (Annahme: Richtwert von Alperna, keine Statistik). Ohne Spanne 3 (Startwert, kein Richtwert). Der Vorschlag gilt, solange die Person den Anteil nicht tippt.
3. **Eingabe prüfen** (`formProblem`), Reihenfolge des Formulars: Firma, Umsatz (fehlt, keine Zahl, ausserhalb 1'000 bis 100'000'000), Phase, Ziel, Anteil (0,5 bis 30), mindestens ein Kanal, Stunden (0 bis 400), Stundensatz (0 bis 500, wenn gefüllt). Meldung in `role="alert"`.
4. **Eingabe bauen** (`toInput`): Umsatz auf Franken gerundet, Anteil auf 0,5 gerundet, Stunden auf 0,5, Stundensatz auf Franken; Kanäle in fester Reihenfolge ohne Doppel; Schema `budgetInputSchema` (zod). null bei Unsinn.
5. **Geldbudget** (`budget`): Jahr = round(Umsatz × Anteil / 100). Monat = round(Jahr / 12); `zwoelfMonate` gibt elf gleiche Beträge und im Dezember den Rest, damit die Summe stimmt.
6. **Aufteilung auf Kanäle** (`anteile`): jeder Kanal hat eine Rolle mit Gewicht (Fundament 3: Website, Google-Unternehmensprofil; Reichweite 2: Instagram, Facebook, LinkedIn, Print, Google Ads; Pflege 1: Newsletter, Empfehlungen; Anlass 2: Anlässe und Sponsoring). Anteil = round(Gewicht × 100 / Summe der Gewichte der gewählten Kanäle) in ganzen Prozent; der Rundungsrest (Summe 99 oder 101) geht zum ersten Kanal mit dem grössten Gewicht. Jahresbetrag je Kanal = round(Jahr × Anteil / 100), Rundungsrest ebenfalls zum grössten Kanal, damit die Summe das Jahresbudget ist. Je Kanal zwölf Monatsbeträge mit `zwoelfMonate`; «pro Monat» ist der Januar-Betrag. Annahme: Richtwert von Alperna, keine Statistik.
7. **Fremdkosten und Werbebudget** je Kanal: Werbebudget = round(Jahr × Werbeanteil), Fremdkosten = Rest. Werbeanteil: Google Ads und Print 1, Instagram, Facebook, LinkedIn 0,5, alle anderen 0. Annahme: Richtwert von Alperna, keine Statistik.
8. **Eigenleistung**: Stunden × Stundensatz pro Monat (gerundet), × 12 pro Jahr; ohne Stundensatz nur Stunden. Information, nicht Teil des Geldbudgets.
9. **Saisonalität**: keine (keine Branchendaten mit Quelle).
10. **Monatsübersicht** (`monatsplan`): zwölf Zeilen mit deutschem Monatsnamen, Betrag = Summe der Kanalmonate, laufende Summe. Januar bis November sind gleich (Summe der gerundeten Kanalmonate), der Dezember trägt den Ausgleich.
11. **Profil** (`profilePatch`): `budgetJahr = Jahr`, nur wenn `profile.budgetJahr` keine Zahl ist (0 zählt als gesetzt).
12. **Stand** (`mt:budget-planer`): `{ v: 1, input, output }`; `output` ist das Ergebnis, damit der Pfad das Werkzeug als erledigt zählt (lib/progress.ts: Objekt unter `output`). `parseState` prüft die Eingabe mit dem Schema und rechnet das Ergebnis neu; kaputte Daten, falsche Version oder ungültige Eingabe ergeben den leeren Stand; fehlt `output`, bleibt die Eingabe für das Formular, aber kein Ergebnis.
13. **CRM**: `eingabeText(input)` und `reportMarkdown(result, input)`.

## Ausgaben
- Ergebnis: `ResultCard` «Dein Marketing-Budget» mit dem Satz zu den Richtwerten (`data-testid="bp-richtwert"`) und `DocView` des Dokuments (`data-testid="bp-dokument"`).
- Dokument (`toDocument(result, input)`): Titel «Marketing-Budget für zwölf Monate», Untertitel «CHF … im Jahr, … % vom Umsatz» (Vereine: «vom Jahresbudget»); Facts Betrieb/Verein, Jahresumsatz/Jahresbudget, Phase, Ziel, Anteil, Geldbudget pro Jahr und pro Monat; «Rahmen» (Spanne mit Quelle oder «Ohne Richtwert, eigener Anteil», Dein Anteil, Vergleich mit Quelle); «Aufteilung auf Kanäle» (Absatz mit Gewichten und Trennung als Richtwert, Tabelle Kanal | Anteil | pro Monat | pro Jahr | Fremdkosten | Werbebudget mit Zeile Summe); «Eigenleistung» (Absatz); «Monatsübersicht» (Tabelle Monat | Geldbudget | Kumuliert, zwölf Zeilen, Absatz zur Rundung); «Drei Hinweise» (Fundament zuerst, Anteil jedes Quartal prüfen, Eigenleistung ehrlich zählen). Dateiname `marketing-budget-<firma>`.
- CSV (`toCsv`): BOM, Semikolon, CRLF, Kopf `Kanal;Rolle;Monat;Betrag CHF;Fremdkosten CHF;Werbebudget CHF`, eine Zeile je Kanal und Monat (Fremd und Werbe je Monat aus dem Werbeanteil, gerundet), danach zwölf Summenzeilen («Summe;;Monat;…»). Zahlen ohne Tausendertrennzeichen, ganze Franken. Dateiname `marketing-budget-<firma>.csv`.
- Knöpfe: `DocumentExport` (Text kopieren, PDF, Word), «CSV herunterladen», «Angaben ändern» (Formular mit der gespeicherten Eingabe; «Zurück zum Ergebnis»), «Neu beginnen» (löscht Eingabe und Ergebnis; das Profil bleibt).
- Zählung: `popular:budget-planer` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Profil leer: Firma muss getippt werden (Meldung); Kanäle stehen auf Website, Google-Unternehmensprofil, Instagram; Typ KMU.
- Profil mit Kanälen, die das Werkzeug nicht kennt (TikTok, YouTube): Vorbelegung fällt auf die drei Standardkanäle. «Google Ads» im Profil zählt als Google Ads, nicht als Unternehmensprofil.
- Umsatz 1'000 mit 0,5 %: Jahr 5, Monat 0, Dezember 5. Umsatz 100'000'000 mit 30 %: Jahr 30'000'000.
- Ein Kanal: 100 %. Drei Standardkanäle (3, 3, 2): 37 / 38 / 25 (Rundungsrest zum ersten grössten Kanal). Alle zehn: 15 / 15 / 10 / 10 / 10 / 5 / 10 / 10 / 10 / 5.
- Stunden leer: 0, Absatz «Keine Eigenleistung angegeben …». Stunden ohne Satz: nur Stunden. Satz 0: CHF 0.-.
- Anteil getippt und wieder geleert: Meldung (keine stille Rückkehr zum Vorschlag). «Angaben ändern» setzt den getippten Anteil als Wert, nicht als Vorschlag.
- Daten-Datei ohne Spannen (heute): kein Rahmen aus Daten, Vorschlag 3, Hilfetext «Startwert, kein Richtwert; passe ihn an.». Daten mit Spanne, aber min > max, 0 oder über 100, oder ohne `meta.source`: wie ohne Daten. Daten ohne `vergleich`: kein Vergleichssatz.
- Gespeicherter Stand kaputt, andere Version, Eingabe ausserhalb der Grenzen oder unbekannter Kanal: leerer Stand. Veränderte Zahlen im gespeicherten `output`: ignoriert, neu gerechnet.
- Fenster mit «Später» geschlossen: Formular bleibt mit allen Werten.

## Texte
- Tagline: «Dein Marketing-Budget für zwölf Monate: Rahmen, Kanäle, Eigenleistung und Werbebudget, als Tabelle und CSV.» (108 Zeichen)
- SEO-Title «Marketing-Budget Schweiz: Planer für zwölf Monate», Meta-Description in `content/tools/budget-planer.md`.
- Keyword «Marketing-Budget»: H1, erster Absatz, Fehler, Alperna-Satz.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: CHF 900'000.-, etabliert, leicht wachsen, 3 %, fünf Kanäle, 20 Stunden zu CHF 80.-; mit `budget` gerechnet und in `logic.test.ts` festgehalten), FAQ (7) und Alperna-Satz (Baustein Website): `content/tools/budget-planer.md`.

## Tests
`tools/budget-planer/logic.test.ts` (28 Fälle): Datei im Repo (Quelle, leere Phasen, Vergleichssatz), `rahmen` mit und ohne Daten und mit unbrauchbaren Werten, `anteilVorschlag` je Ziel innerhalb der Spanne und ohne Daten, `clampAnteil`, Kanäle mit Rolle und Gewicht, Profil-Vorbelegung, `profilePatch` nur bei leerem Feld, `parseNumber`, `formProblem` in Reihenfolge mit allen Grenzen (Umsatz zu klein und zu gross, Anteil 0,5 und 30), `effectiveAnteil`, `toInput` und `formFromInput` als Rundlauf, `zwoelfMonate`, `anteile` bei einem, drei und allen Kanälen, das Beispiel aus dem Seitentext, Summen über fünf Fälle, Trennung Fremd/Werbe je Kanal, Grenzen, Eigenleistung 0, ohne Satz und mit Satz, Rahmen-Text mit und ohne Daten, `toDocument` (alle Blöcke, Vereine), `toCsv` (BOM, Semikolon, CRLF, Zeilen, Summen), `eingabeText`, `reportMarkdown`, `parseState` bei kaputten Daten und als Rundlauf, `LIMITS`.

## Nicht Teil dieses Tools
- Spannen nach Branche oder Phase ohne Quelle (Harte Regel 7); Schweizer Agentur-Zahlen ohne Beleg sind nicht übernommen.
- Saisonalität, Feiertage, Kampagnenkalender: ein Kalender-Werkzeug ist eine eigene Idee.
- Ist-Kosten erfassen oder Plan und Ist vergleichen: Hinweis im Dokument, kein Buchhaltungsersatz.
- Empfehlung für Google Ads: Checkbox ohne Werbung dafür (docs/MARKE.md).
- Rechtsaussagen: keine.
