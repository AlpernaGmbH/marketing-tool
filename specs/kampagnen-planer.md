# Kampagnen-Planer (kampagnen-planer)

Klasse C (alles im Browser), Stand 05.10.2026. Kein Server, keine KI (`needsServer: false`). Zugang v3: E-Mail-Fenster vor dem Ergebnis, Ergebnis mit Eingabe und Ausgabe ins CRM.

## Nutzen in einem Satz
Für KMU und Vereine, die eine Kampagne vorbereiten: aus Ziel, Zielgruppe, Kernbotschaft, Kanälen, Zeitraum und Budget ein Plan in vier Phasen (Wochenplan, Massnahmen je Kanal, Budget je Woche, Kennzahlen-Vorschläge), in acht Minuten, als Kampagnenbrief (PDF, Word, Text) und als Kalenderdatei (.ics) mit den Meilensteinen.

## Kategorie und Verknüpfung
Kategorie: strategie (Schritt 14 im Pfad «Strategie»), Zielgruppe: beide
Liest aus Profil: firma, branche, primaersegment, kanaele, organisationstyp
Schreibt ins Profil: nichts (`profilePatch` gibt es nicht). Firma, Branche und Art der Organisation erfragt das Werkzeug über `ProfileFieldsForm`; `ProfileFieldsForm` kennt weder `primaersegment` noch `kanaele`, darum liest das Werkzeug beide nur und zeigt sie in eigenen Feldern, die sich je Kampagne ändern lassen.
Liest aus anderen Werkzeugen: `mt:botschaften` (Hauptbotschaft, über `parseState` aus `tools/botschaften/logic.ts`) für die Kernbotschaft; Kennzahlen-Bezeichnungen aus `tools/kpi-baum/logic.ts` (`kpiDef`); Kanäle, Datumsfunktionen und `icsEscape` aus `tools/anlass-planer/logic.ts`, `foldLine`, `addDays` und `formatIso` aus `tools/content-kalender/logic.ts`.
Verwandte Werkzeuge: kpi-baum, botschaften, budget-planer. Massnahmen verweisen zusätzlich auf post-generator, caption-baukasten, medienmitteilung, qr-set, whatsapp-link, bewertungs-kit und newsletter-check, wenn das Werkzeug zur Massnahme passt (Test gegen `tools/index.ts`).

## Eingaben
| Feld | Typ | Pflicht | Vorbefüllung aus Profil | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (KMU oder Verein) | single | ja | profile.organisationstyp, sonst KMU | – | über `ProfileFieldsForm`; bestimmt die Kennzahlen-Vorschläge und die Beschriftung von Firma und Branche |
| Firma / Name des Vereins | text (Profil) | nein | profile.firma | – | steht im Kopf von PDF und Word und geht mit dem Ergebnis ins CRM |
| Branche / Tätigkeit des Vereins | text (Profil) | nein | profile.branche | – | – |
| Was soll die Kampagne bringen? | single (Select) | ja | erste Option der Liste | eines von: Anfragen gewinnen, Anmeldungen zu einem Anlass, Neue Kundschaft oder Mitglieder gewinnen, Bekannter werden in der Region, Ein Angebot bewerben | – |
| Für wen? | text | ja | profile.primaersegment | 3 bis 160 Zeichen (nach Trim) | – |
| Kernbotschaft in einem Satz | text | ja | Hauptbotschaft aus dem gespeicherten Stand von «Kernbotschaften» (`mt:botschaften`, Feld `output.hauptbotschaft`); ohne gespeicherten Stand leer, es wird nichts angenommen | 10 bis 200 Zeichen (nach Trim) | Vorbefüllt aus «Kernbotschaften», wenn vorhanden |
| Angebot oder Anreiz (freiwillig) | text | nein | – | höchstens 160 Zeichen | wird, wenn vorhanden, als Name der Kampagne im Brief und im Kalender verwendet |
| Kanäle | multi (Checkboxen) | ja, mindestens einer | profile.kanaele (Vergleich über den Namen), sonst Website, Instagram, Aushang und Flyer | Website, Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Aushang und Flyer, Lokalzeitung und Anzeiger, WhatsApp | – |
| Start | date | ja | – | gültiges Datum, nicht vor dem heutigen Datum (heute zählt) | Fehler in `role="alert"` |
| Ende | date | ja | – | gültiges Datum, nicht vor dem Start; Dauer 2 bis 16 Wochen | das Ende zählt mit; die Anzahl Wochen steht in einer Statuszeile (`role="status"`) |
| Budget in CHF (freiwillig) | number | nein | – | ganze Franken von 0 bis 1'000'000; leer oder 0: kein Budget | ohne Budget zeigt der Plan keine Beträge |

