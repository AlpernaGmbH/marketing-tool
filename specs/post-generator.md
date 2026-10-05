# Post-Generator (post-generator)

Klasse B (Generator mit KI, braucht den Server), Stand 05.10.2026. Nutzt den Generator-Baustein (`lib/generator.ts`, `components/tool/useGenerator.ts`, Route `/api/generate`) nach dem Vorbild `tools/botschaften` und `tools/content-saeulen`. Die Faltkante und der Zeichenzähler der Vorschau kommen aus `tools/caption-baukasten/logic.ts` (`foldInfo`, `splitAtFold`, `counterLabel`, `foldHint`, `FOLD_NOTE`). `generator.ts` und `logic.ts` sind getestet.

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU und für Vereinsvorstände, die wissen, worüber sie schreiben wollen, aber den ersten Satz nicht finden: in rund drei Minuten aus einer Idee in ein bis drei Sätzen ein Beitrag für Instagram, LinkedIn, Facebook oder den Google-Beitrag, in ihrem Ton aus dem Firmenprofil, mit zwei Hooks zur Wahl, Hauptteil und Aufforderung und einem leeren Platz für die Hashtags.

## Kategorie und Verknüpfung
Kategorie: ki (vierter Schritt im Pfad «KI», `pathStep.order` 4), Zielgruppe: beide
Liest aus Profil: firma, branche, ort (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt), positionierung, marke (werte, tonalitaet, woerter.vermeiden), contentSaeulen (Namen, für das Feld «Säule») und personas (Namen). Die Anrede ist aus `marke.tonalitaet` vorbelegt (`anredeFromProfile`).
Schreibt ins Profil: nichts (`writesProfile: []`). Die Grunddaten-Felder schreiben beim Tippen in das Profil, wie beim Marketing-Check.
Verwandte Tools: content-ideen, caption-baukasten, markenplattform
`needsServer: true`: die Angaben gehen an `/api/generate` (Ausnahme in Harte Regel 1). `/api/read` wird nicht gebraucht.

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Beitrag schreiben» prüft das Werkzeug die Eingaben (`inputProblem`), dann macht `useGenerator.generate(input)` Fenster (`ensureEmail`), Anfrage, Wiederholung bei 403 (`renewEmail`) und den CRM-Eintrag selbst. Schliesst die Person das Fenster, bleibt das Formular stehen.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText(input)` (Betrieb, Ort, Branche, Plattform, Format, Ziel, Anrede, Emojis, Säule, Idee, Positionierung, Werte, Tonalität, zu vermeidende Wörter, Persona; eine Angabe je Zeile, leere Felder fallen weg). Ausgabe = `reportMarkdown(output, input)` (das Dokument als Markdown, mit beiden Hooks). «Neu formulieren» ist ein neues Ergebnis und geht erneut ins CRM. «Laden» eines Entwurfs und die Wahl des Hooks schicken nichts.
- **Keine Dateien.** `outputs: ["copy"]`: `DocumentExport` mit `formats={[]}` zeigt nur «Text kopieren». «Beitrag kopieren» ist frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (`ProfileFieldsForm`, id `pg-firma`) | ja | Profil `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Betriebs an.» | «Firma, Branche und Ort speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche | text (`pg-branche`) | nein | Profil `branche` | max. 120 Zeichen | – |
| Ort | text (`pg-ort`) | nein | Profil `ort` | max. 120 Zeichen | – |
| Hinweis Profil | Absatz (`data-testid="profil-hinweis"`) | – | Positionierung, Werte, Tonalität, zu vermeidende Wörter, Persona-Namen, die gewählte Säule: nur die Teile, die da sind | gehen als Felder mit, nie erneut gefragt (Harte Regel 10) | «Aus deinem Profil geht mit: … Bearbeiten» (Link /profil). Fehlt alles, fehlt der Absatz. |
| Deine Idee in ein bis drei Sätzen | textarea (`pg-idee`) | ja | – | 20 bis 600 Zeichen | Beispiel aus dem Alltag; Zähler «n von 600 Zeichen, mindestens 20» |
| Gemerkte Idee übernehmen | select (`pg-merk`) | nein | Merkliste `mt:merkliste` des Werkzeugs «Content-Ideen» | erscheint nur, wenn mindestens eine gemerkte Idee im Datensatz steht; Wahl füllt die Idee mit «Titel. Beschrieb» | «Aus deiner Merkliste im Werkzeug «Content-Ideen». …» |
| Plattform | select (`pg-plattform`: Instagram, LinkedIn, Facebook, Google-Beitrag) | ja | Standard Instagram | eine der vier | «Die Länge des Beitrags richtet sich nach der Plattform.» |
| Format | select (`pg-format`: Geschichte, Liste, Meinung, Fachtipp) | ja | Standard Geschichte | eines der vier | Satz zum gewählten Format |
| Ziel der Aufforderung | select (`pg-ziel`: Kommentar, Nachricht, Profil besuchen, Link, Speichern) | ja | Standard Kommentar | eines der fünf | Satz zum gewählten Ziel; bei «Link» steht der Platzhalter [Link] |
| Anrede | select (`pg-anrede`: Du, Sie) | ja | Tonalität im Profil, sonst Du | `du` oder `sie` | «Vorbelegt aus der Tonalität in deinem Firmenprofil.» (nur bei Vorbelegung) |
| Säule | select (`pg-saeule`: keine plus Namen aus `contentSaeulen`) | nein | Profil `contentSaeulen` | nur, wenn das Profil Säulen hat; die Säule geht nur mit, wenn sie im Profil steht | «Aus deinen Content-Säulen im Firmenprofil. …» |
| Emojis erlauben | Checkbox (`pg-emojis`) | nein | aus | boolean | «Ohne Haken schreibt die KI keine Emojis.» |

