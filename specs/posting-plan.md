# Posting-Plan nach Zeitbudget (posting-plan)

## Nutzen in einem Satz
Für KMU und Vereine, die neben dem Betrieb regelmässig posten wollen: aus Stunden pro Woche, Kanälen und Fähigkeiten ein Plan für vier Wochen mit Beiträgen pro Kanal und Woche, Format, Säule, Veröffentlichungstag und einem festen Produktionstag, in fünf Minuten, als Tabelle, CSV, PDF und Word.

## Kategorie und Verknüpfung
Kategorie: content, Zielgruppe beide (KMU und Vereine), Klasse C (alles im Browser, kein Server, keine KI, keine Datei in data/), Pfad «content», Schritt 11.
Liest aus Profil: firma, organisationstyp, kanaele (Wortvergleich wie im Content-Kalender), contentSaeulen (nur die Namen).
Schreibt ins Profil: nichts (`profilePatch` gibt es nicht). Die Grunddaten Firma und Art der Organisation fragt das Werkzeug über ProfileFieldsForm (`["organisationstyp", "firma"]`; Vereine sehen «Name des Vereins»). Kanäle und Säulen stehen im Profil nur als Vorbelegung: ProfileFieldsForm kennt für sie kein Feld.
Verwandte Werkzeuge: inhalte-saeulen (liefert die Säulen), feiertagskalender (liefert die Anlässe), caption-baukasten (liefert die Texte zu den Beiträgen).

## Eingaben
| Feld (Label) | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma / Name des Vereins | text (Profil) | nein | profile.firma | – | steht im Kopf von PDF und Word |
| Stunden pro Woche für Beiträge (`pp-stunden`) | number, Schritt 0,5 | ja | – | 0,5 bis 20 | davon gehen 0,25 Stunden für die Planung ab (Annahme von Alperna) |
| Produktionstag (`pp-produktionstag`) | single (Montag bis Sonntag) | ja | Montag | einer der sieben Tage | an diesem Tag entstehen alle Beiträge der Woche am Stück |
| Kanäle (Checkboxen `pp-kanal-<key>`) | multi | ja, mindestens einer | aus profile.kanaele per Wortvergleich, sonst Instagram und Google-Unternehmensprofil | Instagram, Facebook, LinkedIn, Google-Unternehmensprofil, Newsletter, Website (Blog oder Neuigkeiten) | Hinweis «Für diesen Kanal fehlt eine Fähigkeit», sobald ein Kanal kein Format hat |
| Was könnt ihr gut? (Checkboxen `pp-faehigkeit-<key>`) | multi | ja, mindestens «Text» | Text | Text, Foto, Video, Gestaltung | bestimmt, welche Formate möglich sind |
| Säulen | Namen | ja, mindestens eine | profile.contentSaeulen (nur Namen, erste fünf, je höchstens 40 Zeichen); fehlen sie, zwei bis fünf Zeilen `Säule n` mit Link auf inhalte-saeulen | 1 bis 5 Säulen, je höchstens 40 Zeichen, keine doppelte | Felder, die im Profil stehen, werden nicht erneut gefragt |
| Aufwand anpassen (`details`, Inputs `Aufwand: <Format>`) | number je Format | nein | Standardwerte aus `AUFWAND` | 0,1 bis 10 Stunden je Format | Annahme von Alperna, keine Statistik |

## Logik
Alle Zahlen dieses Werkzeugs sind Annahmen oder Richtwerte von Alperna, keine Statistik. Es gibt keine fremde Quelle und keine Datei in data/.

