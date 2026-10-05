# LinkedIn-Profil-Score (linkedin-profil)

## Nutzen in einem Satz
Für KMU, Selbständige und Vereine, die auf LinkedIn auffindbar sein wollen: acht Fragen zum eigenen Profil, danach ein Punktwert von 0 bis 100, die wichtigsten Verbesserungen in der Reihenfolge ihres Gewichts und drei Headline-Vorschläge zum Kopieren, in etwa fünf Minuten.

Das Werkzeug liest das Profil nicht. LinkedIn lässt sich nicht auslesen, und es gibt keinen Server, keine KI und keinen Zugriff auf LinkedIn. Der Punktwert ist eine Selbsteinschätzung. Gewichte, Stufen und Grenzen sind ein Richtwert von Alperna, keine Statistik und keine Vorgabe von LinkedIn. Das sagen Einleitung, Ergebnis, Dokument und Seitentext offen.

## Kategorie und Verknüpfung
Kategorie: analyse (Pfad «analyse», Schritt 5). Zielgruppe: beide (KMU und Vereine; bei Vereinen steht Kundschaft für Mitglieder, Publikum und Sponsoren). Klasse C: alles im Browser, regelbasiert.
Liest aus Profil: firma, branche (beide über ProfileFieldsForm sichtbar und änderbar), primaersegment (Vorbefüllung der Zielgruppe), positionierung (nur Anzeige im Formular), organisationstyp (Wortlaut der Feldbeschriftungen und Beispiele).
Schreibt ins Profil: nichts (`profilePatch` entfällt).
Verwandte Tools: positionierung, nutzenversprechen, textcheck.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (ProfileFieldsForm) | nein | firma | höchstens 200 Zeichen (Profil) | Wird im Firmenprofil gespeichert |
| Branche | text (ProfileFieldsForm) | nein | branche | höchstens 200 Zeichen (Profil) | Wird im Firmenprofil gespeichert |
| Acht Fragen | single, je drei Antworten (2, 1, 0 Punkte), beste Antwort zuerst | ja, alle acht | nein | jede Frage genau eine Antwort | Antworte so, wie das Profil heute aussieht |
| Profil-Adresse mit Namen | Checkbox | nein (Standard: nein) | nein | Wahrheitswert | Zusatzfrage ohne Gewicht |
| Deine Headline (freiwillig) | text | nein | nein | bis 300 Zeichen eingebbar; Richtwert 220 | Zeichenzähler zeigt «n Zeichen, Richtwert 220» |
| Anfang deines Info-Texts (freiwillig) | textarea | nein | nein | bis 600 Zeichen | Die ersten Sätze genügen |
| Für wen arbeitest du? | text | nein | primaersegment, auf 80 Zeichen am letzten Leerzeichen gekürzt | bis 80 Zeichen | Ein Ausdruck, der nach «Ich helfe» und «für» passt |
| Was erreichen deine Kundinnen und Kunden? | text | nein | nein | bis 80 Zeichen | Kurzer Ausdruck ohne Artikel, der nach «bei» passt |
| Was belegt es? (Zahl, Ort, Referenz; freiwillig) | text | nein | nein | bis 80 Zeichen | Nur, was die Person belegen kann |

Die Positionierung aus dem Profil erscheint als Hinweis im Formular («Die Headline darf sie aufgreifen»). Sie geht weder in den gespeicherten Stand noch ins Dokument noch ins CRM.

### Die acht Fragen, Gewichte (Richtwert von Alperna, Summe 100)
| Nr. | Kurzname | Gewicht | 2 Punkte | 1 Punkt | 0 Punkte |
|---|---|---|---|---|---|
| 1 | Headline | 20 | nennt, wem du wobei hilfst | nur Jobtitel und Firma | nur der Standardtext |
| 2 | Profilbild | 8 | gut erkennbares Gesicht oder Logo, ruhiger Hintergrund | vorhanden, aber unklar | keines |
| 3 | Banner | 8 | eigenes Banner mit Aussage | Standardbild | keines |
| 4 | Info-Text | 18 | beginnt mit dem Nutzen für die Kundschaft | beginnt mit dem Lebenslauf | leer |
| 5 | Im Fokus | 10 | mehrere Verlinkungen (Beispiele, Angebote, Referenzen) | eine Verlinkung | nichts verlinkt |
| 6 | Erfahrung | 14 | Stationen mit Ergebnissen | nur Titel und Daten | unvollständig oder leer |
| 7 | Empfehlungen | 8 | drei oder mehr | eine oder zwei | keine |
| 8 | Aktivität | 14 | regelmässig Beiträge oder Kommentare | selten | gar nicht |

