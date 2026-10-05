import type { MedienInput, MedienOutput } from "./generator";
import type { Kontakt } from "./logic";

// Beispiel «Malerei Keller, Gossau» (fiktiv, von Hand geschrieben, keine Ausgabe der KI). Dient den Tests als Entwurf,
// der alle Regeln von checkMitteilung und checkDraft erfüllt, und dem Seitentext als Vorlage für den gekürzten Auszug.
// Die Zahlen sind Angaben der fiktiven Firma.

export const BEISPIEL_INPUT: MedienInput = {
  betrieb: "Malerei Keller",
  ort: "Gossau",
  kanton: "St. Gallen",
  website: "malerei-keller.ch",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  anlass: "jubilaeum",
  was: "Die Malerei Keller feiert ihr 40-jähriges Bestehen mit einem Tag der offenen Tür in der Werkstatt. Es gibt Führungen, eine Farbberatung für Fassaden und Innenräume, eine Ausstellung mit alten Werkzeugen und Kaffee und Kuchen. Die Lernenden zeigen, wie man eine Wand streicht.",
  wann: "Samstag, 14. November 2026, 10 bis 16 Uhr",
  wo: "Werkstatt der Malerei Keller, Gossau",
  wer: "Anna Keller, Inhaberin, und das Team von zwölf Malerinnen und Malern, dazu die drei Lernenden.",
  warum:
    "Der Betrieb bildet seit Jahren Lernende aus Gossau und Umgebung aus, streicht Häuser im Fürstenland und im Appenzellerland und ist bei Vereinen und Schulen in der Gemeinde bekannt.",
  zitat: "Wir wollen den Leuten zeigen, wie wir arbeiten, und uns bei der Kundschaft bedanken.",
  zitatVon: "Anna Keller, Inhaberin",
  bild: "Fotos der Werkstatt und des Teams, aufgenommen von Lea Meier, auf Anfrage in Druckqualität.",
};

export const BEISPIEL_OUTPUT: MedienOutput = {
  titel: "Malerei Keller feiert 40 Jahre mit einem Tag der offenen Tür",
  lead: "Die Malerei Keller in Gossau feiert ihr 40-jähriges Bestehen und lädt am Samstag, 14. November 2026, von 10 bis 16 Uhr zum Tag der offenen Tür in die Werkstatt ein.",
  text: [
    "Am Tag der offenen Tür führt das Team von zwölf Malerinnen und Malern durch die Werkstatt in Gossau. Besucherinnen und Besucher lassen sich zur Farbwahl für Fassaden und Innenräume beraten und sehen eine Ausstellung mit alten Werkzeugen. Für Kaffee und Kuchen ist gesorgt.",
    "Die drei Lernenden des Betriebs zeigen, wie man eine Wand streicht. Wer möchte, kann ihnen bei der Arbeit zusehen und Fragen stellen. Die Führungen durch die Werkstatt zeigen, wie die Malerinnen und Maler im Alltag arbeiten.",
    "Die Malerei Keller bildet seit Jahren Lernende aus Gossau und Umgebung aus. Sie streicht Häuser im Fürstenland und im Appenzellerland und ist bei Vereinen und Schulen in der Gemeinde bekannt. Mit dem Anlass bedankt sich der Betrieb bei seiner Kundschaft und lädt alle Interessierten aus der Region ein, das Handwerk aus der Nähe zu sehen. Das Jubiläum ist für den Betrieb ein Anlass, Kundschaft, Vereinen und Schulen in der Gemeinde zu danken.",
    "Inhaberin Anna Keller leitet den Betrieb gemeinsam mit ihrem Team. Der Tag der offenen Tür findet am Samstag, 14. November 2026, in der Werkstatt in Gossau im Kanton St. Gallen statt. Gäste aus Gossau und Umgebung sind von 10 bis 16 Uhr willkommen, die Werkstatt ist während dieser Zeit für alle offen.",
  ],
  zitat: "Wir wollen den Leuten zeigen, wie wir arbeiten, und uns bei der Kundschaft bedanken.",
  boilerplate:
    "Malerei Keller ist ein Malerbetrieb in Gossau im Kanton St. Gallen. Er streicht Fassaden und renoviert Innenräume für Privatkundschaft, Vereine und Schulen in der Region. Das Team besteht aus zwölf Malerinnen und Malern und drei Lernenden. Mehr Informationen gibt es unter malerei-keller.ch.",
  bildzeile: "Fotos der Werkstatt und des Teams, aufgenommen von Lea Meier, stehen auf Anfrage in Druckqualität zur Verfügung.",
};

export const BEISPIEL_KONTAKT: Kontakt = { name: "Anna Keller, Inhaberin", telefon: "071 000 00 00", email: "anna@malerei-keller.example" };
