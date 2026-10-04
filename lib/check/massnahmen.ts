import type { Aufwand, BausteinLabel, CheckCategory, CheckItem, Massnahme, Wirkung } from "@/lib/check/types";

// Aus jedem nicht erfüllten Prüfpunkt entsteht höchstens eine Massnahme. Wirkung und Aufwand sind eine
// Einschätzung von Alperna, keine Messung und keine Statistik. Die Massnahmen sind fest formuliert:
// Die KI-Schicht (Etappe 2) darf sie ordnen und erklären, aber nichts hinzuerfinden.

type Entry = {
  titel: string;
  warum: string;
  baustein: BausteinLabel;
  aufwand: Aufwand;
  wirkung: Wirkung;
  tool?: string;
};

const SEO: Record<string, Entry> = {
  "seo.title": {
    titel: "Seitentitel auf 10 bis 65 Zeichen setzen, mit Angebot und Ort",
    warum: "Der Titel ist die Zeile, die bei Google zuerst erscheint. Ein klarer Titel bringt Klicks von Leuten, die genau dich suchen.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "hoch",
  },
  "seo.description": {
    titel: "Meta-Beschreibung mit 50 bis 160 Zeichen schreiben",
    warum: "Sie steht unter dem Titel in der Trefferliste und entscheidet mit, ob jemand klickt.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "seo.h1": {
    titel: "Genau eine Hauptüberschrift setzen, die dein Angebot nennt",
    warum: "Die Hauptüberschrift sagt Besuchern und Google in einem Satz, worum es auf der Seite geht.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "seo.https": {
    titel: "Die Website auf HTTPS umstellen",
    warum: "Browser warnen bei Seiten ohne Verschlüsselung. Wer die Warnung sieht, springt ab.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "hoch",
  },
  "seo.viewport": {
    titel: "Die Website für das Handy einrichten",
    warum: "Ohne Viewport wird die Seite auf dem Handy verkleinert dargestellt. Viele Besucher kommen mit dem Handy.",
    baustein: "Website",
    aufwand: "mittel",
    wirkung: "hoch",
  },
  "seo.lang": {
    titel: "Die Sprache der Seite angeben (lang=\"de-CH\")",
    warum: "Die Angabe hilft Google und Vorlese-Programmen, die Seite richtig einzuordnen.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "gering",
  },
  "seo.canonical": {
    titel: "Einen Canonical-Tag setzen",
    warum: "Er sagt Google, welche Adresse die Hauptadresse ist, und verhindert doppelte Inhalte.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "gering",
  },
  "seo.og": {
    titel: "Titel und Vorschaubild für geteilte Links hinterlegen",
    warum: "Links, die per WhatsApp oder auf Social Media geteilt werden, erscheinen sonst ohne Bild und ohne Titel.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "seo.schema": {
    titel: "Firmendaten als strukturierte Daten hinterlegen",
    warum: "Adresse, Öffnungszeiten und Telefon werden so für Google lesbar. Das hilft bei lokalen Suchen.",
    baustein: "Website",
    aufwand: "mittel",
    wirkung: "mittel",
  },
  "seo.alt": {
    titel: "Bildern eine kurze Beschreibung geben (Alt-Text)",
    warum: "Alt-Texte helfen Google und sehbehinderten Besuchern zu verstehen, was auf den Bildern zu sehen ist.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "seo.index": {
    titel: "«noindex» entfernen, damit Google die Seite aufnehmen darf",
    warum: "Mit «noindex» ist die Website bei Google nicht zu finden. Das ist meist ein Überbleibsel aus der Bauphase.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "hoch",
  },
  "seo.sitemap": {
    titel: "Eine XML-Sitemap anlegen und bei Google einreichen",
    warum: "Die Sitemap zeigt Google alle Seiten, die gefunden werden sollen.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "seo.robots": {
    titel: "Eine robots.txt anlegen",
    warum: "Sie sagt Suchmaschinen, welche Bereiche sie lesen dürfen, und verweist auf die Sitemap.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "gering",
  },
  "seo.text": {
    titel: "Mehr Text auf der Startseite: was du anbietest, für wen und wo",
    warum: "Mit wenig Text kann Google nicht erkennen, wofür die Seite stehen soll.",
    baustein: "Website",
    aufwand: "mittel",
    wirkung: "mittel",
  },
  "seo.speed": {
    titel: "Die Antwortzeit der Website senken",
    warum: "Langsame Seiten verlieren Besucher, bevor sie etwas gelesen haben. Gemessen wurde ein Abruf von unserem Server aus.",
    baustein: "Website",
    aufwand: "mittel",
    wirkung: "mittel",
  },
  "seo.size": {
    titel: "Die Seite schlanker machen (weniger Code und Skripte)",
    warum: "Eine grosse Seite lädt auf dem Handy langsam.",
    baustein: "Website",
    aufwand: "mittel",
    wirkung: "gering",
  },
};