Bereichsnamen von LinkedIn: Nur «Im Fokus» ist in der Frage genannt (Quelle: Hilfeseite «Bereich Im Fokus Ihres Profils» auf linkedin.com/help, abgerufen am 05.10.2026). Alle anderen Fragen beschreiben die Sache allgemein.

## Logik
Annahme: Gewichte, Stufen, Richtwert für die Headline-Länge (220), die ersten 210 Zeichen des Info-Texts und die Satzlänge (25 Wörter, wie im Textcheck) sind ein Richtwert von Alperna, ohne Quelle, im UI als Richtwert gekennzeichnet.

1. **Punktwert** = Summe über alle Fragen von Gewicht × (Punkte / 2), auf ganze Zahlen gerundet. Alle Gewichte sind gerade, darum ist jede Summe schon ganzzahlig. Alles 0 ergibt 0, alles 2 ergibt 100, alles 1 ergibt 50. Unbeantwortete Fragen zählen 0 (die Oberfläche verlangt alle acht).
2. **Stufe** (Richtwert): 0 bis 39 «Ausbaufähig», 40 bis 69 «Solide Basis», 70 bis 100 «Stark». Gerundet wird vorher; NaN und negative Werte gelten als 0, Werte über 100 als «Stark». ScoreBadge wird nicht verwendet, weil seine Stufenwörter und Schwellen (stark ab 75, ausbaufähig ab 40) anders sind als diese; das Ergebnis zeigt eine eigene Anzeige mit `role="meter"`.
3. **Verbesserungen.** Je Frage ist der offene Anteil Gewicht × (2 − Punkte) / 2. Die Fragen mit offenen Punkten werden absteigend sortiert, bei Gleichstand gilt die Reihenfolge der Fragen; die ersten fünf kommen in die Liste, je mit den Texten «Was fehlt» und «So geht es» für die gewählte Stufe (0 oder 1 Punkt). Danach folgen die Funde aus den eingefügten Texten, zuletzt der Hinweis auf die Profil-Adresse, wenn die Checkbox nicht gesetzt ist. Die Texte nennen keine Zahlen von aussen.
4. **Funde** (nur wenn Text da ist; ändern den Punktwert nie; jeder Fund nennt die Stelle, was auffällt und einen Satz Vorschlag):
   - Headline über 220 Zeichen (Richtwert; die Plattform ändert die Grenze).
   - Headline ohne Verb aus einer Liste (helfe, unterstütze, schaffe, bringe, mache, begleite, baue und weitere Formen, nur als ganzes Wort) und ohne Ziffer: «nennt vermutlich nur einen Titel».
   - Floskeln aus data/floskeln.json (Regelsatz des Textchecks, `findingsOf`) in der Headline und im Info-Text.
   - Info-Text beginnt mit «Ich bin» oder «Mein Name»: Der Nutzen gehört nach vorn.
   - Die ersten 210 Zeichen des Info-Texts enthalten keines der Wörter du, dich, dir, dein-, Sie (gross), Kundschaft, Kunde, Kundin, Kunden, Kundinnen, Betriebe, KMU, Vereine, Mitglieder, Publikum, Sponsoren. Heuristik, kein Urteil über den Inhalt.
   - Sätze über 25 Wörter im Info-Text (`LONG_SENTENCE_WORDS` aus dem Textcheck).
