# Content-Säulen (inhalte-saeulen)

Klasse B (Generator mit KI, braucht den Server), Stand 04.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`) nach dem Vorbild `tools/ideen-aus-website`, `tools/persona` und `tools/nutzenversprechen`. `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU und für Vereinsvorstände, die jede Woche neu überlegen, was sie posten: in rund vier Minuten vier bis fünf Content-Säulen (feste Themenfelder mit Beschreibung, Ziel, drei bis fünf Beitragsideen und Anteil in Prozent), ein Rhythmus-Satz, ein Wochenplan mit genau so vielen Einträgen wie Beiträge pro Woche und eine Liste «Das posten wir nicht».

## Kategorie und Verknüpfung
Kategorie: content (vierter Schritt im Pfad «Content», nach Textcheck, Text-Umschreiber und Ideen aus deiner Website; `pathStep.order` 4), Zielgruppe: beide (KMU und Vereine)
Liest aus Profil: firma, branche, ort (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), positionierung, primaersegment, personas (nur die Namen; Hinweiszeile, gehen als Hintergrund mit an die KI), kanaele (Vorbelegung der Kanäle)
Schreibt ins Profil: contentSaeulen = `[{ name, beschreibung, anteil }]`, nur wenn das Feld leer ist. Die Grunddaten-Felder schreiben beim Tippen ins Profil, wie beim Marketing-Check.
Verwandte Tools: ideen-aus-website (Beiträge zu jeder Säule), text-umschreiber (Beiträge in den eigenen Ton bringen), persona
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Säulen erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText` (Betrieb, Branche, Ort, Kanäle, Beiträge pro Woche, Angebot und Fragen, Alltag, Zielgruppe, Personas, Positionierung; eine Angabe je Zeile, Freitexte auf eine Zeile geglättet). Ausgabe = das Dokument als Markdown (`reportMarkdown`).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren ist frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Betriebs an.» | «Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80; leer → die KI setzt [Ort] | – |
| Hintergrund aus dem Profil | nur Anzeige | nein | `positionierung` (≤ 600), `primaersegment` (≤ 200), Namen aus `personas` (≤ 5 à 60) | – | «Aus deinem Profil geht als Hintergrund mit an die KI: die Positionierung «…», die Zielgruppe «…», die Personas …» mit Link zu /profil; fehlt alles, fehlt die Zeile |
| Was bietest du an, und was fragt dich die Kundschaft am häufigsten? | textarea | ja | – | 20 bis 800 Zeichen | «Leistungen wie auf einer Offerte, dazu die Fragen, die du am Telefon oder vor Ort immer wieder hörst. …» mit Zeichenzähler |
| Was zeigst du gern aus dem Alltag? (freiwillig) | textarea | nein | – | max. 400 | «Baustelle, Werkstatt, Team, Region: was du ohne Aufwand fotografieren oder filmen kannst.» mit Zeichenzähler |
| Kanäle | multi (Checkboxen Instagram, Facebook, LinkedIn, Google-Beitrag, Newsletter, Website) | mindestens einer | Profil `kanaele` (Einträge mit `name` oder `kanal`, erkannt an Wörtern wie instagram, google, newsletter, e-mail, website, blog), sonst Instagram und Google-Beitrag; gilt, bis die Person ein Kästchen anfasst | `KANAL_KEYS` | «Vorbelegt aus deinem Firmenprofil.» (nur bei Vorbelegung) «Der Wochenplan verteilt die Beiträge auf die gewählten Kanäle.» |
| Wie viele Beiträge pro Woche sind realistisch? | single (select 1, 2, 3, 5) | ja | gespeicherte Eingabe («Angaben ändern») | `BEITRAEGE_KEYS` | «Lieber tief ansetzen und halten. Der Wochenplan hat genau so viele Einträge.» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, Angebot, Alltag, Kanäle und die Zahl der Beiträge, dazu die Hintergrundfelder aus dem Profil, wenn sie da sind; nicht die E-Mail-Adresse; «Gib nichts Vertrauliches ein.»

## Logik
1. **Vorbelegung** (`kanaeleVorschlag`, `effectiveKanaele`): Solange die Person kein Kästchen anfasst (`form.kanaele === null`), gelten die Kanäle aus dem Profil (`kanaeleAusProfil`: Einträge in `profile.kanaele` mit `name` oder `kanal`, Wortvergleich ohne Gross/Klein, feste Reihenfolge, ohne Doppel), sonst Instagram und Google-Beitrag. Beim ersten Klick auf ein Kästchen wird die ganze Auswahl übernommen und von da an selbst geführt. Personas: `personaNamen` nimmt die Namen aus `profile.personas`, je auf 60 Zeichen gekürzt, höchstens fünf.
2. **Eingabe prüfen** (`inputProblem(fields, form, kanaele)`), in dieser Reihenfolge: Firma leer → Meldung; Angebot unter 20 Zeichen → Meldung; Angebot über 800 → Meldung; Alltag über 400 → Meldung; kein Kanal → «Wähle mindestens einen Kanal.»; Menge nicht gewählt → «Wähle, wie viele Beiträge pro Woche realistisch sind.». Meldung in `role="alert"`, kein Aufruf des Servers.
3. **Eingabe für die KI** (`toInput(fields, form, kanaele)`): betrieb (≤ 120), branche (≤ 120), ort (≤ 80), positionierung (≤ 600, Absätze bleiben), primaersegment (≤ 200), personas (Namen), angebot (≤ 800), alltag (≤ 400), kanaele (feste Reihenfolge, ohne Doppel), beitraegeProWoche als Schlüssel «1», «2», «3» oder «5». Mehrfache Leerzeichen werden eins. Schema `saeulenInput` (zod) im Browser und in der Route; schlägt es fehl, gibt `toInput` null und das Werkzeug meldet «Bitte prüfe deine Angaben».
4. **Entwurf** (`useGenerator(saeulenGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Content-Säulen eines Schweizer KMU aus den Angaben, 4 bis 5 Säulen; jede Säule konkret aus Angebot oder Alltag, keine allgemeinen Säulen; mindestens eine Säule mit Region und Menschen; Bedeutung und Grenzen jedes Felds; Anteile als ganze Zahl 10 bis 50, Summe genau 100; Wochenplan mit genau so vielen Einträgen wie Beiträge pro Woche, nur gewählte Kanäle, Kanalname statt Schlüssel; «niemals» mit kurzem Grund; Hintergrundfelder nicht wörtlich wiederholen; keine Fachwörter; Ziffern nur aus den Angaben, die Zahl der Beiträge zählt dazu; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zum Betrieb", input)`. `maxTokens` 1'600, `temperature` 0.5.
5. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): JSON, Schema `saeulenOutput` (saeulen 4 bis 5 mit name 3..40, beschreibung 40..300, ziel aus vertrauen, sichtbarkeit, anfragen, bindung, beispiele 3 bis 5 à 10..160, anteil ganze Zahl 10..50; rhythmus mit satz 40..300 und wochenplan 1 bis 5 à {tag Montag..Sonntag, saeule 3..40, kanal 3..40}; niemals 2 bis 4 à 10..160), Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkSaeulen`, in dieser Reihenfolge: Summe der Anteile weicht um mehr als `ANTEIL_TOLERANZ` (2) von 100 ab → «anteil»; Wochenplan hat nicht genau `Number(beitraegeProWoche)` Einträge → «wochenplan»; ein Kanal im Wochenplan entspricht keinem gewählten Kanal (`kanalKey`: klein, ohne Bindestrich und Leerzeichen; Label oder Schlüssel gelten) → «kanal»; eine Ziffernfolge in name, beschreibung, beispiele, rhythmus.satz oder niemals steht nicht in den Angaben (`numbersIn` wie beim Text-Umschreiber; die Angaben sind Betrieb, Branche, Ort, Positionierung, Zielgruppe, Personas, Angebot, Alltag und die Zahl der Beiträge) → «zahl». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Die Toleranz von zwei Punkten fängt Rundungen der KI ab (Richtwert dieses Werkzeugs, keine Statistik); das Dokument zeigt die Anteile so, wie die KI sie liefert. Annahme: `anteil` darf im JSON auch als Text («30») stehen und wird gelesen (`z.coerce`), Kommazahlen fallen weg. Annahme: Zahlen als Wort («drei Bilder») sind erlaubt, nur Ziffern werden geprüft. Annahme: `wochenplan.saeule` wird nicht gegen die Säulennamen geprüft, weil die KI Namen oft kürzt; ein Vergleich käme als nächste Stufe.
6. **Stand speichern** (`mt:inhalte-saeulen`): `{ v: 1, input, output }`, erst nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputter Entwurf fällt allein weg, die Eingabe bleibt (für «Angaben ändern»).
7. **Profil** (`profilePatch`): nur nach einem frisch erzeugten Entwurf und nur, wenn `profile.contentSaeulen` leer ist oder fehlt: `contentSaeulen = saeulen.map({ name, beschreibung, anteil })`. Stehen dort schon Säulen, bleibt das Profil, wie es ist (leerer Patch).
8. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Content-Säulen» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Liste der Platzhalter (`placeholdersIn`), `DocView` mit den Blöcken des Dokuments (ohne den KI-Satz: `screenBlocks`; Hülle `data-testid="saeulen"`) und dem Hinweis, dass die Säulen im Firmenprofil unter «Content-Säulen» stehen, sofern dort noch keine standen.
- Dokument (`toDocument(output, input)`): Titel «Content-Säulen», Untertitel «Für <Betrieb>», Facts Betrieb (mit Ort), Kanäle, Beiträge pro Woche; KI-Hinweis; je Säule Überschrift «n. Name», Absatz (Beschreibung), Liste (Beispiele), Absatz «Anteil n % der Beiträge, Ziel: <Ziel>» (`pctCH`); «Rhythmus» mit dem Satz und der Tabelle Tag | Säule | Kanal; «Das posten wir nicht» als Liste. Dateiname `inhalte-saeulen-<betrieb>`. Ohne Eingabe (kaputter Stand) stehen die Facts auf «keine Angabe».
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zeigt das Formular mit der gespeicherten Eingabe über dem Ergebnis, Fokus auf das Angebot; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Eingabe und Entwurf, die Kanäle fallen auf den Vorschlag zurück, das Profil bleibt).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Status während der Anfrage mit `role="status"` («Die KI schreibt deine Content-Säulen.»), Knopftext «Die KI schreibt …».
- Zählung: `popular:inhalte-saeulen` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Profil leer: Firma muss getippt werden (Meldung); Branche und Ort gehen leer an die KI (sie setzt [Ort]); Kanäle stehen auf Instagram und Google-Beitrag; keine Hinweiszeile.
- Profil mit Kanälen, die das Werkzeug nicht kennt (TikTok): kein Treffer, Vorbelegung Instagram und Google-Beitrag. Einträge ohne `name` und `kanal` zählen nicht.
- Alle sechs Kanäle gewählt: erlaubt, die KI verteilt. Kein Kanal: Meldung, kein Aufruf.
- Angebot zu kurz, Menge nicht gewählt: Meldung in der Reihenfolge des Formulars. Über der Höchstlänge: `maxLength` auf der Textarea, `toInput` kürzt zusätzlich.
- Fünf Beiträge pro Woche: Wochenplan mit fünf Einträgen (Schema erlaubt höchstens fünf). Ein Beitrag: ein Eintrag.
- Antwort mit Anteilen 33/25/20/20 (Summe 98): angenommen (Toleranz). 32/25/20/20 (97): verworfen. Antwort mit «Google Unternehmensprofil» als Kanal: verworfen, «google beitrag» oder «google»: angenommen. Antwort mit «8 im Monat» im Rhythmus-Satz: verworfen (die 8 steht nicht in den Angaben), «2 Beiträge» bleibt erlaubt. Antwort mit Säulenname «Top 3 Fragen»: verworfen.
- Platzhalter «[Name des Lehrlings]», «[Ort]»: erlaubt, Liste über dem Entwurf.
- Profil hat schon Säulen (etwa von Hand eingetragen): bleiben; das neue Ergebnis wird nur angezeigt und exportiert.
- Cookie fehlt (403): Fenster, einmal wiederholen (`useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Formular und Eingaben bleiben.
- Gespeicherter Stand kaputt oder von einer anderen Version: leerer Stand. Entwurf kaputt, Eingabe gültig: Eingabe bleibt für «Angaben ändern», das Formular erscheint.
- Keine Daten-Datei: das Werkzeug braucht keine `data/*.json`; die einzigen Zahlen (Anteile, Toleranz, Grenzen) sind Regeln des Werkzeugs.

