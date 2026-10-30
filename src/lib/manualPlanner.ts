/** Manual planning only: no FPL transfers are submitted by these helpers. */
export type ManualPosition = 'GKP' | 'DEF' | 'MID' | 'FWD';
export interface ManualPlayer { id: number; position: ManualPosition; teamId: number }
/** Prices are explicit user-entered tenths of £m; they are not verified FPL prices. */
export interface ManualTransfer {
  gw: number;
  outId: number;
  inId: number;
  sellingPrice: number;
  purchasePrice: number;
  enteredAt: string;
}
export interface ManualPlanState { squad: number[]; bank: number | null }
export type ManualReplayResult =
  | { ok: true; state: ManualPlanState }
  | { ok: false; error: string; transfer: ManualTransfer };

/** Replay the entire history in chronological order; never silently drop invalid moves. */
export function replayManualTransfers(
  initial: ManualPlanState,
  moves: readonly ManualTransfer[],
  throughGw: number,
  players: ReadonlyMap<number, ManualPlayer>,
): ManualReplayResult {
  let bank = initial.bank;
  const squad = [...initial.squad];
  const ordered = moves.map((move, index) => ({ move, index })).sort((a, b) => a.move.gw - b.move.gw || a.index - b.index);
  for (const { move } of ordered) {
    if (move.gw > throughGw) break;
    const out = players.get(move.outId);
    const incoming = players.get(move.inId);
    const fail = (error: string): ManualReplayResult => ({ ok: false, error, transfer: move });
    if (!Number.isInteger(move.gw) || move.gw < 1 || move.gw > 38) return fail('Invalid gameweek.');
    if (!out || !incoming) return fail('Unknown player.');
    if (!squad.includes(out.id)) return fail('Outgoing player is not in the squad.');
    if (squad.includes(incoming.id)) return fail('Incoming player is already in the squad.');
    if (out.position !== incoming.position) return fail('Replacement must be the same position.');
    if (squad.filter(id => id !== out.id && players.get(id)?.teamId === incoming.teamId).length >= 3) return fail('Maximum three players per club.');
    if (!Number.isInteger(move.sellingPrice) || move.sellingPrice < 0 || !Number.isInteger(move.purchasePrice) || move.purchasePrice < 0 || !Number.isFinite(Date.parse(move.enteredAt))) return fail('Enter valid prices and timestamp.');
    const nextBank = bank === null ? null : bank + move.sellingPrice - move.purchasePrice;
    if (nextBank !== null && nextBank < 0) return fail('Transfer exceeds the available planning budget.');
    squad[squad.indexOf(out.id)] = incoming.id;
    bank = nextBank;
  }
  return { ok: true, state: { squad, bank } };
}

/** Swap a starter with a same-position bench player for one selected gameweek. */
export function swapManualLineup(
  starters: readonly number[], bench: readonly number[], first: number, second: number,
  players: ReadonlyMap<number, ManualPlayer>,
): { starters: number[]; bench: number[] } | null {
  const a = players.get(first), b = players.get(second);
  if (!a || !b || a.position !== b.position) return null;
  const starter = starters.includes(first) && bench.includes(second) ? first : starters.includes(second) && bench.includes(first) ? second : null;
  if (starter === null) return null;
  const reserve = starter === first ? second : first;
  return { starters: starters.map(id => id === starter ? reserve : id), bench: bench.map(id => id === reserve ? starter : id) };
}
