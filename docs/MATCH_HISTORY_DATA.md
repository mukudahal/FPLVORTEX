# Research match-history source

VORTEX keeps one source per season for the match-history research data. Historical match results now inform a provisional goals-based team-strength model used for fixture forecasts when market odds are unavailable. They are not used in player xPts or the calibrated FDR reference.

## Historical matches: Vaastav

`data/fpl-match-history/vaastav-2018-2026.csv` contains 3,040 completed Premier League matches: 380 per season from 2018/19 through 2025/26. It contains fixture ID, gameweek, UTC kickoff, stable FPL club codes and final goals. It does **not** contain team xG, odds, player histories or historical forecasts; the xG fields are intentionally blank. Records are unique by season and home/away club codes. 2016/17 and 2017/18 are not included because this import uses match fixture files and those seasons do not have the equivalent fixture files in this source.

Source: [Vaastav's Fantasy Premier League historical dataset](https://github.com/vaastav/Fantasy-Premier-League), commit `d7b05b51d137bfefef4b692386d18c610975b9b9`. `vaastav-source-manifest.json` lists the original Git blob IDs.

```bibtex
@misc{anand2016fantasypremierleague,
  title = {{FPL Historical Dataset}},
  author = {Anand, Vaastav},
  year = {2022},
  howpublished = {Retrieved August 2022 from \url{https://github.com/vaastav/Fantasy-Premier-League/}}
}
```

The August 2022 date is part of the supplied citation, not VORTEX's retrieval date.

The 2018/19 team mapping comes from that season's `raw.json`; later mappings come from each season's `teams.csv`. The raw source files remain in `/home/user/vaastav-fpl-data` and are not copied wholesale into Git. The selected normalized CSV is about 170 KB. To regenerate it with that local download:

```sh
python3 scripts/build_match_history.py \
  --vaastav /home/user/vaastav-fpl-data \
  --output data/fpl-match-history/vaastav-2018-2026.csv
python3 -m unittest discover -s tests -p 'test_build_match_history.py'
```

The script fails on conflicting duplicate matches and ignores exact identical duplicates. Optional FPL Core input is for separate research only: its 2026/27 rows are excluded when kickoff timezone is missing. It is not used to fill or duplicate the Vaastav seasons in the checked-in file.

## VORTEX's own automatic collection

`data/fpl-match-history/2026-27.json` seeds VORTEX's archive with the 80 finished fixtures in its existing official-FPL snapshot, observed at the snapshot's recorded generation time (2026-10-28T22:42:09.206Z). These are not claimed to be observations from the original matchdays. This archive and the historical CSV are outside `public/` and are not copied into the website's static assets.

The existing `.github/workflows/refresh-data.yml` runs every six hours. After a successful direct official-FPL snapshot refresh it runs `npm run data:archive-matches` and commits the private history alongside the snapshot. It skips collection when manually mirroring the deployment. This only runs on GitHub once the workflow changes reach the default branch and Actions is enabled; it has not been live-tested in Actions. Failures stop the workflow instead of overwriting history. Storage grows modestly and is not a full repository mirror.

The archive has one fixture record per FPL fixture ID and team pairing per season. For a corrected score, kickoff, or gameweek it keeps each changed version with the time VORTEX observed it. The code rejects stale snapshots, mismatched seasons, duplicate fixtures and out-of-order observations. It collects scores and match scheduling only—not team xG, historical odds, player projections, player history or a complete pre-deadline archive. The latest official-FPL snapshot supplies current-season completed matches to the goal model; archived prior seasons can also be used. It does not backfill older seasons.

## Leakage and permissions

Scores are post-match outcomes. A chronological backtest must use a match only once its result and relevant statistics were available before the prediction deadline; kickoff alone is not availability time. The historical CSV is a later download, not proof of what data was available at a past deadline. Revisions and fixture rescheduling need further audit. The archive does not establish historical pre-deadline market prices, exact publication times or forecast quality. Current-season aggregates must never be treated as historical input snapshots. Vaastav's README warns that its `xP` field may be post-match; this pipeline does not use it.

Vaastav's repository includes an MIT license for software but explicitly says the underlying data belongs to FPL and Understat. Public access and software licenses do not by themselves establish rights to republish the data. This selected copy is intended for the private repository, not redistribution on the public site; confirm underlying reuse permissions before publication. An independent collector does not grant rights to republish upstream data.

## Provisional fixture maths

`server/matchHistory.ts` uses previous-season history and the current official-FPL snapshot to build team attack and defence strengths from scored and conceded goals separately for home and away. Matches are weighted with a 365-day half-life and pooled toward fixed league averages with an eight-match prior; both are provisional assumptions, not fitted parameters. A current-season snapshot match is never combined with its archived copy. Only matches marked finished at least three hours after kickoff are included; this is a conservative heuristic, **not** proof of when the score became available. Prior-season archive revisions are selected only if observed by the snapshot time. Current season changes are available through the regular FPL refresh; the GitHub archive only updates after these changes are merged and its workflow runs.

The server provides derived strengths (not the raw history) in the snapshot. The dashboard and fixture/planner matrix use the same strengths as a fallback; matched market rates still take priority. Missing or invalid history falls back to the existing team model. The method is not opponent-adjusted, calibrated, chronologically backtested, or linked to player xPts. Historical CSV corrections are not timestamped, and fixed parameters and the three-hour rule require evaluation before any accuracy claims. Publicly served projections may be derived from third-party data; verify reuse permissions before publication.
