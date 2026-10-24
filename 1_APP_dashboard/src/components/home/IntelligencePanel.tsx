"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PlayerPhoto } from "@/components/PlayerPhoto";
import { TeamBadge } from "@/components/TeamBadge";
import { analyzeIntelligence, type PlayerIntelligence } from "@/lib/intelligence";
import { POSITIONS } from "@/lib/helpers";
import type { Fixture, SlimBootstrap } from "@/lib/types";

const DISPLAY_COUNT = 8;
type SortMode = "total" | "next" | "value" | "upside";

function riskClass(risk: PlayerIntelligence["risk"]): string {
  return risk === "LOW" ? "intel-risk-low" : risk === "MEDIUM" ? "intel-risk-medium" : "intel-risk-high";
}

function ProjectionRow({ item, weeks }: { item: PlayerIntelligence; weeks: number[] }) {
  return (
    <div className="intel-player-row" role="row">
      <div className="intel-player-identity" role="cell">
        <div className="intel-player-photo"><PlayerPhoto code={item.player.code} alt={item.player.web_name} className="h-12 w-10" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-bold">{item.player.web_name}</span>
            <TeamBadge code={item.team?.code} shortName={item.team?.short_name ?? ""} className="h-4 w-4" />
          </div>
          <div className="intel-subtext">{item.team?.short_name ?? "—"} · {POSITIONS[item.player.element_type]} · £{(item.player.now_cost / 10).toFixed(1)}m</div>
        </div>
      </div>
      <div className="intel-forecast-grid" role="cell">
        {weeks.map((week, index) => {
          const points = item.weeklyXPts[index] ?? 0;
          return (
            <div key={week} className={`intel-forecast-cell ${points >= 6 ? "intel-heat-strong" : points >= 4 ? "intel-heat-medium" : points <= 1 ? "intel-heat-low" : ""}`} title={`GW${week}: ${item.fixtureLabels[index]} · ${points.toFixed(2)} model xPts`}>
              <span className="intel-forecast-number">{points.toFixed(1)}</span>
              <span className="intel-forecast-fixture">{item.fixtureLabels[index] ?? "—"}</span>
            </div>
          );
        })}
      </div>
      <div className="intel-total" role="cell">{item.totalXPts.toFixed(1)}<span>xPts</span></div>
      <div className="intel-minutes" role="cell"><span>{item.minutesChance}%</span><small className={riskClass(item.risk)}>{item.risk}</small></div>
    </div>
  );
}

export function IntelligencePanel({ bootstrap, fixtures }: { bootstrap: SlimBootstrap; fixtures: Fixture[] }) {
  const [horizon, setHorizon] = useState(5);
  const [position, setPosition] = useState(0);
  const [sort, setSort] = useState<SortMode>("total");
  const [showSafe, setShowSafe] = useState(false);

  const intelligence = useMemo(
    () => analyzeIntelligence(bootstrap, fixtures, horizon),
    [bootstrap, fixtures, horizon],
  );
  const ranked = useMemo(() => {
    const list = intelligence.players.filter((item) =>
      (position === 0 || item.player.element_type === position) && (!showSafe || item.risk === "LOW")
    );
    return list.sort((left, right) => {
      if (sort === "next") return right.nextXPts - left.nextXPts;
      if (sort === "value") return right.valuePerMillion - left.valuePerMillion;
      if (sort === "upside") return (right.totalXPts * (1 - right.ownership / 100)) - (left.totalXPts * (1 - left.ownership / 100));
      return right.totalXPts - left.totalXPts;
    }).slice(0, DISPLAY_COUNT);
  }, [intelligence, position, showSafe, sort]);

  return (
    <section className="intel-shell" aria-label="Vortex prediction intelligence">
      <div className="intel-toolbar">
        <div>
          <div className="intel-overline"><span className="intel-indicator" /> MODEL LAB / {intelligence.nextGw}—{intelligence.weeks.at(-1)} <span className="intel-overline-dim">· INDEPENDENT PROJECTIONS</span></div>
          <h2>Decision intelligence <span className="intel-title-accent">/ xPts Lab</span></h2>
          <p>Fixture-adjusted expected points, availability risk and transfer targets from the existing Vortex model.</p>
        </div>
        <Link href="/planner" className="intel-outline-link">Open multi-GW planner <span aria-hidden="true">↗</span></Link>
      </div>

      <div className="intel-captains">
        <div className="intel-captain-heading"><span>CAPTAINCY RADAR</span><span>GW {intelligence.nextGw}</span></div>
        <div className="intel-captain-cards">
          {intelligence.captainCandidates.map((item, index) => (
            <div className="intel-captain-card" key={item.player.id}>
              <div className="intel-captain-rank">0{index + 1}</div>
              <PlayerPhoto code={item.player.code} alt={item.player.web_name} className="h-[72px] w-[58px] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="intel-captain-name">{item.player.web_name}</div>
                <div className="intel-subtext">{item.team?.short_name} · {item.fixtureLabels[0]}</div>
                <div className="intel-captain-meta">{item.minutesChance}% play chance · {item.confidence}% model confidence</div>
              </div>
              <div className="intel-captain-value">{item.nextXPts.toFixed(1)}<small>xPts</small></div>
            </div>
          ))}
        </div>
      </div>

      <div className="intel-table-controls">
        <div className="intel-controls-group" aria-label="Projection horizon">
          {[1, 3, 5].map((weeks) => (
            <button type="button" key={weeks} aria-pressed={horizon === weeks} onClick={() => setHorizon(weeks)}>{weeks} GW</button>
          ))}
        </div>
        <div className="intel-controls-group" aria-label="Player position">
          {[[0, "All"], [1, "GK"], [2, "DEF"], [3, "MID"], [4, "FWD"]].map(([value, label]) => (
            <button type="button" key={value} aria-pressed={position === value} onClick={() => setPosition(Number(value))}>{label}</button>
          ))}
        </div>
        <label className="intel-filter-label">Rank by <select aria-label="Rank model players" value={sort} onChange={(event) => setSort(event.target.value as SortMode)}>
          <option value="total">Total xPts</option>
          <option value="next">Next GW</option>
          <option value="value">Value / £m</option>
          <option value="upside">Differential upside</option>
        </select></label>
        <label className="intel-safe-toggle"><input type="checkbox" checked={showSafe} onChange={(event) => setShowSafe(event.target.checked)} /> Low risk only</label>
      </div>
      <div className="intel-table-scroll" role="table" aria-label="Player projected points by gameweek">
        <div className="intel-table-head" role="row">
          <div role="columnheader">PLAYER / CLUB</div>
          <div className="intel-week-headings" role="columnheader">{intelligence.weeks.map((gw) => <span key={gw}>GW {gw}</span>)}</div>
          <div role="columnheader">TOTAL</div><div role="columnheader">AVAIL.</div>
        </div>
        {ranked.map((item) => <ProjectionRow key={item.player.id} item={item} weeks={intelligence.weeks} />)}
        {ranked.length === 0 ? <div className="intel-empty">No players match this combination of filters.</div> : null}
      </div>
      <div className="intel-footnote">
        <span><span className="intel-indicator" /> {intelligence.players.length} players · {intelligence.matchCount} fixtures · refreshes with the FPL feed</span>
        <span>Model estimates, not guaranteed points · independent of FPLReview</span>
      </div>
    </section>
  );
}
