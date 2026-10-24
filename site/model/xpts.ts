import type {
  BacktestMetrics,
  EntryHistory,
  Fixture,
  LiveResponse,
  Pick,
  PlayerXPtsBreakdown,
  SlimElement,
  SlimTeam,
  Transfer,
} from "./types";

import { nextFreeTransfers, sellingPrice } from "./scoring";
import { estimateMinutesDistribution, type MinutesEvidence } from "./minutes";
import { expectedFixturePoints, type FixtureExpectation, type PlayerFixtureModel } from "./playerModel";

/** Per-90 league-average rates for one position, used to shrink small samples. */
export interface PositionPrior {
  xg: number; goals: number; xa: number; assists: number; xgc: number; cs: number;
  bonus: number; bps: number; defc: number; saves: number; yc: number; rc: number;
}
export type PositionPriors = Record<number, PositionPrior>;

/** Provisional fallback position rates, not a historically fitted production model.
 * Callers pass computePositionPriors(elements) to use their current snapshot. */
export const DEFAULT_PRIORS: PositionPriors = {
  1: { xg: 0.0, goals: 0.0, xa: 0.003, assists: 0.008, xgc: 1.515, cs: 0.271, bonus: 0.254, bps: 15.737, defc: 0.0, saves: 2.949, yc: 0.034, rc: 0.0 },
  2: { xg: 0.067, goals: 0.058, xa: 0.058, assists: 0.072, xgc: 1.522, cs: 0.27, bonus: 0.214, bps: 13.194, defc: 7.639, saves: 0.0, yc: 0.182, rc: 0.006 },
  3: { xg: 0.167, goals: 0.169, xa: 0.128, assists: 0.177, xgc: 1.511, cs: 0.313, bonus: 0.319, bps: 20.727, defc: 8.276, saves: 0.0, yc: 0.189, rc: 0.009 },
  4: { xg: 0.455, goals: 0.353, xa: 0.065, assists: 0.189, xgc: 1.541, cs: 0.304, bonus: 0.501, bps: 19.803, defc: 4.392, saves: 0.0, yc: 0.222, rc: 0.008 },
};

/** Pseudo-evidence, in full 90s, given to the position average before a player's own data. */
export const SHRINK_90S = 4;

/**
 * Minutes-weighted per-90 averages by position across all players with minutes.
 * Computed from the data in hand, so it adapts to a new season or rule change.
 */
export function computePositionPriors(elements: SlimElement[]): PositionPriors {
  const acc: Record<number, Record<keyof PositionPrior, number> & { n90: number }> = {};
  for (const el of elements) {
    if (el.element_type > 4 || el.minutes <= 0) continue;
    const a = (acc[el.element_type] ??= {
      xg: 0, goals: 0, xa: 0, assists: 0, xgc: 0, cs: 0, bonus: 0, bps: 0, defc: 0,
      saves: 0, yc: 0, rc: 0, n90: 0,
    });
    a.n90 += el.minutes / 90;
    a.xg += parseFloat(el.expected_goals) || 0;
    a.goals += el.goals_scored;
    a.xa += parseFloat(el.expected_assists) || 0;
    a.assists += el.assists;
    a.xgc += parseFloat(el.expected_goals_conceded) || 0;
    a.cs += el.clean_sheets;
    a.bonus += el.bonus;
    a.bps += el.bps;
    a.defc += el.defensive_contribution;
    a.saves += el.saves;
    a.yc += el.yellow_cards;
    a.rc += el.red_cards;
  }
  const out: PositionPriors = {};
  for (const pos of [1, 2, 3, 4]) {
    const a = acc[pos];
    const d = a && a.n90 > 0 ? a.n90 : 0;
    const rate = (v: number | undefined, fallback: number) => (d > 0 && v !== undefined ? v / d : fallback);
    const f = DEFAULT_PRIORS[pos];
    out[pos] = {
      xg: rate(a?.xg, f.xg), goals: rate(a?.goals, f.goals), xa: rate(a?.xa, f.xa),
      assists: rate(a?.assists, f.assists), xgc: rate(a?.xgc, f.xgc), cs: rate(a?.cs, f.cs),
      bonus: rate(a?.bonus, f.bonus), bps: rate(a?.bps, f.bps), defc: rate(a?.defc, f.defc),
      saves: rate(a?.saves, f.saves), yc: rate(a?.yc, f.yc), rc: rate(a?.rc, f.rc),
    };
  }
  return out;
}

