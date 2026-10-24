#!/usr/bin/env python3
"""Fail if the canonical 61-step upgrade ledger is malformed or skips steps."""
from __future__ import annotations
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "docs" / "upgrade" / "PROGRESS.csv"
VALID_STATUS = {"PENDING", "IN_PROGRESS", "DONE", "DONE_WITH_BLOCKER", "BLOCKED"}


def verify_progress() -> None:
    with LEDGER.open("r", newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 61:
        raise ValueError(f"Expected exactly 61 tasks; found {len(rows)}")
    for expected, row in enumerate(rows, start=1):
        if row["step"] != str(expected):
            raise ValueError(f"Expected step {expected}; found {row['step']!r}")
        if row["status"] not in VALID_STATUS:
            raise ValueError(f"Invalid status for step {expected}: {row['status']!r}")
        if not row["task"].strip() or not row["priority"].strip():
            raise ValueError(f"Missing task or priority for step {expected}")
        if row["status"].startswith("DONE") and not row["deliverables_or_release_gate"].strip():
            raise ValueError(f"Step {expected} marked done without artifact")
    done = sum(row["status"].startswith("DONE") for row in rows)
    blocked = sum(row["status"] in {"BLOCKED", "DONE_WITH_BLOCKER"} for row in rows)
    print(f"FPL VORTEX upgrade ledger valid: {done}/61 audited/finished, {blocked} with blockers.")


if __name__ == "__main__":
    verify_progress()
