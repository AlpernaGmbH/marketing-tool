# Vorher-Nachher-Collage (vorher-nachher)

Klasse C (Rechner und Formular mit Canvas, alles im Browser), Stand 09.10.2026 (Charge C10a: Formate als Karten oben, Vorschau per Knopf). Kein Server, keine KI, kein Netz (`needsServer: false`). Bibliotheken: `jszip` (ZIP, erst beim Download geladen), sonst nur der Bildbaustein `lib/export/png.ts` (Formate, `coverCrop`, `loadImageFile`, `imageFileProblem`, `drawCover`, `canvasToPng`, `loadCanvasFonts`, `textColorFor`, `pngFilename`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Downloads über `guardDownload`. **Die Bilder werden nur lokal gelesen und verlassen den Browser nie** (Harte Regel 1): Das steht im Formular, im Seitentext und in der FAQ. Ins CRM gehen die Einstellungen und die Dateinamen, nie Bilddaten.

## Nutzen in einem Satz
Für KMU und Vereine, die eine Veränderung zeigen wollen (Fassade, Garten, Raum, Umbau): in rund fünf Minuten aus zwei Fotos eine Collage als PNG in den Formaten Feed 1:1, Feed 4:5 und Story 9:16, nebeneinander, untereinander oder als Schieber-Standbild, mit Beschriftung und Logo, ohne Konto und ohne Bild-Upload.

## Kategorie und Verknüpfung
Kategorie: content (Pfad «Content», Schritt 13, nach dem Posting-Plan), Zielgruppe: beide
Liest aus Profil: organisationstyp (Beschriftung des Feldes «Firma» / «Name des Vereins»), firma (Dateiname, Eingabe für das CRM); beides über `ProfileFieldsForm`, nichts davon wird erneut gefragt (Harte Regel 10)
Schreibt ins Profil: nichts
Verwandte Tools: angebotsgrafik, caption-baukasten, post-generator

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin / Firma (`ProfileFieldsForm`) | single / text | nein | Profil `organisationstyp`, `firma` | max. 200 (Profil) | – |
| Vorher-Bild (`#vn-vorher`, Datei) | file | ja | – | PNG, JPG oder WebP, bis 15 MB, höchstens 8'000 Pixel an einer Seite (`imageFileProblem`, Fehler von `loadImageFile`) | «Du kannst die Datei auch auf diese Fläche ziehen.» Die Bilder verlassen deinen Browser nicht. |
| Nachher-Bild (`#vn-nachher`, Datei) | file | ja | – | wie oben | wie oben |
| Zoom Vorher / Zoom Nachher (`#vn-zoom-vorher`, `#vn-zoom-nachher`) | range 1 bis 4, Schritt 0,1 | nein | 1 | – | Wertanzeige «1,5 ×»; gesperrt, bis das Bild gewählt ist |
| Ausschnitt waagrecht / senkrecht Vorher und Nachher (`#vn-x-…`, `#vn-y-…`) | range -100 bis 100 | nein | 0 | – | Wertanzeige; 0 = Mitte, ±100 = bis zum Rand des Bildes |
| Layout | radiogroup | ja | Nebeneinander | eines von Nebeneinander, Untereinander, Schieber | Satz zum gewählten Layout |
| Trennlinie (`#vn-position`, nur bei Schieber) | range 20 bis 80 | ja | 50 | – | Wertanzeige «50 %»; links das Vorher-Bild |
| Beschriftung | radiogroup | ja | Vorher und Nachher | Vorher und Nachher, Eigene Wörter, Ohne | – |
| Wort für das erste / zweite Bild (`#vn-wort1`, `#vn-wort2`, nur bei «Eigene Wörter») | text | ja bei «Eigene Wörter» | – | 1 bis 20 Zeichen | Zähler «n von 20 Zeichen» |
| Logo (freiwillig) (`#vn-logo`, Datei) | file | nein | – | wie die Bilder | «Dein Logo verlässt den Browser nicht.» Knopf «Logo entfernen» |
| Ecke des Logos (`#vn-ecke`) | select | ja | unten rechts | oben links, oben rechts, unten links, unten rechts | – |
| Grösse des Logos (`#vn-logo-groesse`) | range 8 bis 24 | ja | 14 | – | Wertanzeige «14 % der Breite» |
| Formate (`vn-format-*`) | Karten mit Checkbox (`FormatCards`), direkt unter den Bildern | ja | Feed 1:1 | mindestens eines von Feed 1:1, Feed 4:5, Story 9:16 | Ein Klick wählt ein Format; die Karte zeigt das Seitenverhältnis als Rechteck, den Namen und die Pixelmasse (Richtwert von Alperna) |
| Vorschau (Gruppe «Vorschau», `PreviewTabs`) | Knöpfe mit `aria-pressed`, nur ab zwei gewählten Formaten | – | erstes gewähltes Format | gewählte Formate | – |

Die Vorschau (Canvas) ist eine Bedienhilfe: Sie zeigt das gewählte Format und aktualisiert sich bei jeder Änderung, auch bevor Bilder gewählt sind (graue Flächen mit «Vorher-Bild wählen»). Ziehen in der Vorschau (Pointer Events, Maus oder Finger waagrecht) ändert dieselben Werte wie die Regler; auf Touchgeräten bleibt das senkrechte Scrollen der Seite frei, die senkrechte Verschiebung geht dort über den Regler. **Download und CRM gibt es erst nach «Collage erstellen» und `ensureEmail()`.**

## Logik
Reine Funktionen in `tools/vorher-nachher/logic.ts`, Zeichnen in `render.ts` (Browser).

1. **Formate**: `IMAGE_FORMATS` ohne «gbp»: Feed 1:1 (1080 × 1080), Feed 4:5 (1080 × 1350), Story 9:16 (1080 × 1920). Pixelmasse: Richtwert von Alperna, keine Vorgabe der Plattformen (Quelle: Kommentar in `lib/export/png.ts`). `toggleFormat` hält die Auswahl in dieser Reihenfolge.
2. **Layout** (`layoutFor(layout, w, h, position, optionen)`): liefert Zielrechtecke der Bilder, sichtbare Bereiche, Trennlinie, Griff, Pillen und Logo-Platte.
   - Spalt `s` = 0,6 % der Breite, auf ganze Pixel gerundet (mindestens 2) und so, dass die zwei Hälften ganze Pixel haben.
   - **Nebeneinander**: zwei gleiche Spalten `(w − s) / 2` über die ganze Höhe, Spalt in Papierfarbe dazwischen. **Untereinander**: zwei gleiche Zeilen `(h − s) / 2` über die ganze Breite, Spalt (ebenfalls 0,6 % der Breite) dazwischen.
   - **Schieber** (immer senkrecht): beide Bilder füllen die ganze Fläche; die Linie liegt bei `round(w × position / 100)`, `position` begrenzt auf 20 bis 80; das Vorher-Bild wird bis zur Linie geclippt, die Linie ist 4 px breit (Papier), der Griff ein Kreis mit Radius 4 % der Breite in der Mitte der Linie, mit Pfeilen nach links und rechts.
   - **Pillen** (Beschriftung): Abstand zum Bereichsrand 3 % der Breite, Schriftgrösse 3,2 % der Breite, Höhe 1,9 Schriftgrössen, seitlicher Innenabstand 0,75 Schriftgrössen. Pille 1 (Vorher-Bild) steht oben links in ihrem Bereich, Pille 2 bei Nebeneinander und Untereinander ebenfalls oben links in ihrem Bereich, beim Schieber oben rechts, rechtsbündig. Passt eine Pille nicht in ihren Bereich (Schieber bei 20 oder 80 mit langem Wort), wird die Schrift bis auf 60 % verkleinert, danach der Text mit «…» gekürzt.
   - **Logo**: Das Logo wird proportional (contain) in ein Quadrat mit Kantenlänge = `Grösse % der Breite` eingepasst, auf einer halbtransparenten Papierfläche mit Innenabstand 2 % der Breite und Rundung. Die Platte sitzt 3 % der Breite vom Rand in der gewählten Ecke. Überdeckt sie eine Pille oder den Griff, weicht sie aus: erst in die senkrecht gegenüberliegende Ecke, dann waagrecht, dann diagonal. Die Platte bleibt immer im Bild; bei sehr kleinen Bildern wird das Logo verkleinert.
3. **Zuschnitt** (`cropFor(srcW, srcH, dst, crop)` mit `coverCrop`): `zoom` 1 bis 4, `x` und `y` von -100 bis 100 (geteilt durch 100 als `panX`, `panY`). `panByDrag` rechnet eine Mausbewegung in Zielpixeln in neue Werte um (aus dem Start-Zuschnitt, damit Runden sich nicht aufsummiert).
4. **Beschriftung** (`labelsFor`): «Vorher» und «Nachher», eigene Wörter (getrimmt) oder keine.
5. **Prüfung** (`validate`): fehlendes Vorher- oder Nachher-Bild («Wähle das Vorher-Bild.»), Dateifehler eines Bildes oder des Logos (Meldung aus `imageFileProblem` oder `loadImageFile`, mit «Vorher-Bild: …»), leeres oder zu langes Wort bei «Eigene Wörter», kein Format («Wähle mindestens ein Format.»). Die Meldungen stehen in `#vn-error` (`role="alert"`); der Fokus geht auf das erste fehlerhafte Feld in der Reihenfolge der Seite. Dateifehler erscheinen sofort nach dem Wählen, alle anderen nach dem ersten Klick auf «Collage erstellen».
6. **Zeichnen** (`drawCollage(ctx, einstellungen, format, vorher, nachher, logo)`): Papier füllen, Bilder mit `drawCover` in ihre Zielrechtecke (beim Schieber zuerst das Nachher-Bild, dann das Vorher-Bild im Clip), Linie und Griff, Pillen (Vorher: Ink-Fläche mit Papier-Text, Nachher: Papier-Fläche mit Ink-Text, Textfarbe über `textColorFor`; Geist 500), zuletzt die Logo-Platte. Fehlt ein Bild, zeichnet die Vorschau eine graue Fläche mit Hinweistext. Alle Masse in Format-Pixeln; die Vorschau skaliert den Kontext.
7. **Dateien**: PNG je Format über `canvasToPng`, Name `pngFilename(firma oder "vorher-nachher", formatKey)` (zum Beispiel `malerei-keller-feed.png`); ZIP (`jszip`) mit allen gewählten PNG, Name `vorher-nachher-<firma>.zip`, ohne Firma `vorher-nachher.zip`.
8. **CRM** (Zugang v3): `eingabeText` = «Firma», Layout (beim Schieber mit Trennlinie), Beschriftung, Formate, Logo (ja mit Ecke und Grösse, oder nein), je Bild Dateiname und Bildmasse, Zuschnitt; keine Bilddaten. `ausgabeText` = Anzahl der Formate, je Format Pixelmasse, dann «PNG im Browser erzeugt, nichts hochgeladen». `sendResult` läuft einmal beim Klick auf «Collage erstellen».
9. **Stand** (`mt:vorher-nachher`, `parseState`): `{ v: 1, phase: "edit" | "result", layout, position, beschriftung, worte: { erstes, zweites }, ecke, logoGroesse, formate, zuschnitt: { vorher: { zoom, x, y }, nachher: {…} }, output?: { formate, logo } }`. Nur Einstellungen, keine Bilder und keine Dateinamen. Kaputte Daten fallen feldweise auf die Voreinstellung zurück; «result» nur mit gültigem `output`. `lib/progress.ts` erkennt `phase: "result"` als erledigt. Nach dem Neuladen zeigt das Formular die gespeicherten Einstellungen und den Hinweis «Bilder neu wählen» (nie sofort das Ergebnis: Das gibt es erst nach «Collage erstellen»); die Phase bleibt «result», bis die Person mit «Neu beginnen» alles leert; «Angaben ändern» und Änderungen im Formular ändern den gespeicherten Stand erst, wenn «Collage erstellen» ein neues Ergebnis macht. Der Entwurf lebt in den Feldern, bis «Collage erstellen» ihn speichert.
10. **Speicher**: Jedes Bild ist ein `ImageBitmap`. Wird ein Bild ersetzt oder entfernt und beim Verlassen der Seite, ruft das Werkzeug `close()` auf. Wird ein Bild ersetzt, bevor das alte fertig geladen ist, gewinnt die zuletzt gewählte Datei.

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster): `ResultCard` «Deine Collage» mit Satz «n Formate, Layout …», Liste (`ul`, aria-label «Collagen»): je Format ein kleines Canvas (aria-label «Collage Feed 1:1»), Pixelmasse und der Knopf «PNG herunterladen: Feed 1:1». Darunter Hinweise (Richtwerte von Alperna): gleicher Ausschnitt und gleiches Licht in beiden Bildern; Gesichter und Kennzeichen nur mit Einverständnis der Personen; Alternativtext ergänzen. Link «Caption schreiben» auf `/tools/caption-baukasten`.
- Knöpfe: «Alle als ZIP herunterladen», «Angaben ändern» (Formular mit den Werten, Bilder bleiben im Speicher), «Neu beginnen» (leert alles und gibt die Bilder frei). Alle Downloads über `ctx.guardDownload` und `downloadBytes`; Fortschritt in `role="status"`, Fehler in `role="alert"`.
- Nichts davon liegt hinter einem zweiten Fenster: Wer die Adresse einmal angegeben hat, lädt sofort.