/** Posterior rate: the player's own total blended with the position average. */
function shrink(total: number, nineties: number, priorRate: number): number {
  return (total + priorRate * SHRINK_90S) / (nineties + SHRINK_90S);
}

export function estimateMinutesProb(el: SlimElement, teamGamesPlayed: number, gwOffset = 0): { p60: number; pSub: number; confidence: number } {
  const { p60, pSub, confidence } = estimateMinutesDistribution(el, teamGamesPlayed, gwOffset);
  return { p60, pSub, confidence };
}

/**
 * Compute expected points (xPts) breakdown for a single player in a given GW.
 * Uses per-90 xG, xA, xGC, clean sheets, saves, bonus, defensive contribution, cards,
 * fixture difficulty, home/away, injury status, and fixture count (blanks & doubles).
 */
export function computePlayerXPts(
  el: SlimElement,
  gw: number,
  fixtures: Fixture[],
  teamsMap: Map<number, SlimTeam>,
  teamGamesPlayed = 5,
  gwOffset = 0,
  priors: PositionPriors = DEFAULT_PRIORS,
  minutesEvidence?: MinutesEvidence,
): PlayerXPtsBreakdown {
  const epNext = parseFloat(el.ep_next) || 0;
  const teamFixtures = fixtures.filter(
    (f) => f.event === gw && (f.team_h === el.team || f.team_a === el.team),
  );

  if (teamFixtures.length === 0 || el.element_type > 4) {
    return {
      elementId: el.id,
      gw,
      p60: 0,
      pSub: 0,
      appearancePts: 0,
      goalPts: 0,
      assistPts: 0,
      cleanSheetPts: 0,
      bonusPts: 0,
      defensivePts: 0,
      savePts: 0,
      cardPts: 0,
      csProb: 0,
      xPts: 0,
      epNext,
      confidence: 88,
      fixtureCount: 0,
      fixturesLabel: "BLANK",
      fixtureModels: [],
      otherPts: 0,
    };
  }

  const minutes = estimateMinutesDistribution(el, teamGamesPlayed, gwOffset, minutesEvidence);
  const { p60, pSub, confidence } = minutes;
  const n90 = el.minutes / 90;
  const pr = priors[el.element_type] ?? DEFAULT_PRIORS[el.element_type] ?? DEFAULT_PRIORS[3];

  // Every per-90 rate is shrunk toward the position average so a handful of minutes can't
  // produce an extreme rate. Players with a full season of data are barely affected.
  const xg90 = shrink(parseFloat(el.expected_goals) || 0, n90, pr.xg);
  const xa90 = shrink(parseFloat(el.expected_assists) || 0, n90, pr.xa);
  const xgc90 = shrink(parseFloat(el.expected_goals_conceded) || 0, n90, pr.xgc);
  const actualG90 = shrink(el.goals_scored, n90, pr.goals);
  const actualA90 = shrink(el.assists, n90, pr.assists);

  // Blend xG/90 (75%) with actual finishing/90 (25%)
  const blendedG90 = 0.75 * xg90 + 0.25 * actualG90;
  const blendedA90 = 0.75 * xa90 + 0.25 * actualA90;

  const bonus90 = shrink(el.bonus, n90, pr.bonus);
  const bps90 = shrink(el.bps, n90, pr.bps);
  const expectedBonusPer90 = 0.65 * bonus90 + 0.35 * Math.min(2.0, Math.max(0, (bps90 - 14) / 12));

  const saves90 = shrink(el.saves, n90, pr.saves);
  const yc90 = Math.min(0.45, shrink(el.yellow_cards, n90, pr.yc));
  const rc90 = Math.min(0.06, shrink(el.red_cards, n90, pr.rc));
  const csObs90 = shrink(el.clean_sheets, n90, pr.cs);

  const fixtureModels: PlayerFixtureModel[] = [];
  const labels: string[] = [];
  const totals: FixtureExpectation = { appearancePts: 0, goalPts: 0, assistPts: 0, cleanSheetPts: 0, bonusPts: 0, defensivePts: 0, savePts: 0, cardPts: 0, otherPts: 0 };
  let csProbSum = 0;
  for (const fx of [...teamFixtures].sort((first, second) => first.id - second.id)) {
    const isHome = fx.team_h === el.team;
    const difficulty = isHome ? fx.team_h_difficulty : fx.team_a_difficulty;
    if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 5) throw new RangeError("Invalid fixture difficulty.");
    const opponent = teamsMap.get(isHome ? fx.team_a : fx.team_h);
    labels.push(`${opponent?.short_name ?? "?"} (${isHome ? "H" : "A"})`);
    const attackMultiplier = (isHome ? 1.06 : 0.94) * (1 + (3 - difficulty) * 0.11);
    const defenseMultiplier = (isHome ? 0.91 : 1.09) * (1 + (difficulty - 3) * 0.14);
    const conceded = Math.max(0.45, xgc90 * defenseMultiplier);
    const fullMatchCleanSheet = 0.7 * Math.exp(-conceded) + 0.3 * Math.min(0.6, csObs90);
    const model: PlayerFixtureModel = {
      fixtureId: fx.id, position: el.element_type, minutes,
      goals90: blendedG90 * attackMultiplier,
      assists90: blendedA90 * attackMultiplier,
      conceded90: -Math.log(fullMatchCleanSheet),
      saves90: saves90 * (1 + (difficulty - 3) * 0.14),
      bonus90: expectedBonusPer90 * (0.5 + 0.5 * (1 + (3 - difficulty) * 0.11)),
      defensiveActions90: shrink(el.defensive_contribution, n90, pr.defc),
      defensiveDispersion: 20,
      yellow90: yc90, red90: rc90,
      ownGoals90: shrink(el.own_goals ?? 0, n90, 0),
      penaltyMisses90: shrink(el.penalties_missed ?? 0, n90, 0),
      penaltySaves90: shrink(el.penalties_saved ?? 0, n90, 0),
    };
    const expectation = expectedFixturePoints(model);
    for (const component of Object.keys(totals) as (keyof FixtureExpectation)[]) totals[component] += expectation[component];
    fixtureModels.push(model);
    csProbSum += el.element_type <= 3 ? Math.exp(-model.conceded90 * minutes.minutes60 / 90) : 0;
  }
  const { appearancePts, goalPts, assistPts, cleanSheetPts, bonusPts, defensivePts, savePts, cardPts, otherPts } = totals;
  const xPts = Math.round(Object.values(totals).reduce((sum, points) => sum + points, 0) * 100) / 100;

  return {
    elementId: el.id,
    gw,
    p60,
    pSub,
    appearancePts: Math.round(appearancePts * 100) / 100,
    goalPts: Math.round(goalPts * 100) / 100,
    assistPts: Math.round(assistPts * 100) / 100,
    cleanSheetPts: Math.round(cleanSheetPts * 100) / 100,
    bonusPts: Math.round(bonusPts * 100) / 100,
    defensivePts: Math.round(defensivePts * 100) / 100,
    savePts: Math.round(savePts * 100) / 100,
    cardPts: Math.round(cardPts * 100) / 100,
    csProb: Math.round((csProbSum / teamFixtures.length) * 1000) / 1000,
    xPts,
    epNext,
    confidence,
    fixtureCount: teamFixtures.length,
    fixturesLabel: labels.join(", "),
    fixtureModels,
    otherPts: Math.round(otherPts * 100) / 100,
  };
}

