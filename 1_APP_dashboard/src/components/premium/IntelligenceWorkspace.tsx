"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useJson } from "@/lib/useJson";
import type { PlanResponse } from "@/lib/planTypes";
import { getSavedTeamId, saveTeamId } from "@/lib/helpers";
import { analyzeIntelligence } from "@/lib/intelligence";
import { feasibleMustOwnTargets, injuryAvailabilityList, priceMovementSignals, rankCaptaincy, rankLeagueThreats, rankPlayerThreats, type OwnershipCohort } from "@/lib/marketLeague";
import { fixtureUncertainty } from "@/lib/forecastScience";
import type { EntryResponse, Fixture, LeagueStandings, LiveResponse, PicksResponse, SlimBootstrap } from "@/lib/types";

export type WorkspaceMode = "review" | "league" | "threats" | "captaincy" | "market" | "injuries" | "predictions";
const META: Record<WorkspaceMode, { name: string; kicker: string; about: string }> = {
  review: { name: "Gameweek Review", kicker: "MATCHDAY INTELLIGENCE", about: "Scoreline audit, lineup decisions, captaincy and movement over time." },
  league: { name: "Mini-League Intelligence", kicker: "RIVAL INTELLIGENCE", about: "Live standings, points gaps and confirmed public rival exposure." },
  threats: { name: "Threats & Must-Own", kicker: "OPPORTUNITY RADAR", about: "Exposure risk and feasible same-position upgrades. Rankings are decision aids, not guarantees." },
  captaincy: { name: "Captaincy Lab", kicker: "DECISION ENGINE", about: "Expected returns, minutes uncertainty and differential captaincy profiles." },
  market: { name: "Transfer Market", kicker: "PRICE WATCH", about: "Observed transfer demand, FPL pricing context and rising or falling signals." },
  injuries: { name: "Injury & Suspension Desk", kicker: "AVAILABILITY", about: "Known FPL flags, official news timestamps and uncertainty." },
  predictions: { name: "Player Forecasts", kicker: "PROJECTION ENGINE", about: "Fixture-adjusted xPts across your selected planning horizon, with minutes and confidence." },
};

const n1 = (n: number) => Number.isFinite(n) ? n.toFixed(1) : "—";
const n0 = (n: number) => Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";

