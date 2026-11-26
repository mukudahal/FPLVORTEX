"""Walk-forward research on observed results. No changes to the live forecast."""
import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson, skellam


def load_results(path):
    with path.open(newline="") as stream:
        rows = list(csv.DictReader(stream))
    seen = set()
    result = []
    for row in rows:
        key = (row["season"], row["source_match_id"])
        instant = datetime.fromisoformat(row["kickoff_utc"].replace("Z", "+00:00"))
        if key in seen or instant.utcoffset() is None:
            raise ValueError("Missing timezone or duplicate match")
        seen.add(key)
        result.append((row["season"], int(row["gameweek"]), instant,
                       int(row["home_team_code"]), int(row["away_team_code"]),
                       int(row["home_goals"]), int(row["away_goals"])))
    return sorted(result, key=lambda r: r[2])


def fit(training, cutoff, half_life, penalty):
    clubs = {club: i for i, club in enumerate(sorted({c for m in training for c in m[3:5]}))}
    n = len(clubs)
    home, away = [np.array([clubs[m[index]] for m in training]) for index in [3, 4]]
    attacking, defending = np.r_[home, away], np.r_[away, home]
    y = np.r_[[m[5] for m in training], [m[6] for m in training]]
    age = np.array([(cutoff - m[2]).total_seconds() / 86400 for m in training])
    w = np.tile(2 ** (-age / half_life), 2)
    venue = np.repeat([0, 1], len(training))
    means = np.bincount(venue, weights=w*y) / np.bincount(venue, weights=w)
    def objective(theta):
        eta = theta[venue] + theta[2 + attacking] + theta[2 + n + defending]
        diff = w * (np.exp(eta) - y)
        grad = np.r_[np.bincount(venue, weights=diff),
                     np.bincount(attacking, weights=diff, minlength=n),
                     np.bincount(defending, weights=diff, minlength=n)]
        grad[2:] += penalty * theta[2:]
        return np.sum(w * (np.exp(eta) - y * eta)) + penalty * np.dot(theta[2:], theta[2:]) / 2, grad
    result = minimize(objective, np.r_[np.log(means), np.zeros(2*n)], jac=True, method="L-BFGS-B",
                      bounds=[(-3, 3)] * (2 + 2*n), options={"ftol": 1e-11, "maxiter": 200})
    if not result.success:
        raise RuntimeError(result.message)
    theta = result.x
    def rates(home_code, away_code):
        def strength(code, offset):
            return theta[offset + clubs[code]] if code in clubs else 0.0
        return [np.exp(theta[0]+strength(home_code, 2)+strength(away_code, 2+n)),
                np.exp(theta[1]+strength(away_code, 2)+strength(home_code, 2+n))]
    return rates, means


def eligible_training(matches, cutoff):
    # Final-score publication timestamps are absent in this retrospective CSV.
    return [m for m in matches if m[2] + timedelta(days=1) < cutoff]


def replay(matches, seasons, half_life, penalty):
    targets = defaultdict(list)
    for match in matches:
        if match[0] in seasons:
            targets[match[:2]].append(match)
    groups = []
    for key, fixtures in sorted(targets.items(), key=lambda kv: min(m[2] for m in kv[1])):
        cutoff = min(m[2] for m in fixtures) - timedelta(days=1)
        train = eligible_training(matches, cutoff)
        if not train:
            raise ValueError("Need a previous training season")
        predictor, means = fit(train, cutoff, half_life, penalty)
        groups.append((key, [(*m[5:7], *predictor(*m[3:5]), *means) for m in fixtures]))
    return groups


