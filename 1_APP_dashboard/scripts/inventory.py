#!/usr/bin/env python3
"""Generate a reproducible inventory of the FPL Vortex application source."""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "upgrade" / "03-source-files.csv"


def select_source_files() -> Iterable[Path]:
    roots = [ROOT / "src", ROOT / "scripts"]
    for scan_root in roots:
        for path in scan_root.rglob("*"):
            if path.is_file() and path.suffix in {".ts", ".tsx", ".py", ".cjs", ".mjs", ".js"}:
                yield path


def classify(path: Path) -> tuple[str, str]:
    relative = path.relative_to(ROOT).as_posix()
    if relative.startswith("src/app/api/") and path.name == "route.ts":
        route = relative.removeprefix("src/app").removesuffix("/route.ts")
        return "API route", route
    if relative.startswith("src/app/") and path.name == "page.tsx":
        route = relative.removeprefix("src/app").removesuffix("/page.tsx") or "/"
        return "Page route", route
    if relative.startswith("src/components/"):
        return "React component", ""
    if relative.startswith("src/lib/"):
        return "Shared analytical/service module", ""
    if relative.startswith("src/db/"):
        return "Database module", ""
    if relative.startswith("scripts/"):
        return "Tool/test", ""
    return "Other source", ""


def main() -> None:
    rows: list[dict[str, str | int]] = []
    for path in sorted(select_source_files(), key=lambda item: item.as_posix()):
        relative = path.relative_to(ROOT).as_posix()
        data = path.read_bytes()
        kind, route = classify(path)
        rows.append({
            "path": relative,
            "kind": kind,
            "route": route,
            "bytes": len(data),
            "lines": len(data.splitlines()),
            "sha256": hashlib.sha256(data).hexdigest(),
        })
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["path", "kind", "route", "bytes", "lines", "sha256"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Inventoried {len(rows)} files. Pages: {sum(row['kind'] == 'Page route' for row in rows)}, "
          f"APIs: {sum(row['kind'] == 'API route' for row in rows)}, "
          f"components: {sum(row['kind'] == 'React component' for row in rows)}")


if __name__ == "__main__":
    main()
