# Nutzenversprechen (nutzenversprechen)

Klasse B (Generator mit KI, braucht den Server), Stand 04.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`) nach dem Vorbild `tools/ideen-aus-website`. `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, die auf der Startseite nicht sagen, was die Kundschaft von ihnen hat: in rund vier Minuten ein Nutzenversprechen in drei Längen (ein Satz, zwei Sätze, ein Absatz), dazu drei bis fünf Punkte «Du bekommst …», die Beweise aus den eigenen Angaben und fünf fertige Textbausteine (Website-Titel, Website-Untertitel, Google-Beschreibung, Instagram-Bio, Telefonsatz).

## Kategorie und Verknüpfung
Kategorie: strategie (fünfter Schritt im Pfad «Strategie», `pathStep.order` 5), Zielgruppe: kmu
Liest aus Profil: firma, branche, ort (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), primaersegment und zielgruppen (Vorschlag für «Für wen?»), positionierung (Hinweiszeile, geht als Hintergrund mit an die KI)
Schreibt ins Profil: nichts (`writesProfile: []`). Die Grunddaten-Felder schreiben beim Tippen in das Profil, wie beim Marketing-Check.
Verwandte Tools: positionierung, icp-builder, text-umschreiber
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Nutzenversprechen erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Betrieb, Branche, Ort, Für wen, Angebot, Problem, Ergebnis, Beweise, Positionierung, je eine Zeile). Ausgabe = das Dokument als Markdown (`reportMarkdown`).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren und die Kopieren-Knöpfe je Baustein sind frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Betriebs an.» | «Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 Zeichen | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 Zeichen; leer → die KI setzt [Ort] | – |
| Für wen? | text | ja | `primaersegment`, sonst `zielgruppen[0].name` (`zielgruppeVorschlag`); der Vorschlag gilt, bis die Person tippt | 1 bis 200 Zeichen | «Vorschlag aus deinem Firmenprofil.» (nur bei Vorschlag) «Zum Beispiel «Hausbesitzer in der Region Gossau» …» |
| Was bietest du an? | textarea | ja | – | 20 bis 600 Zeichen | «Leistungen oder Produkte, so konkret wie auf einer Offerte. …» |
| Welches Problem löst du für diese Kundschaft? | textarea | ja | – | 20 bis 600 Zeichen | «Was die Leute vorher ärgert oder fehlt. …» |
| Was hat die Kundschaft danach? | textarea | ja | – | 10 bis 400 Zeichen | «Das Ergebnis, nicht die Arbeit. …» |
| Beweise (freiwillig) | textarea | nein | – | max. 600 Zeichen | «Jahre im Geschäft, Referenzen, Garantie, Zahl der Projekte. Nur, was stimmt; was fehlt, bleibt ein Platzhalter.» |
| Positionierung | nur Anzeige | nein | Profil `positionierung` | max. 600 Zeichen an die KI | «Deine Positionierung aus dem Profil: «…». Sie geht als Hintergrund mit an die KI.» mit Link zu /profil |

Jede Textarea zeigt «n von max Zeichen, mindestens min» (`charCount`, je Zeichen). Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, die Angaben (und die Positionierung, wenn vorhanden), nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein.»

