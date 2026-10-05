# Angebotsgrafik (angebotsgrafik)

Klasse C (Formular mit Canvas, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Bildbaustein: `lib/export/png.ts` (Formate, `fitFont`, `wrapByWidth`, `normalizeHex`, `contrastRatio`, `textColorFor`, `loadCanvasFonts`, `loadImageFile`, `canvasToPng`, `pngFilename`, `isPng`), ZIP mit `jszip` (schon im Repo). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM, Downloads über `guardDownload`. Keine Änderung an `lib/export/png.ts`.

## Nutzen in einem Satz
Für KMU und Vereine, die ein Angebot oder eine Aktion zeigen wollen: in rund fünf Minuten eine Angebotsgrafik («Angebot der Woche») in drei Vorlagen und bis zu vier Formaten als PNG, einzeln oder als ZIP, ohne Konto, ohne Grafikprogramm und ohne dass das Logo den Browser verlässt.

## Kategorie und Verknüpfung
Kategorie: content (Schritt 12 im Pfad «Content»), Zielgruppe: beide
Liest aus Profil: firma und organisationstyp (über `ProfileFieldsForm`, nie erneut gefragt), website und ort (nur als Vorschlag für die Kontaktzeile)
Schreibt ins Profil: nichts
Verwandte Tools: post-generator, caption-baukasten, anlass-planer
Abweichung vom Auftrag: `usesProfile` nennt zusätzlich website und ort, weil die Kontaktzeile daraus vorbefüllt wird (Harte Regel 10).

## Eingaben
| Feld (Label) | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (`ag-organisationstyp`) und Firma / Name des Vereins (`ag-firma`) | `ProfileFieldsForm` | Firma oder Logo | Profil | nicht leer, ausser ein Logo ist gewählt | «Der Name steht auf der Grafik, solange du kein Logo wählst.» |
| Titel (`ag-titel`) | text | ja | – | 3 bis 40 Zeichen, Leerraum zusammengefasst | Zähler «n von 40 Zeichen», Platzhalter «Herbstaktion» |
| Angebot (`ag-angebot`) | textarea | ja | – | 5 bis 90 Zeichen | Zähler, Platzhalter «Fassadenanstrich inklusive Gerüst» |
| Preis in CHF (freiwillig) (`ag-preis`) | number | nein | – | leer = kein Preis; 0 bis 1'000'000, höchstens zwei Dezimalstellen | – |
| Früherer Preis in CHF (freiwillig) (`ag-frueher`) | number | nein | – | nur mit Preis und nur grösser als der Preis | «Der frühere Preis muss stimmen. Bei Zweifeln frag eine Fachperson.» |
| Gültig bis (freiwillig) (`ag-gueltig`) | date | nein | – | gültiges Datum, nicht in der Vergangenheit (heute ist erlaubt, Schweizer Zeit) | – |
| Aufforderung (`ag-aufforderung`) | text | ja | – | 2 bis 40 Zeichen | Zähler; Vorschläge als Knöpfe: «Termin vereinbaren», «Offerte anfragen», «Mehr erfahren», «Schreib uns auf WhatsApp» |
| Telefon, Website oder Ort (freiwillig) (`ag-kontakt`) | text | nein | Profil: website, sonst ort (solange noch nie gesetzt) | bis 50 Zeichen | «Vorgeschlagen aus deinem Firmenprofil.» |
| Logo (freiwillig) (`ag-logo`) | file | nein | – | PNG, JPG oder WebP bis 15 MB, höchstens 8'000 Pixel (`loadImageFile`) | «PNG, JPG oder WebP bis 15 MB. Dein Logo verlässt den Browser nicht.» Knopf «Logo entfernen» |
| Farbe (`ag-farbe`) | select | ja | Tinte | «Tinte» #0F0F0E, «Marine» #111A28, «Gold» #FFD700, «Eigene Farbe» | – |
| Farbe als Hex-Wert (`ag-hex`, nur bei «Eigene Farbe») | text | bei «Eigene Farbe» | – | `normalizeHex` (#RGB oder #RRGGBB) | Platzhalter «#1B5E20» |
| Vorlage (Radiogruppe `ag-vorlage-*`) | single | ja | Ruhig | «Ruhig», «Kräftig», «Handwerk» | je ein Satz |
| Formate (Checkboxen `ag-format-*`) | multi | mindestens eines | Feed 1:1 und Story 9:16 | aus `IMAGE_FORMATS`: Feed 1:1, Feed 4:5, Story 9:16, Google-Beitrag 4:3 | Pixelmasse «Richtwert von Alperna, keine Statistik» |

Vorschau-Format (`ag-vorschau-format`, Select) erscheint, wenn mehr als ein Format gewählt ist.

## Logik
Alle Regeln in `tools/angebotsgrafik/logic.ts` (rein, ohne DOM). Das Zeichnen steht in `render.ts` (Canvas), das Gerüst der Oberfläche in `Tool.tsx`.

1. **Prüfen** (`validate(input, heute)` → `Problem[]` mit Feld und Meldung, Reihenfolge wie im Formular; `feldProblems` ohne die Firma). Beträge liest `parseAmount` («4900», «4'900», «12,50»; nicht: Text, Minus, drei Dezimalstellen, über 1'000'000). Der frühere Preis braucht einen Preis und muss grösser sein. Meldungen zu Preis, früherem Preis, Datum, Hex-Wert und Kontaktzeile erscheinen schon beim Tippen, die übrigen nach dem ersten Klick auf «Grafiken erstellen»; der Fokus geht auf das erste fehlerhafte Feld.
2. **Preiszeilen** (`priceLines`): Preis wie `chf()` («CHF 1'200.-», «CHF 12.50»); bei 0 steht «Gratis». Der frühere Preis erscheint nur mit Preis und nur, wenn er grösser ist. **Gültigkeitszeile** (`validityLine`): «Gültig bis 30.11.2026» über `dateCH`.
3. **Farbe** (`accentFor`): Textfarbe `readableOn(farbe)` = `textColorFor` (Tinte oder Papier), und nur wenn keine von beiden 4,5:1 erreicht (schmales Band mittlerer Grautöne), reines Schwarz oder Weiss; damit liegt der Kontrast bei jeder Farbe über 4,5:1. Liegt die Farbe auf Papier unter 3:1 (zum Beispiel Gold), erscheinen Linien und Kreise in Tinte; Flächen und Knöpfe bleiben in der Farbe. Das Formular zeigt dazu den Hinweis «Diese Farbe ist auf hellem Grund schwach lesbar. …» (ohne Zahl). Ungültiger Hex-Wert → Tinte. Die Schwellen 3:1 und 4,5:1 stammen aus dem Auftrag (WCAG-2-Stufe AA); sie erscheinen nirgends als Zahl im UI.
4. **Layout** (`layoutFor(vorlage, breite, hoehe, vorhanden)` → Rechtecke in Pixeln für Logo oder Firmenname, Titel, Angebot, Preis, früheren Preis, Gültigkeit, Aufforderung, Kontaktzeile, dazu Dekor (Linie, Band, Kreis) und Schriftgrenzen). Reine Rechnung, ganze Pixel:
   - Rand 8 % der Breite (Querformat 6 %, mindestens 6 % gilt überall). **Story** (Höhe/Breite ab 1,7): oben und unten bleiben je 250 Pixel bei 1080 Breite für Text und Logo frei (**Richtwert von Alperna, keine Statistik**: Die Plattformen legen dort Bedienelemente darüber). Das Dekor (Farbband, Fläche) darf bis zum Rand reichen.
   - Das Logo liegt oben links, höchstens 18 % der Breite breit; ohne Logo steht der Firmenname als Text an derselben Stelle. Bei «Kräftig» (farbige Fläche) liegt das Logo auf einer weissen Platte.
   - **Ruhig:** Papier #FFFDF8, Text Tinte, dünne Linie unter dem Kopf, Aufforderung als Knopf in der Farbe. **Kräftig:** ganze Fläche in der Farbe, Text in der lesbaren Gegenfarbe, Preis in der grössten Schrift (bis 30 % der Breite). **Handwerk:** Papier, breites Farbband unten mit Aufforderung (weisser Knopf) und Kontaktzeile, der Preis in einem Kreis (früherer Preis darüber, durchgestrichen).
   - Hochformate (Feed 1:1, 4:5, Story) laufen von oben nach unten; das Querformat (Google-Beitrag 4:3) hat zwei Spalten (links Titel und Angebot, rechts Preis; bei Handwerk der Kreis). Bei Handwerk im Quadrat steht der Kreis rechts neben dem Angebot.
   - Die Höhe verteilt sich nach Gewichten; Titel und Angebot bekommen mehr, je länger ihr Text ist (`titelLen`, `angebotLen`). Ohne Angabe rechnet das Layout mit dem längsten erlaubten Text. Fehlt etwas (kein Preis, kein Datum, keine Kontaktzeile, kein Logo), bekommt es kein Rechteck, und der Platz geht an die anderen.
   - Hohe Formate bekommen grössere Schrift und Zeilen (Zuschlag bis 1,4), das Querformat kleinere Kopf- und Fusszeilen (0,85).
5. **Text im Rechteck** (`fitIntoBox`, baut auf `fitFont` und `wrapByWidth` auf): grösste Schrift, bei der der Text in die erlaubte Zeilenzahl (Titel 2, im Querformat 3; Angebot 4; sonst 1), in die Breite und in die Höhe des Rechtecks passt. Passt auch die Untergrenze nicht, wird gekürzt («…», auch ein sehr langes Wort ohne Leerzeichen). **Preis, früherer Preis und Datum werden nie gekürzt**: Ihre Untergrenze ist so klein, dass sie immer passen (eine kleine Zahl ist besser als eine falsche). Schriften: Geist 400/500/600 über `loadCanvasFonts`; vor dem ersten Zeichnen abwarten, danach neu zeichnen.
6. **Zeichnen** (`render.ts`, `drawOffer(ctx, model, format, logo)`): Grund, Dekor, Logo (proportional, `contain`, lokal gelesenes Bild), Texte nach `valign`, Aufforderung als Knopf so breit wie Text plus Rand, früherer Preis mit Strich. `paintCanvas` zeichnet in ein vorhandenes Canvas (Vorschau), `renderFormat` erzeugt ein Canvas und `canvasToPng` die Bytes, `buildZip` packt mit jszip (erst beim Klick geladen).
7. **Hinweise zu Wörtern** (`styleHints`): «jetzt», «nur noch», «garantiert», Ausrufezeichen und die harten Regeln aus `lib/brand-rules.ts` (zum Beispiel «nur diese Woche», Gedankenstrich) erzeugen einen Hinweis unter dem Feld (Titel, Angebot, Aufforderung, Kontaktzeile). Nichts wird gesperrt: Die Grafik zeigt den Text so, wie die Person ihn schreibt. Vorschläge, Platzhalter und feste Texte des Werkzeugs enthalten keines dieser Wörter (Test).
8. **Dateien**: PNG `pngFilename(titel, format)` → `herbstaktion-feed.png`; ZIP `zipName(titel)` → `angebotsgrafik-herbstaktion.zip` (`safeFilename`, Umlaute als ae/oe/ue).
9. **CRM** (Zugang v3): `eingabeText(input)` = je Zeile Titel, Angebot, Preis, Früherer Preis, Gültig bis, Aufforderung, Kontaktzeile, Farbe (mit Hex), Vorlage, Formate und «Logo: ja/nein» (nie Bytes oder Dateiname); `ausgabeText(output)` = «Angebotsgrafik «Titel»: n Formate», je Format «Name: B × H Pixel (Dateiname)», ZIP-Name und «PNG im Browser erzeugt, nichts hochgeladen.». `sendResult` läuft einmal beim Klick auf «Grafiken erstellen» nach dem Fenster, nicht beim Wiederherstellen; «Angaben ändern» und erneutes Erstellen schickt ein neues Ergebnis.
10. **Stand** (`mt:angebotsgrafik`, `parseState`): `{ v: 1, phase: "edit" | "result", felder: { titel, angebot, preis, frueher, gueltigBis, aufforderung, kontakt }, vorlage, farbe, hex, formate, logo, output? }`. `kontakt: null` heisst «nie gesetzt» (dann gilt der Vorschlag aus dem Profil), `""` «bewusst leer». `logo` ist nur ein Merker; das Bild wird nie gespeichert (nach dem Neuladen steht «Logo neu wählen»). `output` = `{ titel, firma, logo, dateien: [{ key, label, width, height, datei }] }`. Der Entwurf wird mit 500 ms Verzögerung gespeichert (Phase «edit»). Kaputte Daten → leerer Stand; «result» nur mit gültigem `output` und gültigen Angaben (das Datum zählt dabei nicht, ein Ergebnis von gestern bleibt ein Ergebnis). `lib/progress.ts` erkennt `phase: "result"` als erledigt.

## Ausgaben
- **Vorschau (Bedienhilfe, kein Ergebnis):** Neben dem Formular (Desktop) oder darunter (Mobil) zeichnet ein Canvas die Grafik beim Tippen, gewähltes Format über das Select «Vorschau-Format», `role="img"` mit `aria-label` «Vorschau Feed 1:1: <Inhalt als Text>». Leere Pflichtfelder erscheinen mit Beispieltexten (Hinweis darunter). Die Vorschau erzeugt keine Datei und löst weder das E-Mail-Fenster noch einen CRM-Eintrag aus; sie ist auf 320 Pixel Breite begrenzt. Das Ergebnis im Sinn von Zugang v3 sind die Dateien und der Eintrag im CRM, beide erst nach `ensureEmail()`.
- **Ergebnis** (nach dem Fenster): `ResultCard` «Deine Angebotsgrafik»; Liste (`ul`, `aria-label` «Grafiken») mit einem `li` je gewähltem Format: Canvas (`role="img"`, `aria-label` «Grafik Feed 1:1», Beschreibung als `sr-only` mit `aria-describedby`), Pixelmasse und Knopf «PNG herunterladen: Feed 1:1». Darunter «Alle als ZIP herunterladen», «Alternativtext kopieren» (Inhalt der Grafik als Text), «Angaben ändern», «Neu beginnen». Alle Downloads über `ctx.guardDownload` und `downloadBytes`, Fortschritt in `role="status"`, Fehler in `role="alert"`.
- **Hinweise** («Vor dem Veröffentlichen», `ul` mit `aria-label` «Hinweise zum Veröffentlichen»): Pixelmasse sind ein Richtwert von Alperna, keine Statistik; wenig Text auf Bildern lässt sich besser lesen (Richtwert von Alperna, keine Statistik); Alternativtext beim Veröffentlichen ergänzen; bei gewählter Story die 250 Pixel.
- Nach dem Neuladen steht das Ergebnis ohne neue Anfrage und ohne zweiten CRM-Eintrag da.

## Edge Cases
- Titel leer, 2, 3, 40, 41 Zeichen; nur Leerraum; Umlaute zählen als ein Zeichen; Angebot 4, 5, 90, 91.
- Preis leer, 0 («Gratis»), 12,5 → «CHF 12.50», 1'000'000, 1'000'000.01, Text, negativ; früherer Preis ohne Preis, gleich, kleiner, grösser, Text.
- Datum leer, gestern (Fehler), heute (erlaubt), 30.02., falsches Format; Zeitzone Europe/Zurich (23:30 UTC ist schon der nächste Tag).
- Hex-Wert «grün», leer, #abc, ohne #; Farbe mit schwachem Kontrast (Gold, Hellgelb) und Grautöne um #777.
- Längste Angaben in jeder Vorlage und jedem Format ohne Kürzung (Titel 40, Angebot 90, Aufforderung 40, Kontaktzeile 50, Preis «CHF 999'999.95», früherer Preis «CHF 1'000'000.-»); sehr langes Wort ohne Leerzeichen wird gekürzt; ein Titel in Versalien ist der Grenzfall.
- Kein Preis, kein Datum, keine Kontaktzeile, kein Logo: die übrigen Elemente nutzen den Platz.
- Story: keine Rechtecke in den oberen und unteren 250 Pixeln; Text und Flächen nie ausserhalb des Bildes (Fake-Kontext).
- Logo: falsches Format, zu gross, hoch statt breit (Seitenverhältnis 1:4), entfernen; nach dem Neuladen ohne Bild mit Hinweis.
- Profil leer: Firma fehlt → Meldung, ausser ein Logo ist gewählt; Kontaktzeile leer. Profil mit Website → Kontaktzeile vorbefüllt.
- Speicher gesperrt: `useLocalJson` fällt auf den Arbeitsspeicher zurück. Kein Canvas (`getContext` liefert null): `paintCanvas` zeichnet nichts, der Download meldet «Der Download hat nicht geklappt.».
- Daten-Datei: keine; das Werkzeug braucht keine Zahlen von aussen.

## Texte
- Tagline (105 Zeichen): «Angebot der Woche als Grafik: drei Vorlagen, vier Formate, PNG zum Herunterladen, Logo bleibt im Browser.»
- SEO-Title: «Angebotsgrafik Schweiz: Angebot der Woche als PNG»; Meta-Description in `content/tools/angebotsgrafik.md`.
- Keyword «Angebotsgrafik»: in H1 («Angebotsgrafik für Schweizer KMU»), im ersten Absatz von «Warum das wichtig ist» und im Text (insgesamt 4).
- Erklärtext, Beispiel (Malerei Keller, Gossau; Preise, Datum und Dateinamen in `logic.test.ts` festgehalten), FAQ (6: Logo, Formate, früherer Preis, Konto, was Alperna bekommt, später ändern) und Alperna-Satz (Baustein Social Media, `beweis: @baustein`): `content/tools/angebotsgrafik.md`.
- Annahmen und Richtwerte: Pixelmasse der Formate (`IMAGE_FORMATS`) und die 250 Pixel der Story sind Richtwerte von Alperna, keine Statistik; Rand, Logogrösse und Schriftgrössen sind Gestaltungsvorgaben ohne Quelle und stehen nicht als Zahl im UI. Keine Rechtsaussage: Der frühere Preis «muss stimmen», bei Zweifeln eine Fachperson.

## Tests
- `logic.test.ts` (69 Fälle): Konstanten, `parseAmount`, `validate` (jede Regel), Preis- und Gültigkeitszeile, Zeitzone, Farbe und Kontrast (drei Festfarben, zehn Hex-Werte, Raster aller Farben), `layoutFor` (alle Vorlagen, Formate und sieben Vorhanden-Kombinationen: im Bild, Rand, keine Überlappung, Story-Ränder, Logo-Breite, Kreis, Gewichte), `fitIntoBox`, längste Angaben ohne Kürzung, Preise nie gekürzt, Sperrlistenhinweise (inklusive `brandHits`), Beschreibung, Dateinamen, Beispiel aus dem Seitentext, CRM-Texte, `parseState` bei kaputten Daten, Kontaktvorschlag.
- `render.test.ts` (12 Fälle, Fake-Kontext): zeichnet Titel, «CHF 1'200.-», Aufforderung; früherer Preis mit Strich; Fehlendes; «Gratis»; nichts ausserhalb des Bildes (3 Vorlagen × 4 Formate × 3 Angaben × 3 Logos); Story-Ränder; Grund und Textfarbe; Logo proportional; Platte; langes Wort.
- `Tool.test.tsx` (14 Fälle, gemocktes Canvas): Fehlermeldung ohne Titel, Vorschau und Format, Fenster und CRM, PNG und ZIP, Fenster vor dem Download, Preisprüfung, Druckwörter, Format-Pflicht, Hex und Kontrast, Logo, Firma oder Logo, «Logo neu wählen», Ändern und Neu beginnen, kaputter Speicher.

## Nicht Teil dieses Tools
- Fotos als Hintergrund, Zuschnitt oder Verschieben von Bildern: Das ist das Werkzeug Vorher/Nachher; hier gibt es nur das Logo.
- Weitere Schriften, Farbverläufe, Schatten, Emojis, Symbole: ruhige Vorlagen ohne Spielerei.
- Mehrere Angebote auf einer Grafik, Preislisten, Gutscheine, Rabatt in Prozent: Das Werkzeug rechnet keinen Rabatt aus und nennt keine Prozentzahl.
- Direktes Veröffentlichen auf Instagram, Facebook oder Google: Die Dateien lädt die Person selbst hoch.
- Textvorschläge für den Beitrag: dafür gibt es den Caption-Baukasten und den Post-Generator.
- Animation und Video (Reels).
- Prüfung, ob ein Preis oder Angebot zulässig ist: keine Rechtsaussage, nur der Hinweis, dass der frühere Preis stimmen muss.
