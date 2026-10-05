# Zielgruppen-Segmente (zielgruppen-segmente)

Klasse C (alles im Browser, kein Server, keine KI), Stand 05.10.2026. Formular mit Grunddaten aus dem Profil und bis zu vier Segmenten; Rechnung, Matrix (SVG), Empfehlung und Dokument sind reine Funktionen in `logic.ts`.

## Nutzen in einem Satz
Für Inhaberinnen, Inhaber und Vereinsvorstände, die mehrere mögliche Kundengruppen haben und nicht wissen, womit sie beginnen: in rund acht Minuten bis zu vier Segmente beschreiben und bewerten, eine Vier-Felder-Matrix aus Attraktivität und Erreichbarkeit sehen, ein Primär- und ein Sekundärsegment empfohlen bekommen und je Segment einen Botschaftssatz erhalten.

## Kategorie und Verknüpfung
Kategorie: strategie (Pfad «Strategie», `order: 2` wie im Auftrag; der Hauptagent nummeriert den Pfad neu), Zielgruppe: beide
Liest aus Profil: firma, branche, organisationstyp, zielgruppen (Namen als Startliste der Segmente), primaersegment (erstes Segment, wenn es keine Zielgruppen gibt)
Schreibt ins Profil: zielgruppen (`[{ name, beschreibung }]`, Primärsegment zuerst) und primaersegment (Name des Primärsegments), beide nur, wenn das Feld leer ist (`profilePatch`, Form wie beim ICP-Builder)
Verwandte Tools: icp-builder, persona, positionierung
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis ins CRM (Zugang v3).

