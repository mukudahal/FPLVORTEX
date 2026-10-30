import type { FixtureForecast } from '../lib/fixtureForecast';
import {
  cleanSheetFillStyle,
  difficultyFillStyle,
  overallDifficulty,
  projectedGoalsFillStyle,
} from '../lib/fixtureForecast';
import { ClubBadge } from './ClubBadge';

export type ForecastTileMode = 'difficulty' | 'projections' | 'goals' | 'cleanSheet' | 'win';

/** Shared presentation of the same fixture forecast in the matrix and optimizer. */
export function ForecastTile({ item, mode, onOpen, showLabels = false }: { item: FixtureForecast; mode: ForecastTileMode; onOpen?: () => void; showLabels?: boolean }) {
  const opponentStyle =
    mode === 'goals'
      ? projectedGoalsFillStyle(item.goals)
      : mode === 'cleanSheet'
        ? cleanSheetFillStyle(item.cleanSheet)
        : difficultyFillStyle(overallDifficulty(item));

  const columns = mode === 'difficulty'
    ? [
        { label: 'A', text: item.attackIndex.toFixed(2), style: difficultyFillStyle(item.attackIndex) },
        { label: 'D', text: item.defenceIndex.toFixed(2), style: difficultyFillStyle(item.defenceIndex) },
      ]
    : mode === 'win'
      ? [
          { label: 'WIN', text: `${Math.round(item.win * 100)}%`, style: difficultyFillStyle(1 + 4 * (1 - item.win)) },
        ]
      : [
          { label: 'G', text: item.goals.toFixed(2), style: projectedGoalsFillStyle(item.goals) },
          { label: 'CS', text: `${Math.round(item.cleanSheet * 100)}%`, style: cleanSheetFillStyle(item.cleanSheet) },
        ];

  const content = (
    <>
      <span className="forecast-tile__opponent" style={opponentStyle}>
        <ClubBadge teamCode={item.opponent.code} shortName={item.opponent.shortName} teamName={item.opponent.name} size="sm" />
        <strong>{item.opponent.shortName}</strong>
        <small>({item.home ? 'H' : 'A'})</small>
      </span>
      {columns.map(column => (
        <span key={column.label} className="forecast-tile__value" style={column.style}>
          {showLabels && <small>{column.label}</small>}
          <strong>{column.text}</strong>
        </span>
      ))}
    </>
  );
  const label = `${item.team.name} vs ${item.opponent.name}, GW${item.fixture.event}: ${columns.map(column => `${column.label} ${column.text}`).join(', ')}`;
  const isWin = mode === 'win';
  return onOpen ? (
    <button type="button" className={`forecast-tile ${isWin ? 'forecast-tile--win' : ''}`} onClick={onOpen} aria-label={`Open ${label}`}>
      {content}
    </button>
  ) : (
    <span className={`forecast-tile ${isWin ? 'forecast-tile--win' : ''}`} aria-label={label}>
      {content}
    </span>
  );
}
