# Kundenweg-Mapper (kundenweg)

Klasse C (alles im Browser, ohne KI, ohne Server ausser dem Versand des Ergebnisses ins CRM), Stand 05.10.2026. Ein Formular mit sechs Abschnitten, kein Fragebogen-Werkzeug. `logic.ts` ist getestet (`logic.test.ts`), die Oberfläche in `Tool.test.tsx`.

## Nutzen in einem Satz
Für Inhaberinnen, Inhaber und Vereinsvorstände, die wissen wollen, wo ihre Kundschaft (oder Interessierte) auf dem Weg zur Anfrage verloren geht: in rund acht Minuten der Weg in sechs Phasen als Tabelle (PDF A4 quer, Word, Text) und eine Lückenliste, die sagt, welcher Inhalt in welcher Phase fehlt.

## Kategorie und Verknüpfung
Kategorie: strategie (dreizehnter Schritt im Pfad «Strategie»), Zielgruppe: beide (KMU und Vereine)
Liest aus Profil: `organisationstyp`, `firma`, `branche` (Grunddaten über `ProfileFieldsForm`, nie erneut gefragt, Harte Regel 10) und `kanaele` (nur als Vorschlag für die Berührungspunkte der ersten beiden Phasen, siehe unten). `kanaele` ist kein Feld von `ProfileFieldsForm` und wird hier nicht angezeigt.
Schreibt ins Profil: nichts (`writesProfile: []`, kein `profilePatch`).
Verwandte Tools: positionierung, bewertungs-kit, empfehlungsprogramm
`needsServer: false`: nichts verlässt den Browser ausser dem Ergebnis (Eingabe und Ausgabe) ins CRM.

## Wortwahl
«Customer Journey», «Touchpoint» und «Funnel» stehen auf der Sperrliste (`lib/brand-rules.ts`) und kommen nirgends vor: nicht im UI, nicht im Seitentext, nicht in Dateinamen. Das Werkzeug heisst «Kundenweg-Mapper»; im Text «Kundenweg», «Weg zur Anfrage», bei Vereinen «Weg zur Mitgliedschaft». Statt «Touchpoint»: «Berührungspunkt».

## Zugang (Zugang v3)
- **Ohne Konto, E-Mail vor dem Ergebnis.** Beim Klick auf «Kundenweg erstellen» prüft das Werkzeug die Eingaben (`validate`), dann `await ctx.ensureEmail()` (false: Fenster geschlossen, Formular bleibt stehen), dann Auswertung und Speichern.
- **Jedes Ergebnis geht ins CRM:** nach dem sichtbaren Ergebnis einmal `ctx.sendResult({ eingabe, ausgabe })`. Eingabe = `eingabeText(input)` (je Phase eine Zeile: Frage, Berührungspunkte, Inhalt, Verantwortlich). Ausgabe = `reportMarkdown(ergebnis)` (das Dokument als Markdown, Gesamtaussage oben). Der Server kürzt beides auf 1'900 Zeichen. Nach dem Neuladen steht das Ergebnis wieder da, ohne zweiten CRM-Eintrag; ein zweiter Durchlauf geht erneut ins CRM.
- **Downloads** (PDF, Word über `DocumentExport`): ohne Adresse erst das Fenster, bei «Später» kein Download. Text kopieren ist frei.

## Eingaben
Alle Felder haben ein `<label>`; Fehler stehen in `role="alert"`, der Fortschritt («n von 6 Phasen beschrieben») in `role="status"`. Alle Angaben der Phasen sind freiwillig; mindestens eine Phase braucht eine Angabe (Frage, Berührungspunkt oder Antwort bei «Inhalt»).

| Feld (Label) | Typ | Pflicht | Vorbefüllung | Validierung | Hilfetext |
|---|---|---|---|---|---|
| Ich bin (KMU oder Verein) | Radio (`ProfileFieldsForm`) | ja | Profil `organisationstyp` | – | – |
| Firma / Name des Vereins | text (`ProfileFieldsForm`) | nein | Profil `firma` | – | «Firma und Branche speichern wir in deinem Firmenprofil, in deinem Browser.» |
| Branche / Tätigkeit des Vereins | text (`ProfileFieldsForm`) | nein | Profil `branche` | – | – |
| Phase n: Was fragt sich die Kundschaft? | text (`fieldset`-Legende = Phasenname) | nein | – | bis 160 Zeichen | Platzhalter je Phase (kein vorausgefüllter Wert), siehe unten |
| Phase n: Wo begegnet die Kundschaft dir? | Checkboxen in einer Gruppe | nein | Profil `kanaele` als Vorschlag für Phase 1 und 2, solange das Formular leer ist | nur bekannte Schlüssel | – |
| Phase n: Gibt es dafür Inhalt? | Radio «Ja», «Teilweise», «Nein» | nein | – (keiner gewählt) | – | «Keine Auswahl zählt wie «Nein».» |
| Phase n: Verantwortlich | text | nein | – | bis 60 Zeichen | «Freiwillig. Ein Name genügt.» |

