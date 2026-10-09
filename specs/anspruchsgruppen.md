# Anspruchsgruppen-Analyse (anspruchsgruppen)

Klasse C (Rechner und Formular im Browser, kein Server, keine KI), Stand 05.10.2026. Eigenes `<form>` mit Grunddaten aus dem Profil (`ProfileFieldsForm`), einer Liste von Gruppenkarten und einem Ergebnis aus Matrix (SVG), Quadranten-Karten, bearbeitbarem Kommunikationsplan und `DocumentExport`. Vorbilder: `tools/gbp-feiertage` (Stand wird bei jeder Änderung gespeichert, `phase: "edit" | "result"`), `tools/budget-planer` (`ResultCard`, `DocView`, `DocumentExport`, `sendResult`).

## Änderung vom 09.10.2026 (Feedback-Runde 2, Charge B7): Umfeld beschreiben, Gruppen von der KI vorschlagen lassen
Diese Fassung ergänzt die Abschnitte «Eingaben» und «Logik»; Matrix (SVG), Quadranten, Strategie, Plan, Dokument und Zugang bleiben, wie sie sind. Aus «Klasse C, kein Server, keine KI» wird für den Vorschlag **Klasse B** (`needsServer: true`, Generator `tools/anspruchsgruppen/generator.ts`); die Analyse selbst rechnet weiter im Browser.

- **Rechtsform als Auswahl** statt «Ich bin»: `ProfileFieldsForm` mit `rechtsform` (Pillen in einer Reihe, Standard «KMU oder Selbständige»; Verein und Stiftung ergeben die Vorlage «Verein», alles andere «Betrieb»), dazu Firma, Ort und Branche (beim Verein «Tätigkeit des Vereins») aus dem Firmenprofil, dort sichtbar und änderbar.
- **Drei Angaben zum Umfeld** (freiwillig, im Stand unter `angaben`): «Woher kommt das Geld?» (fünf Möglichkeiten je Typ, mehrere wählbar: Betrieb Privatkundschaft, Firmen, öffentliche Hand, Beiträge oder Zuschüsse, Kredit oder Investoren; Verein Mitgliederbeiträge, Sponsoren, Gemeinde oder Kanton, Spenden, Anlässe und Verkauf), «Was steht in den nächsten zwölf Monaten an?» (bis 200 Zeichen), «Welche Gruppen kennst du schon?» (bis 200 Zeichen, mit Komma getrennt). Zusammen mit Rechtsform, Name, Ort und Branche sind das sieben Angaben, vier davon aus dem Profil (Harte Regel 10).
- **Gruppen vorschlagen.** Der Knopf ruft `/api/generate` (`requestGenerate`, nach `ensureEmail()`, 403 → `renewEmail()` und einmal wiederholen; 20 pro Stunde und IP-Hash). Ausgabe: sechs bis zehn Gruppen `{ name (3 bis 60), interesse und einfluss (ganze Zahl 1 bis 5), beziehung (eng, gut, lose, keine), erwartung und bedarf (10 bis 200 Zeichen) }`. Geprüft wird jede Antwort: Schema und Stimme (lib/generator.ts), keine zwei gleichen Namen («namedoppelt»), keine Ziffernfolge, die nicht in den Angaben steht («zahl»), jede genannte Gruppe kommt vor («bekannt», ein Wortstamm genügt), die Gruppen liegen nicht alle im selben Quadranten («streuung»). Besteht der Entwurf die Prüfung nicht, bekommt die KI einmal eine feste Rückmeldung.
- **Vorschau, dann Übernehmen.** Der Vorschlag erscheint als Liste (Name, Interesse, Einfluss, Quadrant) mit «Vorschlag übernehmen» und «Verwerfen». Erst «Übernehmen» ersetzt die Liste (IDs g1, g2, …, Plan leer, Hinweis «Vorschlag der KI übernommen. Prüfe die Werte.»); sind schon Gruppen bewertet, sagt die Vorschau, dass sie ersetzt werden. Fällt die KI aus, steht ein ruhiger Satz mit dem Hinweis, dass die Vorlage von Hand bewertet werden kann; nichts geht ins CRM. Der Vorschlag allein ist kein Ergebnis; das Ergebnis der Analyse geht wie bisher einmal ins CRM.
- **CRM:** Die Eingabe trägt nach den Gruppen Rechtsform, Ort, Finanzierung, Vorhaben und Bekannte Gruppen (nur, was angegeben ist).
- **Stand:** `{ v: 1, phase, typ, gruppen, plan, angaben }`; Stände ohne `angaben` ergeben leere Angaben, unbekannte Schlüssel der Finanzierung fallen weg.
- **Tests:** `generator.test.ts` (Schemas, jede Kennung, Anweisung), `logic.test.ts` (Angaben, `kiInput`, `gruppenAusVorschlag`, Stand, CRM-Zeilen), `Tool.test.tsx` (Rechtsform und Angaben, Vorschau und Übernehmen, Ersetzen-Hinweis, Verwerfen, Ausfall, fehlender Name, Neuladen), Browser-Test mit gestubbtem `/api/generate`.