## Logik
1. **Eingabe prüfen** (`inputProblem(fields, values)`), in dieser Reihenfolge: Firma leer → Meldung; Zielgruppe leer → Meldung; Angebot unter 20 Zeichen → Meldung; Problem unter 20 → Meldung; Ergebnis unter 10 → Meldung; Beweise über 600 → Meldung. Meldung in `role="alert"`, kein Aufruf des Servers. Längen nach `clip` (Leerraum bereinigt, getrimmt).
2. **Eingabe für die KI** (`toInput(profile, values)`): betrieb (≤ 120), branche (≤ 120), ort (≤ 80), zielgruppe (≤ 200), angebot (≤ 600), problem (≤ 600), ergebnis (≤ 400), beweise (≤ 600), positionierung (≤ 600). Mehrfache Leerzeichen werden eins, Zeilenumbrüche bleiben. Schema `nutzenInput` (zod) im Browser und in der Route.
3. **Entwurf** (`useGenerator(nutzenGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Nutzenversprechen eines Schweizer KMU aus den Angaben, aus Kundensicht, konkret, ohne Superlative, Ort und Region nennen (sonst [Ort]), Ziffern nur aus den Angaben, die Längen je Feld, «nutzen» beginnt mit «Du bekommst» oder «Du hast», «beweise» nur aus den Angaben, sonst genau ein Platzhalter, Bausteine je Kanal mit Zweck und Länge, Positionierung als Hintergrund; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zum Angebot", input)`. `maxTokens` 1'300, `temperature` 0.5.
4. **Prüfung der Antwort** (`checkGenerated` in der Route und Schema im Browser): JSON, Schema `nutzenOutput` (kurz 20..90, mittel 60..220, lang 150..600, nutzen 3 bis 5 à 10..160, beweise 1 bis 4 à 10..200, bausteine: websiteTitel 20..70, websiteUntertitel 40..160, googleBeschreibung 100..750, instagramBio 30..150, einSatzAmTelefon 30..200), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkNutzen`: jede Ziffernfolge in irgendeiner Zeichenkette des Entwurfs muss in den Angaben stehen (`numbersIn`, wie beim Text-Umschreiber: Listenmarken und Trennzeichen fallen weg) → sonst «zahl»; die Google-Beschreibung höchstens 750 Zeichen (je Zeichen gezählt) → sonst «google». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («zwanzig Jahre») sind erlaubt, nur Ziffern werden geprüft (wie beim Text-Umschreiber). Annahme: 750 Zeichen ist die Feldgrenze der Beschreibung im Google-Unternehmensprofil (Quelle: die Angabe im Profil selbst, keine Statistik); im UI «Feldgrenze bei Google».
5. **Stand speichern** (`mt:nutzenversprechen`): `{ v: 1, input, output }`, erst nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputter Entwurf fällt allein weg, die Eingabe bleibt (für «Angaben ändern»).
6. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref).

## Ausgaben
- Ergebnis: `ResultCard` «Dein Nutzenversprechen» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Liste der Platzhalter (`placeholdersIn`), `DocView` mit den Blöcken des Dokuments (ohne den KI-Satz, `viewBlocks`) und dem Kasten «Bausteine kopieren»: je Baustein ein `CopyButton` («Website-Titel kopieren», «Website-Untertitel kopieren», «Google-Beschreibung kopieren», «Instagram-Bio kopieren», «Telefonsatz kopieren») mit «n von max Zeichen» daneben, bei Google mit dem Zusatz «Feldgrenze bei Google».
- Dokument (`toDocument(output, input)`): Titel «Nutzenversprechen», Untertitel «Für <Betrieb>», Facts Betrieb (mit Ort) und Für wen, KI-Hinweis, Abschnitte «Kurz», «Mittel», «Lang», «Was die Kundschaft bekommt» (Liste), «Beweise» (Liste), «Textbausteine je Kanal» als Facts mit der Zeichenzahl in der Bezeichnung («Google-Beschreibung (412 Zeichen)»). Dateiname `nutzenversprechen-<betrieb>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zeigt das Formular mit der gespeicherten Eingabe über dem Ergebnis; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Eingabe und Entwurf, das Profil bleibt).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Status während der Anfrage mit `role="status"` («Die KI schreibt dein Nutzenversprechen.»).
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Firma leer: Meldung, kein Aufruf; die Person füllt das Feld im Kasten «Dein Betrieb». Branche und Ort leer: gehen leer an die KI, die KI setzt [Ort].
- Profil ganz leer: «Für wen?» ist leer und muss getippt werden; keine Positionierungszeile.
- Vorschlag aus dem Profil vorhanden, Person löscht das Feld: der leere Wert gilt (Meldung beim Start), der Vorschlag kommt nicht zurück, bis «Neu beginnen».
- Pflichtfeld unter der Mindestlänge oder nur Leerraum: Meldung. Über der Höchstlänge: die Textarea begrenzt mit `maxLength`, `toInput` kürzt zusätzlich.
- Beweise leer: erlaubt; die KI schreibt genau einen Platzhalter, der über dem Entwurf gelistet wird.
- Antwort mit einer Ziffer, die nicht in den Angaben steht (auch in den Bausteinen), oder mit zu langer Google-Beschreibung: verworfen, Meldung, kein CRM-Eintrag, Formular und Eingaben bleiben.
- Cookie fehlt (403): Fenster, einmal wiederholen (`useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Stand bleibt.
- Gespeicherter Stand kaputt oder von einer anderen Version: leerer Stand. Entwurf kaputt, Eingabe gültig: Eingabe bleibt für «Angaben ändern», aber kein Ergebnis (das Formular erscheint).
- Keine Daten-Datei: das Werkzeug braucht keine `data/*.json`; die einzige Zahl (750) ist die Feldgrenze bei Google.

## Texte
- Tagline: «Ein Satz, der sagt, was deine Kundschaft von dir hat, in drei Längen und als Textbausteine für jeden Kanal.»
- SEO-Title und Meta-Description in `content/tools/nutzenversprechen.md` (Title mit «Schweiz», ≤ 60 Zeichen).
- Keyword «Nutzenversprechen»: in der H1, im ersten Absatz und drei- bis fünfmal insgesamt.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: kurz, mittel, lang, Website-Titel und Google-Beschreibung mit Zeichenzahl, von Hand geschrieben und so gekennzeichnet), FAQ (7: Unterschied zu Slogan und Positionierung, was an die KI geht, kein Konto, Beweise nur aus den Angaben, wohin die Bausteine gehören, Fassungen ändern, Kosten) und Alperna-Satz (Baustein Website): `content/tools/nutzenversprechen.md`.

## Tests
`tools/nutzenversprechen/generator.test.ts` (Eingabe- und Ausgabeschema mit Grenzen, `numbersIn`, `checkNutzen` lässt Zahlen aus den Angaben und Platzhalter durch und verwirft fremde Ziffern in jedem Feld sowie eine Google-Beschreibung über 750 Zeichen, `checkGenerated` mit gültiger Antwort im Codeblock, fremder Zahl, Ausrufezeichen, falscher Form und ohne JSON, Prompt ohne Eingaben in der Anweisung) und `logic.test.ts` (`zielgruppeVorschlag` aus Primärsegment, Zielgruppe oder leer, `inputProblem` in Reihenfolge, `toInput` bereinigt und kürzt, `toForm`, `eingabeText`, Bausteine und Zeichenzahl, `toDocument` mit allen Abschnitten und Zeichenzahlen, `viewBlocks`, `reportMarkdown`, `parseState` bei kaputten Daten und als Rundlauf). 23 Fälle.

## Nicht Teil dieses Tools
- Anrede der Kundschaft wählen (Du oder Sie): der Entwurf folgt der Du-Form der Alperna-Stimme; für die Sie-Form gibt es den Text-Umschreiber.
- Schreiben ins Profil (Positionierung, Zielgruppen): die Positionierung macht das Werkzeug «Positionierung», die Zielgruppen der ICP-Builder.
- Mehrere Zielgruppen in einem Durchlauf: ein Nutzenversprechen je Kundschaft; für eine zweite Gruppe «Angaben ändern».
- Website lesen oder Marketing-Check nutzen: die Angaben tippt die Person, damit das Ergebnis aus ihrer Sicht stammt.
- Slogans oder Claims mit Wortspiel: bewusst nüchtern, belegbar.
- Rechtsaussagen (Regel 8): keine.
