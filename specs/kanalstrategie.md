# Kanalstrategie (kanalstrategie)

Klasse C: alles im Browser, kein Server, keine KI, kein Netz. Code: `tools/kanalstrategie/logic.ts` (reine Funktionen), `Tool.tsx` (Formular und Ergebnis), Tests in `logic.test.ts` und `Tool.test.tsx`.

## Nutzen in einem Satz
Für KMU und Vereine, die nicht auf jedem Kanal sein können: Aus sieben Angaben entsteht in etwa fünf Minuten eine Rangfolge der Kanäle mit Rolle (Basis, Fokus, Ergänzung, Vorerst nicht), Begründung, erstem Schritt und einer Reihenfolge für die nächsten drei Monate.

Das Werkzeug sagt offen, was es nicht tut: Es sagt, was zu den Angaben der Person passt, nicht, was auf einer Plattform gerade am meisten Reichweite bringt. Es gibt keine Prozentzahlen, keine Budgetverteilung und keine Nutzerzahlen von Plattformen. Alle Eigenschaften der Kanäle, Gewichte, Schwellen und Regeln sind ein «Richtwert von Alperna, keine Statistik» und heissen so im UI, im Dokument und im Seitentext.

## Kategorie und Verknüpfung
Kategorie: strategie (Pfad «strategie», `pathStep.order` 12 laut Auftrag; `kpi-baum` hat ebenfalls 12, die Registry sortiert stabil)
Audience: beide (Betrieb und Verein)
Liest aus Profil: `organisationstyp`, `firma`, `branche`, `kanaele` (Vorbelegung der heutigen Kanäle)
Schreibt ins Profil: `kanaele` = Basis und Fokus als `[{ name, url: "" }]`, nur wenn das Feld leer ist
Verwandte Tools: zielgruppen-segmente, posting-plan, kundenweg
Links aus den Kanalkarten: bewertungs-kit, gbp-feiertage, whatsapp-link, qr-set, inhalte-saeulen, posting-plan, newsletter-check, linkedin-profil, digitaler-auftritt-check (der Test prüft Ordner und Namen)

## Eingaben
Alle Felder im Formular tragen das Präfix `ks`. Der Stand liegt unter `mt:kanalstrategie` als `{ v: 1, phase: "edit" | "result", input, output? }`.

| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Betrieb/Verein (`ks-organisationstyp`) | single | ja (Standard Betrieb) | `organisationstyp` | Betrieb oder Verein | über `ProfileFieldsForm` |
| Firma / Name des Vereins (`ks-firma`) | text | ja | `firma` | nicht leer | «Gib den Namen deines Betriebs an.» / «… deines Vereins …» |
| Branche / Tätigkeit des Vereins (`ks-branche`) | text | nein | `branche` | – | – |
| Ziel (`ks-ziel`, Radiogruppe «Was soll dein Auftritt zuerst erreichen?») | single | ja | – | muss zum Typ passen | Betrieb: Anfragen und Aufträge, Bekanntheit in der Region, Stammkundschaft binden, Fachkräfte und Lernende finden. Verein: Mitglieder gewinnen, Anlässe füllen, Sponsoren und Gönner finden, Freiwillige finden |
| Kundschaft (`ks-kundschaft`, «Wen willst du erreichen?») | single | ja | – | – | Betrieb: Privatpersonen, Firmen, Beides. Verein: Mitglieder und Publikum, Firmen und Sponsoren, Beides |
| Suchverhalten (`ks-suche`, «Suchen die Leute aktiv nach dir?») | single | ja | – | – | Ja, sie suchen, wenn sie etwas brauchen; Nein, ich muss erst Aufmerksamkeit wecken; Beides |
| Einzugsgebiet (`ks-gebiet`, «Wie gross ist dein Einzugsgebiet?») | single | ja | – | – | Mein Ort und die Umgebung; Meine Region oder mein Kanton; Die ganze Schweiz |
| Zeit pro Woche (`ks-zeit`, Select «Zeit pro Woche für den Auftritt») | single | ja | – | Stufe 1 bis 4 | Bis 1 Stunde; 2 bis 3 Stunden; 4 bis 6 Stunden; Mehr als 6 Stunden |
| Fähigkeiten (`ks-faehigkeiten`, «Was könnt ihr gut?», Kästchen `ks-faehigkeit-<text|foto|video|gestaltung>`) | multi | nein | – | keine ist erlaubt | «Freiwillig. Ohne Auswahl bleibt es bei den Basis-Kanälen.» |
| Heutige Kanäle (`ks-heute`, «Wo seid ihr heute aktiv?», Kästchen `ks-heute-<kanal>`) | multi | nein | `kanaele` (Wortvergleich auf die zehn Kanäle, Unbekanntes bleibt weg) | – | «Vorgewählt aus deinem Firmenprofil. Passe die Auswahl an.» |

