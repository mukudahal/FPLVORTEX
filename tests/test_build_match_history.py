import unittest
import csv
from pathlib import Path
from collections import Counter
from scripts.build_match_history import add_match, canonical_core, canonical_va, kickoff, valid_xg


class MatchHistoryTests(unittest.TestCase):
    def test_vaastav_uses_stable_club_codes_not_season_ids(self):
        row = {'id': '7', 'event': '1', 'kickoff_time': '2024-08-16T19:00:00Z',
               'team_h': '1', 'team_a': '2', 'team_h_score': '2', 'team_a_score': '1'}
        result = canonical_va('2024-25', row, {1: 3, 2: 7})
        self.assertEqual((result['home_team_code'], result['away_team_code']), (3, 7))
        self.assertEqual(result['home_xg'], '')

    def test_fplcore_match_xg_and_team_code(self):
        row = {'match_id': 'x', 'gameweek': '1.0', 'kickoff_time': '2025-08-16T19:00:00+00:00',
               'home_team': '3.0', 'away_team': '7.0', 'home_score': '2.0', 'away_score': '1.0',
               'home_expected_goals_xg': '1.7', 'away_expected_goals_xg': '0.9'}
        result = canonical_core('2025-26', row, {3, 7})
        self.assertEqual(result['home_xg'], 1.7)
        with self.assertRaises(ValueError):
            canonical_core('2025-26', row, {3})

    def test_duplicate_conflict_fails_closed(self):
        rows = {}
        row = dict(season='2025-26', home_team_code=3, away_team_code=7, home_goals=1)
        add_match(rows, row)
        add_match(rows, dict(row))
        self.assertEqual(len(rows), 1)
        with self.assertRaises(ValueError):
            add_match(rows, dict(row, home_goals=2))

    def test_checked_in_historical_data_is_unique_and_complete(self):
        path = Path(__file__).resolve().parents[1] / 'data/fpl-match-history/vaastav-2018-2026.csv'
        with path.open(encoding='utf-8', newline='') as f:
            rows = list(csv.DictReader(f))
        counts = Counter(row['season'] for row in rows)
        expected = {f'{year}-{str(year + 1)[-2:]}': 380 for year in range(2018, 2026)}
        self.assertEqual(counts, expected)
        self.assertTrue(all(row['source'] == 'vaastav' and not row['home_xg'] and not row['away_xg'] for row in rows))
        self.assertEqual(len(rows), len({(r['season'], r['home_team_code'], r['away_team_code']) for r in rows}))
        self.assertTrue(all(r['kickoff_utc'].endswith('Z') and int(r['home_goals']) >= 0 and int(r['away_goals']) >= 0 for r in rows))

    def test_missing_timezone_and_invalid_xg_rejected(self):
        with self.assertRaises(ValueError):
            kickoff('2026-08-21T19:00:00')
        with self.assertRaises(ValueError):
            valid_xg('nan')
        self.assertEqual(kickoff('2025-08-16T20:00:00+01:00'), '2025-08-16T19:00:00Z')


if __name__ == '__main__':
    unittest.main()
