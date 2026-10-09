# Caption-Baukasten (caption-baukasten)

Klasse C (Formular, alles im Browser), Stand 05.10.2026. Kein Server, keine KI, kein Netz (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM. Es gibt keine Dateien, nur Text zum Kopieren. `logic.ts` ist rein und getestet.

## Nutzen in einem Satz
Für KMU und Vereine, die Beiträge auf Instagram, LinkedIn, Facebook und Google schreiben: in rund vier Minuten aus Hook-Formel, Aufbau und Aufforderung eine fertige Caption, je Plattform zusammengesetzt, mit Vorschau an der Faltkante und Zeichenzähler.

## Kategorie und Verknüpfung
Kategorie: content (Schritt 7 im Pfad «Content»), Zielgruppe: beide
Liest aus Profil: marke (nur `marke.tonalitaet`, für die Vorbelegung der Anrede Du/Sie über `anredeFromProfile` aus `tools/bewertungs-kit/logic.ts`)
Schreibt ins Profil: nichts
Verwandte Tools: inhalte-ideen, textcheck, post-generator

## Zugang (Zugang v3)
- Beim Klick auf «Caption erstellen» prüft das Werkzeug alle drei Schritte (`inputProblem`), dann `ctx.ensureEmail()`; schliesst die Person das Fenster, bleibt das Formular stehen.
- Danach `ctx.sendResult({ eingabe: eingabeText(felder), ausgabe: ausgabeText(texte) })`. Eingabe: Hook-Formel, Anrede, die Hook-Felder, Aufbau, die Felder des Hauptteils, Ziel, Aufforderung und Hashtags, je eine Zeile («Frage: Antwort»). Ausgabe: die vier Texte, je mit Plattform und Zeichenzahl.
- Es gibt keine Downloads. Kopieren ist immer frei, auch ohne Adresse (das Ergebnis erscheint ohnehin erst nach dem Fenster).
- Nach dem Neuladen steht das Ergebnis wieder da (Stand `mt:caption-baukasten`, `phase: "result"`), ohne zweiten CRM-Eintrag. «Laden» eines Entwurfs schickt nichts ins CRM.

## Eingaben
Ein Formular mit drei Abschnitten, einer sichtbar. Fortschritt als `role="status"` («Schritt n von 3»), Knöpfe «Zurück» und «Weiter» (Eingabetaste im Feld geht weiter), im dritten Schritt «Caption erstellen». Über allen Schritten die Wahl der Anrede. Jeder Schritt prüft beim Weitergehen; Fehler stehen in `role="alert"`, der Fokus geht ins erste fehlende Feld.

| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Anrede | Radiogruppe «Anrede» (Du, Sie) | ja | `profile.marke.tonalitaet` (Feld `anrede` oder erkennbar im Text), sonst Du | eines von beiden | «Gilt für den Hook und die Vorschläge. Was du selbst schreibst, bleibt, wie du es schreibst.» |
| Hook-Formel | Radiogruppe «Hook-Formel» (Frage, Zahl, Kontrast, Vorher/Nachher, Fehler, Geständnis, Liste, Zitat) | ja | Frage | eine der acht | je Formel das Muster mit Platzhaltern in eckigen Klammern |
| Platzhalter der Formel | je ein Textfeld, Label = Platzhaltername (id `cb-hook-<name>`) | ja | gespeicherter Stand; gleiche Namen (zum Beispiel «Thema») gelten für mehrere Formeln | nicht leer, höchstens 160 Zeichen | je Feld ein Hinweis und als Platzhalter ein Beispiel der Malerei Keller |
| Aufbau | Radiogruppe «Aufbau» (Problem und Lösung, Drei Punkte, Geschichte, Anleitung) | ja | Problem und Lösung | einer der vier | Beschreibung je Aufbau |
| Felder des Hauptteils | je ein Textarea, Label je Rolle (id `cb-teil-<feld>`): Problem, Lösung / Punkt 1, 2, 3 / Ausgangslage, Wendepunkt, Ergebnis / Schritt 1, 2, 3, Tipp (freiwillig) | ja, ausser «Tipp» | gespeicherter Stand | nicht leer, höchstens 700 Zeichen | Hinweis je Feld in Du- und Sie-Fassung, Beispiel als Platzhalter |
| Ziel | Radiogruppe «Ziel» (Kommentar, Nachricht, Profil, Link, Speichern) | ja | Kommentar | eines der fünf | Beschreibung je Ziel unter der Auswahl |
| Vorschlag | Radiogruppe «Vorschlag» (ein bis zwei je Ziel) | nein | der erste Vorschlag | einer der Vorschläge des Ziels | Auswahl füllt «Aufforderung» |
| Aufforderung | Textarea (id `cb-cta`) | ja | erster Vorschlag des Ziels in der gewählten Anrede | nicht leer, höchstens 400 Zeichen, keine offene Klammer wie «[Link]» | «Ändere den Vorschlag, wie es zu deinem Betrieb passt. Eine Adresse oder Nummer setzt du hier selbst ein.» |
| Hashtags (freiwillig) | Textarea (id `cb-hashtags`) | nein | gespeicherter Stand | höchstens 300 Zeichen | «Sie kommen nur unter den Instagram-Text, getrennt durch eine Leerzeile. Mit oder ohne # tippen geht beides.» |

## Logik
1. **Muster füllen** (`fill(pattern, felder)`): Jedes `[Name]` wird durch den Wert aus `felder[Name]` ersetzt (Leerraum zusammengefasst, Zeilenumbrüche zu Leerzeichen). Fehlt der Wert oder ist er leer, bleibt `[Name]` stehen. Endet der Wert auf dasselbe Satzzeichen, das im Muster danach folgt (`.`, `?`, `!`), fällt das Zeichen im Muster weg (kein «..»). Steht der Platzhalter im Muster zwischen « und », fallen Anführungszeichen am Rand des Werts weg. Sonderzeichen im Wert (`$&`) bleiben unverändert.
2. **Muster** (alle in `logic.ts`, jedes in einer Du- und einer Sie-Fassung, `Fassung = { du, sie }`; Platzhalter nehmen nie ein auf die Person gebeugtes Verb auf, damit die Umschaltung nur das Muster betrifft):
   - `HOOKS`: Frage «Was machst du, wenn [Situation]?»; Zahl «[Zahl] [Begriff], die du bei [Thema] prüfen solltest.»; Kontrast «Nicht [Gewohntes], sondern [Besseres].»; Vorher/Nachher «Vorher: [Vorher]. Nachher: [Nachher].»; Fehler «Ein Fehler, den wir bei [Thema] immer wieder sehen: [Fehler].»; Geständnis «Wir müssen dir etwas gestehen: [Geständnis].»; Liste «Checkliste für [Anlass]: Das gehört auf deine Liste.»; Zitat «[Zitat]», sagte [Person].» Keine Zahl im Muster: Zahlen setzt die Person selbst ein.
   - `STRUCTURES`: Problem und Lösung (Problem, Lösung); Drei Punkte (Punkt 1 bis 3, nummeriert); Geschichte (Ausgangslage, Wendepunkt, Ergebnis); Anleitung (Schritt 1 bis 3 nummeriert, Tipp freiwillig mit «Tipp: »). Nummeriert wird erst ab zwei ausgefüllten Punkten, fortlaufend über die ausgefüllten Felder.
   - `CTAS`: Kommentar, Nachricht, Profil, Link, Speichern; je ein bis zwei Vorschläge in Du- und Sie-Fassung. Die Vorschläge nennen keinen Link und keine Nummer.
3. **Anrede wechseln** (`switchCta`): Entspricht die Aufforderung genau einem Vorschlag des Ziels in der alten Anrede, wird sie durch denselben Vorschlag in der neuen ersetzt. Eigener oder geänderter Text bleibt unverändert.
4. **Zusammensetzen** (`compose(platform, parts)`, `parts = { hook, teile[], cta, hashtags }`; alle Texte durch `typoCH`, Zeilenenden vereinheitlicht, Leerraum an den Zeilenenden entfernt):
   - Instagram: Hook, Leerzeile, Hauptteil (jeder Satz auf eine eigene Zeile, Teile durch eine Leerzeile getrennt), Leerzeile, Aufforderung, Leerzeile, Hashtags.
   - LinkedIn: Hook, dann der Hauptteil in kurzen Absätzen von höchstens zwei Sätzen (jede eingegebene Zeile für sich), dann die Aufforderung; alles durch Leerzeilen getrennt. Keine Hashtags.
   - Facebook: Hook, Hauptteil (Teile als Absätze, wie eingegeben), Aufforderung; durch Leerzeilen getrennt. Keine Hashtags.
   - Google-Beitrag: Hook, Teile, Aufforderung, je durch einen einzelnen Zeilenumbruch getrennt; keine Leerzeilen, keine Hashtags.
   - Hashtags (`cleanHashtags`): getrennt an Leerraum, Komma, Strichpunkt; vorn ein `#`, Sonderzeichen weg, Duplikate ohne Rücksicht auf Gross- und Kleinschreibung weg, ß zu ss.
   - Sätze (`splitSentences`): getrennt nach `.`, `!`, `?`, `…`, wenn ein Grossbuchstabe, eine Ziffer oder ein Anführungszeichen folgt. Kein Satzende nach Kürzeln (z. B., bzw., ca., inkl., usw., Nr., St., Dr. …), nach Einzelbuchstaben und nach ein- oder zweistelligen Zahlen («am 3. Oktober», «1. Wände abwaschen»).
5. **Faltkante** (`foldInfo(platform, text) → { limit, before, over }`). Gezählt wird in Zeichen (Unicode-Zeichen, ein Emoji zählt als eins), nicht in Bytes.
   - `limit`: Stelle der Faltkante in diesem Text. Instagram 125, LinkedIn 210 oder, wenn früher, das Ende der dritten Zeile (die Stelle des dritten Zeilenumbruchs; Leerzeilen zählen als Zeile; ein Text mit weniger als vier Zeilen hat keine Zeilenkante), Facebook 480, Google-Beitrag 1'500 (hier eine Grenze, keine Faltkante).
   - `before`: Zeichen bis dahin, `min(Länge, limit)`. `over`: Zeichen dahinter, `Länge − before`.
   - Genau 125 Zeichen bei Instagram: `over` 0; 126: `over` 1.
   - Annahme: Alle vier Zahlen sind ein Richtwert von Alperna, keine Statistik; die Plattformen ändern das. So steht es im UI und im Seitentext.
   - Schnittstelle für den Post-Generator (stabil, rein, ohne React): `import { foldInfo, type Platform } from "@/tools/caption-baukasten/logic"`; `foldInfo(platform: Platform, text: string): { limit: number; before: number; over: number }` mit `Platform = "instagram" | "linkedin" | "facebook" | "google"`. Dazu `counterLabel(platform, text)` und `splitAtFold(platform, text) → { before, after }`.
6. **Zähler** (`counterLabel`): «n Zeichen, davon m vor der Faltkante»; bei Google «n Zeichen, davon m innerhalb der Grenze von 1'500». Zahlen mit Apostroph (`numberCH`).
7. **Entwürfe**: bis zu zehn, der neueste zuerst; beim elften fällt der älteste weg. Ein Entwurf ist `{ id, titel, gespeichertAm, felder, texte }`; `titel` ist der gefüllte Hook, bei mehr als 60 Zeichen mit «…» gekürzt; `gespeichertAm` ISO-Zeit; `texte` die vier Texte. «Laden» setzt die Felder des Entwurfs und zeigt das Ergebnis; «Löschen» entfernt ihn.
8. **Übergabe an den Textcheck**: «Im Textcheck prüfen» ist ein Link auf `/tools/textcheck`. Beim Klick schreibt das Werkzeug `{ v: 1, phase: "edit", text: <Instagram-Text> }` in `mt:textcheck`, den Stand des Textchecks (`parseTextcheckState` liest ihn so). Der gespeicherte Text im Textcheck wird dabei ersetzt; das steht neben dem Link.
9. **Stand** (`mt:caption-baukasten`): `{ v: 1, phase: "edit" | "result", felder, entwuerfe }`. `felder = { formel, aufbau, ziel, anrede, hook: {Name: Text}, teile: {Feld: Text}, cta, hashtags }`. `parseState` liefert bei kaputten Daten den leeren Stand, verwirft unbekannte Schlüssel und Werte falschen Typs, kürzt Texte auf die Grenzen, behält höchstens zehn gültige Entwürfe und setzt `phase: "result"` nur, wenn die Felder `inputProblem` bestehen. `lib/progress.ts` erkennt `phase: "result"` als erledigt. Der Stand der Eingaben wird beim Tippen mit kurzer Verzögerung gespeichert und beim Weitergehen sofort.

## Ausgaben
- `ResultCard` «Deine Caption»: Knöpfe «Instagram», «LinkedIn», «Facebook», «Google-Beitrag» (`aria-pressed`, einer gedrückt, Instagram zuerst). Darunter für die gewählte Plattform:
  - Vorschau als Karte (`aria-label` «Vorschau <Plattform>»): Text bis zur Faltkante normal, danach abgedunkelt (gedämpfte Schriftfarbe auf der Flächenfarbe `surface`, damit der Kontrast AA hält; kein `opacity`), mit dem Hinweis, was an der Stelle passiert. Der Text steht ganz im DOM.
  - Zeichenzähler (`data-testid="cb-counter"`), der Hinweis «Richtwert von Alperna, keine Statistik; die Plattformen ändern das.»
  - «Instagram-Text kopieren», «LinkedIn-Text kopieren», «Facebook-Text kopieren», «Google-Text kopieren».
  - Liste offener Klammern gibt es nicht: Das Formular lässt keine offenen Platzhalter durch.
- «Als Entwurf speichern», «Deine Entwürfe» (Liste mit «Laden» und «Löschen»), «Im Textcheck prüfen», «Angaben ändern», «Neu beginnen» (behält die Entwürfe).
- CRM: siehe Zugang.

## Edge Cases (getestet)
- Platzhalter fehlt oder nur Leerraum: bleibt in Klammern; der Weiter-Knopf lässt das nicht durch.
- Wert endet auf das Satzzeichen des Musters («abblättert.» bei «…[Situation]?» bleibt ein Fragesatz, bei «…[Fehler].» entsteht kein «..»).
- Wert mit `$&` oder `$1`: bleibt wörtlich.
- Anführungszeichen im Zitat doppeln sich nicht.
- Text ohne Satzzeichen, nur ein Wort, nur Leerraum, leere Teile.
- Kürzel («z. B.», «St. Gallen»), Ordnungszahlen («am 3. Oktober»), Anführungszeichen nach dem Punkt.
- Genau 125, 126 Zeichen (Instagram), 210/211 (LinkedIn), 480/481 (Facebook), 1'500/1'501 (Google); Emoji zählt als ein Zeichen; Mehrzeiler bei LinkedIn mit dritter Zeile vor 210 Zeichen, mit dritter Zeile nach 210 Zeichen, mit nur drei Zeilen.
- Hashtags ohne «#», mit Komma, doppelt, mit Sonderzeichen; leer.
- Elf Entwürfe: der älteste fällt weg; Löschen mit unbekannter ID ändert nichts.
- Anrede wechseln: unveränderter Vorschlag wird umgestellt, eigener Text bleibt.
- Stand kaputt, falsche Version, falsche Typen, unbekannte Schlüssel, «result» mit unvollständigen Feldern: leerer Stand bzw. «edit».
- Profil ohne Tonalität oder ohne Hinweis auf die Anrede: Du.

## Texte
- Tagline: «Hook, Hauptteil und Aufforderung in drei Schritten, fertig zusammengesetzt für Instagram, LinkedIn, Facebook und Google.» (127 Zeichen im Auftrag, die Kategorie-Regel erlaubt höchstens 110; die Konfiguration kürzt, siehe `tool.config.ts`.)
- SEO-Title und Meta-Description: `content/tools/caption-baukasten.md`.
- Keyword «Caption schreiben»: im ersten Absatz und im Text, drei bis fünf Mal.
- Erklärtext, Beispiel (Malerei Keller, Gossau: eine Instagram-Caption, wie `compose` sie aus den Beispielwerten der Muster setzt, in `logic.test.ts` festgehalten), FAQ und Alperna-Satz (Baustein Social Media): `content/tools/caption-baukasten.md`.

## Tests
`tools/caption-baukasten/logic.test.ts`: `fill` (vollständig, fehlend, leer, doppelt, Sonderzeichen, Satzzeichen, Zitat), die Muster (alle Hooks, Aufbauten, Ziele; Du- und Sie-Fassung vorhanden, gleiche Platzhalter, keine Pronomen der anderen Anrede, `brandHits` ohne Treffer), `splitSentences`, `compose` je Plattform, Hashtags nur bei Instagram, `foldInfo` an allen Grenzen, `counterLabel`, `cleanHashtags`, `teileOf`, `inputProblem`, `switchCta`, Entwürfe, `parseState`, `eingabeText`, `ausgabeText`, Übergabe an den Textcheck, das Beispiel der Malerei Keller samt den Zahlen im Seitentext (350, 125, 308, 305 Zeichen). `tools/caption-baukasten/Tool.test.tsx`: Durchlauf im Browser (jsdom) mit Fenster, Ergebnis, CRM-Aufruf, Entwurf und Übergabe.

## Nicht Teil dieses Tools
- Eine KI, die den Text schreibt: Das macht der Post-Generator. Der Baukasten setzt zusammen, was die Person schreibt.
- Eigene Hooks frei formulieren: Der Hook folgt einer der acht Formeln; wer einen eigenen Satz hat, setzt ihn als Platzhalter ein.
- Emojis, Hashtag-Vorschläge, Beste Zeit zum Posten: Dafür gibt es keine belegte Quelle.
- Bilder, Reels, Karussells und die Beschriftung darin.
- Das genaue Abschneiden der Plattformen: Die Vorschau ist ein Richtwert, kein Abbild.
