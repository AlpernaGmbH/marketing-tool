import { SOCIAL_NETWORKS, type CheckChannel, type CheckInput, type CheckItem, type PostingFrequency, type SocialNetwork } from "@/lib/check/types";

// Social Media: Kanäle stammen aus den Angaben des Besuchers und aus Links auf der Website.
// Instagram, LinkedIn und TikTok lassen sich nicht auslesen. Die Beitragshäufigkeit ist deshalb eine Selbstangabe.

const FREQ_SCORE: Record<PostingFrequency, number> = { none: 0, rare: 0.2, monthly: 0.45, weekly: 0.8, several: 1 };
const FREQ_LABEL: Record<PostingFrequency, string> = {
  none: "Gar nicht",
  rare: "Seltener als monatlich",
  monthly: "Etwa monatlich",
  weekly: "Etwa wöchentlich",
  several: "Mehrmals pro Woche",
};
const LABEL = Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n.key, n.label])) as Record<SocialNetwork, string>;

export type SocialResult = { score: number; items: CheckItem[]; channels: CheckChannel[] };

export function checkSocial(socials: CheckInput["socials"], linkedOnSite: Partial<Record<SocialNetwork, string>>): SocialResult {
  const given = socials ?? {};
  const nets = new Set<SocialNetwork>([
    ...SOCIAL_NETWORKS.map((n) => n.key).filter((k) => given[k]?.url?.trim()),
    ...(Object.keys(linkedOnSite) as SocialNetwork[]),
  ]);

  const channels: CheckChannel[] = [...nets].map((net) => {
    const entry = given[net] ?? {};
    // Ohne Angabe gehen wir von «etwa monatlich» aus, wenn der Besucher den Kanal nennt, und sagen das im Ergebnis.
    // Kanäle, die nur auf der Website verlinkt sind, zählen mit einem Mittelwert von 0,3 («unbekannt»).
    const freq: PostingFrequency | null = entry.freq ?? (entry.url ? "monthly" : null);
    return {
      network: net,
      label: LABEL[net],
      url: entry.url?.trim() || linkedOnSite[net],
      linkedOnSite: Boolean(linkedOnSite[net]),
      freq,
      freqLabel: freq ? FREQ_LABEL[freq] : "Unbekannt",
      freqScore: freq ? FREQ_SCORE[freq] : 0.3,
      freqAssumed: !entry.freq,
    };
  });

  if (channels.length === 0) {
    return {
      score: 0,
      channels,
      items: [{ id: "social.none", ok: false, label: "Social-Media-Kanäle", detail: "Keine Kanäle angegeben und keine auf der Website verlinkt" }],
    };
  }

  const best = Math.max(...channels.map((c) => c.freqScore));
  const avg = channels.reduce((s, c) => s + c.freqScore, 0) / channels.length;
  const linked = channels.filter((c) => c.linkedOnSite).length;

  const items: CheckItem[] = [
    { id: "social.count", ok: channels.length >= 2, label: "Anzahl Kanäle", detail: `${channels.length} aktiv: ${channels.map((c) => c.label).join(", ")}` },
    ...channels.map<CheckItem>((c) => ({
      id: `social.freq.${c.network}`,
      ok: c.freqScore >= 0.8,
      // Eine Annahme ist keine Feststellung: ohne Angabe des Besuchers entsteht keine Massnahme.
      info: c.freqAssumed && c.freqScore < 0.8,
      label: `Beitragshäufigkeit ${c.label}`,
      detail: c.freqAssumed
        ? `${c.freqLabel}, nicht angegeben. Gib die Häufigkeit an, dann fliesst sie in die Bewertung ein`
        : `${c.freqLabel}${c.freqScore < 0.8 ? ". Empfehlung: mindestens einmal pro Woche" : ""}`,
    })),
    {
      id: "social.linked",
      ok: linked === channels.length,
      label: "Verlinkung auf der Website",
      detail: `${linked} von ${channels.length} Kanälen sind auf der Website verlinkt`,
    },
  ];

  const score = Math.min(1, 0.55 * best + 0.25 * avg + 0.1 * Math.min(1, channels.length / 3) + 0.1 * (linked / channels.length));
  return { score, items, channels };
}
