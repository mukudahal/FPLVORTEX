import type { FixtureMarketOdds } from './types';

export interface RawMarketQuote {
  provider: 'the-odds-api' | 'football-data' | 'espn';
  bookmaker: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime?: string | null;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  totalLine?: number | null;
  oddsOver?: number | null;
  oddsUnder?: number | null;
  updatedAt?: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, digits = 4): number {
  const factor = Math.pow(10, digits);
  return Math.round(v * factor) / factor;
}

/**
 * Converts US American moneyline odds (e.g. -150, +240) to decimal odds (e.g. 1.6667, 3.40).
 */
export function americanToDecimal(american: number): number | null {
  if (!Number.isFinite(american) || american === 0) return null;
  if (american > 0) return 1 + american / 100;
  if (american <= -100) return 1 + 100 / Math.abs(american);
  return null;
}

/**
 * Removes bookmaker margin (overround) via the Power (equal-elasticity) method:
 * finds k > 0 such that sum((1 / O_i)^k) = 1, accounting for favorite-longshot bias.
 * Falls back to multiplicative normalization if raw probabilities already sum <= 1.
 */
export function devigPower(decimalOdds: number[]): number[] {
  if (decimalOdds.some((o) => !Number.isFinite(o) || o <= 1.0001)) {
    throw new RangeError('All decimal odds must be finite numbers > 1.0001.');
  }
  const implied = decimalOdds.map((o) => 1 / o);
  const rawSum = implied.reduce((acc, q) => acc + q, 0);
  if (Math.abs(rawSum - 1) < 1e-9) return implied;
  if (rawSum < 1) {
    return implied.map((q) => q / rawSum);
  }

  let lo = 1.0;
  let hi = 4.5;
  const sumAt = (k: number) => implied.reduce((acc, q) => acc + Math.pow(q, k), 0);

  while (sumAt(hi) > 1 && hi < 32) {
    hi *= 2;
  }

  for (let iter = 0; iter < 40; iter += 1) {
    const mid = 0.5 * (lo + hi);
    if (sumAt(mid) > 1) lo = mid;
    else hi = mid;
  }

  const kStar = 0.5 * (lo + hi);
  const unnorm = implied.map((q) => Math.pow(q, kStar));
  const total = unnorm.reduce((acc, p) => acc + p, 0);
  return unnorm.map((p) => p / total);
}

function poissonPmfArray(lambda: number, maxGoals: number): Float64Array {
  const pmf = new Float64Array(maxGoals + 1);
  if (lambda <= 0) {
    pmf[0] = 1;
    return pmf;
  }
  let p = Math.exp(-lambda);
  pmf[0] = p;
  for (let k = 1; k <= maxGoals; k += 1) {
    p = (p * lambda) / k;
    pmf[k] = p;
  }
  return pmf;
}

/**
 * Exact non-push Over probability for total Poisson goals G ~ Pois(totalLambda) on line L
 * (supports half-goal lines 2.5, whole-goal push lines 2.0/3.0, and Asian quarter lines 2.25/2.75).
 */
export function poissonOverProb(totalLambda: number, line: number): number {
  const maxK = Math.max(30, Math.ceil(totalLambda + 12 * Math.sqrt(Math.max(1, totalLambda)) + 16));
  const pmf = poissonPmfArray(totalLambda, maxK);

  const singleLineOverNoPush = (singleLine: number): number => {
    const roundedTwice = Math.round(singleLine * 2);
    // Half-goal line (e.g. 2.5 -> Over is G >= 3, zero push probability)
    if (Math.abs(singleLine * 2 - roundedTwice) < 1e-6 && roundedTwice % 2 !== 0) {
      const threshold = Math.floor(singleLine) + 1;
      let over = 0;
      for (let g = threshold; g <= maxK; g += 1) over += pmf[g];
      return clamp(over, 0, 1);
    }
    // Whole-goal line (e.g. 2.0 or 3.0 -> G == line pushes; re-normalize conditional on non-push)
    const exactInt = Math.round(singleLine);
    if (Math.abs(singleLine - exactInt) < 1e-6 && exactInt >= 0 && exactInt <= maxK) {
      let over = 0;
      for (let g = exactInt + 1; g <= maxK; g += 1) over += pmf[g];
      const push = pmf[exactInt];
      const denom = Math.max(1e-9, 1 - push);
      return clamp(over / denom, 0, 1);
    }
    const threshold = Math.floor(singleLine) + 1;
    let over = 0;
    for (let g = threshold; g <= maxK; g += 1) over += pmf[g];
    return clamp(over, 0, 1);
  };

  // Quarter-goal Asian totals (e.g. 2.25 = half on 2.0 + half on 2.5; 2.75 = half on 2.5 + half on 3.0)
  const frac = line - Math.floor(line);
  if (Math.abs(frac - 0.25) < 1e-4) {
    const lowLine = Math.floor(line);
    const highLine = lowLine + 0.5;
    return 0.5 * singleLineOverNoPush(lowLine) + 0.5 * singleLineOverNoPush(highLine);
  }
  if (Math.abs(frac - 0.75) < 1e-4) {
    const lowLine = Math.floor(line) + 0.5;
    const highLine = Math.floor(line) + 1;
    return 0.5 * singleLineOverNoPush(lowLine) + 0.5 * singleLineOverNoPush(highLine);
  }
  return singleLineOverNoPush(line);
}