1. Aufwand je Format (Annahme: «Annahme von Alperna, keine Statistik», im UI, im Dokument und im Seitentext so benannt; die Person kann jeden Wert überschreiben). Stunden pro Beitrag, Konstante `AUFWAND`: Textbeitrag 0,5; Fotobeitrag 0,75; Karussell 1,5; Kurzvideo 2,0; Story 0,25; Google-Beitrag 0,25; Newsletter 1,5; Website-Beitrag 1,5.
2. Formate je Kanal und Fähigkeit (`availableFormats(kanal, faehigkeiten)`): Instagram: Fotobeitrag (Foto), Karussell (Foto und Gestaltung), Kurzvideo (Video), Story (Foto); Facebook: Textbeitrag, Fotobeitrag (Foto); LinkedIn: Textbeitrag; Google-Unternehmensprofil: Google-Beitrag; Newsletter: Newsletter; Website: Website-Beitrag. Ein Format ist nur verfügbar, wenn die nötige Fähigkeit gewählt ist. Rückfall: Facebook und LinkedIn führen den Textbeitrag ohne Zusatzfähigkeit, er ist also immer da. Instagram hat keinen Textbeitrag; ohne Foto oder Video erscheint der Kanal ohne Beitrag und mit dem Hinweis «Für diesen Kanal fehlt eine Fähigkeit.» plus der Angabe, welche Fähigkeit hilft.
3. Verfügbar = max(0, Stunden − 0,25). Annahme: Planungsaufwand 0,25 Stunden pro Woche.
4. Zuteilung (`allocate`), je Woche 1 bis 4 und nie über das Budget:
   a. Reihenfolge der Wichtigkeit (Richtwert von Alperna): Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Website.
   b. Rhythmus (Richtwert): Google, Instagram, Facebook und LinkedIn jede Woche; Newsletter alle zwei Wochen (Woche 2 und 4, «Aufwand in den geraden Wochen»); Website-Beitrag einmal in vier Wochen (Woche 3, damit er nicht mit dem Newsletter in einer Woche liegt).
   c. Erste Beiträge: je Kanal ein Beitrag im günstigsten verfügbaren Format (bei Gleichstand das erste der Tabelle).
   d. Zu kleines Budget: Ist die Summe der ersten Beiträge in irgendeiner Woche grösser als das Budget, werden Kanäle von hinten gestrichen (in umgekehrter Reihenfolge der Wichtigkeit), bis es passt. Das Ergebnis nennt es: «Mit n Stunden pro Woche reichen m Kanäle: … Nicht eingeplant: …». Die Kanalauswahl gilt für alle vier Wochen.
   e. Zweite Beiträge: Kanäle mit mehreren verfügbaren Formaten (Instagram, Facebook mit Foto) bekommen mit den übrigen Stunden einen zweiten Beitrag in einem anderen Format, und zwar im teuersten, das noch in die übrigen Stunden passt. Höchstens zwei Beiträge je Kanal und Woche (Richtwert von Alperna); die übrigen Stunden bleiben als Reserve und werden im Ergebnis genannt.
5. Veröffentlichungstage (`buildPlan`, Richtwert von Alperna): Dienstag, Donnerstag, Samstag der Reihe nach, aber nie am Produktionstag; zwei Beiträge desselben Kanals landen nie am selben Tag. Beiträge einer Woche stehen nach Wochentag sortiert.
6. Säulen: Die Beiträge der vier Wochen in zeitlicher Reihenfolge bekommen die Säulen der Reihe nach (Round Robin mit Ausgleich): Jeder Beitrag bekommt eine Säule mit der bisher kleinsten Zahl an Beiträgen, bei Gleichstand die, die dieser Kanal am längsten nicht hatte. So kommt jede Säule gleich oft vor (±1) und ein Kanal wiederholt seine Säule nicht in jeder Woche.
7. Produktionsblock (`productionBlock(plan, tag)`): pro Woche die Summe der Beitragsaufwände am Produktionstag als Satz «Montag: 3,5 Stunden für 5 Beiträge am Stück» (Batch). Die Planung steht nicht in der Summe. Eine Woche ohne Beitrag: «Montag: In dieser Woche ist nichts zu produzieren».
8. Kontrollen mit Hinweis (`plan.kontrollen`, nur was zutrifft): gestrichene Kanäle; Kanäle ohne Format; weniger als 2 Beiträge in irgendeiner Woche (Regelmässigkeit ist wichtiger als Menge, Richtwert von Alperna); Video gewählt, Instagram im Plan, aber kein Kurzvideo (keine Zeit); Reserve ab 1 Stunde pro Woche. Dazu prüft `kontrolle(plan)`: Summe je Woche ≤ Budget und jede Säule gleich oft (±1); das Ergebnis zeigt die Zeile «Kontrolle» im Überblick.
9. Kein Beitrag möglich (zum Beispiel nur Newsletter bei 1 Stunde, oder nur Instagram ohne Foto und Video): `validate` meldet es vor dem Fenster für die E-Mail-Adresse, damit niemand ein leeres Ergebnis gegen seine Adresse bekommt.

