import type { EnrichedPlayer, Snapshot } from '../lib/types';
import { PlayerAvatar } from './PlayerAvatar';
import { ClubBadge } from './ClubBadge';

/** Identity and forecast come from the selected solver week, never a name lookup. */
export function PlayerProjectionCard({ player, snapshot, gw, points, captainMultiplier = 1, vice = false, onInspect, priceTenths }:
  { player: EnrichedPlayer; snapshot: Snapshot; gw: number; points: number | null | undefined;
    captainMultiplier?: number; vice?: boolean; onInspect?: (player: EnrichedPlayer) => void; priceTenths?: number }) {
  const fixtures = snapshot.fixtures.filter(f => f.event === gw && (f.teamH === player.teamId || f.teamA === player.teamId));
  const opponents = fixtures.map(f => `${snapshot.teams.find(t => t.id === (f.teamH === player.teamId ? f.teamA : f.teamH))?.shortName ?? '?'} (${f.teamH === player.teamId ? 'H' : 'A'})`).join(' · ');
  const known = typeof points === 'number' && Number.isFinite(points);
  const status = player.status === 'a' && (player.chance == null || player.chance === 100) ? null :
    player.status === 'd' ? 'Doubtful' : player.status === 'i' ? 'Injured' : player.status === 's' ? 'Suspended' : 'Check status';
  return <button type="button" className="strategy-player projection-card" data-player-id={player.id} data-gameweek={gw}
    onClick={() => onInspect?.(player)} disabled={!onInspect}
    aria-label={`${player.fullName || player.name}, ${player.team.shortName}, GW${gw}, ${known ? points.toFixed(2) + ' xPts' : 'projection unavailable'}${status ? ', ' + status : ''}`}>
    <span className="projection-card-photo"><PlayerAvatar key={`${player.id}:${player.code}:${player.team.code}`} code={player.code} teamCode={player.team.code} name={player.name} fullName={player.fullName} teamShort={player.team.shortName} position={player.position} size="md" />
      <ClubBadge teamCode={player.team.code} teamName={player.team.name} shortName={player.team.shortName} size="sm" />
      {(captainMultiplier > 1 || vice) && <b className="projection-card-role">{vice ? 'V' : `C ×${captainMultiplier}`}</b>}
    </span>
    <span className="strategy-player-identity"><strong>{player.name}</strong><small>{player.team.shortName} · {player.position} · £{((priceTenths ?? player.cost) / 10).toFixed(1)}m</small><em>{opponents || 'Blank'}</em></span>
    <span className="projection-card-points"><b>{known ? points.toFixed(2) : '—'}</b><small>xPts</small></span>
    {status && <span className="projection-card-status" title={player.news || status}>{status}</span>}
  </button>;
}
