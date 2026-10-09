# Content-Kalender Schweiz (feiertagskalender)

## Nutzen in einem Satz
Für KMU, die regelmässig posten wollen: ein Jahreskalender mit den Anlässen, Feiertagen und Schulferien des eigenen Kantons und drei Beitragsideen je Anlass (Format, Bildidee, Hook), in vier Minuten, als Jahresraster, Monatsansicht, Kalenderdatei (.ics), CSV und PDF.

## Kategorie und Verknüpfung
Kategorie: content, Zielgruppe beide (KMU und Vereine), Klasse C (Browser, mit Datensätzen), Pfad «content», Schritt 5.
Liest aus Profil: firma, branche, kanton, kanaele, organisationstyp.
Schreibt ins Profil: nichts. Die Grunddaten (Firma, Branche, Kanton) fragt das Werkzeug über ProfileFieldsForm; die Felder gehören ins Profil und werden dort gepflegt.
Verwandte Werkzeuge: inhalte-saeulen, inhalte-ideen, gbp-feiertage.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma | text (Profil) | nein | profile.firma | – | steht in Kopf von PDF und Kalender |
| Branche | text (Profil) | nein | profile.branche | – | Freitext des Profils |
| Kanton | single (Profil) | ja | profile.kanton | muss ein Kanton aus lib/ch sein | bestimmt Feiertage, Schulferien und regionale Anlässe |
| Jahr | single | ja | laufendes Jahr | laufendes oder nächstes Jahr | – |
| Branche für Vorschläge | single | ja | aus organisationstyp und Branchen-Freitext per Wortvergleich, sonst «Andere» | Handwerk, Gastronomie, Dienstleistung, Detailhandel, Verein, Andere | wählt die Variante des Vorschlags |
| Kanäle | multi | ja, mindestens einer | aus profile.kanaele (Wortvergleich), sonst Instagram und Google-Beitrag | Instagram, Facebook, LinkedIn, Google-Beitrag, Newsletter, Website | – |
| Eigene Termine | Liste | nein | – | Datum (gültig), Titel 1 bis 60 Zeichen, höchstens 20, kein Duplikat | zum Beispiel Tag der offenen Tür |

## Logik
1. Datensätze: data/anlaesse-ch.json, data/schulferien.json, data/feiertage.json. Jeder wird mit zod geprüft (safeParse). Ist ein Datensatz kaputt, arbeitet das Werkzeug ohne ihn und sagt das im Hinweis. Fehlt feiertage.json oder ist es kaputt, gilt eine kleine eigene Liste (Neujahr, Auffahrt, 1. August, Weihnachten) mit Hinweis.
2. Bewegliche Daten: Ostersonntag nach der Gauss-Formel (Meeus/Jones/Butcher), alle Berechnungen in UTC-Teilen. Regeln: Muttertag = zweiter Sonntag im Mai, Vätertag = erster Sonntag im Juni, Black Friday = Freitag nach dem vierten Donnerstag im November, Schulbeginn = Tag nach dem Ende der Sommerferien des Kantons, Fasnacht = Ostern -52 bis -47 Tage, Basler Fasnacht = Ostern -41 bis -39 Tage.
3. Anlässe: nur die der Region (Kanton in `region` oder «alle»). Je Anlass (gleiche `id`) wird die Variante der gewählten Branche genommen, sonst die Variante «alle»; gibt es keine von beiden, fehlt der Anlass.
4. Feiertage: nur Kantone mit geöffneter Quelle (sonst die eidgenössischen Tage mit Hinweis); ortsübliche Tage stehen nicht im Kalender, werden aber im Hinweis genannt; ein Tag mit Bedingung (AR: Stephanstag) entfällt, wenn sie im Jahr nicht erfüllt ist. Fällt ein Feiertag mit einem Anlass derselben `id` zusammen (Neujahr, 1. August, Weihnachten), steht er einmal, als «Anlass und Feiertag».
5. Schulferien: jeder Ferienblock des Kantons, der das Jahr berührt, eine Zeile in dem Monat, in dem er im Jahr beginnt. Blöcke über den Jahreswechsel erscheinen in beiden Jahren (gekürzt auf das Jahr).
6. Eigene Termine: im gewählten Jahr, sortiert; Termine in anderen Jahren zählt der Hinweis.
7. Reihenfolge: Datum, dann Anlass, Feiertag, eigener Termin, Schulferien, dann Titel.

