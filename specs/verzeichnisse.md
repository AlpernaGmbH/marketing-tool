# Verzeichnis-Check (verzeichnisse)

## Nutzen in einem Satz
Für Betriebe und Vereine, die vor Ort gefunden werden wollen: Aus Name, Adresse und Telefon entsteht in etwa fünf Minuten ein einheitlicher Eintrag zum Kopieren und eine Aufgabenliste (Eintragen, Prüfen, Angleichen) für die wichtigsten Verzeichnisse.

## Kategorie und Verknüpfung
Kategorie: schweiz (Klasse C, alles im Browser, Daten mit Quelle). Pfad «schweiz», Schritt 5.
Liest aus Profil: organisationstyp, firma, ort, website, branche (die Branche nur, um Tripadvisor ein- oder auszublenden; sie wird nicht erneut gefragt).
Schreibt ins Profil: nichts (`writesProfile: []`).
Verwandte Tools: bewertungs-kit, qr-set, digitaler-auftritt-check.

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (Organisationstyp) | single | nein | Profil | kmu oder verein, nur für die Beschriftung | Verein: «Name des Vereins» |
| Firma | text | ja | Profil | nicht leer | Wird wörtlich der Name des Eintrags |
| Ort | text | ja | Profil | nicht leer, bis 80 | |
| Website | text | nein | Profil | Host mit Punkt und Endung; wird zu «https://host» ohne Schrägstrich am Ende | |
| Strasse und Nummer | text | ja | – | 3 bis 80 Zeichen | «ß» wird zu «ss» |
| PLZ | text | ja | – | genau vier Ziffern, nicht mit 0 beginnend | |
| Telefon | text | ja | – | Schweizer Nummer mit neun Ziffern nach der Vorwahl (Logik aus tools/whatsapp-link) | zeigt «+41 71 123 45 67» und «071 123 45 67» |
| Öffnungszeiten | text | nein | – | bis 200 Zeichen | |
| Kurzbeschreibung | text | nein | – | bis 300 Zeichen | Die Plattformen haben eigene Grenzen (ohne Zahl) |
| Status je Verzeichnis | single | nein | – | Ja, Nein, Weiss ich nicht (Standard) | Legende «<Name>: Bist du schon eingetragen?» |
| Eintrag dort (bei «Ja») | text | nein | – | Name bis 160, Adresse bis 200, Telefon bis 40 | «Wie lautet der Eintrag dort?» |
| Name des freien Verzeichnisses | text | nein | – | bis 80; ohne Namen kommt es nicht in die Liste | |

Branche steht nicht im Formular. Ist sie im Profil leer, erscheint Tripadvisor mit dem Zusatz «falls es zu deiner Branche passt».

