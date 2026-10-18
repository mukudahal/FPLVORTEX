# Home: Step 1 — Uploaded v0.8 dashboard source comparison

The owner uploaded `FPLVORTEX-feat-premium-vortex-foundation.zip`, which identifies itself as **v0.8.0**. We inspected its `src/app.ts`, CSS, documentation, and pitch renderer. It has a left sidebar and a demonstration-team dashboard, as well as a green pitch and a source-attributed, five-player Commons portrait map. The newer working Home PR was branched from **v0.9** and includes a separate `src/home.ts`, live FPL entry/fixture data requests and interactive rankings. Replacing the new Home with the old full dashboard would remove these newer improvements, so the reuse is selective.

## Adapted in this increment

- Group the public FPL picks by true official positional slots, retaining the existing 11-player/bench visual from Home (matching the older squad renderer's formation concept).
- Introduce original, prominent **club-coded player gradient cards** for all 20 known PL club short codes, rather than pale monograms. Tottenham/Newcastle dark kits and lighter Manchester City/Leeds kits use readable foregrounds.
- Preserve real reported FPL captain/vice markers, per-gameweek point labels, and the live rather than demonstration team data boundary.
- Add clear **amber uncertain / red unavailable** visual warnings from the FPL status field, without claiming a verified club medical report.
- Upgrade all Home card subheadings to vivid, distinct gradient bands (squad green, results blue, research purple, player ranks cyan, market turquoise, health rose/red, YouTube teal), with larger labels and more contrast on both desktop and mobile.
- Keep the original credited five community portraits where name matching succeeds; otherwise show explicit club-colored player initials. No photo binaries were provided in the uploaded archive. Do **not** replace unavailable portraits with unlicensed Premier League headshots or make claims of full photo coverage.

## Review gates

Home Page is a draft change on `feat/premium-horizontal-home` and must not be merged/deployed without approval. Desktop and mobile preview images are **sample design previews** only. No model training, real-price ETA, or historical validation was changed in this increment.