## Ausgaben
- Am Bildschirm (ResultCard «Dein Posting-Plan», DocView): Überblick (Stunden, Beiträge pro Woche, Kanäle, Fähigkeiten, Säulen mit Zahl, Produktionstag, Reserve, Kontrolle), «Zu beachten» (die Kontrollen), je Woche eine Tabelle Tag | Kanal | Format | Säule | Aufwand mit einer Summenzeile, Produktionsblock, Annahmen (die Aufwandstabelle mit Markierung «angepasst» und die übrigen Annahmen), drei Hinweise.
- Text kopieren (Markdown des Dokuments) ist frei. PDF, Word (DocumentExport) und CSV laufen über `guardDownload`.
- CSV: `Woche;Tag;Kanal;Format;Säule;Aufwand in Stunden`, UTF-8 mit BOM, Semikolon, CRLF, Dezimalkomma, eine Zeile je Beitrag; Zellen mit «=», «+», «-», «@» am Anfang bekommen ein Apostroph.
- CRM (`sendResult`): `eingabe` = Stunden pro Woche, Kanäle, Fähigkeiten, Säulen, Produktionstag, angepasster Aufwand (eine Angabe je Zeile); `ausgabe` = Markdown des Dokuments (auf 1'900 Zeichen gekürzt, der Überblick steht oben).
- Stand unter `mt:posting-plan`: `{ v: 1, phase: "edit" | "result", input, output? }`. `output` (der Plan) wird beim Lesen aus `input` neu gerechnet. `phase: "result"` zählt im Pfad als erledigt.

## Edge Cases
- 0 Stunden, unter 0,5 oder über 20 Stunden, keine Zahl: Meldung «Gib die Stunden pro Woche an, zwischen 0,5 und 20.»
- Kein Kanal, «Text» abgewählt, keine Säule, mehr als fünf, über 40 Zeichen, doppelte Säule: Meldung vor dem Fenster.
- Instagram ohne Foto oder Video: kein Instagram-Beitrag, Hinweis «Für diesen Kanal fehlt eine Fähigkeit»; sind alle gewählten Kanäle so, Meldung statt Ergebnis.
- Budget kleiner als die ersten Beiträge: Kanäle von hinten gestrichen und im Ergebnis genannt; reicht es für keinen: Meldung statt Ergebnis.
- Viel Budget (20 Stunden): nie über das Budget, höchstens zwei Beiträge je Kanal und Woche, der Rest wird als Reserve genannt.
- Aufwand überschrieben (0,1 bis 10): gilt für Wahl des günstigsten Formats und Summen; ungültige Werte gelten nicht; Standardwerte zählen nicht als Änderung.
- Produktionstag Dienstag, Donnerstag oder Samstag: die Veröffentlichungstage lassen ihn aus.
- Profil leer: Instagram und Google-Unternehmensprofil vorgewählt, zwei leere Zeilen für Säulen.
- Profil mit mehr als fünf Säulen: die ersten fünf, mit Hinweis.
- Kaputter Stand: leerer Stand. Stand mit ungültiger Eingabe: Formular statt Ergebnis.

## Texte
- Tagline (≤ 110 Zeichen): «Aus deinen Wochenstunden wird ein Plan für vier Wochen: Kanäle, Formate, Säulen und ein fester Produktionstag.»
- SEO-Title (≤ 60, mit «Schweiz»), Meta-Description (≤ 155), Seitentext (350 bis 700 Wörter): siehe content/tools/posting-plan.md. H1 «Posting-Plan nach Zeitbudget für Schweizer KMU»; Keyword «Posting-Plan» in H1 und im ersten Absatz von «Warum das wichtig ist».
- Beispiel: Malerei Keller, Gossau (4 Stunden pro Woche, Instagram und Google-Profil, Text, Foto und Gestaltung, drei Säulen, Produktionstag Montag) mit den Zahlen aus dem Werkzeug.
- FAQ: Wie oft soll ich posten? (keine feste Zahl, Regelmässigkeit, Richtwert von Alperna), Woher kommen die Stunden pro Beitrag? (Annahme von Alperna, anpassbar), Was ist Batch-Produktion?, Was, wenn die Stunden nicht für alle Kanäle reichen?, Brauche ich ein Konto?, Was bekommt Alperna, was bleibt im Browser?
- Alperna-Baustein: Social Media (`beweis: @baustein`).

## Tests
Mindestens 26 Fälle in logic.test.ts (58 sind es): Formate je Fähigkeit, Aufwandstabelle, Überschreiben, Zuteilung bei 1, 3, 6 und 20 Stunden (Summe nie über Budget, Reihenfolge der Wichtigkeit), zu kleines Budget streicht von hinten und meldet es, Newsletter alle zwei Wochen, Website alle vier, Säulen gleichmässig (±1), Veröffentlichungstage nie am Produktionstag, Produktionsblock, ungültige Eingaben, Hinweise (weniger als 2 Beiträge, Video ohne Zeit, Reserve), Dokument, CSV, eingabeText, Formular, parseState bei kaputten Daten. Dazu Tool.test.tsx (8 Fälle): Vorbelegung aus dem Profil, Fenster vor dem Ergebnis, CRM, Neuladen, CSV-Download, Säulen-Zeilen, Aufwand und Produktionstag, und export.test.ts (3 Fälle): PDF und Word mit allen Kanälen.

## Nicht Teil dieses Tools
Kein Server, keine KI, keine Texte zu den Beiträgen (das macht caption-baukasten), keine Anlässe und Feiertage (das macht feiertagskalender), keine Messung von Reichweite oder Wirkung, keine Zahlen zur idealen Posting-Häufigkeit oder zu den besten Uhrzeiten. Kein Schreiben ins Profil. Keine Kalenderdatei (nur CSV).

## Kalenderansicht (Stand 09.10.2026, Charge C5)
Das Wochenraster aus dem Pilot (P1c) ist die Kalenderansicht des Plans: vier Zeilen (Wochen), Spalten sind die Wochentage, an denen etwas passiert oder produziert wird. Neu in jeder Zelle: je Beitrag eine Zeile «Kanal, Format: Säule» statt nur «Kanal, Format», damit man auf einen Blick sieht, wann was erscheint und worüber. Am Produktionstag steht zuerst «Produktion». Das Raster steht am Bildschirm, in PDF, Word und Markdown (als Tabelle). Eine Ansicht mit echten Daten gibt es nicht: Der Plan kennt kein Startdatum, die Wochen sind «Woche 1 bis 4».
