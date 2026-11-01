/** Verified 2026/27 chip entitlements for the JOINT solver (not defaults).
 *
 * Unknown, stale, demo or archived FPL team data MUST NOT be promoted
 * into an "unused chips" claim. The server independently re-fetches and
 * verifies chip history before accepting a joint calculation.
 */
import type { EntryData } from './types';

export type JointChipName = 'wildcard' | 'free_hit' | 'bench_boost' | 'triple_captain';
export interface VerifiedChipInventory {
  entryId: number;
  /** Verification retrieval time, not an official provider publication timestamp. */
  provenanceCheckedAt: string;
  scoring_chip_halves: Partial<Record<'bench_boost' | 'triple_captain', Array<1 | 2>>>;
  squad_chip_halves: Partial<Record<'wildcard' | 'free_hit', Array<1 | 2>>>;
  first_half_fh_used_gw19: boolean;
}

const names: Record<string, JointChipName> = {
  wildcard: 'wildcard', wc: 'wildcard',
  freehit: 'free_hit', free_hit: 'free_hit', fh: 'free_hit',
  bboost: 'bench_boost', bench_boost: 'bench_boost', bb: 'bench_boost',
  '3xc': 'triple_captain', triple_captain: 'triple_captain', tc: 'triple_captain',
};
const chipNames: JointChipName[] = [
  'wildcard', 'free_hit', 'bench_boost', 'triple_captain',
];

export function verifiedChipInventory(
  entry: EntryData | null | undefined,
  startGw: number,
  now: Date = new Date(),
): VerifiedChipInventory {
  if (!Number.isInteger(startGw) || startGw < 1 || startGw > 38)
    throw new RangeError('Invalid future Gameweek for chip availability.');
  if (!entry || entry.source !== 'live' ||
      entry.provenance?.kind !== 'official' ||
      entry.provenance.requestedIdVerified !== true ||
      !Array.isArray(entry.chipsUsed) ||
      entry.activeChip !== null) {
    throw new RangeError('An official live FPL entry with complete chip history and no active chip is required.');
  }
  // Official FPL JSON does not expose a trusted source publication time.
  // generatedAt identifies the *live retrieval*, whereas
  // provenance.sourceCapturedAt is an archive-specific field and may be null.
  const timestamp = entry.generatedAt;
  const retrieved = timestamp ? Date.parse(timestamp) : Number.NaN;
  const age = now.getTime() - retrieved;
  if (!Number.isFinite(age) || age < -60000 || age > 6 * 60 * 60 * 1000)
    throw new RangeError('Official FPL entry data is too old to verify chip availability. Refresh it.');
  const used = new Set<string>();
  for (const record of entry.chipsUsed) {
    const chip = names[record.name];
    const gw = record.event;
    if (!chip || !Number.isInteger(gw) || gw < 1 || gw > 38 || gw >= startGw) {
      throw new RangeError('FPL chip history contains an invalid or future chip use.');
    }
    const half = gw <= 19 ? 1 : 2;
    const key = `${chip}:${half}`;
    if (used.has(key)) throw new RangeError('Duplicate chip usage in official history.');
    used.add(key);
  }
  const scoring: VerifiedChipInventory['scoring_chip_halves'] = {};
  const squad: VerifiedChipInventory['squad_chip_halves'] = {};
  for (const chip of chipNames) {
    const halves = ([1, 2] as const).filter(half =>
      ((half === 1 && startGw <= 19) || half === 2) &&
      !used.has(`${chip}:${half}`));
    if (!halves.length) continue;
    if (chip === 'wildcard' || chip === 'free_hit') squad[chip] = [...halves];
    else scoring[chip] = [...halves];
  }
  return {
    entryId: entry.id,
    provenanceCheckedAt: timestamp,
    scoring_chip_halves: scoring,
    squad_chip_halves: squad,
    first_half_fh_used_gw19: used.has('free_hit:1') &&
      entry.chipsUsed.some(record => names[record.name] === 'free_hit' && record.event === 19),
  };
}
