> **Canonical release:** the root Vite/React/Express app on Render. Start with [release baseline](docs/RELEASE_BASELINE.md), [production model specification](docs/MODEL_SPEC.md), and the sole [release backlog](docs/VORTEX_V2_OUTSTANDING.md). Next.js, model-lab and notebook trees are retained research/candidates, not deployed replacements.

# FPL VORTEX (`@FPLVORTEX`)

<p align="center">
  <img src="public/og-image.svg" alt="FPL VORTEX — Automated Fantasy Premier League Intelligence" width="100%" />
</p>

**FPL VORTEX** is a private Fantasy Premier League intelligence, Gameweek Review, and squad optimization platform built for **`@FPLVORTEX`** — powered by official public FPL endpoints, repository benchmark archives (`3_data_third_party/`), 2026/27 scoring & chip simulation modules (`src/lib/repoModel/`), and the official FPL VORTEX brand kit (`brand-kit/`).

> **Visibility Status:** Private repository (`mukudahal/FPLVORTEX`). Public GitHub Pages auto-publishing is **disabled** so you can develop and test privately first; an opt-in manual deploy workflow (`.github/workflows/deploy-pages.yml`) is included for whenever you decide to publish later.

---

## What's Inside

- **Home Hub (`/#/command`)**
  - **Crowned-Lion `@FPLVORTEX` Branding** pinned at the top-left corner and across pitch boards.
  - **Compact VORTEX Hero** with live deadline status, `#1 Captain` call, `Best 5-GW run`, and repository benchmark coverage.
  - **Prominent Top FPL Team ID Gate & Review Gameweek Mode** — Enter any public FPL Team ID (or quick-load `#145784` `FPLVORTEX`) and switch between **Review Gameweeks (`GW 8`, `GW 7`, …)** and **Forecast GW (`GW 9`)** to unlock your 15-player emerald **Soccer Pitch** (`Pitch | Table` toggle), Review GW score, GW rank, overall rank, squad value, and free transfers.
  - **Official FPL App Transfer Sync** — Cache-busting `?refresh=1&gw=` refresh with `/entry/{id}/transfers/` reconciliation plus a 1-click **Sync App Transfer** modal for pre-deadline Official FPL App moves (propagating live into **Team Planner**).
  - **3-Column Upper Hub** (`Soccer Pitch` + `GW Fixtures` with `Projected xG` split bars + `GW Projected Goals` with `Goals | CS% | Win%` tabs across all 20 clubs).
  - **3-Column Lower Intelligence Grid** (`Top Players`, `Price & Transfers`, `Injuries & Suspensions`) + **Compact Horizontally Scrollable `@FPLVORTEX` YouTube Strip** linked directly to `https://www.youtube.com/@Fplvortex`.
- **Team Planner & Squad Optimizer (`/#/optimizer`)** — Beam-search + exact Python MILP solver (`/api/vortex/solve`), 2026/27 banked free transfers (`max 5`), FPLReview-style chip simulator (`WC`, `FH`, `BB`, `TC`), and paired Monte Carlo simulation.
- **Player Lab (`/#/players`)** — Searchable, filterable, CSV-exportable table of all 667 Premier League players with FDR-5 ratings, repository `xMins` / 5-GW `xPts`, and explainable player breakdowns.
- **Fixture Matrix (`/#/fixtures`)** — 5-gameweek club difficulty heatmap with Blank (`BLK`) & Double (`2×`) indicators, schedule swing rankings, and CSV export.
- **League Intel (`/#/league`)** — Passwordless public FPL team (`145784` or any entry ID) and classic league (`314` or any league ID) scanner with rival transfer upgrades and standings.
- **Model & Methodology (`/#/method`)** — Full transparency into system health, 2026/27 DefCon scoring rules, upstream feeds, and resilience architecture.

---

## Manual personal five-gameweek plan

Run `node --import tsx scripts/export-my-team-plan.ts 145784 reports/my-team` after `npm ci`, or use the manual-only **My Team Planner** Actions workflow. Select the number of upcoming gameweeks and read the plan in the run summary. See [manual planning instructions](docs/MY_TEAM_PLAN.md).

## Local & Private Preview Quick Start

Requires **Node.js 20.19+** (Node 22 LTS recommended).

```bash
git clone https://github.com/mukudahal/FPLVORTEX.git
cd FPLVORTEX
npm ci
npm run dev
```

Open **`http://localhost:3000`** (or `http://<your-computer-lan-ip>:3000` from your phone on the same Wi-Fi — the server binds to `0.0.0.0:3000`).

### Production Build & Verification

```bash
npm run typecheck    # Strict TypeScript check across src, server, scripts, tests
npm test             # 15/15 unit & repository math-parity tests
npm run build        # Builds dist/ client bundle + dist/data/ static repo snapshot & videos
npm run preview      # Builds and runs the production Express server on 0.0.0.0:3000
```

### Mirroring the Published Deployment Snapshot

When the machine running the preview cannot reach `fantasy.premierleague.com` (sandboxes, locked-down
networks), mirror the already-enriched snapshot from the published deployment instead:

```bash
VORTEX_UPSTREAM_BASE=https://fplvortex.onrender.com npm run data:mirror
```

