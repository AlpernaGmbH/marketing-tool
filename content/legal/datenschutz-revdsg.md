---
titel: "Datenschutzerklärung nach revDSG: Module für den Generator"
stand: 2026-10-05
quelle: "nDSG (SR 235.1) Art. 6, 8, 9, 16, 17, 19, 25, 28, 32 und 60, abgerufen auf fedlex.admin.ch am 05.10.2026; Datenschutzerklärung der Alperna GmbH für alperna.ch (alperna.ch/datenschutz, abgerufen am 05.10.2026), von Alperna verfasst: die Module grundlagen, logfiles, hosting, cookies-notwendig, analytics-ga4, kontakt, social-links, auftragsbearbeiter, weitergabe, datensicherheit, rechte, automatisiert, kinder und aenderungen sind daraus abgeleitet; EDÖB-Mitteilung zum Swiss-U.S. Data Privacy Framework (edoeb.admin.ch, August 2024)."
status: entwurf
geprueft: nein
geprueft_von: ""
geprueft_am: ""
---

# Datenschutzerklärung: Module

**ENTWURF, NICHT GEPRÜFT.** Vorschlag von Claude Code zur Prüfung durch eine Fachperson. Nichts davon darf in einem Werkzeug erscheinen, bevor `geprueft: ja` im Kopf steht (CLAUDE.md, Harte Regel 8). Zeilen mit `PRÜFEN:` sind Fragen an die prüfende Person und werden vor der Freigabe gelöscht. Die Module sind in Sie-Form geschrieben, weil die Erklärung auf alperna.ch es auch ist.

PRÜFEN: Soll der Generator zusätzlich eine Du-Variante anbieten (viele Schweizer KMU duzen auf der Website)? Dann müssten alle Module doppelt vorliegen.

## Was das Gesetz mindestens verlangt (Grundlage für den Hinweis im Werkzeug)

- Der Verantwortliche informiert die betroffene Person angemessen über die Beschaffung von Personendaten und teilt mindestens mit: Identität und Kontaktdaten des Verantwortlichen, den Bearbeitungszweck und gegebenenfalls die Empfänger oder Kategorien von Empfängern (nDSG Art. 19 Abs. 1 und 2).
- Werden die Daten ins Ausland bekanntgegeben, nennt er auch den Staat oder das internationale Organ und gegebenenfalls die Garantien oder die angewandte Ausnahme (nDSG Art. 19 Abs. 4; Garantien Art. 16 Abs. 2; Ausnahmen Art. 17).
- Wer die betroffene Person vorsätzlich nicht informiert oder ihr die Angaben nach Art. 19 Abs. 2 nicht liefert, wird auf Antrag mit Busse bis 250'000 Franken bestraft (nDSG Art. 60 Abs. 1 lit. b).
- Die Bearbeitung muss rechtmässig, nach Treu und Glauben und verhältnismässig sein; der Zweck muss erkennbar sein; Daten werden vernichtet oder anonymisiert, sobald sie nicht mehr nötig sind (nDSG Art. 6).
- Private Verantwortliche können eine Datenschutzberaterin oder einen Datenschutzberater ernennen (nDSG Art. 10 Abs. 1); eine Pflicht dazu besteht nach dem Gesetzestext nicht.
- Die Auskunft ist kostenlos und wird in der Regel innert 30 Tagen erteilt (nDSG Art. 25 Abs. 6 und 7).

## Felder und Auswahl

Die Person gibt an (alle Angaben bleiben im Browser):