## Logik
Alle Regeln in `tools/kampagnen-planer/logic.ts`, die Massnahmenmuster in `data.ts`. Datum immer als JJJJ-MM-TT und mit UTC-Teilen gerechnet (`addDays` aus dem Content-Kalender), nie über die lokale Zeitzone. Das heutige Datum kommt als Parameter `heute` in `validate` und `buildPlan`; `todayIso(now)` bildet es in der Zeitzone Europe/Zurich.

1. **Wochen.** Tage = Tage von Start bis Ende plus 1 (das Ende zählt mit). Wochen W = aufgerundet Tage / 7. Die Wochenblöcke beginnen am Start, Block n läuft von Start + 7 × (n - 1) bis sechs Tage später; der letzte Block endet am Ende und kann kürzer sein. Liegt das Ende vor dem Start, ist W = 0. Beispiel: 12.10.2026 bis 06.12.2026 sind 56 Tage, also 8 Wochen; ein Tag mehr (07.12.2026) sind 57 Tage, also 9 Wochen.
2. **Zeitraum prüfen.** W muss zwischen 2 und 16 liegen (also mindestens 8 und höchstens 112 Tage). Weniger: «Die Kampagne dauert weniger als zwei Wochen.» Mehr: «Die Kampagne dauert mehr als 16 Wochen.» Der Start darf nicht vor `heute` liegen.
3. **Phasen** (Annahme: Richtwert von Alperna, keine Statistik). Für W ≥ 4: Vorbereitung = max(1, Runden(W × 0,15)), Nachfassen = max(1, Runden(W × 0,15)), Anlauf = max(1, Runden(W × 0,20)), Hauptphase = Rest, mindestens 1 (Runden: kaufmännisch, 0,5 wird aufgerundet). Für W = 2: 1 Woche Vorbereitung und 1 Woche Hauptphase. Für W = 3: 1 Woche Vorbereitung, 1 Woche Hauptphase, 1 Woche Nachfassen. Die Summe der Phasenwochen ist immer W. Phasen mit 0 Wochen (Anlauf bei W = 2 und 3, Nachfassen bei W = 2) erscheinen nicht. Die Phasen folgen einander: Vorbereitung, Anlauf, Hauptphase, Nachfassen.
   Ergibt: W = 2 → 1/0/1/0, W = 3 → 1/0/1/1, W = 4 → 1/1/1/1, W = 8 → 1/2/4/1, W = 12 → 2/2/6/2, W = 16 → 2/3/9/2 (Vorbereitung/Anlauf/Hauptphase/Nachfassen).
