#!/usr/bin/env python3
"""Add deterministic summary IDs without changing summary prose."""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


def normalize_source(value: str, root: Path) -> str:
    value = value.strip().strip("`").replace("\\", "/")
    candidate = Path(value)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            parts = list(candidate.parts)
            if "小说" in parts:
                return Path(*parts[parts.index("小说") :]).as_posix()
    while value.startswith("./"):
        value = value[2:]
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=SKILL_ROOT)
    parser.add_argument("--summary-dir", type=Path, default=Path("文章概括"))
    args = parser.parse_args()
    root = args.root.resolve()
    summary_dir = (root / args.summary_dir).resolve()
    changed = 0
    paths_normalized = 0
    skipped = 0

    for path in sorted(summary_dir.rglob("*.md")) if summary_dir.exists() else []:
        text = path.read_text(encoding="utf-8")
        match = re.search(r"(?m)^-\s*source_path\s*:\s*(.+?)\s*$", text)
        if not match:
            skipped += 1
            continue
        source = normalize_source(match.group(1), root)
        updated = text
        if match.group(1).strip().strip("`").replace("\\", "/") != source:
            updated = re.sub(
                r"(?m)^-\s*source_path\s*:\s*.+?\s*$",
                f"- source_path: `{source}`",
                updated,
                count=1,
            )
            paths_normalized += 1
        if not re.search(r"(?m)^-\s*summary_id\s*:", updated):
            digest = hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]
            summary_id = f"article-{digest}"
            lines = updated.splitlines(keepends=True)
            insert_at = 1 if lines and lines[0].startswith("#") else 0
            lines.insert(insert_at, f"- summary_id: {summary_id}\n")
            updated = "".join(lines)
        if updated != text:
            path.write_text(updated, encoding="utf-8")
            changed += 1

    print(f"summary_files_changed: {changed}")
    print(f"summary_paths_normalized: {paths_normalized}")
    print(f"summary_metadata_skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
