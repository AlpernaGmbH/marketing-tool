# Testimonial-Baukasten (testimonial)

## Nutzen in einem Satz
Für KMU und Vereine: Wer Kundschaft um ein Zitat bitten will, bekommt drei Fassungen der Nachricht mit Leitfragen; wer ein Zitat hat, bekommt daraus Kachel, Kurz-Referenz, Beitrag, Fallstudie und Prüfliste, in etwa fünf Minuten.

## Kategorie und Verknüpfung
Kategorie: content (Pfad «content», Schritt 15), audience: beide, Klasse C (alles im Browser, keine KI, kein Server).
Liest aus Profil: organisationstyp, firma (ProfileFieldsForm, Präfix `tb`).
Schreibt ins Profil: nichts (profilePatch: keiner).
Verwandte Werkzeuge: bewertungs-kit, story-post, caption-baukasten.

## Grundsatz
**Das Werkzeug erfindet nichts.** Das Zitat der Kundschaft bleibt wörtlich. Kürzen geht nur durch die Auswahl ganzer Sätze; die Lücke zwischen zwei nicht benachbarten Sätzen steht als «[…]». Zahlen und Ergebnisse stammen nur aus den Angaben der Person. Es gibt keine Rechtsaussagen: Die Prüfliste stellt Fragen und verweist bei Zweifeln auf eine Fachperson, ohne Paragrafen oder Pflichten zu nennen.

## Eingaben
Zuerst die Radiogruppe «Was brauchst du?» (Legende genau so): «Ich möchte um ein Zitat bitten» (Weg 1, Standard) und «Ich habe ein Zitat und baue die Referenz» (Weg 2). Danach «Dein Betrieb» (ProfileFieldsForm: organisationstyp, firma; bei Vereinen «Name des Vereins»). Firma ist Pflicht (Meldung «Gib den Namen deines Betriebs an.» / «… deines Vereins an.»).

### Weg 1: Zitat anfragen (IDs `tb-…`)
| Feld | Typ | Pflicht | Validierung | Hilfetext |
|---|---|---|---|---|
| Wie sprichst du die Person an? | Radios Du / Sie | ja (Standard aus dem Profil, sonst Du) | | Gilt für alle Fassungen |
| Wie erreichst du sie? | Radios WhatsApp / E-Mail / Im Gespräch | ja (Standard WhatsApp) | | «Im Gespräch» liefert statt Brief einen Gesprächsleitfaden |
| Vorname der Person | Input | ja | 2 bis 40 Zeichen | Bei «Sie» darf auch «Frau Keller» stehen |
| Was habt ihr zusammen gemacht? | Input | ja | 5 bis 120 Zeichen | Der Satz in der Nachricht lautet «Danke für …»; ohne Namen der Person |
| Leitfragen | Checkboxen (6) | ja | genau 2 bis 3; Standard die ersten drei | Fragen, die sich mit zwei Sätzen beantworten lassen |
| Freigabe | Radios: Vorname und Ort / Voller Name / Name und Firma / Anonym (ohne Namen) | ja (Standard Vorname und Ort) | | Wie darf das Zitat erscheinen? |

Leitfragen: «Wie war die Lage, bevor wir angefangen haben?», «Was hat dich überzeugt, uns zu beauftragen?», «Was hat sich für dich verändert?», «Was würdest du jemandem sagen, der zögert?», «Würdest du uns weiterempfehlen, und warum?», «Was hat dich überrascht?». Die Beschriftung im Formular ist immer die Du-Form; in der Nachricht stehen sie in der gewählten Anrede.