| id | Bezeichnung | Art |
|---|---|---|
| firma, strasse, plz, ort, email, uid | Verantwortliche Stelle | Text (aus dem Profil, wenn vorhanden) |
| kontaktperson | Ansprechperson für Datenschutzfragen | Text, kann |
| berater | Datenschutzberaterin oder -berater ernannt | ja / nein; bei ja: Name und Kontakt |
| website | Adresse der Website | Text |
| hoster, hoster_adresse, hoster_land | Hosting-Anbieter | Text (Voreinstellungen für gängige Anbieter nur mit Quelle) |
| log_dauer | Aufbewahrung der Server-Logs | Zahl in Tagen; Voreinstellung 30 (so bei Alperna) |
| analytics | keine / Umami / Plausible / Matomo / Google Analytics 4 | Auswahl |
| formular | Kontaktformular vorhanden | ja / nein |
| newsletter | Newsletter-Tool im Einsatz | ja / nein; Anbieter, Land, Double-Opt-in ja / nein |
| social | keine / nur Links / eingebettete Inhalte oder Plugins | Auswahl; Plattformen ankreuzen |
| buchung | Buchungstool im Einsatz | ja / nein; Anbieter, Land |
| shop | Online-Shop mit Bezahlung | ja / nein; Shop-Anbieter, Zahlungsanbieter, Land |
| ausland | Dienste mit Servern im Ausland | wird aus den Angaben oben abgeleitet |
| eu | Kundschaft in der EU | ja / nein; schaltet das Modul `dsgvo` zu |

PRÜFEN: Fehlt etwas Wichtiges in der Auswahl (zum Beispiel Karten, Videos, Schriften von Google Fonts, Bewerbungen, Chat)? Je mehr Dienste, desto grösser das Risiko einer unvollständigen Erklärung. Das Werkzeug soll darauf hinweisen, dass die Person alle ihre Dienste angeben muss.

## Reihenfolge der Module

1. kopf · 2. geltungsbereich · 3. grundlagen · 4. logfiles · 5. hosting · 6. cookies-notwendig · 7. analytics-… (je nach Auswahl) · 8. kontakt (wenn formular) · 9. newsletter · 10. social-… · 11. buchung · 12. shop · 13. auftragsbearbeiter · 14. weitergabe · 15. auslandtransfer (wenn ausland) · 16. datensicherheit · 17. rechte · 18. automatisiert · 19. kinder · 20. dsgvo (wenn eu) · 21. aenderungen · 22. stand

## Module

### Baustein kopf

Gilt wenn: immer

```text
Datenschutzerklärung für {{website}}

1. Verantwortliche Stelle

Verantwortlich für die Bearbeitung von Personendaten auf dieser Website ist:

{{firma}}
{{strasse}}
{{plz}} {{ort}}
Schweiz
?uid UID: {{uid}}
E-Mail: {{email}}
?kontaktperson Ansprechperson für Datenschutzfragen: {{kontaktperson}}, erreichbar über die oben genannte E-Mail-Adresse.
```

### Baustein kopf-berater-nein

Gilt wenn: berater = nein

```text
Wir haben keinen Datenschutzberater ernannt.
```

PRÜFEN: Alperna schreibt auf alperna.ch zusätzlich «Nach Schweizer Recht besteht dazu für Unternehmen unserer Grösse keine Pflicht.» Nach dem Gesetzestext (nDSG Art. 10 Abs. 1: «können … ernennen») ist die Ernennung freiwillig. Der Zusatz «für Unternehmen unserer Grösse» ist eine Aussage, die ich nicht belegen kann; ich lasse ihn im Baustein weg. Soll er im Generator stehen?

### Baustein kopf-berater-ja

Gilt wenn: berater = ja

```text
Datenschutzberaterin oder Datenschutzberater: {{berater_name}}, erreichbar unter {{berater_kontakt}}.
```

### Baustein geltungsbereich

Gilt wenn: immer

```text
2. Geltungsbereich

Diese Datenschutzerklärung gilt für die Website {{website}}. Sie richtet sich an alle Personen, die diese Website nutzen.
```

### Baustein grundlagen

Gilt wenn: immer

```text
3. Grundlagen

Wir bearbeiten Personendaten nach dem Schweizer Bundesgesetz über den Datenschutz (DSG) und der zugehörigen Verordnung. Wir bearbeiten nur Daten, die wir für den Betrieb der Website und für die Anbahnung oder Abwicklung einer Geschäftsbeziehung benötigen.
```

### Baustein logfiles

Gilt wenn: immer

