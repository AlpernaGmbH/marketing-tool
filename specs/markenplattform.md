# Markenplattform (markenplattform)

Klasse B (Generator mit KI, braucht den Server; liest auf Wunsch die Website), Stand 04.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`); Vorbilder: `tools/ideen-aus-website` (Website lesen), `tools/nutzenversprechen` (Formular, «Angaben ändern»), `tools/persona` (Profil schreiben).

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, bei denen mehrere Leute nach aussen schreiben: in rund fünf Minuten eine Markenplattform auf einer Seite (Versprechen, drei bis fünf Werte als Verhalten, Persönlichkeit, Tonalität mit Beispielsatz, Wörter zum Verwenden und Vermeiden, kurze Geschichte, Regeln für Antworten auf Bewertungen), damit Website, Beiträge, Offerten und Antworten auf Google gleich klingen.

## Kategorie und Verknüpfung
Kategorie: strategie (sechster Schritt im Pfad «Strategie», `pathStep.order` 6, nach dem Nutzenversprechen), Zielgruppe: kmu
Liest aus Profil: firma, branche, ort, website (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), positionierung und primaersegment (Hinweiszeile, gehen als Felder mit an die KI)
Schreibt ins Profil: `marke` = { werte (Namen), persoenlichkeit { eigenschaften }, tonalitaet { so, nichtSo, anrede }, woerter { verwenden, vermeiden }, bewertungsregeln }, nur wenn `profile.marke` fehlt oder keine Werte hat (`profilePatch`). Die Grunddaten-Felder schreiben beim Tippen ins Profil, wie beim Marketing-Check.
Verwandte Tools: positionierung, nutzenversprechen, text-umschreiber
`needsServer: true`: die Website geht an `/api/read`, die Angaben an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Markenplattform erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann `ctx.ensureEmail()`. Erst danach läuft das Lesen der Website (wenn angekreuzt) und `useGenerator.generate(input)` (Fenster, Anfrage, Wiederholung bei 403, CRM).
- **403 «gate»:** Bei `/api/read` ruft das Werkzeug `ctx.renewEmail()` und wiederholt einmal; bei `/api/generate` macht das `useGenerator` selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Betrieb, Branche, Ort, Anrede, Wofür, drei Wörter, Nie, Primärsegment, Positionierung, ob die Website gelesen wurde und ihre Überschriften; nicht der Text der Website). Ausgabe = das Dokument als Markdown (`reportMarkdown`).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren ist frei.
- Kein Limit pro Person; Schutz: 10 Abrufe pro Stunde und IP-Hash (`/api/read`), 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`), globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Betriebs an.» | «Firma, Branche, Ort und Website speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 Zeichen | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 Zeichen | – |
| Website | text (`ProfileFieldsForm`) | nur wenn «Website lesen» angekreuzt | Profil `website` | `looksLikeWebsite` (Host mit Punkt, ohne Leerzeichen, nur http/https); der Server prüft mit `normalizeUrl` noch einmal | – |
| Positionierung, Primärsegment | nur Anzeige | nein | Profil `positionierung` (≤ 600), `primaersegment` (≤ 200) | – | «Aus deinem Profil geht mit: …» mit Link zu /profil |
| Wofür steht dein Betrieb? | textarea | ja | – | 20 bis 600 Zeichen | «Zwei bis vier Sätze: …» und Zeichenzähler |
| Drei Wörter, mit denen Kundschaft dich beschreiben soll | text | ja | – | 1 bis 120 Zeichen | «Zum Beispiel: zuverlässig, bodenständig, genau.» |
| Was würdest du nie sagen oder tun? | textarea | nein | – | max. 400 Zeichen | «Zum Beispiel: Rabatte anpreisen, …» und Zeichenzähler |
| Anrede deiner Kundschaft | select («Bitte wählen», Du, Sie) | ja | – | `du` oder `sie`; leer → «Wähle die Anrede: Du oder Sie.» | «So spricht dein Betrieb seine Kundschaft an, …» |
| Website für den heutigen Ton lesen | checkbox | nein | an, wenn Profil `website` eine brauchbare Adresse hat; der Vorschlag gilt, bis die Person die Checkbox anklickt (`websiteLesen` null) | angekreuzt ohne brauchbare Website → Meldung | «Freiwillig. Wir lesen den Text deiner Startseite (bis 4'000 Zeichen) …» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, die drei Antworten und die Anrede, dazu Positionierung und Primärsegment aus dem Profil (wenn vorhanden) und der Text der Startseite (wenn angekreuzt), nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein.»

## Logik
1. **Eingabe prüfen** (`inputProblem(fields, form)`), in dieser Reihenfolge: Firma leer; Wofür unter 20 Zeichen; Wofür über 600; drei Wörter leer; drei Wörter über 120; Nie über 400; Anrede nicht gewählt; Website lesen angekreuzt, aber keine brauchbare Adresse. Meldung in `role="alert"`, kein Aufruf des Servers. Längen nach Bereinigung des Leerraums.
2. **Adresse sicherstellen:** `ctx.ensureEmail()`; bei «Später» passiert nichts weiter.
3. **Website lesen** (nur wenn angekreuzt; `readWebsite(website)` aus `lib/read-client.ts`): `/api/read` liefert `PageRead` (host, title, description, headings bis 20, text bis 8'000 Zeichen). Bei `reason === "gate"`: `renewEmail()` und einmal wiederholen. Jeder andere Fehler bricht nicht ab: Der Entwurf entsteht ohne Website, und über dem Ergebnis steht ein Hinweis mit der Meldung (`message`).
4. **Eingabe für die KI** (`toInput(fields, form, page | null)`): betrieb (≤ 120), branche (≤ 120), ort (≤ 80), positionierung (≤ 600), zielgruppe = Primärsegment (≤ 200), wofuer (≤ 600), woerterKundschaft (≤ 120), nie (≤ 400), anrede, websiteText (Text der Seite, Leerraum bereinigt, auf 4'000 Zeichen gekürzt; ohne Seite leer), headings (≤ 20 à 200; ohne Seite leer). Schema `markenInput` (zod) im Browser und in der Route. Grenzen in `LIMITS` (generator.ts).
5. **Entwurf** (`useGenerator(markenGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Markenplattform eines Schweizer KMU, ruhig und konkret; die Plattform spricht die Inhaberin oder den Inhaber mit Du an, Sätze an die Kundschaft stehen in der gewählten Anrede; Werte als beobachtbares Verhalten statt Schlagwort; keine Superlative; Fakten nur aus den Angaben, sonst Platzhalter; «heutigerTon» nur bei Website-Text, sonst leer; in den Wortlisten keine Wörter aus den Regeln; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zur Marke", input)`. `maxTokens` 1'600, `temperature` 0.5.
6. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): JSON, Schema `markenOutput` (versprechen 30..240; werte 3 bis 5 mit name 3..40 und satz 20..200; persoenlichkeit 3 bis 5 à 3..40; tonalitaet so 40..400, nichtSo 40..400, beispielSatz 20..240; woerter verwenden 5 bis 10 à 1..40, vermeiden 5 bis 10 à 1..40; geschichte 120..600; bewertungsregeln 3 bis 5 à 20..200; heutigerTon 0..400), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkMarke`, in dieser Reihenfolge: bei Anrede «sie» darf im Beispielsatz kein «du», «dich», «dir», «dein» (mit Endungen) stehen (Wortgrenzen, ohne Gross/Klein; `hasDuForm`) → «anrede»; jede Ziffernfolge in irgendeiner Zeichenkette des Entwurfs muss in den Angaben stehen (Betrieb, Branche, Ort, Positionierung, Zielgruppe, Wofür, drei Wörter, Nie, Überschriften, Website-Text; `numbersIn` wie beim Text-Umschreiber) → sonst «zahl». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («zwanzig Jahre») sind erlaubt, nur Ziffern werden geprüft. Annahme: Bei Anrede «du» wird «Sie» nicht geprüft, weil «sie» auch die dritte Person ist; geprüft wird nur der Beispielsatz, weil «so» und die Regeln die Inhaberin mit Du ansprechen dürfen. Annahme: Die Sperrliste gilt auch für die Liste «vermeiden»; die Anweisung sagt der KI darum, dort keine Wörter aus den Regeln zu nennen (sonst «stimme»).
7. **Heutiger Ton nur mit Website** (`normalizeOutput(output, websiteGelesen)`): Ist `input.websiteText` leer, wird `heutigerTon` geleert, bevor der Entwurf gespeichert und ins CRM gegeben wird.
8. **Stand speichern** (`mt:markenplattform`): `{ v: 1, input (ohne websiteText, `storedInput`), output, website }` (`website` = Host der gelesenen Startseite oder leer), erst nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputter Entwurf fällt allein weg, die Eingabe bleibt (für «Angaben ändern»). Das Formular wird aus der Eingabe abgeleitet (`toForm`), Änderungen leben bis zum nächsten Entwurf nur im Arbeitsspeicher.
9. **Profil** (`profilePatch(profile, output, input)`): nur nach einem frisch erzeugten Entwurf, nie beim Wiederherstellen; nur wenn `profile.marke` fehlt oder keine Werte hat (`hatMarke`). Andere Schlüssel in `marke` bleiben.
10. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref; `heutigerTon` schon bereinigt).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Markenplattform» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Zeile «Mit dem Text der Startseite von <host>.» (wenn gelesen), dem Hinweis, wenn die Website nicht gelesen werden konnte, der Liste der Platzhalter (`placeholdersIn`), `DocView` mit den Blöcken des Dokuments (ohne den KI-Satz, `viewBlocks`) und dem Satz, dass Werte, Ton und Wörter im Firmenprofil unter «Marke» stehen, wenn der Entwurf gerade dorthin geschrieben hat.
- Dokument (`toDocument(output, input)`): Titel «Markenplattform», Untertitel «Für <Betrieb>», Facts «Betrieb» (mit Ort) und «Anrede der Kundschaft» (Du/Sie), KI-Hinweis, Abschnitte «Versprechen» (Absatz), «Werte» (Liste «Name: Satz»), «Persönlichkeit» (Absatz mit den Wörtern), «Tonalität» (Facts «So schreiben wir», «So nicht», «Beispielsatz»), «Wörter» (Unterabschnitte «Verwenden» und «Vermeiden» als Listen), «Geschichte» (Absatz), «Antworten auf Bewertungen» (Liste), «Heutiger Ton deiner Website» (Absatz, nur wenn vorhanden). Dateiname `markenplattform-<betrieb>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zeigt das Formular mit der gespeicherten Eingabe über dem Ergebnis; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Eingabe und Entwurf, das Profil bleibt).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Status während der Anfrage mit `role="status"`: «Wir lesen die Startseite von <host>.» und «Die KI schreibt deine Markenplattform.»
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Firma leer: Meldung, kein Aufruf. Branche und Ort leer: gehen leer an die KI. Profil ganz leer: keine Hinweiszeile, Checkbox «Website lesen» aus.
- Anrede nicht gewählt: Meldung. Anrede «sie», aber die KI schreibt den Beispielsatz mit «du»: verworfen (502), Meldung, Formular und Eingaben bleiben.
- Pflichtfeld unter der Mindestlänge oder nur Leerraum: Meldung. Über der Höchstlänge: das Feld begrenzt mit `maxLength`, `toInput` kürzt zusätzlich.
- Website lesen angekreuzt, Adresse unbrauchbar: Meldung vor dem Start. Adresse brauchbar, Lesen schlägt fehl (unreachable, rate, failed, network, 400 vom Server): Entwurf ohne Website, Hinweis über dem Ergebnis, `heutigerTon` leer.
- Website gelesen, aber ohne Text (nur Bilder): `websiteText` leer, `heutigerTon` wird geleert; die Überschriften gehen trotzdem mit.
- Antwort mit Ziffer, die nicht in den Angaben steht, in irgendeinem Feld: verworfen, Meldung, kein CRM-Eintrag. `heutigerTon` gefüllt ohne Website-Text: wird geleert.
- Profil hat schon `marke.werte`: kein Schreiben ins Profil; das Ergebnis bleibt vollständig.
- Cookie fehlt (403 bei /api/read oder /api/generate): Fenster, einmal wiederholen. Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz, Stand bleibt.
- Gespeicherter Stand kaputt oder von einer anderen Version: leerer Stand. Entwurf kaputt, Eingabe gültig: Eingabe bleibt im Formular, kein Ergebnis.
- Keine Daten-Datei: das Werkzeug braucht keine `data/*.json`; die einzigen Zahlen sind Feldgrenzen.

## Texte
- Tagline: «Werte, Ton und Wörter deiner Marke auf einer Seite, damit jeder im Betrieb gleich schreibt.»
- SEO-Title und Meta-Description in `content/tools/markenplattform.md` (Title mit «Schweiz», ≤ 60 Zeichen).
- Keyword «Markenplattform»: in der H1, im ersten Absatz und drei- bis fünfmal insgesamt.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: Versprechen, drei Werte, Tonalität, Wörter, Bewertungsregeln; von Hand geschrieben und so gekennzeichnet), FAQ (6: was eine Markenplattform ist, warum ein kleiner Betrieb eine braucht, was an die KI geht, kein Konto, Website lesen freiwillig, Du oder Sie) und Alperna-Satz (Baustein Social Media): `content/tools/markenplattform.md`.

## Tests
`tools/markenplattform/generator.test.ts` (12 Fälle): beide Schemas mit allen Grenzen, `numbersIn`, `hasDuForm` (auch «Dusche», «Dienstag» als Gegenprobe), `checkMarke` (Zahlen aus Angaben, Überschriften und Website-Text erlaubt; fremde Ziffern in jedem Feld verworfen; «du» im Beispielsatz nur bei Anrede «sie» verworfen), `checkGenerated` (gültige Antwort im Codeblock, fremde Zahl, falsche Anrede, Sperrlisten-Wort, Ausrufezeichen, falsche Form, kein JSON), Prompt ohne Eingaben in der Anweisung.
`tools/markenplattform/logic.test.ts` (20 Fälle): Anreden, `looksLikeWebsite`, `hostOf`, Vorschläge aus dem Profil, `inputProblem` in Reihenfolge, `toInput` ohne und mit Seite (kürzt auf 4'000 Zeichen und 20 Überschriften), `toForm` und `storedInput` als Rundlauf, `eingabeText`, `normalizeOutput`, `toDocument` (alle Abschnitte, ohne heutigen Ton, ohne Eingabe), `viewBlocks`, `reportMarkdown`, `profilePatch` nur bei leerer Marke, `parseState` bei kaputten Daten und als Rundlauf.

## Nicht Teil dieses Tools
- Logo, Farben, Schrift: nur Sprache und Haltung, kein Design.
- Fertige Texte je Kanal: die macht das Nutzenversprechen (Bausteine) und der Text-Umschreiber (Stil).
- Mehrere Seiten der Website lesen: nur die Startseite, wie bei «Ideen aus deiner Website».
- Mehrere Marken oder Zielgruppen in einem Durchlauf: eine Plattform je Betrieb; für eine zweite «Angaben ändern».
- Überschreiben einer bestehenden Marke im Profil: wer schon Werte hat, behält sie; ändern auf /profil.
- Rechtsaussagen (Regel 8): keine.