function Surface({ title, children, detail }: { title: string; children: ReactNode; detail?: string }) {
  return <section className="premium-surface"><header className="premium-section-header"><div><h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div></header><div className="premium-section-body">{children}</div></section>;
}
function ScoreCard({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return <div className="premium-stat"><span>{label}</span><strong>{value}</strong><small>{caption ?? ""}</small></div>;
}
function Feedback({ children }: { children: ReactNode }) { return <div className="premium-feedback" role="status">{children}</div>; }

export function IntelligenceWorkspace({ mode, initialTeamId, initialGw }: { mode: WorkspaceMode; initialTeamId?: string; initialGw?: number }) {
  const [teamId, setTeamId] = useState<string | null>(initialTeamId ?? null);
  const [input, setInput] = useState("");
  const [horizon, setHorizon] = useState(5);
  const [risk, setRisk] = useState<"balanced" | "upside">("balanced");
  const [selectedGw, setSelectedGw] = useState<number | null>(initialGw ?? null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only saved manager at hydration
    if (!initialTeamId) setTeamId(getSavedTeamId());
  }, [initialTeamId]);

  const bootstrap = useJson<SlimBootstrap>("/api/fpl/bootstrap", 300_000);
  const fixtures = useJson<Fixture[]>("/api/fpl/fixtures", 300_000);
  const entry = useJson<EntryResponse>(teamId ? `/api/fpl/entry/${teamId}` : null, 180_000);
  const planner = useJson<PlanResponse>(mode === "threats" && teamId ? `/api/plan/${teamId}?gws=5` : null);
  const currentGw = bootstrap.data?.currentEvent ?? bootstrap.data?.nextEvent ?? 1;
  const gw = selectedGw ?? currentGw;
  const picks = useJson<PicksResponse>(teamId && gw ? `/api/fpl/entry/${teamId}/picks/${gw}` : null, 90_000);
  const live = useJson<LiveResponse>(mode === "review" && gw ? `/api/fpl/live/${gw}` : null, 90_000);
  const leagueOptions = entry.data?.entry.leagues?.classic ?? [];
  const activeLeague = leagueId ?? leagueOptions.find((option) => option.league_type === "x")?.id ?? leagueOptions[0]?.id ?? null;
  const league = useJson<LeagueStandings>(mode === "league" && activeLeague ? `/api/fpl/league/${activeLeague}` : null, 180_000);
  const leagueOwnership = useJson<OwnershipCohort & { note: string; sampledEntries: number }>(
    mode === "league" && activeLeague && bootstrap.data?.currentEvent
      ? `/api/leagues/${activeLeague}/ownership?gw=${bootstrap.data.currentEvent}` : null, 300_000);

  const analysis = useMemo(() => bootstrap.data && fixtures.data ? analyzeIntelligence(bootstrap.data, fixtures.data, horizon) : null, [bootstrap.data, fixtures.data, horizon]);
  const elementById = useMemo(() => new Map((bootstrap.data?.elements ?? []).map((p) => [p.id, p] as const)), [bootstrap.data]);
  const owned = useMemo(() => (picks.data?.picks ?? []).map((pick) => pick.element), [picks.data]);
  const threats = useMemo(() => rankPlayerThreats(analysis?.players ?? [], owned), [analysis, owned]);
  const captains = useMemo(() => rankCaptaincy(analysis?.players ?? [], risk), [analysis, risk]);
  const opportunities = useMemo(() => feasibleMustOwnTargets(analysis?.players ?? [], owned.map((id) => elementById.get(id)).filter((player) => player !== undefined),
    entry.data?.entry.last_deadline_bank ?? 0, planner.data?.sellingPrices), [analysis, owned, elementById, entry.data, planner.data]);
  const market = useMemo(() => priceMovementSignals(bootstrap.data?.elements ?? []), [bootstrap.data]);
  const injuryList = useMemo(() => injuryAvailabilityList(bootstrap.data?.elements ?? []), [bootstrap.data]);
  const queryName = query.trim().toLowerCase();

  function submitTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{1,10}$/.test(input) || Number(input) < 1) return;
    saveTeamId(input); setTeamId(input); setInput(""); setLeagueId(null);
  }

  const meta = META[mode];
  const needManager = ["review", "league", "threats"].includes(mode);
  return <main className="premium-workspace py-6">
    <div className="premium-head">
      <div><p className="premium-overline">{meta.kicker} / FPL VORTEX</p><h1>{meta.name}</h1><p>{meta.about}</p></div>
      <div className="premium-pills"><span>2026/27 SEASON</span><span>GW{currentGw}</span><span>LIVE FPL SOURCES</span></div>
    </div>
    <div className="premium-quick-links" aria-label="Analytics modules">
      {([ ["review", "Gameweek Review"], ["predictions", "Player Forecasts"], ["league", "Mini-League"], ["threats", "Threat Radar"], ["captaincy", "Captaincy"], ["market", "Price Watch"], ["injuries", "Injury Desk"] ] as const).map(([key, label]) =>
        <Link key={key} aria-current={mode === key ? "page" : undefined} href={`/${key === "league" ? "leagues" : key}`} className={mode === key ? "active" : ""}>{label}</Link>)}
    </div>

    <div className="premium-controlbar">
      <form onSubmit={submitTeam} className="flex min-w-0 items-end gap-2"><label className="text-xs">Manager ID<input inputMode="numeric" pattern="[0-9]+" value={input} onChange={(ev) => setInput(ev.target.value)} placeholder={teamId ?? "FPL ID"} aria-label="FPL Manager ID" /></label>
        <button type="submit">Load</button></form>
      {mode === "review" ? <label className="text-xs">Gameweek<select value={gw} onChange={(ev) => setSelectedGw(Number(ev.target.value))}>{Array.from({ length: 38 }, (_, i) => i + 1).map((week) => <option key={week} value={week}>GW{week}</option>)}</select></label> : null}
      {["captaincy", "predictions", "threats"].includes(mode) ? <label className="text-xs">Forecast horizon<select value={horizon} onChange={(ev) => setHorizon(Number(ev.target.value))}>{[1, 3, 5, 8].map((value) => <option key={value} value={value}>{value} GWs</option>)}</select></label> : null}
      {mode === "captaincy" ? <label className="text-xs">Risk mode<select value={risk} onChange={(ev) => setRisk(ev.target.value as "balanced" | "upside")}><option value="balanced">Balanced</option><option value="upside">High upside</option></select></label> : null}
      {mode === "predictions" || mode === "market" || mode === "injuries" ? <label className="text-xs">Search<input value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder="Find player" /></label> : null}
    </div>

    {bootstrap.loading || fixtures.loading ? <Feedback>Loading official game data and refreshing the analytical model…</Feedback> : null}
    {bootstrap.error || fixtures.error ? <Feedback>Data unavailable: {bootstrap.error || fixtures.error}. Existing analyses cannot be verified until official endpoints recover.</Feedback> : null}
    {needManager && !teamId ? <Feedback>Enter your FPL manager ID to load team-specific analysis. Player and fixture forecasts remain publicly accessible.</Feedback> : null}
    {needManager && teamId && entry.error ? <Feedback>Manager data unavailable: {entry.error}</Feedback> : null}

    {mode === "predictions" && analysis ? <>
      <div className="premium-kpi-grid"><ScoreCard label="Forecasted players" value={n0(analysis.players.length)} caption="Active FPL player pool"/><ScoreCard label="Model horizon" value={`${analysis.weeks.length} GW`} caption={analysis.weeks.map((week) => `GW${week}`).join(" • ")}/><ScoreCard label="Fixtures" value={n0(analysis.matchCount)} caption="Confirmed event assignments"/><ScoreCard label="Model source" value="Opta-derived" caption="Via publicly exposed FPL data"/></div>
      <Surface title="Expected points leaderboard" detail="Not proprietary FPLReview projections. Minutes/availability estimates are heuristic; forecasts should be evaluated against historical outcomes.">
        <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Team</th><th>Position</th><th>£m</th><th>GW xPts</th><th>Horizon xPts</th><th>Playing %</th><th>Confidence</th><th>Risk</th></tr></thead><tbody>{analysis.players.filter((row) => row.player.web_name.toLowerCase().includes(queryName)).slice(0, 75).map((row) => <tr key={row.player.id}><td className="font-semibold">{row.player.web_name}</td><td>{row.team?.short_name ?? "—"}</td><td>{["", "GK", "DEF", "MID", "FWD"][row.player.element_type]}</td><td>{n1(row.player.now_cost / 10)}</td><td className="premium-emphasis">{n1(row.nextXPts)}</td><td>{n1(row.totalXPts)}</td><td>{row.minutesChance}%</td><td>{row.confidence}%</td><td><span className="premium-risk">{row.risk}</span></td></tr>)}</tbody></table></div>
      </Surface></> : null}

    {mode === "review" ? <>
      <div className="premium-kpi-grid"><ScoreCard label="Team points" value={entry.data?.history.current.find((row) => row.event === gw)?.points?.toString() ?? "—"} caption="Official GW points"/><ScoreCard label="Overall rank" value={n0(entry.data?.history.current.find((row) => row.event === gw)?.overall_rank ?? NaN)} caption="Rank at end of GW"/><ScoreCard label="Hits" value={(entry.data?.history.current.find((row) => row.event === gw)?.event_transfers_cost ?? 0).toString()} caption="Points spent on transfers"/><ScoreCard label="Bench points" value={(entry.data?.history.current.find((row) => row.event === gw)?.points_on_bench ?? 0).toString()} caption="Realized, not forecast"/></div>
      <div className="premium-two-col"><Surface title={`Gameweek ${gw} lineup review`} detail="Official live points and actual selections; provisional during fixtures.">
        {picks.loading || live.loading ? <Feedback>Refreshing lineup and live scores…</Feedback> : null}
        {picks.error ? <Feedback>{picks.error}</Feedback> : null}
        <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Role</th><th>Minutes</th><th>Player pts</th><th>Effective pts</th></tr></thead><tbody>{(picks.data?.picks ?? []).map((pick) => {const player = elementById.get(pick.element);const stats = live.data?.elements.find((row) => row.id === pick.element)?.stats;return <tr key={pick.element}><td>{player?.web_name ?? `#${pick.element}`}</td><td>{pick.is_captain ? "Captain" : pick.is_vice_captain ? "Vice" : pick.position > 11 ? "Bench" : "Starting XI"}</td><td>{stats?.minutes ?? "—"}</td><td>{stats?.total_points ?? "—"}</td><td>{stats ? stats.total_points * pick.multiplier : "—"}</td></tr>})}</tbody></table></div>
      </Surface><Surface title="Historical movement" detail="Gameweek-by-gameweek actuals. Frozen pre-deadline projection comparisons require historical model snapshots.">
        <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>GW</th><th>Points</th><th>Overall</th><th>Rank</th></tr></thead><tbody>{(entry.data?.history.current ?? []).slice(-12).reverse().map((row) => <tr key={row.event}><td>GW{row.event}</td><td>{row.points}</td><td>{row.total_points}</td><td>{n0(row.overall_rank ?? NaN)}</td></tr>)}</tbody></table></div>
        <Feedback>Actual − xPts remains unavailable until a verified pre-deadline forecast has been saved. No hindsight projections are substituted.</Feedback>
      </Surface></div></> : null}

    {mode === "league" ? <>
      <div className="premium-controlbar"><label>Mini-league<select value={activeLeague ?? ""} onChange={(ev) => setLeagueId(Number(ev.target.value))}>{leagueOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label></div>
      <div className="premium-kpi-grid"><ScoreCard label="My total" value={n0(entry.data?.entry.summary_overall_points ?? NaN)}/><ScoreCard label="My overall rank" value={n0(entry.data?.entry.summary_overall_rank ?? NaN)}/><ScoreCard label="League managers shown" value={n0(league.data?.standings.results.length ?? 0)} caption="Endpoint currently returns up to 20"/><ScoreCard label="Selected league" value={activeLeague ? `#${activeLeague}` : "—"}/></div>
      <Surface title="League standings and direct threats" detail="Observed standings, not simulated final ranks.">
        {league.error ? <Feedback>{league.error}</Feedback> : null}
        <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Rank</th><th>Manager</th><th>Team</th><th>Total points</th><th>Gap vs me</th><th>Next</th></tr></thead><tbody>{rankLeagueThreats(league.data?.standings.results ?? [], Number(teamId)).map((row) => <tr key={row.entryId}><td>{row.rank}</td><td>{row.name}</td><td>#{row.entryId}</td><td>{row.score}</td><td>{row.gapToMe > 0 ? `+${row.gapToMe}` : row.gapToMe}</td><td><Link className="premium-link" href={`/team/${row.entryId}`}>Compare</Link></td></tr>)}</tbody></table></div>
      </Surface><Surface title="Sampled effective ownership" detail="Visible deadline squads only; up to 12 managers. A small sample is not representative of an entire league.">
        {leagueOwnership.loading ? <Feedback>Checking publicly visible deadline picks…</Feedback> : null}
        {leagueOwnership.error ? <Feedback>{leagueOwnership.error}</Feedback> : null}
        {leagueOwnership.data ? <><Feedback>{leagueOwnership.data.note} Confirmed sample: {leagueOwnership.data.sampleSize} of {leagueOwnership.data.sampledEntries} requested.</Feedback>
          <div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Sampled ownership</th><th>Sampled effective ownership</th></tr></thead><tbody>
            {Object.entries(leagueOwnership.data.ownership).sort((left,right)=>right[1]-left[1]).slice(0,20).map(([id,ownership])=><tr key={id}><td>{elementById.get(Number(id))?.web_name ?? `#${id}`}</td><td>{n1(ownership*100)}%</td><td>{n1((leagueOwnership.data?.effectiveOwnership[Number(id)] ?? 0)*100)}%</td></tr>)}
          </tbody></table></div></> : null}
      </Surface>
    </> : null}

    {mode === "threats" && analysis ? <><div className="premium-kpi-grid"><ScoreCard label="Squad members loaded" value={String(owned.length)}/><ScoreCard label="Unowned threats" value={String(threats.filter((item) => !item.owned).length)}/><ScoreCard label="Budget (last deadline)" value={`£${n1((entry.data?.entry.last_deadline_bank ?? 0) / 10)}m`}/><ScoreCard label="Exposure source" value="Global %" caption="FPL selections, not sampled EO"/></div><div className="premium-two-col">
      <Surface title="Ownership-weighted danger" detail="Threat index = forecast GW xPts × public ownership × predicted appearance chance."><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>GW xPts</th><th>Ownership</th><th>Threat index</th></tr></thead><tbody>{threats.filter((row) => !row.owned).slice(0, 25).map((row) => <tr key={row.playerId}><td>{row.name}</td><td>{n1(row.expectedPoints)}</td><td>{n1(row.estimatedExposure)}%</td><td className="premium-emphasis">{n1(row.threatIndex)}</td></tr>)}</tbody></table></div></Surface>
      <Surface title="Feasible squad upgrades" detail="Same-position, club-cap-aware upgrades using official selling prices when the plan is available. Not universal must-own claims."><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Target</th><th>Replace</th><th>Horizon gain</th></tr></thead><tbody>{opportunities.slice(0, 25).map((move) => <tr key={`${move.targetId}:${move.outId}`}><td>{elementById.get(move.targetId)?.web_name}</td><td>{elementById.get(move.outId)?.web_name}</td><td className="premium-emphasis">+{n1(move.projectedGain)}</td></tr>)}</tbody></table></div></Surface></div></> : null}

    {mode === "captaincy" && analysis ? <><div className="premium-kpi-grid"><ScoreCard label="Top captain" value={captains[0]?.name ?? "—"} caption="Model-ranked, not guaranteed"/><ScoreCard label="GW xPts" value={n1(captains[0]?.expectedPoints ?? NaN)}/><ScoreCard label="Top captain confidence" value={`${captains[0]?.confidence ?? 0}%`}/><ScoreCard label="Risk mode" value={risk === "upside" ? "Upside" : "Balanced"}/></div>
      <Surface title="Captaincy decision table" detail="Expected points and estimated minutes availability; captain = 2×, Triple Captain = 3× if valid and selected."><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>#</th><th>Player</th><th>GW xPts</th><th>2× captain</th><th>3× TC</th><th>Selected %</th><th>Confidence</th></tr></thead><tbody>{captains.slice(0, 30).map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.name}</td><td>{n1(row.expectedPoints)}</td><td className="premium-emphasis">{n1(2 * row.expectedPoints)}</td><td>{n1(3 * row.expectedPoints)}</td><td>{n1(row.selectedPercent)}%</td><td>{row.confidence}%</td></tr>)}</tbody></table></div></Surface></> : null}

    {mode === "market" ? <><div className="premium-kpi-grid"><ScoreCard label="Players monitored" value={n0(market.length)}/><ScoreCard label="Net buyers" value={n0(market.filter((item) => item.transferBalance > 0).length)}/><ScoreCard label="Negative flow" value={n0(market.filter((item) => item.transferBalance < 0).length)}/><ScoreCard label="Forecast type" value="Demand index" caption="Price probabilities not calibrated"/></div>
      <Surface title="Price movement watch" detail="The transfer-demand index is not a calibrated probability of a price rise or fall."><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Current £m</th><th>Net transfers</th><th>Demand index</th><th>Signal</th></tr></thead><tbody>{market.filter((row) => (elementById.get(row.playerId)?.web_name ?? "").toLowerCase().includes(queryName)).slice(0, 80).map((row) => <tr key={row.playerId}><td>{elementById.get(row.playerId)?.web_name}</td><td>{n1((elementById.get(row.playerId)?.now_cost ?? 0) / 10)}</td><td>{row.transferBalance.toLocaleString()}</td><td className="premium-emphasis">{row.momentumIndex}</td><td>{row.label}</td></tr>)}</tbody></table></div></Surface></> : null}

    {mode === "injuries" ? <><div className="premium-kpi-grid"><ScoreCard label="Flagged players" value={n0(injuryList.length)}/><ScoreCard label="High risk" value={n0(injuryList.filter((row) => row.severity === "high").length)}/><ScoreCard label="Doubtful" value={n0(injuryList.filter((row) => row.status === "d").length)}/><ScoreCard label="Suspended" value={n0(injuryList.filter((row) => row.status === "s").length)}/></div><Surface title="Availability bulletin" detail="Only official FPL flags and news are shown; return dates not supplied by FPL are not invented."><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Player</th><th>Status</th><th>Playing chance</th><th>Last update</th><th>Official news</th></tr></thead><tbody>{injuryList.filter((row) => row.name.toLowerCase().includes(queryName)).slice(0, 100).map((row) => <tr key={row.id}><td>{row.name}</td><td className="premium-emphasis">{row.status.toUpperCase()}</td><td>{row.chanceNextGw === null ? "Unknown" : `${row.chanceNextGw}%`}</td><td>{row.updatedAt?.slice(0, 10) ?? "—"}</td><td>{row.news}</td></tr>)}</tbody></table></div></Surface></> : null}

    {mode === "predictions" && analysis ? <Surface title="Fixture uncertainty" detail="Blanks, doubles and unresolved kickoff times are distinguished from confident schedule predictions."><div className="premium-table-wrap"><table className="premium-table"><thead><tr><th>Club</th>{analysis.weeks.map((week) => <th key={week}>GW{week}</th>)}</tr></thead><tbody>{(bootstrap.data?.teams ?? []).map((team) => <tr key={team.id}><td>{team.short_name}</td>{analysis.weeks.map((week) => { const info = fixtureUncertainty(team.id, week, fixtures.data ?? []); return <td key={week}><span className={info.label === "double" ? "premium-emphasis" : ""}>{info.label === "single" ? n1(info.averageDifficulty ?? NaN) : info.label.toUpperCase()}</span>{info.scheduleConfidence === "pending_date" ? <span title="Kickoff pending"> *</span> : null}</td>; })}</tr>)}</tbody></table></div></Surface> : null}
    <div className="premium-footer-note">Model inputs: official FPL data, with original heuristic projections. The application does not claim access to proprietary FPLReview forecasts or private rival decisions.</div>
  </main>;
}