### Weg 2: Referenz bauen
| Feld | Typ | Pflicht | Validierung | Hilfetext |
|---|---|---|---|---|
| Zitat der Kundschaft | Textarea | ja | 20 bis 600 Zeichen | Wörtlich einfügen |
| Diese Sätze in der Kachel zeigen | Checkboxen, je Satz des Zitats | mindestens ein Satz | alle vorgewählt | Entsteht automatisch aus dem Zitat |
| Wie soll die Person genannt werden? | Radios: Vorname und Ort / Voller Name / Name und Firma / Ohne Namen | ja (Standard Vorname und Ort) | | |
| Name | Input | ausser bei «Ohne Namen» | 2 bis 60 | Bei «Vorname und Ort» nur der Vorname |
| Ort oder Firma | Input | bei «Vorname und Ort» und «Name und Firma» | 2 bis 60 | |
| Funktion (freiwillig) | Input | nein | bis 60 | Nicht bei «Ohne Namen» |
| Was habt ihr gemacht? | Input | ja | 5 bis 160 | |
| Ausgangslage | Textarea | ja | 10 bis 300 | |
| Was habt ihr getan? | Textarea | ja | 10 bis 300 | |
| Ergebnis (freiwillig) | Textarea | nein | leer oder 10 bis 300 | Nur, was stimmt und sich belegen lässt |

Knöpfe: «Nachricht erstellen» (Weg 1), «Referenz bauen» (Weg 2). Beide prüfen zuerst (Meldungen in einer Liste mit role="alert", Fokus ins erste fehlerhafte Feld) und rufen dann `ensureEmail()` auf. Schliesst die Person das Fenster mit «Später», bleibt das Formular stehen.

## Logik
Alle Funktionen stehen in `logic.ts`, deterministisch, ohne Zufall.

### Weg 1
1. `buildAnfrage`: drei Fassungen aus Vorlagen, in die Vorname, «Danke für <Leistung>» (ohne Schlusspunkt der Eingabe), die gewählten Leitfragen in der Anrede, die Freigabe-Frage und der Firmenname eingesetzt werden.
   - Kurz, für WhatsApp: Gruss, Dank, Bitte um zwei, drei Sätze, nummerierte Leitfragen, Freigabe-Frage, Gruss mit Firma.
   - Persönlich, für E-Mail: mit Betreff, Dank, Bitte, Leitfragen, Freigabe-Frage, Satz «Wenn es gerade nicht passt, ist das in Ordnung.».
   - Förmlich: Betreff, «Guten Tag», Dank, Bitte, Leitfragen, Freigabe-Frage, «Deine/Ihre Antwort ist freiwillig …».
   - Reihenfolge: bei WhatsApp zuerst Kurz, bei E-Mail zuerst Persönlich; die zum Weg passende Fassung trägt den Vermerk «Passt zu deinem Weg». Jede Fassung zeigt ihre Zeichenzahl.
   - «Im Gespräch»: keine Fassungen, sondern Gesprächsleitfaden: ein Einstiegssatz («Hallo …. Danke noch einmal für …. Hast du kurz Zeit? …»), die Leitfragen und ein Schlusssatz («Danke. Ich lese dir vor, was ich notiert habe.» plus Freigabe-Frage).
2. Freigabe-Frage nach Wahl: «Darf ich dein Zitat mit Vorname und Ort zeigen?», «… mit deinem vollen Namen zeigen?», «… mit deinem Namen und deiner Firma zeigen?», «… ohne Namen zeigen?» (Sie-Fassung: «Ihr Zitat», «Ihrem vollen Namen», «Ihrem Namen und Ihrer Firma»).
3. Hinweise: Tipp zu Fragen, die man mit zwei Sätzen beantwortet; «Zeig die Worte so, wie die Person sie schreibt»; «Nenn, wo du das Zitat zeigst»; Nachfassen nach etwa einer Woche, ruhig, mit einem Satz (Richtwert von Alperna, keine Statistik). Dazu ein fertiger Nachfass-Satz in der Anrede.

