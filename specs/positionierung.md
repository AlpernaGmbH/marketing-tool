# Positionierungs-Check (positionierung)

Klasse A/B (regelbasierter Check im Browser, danach Entwurf mit KI über den Server), Stand 04.10.2026. Liest die Startseite über `/api/read` (`lib/read-client.ts`, Vorbild `tools/ideen-aus-website`), prüft den Text mit reinen Funktionen in `logic.ts` (Floskeln über `analyzeText` aus `tools/textcheck/logic.ts` und `data/floskeln.json`) und holt den Entwurf über den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`, `generator.ts`). `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, deren Startseite nicht sagt, für wen der Betrieb da ist und was ihn unterscheidet: in rund vier Minuten eine Punktzahl 0 bis 100 mit sechs Funden zur Positionierung auf der Startseite, dazu ein Entwurf (Kernsatz, für wen, was anders, Beweise, drei Varianten, Streichliste, nächster Schritt), den eine KI aus dem Website-Text und zwei freiwilligen Angaben schreibt.

## Kategorie und Verknüpfung
Kategorie: strategie (vierter Schritt im Pfad «Strategie», `pathStep.order` 4, zwischen Persona und Nutzenversprechen), Zielgruppe: kmu
Liest aus Profil: firma, website, ort, kanton (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), branche (eigenes Textfeld, schreibt beim Tippen ins Profil)
Schreibt ins Profil: positionierung (= Kernsatz des Entwurfs), nur wenn das Feld leer ist (`profilePatch`)
Verwandte Tools: icp-builder, persona, digitaler-auftritt-check
`needsServer: true`: die Website-Adresse geht an `/api/read`, die Angaben mit dem Website-Text an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Positionierung prüfen» prüft das Werkzeug die Eingabe (`inputProblem`: Website Pflicht), dann `ctx.ensureEmail()`, dann die drei Schritte «Website lesen», «Text prüfen», «Entwurf schreiben» (Fortschritt mit `role="status"`).
- **Website lesen:** `readWebsite(website)`; bei `reason === "gate"` erst `ctx.renewEmail()`, dann einmal wiederholen; jeder andere Fehler als Meldung in `role="alert"`, das Formular bleibt.
- **Text prüfen:** `checkPositionierung(page.text, { ort, kanton, firma })` im Browser, sofort. Der Check steht unter `mt:positionierung`, sobald er da ist; der Entwurf kommt dazu.
- **Entwurf:** `useGenerator(positionierungGenerator).generate(input)` macht Fenster, Anfrage, Wiederholung bei 403 und den CRM-Eintrag selbst. Eingabe = `eingabeText` (Website, Betrieb, Branche, Ort, Kanton, Titel, Überschriften, die zwei freiwilligen Felder; nicht der Seitentext), Ausgabe = `reportMarkdown(check, output, angaben)` (Check und Entwurf als Markdown).
- **Schlägt nur der Entwurf fehl,** bleibt der Check stehen, und der Knopf «Entwurf noch einmal versuchen» erscheint. In diesem Fall schickt das Werkzeug den Check einmal selbst ins CRM (`ctx.sendResult` mit dem Check-Markdown, `checkSentRef`). Gelingt der Entwurf später, geht er über `useGenerator` als zweites Ergebnis ins CRM.
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren ist frei.
- Kein Limit pro Person; Schutz sind 10 Abrufe pro Stunde und IP-Hash (`/api/read`), 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | nein | Profil `firma` | max. 120 Zeichen an die KI; leer → der Host gilt als Betrieb | «Die Website ist Pflicht; der Check liest nur ihre Startseite. Firma, Website, Ort, Kanton und Branche speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Website | text (`ProfileFieldsForm`) | ja | Profil `website` | `looksLikeWebsite`: ein Host mit Punkt, ohne Leerzeichen, höchstens 300 Zeichen; leer → «Gib die Adresse deiner Website an …»; sonst → «Das sieht nicht nach einer Website-Adresse aus.» Der Server prüft mit `normalizeUrl` noch einmal | Platzhalter «malerei-keller.ch» |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 Zeichen | – |
| Kanton | select (`ProfileFieldsForm`) | nein | Profil `kanton` | Kürzel; an die KI und in den Check geht der Name («St. Gallen») | – |
| Branche | text | nein | Profil `branche` | max. 120 Zeichen | «Zum Beispiel Malerei, Treuhand oder Physiotherapie.» |
| Was dich wirklich unterscheidet | textarea | nein | – | max. 600 Zeichen (`maxLength`, `toInput` kürzt zusätzlich) | «Zum Beispiel: «Wir machen nur Fassaden, keine Innenräume, und sind in zwei Wochen fertig.» Bis 600 Zeichen.» |
| Beweise, die du hast | textarea | nein | – | max. 600 Zeichen | «Jahre, Zahlen, Referenzen, Ausbildungen, Mitgliedschaften. Was hier nicht steht, erfindet die KI nicht; sie setzt Platzhalter. Bis 600 Zeichen.» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, Kanton, der Text der Startseite (bis 6'000 Zeichen), die Funde des Checks und die beiden freiwilligen Felder, nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein.»

## Logik
Teil 1, Check (`checkPositionierung(text, context)` in `logic.ts`, reine Funktionen, Text auf 20'000 Zeichen gekürzt). Sechs Gruppen mit Gewichten (Summe 100). **Alle Gewichte und Schwellen sind Richtwerte dieses Werkzeugs, keine Statistik** (`RICHTWERT_HINWEIS` im Ergebnis und im Dokument):

| Gruppe | Gewicht | Prüfung | Punkte |
|---|---|---|---|
| Für wen (`zielgruppe`) | 20 | «für» plus bis drei Wörter plus eine Gruppe aus einer festen Liste (Hausbesitzer, Familien, KMU, Vereine, Gemeinden, Praxen, Architekten, Verwaltungen …) oder «richtet sich an», «wir arbeiten für», «speziell für». «Für alle», «für jeden», «für jedes Budget», «für Private und Firmen» zählt als breit | konkret 20 · nur breit 5 · nichts 0 |
| Unterscheidung | 20 | «anders als», «im Unterschied», «im Gegensatz», «einzig», «als einzige», «nur bei uns», «Spezialist für», «spezialisiert auf», «was uns unterscheidet», «Fokus auf», «konzentrieren uns auf», «ausschliesslich», «statt wie andere» | vorhanden 20 · nichts 0 |
| Beweise | 20 | Jahreszahlen mit «seit» oder «gegründet», «seit n Jahren», «in n-ter Generation», Zahlen mit Einheit (Projekte, Kunden, Mitarbeitende, Lernende, Jahre, Objekte, Bewertungen, Standorte …), Referenzen, Kundenstimmen, Bewertungen, Zertifikate, ISO, Minergie, Meisterbetrieb, eidg. Diplom, Fachausweis, «Mitglied bei», Auszeichnungen, Garantie, Lehrbetrieb. Überlappende Stellen zählen einmal | ab 2 Belege 20 · 1 Beleg 10 · 0 Belege 0 |
| Kundenperspektive (`kunde`) | 15 | Sätze ab 3 Wörtern (Satzzeichen oder Zeilenumbruch trennen). Kundensatz: enthält «du/dich/dir/dein» oder «Sie/Ihnen/Ihr» (gross geschrieben) und beginnt nicht mit «Wir»/«Unser». Wir-Satz: alle anderen mit «wir/uns/unser». Anteil = Kundensätze ÷ (Kundensätze + Wir-Sätze) | Anteil ≥ 50 % 15 · ≥ 30 % 8 · darunter 0 · keine Anrede 0 |
| Ort und Region | 15 | Ort aus dem Profil, Name des Kantons aus dem Profil, alle 26 Kantonsnamen (`KANTONE`), eine feste Liste von Regionen und Städten (Ostschweiz, Appenzellerland, Fürstenland, Rheintal, Toggenburg, Bodensee, Zürcher Oberland, Winterthur, Wil, Herisau …), Postleitzahl mit Ortsname als Ganzes («9200 Gossau», «CH-8000 Zürich»; Zahlen von 1900 bis 2099 zählen nur mit «CH-»). «St. Gallen» auch als «St.Gallen» und «Sankt Gallen» | vorhanden 15 · nur «Schweiz» 5 · nichts 0 |
| Floskeln | 10 | `analyzeText` aus dem Textcheck, Funde der Art «floskel» (`data/floskeln.json`, 39 redaktionelle Muster von Alperna), Summe aller Stellen | 0 Floskeln 10 · 1 bis 2 Floskeln 5 · ab 3 Floskeln 0 · kein lesbarer Text 0 |

Punktzahl = Summe der Punkte, auf 0 bis 100 begrenzt; Stufe über `scoreBand` (`lib/score.ts`: ab 75 «stark», ab 40 «ausbaufähig», darunter «Handlungsbedarf»). Jeder Fund trägt `id` («gruppe-befund»), `titel`, `status` (gut, teil, fehlt), `punkte`, `max`, `hinweis` und bis vier `beispiele` (Stellen mit 24 Zeichen Umgebung, bei der Kundenperspektive die ersten Sätze). Kennzahlen: Wörter, Sätze, Wir-Sätze, Kundensätze, Anteil (null ohne Anrede), Belege, Floskeln, Lesbarkeit nach Amstad aus dem Textcheck (null unter 30 Wörtern).
Annahme: Die Zielgruppen- und Regionenlisten sind redaktionell (ohne Quelle) und auf Ostschweizer KMU zugeschnitten; was nicht in der Liste steht, erkennt der Check nicht. Annahme: Die Kundenperspektive zählt Pronomen, nicht Sinn; ein Satz wie «Wir beraten Sie» gilt als Wir-Satz, weil er mit dem Betrieb beginnt.

Teil 2, Entwurf (`generator.ts`):
1. **Eingabe** (`toInput(profile, form, page, check)`): betrieb (Firma, sonst Host, ≤ 120), branche (≤ 120), ort (≤ 80), kanton (Name, ≤ 40), host (≤ 200), title (≤ 200), headings (≤ 20 à 200, leere weg), text (≤ 6'000 Zeichen der Startseite), funde (`fundeKurz`: nur Gruppen mit Status teil oder fehlt als «Titel (Punkte von Max): Hinweis», ≤ 12 à 160), unterscheidung und beweise (≤ 600). Schema `positionierungInput` (zod) im Browser und in der Route; kein `.default()`, kein `.transform()`.
2. **Entwurf** (`useGenerator`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Positionierung eines Schweizer KMU aus Website-Text und Angaben; für wen, was, was anders; konkret, belegbar, aus Kundensicht; keine Superlative, keine Eigenschaftswörter ohne Beleg; Beweise nur aus den Angaben, sonst Platzhalter in eckigen Klammern; Ort und Region nennen, sonst [Ort]; drei Varianten mit den Stilen kurz (höchstens zwölf Wörter), konkret (Ort und ein Beleg), persoenlich (Ich- oder Wir-Form), jeder Stil genau einmal; Streichliste als Zitate oder Muster, ohne Wörter, die die KI selbst nicht verwenden darf; nächster Schritt mit Stelle und Satz; Ziffern nur aus den Angaben; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben, Website-Text und Funde des Checks", input)`. `maxTokens` 1'400, `temperature` 0.4.
3. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): Schema `positionierungOutput` (kernsatz 30..200, fuerWen 20..240, wasAnders 40..400, beweise 2 bis 5 à 10..200, varianten genau 3 mit stil aus kurz | konkret | persoenlich und satz 20..220, streichen 2 bis 6 à 2..200, naechsterSchritt 30..300), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkPositionierungOutput`: die drei Stile müssen verschieden sein → sonst «varianten»; jede Ziffernfolge in irgendeiner Zeichenkette muss in den Angaben stehen (Betrieb, Branche, Ort, Kanton, Host, Titel, Überschriften, Website-Text, Funde, die zwei Felder; `numbersIn` wie bei «Ideen aus deiner Website») → sonst «zahl». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («zwanzig Jahre») sind erlaubt, nur Ziffern werden geprüft.
4. **Profil schreiben** (`profilePatch(profile, output)`): positionierung = kernsatz, nur wenn das Feld leer ist. Über `useProfile().update`.
5. **Stand speichern** (`mt:positionierung`): `{ v: 1, form: { unterscheidung, beweise }, input (ohne Website-Text, `stripText`), check, output }`. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten oder falscher Version den leeren Stand; das Formular bleibt, wenn nur Check oder Eingabe kaputt sind (dann kein Ergebnis); ein kaputter Entwurf fällt allein weg. Der Website-Text liegt nur im Arbeitsspeicher (`lastInputRef`); «Entwurf noch einmal versuchen» nach dem Neuladen liest die Seite darum erneut.
6. **CRM:** macht `useGenerator` nach dem Entwurf; den Check allein schickt das Werkzeug nur, wenn der Entwurf scheitert (siehe Zugang).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Positionierung» mit `ScoreBadge` (Beschriftung «Positionierung auf der Startseite»), dem Satz «Aus der Startseite von <host> («<Titel>»).» und dem Richtwert-Hinweis, vier Kennzahlen (Wörter, Sätze an die Kundschaft als «1 von 6 (17 %)», Belege, Floskeln), der Liste der Funde nach Gruppen (`aria-label` «Funde nach Gruppen»: Titel, «Punkte von Max · gut/zum Teil/fehlt», Hinweis, Beispiele), dann «Dein Entwurf»: der Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», die Liste der Platzhalter (`placeholdersIn`), `DocView` mit Kernsatz, Für wen, Was anders ist, Beweise, Drei Varianten (Kurz, Konkret, Persönlich), Streichen, Nächster Schritt. Fehlt der Entwurf: Meldung oder Hinweis und der Knopf «Entwurf noch einmal versuchen».
- Dokument (`toDocument(check, output | null, angaben)`): Titel «Positionierungs-Check», Untertitel «Startseite von <host>», Facts Website, Betrieb, Branche, Ort; «Positionierung auf der Startseite: n von 100 (Stufe)» mit Richtwert-Hinweis, je Fund eine Überschrift «Titel: Punkte von Max», Hinweis und Beispiele, «Kennzahlen» als Facts (mit Lesbarkeit nach Amstad); mit Entwurf dazu «Dein Entwurf» mit KI-Hinweis und allen Abschnitten. Dateiname `positionierung-<host>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zurück zum Formular, die zwei Felder und das Profil bleiben), «Neu beginnen» (löscht auch die zwei Felder; das Profil bleibt).
- Fokus auf die Ergebnis-Überschrift, sobald der Check da ist, nicht beim Wiederherstellen.
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Website leer oder ohne Punkt: Meldung, kein Aufruf, kein Fenster.
- Website nicht erreichbar, gesperrte Adresse, Fehlerseite, Ratenbegrenzung, Netz: ruhiger Satz aus `READ_FAIL_MESSAGES` (oder die Meldung des Servers), das Formular bleibt, nichts geht ins CRM.
- Startseite ohne lesbaren Text (alles im Bild): Punktzahl 0, Fund «Die Startseite hat keinen lesbaren Text», Kennzahlen 0, Lesbarkeit null; der Entwurf wird trotzdem versucht (die KI bekommt Titel, Überschriften und die Angaben).
- Firma leer: der Host gilt als Betrieb. Ort und Kanton leer: der Check sucht nur Kantonsnamen, Regionen und Postleitzahlen; die KI setzt [Ort].
- Text länger als 20'000 Zeichen: der Check nimmt die ersten 20'000; die KI bekommt 6'000. 20'000 Zeichen Müll (nur «x», nur Satzzeichen, Wiederholungen) laufen in unter 1,5 Sekunden (getestet).
- Jahreszahl vor einem grossen Wort («Seit 1985 Malerei») ist keine Postleitzahl; «CH-1985 Ort» wäre eine.
- «Für alle Hausbesitzer»: konkret zählt mehr als breit.
- Antwort mit fremder Ziffer, doppeltem Stil, Ausrufezeichen, Sperrwort oder falscher Form: verworfen, Meldung, Check bleibt stehen, Knopf «Entwurf noch einmal versuchen», der Check geht einmal allein ins CRM.
- Cookie fehlt (403) beim Lesen oder beim Entwurf: Fenster, einmal wiederholen.
- Profil hat schon eine Positionierung: bleibt unverändert.
- Gespeicherter Stand kaputt oder falsche Version: leerer Stand. Check gültig, Entwurf kaputt: Ergebnis mit Check und dem Knopf für den Entwurf.
- Keine Daten-Datei nötig ausser `data/floskeln.json` (über den Textcheck); fehlt ein Muster dort, fällt es einzeln weg.

## Texte
- Tagline: «Prüft, ob deine Startseite sagt, für wen du da bist und was dich unterscheidet, und schreibt den Entwurf.»
- SEO-Title: «Positionierungs-Check Schweiz: Startseite prüfen, kostenlos»; Meta-Description in `content/tools/positionierung.md`.
- Keyword «Positionierung»: in der H1 («Positionierungs-Check für Schweizer KMU»), im ersten Absatz und drei- bis fünfmal insgesamt.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: die Funde und die Punktzahl 55 von 100 sind mit `checkPositionierung` aus einem Beispieltext gerechnet und in `logic.test.ts` festgehalten; der Entwurf ist von Hand geschrieben und so gekennzeichnet), FAQ (7: was Positionierung heisst, was der Check sieht, wie die Punktzahl entsteht, was an die KI geht, kein Konto, ob die KI Beweise erfindet, Kosten) und Alperna-Satz (Baustein Website): `content/tools/positionierung.md`.

## Tests
`tools/positionierung/generator.test.ts` (Eingabe- und Ausgabeschema mit allen Grenzen, `numbersIn`, `checkPositionierungOutput` lässt Zahlen von der Website, aus den Beweisen und Platzhalter durch und verwirft fremde Ziffern in jedem Feld sowie doppelte Stile, `checkGenerated` mit gültiger Antwort im Codeblock, fremder Zahl, doppeltem Stil, Ausrufezeichen, Sperrwort, falscher Form und ohne JSON, Prompt ohne Eingaben in der Anweisung; 11 Fälle) und `logic.test.ts` (Gewichte, jede der sechs Gruppen positiv und negativ an kleinen Texten, Punktzahl 0 und 100, das Beispiel aus dem Seitentext mit 55, 20'000 Zeichen Müll unter 1,5 Sekunden, `fundeKurz`, `inputProblem`, `hostOf`, `toInput` mit Kürzung und Host als Betrieb, `stripText`, `eingabeText`, `toDocument` mit und ohne Entwurf, `reportMarkdown`, `profilePatch` nur bei leerem Feld, `parseState` bei kaputten Daten und als Rundlauf; 26 Fälle). 37 Fälle gesamt. Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx`, `lib/read-client.test.ts` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Unterseiten, «Über uns» oder Leistungsseiten: nur die Startseite, weil dort die Positionierung stehen muss.
- Vergleich mit Mitbewerbern: macht der Wettbewerbsvergleich (Technik und Auftritt), nicht der Text.
- Branchen-Benchmarks oder Durchschnittswerte für die Punktzahl (keine Quelle, Harte Regel 7); Gewichte und Schwellen sind gekennzeichnete Richtwerte.
- Ein Nutzenversprechen in drei Längen und Textbausteine je Kanal: macht das Werkzeug «Nutzenversprechen», das die Positionierung aus dem Profil liest.
- Umschreiben der ganzen Startseite: der Entwurf nennt den nächsten Schritt; den Text bringt der Text-Umschreiber in Form.
- Vereine: das Werkzeug spricht von Kundschaft und Aufträgen.
- Rechtsaussagen (Regel 8): keine.
