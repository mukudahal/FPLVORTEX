# FDR and all-team planning

Research date: 2026-11-03. Inspected production source: ee1896e44c03a74de9b5eb6021f28af23cfc9924. This documents implementation behavior, not measured forecast accuracy.

## Three different quantities

| Quantity | Source | Effect |
|---|---|---|
| Official FPL FDR, 1 easy–5 hard | Normalized fixture teamHDifficulty/teamADifficulty | Input to mechanistic player xPts |
| VORTEX Attack index, 1 easy–5 hard | Projected team goals | Display output, not a second prediction multiplier |
| VORTEX Defence index, 1 easy–5 hard | Team clean-sheet probability | Display output, not a calibrated probability |

Official FPL describes perceived opponent difficulty using Opta variables and each club's home/away form over six matches. It does not describe a guaranteed score, an FPL points multiplier or separate attack/defence ratings. Sources: https://fantasy.premierleague.com/fixtures/fdr and https://www.premierleague.com/en/news/68553 .

## Effect on player predictions

`repoModel/xpts.ts::computePlayerXPts` uses official difficulty D for each fixture. Goal/assist rates multiply by `(home ? 1.06 : 0.94) * (1+(3-D)*0.11)`. Conceding intensity multiplies by `(home ? 0.91 : 1.09) * (1+(D-3)*0.14)`, floored at 0.45 before the clean-sheet blend. Full-match CS probability is `0.7*exp(-conceding intensity) + 0.3*min(0.6, shrunk observed CS rate)`. Saves and bonus have their own difficulty adjustments.

| Official difficulty | Attack factor before venue | Conceding/save factor before venue |
|---|---:|---:|
| 1 | 1.22 | 0.72 |
| 2 | 1.11 | 0.86 |
| 3 | 1.00 | 1.00 |
| 4 | 0.89 | 1.14 |
| 5 | 0.78 | 1.28 |

These are coefficients, not observed causal effects. D=2 versus D=4 gives a 1.11/0.89 = 24.72% higher attack-rate factor at identical venue and inputs. Total player xPts does not rise by 24.72%: minutes states, position, appearance, clean sheets and other scoring components remain separate. A secure starter can still beat a better-fixture rotation risk.

## Effect on team predictions

`fixtureForecast.ts::makeFixtureForecasts` delegates to the production strength model and historical-strength override. Home goals = `1.55 * home attack * away defensive weakness`; away goals = `1.25 * away attack * home defensive weakness`. One independent-Poisson score distribution supplies goals, CS and win/draw/loss. CS equals exp(-opponent intensity), subject to bounded numerical tail error.

Official FDR is not directly multiplied into these team rates. VORTEX mode ignores bookmaker odds. The resulting display scales are:

- Attack = `1 + 4*clamp((2.8-goals)/2.2,0,1)`.
- Defence = `1 + 4*clamp((0.65-CS)/0.55,0,1)`.
- Overall = their arithmetic mean.

Examples: 2.4 projected goals gives Attack 1.73; 1.0 gives 4.27. A 50% CS chance gives Defence 2.09; 20% gives 4.27. Multiplying forecasts by these outputs would double count the opportunity. Saturation at 1/5 hides further differences; inspect goals and CS when indices tie.

The historical percentile reference module is not connected to this visible index. These fixed mappings remain provisional and uncalibrated. Notebook and TypeScript models differ; numerical parity is not claimed. Historical-strength calculation time is not necessarily the newest match observation. Refreshing official facts does not refresh dated imported player projections.

## Reproduce the board

```bash
node --import tsx scripts/export-team-planning.ts public/data/fpl-snapshot.json /tmp/team-planning 5
python scripts/render-team-planning.py /tmp/team-planning.json /tmp/team-planning.png
```

Use freshly retrieved official inputs. The export refuses stale/failed-upstream inputs, records actual computation time and input-byte SHA-256, and delegates to the existing team model. It keeps all 20 clubs, individual double fixtures and schedule blanks; the horizon clips at GW38. CSV has per-match rows and spreadsheet-formula protection. The optional PNG renderer needs Pillow and the existing production badge proxy; missing badges fail visibly. It generates 3840x2160 and supports up to five selected GWs. It never modifies manager plans or production data.

Goals and expected clean sheets sum per fixture; expected CS is a count, not a probability. Two 40% chances mean 0.80 expected clean sheets, not an 80% probability of at least one. Index means exclude blanks. Next-GW CS/win columns average that GW's fixtures; consult per-match JSON/CSV for doubles. A blank means no match currently scheduled, not a guarantee against later rescheduling.

Use goals/Attack for attacking opportunity and CS/Defence for defensive opportunity, then check minutes, role, availability, price and transfer cost in Planner. Compare five-GW totals for transfers and next-GW predictions for lineup decisions. A low mean index is not proof of higher player points when fixture counts differ.

## Evidence and release limits

Production forced refresh on 2026-11-03 at 09:18:21 EST retrieved 670 official players and 380 fixtures; recovery status was saved and public official-source health fresh. Render confirmed ee1896e4 live. Bookmaker rights remained unverified despite matched quotes, so this board uses no bookmaker figures.

Calibration requires genuine pre-deadline archived forecasts and matched settled outcomes with chronological holdouts and simple baselines. The existing prospective archive supports collection; reconstructed history must not be advertised as an as-of backtest. Evaluate probability scoring, goal errors, minutes, player points and coverage before making accuracy claims.

Focused regressions cover all clubs, probability coherence, input immutability, doubles/blanks, season-end clipping, stale/failed sources, fixture references and independence from odds/display FDR. Full release checks remain required before merge. Cloud/admin PR60 and joint research PR71 remain deferred behind their staging/real-manager gates.