## Logik
1. **Verzeichnisse.** Die Liste kommt aus `data/verzeichnisse.json` (`meta {source, url, asOf}` und je Eintrag id, name, typ, url, eintragUrl, kostenlos, bestaetigung, hinweis, quelle, geprueft). Das Zod-Schema in logic.ts prüft Struktur, https-Adressen, einmalige ids und dass «bewertung» ein Feld `branchen` trägt. Verletzt der Datensatz das Schema, nutzt das Werkzeug nur die freien Plätze und sagt das.
2. **Freie Plätze** (nicht in der Datei): «Gewerbeverzeichnis deiner Gemeinde», «Branchenverband oder Gewerbeverein», «Anderes Verzeichnis» (Name als Eingabe, ohne Namen ausgeblendet im Ergebnis). Sie haben keinen Link und keine Kostenangabe.
3. **Tripadvisor** (`typ: "bewertung"`): erscheint, wenn die Branche nach Stichwort Gastgewerbe oder Beherbergung ist (`GASTGEWERBE_RE`: gastro, restaurant, café, bar, beiz, hotel, pension, unterkunft, beherberg, ferienwohnung, b&b, camping …) oder wenn die Branche leer ist (dann mit Zusatz). Bei bekannter anderer Branche fehlt es ganz.
4. **Reihenfolge** (Richtwert von Alperna, keine Statistik, im UI so benannt): karte, telefonbuch, bewertung, branche, gemeinde; innerhalb des Typs in der Reihenfolge der Datei; bei Gastgewerbe steht «bewertung» an erster Stelle; die freien Plätze stehen zuletzt. Annahme: «bewertung (nur Gastgewerbe zuerst)» aus dem Auftrag ist so gelesen.
5. **Einheitlicher Eintrag.** Name = Firma wörtlich (Leerzeichen bereinigt). Adresse = «Strasse Nr, PLZ Ort». Telefon = «+41 71 123 45 67» (national zusätzlich als zweite Schreibweise). Website = «https://host» ohne Schrägstrich am Ende (Annahme: «http://» und fehlendes Schema werden zu «https://», der Host wird klein geschrieben). Öffnungszeiten und Kurzbeschreibung unverändert, wenn angegeben.
6. **Vergleich** `compareEntry(master, found)`, je Feld Name, Adresse, Telefon; leere Felder werden übersprungen. Arten:
   - `str-abkuerzung`: «str.», «str» vor Leerzeichen, Komma, Ziffer oder Ende in einer der beiden Adressen (auch umgekehrt: Abkürzung beim Soll).
   - `ss-eszett`: «ß» dort, nicht im Soll (Name und Adresse).
   - `telefon-format`: dieselbe Nummer (E.164 gleich), aber nicht in der Schreibweise «+41 71 123 45 67».
   - `name-zusatz`: bis vier Wörter vorn oder hinten mehr oder weniger (Rechtsform wie «GmbH», «AG» oder ein Ortszusatz). Immer nur Hinweis, nie Fehler.
   - `plz-fehlt`: die PLZ des Soll steht in der Adresse dort nicht.
   - `gross-klein`: gleich bis auf Gross- und Kleinschreibung.
   - `sonstige`: Hinweis, wenn nach Normalisierung gleich (Satzzeichen, Leerzeichen, Umlaute «ue», Kanton «SG» hinter dem Ort, fehlender Ort); Warnung, wenn wirklich verschieden (anderer Name, andere Hausnummer, andere PLZ, andere Nummer).
   Normalisierung vor dem Vergleich: Kleinschreibung, «ß» zu «ss», Umlaute zu «ae/oe/ue», Satzzeichen und Leerzeichen weg, «str.» zu «strasse», Telefon über E.164. Jede Abweichung trägt `dort`, `soll` (Vorschlag), `stufe` (hinweis oder warnung) und einen Erklärsatz. Mehrere Arten je Feld sind möglich.
7. **Aufgaben** je Verzeichnis: «Nein» → Eintragen (Link: eintragUrl, sonst url); «Weiss ich nicht» → Suchen, ob du schon drin bist (url); «Ja» ohne Angabe → Prüfe, ob Name, Adresse und Telefon wie oben lauten; «Ja» mit Abweichungen → Angleichen; «Ja» mit Angaben und ohne Abweichung → In Ordnung. Kosten: nur aus der Datei («Laut Anbieter kostenlos», «Laut Anbieter kostenpflichtig»), bei `null` «Prüfe die Bedingungen auf der Seite des Anbieters.». Bestätigung: nur wenn die Datei sie nennt.
8. **Annahme zur Datei:** Nur Angaben, die auf der Seite des Anbieters gelesen wurden (siehe `quelle`). Preise, Reichweite, Nutzerzahlen und Aussagen zum Ranking stehen nirgends.

## Ausgaben
- Ergebnis am Bildschirm (ResultCard «Deine Verzeichnis-Prüfung»): Zusammenfassung, Kopiervorlage mit Kopieren-Knopf je Feld und für den ganzen Eintrag, Aufgabenliste (`data-testid="aufgabe"`, `data-status`), Abweichungen (`data-testid="abweichung"`), Hinweise (kein Abruf, Quellenzeile aus meta, Bedingungen ändern sich).
- Text kopieren frei; PDF und Word über DocumentExport und `guardDownload` (Adresse vor dem ersten Download).
- Dokument: Kopf, Einheitlicher Eintrag (Steckbrief), Aufgabenliste (Verzeichnis, Aufgabe, Hinweis), Abweichungen (Verzeichnis, Feld, Dort, Soll, Art; nur wenn es welche gibt), Quelle und Stand («Angaben zu den Verzeichnissen: <meta.source>, Stand <asOf>.»).
- CRM (`sendResult`): `eingabe` = Firma, Ort, PLZ, Strasse, Telefon, Website, Branche, dann je Verzeichnis eine Zeile mit Status und (bei «Ja») dem eingefügten Eintrag, zuletzt Öffnungszeiten und Kurzbeschreibung; `ausgabe` = Markdown des Dokuments.
- Stand `mt:verzeichnisse`: `{ v: 1, phase: "edit" | "result", input, output? }` mit `output { firma, ort, website, branche, datum }` (Profilangaben zum Zeitpunkt der Prüfung). Der Pfad-Fortschritt erkennt `phase: "result"`.