Phasen (feste Reihenfolge, Schlüssel in Klammern): 1 Aufmerksam werden (aufmerksam), 2 Informieren (informieren), 3 Vergleichen (vergleichen), 4 Entscheiden (entscheiden), 5 Kaufen oder Nutzen (kaufen; bei Vereinen «Mitmachen»), 6 Weiterempfehlen (empfehlen). Bei Vereinen heisst der Weg «Weg zur Mitgliedschaft».

Platzhalter der Frage (KMU): Aufmerksam werden «Wer macht so etwas in meiner Nähe?», Informieren «Was kostet das, wie läuft es ab?», Vergleichen «Warum dieser Betrieb und nicht der andere?», Entscheiden «Kann ich dem vertrauen, und wie melde ich mich?», Kaufen oder Nutzen «Was passiert nach meiner Zusage?», Weiterempfehlen «Wem erzähle ich davon?». Vereine: Aufmerksam werden «Gibt es in meiner Nähe einen Verein dafür?», Mitmachen «Wie werde ich Mitglied, und was passiert danach?», die übrigen wie bei KMU.

Berührungspunkte (feste Reihenfolge): Website, Google-Unternehmensprofil, Instagram, Facebook, LinkedIn, Newsletter, Empfehlungen, Anlässe, Aushang und Flyer, Lokalzeitung und Anzeiger, Telefon und Gespräch, WhatsApp.

Vorschlag aus `profile.kanaele`: Jeder Eintrag mit `name` oder `kanal` wird per Wortvergleich einem Berührungspunkt zugeordnet (zum Beispiel «Instagram» → Instagram, «Google Business Profil» → Google-Unternehmensprofil, «Dorfanzeiger» → Lokalzeitung und Anzeiger, «Google Ads» → keiner). Ist das ganze Formular noch leer (keine Frage, kein Berührungspunkt, keine Inhaltsantwort, kein Name), erscheinen die zugeordneten Punkte in Phase 1 und 2 angekreuzt. Sobald die Person etwas ändert, gilt ihr Entwurf. Ohne passenden Eintrag bleibt alles leer.

## Logik
Alle Funktionen sind rein; kein `new Date()` in `logic.ts` (das Datum kommt vom Dokument-Export).

