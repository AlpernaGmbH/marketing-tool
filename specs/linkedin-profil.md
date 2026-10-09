# LinkedIn-Profil-Score (linkedin-profil)

## Nutzen in einem Satz
Für KMU und Selbständige, die auf LinkedIn auffindbar sein wollen: Headline und Info-Text aus dem eigenen Profil einfügen, danach ein Punktwert von 0 bis 100 nach festen Regeln, die wichtigsten Verbesserungen und von einer KI drei Headline-Vorschläge samt neuem Anfang für den Info-Text, in etwa drei Minuten.

Das Werkzeug liest das Profil nicht. LinkedIn lässt sich nicht auslesen. Die Person fügt zwei Texte ein. Der Punktwert kommt aus zehn festen Regeln (nur Form und Wortwahl der eingefügten Texte), nie von der KI. Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn. Das sagen Einleitung, Ergebnis, Dokument und Seitentext offen. Bild, Banner, «Im Fokus», Erfahrung, Empfehlungen, Aktivität und Adresse des Profils lassen sich nicht einfügen: Sie stehen als Liste ohne Punkte unter dem Ergebnis.

Änderung gegenüber der Fassung vom 05.10.2026 (Feedback-Runde 2, Charge B2): Die acht Fragen mit Selbsteinschätzung entfallen. Stattdessen Einfügen von Headline und Info-Text, Punktwert aus den Texten und ein KI-Aufruf für die Vorschläge.

## Kategorie und Verknüpfung
Kategorie: analyse (Pfad «analyse», Schritt 5). Zielgruppe: beide. Klasse B: ein KI-Aufruf über /api/generate (Generator `tools/linkedin-profil/generator.ts`), `needsServer: true`.
Liest aus Profil: firma, branche (beide über ProfileFieldsForm sichtbar und änderbar), primaersegment (Vorbefüllung der Zielgruppe).
Schreibt ins Profil: nichts.
Verwandte Werkzeuge: positionierung, nutzenversprechen, textcheck.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (ProfileFieldsForm) | nein | firma | höchstens 120 Zeichen an die KI | Wird im Firmenprofil gespeichert |
| Branche | text (ProfileFieldsForm) | nein | branche | höchstens 120 Zeichen an die KI | Wird im Firmenprofil gespeichert |
| Deine Headline | text | eines von beiden | nein | bis 300 Zeichen; Richtwert 220 | Zähler «n Zeichen, Richtwert 220» |
| Dein Info-Text | textarea | eines von beiden | nein | bis 2'600 Zeichen | Zähler «n von 2'600 Zeichen» |
| Für wen arbeitest du? (freiwillig) | text | nein | primaersegment, auf 80 Zeichen am letzten Leerzeichen gekürzt | bis 80 Zeichen | Die KI nutzt sie für die Vorschläge |

Mindestens Headline oder Info-Text; beides ist besser. «Beispiel einfügen» füllt die Texte von Malerei Keller. Eine getippte Zielgruppe wird nie überschrieben.

## Logik
Annahme: Gewichte, Stufen, Richtwert für die Headline-Länge (220), die ersten 210 Zeichen des Info-Texts, Umfang (100 und 300 Zeichen) und Satzlänge (25 Wörter, wie im Textcheck) sind ein Richtwert von Alperna, ohne Quelle, im UI als Richtwert gekennzeichnet.

1. **Zehn Kriterien** mit je 0, 1 oder 2 Punkten; Gewicht × Punkte ÷ 2 ergibt die erreichten Punkte. Gewichte (Summe 100, alle gerade, darum ganzzahlig):

| Kriterium | Stelle | Gewicht | 2 Punkte | 1 Punkt | 0 Punkte |
|---|---|---|---|---|---|
| h-laenge | Headline | 6 | 25 bis 220 Zeichen | unter 25 Zeichen | leer oder über 220 |
| h-aussage | Headline | 18 | Verb (helfe, unterstütze, …) und Bezug (für, bei, Kundschaft) | eines von beiden (Verb, «für» oder Kundschaftswort) | weder noch |
| h-beleg | Headline | 6 | enthält eine Ziffer | nennt einen Ort («in Gossau») | weder noch |
| h-floskel | Headline | 8 | keine Floskel aus dem Textcheck | | Floskel oder leer |
| i-nutzen | Info-Text | 16 | beginnt nicht mit «Ich» | beginnt mit «Ich» | beginnt mit «Ich bin» oder «Mein Name», oder leer |
| i-kundschaft | Info-Text | 12 | Kundschaftswort in den ersten 210 Zeichen | in den ersten 600 Zeichen | nirgends |
| i-saetze | Info-Text | 8 | kein Satz über 25 Wörter | ein Satz | mehrere |
| i-umfang | Info-Text | 8 | ab 300 Zeichen | ab 100 Zeichen | darunter |
| i-floskel | Info-Text | 8 | keine Floskel | eine | mehrere |
| i-aufruf | Info-Text | 10 | in den letzten 300 Zeichen ein Verb wie schreib, melde, ruf an, Adresse, Link oder Telefonnummer | | nicht vorhanden |

   Headline zusammen 38, Info-Text 62. Ein leerer Text ergibt für seine Kriterien 0. Kundschaftswörter: du, dich, dir, dein-, Sie (gross geschrieben), Kunde, Kundin, Kunden, Kundinnen, Kundschaft, Betriebe, KMU, Vereine, Mitglieder, Publikum, Sponsoren, Familien, Hausbesitzer, Eigentümer, Eltern, Gäste (Heuristik, kein Urteil über den Inhalt). Floskeln und lange Sätze kommen aus dem Regelsatz des Textchecks (`findingsOf`, data/floskeln.json).
