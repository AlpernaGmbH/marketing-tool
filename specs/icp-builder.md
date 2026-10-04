# ICP-Builder (icp-builder)

Klasse B (Generator mit KI, braucht den Server), Stand 04.10.2026. Zweites Werkzeug mit dem Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`). Kein Fragebogen: ein Formular mit Grunddaten aus dem Profil und fünf eigenen Feldern. `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, die zu viele unpassende Anfragen beantworten: in rund fünf Minuten ein Idealkundenprofil (ICP) aus fünf Angaben, mit Merkmalen, Kaufanlässen, Einwänden, Signalen und einer Punktekarte, mit der sie jede neue Anfrage in einer Minute einordnen.

## Kategorie und Verknüpfung
Kategorie: strategie (zweiter Schritt im Pfad «Strategie», nach dem Marketing-Check), Zielgruppe: kmu
Liest aus Profil: firma, branche, ort, kanton, groesse (Grunddaten über `ProfileFieldsForm`; nichts davon wird erneut gefragt, Harte Regel 10)
Schreibt ins Profil: zielgruppen (`[{ name: segmentName, beschreibung }]`) und primaersegment (`segmentName`), beide nur, wenn das Feld leer ist (`profilePatch`, Vorbild Marketing-Check)
Verwandte Tools: persona, positionierung, digitaler-auftritt-check
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Profil erstellen» prüft das Werkzeug die Eingaben (`formProblem`), dann macht `useGenerator.generate(input)` den Rest: `ctx.ensureEmail()`, Anfrage an `/api/generate`, bei 403 «gate» `ctx.renewEmail()` und einmal wiederholen, danach `ctx.sendResult`.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText(input)` (Betrieb, Branche, Ort, Kanton, Grösse und die fünf Angaben, eine je Zeile). Ausgabe = `reportMarkdown(output, input)` (das Dokument als Markdown, Punktekarte als Tabelle).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`).
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen an die KI | «Firma, Branche, Ort, Kanton und Grösse speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 120 | – |
| Kanton | select (`ProfileFieldsForm`) | nein | Profil `kanton` | Kürzel; an die KI geht der Name («St. Gallen») | – |
| Grösse | select (`ProfileFieldsForm`) | nein | Profil `groesse` | Wert; an die KI geht der Label-Text («1 bis 9 Mitarbeitende») | – |
| Was bietest du an? | textarea | ja | – | 20 bis 800 Zeichen | «Leistungen, Produkte, Besonderheiten. Zwei bis fünf Sätze reichen.» |
| Wer sind heute deine besten Kunden, und warum? | textarea | ja | – | 20 bis 800 Zeichen | «Die Kunden, bei denen die Arbeit am besten läuft: Wer sind sie, was zeichnet sie aus, warum arbeiten sie mit dir?» |
| Einzugsgebiet | text | nein | Vorschlag aus Ort und Kanton (`einzugsgebietVorschlag`, zum Beispiel «Gossau und Umgebung, Kanton St. Gallen») als Platzhalter; leer gelassen geht der Vorschlag an die KI | max. 120 | «Leer gelassen nehmen wir: <Vorschlag>.» |
| Typischer Auftrag oder Projektgrösse | text | nein | – | max. 200 | «Zum Beispiel: Fassade eines Einfamilienhauses, CHF 15'000.- bis 40'000.-» |
| Woran erkennst du Anfragen, die nicht passen? | textarea | nein | – | max. 600 | «Zum Beispiel: nur der Preis zählt, zu weit weg, Generalunternehmer dazwischen.» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, Kanton, Grösse und die fünf Angaben, nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein.»

