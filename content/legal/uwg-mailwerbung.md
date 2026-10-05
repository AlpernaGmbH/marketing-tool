---
titel: "E-Mail-Werbung: Entscheidungsbaum, Checkliste und Abmeldehinweis"
stand: 2026-10-05
quelle: "UWG (SR 241) Art. 3 Abs. 1 lit. o, u, v und Art. 23, abgerufen auf fedlex.admin.ch am 05.10.2026 (Fassung mit den Änderungen in Kraft seit 01.01.2025)"
status: entwurf
geprueft: nein
geprueft_von: ""
geprueft_am: ""
---

# E-Mail-Werbung: Entscheidungsbaum

**ENTWURF, NICHT GEPRÜFT.** Vorschlag von Claude Code zur Prüfung durch eine Fachperson. Nichts davon darf in einem Werkzeug erscheinen, bevor `geprueft: ja` im Kopf steht (CLAUDE.md, Harte Regel 8). Zeilen mit `PRÜFEN:` sind Fragen an die prüfende Person und werden vor der Freigabe gelöscht.

## Die Vorschrift (Wortlaut, UWG Art. 3 Abs. 1 lit. o)

Unlauter handelt, wer

> «Massenwerbung ohne direkten Zusammenhang mit einem angeforderten Inhalt fernmeldetechnisch sendet oder solche Sendungen veranlasst und es dabei unterlässt, vorher die Einwilligung der Kunden einzuholen, den korrekten Absender anzugeben oder auf eine problemlose und kostenlose Ablehnungsmöglichkeit hinzuweisen; wer beim Verkauf von Waren, Werken oder Leistungen Kontaktinformationen von Kunden erhält und dabei auf die Ablehnungsmöglichkeit hinweist, handelt nicht unlauter, wenn er diesen Kunden ohne deren Einwilligung Massenwerbung für eigene ähnliche Waren, Werke oder Leistungen sendet»

Vorsätzlicher unlauterer Wettbewerb nach Art. 3 wird auf Antrag mit Freiheitsstrafe bis zu drei Jahren oder Geldstrafe bestraft (UWG Art. 23 Abs. 1).

Zur Telefonwerbung (nicht Teil dieses Werkzeugs, nur zur Abgrenzung): lit. u verlangt, den Vermerk im Telefonverzeichnis (Sterneintrag) zu beachten; lit. v verlangt bei Werbeanrufen eine angezeigte Rufnummer, die im Telefonverzeichnis eingetragen ist.

PRÜFEN: Die Vorschrift gilt für «Kunden». Gilt sie nach Rechtsprechung und Lehre auch für Werbung an Unternehmen (B2B)? Ich gehe davon aus, ja [Vermutung]; das Werkzeug soll das nur sagen, wenn es stimmt.

PRÜFEN: «Massenwerbung»: Ab wann ist eine Sendung Massenwerbung? Ich kenne keine feste Zahl und nenne darum im Werkzeug keine. Wie soll der Hinweis lauten?

PRÜFEN: Gilt die Regel für alle «fernmeldetechnischen» Wege (E-Mail, SMS, Messenger, Direktnachrichten in sozialen Netzen)? Im Werkzeug steht bisher «E-Mail, SMS und Messenger»; bitte bestätigen oder kürzen.

## Entscheidungsbaum

Jede Frage hat die Antworten `ja`, `nein` und `weiss nicht`. «weiss nicht» führt immer zu Gelb, ausser der Baum sagt etwas anderes.

| id | Frage | ja | nein |
|---|---|---|---|
| f1 | Willst du dieselbe werbende Nachricht an mehrere Empfängerinnen und Empfänger senden (E-Mail, SMS, Messenger)? | f2 | ende-keine-massenwerbung |
| f2 | Wurde der Inhalt von der Empfängerin oder dem Empfänger angefordert (zum Beispiel eine Offerte, die jemand bestellt hat, oder ein Newsletter, den jemand abonniert hat)? | ende-angefordert | f3 |
| f3 | Hat die Empfängerin oder der Empfänger vorher eingewilligt, Werbung von dir zu erhalten? | f5 | f4 |
| f4 | Hast du die Adresse beim Verkauf einer Ware oder Leistung an diese Person erhalten, dabei auf die Ablehnungsmöglichkeit hingewiesen, und wirbst du nur für eigene ähnliche Waren oder Leistungen? | f5 | ende-rot-einwilligung |
| f5 | Ist in der Nachricht der korrekte Absender angegeben (Name, Firma, Kontakt)? | f6 | ende-rot-absender |
| f6 | Steht in der Nachricht ein Hinweis auf eine problemlose und kostenlose Ablehnungsmöglichkeit (zum Beispiel Abmeldelink)? | ende-gruen | ende-rot-ablehnung |

## Ergebnisse (Ampel)

### ende-keine-massenwerbung (grün, mit Hinweis)

Ampel: grün

Begründung: Die Vorschrift erfasst Massenwerbung. Eine einzelne, persönlich verfasste Nachricht fällt nicht darunter.

Hinweis: Ob eine Sendung Massenwerbung ist, hängt vom Einzelfall ab. Schreibst du dieselbe Werbenachricht an viele, behandle sie als Massenwerbung und beantworte die Fragen weiter.

PRÜFEN: Darf das Werkzeug hier «grün» sagen, oder immer «gelb» bei «nein» auf f1?

### ende-angefordert (grün)

Ampel: grün