2. **Punktwert** = Summe der erreichten Punkte, ganzzahlig. **Stufe** (Richtwert): 0 bis 39 «Ausbaufähig», 40 bis 69 «Solide Basis», 70 bis 100 «Stark». NaN und negative Werte gelten als 0, Werte über 100 als «Stark». Das Ergebnis zeigt den Punktwert als Kennzahl-Kachel (Stat-Block) und die erreichten Prozent je Kriterium als Balken.
3. **Verbesserungen:** die Kriterien mit weniger als 2 Punkten, absteigend nach offenen Punkten, bei Gleichstand in der Reihenfolge der Tabelle, höchstens fünf; je mit «Was fehlt» (Text für 0 oder 1 Punkt), konkreten Funden (zum Beispiel die gefundene Floskel, Länge der Headline, Zahl langer Sätze) und «So geht es».
4. **KI-Vorschläge** (ein Aufruf, `/api/generate`, Ausgabe `{ headlines: 3 × { text 20 bis 220, grund 10 bis 140 }, infoAnfang 80 bis 600 }`): Die KI bekommt Betrieb, Branche, Zielgruppe, die eingefügten Texte und bis zu acht Hinweise der Regeln. Prüfung jedes Vorschlags (`checkLinkedin`): keine doppelte Headline und keine gleich der heutigen («doppelt»), keine Ziffernfolge, die nicht in den Angaben steht («zahl»), jeder Vorschlag nennt ein Wort der Angaben («erfunden»), keine eckige Klammer, die nicht in den Angaben steht («platzhalter»), der neue Anfang beginnt nicht mit «Ich bin» oder «Mein Name» («ichbin»), keine Floskel aus dem Textcheck («floskel»); dazu die gemeinsame Stimme- und Zeichenprüfung (lib/generator.ts). Besteht ein Entwurf die Prüfung nicht, bekommt die KI einmal eine feste Rückmeldung und schreibt neu; danach fällt die Antwort durch.
5. **Ausfall der KI** (Kapazität, Rate, Netz, ungültige Antwort): Das Ergebnis erscheint trotzdem mit Punktwert, Balken und Verbesserungen. Statt der Vorschläge steht ein ruhiger Hinweis, `kiAusfall` ist gesetzt, und genau ein CRM-Eintrag geht hinaus. «Vorschläge neu schreiben» holt die Vorschläge nach und schickt das vollständige Ergebnis erneut ins CRM. Scheitert das Neuschreiben bei vorhandenem Ergebnis, bleibt es stehen, der Fehler erscheint unter dem Ergebnis, und es geht nichts ins CRM. Bei «gate» und «invalid» bleibt das Formular mit Fehlermeldung.
6. **Stand** unter `mt:linkedin-profil`: `{ v: 2, phase: "edit" | "result", headline, about, zielgruppe, firma, branche, ki: LinkedinOutput | null, kiAusfall, output?: { score, stufe } }`. Stände einer früheren Fassung (`v: 1`) ergeben das leere Formular. `ki` wird beim Lesen gegen das Ausgabeschema geprüft. `output` wird beim Lesen neu berechnet. `phase: "result"` genügt lib/progress.ts.

### Rechenbeispiel (Malerei Keller, Gossau)
Headline «Malermeister bei Malerei Keller» (31 Zeichen), Info-Text «Ich bin Malermeister und führe die Malerei Keller in dritter Generation. Wir streichen Fassaden und Innenräume in Gossau, Flawil und Herisau und beraten bei der Farbwahl.»
Punkte: h-laenge 2 (6), h-aussage 0 (kein Verb), h-beleg 0, h-floskel 2 (8), i-nutzen 0 («Ich bin»), i-kundschaft 0, i-saetze 2 (8), i-umfang 1 (4, unter 300 Zeichen), i-floskel 2 (8), i-aufruf 0. Summe 6 + 8 + 8 + 4 + 8 = 34, Stufe «Ausbaufähig». Offene Punkte: h-aussage 18, i-nutzen 16, i-kundschaft 12, i-aufruf 10, h-beleg 6 (zusammen 62; die fünf grössten stehen in der Liste).