## Edge Cases (getestet)
- Layout Nebeneinander, Untereinander, Schieber in allen drei Formaten: Zielflächen decken das Bild, gleich grosse Hälften, Spalt 0,6 % der Breite, keine Überlappung (ausser beim Schieber), Position 20 und 80, Position ausserhalb (0, 100, NaN) wird begrenzt.
- Pillen: im Bild, ohne Überlappung untereinander, im eigenen Bereich, langes Wort bei Schieber 20 und 80 schrumpft und kürzt, leeres Wort entfällt, «Ohne» liefert keine Pillen.
- Logo: in jeder Ecke und für breites, quadratisches und hohes Logo im Bild; überdeckt weder Pillen noch Griff (weicht aus); bei freier Ecke bleibt es dort; Grösse 8 und 24.
- Zuschnitt: Zoom 1 bis 4 und Verschiebung ±100 bleiben im Bild; ungültige Werte (NaN, Text) fallen auf die Mitte; `panByDrag` verschiebt gegen die Zugrichtung, hält die Grenzen und ändert nichts, wo kein Spielraum ist.
- Prüfung: beide Bilder fehlen, nur eines fehlt, Dateifehler vor «fehlt», Wort leer, nur Leerzeichen, 21 Zeichen, genau 20, kein Format.
- Dateinamen mit Umlauten und Sonderzeichen; Firma leer.
- Gespeicherter Stand: null, Text, Zahl, Array, falsche Version, kaputte Felder, Werte ausserhalb der Grenzen, unbekannte Formate (auch «gbp»), «result» ohne `output`.
- Zeichnen mit einem Fake-Kontext: Aufrufe von `drawImage` mit den erwarteten Quell- und Zielrechtecken, Clip beim Schieber vor dem Vorher-Bild, Linie und Griff, Pillen und Logo, fehlende Bilder.
- Oberfläche (jsdom, `createImageBitmap` und Canvas gemockt): Fehler ohne Bild, falsche Dateiart, zu grosse Datei, zu grosses Bild (Pixel), Vorschau und Layout-Wechsel, Fenster vor dem Ergebnis, Downloads (PNG und ZIP) nur über das Fenster, CRM einmal mit lesbarem Text, `close()` beim Ersetzen, Entfernen und Verlassen, Neuladen mit «Bilder neu wählen».
- Profil leer: «Firma» leer, Dateiname `vorher-nachher-<format>.png`. Speicher gesperrt: `useLocalJson` fällt auf den Arbeitsspeicher zurück.

