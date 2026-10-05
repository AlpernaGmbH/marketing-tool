---
titel: "Datenschutzerklärung für tools.alperna.ch"
stand: 2026-10-05
quelle: "docs/DATENSCHUTZ-FAKTEN.md (Stand 04.10.2026, was die Anwendung technisch tut; jede Zeile dort nennt die Stelle im Code); nDSG (SR 235.1) Art. 6, 16, 17, 19, 25, 28, 32 und 60, abgerufen auf fedlex.admin.ch am 05.10.2026; Datenschutzerklärung der Alperna GmbH für alperna.ch (abgerufen am 05.10.2026, von Alperna verfasst: Abschnitte 1, 3, 15, 16, 17 und 19 sind daraus abgeleitet); EDÖB-Mitteilung zum Swiss-U.S. Data Privacy Framework (August 2024)."
status: entwurf
geprueft: nein
geprueft_von: ""
geprueft_am: ""
---

# Datenschutzerklärung für tools.alperna.ch

**ENTWURF, NICHT GEPRÜFT.** Vorschlag von Claude Code zur Prüfung durch eine Fachperson. Die Seite `/datenschutz` bleibt ein Platzhalter (noindex), bis `geprueft: ja` im Kopf steht (CLAUDE.md, Harte Regel 8). Zeilen mit `PRÜFEN:` sind Fragen an die prüfende Person, Zeilen mit `[OFFEN: …]` fehlende Tatsachen, die nur Alperna kennt. Beides muss vor der Freigabe verschwinden.

**Dringlichkeit:** Die Anwendung nimmt E-Mail-Adressen, Eingaben und Ergebnisse entgegen. Wer Personendaten beschafft, muss die betroffene Person informieren (nDSG Art. 19). Die vorsätzliche Unterlassung dieser Information wird auf Antrag mit Busse bis 250'000 Franken bestraft (nDSG Art. 60 Abs. 1 lit. b). Das Fenster vor dem Ergebnis verlinkt auf `/datenschutz`, die Seite ist heute leer. Die Erklärung muss vor der Bekanntmachung der Adresse stehen.

Die Tatsachen unten stammen aus `docs/DATENSCHUTZ-FAKTEN.md`. Ändert sich der Code, muss dieses Blatt und danach dieser Text nachgeführt werden.

## Text der Seite

