import { difficultyColor, makeFixtureForecasts, meanForecast, overallDifficulty, type FixtureForecast, type ForecastSource } from './fixtureForecast';
import type { PngCell, PngTable } from './tablePng';
import type { Snapshot } from './types';

const n = (value: number) => value.toFixed(2);
const pct = (value: number) => `${Math.round(value * 100)}%`;
function averageCell(items: FixtureForecast[]): PngCell {
  if (!items.length) return { text: '—' };
  const mean = (field: 'attackIndex' | 'defenceIndex' | 'goals' | 'cleanSheet' | 'win') => meanForecast(items, field)!;
  const overall = items.reduce((sum, item) => sum + overallDifficulty(item), 0) / items.length;
  return { text: `FDR ${n(overall)}  A ${n(mean('attackIndex'))}  D ${n(mean('defenceIndex'))}\nG ${n(mean('goals'))}  CS ${pct(mean('cleanSheet'))}  W ${pct(mean('win'))}`, color: difficultyColor(overall) };
}

/** All metric views for both models, from their own forecasts; no market fallback. */
export function buildFixturePngTables(snapshot: Snapshot, start: number, end: number): PngTable[] {
  const first = Math.max(1, Math.min(38, snapshot.meta.nextEventId));
  const from = Math.max(first, Math.min(38, start));
  const to = Math.max(from, Math.min(38, end, from + 14));
  const teams = new Map(snapshot.teams.map(team => [team.id, team]));
  return (['vortex', 'market'] as ForecastSource[]).map(source => {
    const gws = source === 'market' ? Array.from({ length: Math.min(3, 39 - first) }, (_, i) => first + i) : Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const forecasts = makeFixtureForecasts(snapshot, source, gws);
    const rows = [...snapshot.teams].sort((a, b) => a.name.localeCompare(b.name)).map(team => {
      const all = gws.flatMap(gw => forecasts.get(`${team.id}:${gw}`) ?? []);
      const cells: PngCell[] = gws.map(gw => {
        const fixtures = snapshot.fixtures.filter(fixture => fixture.event === gw && (fixture.teamH === team.id || fixture.teamA === team.id));
        if (!fixtures.length) return { text: 'BLANK' };
        const items = forecasts.get(`${team.id}:${gw}`) ?? [];
        const text = fixtures.map(fixture => {
          const home = fixture.teamH === team.id;
          const opponent = teams.get(home ? fixture.teamA : fixture.teamH);
          const name = `${opponent?.shortName ?? 'Unknown'} (${home ? 'H' : 'A'})`;
          const item = items.find(item => item.fixture.id === fixture.id);
          if (!item) return `${name}\nNo market price`;
          return `${name}  A ${n(item.attackIndex)}  D ${n(item.defenceIndex)}\nG ${n(item.goals)}  CS ${pct(item.cleanSheet)}  W ${pct(item.win)}`;
        }).join('\n');
        return { text, color: items.length === fixtures.length && items.length === 1 ? difficultyColor(overallDifficulty(items[0])) : undefined };
      });
      return [{ text: team.name }, averageCell(all), ...cells];
    });
    return { title: `${source === 'vortex' ? 'VORTEX' : 'MARKET'} · FDR / GOALS / CLEAN SHEETS / WIN`, headers: ['CLUB', 'AVERAGE PER FIXTURE', ...gws.map(gw => `GW${gw}`)], widths: [155, 205, ...gws.map(() => 205)], rows };
  });
}
