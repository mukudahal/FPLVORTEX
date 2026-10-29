import { useEffect, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Check,
  Database,
  ExternalLink,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { EnrichedPlayer, Snapshot, VideoItem } from '../lib/types';
import { fetchVideos } from '../lib/api';
import { formatDate, relativeTime } from '../lib/format';
import { API_BASE, AWAY_GOALS, HOME_GOALS, PRIOR_GAMES } from '../lib/repoModel/dashboardMath';
import { MC_DRAWS } from '../lib/repoModel/monteCarlo';
import { RULES_2026_27 } from '../lib/repoModel/seasonRules';
import { DEFAULT_PRIORS, SHRINK_90S } from '../lib/repoModel/xpts';

interface MethodologyProps {
  snapshot: Snapshot;
  players: EnrichedPlayer[];
  lastSuccessAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const DATA_TIERS = [
  {
    icon: <Database size={18} />,
    title: 'Tier 1 — Primary GW7–GW16 Projections',
    text: '667 Premier League players with multi-gameweek expected minutes, expected points, and @FPLVORTEX video briefings.',
    endpoint: 'Primary projection feed',
  },
  {
    icon: <Activity size={18} />,
    title: 'Tier 2 — Live Official FPL API',
    text: 'Live bootstrap-static, fixtures, in-play scoring, manager picks, and classic league standings synchronized automatically.',
    endpoint: 'fantasy.premierleague.com/api',
  },
  {
    icon: <Layers size={18} />,
    title: 'Official PL Portrait & Crest Resolver',
    text: 'Multi-endpoint Premier League portrait and club crest chain mapped by official player code and club code with clean shirt fallbacks.',
    endpoint: 'resources.premierleague.com',
  },
  {
    icon: <ShieldCheck size={18} />,
    title: 'Tier 3 — Resilient Snapshot Fallback',
    text: 'Offline snapshot cache ensures all 380 fixtures, club badges, and player profiles stay responsive even during deadline surges.',
    endpoint: 'Resilient cache layer',
  },
];

export function Methodology({
  snapshot,
  lastSuccessAt,
  refreshing,
  onRefresh,
}: MethodologyProps) {
  const [videos, setVideos] = useState<VideoItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetchVideos(controller.signal)
      .then((res) => setVideos(res.videos))
      .catch(() => setVideos([]));
    return () => controller.abort();
  }, []);

  // Current projections are not historical outcomes. The original app has no
  // verified frozen forecast/outcome feed yet; do not manufacture a history
  // from projections, dates or expected minutes. Wire an audited archive here
  // before reporting historical errors or validated calibration parameters.

  return (
    <div className="page page--method">
      <section className="panel method-hero">
        <div>
          <span className="panel__eyebrow">MODEL & AUTOMATION · SEASON {snapshot.meta.season}</span>
          <h3>A model you can inspect. Infrastructure that fails gracefully.</h3>
          <p>
            Every projection, 2026/27 DEFCON probability, Poisson goal rate, banked-transfer valuation, chip horizon
            matrix, and 3,000-draw Monte Carlo simulation is transparent, deterministic, and built to stay online.
          </p>
          <div className="button-row" style={{ marginTop: 16 }}>
            <button type="button" className="button button--primary" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing data…' : 'Refresh live pipeline'}
            </button>
          </div>
        </div>
        <div className="method-orb" aria-hidden="true">
          <BrainCircuit size={44} />
        </div>
      </section>

      {/* Data Provenance & Source Hierarchy */}
      <section className="panel data-sources-panel">
        <div className="panel__header">
          <div>
            <span className="panel__eyebrow">SOURCE-OF-TRUTH HIERARCHY (`docs/CLONE-SOURCE-MAP.md`)</span>
            <h3>Three-tier repository-first data pipeline</h3>
          </div>
          <span className="badge badge--mint">
            {snapshot.meta.upstreamOk ? 'Live + Repo Active' : 'Repo Primary · Offline Supplement'}
          </span>
        </div>
        <div className="data-source-grid">
          {DATA_TIERS.map((tier) => (
            <article key={tier.title} className="data-source-card">
              <div className="data-source-card__icon">{tier.icon}</div>
              <h4>{tier.title}</h4>
              <p>{tier.text}</p>
              <code>{tier.endpoint}</code>
            </article>
          ))}
        </div>
      </section>

      {/* Exact Repository Math Equations & Constants */}
      <div className="method-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">PLAYER FORECASTING (`site/model/playerModel.ts`)</span>
              <h3>Empirical-Bayes + 2026/27 DEFCON Equations</h3>
            </div>
            <Sparkles size={17} />
          </div>
          <ul className="reason-list">
            <li>
              <strong>Empirical-Bayes Shrinkage (`SHRINK_90S = {SHRINK_90S}`):</strong> Position priors shrink early-season
              rates with weight <code>w = n90 / (n90 + {SHRINK_90S})</code>; attacking signal blends{' '}
              <code>0.75 × xG + 0.25 × goals</code> and <code>0.75 × xA + 0.25 × assists</code>.
            </li>
            <li>
              <strong>Fixture & Venue Multipliers:</strong> Venue factor <code>1.06 (Home) / 0.94 (Away)</code>; attack
              FDR slope <code>1 + (3 − diff) × 0.11</code>; defence FDR slope <code>1 + (diff − 3) × 0.14</code>.
            </li>
            <li>
              <strong>2026/27 DEFCON Scoring (`RULES_2026_27` + `playerModel.ts`):</strong> Negative-Binomial tail (<code>r = 20</code>) awards{' '}
              <code>+2 pts</code> at <code>≥10</code> CBIs for DEF and{' '}
              <code>≥12</code> CBIRTs for MID/FWD.
            </li>
            <li>
              <strong>Minutes Distribution (`site/model/minutes.ts`):</strong> Blends{' '}
              <code>0.62 × startRate + 0.38 × minuteShare</code> across conditional <code>85 min</code> starter /{' '}
              <code>24 min</code> cameo states.
            </li>
            <li>
              <strong>Opta xP (`7_skills/fpl-team-planner.skill`):</strong>{' '}
              <code>pts = 2 + goalPts·xG90·att + 3·xA90·att + csPts·min(0.6, cs90·def) + 0.6·bonus90</code> weighted by
              availability over 5 GWs.
            </li>
          </ul>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">SOLVER, CHIPS & MONTE CARLO</span>
              <h3>Transfer ILP, Banked FT & Stochastic Simulation</h3>
            </div>
            <BrainCircuit size={17} />
          </div>
          <ul className="reason-list">
            <li>
              <strong>Match Poisson Model (`dashboardMath.ts`):</strong> <code>API_BASE = {API_BASE}</code>,{' '}
              <code>HOME_GOALS = {HOME_GOALS}</code>, <code>AWAY_GOALS = {AWAY_GOALS}</code>,{' '}
              <code>PRIOR_GAMES = {PRIOR_GAMES}</code>, <code>P(CS) = exp(−λ_against)</code>.
            </li>
            <li>
              <strong>Multi-GW Discounted Objective (`solver.py`):</strong>{' '}
              <code>J(S) = XI_next + Cap_next + ∑ (0.10·xP_next + 0.35·∑ 0.88^i·xP_t+i)</code> under{' '}
              <code>≤£100.0m</code>, <code>2-5-5-3</code>, and <code>≤{RULES_2026_27.maxPerClub}/club</code>.
            </li>
            <li>
              <strong>Banked FT Valuation (`optimizer.ts`):</strong> Rolling (`1..{RULES_2026_27.maxFreeTransfers} FT` cap)
              values a banked transfer at <code>clamp(0.65 × ΔGW2, 1.15, 2.60)</code> xPts; hits cost{' '}
              <code>−{RULES_2026_27.hitCost} pts</code>.
            </li>
            <li>
              <strong>Half-Season Chip Matrix:</strong> All 4 chips reset after <code>GW{RULES_2026_27.chipHalfBoundary}</code>;
              meaningful EV thresholds: <code>WC ≥ 6.0</code>, <code>FH ≥ 8.0</code>, <code>BB ≥ 10.0</code>,{' '}
              <code>TC ≥ 5.0</code> xPts.
            </li>
            <li>
              <strong>Paired Monte Carlo (`MC_DRAWS = {MC_DRAWS.toLocaleString()}`):</strong> Common random numbers across
              Hold, 1FT, 2FT, and Peak Wildcard with official FPL auto-substitutions and vice-captain promotion.
            </li>
          </ul>
        </section>
      </div>

      {/* Live Forecast Science & Position Priors */}
      <div className="method-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">FORECAST VALIDATION</span>
              <h3>Historical prediction accuracy status</h3>
            </div>
            <Check size={17} />
          </div>
          <div className="system-status-grid">
            <div className="status-tile">
              <span>Verified Samples</span>
              <strong>Not yet verified</strong>
              <small>0 connected verified pairs</small>
            </div>
            <div className="status-tile">
              <span>Historical MAE</span>
              <strong>Not yet verified</strong>
            </div>
            <div className="status-tile">
              <span>Historical RMSE</span>
              <strong>Not yet verified</strong>
            </div>
            <div className="status-tile">
              <span>Calibration</span>
              <strong>Not yet verified</strong>
            </div>
          </div>
          <p className="muted-copy" style={{ marginTop: 12 }}>
            Historical accuracy requires forecasts saved before their official deadline and matched to finalized
            official points and minutes. Comparing two projections does not verify prediction accuracy.{' '}
            Default Empirical-Bayes Position Priors: GKP ({DEFAULT_PRIORS[1].saves} saves/90), DEF (
            {DEFAULT_PRIORS[2].defc} DEFCON/90, {DEFAULT_PRIORS[2].goals} G/90), MID ({DEFAULT_PRIORS[3].goals} G/90,{' '}
            {DEFAULT_PRIORS[3].assists} A/90), FWD ({DEFAULT_PRIORS[4].goals} G/90, {DEFAULT_PRIORS[4].assists} A/90) ·
            Last sync {lastSuccessAt ? relativeTime(lastSuccessAt) : 'active'}.
          </p>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">ENGINE RUNTIME METADATA</span>
              <h3>Repository asset & rule verification</h3>
            </div>
            <Database size={17} />
          </div>
          <div className="player-modal__stats">
            <div><span>Manager Privacy</span><strong>Private Per-Browser ID</strong></div>
            <div><span>Repo CSV Players</span><strong>{snapshot.meta.repoData?.benchmarkPlayers ?? 667}</strong></div>
            <div><span>Fixtures Indexed</span><strong>{snapshot.fixtures.length}</strong></div>
            <div><span>Season Rules</span><strong>{RULES_2026_27.season} (5 FT cap)</strong></div>
            <div><span>Active Source</span><strong>{snapshot.meta.source.toUpperCase()}</strong></div>
            <div><span>@FPLVORTEX Videos</span><strong>{snapshot.meta.repoData?.videosCount ?? videos.length}</strong></div>
          </div>
        </section>
      </div>

      {/* @FPLVORTEX Channel Briefing Archive */}
      {videos.length > 0 && (
        <section className="panel" aria-label="FPL VORTEX YouTube briefings">
          <div className="panel__header">
            <div>
              <span className="panel__eyebrow">@FPLVORTEX YOUTUBE CHANNEL</span>
              <h3>@FPLVORTEX Video Briefings ({videos.length})</h3>
            </div>
            <a
              href="https://www.youtube.com/@Fplvortex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-button"
            >
              Open YouTube channel <ExternalLink size={14} />
            </a>
          </div>
          <div className="videos-grid">
            {videos.slice(0, 9).map((video) => (
              <a
                key={video.id}
                href={video.url}
                target="_blank"
                rel="noreferrer"
                className="video-card"
              >
                <div className="video-card__head">
                  <span className="badge badge--violet"><Play size={11} /> Video</span>
                  <small>{formatDate(video.published)}</small>
                </div>
                <strong>{video.title}</strong>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

