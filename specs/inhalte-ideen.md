# Content-Ideen nach Branche (inhalte-ideen)

Klasse C (Bibliothek mit Datensatz, alles im Browser), Stand 09.10.2026 (Charge C7: Redaktions-Audit, Format-Knöpfe, Gruppen, Kartenraster). Kein Server, keine KI, kein Netz (`needsServer: false`). Zugang v3: Durchsuchen und Merken sind frei, das E-Mail-Fenster kommt vor dem ersten Export (CSV oder Kalender-Entwurf), danach geht das Ergebnis mit Eingabe und Ausgabe ins CRM. `logic.ts` ist rein und getestet; Browser-Dinge (Download, Fokus, Scrollen) stehen in `Tool.tsx`.

## Nutzen in einem Satz
Für Betriebe und Vereine, die nicht wissen, was sie diese Woche posten sollen: aus einer redaktionellen Bibliothek von Beitragsideen (nach Branche, Format, Monat, Ziel und Säule) in rund drei Minuten eine Merkliste zusammenstellen und als CSV oder Kalender-Entwurf mitnehmen.

## Kategorie und Verknüpfung
Kategorie: inhalte (`pathStep.path: inhalte`, `order: 4`), Zielgruppe: beide, `featured: true`
Liest aus Profil: `branche` (Vorbelegung des Branchen-Filters per Wortvergleich), `contentSaeulen` (nur die Namen, als Hinweis «Deine Säulen: …»), `firma` (Dateiname und Feld `firma` im CRM; liest `ToolShell` selbst), `organisationstyp` (Rückfall «Verein»)
Schreibt ins Profil: nichts
Verwandte Tools: inhalte-saeulen, feiertagskalender, caption-baukasten

## Zugang (Zugang v3)
- Die Bibliothek ist ohne Hürde benutzbar: filtern, suchen, «Zufällige Idee», merken, die Merkliste kopieren. Kein Fenster, kein Server.
- «CSV herunterladen» und «Kalender-Entwurf (.ics) herunterladen» laufen über `ctx.guardDownload(...)`: ohne Adresse erst das Fenster; «Später» lässt die Merkliste stehen und lädt nichts. Der Export liest beim Ausführen den neuesten Stand (die Aktion läuft womöglich erst nach dem Fenster).
- Nach dem Download einmal `ctx.sendResult({ eingabe: eingabeText(filter, suche, gemerkt, art), ausgabe: ausgabeText(gemerkt) })`. Dieselbe Liste mit derselben Dateiart noch einmal zu laden, löst keinen zweiten CRM-Eintrag aus (Unterschrift `art:id1,id2,…` im Speicher der Seite); eine andere Liste oder die andere Dateiart ist wieder ein Ergebnis.
- Eingabe = die Angaben je Zeile: Branche (mit «mit Ideen für alle Betriebe»), Monat, Format, Ziel, Säule, Suche, Art des Exports, Zahl der gemerkten Ideen, danach ein «- Titel» je Idee. Ausgabe = die Merkliste als kompaktes Markdown (Titel mit Eckdaten, eine Zeile je Idee). Der Server kürzt beides auf 1'900 Zeichen; das Wichtigste steht oben.
- Pfad-Fortschritt: Beim ersten Merken schreibt das Werkzeug `mt:inhalte-ideen` = `{ v: 1, output: { gemerkt: n } }` (`lib/progress.ts` zählt ein Objekt unter `output` als erledigt). Eine leere Merkliste löscht den Stand nicht.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Branche (`ci-branche`) | select | nein | Profil `branche` per Wortvergleich auf `beispiele` der Branchen (`branchenKeyFor`), bei Vereinen und ohne Treffer «Verein» bzw. «Alle Branchen» | `alle`, `uebergreifend` («Nur Ideen für alle Betriebe») oder ein Schlüssel aus dem Datensatz | «Vorbelegt aus deinem Firmenprofil (Branche: …).» bzw. «Wähle deine Branche oder lass alle stehen.» |
| Ideen für alle Betriebe mitzeigen (`ci-allgemein`) | Kästchen, nur bei einer bestimmten Branche | nein | an | | |
| Monat (`ci-monat`) | select | nein | laufender Monat in Schweizer Zeit, erst nach der Hydrierung | `alle` oder 1 bis 12 | «Ideen für das ganze Jahr passen zu jedem Monat. Vorbelegt ist der laufende Monat.» |
| Format (`ci-format`) | select | nein | alle | Reel, Karussell, Bild, Story, LinkedIn-Text, Google-Beitrag | |
| Ziel (`ci-ziel`) | select | nein | alle | Vertrauen, Sichtbarkeit, Anfragen, Bindung | |
| Säule (`ci-saeule`) | select | nein | alle | feste Schlüssel Arbeit, Wissen, Team, Angebot, Region | «Deine Säulen: … Der Filter ordnet die Ideen in fünf feste Gruppen …» (die Namen aus dem Profil sind nur ein Hinweis, gefiltert wird nie danach) |
| Suchen (`ci-suche`) | `type="search"` | nein | leer | höchstens 80 Zeichen | «Sucht in Titel und Beschrieb. Jedes Wort muss vorkommen.» |

