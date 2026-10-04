# Kernbotschaften (botschaften)

Klasse B (Generator mit KI, braucht den Server), Stand 04.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`) nach dem Vorbild `tools/nutzenversprechen`. `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, die auf Website, Google-Profil, Instagram, in der Offerte und am Telefon fünf verschiedene Dinge sagen: in rund vier Minuten eine Hauptbotschaft, drei bis fünf Botschaften je Zielgruppe oder Anlass mit Beleg, die Fassung je Kanal, ein Satz fürs Telefon oder den Stand am Dorffest und eine Liste, was der Betrieb nicht mehr sagt.

## Kategorie und Verknüpfung
Kategorie: strategie (siebter Schritt im Pfad «Strategie», `pathStep.order` 7, nach der Markenplattform), Zielgruppe: kmu
Liest aus Profil: firma, branche, ort (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), positionierung, primaersegment, personas (Namen) und zielgruppen (nur als Rückfall für den Vorschlag «Für wen?»)
Schreibt ins Profil: nichts (`writesProfile: []`). Die Grunddaten-Felder schreiben beim Tippen in das Profil, wie beim Marketing-Check.
Verwandte Tools: nutzenversprechen, positionierung, persona
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Botschaften erstellen» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText(input)` (Betrieb, Branche, Ort, Für wen, Anrede, Angebot, Soll denken, Beweise, Positionierung, Primärsegment, Personas; eine Angabe je Zeile, leere Felder fallen weg). Ausgabe = `reportMarkdown(output, input)` (das Dokument als Markdown).
- **Downloads:** `DocumentExport` prüft die Adresse selbst (`guardDownload`). Text kopieren und die Kopieren-Knöpfe je Kanal sind frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`, id `bo-firma`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Betriebs an.» | «Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`ProfileFieldsForm`) | nein | Profil `branche` | max. 120 Zeichen | – |
| Ort | text (`ProfileFieldsForm`) | nein | Profil `ort` | max. 80 Zeichen; leer → die KI setzt [Ort] | – |
| Hinweis Profil | Kasten (`data-testid="profil-hinweise"`, Liste mit `aria-label="Angaben aus dem Firmenprofil"`) | – | Profil `positionierung` (≤ 600), `primaersegment` (≤ 200, nur wenn es nicht wörtlich in «Für wen?» steht), Namen aus `personas` (≤ 5 à 60) | gehen als Felder mit, falls vorhanden; nie erneut gefragt (Harte Regel 10) | «Aus deinem Firmenprofil geht als Hintergrund mit an die KI:» mit Liste, dazu Link «Bearbeiten» (/profil). Fehlt alles, fehlt der Kasten. |
| Für wen? | text (id `bo-zielgruppe`) | ja | `primaersegment`, sonst `zielgruppen[0].name` (`zielgruppeVorschlag`); der Vorschlag gilt, bis die Person tippt | 1 bis 200 Zeichen | «Vorschlag aus deinem Firmenprofil.» (nur bei Vorschlag) «Zum Beispiel «Hausbesitzer in der Region Gossau» oder «Liegenschaftsverwaltungen in St. Gallen».» |
| Was bietest du an? | textarea (id `bo-angebot`) | ja | – | 20 bis 600 Zeichen | «Leistungen oder Produkte, so konkret wie auf einer Offerte. Zum Beispiel: Fassaden streichen, Innenräume renovieren, Farbberatung vor Ort.» |
| Was soll die Kundschaft nach dem Kontakt mit dir denken? | textarea (id `bo-wirkung`) | ja | – | 10 bis 300 Zeichen | «Ein Satz, so wie ihn eine Kundin zu ihrer Nachbarin sagt. Zum Beispiel: «Die halten den Termin und erklären, was sie tun.»» |
| Beweise, die du hast (freiwillig) | textarea (id `bo-beweise`) | nein | – | max. 600 Zeichen | «Jahre im Geschäft, Referenzen, Garantie, Zahl der Projekte. Nur, was stimmt; was fehlt, bleibt ein Platzhalter.» |
| Anrede | select (id `bo-anrede`: Bitte wählen, «Du: wir duzen unsere Kundschaft», «Sie: wir siezen unsere Kundschaft») | ja | – | `du` oder `sie`; leer → «Wähle, ob du deine Kundschaft duzt oder siezt.» | «Wie du deine Kundschaft ansprichst. Gilt für die Texte je Kanal und den Telefonsatz.» |

