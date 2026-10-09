# Story-Post-Builder (story-post)

Klasse C (Formular, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Word und PDF über `DocumentExport` (`guardDownload`). `logic.ts` ist rein und getestet. Das Werkzeug ordnet und kürzt die Sätze der Person, es schreibt keine neuen. Das sagt die Oberfläche offen: «Die Sätze sind deine; das Werkzeug ordnet sie.»

## Nutzen in einem Satz
Für KMU und Vereine, die eine Geschichte aus ihrem Betrieb veröffentlichen wollen: in rund sechs Minuten aus sechs Antworten ein Beitrag im LinkedIn-Format mit zwei Hook-Vorschlägen, der Lesezeit und einer Instagram-Fassung, die auf die Zeichengrenze gekürzt wird.

## Kategorie und Verknüpfung
Kategorie: content (Schritt 10 im Pfad «Content»), Zielgruppe: beide
Liest aus Profil: firma (Anzeige im Kopf der Datei, Vorbefüllung des Feldes «Firma»), organisationstyp (Beschriftung «Name des Vereins» statt «Firma» in `ProfileFieldsForm`), marke (nur `marke.tonalitaet`, für die Vorbelegung der Anrede über `anredeFromProfile`)
Schreibt ins Profil: nichts (`profilePatch` gibt es nicht). `ProfileFieldsForm(["firma"])` speichert die Firma, wie in den anderen Werkzeugen, beim Tippen im Profil; das steht im Formular.
Verwandte Tools: caption-baukasten, post-generator, inhalte-saeulen

## Zugang (Zugang v3)
- Beim Klick auf «Beitrag zusammenstellen» prüft das Werkzeug alle Felder (`validate`), dann `ctx.ensureEmail()`; schliesst die Person das Fenster, bleibt das Formular stehen.
- Danach `ctx.sendResult({ eingabe: eingabeText(input), ausgabe: ausgabeText(story) })`. Eingabe: die sechs Felder je Zeile («Ausgangslage: …»), danach «Anrede» und «Hook». Ausgabe: die LinkedIn-Fassung, eine Leerzeile, die Instagram-Zeile («Instagram: 296 Zeichen, nichts gekürzt.»). Der Server kürzt beides auf 1'900 Zeichen; die Geschichte steht darum oben.
- Der Wechsel des Hooks im Ergebnis ist kein neues Ergebnis: nichts geht ein zweites Mal ins CRM.
- Downloads (PDF, Word) über `DocumentExport` und `ctx.guardDownload`; Kopieren ist immer frei.
- Nach dem Neuladen steht das Ergebnis wieder da (Stand `mt:story-post`, `phase: "result"`), ohne zweiten CRM-Eintrag.

## Eingaben
Ein Formular auf einer Seite. Über den Feldern der Fortschritt als `role="status"` («3 von 5 Pflichtfeldern bereit»). Fehler stehen als Liste in `role="alert"` (id `sp-error`), der Fokus geht ins erste fehlerhafte Feld, das Feld trägt `aria-invalid`.

| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma (id `sp-firma`) | `ProfileFieldsForm(["firma"])` | nein | `profile.firma` | keine | «Die Firma speichern wir in deinem Firmenprofil, in deinem Browser. Sie steht im Kopf der Datei.» |
| Anrede der Leserinnen und Leser | Radiogruppe (Du, Sie) | ja | `profile.marke.tonalitaet` über `anredeFromProfile`, sonst Du | eine von beiden | Gilt für das Beispiel beim Bezug zur Leserin und für den Anrede-Hinweis |
| Ausgangslage (id `sp-ausgangslage`) | Textarea | ja | keine | 20 bis 400 Zeichen | «Wo standest du, wer war beteiligt?» Beispiel «Frau Z. aus Gossau rief an: Ihre Fassade blätterte nach drei Wintern ab.» |
| Problem oder Spannung (`sp-problem`) | Textarea | ja | keine | 20 bis 400 | «Was war schwierig oder unklar?» «Zwei andere Maler hatten nur übergestrichen.» |
| Wendepunkt (`sp-wendepunkt`) | Textarea | ja | keine | 20 bis 400 | «Was hat den Unterschied gemacht?» «Wir haben erst die Feuchte im Putz gemessen.» |
| Ergebnis (`sp-ergebnis`) | Textarea | ja | keine | 20 bis 400 | «Was ist daraus geworden? Nur, was stimmt.» «Die Fassade hält seit zwei Jahren.» |
| Lehre (`sp-lehre`) | Textarea | ja | keine | 20 bis 400 | «Was nimmst du mit?» «Erst messen, dann streichen.» |
| Bezug zur Leserin (freiwillig) (`sp-bezug`) | Textarea | nein | keine | leer oder 10 bis 400 | «Eine Frage oder Einladung an die Leserschaft.» «Wie ist das bei deinem Haus?» (Sie: «… bei Ihrem Haus?») |

Die Beispiele sind Platzhalter im Feld (`placeholder`) und stehen zusätzlich als Zeile «Beispiel, Malerei Keller: …» unter dem Feld; sie sind nie vorausgefüllt. Unter jedem Feld steht ein Zähler («12 Zeichen (20 bis 400)»). Gezählt wird nach dem Aufräumen und in Unicode-Zeichen (ein Emoji ist ein Zeichen). Das Textfeld begrenzt die Eingabe auf 400 Zeichen (`maxLength`).

Im Ergebnis wählt die Person den Hook (Radiogruppe «Hook für die erste Zeile»: «Hook 1», «Hook 2», «Ohne Hook»; Standard Hook 1; unter dem Radio der Hook als Text).

## Logik
1. **Aufräumen** (`tidy`): Leerraum und Zeilenumbrüche zu einem Leerzeichen, `typoCH` (ß zu ss, «» statt "", Prozent mit Leerzeichen), drei oder mehr Punkte zu «…», zwei Punkte zu einem. Platzhalter in eckigen Klammern bleiben stehen. Der Wortlaut ändert sich nie.
2. **Absätze** (`absaetze`): Hook (wenn gewählt), Ausgangslage, Problem, Wendepunkt, Ergebnis, Lehre, Bezug. Jeder Teil ist ein Absatz; ein leerer Bezug entfällt. Zwischen den Absätzen steht genau eine Leerzeile. Das Werkzeug fügt kein Emoji, keinen Hashtag und kein Ausrufezeichen hinzu; Satzzeichen der Person bleiben.
3. **Teile mit mehr als drei Sätzen** (`splitSentences` aus dem Caption-Baukasten, kennt Kürzel wie «Z.» und «z. B.»): Der Teil bleibt unverändert, ein Hinweis nennt ihn: «Teil n hat mehr als drei Sätze (Label). Das Werkzeug lässt ihn unverändert.» n zählt die sechs Felder (Ausgangslage = 1 … Bezug = 6).
4. **Hook** (`hooks`, `shorten`), nur aus Wörtern der Person:
   - Hook 1 = erster Satz des Ergebnisses.
   - Hook 2 = erster Satz des Ergebnisses ohne Schlusspunkt, «. Der Grund: », erster Satz des Wendepunkts. Endet der erste Satz auf «!», «?» oder «…» (von der Person getippt), folgt « Der Grund: » ohne zusätzlichen Punkt. Endet er auf Komma, Strichpunkt oder Doppelpunkt, fällt das Zeichen weg. Kein «..», «.:», «!.».
   - Länge: höchstens 140 Zeichen. Ist ein Hook länger, wird er am letzten Leerzeichen vor Zeichen 137 abgeschnitten (steht nach Zeichen 137 ein Leerzeichen, endet der Anfang an dieser Wortgrenze), Schlusszeichen (`, ; : . ! ? - – …` und Leerraum) vor dem Schnitt fallen weg, dann «…». Nie mitten in einer eckigen Klammer. Hat ein Hook kein Leerzeichen (ein Wort über 137 Zeichen), wird er hart bei 137 Zeichen geschnitten.
   - Hook 1 schneidet hart bei 137 Zeichen, wenn der Schnitt am Leerzeichen weniger als 30 Zeichen ergäbe (Annahme: ein Stummel wie «Ein…» ist kein Hook; ohne Quelle, eigene Regel).
   - Hook 2 entfällt, wenn er nach dem Kürzen kürzer als 30 Zeichen ist, den Text «Der Grund:» nicht mehr enthält (der erste Satz allein sprengt schon die Grenze) oder wie Hook 1 lautet. Dann gibt es nur Hook 1. Ohne Ergebnis gibt es keinen Hook.
   - Wirksame Wahl (`effectiveHook`): «Hook 2» ohne zweiten Vorschlag fällt auf Hook 1 zurück, ohne jeden Vorschlag auf «Ohne Hook». Im Ergebnis fehlt dann die Option «Hook 2», und eine Zeile sagt warum.
5. **Lesezeit** (`readingTime`): Wörter (Zeichenfolgen mit mindestens einem Buchstaben oder einer Ziffer) der LinkedIn-Fassung inklusive Hook, geteilt durch 200 Wörter pro Minute, auf halbe Minuten aufgerundet. Unter 200 Wörtern: «unter 1 Minute». Grenzen: 0 und 199 Wörter «unter 1 Minute», 200 «1 Minute», 201 «1,5 Minuten», 600 «3 Minuten». Annahme von Alperna, keine Statistik; im UI, im Dokument und im Seitentext so genannt.
6. **Instagram-Fassung** (`instagram`): dieselben Absätze (mit Hook), keine Hashtags. Höchstens 2'200 Zeichen (Richtwert von Alperna; die Plattform ändert die Grenze), gezählt mit `charCount` aus dem Caption-Baukasten (Unicode-Zeichen inklusive der Leerzeilen). Ist der Text länger: zuerst entfällt der Absatz «Bezug zur Leserin», dann der Absatz «Lehre». Wurde gestrichen, nennt der Hinweis genau, was fehlt: «Gekürzt: Bezug zur Leserin fehlt», «Gekürzt: Lehre fehlt», «Gekürzt: Lehre und Bezug zur Leserin fehlen». Reicht das nicht, bleibt der volle Text stehen, der Hinweis lautet «Zu lang für Instagram: kürze von Hand». Nichts wird mitten im Satz abgeschnitten. Die Regel steht als Kommentar an `instagram()` und ist getestet. Hinweis: Mit 400 Zeichen je Feld und einem Hook bis 140 Zeichen sind es ohne Bezug höchstens 2'150 Zeichen; mit gültigen Eingaben greift darum nur die erste Stufe. Die weiteren Stufen sichern `instagram()` für sich ab und sind mit Absätzen beliebiger Länge getestet.
7. **Faltkante**: `foldInfo`, `splitAtFold`, `counterLabel`, `foldHint` aus dem Caption-Baukasten (Instagram 125 Zeichen, LinkedIn 210 Zeichen oder das Ende der dritten Zeile). Die Vorschau dunkelt den Rest hinter der Kante ab; Hinweis «Richtwert von Alperna, keine Statistik; die Plattformen ändern das.»
8. **Platzhalter** (`platzhalter`, `placeholdersOf`): Alle `[Name]` der Angaben, jeder einmal. Das Ergebnis meldet «Noch ausfüllen: [Name], [Ort]». Sie blockieren nichts.
9. **Sperrliste** (`brandHits` aus `lib/brand-rules.ts`, dazu «jetzt», «nur noch», «garantiert», «Nr. 1» und «!»): Treffer in den Angaben erscheinen als Hinweis «In deinem Text steht ‹…›, das wir nicht empfehlen.» Ein Leerzeichen vor einem Satzzeichen heisst «Vor einem Satzzeichen steht ein Leerzeichen, das wir nicht empfehlen.» Nichts wird entfernt oder ersetzt.
10. **Anrede-Hinweis** (`anredeHinweise`): Steht in «Lehre» oder «Bezug zur Leserin» eine Form der anderen Anrede (bei Du: «Sie», «Ihnen», «Ihr…» gross und mitten im Satz; bei Sie: «du», «dich», «dir», «dein…»), meldet das Werkzeug «In «Bezug zur Leserin» steht ‹Ihrem›, gewählt ist aber Du. Passe die Anrede oder den Text an.» Die anderen Teile erzählen von Dritten und werden nicht geprüft. Der Text bleibt unverändert.
11. **Dokument** (`toDocument`): Kopf (Firma aus dem Profil, Datum), Steckbrief (Hook, Lesezeit, LinkedIn-Zähler, Instagram-Zähler), der Satz «Die Sätze sind deine; das Werkzeug ordnet sie.», «LinkedIn-Fassung» (ein Absatz je Block), «Instagram-Fassung» mit Hinweis, «Noch ausfüllen» und «Hinweise» nur, wenn es etwas zu melden gibt. Dateiname `story-post-<firma>`.
12. **Stand** (`mt:story-post`): `{ v: 1, phase: "edit" | "result", anrede: "du" | "sie" | "", felder: { ausgangslage, problem, wendepunkt, ergebnis, lehre, bezug }, hook: 0 | 1 | 2, output?: { linkedin, instagram } }`. `output` ist eine Momentaufnahme der beiden Texte beim Zusammenstellen und beim Hook-Wechsel; angezeigt wird immer der aus den Angaben berechnete Beitrag. `parseState` liefert bei kaputten Daten und fremder Version den leeren Stand, macht aus Werten falschen Typs leere Felder, kürzt Texte auf 400 Zeichen, setzt `phase: "result"` nur, wenn die Angaben `validate` bestehen, und lässt `output` bei ungültiger Form weg. `lib/progress.ts` erkennt `phase: "result"` als erledigt. Die Angaben werden beim Tippen mit 500 ms Verzögerung gespeichert.

## Ausgaben
- `ResultCard` «Dein Beitrag»: der Satz «Die Sätze sind deine; das Werkzeug ordnet sie.», «Noch ausfüllen: …» (nur bei Platzhaltern), die Hook-Wahl, die Vorschau LinkedIn (Text mit Faltkante, Zähler, Lesezeit, «LinkedIn-Text kopieren»), die Vorschau Instagram (Text mit Faltkante, Zähler, Zeichengrenze, Hinweis zur Kürzung, «Instagram-Text kopieren»), «Hinweise» (nur wenn es welche gibt), unten `DocumentExport` (Text kopieren, PDF, Word), «Angaben ändern», «Neu beginnen».
- CRM: siehe Zugang.

## Edge Cases (getestet)
- Leere Angaben, nur Leerraum, 19/20/400/401 Zeichen, freiwilliger Bezug leer, kurz, lang; mehrere Fehler zugleich in der Reihenfolge der Felder; Zeilenumbrüche und Mehrfach-Leerzeichen zählen als eines; Emojis zählen als ein Zeichen.
- Hook: genau 140 und 141 Zeichen; Schnitt an der Wortgrenze; nicht in Klammern; Wort ohne Leerzeichen; Stummel; erster Satz sprengt die Grenze; Hook 2 mit 29 und 30 Zeichen; kein Wendepunkt; kein Ergebnis; Ergebnis ohne Schlusspunkt, mit «!», «?», «…», «..», Komma; keine doppelten Satzzeichen in keiner Kombination.
- Lesezeit bei 0, 199, 200, 201, 300, 301, 400, 401, 600 Wörtern.
- Instagram bei genau 2'200 und 2'201 Zeichen, mit Emojis (2'200 Zeichen bei 4'400 UTF-16-Einheiten), alle drei Stufen, nur Lehre ohne Bezug, nie mitten im Satz.
- Teil mit vier Sätzen: Hinweis, Text unverändert; drei Sätze: kein Hinweis.
- Platzhalter, Sperrliste, Anrede-Hinweis (auch «Sie» am Satzanfang und Dritte in der Ausgangslage).
- Stand kaputt, falsche Version, falsche Typen, unbekannte Schlüssel, «result» mit unvollständigen Feldern.

## Texte
- Tagline (105 Zeichen): «Aus sechs Antworten wird ein Beitrag mit Hook für LinkedIn und Instagram, mit Zeichengrenze und Lesezeit.»
- SEO-Title: «Story-Post Schweiz: Geschichte in sechs Fragen» (46), Meta-Description (138): «Story-Post in sechs Fragen: Aus deiner Geschichte wird ein Beitrag mit Hook für LinkedIn und Instagram, mit Lesezeit. Ohne Konto, ohne KI.»
- Erklärtext-Gliederung: siehe `content/tools/story-post.md` (686 Wörter), Keyword «Story-Post» in H1, im ersten Absatz von «Warum das wichtig ist» und insgesamt vier Mal.
- FAQ: Schreibt das Werkzeug den Text? Warum ein Hook? Wie lang darf ein LinkedIn-Beitrag sein? (kein fester Wert ohne Quelle) Brauche ich ein Konto? Was bekommt Alperna, was bleibt im Browser?
- Alperna-Satz: «Eine Geschichte steht schnell, aber ein Auftritt mit regelmässigen Beiträgen braucht Zeit, die im Betrieb oft fehlt.» Baustein Social Media, Beweis `@baustein`.

## Tests
`tools/story-post/logic.test.ts` (72 Fälle) und `tools/story-post/Tool.test.tsx` (14 Durchläufe im Browser mit jsdom): Prüfung, Aufräumen, Hook-Muster und Kürzung, Aufbau der LinkedIn-Fassung, Lesezeit, Instagram-Grenze und Streichreihenfolge, Platzhalter, Sperrliste, Anrede, Dokument, CRM-Texte, Stand; im Browser Formular, E-Mail-Fenster, Hook-Wahl, CRM-Aufruf, Wiederherstellen, kaputte Daten.

## Nicht Teil dieses Tools
- Keine KI und kein Server: Neue Sätze schreibt das Werkzeug nicht (Idee für mehr: Post-Generator).
- Keine Hashtags, keine Emojis, keine Bilder, kein Planen oder Veröffentlichen.
- Keine festen LinkedIn-Grenzen ohne Quelle; die Zahlen für Faltkante, Instagram-Grenze und Lesezeit sind Richtwerte von Alperna.
- Kein Speichern mehrerer Entwürfe (das kann der Caption-Baukasten).
- Keine Rechtsaussagen zur Nennung von Kundschaft; der Seitentext rät nur, vorher zu fragen.

## Weg mit KI und Fix des doppelten Hook-Satzes (Stand 09.10.2026, Charge C4)
- **Doppelter Hook-Satz behoben.** Hook 1 ist der erste Satz des Ergebnisses; derselbe Satz stand danach noch einmal im Ergebnis-Absatz. Jetzt entfällt dieser Satz im Haupttext, wenn der Hook ihn ungekürzt trägt (`hookSaetze`, `absaetze`). Hook 2 («Satz. Der Grund: erster Satz des Wendepunkts») nimmt auch den ersten Satz des Wendepunkts aus dem Haupttext. Besteht der Absatz nur aus diesem Satz, entfällt er ganz. Ein gekürzter Hook («…») und «Ohne Hook» lassen den Haupttext unberührt. Wirkt auf LinkedIn-Fassung, Instagram-Fassung, Lesezeit, Dokument und CRM-Ausgabe.
- **Zwei Wege** (`Modus`): «Von der KI formulieren lassen» (Standard für neue Besucher; Stände ohne Angabe gelten als «Meine Sätze ordnen») und «Meine Sätze ordnen» (wie bisher, ohne KI). «Neu beginnen» behält den Weg.
- **Mit KI** genügen Stichworte: Pflichtfelder 8 statt 20 Zeichen (`KI_MIN`, `minOf`, `validate(felder, modus)`). Zusätzlich Branche und Ort (Profilfelder). Es gehen an die KI: Betrieb, Branche, Ort, Anrede, Tonalität und zu vermeidende Wörter aus dem Profil (nur wenn da), die sechs Antworten; nie die E-Mail-Adresse. Generator `story-post` (generator.ts, Registry tools/generators.ts), Route /api/generate.
- **Ausgabe der KI** sind die sechs Felder als ein bis drei Sätze. Die Prüfung `checkStory` verwirft: leere Pflichtfelder oder einen Bezug ohne Angabe («leer»), mehr als drei Sätze («saetze»), Ziffern, die nicht in den Angaben stehen («zahl»), ein Feld ohne Wort seiner Angabe («erfunden», Wortanfang von fünf Buchstaben), neue Platzhalter, bei Sie ein du-Wort, zu vermeidende Wörter. Dazu die gemeinsamen Regeln der Stimme (lib/generator.ts).
- **Zustand.** `StoryState` hat `modus` und `ki` (die Sätze der KI). Der Beitrag entsteht aus `beitragFelder` (KI-Sätze, sonst die Angaben der Person); `felder` bleiben die Stichworte für «Angaben ändern» und «Neu formulieren».
- **CRM.** Eingabe: «Weg: KI formuliert aus Stichworten» oder «Weg: Sätze der Person geordnet», dann die sechs Felder, Anrede, Hook. Ausgabe: LinkedIn-Fassung und Instagram-Zeile. «Neu formulieren» ist ein neues Ergebnis (geht erneut ins CRM); die Wahl des Hooks nicht.
- **Config.** `needsServer: true`, Zielgruppe KMU, Profilfelder firma, branche, ort, marke, organisationstyp.
