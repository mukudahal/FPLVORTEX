import type { Player } from './model.js';

export type Appearance = {
  playerId: number;
  gameweek: number;
  minutes: number;
  started: boolean;
  substitutedOn: boolean;
  substitutedOff: boolean;
  available: boolean;
  expectedGoals?: number;
  expectedAssists?: number;
};
export type AppearanceSummary = {
  playerId: number;
  played: number;
  gamesObserved: number;
  starts: number;
  substituteAppearances: number;
  substitutedOff: number;
  unused: number;
  unavailable: number;
  minutesTotal: number;
  minutesPerAppearance: number;
  ninetyEquivalents: number;
  startsDisplay: string;
};
export type VortexForecast = {
  gameweek: number;
  expectedMinutes: number;
  startProbability: number;
  appearanceProbability: number;
  expectedGoals: number;
  expectedAssists: number;
  cleanSheetProbability: number;
  expectedPoints: number;
  components: { appearance: number; goals: number; assists: number; cleanSheet: number; bonusProxy: number };
  mode: 'illustrative' | 'verified-input-untrained';
};
const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
const round = (value: number, places = 2): number => Number(value.toFixed(places));

/** Count starts separately from substitute appearances; gameweek coverage includes DNPs. */
export function summarizeAppearances(playerId: number, appearances: readonly Appearance[]): AppearanceSummary {
  if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new RangeError('Invalid player ID');
  const rows = appearances.filter(row => row.playerId === playerId);
  const weeks = new Set<number>();
  let starts = 0, substituteAppearances = 0, substitutedOff = 0, unused = 0, unavailable = 0, minutesTotal = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.gameweek) || row.gameweek < 1 || row.gameweek > 38 || weeks.has(row.gameweek)) throw new RangeError('Invalid or duplicate gameweek');
    if (!Number.isInteger(row.minutes) || row.minutes < 0 || row.minutes > 130) throw new RangeError('Invalid minutes');
    if (typeof row.started !== 'boolean' || typeof row.available !== 'boolean' || typeof row.substitutedOn !== 'boolean' || typeof row.substitutedOff !== 'boolean') throw new TypeError('Invalid appearance flags');
    if (row.started && (row.substitutedOn || row.minutes === 0)) throw new RangeError('Starter cannot be an incoming substitute or play zero minutes');
    if (!row.started && row.minutes > 0 && !row.substitutedOn) throw new RangeError('Substitute appearance must be marked');
    if (row.substitutedOff && (!row.started || row.minutes === 0)) throw new RangeError('Subbed-off must be a starter');
    if (!row.available && (row.minutes > 0 || row.started)) throw new RangeError('Unavailable player cannot play');
    weeks.add(row.gameweek);
    minutesTotal += row.minutes;
    if (!row.available) unavailable += 1;
    else if (row.started) { starts += 1; if (row.substitutedOff) substitutedOff += 1; }
    else if (row.minutes > 0) substituteAppearances += 1;
    else unused += 1;
  }
  const played = starts + substituteAppearances;
  return {
    playerId, played, gamesObserved: weeks.size, starts, substituteAppearances, substitutedOff, unused, unavailable,
    minutesTotal, minutesPerAppearance: played ? round(minutesTotal / played, 1) : 0,
    ninetyEquivalents: round(minutesTotal / 90, 2), startsDisplay: `${starts}/${weeks.size}`
  };
}

/**
 * Transparent, independent empirical-Bayes prototype. No claims of calibration or Opta parity.
 * Historical rates are shrunk to player priors to avoid an early-season 1-goal sample dominating.
 */