5. **Headline-Vorschläge** nur aus den Wörtern der Person, wenn Zielgruppe und Ergebnis da sind; sonst steht ein Hinweis, welches Feld fehlt (kein Fehler):
   1. «Ich helfe {Zielgruppe} bei {Ergebnis} – {Beweis}»
   2. «{Ergebnis} für {Zielgruppe}: {Firma, sonst Branche}»
   3. «{Zielgruppe}: {Ergebnis}. {Beweis}»
   Ohne Beweis entfällt der Beweisteil mit seinem Trenner; ohne Firma und Branche entfällt der Doppelpunkt-Teil in Muster 2. Jeder Teil geht durch `typoCH`, wird von Satzzeichen am Rand befreit und beim Zusammensetzen von doppelten Satzzeichen, doppelten Leerzeichen und doppeltem Gedankenstrich bereinigt. Muster 2 und 3 beginnen gross, im dritten Muster auch der Beweis. Mehr als 220 Zeichen werden am letzten Leerzeichen gekürzt und als «gekürzt» gemeldet. Das Werkzeug beugt kein Wort; ein Hinweis fordert die Person auf, Fall und Grammatik zu prüfen.
6. **Stand** unter `mt:linkedin-profil`: `{ v: 1, phase: "edit" | "result", antworten, urlAngepasst, headline, about, zielgruppe, ergebnis, beweis, firma, branche, output? }`. `firma` und `branche` sind eine Momentaufnahme aus dem Profil beim Auswerten, damit das Ergebnis stabil bleibt. `output` ist `{ score, stufe }` und wird beim Lesen neu berechnet. Ein Ergebnis gibt es nur bei acht gültigen Antworten; sonst gilt `phase: "edit"`. `phase: "result"` genügt lib/progress.ts.

### Rechenbeispiel (Malerei Keller, Gossau)
Antworten: Headline 1, Profilbild 2, Banner 1, Info-Text 1, Im Fokus 0, Erfahrung 1, Empfehlungen 1, Aktivität 0; Adresse nicht angepasst.
Punktwert = 10 + 8 + 4 + 9 + 0 + 7 + 4 + 0 = 42, Stufe «Solide Basis». Offene Punkte: Aktivität 14, Headline 10, Im Fokus 10, Info-Text 9, Erfahrung 7, Banner 4, Empfehlungen 4 (zusammen 58). Die Liste nennt die ersten fünf. Eingefügt: Headline «Malermeister bei Malerei Keller» (Fund: weder Verb noch Zahl) und ein Info-Text, der mit «Ich bin» beginnt und in den ersten 210 Zeichen nichts über die Kundschaft sagt (zwei Funde). Zielgruppe «Familien in Gossau», Ergebnis «Fassadenanstrich und Farbberatung», Beleg «Referenzen in Gossau, Flawil und Herisau»: Muster 1 hat 109 Zeichen, Muster 2 72, Muster 3 95.

## Ausgaben
- Ergebnis am Bildschirm (ResultCard «Dein LinkedIn-Profil-Score»): Punktwert mit Stufe und Anzeige (`role="meter"`, Name «LinkedIn-Profil-Score»), Selbsteinschätzungs-Hinweis, Tabelle Frage | Antwort | Punkte | Gewicht, Verbesserungen (nummeriert), Headline-Vorschläge als Liste (`aria-label="Headline-Vorschläge"`) mit einem Knopf «Vorschlag n kopieren» je Eintrag, drei Hinweise.
- Text kopieren (Markdown des Dokuments), PDF und Word über DocumentExport (Download nach der E-Mail-Adresse, `guardDownload`).
- CRM (`sendResult`): `eingabe` = eine Zeile je Angabe: Betrieb, Branche, die acht Antworten («Headline: Nur Jobtitel und Firma (1 von 2)»), «Profil-Adresse mit Namen: ja/nein», eingefügte Headline, eingefügter Anfang des Info-Texts, Zielgruppe, Ergebnis, Beleg. `ausgabe` = Markdown des Dokuments; der Server kürzt auf 1'900 Zeichen, darum stehen Punktwert und Tabelle oben.
- Das Ergebnis erscheint erst nach dem E-Mail-Fenster; «Später» lässt das Formular stehen.