4. **Budget** (nur wenn Budget > 0; Annahme: Richtwert von Alperna, keine Statistik). Anteile: Anlauf 25 %, Hauptphase 60 %, Nachfassen 15 %, Vorbereitung 0 %. Fehlt eine Phase, wird ihr Anteil der Hauptphase zugeschlagen (W = 2: Hauptphase 100 %; W = 3: Hauptphase 85 %, Nachfassen 15 %). Je Phase: Betrag je Woche = abgerundet (Budget × Anteil / (100 × Wochen der Phase)), in ganzen Franken, gleich auf alle Wochen der Phase. Der Rundungsrest (Budget minus Summe aller Wochenbeträge) kommt in die letzte Woche der Hauptphase. Die Summe aller Wochen ist exakt das Budget. Die Vorbereitung bekommt kein Budget; Kosten für Material (zum Beispiel Druck) zählt die Person selbst dazu (Hinweis im Brief). Ohne Budget gibt es keine Beträge und keine Budget-Spalte.
5. **Massnahmen** (Annahme: Richtwert von Alperna, keine Statistik; `data.ts`). Ein Muster hat Phase, Kanal (einer der neun oder «intern»), Titel, Position in der Phase (`erste`, `mitte`, `letzte` oder `jede` Woche) und optional Hinweis und Werkzeug-Slug. Mitte = Woche ⌈n / 2⌉ der Phase mit n Wochen. Muster mit Kanal erscheinen nur, wenn der Kanal gewählt ist; interne Muster immer. Je Phase und Kanal gibt es höchstens zwei Muster, also höchstens zwei Massnahmen je Woche und Kanal (Test). Reihenfolge in der Woche: intern zuerst, dann die Kanäle in der festen Reihenfolge der Auswahl. Titel und Hinweise enthalten keine Ziffern, keine Fristen und keine Rechtsaussagen: Beim Anzeiger heisst es «Frist beim Anzeiger erfragen», bei WhatsApp «nur an Personen, die zugestimmt haben».
6. **Kennzahlen-Vorschläge** je Ziel (Bezeichnungen aus `kpiDef` des Ziel- und KPI-Baums, ohne Zielwerte): Anfragen gewinnen → Anfragen, Website-Besuche, Profilaufrufe; Anmeldungen zu einem Anlass → Anmeldungen (Vereine) oder Termine (KMU); Neue Kundschaft oder Mitglieder → Neukunden und Offerten (KMU) oder Neumitglieder und Anfragen (Vereine, weil der Ziel- und KPI-Baum Neukunden und Offerten nur für KMU kennt); Bekannter werden → Profilaufrufe, Website-Besuche; Angebot bewerben → Anfragen, Termine. Hinweis: «Zielwerte setzt du im Ziel- und KPI-Baum.» mit Link auf kpi-baum.
7. **Meilensteine** für die Kalenderdatei: Start der Vorbereitung (= Start), Start des Anlaufs, Start der Hauptphase, Start des Nachfassens (nur für vorhandene Phasen), Ende der Kampagne (= Ende), Auswertung (Ende plus 7 Tage). Je Meilenstein ein ganztägiges Ereignis mit Beschreibung (Phase, Zeitraum, Massnahmen der ersten Woche der Phase).
8. **Name der Kampagne** im Brief und im Kalender: das Angebot, wenn angegeben, sonst die Bezeichnung des Ziels.
9. **Status je Woche** (nur Anzeige am Bildschirm, nicht im Dokument): «läuft diese Woche», wenn `heute` im Wochenblock liegt; vergangene Wochen tragen «vorbei». Der Plan wird nie verschoben.
10. **Richtwert.** Muster, Phasenanteile und Budgetverteilung stehen im UI, im Dokument und im Seitentext als «Richtwert von Alperna, keine Statistik». Keine Zahl zu Wirkung, Reichweite oder Kosten.

## Ausgaben
- Ergebnis (nach dem E-Mail-Fenster) in der `ResultCard` «Dein Kampagnenplan»: Überblick (Ziel, Zielgruppe, Kernbotschaft, Angebot, Zeitraum und Wochen, Kanäle, Budget), Phasen (`ul`, `aria-label="Phasen"`), Kennzahlen (`ul`, `aria-label="Kennzahlen"`) mit Link zum Ziel- und KPI-Baum, Wochenplan (`ul`, `aria-label="Wochenplan"`, je Woche ein `li` mit Kopf und einer eigenen `ul` «Massnahmen Woche n»), Hinweise (`ul`, `aria-label="Hinweise"`), Hinweis zum Richtwert.
- Text kopieren (frei), PDF und Word über `DocumentExport`. Kalender (.ics) über `guardDownload`.
- Kampagnenbrief (`DocumentModel`, Titel «Kampagnenbrief»): Steckbrief (Ziel, Zielgruppe, Kernbotschaft, Angebot, Zeitraum und Wochen, Kanäle, Budget, Verteilung, Kennzahlen), Tabelle Phasen (Phase, Wochen, Zeitraum, Budget), Tabelle Wochenplan (Woche, Phase, Zeitraum, Massnahmen, Budget), drei Hinweise, Hinweis zum Richtwert. Ohne Budget fehlen die Budget-Spalten und die Zeilen Budget und Verteilung.
- Kalenderdatei: ein ganztägiges Ereignis je Meilenstein, UTF-8, Zeilen nach RFC 5545 gefaltet, Komma, Semikolon, Backslash und Zeilenumbruch maskiert, `DTSTART;VALUE=DATE`.
- CRM: `eingabe` = Ziel, Zielgruppe, Kernbotschaft, Angebot, Kanäle, Zeitraum, Budget (eine Angabe je Zeile); `ausgabe` = Markdown des Kampagnenbriefs. Der Server kürzt auf 1'900 Zeichen; der Steckbrief steht oben und enthält Ziel und Zeitraum, dahinter Phasen und Wochenplan (Test).
- Stand `mt:kampagnen-planer`: `{ v: 1, phase: "edit" | "result", input, output? }`; `phase: "result"` zählt im Pfad als erledigt (`lib/progress.ts`).