def summarize(groups, index):
    a = np.array([r for _, group in groups for r in group])
    y = a[:, :2]
    rates = a[:, index:index+2]
    ha, aa = rates.T
    prob = np.column_stack([skellam.sf(0, ha, aa), skellam.pmf(0, ha, aa), skellam.cdf(-1, ha, aa)])
    result = np.where(y[:, 0] > y[:, 1], 0, np.where(y[:, 0] == y[:, 1], 1, 2))
    observed = np.eye(3)[result]
    zero = y == 0
    cs = np.exp(-rates)
    # Home and away scoring rates are both evaluated. Zero goals is the opposing clean sheet.
    def reliability(p, outcome):
        groups = []
        for lo in np.arange(10) / 10:
            mask = (p >= lo) & ((p < lo+.1) if lo < .9 else (p <= 1))
            if mask.any():
                groups.append(dict(n=int(mask.sum()), predicted=float(p[mask].mean()), observed=float(outcome[mask].mean())))
        return groups
    q10, q90 = poisson.ppf(.1, rates), poisson.ppf(.9, rates)
    ks = np.arange(int(max(y.max(), poisson.ppf(1-1e-10, rates.max())))+1)
    crps = np.square(poisson.cdf(ks, rates[..., None]) - (y[..., None] <= ks)).sum(axis=2)
    return dict(matches=len(y), gameweeks=len(groups), goalsMAE=float(np.abs(y-rates).mean()),
                goalsRMSE=float(np.mean((y-rates)**2)**.5), scorelineLogLoss=float(-poisson.logpmf(y,rates).sum(axis=1).mean()),
                goalsCRPS=float(crps.mean()), goals80IntervalCoverage=float(np.mean((y>=q10)&(y<=q90))),
                goals80IntervalWidth=float((q90-q10).mean()), cleanSheetBrier=float(np.mean((cs-zero)**2)),
                cleanSheetReliability=reliability(cs,zero), resultBrier=float(np.mean(((prob-observed)**2).sum(axis=1))),
                resultLogLoss=float(-np.mean(np.log(prob[np.arange(len(y)),result]))),
                resultReliability={k:reliability(prob[:,i],observed[:,i]) for i,k in enumerate(["home","draw","away"])})


def run(path):
    records = load_results(path)
    seasons = sorted({m[0] for m in records})
    if len(seasons) < 4:
        raise ValueError("Need at least four complete seasons for separate training, tuning and testing")
    if any(sum(m[0] == s for m in records) != 380 for s in seasons):
        raise ValueError("Use the complete-season English Premier League archive")
    candidates = []
    for half_life in [180, 365]:
        for penalty in [4, 12]:
            tuning = replay(records, [seasons[-3]], half_life, penalty)
            candidates.append(dict(halfLifeDays=half_life, ridge=penalty, validationScorelineLogLoss=summarize(tuning,2)["scorelineLogLoss"]))
    chosen = min(candidates, key=lambda c:c["validationScorelineLogLoss"])
    groups = replay(records, seasons[-2:], chosen["halfLifeDays"], chosen["ridge"])
    blocks = []
    for _, rows in groups:
        a = np.array(rows)
        delta = -poisson.logpmf(a[:,:2],a[:,2:4]).sum() + poisson.logpmf(a[:,:2],a[:,4:6]).sum()
        blocks.append([len(rows), delta])
    blocks = np.array(blocks)
    sampled = blocks[np.random.default_rng(71).integers(len(groups), size=(2000,len(groups)))].sum(axis=1)
    return dict(method="Retrospective, goal-only regularised Poisson attack and defence with a venue intercept",
                archiveSha256=hashlib.sha256(path.read_bytes()).hexdigest(), sourceRows=len(records), trainStarts=seasons[0],
                tuningSeason=seasons[-3], holdoutSeasons=seasons[-2:], candidates=candidates, selected=chosen,
                baseline="Same exponentially weighted training outcomes and venue intercepts, no club effects",
                candidate=summarize(groups,2), venueBaseline=summarize(groups,4),
                pairedScorelineLogLossDifference95=np.quantile(sampled[:,1]/sampled[:,0],[.025,.975]).tolist(),
                limitations=["Historic fixtures and final scores were reconstructed after the season. Each GW is forecast as one batch one day before its earliest kickoff; prior results have an additional one-day lag.",
                             "Actual publication times, original schedules, as-of injuries, xG and market quotes are unavailable. New clubs start at league strength.",
                             "The tuning grid and scoring rule use the development season only. The interval resamples gameweeks and does not capture all serial dependence.",
                             "These are fixture outcome forecasts. Neither the retrospective venue baseline nor this experiment measures deployed player xPts or manager points."])


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("archive", nargs="?", type=Path, default=Path("data/fpl-match-history/vaastav-2018-2026.csv"))
    print(json.dumps(run(p.parse_args().archive), indent=2, allow_nan=False))