Die Meldungen erscheinen der Reihe nach in einem `role="alert"`, der Fokus springt in das Feld: Firma, Ziel, Kundschaft, Suchverhalten, Gebiet, Zeit. Der Fortschritt («3 von 6 Pflichtangaben gemacht») steht in einem `role="status"`.

Annahme: Wechselt die Person zwischen Betrieb und Verein, passt das gewählte Ziel nicht mehr; es fällt weg. Kundschaft, Suchverhalten, Gebiet, Zeit und Fähigkeiten bleiben.
Annahme: «heute aktiv» ist null, solange die Person nichts angekreuzt hat. Dann gilt der Vorschlag aus dem Profil. Beim Absenden wird die Liste festgeschrieben, damit sich das Ergebnis nicht ändert, wenn das Werkzeug danach Kanäle ins Profil schreibt.

## Logik
Alle Zahlen dieses Abschnitts sind ein Richtwert von Alperna, keine Statistik (ohne Quelle, im UI nur als Wörter).

### Die zehn Kanäle
Feste Reihenfolge (sie entscheidet bei Gleichstand nach «heute aktiv»): Google-Unternehmensprofil (`gbp`), Website, Verzeichnisse (local.ch, search.ch und Branchenverzeichnisse), WhatsApp, Instagram, Facebook, LinkedIn, TikTok, YouTube, Newsletter. Jeder hat Schlüssel, Label und eine Beschreibung in einem Satz.

Passung des Kanals je Ziel (0 bis 3):

| Kanal | anfragen | bekanntheit | binden | fachkraefte | mitglieder | anlaesse | sponsoren | freiwillige |
|---|---|---|---|---|---|---|---|---|
| Google-Unternehmensprofil | 3 | 2 | 1 | 0 | 1 | 1 | 0 | 0 |
| Website | 3 | 1 | 1 | 2 | 3 | 2 | 2 | 1 |
| Verzeichnisse | 2 | 2 | 0 | 0 | 1 | 1 | 0 | 0 |
| WhatsApp | 2 | 0 | 3 | 0 | 2 | 2 | 1 | 2 |
| Instagram | 1 | 3 | 2 | 2 | 2 | 3 | 1 | 2 |
| Facebook | 1 | 2 | 2 | 1 | 2 | 3 | 1 | 2 |
| LinkedIn | 2 | 1 | 0 | 3 | 0 | 0 | 3 | 0 |
| TikTok | 0 | 3 | 1 | 3 | 2 | 2 | 0 | 2 |
| YouTube | 2 | 2 | 1 | 1 | 1 | 1 | 1 | 0 |
| Newsletter | 2 | 1 | 3 | 0 | 2 | 3 | 2 | 1 |

Kundschaft (0 bis 2), Suchverhalten (0 bis 2), Gebiet (0 bis 2), nötige Fähigkeit und Zeitstufe, ab der der Kanal sinnvoll bespielt werden kann (1 bis 4):

| Kanal | Privat | Firmen | Mitglieder | aktiv | wecken | Ort | Region | Schweiz | Fähigkeit | Zeitstufe |
|---|---|---|---|---|---|---|---|---|---|---|
| Google-Unternehmensprofil | 2 | 1 | 1 | 2 | 0 | 2 | 1 | 0 | Text oder Foto | 1 |
| Website | 2 | 2 | 2 | 2 | 0 | 2 | 2 | 2 | keine | 1 |
| Verzeichnisse | 2 | 1 | 1 | 2 | 0 | 2 | 2 | 1 | Text | 1 |
| WhatsApp | 2 | 1 | 2 | 1 | 0 | 2 | 1 | 0 | Text | 1 |
| Instagram | 2 | 0 | 2 | 0 | 2 | 2 | 2 | 1 | Foto oder Video oder Gestaltung | 2 |
| Facebook | 2 | 1 | 2 | 0 | 1 | 2 | 2 | 1 | Text oder Foto | 2 |
| LinkedIn | 0 | 2 | 0 | 0 | 2 | 0 | 1 | 2 | Text | 2 |
| TikTok | 2 | 0 | 2 | 0 | 2 | 1 | 1 | 2 | Video | 3 |
| YouTube | 2 | 2 | 1 | 2 | 1 | 0 | 1 | 2 | Video | 4 |
| Newsletter | 2 | 2 | 2 | 1 | 0 | 2 | 2 | 2 | Text | 3 |