Vor dem Knopf steht, was an die KI geht: Betrieb, Branche, Ort, die Idee und die Auswahl (Plattform, Format, Ziel, Anrede, Emojis), «dazu … aus deinem Profil» (nur die Teile, die da sind), nicht die E-Mail-Adresse; der Server speichert nichts; «Gib nichts Vertrauliches ein.»

## Logik
1. **Profil lesen** (`profilTeile`): Positionierung (≤ 600), Werte (≤ 5 à 40, ohne Doppel), Tonalität (≤ 400: «So schreiben wir: …» und «So nicht: …» aus `marke.tonalitaet.so` und `.nichtSo`, sonst alle Texte der Tonalität ausser der Anrede), zu vermeidende Wörter (`marke.woerter.vermeiden`, ≤ 10 à 40), Persona-Namen (≤ 5 à 60, zu einem Text ≤ 200) und Säulen-Namen (≤ 60). Kaputte oder fremde Formen ergeben leere Teile, nie einen Fehler.
2. **Eingabe prüfen** (`inputProblem`, in dieser Reihenfolge): Firma leer; Idee unter 20 Zeichen; Idee über 600 Zeichen; Plattform, Format, Ziel nicht gewählt. Ergebnis: Meldung und Feld-ID; die Meldung steht in `role="alert"`, der Fokus geht ins Feld, es gibt keinen Aufruf des Servers. Längen nach bereinigtem Text (Leerraum zusammengezogen, Absätze bleiben).
3. **Eingabe für die KI** (`toInput`): Felder des Schemas `postInput`: betrieb, branche, ort, idee, plattform, format, ziel, saeule, anrede, emojis, positionierung, werte, tonalitaet, vermeiden, persona. Nie die E-Mail-Adresse, nie das ganze Profil. Die Säule geht nur mit, wenn sie im Profil steht. Die Anrede ist die gewählte, sonst die aus dem Profil, sonst Du.
4. **Beitrag** (`useGenerator(postGenerator).generate(input)`): System-Prompt = `GENERATOR_RULES` plus `instruction` (Aufgabe: Beitrag aus Sicht des Betriebs je Plattform und Format; zwei verschiedene Hooks, eine Frage und eine Aussage; Hauptteil mit Absätzen; Aufforderung nach Ziel; Anrede; Emojis nur wenn erlaubt; keine Hashtags; Hintergrund aus dem Profil, nicht wörtlich; Ort und Alltag; Platzhalter in eckigen Klammern; Ziffern nur aus den Angaben; ein Hinweis ohne Anrede, was zur Idee fehlt). Nutzernachricht = `dataPrompt("Angaben zum Beitrag", input)`. `maxTokens` 1'200, `temperature` 0.6.
5. **Prüfung der Antwort** (`checkGenerated` in der Route, Schema im Browser): Schema `postOutput`: hooks genau 2 à 10..160, hauptteil 80..1'200, cta 10..160, hinweis 0..200 (darf fehlen). Dazu Sperrliste, Regeln, Links nur aus den Angaben. Eigene Prüfung `checkPost`, in dieser Reihenfolge, Grund in Klammern:
   - «hooks»: die beiden Hooks sind bis auf Gross- und Kleinschreibung und Satzzeichen gleich.
   - «laenge»: Hauptteil über 900 Zeichen bei Instagram und Facebook, über 1'200 bei LinkedIn und Google; beim Google-Beitrag zusätzlich Hook, Hauptteil und Aufforderung zusammen über 1'500 Zeichen (Leerzeilen zählen nicht, `googleLaenge`).
   - «zahl»: eine Ziffernfolge in irgendeinem Text, die nicht in den Angaben steht (`numbersIn`: Listenmarken am Zeilenanfang fallen weg).
   - «emoji»: ein Emoji, obwohl die Person keine erlaubt hat (Piktogramme, Emoji mit Bildform, Flaggen, Tastenkappen).
   - «hashtag»: ein Hashtag (`#` vor Buchstabe, Ziffer oder Unterstrich, am Anfang oder nach Leerraum oder Klammer).
   - «anrede»: bei Sie ein du, dich, dir oder dein (alle Formen) in Hook, Hauptteil oder Aufforderung. Der Hinweis zählt nicht.
   - «vermeiden»: ein Wort aus den zu vermeidenden Wörtern (ganzes Wort ohne Gross- und Kleinschreibung, mit den üblichen Endungen). Steht das Wort in der Idee der Person, gilt es nicht.
   Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
   Annahme: Die Längen des Hauptteils (900 und 1'200 Zeichen) sind Richtwerte von Alperna, keine Statistik. Die Grenze von 1'500 Zeichen beim Google-Beitrag ist dieselbe wie im Caption-Baukasten.
   Annahme: Bei Du wird die Anrede nicht geprüft («Sie» ist mehrdeutig: auch «sie» im Satz).
   Annahme: Zahlen als Wort («zwei Wochen») sind erlaubt, nur Ziffern werden geprüft.
6. **Der fertige Text** (`compose(output, hook, hashtags, plattform)`): Hook (gewählte Variante), Leerzeile, Hauptteil, Leerzeile, Aufforderung; bei Instagram danach die Hashtags der Person (`cleanHashtags`: `#` ergänzt, Sonderzeichen und Doppel weg). Der Google-Beitrag hat keine Leerzeilen, nur einfache Zeilenumbrüche. Schreibweise und Leerraum werden aufgeräumt (`tidy`).
7. **Vorschau**: `foldInfo` und `splitAtFold` teilen den Text an der Faltkante, `counterLabel` zählt («512 Zeichen, davon 125 vor der Faltkante»; bei Google «… innerhalb der Grenze von 1'500»), `foldHint` sagt, was die Plattform tut. Die Werte sind Richtwerte von Alperna, keine Statistik; der Satz «Richtwert von Alperna, keine Statistik; die Plattformen ändern das.» steht unter jeder Vorschau (`FOLD_NOTE`). Annahme: Die Faltkante gilt für den Text mit Hashtags, wie im Caption-Baukasten.
8. **Stand speichern** (`mt:post-generator`): `{ v: 1, input, output, hook: 0|1, hashtags, entwuerfe }`, erst nach einem erfolgreichen Beitrag. Hook-Wahl und Hashtags werden bei jeder Änderung gespeichert. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. `parseState` liefert bei kaputten Daten, falscher Version oder ungültiger Eingabe den leeren Stand; ein kaputtes Ergebnis lässt die Eingabe für «Angaben ändern» stehen; von den Entwürfen bleiben die gültigen (höchstens zehn, ohne doppelte IDs).
9. **Entwürfe**: «Als Entwurf merken» legt Eingabe, Ergebnis, gewählten Hook und Hashtags in die Liste `entwuerfe` im Stand (neuester zuerst, höchstens zehn, der älteste fällt weg). Annahme: Die Merkliste `mt:merkliste` gehört dem Werkzeug «Content-Ideen» (`{ v: 1, ideen: [{ id, gemerktAm }] }`, IDs aus dessen Datensatz); Beiträge passen dort nicht hinein, darum hat der Post-Generator eine eigene Liste. «Laden» setzt Eingabe, Ergebnis, Hook und Hashtags zurück und schickt nichts ins CRM.
10. **Gemerkte Ideen lesen**: Gibt es `mt:merkliste`, lädt das Werkzeug erst dann `tools/content-ideen/logic.ts` nach (`import()`, eigener Chunk, damit der Datensatz die Seite nicht beschwert) und zeigt die gemerkten Ideen im Feld «Gemerkte Idee übernehmen». Fehlt das Werkzeug, ist die Liste leer oder kaputt, fehlt das Feld.
11. **Kein Schreiben ins Profil** (`writesProfile: []`).

## Ausgaben
- Ergebnis: `ResultCard` «Dein Beitrag» (`aria-label`) mit dem Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.» (`data-testid="ki-hinweis"`), der Liste der Platzhalter (`placeholdersIn`, `data-testid="platzhalter"`), der Radiogruppe «Hook» mit den zwei Varianten, bei Instagram dem Feld «Hashtags (freiwillig)» (`pg-hashtags`), der Vorschau («Vorschau <Plattform>», `pg-preview`, `pg-text`, `pg-over`, `pg-counter`) mit «Beitrag kopieren», dem Hinweis der KI (`data-testid="hinweis"`, nur wenn vorhanden), dem Abschnitt «Prüfen» mit dem Link «Im Textcheck prüfen» (schreibt den Beitrag nach `mt:textcheck` und öffnet /tools/textcheck) und dem Abschnitt «Beide Hooks als Text» mit `DocumentExport` (nur «Text kopieren»).
- Dokument (`toDocument(output, input, hashtags)`): Titel «Beitrag: <Plattform>», Untertitel «Für <Betrieb>», Facts (Betrieb mit Ort, Plattform, Format, Ziel der Aufforderung, Anrede), KI-Hinweis, «Hook, zwei Varianten» als nummerierte Liste, «Hauptteil» in Absätzen, «Aufforderung», bei Instagram «Hashtags» (nur, wenn die Person welche geschrieben hat), «Hinweis der KI» (nur, wenn vorhanden). Dateiname `beitrag-<plattform>-<betrieb>` (nur für den Titel; es gibt keinen Download).
- Knöpfe: «Als Entwurf merken», «Neu formulieren» (gleiche Angaben, neuer Beitrag; Hook-Wahl wieder auf die erste Variante, Hashtags bleiben), «Angaben ändern» (Formular mit den gespeicherten Angaben über dem Ergebnis; «Abbrechen» schliesst es), «Neu beginnen» (löscht Eingabe und Ergebnis, das Profil und die Entwürfe bleiben).
- Bereich «Deine Entwürfe» (Liste `aria-label="Gemerkte Entwürfe"`, je «Laden» und «Löschen»).
- Fokus auf die Ergebnis-Überschrift nach einer Aktion, nicht beim Wiederherstellen. Knopf während der Anfrage «Die KI schreibt …», `role="status"` mit «Die KI schreibt deinen Beitrag.».
- Zählung: `popular:<slug>` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Firma leer: Meldung, Fokus in «Firma», kein Aufruf. Branche und Ort leer: gehen leer an die KI, die KI setzt Platzhalter, wo der Ort fehlt.
- Profil ganz leer: Standardwerte Instagram, Geschichte, Kommentar, Du; kein Hinweis, kein Feld «Säule», keine Hintergrundfelder.
- Idee 19 Zeichen: Meldung. Idee 601 Zeichen (eingefügt): Meldung (das Feld hat `maxLength`, die Prüfung fängt eingefügten Text ab).
- Säule gewählt, dann aus dem Profil gelöscht: geht nicht mehr mit. Mehr als fünf Werte, mehr als zehn Wörter, mehr als fünf Personas: nur die ersten; zu lange Einträge werden gekürzt.
- Ziel «Link»: Die KI schreibt den Platzhalter [Link], nie eine Adresse; eine Adresse, die nicht in den Angaben steht, verwirft die Route.
- Emojis erlaubt: Die Anweisung erlaubt höchstens drei. Offen: `lib/generator.ts` verwirft jede Antwort mit Emoji (siehe Abschlussbericht), bis dort ein Schalter je Werkzeug besteht.
- Antwort mit gleichen Hooks, zu langem Hauptteil, fremder Ziffer, Hashtag, du bei Sie oder Wort aus «vermeiden»: verworfen, Meldung, kein CRM-Eintrag, Formular und Eingaben bleiben. Beim Neuformulieren steht die Meldung im Ergebnis, der bisherige Beitrag bleibt.
- Der Hinweis der KI fehlt oder ist leer: kein Hinweis-Kasten.
- Cookie fehlt (403 bei /api/generate): Fenster, einmal wiederholen (macht `useGenerator`). Ratenbegrenzung (429), Kapazität (503), KI-Ausfall (502), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Stand bleibt.
- Gespeicherter Stand kaputt, falsche Version, Eingabe ungültig: leerer Stand (Entwürfe, die einzeln gültig sind, bleiben). Nur das Ergebnis kaputt: Das Formular erscheint mit den gespeicherten Angaben. Hook-Wert unbekannt: erste Variante.
- Merkliste kaputt oder ohne bekannte IDs: kein Feld «Gemerkte Idee übernehmen».
- Daten-Datei: keine eigene. Die Zahlen der Faltkante kommen aus dem Caption-Baukasten und sind Richtwerte von Alperna.

## Texte
- Tagline: «Aus einer Idee ein Beitrag für Instagram, LinkedIn, Facebook oder Google, in deinem Ton und mit zwei Hooks.» (107 Zeichen)
- SEO-Title: «Social-Media-Beitrag schreiben Schweiz: Post-Generator» (54 Zeichen); Meta-Description in `content/tools/post-generator.md` (146 Zeichen).
- Keyword «Social-Media-Beitrag schreiben»: im ersten Absatz und zwei weitere Male im Text. Annahme: Die H1 «Post-Generator für Schweizer KMU» folgt der Vorgabe des Auftrags und enthält das Keyword nicht (`npm run seo-check` meldet das, wie beim Caption-Baukasten).
- Erklärtext nach der Lese-Vorlage (684 Wörter), Beispiel Malerei Keller, Gossau (ein Instagram-Beitrag mit den Zahlen aus `compose` und `counterLabel`, von Hand geschrieben und so gekennzeichnet), FAQ (6: Woher kennt die KI meinen Ton, Hashtags, was geht an den Server, darf ich den Text so veröffentlichen, Konto, Länge) und Alperna-Satz (Baustein Social Media): `content/tools/post-generator.md`.

## Tests
`tools/post-generator/generator.test.ts` (25 Fälle: Eingabe- und Ausgabeschema mit allen Grenzen; `numbersIn`, `containsWord`, `vermeidenWoerter`, Emoji-, Hashtag- und Du-Erkennung, `googleLaenge`, gleiche Grenze wie der Caption-Baukasten; `checkPost` je Regel positiv und negativ und in der Reihenfolge der Regeln; `checkGenerated` mit gültiger Antwort im Codeblock, mit allen Gründen «check», mit falscher Form, Ausrufezeichen, Sperrwort und fremdem Link; Prompt ohne Eingaben in der Anweisung), `logic.test.ts` (38 Fälle: Profil lesen, kürzen und Grenzen, Tonalität, Säulen und Personas, Hinweis und `joinNamen`, Anrede, `inputProblem` in Reihenfolge, `toInput` mit und ohne Profil, mit riesigem Profil und gegen das Schema, `toForm`, `ideeText`, `eingabeText`, `compose` je Plattform, Hashtags nur bei Instagram, Google ohne Leerzeilen, Faltkante und Zähler, `toDocument` und `reportMarkdown`, Entwürfe, `parseState` bei kaputten Daten, kaputtem Ergebnis, Hook, Hashtags und Entwürfen, Labels, Sperrliste für die Texte der Oberfläche, Beispiel aus dem Seitentext) und `Tool.test.tsx` (18 Fälle im Browser mit Stub für /api/generate: Formular und Satz vor dem Knopf, Meldungen und Fokus, Ergebnis mit Hook-Wahl, Vorschau, CRM-Eintrag und Stand, Hashtags nur bei Instagram, LinkedIn, Google, Platzhalter, Neuladen, Neu formulieren, Fehler beim Neuformulieren, «Angaben ändern» und «Neu beginnen», Formular aus der gespeicherten Eingabe bei kaputtem Ergebnis, Entwürfe, Textcheck, Fehler der KI, gemerkte Ideen, kaputte Merkliste). 81 Fälle. Route und Hook sind in `lib/generator.test.ts`, `components/tool/useGenerator.test.tsx` und `app/api/generate` getestet.

## Nicht Teil dieses Tools
- Hashtags: schreibt die Person selbst; das Werkzeug räumt sie nur auf (`#` ergänzt, Doppel weg).
- Bilder, Reels, Karussells, Stories: nur Text für den Beitrag.
- Mehrere Plattformen in einem Durchlauf: eine Plattform je Durchlauf, weil Länge und Ton sich unterscheiden. Wer denselben Gedanken von Hand für alle Plattformen setzen will, nimmt den Caption-Baukasten.
- Planung und Kalender: macht das Werkzeug «Content-Kalender».
- Dateien (PDF, Word): keine; der Beitrag ist Text zum Kopieren.
- Maschinelle Prüfung der Du-Form (nur die Sie-Form wird geprüft).
- Ablegen der Entwürfe in `mt:merkliste`: bewusst weggelassen (siehe Logik, Punkt 9).
- Rechtsaussagen (Regel 8): keine.
