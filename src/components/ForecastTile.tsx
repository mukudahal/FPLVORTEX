import type { FixtureForecast } from '../lib/fixtureForecast';
import { difficultyColor, overallDifficulty } from '../lib/fixtureForecast';
import { ClubBadge } from './ClubBadge';

export type ForecastTileMode = 'difficulty' | 'projections' | 'win';

/** Shared presentation of the same fixture forecast in the matrix and optimizer. */
export function ForecastTile({ item, mode, onOpen, showLabels = false }: { item: FixtureForecast; mode: ForecastTileMode; onOpen?: () => void; showLabels?: boolean }) {
  const columns = mode === 'difficulty'
    ? [{ label: 'A', text: item.attackIndex.toFixed(2), color: item.attackIndex }, { label: 'D', text: item.defenceIndex.toFixed(2), color: item.defenceIndex }]
    : mode === 'projections'
      ? [{ label: 'G', text: item.goals.toFixed(2), color: item.attackIndex }, { label: 'CS', text: `${Math.round(item.cleanSheet * 100)}%`, color: item.defenceIndex }]
      : [{ label: 'WIN', text: `${Math.round(item.win * 100)}%`, color: 1 + 4 * (1 - item.win) }];
  const content = <><span className="forecast-tile__opponent" style={{ background: difficultyColor(overallDifficulty(item)) }}><ClubBadge teamCode={item.opponent.code} shortName={item.opponent.shortName} teamName={item.opponent.name} size="sm" /><strong>{item.opponent.shortName}</strong><small>({item.home ? 'H' : 'A'})</small></span>{columns.map(column => <span key={column.label} className="forecast-tile__value" style={{ background: difficultyColor(column.color) }}>{showLabels && <small>{column.label}</small>}<strong>{column.text}</strong></span>)}</>;
  const label = `${item.team.name} vs ${item.opponent.name}, GW${item.fixture.event}: ${columns.map(column => `${column.label} ${column.text}`).join(', ')}`;
  return onOpen ? <button type="button" className={`forecast-tile ${mode === 'win' ? 'forecast-tile--win' : ''}`} onClick={onOpen} aria-label={`Open ${label}`}>{content}</button> : <span className={`forecast-tile ${mode === 'win' ? 'forecast-tile--win' : ''}`} aria-label={label}>{content}</span>;
}