## Zugang (Zugang v3)
- Ohne Konto, E-Mail vor dem Ergebnis. Beim Klick auf «Segmente auswerten» prüft das Werkzeug die Eingaben (`validate`, Meldung in `role="alert"`, Fokus auf das Feld), dann `ctx.ensureEmail()`. «Später» lässt das Formular mit allen Eingaben stehen; ein Ergebnis und ein CRM-Eintrag entstehen nicht.
- Nach dem sichtbaren Ergebnis einmal `ctx.sendResult({ eingabe, ausgabe })`. Eingabe = `eingabeText` (eine Zeile je Segment), Ausgabe = `ausgabeText` (das Dokument als Markdown, Empfehlung und Tabelle oben, weil der Server auf 1'900 Zeichen kürzt).
- Downloads (PDF, Word) über `DocumentExport` und `guardDownload`; Text kopieren ist frei.
- Stand unter `mt:zielgruppen-segmente`: `{ v: 1, phase: "edit" | "result", segmente: [...], output? }`. Nach dem Neuladen steht das Ergebnis wieder da, ohne neue Anfrage und ohne zweiten CRM-Eintrag. Erledigt im Pfad (`lib/progress.ts`) ist das Werkzeug bei `phase: "result"`.

## Eingaben
Grunddaten über `ProfileFieldsForm`: Art (Betrieb oder Verein), Firma (Verein), Branche (Tätigkeit). Pro Segment ein Fieldset; Labels mit Nummer.

| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma / Name des Vereins | text (`ProfileFieldsForm`) | ja | Profil `firma` | nicht leer | «Firma und Branche speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche / Tätigkeit | text (`ProfileFieldsForm`) | nein | Profil `branche` | – | – |
| Segment n: Name | text | ja | Name aus Profil `zielgruppen` (höchstens vier), sonst `primaersegment` | 3 bis 60 Zeichen, je Segment eigener Name (ohne Beachtung der Gross-/Kleinschreibung) | Placeholder «Hauseigentümer in Gossau» (Verein: «Eltern von Junioren in Trogen») |
| Segment n: Hauptbedürfnis | text | ja | – | 5 bis 120 Zeichen | Placeholder «Fassade erneuern, ohne Stress» |
| Segment n: Kaufmotiv | text | ja | – | 5 bis 120 Zeichen | Placeholder «Werterhalt» |
| Segment n: Dein Nutzen | text | ja | – | 5 bis 120 Zeichen | «Was bietest du diesem Segment?» |
| Segment n: Wie viele mögliche Kundinnen und Kunden? (deine Schätzung) | number | ja | – | ganze Zahl 1 bis 10'000'000 | «Es zählt das Verhältnis der Segmente zueinander.» |
| Segment n: Kanäle | 12 Checkboxen | nein | – | höchstens vier, nur aus der Liste | Zähler «n von 4 gewählt» |
| Segment n: Typischer Einwand | text | nein | – | höchstens 120 Zeichen | Placeholder «zu teuer» |
| Segment n: Zahlungsbereitschaft | Radiogruppe 1 bis 5 mit Text | ja | – | 1 bis 5 | 1 gering … 5 hoch |
| Segment n: Erreichbarkeit | Radiogruppe 1 bis 5 mit Text | ja | – | 1 bis 5 | 1 schwer … 5 leicht |
| Segment n: Wettbewerbsdruck | Radiogruppe 1 bis 5 mit Text | ja | – | 1 bis 5 | 1 gering … 5 hoch |

Kanäle: Website, Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Empfehlungen, Anlässe, Aushang und Flyer, Lokalzeitung und Anzeiger, Telefon und Gespräch, WhatsApp.

Segmente: 1 bis 4. Das Formular startet mit zwei Segmenten; «Segment hinzufügen» bis vier, «Entfernen: Segment n» bis eines bleibt. Ein Segment ohne jede Angabe zählt nicht. Bei Vereinen heisst der Abschnitt «Zielgruppen des Vereins».

## Logik
Alle Skalen und die Grösse sind **Einschätzungen der Person, keine Statistik**. Die Gewichte, die Schwelle und die Hinweise sind ein **Richtwert von Alperna, keine Statistik**. Es gibt keine Zahl mit fremder Quelle (`data/gemeinden.json` existiert nicht).

1. **Prüfen** (`pruefeSegmente`, `validate`): Firma; mehr als vier Segmente; je Segment in der Reihenfolge des Formulars Name, Hauptbedürfnis, Kaufmotiv, Nutzen, Grösse, Kanäle, Einwand, drei Skalen. Meldung nennt die Nummer im Formular («Segment 2: …»). Völlig leere Segmente fallen weg. Kein gültiges Segment: «Beschreibe mindestens ein Segment.»
2. **Grösse normieren** (`groesseNorm`): g = 1 + 4 × (Grösse / grösste Schätzung), also 1 bis 5. Bei nur einem Segment (und bei ungültigen Werten) g = 3.
3. **Attraktivität** (`attraktivitaet`, 0 bis 100) = (Mittel − 1) / 4 × 100 mit Mittel = (g + Zahlungsbereitschaft + (6 − Wettbewerbsdruck)) / 3, auf ganze Zahlen gerundet. Gleiche Gewichte, je ein Drittel (Richtwert von Alperna).
4. **Erreichbarkeit** (`erreichbarkeit`, 0 bis 100) = (E − 1) / 4 × 100 mit E aus der Skala 1 bis 5.
5. **Feld** (`feldOf`, Schwelle 50): hoch/hoch «Zuerst bearbeiten»; Attraktivität hoch, Erreichbarkeit niedrig «Aufbauen»; Attraktivität niedrig, Erreichbarkeit hoch «Mitnehmen»; beides niedrig «Vorerst nicht». Genau 50 zählt als hoch. Es zählen die angezeigten, gerundeten Werte.
6. **Rangfolge** (`vergleiche`): höchster Mittelwert aus Attraktivität und Erreichbarkeit; bei Gleichstand die höhere Erreichbarkeit, dann die frühere Eingabe.
7. **Empfehlung** (`empfehlung`): Primärsegment = erstes der Rangfolge, das nicht im Feld «Vorerst nicht» liegt; Sekundärsegment = das nächste dieser Art; alle übrigen stehen unter «Vorerst nicht im Fokus» (auch Segmente aus «Mitnehmen» oder «Aufbauen», die weiter hinten liegen). Der Satz nennt das Primärsegment beim Namen und begründet mit den Zahlen («Attraktivität 75, Erreichbarkeit 75»).
   Annahme (Abweichung vom Wortlaut des Auftrags in einem Randfall): Das Primärsegment kommt nur aus den Segmenten ausserhalb von «Vorerst nicht». Sonst könnte ein Segment mit Attraktivität 49 und Erreichbarkeit 49 (Mittel 49) vor einem Segment mit Attraktivität 50 und Erreichbarkeit 0 (Mittel 25) empfohlen werden, obwohl die Matrix es unter «Vorerst nicht» zeigt. Liegen alle Segmente in «Vorerst nicht», gibt es kein Primärsegment; der Satz nennt, welches am nächsten an der Schwelle liegt.
8. **Botschaft** (`botschaft`): «Für {Name} mit dem Bedürfnis «{Hauptbedürfnis}» bieten wir {Nutzen}.» Eingaben bleiben, wie sie sind (nur getrimmt, Leerraum zusammengefasst); Satzzeichen am Ende (. ! ? ; : , …) fallen weg, damit sie nicht doppelt stehen; Anführungszeichen im Bedürfnis werden zu ‹ ›, weil der Satz selbst in « » steht.
9. **Matrix** (`matrixSvg`, `matrixLayout`): quadratisch, Erreichbarkeit waagrecht, Attraktivität senkrecht, vier beschriftete Felder, Achsenwerte 0, 50, 100. Die Grenze 50 liegt auf der Mittellinie; jeder Punkt bleibt in seinem Feld (der Wert 50 sitzt im hohen Feld, nicht auf der Linie). Punkte, die sich verdecken würden, werden innerhalb ihres Feldes auseinandergeschoben (Mindestabstand 30 Einheiten, auch für den Gold-Rand). Nummern 1 bis 4 in der Reihenfolge der Eingabe, Legende mit den Namen im SVG (höchstens zwei Zeilen je Name). Primärsegment mit Gold-Rand (die eine Markierung der Seite), dünne dunkle Linie aussen, damit der Rand auf hellem Grund sichtbar bleibt; zusätzlich «(Fokus)» in der Legende, damit die Farbe nicht allein trägt. Farben nur aus den Design-Tokens (mit Rückfallwert), keine Verläufe, Namen maskiert. `role="img"`, `aria-label` mit allen Segmenten und Werten, `aria-describedby` auf die Liste «Lage der Segmente».
10. **Dokument** (`toDocument`, DocumentModel): Kopf mit Firma (und Branche), «Empfehlung» als ein Absatz, Tabelle Segment | Attraktivität | Erreichbarkeit | Feld, Botschaft je Segment (in der Rangfolge), «Deine Angaben» (je Segment Hauptbedürfnis, Kaufmotiv, Nutzen, Grösse, Kanäle, Einwand, Skalen in Worten), «So sind die Werte entstanden» mit Erklärung der Rechnung, dem Hinweis «Einschätzung, keine Statistik», dem Richtwert-Hinweis und den vier Feldern, und drei Hinweisen (lieber ein Segment richtig bearbeiten, Einschätzungen nach drei Monaten prüfen, die Matrix zeigt Prioritäten und keine Garantien). Dateiname `zielgruppen-segmente-<firma>`.
11. **Profil schreiben** (`profilePatch`): `zielgruppen` = `[{ name, beschreibung: "Hauptbedürfnis: …. Kaufmotiv: …." }]` in der Rangfolge, wenn `zielgruppen` leer; `primaersegment` = Name des Primärsegments, wenn das Feld leer ist und es ein Primärsegment gibt. Die Form (`name`, `beschreibung`, keine weiteren Schlüssel) ist dieselbe wie beim ICP-Builder und im Test dagegen geprüft.
12. **CRM**: `eingabeText(kontext, auswertung)`: «Betrieb: …» (Verein: «Verein: …»), «Branche: …» (Verein: «Tätigkeit: …»), dann je Segment eine Zeile «Segment n: Name; Bedürfnis: …; Kaufmotiv: …; Nutzen: …; Grösse: …; Kanäle: …; Einwand: …; Zahlungsbereitschaft x von 5, Erreichbarkeit y von 5, Wettbewerbsdruck z von 5». `ausgabeText` = `toMarkdown(toDocument(...))`.
13. **Stand** (`parseState`): kaputte Daten oder falsche Version → `{ v: 1, phase: "edit", segmente: [] }` (dann kommt die Startliste aus dem Profil). Höchstens vier Segmente, Kanäle auf die Liste und höchstens vier gekürzt, ungültige Skalen 0, IDs eindeutig. `phase: "result"` gilt nur, wenn die Segmente die Prüfung bestehen; `output` (Kurzergebnis: Primär, Sekundär, übrige, Werte) wird dann aus den Segmenten neu berechnet.

## Ausgaben
- Ergebnis: `ResultCard` «Deine Zielgruppen-Segmente» mit
  - Kasten «Empfehlung» (Fokus, danach, vorerst nicht im Fokus),
  - Matrix als SVG («Die Matrix») mit Beschriftung, einer Liste «Lage der Segmente» für Screenreader (`sr-only`) und der sichtbaren Tabelle Segment | Attraktivität | Erreichbarkeit | Feld,
  - bei einem Segment statt der Matrix den Hinweis, ein zweites Segment zu beschreiben (Knopf «Zweites Segment beschreiben» führt zum ersten leeren oder zu einem neuen Segment),
  - Liste «Segmente nach Rangfolge»: je Segment Nummer, Name, Rolle (Primär, Sekundär, vorerst nicht im Fokus), Feld, Attraktivität, Erreichbarkeit, Grösse, Botschaft mit Knopf «Botschaft n kopieren», Kanäle und Einwand,
  - «So ist gerechnet» mit «Richtwert von Alperna, keine Statistik» und «Einschätzung, keine Statistik»,
  - drei Hinweise, und «Dokument ansehen» (`DocView`).
- Knöpfe: `DocumentExport` (Text kopieren, PDF, Word), «Angaben ändern» (Formular mit allen Werten), «Neu beginnen» (Stand leer, Namen kommen wieder aus dem Profil).
- Fokus nach «Segmente auswerten» auf die Überschrift des Ergebnisses.

## Edge Cases
- Ein Segment: Beschreibung statt Matrix, g = 3, Hinweis auf ein zweites Segment, kein Fehler.
- Ein leeres Segment neben einem ausgefüllten: wird ignoriert (Ergebnis wie bei einem Segment).
- Gleiche Werte bei mehreren Segmenten: Punkte nebeneinander, Rangfolge nach Erreichbarkeit, dann Eingabe.
- Alle Segmente in «Vorerst nicht»: kein Primärsegment, der Satz nennt das nächste; es wird kein Primärsegment ins Profil geschrieben.
- Wert genau 50: gilt als hoch.
- Grösse 1 bis 10'000'000: kleinste Schätzung neben sehr grosser ergibt g ≈ 1; keine Überläufe, kein NaN.
- Fünftes Segment oder fünf Kanäle (nur über kaputten Speicher möglich, das Formular sperrt beides): Meldung beziehungsweise Kürzung beim Lesen.
- Gleicher Name zweimal: Meldung am zweiten Segment.
- Profil leer: zwei leere Segmente, Firma wird verlangt. Profil mit `zielgruppen`: Namen vorbefüllt, Rest leer.
- Profil hat schon `zielgruppen` oder `primaersegment`: bleibt unverändert.
- Namen mit Sonderzeichen in der Matrix: maskiert.
- Kein Konto/Adresse («Später»): Eingaben bleiben, kein Ergebnis.
- Gespeicherter Stand kaputt: leerer Stand.

## Texte
- Tagline (107 Zeichen): «Bis zu vier Segmente bewerten: Matrix aus Attraktivität und Erreichbarkeit, Fokus und Botschaft je Segment.»
- SEO-Title (57): «Zielgruppen-Segmente Schweiz: Matrix und Fokus-Empfehlung»; Meta-Description in `content/tools/zielgruppen-segmente.md`.
- Seitentext (629 Wörter): Warum (94 Wörter, vier Punkte), fünf Schritte, vier Fehler, Beispiel Malerei Keller, Gossau (drei Segmente mit den Zahlen aus der Logik: 75/75 «Zuerst bearbeiten», 52/25 «Aufbauen», 33/75 «Mitnehmen»; Empfehlung und Botschaft), sechs Fragen (Woher kommen die Zahlen, Wie viele Segmente, Unterschied zum ICP-Builder, Konto, Was bekommt Alperna, Vereine), Alperna-Baustein Website.
- Keyword «Zielgruppen-Segmente»: H1 und erster Absatz, insgesamt vier Mal.

## Tests
`logic.test.ts` (114 Fälle): Normierung der Grösse (ein Segment, gleiche Grössen, extreme Unterschiede, ungültige Werte), Attraktivität und Erreichbarkeit an den Rändern, Schwelle 50, Felder, Auswertung des Beispiels, Empfehlung (Gleichstand, nur ein Segment, alle «Vorerst nicht», Randfall «Vorerst nicht» mit höherem Mittel, Rest), Botschaft (Satzzeichen, Anführungszeichen, Gross-/Kleinschreibung), `matrixSvg` (Punktzahl, Legende, role/aria-label, versetzte Punkte bei gleichen Werten, 200 Zufallsfälle für Abstand und Feldtreue, Wert 50, kein NaN, Maskierung, Gold-Rand, Tokens, lange Namen), `validate` (jede Regel einzeln, fünftes Segment, fünf Kanäle, doppelter Name, leere Segmente), `vorlage`, `profilePatch` (nur leere Felder, Form wie ICP-Builder, Profilprüfung), `parseState` (kaputte Daten, Kürzung, Bereinigung, Pfad-Fortschritt), `eingabeText`, `toDocument`, Sperrliste und verbotene Zeichen in allen erzeugten Texten und Meldungen, Zahlen und Sätze des Seitentexts gegen die Rechnung.
`Tool.test.tsx` (21 Fälle): Formular (Labels, Optionen, Vorbefüllung aus dem Profil, Hinzufügen/Entfernen, Kanäle-Grenze, Tastatur, Meldungen), Ergebnis (Empfehlung, Matrix, Tabelle, Rangfolge, CRM-Eintrag, Profil, Fokus, «Später», Neuladen, «Angaben ändern», «Neu beginnen», ein Segment, Vereine, Download-Abfrage, Sperrliste im sichtbaren Text).

## Nicht Teil dieses Tools
- Zahlen mit fremder Quelle (Gemeindegrössen, Branchenzahlen): fehlen; die Grösse ist die Schätzung der Person.
- KI-Vorschläge für Segmente oder Botschaften: das Werkzeug rechnet und formuliert nach einer festen Satzform.
- Persona mit Namen und Alltag: macht das Persona-Werkzeug aus dem Primärsegment.
- Gewichte, die der Besucher verstellt: die gleichen Gewichte sind der Richtwert; eigene Gewichte würden die Zahlen schwer vergleichbar machen.
- Mehr als vier Segmente und Untersegmente.