## Nutzen in einem Satz
Für Vereinsvorstände und KMU-Inhaberinnen und -Inhaber, die wissen wollen, wen sie wie ansprechen: in rund sechs Minuten aus acht vorbereiteten (oder eigenen) Anspruchsgruppen eine Matrix aus Einfluss und Interesse, eine Strategie je Quadrant und einen Kommunikationsplan, als Bildschirmansicht, Text, PDF und Word.

## Kategorie und Verknüpfung
Kategorie: strategie (`pathStep` im Pfad «vereine», Schritt 1), Zielgruppe: beide (zuerst Vereine; das Profil bestimmt die Vorlage)
Liest aus Profil: organisationstyp (wählt die Vorlage), firma (Kopf des Dokuments; Pflicht)
Schreibt ins Profil: nichts
Verwandte Tools: kommunikationskonzept, sponsoring-dossier, icp-builder
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis ins CRM (Zugang v3).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Analyse erstellen» prüft das Werkzeug die Eingaben (`formProblem`), dann `await ctx.ensureEmail()`; false lässt das Formular stehen. Danach wird der Plan aus Vorschlägen und früheren Änderungen gebaut, der Stand gespeichert, das Ergebnis erscheint, Fokus auf die Überschrift.
- **Jedes Ergebnis geht ins CRM** (einmal beim Klick, nicht beim Wiederherstellen): Eingabe = `eingabeText` (Verein oder Betrieb, eine Zeile je Gruppe mit Interesse, Einfluss und Beziehung, danach nicht bewertete Gruppen, danach Erwartung und Bedarf als Text). Ausgabe = `ausgabeText` (Markdown mit den vier Quadranten und dem Plan als Liste). Die Ausgabe bleibt bei zwölf Gruppen mit den Vorschlägen unter 1'900 Zeichen; die Eingabe kann mit langen Texten länger werden, darum stehen die Zahlen aller Gruppen vorn und die Texte hinten (der Server kürzt auf 1'900 Zeichen).
- **Downloads:** PDF und Word über `DocumentExport` (prüft die Adresse selbst). Text kopieren ist frei.
- Nach dem Neuladen steht das Ergebnis wieder da, ohne zweiten CRM-Eintrag.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (KMU oder Verein) | radio (`ProfileFieldsForm`) | nein | Profil `organisationstyp` | kmu / verein | – |
| Name des Vereins / Firma | text (`ProfileFieldsForm`, id `ag-firma`) | ja | Profil `firma` | nicht leer → «Gib den Namen deines Vereins an.» / «… deines Betriebs an.» | – |
| Gruppe | text je Karte (`ag-<id>-name`) | ja, wenn die Karte Werte trägt | Vorlage je Typ (8 Namen) | höchstens 60 Zeichen | – |
| Interesse | select 1 bis 5 (`ag-<id>-interesse`) | ja für die Analyse | leer | ganze Zahl 1 bis 5 | «Wie stark beschäftigt sich die Gruppe mit dir? 1 gering, 5 hoch.» |
| Einfluss | select 1 bis 5 (`ag-<id>-einfluss`) | ja für die Analyse | leer | ganze Zahl 1 bis 5 | «Wie stark kann die Gruppe deinen Erfolg beeinflussen? 1 gering, 5 hoch.» |
| Beziehung | select eng / gut / lose / keine (`ag-<id>-beziehung`) | nein | leer | eine der vier | – |
| Was sie erwartet | textarea (`ag-<id>-erwartung`) | nein | leer | höchstens 200 Zeichen | – |
| Was wir von ihr brauchen | textarea (`ag-<id>-bedarf`) | nein | leer | höchstens 200 Zeichen | – |

Listenfunktionen: «Gruppe hinzufügen» (bis 12, danach gesperrt), «Entfernen» je Karte, «Vorlage laden» (nur im Hinweis bei Typwechsel und im Leerzustand). Die Vorlage trägt nur Namen, keine Werte; die Person bewertet selbst.