## Logik
1. **Eingabe prüfen** (`formProblem`): Firma leer → «Gib den Namen deines Betriebs an.»; Angebot oder beste Kunden kürzer als 20 Zeichen (nach Trim) oder länger als 800 → Meldung mit der Grenze; Einzugsgebiet über 120, Auftrag über 200, nicht passende Anfragen über 600 → Meldung. Meldung in `role="alert"`, kein Aufruf des Servers.
2. **Eingabe für die KI** (`toInput`): betrieb = Firma; branche, ort; kanton = Name des Kantons aus dem Kürzel (`KANTONE`); groesse = Label-Text aus `GROESSEN` (unbekannte Werte bleiben wie sie sind); angebot, besteKunden, einzugsgebiet (leer → `einzugsgebietVorschlag(ort, kanton)`), auftrag, nichtPassend. Leerraum bereinigt, Längen auf die Grenzen gekürzt. Schema `icpInput` (zod) im Browser und in der Route.
3. **Entwurf** (`useGenerator(icpGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Idealkundenprofil für ein Schweizer KMU aus den Angaben, aus der Sicht des Betriebs, konkret; Punktekarte als sechs bis acht Kriterien mit 1 bis 3 Punkten je nach Gewicht, nicht alle gleich; Ziffern nur aus den Angaben, fehlende Beträge als Platzhalter; keine Ziffern in Kriterium und Begründung; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zum Betrieb", input)`. `maxTokens` 1'400, `temperature` 0.4.
4. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): Schema `icpOutput` (segmentName 5..60; beschreibung 80..500; merkmale 4..7, ausloeser 3..5, einwaende 2..4, signale 3..6, nichtIdeal 2..4, je Strings 10..160; punktekarte 6..8 mit kriterium 5..90, punkte ganze Zahl 1..3, warum 10..160), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkIcp`: jede Ziffernfolge in allen Texten (auch «kriterium» und «warum») muss in den Angaben stehen (`numbersIn` wie bei «Ideen aus deiner Website») → sonst «zahl»; Summe der Punkte höchstens 24 → sonst «punkte». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («zwei Lehrlinge») sind erlaubt, nur Ziffern werden geprüft. Annahme: Die Punkte der Punktekarte sind Zahlen im JSON und zählen nicht als Ziffern im Text.
   Hinweis: Mit höchstens acht Kriterien zu je drei Punkten ist die Summe 24 schon durch das Schema gedeckt; die Prüfung bleibt als zweite Sicherung, falls die Grenzen später steigen.
5. **Punktekarte im Browser** (`logic.ts`): `maxPunkte(output)` = Summe der Punkte. `bewerten(output, angekreuzt)` zählt die Punkte der angekreuzten Kriterien, rechnet den Anteil und ordnet ein: unter 50 % «passt eher nicht», 50 bis 79 % «passt», ab 80 % «passt sehr gut» (`BEWERTUNG`; Richtwert von Alperna, keine Statistik; im UI und im Dokument so gekennzeichnet). Grenzen mit ganzen Zahlen gerechnet (punkte × 100 gegen max × 50 bzw. max × 80), damit keine Rundung die Stufe verschiebt. Die Kreuze leben nur im Browser und werden nicht gespeichert.
6. **Profil schreiben** (`profilePatch(profile, output)`): zielgruppen = `[{ name: segmentName, beschreibung }]`, wenn `zielgruppen` leer; primaersegment = segmentName, wenn leer. Über `useProfile().update`.
7. **Stand speichern** (`mt:icp-builder`): `{ v: 1, input, output }`. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten den leeren Stand; ein kaputtes `input` nimmt das `output` mit (ohne Angaben kein Dokument), ein kaputtes `output` fällt allein weg. Der Entwurf im Formular lebt im Arbeitsspeicher, bis «Profil erstellen» ihn speichert.
8. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown`).

