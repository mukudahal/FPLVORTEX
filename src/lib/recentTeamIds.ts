export const RECENT_TEAM_IDS_KEY = 'vortex:recentManagerIds';

export interface RecentTeamEntry {
  id: string;
  teamName?: string;
  managerName?: string;
  lastUsedAt: string;
}

const MAX_RECENT_TEAM_IDS = 8;

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
