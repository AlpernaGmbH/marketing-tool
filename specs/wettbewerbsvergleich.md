# Wettbewerbsvergleich (wettbewerbsvergleich)

Klasse A (Analyse mit Server), Etappe 3, Welle 1, Stand 04.10.2026. Nutzt die Prüf-Engine des Marketing-Checks (`lib/check/`, Route `/api/check`) unverändert: Jede Website läuft durch dieselbe Prüfung wie im Digitaler-Auftritt-Check, nacheinander, und die Punkte stehen in einer Tabelle nebeneinander.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von Schweizer KMU: die eigene Website und ein bis drei Mitbewerber eingeben und in rund einer halben Minute sehen, wo der eigene Auftritt im Netz vorne liegt, wo die anderen vorne liegen und welche Schritte zuerst dran sind.

## Kategorie und Verknüpfung
Kategorie: analyse (zweiter Schritt im Pfad «Analyse»)
Liest aus Profil: firma, website, ort (live über `ProfileFieldsForm`), branche (Vorschlag für die Branchenwahl)
Schreibt ins Profil: nichts (Firma, Website und Ort pflegt das Formular selbst, wie im Check)
Verwandte Tools: digitaler-auftritt-check, reifegrad-check, positionierung
`needsServer: true`: die Adressen gehen an `/api/check`.

## Eingaben

| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| firma | text (Profil) | nein | Profil | fehlt sie, steht der Host als Name | Name im Export und im CRM |
| website | text (Profil) | ja | Profil | `normalizeHost`: ergänzt https, lehnt IP-Adressen, Zugangsdaten und fremde Protokolle ab, verlangt einen Punkt im Host | «Deine Website: …» bei Fehlern |
| ort | text (Profil) | nein | Profil | keine | geht als `city` mit (Suche nach dem Google-Profil, nur mit Schlüssel) |
| industry | single | ja | `guessIndustry(profil.branche)` | eine der 12 Branchen des Checks | gilt für alle Websites, sonst wären die Gewichte verschieden |
| Mitbewerber 1 bis 3 | text | mindestens einer | nur dieses Werkzeug (`mt:wettbewerbsvergleich`) | wie website; keine doppelten Hosts; nicht gleich der eigene Host; höchstens drei | «Betriebe aus deiner Region mit derselben Kundschaft» |

Hosts werden kleingeschrieben und ohne «www.» verglichen; `keller.ch` und `https://www.keller.ch/` sind dieselbe Website.

## Ablauf (Zugang v3)
1. Beim Klick «Vergleichen»: `validate(profile, form)` prüft die Eingaben (Meldung in `role="alert"`). Dann `ctx.ensureEmail()`; schliesst die Person das Fenster, bleibt das Formular stehen.
2. Für jede Website nacheinander (eigene zuerst) `runCheck({ company, city, industry, website, socials: {} }, onStep)`. `company` ist bei der eigenen Website die Firma (sonst der Host), bei den Mitbewerbern der Host. `socials: {}` für alle, damit die Social-Media-Punkte für alle gleich entstehen (nur aus Links auf der Startseite).
3. Fortschritt: `role="status"` mit «2 von 4: konkurrenz.ch läuft (SEO und Technik prüfen)», Balken mit `aria-valuenow`, Liste der Websites mit Zustand wartet / läuft / fertig / nicht erreichbar.
4. Antwortet der Server mit `gate` (403): `ctx.renewEmail()`, bei neuer Adresse wird diese Website einmal wiederholt. Schliesst die Person das Fenster, bricht der Vergleich ab, das Formular bleibt.
5. `rate_limited` (429): Abbruch mit der Meldung, dass das Limit bei 8 Prüfungen pro Stunde liegt und jede Website als eine zählt (Grenze aus `app/api/check/route.ts`, Tatsache dieses Dienstes, keine Statistik).
6. `unreachable`, `blocked`, `invalid`, `failed`: die Website steht in der Liste als «nicht erreichbar» mit der Meldung des Servers; der Vergleich läuft mit den übrigen weiter. Scheitern alle Websites, gibt es kein Ergebnis, nur eine Meldung.
7. Ergebnis als kompakte Zusammenfassung unter `mt:wettbewerbsvergleich` (`phase: "result"`, damit der Pfad-Fortschritt funktioniert). Danach `ctx.sendResult({ eingabe, ausgabe })`: Eingabe «Website: …», «Mitbewerber: …», «Branche: …»; Ausgabe `toMarkdown(toDocument(result))`.
8. «Neu vergleichen» setzt auf das Formular zurück; die Mitbewerber-Adressen bleiben im Formular stehen.