That writes `public/data/fpl-snapshot.json` with the deployment's live payload — official FPL data
**plus** bookmaker odds (`marketOdds`, `meta.oddsMeta`) — and records `meta.mirroredFrom` /
`meta.mirroredAt`. A mirrored snapshot inside `VORTEX_MIRROR_FRESH_MINUTES` (default `180`) is served
as healthy cached data (`source: "cache"`, `stale: false`) and its odds enrichment is reused as-is
instead of being re-fetched locally.

To refresh it from CI, bump the request marker — the `Mirror deployment snapshot` workflow runs on
any branch, pulls the deployment snapshot and commits it:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ > .github/mirror-request.txt
git commit -am "chore(data): request deployment mirror" && git push
```

The scheduled `Refresh FPL snapshot` workflow also accepts a manual `source: deployment` input on
the default branch.

### Private Preview Options (Without Making the Repo Public)

1. **Local / Same-Wi-Fi Mobile Testing**: Run `npm run preview` on your laptop/desktop and open `http://<local-ip>:3000` on your phone.
2. **GitHub Actions Build Artifact**: Every CI run on GitHub Actions uploads the compiled `fpl-vortex-dist` bundle under **Actions → CI → Artifacts** (includes pre-built `dist/data/vortex-snapshot.json` and `dist/data/vortex-videos.json` so `npx serve dist` works even without the Express backend).
3. **Private Cloud Preview (Vercel / Cloudflare Pages / Render)**: Connect the private GitHub repo with password/access-protected preview URLs — the repository stays private.
4. **Opt-In GitHub Pages (Disabled Until Ready)**: `.github/workflows/deploy-pages.yml` is strictly manual (`workflow_dispatch` with `confirm_public_publish: false` by default) and will **never** publish automatically on push.

---

## Architecture & Data Priority Chain

```text
Tier 1 (Primary Repo Truth):
  • 3_data_third_party/fplcopilot-projections-gw7-2026-10-15-v4.csv (667 player xMins & xPts)
  • src/lib/repoModel/* (exact port of site/model/* math, DefCon 2026/27, chip & Monte Carlo sims)
  • site/ui/videos.json + live YouTube RSS (@FPLVORTEX channel UCDU7nEIN72xoiR3NtxCT6CQ)
  • Configured manager entry 145784 (FPLVORTEX) & classic league 314
        ↓
Tier 2 (Live Official FPL API Supplement):
  • /bootstrap-static/, /fixtures/, /event/{id}/live/, /entry/{id}/, /entry/{id}/history/, /entry/{id}/transfers/
        ↓
Tier 3 (Last-Resort Offline Fallback):
  • dist/data/vortex-snapshot.json, dist/data/vortex-videos.json, public/data/fpl-snapshot.json
```

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health, cache source, 2026/27 season rules, and repository metadata |
| `GET` | `/api/vortex/snapshot` | Normalized FPL universe enriched with repository `xMins` / `xPts` benchmarks & live betting odds |
| `POST` | `/api/vortex/refresh` | Rate-limited manual upstream refresh (FPL + live bookmaker odds) |
| `GET` | `/api/vortex/odds` | Live bookmaker-implied Goals (`homeXg`/`awayXg`), Clean Sheet %, and de-vigged `1X2` Win % (`?gw=9&refresh=1`) |
| `GET` | `/api/vortex/entry/:id` | Manager entry, Review/Forecast GW picks (`?refresh=1&gw=`), transfer reconciliation & offline fallback |
| `GET` | `/api/vortex/league/:id` | Classic league standings and rank movement |
| `GET` | `/api/vortex/videos` | `@FPLVORTEX` channel video briefings (live YouTube RSS merged with `site/ui/videos.json`) |
| `POST` | `/api/vortex/solve` | Exact Python MILP multi-horizon squad/transfer optimizer |
| `GET` | `/api/img/player/:code` | Official PL portrait cache/proxy with club shirt & monogram fallback |
| `GET` | `/api/img/badge/:teamCode` | Official PL club crest cache/proxy |

---

## Ownership, Privacy & Backups

**Licence:** proprietary — all rights reserved (see `LICENSE`). This repository was previously
MIT-licensed; that permissive grant has been withdrawn so the models, notebooks and brand kit stay
exclusive to `@FPLVORTEX`.

**What is public vs private**

| Public | Private (this repository only) |
| --- | --- |
| The deployed site at `https://fplvortex.onrender.com` — anyone with the link can view and use it | Source code, notebooks, benchmark CSV, projections, brand kit, docs |
| The JSON API responses the site itself fetches | `.env` and any API keys (never committed) |

**Never committed:** `.env`, `node_modules/`, `dist/`, `.cache/` — see `.gitignore`. No FPL Team ID
is ever stored server-side; saved IDs live in the visitor's own browser.

**Backups** — GitHub is the master copy, but a private repository can still be lost through account
loss or accidental deletion, so keep an offline copy:

```bash
bash scripts/backup-local.sh                 # -> ~/FPLVORTEX-backups
bash scripts/backup-local.sh /Volumes/SSD    # custom destination
```

That writes a full mirror clone (every branch, tag and commit) plus a single `.bundle` file you can
drop into Google Drive or a USB stick, and keeps the three most recent snapshots. Restore with
`git clone <backup>.bundle FPLVORTEX`.

**Recommended account hygiene:** enable two-factor authentication on the GitHub account, keep the
repository private, and review the Dependabot pull requests listed in the repository's Pull requests tab.

---

## Docker

```bash
docker compose up --build
```