Fähigkeit: Alle Gruppen müssen erfüllt sein, innerhalb einer Gruppe genügt eine («Foto oder Video»). Annahme: Gestaltung (Grafiken, Karussells) genügt auch für Instagram. Annahme: Ausser der Website verlangt jeder Kanal mindestens eine Fähigkeit, damit «keine Fähigkeit» bei den Basis-Kanälen bleibt.

### Schritt für Schritt
1. **Eingabe prüfen** (`validate`, `geprueft`). Ohne Firma, Ziel (passend zum Typ), Kundschaft, Suchverhalten, Gebiet und Zeit gibt es kein Ergebnis.
2. **Teilwerte** (`teilwerte`). Ziel: Wert der Zielspalte (0 bis 3). Kundschaft: Privatpersonen und Firmen wählen ihre Spalte; bei einem Verein heisst die Spalte «Mitglieder» statt «Privat»; «Beides» zählt den besseren der beiden Werte (0 bis 2). Suchverhalten: «aktiv» oder «wecken», «Beides» zählt den besseren Wert (0 bis 2). Gebiet: Spalte Ort, Region oder Schweiz (0 bis 2).
3. **Eignung** (`eignung`) = Runden von 100 mal (Ziel + Kundschaft + Suchverhalten + Gebiet) durch 9, also 0 bis 100. Fähigkeit und Zeit gehen nicht in die Summe ein; sie sind Ausschlüsse.
4. **Passung als Wort** (`passungOf`). Ab 60 «passt gut» (Schwelle Fokus), ab 45 «passt teilweise» (Schwelle Ergänzung), sonst «passt wenig». Die Eignung erscheint nur als Balken (`role="meter"` mit `aria-valuetext`) und als Wort, nie als Zahl im Text.
5. **Basis** (`basisKanaele`), Reihenfolge Website, Google-Unternehmensprofil, Verzeichnisse. Die Website immer. Das Google-Unternehmensprofil bei einem Betrieb mit Gebiet Ort oder Region oder mit dem Ziel «Anfragen und Aufträge». Verzeichnisse bei Gebiet Ort oder Region, wenn die Zeitstufe mindestens 1 ist und das Ziel nicht «Fachkräfte» ist. Annahme: Das gilt gleich für das Ziel «Freiwillige finden» bei Vereinen. Annahme: Das Google-Unternehmensprofil ist bei Vereinen keine Basis, kann aber Fokus oder Ergänzung werden. Basis gilt unabhängig von Eignung, Fähigkeit und Zeit (sie ist im Ergebnis als «unabhängig von der Passung» gekennzeichnet).
6. **Ausschlüsse** (`ausschluss`, `moeglich`) für alle übrigen Kanäle, in dieser Reihenfolge: Fehlt eine Fähigkeitsgruppe («Du hast die Fähigkeit Video nicht angegeben.», bei mehreren «Du hast keine der Fähigkeiten Foto, Video oder Gestaltung angegeben.»). Zeitstufe kleiner als die Zeitstufe des Kanals («Dafür brauchst du mehr Zeit pro Woche, als du angegeben hast.»). Beitrag zum Ziel gleich 0 («Dieser Kanal trägt kaum zu deinem Ziel bei.»; Annahme: ein Kanal, der zum Ziel nichts beiträgt, wird nie Fokus, auch wenn die übrigen Angaben passen). Solche Kanäle werden nie Fokus oder Ergänzung, sondern «Vorerst nicht» mit dem Grund.
7. **Fokus** (`fokusMax`). Unter den möglichen Kanälen, nach Eignung absteigend sortiert: bei Zeitstufe 1 und 2 höchstens ein Kanal, bei 3 und 4 höchstens zwei, jeweils nur mit Eignung ab 60. Bei Gleichstand gewinnt der Kanal, den die Person heute schon bespielt, danach die feste Reihenfolge (`vergleiche`).
8. **Ergänzung.** Nur bei Zeitstufe 4: bis zu zwei weitere mögliche Kanäle mit Eignung ab 45.
9. **Vorerst nicht.** Alle übrigen. Grund: Ausschluss, sonst «Dieser Kanal passt zu wenig zu deinen Angaben.» (unter 45), «Dieser Kanal passt nur teilweise, für den Fokus reicht es nicht.» (ab 45, unter 60), «Dieser Kanal passt gut, aber deine Zeit reicht für einen Fokus-Kanal, und der ist schon besetzt.» (bei Zeitstufe 3 «zwei Fokus-Kanäle, und die sind schon besetzt»), bei Zeitstufe 4 «… Fokus und Ergänzungen sind aber schon besetzt» beziehungsweise «… die Ergänzungen sind schon besetzt». Reihenfolge der Liste: erst mögliche Kanäle, die nur nicht an der Reihe sind, dann ausgeschlossene, je nach Eignung.
10. **Das kannst du pausieren.** Heute aktive Kanäle mit der Rolle «Vorerst nicht»: je ein Satz («<Kanal>: Du bist heute dort aktiv. <Grund>») und die Aufforderung «Prüfe vor dem Pausieren, ob über diesen Kanal Anfragen kommen. Wenn ja, lass ihn laufen. Pausieren heisst nicht, dass er nichts bringt, sondern dass er zuerst nicht dein Fokus ist.» Keine Behauptung, ein Kanal sei nutzlos.
11. **Begründung aus den Angaben** (`begruendung`). Bei Fokus und Ergänzung: die vier Teilwerte mit voller Punktzahl (Ziel ab 2 von 3) als Satz («Passt zu deinem Ziel «…»; erreicht Privatpersonen; passt zu deiner Region.»), dahinter «Weniger passend: …» mit den übrigen Teilen. Bei Basis: der Grund der Basisregel. Bei «Vorerst nicht»: der Grund aus Schritt 9. Alles ohne Ziffern.
12. **Erster Schritt** je Kanal in Basis, Fokus und Ergänzung: ein Satz, anders für «heute aktiv» (prüfen) und «noch nicht aktiv» (einrichten), für Verein und Betrieb mit den passenden Begriffen. Dazu Links auf die Werkzeuge (siehe oben); Verzeichnisse haben keinen Link.
13. **Plan** (`monatePlan`), ohne Datum und ohne Zahlen ausser «Monat 1 bis 3»: Monat 1 «Basis aufbauen» (Name und Aufgabe je Basis-Kanal), Monat 2 «Fokus» (oder der Hinweis, dass es keinen gibt), Monat 3 «Ergänzung» (wenn es Ergänzungen gibt) oder «Prüfen und anpassen».
14. **Drei Hinweise** (`hinweiseFor`), regelbasiert, immer drei: Zeit (bis 3 Stunden: «Ein Kanal richtig ist besser als drei halb», sonst «einen Kanal nach dem anderen»). Fähigkeiten (ohne: «bleibt es bei den Basis-Kanälen», sonst Hinweis auf die gewählten). Suchverhalten (wecken oder beides ohne Foto und Video: «braucht meist Bilder oder Videos», sonst Prüfung nach drei Monaten).
15. **Dokument** (`toDocument`): Kopf (Titel, «Fokus: …» oder «Basis: …», Firma), Überblick (Angaben in Wörtern, Zeit als «zwei bis drei Stunden»), Ergebnis in Kürze, Tabelle Kanal, Rolle, Passung (Wort), Begründung, ein Abschnitt je Rolle, «Das kannst du pausieren» (wenn nötig), die nächsten drei Monate, Hinweise, «So ist gerechnet» (Annahmen, mit «Richtwert von Alperna, keine Statistik» und der Grenze des Werkzeugs).
16. **Profil** (`profilePatch`): Basis und Fokus als `[{ name, url: "" }]` in `kanaele`, nur wenn dort noch nichts steht.