Begründung: Die Vorschrift gilt für Massenwerbung «ohne direkten Zusammenhang mit einem angeforderten Inhalt» (UWG Art. 3 Abs. 1 lit. o). Was die Person angefordert hat, fällt nicht darunter.

Hinweis: Das gilt nur für den angeforderten Inhalt. Wirbst du in derselben Sendung für etwas anderes, beantworte die Fragen für diesen Teil erneut.

PRÜFEN: Stimmt die Aussage «gilt nur für den angeforderten Inhalt»? Wo liegt die Grenze bei einem abonnierten Newsletter mit Werbeteil?

### ende-gruen (grün)

Ampel: grün

Begründung: Einwilligung (oder die Ausnahme für ähnliche Leistungen bei bestehender Kundenbeziehung), korrekter Absender und eine Ablehnungsmöglichkeit sind vorhanden; das sind die drei Punkte, die die Vorschrift verlangt.

Hinweis: Grün heisst: nach dem Baum erfüllt. Die Einwilligung musst du im Streitfall belegen können; halte fest, wann und wie sie erteilt wurde.

PRÜFEN: Trägt der Satz «musst du belegen können» (Beweislast)? Oder ist es nur eine Empfehlung und soll als Empfehlung stehen?

### ende-rot-einwilligung (rot)

Ampel: rot

Begründung: Ohne vorherige Einwilligung ist Massenwerbung unlauter. Die Ausnahme für bestehende Kunden greift nur, wenn du die Kontaktinformation beim Verkauf erhalten, dabei auf die Ablehnungsmöglichkeit hingewiesen hast und für eigene ähnliche Waren oder Leistungen wirbst (UWG Art. 3 Abs. 1 lit. o).

Was du tun kannst: Hole die Einwilligung ein, bevor du sendest (zum Beispiel mit einem Häkchen im Anmeldeformular, das nicht vorangekreuzt ist), oder verzichte auf die Sendung.

PRÜFEN: Der Hinweis auf das nicht vorangekreuzte Häkchen ist eine Empfehlung der Praxis, kein Gesetzestext. Soll er stehen?

### ende-rot-absender (rot)

Ampel: rot

Begründung: Die Vorschrift verlangt, den korrekten Absender anzugeben (UWG Art. 3 Abs. 1 lit. o).

Was du tun kannst: Nenne Name oder Firma und eine Kontaktmöglichkeit im Absender und im Fuss der Nachricht.

### ende-rot-ablehnung (rot)

Ampel: rot

Begründung: Die Vorschrift verlangt einen Hinweis auf eine problemlose und kostenlose Ablehnungsmöglichkeit (UWG Art. 3 Abs. 1 lit. o).

Was du tun kannst: Setze in jede Nachricht einen Abmeldelink oder einen Satz, wie man sich kostenlos abmeldet (Vorlagen unten).

### ende-gelb (gelb, wenn eine Antwort «weiss nicht» ist)

Ampel: gelb

Begründung: Eine Antwort ist offen. Ohne sie lässt sich nicht sagen, ob die Sendung zulässig ist.

Was du tun kannst: Kläre die offene Frage, bevor du sendest. Im Zweifel hole eine Einwilligung ein.

## Checkliste für den Versand

Die Punkte 1 bis 3 folgen aus dem Gesetzestext. Die Punkte 4 bis 6 sind Empfehlungen der Praxis und werden im Werkzeug so bezeichnet.

1. Die Empfängerin oder der Empfänger hat vorher eingewilligt, oder die Ausnahme für ähnliche Leistungen trifft zu. (Gesetz)
2. Der Absender ist korrekt angegeben. (Gesetz)
3. Die Nachricht weist auf eine problemlose und kostenlose Ablehnungsmöglichkeit hin. (Gesetz)
4. Du hältst fest, wann und wie die Einwilligung erteilt wurde. (Empfehlung)
5. Eine Abmeldung wird sofort umgesetzt und die Adresse nicht mehr angeschrieben. (Empfehlung)
6. Die Adressen stammen nicht aus gekauften oder gesammelten Listen ohne Einwilligung. (Empfehlung)

PRÜFEN: Bitte Punkt 6 prüfen; er folgt aus dem Grundsatz der Einwilligung, ist aber nicht wörtlich im Gesetz.

## Baustein abmeldehinweis (Vorlagen für den Fuss einer Nachricht)

Platzhalter: `{{firma}}`, `{{link}}`, `{{email}}`. Anrede-Variante `du` oder `sie` wählt die Person.

### Baustein abmeldehinweis-du

```text
Du möchtest keine weiteren Nachrichten von {{firma}}? Dann melde dich hier kostenlos ab: {{link}}
Oder antworte auf diese Nachricht mit «Abmelden».
```

### Baustein abmeldehinweis-sie

```text
Sie möchten keine weiteren Nachrichten von {{firma}} erhalten? Dann melden Sie sich hier kostenlos ab: {{link}}
Oder antworten Sie auf diese Nachricht mit «Abmelden».
```

### Baustein absender

```text
{{firma}}, {{strasse}}, {{plz}} {{ort}}, Schweiz · {{email}}
```

## Baustein hinweis (Text für die Hinweisbox des Werkzeugs, `LegalDisclaimer`)

```text
Dieser Check prüft deine Angaben gegen die Vorschrift zur Massenwerbung im Gesetz gegen den unlauteren Wettbewerb (Art. 3 Abs. 1 lit. o). Er ist keine Rechtsberatung und ersetzt keine Prüfung deines Falls. Bei Zweifeln frag eine Fachperson.
```
