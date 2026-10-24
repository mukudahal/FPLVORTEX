# VORTEX Studio — independent report renderer

1. Fetch the official observed report JSON from `/api/reports/<entry-id>/<gw>` after the GW has started, or provide a stored report JSON with schema `vortex-report-v1`.
2. `pip install -r scripts/reporting/requirements.txt`
3. `python scripts/reporting/render_report.py --json /path/to/report.json --out /path/to/output`
4. Generates THREE 3840 × 2160 original PNG slides, a 16:9 `.pptx` deck, and a PDF containing the same three slides. System fonts are not embedded in the output.

The site `/reports` offers HTML + Print to PDF and an on-demand 4K PNG cover. The full three-slide exports use this explicit batch command (no uploaded data). Uploaded predictions are not inferred or invented. Publishing automation and cloud storage need explicit user opt-in and credentials.
