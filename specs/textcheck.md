# Textcheck (textcheck)

Klasse A (Analyse, regelbasiert) mit einem KI-Zusatz auf Knopfdruck, Stand 04.10.2026. Die festen Prüfungen laufen im Browser; `logic.ts` ist rein und getestet. Nur wer «Mit KI prüfen» klickt, schickt den Text an `/api/text`.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU und Vereinen: einen Text einfügen und in unter einer Minute sehen, wo er Fehler, eine fremde Schreibweise, Floskeln oder zu lange Sätze hat, samt bereinigter Fassung zum Kopieren.

## Kategorie und Verknüpfung
Kategorie: content (erster Schritt im Pfad «Content»), Zielgruppe: kmu (die Seite spricht KMU an; eine Fassung für Vereine kann später folgen, dann mit eigener Seite)
Liest aus Profil: nichts
Schreibt ins Profil: nichts
Verwandte Tools: digitaler-auftritt-check; newsletter-check und ideen-aus-website entstehen später (die Seite verlinkt nur, was es gibt)
`needsServer: true` (seit 04.10.2026 abends): Der Text geht nur auf Klick auf «Mit KI prüfen» an den Server, nie von selbst. Seit 09.10.2026 (Feedback-Runde 2, Charge B3) läuft das über `/api/generate` mit dem Generator `tools/textcheck/generator.ts` (Klasse B) statt über `/api/text`; siehe «Mit KI prüfen» unten.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Dein Text | text (mehrzeilig) | ja | gespeicherter Stand `mt:textcheck` | mindestens ein Wort; höchstens 20'000 Zeichen (`maxLength` und `inputProblem`) | Zähler «n von 20'000 Zeichen»; Knopf «Beispieltext einfügen» |

## Logik
Alle Regeln in `tools/textcheck/logic.ts`. Treffer werden je Regel gruppiert (Anzahl, höchstens vier Beispielstellen mit Umgebung).

1. **Fehler** (`fehler`): doppeltes Wort («der der»); Leerzeichen vor `, ; ! ?` sowie vor `.` und `:` am Satzende; fehlendes Leerzeichen nach Komma und Strichpunkt zwischen Buchstaben; mehrere Leerzeichen hintereinander (Einrückung am Zeilenanfang ausgenommen); `!!`, `??`, vier oder mehr Punkte.
2. **Schweizer Schreibweise** (`schreibweise`): Eszett; gerade, deutsche (unten beginnende) und englische Anführungszeichen statt «…»; Prozent ohne Leerzeichen; `CHF` hinter dem Betrag (Hinweis: üblich ist CHF davor); Tausender mit Punkt (`12.500`, Hinweis: Apostroph). Datum, Dezimalzahlen und Versionsnummern gelten nicht als Tausender.
3. **Floskeln** (`floskel`): `data/floskeln.json`, 39 Einträge mit Muster, Anzeigetext und Alternative. Quelle in `meta.source`: Teil A Auszug aus ANTI-PATTERNS.md und BRAND-VOICE-CORE.md von Alperna (Version 2.0 vom 24.07.2026), Teil B gängige Werbe- und Amtsfloskeln, von Alperna zusammengestellt. Kein Treffer ist ein Urteil, es sind Hinweise.
4. **Satzlänge** (`satz`): Sätze mit mehr als 25 Wörtern (`LONG_SENTENCE_WORDS`). Annahme: Richtwert dieses Werkzeugs, keine Norm, im UI so gekennzeichnet.
5. **Lesbarkeit**: Index nach Toni Amstad (Deutsch): `180 − ASL − 58,5 × ASW` mit ASL = Wörter pro Satz und ASW = Silben pro Wort. Quelle: Amstad, «Wie verständlich sind unsere Zeitungen?», Universität Zürich 1978, Zusammenfassung auf de.wikipedia.org/wiki/Lesbarkeitsindex (abgerufen am 04.10.2026). Stufen (von … bis unter …): 0–30 sehr schwer, 30–50 schwer, 50–60 mittelschwer, 60–70 mittel, 70–80 mittelleicht, 80–90 leicht, 90–100 sehr leicht. **Annahme:** Silben werden aus Selbstlautgruppen geschätzt (Kürzel ohne Selbstlaut zählen je Buchstabe); das ist eine Näherung. Das Beispiel der Quelle («Alle meine Entchen», 14 Wörter, 22 Silben, Index 74) ist als Test hinterlegt. Ab 30 Wörtern (`MIN_WORDS_FOR_INDEX`, Regel dieses Werkzeugs) wird die Zahl gezeigt, darunter nicht.
6. **Sätze und Wörter**: Ein Satz endet an `. ! ? …` vor Leerraum oder Textende und an Zeilenumbrüchen. Punkte in Kürzeln (z. B., ca., usw.), Zahlen (8,5; 1.250; 03.10.2026), Ordnungszahlen vor Monatsnamen oder Kleinbuchstaben, Adressen und E-Mail-Adressen beenden keinen Satz. Wörter sind Folgen aus Buchstaben und Ziffern mit mindestens einem Buchstaben.
7. **Bereinigen** (`cleanText`): ersetzt Eszett durch ss; stellt Anführungszeichen zeilenweise auf «…» um (deutsch: „ öffnet, “ oder ” schliesst; englisch “…”; gerade nur bei gerader Anzahl in der Zeile, sonst unverändert); entfernt Leerzeichen vor Satzzeichen und doppelte Leerzeichen; setzt Leerzeichen nach dem Komma; schreibt Prozent mit Leerzeichen. Alles andere bleibt dem Besucher. Ein bereinigter Text hat keine automatisch behebbaren Funde mehr (Test).