export function poisson1x2Probs(lambdaH: number, lambdaA: number): {
  homeWin: number;
  draw: number;
  awayWin: number;
} {
  const maxGoals = Math.max(24, Math.ceil(Math.max(lambdaH, lambdaA) + 10 * Math.sqrt(Math.max(1, lambdaH, lambdaA)) + 12));
  const pmfH = poissonPmfArray(lambdaH, maxGoals);
  const pmfA = poissonPmfArray(lambdaA, maxGoals);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (let h = 0; h <= maxGoals; h += 1) {
    const ph = pmfH[h];
    for (let a = 0; a <= maxGoals; a += 1) {
      const p = ph * pmfA[a];
      if (h > a) homeWin += p;
      else if (h < a) awayWin += p;
      else draw += p;
    }
  }
  return { homeWin, draw, awayWin };
}

/**
 * Given fixed total expected goals T = lambda_H + lambda_A and target net win margin (p_H* - p_A*),
 * solves monotonically for home goal share s in [0.02, 0.98] where lambda_H = s*T, lambda_A = (1-s)*T.
 */
function solveHomeShareForTotal(totalLambda: number, targetMargin: number): number {
  let lo = 0.02;
  let hi = 0.98;
  for (let iter = 0; iter < 38; iter += 1) {
    const mid = 0.5 * (lo + hi);
    const probs = poisson1x2Probs(mid * totalLambda, (1 - mid) * totalLambda);
    const margin = probs.homeWin - probs.awayWin;
    if (margin < targetMargin) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Converts a raw bookmaker quote (1X2 + optional Over/Under total line) into
 * de-vigged fair Win/Draw/Away probabilities, implied team expected goals (lambda_H, lambda_A),
 * and implied clean-sheet probabilities (CS_H = exp(-lambda_A), CS_A = exp(-lambda_H)).
 */
export function solveImpliedMatchFromOdds(quote: RawMarketQuote): FixtureMarketOdds | null {
  const { oddsHome, oddsDraw, oddsAway } = quote;
  if (
    ![oddsHome, oddsDraw, oddsAway].every((o) => Number.isFinite(o) && o > 1.01 && o < 250)
  ) {
    return null;
  }

  const overround1x2 = 1 / oddsHome + 1 / oddsDraw + 1 / oddsAway;
  if (overround1x2 < 0.94 || overround1x2 > 1.35) {
    return null;
  }

  const [fairHome, fairDraw, fairAway] = devigPower([oddsHome, oddsDraw, oddsAway]);
  const targetMargin = fairHome - fairAway;

  let totalLambda: number;
  const hasValidTotals =
    Number.isFinite(quote.totalLine) &&
    (quote.totalLine as number) >= 1.25 &&
    (quote.totalLine as number) <= 5.5 &&
    Number.isFinite(quote.oddsOver) &&
    Number.isFinite(quote.oddsUnder) &&
    (quote.oddsOver as number) > 1.02 &&
    (quote.oddsUnder as number) > 1.02;

  if (hasValidTotals) {
    const line = quote.totalLine as number;
    const [fairOver] = devigPower([quote.oddsOver as number, quote.oddsUnder as number]);
    let loT = 0.35;
    let hiT = 7.5;
    for (let iter = 0; iter < 40; iter += 1) {
      const midT = 0.5 * (loT + hiT);
      if (poissonOverProb(midT, line) < fairOver) loT = midT;
      else hiT = midT;
    }
    totalLambda = 0.5 * (loT + hiT);
  } else {
    // 2D inversion from 1X2 alone: higher totalLambda strictly decreases P(Draw) for fixed targetMargin.
    let loT = 0.45;
    let hiT = 6.6;
    for (let iter = 0; iter < 34; iter += 1) {
      const midT = 0.5 * (loT + hiT);
      const s = solveHomeShareForTotal(midT, targetMargin);
      const { draw } = poisson1x2Probs(s * midT, (1 - s) * midT);
      if (draw > fairDraw) loT = midT;
      else hiT = midT;
    }
    totalLambda = clamp(0.5 * (loT + hiT), 1.4, 4.8);
  }

  const shareH = solveHomeShareForTotal(totalLambda, targetMargin);
  const homeXg = clamp(shareH * totalLambda, 0.12, 5.6);
  const awayXg = clamp((1 - shareH) * totalLambda, 0.12, 5.6);
  const homeCs = Math.exp(-awayXg);
  const awayCs = Math.exp(-homeXg);

  return {
    provider: quote.provider,
    bookmaker: quote.bookmaker,
    updatedAt: quote.updatedAt ?? new Date().toISOString(),
    oddsHome: round(oddsHome, 3),
    oddsDraw: round(oddsDraw, 3),
    oddsAway: round(oddsAway, 3),
    totalLine: hasValidTotals ? round(quote.totalLine as number, 2) : null,
    oddsOver: hasValidTotals ? round(quote.oddsOver as number, 3) : null,
    oddsUnder: hasValidTotals ? round(quote.oddsUnder as number, 3) : null,
    homeWin: round(fairHome, 4),
    draw: round(fairDraw, 4),
    awayWin: round(fairAway, 4),
    homeXg: round(homeXg, 3),
    awayXg: round(awayXg, 3),
    homeCs: round(homeCs, 4),
    awayCs: round(awayCs, 4),
    overround1x2: round(overround1x2, 4),
  };
}

const CLUB_ALIAS_MAP: Record<string, string> = {
  arsenal: 'arsenal',
  arsenalfc: 'arsenal',
  ars: 'arsenal',
  astonvilla: 'astonvilla',
  astonvillafc: 'astonvilla',
  villa: 'astonvilla',
  avl: 'astonvilla',
  bournemouth: 'bournemouth',
  afcbournemouth: 'bournemouth',
  bou: 'bournemouth',
  brentford: 'brentford',
  brentfordfc: 'brentford',
  bre: 'brentford',
  brighton: 'brighton',
  brightonhovealbion: 'brighton',
  brightonandhovealbion: 'brighton',
  bha: 'brighton',
  burnley: 'burnley',
  burnleyfc: 'burnley',
  bur: 'burnley',
  chelsea: 'chelsea',
  chelseafc: 'chelsea',
  che: 'chelsea',
  coventry: 'coventry',
  coventrycity: 'coventry',
  cov: 'coventry',
  crystalpalace: 'crystalpalace',
  crystalpalacefc: 'crystalpalace',
  palace: 'crystalpalace',
  cry: 'crystalpalace',
  everton: 'everton',
  evertonfc: 'everton',
  eve: 'everton',
  fulham: 'fulham',
  fulhamfc: 'fulham',
  ful: 'fulham',
  hull: 'hull',
  hullcity: 'hull',
  hul: 'hull',
  ipswich: 'ipswich',
  ipswichtown: 'ipswich',
  ips: 'ipswich',
  leeds: 'leeds',
  leedsunited: 'leeds',
  lee: 'leeds',
  leicester: 'leicester',
  leicestercity: 'leicester',
  lei: 'leicester',
  liverpool: 'liverpool',
  liverpoolfc: 'liverpool',
  liv: 'liverpool',
  luton: 'luton',
  lutontown: 'luton',
  lut: 'luton',
  mancity: 'mancity',
  manchestercity: 'mancity',
  manchestercityfc: 'mancity',
  mci: 'mancity',
  manutd: 'manutd',
  manunited: 'manutd',
  manchesterunited: 'manutd',
  manchesterutd: 'manutd',
  manchesterunitedfc: 'manutd',
  mun: 'manutd',
  middlesbrough: 'middlesbrough',
  mid: 'middlesbrough',
  newcastle: 'newcastle',
  newcastleunited: 'newcastle',
  newcastleutd: 'newcastle',
  newcastleunitedfc: 'newcastle',
  new: 'newcastle',
  nottmforest: 'nottmforest',
  nottinghamforest: 'nottmforest',
  nottingham: 'nottmforest',
  forest: 'nottmforest',
  nfo: 'nottmforest',
  sheffieldutd: 'sheffieldutd',
  sheffieldunited: 'sheffieldutd',
  shu: 'sheffieldutd',
  southampton: 'southampton',
  southamptonfc: 'southampton',
  sou: 'southampton',
  sunderland: 'sunderland',
  sunderlandafc: 'sunderland',
  sun: 'sunderland',
  spurs: 'tottenham',
  tottenham: 'tottenham',
  tottenhamhotspur: 'tottenham',
  tottenhamhotspurfc: 'tottenham',
  tot: 'tottenham',
  watford: 'watford',
  westbrom: 'westbrom',
  westbromwichalbion: 'westbrom',
  westham: 'westham',
  westhamunited: 'westham',
  westhamutd: 'westham',
  westhamunitedfc: 'westham',
  whu: 'westham',
  wolves: 'wolves',
  wolverhampton: 'wolves',
  wolverhamptonwanderers: 'wolves',
  wol: 'wolves',
};

/**
 * Normalizes any FPL, The Odds API, Football-Data.co.uk, or ESPN club name into a canonical key.
 */
export function canonicalClubKey(rawName: string): string {
  const stripped = String(rawName || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
  return CLUB_ALIAS_MAP[stripped] ?? stripped;
}