### Weg 2
1. Zitat bereinigen (`cleanZitat`): Zeilenumbrüche und doppelte Leerzeichen werden zu einem Leerzeichen; umschliessen Anführungszeichen den ganzen Text (« », „ “, “ ”, " "), fallen sie weg. Sonst ändert sich kein Zeichen. Eine Rechtschreibkorrektur (ß, Prozent) findet im Zitat bewusst nicht statt.
2. Satzteilung (`zitatSaetze`): Sätze enden auf . ! ? … (auch mit schliessendem Anführungszeichen), wenn ein Grossbuchstabe, eine Ziffer oder ein Anführungszeichen folgt. Kürzel («Dr.», «Nr.», «z. B.», «ca.», «St. Gallen»), Einzelbuchstaben und ein- oder zweistellige Zahlen («am 5. Mai») beenden keinen Satz. Das ist die Funktion `splitSentences` des Caption-Baukastens.
3. Auswahl (`zitatAuswahl`): Die Auswahl gilt je Satz (gespeichert wird, was abgewählt ist, nicht die Position). Gezeigte Sätze werden mit einem Leerzeichen verbunden; liegt zwischen zwei gezeigten Sätzen mindestens ein abgewählter, steht dazwischen «[…]». Am Anfang und am Ende steht nie «[…]»; fehlt dort ein Satz, sagt ein Hinweis, dass das Zitat gekürzt ist. Eckige Klammern des Zitats bleiben unverändert. Innere Anführungszeichen werden zu ‹ › (Schweizer Verschachtelung), weil das Zitat in « » steht.
4. Nennung (`quelle`): Vorname und Ort: «Anna, Gossau»; Voller Name: «Anna Keller»; Name und Firma: «Anna Keller, Keller AG»; Ohne Namen: «Eine Kundin oder ein Kunde». Eine freiwillige Funktion steht nach dem Namen («Anna, Hauseigentümerin, Gossau»). Bei «Ohne Namen» erscheint nie ein Name, auch wenn das Feld noch gefüllt ist.
5. Zitat-Kachel: «Auswahl» und darunter die Nennung.
6. Kurz-Referenz: genau drei Sätze, je der erste Satz von Ausgangslage, Was habt ihr getan und Ergebnis, in den Wörtern der Person. Angepasst werden nur Grossschreibung am Satzanfang (wenn der Satz klein beginnt), Schlusspunkt (fehlt er, kommt «.» hin; ein Komma, Strichpunkt oder Doppelpunkt am Ende wird zu «.») und Schweizer Schreibweise (typoCH). Fehlt das Ergebnis, sind es zwei Sätze. Hat eine Angabe mehr als einen Satz, sagt ein Hinweis, dass die Kurz-Referenz nur den ersten nimmt; die Fallstudie enthält alles.
7. Beitrag: LinkedIn-Fassung = Hook (erster gezeigter Satz des Zitats in « ») + Kurz-Referenz + «Danke an <Name> für das Vertrauen.» (nur wenn ein Name gezeigt wird; bei «Name und Firma» nur der Name). Instagram-Fassung (kürzer) = Hook + Sätze zu «Was getan» und «Ergebnis» + Dank-Satz. Keine Hashtags. Zeichenzahl und Faltkante mit `counterLabel` des Caption-Baukastens (Richtwert von Alperna, keine Statistik).
8. Fallstudie (DocumentModel): Titel «<Leistung> für <Kundschaft>» (Vorname und Ort: «Anna aus Gossau»; Voller Name: «Anna Keller»; Name und Firma: die Firma; Ohne Namen: «unsere Kundschaft»), Untertitel «Fallstudie», dann das gezeigte Zitat mit Nennung, «Ausgangslage», «Aufgabe» (= Was habt ihr gemacht?), «Vorgehen» (= Was habt ihr getan?), «Ergebnis» (nur wenn angegeben), «Das Zitat im Wortlaut» (ganzes Zitat mit Nennung). Der Dateiname enthält die Leistung, nie den Namen der Person.
9. Prüfliste (nur Fragen) plus «Bei Zweifeln frag eine Fachperson.»: Zustimmung zu Name, Foto und Firma (bei «Ohne Namen»: Zustimmung zur Veröffentlichung ohne Namen und die Frage, ob der Rest des Textes die Person verrät); Zitat wörtlich oder Kürzung abgestimmt; Ergebnis ohne Übertreibung und mit Beleg; Foto passt zum Zitat; abgemacht, bis wann das Zitat auf Wunsch entfernt wird; ohne Ergebnis zusätzlich die Erinnerung, dass ein belegbares Ergebnis die Referenz stärkt.
10. Hinweise:
    - Floskeln (data/floskeln.json über `findingsOf` des Textchecks) nur in Ausgangslage, Was habt ihr getan, Ergebnis; nie im Zitat der Kundschaft.
    - Zitat (so wie gezeigt, ohne «[…]») unter 40 Zeichen: «sehr kurz»; über 280 Zeichen: «lang». Die Grenzen sind ein Richtwert von Alperna, keine Statistik, und stehen nicht im UI.
    - Gekürzt: «Sprich die Kürzung mit der Person ab.» und, dass die Fallstudie das ganze Zitat zeigt.
    - «Vorname und Ort» gewählt, aber mehr als ein Wort im Feld Name: Rückfrage.