## Ausgaben
- Ergebnis (sofort, frei): Wörter, Sätze, Lesbarkeit mit Stufe, Zahl der Fundstellen; «Das fällt auf» nach Gruppen; bereinigter Text in einem lesbaren Feld.
- Kopieren (frei): bereinigter Text; Bericht als Markdown (`reportMarkdown`).
- Zugang v3 (Stand 04.10.2026): Vor dem ersten Ergebnis fragt `ToolShell.ensureEmail()` nach der E-Mail-Adresse. Mit dem Ergebnis geht `POST /api/result` ab: Eingabe ist der Text, Ausgabe der Bericht als Markdown (`reportMarkdown`). Die KI-Prüfung braucht dasselbe Cookie (`/api/generate`, 403 `gate` → `renewEmail()` und einmal wiederholen); ihr Ergebnis geht seit 09.10.2026 als zweiter CRM-Eintrag hinaus (`useGenerator`: Eingabe der Text, Ausgabe `kiReport`), wie bei jedem Generator.
- Stand: `mt:textcheck` (`phase`, `text`); der Text wird 500 ms nach der letzten Eingabe gespeichert. Nur im Browser.

## Edge Cases (getestet)
- Leerer Text, nur Leerraum, nur Zahlen, nur Satzzeichen, Emojis, Steuerzeichen: Meldung oder leeres Ergebnis, nie ein Fehler.
- Weniger als 30 Wörter: kein Index, Hinweis im Ergebnis.
- Ungepaarte gerade Anführungszeichen: unverändert, weiter als Fund gemeldet.
- Eingerückte Listen, Zeilenumbrüche, Beträge wie CHF 1'250.-, Datum: unberührt.
- Bösartige Eingaben mit 20'000 Zeichen (nur Buchstaben, nur `!`, nur Ziffern, nur Leerzeichen, `a@` wiederholt): jede Analyse unter 30 ms gemessen; Test mit Grenze 1,5 s.
- Gespeicherter Stand kaputt oder zu lang: leerer Stand bzw. auf 20'000 Zeichen gekürzt.
- Kaputte Muster in `floskeln.json`: der Eintrag fällt weg, der Rest läuft.

## Texte
- Tagline: «Wir finden Floskeln und Formfehler, prüfen die Schweizer Schreibweise und messen die Lesbarkeit.» (96 Zeichen)
- SEO-Title: «Textcheck Schweiz: Floskeln und Lesbarkeit prüfen»; Meta-Description in `content/tools/textcheck.md`
- Erklärtext, FAQ (6) und Alperna-Satz: `content/tools/textcheck.md`. Wörter und Beispiele im Seitentext dürfen die Sperrliste und die Stilregeln der Seitentexte nicht verletzen (kein Eszett, keine geraden Anführungszeichen, kein Leerzeichen vor Satzzeichen); deshalb zeigt die Seite die Fehlerarten beschrieben statt wörtlich.