```text
4. Welche Daten wir beim Besuch der Website bearbeiten

Beim Aufruf unserer Website werden automatisch technische Daten an den Server unseres Hosting-Anbieters übermittelt und dort in Logdateien gespeichert. Das sind insbesondere:

– IP-Adresse des anfragenden Geräts
– Datum und Uhrzeit des Zugriffs
– aufgerufene Seite oder Datei
– Referrer, also die zuvor besuchte Seite
– verwendeter Browser und dessen Version
– Betriebssystem
– übertragene Datenmenge

Diese Daten fallen technisch zwingend an. Ohne sie kann die Website nicht ausgeliefert werden. Wir nutzen sie ausschliesslich, um den Betrieb sicherzustellen, Störungen zu erkennen und Missbrauch abzuwehren. Eine Zusammenführung mit anderen Datenquellen findet nicht statt.

Die Speicherdauer beträgt in der Regel {{log_dauer}} Tage. Danach werden die Daten gelöscht oder anonymisiert. Bei einem sicherheitsrelevanten Vorfall können einzelne Datensätze länger aufbewahrt werden, bis der Vorfall geklärt ist.
```

PRÜFEN: Der Baustein sagt «Eine Zusammenführung mit anderen Datenquellen findet nicht statt» und «gelöscht oder anonymisiert». Das ist bei Alperna so formuliert; es stimmt nur, wenn der Hoster das so handhabt. Soll der Generator die Person bestätigen lassen («Mein Hoster löscht Logs nach … Tagen»)?

### Baustein hosting

Gilt wenn: immer

```text
5. Hosting

Unsere Website wird von {{hoster}}, {{hoster_adresse}}, gehostet und bereitgestellt.
```

### Baustein cookies-notwendig

Gilt wenn: immer

```text
6. Cookies und vergleichbare Technologien

Unsere Website setzt Cookies ein, die für den technischen Betrieb notwendig sind. Dazu gehören Cookies, die von der Hosting-Plattform gesetzt werden, um die Seite korrekt darzustellen, die Sitzung zu verwalten und die Sicherheit zu gewährleisten.

Sie können Cookies in Ihrem Browser jederzeit blockieren oder löschen. In diesem Fall kann es sein, dass einzelne Funktionen der Website nicht mehr richtig arbeiten.
```

PRÜFEN: Alperna schreibt «Nach Schweizer Recht ist für technisch notwendige Cookies und für eine Reichweitenmessung ohne Werbezweck keine ausdrückliche Einwilligung erforderlich.» Das ist eine Rechtsaussage zu Cookies (Fernmeldegesetz, nicht nDSG). Ich habe sie nicht geprüft und nehme sie nicht auf. Soll sie in den Generator?

### Baustein analytics-keine

Gilt wenn: analytics = keine

```text
7. Reichweitenmessung

Wir setzen keine Dienste zur Reichweitenmessung oder Analyse ein.
```

### Baustein analytics-umami

Gilt wenn: analytics = Umami

```text
7. Reichweitenmessung

Wir nutzen Umami, einen Dienst zur statistischen Auswertung der Website-Nutzung. Erhoben werden aggregierte Werte wie aufgerufene Seiten, ungefähre Herkunft, verwendetes Gerät und Referrer. Umami arbeitet nach Angaben des Anbieters ohne Cookies. Betrieben wird der Dienst {{analytics_betrieb}}.

Zweck ist die Verbesserung unserer Website. Wir wollen wissen, welche Inhalte gelesen werden und wo Besucherinnen und Besucher abspringen.
```

PRÜFEN: Die Aussagen über Umami («ohne Cookies», welche Werte erhoben werden, ob IP-Adressen gespeichert werden) stammen aus meinem Wissen über das Produkt und sind nicht geprüft [Vermutung]. Bitte gegen die Dokumentation von Umami prüfen. `{{analytics_betrieb}}` ist «auf unserem eigenen Server» oder «von Umami Software, Inc., USA» (Feld zur Auswahl).

### Baustein analytics-plausible

Gilt wenn: analytics = Plausible