Vorlagen (acht Gruppen):
- KMU: Kunden, Mitarbeitende, Lieferanten, Gemeinde und Behörden, Banken, Verbände, Medien, Nachbarschaft.
- Verein: Mitglieder, Nachwuchs und Eltern, Vorstand, Sponsoren, Gemeinde, Verbände, Medien, Helferinnen und Helfer.

## Logik
Alle Regeln in `tools/anspruchsgruppen/logic.ts` (rein, ohne React, DOM und Netz). Alle Grenzen und Vorschläge sind **Richtwerte von Alperna, keine Statistik**; es gibt keine Datei in `data/`, keine Zahl mit Quelle.
1. **Quadrant** `quadrant(interesse, einfluss)`: Einfluss ≥ 4 und Interesse ≥ 4 → «eng einbinden»; Einfluss ≥ 4, Interesse < 4 → «zufriedenstellen»; Einfluss < 4, Interesse ≥ 4 → «informieren»; sonst «beobachten». Annahme: Die Grenze liegt zwischen 3 und 4 (ohne Quelle, im UI als Richtwert gekennzeichnet).
2. **Hinweis** `hinweis(g)`: bei «eng einbinden» und Beziehung «keine» oder «lose» → «Beziehung aufbauen»; sonst keiner.
3. **Vorschlag je Quadrant** `vorschlag(strategie)`: eng einbinden → «persönliches Gespräch», «monatlich»; zufriedenstellen → «kurzer Bericht oder Anruf», «quartalsweise»; informieren → «Newsletter oder Beitrag», «monatlich»; beobachten → «Einladung oder Gruss», «jährlich, bei Anlass». Annahme: Richtwert von Alperna, keine Statistik.
4. **Prüfung** `pruefeGruppen`, Reihenfolge der Karten: leere Karte (kein Name, keine Werte) wird übergangen; Karte nur mit Name (unberührte Vorlage) zählt als «nicht bewertet» und fehlt in der Analyse; Karte mit Werten braucht Namen (≤ 60), Interesse und Einfluss (ganze Zahl 1 bis 5), Beziehung aus der Liste, Texte ≤ 200 Zeichen; mindestens zwei bewertete Gruppen; höchstens zwölf Karten. `formProblem` stellt die Firma voran.
5. **Auswertung** `analysiere`: Reihenfolge nach Quadrant (eng einbinden, zufriedenstellen, informieren, beobachten), darin Einfluss absteigend, Interesse absteigend, Reihenfolge der Eingabe; `nr` zählt in dieser Reihenfolge ab 1 und steht in Matrix, Liste, Karten und Tabelle.
6. **Plan** `planFuer(gruppen, gespeichert)`: je Gruppe ein Eintrag `{ id, strategie, kanal, rhythmus, verantwortlich }`. Ohne gespeicherten Eintrag gilt der Vorschlag und «Verantwortlich» ist leer; mit gespeichertem Eintrag und gleichem Quadranten bleibt er (auch leer gelöschte Felder); wechselt der Quadrant, gilt der neue Vorschlag, «Verantwortlich» bleibt. Einträge entfernter Gruppen fallen weg.
7. **Matrix** `matrixLayout`: Zeichenfläche 360 × 324, Plotfläche 300 × 264, Punktradius 10. Die Achsen laufen von 1 bis 5; damit die vier Quadranten gleich gross sind, liegt die Grenze in der Mitte und die Werte 1 bis 3 teilen die linke (untere) Hälfte, 4 und 5 die rechte (obere): Position `achse(v)` = (v − 0,5) / 6 für v ≤ 3, 0,5 + (v − 3,5) / 4 für v ≥ 4. Auf der Einflussachse bleibt unten ein Streifen von 24 Einheiten frei (`MATRIX.band`), damit die Namen der unteren Quadranten nie unter einem Punkt stehen; die Werte 1 bis 3 verteilen sich dort auf den Rest der unteren Hälfte. Interesse läuft nach rechts, Einfluss nach oben. Mehrere Gruppen mit denselben Werten sitzen auf einem kleinen Kreis um die Mitte der Zelle (Radius mindestens 13, höchstens 45 % der kleineren Zellenseite); alle Punkte bleiben innerhalb der Plotfläche. Die Punkte tragen die Nummer `nr`, die Namen stehen in der Liste darunter (sonst überlappen sie auf dem Handy).
8. **Dokument** `toDocument`: Titel «Anspruchsgruppen-Analyse», Kennzahlen (Verein oder Betrieb, Zahl der Gruppen, Grenze «hoch» ab 4 von 5 als Richtwert), Tabelle «Die Gruppen im Überblick» (Gruppe, Interesse, Einfluss, Quadrant, Strategie), «Strategie je Quadrant» (Liste), «Erwartungen und Bedarf» (Tabelle, nur wenn eine Gruppe Beziehung oder Text trägt), «Kommunikationsplan» (Tabelle Gruppe, Quadrant, Strategie, Kanal, Rhythmus, Verantwortlich), «Hinweise» (Beziehung aufbauen, Prüfung vor der Generalversammlung bzw. Jahresplanung, Lage ändert sich, nicht bewertete Gruppen). Das SVG ist nicht Teil von PDF und Word; die Tabellen tragen dieselbe Aussage.
9. **Stand** `mt:anspruchsgruppen`, `parseState`: `{ v: 1, phase: "edit" | "result", typ: "kmu" | "verein", gruppen, plan }`. Jede Änderung im Formular wird sofort gespeichert. Kaputte Daten, falsche Version → Vorlage «kmu» im Zustand «edit». Kaputte Gruppen werden einzeln bereinigt (Werte ausserhalb 1 bis 5 → leer, doppelte oder fehlende IDs ersetzt, Texte gekürzt); fehlt die Liste, gilt die Vorlage; eine leere Liste bleibt leer. «result» nur, wenn die Gruppen die Prüfung bestehen. `lib/progress.ts` erkennt `phase: "result"` als erledigt.
10. **Typwechsel** `aufTyp(state, typ)`: Weicht der Typ im Profil vom Typ des Stands ab und ist die Liste unberührt (genau die Vorlage des Stands, keine Werte), erscheint die andere Vorlage ohne Rückfrage. Sind Werte eingetragen, bleibt die Liste und ein Hinweis nennt die Vorlage (Knopf «Vorlage laden» ersetzt die Liste).

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster): `ResultCard` «Deine Anspruchsgruppen» mit Zusammenfassung («8 Gruppen bewertet. Eng einbinden: 3, zufriedenstellen: 2 …»), Satz zum Richtwert (`data-testid="ag-richtwert"`), Matrix als `<svg role="img" aria-label="Matrix Einfluss und Interesse">` (`data-testid="ag-matrix"`) mit sichtbarer Liste darunter (`ol` aria-label «Lage der Gruppen», `data-testid="ag-lage"`), vier Karten (`ul` aria-label «Strategie je Quadrant», je Karte `h4`, Gruppen mit Nummer und Hinweis, `data-testid="quadrant-<strategie>"`), Kommunikationsplan als Tabelle (`data-testid="ag-plan"`, in `overflow-x-auto`, Kanal, Rhythmus und Verantwortlich als Felder mit aria-label «<Gruppe>: Kanal» usw.), aufklappbare Ansicht des Dokuments (`DocView`, so erscheint es in PDF und Word).
- Knöpfe: `DocumentExport` (Text kopieren, PDF herunterladen, Word herunterladen), «Angaben ändern» (Formular mit den Angaben), «Neu beginnen» (Vorlage des Profil-Typs).
- Änderungen im Plan landen sofort im Stand und in Text, PDF und Word; sie gehen nicht erneut ins CRM.