## Texte
- Tagline: «Vier bis fünf Themen, aus denen jeder Beitrag kommt, mit Beispielen und einem Wochenplan, der zu dir passt.» (107 Zeichen; die zuerst vorgesehene Fassung mit «Wochenrhythmus, der zu deiner Zeit passt» hätte 119 Zeichen und wäre an der Grenze von 110 in `defineTool` gescheitert).
- SEO-Title «Content-Säulen Schweiz: vier Themen für jeden Beitrag» (53 Zeichen) und Meta-Description in `content/tools/inhalte-saeulen.md`.
- Keyword «Content-Säulen»: in der H1, im ersten Absatz und in der FAQ; «Säulen» allein steht öfter.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: vier Säulen mit Beispielwerten für die Anteile, Rhythmus, Wochenplan als Liste im Kasten, «Das posten wir nicht»; von Hand geschrieben und so gekennzeichnet), FAQ (7: was Content-Säulen sind, wie viele, was an die KI geht, kein Konto, Vereine, Zusammenspiel mit «Ideen aus deiner Website», Säulen ändern) und Alperna-Satz (Baustein Social Media): `content/tools/inhalte-saeulen.md`.

## Tests
`tools/inhalte-saeulen/generator.test.ts` (Listen und Labels, `kanalKey`, Eingabeschema mit allen Grenzen, Ausgabeschema mit Mengen und Anteil als Text, `numbersIn`, `checkSaeulen`: sauberer Entwurf mit Zahl der Beiträge, Zahl aus dem Angebot und Platzhalter, Toleranz der Anteile, Länge des Wochenplans je Menge, fremde und anders geschriebene Kanäle, fremde Ziffern in jedem Feld, Reihenfolge der Gründe; `checkGenerated` mit gültiger Antwort im Codeblock, Anteil als Text, falschem Anteil, fremdem Kanal, fremder Zahl, kaputter Form, ohne JSON, verbotenem Wort, Sperrliste; Prompt ohne Eingaben in der Anweisung) und `logic.test.ts` (Labels und Schlüssel, `normalizeKanaele`, `kanaeleAusProfil`, `kanaeleVorschlag`, `effectiveKanaele`, `personaNamen`, `inputProblem` in Reihenfolge und mit drittem Wert, `toInput` bereinigt, ordnet, kürzt und gibt null, `formFromInput` als Rundlauf, `eingabeText`, `toDocument` mit allen Blöcken, ohne Eingabe und ohne Ort, `screenBlocks`, `reportMarkdown`, `profilePatch` nur bei leerem Feld, `parseState` bei kaputten Daten und als Rundlauf). 16 plus 22 Fälle. Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Redaktionsplan mit Daten, Feiertagen oder Schulferien: nur Wochentage; ein Kalender-Werkzeug ist eine eigene Idee (IDEAS.md).
- Fertige Beiträge: nur Säulen, Beispiele und Rhythmus; Beiträge liefern «Ideen aus deiner Website» und der Text-Umschreiber.
- Prüfung, dass `wochenplan.saeule` wörtlich einem Säulennamen entspricht (siehe Annahme in der Logik).
- TikTok als Kanal: bewusst weggelassen; die Instagram-Säulen passen dort meist.
- Säulen im Profil ersetzen oder zusammenführen: nur ins leere Feld; ändern über /profil.
- Bilder oder Videos erzeugen.
- Rechtsaussagen (Regel 8): keine.

## Bildschirm-Bausteine (Stand 09.10.2026, Charge C6)
Das Dokument zeigt am Bildschirm einen Kuchen «Verteilung der Beiträge» (`split`, nur ab zwei Säulen) und die Säulen als Karten (`cards`: Titel «1. Name», Marke «35 % der Beiträge, Ziel: Anfragen», Text Beschreibung und «Beispiele: …»). In PDF, Word und Markdown werden Kuchen zur Tabelle und Karten zur Liste (Zeilenumbruch in einer Karte wird zu Leerzeichen oder Semikolon, `flattenBlocks`), der Inhalt ist derselbe.