```text
7. Reichweitenmessung

Wir nutzen Plausible Analytics, einen Dienst zur statistischen Auswertung der Website-Nutzung. Erhoben werden aggregierte Werte wie aufgerufene Seiten, ungefähre Herkunft, verwendetes Gerät und Referrer. Plausible arbeitet nach Angaben des Anbieters ohne Cookies. Betrieben wird der Dienst {{analytics_betrieb}}.

Zweck ist die Verbesserung unserer Website.
```

PRÜFEN: Wie bei Umami: Angaben zum Produkt nicht geprüft [Vermutung].

### Baustein analytics-matomo

Gilt wenn: analytics = Matomo

```text
7. Reichweitenmessung

Wir nutzen Matomo, einen Dienst zur statistischen Auswertung der Website-Nutzung. Erhoben werden unter anderem aufgerufene Seiten, Verweildauer, ungefähre Herkunft, Gerätetyp und Referrer. Matomo kann Cookies setzen; ob und welche, hängt von unserer Einstellung ab: {{analytics_cookies}}. Betrieben wird der Dienst {{analytics_betrieb}}.

Zweck ist die Verbesserung unserer Website.
```

PRÜFEN: Wie bei Umami: Angaben zum Produkt nicht geprüft [Vermutung]. `{{analytics_cookies}}` wählt die Person («Wir setzen keine Cookies» oder «Matomo setzt Cookies, um wiederkehrende Besuche zu erkennen»).

### Baustein analytics-ga4

Gilt wenn: analytics = Google Analytics 4

```text
7. Reichweitenmessung

Wir setzen Google Analytics 4 ein, einen Dienst der Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Google Analytics verwendet Cookies und ähnliche Technologien, um die Nutzung der Website auszuwerten. Erhoben werden unter anderem aufgerufene Seiten, Verweildauer, ungefähre Herkunft, Gerätetyp und Referrer.

Die IP-Adresse wird von Google gekürzt und nicht dauerhaft gespeichert. Eine Zusammenführung mit anderen Google-Daten findet durch uns nicht statt. Daten können dabei an Server von Google in den Vereinigten Staaten übermittelt werden. Google stützt diese Übermittlung auf die Standardvertragsklauseln der Europäischen Kommission.

Sie können die Erfassung durch Google Analytics verhindern, indem Sie das von Google bereitgestellte Browser-Add-on installieren, erhältlich unter tools.google.com/dlpage/gaoptout.

Weitere Informationen: policies.google.com/privacy
```

PRÜFEN: Der Text stammt von alperna.ch. Reicht er, wenn Google Analytics mit Einwilligungsabfrage (Cookie-Banner) betrieben wird? Gilt «Standardvertragsklauseln» noch, oder ist bei Google das Swiss-U.S. Data Privacy Framework massgebend (sofern Google zertifiziert ist)? Ich habe die Zertifizierung nicht geprüft.

### Baustein kontakt

Gilt wenn: formular = ja (sonst nur E-Mail: Text ohne den Satz zum Formular)

```text
8. Kontaktaufnahme

Wenn Sie uns über das Kontaktformular oder per E-Mail schreiben, bearbeiten wir die Angaben, die Sie uns dabei mitteilen, also insbesondere Ihren Namen, Ihre E-Mail-Adresse und den Inhalt Ihrer Nachricht.

Wir nutzen diese Daten ausschliesslich, um Ihre Anfrage zu beantworten und eine mögliche Zusammenarbeit anzubahnen. Anfragen, aus denen keine Geschäftsbeziehung entsteht, löschen wir spätestens {{kontakt_dauer}} nach dem letzten Kontakt, sofern keine gesetzliche Aufbewahrungspflicht besteht.

Bitte beachten Sie, dass eine unverschlüsselte E-Mail keine vollständige Vertraulichkeit bietet. Für besonders sensible Angaben empfehlen wir einen anderen Weg.
```

PRÜFEN: Alperna nennt zwölf Monate. Der Generator braucht ein Feld `kontakt_dauer` (Voreinstellung «zwölf Monate»); ist ein Vorschlag sinnvoll, oder muss die Person selbst entscheiden?

### Baustein newsletter

Gilt wenn: newsletter = ja

