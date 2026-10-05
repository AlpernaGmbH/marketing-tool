import type { Kanalrolle, PlanMonat, Saeule, StrategieInput, StrategieOutput } from "./generator";

// Beispieldaten für die Tests dieses Werkzeugs (generator.test.ts, logic.test.ts, Tool.test.tsx): Malerei Keller, Gossau.
// Wird nur von Tests gelesen und gehört nicht zur Seite.

export const input: StrategieInput = {
  betrieb: "Malerei Keller",
  organisationstyp: "kmu",
  branche: "Malerei",
  ort: "Gossau",
  ziel: "anfragen",
  angebot: "Fassaden und Innenräume streichen, Farbberatung vor Ort, seit 1998 in Gossau. Fragen: Was kostet eine Fassade? Wie lange hält die Farbe?",
  besonders: "Termine werden gehalten, zwei Lehrlinge.",
  zielgruppe: "Hausbesitzer in Gossau und Umgebung",
  saeulen: [],
  kanaele: ["instagram", "google"],
  beitraegeProWoche: "2",
  positionierung: "Der Malerbetrieb in Gossau, der Termine hält.",
  tonalitaet: "Ruhig und konkret.",
};

export const mitSaeulen: StrategieInput = { ...input, saeulen: ["Fassaden vorher und nachher", "Fragen aus dem Alltag", "Team und Region"] };

export const saeule = (over: Partial<Saeule> = {}): Saeule => ({
  name: "Fassaden vorher und nachher",
  rolle: "Zeigt, was eine Fassade in Gossau braucht, und spricht Hausbesitzer an, die bald streichen wollen.",
  ...over,
});

export const saeulen = (): Saeule[] => [
  saeule(),
  saeule({ name: "Fragen aus dem Alltag", rolle: "Beantwortet die Fragen vom Telefon in Ruhe und nimmt der Kundschaft die Scheu vor der Offerte." }),
  saeule({ name: "Team und Region", rolle: "Zeigt die Menschen hinter dem Betrieb und die Baustellen im Dorf, damit der Name in Gossau bekannt bleibt." }),
];

export const kanalrollen = (): Kanalrolle[] => [
  { kanal: "Instagram", rolle: "Bilder und Kurzvideos von Baustellen, damit die Kundschaft die Arbeit sieht und den Betrieb wiedererkennt.", formate: ["Foto", "Kurzvideo"] },
  { kanal: "Google-Beitrag", rolle: "Kurze Beiträge für alle, die in Gossau nach einem Maler suchen, mit Hinweis auf die Anfrage.", formate: ["Text mit Bild"] },
];

export const plan = (): PlanMonat[] => [
  {
    monat: "Monat 1",
    schwerpunkt: "Aufbauen: Säulen festlegen und die ersten Beiträge veröffentlichen.",
    aufgaben: ["Die Säulen im Team besprechen und festhalten.", "Das Google-Profil und das Instagram-Profil auf den neuesten Stand bringen.", "Die ersten Beiträge vorbereiten und einen festen Tag wählen."],
  },
  {
    monat: "Monat 2",
    schwerpunkt: "Wiederholen und verbessern: bei dem bleiben, was ankommt.",
    aufgaben: ["Jede Woche die zwei Beiträge nach Plan veröffentlichen.", "Notieren, welche Beiträge Fragen oder Anfragen auslösen.", "Beiträge, die gut ankamen, in anderer Form wiederholen."],
  },
  {
    monat: "Monat 3",
    schwerpunkt: "Prüfen und anpassen: Messgrössen ansehen und den Plan schärfen.",
    aufgaben: ["Die Messgrössen der drei Monate nebeneinanderlegen.", "Säulen streichen, die nichts ausgelöst haben.", "Den Rhythmus anpassen, wenn er zu viel oder zu wenig war."],
  },
];

export const output = (over: Partial<StrategieOutput> = {}): StrategieOutput => ({
  kernbotschaft: "Die Malerei Keller streicht Fassaden und Räume in Gossau so, dass der Termin hält und die Farbe lange bleibt.",
  ziele: [
    { ziel: "Mehr Anfragen für Fassaden und Innenräume aus Gossau und Umgebung.", messgroesse: "Anfragen über Formular, Telefon und Nachricht pro Monat." },
    { ziel: "Die Kundschaft kennt die Malerei Keller als verlässlichen Betrieb.", messgroesse: "Wie oft die Kundschaft bei der Anfrage auf einen Beitrag verweist." },
  ],
  zielgruppen: [{ name: "Hausbesitzer in Gossau", bedarf: "Wollen wissen, was eine Fassade braucht, was sie kostet und wie lange die Arbeit dauert." }],
  saeulen: saeulen(),
  kanalrollen: kanalrollen(),
  rhythmus: { satz: "Zwei Beiträge pro Woche: Instagram trägt die Fassaden und das Team, der Google-Beitrag die Fragen aus dem Alltag." },
  plan90: plan(),
  messung: [
    "Anfragen pro Monat, mit der Frage an jede neue Kundschaft, wie sie auf uns gekommen ist.",
    "Besuche und Anrufe aus dem Google-Profil, ablesbar in der Statistik des Profils.",
    "Welche Beiträge am häufigsten gespeichert oder beantwortet werden, ablesbar in der Statistik von Instagram.",
  ],
  niemals: ["Memes und Trends ohne Bezug zum Malen, weil sie der Kundschaft nichts sagen.", "Preise ohne Besichtigung, weil jede Fassade anders ist."],
  ...over,
});
