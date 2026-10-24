# Synthetic layout verification only — NOT FPL results

These three original 4K PNG images, PDF (three pages), and PPTX (three slides) were generated from `../sample-report.json`, a clearly labeled **synthetic test fixture**. Do not use them as official FPL records or live player predictions.

For real exports, use the versioned observed JSON from `/api/reports/<manager>/<gw>`, then execute `python scripts/reporting/render_report.py --json <path> --out <dir>`. The dashboard route also provides a single 4K PNG to signed-in accounts. Model-calibrated forecast presentations are not yet implemented.