Zusätzlich (C7): Format-Knöpfe über der Liste (`role="group"`, Name «Nach Format eingrenzen», `aria-pressed`, je Knopf die Zahl der Treffer, die den anderen Filtern genügen; ein zweiter Klick hebt das Format auf, das Feld «Format» bleibt gleich) und «Ordnen nach» (`ci-gruppe`: Keine Gruppen, Format, Säule, Ziel; Standard «Keine Gruppen»).

Knöpfe: «Alle Filter aufheben» (setzt alles auf «alle», auch Branche und Monat; die Profil-Vorbelegung ist damit weg), «Zufällige Idee», «Mehr Ideen anzeigen», je Karte «Merken»/«Gemerkt», in der Merkliste «Entfernen», «Merkliste kopieren», «Liste leeren» (mit Rückfrage), «CSV herunterladen», «Kalender-Entwurf (.ics) herunterladen».

## Daten: `data/branchen-ideen.json`
Quelle: `meta: { source: "Redaktion Alperna", url: "https://tools.alperna.ch", asOf: "2026-10-09", note: "Redaktionelle Ideen ohne Zahlen. Überarbeitet am 09.10.2026 (Schweiz-Bezug, Klone, Hook-Anfänge)" }`. Die Ideen schreibt die Redaktion von Alperna; es sind keine Statistiken und keine Richtwerte, darum gibt es keine Zahl, die eine Quelle bräuchte.
- 12 Branchen (`key`, `label`, `beispiele`): Handwerk, Bau und Garten, Gastronomie, Coiffeur und Kosmetik, Gesundheit, Treuhand und Beratung, Immobilien, Garage und Auto, Fitness und Sport, Detailhandel, IT und Digital, Verein. Handwerk deckt Malerei, Schreinerei, Sanitär und Elektro zusammen ab.
- 386 Ideen (Stand 09.10.2026): 32 für alle Betriebe (`branche: "alle"`), je Branche 27 bis 33. Jede Idee: `id` (`<branche>-NN`), `branche`, `titel` (5 bis 70 Zeichen), `beschrieb` (20 bis 220, an den Betrieb gerichtet: «Zeig …», «Erkläre …»), `hook` (10 bis 120, erster Satz des Beitrags), `format`, `monate` (`"alle"` oder Liste 1 bis 12, auch über den Jahreswechsel), `ziel`, `aufwand` (`S` klein, `M` mittel, `L` gross), `saeule` (jede Idee hat eine).
- Regeln, in `logic.test.ts` geprüft: strenges Schema (`datasetSchema`), eindeutige IDs und Titel, je Branche mindestens 20 Ideen, alle Formate, Ziele, Aufwände und Säulen vorhanden, `brandHits` leer (auch die Hinweise), keine Ziffern, keine Ausrufezeichen, kein «jetzt» und «garantiert», keine Rechtsaussagen (kein «laut Gesetz», keine Paragrafen), jedes Vorher-Nachher mit «Einverständnis», bei Kindern «der Eltern», für jede Branche und jeden Monat mindestens 15 Ideen (mit denen für alle).
- Laden (`loadDataset`): robust. Ungültige Ideen, unbekannte Branchen, doppelte IDs und Titel fallen einzeln weg; kaputte Daten ergeben eine leere Bibliothek, nie einen Absturz.
- Aufnahme neuer Ideen: Ein Eintrag am Ende des Branchen-Blocks, nächste fortlaufende ID, Test laufen lassen.