/**
 * Compute official FPL selling price & purchase price for each player in the squad.
 * Uses transfer history (most recent element_in_cost) or GW1 starting price (now_cost - cost_change_start),
 * then applies the 50% profit retention rule (floored to 0.1m).
 */
export function computeSellingPrices(
  picks: Pick[],
  transfers: Transfer[],
  elementsMap: Map<number, SlimElement>,
): { sellingPrices: Record<number, number>; purchasePrices: Record<number, number> } {
  const latestBuy = new Map<number, number>();
  // Sort transfers chronologically so later purchases overwrite earlier ones
  const sorted = [...transfers].sort((a, b) => a.event - b.event);
  for (const t of sorted) {
    latestBuy.set(t.element_in, t.element_in_cost);
  }

  const sellingPrices: Record<number, number> = {};
  const purchasePrices: Record<number, number> = {};

  for (const p of picks) {
    const el = elementsMap.get(p.element);
    if (!el) continue;
    const startCost = el.now_cost - (el.cost_change_start ?? 0);
    const purchase = latestBuy.get(el.id) ?? startCost;
    purchasePrices[el.id] = purchase;
    sellingPrices[el.id] = sellingPrice(purchase, el.now_cost);
  }
  return { sellingPrices, purchasePrices };
}

/**
 * Compute how many free transfers the manager currently has banked for the upcoming GW (1..5).
 */