## Tests
`tools/textcheck/logic.test.ts` (35 Fälle): Silben, Quellen-Beispiel Index 74, Stufen, Sätze mit Kürzeln und Datum, Fehlerregeln, Schweizer Schreibweise, Floskeln samt Datei-Prüfung, lange Sätze, Bereinigung (inkl. Wiederholbarkeit), Gesamtbericht, Eingabe und Stand, Randfälle und Laufzeit. Browser: sechs Fälle in `tests/e2e/smoke.spec.ts` («Textcheck im Browser»), darunter «keine Anfrage enthält den Text» und 375 px.

## Mit KI prüfen (seit 09.10.2026, Charge B3)
Ein KI-Aufruf über `/api/generate` (Generator `textcheck`, `maxTokens` 2'600, Temperatur 0,2). Eingabe `{ text }` (1 bis 3'000 Zeichen). Ausgabe `{ gesamt (10 bis 300 Zeichen), aenderungen[] }` mit höchstens 14 Einträgen `{ art: "fehler" | "stil", original (bis 200), vorschlag (bis 240), grund (5 bis 120) }`. Die KI schreibt den Text nicht neu: Sie nennt einzelne Stellen.
- **Jedes Original muss im Text stehen.** `locate()` sucht die Stelle Buchstabe für Buchstabe; Leerraum passt auf jeden Leerraum, jedes Anführungszeichen auf jedes andere derselben Art (gerade, deutsch, französisch). Zwei Einträge dürfen sich nicht überdecken; gleiche Originale belegen nacheinander die nächste freie Stelle. Steht ein Original nicht im Text, fällt die ganze Antwort durch («nichtimtext») und die KI bekommt einmal eine feste Rückmeldung.
- **Weitere Prüfungen** (`checkTextcheck`): Vorschlag gleich dem Original («gleich»); Vorschlag mit einer Ziffernfolge, die im Original fehlt («zahl»); Vorschlag mit Ausrufezeichen, Eszett, «jetzt», Emoji, Link oder einem Wort der harten Sperrliste, das das Original nicht auch hat («vorschlag»); mehr als fünf Einträge «stil» («stil»).
- **Original und Vorschlag sind wörtliche Texte der Person** (`verbatimKeys` im Generator-Baustein): Sie werden nicht bereinigt (sonst stünde das Eszett des Originals nicht mehr im Text) und nicht gegen die Stimme geprüft. Gesamteindruck und Grund laufen durch die normale Prüfung.
- **Korrigierter Text** setzt das Werkzeug selbst zusammen (`anwenden()`): nur die Einträge «fehler», an ihren Stellen, in Textreihenfolge; «stil» bleibt eine Empfehlung. Die Oberfläche zeigt Original (durchgestrichen), Vorschlag, Grund und «Vorschlag n kopieren» je Eintrag, dazu «Korrigierten Text kopieren» und «Alles kopieren» (`kiReport`).
- **Ausfall der KI** (`failed`, `capacity`, `rate`, `network`) und `invalid`: ein ruhiger Satz in `role="alert"`; die festen Prüfungen oben bleiben stehen. Hat sich der Text nach der Prüfung geändert, steht ein Hinweis, dass die Stellen nicht mehr passen.
- **Tests:** `tools/textcheck/generator.test.ts` (22 Fälle: Schemas, Stellen, korrigierte Fassung, jede Kennung positiv und negativ, gemeinsame Prüfung, Ausgabe, Anweisung), `AiPanel.test.tsx` (6 Fälle), `lib/generator.test.ts` (`verbatimKeys`), drei Browser-Tests in `tests/e2e/smoke.spec.ts`.

## Nicht Teil dieses Tools
- Grammatik und Wörterbuch-Rechtschreibung in den festen Prüfungen: Das macht die KI auf Knopfdruck (`tools/textcheck/AiPanel.tsx`, siehe unten). Entscheid Alperna: «einfach KI mit eigener Anweisung, nicht verkomplizieren»; die festen Prüfungen bleiben, weil Zählen (Lesbarkeit, Satzlänge) und Schreibweise mit Regeln sicherer und sofort sind. Die KI-Prüfung gilt für Texte bis 3'000 Zeichen; längere prüft man abschnittsweise.
- URL statt Text (der Plan v2 nennt «Text oder URL»): kommt, wenn die Website-Import-Funktion aus `ideen-aus-website` steht; sie braucht den Server.
- KI-Vorschläge für Umformulierungen: dafür gibt es den Text-Umschreiber.
- Markieren der Stellen im Originaltext: die Liste zeigt Stellen mit Umgebung; ein markierter Text wäre ein eigener Ausbau.
- Rechtsaussagen (Regel 8): keine.
