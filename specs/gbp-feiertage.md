# Öffnungszeiten an Feiertagen (gbp-feiertage)

Klasse C (Rechner und Formular mit Datensatz, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Keine neuen Bibliotheken. Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Downloads über `guardDownload`.

## Nutzen in einem Satz
Für KMU und Vereine mit Google-Unternehmensprofil: in rund drei Minuten die Liste der Sonderöffnungszeiten für alle Feiertage des eigenen Kantons, zum Abtippen ins Profil, dazu ein Kalender (.ics) mit Erinnerung zehn Tage vorher und eine CSV, ohne Konto.

## Kategorie und Verknüpfung
Kategorie: praktisches (seit 09.10.2026, vorher «Schweiz»), Zielgruppe: beide
Liest aus Profil: firma, kanton (beides über `ProfileFieldsForm`, nichts davon wird erneut gefragt, Harte Regel 10)
Schreibt ins Profil: nichts ausser dem, was das Formular selbst als Profilfeld bearbeitet (Firma, Kanton). «Angaben ändern» setzt den Kanton des Ergebnisses ins Profil, wenn er dort leer ist.
Verwandte Tools: bewertungs-kit, qr-set, digitaler-auftritt-check

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma (`ProfileFieldsForm`, Label «Firma» bzw. «Name des Vereins») | text | nein | Profil `firma` | max. 200 (Profil) | «Firma und Kanton speichern wir in deinem Firmenprofil, in deinem Browser. Der Kanton bestimmt, welche Feiertage in der Liste stehen.» |
| Kanton (`ProfileFieldsForm`, Label «Kanton») | single | ja | Profil `kanton` | einer der 26 Kantone (`KANTONE`) | – |
| Jahr (Label «Jahr») | single | ja | laufendes Jahr, sonst das erste Jahr des Datensatzes | laufendes und nächstes Jahr aus `jahre` (`yearOptions`) | – |
| Normale Öffnungszeiten (Fieldset, `ul` aria-label «Öffnungszeiten», sieben Zeilen Montag bis Sonntag) | – | ja | Montag bis Freitag 08:00 bis 12:00 und 13:30 bis 17:30, Samstag und Sonntag geschlossen | siehe Logik 3 | «Zwei Zeitfenster je Tag, zum Beispiel am Vormittag und am Nachmittag. Hast du durchgehend offen, füll nur das erste aus.» |
| geöffnet (je Tag, Häkchen, aria-label «<Tag> geöffnet») | boolean | – | siehe oben | – | – |
| von und bis (je Tag und Zeitfenster, `input type="time"`, aria-label «<Tag>, Zeitfenster 1, von» usw.) | text (HH:MM) | Fenster 1 ja, Fenster 2 nein | siehe oben | `isTime`, «von» vor «bis», Fenster 2 beginnt nicht vor dem Ende von Fenster 1 | – |
| Regel je Feiertag (`ul` aria-label «Feiertage», eine Zeile je Tag; `select` Label «Regel», aria-label «Regel für <Tag>») | single | ja | gesetzliche Tage «geschlossen», ortsübliche «nicht eintragen» (`defaultRule`) | eine von geschlossen, wie Sonntag, Sonderzeiten, nicht eintragen | – |
| Sonderzeiten (nur bei «Sonderzeiten», aria-label «<Tag>, Sonderzeiten von» und «… bis») | text (HH:MM) | ja bei «Sonderzeiten» | leer | `isTime`, «von» vor «bis» | – |

Jede Änderung im Formular geht sofort in den Stand `mt:gbp-feiertage` (Phase «edit»). Knopf «Liste erstellen».

## Daten
Datei `data/feiertage.json`, Schema in `logic.ts` (`feiertageDataSchema`, zod): `meta { source, url, asOf, note }`, `jahre`, `bund` (Quellen des Bundes), `quellen` (je Kanton eine Quelle mit `titel`, `url`, `stand`, optional `weitere`), `hinweise` (je Kanton ein Satz), `feiertage` (`id`, `name`, `datum`, `kantone`, `art`, optional `hinweis`, `bedingung`). `datum` ist `fix:MM-TT`, `ostern:+N` (Abstand zum Ostersonntag) oder `fix-jahr:JJJJ-MM-TT`. Verletzt die Datei das Schema oder hat sie keine https-Adresse in `meta.url`, ist `DATA` null und das Werkzeug sagt, dass die Daten nicht verfügbar sind.

**Belegt (18 Kantone), am 05.10.2026 geöffnet.** Für jeden Kanton prüft ein Test (`Gegenprobe`) die Tage gegen die Quelle.
| Kanton | Quelle (Adresse in `quellen`) |
|---|---|
| AG | gesetzessammlungen.ag.ch, EG zum Arbeitsrecht, § 6 (Tage je Bezirk und Gemeinde) |
| AI | ai.clex.ch, Gesetz über die öffentlichen Ruhetage (GS 822.200) |
| AR | hallo-ar.ch, «Öffnungszeiten / Feiertage» |
| BE | belex.sites.be.ch, Gesetz über die Ruhe an öffentlichen Feiertagen (BSG 555.1) |
| BL | baselland.ch, Ruhetagsgesetz (Seite des Kantons) |
| BS | bs.ch, «Feiertage im Kanton Basel-Stadt» |
| GL | gesetze.gl.ch, Gesetz über die öffentlichen Ruhetage (GS IX B/21/1); gl.ch, «Öffentliche Feiertage» für den Tag der Näfelser Fahrt 2026 (9. April) und 2027 (1. April) |
| GR | gr-lex.gr.ch, Gesetz über die öffentlichen Ruhetage (BR 520.100), Art. 2 |
| LU | srl.lu.ch, Gesetz über die Ruhetage (SRL 855), § 1a |
| NW | gesetze.nw.ch, Gesetz über die öffentlichen Ruhetage (NG 921.1), Art. 2 |
| OW | gdb.ow.ch, Gesetz über die öffentlichen Ruhetage (GDB 975.2) |
| SG | gesetzessammlung.sg.ch, Gesetz über Ruhetag und Ladenöffnung (sGS 552.1), Art. 2 |
| SH | rechtsbuch.sh.ch, Gesetz betreffend die öffentlichen Ruhetage (SHR 900.200) |
| SZ | sz.ch, «Feiertagsregelung Kanton Schwyz» (Merkblatt) |
| TG | rechtsbuch.tg.ch, Ruhetagsgesetz (RB 822.9), § 1 |
| UR | rechtsbuch.ur.ch, Gesetz über den Ladenschluss und die Sonntagsruhe (RB 70.1421) |
| ZG | bgs.zg.ch, Ruhetags- und Ladenöffnungsgesetz (BGS 942.31), § 1 |
| ZH | zh.ch, «Feiertage» (neun gesetzliche Feiertage 2026 und 2027) |

**Bund:** SECO, «Freizeit und Feiertage» (der 1. August ist der einzige eidgenössische Feiertag); Bundesamt für Justiz, «Gesetzliche Feiertage und Tage, die in der Schweiz wie gesetzliche Feiertage behandelt werden» (Stand 1. Januar 2011: Neujahr, Auffahrt und Weihnachtstag haben alle Kantone bezeichnet) und dessen «Hinweise» (Stand 17.12.2012: Das Verzeichnis dient der Fristenberechnung und ist keine allgemeine Liste der Ruhe- oder Feiertage). Das Verzeichnis dient hier nur für diese drei Tage in nicht belegten Kantonen und als Quelle der festen Daten kirchlicher Feiertage (Berchtoldstag 2. Januar, Dreikönigstag 6. Januar, Josefstag 19. März, Maria Himmelfahrt 15. August, Mauritiustag 22. September, Allerheiligen 1. November, Maria Empfängnis 8. Dezember), soweit die Gesetze von NW und OW sie nicht selbst nennen.

**Nicht belegt:** FR, GE, JU, NE, SO, TI, VD, VS. Für diese Kantone zeigt das Werkzeug nur Neujahr, Auffahrt, den 1. August und Weihnachten und sagt: «Für <Kanton> haben wir noch keine geprüfte Liste. Prüfe die Feiertage bei deinem Kanton.»

**Bewusst nicht aufgenommen** (kein Eintrag im Ruhetagsrecht des Kantons oder kein Datum in der Quelle): Sechseläuten, Knabenschiessen, Fasnachtsmontag (ZH lokal), Berchtoldstag in ZH, SH, SG, GL, AI, LU, OW, NW, ZG, Ostermontag, Pfingstmontag und Stephanstag in NW, OW und ZG (sie stehen nur im Verzeichnis des Bundes unter «wie gesetzliche Feiertage behandelt», und das Verzeichnis ist laut seinen Hinweisen keine allgemeine Liste der Ruhetage), Gemeindefeiertage, Patroziniumsfeste, Heiligabend und Silvester, Brückentage. `hinweise` nennt je Kanton, wo Gemeinden weitere Tage bezeichnen.

**Annahmen (alle gekennzeichnet):** «gesetzlich» heisst: Die Quelle nennt den Tag als Feiertag oder öffentlichen Ruhetag des Kantons. «ortsüblich»: Der Tag gilt nur in Teilen des Kantons (heute Aargau, Mauritiustag in Appenzell Innerrhoden). Das ist keine Rechtsauskunft; das Ergebnis sagt es und verweist auf Kanton und Gemeinde. Die Voreinstellung «geschlossen» ist eine Annahme des Werkzeugs, nicht der Quelle; die Person wählt die Regel.

## Logik
Alle Regeln in `tools/gbp-feiertage/logic.ts` (rein, ohne React, DOM und Netz). Datum immer mit UTC-Teilen und als JJJJ-MM-TT.
1. **Ostern** `easterSunday(year)` nach Gauss (gregorianisch, mit den zwei Ausnahmejahren 19. und 18. April), getestet gegen den Kalender (2026 = 5. April, 2027 = 28. März) und gegen eine zweite Formel (Meeus/Jones/Butcher) von 1900 bis 2200.
2. **Datum** `resolveDate(feiertag, year)`: `fix` setzt Monat und Tag ins Jahr (29. Februar nur in Schaltjahren), `ostern:+N` addiert N Tage auf den Ostersonntag, `fix-jahr` gilt nur im genannten Jahr (sonst null und der Tag fällt für dieses Jahr weg).
3. **Feiertage je Kanton** `holidaysFor(kanton, year, data)` → `{ id, name, date, weekday, art, hinweis?, entfaellt? }`, nach Datum sortiert, je id höchstens einmal. Belegter Kanton: Einträge mit `kantone: "alle"` und Einträge, die den Kanton nennen. Nicht belegter Kanton: nur `"alle"`. Bedingung `weihnachten-nicht-mo-fr` (AR): fällt der Weihnachtstag auf Montag oder Freitag, trägt der Stephanstag `entfaellt` («Entfällt <Jahr>: Der Weihnachtstag fällt auf einen Freitag.»). AI hat nur den Hinweis («nur, wenn durch ihn nicht drei Ruhetage aufeinander folgen. Prüfe das für dein Jahr.»).
4. **Öffnungszeiten** `WeekHours` = sieben `DayHours { offen, f1, f2 }`. `windowsOf(day)` liefert die gültigen Fenster (leer, wenn geschlossen); `hoursProblem(hours)` meldet die erste Unstimmigkeit mit dem Wochentag.
5. **Regeln** `Rule { kind, von, bis }` mit `kind` = geschlossen, sonntag, zeiten, normal. `effectiveWindows`: geschlossen → keine Fenster; sonntag → die Fenster des Sonntags; zeiten → ein Fenster von bis; normal → null (nichts eintragen). `ruleProblem` verlangt bei «Sonderzeiten» gültige Zeiten.
6. **Zeile zum Abtippen** `lineFor`: «Fr 03.04.2026, Karfreitag: geschlossen» bzw. «… Allerheiligen: 08:00 bis 12:00» bzw. «… 08:00 bis 12:00 und 13:30 bis 17:30».
7. **Plan** `buildPlan(holidays, regeln, hours)`: `entries` (gehört ins Profil), `unnoetig` (Regel «geschlossen» oder «wie Sonntag» ohne Fenster an einem Tag, an dem ohnehin geschlossen ist: «fällt auf einen Sonntag» bzw. «fällt auf einen <Tag>, an dem du ohnehin geschlossen hast»), `entfallen` (Bedingung nicht erfüllt).
8. **Kalender** `buildIcs(entries, year, { now, firma })`: ein VEVENT je Eintrag als Ganztagstermin (`DTSTART;VALUE=DATE`, `DTEND` am Folgetag, `TRANSP:TRANSPARENT`), `SUMMARY` «<Name>: <Regel>», `DESCRIPTION` «Sonderöffnungszeiten im Google-Unternehmensprofil eintragen. Anleitung: <Link zur Hilfe von Google>», `UID` = `<Jahr>-<id>@tools.alperna.ch` (stabil), `DTSTAMP` in UTC, VALARM `TRIGGER:-P10D` (Anzeige zehn Tage vorher). Texte maskiert, Zeilen mit CRLF, gefaltet bei 75 Oktetten UTF-8 (Fortsetzung mit Leerzeichen, nie mitten in einem Zeichen).
9. **CSV** `buildCsv(entries)`: UTF-8 mit BOM, Semikolon, CRLF, Kopf `Datum;Feiertag;Regel;von;bis`; «geschlossen» mit leeren Feldern von und bis; zwei Zeitfenster ergeben zwei Zeilen.
10. **CRM** `eingabeText(state, holidays)`: «Kanton: St. Gallen (SG)», «Jahr: 2027», «Normale Öffnungszeiten:» mit einer Zeile je Tag, «Regel je Feiertag:» mit einer Zeile je Tag («Karfreitag (Fr 26.03.2027): geschlossen»). `ausgabeText(plan, kanton, year)`: Kopfzeile «Sonderöffnungszeiten St. Gallen (SG) 2027», die Zeilen zum Abtippen, dann «Nichts einzutragen: …» und entfallene Tage. Beides bleibt für alle Kantone unter 1'900 Zeichen. `sendResult` läuft einmal beim Klick auf «Liste erstellen», nicht beim Wiederherstellen.
11. **Stand** `mt:gbp-feiertage`, `parseState`: `{ v: 1, phase: "edit" | "result", kanton, jahr, zeiten, regeln }`. Kaputte Daten → leerer Stand; kaputte Tage und Regeln werden einzeln ersetzt; «result» nur mit bekanntem Kanton, Jahr und stimmigen Zeiten. `lib/progress.ts` erkennt `phase: "result"` als erledigt.

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster): `ResultCard` «Deine Sonderöffnungszeiten» mit Kopfzeile «<Kanton> (<Code>), <Jahr>, <Firma>. n Einträge zum Abtippen.»; vor der Liste das Raster «Deine normale Woche» (`weekGrid`, DocBlock `grid`, data-testid `woche`: je Wochentag die beiden Zeitfenster, geschlossene Tage mit «geschlossen»; seit 09.10.2026, damit der Besucher seine Eingabe im Ergebnis wiedererkennt); Liste zum Abtippen (`ol`, aria-label «Sonderöffnungszeiten», data-testid `sonderzeiten`); bei nicht belegtem Kanton der Kasten (data-testid `keine-liste`) mit dem Satz «Für <Kanton> haben wir noch keine geprüfte Liste. Prüfe die Feiertage bei deinem Kanton.» und «Angezeigt sind nur Neujahr, Auffahrt, der 1. August und Weihnachten.»; Abschnitt «Nichts einzutragen» (`ul` aria-label «Tage ohne Eintrag») und «Gilt in diesem Jahr nicht» (aria-label «Entfallene Tage») nur, wenn es solche Tage gibt.
- Kasten «So trägst du die Zeiten ein» (drei Sätze, Wortlaut nach der Hilfeseite von Google «Spezielle Öffnungszeiten festlegen», Link `https://support.google.com/business/answer/6303076?hl=de`, am 05.10.2026 geöffnet: «Profil bearbeiten», «Öffnungszeiten», neben «Spezielle Öffnungszeiten» «Bearbeiten», Datum wählen, geschlossen oder Zeiten, speichern).
- Kasten «Gesetzlich und ortsüblich»: die Tage nach `art`, der Hinweis des Kantons, die Quellen mit Link und Stand (Kanton, Bund), Stand der Daten (`meta.asOf`), der Satz «Die Liste ersetzt keine Auskunft deines Kantons oder deiner Gemeinde. Prüfe die Tage, bevor du sie einträgst.»
- Knöpfe: «Liste kopieren» (nur die Zeilen zum Abtippen), «Kalender (.ics) herunterladen» (primär), «CSV herunterladen», «Angaben ändern», «Neu beginnen». Beide Downloads über `ctx.guardDownload` und `downloadBytes`, gesperrt, wenn es keine Einträge gibt; Meldung in `role="status"`, Fehler in `role="alert"`. Dateinamen `sonderoeffnungszeiten-<kanton>-<jahr>.ics` bzw. `.csv`.
- Nichts davon liegt hinter einem zweiten Fenster: Wer die Adresse einmal angegeben hat, lädt sofort.

