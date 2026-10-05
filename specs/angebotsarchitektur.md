# Angebotsarchitektur und Preisstrategie (angebotsarchitektur)

Klasse C (Rechner im Browser, kein Server, keine KI), Stand 05.10.2026. Formular mit Grunddaten aus dem Profil (`ProfileFieldsForm`), eigenem `<form>` und Ergebnis als `DocumentModel` (`ResultCard`, `DocView`, `DocumentExport`) mit einer Vergleichsgrafik aus drei Karten (HTML und CSS, kein Canvas). Vorbilder: `tools/budget-planer` (Rechner, Stand `{ v, … }`, `sendResult`) und `tools/newsletter-check` (Entwurf mit Verzögerung speichern).

## Nutzen in einem Satz
Für Inhaberinnen und Inhaber von KMU, die mehrere Leistungen mit Preis haben: in rund sieben Minuten eine Struktur aus drei Stufen (Einstieg, Kern, Premium) mit Preisabständen, Deckungsbeitrag je Stufe und einer Warnung bei zu kleiner Marge, als Tabelle, Vergleichsgrafik, Text, PDF und Word.

## Kategorie und Verknüpfung
Kategorie: strategie (`pathStep.order` 10, nach dem Marketing-Budget-Planer), Zielgruppe: kmu
Liest aus Profil: firma, branche (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt)
Schreibt ins Profil: nichts (`writesProfile: []`, kein `profilePatch`)
Verwandte Tools: nutzenversprechen, positionierung, budget-planer
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis ins CRM (Zugang v3).

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Angebot aufbauen» prüft das Werkzeug die Eingaben (`validate`), dann `await ctx.ensureEmail()`; false lässt das Formular stehen («Später»). Danach rechnet `rechnen(input)`, der Stand wird gespeichert, das Ergebnis erscheint, Fokus auf die Überschrift.
- **Jedes Ergebnis geht ins CRM:** Eingabe = `eingabeText(input)` (Leistungen je Zeile, Stundensatz, Zielmarge, Kern, Einstieg, Premium, Form, Anker; vorn die Branche, wenn sie da ist). Ausgabe = `reportMarkdown(result, input)` (das Dokument als Markdown, Untertitel und Tabelle oben, damit die Kürzung auf 1'900 Zeichen das Wichtige stehen lässt).
- **Downloads:** PDF und Word über `DocumentExport` (prüft die Adresse selbst). Text kopieren ist frei.
- Nach dem Neuladen steht das Ergebnis wieder da, ohne zweiten CRM-Eintrag (`parseState` rechnet es aus den gespeicherten Angaben neu).

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Firma (`aa-firma`) | text (`ProfileFieldsForm`) | ja | Profil `firma` | nicht leer, sonst «Gib den Namen deines Betriebs an.» | «Firma und Branche speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche (`aa-branche`) | text (`ProfileFieldsForm`) | nein | Profil `branche` | – | – |
| Leistung n (`aa-name-n`) | text, Liste `ul[aria-label="Leistungen"]`, 1 bis 6 Zeilen, anfangs drei leere | ja je gefüllte Zeile | gespeicherter Stand | 3 bis 60 Zeichen (Leerraum zusammengezogen), Namen eindeutig (ohne Gross- und Kleinschreibung) | Beispieltext je Form |
| Preis in CHF (`aa-preis-n`) | number | ja | Stand | über 0, höchstens CHF 10'000'000.-, Dezimalstellen erlaubt (auf Rappen gerundet) | – |
| Aufwand in Stunden (`aa-aufwand-n`) | number, Schritt 0,25 | ja (0 erlaubt) | Stand | 0 bis 10'000, auf Viertelstunden gerundet | «wird auf Viertelstunden gerundet» |
| Material und Fremdleistungen in CHF (`aa-kosten-n`) | number | nein (Standard 0, leer = 0) | Stand | 0 bis CHF 10'000'000.- | – |
| Knöpfe «Leistung hinzufügen» (`aa-hinzufuegen`), «Entfernen» (`aa-entfernen-n`, aria-label «Leistung n entfernen») | button | – | – | Hinzufügen gesperrt bei sechs Zeilen, Entfernen bei einer | – |
| Interner Stundensatz in CHF (`aa-satz`) | number | ja | Stand | 0 bis 500; 0 heisst: Arbeitszeit nicht einrechnen | «0 heisst: Die Arbeitszeit fliesst nicht in den Deckungsbeitrag ein; das Ergebnis sagt es dir.» |
| Zielmarge in % vom Preis (`aa-zielmarge`) | number | ja | Standard 30 | 5 bis 90 | «Deine Annahme, kein Richtwert.» |
| Welche Leistung ist dein Kern? (`aa-kern`) | select | ja | Leistung mit mittlerem Preis | muss eine gefüllte Zeile sein | «Der Kern ist der Referenzpreis.» |
| Welche Leistung ist dein Einstieg? (`aa-einstieg`) | select | nein | nächstliegende Leistung unter dem Kern-Preis, sonst «Keine: Vorschlag nach Faustregel» | nicht der Kern, nicht dieselbe wie das Premium | Zielpreis nach Faustregel |
| Welche Leistung ist dein Premium? (`aa-premium`) | select | nein | nächstliegende Leistung über dem Kern-Preis, sonst Vorschlag | wie Einstieg | Zielpreis nach Faustregel |
| Form (`aa-form`) | select: Einzelleistungen, Pakete, Abo oder Betreuung | ja | Einzelleistungen | – | «Ändert die Beschriftungen, nicht die Rechnung.» |
| Premium zuerst zeigen (Anker) (`aa-anker`) | checkbox | nein | aus | – | «Dreht die Reihenfolge in der Ausgabe … keine Aussage über die Wirkung.» |

Zeilen ohne Name, Preis, Aufwand und mit Kosten leer oder 0 zählen nicht als Leistung und werden übersprungen. Im Formular gilt: Wer den Kern ändert, setzt Einstieg und Premium, die auf denselben Eintrag zeigten, auf «Standard» zurück; wer eine Zeile entfernt, räumt Kern, Einstieg und Premium auf, die auf sie zeigten. Option einer Stufe, die schon die andere belegt, ist gesperrt; der Kern fehlt in beiden Listen.

## Logik
Alle Regeln in `tools/angebotsarchitektur/logic.ts`, rein und getestet.

1. **Faustregel** (`FAKTOREN`): Einstieg = Kern-Preis × 0,5 (Spanne 0,4 bis 0,6), Premium = Kern-Preis × 2,0 (Spanne 1,8 bis 2,5). **Annahme: Richtwert von Alperna, keine Statistik und keine Marktaussage.** Das steht im UI, im Dokument und im Seitentext. Gezeigt wird die Mitte, geprüft die Spanne.
2. **Runden** (`roundPrice`): Preise der Vorschläge auf 5 Franken (nächster Fünfer, ab 2,50 auf: 1'247 wird 1'245, 1'248 wird 1'250, 1'250 bleibt). Ein Vorschlag kostet mindestens CHF 5.-. `ceilPrice` rundet auf 5 Franken auf, mit Toleranz 1e-9 gegen Gleitkommafehler (700 / 0,7 bleibt 1'000, nicht 1'005). Die Preise der eigenen Leistungen bleiben, wie sie eingegeben sind (auf Rappen).
3. **Kern** (`defaultKernId`): Leistung mit dem mittleren Preis; bei gerader Anzahl die untere der beiden mittleren; bei gleichen Preisen zählt die Reihenfolge der Eingabe. Die Person darf einen anderen wählen.
4. **Einstieg und Premium** (`defaultStufeId`, `zuordnung`): Standard ist die Leistung, deren Preis dem Zielpreis (`roundPrice(Kern-Preis × Faktor)`) am nächsten liegt, ohne den Kern oder die andere Stufe zu belegen. **Annahme (über den Auftrag hinaus):** Der Standard für den Einstieg kommt nur aus Leistungen unter dem Kern-Preis, der für das Premium nur aus Leistungen darüber; sonst wäre ein «Einstieg» teurer als der Kern. Gleichstand: die zuerst eingetragene. Gibt es keine passende Leistung, entsteht die Stufe als Vorschlag. Wählt die Person eine Leistung selbst, gilt sie (mit Warnung, wenn die Reihenfolge nicht stimmt). «Keine: Vorschlag nach Faustregel» erzwingt den Vorschlag.
5. **Stufen** (`stufen`): Jede Stufe rechnet mit Preis, Aufwand und Kosten der gewählten Leistung. Vorschlag: Preis = `max(5, roundPrice(Kern-Preis × Faktor))`, Aufwand und Kosten = Wert des Kerns × Faktor (0,5 oder 2,0, auf Rappen und Hundertstel gerundet), ausdrücklich als Rechenannahme markiert («Was müsste dieses Angebot enthalten?»).
6. **Deckungsbeitrag** (`deckungsbeitrag`): DB = Preis − direkte Kosten − Aufwand × Stundensatz (auf Rappen); Marge = DB / Preis in % (zwei Stellen). Satz 0 rechnet ohne Arbeitszeit, mit Hinweis in der Warnungsliste und im Kopf des Dokuments.
7. **Warnung bei kleiner Marge** (`warnungen`): Marge unter der Zielmarge (Vergleich `DB × 100 < Zielmarge × Preis`, genau auf dem Ziel ist keine Warnung) → Text mit Stufe, Marge, Zielmarge und dem Preis, der die Zielmarge erreicht: `preisFuerMarge = ceilPrice((Kosten + Aufwand × Satz) × 100 / (100 − Zielmarge))`. Negativer DB: zusätzlicher Satz «kostet dich mehr, als es einbringt».
8. **Preisabstand** (`abstand`): Kern / Einstieg und Premium / Kern als Faktor mit zwei Stellen (`faktorCH`: «2,00»); dazu Einstieg und Premium in % vom Kern. Ausserhalb der Spanne (Grenzen gelten noch als innerhalb) → Hinweis, kein Fehler. Ist die Reihenfolge falsch (Einstieg ≥ Kern oder Premium ≤ Kern), gibt es nur die Warnung zur Reihenfolge.
9. **Paketierung** (`FORMEN`): Einzelleistungen = Einstieg, Kern, Premium; Pakete = Basis, Standard, Komplett; Abo = Basis, Standard, Komplett mit «pro Monat» am Preis und in der Spaltenüberschrift. Ändert Beschriftungen, Hilfetexte und Beispieltexte, **nicht die Rechnung** (Test).
10. **Anker** (`reihenfolge`): mit Anker steht die Reihenfolge Premium, Kern, Einstieg (Karten, Tabelle, Liste); im Dokument kommt ein Hinweis dazu («Das ist eine Entscheidung zur Darstellung, keine Aussage über die Wirkung»). Keine Wirkungsaussage ohne Quelle.
11. **Stand** (`mt:angebotsarchitektur`): `{ v: 1, phase: "edit" | "result", leistungen: [{ id, name, preis, aufwand, kosten }] (Zeichenketten wie im Formular), satz, zielmarge, kern, einstiegId?, premiumId?, form, anker, output }`. `kern` leer = Standard; `einstiegId` fehlt = Standard, `""` = Vorschlag. `output` ist das Ergebnis (Objekt) oder null; der Pfad (lib/progress.ts) zählt das Werkzeug mit `phase: "result"` als erledigt. `parseState` bereinigt Zeilen (höchstens sechs, eindeutige Kennungen, Texte gekürzt, unbekannte Kennungen entfernt) und rechnet das Ergebnis aus den Angaben neu; kaputte Daten, falsche Version oder ungültige Angaben ergeben den leeren Stand bzw. «edit» mit den Angaben. Der Entwurf wird mit 500 ms Verzögerung gespeichert.
12. **CRM**: `eingabeText(input)` und `reportMarkdown(result, input)`.

## Ausgaben
- Ergebnis: `ResultCard` «Dein Angebot in drei Stufen» mit dem Satz zu Faustregel und Zielmarge (`data-testid="aa-richtwert"`), der Vergleichsgrafik (`ul role="list"` mit drei Karten, `data-testid="aa-vergleich"`, je Karte `aa-stufe-einstieg|kern|premium`; Kern mit Rahmen und Kennzeichnung «Dein Kern», Balken im Preisverhältnis, Warnrahmen mit Text bei Marge unter Ziel, Vermerk bei Vorschlag) und dem Dokument (`DocView`, `data-testid="aa-dokument"`).
- Dokument (`toDocument`): Titel «Angebotsarchitektur und Preisstrategie», Untertitel «Einstieg CHF …, Kern CHF …, Premium CHF …. Preisabstände: Faustregel von Alperna, keine Statistik.»; Facts Betrieb, Branche, Form, Interner Stundensatz, Zielmarge, Kern, Reihenfolge; «Die drei Stufen» (Tabelle Stufe | Leistung | Preis | Aufwand | Kosten | Deckungsbeitrag | Marge); «Warnungen» (Liste oder «Keine Warnung: …»); «Was die Stufen unterscheidet» (aus Namen und Beschriftungen, kein erfundener Inhalt); «Preisabstände» (Faustregel, Spannen, Ergebnis); «Hinweise» (drei, mit Anker vier). Dateiname `angebotsarchitektur-<firma>`.
- Knöpfe: `DocumentExport` (Text kopieren frei, PDF, Word nach der Adresse), «Angaben ändern» (Formular mit den gespeicherten Angaben), «Neu beginnen» (löscht Angaben und Ergebnis; das Profil bleibt).
- Zählung: `popular:angebotsarchitektur` über `/api/result` bei jedem Ergebnis.

## Edge Cases
- Profil leer: Firma muss getippt werden (Meldung); keine Branche ist in Ordnung.
- Eine Leistung allein oder Stufe ohne Leistung: Vorschlag mit Faktoren; mehrere Leistungen auf einer Seite des Kerns: die nächstliegende, die zweite bleibt ungenutzt.
- Alle Leistungen gleich teuer: Einstieg und Premium sind Vorschläge (keine Leistung unter oder über dem Kern).
- Satz 0: Hinweis, Margen ohne Arbeitszeit. Aufwand 0: erlaubt.
- Preis ≤ 0, leer, Text oder über der Grenze: Meldung mit der Nummer der Zeile. Doppelte Namen: Meldung. Mehr als sechs Leistungen (nur über kaputten Stand möglich): Meldung; `parseState` schneidet bei sechs ab.
- Kern unbekannt (Stand kaputt): `parseState` setzt auf Standard; `validate` meldet eine unbekannte Kennung.
- Kern, Einstieg und Premium nicht verschieden: Meldung.
- Marge genau auf dem Ziel: keine Warnung. Negativer DB: Warnung mit Zusatz. Sehr kleiner Kern-Preis: Vorschlag mindestens CHF 5.-.
- Fenster mit «Später» geschlossen: Formular bleibt mit allen Werten.
- Gespeicherter Stand kaputt, andere Version: leeres Formular.
- Keine Daten-Datei, keine Quelle für Zahlen: Das Werkzeug rechnet nur mit den Angaben der Person und der Faustregel von Alperna. Es nennt keine Benchmark.

## Texte
- Tagline: «Einstieg, Kern, Premium aus deinen Leistungen: Preisabstände, Deckungsbeitrag, Warnung bei kleiner Marge.» (105 Zeichen; der Wortlaut des Auftrags hat 123 und passt nicht ins Schema, höchstens 110)
- SEO-Title «Angebotsarchitektur Schweiz: Einstieg, Kern, Premium» (52), Meta-Description in `content/tools/angebotsarchitektur.md`.
- Keyword «Angebotsarchitektur»: H1, erster Absatz, Nutzen, Alperna-Satz.
- Erklärtext nach der Lese-Vorlage, Beispiel (Malerei Keller, Gossau: Zimmer auffrischen CHF 1'500.-, Wohnung streichen CHF 3'000.-, Fassade CHF 6'400.-, Stundensatz CHF 85.-, Zielmarge 30 %; mit dem Werkzeug gerechnet und in `logic.test.ts` festgehalten), FAQ (6) und Alperna-Satz (Baustein Website, ohne Alperna-Preise im Seitentext): `content/tools/angebotsarchitektur.md`.
- Keine Aussage über rechtliche Vorgaben zur Preisangabe, im UI und im Seitentext.

## Tests
`tools/angebotsarchitektur/logic.test.ts` (74 Fälle in 15 Gruppen): Runden auf 5 Franken (auf, ab, genau, Mitte, Unsinn), Aufrunden ohne Gleitkommafehler, Konstanten und Formen, Deckungsbeitrag von Hand (auch mit Satz 0 und negativ), `preisFuerMarge`, Kern in der Mitte, nächstliegende Leistung für Einstieg und Premium (Seiten, Gleichstand, Ausschluss), `zuordnung`, Stufen aus dem Kern, eine Leistung allein mit Faktoren, Mindestpreis, Warnung bei Marge unter Ziel und der Preis dafür, genau auf dem Ziel, Satz 0, Vorschläge, falsche Reihenfolge, Preisabstand (Faktor, Grenzen, Hinweis ausserhalb), Anker kehrt die Reihenfolge um, Paketierung ändert nur Beschriftungen, alle Prüfregeln von `validate` (Leistungen 1 bis 6, Preis ≤ 0, Name, Aufwand, Kosten, Duplikate, Satz, Zielmarge, Kern fehlt, drei verschiedene Leistungen), `parseNumber`, `toInput` (Rundungen), Dokument (Tabelle, chf-Format, Warnungen, Hinweise, Sperrliste, keine Rechtsaussage), `eingabeText`, `parseState` bei kaputten Daten und als Rundlauf, Pfad-Fortschritt, das Beispiel aus dem Seitentext. `Tool.test.tsx` (11 Fälle, jsdom): Bedienung von Formular, Fenster, Ergebnis, CRM-Aufruf gegen eine Attrappe von `fetch`, Neuladen, Anker, Form, Vorschläge, Hinzufügen und Entfernen, Zwischenstand, kaputter Speicher.

## Nicht Teil dieses Tools
- Preise anderer Anbieter, Branchenvergleiche, Marktpreise, Statistik zu Preisabständen: gibt es nicht (Harte Regel 7); die Faustregel ist von Alperna.
- Aussagen, ob der Anker wirkt, und Empfehlungen zur Preisangabe auf der Website.
- Rechtliche Vorgaben zu Preisangaben (Harte Regel 8).
- Mehrwertsteuer: Preise gelten so, wie sie eingegeben sind (netto oder brutto); das Werkzeug rechnet sie nicht um.
- Inhalte der Stufen erfinden: Das Dokument nennt nur Namen und Beschriftungen; was eine Stufe enthält, legt die Person fest.
- Mengenrabatte, Saison, Konkurrenz, Preiselastizität, Kalkulation einzelner Aufträge.
- Profil schreiben, KI, Server.
