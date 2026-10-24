/**
 * Automatic club-name matching between FPL team names and third-party names
 * (e.g. FotMob). Replaces the old hand-typed alias table, which silently missed
 * any club not listed in it (Hull, Coventry, Leeds, Sunderland, ...).
 *
 * Approach: reduce each name to a set of meaningful tokens, expand the handful
 * of abbreviations FPL uses ("Man", "Utd", "Spurs", "Wolves", "Nott'm"), and
 * treat two names as the same club when the shorter token set is fully
 * contained in the longer one. That handles "Leeds" vs "Leeds United" and
 * "Brighton" vs "Brighton & Hove Albion" with no per-club table, while
 * "Man City" ({manchester, city}) never matches "Manchester United".
 */

/** Normalize string by stripping accents/diacritics, punctuation and lowercase */
export function normalizeString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["fc", "afc", "the", "and", "of"]);

// FPL short forms -> the words a full club name would contain.
const EXPANSIONS: Record<string, string[]> = {
  man: ["manchester"],
  utd: ["united"],
  nott: ["nottingham"],
  nottm: ["nottingham"],
  notts: ["nottingham"],
  spurs: ["tottenham", "hotspur"],
  wolves: ["wolverhampton", "wanderers"],
};

// Youth / women's / reserve sides share a club's name; never treat them as the first team.
const NON_FIRST_TEAM = /^(u\d{2}|women|womens|ladies|academy|reserves|youth|ii)$/;

export function clubTokens(name: string): Set<string> {
  // Drop apostrophes first so "Nott'm" becomes "nottm", not "nott m".
  const cleaned = normalizeString(name.replace(/['\u2019`]/g, ""));
  const tokens = new Set<string>();
  for (const word of cleaned.split(" ")) {
    if (!word || STOPWORDS.has(word)) continue;
    for (const expanded of EXPANSIONS[word] ?? [word]) tokens.add(expanded);
  }
  return tokens;
}

/** True when the two names refer to the same first-team club. */
export function clubsMatch(fplClubName: string, otherClubName: string): boolean {
  const a = clubTokens(fplClubName);
  const b = clubTokens(otherClubName);
  if (a.size === 0 || b.size === 0) return false;

  for (const t of [...a, ...b]) {
    if (NON_FIRST_TEAM.test(t)) return false;
  }

  const [shorter, longer] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of shorter) {
    if (!longer.has(t)) return false;
  }
  return true;
}