## Edge Cases (getestet)
- Weniger als zwei bewertete Gruppen, leerer Name bei einer Karte mit Werten, nur ein Wert (Interesse ohne Einfluss), Werte ausserhalb 1 bis 5, Text über 200 Zeichen, mehr als zwölf Karten, Firma fehlt: Meldung in `role="alert"`, Fokus auf das Feld, kein Ergebnis, kein CRM-Eintrag.
- Alle acht Vorlagen unbewertet: Meldung «Bewerte mindestens zwei Gruppen …».
- Drei Gruppen mit denselben Werten: versetzte Punkte, alle innerhalb der Plotfläche, keine zwei auf demselben Punkt.
- Grenzen 3 und 4 bei Interesse und Einfluss (vier Quadranten); Gruppe im Eck (1/1 und 5/5).
- Typwechsel mit und ohne Werte; Liste leer; zwölf Karten (Knopf «Gruppe hinzufügen» gesperrt).
- Gespeicherter Stand: null, Text, Zahl, Array, falsche Version, kaputte Gruppen, doppelte IDs, Werte 0 / 7 / 2,5 / «3», «result» ohne gültige Gruppen → «edit».
- Profil leer: Typ «kmu», Kopf im Dokument «Alperna» (Firma fehlt; die Firma ist aber Pflicht für das Ergebnis). Speicher gesperrt: `useLocalJson` fällt auf den Arbeitsspeicher zurück. Adresse abgelaufen: `guardDownload` fragt vor dem Download.
- Sehr lange Namen und Texte in Tabellen (PDF bricht um, Markdown ersetzt Zeilenumbrüche und Pipe-Zeichen).