## Logik
1. **Branche aus dem Profil** (`branchenKeyFor(branche, branchen, organisationstyp)`): Text auf Kleinbuchstaben ohne Umlaute gefaltet (`foldText`: ä→a, «ae/oe/ue»→a/o/u, ß→ss), in Wörter zerlegt (mindestens zwei Zeichen, Füllwörter wie «und», «für», «AG», «GmbH» fallen weg). Je Wort der beste Treffer gegen die Wörter aus `label` und `beispiele` der Branche: gleiches Wort 3 Punkte, gemeinsamer Wortanfang ab fünf Buchstaben («Maler»/«Malerei», «Blumen»/«Blumenladen») 2 Punkte. Die Punkte der Wörter werden addiert; die Branche mit den meisten Punkten gewinnt, bei Gleichstand die zuerst im Datensatz. Ohne Treffer «verein» (wenn `organisationstyp` «verein» ist und es die Branche gibt), sonst «alle».
2. **Startwerte** (`initialFilter(profil, heute)`): `{ branche: branchenKeyFor(...), mitAllgemein: true, format/ziel/saeule: "alle", monat: monthOf(heute) }`. Der Monat kommt aus Schweizer Zeit (`Europe/Zurich`). Vor der Hydrierung (Server, erste Anzeige) gilt der leere Filter; erst danach Profil und Uhr. Was die Person ändert, liegt über den Startwerten.
3. **Filtern** (`filterIdeen(ideen, filter, suche)`): alle Bedingungen zugleich (UND).
   - Branche `alle`: keine Einschränkung. `uebergreifend`: nur Ideen mit `branche: "alle"`. Ein Schlüssel: Ideen dieser Branche, und mit `mitAllgemein` auch die für alle Betriebe.
   - Format, Ziel, Säule: gleich dem gewählten Wert oder «alle».
   - Monat m: `monate === "alle"` oder `monate` enthält m; «alle» schliesst nichts aus. Ungültige Monate (0, 13, 1.5) schliessen nichts aus.
   - Suche: `foldText` auf Titel und Beschrieb (nicht auf den Hook); der Suchbegriff wird in Wörter zerlegt, jedes Wort muss als Teilstück vorkommen. Gross/Klein und Umlaute sind egal («kueche», «Küche», «kuche» finden dasselbe).
   - Reihenfolge: bei einer bestimmten Branche zuerst deren Ideen, dann die für alle; innerhalb davon zuerst die Ideen, die ausdrücklich zum gewählten Monat passen (nicht nur «ganzjährig»); sonst die Reihenfolge der Daten (stabil sortiert). Die Eingabeliste bleibt unverändert.