## Ausgaben
- Ergebnis am Bildschirm (ResultCard «Dein LinkedIn-Profil-Score»): Kennzahl-Kachel mit Punktwert und Stufe, Hinweis, Balken je Kriterium, Verbesserungen (nummeriert), «Vorschläge der KI» (drei Headlines mit Begründung und Knopf «Vorschlag n kopieren», neuer Anfang mit Knopf «Neuen Anfang kopieren», KI-Hinweis «Von einer KI formuliert …»; bei Ausfall der Hinweis statt der Vorschläge), «Der Rest deines Profils» (sieben Karten ohne Punkte), drei Hinweise.
- Text kopieren (Markdown des Dokuments), PDF und Word über DocumentExport (Download nach der E-Mail-Adresse, `guardDownload`).
- CRM (`sendResult` über useGenerator, bei Ausfall vom Werkzeug): `eingabe` = Betrieb, Branche, Zielgruppe, eingefügte Headline, eingefügter Info-Text, eine je Zeile; `ausgabe` = Markdown des Dokuments mit Punktwert oben (der Server kürzt auf 1'900 Zeichen).
- Das Ergebnis erscheint erst nach dem E-Mail-Fenster; «Später» lässt das Formular stehen. Die Ladeansicht zeigt «Texte lesen», «Vorschläge schreiben», «Vorschläge kontrollieren».

## Edge Cases
- Beide Texte leer: Meldung in `role="alert"`, kein Server-Aufruf, kein CRM-Eintrag.
- Nur Headline oder nur Info-Text: Punktwert nur für die vorhandene Stelle (die andere ergibt 0 Punkte); die KI bekommt den vorhandenen Text.
- Extremwerte: Headline mit genau 220 Zeichen löst «h-laenge» nicht aus, mit 221 schon; Satz mit genau 25 Wörtern löst nichts aus; Info-Text mit 99 Zeichen 0, mit 100 Zeichen 1, mit 300 Zeichen 2 Punkte.
- Das Ergebnis ist reproduzierbar: gleiche Texte ergeben denselben Punktwert; die Vorschläge der KI können abweichen.
- Profil leer: Firma und Branche bleiben leer, im Dokument fehlt der Steckbrief, der Dateiname lautet `linkedin-profil-betrieb`.
- Kaputter gespeicherter Stand: leerer Stand. Ein Ergebnis ohne Text fällt auf das Formular zurück.

## Texte
- Tagline (107 Zeichen): «Füge Headline und Info-Text ein: Punktwert nach festen Regeln, Verbesserungen und drei Headline-Vorschläge.»
- SEO-Title (58): «LinkedIn-Profil Schweiz: Punktwert und Headline-Vorschläge». Meta-Description: siehe content/tools/linkedin-profil.md.
- Erklärtext nach der Lese-Vorlage: Warum das wichtig ist (Headline, Info-Text, Belege, nächster Schritt; ohne Zahlen von aussen), So nutzt du das Ergebnis (fünf Schritte), Häufige Fehler (vier), Beispiel Malerei Keller mit den Zahlen aus dem Rechenbeispiel, Häufige Fragen (sechs), Alperna-Block mit dem Baustein «Social Media».
- Datenhinweis im Formular: Headline, Info-Text, Betrieb, Branche und Zielgruppe gehen an den Server und den KI-Anbieter, nicht die E-Mail-Adresse; der Server speichert sie nicht; Alperna bekommt das Ergebnis mit der Adresse.

## Tests
logic.test.ts: Gewichte (Summe 100, Headline 38, Info-Text 62); jedes Kriterium positiv und negativ an den Grenzen; Rechenbeispiel von Hand (34); Stufen an den Schwellen 39, 40, 69, 70; Verbesserungen (Sortierung, höchstens fünf, Stufentexte, Funde); Vorbefüllung; validate; parseState (früherer Stand, Kürzung, Ausfall, Rundlauf, Fortschritt im Pfad); kiInput; Dokument, eingabeText und Markdown; Sperrliste und Stilregeln aller eigenen Texte.
generator.test.ts: Eingabeschema (Längen, eines von beiden), Ausgabeschema (drei Headlines, Längen), jede Kennung der Prüfung (doppelt, zahl, erfunden, platzhalter, ichbin, floskel) positiv und negativ, gemeinsame Prüfung, Hinweise für den zweiten Versuch, Anweisung.
Tool.test.tsx: Formular und Vorbefüllung, Fehlermeldung, Ladeansicht, Auswertung des Beispiels mit Anfrage und CRM-Aufruf, Neuladen ohne zweiten CRM-Eintrag, Ausfall der KI mit Ergebnis und einem CRM-Eintrag, Neuschreiben nach Ausfall und bei vorhandenem Ergebnis, Angaben ändern, Neu beginnen, Stand einer früheren Fassung.
E2E (tests/e2e/smoke.spec.ts): Einfügen und Auswerten mit gestubbtem /api/generate, Kopieren-Knöpfe, CRM-Eintrag.

## Nicht Teil dieses Werkzeugs
Kein Zugriff auf LinkedIn, kein Auslesen des Profils, kein Scraping. Keine Aussage zu Algorithmen, Reichweite oder Erfolgsquoten. Keine Zahlen von aussen, keine Benchmarks. Keine Bewertung des Inhalts der Texte durch eine KI: Die KI schreibt nur Vorschläge, den Punktwert rechnen feste Regeln. Keine Bewertung von Bild, Banner, Empfehlungen oder Aktivität. Keine Beiträge, Kommentare oder Bildprüfung. Kein Schreiben ins Firmenprofil.