```text
9. Newsletter

Wenn Sie unseren Newsletter abonnieren, bearbeiten wir Ihre E-Mail-Adresse und die Angaben, die Sie bei der Anmeldung machen. Wir verwenden sie nur, um Ihnen den Newsletter zuzustellen. Für den Versand setzen wir {{newsletter_anbieter}} ({{newsletter_land}}) ein.
?doi Die Anmeldung bestätigen Sie in einer E-Mail (Double-Opt-in).
Sie können sich jederzeit mit einem Klick am Ende jeder Ausgabe abmelden.
```

PRÜFEN: Fehlen Angaben zur Auswertung (Öffnungs- und Klickraten)? Das hängt vom Anbieter ab und die Person muss es angeben.

### Baustein social-links

Gilt wenn: social = nur Links

```text
10. Soziale Netzwerke

Auf unserer Website verlinken wir mit einfachen Links auf unsere Profile auf {{plattformen}}. Es sind keine Social-Media-Plugins, Buttons oder Feeds eingebunden. Ein Datentransfer an diese Anbieter findet erst statt, wenn Sie einen Link aktiv anklicken und die jeweilige Plattform aufrufen. Sobald Sie unser Profil auf einer dieser Plattformen besuchen, bearbeitet der jeweilige Anbieter Ihre Daten in eigener Verantwortung.
```

### Baustein social-eingebettet

Gilt wenn: social = eingebettete Inhalte oder Plugins

```text
10. Soziale Netzwerke

Auf unserer Website sind Inhalte oder Plugins von {{plattformen}} eingebunden. Beim Aufruf einer Seite mit solchen Inhalten wird Ihre IP-Adresse an den jeweiligen Anbieter übermittelt, damit der Inhalt ausgeliefert werden kann. Der Anbieter bearbeitet Ihre Daten in eigener Verantwortung und kann Nutzungsprofile erstellen.
```

PRÜFEN: Die Aussage «kann Nutzungsprofile erstellen» ist von Alperna übernommen (alperna.ch, Abschnitt 11, dort für die Profile auf den Plattformen). Passt sie auch für eingebettete Inhalte?

### Baustein buchung

Gilt wenn: buchung = ja

```text
11. Terminbuchung

Für die Buchung von Terminen setzen wir {{buchung_anbieter}} ({{buchung_land}}) ein. Wenn Sie einen Termin buchen, bearbeiten wir Ihren Namen, Ihre E-Mail-Adresse und die Angaben, die Sie bei der Buchung machen. Wir verwenden sie, um den Termin zu bestätigen und durchzuführen.
```

### Baustein shop

Gilt wenn: shop = ja

```text
12. Bestellungen und Zahlung

Wenn Sie in unserem Online-Shop bestellen, bearbeiten wir Ihre Kontakt-, Liefer- und Rechnungsangaben und die Bestelldaten, um die Bestellung abzuwickeln. Für die Zahlung setzen wir {{zahlung_anbieter}} ({{zahlung_land}}) ein. Geschäftsunterlagen und Buchhaltungsbelege bewahren wir gemäss Artikel 958f des Obligationenrechts während zehn Jahren auf.
```

PRÜFEN: Die Aufbewahrung von zehn Jahren nach Art. 958f OR stammt von alperna.ch (Abschnitt 13). Ich habe den Artikel nicht abgerufen.

### Baustein auftragsbearbeiter

Gilt wenn: mindestens ein Dienst setzt Dritte ein (immer, wenn Hosting, Newsletter, Buchung, Shop oder Analytics gewählt ist)

```text
13. Dienstleister

Für den Betrieb der Website und unserer Angebote setzen wir sorgfältig ausgewählte Dienstleister ein, die Daten in unserem Auftrag bearbeiten. Sie sind vertraglich zur Vertraulichkeit und zur Einhaltung des Datenschutzes verpflichtet. Dazu gehören: {{dienstleister_liste}}. Auf Anfrage nennen wir Ihnen die konkret eingesetzten Dienstleister.
```