```text
Datenschutzerklärung

Für die Website tools.alperna.ch

1. Verantwortliche Stelle

Verantwortlich für die Bearbeitung von Personendaten auf dieser Website ist:

Alperna GmbH
Röhrenbrugg 7
9042 Speicher
Schweiz
UID: CHE-132.724.195
E-Mail: kontakt@alperna.ch

Ansprechperson für Datenschutzfragen: Andrej Good, erreichbar über die oben genannte E-Mail-Adresse.

Wir haben keinen Datenschutzberater ernannt.

2. Geltungsbereich

Diese Datenschutzerklärung gilt für die Website tools.alperna.ch mit allen Werkzeugen. Für alperna.ch gilt die dortige Datenschutzerklärung.

3. Grundlagen

Wir bearbeiten Personendaten nach dem Schweizer Bundesgesetz über den Datenschutz (DSG) und der zugehörigen Verordnung. Wir bearbeiten nur Daten, die wir für den Betrieb der Website, für die Werkzeuge und für die persönliche Rückmeldung zu deinem Ergebnis brauchen.

4. Was beim Besuch der Website anfällt

Beim Aufruf der Website übermittelt dein Browser technische Daten an den Server unseres Hosting-Anbieters Vercel (Funktionen in Frankfurt, Deutschland). Dort werden sie in Protokollen gespeichert, insbesondere die IP-Adresse, Datum und Uhrzeit, die aufgerufene Seite, der Browser und das Betriebssystem. Wir nutzen sie nur, um den Betrieb sicherzustellen und Missbrauch abzuwehren. [OFFEN: Aufbewahrungsdauer der Zugriffsprotokolle bei Vercel]

Unsere eigenen Server-Funktionen protokollieren nur die Adresse der Funktion, den Statuscode und ein Stichwort. Sie protokollieren nie Inhalte, nie Klartext-IP-Adressen und nie E-Mail-Adressen.

5. Was in deinem Browser bleibt

Dein Firmenprofil, deine Zwischenstände in den Werkzeugen, deine Merkliste und der Merker deiner E-Mail-Adresse bleiben im Speicher deines Browsers (localStorage). Sie verlassen deinen Browser nicht, ausser auf den Wegen, die in den Abschnitten 6 bis 9 beschrieben sind. Auf der Seite «Mein Profil» kannst du alles exportieren und löschen.

6. E-Mail-Adresse und Ergebnis

Jedes Werkzeug läuft ohne Hürde bis zu dem Punkt, an dem das Ergebnis erscheint. Dort fragen wir nach deiner E-Mail-Adresse und nach deiner Einwilligung, dass Alperna dich zu deinem Ergebnis kontaktieren darf. Das Gleiche gilt vor jedem Download.

Wenn du die Adresse angibst, passiert Folgendes:
– Wir setzen das Cookie «mt_gate» (Abschnitt 7). Dabei speichert unser Server die Adresse nicht und gibt sie noch nicht weiter; sie liegt nur im Cookie in deinem Browser.
– Sobald ein Ergebnis angezeigt wird, senden wir es an Alperna: deine E-Mail-Adresse, den Namen des Werkzeugs, die Kategorie, den Zeitpunkt, deinen Firmennamen aus dem Firmenprofil (falls du ihn angegeben hast), deine Eingaben im Werkzeug und das Ergebnis. Eingaben und Ergebnis werden auf je 1'900 Zeichen gekürzt. Beim Textcheck und beim Text-Umschreiber geht der Text mit, den du eingefügt hast. Gib deshalb nichts Vertrauliches ein.
– Das gilt für jedes Ergebnis, auch für ein zweites.

Zweck: Alperna meldet sich persönlich zu deinem Ergebnis, wenn du eingewilligt hast, und weiss dabei, worum es ging. Wir zählen ausserdem ohne Personenbezug, wie oft ein Werkzeug ein Ergebnis zeigt.

Empfänger: Das Ergebnis geht über unsere Automatisierung (n8n) in unser Kundenverwaltungssystem (Notion) und als Benachrichtigung per E-Mail (Google Mail) an kontakt@alperna.ch. Ist die Automatisierung nicht erreichbar, legt unser Server das Ergebnis vorübergehend in einer Warteschlange ab (Abschnitt 10).

Aufbewahrung: [OFFEN: Wie lange bewahrt Alperna die Ergebnisse im Kundenverwaltungssystem auf, und wie läuft die Löschung auf Anfrage?]

Du kannst deine Einwilligung jederzeit mit einer E-Mail an kontakt@alperna.ch widerrufen und die Löschung deiner Daten verlangen.

7. Cookie «mt_gate»

Das Cookie «mt_gate» merkt sich deine E-Mail-Adresse, damit wir dich nicht bei jedem Ergebnis neu fragen müssen und der Server weiss, an welche Adresse ein Ergebnis gehört. Es ist 365 Tage gültig, kann von Skripten auf der Seite nicht gelesen werden (HttpOnly) und ist so gesichert, dass es nicht verändert werden kann. Es enthält deine E-Mail-Adresse und den Zeitpunkt. Das Cookie ist für den Dienst nötig. Wir setzen keine anderen Cookies und laden keine Skripte von Dritten. [OFFEN: Wird Umami für die Statistik eingebunden? Dann diesen Abschnitt und Abschnitt 8 ergänzen.]

Du kannst das Cookie jederzeit in deinem Browser löschen. Dann fragen wir beim nächsten Ergebnis wieder nach deiner Adresse.

8. Marketing-Check und Website lesen

Wenn du den Marketing-Check oder ein Werkzeug nutzt, das deine Website liest, ruft unser Server die von dir genannte Adresse ab (Startseite, robots.txt, sitemap.xml). Der Abruf erfolgt unter der Kennung «AlpernaCheck/1.0». Wir speichern und protokollieren den Inhalt nicht.

9. Künstliche Intelligenz

Einzelne Werkzeuge schicken Angaben an einen KI-Dienst: die Einordnung im Marketing-Check, die Generatoren (zum Beispiel Post-Generator, Medienmitteilung, Bewertungsantwort), der Text-Umschreiber und die KI-Prüfung im Textcheck. An die KI gehen nur die Angaben, die das Werkzeug nennt, zum Beispiel Betrieb, Branche, Ort, deine Eingaben, bei Website-Werkzeugen Titel, Überschriften und Text der Startseite, beim Text-Umschreiber der Text, den du einfügst. Nie gehen deine E-Mail-Adresse oder dein ganzes Firmenprofil an die KI.

Wir nutzen dafür den Vermittler OpenRouter (USA). Je nach Verfügbarkeit antwortet eines von mehreren Modellen: [OFFEN: aktuelle Liste, zum Beispiel Mistral Large von Mistral AI (Frankreich), Claude Haiku von Anthropic (USA) und ein kostenloses Modell von NVIDIA (USA)]. Bei kostenlosen Modellen dürfen die Anbieter Eingaben und Ausgaben nach den Bedingungen des Modellanbieters für das Training nutzen. Gib deshalb keine vertraulichen Angaben ein. Wir speichern weder deine Eingaben noch die Antworten der KI auf unserem Server, ausser der fertigen Einordnung im Marketing-Check, die wir 24 Stunden zwischenspeichern, damit dieselbe Website nicht mehrfach gerechnet wird.

Texte der KI können Fehler enthalten. Wir prüfen sie auf Form und Regeln, aber nicht auf inhaltliche Richtigkeit.

10. Was auf unserem Server gespeichert wird

Unser Server speichert bei Upstash (Redis) nur technische Daten:
– einen Zähler je Werkzeug, ohne Personenbezug;
– Zähler für die Tagesgrenze der KI-Einordnung je E-Mail-Adresse (als nicht umkehrbarer Hash) und insgesamt, 2 Tage;
– die fertige Einordnung im Marketing-Check, 24 Stunden;
– Zähler der Ratenbegrenzung je IP-Adresse (als nicht umkehrbarer Hash, nie die Klartext-Adresse), wenige Minuten bis Stunden;
– eine Warteschlange mit Ergebnissen im Klartext (E-Mail, Firma, Eingabe, Ausgabe), nur wenn die Automatisierung nicht erreichbar ist, bis zur Zustellung, höchstens 30 Tage nach dem letzten Eintrag. [OFFEN: Region von Upstash]

Es gibt kein Konto, kein Passwort und keine Speicherung deines Firmenprofils auf dem Server.

11. Dienstleister

Wir setzen folgende Dienstleister ein, die Daten in unserem Auftrag bearbeiten:
– Vercel (Hosting und Funktionen; Vercel Inc., USA, Funktionen in Frankfurt)
– Upstash (Zähler, Zwischenspeicher, Warteschlange)
– n8n auf einem Server bei Hostinger (Weiterleitung der Ergebnisse) [OFFEN: Standort des Servers]
– Notion (Kundenverwaltung; USA)
– Google (E-Mail für die Benachrichtigung; USA, teils EU)
– OpenRouter und die Anbieter der KI-Modelle (Abschnitt 9)

Wir verkaufen keine Personendaten und geben sie nicht zu Werbezwecken an Dritte weiter.

12. Bekanntgabe ins Ausland

Mehrere dieser Dienstleister bearbeiten Daten in den USA. Eine Bekanntgabe in die USA erfolgt, soweit der Empfänger unter dem Swiss-U.S. Data Privacy Framework zertifiziert ist (seit 15. September 2024 gilt für zertifizierte Unternehmen ein angemessener Schutz), oder auf Grundlage geeigneter Garantien wie Standardvertragsklauseln. [OFFEN: Zertifizierung bzw. Vertrag je Dienstleister]

13. Datensicherheit

Wir treffen angemessene technische und organisatorische Massnahmen, um deine Daten gegen Verlust, Missbrauch und unbefugten Zugriff zu schützen. Die Website wird über eine verschlüsselte Verbindung ausgeliefert. Ein vollständiger Schutz bei der Übertragung von Daten über das Internet ist technisch nicht möglich.

14. Deine Rechte

Im Rahmen des anwendbaren Datenschutzrechts hast du folgende Rechte:
– Auskunft darüber, ob und welche Daten wir über dich bearbeiten
– Berichtigung unrichtiger Daten
– Löschung von Daten, sofern keine gesetzliche Aufbewahrungspflicht entgegensteht
– Einschränkung oder Verbot einer bestimmten Bearbeitung
– Herausgabe oder Übertragung deiner Daten in einem gängigen elektronischen Format
– Widerruf einer erteilten Einwilligung, mit Wirkung für die Zukunft

Wende dich dafür an kontakt@alperna.ch. Die Auskunft ist kostenlos und wird in der Regel innerhalb von 30 Tagen erteilt. Zur Sicherheit können wir einen Identitätsnachweis verlangen.

Du hast ausserdem das Recht, dich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB), Feldeggweg 1, 3003 Bern, zu beschweren.

15. Keine automatisierte Einzelentscheidung

Wir setzen keine automatisierte Einzelentscheidung ein, die für dich rechtliche Folgen hätte oder dich erheblich beeinträchtigen würde. Die Auswertungen und Texte der Werkzeuge sind Hilfen für dich.

16. Daten von Kindern

Das Angebot richtet sich an Unternehmen und Organisationen und nicht an Kinder.

17. Änderungen

Wir können diese Datenschutzerklärung anpassen, wenn sich die Website, die Werkzeuge oder die rechtlichen Vorgaben ändern. Es gilt jeweils die auf tools.alperna.ch veröffentlichte Fassung.

Stand: {{datum}}
```

