export const RECENT_TEAM_IDS_KEY = 'vortex:recentManagerIds';
const RECENT_TEAM_IDS_COOKIE = 'vortex_recent_ids';

export interface RecentTeamEntry {
  id: string;
  teamName?: string;
  managerName?: string;
  lastUsedAt: string;
}

export const MAX_RECENT_TEAM_IDS = 50;

export function isValidNumericTeamId(raw: string): boolean {
  return /^[1-9]\d{0,11}$/.test(raw.trim());
}

export function upsertRecentTeam(
  current: RecentTeamEntry[],
  next: { id: string; teamName?: string; managerName?: string },
): RecentTeamEntry[] {
  const cleanId = next.id.trim();
  if (!isValidNumericTeamId(cleanId)) return current;

  const existing = current.find((item) => item.id === cleanId);
  const merged: RecentTeamEntry = {
    id: cleanId,
    teamName: next.teamName?.trim() || existing?.teamName,
    managerName: next.managerName?.trim() || existing?.managerName,
    lastUsedAt: new Date().toISOString(),
  };

  return [merged, ...current.filter((item) => item.id !== cleanId)].slice(0, MAX_RECENT_TEAM_IDS);
}

export function mergeRecentTeamLists(
  primary: RecentTeamEntry[],
  secondary: RecentTeamEntry[],
): RecentTeamEntry[] {
  const map = new Map<string, RecentTeamEntry>();
  for (const item of [...primary, ...secondary]) {
    if (!item || typeof item.id !== 'string') continue;
    const cleanId = item.id.trim();
    if (!isValidNumericTeamId(cleanId)) continue;
    const prev = map.get(cleanId);
    if (!prev) {
      map.set(cleanId, {
        id: cleanId,
        teamName: item.teamName?.trim() || undefined,
        managerName: item.managerName?.trim() || undefined,
        lastUsedAt: item.lastUsedAt || new Date().toISOString(),
      });
    } else {
      const newer = (item.lastUsedAt || '') > (prev.lastUsedAt || '') ? item.lastUsedAt : prev.lastUsedAt;
      map.set(cleanId, {
        id: cleanId,
        teamName: prev.teamName || item.teamName?.trim() || undefined,
        managerName: prev.managerName || item.managerName?.trim() || undefined,
        lastUsedAt: newer,
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => (b.lastUsedAt || '').localeCompare(a.lastUsedAt || ''))
    .slice(0, MAX_RECENT_TEAM_IDS);
}

export function removeRecentTeam(current: RecentTeamEntry[], idToRemove: string): RecentTeamEntry[] {
  const clean = idToRemove.trim();
  return current.filter((item) => item.id !== clean);
}

export function filterRecentTeams(current: RecentTeamEntry[], query: string): RecentTeamEntry[] {
  if (!Array.isArray(current) || current.length === 0) return [];
  const q = query.trim().toLowerCase();
  if (!q) return current;

  const prefixMatches: RecentTeamEntry[] = [];
  const otherMatches: RecentTeamEntry[] = [];

  for (const item of current) {
    if (item.id.startsWith(q)) {
      prefixMatches.push(item);
    } else if (
      item.id.includes(q) ||
      (item.teamName && item.teamName.toLowerCase().includes(q)) ||
      (item.managerName && item.managerName.toLowerCase().includes(q))
    ) {
      otherMatches.push(item);
    }
  }

  return [...prefixMatches, ...otherMatches];
}

export function readFallbackStoredTeams(): RecentTeamEntry[] {
  if (typeof window === 'undefined') return [];
  let combined: RecentTeamEntry[] = [];
  try {
    const rawSession = window.sessionStorage?.getItem(RECENT_TEAM_IDS_KEY);
    if (rawSession) {
      const parsed = JSON.parse(rawSession) as RecentTeamEntry[];
      if (Array.isArray(parsed)) combined = mergeRecentTeamLists(combined, parsed);
    }
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
  try {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${RECENT_TEAM_IDS_COOKIE}=`));
    if (match) {
      const decoded = decodeURIComponent(match.slice(RECENT_TEAM_IDS_COOKIE.length + 1));
      const parsed = JSON.parse(decoded) as RecentTeamEntry[];
      if (Array.isArray(parsed)) combined = mergeRecentTeamLists(combined, parsed);
    }
  } catch {
    // Ignore malformed cookies.
  }
  return combined;
}

export function writeFallbackStoredTeams(entries: RecentTeamEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(RECENT_TEAM_IDS_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage access errors.
  }
  try {
    const compact = entries.slice(0, 15).map((e) => ({
      id: e.id,
      teamName: e.teamName ? e.teamName.slice(0, 28) : undefined,
      lastUsedAt: e.lastUsedAt,
    }));
    const encoded = encodeURIComponent(JSON.stringify(compact));
    const secure = window.location.protocol === 'https:' ? '; SameSite=None; Secure' : '; SameSite=Lax';
    document.cookie = `${RECENT_TEAM_IDS_COOKIE}=${encoded}; path=/; max-age=31536000${secure}`;
  } catch {
    // Ignore cookie errors.
  }
}
