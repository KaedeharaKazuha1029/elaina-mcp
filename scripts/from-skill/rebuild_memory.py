#!/usr/bin/env python3
"""Validate and rebuild all derived memory artifacts in the required order."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


def run(script: Path, *args: str) -> None:
    command = [sys.executable, str(script), *args]
    completed = subprocess.run(command, check=False)
    if completed.returncode:
        raise SystemExit(completed.returncode)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=SKILL_ROOT)
    parser.add_argument("--allow-incomplete", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    scripts = Path(__file__).resolve().parent
    run(scripts / "normalize_summary_metadata.py", "--root", str(root))
    validation = subprocess.run(
        [sys.executable, str(scripts / "validate_canon.py"), "--root", str(root)],
        check=False,
    )
    if validation.returncode and not args.allow_incomplete:
        print("Refusing to rebuild final memory: article summaries are incomplete or malformed.")
        return validation.returncode

    run(scripts / "build_manifest.py", "--root", str(root))
    run(scripts / "build_index.py", "--root", str(root))
    run(
        scripts / "build_persona_evidence.py",
        "--summary-dir",
        str(root / "文章概括"),
        "--out",
        str(root / "memory" / "persona-evidence.md"),
    )
    print("memory rebuild: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