## Logik
- **Zusammenfassung je Website** (`summarize`): Host, Name, `score` (0 bis 100), je Bereich `{id, title, score (0 bis 100, gerundet), weight, verified?}`; bei der eigenen Website zusätzlich die ersten fünf Massnahmen `{itemId, titel, wirkung, aufwand}`. Kein ganzes `CheckResult` (zu gross für den Browser-Speicher und das CRM). Bei Ausfall `{score: null, categories: [], error}`.
- **Vergleich** (`compare`): nur Bereiche mit `weight > 0` aus dem eigenen Ergebnis. Je Bereich der beste Wert unter den erreichbaren Mitbewerbern; `delta = eigene Punkte − beste Mitbewerber-Punkte`. `delta > 0` → «Wo du vorne liegst», `delta < 0` → «Wo die anderen vorne liegen», `delta = 0` → Gleichstand. Sortierung nach Grösse des Abstands. Ohne eigenes Ergebnis oder ohne erreichbaren Mitbewerber gibt es keinen Vergleich, die Tabelle steht trotzdem.
- **Tabelle**: Zeile «Gesamt» und je Bereich mit Gewicht; Spalten: eigene Website zuerst («host (du)»), dann die Mitbewerber. Ausgefallene Websites stehen mit «nicht erreichbar» in jeder Zelle.
- **Schritte**: bis fünf Massnahmen aus dem eigenen Ergebnis mit Wirkung und Aufwand (Einschätzung von Alperna, keine Statistik). Die Massnahmen entstehen in `lib/check/massnahmen.ts`, hier wird nichts hinzuerfunden.
- Annahme: Die Branche der Person gilt für alle Websites. Ohne Quelle, im Ergebnis genannt («Was der Vergleich sieht und was nicht»).
- Annahme: `city` der Person geht bei allen Websites mit. Ohne `GOOGLE_PLACES_API_KEY` hat das keine Wirkung (der Bereich Google-Profil bleibt «nicht bestätigt»).

## Ausgaben
- Ergebnis am Bildschirm: `ScoreBadge` für die eigene Website, dann das `DocumentModel` über `DocView` (Steckbrief, Tabelle, Vorsprung, Rückstand, Gleichstand, Schritte, Hinweise). Bildschirm und Export zeigen dieselben Blöcke.
- Kopieren (frei): Markdown aus dem DocumentModel.
- Export (sobald eine Adresse bekannt ist, sonst erst das Fenster): PDF und Word.
- Kasten «Was der Vergleich sieht und was nicht»: nur Startseiten; Social Media nur aus Links, Häufigkeit unbekannt; Google-Profil ohne Schlüssel nicht bestätigt; Wirkung und Aufwand sind Einschätzungen; Mitbewerber-Seiten werden je einmal abgerufen (Kennung AlpernaCheck), es bleiben nur Adresse und Punkte.

## Edge Cases
- Eigene Website leer oder ungültig: Meldung «Deine Website: …», nichts läuft.
- Kein Mitbewerber: Meldung. Mehr als drei: Meldung (das Formular hat nur drei Felder, `validate` prüft trotzdem).
- Doppelte Hosts (auch mit www oder https): Meldung mit der Nummer des Feldes. Mitbewerber gleich eigene Website: Meldung.
- Branche leer und keine Branche im Profil: Meldung.
- Eine Website nicht erreichbar: bleibt in der Tabelle als «nicht erreichbar», Vergleich mit den übrigen.
- Eigene Website nicht erreichbar: Tabelle mit Mitbewerbern, keine Vorsprung-Liste, keine Schritte, Satz dazu.
- Alle Websites nicht erreichbar: Meldung, kein Ergebnis, nichts geht ins CRM.
- Gate verloren (403): Fenster, einmal wiederholen. Ratenlimit (429): Abbruch mit Erklärung.
- Kaputter oder fremder Zwischenstand (Fragebogen-Format, fehlende Felder, falsche Typen): Start mit leerem Formular; gültige Mitbewerber-Adressen im Formular bleiben.
- Profil leer: Firma fällt auf den Host zurück, Website ist Pflicht und wird gemeldet.

## Texte
- Tagline: «Deine Website gegen bis zu drei Mitbewerber: Punkte je Bereich, wo du vorne liegst und was du zuerst angehst.»
- SEO-Title: «Wettbewerbsvergleich Schweiz: Website gegen Mitbewerber»; Description siehe `content/tools/wettbewerbsvergleich.md`.
- Seitentext nach Lese-Vorlage, Beispiel Malerei Keller, Gossau gegen zwei fiktive Malerbetriebe (Beispielwerte des Werkzeugs, keine Statistik).
- Alperna-Pitch: Baustein «Website», Beweis `@baustein`.

## Tests
`tools/wettbewerbsvergleich/logic.test.ts`: Host-Normalisierung (Protokolle, IP, www, Zugangsdaten), `validate` (leer, kein Mitbewerber, doppelt, gleich eigene, mehr als drei, ungültig, Branche), `summarize` mit `sampleResult`, `compare` (vorne, hinten, Gleichstand, nur Gewicht > 0, ohne Mitbewerber), `toDocument` und Markdown (alle Websites und Bereiche, «nicht erreichbar», ohne «undefined»), `parseState` bei Müll und bei gültigen Daten, `eingabeText`.

## Nicht Teil dieses Tools
- Keine KI-Einordnung (die Einordnung des Checks gilt für ein Ergebnis mit Signatur; für vier Ergebnisse gäbe es vier Anfragen und das Tageslimit wäre schnell erreicht). Kann später über `/api/ai` mit einem eigenen Fakten-JSON folgen.
- Keine Social-Media-Angaben der Person: Für die Mitbewerber sind sie unbekannt, darum zählen für alle nur die Links auf der Startseite.
- Kein Abruf von Unterseiten, kein PageSpeed, kein Auslesen von Google, Instagram, LinkedIn oder TikTok.
- Keine Prüfung der robots.txt vor dem Abruf fremder Startseiten (die Engine liest die robots.txt nur als Prüfpunkt). Offen in PLAN.md, Punkt 7 «Schutz».
- Kein Zwischenspeicher je Domain; jede Website wird je Vergleich einmal abgerufen.