## Texte
- Tagline: «Wer Einfluss und Interesse hat: Matrix, Strategie je Gruppe und Kommunikationsplan für Verein oder Betrieb.» (107 Zeichen; die Fassung aus dem Auftrag hat 115 und scheitert an der Grenze von 110 in `defineTool`)
- SEO-Title (≤ 60, mit «Schweiz») und Meta-Description (≤ 155): in `content/tools/anspruchsgruppen.md`.
- Keyword «Anspruchsgruppen»: in der H1 «Anspruchsgruppen-Analyse für Schweizer Vereine» und im ersten Absatz.
- Seitentext, Beispiel (FC Trogen, mit der Logik gerechnet), FAQ und Alperna-Satz (Baustein Website, `beweis: @baustein`): `content/tools/anspruchsgruppen.md`.

## Tests
`tools/anspruchsgruppen/logic.test.ts` (50 Fälle): Quadrant an den Grenzen 3 und 4 und für alle 25 Wertepaare, Hinweis «Beziehung aufbauen», Vorschläge je Quadrant, Vorlagen je Typ (acht Gruppen, Namen), IDs, unberührte Vorlage; Prüfung (zu wenige Gruppen, leerer Name, fehlendes Interesse oder fehlender Einfluss, Werte ausserhalb von 1 bis 5, zu lange Namen und Texte, mehr als zwölf Karten, nicht bewertete Gruppen, Firma); Auswertung und Reihenfolge, Zusammenfassung; Plan (Vorschlag, behalten, Quadrantenwechsel, entfernte Gruppen, Felder setzen); Achsenposition mit freiem Streifen, `matrixLayout` (Quadrantenseite, im Zeichenbereich und in der Plotfläche, Ecken, Platz für die Namen, versetzte Dubletten, zwölf Gruppen auf einem Wert); Dokument (Tabellen, Plan, Hinweise, Markdown, Maskierung); `eingabeText` und `ausgabeText` (unter 1'900 Zeichen bei zwölf Gruppen); `parseState` bei kaputten Daten, Plan, JSON-Durchlauf; Typwechsel.
`tools/anspruchsgruppen/Tool.test.tsx` (16 Fälle, jsdom): Formular mit Vorlage, Labels und Optionen; Typwechsel mit und ohne Werte und «Vorlage laden»; Meldungen mit Fokus und `aria-invalid`; Gruppe hinzufügen und entfernen, Grenze zwölf, leere Liste; Speichern bei jeder Änderung; Ergebnis mit Matrix, Liste, Karten, Plan, Stand und CRM-Aufruf; Fokus auf die Überschrift; E-Mail-Fenster mit «Später»; Plan bearbeiten; Neuladen ohne zweiten CRM-Eintrag; «Angaben ändern» mit neuem Quadranten; «Neu beginnen»; Download bei abgelaufener Adresse; Betriebe.

## Nicht Teil dieses Tools
- Personen mit Namen, Telefonnummern oder Adressen: Das Werkzeug arbeitet mit Gruppen. Namen der Verantwortlichen stehen im Plan, bleiben im Browser und gehen nur mit dem Ergebnis ins CRM.
- Statistik oder Vergleichswerte («so viele Vereine haben …»): Es gibt keine Quelle, darum keine Zahl.
- Gewichtung nach Punkten, Bewertung in Stufen über fünf, mehr als zwölf Gruppen, mehrere Analysen nebeneinander (ein Stand pro Browser; «Angaben ändern» überschreibt).
- Rechtsaussagen (Harte Regel 8): keine. Das Werkzeug sagt nicht, welche Gruppe ein Verein anhören oder informieren muss.
- Export des SVG als Bild und Kalender mit Terminen: Die Matrix steht am Bildschirm; Dateien enthalten die Tabellen.
- Schreiben ins Firmenprofil: keine Felder (`writesProfile` ist leer).