## Ausgaben
- Jahr auf einen Blick (`jahresRaster`, DocBlock `grid`, data-testid `ck-raster`): zwölf Monate als Zeilen, je Art (Anlässe, Feiertage, Schulferien, eigene Termine) eine Spalte, leere Spalten entfallen; Ferien stehen im Startmonat («ab 04.07. Sommerferien»). Das Raster steht auch in PDF, Word und Markdown.
- Monatsansicht (zwölf Abschnitte), je Eintrag Datum, Wochentag, Titel, Art; bei Anlässen ein aufklappbarer Vorschlag mit drei Varianten (`VorschlagView`, data-testid `ck-vorschlag` und `ck-variante`): je Variante Format, Bildidee, Hook und «Hook kopieren»; dazu Kanäle und, wenn vorhanden, der Hinweis des Anlasses.
- Text kopieren (Jahresübersicht als Markdown) ist frei. Downloads (Kalender .ics, CSV, PDF, Word) laufen über guardDownload.
- .ics: ein Ganztagstermin je Eintrag, Ferien und Mehrtägiges als mehrtägiger Termin, SUMMARY «Beitrag: …», DESCRIPTION mit Vorschlag und den drei Varianten (Format, Bild, Hook), Erinnerung 7 Tage vorher bei Anlässen.
- CSV: Datum;Art;Titel;Vorschlag;Variante 1;Variante 2;Variante 3;Kanäle, UTF-8 mit BOM, Semikolon. Eine Variante steht in einer Zelle: «Reel. Bild: … Hook: …».
- PDF und Word: Jahresübersicht mit einer Tabelle je Monat und den Quellen.
- Hinweis mit Quellen (Links) und dem Satz, welche Kantone belegt sind.
- CRM: eingabe = Kanton, Jahr, Branche, Kanäle, eigene Termine; ausgabe = Jahresübersicht als kompaktes Markdown.

## Edge Cases
- Kanton fehlt im Profil: Meldung vor dem Fenster. Kanton ohne geprüfte Schulferien oder Feiertage: der Kalender erscheint, der Hinweis nennt die Lücke.
- Kein Kanal gewählt: Meldung. Mehr als 20 Termine oder ein Termin mit ungültigem Datum, leerem oder doppeltem Titel: Meldung.
- Jahr ohne Daten (zum Beispiel 2028): Schulferien fehlen, der Hinweis sagt es; OLMA und Näfelser Fahrt gibt es nur in den Jahren des Datensatzes.
- Profil leer: Vorbelegung Instagram und Google-Beitrag, Branche «Andere».
- Datensatz ohne Quelle (meta.url nicht https) wird verworfen.
- Eigener Termin mit «=», «+», «-», «@» am Anfang: in der CSV mit vorangestelltem Apostroph, damit Excel keine Formel ausführt.

## Texte
- Tagline: «Anlässe, Feiertage und Schulferien deines Kantons als Jahresplan mit drei Beitragsideen je Anlass.»
- SEO-Title (≤ 60, mit «Schweiz»), Meta-Description (≤ 155): siehe content/tools/feiertagskalender.md.
- Seitentext: 350 bis 700 Wörter, Beispiel Malerei Keller, Gossau (Kanton St. Gallen), drei Monate aus dem echten Ergebnis.
- Alperna-Baustein: Social Media.

## Tests
Mindestens 22 Fälle in logic.test.ts (Regeln, Osterrechnung, Filter, Schulferien, eigene Termine, Monate, ICS, CSV, Dokument, Schemas, parseState, eingabe/ausgabe).

## Nicht Teil dieses Tools
Kein Server, keine KI. Keine Texte zu den Beiträgen selbst (das machen inhalte-ideen und caption-baukasten). Keine Gemeinde-Feiertage, kein Kalender-Abo (nur Datei). Keine Zahlen zu Reichweite oder Wirkung.

## Varianten, Formate und neue Anlässe (Stand 09.10.2026, Charge A2)
- Jeder Vorschlag (`vorschlag.titel`) hat genau drei Varianten (`VARIANTEN = 3`) mit je Format, Bildidee (10 bis 160 Zeichen) und Hook (10 bis 240 Zeichen). Die drei Formate eines Vorschlags sind verschieden.
- Formate (`FORMATE`): Reel, Karussell, Story mit Umfrage, Einzelbild mit Frage, Beitrag mit Angebot, Text-Beitrag, Vorher-nachher. «Foto mit kurzem Text» ist gestrichen: Es sagt weder, was zu sehen ist, noch, wie der Beitrag aufgebaut ist (Rückmeldung vom 09.10.2026). Längenangaben wie «15 Sekunden» beschreiben die Länge eines Kurzvideos, keine Messung.
- Sechs Branchengruppen (Handwerk, Gastronomie, Dienstleistung, Detailhandel, Verein, Andere); die 14 Einträge der gemeinsamen Branchenliste (`lib/branchen.ts`, Feld `kalender`) werden darauf abgebildet. Zielwert im Plan waren 12 Branchen; eigene Texte je Branche gäbe es nur für die grossen Anlässe, der Rest fällt auf «alle» zurück. Das ist offen und eine Entscheidung für P4 oder später.
- Neue Anlässe: Halloween (31.10., überall), Räbeliechtli (11.11. als Richtwert, belegt für AG, AR, AI, BL, BS, SG, TG, ZH; Hinweis «Das Datum legt jede Gemeinde selbst fest»), Sechseläuten (`regel:sechselaeuten`, nur ZH; dritter Montag im April, bei Ostermontag der vierte, Stadt Zürich, Stadtratsbeschluss Nr. 1214 vom 13.06.1952). Quellen stehen in `data/anlaesse-ch.json` (`meta.links`).
- Optionales Feld `hinweis` am Anlass; es erscheint als Hinweis am Eintrag und wird mit dem Hinweis eines gleichzeitigen Feiertags zusammengesetzt.
- Tests: Schema, drei verschiedene Formate, keine harte Regel der Stimme (`brandHits`), kein Ausrufezeichen, Abdeckung der grossen Anlässe je Branchengruppe, Sechseläuten 2020 bis 2060 immer ein Montag im April und nie der Ostermontag, Filter nach Kanton, Jahresraster, Dokument, CSV, ICS.