## Ausgaben
- Ergebnis: `ResultCard` «Dein Idealkundenprofil» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Liste der Platzhalter (`placeholdersIn`), `DocView` des Dokuments und darunter dem Kasten «Anfrage bewerten»: ein Kästchen je Kriterium mit den Punkten, die Summe «x von y Punkten (z %)» und die Einordnung in Worten (`role="status"`), Knopf «Kreuze löschen».
- Dokument (`toDocument(output, input)`): Titel «Idealkundenprofil», Untertitel = segmentName, Facts Betrieb, Branche, Einzugsgebiet; KI-Hinweis; Überschrift mit dem Segment und die Beschreibung; «Wer sie sind» (merkmale), «Wann sie kaufen» (ausloeser), «Was sie zögern lässt» (einwaende), «Woran du eine passende Anfrage erkennst» (signale), «Anfragen, die nicht passen» (nichtIdeal), je als Liste; «Punktekarte: neue Anfragen bewerten» als Tabelle Kriterium | Punkte | Warum; Hinweis zur Bewertung mit den Grenzen und der Kennzeichnung als Richtwert. Dateiname `icp-<betrieb>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (Formular mit den Werten des Entwurfs, Ergebnis bleibt bis zum nächsten Entwurf), «Neu beginnen» (löscht Angaben und Ergebnis).
- Fortschritt mit `role="status"`: «Die KI schreibt dein Idealkundenprofil.»
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Firma leer (Profil leer): Meldung, kein Aufruf. Branche, Ort, Kanton, Grösse leer: gehen leer an die KI, Einzugsgebiet bleibt leer, wenn auch das Feld leer ist.
- Angebot oder beste Kunden nur Leerzeichen oder unter 20 Zeichen: Meldung. Über 800 Zeichen: Meldung (das Feld begrenzt zusätzlich mit `maxLength`).
- Einzugsgebiet leer: Vorschlag aus Ort und Kanton; ohne beides leer.
- Antwort mit Ziffer, die nicht in den Angaben steht (auch in «warum»): verworfen, Meldung, kein CRM-Eintrag. Beträge aus «auftrag» (zum Beispiel 15'000) darf die KI nennen.
- Antwort mit Punkten ausserhalb 1..3, mit Kommazahl oder mit weniger als sechs Kriterien: Schema, verworfen.
- Alle Kriterien angekreuzt: 100 %, «passt sehr gut». Keines: 0 %, «passt eher nicht». Summe 0 (nur theoretisch): 0 %, «passt eher nicht».
- Profil hat schon zielgruppen oder primaersegment: bleibt unverändert.
- Platzhalter «[Betrag]» oder «[Region]»: erlaubt, Liste über dem Entwurf.
- Cookie fehlt (403): Fenster, einmal wiederholen (macht `useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz, Formular bleibt.
- Gespeicherter Stand kaputt oder falsche Version: leerer Stand.

## Texte
- Tagline: «Dein Idealkunde aus fünf Angaben, mit Punktekarte zum Bewerten neuer Anfragen.»
- SEO-Title: «ICP-Builder Schweiz: Idealkundenprofil mit Punktekarte»; Meta-Description in `content/tools/icp-builder.md`.
- Keyword «Idealkundenprofil»: im Title, im ersten Absatz und in den Fragen. Die H1 ist mit «ICP-Builder für Schweizer KMU» vorgegeben und enthält das Keyword nicht wörtlich (wie bei «Ideen aus deiner Website»).
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit einem von Hand geschriebenen Profil und einer Punktekarte mit 16 Punkten; die zwei Bewertungen im Beispiel sind mit `bewerten` gerechnet und in `logic.test.ts` festgehalten), FAQ (6) und Alperna-Satz (Baustein Website): `content/tools/icp-builder.md`.

## Tests
`tools/icp-builder/generator.test.ts` (Schemas mit Grenzen, `numbersIn`, `checkIcp` verwirft fremde Ziffern auch in «warum» und Summen über 24 und lässt Zahlen aus den Angaben und Platzhalter durch, `checkGenerated` mit gültiger und ungültiger Antwort, Prompt ohne Eingaben in der Anweisung) und `logic.test.ts` (`maxPunkte`, `bewerten` an allen Grenzen, `formProblem`, `toInput` mit Vorschlag und Labels, `eingabeText`, `toDocument` mit Tabelle und allen Abschnitten, `reportMarkdown`, `profilePatch` nur bei leeren Feldern, `parseState` bei kaputten Daten, das Beispiel aus dem Seitentext). Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Mehrere Segmente: ein Profil je Durchlauf. Wer zwei Zielgruppen hat, macht zwei Durchläufe und behält die bessere im Profil.
- Persona mit Namen, Alltag und Zitaten: macht der Persona-Generator aus dem Segment.
- Gespeicherte Bewertungen einzelner Anfragen oder eine Liste von Anfragen: die Kreuze leben nur im Browser und verschwinden beim Neuladen.
- Branchen-Benchmarks oder Marktgrössen (keine Quelle, Harte Regel 7).
- Vereine: eigene Werkzeuge; dieses Werkzeug spricht von Kundschaft und Aufträgen.
- Rechtsaussagen (Regel 8): keine.
