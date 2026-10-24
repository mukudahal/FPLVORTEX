# FPL VORTEX — consolidated project

Open `1_APP_dashboard` to work on the website. It is the canonical Next.js application.

## Contents

| Location | Purpose |
| --- | --- |
| `1_APP_dashboard/` | Website, backend, migrations, jobs, tests, and preserved Git history |
| `2_notebooks/` | Existing forecasting and reporting notebooks |
| `3_data_third_party/` | Existing saved third-party projections |
| `4_backup/` | Existing application backup archive |
| `5_screenshots_reference/` | Existing visual references |
| `6_replica_docs/` | Existing feature and design documentation |
| `7_skills/` | Existing packaged FPL planner skill |
| `8_project_reports/` | Progress reports and principal-engineer handoff |
| `design-tools/design-taste-frontend/` | One consolidated copy of the design skill and tools |
| `MERGE_MANIFEST.json` | Source-to-destination mappings, SHA-256 checksums, and verification results |

## Merge verification

- Accounted for all 1,557 source files, excluding macOS Finder metadata.
- Preserved 1,188 source files in the consolidated tree.
- Combined 369 identical duplicates without overwriting differing files.
- Preserved 0 differing files in `merge-conflicts/`.
- Verified every preserved file by SHA-256 and confirmed the original sources were unchanged.
- Preserved application Git history at `e9233112c1462bbcaa48588ff5055d703dbf2cf1` and the existing working-tree state.

The original Desktop folders remain in place. This consolidation reorganizes files; it does not change application behavior, install dependencies, activate automation, or verify live-data accuracy.

For existing application setup and status, read `1_APP_dashboard/UPGRADE_README.md` and the reports in `8_project_reports/`.