## Annahmen und Richtwerte
- Alle Zahlen im Werkzeug sind Eingaben der Person oder Grenzen der Eingabefelder. Es gibt keine Statistik und keine Datei mit Quellen ausser `data/floskeln.json` (bestehend, mit `meta.source`).
- «Nach etwa einer Woche nachfassen»: Richtwert von Alperna, keine Statistik (steht im UI, im Seitentext und in der FAQ so).
- «Sehr kurz» unter 40 und «lang» über 280 Zeichen des gezeigten Zitats: Richtwert von Alperna, keine Statistik. Die Zahlen stehen nirgends im UI, nur die Wörter «sehr kurz» und «lang».
- «Ein bis drei Sätze reichen meist»: Richtwert von Alperna, keine Statistik (FAQ).
- Zeichenzahl und Faltkante der Beiträge: `counterLabel` des Caption-Baukastens mit dessen Hinweis («Richtwert von Alperna, keine Statistik; die Plattformen ändern das.»).
- Annahme: Die Person schreibt «Was habt ihr zusammen gemacht?» so, dass der Satz «Danke für …» stimmt (Hilfetext und Beispiel sagen es). Das Werkzeug beugt nichts.
- Annahme: Bei «Sie» steht im Feld «Vorname der Person» auf Wunsch auch «Frau Keller»; die Anrede der Nachricht ist dann «Guten Tag Frau Keller».

## Ausgaben
- Weg 1: Karte «Deine Nachricht» mit den Fassungen (Kopieren-Knopf je Fassung, Zeichenzahl) oder dem Gesprächsleitfaden; Liste der Leitfragen in der Nachricht; Hinweise; Nachfass-Satz mit Kopieren-Knopf. Keine Dateien.
- Weg 2: Karte «Deine Referenz» mit Kachel (Kopieren), Kurz-Referenz (Kopieren), Beitrag LinkedIn und Instagram (je Kopieren, Zeichenzahl), Fallstudie am Bildschirm (DocView) mit «Text kopieren», «PDF herunterladen», «Word herunterladen» (DocumentExport, Downloads über `guardDownload`), Prüfliste, Hinweise.
- Beide Karten: «Angaben ändern» und «Neu beginnen».

## Zugang v3 und CRM
- Das Ergebnis erscheint erst nach `ensureEmail()`. Danach einmal `sendResult({ eingabe, ausgabe })`; beim Neuladen steht das Ergebnis ohne neuen CRM-Eintrag wieder da.
- **Weg 1 sendet nie den Vornamen der Person** (Daten Dritter). `eingabe` beginnt mit «Weg: Zitat anfragen», nennt Anrede, Weg, «Vorname: ja» (oder «nein»), die Leistung (der Vorname wird dort durch «[Vorname]» ersetzt, falls er vorkommt), die Leitfragen und die Freigabe. `ausgabe` enthält die Fassungen mit «[Vorname]» statt des Namens.
- **Weg 2** sendet das Zitat der Kundschaft nur unter der Bezeichnung «Zitat der Kundschaft» und den Namen der Person nur, wenn er im Ergebnis gezeigt wird («Genannt wird: …»); bei «Ohne Namen» steht dort nichts. `ausgabe` ist das Markdown aus Kachel, Kurz-Referenz, Beiträgen und Fallstudie.
- Die Seite sagt das in der Einleitung und in der FAQ «Was geht ins CRM?».
- Stand unter `mt:testimonial`: `{ v: 1, modus: "anfrage" | "referenz", phase: "edit" | "result", anfrage, referenz, output?: { ausgabe } }`. Zitat, Name und Vorname der Kundschaft liegen im Stand (nur im Browser), wie die Eingaben in anderen Werkzeugen. `phase: "result"` zählt für lib/progress. Kaputte Daten ergeben den leeren Stand; ein Ergebnis mit unvollständigen Angaben fällt auf «edit».