4. **Gruppen** (`sortByGruppe`, `groupIdeen`, `formatCounts`): Mit Gruppen wird die ganze Trefferliste zuerst nach der Reihenfolge der Auswahlliste geordnet (Formate, Säulen, Ziele; Ideen ohne Säule am Ende), stabil innerhalb einer Gruppe, und erst dann auf die angezeigte Seite gekürzt. Eine Gruppe nennt ihre wahre Grösse (`total`) und «k angezeigt», solange erst ein Teil zu sehen ist. Gruppenkopf ist ein `p` mit Klasse `eyebrow` (keine Überschrift, die Reihenfolge der Überschriften der Seite bleibt); jede Gruppe ist ein `role="group"` mit einer eigenen Liste «Ideen: <Gruppe>». Ohne Gruppen bleibt eine flache Liste «Ideen».
4a. **Seiten** (`PAGE_SIZE` 24, `visibleLimit(limit, index)`): Die Liste zeigt 24 Karten; «Mehr Ideen anzeigen» legt 24 nach und setzt den Fokus auf die erste neue Karte. Ändert sich ein Filter, beginnt die Liste wieder mit einer Seite. Liegt die zufällige Idee hinter der Seite, wird die Liste so weit verlängert, dass sie dabei ist.
5. **Zufall** (`randomIdea(ideen, seed?, exceptId?)`): wählt aus der gefilterten Liste (nicht aus der ganzen Bibliothek). Mit `seed` (Zahl oder Text, FNV-Hash und mulberry32) immer dieselbe Idee; ohne `seed` entscheidet `Math.random`. `exceptId` schliesst die zuletzt gewählte Idee aus, solange es eine andere gibt. Leere Liste: `null`, der Knopf ist dann gesperrt. Die gewählte Karte bekommt einen Rahmen (`data-highlight="true"`), wird in die Mitte gescrollt (bei «Bewegung reduzieren» ohne Animation) und erhält den Fokus.
6. **Merkliste** (`mt:merkliste`, `{ v: 1, ideen: [{ id, gemerktAm }] }`): bisher nutzt kein anderes Werkzeug den Schlüssel; die Form folgt CLAUDE.md. `toggleMerk(liste, id, jetzt)` merkt oder entfernt (Reihenfolge der Merkung, Kopie statt Änderung); höchstens `MAX_MERK` = 200 Einträge, bei voller Liste nimmt sie nichts mehr auf, Entfernen geht immer. `parseMerkliste(raw)` liest auch eine blosse Liste von IDs oder Einträgen, lässt Kaputtes, doppelte IDs und ungültige IDs (Muster `a-z0-9-`, höchstens 40 Zeichen) einzeln weg und kappt bei 200. `merkIdeen(liste)` löst IDs auf; IDs, die es nicht mehr gibt, bleiben in der gespeicherten Liste (ein anderes Werkzeug oder eine spätere Fassung der Daten kann sie brauchen), erscheinen aber nicht in Anzeige, Zähler und Export. Der Eintrag «Alles löschen» auf `/profil` löscht auch die Merkliste.
7. **Monate lesbar** (`monateLabel`): «ganzjährig», «März», «März und April», «März bis Mai», über den Jahreswechsel «November bis Januar», mehrere Stücke mit Komma («März bis Mai, September und Oktober»); alle zwölf oder eine leere Liste heissen «ganzjährig».
8. **Termin je Idee** (`nextMonthDate(monate, heute)`): Passt der laufende Monat (oder `"alle"`), gilt heute, weil der Erste dieses Monats schon vorbei wäre. Sonst der Erste des nächsten passenden Monats, über den Jahreswechsel («November», Idee Februar bis März → 01.02. des nächsten Jahres); ein Monat, der gerade vorbei ist, kommt erst im nächsten Jahr. Rechnung in Schweizer Zeit (31.12., 23:30 UTC ist schon der 1. Januar).
   Annahme: Die Spezifikation sagt «am ersten Tag des nächsten passenden Monats». Läuft der passende Monat schon, wäre der Erste ein Datum in der Vergangenheit; darum heute. Im UI und im Seitentext ist es so beschrieben, und die Termine sind als Entwurf gekennzeichnet (vorläufig, «frei»), die Person verschiebt sie im Kalender.