Jede Textarea zeigt «n von max Zeichen, mindestens min» (`charCount`, je Zeichen). Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort und die Angaben zu Kundschaft, Angebot, Wirkung, Beweisen und Anrede, «dazu Positionierung, Primärsegment und Persona-Namen aus deinem Profil» (nur die Teile, die da sind: `hinweisNamen`, `joinNamen`); nicht die E-Mail-Adresse. «Gib nichts Vertrauliches ein.»

## Logik
1. **Vorschlag und Hinweise aus dem Profil:** `zielgruppeVorschlag` nimmt das Primärsegment, sonst den Namen der ersten Zielgruppe, sonst leer, auf 200 Zeichen gekürzt. `profilHinweise` liefert Positionierung (≤ 600), Primärsegment (≤ 200) und die Namen der Personas (`personaNamen`: ohne Leere, ohne Doppel bei anderer Schreibweise, höchstens 5 à 60 Zeichen). `hinweisNamen` nennt die vorhandenen Teile für den Satz vor dem Knopf; das Primärsegment zählt nur, wenn es nicht wörtlich in «Für wen?» steht.
2. **Eingabe prüfen** (`inputProblem`, in dieser Reihenfolge): Firma leer → Meldung; Für wen leer → Meldung; Angebot unter 20 Zeichen → Meldung; Wirkung unter 10 Zeichen → Meldung; Beweise über 600 Zeichen → Meldung; Anrede leer → Meldung. Meldung in `role="alert"`, kein Aufruf des Servers. Längen nach bereinigtem Text (Leerraum zusammengezogen, getrimmt).
3. **Eingabe für die KI** (`toInput`): betrieb (≤ 120), branche (≤ 120), ort (≤ 80) aus dem Profil; zielgruppe (≤ 200), angebot (≤ 600), wirkung (≤ 300), beweise (≤ 600), anrede aus dem Formular; positionierung (≤ 600), primaersegment (≤ 200), personas (≤ 5 à 60) aus dem Profil. Mehrfache Leerzeichen werden eins, Zeilenumbrüche bleiben. Das Primärsegment geht nur mit, wenn es nicht wörtlich dem Feld «Für wen?» entspricht (sonst stünde dieselbe Angabe zweimal). Ohne gültige Anrede fällt `toInput` auf «sie» zurück; die Prüfung davor lässt das nicht zu. Schema `botschaftenInput` (zod, ohne `.default()` und `.transform()`) im Browser und in der Route.
4. **Entwurf** (`useGenerator(botschaftenGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Kernbotschaften eines Schweizer KMU aus Kundensicht, konkret, belegbar, ohne Superlative; Anrede der Kundschaft wie gewählt, Wir-Form für den Betrieb; Ort und Region nennen, sonst [Ort]; Ziffern nur aus den Angaben; «fuer» je Botschaft verschieden und aus Zielgruppe, Primärsegment, Personas oder einem Anlass wie Offerte, Reklamation, Dorffest; Belege nur aus Beweisen, Angebot oder Positionierung, sonst Platzhalter; Zweck und Länge je Kanal; «nichtSagen» als ruhige Beschreibung ohne Sperrwörter; dann die JSON-Form). Nutzernachricht = `dataPrompt("Angaben zum Betrieb", input)`. `maxTokens` 1'400, `temperature` 0.5.
5. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): Schema `botschaftenOutput`: hauptbotschaft 30..200; botschaften 3..5 mit fuer 3..80, satz 20..200, beleg 10..200; kanaele {website 40..240, googleProfil 40..300, instagram 30..200, offerteOderMail 60..400}; telefonsatz 30..200; nichtSagen 3..6 à 3..80. Dazu Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkBotschaften`: jede Ziffernfolge in allen Texten muss in den Angaben stehen (`numbersIn` wie bei ideen-aus-website: Listenmarken fallen weg, Punkt, Komma, Apostroph und geschütztes Leerzeichen in Zahlen auch; ein normales Leerzeichen trennt Zahlen) → sonst «zahl»; «fuer» je Botschaft verschieden (ohne Gross- und Kleinschreibung, ohne Leerraum am Rand) → sonst «fuer». Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Zahlen als Wort («fünf Jahre») sind erlaubt, nur Ziffern werden geprüft (wie beim Text-Umschreiber).
   Annahme: Die Anrede wird nicht maschinell geprüft (ein «du» in der Sie-Fassung fällt nicht auf); die Person prüft den Entwurf, der KI-Hinweis sagt das.
6. **Stand speichern** (`mt:botschaften`): `{ v: 1, input, output }`, erst nach einem erfolgreichen Entwurf. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputter Entwurf fällt allein weg, die Eingabe bleibt (für «Angaben ändern»).
7. **CRM:** macht `useGenerator` nach dem Entwurf (`eingabeText`, `reportMarkdown` mit der Eingabe aus einem Ref).
8. **Kein Schreiben ins Profil** (`writesProfile: []`).

## Ausgaben
- Ergebnis: `ResultCard` «Deine Botschaften» mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.», der Liste der Platzhalter (`placeholdersIn`, «Platzhalter ausfüllen: …»), dem Dokument (`DocView` mit `viewBlocks`, ohne den doppelten KI-Hinweis) und dem Kasten «Kanäle kopieren» (Liste mit `aria-label="Texte je Kanal"`): je ein `CopyButton` «Website-Text kopieren», «Google-Text kopieren», «Instagram-Text kopieren», «Offerten-Text kopieren», «Telefonsatz kopieren», daneben «n von max Zeichen» (max = Schemagrenze).
- Dokument (`toDocument(output, input)`): Titel «Kernbotschaften», Untertitel «Für <Betrieb>», Facts Betrieb (mit Ort), Für wen, Anrede; KI-Hinweis; «Hauptbotschaft» als Absatz; «Botschaften je Zielgruppe oder Anlass» als Tabelle Für | Botschaft | Beleg (Breiten 1:2:2); «Fassung je Kanal» als Facts (Website, Google-Unternehmensprofil, Instagram, Offerte oder Mail); «Am Telefon oder am Stand» als Absatz; «Das sagen wir nicht» als Liste. Dateiname `botschaften-<betrieb>`.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF, Word), «Angaben ändern» (zeigt das Formular mit der gespeicherten Eingabe über dem Ergebnis; «Abbrechen» schliesst es wieder), «Neu beginnen» (löscht Eingabe und Entwurf, das Profil bleibt).
- Nach dem Entwurf verschwindet das Formular; es erscheint wieder über «Angaben ändern» oder «Neu beginnen». Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen.
- Knopf während der Anfrage «Die KI schreibt …», `role="status"` mit «Die KI schreibt deine Botschaften.».
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Firma leer: Meldung, kein Aufruf; die Person füllt das Feld im Kasten «Dein Betrieb». Branche und Ort leer: gehen leer an die KI, die KI setzt [Ort].
- Profil ganz leer: «Für wen?» ist leer und muss getippt werden; kein Hinweis-Kasten; Positionierung, Primärsegment und Personas gehen leer mit.
- Vorschlag aus dem Profil vorhanden, Person löscht das Feld: der leere Wert gilt (Meldung beim Start), der Vorschlag kommt nicht zurück, bis «Neu beginnen».
- Angebot 19 Zeichen, Wirkung 9 Zeichen: Meldung. Beweise 601 Zeichen: Meldung (das Feld hat `maxLength`, die Prüfung fängt eingefügten Text ab).
- Anrede nicht gewählt: Meldung, kein Aufruf. Gewählt: geht als `du` oder `sie` mit.
- Beweise leer: erlaubt; die KI setzt Platzhalter in eckigen Klammern, die Liste über dem Entwurf nennt sie.
- Primärsegment gleich «Für wen?» (ohne Gross- und Kleinschreibung): geht nicht doppelt mit, steht nicht im Hinweis-Kasten. Mehr als 5 Personas: nur die ersten 5 Namen, Doppel fallen weg.
- Antwort mit Ziffer, die nicht in den Angaben steht (auch in «nichtSagen», «beleg» oder einem Kanal), oder mit zwei Botschaften für dieselbe Gruppe: verworfen, Meldung, kein CRM-Eintrag, Formular und Eingaben bleiben.
- Platzhalter «[Zahl der Projekte]»: erlaubt, Liste über dem Entwurf.
- Cookie fehlt (403 bei /api/generate): Fenster, einmal wiederholen (macht `useGenerator`).
- Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Stand bleibt.
- Gespeicherter Stand kaputt, falsche Version, Eingabe ungültig (auch falsche Anrede): leerer Stand. Entwurf kaputt, Eingabe gültig: Eingabe bleibt für «Angaben ändern», aber kein Ergebnis (das Formular erscheint).
- Daten-Datei: keine (keine Zahlen im Werkzeug).