## Edge Cases
- Start in der Vergangenheit: Fehler in `role="alert"`; heute ist erlaubt.
- Ende vor dem Start, Zeitraum unter zwei und über 16 Wochen: Fehler am Feld Ende.
- Genau zwei Wochen (8 Tage) und genau 16 Wochen (112 Tage) sind erlaubt; ein Tag weniger beziehungsweise mehr nicht.
- Budget mit Dezimalstellen, negativ, über 1'000'000 oder Text: Fehler; 0 oder leer: kein Budget.
- Kleines Budget (zum Beispiel CHF 5.-) bei vielen Wochen: Wochenbeträge werden 0, der Rundungsrest steht in der letzten Woche der Hauptphase; die Summe stimmt.
- Fehlende Phasen (W = 2 und 3): Anteile gehen an die Hauptphase.
- Kaputter Stand im Speicher (kein JSON, falsche Form, Phase «result» ohne gültige Eingabe, Dauer ausserhalb 2 bis 16 Wochen): leerer Stand, Formular.
- Profil leer: KMU, Kanäle Website, Instagram, Aushang und Flyer, «Für wen?» leer.
- Kein gespeicherter Stand von «Kernbotschaften» oder ein Stand, dessen Form nicht passt: Kernbotschaft leer, keine Annahme.
- Das Ergebnis wird später wieder geöffnet, wenn der Start schon vorbei ist: der Plan wird aus der gespeicherten Eingabe neu gerechnet; die Prüfung auf einen vergangenen Start gilt nur beim Erstellen.

## Texte
- Tagline: «Eine Kampagne in vier Phasen: Wochenplan, Massnahmen je Kanal, Budget je Woche und Kampagnenbrief.»
- SEO-Title (≤ 60, mit «Schweiz») und Meta-Description (≤ 155): siehe content/tools/kampagnen-planer.md.
- H1: «Kampagne planen mit dem Kampagnen-Planer für Schweizer KMU» (Keyword «Kampagne planen» in der H1).
- Seitentext: 350 bis 700 Wörter, Beispiel Malerei Keller, Gossau, «Herbstaktion Fassadenanstrich», acht Wochen, Budget CHF 1'200.-, mit Zahlen aus dem echten Ergebnis. Keyword «Kampagne planen» drei- bis fünfmal.
- FAQ: Wie lange soll eine Kampagne dauern? (Richtwert von Alperna), Wie verteile ich das Budget? (Richtwert von Alperna), Was, wenn ich kein Budget habe?, Brauche ich ein Konto?, Was bekommt Alperna, was bleibt im Browser?
- Alperna-Baustein: Social Media.

## Tests
Mindestens 28 Fälle in logic.test.ts (Phasen für W = 2 bis 16, Budget exakt verteilt, Budget 0, Wochenzahl, Zeitraum zu kurz und zu lang, Start in der Vergangenheit, Massnahmen nur für gewählte Kanäle, Links nur auf bestehende Slugs, keine Sperrliste und keine Rechtsaussage in den Mustern, Kennzahlen je Ziel, ICS-Struktur, Dokument, Vorbefüllung der Kernbotschaft, kaputter Stand, eingabe/ausgabe), dazu export.test.ts (PDF, Word, Kalenderdatei) und Tool.test.tsx (Ablauf im Browser).

## Nicht Teil dieses Tools
Kein Server, keine KI, keine Zielwerte (die setzt der Ziel- und KPI-Baum), keine eigenen Massnahmen, kein Abhaken, kein Verschieben des Plans, keine Erinnerungen per E-Mail, keine Rechtsaussagen und keine Fristen, keine Zahlen zu Wirkung, Reichweite oder Kosten, keine Wochentage und keine Feiertage in der Planung.