export function computeFreeTransfers(
  history: EntryHistory,
  startedEvent = 1,
): number {
  const gws = [...history.current].sort((a, b) => a.event - b.event);
  const chipEvents = new Map<number, string>();
  for (const c of history.chips) chipEvents.set(c.event, c.name);

  let ft = 1;
  for (const g of gws) {
    if (g.event <= startedEvent) {
      ft = 1;
      continue;
    }
    const chip = chipEvents.get(g.event);
    if (chip === "wildcard" || chip === "freehit") {
      // Modern FPL rule (2024/25+): WC and FH preserve banked FTs
      ft = nextFreeTransfers(ft, 0, chip === "wildcard" ? "wc" : "fh");
    } else {
      const used = g.event_transfers ?? 0;
      ft = nextFreeTransfers(ft, used);
    }
  }
  return Math.max(1, Math.min(5, ft));
}

interface CumStats {
  minutes: number; starts: number; goals: number; assists: number; cs: number;
  bonus: number; bps: number; saves: number; yellow: number; red: number;
  xg: number; xa: number; xgc: number; defc: number; points: number; apps: number;
  ownGoals: number; penaltySaves: number; penaltyMisses: number;
}

const emptyCum = (): CumStats => ({
  minutes: 0, starts: 0, goals: 0, assists: 0, cs: 0, bonus: 0, bps: 0, saves: 0,
  yellow: 0, red: 0, xg: 0, xa: 0, xgc: 0, defc: 0, points: 0, apps: 0, ownGoals: 0, penaltySaves: 0, penaltyMisses: 0,
});

/** A player as they stood BEFORE a gameweek: stats rebuilt from earlier gameweeks only. */
function asOfElement(el: SlimElement, c: CumStats): SlimElement {
  const nineties = c.minutes / 90;
  const per90 = (v: number) => (nineties > 0 ? v / nineties : 0);
  return {
    ...el,
    minutes: c.minutes,
    starts: c.starts,
    goals_scored: c.goals,
    assists: c.assists,
    clean_sheets: c.cs,
    saves: c.saves,
    bonus: c.bonus,
    bps: c.bps,
    yellow_cards: c.yellow,
    red_cards: c.red,
    total_points: c.points,
    defensive_contribution: c.defc,
    own_goals: c.ownGoals,
    penalties_saved: c.penaltySaves,
    penalties_missed: c.penaltyMisses,
    defensive_contribution_per_90: per90(c.defc),
    clean_sheets_per_90: per90(c.cs),
    saves_per_90: per90(c.saves),
    expected_goals: c.xg.toFixed(2),
    expected_assists: c.xa.toFixed(2),
    expected_goals_conceded: c.xgc.toFixed(2),
    expected_goals_per_90: per90(c.xg),
    expected_assists_per_90: per90(c.xa),
    expected_goals_conceded_per_90: per90(c.xgc),
    // Injury / availability flags are not known historically: treat everyone as available.
    status: "a",
    chance_of_playing_next_round: null,
    chance_of_playing_this_round: null,
    ep_next: "0",
    points_per_game: c.apps > 0 ? (c.points / c.apps).toFixed(2) : "0",
  };
}