## Texte
- Tagline: «Zwei Fotos zur Collage: nebeneinander, untereinander oder als Schieber, mit Logo, PNG in drei Formaten.»
- SEO-Title: «Vorher-Nachher-Collage Schweiz: zwei Fotos, drei Formate»; Meta-Description in `content/tools/vorher-nachher.md`.
- Keyword «Vorher-Nachher»: in H1, im ersten Absatz und im Text (3 bis 5 Mal).
- Erklärtext, Beispiel (Malerei Keller, Gossau, Schieber, Story, Beschriftung), FAQ und Alperna-Satz (Baustein Social Media, `beweis: @baustein`): `content/tools/vorher-nachher.md`.
- Layoutwahl ist ein Richtwert von Alperna, keine Statistik.

## Tests
`tools/vorher-nachher/logic.test.ts` (73 Fälle, reine Funktionen), `render.test.ts` (18 Fälle, Fake-Kontext aus `fake-canvas.ts`), `Tool.test.tsx` (31 Fälle, Oberfläche mit gemocktem `createImageBitmap` und Canvas). Zusammen 122.

## Nicht Teil dieses Tools
- Echte Schieber-Animation oder Video: Die Ausgabe ist ein Standbild (PNG). Ein Schieber im Web braucht eine eigene Seite und ist ein anderes Werkzeug.
- Drehen, Spiegeln, Filter, Retusche oder automatische Ausrichtung der beiden Fotos: Das Werkzeug schneidet zu und beschriftet, mehr nicht.
- Mehr als zwei Bilder, andere Formate (Querformat, Google-Beitrag), freie Farben oder Schriften.
- Gesichtserkennung oder Verpixeln: Die Hinweise sagen nur, dass die Person vorher gefragt wird.
- Rechtsaussagen (Harte Regel 8): keine, auch nicht zum Recht am eigenen Bild.
- Hochladen oder Speichern der Bilder auf einem Server: nie (Harte Regel 1).