9. **CSV** (`buildCsv`): Kopfzeile `Titel;Beschrieb;Hook;Format;Ziel;Aufwand;Monate`, Semikolon (Excel in der Schweiz), Zeilenende CRLF, UTF-8 mit BOM (damit Umlaute stimmen). Felder mit Semikolon, Anführungszeichen oder Zeilenumbruch stehen in Anführungszeichen (`"` verdoppelt). Format, Ziel und Aufwand mit lesbaren Beschriftungen (Reel, Karussell …; Aufwand klein, mittel, gross), Monate mit `monateLabel`. MIME `text/csv;charset=utf-8`.
10. **Kalender-Entwurf** (`buildIcs(ideen, heute)`, RFC 5545): `VCALENDAR` mit `PRODID:-//Alperna//tools.alperna.ch//DE`, `X-WR-CALNAME:Content-Ideen`; je Idee ein `VEVENT` mit `UID:<id>-<JJJJMMTT>@tools.alperna.ch`, `DTSTAMP` (UTC), `DTSTART;VALUE=DATE` und `DTEND;VALUE=DATE` (Folgetag, auch am Monats- und Jahresende), `SUMMARY:Idee: <Titel>`, `DESCRIPTION:<Beschrieb>\n\nErster Satz: <Hook>`, `STATUS:TENTATIVE`, `TRANSP:TRANSPARENT`. Komma, Semikolon, Backslash und Zeilenumbruch maskiert; jede Zeile auf höchstens 75 Byte (UTF-8) gefaltet, ohne ein Zeichen zu zerreissen (`foldIcsLine`); Zeilenende CRLF. Leere Liste: gültiger Kalender ohne Termine. MIME `text/calendar;charset=utf-8`.
11. **Dateinamen** (`exportBasename(firma)`, `safeFilename`): `inhalte-ideen-<firma>.csv` bzw. `.ics`, ohne Firma `inhalte-ideen.csv`.
12. **Stand** (`mt:inhalte-ideen`): `{ v: 1, output?: { gemerkt: n } }`. `parseState` liefert bei kaputten Daten den leeren Stand `{ v: 1 }` und deckelt `gemerkt` bei 200; `stateAfterMerk(prev, n)` schreibt die Zahl, sobald `n > 0`, und lässt bei leerer Liste den bisherigen Stand stehen.

## Ausgaben
- Statuszeile (`role="status"`, `data-testid="ci-count"`): «n Ideen» bzw. «1 Idee». Darunter «x von n Ideen angezeigt», wenn die Liste länger ist als die angezeigten Karten.
- Liste (`ul` mit `aria-label="Ideen"` als Raster mit mindestens 18 rem breiten Spalten, auf dem Handy eine Spalte; Karten als `article` mit `data-testid="ci-card"` und `data-idea-id`): Titel, Beschrieb, «Erster Satz: «…»» (kursiv), Eckdaten als Begriff/Wert-Liste (Für, Format, Aufwand, Ziel, Monate, Säule) und der Knopf «Merken» (`aria-pressed`, danach «Gemerkt», beschrieben durch den Titel). Keine Überschriften in der Liste (die erste Überschrift der Seite nach der H1 ist «Warum das wichtig ist»; sonst bräche die Reihenfolge der Überschriften).
- Merkliste (`section`, Name «Deine Merkliste», `data-testid="ci-merkliste"`): Zähler («Noch nichts gemerkt» / «n Ideen gemerkt», `role="status"`), `ul` mit `aria-label="Gemerkte Ideen"` (Titel, Format und Monate, «Entfernen»), «Merkliste kopieren» (Markdown mit Beschrieb und erstem Satz, ohne Adresse), «Liste leeren» (Rückfrage «Alle Ideen entfernen?»), «CSV herunterladen», «Kalender-Entwurf (.ics) herunterladen» (erst sichtbar, wenn etwas gemerkt ist), Hinweise zum Kalender und zur Adresse, Meldung «CSV heruntergeladen.» (`role="status"`), Fehler in `role="alert"`. Ab 1024 px steht sie rechts neben der Liste; auf dem Handy darunter, mit dem Link «Zur Merkliste (n)» über der Liste.
- Ohne Treffer: «Keine Idee passt zu diesen Filtern. …» mit «Alle Filter aufheben»; «Zufällige Idee» ist gesperrt.
- Dateien erst mit Adresse; Kopieren und Merken immer.
- Mobil bei 375 px ohne Überlauf (im Browser geprüft: `scrollWidth` gleich `clientWidth` mit Merkliste, Fenster und Zufallskarte), Knöpfe mit langem Text umbrechen, Ziele mindestens 44 px, jedes Feld mit Label, Tastatur durchgehend (Fokus nach «Zufällige Idee», «Mehr Ideen anzeigen» und «Entfernen» auf einem klaren Ziel).

