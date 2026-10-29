#!/usr/bin/env python3
"""Build a research-only, deduplicated match history from local source downloads.

Historical values are outcomes, not pre-deadline forecasts. Output must not be
used as a live feed or as evidence that a forecasting model is calibrated.
"""
import argparse
import csv
import json
from datetime import datetime, timezone
import warnings
from pathlib import Path

VA_SEASONS = ('2018-19', '2019-20', '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26')
CORE_SEASONS = ('2026-2027',)
FIELDS = ('season', 'source', 'source_match_id', 'gameweek', 'kickoff_utc', 'home_team_code', 'away_team_code', 'home_goals', 'away_goals', 'home_xg', 'away_xg')


def integer(value):
    n = float(value)
    if not n.is_integer() or n < 0:
        raise ValueError(f'invalid nonnegative integer: {value!r}')
    return int(n)


def kickoff(value):
    d = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if d.utcoffset() is None:
        raise ValueError(f'kickoff has no timezone: {value!r}')
    return d.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


def valid_xg(value):
    import math
    if not value:
        return ''
    n = float(value)
    if not math.isfinite(n) or n < 0:
        raise ValueError(f'invalid xG: {value!r}')
    return n


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def canonical_va(season, row, teams):
    return dict(season=season, source='vaastav', source_match_id=row['id'],
                gameweek=integer(row['event']) if row['event'] else '', kickoff_utc=kickoff(row['kickoff_time']),
                home_team_code=teams[integer(row['team_h'])], away_team_code=teams[integer(row['team_a'])],
                home_goals=integer(row['team_h_score']), away_goals=integer(row['team_a_score']), home_xg='', away_xg='')


def canonical_core(season, row, codes):
    home, away = integer(row['home_team']), integer(row['away_team'])
    if home not in codes or away not in codes:
        raise ValueError(f'unknown FPL Core team code in {row["match_id"]}: {home}, {away}')
    return dict(season=season, source='fplcore', source_match_id=row['match_id'],
                gameweek=integer(row['gameweek']) if row['gameweek'] else '', kickoff_utc=kickoff(row['kickoff_time']),
                home_team_code=home, away_team_code=away, home_goals=integer(row['home_score']),
                away_goals=integer(row['away_score']), home_xg=valid_xg(row['home_expected_goals_xg']),
                away_xg=valid_xg(row['away_expected_goals_xg']))


def add_match(matches, row):
    if row['home_team_code'] == row['away_team_code']:
        raise ValueError('a team cannot play itself')
    # A PL club meets each opponent once at home per season. This detects
    # overlap even if two archives assign different match IDs or dates.
    key = (row['season'], row['home_team_code'], row['away_team_code'])
    if key in matches and matches[key] != row:
        raise ValueError(f'conflicting duplicate match: {key}')
    matches[key] = row


def build(va_root, core_root):
    matches = {}
    for season in VA_SEASONS:
        folder = va_root / 'data' / season
        team_rows = json.loads((folder / 'raw.json').read_text(encoding='utf-8'))['teams'] if season == '2018-19' else read_csv(folder / 'teams.csv')
        teams = {integer(t['id']): integer(t['code']) for t in team_rows}
        for row in read_csv(folder / 'fixtures.csv'):
            if row['finished'].lower() == 'true':
                add_match(matches, canonical_va(season, row, teams))
    for season in (CORE_SEASONS if core_root is not None else ()):
        folder = core_root / 'data' / season
        codes = {integer(t['code']) for t in read_csv(folder / 'teams.csv')}
        files = sorted((folder / 'By Gameweek').glob('GW*/matches.csv'))
        if not files:
            raise ValueError(f'no match files for {season}')
        skipped_naive = 0
        for path in files:
            for row in read_csv(path):
                if row['tournament'] in ('prem', 'premier-league', 'premier_league') and row['finished'].lower() == 'true':
                    # Unknown timezones cannot safely be placed before a deadline.
                    d = datetime.fromisoformat(row['kickoff_time'].replace('Z', '+00:00'))
                    if d.utcoffset() is None:
                        skipped_naive += 1
                        continue
                    add_match(matches, canonical_core(season[:4] + '-' + season[-2:], row, codes))
        if skipped_naive:
            warnings.warn(f'{season}: excluded {skipped_naive} matches without timezone information')
    return sorted(matches.values(), key=lambda r: (r['kickoff_utc'], r['home_team_code']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vaastav', type=Path, required=True)
    parser.add_argument('--fplcore', type=Path, help='optional local FPL Core source')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows = build(args.vaastav, args.fplcore)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'Wrote {len(rows)} unique matches to {args.output}')


if __name__ == '__main__':
    main()