## Ausgaben
- Ergebnis am Bildschirm in einer `ResultCard` («Deine Kanalstrategie», `aria-label`): «Das Ergebnis in Kürze» (`ks-aussage`), je Rolle ein Abschnitt mit Kanalkarten (`data-testid="kanal-karte"`, `data-rolle`, `data-kanal`; Name, Rolle, Passung als Wort und Balken, Begründung, erster Schritt, Links), «Das kannst du pausieren» (`ks-pausieren`), Plan für drei Monate (`ks-plan`, `monat-1` bis `monat-3`), Tabelle (`ks-tabelle` in `overflow-x-auto`), Hinweise, «So ist gerechnet» (`ks-richtwert`).
- Kopieren: Markdown des Dokuments, frei. PDF und Word über `DocumentExport` (`guardDownload`).
- CRM: `sendResult({ eingabe, ausgabe })`. `eingabe` ist eine Angabe je Zeile («Betrieb: …», «Ziel: …», «Zeit pro Woche: 2 bis 3 Stunden», «Heute aktiv: …»), `ausgabe` das Markdown des Dokuments; Aussage und Rollen stehen oben, weil der Server auf 1'900 Zeichen kürzt.
- Knöpfe: «Angaben ändern» (zurück ins Formular mit allen Angaben), «Neu beginnen» (leerer Stand, das Profil bleibt).

