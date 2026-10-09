# Content-Strategie (inhalte-strategie)

Klasse B (Generator über /api/generate). Dach über «Content-Säulen», «Posting-Plan» und «Kanalstrategie»: Es ersetzt sie nicht, es verbindet sie.

## Nutzen in einem Satz
Für Schweizer KMU und Vereine: ein Dokument von zwei bis drei Seiten, das festhält, wofür der Inhalt da ist, für wen, in welchen Themen, auf welchem Kanal mit welcher Rolle, in welchem Rhythmus und woran man merkt, ob es wirkt, dazu ein Plan für 90 Tage, in rund fünf Minuten.

## Kategorie und Verknüpfung
Kategorie: content (Pfad «content», Schritt 14), audience beide.
Liest aus Profil: organisationstyp, firma, branche, ort (Grunddaten, über ProfileFieldsForm), positionierung und marke.tonalitaet (gehen als Hintergrund mit, nie erneut gefragt), primaersegment (Vorbelegung «Hauptzielgruppe»), kanaele (Vorbelegung der Kanäle), contentSaeulen (Vorbelegung der Säulen).
Schreibt ins Profil: contentSaeulen, nur wenn das Feld dort leer ist, als `{ name, beschreibung: rolle }`.
Verwandte Werkzeuge: inhalte-saeulen, posting-plan, kanalstrategie (das Werkzeug «kanalstrategie» entsteht parallel; der Eintrag in `related` ist erlaubt, unbekannte Slugs werden übersprungen).

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| organisationstyp, firma, branche, ort | ProfileFieldsForm | firma | ja (sind Profilfelder) | firma 1 bis 120, branche 120, ort 80 | Speichern wir im Firmenprofil, im Browser. |
| ziel | single (Radios) | ja | nein | anfragen, bekanntheit, bindung, fachkraefte | «Wofür soll dein Inhalt da sein?» Labels je Typ (unten). |
| angebot | text | ja | nein | 20 bis 800 Zeichen | Leistungen wie auf einer Offerte, dazu die häufigsten Fragen der Kundschaft. |
| besonders | text | nein | nein | bis 400 | Was euch von anderen im Ort unterscheidet. |
| zielgruppe | text | nein | profil.primaersegment | bis 200 | Wer zuerst angesprochen werden soll. |
| saeulen | 0 bis 5 Textfelder «Säule n» | nein | Namen aus profil.contentSaeulen | je 3 bis 40, keine Doppel (ohne Gross/Klein), nur 0 oder 3 bis 5 Einträge | Leer lassen: die KI schlägt 3 bis 5 vor. Link auf /tools/inhalte-saeulen. |
| kanaele | multi | ja, mindestens einer | profil.kanaele, sonst Instagram und Google-Beitrag | Instagram, Facebook, LinkedIn, Google-Beitrag, Newsletter, Website | |
| beitraegeProWoche | single (Select) | ja | nein | 1, 2, 3, 5 | Lieber tief ansetzen und halten. |

Ziel-Labels: Betrieb «Anfragen und Aufträge», «Bekanntheit in der Region», «Stammkundschaft binden», «Fachkräfte und Lernende finden»; Verein «Mitglieder gewinnen», «Anlässe füllen», «Sponsoren finden», «Freiwillige finden» (in dieser Reihenfolge die Werte anfragen, bekanntheit, bindung, fachkraefte).

An die KI gehen: Betrieb, Typ, Branche, Ort, Ziel (als Label), Angebot, Besonderes, Hauptzielgruppe, Säulen, Kanäle (als Namen), Beiträge pro Woche und, falls im Profil vorhanden, Positionierung (bis 600) und Tonalität (bis 200). Nie die E-Mail-Adresse, nicht das ganze Profil. Die Seite sagt das vor dem Knopf.

## Logik
1. `inputProblem(profile, form)` meldet das erste Problem in der Reihenfolge des Formulars (Meldung und Feld für den Fokus). `toInput` baut daraus die Eingabe: Leerraum bereinigt, auf die Grenzen gekürzt, Kanäle in fester Reihenfolge, Säulen ohne leere Felder. Die Vorbelegungen aus dem Profil gelten, solange die Person ein Feld nicht angefasst hat (Harte Regel 10).
2. Die Route /api/generate prüft Eingabe und Antwort mit den Schemas aus `generator.ts`. Die Anweisung verlangt: Säulen aus den Angaben übernehmen (gleiche Namen) oder 3 bis 5 vorschlagen; Kanalrollen genau für die gewählten Kanäle; plan90 mit genau drei Monaten (Monat 1 baut auf, Monat 2 wiederholt und verbessert, Monat 3 prüft und passt an); Messung ohne erfundene Zahlen; keine Rechts- oder Datenschutzaussagen; keine Ziffer, die nicht in den Angaben steht.
3. Eigene Prüfung `checkStrategie` (Codes in dieser Reihenfolge):
   - `kanal`: ein Kanal in kanalrollen ist nicht gewählt (Vergleich über die klein geschriebenen Labels, ohne Bindestrich und Leerzeichen), oder ein gewählter Kanal fehlt oder kommt doppelt vor.
   - `saeule`: sind Säulen angegeben, stimmen die Namen in der Ausgabe in Anzahl und Schreibweise überein (Vergleich klein).
   - `plan`: plan90 hat nicht «Monat 1», «Monat 2», «Monat 3» in dieser Reihenfolge.
   - `rhythmus`: der Satz nennt die Zahl der Beiträge pro Woche nicht (Ziffer oder Zahlwort).
   - `zahl`: eine Ziffer in einem Text der Antwort steht nicht in den Angaben (die Zahl der Beiträge zählt zu den Angaben; das Feld `monat` ist ausgenommen).
   - `sperrliste`: ein Text trifft eine harte Regel der Sperrliste (`brandHits`).
   Dazu läuft vor der eigenen Prüfung die allgemeine Prüfung des Kerns (Schema, Ausrufezeichen, «jetzt», Links, Sperrliste) und führt zu `stimme`, `regel`, `link`.