## Fragen an die prüfende Person

PRÜFEN: **Die Einwilligung ist Pflicht.** Das Fenster verlangt das Häkchen «Alperna darf mich zu meinem Ergebnis kontaktieren», sonst gibt es kein Ergebnis. Das Gesetz verlangt für eine Einwilligung, dass sie «freiwillig» erteilt wird (nDSG Art. 6 Abs. 6). Ist eine Einwilligung gültig, die man erteilen muss, um das Ergebnis zu sehen? Alternativen: das Häkchen freiwillig machen, oder die Bearbeitung nicht auf eine Einwilligung stützen und im Text nur informieren. Das ist die wichtigste Frage dieser Datei.

PRÜFEN: **Weitergabe des ganzen Textes.** Beim Textcheck und Text-Umschreiber geht der eingefügte Text ins Kundenverwaltungssystem (bis 1'900 Zeichen). Das können Texte Dritter sein (Kundenbewertungen, Namen). Deckt der Zweck «persönliche Rückmeldung» das? Soll der Text im Fenster und hier deutlicher darauf hinweisen?

PRÜFEN: **Cookie als «nötig».** CLAUDE.md (Regel 4) hält fest, das Cookie sei notwendig und brauche keinen Banner, «rechtlich zu bestätigen». Es trägt die E-Mail-Adresse (signiert, nicht verschlüsselt). Ist «für den Dienst nötig» richtig, oder ist das Cookie erst nach der Eingabe der Adresse nötig? Soll der Hinweis auf den Inhalt deutlicher sein?

PRÜFEN: **OpenRouter und kostenlose Modelle.** Es gibt keinen Vertrag zur Auftragsbearbeitung mit den Anbietern kostenloser Modelle [Vermutung]. Der Text sagt, dass diese Anbieter Eingaben für das Training nutzen dürfen. Genügt das als Information (Art. 19), und ist die Bekanntgabe nach Art. 16 oder 17 gedeckt?

PRÜFEN: **Abschnitt 1, letzter Satz.** «Wir haben keinen Datenschutzberater ernannt» ist eine Tatsache, die Alperna bestätigen muss. Der Zusatz von alperna.ch («Nach Schweizer Recht besteht dazu für Unternehmen unserer Grösse keine Pflicht») fehlt hier bewusst, weil ich ihn nicht belegen kann; nDSG Art. 10 Abs. 1 sagt nur, private Verantwortliche «können» eine Beraterin oder einen Berater ernennen.

PRÜFEN: **Du- oder Sie-Form.** Die Seite duzt wie die Werkzeuge (CLAUDE.md, Harte Regel 2); die Erklärung auf alperna.ch siezt.

PRÜFEN: **Abschnitt 12.** Der Hinweis auf das Swiss-U.S. Data Privacy Framework gilt nur für zertifizierte Empfänger. Ich habe keine Zertifizierung nachgeprüft. Für Notion, Google, Vercel und Upstash bitte je prüfen; für OpenRouter und die Modellanbieter ebenso.

PRÜFEN: **Abschnitt 4.** Die Angaben zu Vercel (Sitz, Aufbewahrung) stammen nicht aus den Bedingungen von Vercel. Bitte ergänzen.

PRÜFEN: **Name der Seite.** In Abschnitt 5 steht «Mein Profil» (so heisst der Link in der Kopfzeile); die Seite heisst technisch `/profil`.

[OFFEN] zusammengefasst: Aufbewahrung der Protokolle bei Vercel; Aufbewahrung im Kundenverwaltungssystem und Löschweg; aktuelle Liste der KI-Modelle; Region von Upstash; Standort des n8n-Servers; Zertifizierung oder Vertrag je Dienstleister; Umami ja oder nein.
