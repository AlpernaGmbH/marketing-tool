# Empfehlungsprogramm-Designer (empfehlungsprogramm)

Klasse C (Rechner und Formular, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Dateien über `guardDownload`. `logic.ts` ist rein und getestet; Browser-Dinge (QR-Bild, PDF) stehen in `export.ts`.

## Nutzen in einem Satz
Für KMU und Vereine, die mehr Empfehlungen wollen: aus Kundenwert, Marge, Anreiz-Typ, Kanal und Anrede in rund vier Minuten ein Empfehlungsprogramm mit Anreiz als Spanne in Franken, Ablauf in fünf Schritten, drei Textvorlagen in Du und Sie, einem Einseiter (PDF, Word, Copy) und einer Karte A6 mit QR-Code zum Drucken.

## Kategorie und Verknüpfung
Kategorie: strategie, Zielgruppe: beide, Schritt 4 im Pfad «Für Vereine» (`pathStep { path: "vereine", order: 4 }`)
Liest aus Profil: organisationstyp, firma, website (über `ProfileFieldsForm`); Anrede aus `marke.tonalitaet` (wie das Bewertungs-Kit, `anredeFromProfile`)
Liest aus anderen Werkzeugen: Nummer aus `mt:whatsapp-link` (`readWhatsappNumber` aus `tools/qr-set/logic.ts`), als Vorbelegung
Schreibt ins Profil: nichts (Firma, Website und Organisationstyp schreibt `ProfileFieldsForm` selbst)
Verwandte Tools: bewertungs-kit, whatsapp-link, sponsoring-dossier

## Zugang (Zugang v3)
- Beim Klick auf «Programm entwerfen» prüft das Werkzeug die Angaben (`formIssue`, Meldung in `role="alert"`, Fokus im Feld), dann `ctx.ensureEmail()`; schliesst die Person das Fenster, bleibt das Formular stehen.
- Danach `ctx.sendResult({ eingabe: eingabeText(form, kontext), ausgabe: ausgabeText(programm) })`: Eingabe = Angaben je Zeile, Ausgabe = der Einseiter als Markdown (`toMarkdown(toDocument(...))`). Anreiz und Ablauf stehen in den ersten 1'900 Zeichen (getestet), weil der Server dort kürzt.
- Downloads («Einseiter (PDF)», «Word», «Karte A6 (PDF)») laufen über `ctx.guardDownload(...)` und `downloadBytes`. Kopieren (Vorlagen, «Einseiter kopieren») ist immer frei.
- Nach dem Neuladen steht das Ergebnis wieder da (Stand `mt:empfehlungsprogramm`), ohne zweiten CRM-Eintrag.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin / Firma (Name des Vereins) / Website | `ProfileFieldsForm` (ids `ep-firma`, `ep-website`) | Firma ja, Rest nein | Profil | wie das Profil | «… speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Kundenwert pro Jahr in CHF (Verein: Jahresbeitrag pro Mitglied in CHF) | number (id `ep-kundenwert`) | ja | gespeicherter Stand | CHF 10.- bis CHF 1'000'000.-; Ziffern mit Komma oder Punkt, Apostroph und Leerzeichen als Tausendertrenner | «Was eine Kundin im Jahr im Schnitt bei dir ausgibt. Deine Schätzung genügt.» |
| Marge in Prozent | number (id `ep-marge`) | ja | gespeicherter Stand | 1 bis 90 | «Der Anteil des Kundenwerts, der nach den direkten Kosten bleibt, in Prozent.»; darunter «Deckungsbeitrag: CHF … pro Jahr.» |
| Anreiz | select (id `ep-anreiz`) | ja | keine | Rabatt auf den nächsten Auftrag (Verein: Ermässigung auf den nächsten Jahresbeitrag), Gutschein, Spende an einen Verein, Zusatzleistung, Nichts Materielles (Dank und Sichtbarkeit) | |
| Beide Seiten belohnen | Checkbox (id `ep-beide`) | nein | aus | | «Auch die empfohlene Person bekommt etwas. Dann erhält jede Seite die Hälfte der Spanne.» |
| Kanal der Ansprache | select (id `ep-kanal`) | ja | keine | WhatsApp, E-Mail, Persönlich, Karte beim Auftrag (Verein: Karte beim Anlass) | |
| WhatsApp-Nummer | tel (id `ep-nummer`), nur bei WhatsApp und Karte | nein | `mt:whatsapp-link` | wenn ausgefüllt: Schweizer Nummer (`phoneProblem` aus `tools/whatsapp-link/logic.ts`), höchstens 40 Zeichen | «Freiwillig, Schweizer Nummer. Mit Nummer führt der QR-Code auf der Karte in einen WhatsApp-Chat, ohne Nummer auf deine Website.» |
| Anrede | Radio Du / Sie (ids `ep-anrede-du`, `ep-anrede-sie`) | ja | Profil (`anredeFromProfile`) | | Gilt für Karte und Vorlagen, umschaltbar im Ergebnis |

Bei einem Verein heissen die Bezeichnungen anders (`begriffe(true)`): Jahresbeitrag pro Mitglied statt Kundenwert, Mitglied statt Kundschaft, Eintritt statt Auftrag, «Dein Verein».

## Logik
1. **Deckungsbeitrag** = Kundenwert mal Marge durch 100, auf Rappen gerundet (`rechne`).
2. **Anreiz-Spanne** = 10 bis 20 % des Deckungsbeitrags für eine erfolgreiche Empfehlung, auf 5 Franken gerundet (`roundTo`: 12.50 wird 15). Annahme: **Richtwert von Alperna, keine Statistik**; im UI («Richtwert von Alperna, keine Statistik»), im Einseiter und im Seitentext so gekennzeichnet. Es gibt keine Datei in `data/`, weil keine Zahl aus einer Quelle stammt.
3. **Beide Seiten**: je Seite die Hälfte der ungerundeten Grenzen, dann gerundet. Die Spanne für beide zusammen (`gesamt`) bleibt sichtbar.
4. **Untergrenze**: Ist die obere Grenze je Person unter 5 Franken (gerundet 0), gilt der Betrag als zu klein (`zuKlein`); das Werkzeug behandelt den Anreiz dann wie «nichts Materielles». Liegt nur die untere Grenze unter 5 Franken, wird sie auf 5 angehoben.
5. **Nichts Materielles**: keine Beträge; stattdessen drei Formen der Anerkennung (Dank von Hand, Nennung im Newsletter nur mit Einverständnis, Einladung zu einem Anlass).
6. **Mitte** = Mitte der Spanne je Person, auf 5 Franken gerundet und innerhalb der Spanne. Die Vorlagen nennen diesen Betrag; die Person ändert ihn im Text, wenn sie einen anderen wählt. Die Karte nennt keinen Betrag (sie ist gedruckt und nicht änderbar).
7. **Mechanik** in fünf Schritten (`mechanik`): Auftrag abgeschlossen, Bitte um Empfehlung, Empfohlene Person meldet sich mit Hinweis, Auftrag kommt zustande, Dank und Anreiz an beide (oder «an die empfehlende Person»). Je Schritt ein Satz; Schritt 2, 3 und 5 nennen den Kanal (WhatsApp, E-Mail, persönlich, Karte).
8. **Dank-Satz** (`dankSatz`): ein Satz «Als Dank gibt es für … » je Typ, Anrede, beide Seiten und Sicht (empfehlende Person oder empfohlene Person). Er endet nie mit dem Betrag (kein «CHF 60.-.»).
9. **Vorlagen** (`TEMPLATES`: KMU und Verein, Du und Sie, je drei Texte: Bitte um Empfehlung, Nachricht an die empfohlene Person, Dankesnachricht). Das Werkzeug setzt `[Firma]`, `[Anreiz]` (der Dank-Satz) und `[Link]` ein; `[Name]` schreibt die Person von Hand. Ohne Link fällt die Zeile mit `[Link]` weg. typoCH läuft über den Text, nie über den Link. Der Link ist bei WhatsApp `https://wa.me/<Nummer>` ohne Satz (kurz), sonst die Website.
10. **Hinweis bei E-Mail**: «Versand nur an Personen, die dir ihre Adresse im Rahmen eines Auftrags gegeben haben; Werbung per E-Mail hat Regeln; ein Werkzeug dazu ist geplant.» (Verein: «… im Rahmen der Mitgliedschaft …»). Keine Rechtsaussage darüber hinaus; die übrigen Hinweise sind Praxis (Fälligkeit festlegen, nach jedem Auftrag fragen, nach drei Monaten zählen).
11. **QR-Ziel** (`zielOf`): die gültige Nummer als wa.me-Link mit vorausgefülltem Satz «Guten Tag <Firma>, ich komme auf Empfehlung von …», sonst die Website, sonst kein Code. Die Nummer gilt nur bei den Kanälen WhatsApp und Karte (`nummerFuerKanal`).
12. **Karte A6** (`kartenInhalt`, `export.ts`): A6 hoch, zwei Seiten, Papier #FFFDF8, Rahmen in Tinte. Vorderseite: Firma, «Danke, dass du uns weiterempfiehlst» (Sie: «Danke, dass Sie uns weiterempfehlen»), Anreiz in einem Satz ohne Betrag, QR-Code (Vektor über `drawQr` aus dem Bewertungs-Kit, bis 46 mm), «Kamera auf den Code richten», Kontakt (WhatsApp-Nummer oder Website), Fusszeile. Rückseite: «So geht es» in drei Zeilen.
13. **Einseiter** (`toDocument`): Titel «Empfehlungsprogramm <Firma>», Angaben, Anreiz mit Begründung, Ablauf als nummerierte Liste, drei Vorlagen in der gewählten Anrede, Hinweise. Rund 1,5 A4-Seiten; PDF und Word über `lib/export/pdf.ts` und `docx.ts`.
14. **Dateinamen**: `empfehlungsprogramm-<firma>.pdf`, `empfehlungsprogramm-<firma>.docx`, `empfehlungskarte-a6-<firma>.pdf` (`safeFilename`).
15. **Stand** (`mt:empfehlungsprogramm`): `{ v: 1, phase: "edit" | "result", form: { kundenwert, marge, anreiz, beide, kanal, nummer, anrede } }`. `parseState` liefert bei kaputten Daten den leeren Stand, säubert Typen, kürzt Texte und setzt «result» nur mit gültigen Angaben. `lib/progress.ts` erkennt `phase: "result"` als erledigt.

## Rechenmodell (09.10.2026)
Im Ergebnis zeigt der Abschnitt «Was es dir bringt» (`modellBlocks`, `modell` in `logic.ts`), was ein Programm bringt. Neues freiwilliges Feld «Kundinnen und Kunden pro Jahr» (Verein: «Mitglieder insgesamt»), ganze Zahl von 1 bis 100'000; leer rechnet das Modell mit einem Beispiel von 100 und sagt das.
- Umsatz und Deckungsbeitrag über `JAHRE` = 3 Jahre (Kundenwert mal 3, Deckungsbeitrag mal 3). Richtwert von Alperna, keine Statistik.
- Kosten des Anreizes = Mitte der Spanne je Person, bei «beide Seiten» für beide Seiten. Ohne Betrag (nichts Materielles, zu klein): 0 und der Satz «Der Anreiz kostet kein Geld, nur etwas Zeit.»
- Netto je gewonnene Person = Deckungsbeitrag über drei Jahre minus Kosten des Anreizes. Zurückverdient nach aufgerundet (Kosten geteilt durch Deckungsbeitrag je Monat) Monaten, mindestens 1.
- Drei Szenarien (`SZENARIEN`): 2, 5 und 10 % der Kundschaft bringen pro Jahr eine neue Person, Richtwerte von Alperna zum Durchspielen, keine Prognose. Neue Personen = Erwartungswert (Bruchteile mit einer Dezimalstelle), Ergebnis = neue Personen mal Netto, in ganzen Franken.
- Am Bildschirm: Kennzahl-Kachel und Balken (`DocView`), in Datei und Kopie nach dem Ablauf (damit Anreiz und Ablauf in den ersten 1'900 Zeichen fürs CRM stehen).

## Ausgaben
- `ResultCard` «Dein Empfehlungsprogramm»: Anreiz-Kasten (Spanne gross, Begründung, Richtwert-Hinweis; bei «nichts Materielles» die drei Formen), «Ablauf in fünf Schritten» (`ol`, aria-label «Mechanik»), «Textvorlagen» mit Umschalter Du/Sie (aria-pressed) und den Knöpfen «Bitte um Empfehlung kopieren», «Nachricht an Empfohlene kopieren», «Dank kopieren», «Karte A6 zum Drucken» mit QR-Vorschau und Hinweis zum Ziel, «Hinweise», «Einseiter und Karte» mit «Einseiter kopieren», «Einseiter (PDF)», «Word», «Karte A6 (PDF)»; Knöpfe «Angaben ändern» und «Neu beginnen».
- Kopierbar ohne Adresse: Vorlagen und Einseiter als Markdown. Dateien erst mit Adresse (`guardDownload`).
- CRM: siehe Zugang.

## Edge Cases (getestet)
- Rundung auf 5 Franken (2.50 wird 5, 7.50 wird 10, 12.50 wird 15); beide Seiten halbiert; Mitte immer innerhalb der Spanne.
- Kundenwert 10 und 1'000'000, Marge 1 und 90 gelten, knapp daneben nicht; Zahlen mit Komma, Punkt, Apostroph und Leerzeichen; Buchstaben, Exponent, Minus und leere Eingabe sind keine Zahl.
- Betrag zu klein: Kundenwert CHF 100.-, Marge 20 %, beide Seiten: kein Betrag, Hinweis, Formen der Anerkennung; Kundenwert 10, Marge 1 %: dasselbe; nur untere Grenze zu klein: wird 5.
- «Nichts Materielles»: keine Beträge, kein Richtwert-Hinweis, Texte und Karte ohne Betrag.
- Nummer ungültig bei WhatsApp oder Karte: Meldung und Fokus; bei E-Mail oder persönlich ignoriert; leer: erlaubt, dann QR auf die Website.
- Weder Nummer noch gültige Website: kein QR-Code auf der Karte, Zeile mit `[Link]` fehlt in den Vorlagen, Hinweis im Ergebnis.
- Vorlagen in allen Kombinationen (Betrieb oder Verein, Du oder Sie, fünf Typen, beide Seiten oder nicht): keine offene Klammer ausser `[Name]`, Sperrliste leer, Du-Texte ohne Sie-Formen und umgekehrt.
- Link mit Prozentzeichen bleibt unverändert; Schweizer Schreibweise im Text (CHF 1'000, 5 %).
- Firma fehlt: Meldung «Gib den Namen deines Betriebs/Vereins an.»; Karte und Dokument ohne Firmenzeile, wenn der Stand später ohne Firma geladen wird.
- Gespeicherter Stand kaputt, falsche Version, falsche Typen, «result» mit ungültigen Angaben: leerer Stand bzw. «edit».
- Sehr langer Firmenname und sehr langer Link: Karte bleibt zweiseitig A6, Text wird gekürzt statt überzulaufen.
- QR-Bild kann nicht erzeugt werden: Hinweis; Download scheitert: Meldung in `role="alert"`.

## Texte
- Tagline: «Anreiz, Ablauf in fünf Schritten und drei Textvorlagen, damit zufriedene Kundschaft dich weiterempfiehlt.» (105 Zeichen)
- SEO-Title: «Empfehlungsprogramm Schweiz: Anreiz, Ablauf, Vorlagen» (53 Zeichen); Meta-Description (143 Zeichen) in `content/tools/empfehlungsprogramm.md`.
- Keyword «Empfehlungsprogramm»: in H1, erstem Absatz und im Alperna-Satz.
- Erklärtext (588 Wörter), Beispiel (Malerei Keller, Gossau, Zahlen aus `rechne`, in `logic.test.ts` festgehalten), FAQ (6), Alperna-Satz (Baustein Website, `beweis: @baustein`): `content/tools/empfehlungsprogramm.md`.
- Keine Rechtsaussagen: Der Satz zum Versand per E-Mail steht wörtlich so, die Antwort auf «Darf ich für Empfehlungen etwas schenken?» sagt nur, dass eine Empfehlung keine Bewertung auf einer Plattform ist, und verweist für Bewertungen auf das Bewertungs-Kit. Nichts zu Steuern, Datenschutz, Wettbewerbsrecht oder Verboten in Branchen.

## Tests
`tools/empfehlungsprogramm/logic.test.ts` (48 Fälle): Spanne, Rundung, beide Seiten, nichts Materielles, zu kleiner Betrag, Extremwerte, Mitte; Zahlen lesen und Grenzen; Reihenfolge der Meldungen; Nummer nur bei WhatsApp und Karte; Dank-Satz je Typ und Anrede; Vorlagen in allen Kombinationen; Du und Sie; Link-Zeile; Prozentzeichen im Link; Vereinsbezeichnungen; Mechanik je Kanal; QR-Ziel (Nummer, Website, keines); Karte in Du und Sie; Dateinamen; Einseiter (Aufbau, Verein, ohne Betrag, zu klein, Hinweis zur E-Mail, Sperrliste in 160 Kombinationen); Sperrliste in allen Meldungen und Bezeichnungen; Eingabe und Ausgabe fürs CRM; `parseState` bei kaputten Daten; Fortschritt im Pfad; Konfiguration; Seitentext gegen `checkToolContent` und `brandHits`; Beispiel mit den Zahlen aus dem Werkzeug.
`tools/empfehlungsprogramm/export.test.ts` (5 Fälle): Karte mit zwei A6-Seiten, QR nur mit Ziel, Verein in Sie-Form mit langem Namen, ohne Firma und mit langem Link, QR als PNG.
`tools/empfehlungsprogramm/Tool.test.tsx` (6 Fälle, jsdom): Formular, Meldungen und Fokus, Vorbelegung der Nummer, Ergebnis, CRM-Aufruf, Du/Sie-Umschalter, Downloads mit Dateinamen, E-Mail-Fenster und «Später», Neuladen ohne zweiten CRM-Eintrag, «Angaben ändern», «Neu beginnen», Verein, Hinweis bei E-Mail.

## Nicht Teil dieses Tools
- Eine Statistik, wie viel ein Anreiz bringt oder welcher Anteil üblich ist: Es gibt keine Quelle; die Spanne ist ein Richtwert von Alperna.
- Rechtsauskunft zu Prämien, Steuern, Datenschutz bei Empfehlungen, Werbung per E-Mail oder Wettbewerbsrecht; die Prüfung der E-Mail-Werbung gehört in den späteren `uwg-mailcheck`.
- Eine eigene Betragseingabe: Die Texte nennen die Mitte der Spanne, die Person ändert den Betrag im kopierten Text oder im Word-Dokument.
- Nachverfolgung der Empfehlungen (wer hat wen geschickt, was ist ausgezahlt): kein Server, keine Liste.
- Logo, Farben und Fotos auf der Karte: eine ruhige Karte in Tinte auf Papier; Gestaltung übernimmt das QR-Set oder die Druckerei.