1. **Eingabe prüfen** (`validate(input)`, erste Meldung oder null). Blockiert wird nur, was kein sinnvolles Ergebnis zulässt: der Stand hat nicht genau sechs Phasen; eine Frage ist länger als 160 oder ein Name länger als 60 Zeichen; keine Phase hat irgendeine Angabe («Beschreibe mindestens eine Phase: eine Frage, einen Berührungspunkt oder die Antwort bei «Gibt es dafür Inhalt?».»).
2. **Lücke je Phase** (`luecke(phase)`). Stufe «rot», wenn kein Berührungspunkt gewählt ist oder der Inhalt «Nein» oder ungewählt ist. Stufe «gelb», wenn der Inhalt «Teilweise» ist. Eine Phase ohne Frage (leer oder nur Leerzeichen) ist mindestens «gelb» (Grund «Die Frage fehlt»). Sonst «ok» (keine Lücke). Gründe sind Sätze («Kein Berührungspunkt gewählt», «Es gibt keinen Inhalt dafür», «Der Inhalt ist nur teilweise da», «Die Frage fehlt»). Hinweise ohne Einfluss auf die Stufe: «Niemand verantwortlich» (Feld leer) und, bei ungewähltem Inhalt, «Keine Antwort bei «Gibt es dafür Inhalt?», das zählt wie «Nein».»
3. **Vorschläge je Phase** (`vorschlaege(phaseKey, typ)`, zwei bis drei Inhaltstypen, Richtwert von Alperna, keine Statistik): Aufmerksam werden: Google-Unternehmensprofil mit Fotos und Öffnungszeiten; regelmässige Beiträge; Empfehlungen sichtbar machen. Informieren: Leistungsseiten mit Ablauf; häufige Fragen mit klaren Antworten; Preisrahmen oder «ab»-Angabe, nur wenn du Preise nennen willst. Vergleichen: Referenzen mit Ort und Namen; Bewertungen; Vorher-Nachher-Fälle. Entscheiden: klarer nächster Schritt (Anruf, WhatsApp, Termin); Offerte mit Frist; Kontaktangaben an jeder Stelle. Kaufen oder Nutzen: Bestätigung und Ablauf; wer kommt wann; Ansprechperson. Mitmachen (Verein): Schnuppertraining oder Probetermin; Beitritt in wenigen Schritten; Willkommensmail. Weiterempfehlen: Bitte um Bewertung nach dem Auftrag (Verein: nach den ersten Wochen); Empfehlungskarte; Dank.
4. **Nächstes Werkzeug je Lücke** (`werkzeugFuer(phaseKey, typ)`, nur Slugs, die in `tools/index.ts` stehen; Test): Aufmerksam werden: content-saeulen oder gbp-feiertage. Informieren: textcheck. Vergleichen: bewertungs-kit. Entscheiden: whatsapp-link. Kaufen oder Nutzen: keines. Weiterempfehlen: bewertungs-kit oder empfehlungsprogramm (Vereine: empfehlungsprogramm oder anspruchsgruppen; nie sponsoring-dossier).
5. **Reihenfolge der Lückenliste** (`lueckenliste`): rot vor gelb, innerhalb derselben Stufe die frühere Phase zuerst. Begründung als Satz im Dokument: «Die frühere Phase kommt zuerst, weil ohne Aufmerksamkeit der Rest nichts bringt. Das ist ein Richtwert von Alperna, keine Statistik.» Ist der einzige Grund einer Lücke die fehlende Frage, steht als Vorschlag «Schreib die Frage der Kundschaft in einem Satz auf.» und kein Werkzeug.
6. **Gesamtaussage** (`summary`): «n von 6 Phasen sind abgedeckt.» (n = Phasen ohne Lücke; bei 1: «1 von 6 Phasen ist abgedeckt.»), dazu ein Satz mit der wichtigsten Lücke («Die wichtigste Lücke liegt in der Phase «Aufmerksam werden»: Kein Berührungspunkt gewählt.»). Sind alle sechs abgedeckt: «Es gibt keine Lücke.», dazu ein Satz zu Phasen ohne verantwortliche Person, falls es welche gibt.
7. **Dokument** (`toDocument`, A4 quer im PDF über `landscape: true` im Modell): Kopf (Titel «Kundenweg: <Firma>» oder «Weg zur Mitgliedschaft: <Verein>», Untertitel), «Auf einen Blick» (Steckbrief, Gesamtaussage), «Der Weg in sechs Phasen» (Tabelle Phase | Frage | Berührungspunkte | Inhalt | Verantwortlich | Lücke; Zellen «Lücke», «Teilweise», «Abgedeckt»), «Lückenliste» (Begründung der Reihenfolge, Tabelle Phase | Was fehlt | Vorschläge | Nächstes Werkzeug), «Drei Hinweise». Dateiname `kundenweg-<firma>`, bei Vereinen `weg-zur-mitgliedschaft-<verein>`.
8. **Stand speichern** (`mt:kundenweg`): `{ v: 1, phase: "edit" | "result", typ, phasen: [{ frage, punkte, inhalt, verantwortlich }], output? }`. `output` = `{ firma, branche, datum }` zum Zeitpunkt der Erstellung; das Ergebnis wird daraus neu gerechnet. Das Formular speichert den Entwurf mit 500 ms Verzögerung (`phase: "edit"`). `parseState` liefert bei kaputten Daten den leeren Stand, verwirft ungültige Felder einzeln, kürzt zu lange Texte und bleibt bei `phase: "edit"`, wenn `output` fehlt oder die Eingabe die Prüfung nicht besteht. `phase: "result"` genügt `lib/progress.ts` für «erledigt».

## Ausgaben
- Ergebnis: `ResultCard` «Dein Kundenweg» (bei Vereinen «Dein Weg zur Mitgliedschaft») mit `ScoreBadge` («n von 6, Phasen abgedeckt»), Gesamtaussage, sechs Karten (`ol`, ab 1024 Pixel in einer Reihe, darunter gestapelt; jede Karte nennt die Stufe als Text «Lücke», «Teilweise» oder «Abgedeckt», nie nur als Farbe), Lückenliste mit Vorschlägen und Werkzeug-Links (`/tools/<slug>`), drei Hinweisen.
- Knöpfe: `DocumentExport` (Text kopieren als Markdown, PDF quer, Word), «Angaben ändern», «Neu beginnen».
- Hinter dem E-Mail-Fenster: das Ergebnis selbst und alle Downloads.