4. Das Ergebnis wird als Dokument (`toDocument`) angezeigt und exportiert, als Markdown (`reportMarkdown`) fürs CRM kopiert. `profilePatch` schreibt die Säulen ins Profil, wenn dort noch keine stehen.
5. Annahme: Die Richtwerte für Messgrössen legt die Person selbst fest. Das Werkzeug nennt keine Benchmarks und keine Vergleichszahlen (Harte Regel 7).

## Ausgaben
Am Bildschirm (ResultCard «Deine Content-Strategie», DocView): Fakten (Betrieb, Ziel, Kanäle, Beiträge pro Woche), Kernbotschaft, Ziele und Messgrössen (Tabelle), Zielgruppen, Themen, Rollen der Kanäle (Tabelle Kanal, Rolle, Formate), Rhythmus, Die ersten 90 Tage (drei Absätze mit Liste), Woran ihr merkt, ob es wirkt, Das lassen wir weg. Hinweis, dass die KI Entwürfe schreibt und die Person prüft; Platzhalter in eckigen Klammern als Liste über dem Entwurf. Kopieren frei; PDF und Word über `DocumentExport` (E-Mail-Adresse nötig). Links «Säulen vertiefen» (/tools/inhalte-saeulen) und «Plan nach Zeitbudget» (/tools/posting-plan); «Angaben ändern», «Neu beginnen».

CRM: `eingabe` ist je Zeile «Frage: Antwort» (Betrieb zuerst), `ausgabe` das Markdown des Dokuments. Stand unter `mt:inhalte-strategie`: `{ v: 1, phase: "form" | "result", input, output }`; mit Ergebnis steht `phase: "result"`, damit der Pfad-Fortschritt es als erledigt zählt.

## Edge Cases
- Keine Säulen angegeben: die KI schlägt drei bis fünf vor, das Profil bekommt sie, wenn dort noch keine stehen.
- Ein oder zwei Säulen angegeben: Meldung «Gib drei bis fünf Säulen an oder lass alle Felder leer.» (die Antwort verlangt mindestens drei Säulen).
- Zwei Säulen heissen gleich (ohne Gross/Klein): Meldung am zweiten Feld.
- Profil leer: nur Firma, Angebot, Ziel, Kanäle und Beiträge sind nötig; Branche, Ort, Positionierung, Tonalität und Zielgruppe bleiben leer und gehen als leere Zeichenkette mit.
- Profil mit Kanälen, die nicht in der Liste stehen (TikTok): nicht vorbelegt; sind keine erkannt, gelten Instagram und Google-Beitrag.
- Verein: Labels der Ziele, Texte und Anweisung mit «wir» und Vereinsbegriffen.
- Kaputter Stand unter `mt:inhalte-strategie`: leerer Stand. Gültige Eingabe mit kaputtem Ergebnis: Formular mit den Angaben.
- 403 «gate» der Route: Fenster erneut, Anfrage einmal wiederholen (useGenerator). Andere Fehler: ruhiger Satz, Formular bleibt, kein CRM-Eintrag.
- Die KI liefert «90 Tage», «Monat 1» im Text oder eine Jahreszahl: `zahl`, zweiter Versuch mit Rückmeldung.

## Texte
- Tagline (≤ 110): «Wofür dein Inhalt da ist, welche Themen und Kanäle er braucht und was in den ersten 90 Tagen passiert.»
- SEO-Title: «Content-Strategie Schweiz: Plan für die ersten 90 Tage» (≤ 60), Description ≤ 155.
- Seitentext: 350 bis 700 Wörter nach Lese-Vorlage, Beispiel «Malerei Keller, Gossau» von Hand geschrieben (ausdrücklich keine Ausgabe der KI).
- FAQ: Unterschied zu Content-Säulen und Posting-Plan, was geht an die KI, kann die KI Fehler machen, Konto, Vereine, wie oft aktualisieren (alle drei Monate, Richtwert von Alperna).
- Alperna: Baustein «Social Media», `beweis: @baustein`.

## Tests
- `generator.test.ts`: Schemagrenzen von Eingabe und Ausgabe, jeder Code der Prüfung positiv und negativ, Reihenfolge der Codes, gültige Antwort über `checkGenerated`, Säulen mit und ohne Angabe, Ziffernprüfung mit der Zahl der Beiträge, Anweisung ohne Eingaben, Nutzernachricht als Daten.
- `logic.test.ts`: Labels, Vorbelegung aus dem Profil (Kanäle, Säulen, Zielgruppe), `inputProblem`, `toInput`, `eingabeText`, `toDocument`, `profilePatch` nur bei leerem Feld, `parseState` bei kaputten Daten, Vereinsbegriffe.
- `Tool.test.tsx`: Formular mit Vorbelegung, Fehlermeldungen mit Fokus, gemockter /api/generate, Ergebnis, CRM, Stand, Profil, Neuladen, «Angaben ändern», «Neu beginnen», Fehlerfälle der Route (403 gate, 429, 502).

## Nicht Teil dieses Werkzeugs
- Keine Beiträge, keine Captions, kein Kalender (dafür «Post-Generator», «Caption-Baukasten», «Content-Kalender»).
- Keine Zahlenziele und keine Benchmarks: Die Messgrössen sind in Worten, die Richtwerte legt die Person fest.
- Keine Website-Analyse und keine Wettbewerbsbeobachtung.
- Kein Budget- und Zeitplan (dafür «Posting-Plan nach Zeitbudget»).
