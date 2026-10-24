export const POSITIONS: Record<number, string> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
  5: "MGR",
};

export function formatPrice(nowCost: number): string {
  return `£${(nowCost / 10).toFixed(1)}m`;
}

export function formatRank(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "—";
  if (rank >= 1_000_000) return `${(rank / 1_000_000).toFixed(2)}M`;
  if (rank >= 10_000) return `${Math.round(rank / 1000)}k`;
  return rank.toLocaleString();
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString();
}

export function playerPhotoUrl(code: number): string {
  return `/api/img/player/${code}`;
}

export function teamBadgeUrl(teamCode: number): string {
  return `https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png`;
}

export function fdrClasses(difficulty: number): string {
  switch (difficulty) {
    case 1:
      return "bg-emerald-500 text-emerald-950";
    case 2:
      return "bg-green-400 text-green-950";
    case 3:
      return "bg-slate-400 text-slate-950";
    case 4:
      return "bg-rose-400 text-rose-950";
    case 5:
      return "bg-rose-600 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

export function statusInfo(status: string): {
  label: string;
  className: string;
} | null {
  switch (status) {
    case "d":
      return { label: "Doubt", className: "bg-amber-400 text-amber-950" };
    case "i":
      return { label: "Injured", className: "bg-rose-500 text-white" };
    case "s":
      return { label: "Susp", className: "bg-rose-500 text-white" };
    case "u":
      return { label: "Unavail", className: "bg-slate-500 text-white" };
    case "n":
      return { label: "N/A", className: "bg-slate-500 text-white" };
    default:
      return null;
  }
}

export function chipLabel(chip: string | null | undefined): string | null {
  if (!chip) return null;
  const map: Record<string, string> = {
    wildcard: "Wildcard",
    freehit: "Free Hit",
    bboost: "Bench Boost",
    "3xc": "Triple Captain",
    manager: "Assistant Manager",
  };
  return map[chip] ?? chip;
}

export function kickoffLabel(iso: string | null): string {
  if (!iso) return "TBC";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TEAM_ID_KEY = "fpl-team-id";

export function getSavedTeamId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TEAM_ID_KEY);
}

export function saveTeamId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEAM_ID_KEY, id);
}
