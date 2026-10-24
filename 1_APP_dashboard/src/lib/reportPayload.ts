import type { EntryHistory, EntrySummary, LiveResponse, PicksResponse, SlimBootstrap } from "./types";

export interface FplReportRow { player: string; position: string; role: string; actualPoints: number | null; effectivePoints: number | null; minutes: number | null }
export interface GameweekReport {
  schema: "vortex-report-v1"; season: "2026/27"; gameweek: number;
  generatedAt: string; modelEvidence: "observed_official_data";
  teamName: string; managerDisplayName: string; actualPoints: number | null;
  overallRank: number | null; totalPoints: number | null; hitCost: number;
  benchPoints: number | null; captainName: string | null; rows: FplReportRow[];
  playerSource: "official_fpl"; note: string;
}

export function createGameweekReport(input: {
  bootstrap: SlimBootstrap; entry: EntrySummary; history: EntryHistory; picks: PicksResponse | null;
  live: LiveResponse | null; gw: number; generatedAt: string;
}): GameweekReport {
  const { bootstrap, entry, history, picks, live, gw, generatedAt } = input;
  if (!Number.isInteger(gw) || gw < 1 || gw > 38 || !Number.isFinite(Date.parse(generatedAt))) throw new RangeError("Invalid report gameweek or date.");
  const players = new Map(bootstrap.elements.map((player) => [player.id, player] as const));
  const livePlayers = new Map((live?.elements ?? []).map((player) => [player.id, player] as const));
  const actual = history.current.find((row) => row.event === gw);
  const rows = (picks?.picks ?? []).map((pick): FplReportRow => {
    const player = players.get(pick.element);
    const stats = livePlayers.get(pick.element)?.stats;
    return {
      player: player?.web_name ?? "Unknown player",
      position: ["", "GK", "DEF", "MID", "FWD"][player?.element_type ?? 0] ?? "—",
      role: pick.is_captain ? "Captain" : pick.is_vice_captain ? "Vice Captain" : pick.position > 11 ? "Bench" : "XI",
      actualPoints: stats?.total_points ?? null,
      effectivePoints: stats ? stats.total_points * pick.multiplier : null,
      minutes: stats?.minutes ?? null,
    };
  });
  return {
    schema: "vortex-report-v1", season: "2026/27", gameweek: gw, generatedAt,
    modelEvidence: "observed_official_data", playerSource: "official_fpl",
    teamName: entry.name.slice(0, 100),
    managerDisplayName: `${entry.player_first_name} ${entry.player_last_name}`.trim().slice(0, 100),
    actualPoints: actual?.points ?? null, totalPoints: actual?.total_points ?? null,
    overallRank: actual?.overall_rank ?? null, hitCost: actual?.event_transfers_cost ?? 0,
    benchPoints: actual?.points_on_bench ?? null,
    captainName: rows.find((row) => row.role === "Captain")?.player ?? null,
    rows,
    note: "Official observed gameweek review. Frozen pre-deadline xPts have not been attached; no post-hoc forecasts are represented as prior predictions.",
  };
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character] ?? character));
export function reportCoverSvg(report: GameweekReport): string {
  const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US");
  const safeTeam = escapeXml(report.teamName.slice(0, 36));
  const captain = escapeXml((report.captainName ?? "Not yet available").slice(0, 36));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160" viewBox="0 0 3840 2160">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#080d16"/><stop offset=".65" stop-color="#15202c"/><stop offset="1" stop-color="#0c1923"/></linearGradient><linearGradient id="accent"><stop stop-color="#cda228"/><stop offset="1" stop-color="#84d21c"/></linearGradient></defs>
  <rect width="3840" height="2160" fill="url(#bg)"/><circle cx="3460" cy="380" r="800" fill="#14bfd1" opacity=".055"/><circle cx="325" cy="1780" r="650" fill="#cda228" opacity=".075"/>
  <rect x="188" y="178" width="18" height="120" rx="9" fill="url(#accent)"/>
  <text x="255" y="245" fill="#d4af48" font-family="DejaVu Sans, sans-serif" font-size="68" font-weight="700" letter-spacing="11">FPL VORTEX   •   MATCHDAY INTELLIGENCE</text>
  <text x="188" y="610" fill="white" font-family="DejaVu Sans, sans-serif" font-size="196" font-weight="800">GAMEWEEK ${report.gameweek}</text>
  <text x="196" y="735" fill="#a2b1c6" font-family="DejaVu Sans, sans-serif" font-size="84">${safeTeam}</text>
  <rect x="185" y="900" width="3465" height="495" rx="50" fill="#ffffff" fill-opacity=".045" stroke="#ffffff" stroke-opacity=".12" stroke-width="3"/>
  <text x="270" y="1045" fill="#a7b4c7" font-family="DejaVu Sans, sans-serif" font-size="62">GAMEWEEK POINTS</text><text x="270" y="1250" fill="#ffffff" font-family="DejaVu Sans, sans-serif" font-size="176" font-weight="800">${number(report.actualPoints)}</text>
  <text x="1450" y="1045" fill="#a7b4c7" font-family="DejaVu Sans, sans-serif" font-size="62">OVERALL RANK</text><text x="1450" y="1250" fill="#d5af4d" font-family="DejaVu Sans, sans-serif" font-size="176" font-weight="800">${number(report.overallRank)}</text>
  <text x="2780" y="1045" fill="#a7b4c7" font-family="DejaVu Sans, sans-serif" font-size="62">BENCH POINTS</text><text x="2780" y="1250" fill="#99d75a" font-family="DejaVu Sans, sans-serif" font-size="176" font-weight="800">${number(report.benchPoints)}</text>
  <text x="194" y="1600" fill="#a2b1c6" font-family="DejaVu Sans, sans-serif" font-size="72">CAPTAIN: <tspan fill="#f3e4b1">${captain}</tspan></text>
  <rect x="192" y="1860" width="3450" height="3" fill="url(#accent)"/><text x="190" y="2005" fill="#8292a6" font-family="DejaVu Sans, sans-serif" font-size="50">Official observed FPL results • Original VORTEX design • Data as of ${escapeXml(report.generatedAt.slice(0, 10))}</text>
  </svg>`;
}