## Edge Cases (getestet)
- Kein Kanton im Profil: Hinweis, Knopf meldet «Wähl zuerst deinen Kanton.», kein Ergebnis, kein CRM-Eintrag.
- Kanton ohne Quelle (FR, GE, JU, NE, SO, TI, VD, VS): nur vier Tage, Hinweis im Formular und im Ergebnis.
- Feiertag auf Samstag oder Sonntag bei ohnehin geschlossenem Tag: Hinweis im Formular, im Ergebnis unter «Nichts einzutragen»; öffnet die Person an diesem Tag (Regel «Sonderzeiten» oder «wie Sonntag» mit offenem Sonntag), steht der Tag in der Liste.
- Sonderzeiten ohne Uhrzeit oder mit «von» nach «bis»; Öffnungszeiten ohne Uhrzeit, Zeitfenster 2 vor Ende von Fenster 1, nur ein Feld von Fenster 2 gefüllt.
- Aargau: ortsübliche Tage starten auf «nicht eintragen» und stehen nicht in der Liste, bis die Person sie wählt.
- AR: Weihnachten auf Montag oder Freitag → Stephanstag entfällt (2026 fällt Weihnachten auf einen Freitag); AI: Hinweis ohne Streichung.
- Glarus: Näfelser Fahrt nur 2026 und 2027; in anderen Jahren kein Eintrag.
- Alle Tage auf «nicht eintragen»: Satz «Es gibt nichts abzutippen …», Downloads gesperrt.
- Osterformel in den Ausnahmejahren der Gauss-Formel (2049, 2076 …), Jahr 1900 bis 2200; Schaltjahr; Jahreswechsel.
- ICS: lange Zeilen, Umlaute (Faltung nur zwischen Zeichen), Kommas und Semikolons maskiert, leere Liste → gültiger leerer Kalender. CSV: Semikolon im Namen.
- Gespeicherter Stand: null, Text, Zahl, Array, falsche Version, kaputte Tage und Regeln, «result» ohne Kanton, ohne Jahr oder mit ungültigen Zeiten → «edit». Datensatz ungültig: `loadData` gibt null.
- Profil leer: Firma fehlt in Kalendername und CRM-Feld `firma`. Speicher gesperrt: `useLocalJson` fällt auf den Arbeitsspeicher zurück. Adresse abgelaufen: `guardDownload` fragt vor dem Download.