function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const r = new Array<number>(xs.length);
    for (let k = 0; k < idx.length; ) {
      let m = k;
      while (m + 1 < idx.length && idx[m + 1].v === idx[k].v) m++;
      const avg = (k + m) / 2 + 1;
      for (let t = k; t <= m; t++) r[idx[t].i] = avg;
      k = m + 1;
    }
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/** One scored prediction; exposed so model changes can be diagnosed by position or component. */
export interface BacktestSample {
  id: number;
  pos: number;
  gw: number;
  actual: number;
  breakdown: PlayerXPtsBreakdown;
}

/** Gameweeks of history required before a gameweek is scored (1 GW of stats is mostly noise). */
const BACKTEST_MIN_HISTORY = 2;

/**
 * Reconstructed-stats diagnostic, not a point-in-time benchmark: player/fixture metadata
 * may be current and historical availability is unavailable. Earlier cumulative stats are scored
 * against the real points. Players are chosen without looking at the outcome (>= 90 minutes
 * played before the gameweek, and their team has a fixture), so players who then didn't
 * play are scored too. The bar to beat is the stronger of two naive baselines.
 * `predict` is overridable so model versions can be compared on identical data.
 */
export function runBacktest(
  elements: SlimElement[],
  fixtures: Fixture[],
  teamsMap: Map<number, SlimTeam>,
  liveByGw: Map<number, LiveResponse>,
  predict: typeof computePlayerXPts = computePlayerXPts,
  onSample?: (s: BacktestSample) => void,
): BacktestMetrics {
  const gwsAll = [...liveByGw.keys()].sort((a, b) => a - b);
  const empty = (verdict: string): BacktestMetrics => ({
    gwsTested: [],
    sampleSize: 0,
    mae: 0,
    rmse: 0,
    epNextMae: 0,
    within2PtsPct: 0,
    rankCorrelation: 0,
    quality: "moderate",
    method: "reconstructed-history",
    historicalContextComplete: false,
    verdict,
  });
  if (gwsAll.length <= BACKTEST_MIN_HISTORY) {
    return empty(
      `Walk-forward backtest needs more than ${BACKTEST_MIN_HISTORY} completed gameweeks of history; only ${gwsAll.length} available.`,
    );
  }

  const cum = new Map<number, CumStats>();
  const gwsTested: number[] = [];
  const preds: number[] = [];
  const actuals: number[] = [];
  let absErr = 0, sqErr = 0, baseAErr = 0, baseBErr = 0, within2 = 0;
  let priorGws = 0;

  for (const gw of gwsAll) {
    const live = liveByGw.get(gw);
    if (!live) continue;

    if (priorGws >= BACKTEST_MIN_HISTORY) {
      let testedAny = false;
      const actualPts = new Map<number, number>();
      for (const item of live.elements) actualPts.set(item.id, item.stats.total_points);

      // Everything below uses only information from before this gameweek, including the
      // position averages used for shrinkage.
      const asOf = new Map<number, SlimElement>();
      for (const el of elements) asOf.set(el.id, asOfElement(el, cum.get(el.id) ?? emptyCum()));
      const priors = computePositionPriors([...asOf.values()]);

      for (const el of elements) {
        if (el.element_type > 4) continue;
        const c = cum.get(el.id);
        if (!c || c.minutes < 90) continue; // chosen from the past only
        const p = predict(asOf.get(el.id) as SlimElement, gw, fixtures, teamsMap, priorGws, 0, priors);
        if (p.fixtureCount === 0) continue;

        const actual = actualPts.get(el.id) ?? 0;
        const err = Math.abs(p.xPts - actual);
        absErr += err;
        sqErr += err * err;
        if (err <= 2) within2++;
        baseAErr += Math.abs((c.apps > 0 ? c.points / c.apps : 0) - actual); // points per appearance
        baseBErr += Math.abs(c.points / priorGws - actual); // points per gameweek elapsed
        preds.push(p.xPts);
        actuals.push(actual);
        onSample?.({ id: el.id, pos: el.element_type, gw, actual, breakdown: p });
        testedAny = true;
      }
      if (testedAny) gwsTested.push(gw);
    }

    // Only now fold this gameweek into the history.
    for (const item of live.elements) {
      const st = item.stats;
      const c = cum.get(item.id) ?? emptyCum();
      c.minutes += st.minutes;
      c.starts += st.starts ?? 0;
      c.goals += st.goals_scored;
      c.assists += st.assists;
      c.cs += st.clean_sheets;
      c.bonus += st.bonus;
      c.bps += st.bps;
      c.saves += st.saves;
      c.yellow += st.yellow_cards;
      c.red += st.red_cards;
      c.xg += parseFloat(st.expected_goals ?? "0") || 0;
      c.xa += parseFloat(st.expected_assists ?? "0") || 0;
      c.xgc += parseFloat(st.expected_goals_conceded ?? "0") || 0;
      c.defc += st.defensive_contribution ?? 0;
      c.points += st.total_points;
      c.ownGoals += st.own_goals ?? 0;
      c.penaltySaves += st.penalties_saved ?? 0;
      c.penaltyMisses += st.penalties_missed ?? 0;
      if (st.minutes > 0) c.apps += 1;
      cum.set(item.id, c);
    }
    priorGws++;
  }

  const n = preds.length;
  if (n === 0) return empty("Insufficient player appearances to score the walk-forward backtest.");

  const r2 = (x: number) => Math.round(x * 100) / 100;
  const mae = r2(absErr / n);
  const rmse = r2(Math.sqrt(sqErr / n));
  const baseA = r2(baseAErr / n);
  const baseB = r2(baseBErr / n);
  const baselineMae = Math.min(baseA, baseB);
  const baselineName = baseA <= baseB ? "points per appearance" : "points per gameweek";
  const within2PtsPct = Math.round((within2 / n) * 100);
  const rho = r2(spearman(preds, actuals));

  const ratio = baselineMae === 0 ? (mae === 0 ? 1 : Number.POSITIVE_INFINITY) : mae / baselineMae;
  const quality: BacktestMetrics["quality"] = ratio <= 0.97 ? "good" : ratio <= 1.03 ? "moderate" : "poor";
  const beats = mae < baselineMae;

  const scope = `Reconstructed-stats diagnostic, GW${gwsTested[0]}–GW${gwsTested[gwsTested.length - 1]} (${n} player-GWs). Player metadata and fixture context are current; historical availability is unavailable. This is not a frozen pre-deadline accuracy benchmark`;
  const stats = `model MAE ${mae} pts vs ${baselineMae} for the naive "${baselineName}" baseline (RMSE ${rmse}, ${within2PtsPct}% within ±2, rank corr ${rho})`;
  const verdict =
    quality === "good"
      ? `${scope}: ${stats}. The model beats the baseline, but the sample is small — treat xPts as an Estimate.`
      : quality === "moderate"
        ? `${scope}: ${stats}. No clear edge over the baseline yet — treat xPts as an Estimate.`
        : `${scope}: ${stats}. The model is currently WORSE than the baseline — don't over-trust single-gameweek xPts.`;

  return {
    gwsTested,
    sampleSize: n,
    mae,
    rmse,
    epNextMae: baselineMae,
    baselineName,
    modelBeatsBaseline: beats,
    method: "reconstructed-history",
    historicalContextComplete: false,
    within2PtsPct,
    rankCorrelation: rho,
    quality,
    verdict,
  };
}
