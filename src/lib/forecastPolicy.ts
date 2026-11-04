import type { Player, RepoDataMeta } from './types';
import { projectionFreshness } from './projectionFreshness';
import { isOfficiallyUnflagged } from './transferEligibility';

/** Undefined: no identified import. Null: identified import without a usable date. */
export function importedForecastDate(meta: RepoDataMeta | undefined): string | null | undefined {
  return (meta?.benchmarkPlayers ?? 0) > 0 ? meta?.projectionFileDate ?? null : undefined;
}

export function importedForecastPolicy(fileDate: string | null | undefined, asOf: Date) {
  if (!Number.isFinite(asOf.valueOf())) throw new RangeError('Invalid forecast as-of time.');
  const age = fileDate === undefined ? null : projectionFreshness(fileDate, asOf);
  return { age, allowed: age === null || age.status === 'recent' };
}

/** One selection rule for Players, Plan and Solver; a real zero is preserved. */
export function forecastMean(player: Pick<Player, 'status' | 'chance'>,
  model: { xPts: number; fixtureCount: number }, imported: number | null | undefined, allowImported: boolean): number {
  if (!Number.isFinite(model.xPts) || !Number.isInteger(model.fixtureCount) || model.fixtureCount < 0)
    throw new RangeError('Invalid fixture forecast. Refresh the data.');
  if (model.fixtureCount === 0) return 0;
  return allowImported && isOfficiallyUnflagged(player) && typeof imported === 'number' && Number.isFinite(imported)
    ? Math.max(0, imported) : Math.max(0, model.xPts);
}