## Edge Cases (getestet)
- Profil leer: Branche «Alle Branchen», Monat laufender Monat; Profil mit Verein und ohne Branche: «Verein».
- «Sanitär», «Sanitaer», «SANITAR» erkennen dieselbe Branche; «Restaurant und Catering» wird nicht von «Bau und Garten» wegen des Wortes «und» geschluckt; «Keller AG» und «und» ergeben «alle».
- Filter einzeln, kombiniert, ohne Treffer; Ideen für das ganze Jahr bei jedem Monat; Monat über den Jahreswechsel; Eingabeliste unverändert.
- Suche mit Umlauten, Gross/Klein, mehreren Wörtern, Leerraum, nur Leerraum; der Hook wird nicht durchsucht.
- Zufall: gleicher Seed gleiche Idee, anderer Seed andere, leere Liste `null`, einzige Idee trotz `exceptId`, zweiter Klick wählt eine andere Karte, Karte hinter der ersten Seite wird sichtbar.
- Termin: laufender Monat, Folgemonat, Jahreswechsel, frühester statt erster Monat der Liste, Monat gerade vorbei, `"alle"`, leere Liste, Unsinn, Mitternacht in Zürich (Winter- und Sommerzeit).
- CSV mit Semikolon, Anführungszeichen, Zeilenumbruch im Feld; BOM; leere Liste. ICS mit Umlauten über 75 Byte, maskierten Zeichen, Monats- und Jahresende, leerer Liste.
- Merkliste: merken, entfernen, nicht verändern, volle Liste (200), kaputte Daten (`null`, Zahl, Text, `{}`, falscher Typ), blosse ID-Liste, doppelte, ungültige und zu lange IDs, ungültiges Datum, unbekannte IDs bleiben gespeichert, aber unsichtbar.
- Stand: kaputt, falscher Typ, negativ, `NaN`, `Infinity`, zu gross; `lib/progress.ts` erkennt ihn.
- Datensatz fehlt oder ist kaputt: leere Bibliothek, kein Absturz. Der Datensatz hat eine Quelle in `meta`.
- Export: Fenster geschlossen («Später»): keine Datei, kein CRM-Eintrag, Merkliste bleibt. Download wirft: Meldung in `role="alert"`, kein CRM-Eintrag. Dieselbe Liste zweimal: ein CRM-Eintrag; andere Liste oder andere Dateiart: neuer Eintrag.

## Texte
- Tagline (110 Zeichen, gleich in `tool.config.ts` und Seitentext): «Hunderte Beitragsideen für Schweizer Betriebe nach Branche, Format und Monat; merken und als Plan exportieren.» «Hunderte» stimmt: 386 Ideen; ein Test hält mindestens 300 fest.
- SEO-Title: «Content-Ideen Schweiz: Beitragsideen nach Branche» (49 Zeichen); Meta-Description (145 Zeichen) in `content/tools/inhalte-ideen.md`.
- Keyword «Content-Ideen»: 4 Mal (H1 und Text), in H1 und im ersten Absatz.
- Seitentext (686 Wörter, 0 Fehler und 0 Hinweise nach `checkToolContent`), Beispiel Malerei Keller, Gossau (Handwerk, Oktober, drei gemerkte Ideen: `handwerk-01`, `handwerk-03`, `handwerk-21`; die Eckdaten im Kasten hält ein Test fest), FAQ (7: Woher kommen die Ideen, frei verwenden, KI, Konto, was Alperna erfährt, Branchen, Content-Säulen) und Alperna-Satz (Baustein Social Media, `beweis: @baustein`): `content/tools/inhalte-ideen.md`.
- Hinweis zum Aufwand im UI: «Aufwand: klein heisst, du schaffst es mit dem Handy in kurzer Zeit. Mittel braucht etwas Vorbereitung, gross mehrere Szenen oder Termine.» Das ist eine Einordnung der Redaktion, keine Statistik und keine Zahl.