## Edge Cases
- Zitat mit einem einzigen Satz: eine einzige Checkbox. Wählt die Person sie ab, kommt die Meldung «Wähle mindestens einen Satz für die Kachel.» (mindestens ein Satz ist Pflicht).
- Zitat in Anführungszeichen eingefügt: die äusseren Zeichen fallen weg; ein Zitat mit mehreren Anführungspaaren bleibt unverändert (innen ‹ ›).
- Kürzel («Dr.», «Nr.», «z. B.», «St. Gallen») und Ordnungszahlen («am 5. Mai») teilen keinen Satz.
- Kleingeschriebene Fortsetzung nach einem Punkt teilt nicht (konservativ); die Sätze bleiben dann ein Block.
- Ausgangslage ohne Schlusspunkt, klein begonnen oder mit Komma am Ende: wird zu einem Satz mit Grossbuchstabe und Punkt.
- Ergebnis leer: Kurz-Referenz mit zwei Sätzen, Prüfliste mit Erinnerung, kein Ergebnis-Abschnitt in der Fallstudie.
- Anonym gewählt, Namensfelder noch gefüllt: Name erscheint nirgends, auch nicht im CRM.
- Firma fehlt im Profil: Meldung vor dem Erstellen; nach dem Löschen des Profils steht in einer gespeicherten Nachricht «[Firma]».
- Weniger als zwei oder mehr als drei Leitfragen: Meldung, kein Ergebnis.
- Profil leer: Standard KMU, Anrede Du.
- Daten-Datei: nur data/floskeln.json (bestehend, mit Quelle).

## Texte
- Tagline (≤ 110 Zeichen): «Aus einem Kundenzitat werden Kachel, Beitrag und Fallstudie, dazu die Nachricht, mit der du darum bittest.»
- SEO-Title: «Testimonial Schweiz: Kundenzitat anfragen und nutzen»
- Meta-Description: siehe content/tools/testimonial.md.
- FAQ: Darf ich ein Zitat einfach veröffentlichen? Was, wenn niemand schreibt? Wie lang soll ein Zitat sein? Brauche ich ein Konto? Was geht ins CRM? Was bleibt im Browser?
- Alperna-Baustein: Website (Zitate gehören auf die Website), `beweis: @baustein`.

## Tests
Mindestens 40 Fälle in `logic.test.ts`, dazu `Tool.test.tsx`: Satzteilung (Kürzel, ?, !, Anführungszeichen, ein Satz), Kürzung mit «[…]» nur zwischen nicht benachbarten Sätzen, Zitat wörtlich (Zeichenvergleich), vier Nennungen in Kachel, Beitrag und Fallstudie, Anonym ohne Namen, Kurz-Referenz mit und ohne Ergebnis, Leitfragen 2 bis 3, Du- und Sie-Fassung, drei Wege, Zeichenzählung, Sperrliste über alle erzeugten Texte, Hinweise nur für Eigentexte, Prüfliste, DocumentModel-Blöcke, parseState bei kaputten Daten, Eingabe ohne Daten Dritter bei Weg 1, Zahlen des Beispiels im Seitentext.

## Nicht Teil dieses Tools
- Keine KI, kein Umschreiben, kein Glätten, keine Übersetzung des Zitats.
- Keine Rechtsaussagen, keine Mustertexte für Einwilligungen; die Prüfliste fragt nur.
- Keine Bilder, kein Foto-Zuschnitt, keine grafische Kachel als PNG (die Kachel ist Text für die Website).
- Keine Hashtags, keine Plattform-Faltkante für die Kachel.
- Keine Speicherung von Zitaten auf dem Server und keine Sammlung mehrerer Zitate.

## Bildschirm-Bausteine (Stand 09.10.2026, Charge C6)
Die Fallstudie erscheint am Bildschirm mit Ausgangslage, Aufgabe, Vorgehen und Ergebnis als vier nummerierte Schritte (`fallstudieBildschirm`, `steps`); Zitat, Quelle und «Das Zitat im Wortlaut» bleiben. Die Datei (PDF, Word) behält die Überschriften der Fallstudie.