## Edge Cases
- Leere oder ungültige Angaben: Meldungen in einem `role="alert"`, kein Fenster, nichts geht ins CRM.
- Telefon als Mobil, Festnetz, +41, 0041, mit Leerzeichen, Bindestrichen, Schrägstrichen und «(0)»; ungültige Nummer (zu kurz, zu lang, Ausland, Buchstaben) mit eigener Meldung.
- Website ohne Schema oder mit «http://» oder Schrägstrich am Ende; Unsinn wird gemeldet; leer ist erlaubt.
- Branche unbekannt: Tripadvisor mit Zusatz; Branche bekannt und nicht Gastgewerbe: kein Tripadvisor.
- Kein Name beim freien Verzeichnis: nicht in der Liste und nicht im CRM-Text.
- «Ja» ohne eingefügten Eintrag: Prüfen. Eingefügter Eintrag ohne Unterschied: In Ordnung.
- Datensatz fehlt oder verletzt das Schema: nur freie Plätze, Hinweis im Formular, Quellenzeile «keine Liste verfügbar».
- Kaputter Stand im Browser: leerer Stand; ein Ergebnis ohne gültige Angaben wird wieder zum Formular.
- Profil leer: Firma und Ort bleiben Pflicht und werden gemeldet.

## Texte
- Tagline (≤ 110 Zeichen): «In welchen Verzeichnissen du stehst, was fehlt und wo Name, Adresse und Telefon nicht übereinstimmen.» (101 Zeichen)
- SEO-Title: «Verzeichnis-Check Schweiz: Einträge prüfen und angleichen» (57); Meta-Description (138 Zeichen).
- H1: «Verzeichniseinträge prüfen mit dem Verzeichnis-Check für Schweizer KMU» (Keyword «Verzeichniseinträge» in H1 und im ersten Absatz, insgesamt dreimal).
- Gliederung: Warum das wichtig ist (ein Satz, vier Punkte), So nutzt du das Ergebnis (fünf Schritte), Häufige Fehler (fünf), Beispiel Malerei Keller, Gossau (echtes Ergebnis, im Test geprüft), Häufige Fragen (sechs), Alperna.
- Alperna: Baustein «Google Business Profil», `beweis: @baustein`. Der Beweis im Baustein ist bei Alperna noch offen; der Seitentext erfindet keinen, die Pitch-Komponente lässt den Beweis dann weg.

## Tests
`logic.test.ts` (84 Fälle): Datensatz-Invarianten (meta, https, quelle, geprueft, einmalige ids, kostenlos nur mit Quelle, keine Zahlen, Sperrliste, Schema lehnt Kaputtes ab), Telefon, Website, Eintrag und Validierung, jede Abweichungsart positiv und negativ, Gleichheit nach Normalisierung, Aufgaben je Status, Reihenfolge nach Typ, freie Plätze, Tripadvisor nach Branche, Dokument-Blöcke, Quellenzeile aus meta, eingabeText, parseState, PDF und Word, Seitentext (checkToolContent ohne Fehler, Keyword, Beispiel als echtes Ergebnis). `Tool.test.tsx` (22 Fälle): Formular, Beschriftungen, Status-Wechsel, Fehlermeldungen (PLZ, Telefon), Ergebnis, CRM-Text, Neuladen, Download, Links, Sperrliste.

## Nicht Teil dieses Tools
- Kein Abruf der Verzeichnisse, kein Lesen fremder Seiten, keine Suche nach Einträgen, keine KI.
- Keine Preise, keine Zahlen zu Reichweite oder Nutzerschaft, keine Aussage über den Einfluss auf das Ranking.
- Keine automatische Einreichung und keine Hilfe beim Bestätigungsverfahren über die Angabe der Anbieterseite hinaus.
- Kein Moneyhouse und kein eigener Eintrag für search.ch (local.ch und search.ch teilen einen Eintrag), keine Verzeichnisse, deren Seite nicht geöffnet werden konnte.
- Keine Rechtsaussagen zu Firmenname, Impressum oder Eintragungspflichten.