## Tests
`tools/inhalte-ideen/logic.test.ts` (111 Fälle): Datensatz (Schema, Zahl der Ideen und Branchen, eindeutige IDs und Titel, Abdeckung der Formate, Ziele, Aufwände und Säulen, Sperrwörter, keine Zahlen, keine Rechtsaussagen, Einverständnis, Anrede, Monate, Abdeckung je Branche und Monat), `loadDataset` bei kaputten Daten, Branche aus dem Profil, `initialFilter`, Filter einzeln und kombiniert, Suche, `visibleLimit`, Zufall, Monate lesbar, Termin, Merkliste, Markdown, Eingabe- und Ausgabetexte, CSV, ICS, Stand, Beispiel im Seitentext. `tools/inhalte-ideen/Tool.test.tsx` (21 Fälle, jsdom): Vorbelegung aus Profil und Uhr, Filter, Suche und Leerzustand, «Nur Ideen für alle Betriebe» und Kästchen, «Mehr Ideen anzeigen» mit Fokus, Hinweis auf eigene Säulen, Eckdaten der Karte, Zufall (Hervorhebung und Fokus), Merken und Entfernen mit Speicher und Stand, gespeicherte und kaputte Merkliste, «Liste leeren», Kopieren, Export mit und ohne Adresse (Fenster, Dateiname, Inhalt, ein CRM-Eintrag), «Später», Fehler beim Download.

## Nicht Teil dieses Tools
- Fertige Beitragstexte: Dafür gibt es den Caption-Baukasten und den Post-Generator; die Ideen liefern nur Anlass, Aufbau und ersten Satz. Keine KI, kein Server.
- Statistiken, Benchmarks oder «beste Zeit zum Posten»: Es gibt keine Quelle, also keine Zahl.
- Rechtlicher Rat zu Bildrechten, Datenschutz oder Werbung: Die Ideen nennen nur, dass man Einverständnis einholt (bei Kindern von den Eltern); mehr nicht.
- Eigene Ideen anlegen oder Ideen bearbeiten: Die Bibliothek ist redaktionell; wer eigene Gedanken festhalten will, schreibt sie in den Kalender-Entwurf.
- Termine mit Uhrzeit, Erinnerungen oder Verteilung der Ideen auf Wochen: Der Content-Kalender plant Wochen; hier ist ein Termin je Idee ein Entwurf, den man im Kalender verschiebt.
- Abgleich mit den eigenen Säulen: Die Namen aus dem Profil erscheinen als Hinweis; gefiltert wird nach den fünf festen Gruppen.
- Mehrere Merklisten, Teilen mit dem Team oder Synchronisation zwischen Geräten: Die Liste lebt im Browser; wer sie weitergeben will, kopiert sie oder lädt die CSV.

## Redaktions-Audit (Charge C7, 09.10.2026)
`tools/inhalte-ideen/audit.ts` (rein) und `scripts/ideen-audit.ts` (`npx tsx scripts/ideen-audit.ts [--ids|--text]`) messen die Bibliothek; die Grenzen prüft `audit.test.ts`.
- **Schweiz-Bezug:** Titel, Beschrieb oder Hook nennt einen Begriff aus `CH_BEGRIFFE` (Orte und Regionen, Bräuche und Anlässe, Einrichtungen und Behörden, Schweizer Wörter wie Znüni, Storen, Hauswart, Pneu). Das Wort «Region» oder «Schweiz» allein zählt nicht als Beleg für eine Idee, die sonst überall stehen könnte; die Liste ist redaktionell und wächst mit der Bibliothek. Ziel: mindestens die Hälfte der Ideen (`SCHWEIZ_ZIEL` 0,5); Stand 09.10.2026: 244 von 386 (63,2 %), vorher 33 (8,5 %). Jede Branche mindestens ein Drittel.
- **Klone:** Titel ab 0,6 oder Beschrieb ab 0,55 Wortstamm-Ähnlichkeit (Jaccard über Fünf-Buchstaben-Stämme) innerhalb einer Branche und mit den Ideen für alle; Stand: keine.
- **Hook-Anfänge:** dieselben ersten drei Wörter höchstens dreimal (`HOOK_ANFANG_MAX`); Stand: keine Wiederholung darüber.
- Die Überarbeitung hat nur Titel, Beschrieb und Hook angefasst; IDs, Formate, Monate, Ziele, Aufwand und Säulen sind gleich geblieben, ebenso die Regeln aus `logic.test.ts` (keine Ziffern, kein «jetzt», keine Rechtsaussagen). Wo ein Datum nötig war, steht der Anlass beim Namen («Bundesfeier» statt «1. August»).
- Neue Ideen: erst `--text` laufen lassen, einen konkreten Bezug einbauen (Anlass, Ort, Einrichtung, Schweizer Wort), dann die Tests.