## Edge Cases
- Leere oder widersprüchliche Eingaben: Fehlen Antworten, steht in `role="alert"`, welche (Kurznamen), und es gibt weder Ergebnis noch CRM-Eintrag. Alle Texte sind freiwillig; ohne Texte entfallen die Funde, ohne Zielgruppe oder Ergebnis die Vorschläge (Hinweis statt Fehler).
- Extremwerte: alles 0 (Punktwert 0, fünf Verbesserungen), alles 2 (100, keine Verbesserung, Hinweis «Du hast bei allen acht Fragen die volle Punktzahl»). Headline mit genau 220 Zeichen löst den Fund nicht aus, mit 221 schon. Teile von 80 Zeichen ergeben Vorschläge über 220 Zeichen, die gekürzt werden. Satz mit genau 25 Wörtern löst nichts aus.
- Profil leer: Zielgruppe bleibt leer, Firma und Branche sind leer, im Dokument steht «Alperna» im Kopf, der Dateiname lautet `linkedin-profil-betrieb`.
- Profil mit langem primaersegment: auf 80 Zeichen am letzten Leerzeichen gekürzt; eine getippte Zielgruppe wird nie überschrieben.
- Kaputter gespeicherter Stand: leerer Stand. Ein Ergebnis mit weniger als acht Antworten fällt auf das Formular zurück.
- Daten-Datei: Es gibt keine eigene Datei mit Zahlen. data/floskeln.json (Textcheck) liefert die Floskeln; fällt ein Muster dort weg, fehlt nur dieser Fund.

## Texte
- Tagline (102 Zeichen): «Acht Fragen zu deinem LinkedIn-Profil: Punktwert, priorisierte Verbesserungen und Headline-Vorschläge.»
- SEO-Title (46): «LinkedIn-Profil Schweiz: Punktwert in 8 Fragen». Meta-Description (143): siehe content/tools/linkedin-profil.md.
- Erklärtext: Warum das wichtig ist (Headline, Info-Text, Belege, Aktivität; ohne Zahlen von aussen), So nutzt du das Ergebnis (fünf Schritte), Häufige Fehler (vier), Beispiel Malerei Keller mit den Zahlen aus dem Rechenbeispiel, Häufige Fragen (sechs), Alperna-Block mit dem Baustein «Social Media».
- FAQ: Liest das Werkzeug mein Profil? Woher kommen die Gewichte? Wie lang darf die Headline sein? Brauche ich ein Konto? Was bekommt Alperna? Was bleibt in meinem Browser?
- Alperna-CTA-Satz: Ein gepflegtes Profil und regelmässige Beiträge auf LinkedIn brauchen Zeit, die im Betrieb oft fehlt (Baustein Social Media, Beweis aus content/pitch/bausteine.md).

## Tests
logic.test.ts (73 Fälle): Gewichte und Fragenkatalog; Punktwert an den Rändern, gemischt, gewichtet, alle 6'561 Kombinationen; Stufen an den Schwellen 39, 40, 69, 70; Verbesserungen (Sortierung, Gleichstand, höchstens fünf, Stufentexte, Funde, Adress-Hinweis); Funde je positiv und negativ (Länge 220 und 221, Titel ohne Verb, Verb als ganzes Wort, Floskeln, «Ich bin», keine Aussage zur Kundschaft, lange Sätze); Headline-Muster mit und ohne Beweis, Firma, Branche, Kürzung, doppelte Satzzeichen, Typografie, Grossschreibung; Vorbefüllung; validate; parseState bei kaputten Daten und Rundlauf; Fortschritt im Pfad; Dokument, eingabeText und Markdown; Sperrliste und Stilregeln aller eigenen Texte.
Tool.test.tsx (11 Fälle): Formular und Vorbefüllung, Fehlermeldungen, Auswertung des Beispiels mit CRM-Aufruf, Speichern und Neuladen ohne zweiten CRM-Eintrag, Hinweis ohne Vorschläge, E-Mail-Fenster und «Später», Zwischenstand, «Neu beginnen», zu lange Headline, Sperrliste im gerenderten Text.

## Nicht Teil dieses Tools
Kein Zugriff auf LinkedIn, kein Auslesen des Profils, kein Scraping, keine KI, kein Server. Keine Aussage zu Algorithmen, Reichweite oder Erfolgsquoten. Keine Zahlen von aussen, keine Benchmarks. Keine Bewertung des Inhalts von Texten (nur Form und Wortwahl nach festen Regeln). Keine Beugung von Wörtern in den Headline-Vorschlägen. Keine Beiträge, Kommentare, Banner-Gestaltung oder Bildprüfung. Kein Schreiben ins Firmenprofil.
