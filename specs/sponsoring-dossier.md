# Sponsoring-Dossier (sponsoring-dossier)

Klasse C (Rechner und Dokument im Browser) mit freiwilligem KI-Teil, Stand 05.10.2026. Das Dossier entsteht ohne KI und ohne Server (`logic.ts`, `export.ts`). Die KI schreibt auf Wunsch drei Absätze dazu: `generator.ts` (Klasse B, `useGenerator`, Route `/api/generate`) nach dem Vorbild `tools/nutzenversprechen`. Muster für den Zugang: `tools/budget-planer` und `tools/gbp-feiertage` (Formular, Stand unter `mt:<slug>`, `ensureEmail` vor dem Ergebnis), `tools/medienmitteilung` (Kontaktdaten bleiben im Browser). Getestet sind `logic.ts`, `generator.ts`, `export.ts` und die Oberfläche (`Tool.test.tsx`).

## Nutzen in einem Satz
Für Vereinsvorstände, die Betriebe um Sponsoring bitten wollen: in rund 20 Minuten (Angabe vom 09.10.2026, vorher acht; mit allen freiwilligen Angaben länger) ein Sponsoring-Dossier mit Deckblatt, Verein in Zahlen, Zielgruppe, Paketen im Vergleich, Referenzen, nächsten Schritten und Kontakt, als PDF mit Vereinsfarbe oder Word, dazu eine Ampel, ob Gegenleistung und Preis zusammenpassen.

## Formular kürzer (09.10.2026)
Sichtbar bleiben Verein (Profilfelder, Anlass), Mitglieder (einzige Pflichtzahl), Zielgruppe, Paket 1 und die Ansprechperson. Zugeklappt (`Weitere`, offen, sobald etwas darin steht): übrige Zahlen, Paket 2 und 3, Referenzen, Farbe und Stichworte für die KI. Das Werkzeug bleibt ein Werkzeug für Vereine (Mitglieder, Trikot, Bande); der Wortlaut für KMU ist offen und braucht einen Entscheid von Alperna.