## Texte
- Tagline: «Sonderöffnungszeiten für alle Feiertage deines Kantons: zum Abtippen, als Kalender mit Erinnerung und als CSV.» (110 Zeichen)
- SEO-Title: «Feiertagsplaner Schweiz: Sonderzeiten fürs Google-Profil»; Meta-Description in `content/tools/gbp-feiertage.md`.
- Keyword «Feiertage Öffnungszeiten» (Vorgabe des Auftrags): im ersten Absatz; die H1 «Feiertagsplaner für Schweizer KMU» enthält die Wortfolge nicht (siehe Abschlussbericht).
- Erklärtext (664 Wörter), Beispiel (Malerei Keller, Gossau, Kanton St. Gallen, 2027, mit der Logik gerechnet), FAQ (7) und Alperna-Satz (Baustein Google Business Profil, `beweis: @baustein`): `content/tools/gbp-feiertage.md`.

## Tests
`tools/gbp-feiertage/logic.test.ts` (74 Fälle): Osterformel 2024 bis 2030 (2026 und 2027 aus dem Kalender, die übrigen aus der Formel), 1900 bis 2200 gegen eine zweite Formel, Ausnahmejahre; Datumsrechnung und Auflösung der drei Schreibweisen; Schema und Quellen des Datensatzes (https-Adressen, Stand, Sperrliste, kaputte Daten); Gegenprobe der Tage jedes belegten Kantons gegen die Quelle (2026 und 2027); Zürich und Basel-Stadt gegen die Tabellen der Kantone; Thurgau, St. Gallen, Aargau, beide Appenzell, Glarus; Kantone ohne Quelle; Testdatensatz; Öffnungszeiten und Meldungen; Regeln, Zeilen zum Abtippen, Sonntagsregel, Plan; ICS (Rahmen, CRLF, Ganztagstermin, Erinnerung, UID, Faltung, Maskierung, leerer Kalender); CSV (BOM, Semikolon, zwei Fenster, Anführungszeichen); `parseState` bei kaputten Daten; Eingabe und Ausgabe fürs CRM (unter 1'900 Zeichen für alle Kantone).
`tools/gbp-feiertage/Tool.test.tsx` (14 Fälle, jsdom): Formular mit Labels und Vorbelegung aus dem Profil, Kanton fehlt, Kanton ohne Liste, Sonderzeiten-Felder, Meldungen, Ergebnis mit Liste, Stand und CRM-Aufruf, Downloads mit Dateinamen, Fenster bei fehlender Adresse, Neuladen ohne zweiten CRM-Eintrag, «Angaben ändern» und «Neu beginnen», Sonntagshinweis.

## Nicht Teil dieses Tools
- Eintrag ins Google-Unternehmensprofil über die Schnittstelle: Du tippst die Liste selbst ab; kein Zugriff auf das Google-Konto.
- Gemeinde- und Bezirksfeiertage ausser den im Aargau und in Appenzell Innerrhoden genannten, Brückentage, Betriebsferien, Heiligabend und Silvester.
- Feiertage der übrigen acht Kantone, solange keine Quelle geöffnet ist; Feiertage anderer Länder.
- Jahre ausser den im Datensatz genannten (2026 und 2027); neue Jahre brauchen eine erneute Prüfung der Quellen.
- Rechtsaussagen (Harte Regel 8): keine. Das Werkzeug sagt nicht, wer an welchem Tag schliessen muss; es zeigt, was die Quelle des Kantons als Feiertag nennt, und überlässt die Regel der Person.
