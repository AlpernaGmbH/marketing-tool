# Engagement-Rate-Rechner (engagement-rate)

Stand 09.10.2026 (Charge B1): Kurzmodus (Summen statt Zahlen je Beitrag) und Vergleichswert für Instagram und Facebook; der Rest gilt wie bisher.

## Nutzen in einem Satz
Für KMU, Selbständige und Vereine: Aus der Followerzahl und den Zahlen von bis zu zehn Beiträgen entsteht in fünf Minuten die Interaktionsrate pro Beitrag und im Schnitt, nach zwei Formeln, mit Balkendiagramm und einer Auswertung in Worten.

## Kategorie und Verknüpfung
Kategorie: analyse (Pfad «analyse», Schritt 4), Zielgruppe: beide (KMU und Vereine), Klasse C (Rechner im Browser, kein Server, keine KI, kein Netz).
Liest aus Profil: `firma` (nur als Kopf im Dokument), `organisationstyp` (Vereine zeigen «Verein»).
Schreibt ins Profil: nichts. Das Feld «Firma» im Formular ist das gemeinsame Profilfeld (ProfileFieldsForm); das Werkzeug selbst schreibt kein Ergebnis ins Profil.
Verwandte Tools: newsletter-check, reifegrad-check, inhalte-saeulen.

Instagram, LinkedIn, Facebook und TikTok lassen sich nicht auslesen (PLAN.md, Tabelle der Klassen). Die Person tippt die Zahlen aus der Statistik der Plattform ab. Das Werkzeug sagt je Plattform in einem Satz, wo sie stehen, und nennt nur Menübezeichnungen, die gesichert sind: «Insights» (Instagram, Facebook), «Beitragsanalysen» (LinkedIn), «Analysen» (TikTok).