export function forecastVortex(player: Player, gameweek: number, history: readonly Appearance[] = [], verified = false): VortexForecast {
  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > player.fixtures.length) throw new RangeError('Missing future fixture');
  const rows = history.filter(row => row.playerId === player.id).sort((a, b) => a.gameweek - b.gameweek);
  for (const item of rows) if (item.gameweek >= gameweek + 6) throw new RangeError('Forecast cannot use outcomes from the target gameweek or future');
  const summary = summarizeAppearances(player.id, rows);
  const available = rows.filter(row => row.available);
  const scheduledCount = available.length;
  const startProbability = player.status === 'out' ? 0 : clamp(
    (summary.starts + 2.5) / (scheduledCount + 3) * (player.status === 'doubt' ? 0.55 : 1), 0, 0.97
  );
  const subFrequency = (summary.substituteAppearances + 0.5) / (scheduledCount + 6);
  const appearanceProbability = player.status === 'out' ? 0 : clamp(startProbability + (1-startProbability)*subFrequency, 0, 1);
  const typicalStart = summary.starts > 0 ? rows.filter(row => row.started).reduce((sum, row) => sum + row.minutes, 0) / summary.starts : player.expectedMinutes;
  const typicalSub = summary.substituteAppearances > 0 ? rows.filter(row => row.substitutedOn).reduce((sum, row) => sum + row.minutes, 0)/summary.substituteAppearances : 22;
  const expectedMinutes = clamp(round(startProbability * typicalStart + (appearanceProbability - startProbability)*typicalSub, 1), 0, 95);
  const exposure = expectedMinutes / 90;
  const difficulty = player.fixtures[gameweek-1] ?? 3;
  const fixtureAttack = clamp(Math.exp((3 - difficulty)*0.115), 0.7, 1.4);
  const fixtureDefence = clamp(Math.exp((3 - difficulty)*0.22), 0.55, 1.7);
  const documentedMinutes = rows.reduce((total, row)=> total+row.minutes, 0)/90;
  const observedXg = rows.reduce((total,row)=> total + (row.expectedGoals ?? 0), 0);
  const observedXa = rows.reduce((total,row)=> total + (row.expectedAssists ?? 0), 0);
  const hasXg = rows.length > 0 && rows.every(row=>row.expectedGoals !== undefined && row.expectedAssists !== undefined);
  // Prior strength: 8 ninety-equivalents, keeping early samples from overfitting.
  const rateXg = hasXg ? (observedXg + player.xg90 * 8) / (documentedMinutes + 8) : player.xg90;
  const rateXa = hasXg ? (observedXa + player.xa90 * 8) / (documentedMinutes + 8) : player.xa90;
  const expectedGoals = round(clamp(rateXg * exposure * fixtureAttack, 0, 3), 3);
  const expectedAssists = round(clamp(rateXa * exposure * fixtureAttack, 0, 3), 3);
  const cleanSheetProbability = round(clamp(0.34 * fixtureDefence, 0.08, 0.75), 3);
  const appearance = startProbability * 1.72 + (appearanceProbability - startProbability) * 1.0;
  const goals = expectedGoals * (player.position === 'MID' ? 5 : ['DEF','GKP'].includes(player.position) ? 6 : 4);
  const assists = expectedAssists * 3;
  const cleanSheet = expectedMinutes / 90 * cleanSheetProbability * (player.position === 'GKP' || player.position === 'DEF' ? 4 : player.position === 'MID' ? 1 : 0);
  const bonusProxy = clamp(player.form/10,0,1) * 0.43 * appearanceProbability;
  return {
    gameweek, expectedMinutes, startProbability: round(startProbability, 3), appearanceProbability: round(appearanceProbability, 3),
    expectedGoals, expectedAssists, cleanSheetProbability, expectedPoints: round(appearance+goals+assists+cleanSheet+bonusProxy),
    components: { appearance:round(appearance),goals:round(goals),assists:round(assists),cleanSheet:round(cleanSheet),bonusProxy:round(bonusProxy) },
    mode: verified ? 'verified-input-untrained' : 'illustrative'
  };
}

export type PriceTick = { capturedAt: string; transfersNet: number; price: number };
export type PriceSignal = { direction: 'rise' | 'fall' | 'stable'; estimateHours: number | null; confidence: 'insufficient' | 'experimental'; reason: string };
/** Price thresholds are private/undisclosed: don't invent a countdown from a handful of transfer observations. */
export function estimatePriceMovement(ticks: readonly PriceTick[]): PriceSignal {
  if (ticks.length < 5) return {direction:'stable',estimateHours:null,confidence:'insufficient',reason:'Needs verified multi-day transfer and price history'};
  const sorted=[...ticks].sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt));
  if (sorted.some(t=>!Number.isFinite(Date.parse(t.capturedAt))||!Number.isFinite(t.price)||!Number.isFinite(t.transfersNet))) throw new TypeError('Invalid price tick');
  if (new Set(sorted.map(t=>t.capturedAt)).size !== sorted.length) throw new RangeError('Duplicate price observation');
  const first=sorted[0]!,last=sorted[sorted.length-1]!;
  if (Date.parse(last.capturedAt)-Date.parse(first.capturedAt)<48*3600*1000) return {direction:'stable',estimateHours:null,confidence:'insufficient',reason:'Needs at least 48h of observed history'};
  const transferDifference=last.transfersNet-first.transfersNet;
  return {direction:transferDifference>0?'rise':transferDifference<0?'fall':'stable',estimateHours:null,confidence:'experimental',reason:'Transfer momentum observed; price-change threshold and ETA not calibrated'};
}