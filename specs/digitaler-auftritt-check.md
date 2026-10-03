# Digitaler-Auftritt-Check (digitaler-auftritt-check)

Entwurf von Claude Code aus der Beschreibung in Etappe 1b des Plans. Alperna liest gegen; Gewichte und Formulierungen lassen sich in `logic.ts` ändern.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von Schweizer KMU: in rund 6 Minuten sehen, wie vollständig der eigene Auftritt im Netz ist, und eine nach Wirkung geordnete Liste der nächsten Schritte bekommen.

## Kategorie und Verknüpfung
Kategorie: strategie (erster Schritt im Pfad «Strategie»)
Liest aus Profil: organisationstyp, branche, ort, kanton, groesse
Schreibt ins Profil: organisationstyp, branche, ort, kanton, groesse
Verwandte Tools: gbp-check, bewertungs-kit, positionierung (entstehen in späteren Etappen; bis dahin zeigt die Seite nur, was es gibt)

## Eingaben

Vor dem Start: ein Block «Dein Betrieb» mit den fünf Profilfeldern (organisationstyp, branche, ort, kanton, groesse). Er liegt ausserhalb des Fragebogens, schreibt direkt ins Profil und zählt nicht zu den höchstens 10 Fragen (Harte Regel 9). Was im Profil steht, wird vorbefüllt und nie erneut gefragt (Harte Regel 10).

Fragebogen: 7 Fragen.

| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| bausteine | multi | ja | nein | mindestens 1 | «Wähle, was für deinen Betrieb eine Rolle spielt. Was du nicht brauchst, zählt nicht gegen dich.» |
| website | matrix (3 bis 4 Zeilen) | ja | nein | jede Zeile beantwortet | nur wenn «Website» gewählt |
| gbp | matrix (4 Zeilen) | ja | nein | wie oben | nur wenn «Google Business Profil» gewählt |
| social | matrix (3 Zeilen) | ja | nein | wie oben | nur wenn «Social Media» gewählt |
| shop | matrix (3 Zeilen) | ja | nein | wie oben | nur wenn «Online-Shop» gewählt |
| buchung | matrix (3 Zeilen) | ja | nein | wie oben | nur wenn «Buchungstool» gewählt |
| ads | matrix (3 Zeilen) | ja | nein | wie oben | nur wenn «Google Ads» gewählt |

Spalten jeder Matrix: «Ja», «Teilweise», «Nein». «Nein» gilt auch, wenn es etwas nicht gibt.

Die sechs Bausteine sind die Alperna-Bausteine aus dem Pitch: Website, Google Business Profil, Social Media, Online-Shop, Buchungstool, Google Ads.

## Logik

Jede Matrixzeile ist ein Prüfpunkt mit Gewicht (1 bis 3), Aufwand (klein, mittel, gross), einer Massnahme, einem Grund und optional einem Werkzeug, das dazu passt.

1. Antwortwert: Ja = 1, Teilweise = 0,5, Nein = 0.
2. Baustein-Score = Summe(Gewicht × Antwortwert) ÷ Summe(Gewicht) × 100, gerundet.
3. Gesamt-Score = Mittel der Baustein-Scores der gewählten Bausteine. **Annahme:** Alle gewählten Bausteine zählen gleich. Ohne Quelle, im UI als Einschätzung kennzeichnen.
4. Stufe (aus `scoreBand`): ab 75 «stark», ab 40 «ausbaufähig», darunter «Handlungsbedarf».
5. Massnahmenliste: alle Prüfpunkte mit «Nein» oder «Teilweise». Priorität = Gewicht × (1 bei «Nein», 0,5 bei «Teilweise»). Sortierung: Priorität absteigend, dann kleinerer Aufwand zuerst, dann Reihenfolge der Bausteine.
6. **Annahme:** Gewichte und Aufwand sind eine Einschätzung von Alperna, keine Statistik. Es gibt keine Prozentzahlen aus Studien und keine Benchmarks.
7. Link zum passenden Werkzeug nur, wenn das Werkzeug in der Registry existiert.

## Ausgaben
- Ergebnisbereich: Gesamt-Score mit Stufe (`ScoreBadge`), pro Baustein eine Zeile mit Score, danach die Massnahmenliste (auf dem Bildschirm die ersten 8, im Export alle).
- Kopieren (frei): Markdown aus dem DocumentModel.
- Export (hinter dem LeadGate): PDF und DOCX mit Kopf (Firmenname, Datum), Gesamt-Score, Tabelle der Bausteine, Massnahmenliste, Hinweis auf Gewichtung als Einschätzung.
- Schreibt branche, ort, kanton, groesse, organisationstyp ins Profil (über den Block «Dein Betrieb»).

## Edge Cases
- Kein Baustein gewählt: Frage 1 ist Pflicht, der Fragebogen geht nicht weiter.
- Alles «Ja»: Score 100, Massnahmenliste leer, Text «Hier gibt es nichts Dringendes».
- Alles «Nein»: Score 0, Liste vollständig, Stufe «Handlungsbedarf».
- Ein Baustein gewählt, dann abgewählt: Antworten dieses Bausteins zählen nicht und erscheinen nicht.
- Profil leer: Der Block «Dein Betrieb» ist leer, Export-Kopf zeigt «Alperna».
- Unbekannter Prüfpunkt im gespeicherten Zwischenstand: wird ignoriert.

## Texte
- Tagline (≤ 110 Zeichen): «Sechs Bausteine, ein Ergebnis: Wo dein Auftritt im Netz Lücken hat und was du zuerst angehst.»
- SEO-Title (≤ 60, mit «Schweiz»): «Digitaler-Auftritt-Check Schweiz für KMU – kostenlos»
- Meta-Description (≤ 155): siehe `content/tools/digitaler-auftritt-check.md`
- Erklärtext: Warum der Auftritt zählt, so nutzt du das Ergebnis, häufige Fehler, Beispiel Malerei Keller, Gossau.
- FAQ: 6 Fragen.
- Alperna-CTA: problem aus dem Text, baustein «Website», beweis aus `content/pitch/bausteine.md` (`beweis: @baustein`).

## Tests
Mindestens fünf Fälle für `logic.ts`, davon zwei Edge Cases: siehe `logic.test.ts`.

## Nicht Teil dieses Tools
- Keine automatische Analyse einer Website oder eines Google-Eintrags (keine Netzwerkzugriffe).
- Kein Vergleich mit anderen Betrieben, keine Branchenwerte.
- Keine Bewertung rechtlicher Pflichten.