const OTHER: Record<string, Entry> = {
  "gbp.reviews": {
    titel: "Zufriedene Kundschaft um eine Google-Bewertung bitten",
    warum: "Bewertungen sind für viele der Grund, anzurufen oder eben nicht.",
    baustein: "Google Business Profil",
    aufwand: "mittel",
    wirkung: "hoch",
    tool: "bewertungs-kit",
  },
  "gbp.rating": {
    titel: "Auf kritische Bewertungen sachlich antworten",
    warum: "Eine ruhige Antwort zeigt allen, die mitlesen, wie du mit Kritik umgehst.",
    baustein: "Google Business Profil",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "gbp.website": {
    titel: "Die Website im Google-Profil eintragen",
    warum: "Ohne Link kommen Interessierte aus Google Maps nicht auf deine Website.",
    baustein: "Google Business Profil",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "gbp.hours": {
    titel: "Öffnungszeiten im Google-Profil eintragen und aktuell halten",
    warum: "Falsche oder fehlende Zeiten führen zu verpassten Anrufen und zu Frust vor dem ersten Kontakt.",
    baustein: "Google Business Profil",
    aufwand: "klein",
    wirkung: "hoch",
    tool: "gbp-feiertage",
  },
  "gbp.photos": {
    titel: "Echte Fotos von Betrieb, Team und Arbeit hochladen",
    warum: "Fotos zeigen, wer dich erwartet. Das senkt die Hemmschwelle, sich zu melden.",
    baustein: "Google Business Profil",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "social.none": {
    titel: "Einen Kanal wählen, auf dem deine Kundschaft unterwegs ist, und ihn verlinken",
    warum: "Ohne Kanal fehlt ein Ort, an dem man sieht, dass es dich gibt und was bei dir läuft.",
    baustein: "Social Media",
    aufwand: "mittel",
    wirkung: "mittel",
  },
  "social.linked": {
    titel: "Die Social-Media-Kanäle auf der Website verlinken",
    warum: "Wer deine Website besucht, soll deine Kanäle mit einem Klick finden.",
    baustein: "Social Media",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "sea.analytics": {
    titel: "Besucherzahlen messen",
    warum: "Ohne Messung siehst du nicht, was die Website bringt und welche Seiten gelesen werden.",
    baustein: "Website",
    aufwand: "klein",
    wirkung: "mittel",
  },
  "newsletter.signup": {
    titel: "Eine Newsletter-Anmeldung auf der Website einbauen",
    warum: "E-Mail ist der günstigste Kanal, um mit Stammkundschaft in Kontakt zu bleiben.",
    baustein: "Website",
    aufwand: "mittel",
    wirkung: "mittel",
  },
};

const WIRKUNG_RANG: Record<Wirkung, number> = { hoch: 0, mittel: 1, gering: 2 };
const AUFWAND_RANG: Record<Aufwand, number> = { klein: 0, mittel: 1, gross: 2 };

function gbpProfile(cat: CheckCategory): Entry {
  if (cat.verified) {
    return {
      titel: "Ein Google-Business-Profil anlegen und bestätigen lassen",
      warum: "Wer in der Nähe nach deinem Angebot sucht, findet sonst nur andere. Das Profil ist oft der erste Kontakt.",
      baustein: "Google Business Profil",
      aufwand: "mittel",
      wirkung: "hoch",
      tool: "gbp-check",
    };
  }
  return {
    titel: "Prüfen, ob dein Betrieb bei Google Maps eingetragen ist",
    warum: "Der Check konnte den Eintrag nicht bestätigen. Suche nach «Firma Ort» in Google Maps. Fehlt der Eintrag, ist das die wichtigste Lücke bei lokalen Suchen.",
    baustein: "Google Business Profil",
    aufwand: "klein",
    wirkung: "hoch",
    tool: "gbp-check",
  };
}

function entryFor(item: CheckItem, cat: CheckCategory): Entry | null {
  if (item.id === "gbp.profile") return gbpProfile(cat);
  if (item.id.startsWith("social.freq.")) {
    const label = item.label.replace("Beitragshäufigkeit ", "");
    return {
      titel: `Auf ${label} mindestens einmal pro Woche veröffentlichen`,
      warum: "Regelmässige Beiträge halten dich im Gedächtnis. Ein fester, machbarer Rhythmus zählt mehr als ein kurzer Anlauf.",
      baustein: "Social Media",
      aufwand: "mittel",
      wirkung: "mittel",
      tool: "posting-plan",
    };
  }
  if (item.id === "shop.shop") {
    if (cat.relevance === "gering") return null;
    return {
      titel: "Prüfen, ob ein Online-Shop zu deinem Angebot passt",
      warum: cat.hint ?? "Ein Shop erweitert die Kundschaft über die Öffnungszeiten hinaus.",
      baustein: "Online-Shop",
      aufwand: "gross",
      wirkung: cat.relevance === "hoch" ? "hoch" : "gering",
    };
  }
  if (item.id === "booking.booking") {
    if (cat.relevance === "gering") return null;
    return {
      titel: "Eine Online-Buchung einrichten",
      warum: cat.hint ?? "Wer buchen will, soll nicht anrufen müssen.",
      baustein: "Buchungstool",
      aufwand: "mittel",
      wirkung: cat.relevance === "hoch" ? "hoch" : "mittel",
    };
  }
  return SEO[item.id] ?? OTHER[item.id] ?? null;
}

/** Massnahmen aus den nicht erfüllten Prüfpunkten, geordnet nach Wirkung, dann Aufwand. */
export function buildMassnahmen(categories: CheckCategory[]): Massnahme[] {
  const out: Massnahme[] = [];
  for (const cat of categories) {
    for (const item of cat.items) {
      if (item.ok || item.info) continue;
      const e = entryFor(item, cat);
      if (!e) continue;
      out.push({ id: `m.${item.id}`, itemId: item.id, ...e });
    }
  }
  return out
    .map((m, i) => ({ m, i }))
    .sort((a, b) => WIRKUNG_RANG[a.m.wirkung] - WIRKUNG_RANG[b.m.wirkung] || AUFWAND_RANG[a.m.aufwand] - AUFWAND_RANG[b.m.aufwand] || a.i - b.i)
    .map(({ m }) => m);
}