PRÜFEN: nDSG Art. 9 verlangt, dass sich der Verantwortliche vergewissert, dass der Auftragsbearbeiter die Datensicherheit gewährleisten kann, und dass die Bearbeitung nur so erfolgt, wie er sie selbst vornehmen dürfte. Der Satz «sind vertraglich verpflichtet» stimmt nur, wenn die Person einen Vertrag oder die allgemeinen Bedingungen des Anbieters hat. Soll der Generator die Person bestätigen lassen?

### Baustein weitergabe

Gilt wenn: immer

```text
14. Weitergabe an Dritte

Wir verkaufen keine Personendaten und geben sie nicht zu Werbezwecken an Dritte weiter. Eine Weitergabe erfolgt nur, wenn dies für die Erbringung unserer Leistungen nötig ist, wenn Sie eingewilligt haben oder wenn wir gesetzlich oder behördlich dazu verpflichtet sind.
```

### Baustein auslandtransfer

Gilt wenn: ausland = ja

```text
15. Bekanntgabe ins Ausland

Einzelne unserer Dienstleister bearbeiten Daten auf Servern im Ausland, unter anderem in {{laender}}. Eine Bekanntgabe ins Ausland erfolgt nur, wenn der Staat einen angemessenen Datenschutz gewährleistet oder ein geeigneter Datenschutz auf andere Weise sichergestellt ist, zum Beispiel durch Standardvertragsklauseln oder, bei den Vereinigten Staaten, durch die Zertifizierung des Empfängers unter dem Swiss-U.S. Data Privacy Framework.
```

PRÜFEN: Das Gesetz kennt als Voraussetzungen einen Beschluss des Bundesrates über den angemessenen Schutz (nDSG Art. 16 Abs. 1), geeignete Garantien (Art. 16 Abs. 2, zum Beispiel vom EDÖB anerkannte Standarddatenschutzklauseln) und Ausnahmen (Art. 17). Der Bundesrat hat am 14. August 2024 die USA für zertifizierte Unternehmen auf die Liste der Staaten mit angemessenem Datenschutz gesetzt, in Kraft seit 15. September 2024 (EDÖB-Mitteilung). Passt der Text so? Muss der Generator je Dienst abfragen, ob der Anbieter zertifiziert ist? Das habe ich für keinen Anbieter geprüft.

### Baustein datensicherheit

Gilt wenn: immer

```text
16. Datensicherheit

Wir treffen angemessene technische und organisatorische Massnahmen, um Ihre Daten gegen Verlust, Missbrauch und unbefugten Zugriff zu schützen. Die Website wird über eine verschlüsselte Verbindung ausgeliefert, erkennbar am https in der Adresszeile. Der Zugang zu Systemen mit Personendaten ist auf die Personen beschränkt, die ihn für ihre Arbeit brauchen. Ein vollständiger Schutz bei der Übertragung von Daten über das Internet ist technisch nicht möglich.
```

PRÜFEN: Alperna ergänzt «und ist mit Zwei-Faktor-Authentifizierung gesichert, wo dies möglich ist». Das ist eine Tatsachenbehauptung über Alperna und gehört nicht in ein allgemeines Modul; ich habe sie entfernt. Nur aufnehmen, wenn die Person sie bestätigt.

### Baustein rechte

Gilt wenn: immer

```text
17. Ihre Rechte

Im Rahmen des anwendbaren Datenschutzrechts haben Sie folgende Rechte:

– Auskunft darüber, ob und welche Daten wir über Sie bearbeiten
– Berichtigung unrichtiger Daten
– Löschung von Daten, sofern keine gesetzliche Aufbewahrungspflicht entgegensteht
– Einschränkung oder Verbot einer bestimmten Bearbeitung
– Herausgabe oder Übertragung Ihrer Daten in einem gängigen elektronischen Format
– Widerruf einer erteilten Einwilligung, mit Wirkung für die Zukunft

Wenden Sie sich dafür an {{email}}. Die Auskunft ist kostenlos und wird in der Regel innerhalb von 30 Tagen erteilt. Zur Sicherheit können wir einen Identitätsnachweis verlangen, damit keine Daten an eine unberechtigte Person gelangen.

Sie haben ausserdem das Recht, sich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB), Feldeggweg 1, 3003 Bern, zu beschweren.
```