## Edge Cases
- Nichts ausgefüllt: Meldung (Punkt 1), kein Fenster, kein CRM.
- Nur eine Phase beschrieben: Ergebnis mit fünf Lücken, die wichtigste steht vorne.
- Frage vorhanden, Berührungspunkte gewählt, Inhalt «Ja», niemand verantwortlich: Phase gilt als abgedeckt, die Zelle sagt «Niemand verantwortlich».
- Profil leer: Firma und Branche leer; Titel ohne Firma, Kopf der Dateien «Alperna», Steckbrief «keine Angabe».
- Organisationstyp wechselt nach dem Speichern: Phasenname und Texte folgen dem Typ des Ergebnisses (`state.typ`), das Formular dem Profil.
- Profil enthält Kanäle, die kein Berührungspunkt sind («Google Ads», «TikTok»): bleiben ohne Vorschlag.
- Zwei Profilkanäle für denselben Punkt: ein Haken.
- Sehr lange Frage (160 Zeichen) und lange Wörter: Umbruch in Karten (`break-words`) und im PDF.
- Gespeicherter Stand kaputt, falsche Version, zu wenige oder zu viele Phasen: leerer oder auf sechs Phasen gebrachter Stand.
- Gleiche Daten in zwei Tabs: der Speicher gilt, der Entwurf lebt im Tab.

## Texte
- Tagline: «Der Weg deiner Kundschaft in sechs Phasen: wo sie dir begegnet, was fehlt, und was du zuerst ergänzt.»
- SEO-Title und Meta-Description: `content/tools/kundenweg.md`. Keyword «Kundenweg» in der H1 («Kundenweg-Mapper für Schweizer KMU»), im ersten Absatz von «Warum das wichtig ist», insgesamt 3 bis 5 Mal.
- Erklärtext, Beispiel (Malerei Keller, Gossau, mit den Zahlen aus `logic.test.ts`), FAQ und Alperna-Satz (Baustein Google Business Profil, `beweis: @baustein`): `content/tools/kundenweg.md`.
- Keine Zahl ohne Herkunft: Zahlen im Seitentext stammen aus dem Beispiel (fiktiv, mit dem Werkzeug gerechnet) oder sind Richtwerte von Alperna, keine Statistik.

## Tests
`tools/kundenweg/logic.test.ts`: Phasen und Berührungspunkte (feste Listen, Namen für KMU und Verein), Lückenstufen je Kombination (kein Punkt, Inhalt «Nein», «Teilweise», «Ja», ungewählt), fehlende Frage, Hinweise, Vorschläge je Phase und Vereinsvariante, Werkzeug-Slugs gegen `tools/index.ts`, Priorität (rot vor gelb, frühere Phase zuerst), Gesamtaussage mit 0 bis 6 abgedeckten Phasen, Vorbelegung aus `kanaele`, `validate`, `toDocument` (Blöcke, Tabellen, Querformat), `eingabeText`, Sperrliste (`brandHits`, kein «Customer Journey», kein «Touchpoint») über alle erzeugten Texte, `parseState` bei kaputten Daten, Konfiguration. `lib/export/export.test.ts`: PDF quer. `tools/kundenweg/Tool.test.tsx`: Beschriftungen, Vorschlag aus dem Profil, Fehlermeldung, Ergebnis mit Karten und Lückenliste, CRM-Aufruf, «Später», Neuladen ohne zweiten CRM-Eintrag, «Angaben ändern», Vereinsvariante.

## Nicht Teil dieses Tools
- Keine KI und kein Abruf von Daten: Das Werkzeug wertet nur deine Angaben aus.
- Keine Branchenwerte, keine Dauer und keine Quoten für den Weg: Es gibt keine belastbare Statistik dafür.
- Kein Weg pro Angebot: Wer mehrere Angebote mit verschiedener Kundschaft hat, startet das Werkzeug neu («Neu beginnen»); ein Hinweis im Dokument sagt es.
- Kein Word im Querformat: Word nutzt die Standardseite von `lib/export/docx.ts`.
- Keine Verbindung zu Messwerkzeugen und kein Eintrag ins Profil.
