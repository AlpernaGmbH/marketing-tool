// robots.txt bei Fremdseiten (PLAN.md, Baustein 7): Wer den Abruf der Startseite für alle oder für AlpernaCheck
// untersagt, wird im Wettbewerbsvergleich nicht gelesen. Bewusst klein: Nur die Frage «Darf die Startseite (/) gelesen
// werden?» wird beantwortet. Die eigene Website der Person prüft der Check weiterhin (sie ruft ihn selbst auf).

const OUR_AGENT = "alpernacheck";

type Group = { agents: string[]; disallow: string[]; allow: string[] };

function parseGroups(robots: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow") current.disallow.push(value);
    else if (key === "allow") current.allow.push(value);
  }
  return groups;
}

/** Trifft ein Muster aus robots.txt auf den Pfad «/» zu? Nur «/» selbst oder ein Stern am Anfang. */
const matchesRoot = (pattern: string) => pattern === "/" || pattern === "/*" || pattern === "*" || pattern === "/$";

/**
 * true, wenn robots.txt den Abruf der Startseite verbietet, für AlpernaCheck (eigene Gruppe gewinnt) oder sonst für `*`.
 * Ein leeres «Disallow:» erlaubt alles. Ein ausdrückliches «Allow: /» in derselben Gruppe hebt «Disallow: /» auf.
 */
export function disallowsRoot(robots: string, agent = OUR_AGENT): boolean {
  const groups = parseGroups(robots.slice(0, 100_000));
  const mine = groups.filter((g) => g.agents.some((a) => a === agent || agent.startsWith(a.replace(/\*$/, "")) && a !== "*"));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  return chosen.some((g) => g.disallow.some(matchesRoot) && !g.allow.some(matchesRoot));
}