PRÜFEN: Die Liste folgt nDSG Art. 25 (Auskunft; kostenlos, in der Regel 30 Tage), Art. 28 (Herausgabe oder Übertragung) und Art. 32 (Berichtigung; Verbot einer Bearbeitung; Löschung). Ein «Widerspruchsrecht» wie in der DSGVO kennt das nDSG nicht ausdrücklich; Alperna nennt es auf alperna.ch und ich habe es durch «Einschränkung oder Verbot einer bestimmten Bearbeitung» ersetzt. Stimmt das? Die Adresse des EDÖB stammt von alperna.ch und ist nicht von mir geprüft.

### Baustein automatisiert

Gilt wenn: immer

```text
18. Keine automatisierte Einzelentscheidung

Wir setzen keine automatisierte Einzelentscheidung und kein Profiling ein, die für Sie rechtliche Folgen hätten oder Sie erheblich beeinträchtigen würden.
```

PRÜFEN: Die Aussage gilt nur, wenn die Person keinen Dienst mit automatischer Entscheidung einsetzt (nDSG Art. 21). Der Generator soll sie nur zeigen, wenn die Person bestätigt.

### Baustein kinder

Gilt wenn: Person wählt «Angebot richtet sich nicht an Kinder»

```text
19. Daten von Kindern

Unser Angebot richtet sich an Unternehmen und Organisationen und nicht an Kinder. Wir erheben wissentlich keine Daten von Personen unter 16 Jahren.
```

PRÜFEN: Die Altersgrenze 16 stammt von alperna.ch. Im Schweizer Recht gibt es keine feste Altersgrenze für die Einwilligung; sie hängt von der Urteilsfähigkeit ab. Soll die Grenze im Generator ein Feld sein?

### Baustein dsgvo

Gilt wenn: eu = ja

```text
20. Europäische Datenschutz-Grundverordnung

Richtet sich unser Angebot auch an Personen in der Europäischen Union oder ist die Datenschutz-Grundverordnung (DSGVO) im Einzelfall anwendbar, halten wir uns auch an deren Vorgaben. Als Rechtsgrundlage stützen wir uns auf Ihre Einwilligung, auf die Anbahnung und Erfüllung eines Vertrags und auf unser berechtigtes Interesse am sicheren und funktionierenden Betrieb der Website. Zusätzlich steht Ihnen der Weg zu einer europäischen Aufsichtsbehörde offen.
```

PRÜFEN: Ob die DSGVO anwendbar ist (Marktortprinzip, Art. 3 DSGVO) und ob ein Vertreter in der EU benannt werden muss (Art. 27 DSGVO), habe ich nicht geprüft. Der Generator darf nicht behaupten, die Erklärung genüge für die DSGVO. Wie soll der Hinweis im Werkzeug lauten? Ich schlage vor: «Das Zuschalten dieses Moduls ersetzt keine Prüfung, ob die DSGVO für dich gilt.»

### Baustein aenderungen

Gilt wenn: immer

```text
21. Änderungen

Wir können diese Datenschutzerklärung anpassen, wenn sich unsere Website, unsere Dienste oder die rechtlichen Vorgaben ändern. Es gilt jeweils die auf {{website}} veröffentlichte Fassung.
```

### Baustein stand

Gilt wenn: immer

```text
Stand: {{stand_datum}}
```

## Baustein hinweis (Text für die Hinweisbox des Werkzeugs, `LegalDisclaimer`)

```text
Dieses Werkzeug setzt deine Datenschutzerklärung aus Bausteinen zusammen, nach deinen Angaben. Es ist keine Rechtsberatung. Die Erklärung ist nur vollständig, wenn du alle Dienste angibst, die auf deiner Website Daten bearbeiten. Prüfe den Text vor der Veröffentlichung. Das Gesetz verlangt, dass du betroffene Personen über Verantwortliche, Zweck und Empfänger informierst (Datenschutzgesetz Art. 19).
```