## Eingabe in zwei Wegen (B1)
Moduswahl `role="radiogroup"` «Eingabe»: **Summen über mehrere Beiträge** (Standard, `modus: "kurz"`) oder **Beiträge einzeln** (`modus: "einzeln"`). Plattform, Follower und Firma gelten für beide; die Zahlen jedes Weges bleiben beim Wechsel erhalten. Ein gespeicherter Stand ohne `modus` (vor B1) gilt als «einzeln».
- **Kurzmodus** (ids `er-k-*`): «Zahl der Beiträge» (ganze Zahl 1 bis 1'000), je Interaktionsfeld der Plattform eine Summe («Likes, Summe» …) und «Reichweite, Summe» (freiwillig); alles ganze Zahlen 0 bis 1'000'000'000, leer zählt als 0, mindestens eine Summe. Rechnung: ein Durchschnittsbeitrag (Summen geteilt durch die Zahl der Beiträge). Rate auf Follower = Interaktionen je Beitrag ÷ Follower × 100; Rate auf Reichweite = alle Interaktionen ÷ alle Reichweiten × 100 (Summe durch Summe). **Kein bester und kein schwächster Beitrag, kein Balkendiagramm.** Dokument: Kennzahlen, Tabelle «Zahl | Summe über n Beiträge | je Beitrag», Vergleich, Hinweise ohne Beitragsnummern, Erklärung. CSV: Kopfzeile wie bisher, Zeile «Summe über n Beiträgen» und Zeile «Durchschnitt je Beitrag». CRM-Eingabe: eine Zeile «Summen über n Beiträge: …». «Beispiel einfügen» setzt SAMPLE_KURZ (dieselben fünf Beiträge als Summen: 245, 30, 24, 48, Reichweite 7'020 bei 1'240 Followern; gleiche 5,6 % wie im Einzelmodus).
- **Einzelmodus**: wie unten beschrieben (Beitragszeilen, Diagramm, bester und schwächster Beitrag).

## Eingaben (Einzelmodus)
| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma (Kopf im Dokument) | text (ProfileFieldsForm) | nein | `firma` | bis 200 Zeichen (Profil) | Wird nur im Kopf des Dokuments gezeigt |
| Plattform | single (select) | ja, Standard Instagram | nein | eine von vier | Satz «So findest du die Zahlen» je Plattform |
| Follower (oder Abonnenten) am Tag der Auswertung | number | ja | nein | ganze Zahl 1 bis 100'000'000 | Zahl vom Tag der Auswertung |
| Beitrag n: Bezeichnung | text | nein | nein | bis 60 Zeichen | Hilft, Beiträge wiederzuerkennen |
| Beitrag n: vier Interaktionsfelder (Beschriftung nach Plattform) | number | nein, leer zählt als 0 | nein | ganze Zahl 0 bis 1'000'000'000 | siehe unten |
| Beitrag n: Reichweite (Beschriftung nach Plattform) | number | nein | nein | ganze Zahl 0 bis 1'000'000'000 | Ohne Reichweite entfällt die zweite Formel für diesen Beitrag |

Beiträge: Liste mit mindestens einem und höchstens zehn Zeilen, Start mit drei leeren Zeilen. Eine Zeile ohne Zahlen (alle Zahlenfelder leer) zählt nicht mit; die Nummern der übrigen bleiben wie im Formular («Beitrag 3» bleibt «Beitrag 3»).

Abbildung der Plattformen auf vier Interaktionen (a bis d) und eine Reichweite:

| Plattform | a | b | c | d | Reichweite |
|---|---|---|---|---|---|
| Instagram | Likes | Kommentare | Teilen | Gespeichert | Reichweite |
| LinkedIn | Reaktionen | Kommentare | Reposts | (entfällt) | Impressionen |
| Facebook | Reaktionen | Kommentare | Teilen | (entfällt) | Reichweite |
| TikTok | Likes | Kommentare | Teilen | Gespeichert | Aufrufe |

Annahme: Auf LinkedIn und Facebook gibt es kein viertes Interaktionsfeld; d zählt dort nicht, auch wenn nach einem Wechsel der Plattform noch ein Wert im Speicher steht.
Annahme: «Impressionen» (LinkedIn) und «Aufrufe» (TikTok) stehen für die Reichweite, obwohl sie streng genommen etwas anderes zählen (Anzeigen beziehungsweise Wiedergaben). Das Dokument sagt es offen; die Rechnung ist dieselbe.

## Logik
Pro Beitrag (nur Felder, die die Plattform anbietet):
- Interaktionen = a + b + c + d
- Rate auf Follower (%) = Interaktionen ÷ Follower × 100
- Rate auf Reichweite (%) = Interaktionen ÷ Reichweite × 100, nur wenn Reichweite > 0, sonst keine zweite Rate

Schnitt, zwei Wege, getrennt ausgewiesen:
- Schnitt der Raten = Summe der Raten ÷ Anzahl Beiträge (jeder Beitrag zählt gleich). Auf Follower ist das gleich der Summe der Interaktionen ÷ (Anzahl × Follower), weil die Followerzahl für alle Beiträge dieselbe ist. Auf Reichweite zählen nur Beiträge mit Reichweite > 0.
- Summe durch Summe = Summe der Interaktionen ÷ Summe der Reichweiten × 100, nur über Beiträge mit Reichweite > 0. Beiträge mit grosser Reichweite zählen hier mehr; darum weicht die Zahl vom Schnitt der Raten ab.
- Rechenbeispiel (Handrechnung, im Test): Beitrag A 50 Interaktionen bei 1'000 Reichweite = 5 %, Beitrag B 30 bei 200 = 15 %. Schnitt der Raten = (5 + 15) ÷ 2 = 10 %. Summe durch Summe = 80 ÷ 1'200 = 6,67 %.

Bester und schwächster Beitrag: nach Rate auf Follower (gleich geordnet wie die Interaktionen). Bei Gleichstand gilt der erste. Abstand zum eigenen Schnitt auf Follower: in Prozentpunkten (Rate minus Schnitt) und in Prozent des Schnitts ((Rate minus Schnitt) ÷ Schnitt × 100; entfällt, wenn der Schnitt 0 ist).

**Vergleichswert (B1, `data/engagement-benchmarks.json`):** Die Datei trägt `meta { name, source, url, asOf }` und je Plattform `{ plattform, formel, formelText, wert, jahr }`. Sie enthält nur Werte, bei denen die Formel der Quelle genau zur Rechnung des Werkzeugs passt (Prüfung am 09.10.2026 auf der Seite der Quelle, siehe `meta.note`):
- **Instagram 0,48 % (2025):** Socialinsider rechnet (Likes + Kommentare) ÷ Follower × 100 je Beitrag. Das Werkzeug rechnet dafür **nur Feld a und b** (`formel: "likes_kommentare"`), nicht Teilen und Gespeichert; der Vergleich steht darum neben der Rate mit den Feldern a und b, nicht neben der Hauptrate.
- **Facebook 0,15 % (2025):** Socialinsider rechnet (Reaktionen + Kommentare + Teilen) ÷ Fans × 100, das ist die Rate des Werkzeugs (`formel: "alle"`).
- **Nicht aufgenommen:** LinkedIn (dort nicht geprüft), TikTok (die Seite nennt für 2025 3,70 % und 3,73 % und für 2026 2,60 %), Hootsuite (3,5 % und 3 % in zwei Artikeln, Formel nicht genannt). Für diese Plattformen gibt es keinen Satz und keine Zahl; das Dokument sagt: «Keine Einordnung gegen Branchenwerte, weil uns eine belastbare Quelle fehlt.»
Der Satz im Dokument («Zum Vergleich»): «Du hast X (Formel, je Beitrag im Schnitt). Der Durchschnitt internationaler Marken lag 2025 bei Y (Socialinsider, nicht Schweiz).» dazu zwei Balken und der Hinweis, dass der Wert Konten jeder Grösse und Branche mischt und nichts darüber sagt, was für das Konto gut ist. Keine Wertung («gut», «schlecht», «überdurchschnittlich»). Die Quelle steht mit Adresse im Dokument. Fehlen die Daten oder die Quelle (`meta`), entfällt der Vergleich ohne Fehler (`loadBenchmarks`, `benchmarkFor`).

Richtwerte von Alperna, keine Statistik: Unter drei Beiträgen warnt das Werkzeug («Mit weniger als drei Beiträgen sagt der Schnitt wenig»); empfohlen sind mindestens fünf Beiträge. Beides sind Faustregeln, im UI und im Dokument so benannt.

Formatierung: `pctCH` (8,1 %, Raten mit bis zu zwei Nachkommastellen) und `numberCH` für Zahlen.

## Ausgaben
Am Bildschirm nach dem E-Mail-Fenster (ResultCard «Deine Engagement-Rate»):
- Kennzahlen: Interaktionen je Beitrag, Schnitt auf Follower, Schnitt auf Reichweite, Summe durch Summe (als Steckbrief, vor dem Diagramm).
- Balkendiagramm als SVG (`chartSvg`, reine Funktion): ein Balken je Beitrag (Rate auf Follower), gestrichelte Linie für den Schnitt, Legende oben (Schnitt, bester Beitrag), Gold nur als Markierung des besten Beitrags (mit Rand in Ink, damit der Kontrast nicht an der Farbe hängt), `role="img"` und `aria-label` mit allen Werten. Direkt darunter die Tabelle als Textalternative. Farben: Ink über `currentColor`, Papier und Gold über die Tokens `--paper` und `--yellow`.
- Dokument (`DocView`): Kopf (Firma oder «Verein», Plattform, Follower, Anzahl Beiträge), Tabelle Beitrag | Interaktionen | Rate auf Follower | Rate auf Reichweite mit Zeile Schnitt, Satz zu Summe durch Summe, Absätze «Bester Beitrag» und «Schwächster Beitrag», Erklärung der beiden Formeln, Hinweise der Prüfung, der Satz zu den Branchenwerten, drei Hinweise zur Nutzung.
Kopieren (Markdown): frei. Downloads hinter `guardDownload`: PDF und Word über DocumentExport, CSV als eigener Knopf.
CSV: Semikolon, UTF-8 mit BOM, CRLF, Dezimalpunkt, eine Zeile je Beitrag plus Zeile «Schnitt der Raten» und Zeile «Summe durch Summe». Textzellen, die mit `=`, `+`, `-` oder `@` beginnen, bekommen ein vorangestelltes Hochkomma (Schutz vor Formeln in Tabellenprogrammen).
CRM (`sendResult`): `eingabe` = Plattform, Follower, je Beitrag eine Zeile mit den Zahlen; `ausgabe` = Markdown des Dokuments (Kennzahlen und Tabelle stehen oben, weil der Server auf 1'900 Zeichen kürzt).
Stand unter `mt:engagement-rate`: `{ v: 1, phase: "edit" | "result", plattform, follower, posts, output? }`. `phase: "result"` lässt lib/progress.ts das Werkzeug als erledigt zählen. `output` ist die Auswertung; `parseState` rechnet sie beim Lesen neu, wenn die Angaben stimmen.

## Edge Cases
- Follower fehlt, 0, negativ, keine ganze Zahl oder über 100'000'000: Fehler, kein Ergebnis.
- Kein Beitrag mit Zahlen: Fehler. Elfter Beitrag: abgelehnt (Knopf gesperrt, `validate` meldet es, `parseState` kürzt auf zehn).
- Leeres Zahlenfeld zählt als 0; Buchstaben, Dezimalzahl, negative Zahl oder über 1'000'000'000: Fehler mit Nennung von Beitrag und Feld.
- Reichweite leer oder 0: keine Rate auf Reichweite für diesen Beitrag, kein Fehler. Reichweite 0 bei Interaktionen: Hinweis «Prüfe die Reichweite».
- Interaktionen grösser als die Reichweite (Rate über 100 %): Hinweis, kein Fehler.
- Mehr Interaktionen als Follower: Hinweis, kein Fehler.
- Alle Beiträge ohne Interaktion: Hinweis; alle Raten 0 %, Diagramm ohne NaN, Abstand in Prozent entfällt.
- Ein Beitrag: Bester und schwächster sind derselbe; das Dokument sagt, dass es nichts zu vergleichen gibt. Weniger als drei Beiträge: Hinweis.
- Gleichstand der Raten: der erste Beitrag gilt als bester und als schwächster.
- Plattformwechsel mit alten Werten im Speicher: Felder, die die Plattform nicht anbietet, zählen nicht.
- Kaputter Speicherstand: leerer Stand mit Instagram und drei Zeilen.
- Profil leer: Kopf zeigt «nicht angegeben»; Vereine (Profil) zeigen «Verein».
- Bezeichnung mit `<`, `&` oder `"`: steht nur in Tabelle und Dokument (React maskiert), nie im SVG; das SVG trägt nur Nummern und Zahlen, seine Texte sind trotzdem maskiert.

## Texte
- Tagline: «Interaktionsrate deiner Beiträge nach zwei Formeln: pro Beitrag, im Schnitt, mit Balkendiagramm und Erklärung.»
- SEO-Title: «Engagement-Rate berechnen Schweiz: Beiträge im Vergleich» (≤ 60); Meta-Description ≤ 155.
- Seitentext nach Lese-Vorlage (350 bis 700 Wörter), Beispiel «Malerei Keller, Gossau» mit Instagram, 1'240 Followern und fünf Beiträgen, Zahlen aus dem Werkzeug.
- FAQ (5 bis 7): Welche Formel ist richtig? · Was ist eine gute Engagement-Rate? (ehrlich: keine belastbare Quelle) · Wo finde ich die Zahlen? · Zählen bezahlte Beiträge? · Brauche ich ein Konto? / Was geschieht mit meinen Zahlen? · Wie viele Beiträge soll ich auswerten?
- Alperna-CTA: Baustein «Social Media», `beweis: @baustein`. Keine Prozentzahl im Seitentext, die nicht aus dem Beispiel des Werkzeugs stammt.

## Tests
Mindestens 24 Fälle in `logic.test.ts`: beide Formeln mit Handrechnung, Schnitt der Raten gegen Summe durch Summe (Beispiel mit Abweichung), Reichweite 0 und fehlend, Interaktionen über Reichweite, Follower 0, ein Beitrag, zehn Beiträge, elfter abgelehnt, Gleichstand, Abbildung aller vier Plattformen, Diagramm-SVG (Balkenzahl, Schnittlinie, aria-label, keine NaN, Maskierung), CSV (BOM, Semikolon, Formelschutz), `toDocument`-Blöcke, Formatierung 8,1 %, `parseState` bei kaputten Daten, `eingabeText`.

## Nicht Teil dieses Tools
- Kein automatisches Auslesen von Plattformen, kein Anmelden bei Instagram, LinkedIn, Facebook oder TikTok.
- Keine Bewertung als «gut» oder «schlecht»; der Vergleichswert (nur Instagram und Facebook) steht neben der Zahl der Person, ohne Wertung.
- Keine Entwicklung über die Zeit (Verlauf, Monatsvergleich), keine Aufteilung nach Beitragsart oder Format.
- Keine KI, kein Server ausser dem Versand des Ergebnisses ins CRM.
- Kein Schreiben ins Firmenprofil.
