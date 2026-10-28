# Publishing FPL VORTEX publicly

## The one rule

**A public GitHub repository can always be cloned.** There is no setting, licence or flag
that makes a public repository's contents un-copyable — cloning and forking are what public
repositories are *for*, and GitHub's Terms of Service require a public repository to allow
viewing and forking.

A licence does not prevent copying either. It only gives you the right to act *after*
someone copies. All-rights-reserved is a legal position, not a technical lock.

So the decision is not "how do I make it public but uncopyable". It is:

> **Which files do I want people to have?**

## What you actually care about

| Asset | Sensitive? | Notes |
| --- | --- | --- |
| `2_notebooks/` (4 notebooks, ~19 MB) | **Yes** | The analysis and model development |
| `3_data_third_party/*.csv` (projections) | **Yes** | The 667-player xPts/xMins benchmark |
| `server/solver.py` (MILP optimizer) | **Yes** | The optimisation engine |
| `src/lib/repoModel/`, `src/lib/optimize.ts` | **Partly** | Scoring rules and beam search |
| `public/data/fpl-snapshot.json` | No | Derived from the public FPL API |
| `src/`, `server/index.ts`, UI, brand kit | No | Standard app code and branding |
| `.env` | **Never** | Not tracked; verify before any publish |

## Reality check: numbers shown on screen are extractable

The dashboard renders xPts, xMins and projections per player. To render them, the browser must
receive them. Today `GET /api/vortex/snapshot` returns all 667 players with
`gwProjections`, `repoBenchmarkXpts` and `gwExpectedMinutes` in one 831 KB response, and
`GET /data/fpl-snapshot.json` serves the same data as a static file.

That is inherent to a public dashboard: **what a visitor can see, a visitor can copy.** You can
raise the cost (rate limits, no bulk endpoint, no CSV buttons) but you cannot make it impossible
while still showing the numbers.

What stays genuinely private is the *method*: the notebooks, the raw benchmark CSV and the solver.
Nobody can reconstruct those from a rendered projection.

## Options

### Option A — keep the repository private (recommended)

- Public site: `https://fplvortex.onrender.com` — anyone can use it.
- Private repository — nobody can read the code, notebooks, CSV or solver.
- Zero effort, and already the current setup.

This is the only configuration that gives "everyone can use the site, nobody can take the data".

### Option B — split: public showcase repo, private engine repo

Public repo contains only what is safe: the React UI, styles, brand kit, docs and the
deploy workflow. The private repo holds `2_notebooks/`, `3_data_third_party/`,
`server/solver.py` and the data build.

The deploy pipeline checks out the private repo with a read-only token and copies the
generated data into the build, so nothing proprietary is ever committed publicly:

```yaml
- uses: actions/checkout@v4          # public repo
- uses: actions/checkout@v4
  with:
    repository: mukudahal/FPLVORTEX-private
    token: ${{ secrets.PRIVATE_REPO_TOKEN }}
    path: private
- run: cp -r private/3_data_third_party ./3_data_third_party
```

Cost: two repositories to maintain, and the public repo is still forkable (it just contains
nothing valuable). The deployed site still shows the projections, so they remain extractable
from the API exactly as described above.

### Option C — publish everything

Accept that the notebooks, benchmark and solver become reusable by anyone, including
commercially, unless you rely on the all-rights-reserved licence to pursue them afterwards.
Not recommended if the projections and method are the actual product.

## Pre-publish checklist

- [ ] `git ls-files | grep -E '^\.env($|\.)' | grep -v '\.example$'` returns nothing
- [ ] `git log --all --oneline -- .env .env.local` returns nothing (secrets in history count)
- [ ] No API keys in `src/` — they belong in `server/` and in the host's environment variables only
- [ ] Decide which of `2_notebooks/`, `3_data_third_party/`, `server/solver.py` move to the private repo
- [ ] Re-read the table above and ask: "am I fine with a stranger downloading each of these?"

The `Visibility guard` workflow (`.github/workflows/visibility-guard.yml`) runs on every push to
`main`, on a daily schedule and on demand. If the repository is public while any proprietary path
is tracked, the job fails and names the files.
