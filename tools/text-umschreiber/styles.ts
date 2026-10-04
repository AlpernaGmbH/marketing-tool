// Die Liste der Stile des Text-Umschreibers. Einen neuen Stil fügst du hier mit einem Eintrag an, mehr ist nicht nötig:
// Auswahl im Werkzeug, Prüfung in /api/text und die Tests lesen alle aus dieser Liste.
//
// Felder:
//  - id           kurze Kennung, nur a-z, 0-9 und «-»; wird nie geändert, wenn Texte schon damit entstanden sind
//  - label        Name in der Auswahl
//  - hint         ein Satz unter der Auswahl: was der Stil macht
//  - instruction  Regeln für die KI, im Du, auf Deutsch, konkret. Keine Zahlen oder Fakten vorgeben.
//  - maxOutputChars  harte Obergrenze für die Antwort; längere Antworten werden verworfen
//  - maxTokens    Obergrenze für die Länge, die das Modell schreiben darf (grob Zeichen geteilt durch drei)

export type TextStyle = {
  id: string;
  label: string;
  hint: string;
  instruction: string;
  maxOutputChars: number;
  maxTokens: number;
};

export const STYLES: TextStyle[] = [
  {
    id: "korrigieren",
    label: "Nur korrigieren",
    hint: "Behebt Rechtschreibung, Grammatik und Zeichensetzung. Inhalt, Ton und Länge bleiben.",
    instruction:
      "Korrigiere nur Rechtschreibung, Grammatik und Zeichensetzung. Ändere weder Wortwahl noch Satzbau noch Länge, ausser ein Satz ist grammatisch falsch. Behalte Absätze, Aufzählungen und Zeilenumbrüche bei.",
    maxOutputChars: 4000,
    maxTokens: 1800,
  },
  {
    id: "vereinfachen",
    label: "Einfacher und kürzer",
    hint: "Kurze Sätze, bekannte Wörter, gleicher Inhalt.",
    instruction:
      "Schreibe den Text einfacher und kürzer. Sätze mit höchstens etwa 15 Wörtern, bekannte Wörter statt Fremdwörter, aktive Verben statt Hauptwort-Ketten. Lass nichts Wesentliches weg und füge nichts hinzu.",
    maxOutputChars: 3000,
    maxTokens: 1400,
  },
  {
    id: "linkedin",
    label: "LinkedIn-Post",
    hint: "Starker erster Satz, kurze Absätze, eine Frage oder ein nächster Schritt am Schluss.",
    instruction:
      "Schreibe einen LinkedIn-Post. Die erste Zeile ist ein einzelner Satz, der zum Weiterlesen bringt, ohne Clickbait. Danach kurze Absätze mit einer Leerzeile dazwischen. Am Schluss eine Frage an die Leserinnen oder ein klarer nächster Schritt. Höchstens drei Hashtags in der letzten Zeile, keine Emojis.",
    maxOutputChars: 3000,
    maxTokens: 1300,
  },
  {
    id: "instagram",
    label: "Instagram-Caption",
    hint: "Kurze Zeilen, Aufforderung zum Handeln, wenige Hashtags.",
    instruction:
      "Schreibe eine Instagram-Caption. Die erste Zeile muss für sich allein funktionieren, weil nur sie vor «mehr» sichtbar ist. Kurze Zeilen und Absätze, ein freundlicher Aufruf zum Handeln. Drei bis fünf passende Hashtags in der letzten Zeile. Höchstens zwei Emojis, nur wo sie zum Inhalt passen.",
    maxOutputChars: 2200,
    maxTokens: 900,
  },
  {
    id: "google-beitrag",
    label: "Google-Beitrag",
    hint: "Kurzer, sachlicher Beitrag für das Google-Unternehmensprofil.",
    instruction:
      "Schreibe einen kurzen Beitrag für das Google-Unternehmensprofil. Sachlich und konkret: was gibt es, für wen, ab wann, wo. Drei bis sechs Sätze, ein einziger Aufruf zum Handeln am Schluss. Keine Hashtags, keine Emojis, keine Telefonnummern und keine Links, ausser sie stehen im Ausgangstext.",
    maxOutputChars: 1200,
    maxTokens: 600,
  },
  {
    id: "medienmitteilung",
    label: "Medienmitteilung",
    hint: "Titel, Einstieg mit den wichtigsten Fakten, Hauptteil, Hinweis auf Rückfragen.",
    instruction:
      "Schreibe eine Medienmitteilung im sachlichen Pressestil. Aufbau: Titel, Einstiegsabsatz mit den wichtigsten Fakten (wer, was, wann, wo), Hauptteil in kurzen Absätzen, Absatz zum Betrieb oder Verein, zuletzt «Rückfragen:» mit dem Platzhalter [Name, Telefon, E-Mail]. Verwende Zitate nur, wenn sie wörtlich im Ausgangstext stehen. Erfinde keine Personen, Aussagen oder Zitate. Ohne Lob in eigener Sache und ohne Superlative.",
    maxOutputChars: 3000,
    maxTokens: 1400,
  },
  {
    id: "newsletter",
    label: "Newsletter",
    hint: "Betreffzeile, Vorschautext und ein kurzer Text mit einem klaren Knopf.",
    instruction:
      "Schreibe einen kurzen Newsletter. Beginne mit «Betreff:» (eine Zeile, möglichst unter 50 Zeichen) und «Vorschau:» (eine Zeile). Danach eine persönliche Anrede mit dem Platzhalter [Vorname], zwei bis vier kurze Absätze und ein einziger Aufruf zum Handeln mit dem Platzhalter [Link]. Keine Grossbuchstaben-Wörter, keine Ausrufezeichen im Betreff.",
    maxOutputChars: 2500,
    maxTokens: 1100,
  },
  {
    id: "website-text",
    label: "Website-Text",
    hint: "Überschrift und nutzenorientierte Absätze für eine Leistungs- oder Startseite.",
    instruction:
      "Schreibe einen Text für eine Website. Eine klare Überschrift, die den Nutzen nennt, danach zwei bis vier Absätze: was bekommt die Kundschaft, wie läuft es ab, was ist der nächste Schritt. Sprich die Leserin direkt an, schreibe konkret und ohne Floskeln wie «kompetent», «professionell» oder «qualitativ hochwertig».",
    maxOutputChars: 3000,
    maxTokens: 1300,
  },
];

export const STYLE_IDS = STYLES.map((s) => s.id) as [string, ...string[]];

export function getStyle(id: string): TextStyle | undefined {
  return STYLES.find((s) => s.id === id);
}

export type Anrede = "du" | "sie" | "wie-im-text";

export const ANREDEN: Array<{ id: Anrede; label: string }> = [
  { id: "wie-im-text", label: "Wie im Text" },
  { id: "du", label: "Du" },
  { id: "sie", label: "Sie" },
];
