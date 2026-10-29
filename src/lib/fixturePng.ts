import { difficultyColor, makeFixtureForecasts, meanForecast, overallDifficulty, type FixtureForecast, type ForecastSource } from './fixtureForecast';
import type { PngCell, PngTable } from './tablePng';
import type { Snapshot } from './types';

type ExportMetric = 'difficulty' | 'goals' | 'cleanSheet' | 'win';
interface ExportView { source: ForecastSource; metric: ExportMetric; teamOrder?: number[] }
const n = (value: number) => value.toFixed(2);
const pct = (value: number) => `${Math.round(value * 100)}%`;
function averageCell(items: FixtureForecast[], metric?: ExportMetric): PngCell {
  if (!items.length) return { text: '—' };
  const mean = (field: 'attackIndex' | 'defenceIndex' | 'goals' | 'cleanSheet' | 'win') => meanForecast(items, field)!;
  const overall = items.reduce((sum, item) => sum + overallDifficulty(item), 0) / items.length;
  if (metric === 'difficulty') return { text: `FDR ${n(overall)}\nA ${n(mean('attackIndex'))}  D ${n(mean('defenceIndex'))}`, color: difficultyColor(overall) };
  if (metric === 'win') return { text: `WIN ${pct(mean('win'))}` };
  if (metric) return { text: `G ${n(mean('goals'))}  CS ${pct(mean('cleanSheet'))}` };
  return { text: `FDR ${n(overall)}  A ${n(mean('attackIndex'))}  D ${n(mean('defenceIndex'))}\nG ${n(mean('goals'))}  CS ${pct(mean('cleanSheet'))}  W ${pct(mean('win'))}`, color: difficultyColor(overall) };
}

/** All metric views for both models, from their own forecasts; no market fallback. */
export function buildFixturePngTables(snapshot: Snapshot, start: number, end: number, view?: ExportView): PngTable[] {
  const first = Math.max(1, Math.min(38, snapshot.meta.nextEventId));
  const from = Math.max(first, Math.min(38, start));
  const to = Math.max(from, Math.min(38, end, from + 14));
  const teams = new Map(snapshot.teams.map(team => [team.id, team]));
  return (view ? [view.source] : ['vortex', 'market'] as ForecastSource[]).map(source => {
    const gws = source === 'market' ? Array.from({ length: Math.min(3, 39 - first) }, (_, i) => first + i) : Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const forecasts = makeFixtureForecasts(snapshot, source, gws);
    const rows = [...snapshot.teams].sort((a, b) => view?.teamOrder ? view.teamOrder.indexOf(a.id) - view.teamOrder.indexOf(b.id) : a.name.localeCompare(b.name)).map(team => {
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
          if (view?.metric === 'difficulty') return `${name}\nFDR ${n(overallDifficulty(item))}  A ${n(item.attackIndex)}  D ${n(item.defenceIndex)}`;
          if (view?.metric === 'win') return `${name}\nWIN ${pct(item.win)}`;
          if (view) return `${name}\nG ${n(item.goals)}  CS ${pct(item.cleanSheet)}`;
          return `${name}  A ${n(item.attackIndex)}  D ${n(item.defenceIndex)}\nG ${n(item.goals)}  CS ${pct(item.cleanSheet)}  W ${pct(item.win)}`;
        }).join('\n');
        return { text, color: items.length === fixtures.length && items.length === 1 ? difficultyColor(overallDifficulty(items[0])) : undefined };
      });
      return [{ text: team.name }, averageCell(all, view?.metric), ...cells];
    });
    return { title: `${source === 'vortex' ? 'VORTEX' : 'MARKET'} · ${view ? view.metric === 'difficulty' ? 'FIXTURE DIFFICULTY · ATTACK / DEFENCE' : view.metric === 'win' ? 'WIN PROBABILITY' : 'GOALS / CLEAN SHEETS' : 'FDR / GOALS / CLEAN SHEETS / WIN'}${view ? ` · Snapshot ${snapshot.meta.generatedAt}` : ''}`, headers: ['CLUB', 'AVERAGE PER FIXTURE', ...gws.map(gw => `GW${gw}`)], widths: [155, 205, ...gws.map(() => 205)], rows };
  });
}