## Edge Cases
- Leere oder unvollständige Angaben: keine Auswertung, eine Meldung, kein Fenster, kein CRM-Aufruf.
- Keine Fähigkeit gewählt: nur Basis; «Kein Fokus-Kanal.», Hinweis, Monat 2 ohne Fokus.
- Zeitstufe 1: nur Kanäle der Zeitstufe 1 können Fokus werden.
- Kein Kanal passt gut genug oder alle sind ausgeschlossen: kein Fokus, mit eigenem Satz je Ursache.
- Gleichstand der Eignung: heute aktiv gewinnt, dann die feste Reihenfolge.
- Profil leer: Firma wird verlangt, «heute aktiv» bleibt leer; Profil mit unbekannten Kanälen (Pinterest, Google Ads): nichts vorgewählt.
- Wechsel Betrieb/Verein: das Ziel fällt weg.
- Kaputter oder fremder Stand unter `mt:kanalstrategie`: leerer Stand. Ein gespeichertes Ergebnis wird beim Lesen neu berechnet; sind die Angaben unvollständig, gilt «edit».
- Datensatz fehlt: Das Werkzeug braucht keinen; es rechnet nur mit den Angaben der Person und den Richtwerten im Code.

## Texte
- Tagline (102 Zeichen): «Welche Kanäle zu Ziel, Kundschaft und Zeit passen: mit Rolle, erstem Schritt und Plan für drei Monate.»
- SEO-Title: «Kanalstrategie Schweiz: Welche Kanäle passen zu dir?», Meta-Description: «Kanalstrategie für Schweizer KMU und Vereine: Rangfolge der Kanäle mit Rolle, erstem Schritt und Plan für drei Monate. Kostenlos, ohne Konto.»
- Erklärtext: `content/tools/kanalstrategie.md` (Lese-Vorlage: Warum, Nutzen, Fehler, Beispiel Malerei Keller, Gossau, FAQ, Alperna).
- FAQ: Wie viele Kanäle sind genug? Muss ich auf TikTok sein? Woher kommen die Regeln? Warum steht ein gut passender Kanal auf «Vorerst nicht»? Brauche ich ein Konto? Was bekommt Alperna, was bleibt im Browser?
- Alperna-CTA: Baustein «Google Business Profil». Der Baustein hat noch keinen Beweis in `content/pitch/bausteine.md`; die Seite zeigt ihn erst, wenn Alperna einen liefert (`beweis: @baustein`).

## Tests
`logic.test.ts` (89 Fälle): Katalog (Bereiche der Eigenschaften, Fähigkeitsgruppen), Eignung (Rundung, «Beides», Verein), Passung an den Schwellen, Fähigkeit und Zeit schliessen aus, jede Basisregel positiv und negativ je Ziel und Gebiet, Fokus-Grenze je Zeitstufe, Ergänzung nur bei Zeitstufe 4, Gleichstand, Ziel ohne Beitrag, Gründe für «Vorerst nicht», Pausieren, Verein statt Betrieb (Begriffe), Links gegen die vorhandenen tools-Ordner, keine Ziffer ausser «Monat 1 bis 3» und kein Prozentzeichen in über 3'400 Auswertungen, Sperrliste (`brandHits`), Hinweise, Plan, Dokument-Blöcke, Angaben und Ergebnis fürs CRM, Profil (Abbildung der Kanäle, `profilePatch` nur bei leerem Feld), Prüfung der Angaben, `parseState` bei kaputten Daten, das Beispiel im Seitentext gegen die Rechnung und die Konfiguration. `Tool.test.tsx` (22 Fälle): Formular, Beschriftungen, Vorbelegung aus dem Profil, Fehlermeldungen mit Fokus, Speichern und Wiederherstellen, Ergebnis für Malerei Keller, CRM-Aufruf, «Später», Neuladen ohne zweiten Eintrag, «Angaben ändern» und «Neu beginnen», keine Fähigkeit, Verein, PDF und Word, Sperrliste.

## Nicht Teil dieses Tools
- Keine Statistik, keine Prozentzahlen, keine Budgetverteilung, keine Nutzerzahlen von Plattformen, keine Aussage über Algorithmen oder Reichweite.
- Keine KI und kein Netz; keine Prüfung der Website der Person (dafür der Digitaler-Auftritt-Check).
- Keine Inhalte und kein Redaktionsplan (dafür Content-Säulen und Posting-Plan), kein Budget (dafür der Budget-Planer).
- Keine Kanäle ausserhalb der zehn (zum Beispiel Pinterest, Google Ads, Aushang, Zeitung, Anlässe); die Person sieht, was fehlt, im Seitentext und im Hinweis.
- Kein CSV, kein Kalender.