## Texte
- Tagline: «Eine Hauptbotschaft und je ein Satz pro Zielgruppe und Kanal, mit Beleg statt Behauptung.»
- SEO-Title: «Kernbotschaften Schweiz: ein Kern, belegt, für jeden Kanal» (58 Zeichen); Meta-Description in `content/tools/botschaften.md`.
- Keyword «Kernbotschaften»: in der H1 «Kernbotschaften für Schweizer KMU», im ersten Absatz und in den Fragen (fünf Mal mit H1).
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: Hauptbotschaft, zwei Botschaften mit Beleg, Telefonsatz als Kasten, von Hand geschrieben und so gekennzeichnet), FAQ (6: Unterschied Kernbotschaften, Nutzenversprechen, Slogan; warum Beleg; was an die KI geht; kein Konto; Du oder Sie; wie oft ändern) und Alperna-Satz (Baustein Website): `content/tools/botschaften.md`.

## Tests
`tools/botschaften/generator.test.ts` (11 Fälle: Eingabe- und Ausgabeschema mit allen Grenzen, Anrede und Personas; `numbersIn`; `checkBotschaften` lässt Zahlen aus allen Angaben und Platzhalter durch, verwirft fremde Ziffern in Hauptbotschaft, Satz, Beleg, Kanal, Telefonsatz und Liste sowie doppelte «fuer» bei anderer Schreibweise; `checkGenerated` mit gültiger Antwort im Codeblock, fremder Zahl, doppeltem «fuer», Ausrufezeichen, Sperrwort, falscher Form und ohne JSON; Prompt ohne Eingaben in der Anweisung) und `logic.test.ts` (16 Fälle: `zielgruppeVorschlag`, `personaNamen`, `profilHinweise`, `hinweisNamen` und `joinNamen`, `inputProblem` in Reihenfolge und mit Sie-Form, `toInput` bereinigt, kürzt, lässt das doppelte Primärsegment weg, `toForm`, `eingabeText`, Anreden, Kanäle und Zeichen, `toDocument` mit Facts, Tabelle, allen Kanälen, Telefonsatz und Liste, ohne Ort, `viewBlocks`, `reportMarkdown`, `parseState` bei kaputten Daten, kaputtem Entwurf und als Rundlauf). 27 Fälle. Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Das Nutzenversprechen selbst in drei Längen: macht das Werkzeug «Nutzenversprechen».
- Fertige Beiträge oder Offerten: nur der Kern je Kanal; den ganzen Text macht der Text-Umschreiber.
- Schreiben ins Profil (zum Beispiel Botschaften als Markenregel): bewusst weggelassen, die Person kopiert, was sie behalten will.
- Maschinelle Prüfung der Anrede: weggelassen (siehe Annahme in der Logik).
- Mehrere Zielgruppen in einem Durchlauf über das Feld «Für wen?»: eine Hauptzielgruppe; weitere Gruppen kommen über Primärsegment, Personas und die Anlässe in die Tabelle.
- Bilder, Logos, Slogans mit Wortspiel.
- Rechtsaussagen (Regel 8): keine.