## Kategorie und Verknüpfung
Kategorie: content, Zielgruppe: verein, dritter Schritt im Pfad «Für Vereine» (`pathStep` `{ path: "vereine", order: 3 }`)
Liest aus Profil: organisationstyp, firma, ort, kanton, website (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt; sie gehen beim Erstellen als Kopie in den Stand)
Schreibt ins Profil: nichts (`writesProfile: []`). Die Grunddaten-Felder schreiben beim Tippen in das Profil, wie beim Marketing-Check.
Verwandte Tools: kommunikationskonzept, anspruchsgruppen, empfehlungsprogramm
`needsServer: true`: nur für den freiwilligen KI-Teil geht etwas an `/api/generate` (Ausnahme in Harte Regel 1).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Dossier erstellen» prüft das Werkzeug die Eingaben (`inputProblem`, Meldung in `role="alert"`, `id="sd-error"`), dann `await ctx.ensureEmail()`. Bei «Später» bleibt das Formular stehen, es gibt kein Ergebnis und keinen CRM-Eintrag.
- **Jedes Ergebnis geht ins CRM:** `ctx.sendResult({ eingabe, ausgabe })` nach dem sichtbaren Dossier. Eingabe = `eingabeText` (Verein, Ort, Anlass oder Saison, Kennzahlen, Zielgruppe, Pakete mit Preis und Gegenleistungen, Website; je eine Zeile). Ausgabe = `reportMarkdown`: vorne ein Satz mit der Einschätzung der Ampel, dann das Dossier als Markdown. **Weder Eingabe noch Ausgabe enthalten Kontaktdaten oder die Namen der Referenzen** (die Eingabe sagt nur «Referenzen: angegeben (die Namen bleiben im Browser)»), und die Stichworte für die KI stehen nicht in der ersten Eingabe.
- **KI-Texte:** `useGenerator(sponsoringGenerator, { eingabe: kiEingabeText, ausgabe: kiAusgabeText }).generate(input)` macht Fenster, Anfrage, Wiederholung bei 403 und einen zweiten CRM-Eintrag mit den Angaben an die KI (inklusive Stichworte) und den drei Absätzen.
- **Downloads** (PDF, Word): über `ctx.guardDownload` (`DossierExport`), `downloadBytes`. «Text kopieren» ist frei.
- Kein Limit pro Person; Schutz sind 20 Entwürfe pro Stunde und IP-Hash (`/api/generate`) und die globale Tagesgrenze `AI_DAILY_CAP`.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin / Name des Vereins | Auswahl, text (`ProfileFieldsForm`) | Name ja | Profil `organisationstyp`, `firma` | 1 bis 120 Zeichen; leer → «Gib den Namen deines Vereins an.» | «Name, Ort, Kanton und Website speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Ort, Kanton, Website | text, Auswahl, text (`ProfileFieldsForm`) | nein | Profil | Ort bis 120; erscheint als «Trogen AR» im Untertitel | – |
| Anlass oder Saison (freiwillig) | text | nein | – | bis 80 Zeichen | «Steht auf dem Deckblatt, zum Beispiel «Saison 2026/27» oder «Dorffest 2027».» |
| Mitglieder | number | ja | – | ganze Zahl 1 bis 1'000'000; leer → «Gib die Zahl der Mitglieder an.» | «Ganze Zahl, mindestens 1. Sie bestimmt den Faktor der Ampel.» |
| Davon Aktive, Zuschauer pro Anlass, Anlässe pro Jahr, Follower auf Instagram, Follower auf Facebook, Website-Besuche pro Monat, Medienberichte pro Jahr | number | nein | – | ganze Zahl 0 bis 1'000'000 (Anlässe 1'000, Follower 100'000'000, Besuche 1'000'000'000, Medienberichte 10'000); Aktive nicht über den Mitgliedern | «Nur Zahlen, die der Verein selbst angibt. Sie erscheinen im Dossier als Angaben des Vereins. … leer oder 0 lässt die Zeile im Dossier weg.» |
| Welche Betriebe passen zu euch, und warum? | textarea | ja | – | 10 bis 300 Zeichen | Beispiel mit Trogen, Speicher und Teufen; Zähler «n von 300 Zeichen, mindestens 10» |
| Paket 1 bis 3: Name | text | nein | Vorschlag Bronze, Silber, Gold (als Wert) | bis 40 Zeichen; leer → der Vorschlag; keine doppelten Namen (ohne Gross- und Kleinschreibung) | «Vorschlag: Bronze. Jedes Paket braucht einen eigenen Namen.» |
| Paket n: Preis in CHF | number | ja, sobald das Paket angefangen ist | – | ganze Zahl CHF 50.- bis CHF 100'000.- | «… pro Saison oder Jahr, wie ihr das Paket anbietet. Leer lassen, wenn es das Paket nicht gibt.» |
| Paket n: Gegenleistungen | sieben Kontrollkästchen: Logo auf Trikot, Logo auf Bande, Logo auf Website, Logo im Newsletter, Nennung bei Anlässen, Stand am Anlass, Nennung in Medienmitteilungen | mindestens eine Gegenleistung je Paket | – | `aria-label` «Paket n: <Gegenleistung>», 24-px-Kästchen | – |
| Paket n: Beiträge auf Social Media pro Jahr | number | nein | – | ganze Zahl 0 bis 52 | «0 bis 52. Leer oder 0: nicht im Paket.» |
| Paket n: Tickets oder Einladungen pro Jahr | number | nein | – | ganze Zahl 0 bis 1'000 | «Leer oder 0: nicht im Paket.» |
| Paket n: Weitere Gegenleistung (freiwillig) | text | nein | – | bis 120 Zeichen | «Bis 120 Zeichen, zum Beispiel «Stand am Dorffest».» |
| Bisherige Sponsoren und Partner | textarea | nein | – | bis 300 Zeichen, je Zeile ein Betrieb | Label: «… (nenne nur Betriebe, die einverstanden sind)»; «Die Namen erscheinen im Dossier, gehen aber nicht an die KI und nicht an Alperna.» |
| Name der Ansprechperson | text | ja | – | bis 120 Zeichen; leer → «Gib eine Ansprechperson für Rückfragen an.» | – |
| Funktion, Telefon, E-Mail der Ansprechperson | text, tel, email | nein | – | Funktion bis 80, Telefon bis 40, E-Mail bis 120 und mit «@» und Punkt, sonst «Prüfe die E-Mail-Adresse der Ansprechperson.» | «Die Kontaktdaten stehen im Dossier, gehen aber nicht an die KI und nicht an Alperna.» |
| Vereinsfarbe | color | nein | Standard #111A28 | Hex-Wert; Kontrast zu Papier (#FFFDF8) mindestens 3:1, sonst «Diese Farbe ist auf Papier zu hell. Wähle eine dunklere für Deckblatt und Tabellenkopf.» | «… deine hat n zu 1»; Wert als Text daneben (`data-testid="farbe-wert"`) |
| Stichworte zum Verein (freiwillig) | textarea | nein | – | bis 600 Zeichen; ab 10 Zeichen ist der KI-Knopf aktiv | «… ohne Stichworte bleibt der Knopf aus.» |

Ein Paket gilt als angefangen, sobald Preis, eine Gegenleistung (Kästchen, Beiträge, Tickets) oder ein Freitext da ist; der Name allein zählt nicht. Mindestens ein Paket muss vollständig sein. Pakete, die niemand anfasst, fehlen im Dossier.

Es gibt keinen Logo-Upload (bewusst weggelassen).

## Logik
1. **Eingabe prüfen** (`inputProblem(form)`), in der Reihenfolge des Formulars: Verein leer; Anlass zu lang; Mitglieder fehlen oder ausserhalb 1 bis 1'000'000; jede freiwillige Zahl, die nicht ganz ist oder ausserhalb ihrer Grenze liegt; mehr Aktive als Mitglieder; Zielgruppe unter 10 oder über 300 Zeichen; kein Paket angefangen; je angefangenem Paket (Name, Dopplung, Preis, Beiträge, Tickets, Freitext, mindestens eine Gegenleistung); Referenzen über 300 Zeichen; Ansprechperson leer; E-Mail ohne «@» und Punkt; Vereinsfarbe ungültig oder zu hell; Stichworte über 600 Zeichen. Eine Meldung, kein Aufruf des Servers.
2. **Zahlen lesen** (`parseGanzzahl`): Apostrophe und Leerzeichen als Tausendertrenner und ein «.-» am Ende sind erlaubt; Komma, Dezimalpunkt und Buchstaben sind keine ganze Zahl.
3. **Punkte je Paket** (`paketPunkte`, Richtwert von Alperna, keine Statistik): Logo auf Trikot 5, Logo auf Bande 3, Logo auf Website 1, Logo im Newsletter 1, Nennung bei Anlässen 2, Stand am Anlass 3, Nennung in Medienmitteilungen 2; Beitrag auf Social Media 0,5 je Beitrag, höchstens 5; Tickets oder Einladungen 0,25 je Stück, höchstens 3; weitere Gegenleistung 1.
4. **Faktor nach Mitgliedern** (`reichweitenFaktor`, Richtwert von Alperna): unter 100 → 1; 100 bis 300 → 1,5; über 300 → 2.
5. **Rahmen** (`preisrahmen`): Punkte × Faktor × CHF 100.-. Richtwert von Alperna, keine Marktdaten.
6. **Ampel** (`ampel(preis, rahmen)`, Einschätzung von Alperna, keine Statistik): Preis von 60 % bis 140 % des Rahmens → grün «passt»; darunter → gelb «eher günstig»; über 140 % bis 250 % → gelb «eher hoch»; über 250 % → rot «passt nicht zur Gegenleistung». Die Grenzen gehören zu «passt» (60 % und 140 % sind grün, 250 % ist noch gelb); der Vergleich rechnet mit ganzen Zahlen (Punkte sind Vielfache von 0,25, Faktoren von 0,5), also ohne Rundungsfehler. Ohne Rahmen (keine Punkte) gibt es keine Einschätzung. Die angezeigte Prozentzahl liegt auf derselben Seite der Grenze wie die Farbe. Die Pakete bleiben, wie sie eingegeben wurden.
7. **Dokument** (`toDocument(form, ki, { datum, crm })`): Deckblatt mit Titel «Sponsoring <Verein>» und Untertitel «<Anlass oder Saison>, <Ort Kanton>»; «Porträt des Vereins» (nur mit KI); «Der Verein in Zahlen» als Tabelle mit nur den angegebenen Werten (grösser als 0) und dem Satz «Alle Zahlen sind Angaben des Vereins.»; «Zielgruppe: Welche Betriebe zu uns passen»; «Warum Sponsoring hier wirkt» (nur mit KI); «Pakete im Vergleich» als Tabelle Gegenleistung × Paket mit «✓» und «–» (Beiträge und Tickets als Zahl, der Freitext als Text; Zeilen, die kein Paket enthält, fehlen) und einer Preiszeile am Ende, dazu «Preise und Gegenleistungen legt der Verein fest.»; «Bisherige Sponsoren und Partner» (Liste bei mehreren Zeilen); «Nächste Schritte» mit dem Dank der KI (falls da) und drei festen Schritten (Gespräch, Vertrag auf Papier, Dank und Bericht); «Kontakt» mit Ansprechperson, Telefon, E-Mail, Website. Das Dossier spricht Sponsoren in der Sie-Form oder neutral an, nie mit Du. **Die Ampel steht nicht im Dossier**: Sie ist eine Einschätzung für den Verein, nicht für Sponsoren. Mit `crm: true` fehlen «Kontakt» und «Bisherige Sponsoren und Partner».
8. **Eingabe an die KI** (`toKiInput(form)`, Schema `sponsoringInput`): verein (≤ 120), ort (≤ 120, «Trogen AR»), stichworte (10 bis 600), zielgruppe (10 bis 300), zahlen (höchstens 8 Einträge `{ label, wert }` mit ganzen Zahlen), pakete (1 bis 3 Einträge `{ name, preis, leistungen }`). **Nie** Kontaktdaten, Referenzen, Website, Vereinsfarbe oder E-Mail-Adresse. Ohne Stichworte (unter 10 Zeichen) oder bei unvollständigen Angaben ist die Eingabe `null` und der Knopf aus.
9. **KI** (`sponsoringGenerator`): System-Prompt = `GENERATOR_RULES` plus Aufgabe (nüchtern, konkret, Schweizer Vereinsalltag; Wir-Form des Vereins oder dritte Person, Sie-Form oder neutral gegenüber Betrieben, nie Du; Ziffern nur aus den Angaben; keine Superlative und keine Wirkungsversprechen; keine erfundenen Partner; keine Aussagen über Steuern oder Verträge; Platzhalter in eckigen Klammern); Nutzernachricht = `dataPrompt("Angaben zum Verein", input)`; `maxTokens` 900, `temperature` 0,5. Antwort: `portraet` 150 bis 600, `warum` 120 bis 500, `dank` 80 bis 300 Zeichen. Prüfung in der Route (`checkGenerated`: JSON, Schema, Sperrliste, Links nur aus den Angaben) und eigene Prüfung `checkSponsoring`: «zahl» (eine Ziffernfolge in einem Absatz steht nicht in den Angaben: Texte, Kennzahlen, Preise, Gegenleistungen) und «anrede» (`hasDuForm` aus `tools/markenplattform/generator.ts` findet du, dich, dir oder dein). Verworfene Antworten geben 502 und die Meldung «Die KI hat keinen brauchbaren Entwurf geliefert. Versuch es noch einmal.»
10. **Alte KI-Texte** (`kiSignatur(form)`): Die Texte gelten für die Eingabe an die KI, für die sie geschrieben wurden (Signatur im Stand). Ändert sich beim erneuten «Dossier erstellen» die Eingabe (Preis, Gegenleistung, Zielgruppe, Zahl, Stichworte, Name, Ort), fallen die Texte weg; ändern sich nur Kontakt, Referenzen, Farbe oder Anlass, bleiben sie.
11. **PDF** (`buildDossierPdf(model, farbe, fonts)`): A4, Geist eingebettet. Deckblatt mit Farbfläche in der Vereinsfarbe (Titel, Untertitel, Datum), Schrift darauf Weiss oder Tinte, je nachdem, was mehr Kontrast gibt (`textOn`); ab Seite 2 eine Linie in der Vereinsfarbe im Kopf, ein kurzer Balken vor jeder Überschrift, Tabellenkopf in der Vereinsfarbe, Häkchen als Linienzug (Geist hat kein «✓»); Fuss «Erstellt mit tools.alperna.ch» und Seitenzahl. Tabellen, die auf eine Seite passen, bleiben zusammen und mit ihrer Überschrift. **Word** hat keine Vereinsfarbe (der Baustein `lib/export/docx.ts` kennt keine Farbe).
12. **Stand speichern** (`mt:sponsoring-dossier`): `{ v: 1, phase: "edit" | "result", form, ki, kiSig }`. Jede Eingabe wird sofort mit `phase: "edit"` gespeichert (Zwischenstand), das Dossier mit `phase: "result"`. `parseState` liefert bei kaputten Daten oder falscher Version den leeren Stand; `result` gilt nur, wenn das Formular die Prüfung besteht, sonst `edit`; kaputte KI-Texte fallen allein weg; getippter Text bleibt unverändert (auch mit Leerzeichen am Ende). Der Pfad-Fortschritt erkennt das Ergebnis an `phase: "result"`.

## Ausgaben
- Ergebnis: `ResultCard` «Dein Sponsoring-Dossier» mit
  - **Ampel** (Abschnitt «Passt die Gegenleistung zum Preis?», `data-testid="ampel"`): `ul` mit `aria-label="Einschätzung je Paket"`, je Paket Farbpunkt (nur Zierde), Text «<Name>: <passt | eher günstig | eher hoch | passt nicht zur Gegenleistung> (<grün | gelb | rot>)», Zeile «Preis …, Rahmen … (n Punkte, Faktor f): p % des Rahmens.» und ein Satz zur Einordnung; `data-testid="ampel-<n>"` und `data-stufe`; der Hinweis «Einschätzung von Alperna, keine Marktdaten.» (`data-testid="ampel-hinweis"`) und die Regel zum Aufklappen (`details`, `data-testid="ampel-regel"`);
  - **KI-Bereich** (`data-testid="ki-panel"`, Überschrift «Texte von der KI (freiwillig)»): Erklärung, was an die KI geht (`data-testid="ki-daten"`: Name des Vereins, Ort, Stichworte, Zielgruppe, Zahlen, Pakete; nicht E-Mail-Adresse, Kontaktdaten, Referenzen), Knopf «Texte von der KI schreiben lassen» (aus, solange die Stichworte unter 10 Zeichen haben; dann `data-testid="ki-leer"` mit dem Grund), Fehler in `role="alert"` (`id="sd-ki-error"`), Fortschritt und Erfolg in `role="status"`, nach dem Entwurf der Satz «Von einer KI formuliert. Prüfe Namen, Zahlen und Aussagen, bevor du den Text verwendest.» (`data-testid="ki-hinweis"`) und die Liste der Platzhalter (`data-testid="platzhalter"`);
  - **Dossier** (`DocView` im Kasten `data-testid="dossier"`): Titel, Untertitel, Abschnitte wie in Schritt 7.
- Knöpfe: «Text kopieren» (Markdown, frei), «PDF herunterladen» (`sponsoring-dossier-<verein>.pdf`), «Word herunterladen» (`sponsoring-dossier-<verein>.docx`), «Angaben ändern» (zeigt das Formular mit allen Angaben), «Neu beginnen» (löscht den Stand, das Profil bleibt).
- Fokus auf die Ergebnis-Überschrift nach «Dossier erstellen», nicht beim Wiederherstellen; nach «Angaben ändern» und «Neu beginnen» auf das erste Feld.
- Zählung: `popular:<slug>` über `/api/result` bei jedem gesendeten Ergebnis.

## Edge Cases
- Verein leer: Meldung, kein Aufruf. Ort, Kanton, Website leer: der Untertitel lässt sie weg; nur der Kanton: «Kanton Appenzell Ausserrhoden».
- Nur die Mitglieder angegeben: die Tabelle «Der Verein in Zahlen» hat eine Zeile. Zahl 0 bei freiwilligen Werten: Zeile fehlt.
- Ein einziges Paket: Tabelle mit einer Spalte. Name leer: Vorschlag. Zwei Pakete mit gleichem Namen: Meldung. Preis 49 oder 100'001: Meldung. Paket nur mit Preis oder nur mit Gegenleistung: Meldung mit der Nummer des Pakets.
- Beiträge über 52: Meldung. Beiträge ab 10 und Tickets ab 12 geben keine weiteren Punkte.
- Mehr Aktive als Mitglieder: Meldung.
- Extremwerte: 1 Mitglied (Faktor 1), 1'000'000 Mitglieder (Faktor 2); Preis CHF 100'000.- bei wenigen Punkten ergibt Rot.
- Zu helle Vereinsfarbe (Gelb, Hellgrau): Hinweis am Feld und Meldung beim Erstellen; ein ungültiger Wert im Speicher wird zur Standardfarbe.
- Stichworte fehlen oder sind kürzer als 10 Zeichen: Dossier vollständig, KI-Knopf aus mit Erklärung.
- KI liefert eine fremde Ziffer, die Du-Form, ein Ausrufezeichen, einen Link oder falsche Form: verworfen, ruhige Meldung, das Dossier bleibt unverändert.
- Cookie fehlt (403): Fenster, einmal wiederholen (`useGenerator`). Ratenbegrenzung (429), Kapazität (503), Netz: ruhiger Satz aus `GENERATE_FAIL_MESSAGES`, Stand bleibt.
- Adresse fehlt beim Download: Fenster; bei «Später» wird nichts geladen.
- Profil ganz leer: Verein ist Pflicht; Ort, Kanton und Website sind leer.
- Gespeicherter Stand kaputt oder von einer anderen Version: leerer Stand. Langes Dossier: mehrere Seiten; ein sehr langer Name bricht in Titel und Kopf um beziehungsweise wird im Kopf gekürzt.
- Keine Daten-Datei: Das Werkzeug braucht keine `data/*.json`; Punkte, Faktor, 100 Franken je Punkt und die Grenzen der Ampel sind Richtwerte von Alperna, keine Statistik.

## Texte
- Tagline: «Verein in Zahlen, Zielgruppe und drei Pakete als Vergleich: ein Dossier, das du Sponsoren schicken kannst.»
- SEO-Title «Sponsoring-Dossier Schweiz: Pakete für Vereine» und Meta-Description in `content/tools/sponsoring-dossier.md`; H1 «Sponsoring-Dossier für Schweizer Vereine»; Beispiel «FC Trogen» (fiktiv, Zahlen und Preise erfunden, als Angaben des Vereins gekennzeichnet; die Ampel ist mit den Zahlen aus `logic.ts` berechnet); Baustein «Website», Beweis aus `content/pitch/bausteine.md`.
- FAQ (6): Was kostet ein Paket? (legt der Verein fest; die Ampel ist eine Einschätzung) · Darf ich bisherige Sponsoren nennen? (nur mit Einverständnis, keine Rechtsauskunft) · Was geht an die KI? · Brauche ich ein Konto? · Was bekommt Alperna, was bleibt im Browser? · Warum steht die Ampel nicht im Dossier?
- Keyword «Sponsoring-Dossier»: in der H1, im ersten Absatz und viermal insgesamt.

## Tests
- `logic.test.ts` (63 Fälle): Zahlen lesen, Punkte (Grenzen 5 und 3, Freitext, doppelte Haken), Faktor (99, 100, 300, 301), Rahmen, Ampel an allen Schwellen (59/60/140/250 %), Viertelpunkte, Pakete lesen, `inputProblem` (jede Meldung), Farbe und Kontrast, Dokument (mit und ohne Zahlen, mit und ohne KI, Reihenfolge, Kontakt, Referenzen, keine Ampel, keine Du-Form), CRM-Texte ohne Kontaktdaten und Referenzen, Eingabe an die KI, Signatur, `parseState` bei kaputten Daten.
- `generator.test.ts` (15 Fälle): Eingabeschema und Ausgabeschema, `numbersIn`, `hasDuForm`, `checkSponsoring` («zahl», «anrede»), `checkGenerated` (Codeblock, Anführungszeichen, Sperrliste, Link, Emoji), System-Prompt ohne Eingaben.
- `export.test.ts` (6 Fälle): PDF unter Node mit den Schriften aus `public/fonts`, Vereinsfarbe im Inhalt, Schrift auf heller Farbe, langes Dossier, Häkchen als Linien.
- `Tool.test.tsx` (14 Fälle): Formular, Meldungen, Farbe, Zwischenstand, Ergebnis mit Ampel, CRM ohne Kontaktdaten, Neuladen, Downloads, KI-Ablauf mit Stub von `/api/generate`, Ausfall, veraltete KI-Texte.

## Nicht Teil dieses Tools
- Kein Logo-Upload (bewusst weggelassen) und keine Bilder im Dossier.
- Keine Marktdaten, Branchenvergleiche oder Statistik zu Sponsoringpreisen. Die Ampel ist eine Einschätzung von Alperna.
- Keine Aussagen zu Steuern, Abzugsfähigkeit, Verträgen oder Vereinsrecht, und keine Vertragsvorlage: Der Schritt «Vertrag auf Papier» ist nur ein Schritt im Ablauf.
- Keine Verwaltung von Sponsoren, keine Rechnungen, kein Versand per E-Mail.
- Kein Word mit Vereinsfarbe (siehe Logik 11).
