#!/usr/bin/env python3
"""Validate one-to-one coverage between 小说/*.txt and 文章概括/**/*.md."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


REQUIRED_HEADINGS = (
    "## 一句话定位",
    "## 事件概括",
    "## 关键事实",
    "## 人物与关系",
    "## 伊蕾娜的记忆与视角",
    "## 跨篇关联",
    "## 原文未明确",
)
REQUIRED_METADATA = ("summary_id", "source_path", "volume", "material_type", "spoiler")


def norm_path(value: str, root: Path) -> str:
    value = value.strip().strip(chr(96))
    candidate = Path(value)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root).as_posix()
        except ValueError:
            pass
    value = value.replace("\\", "/")
    while value.startswith("./"):
        value = value[2:]
    return value


def source_paths(novel_dir: Path, root: Path) -> list[str]:
    return sorted(
        p.relative_to(root).as_posix()
        for p in novel_dir.rglob("*.txt")
        if p.is_file()
    )


def parse_summary(path: Path, root: Path) -> tuple[str | None, list[str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None, ["invalid UTF-8"]
    match = re.search(r"(?m)^\-\s*source_path\s*:\s*(.+?)\s*$", text)
    source = norm_path(match.group(1), root) if match else None
    missing = []
    for heading in REQUIRED_HEADINGS:
        section_match = re.search(
            rf"(?ms)^{re.escape(heading)}\s*$\n(.*?)(?=^##\s+|\Z)", text
        )
        if not section_match:
            missing.append(heading)
        elif not section_match.group(1).strip():
            missing.append(f"{heading} (empty)")
    for field in REQUIRED_METADATA:
        if not re.search(rf"(?m)^\-\s*{re.escape(field)}\s*:\s*.+\S\s*$", text):
            missing.append(f"metadata:{field}")
    return source, missing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=SKILL_ROOT)
    parser.add_argument("--novel-dir", type=Path, default=Path("小说"))
    parser.add_argument("--summary-dir", type=Path, default=Path("文章概括"))
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    root = args.root.resolve()
    novel_dir = (root / args.novel_dir).resolve()
    summary_dir = (root / args.summary_dir).resolve()

    originals = source_paths(novel_dir, root) if novel_dir.exists() else []
    original_set = set(originals)
    summaries: list[dict[str, object]] = []

    if summary_dir.exists():
        for path in sorted(summary_dir.rglob("*.md")):
            source, missing = parse_summary(path, root)
            summaries.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "source_path": source,
                    "missing_sections": missing,
                }
            )

    mapped = [str(item["source_path"]) for item in summaries if item["source_path"]]
    counts = Counter(mapped)
    missing = sorted(original_set - set(mapped))
    extra = sorted(set(mapped) - original_set)
    duplicates = sorted(path for path, count in counts.items() if count > 1)
    malformed = sorted(
        str(item["path"])
        for item in summaries
        if not item["source_path"] or item["missing_sections"]
    )

    report = {
        "novel_file_count": len(originals),
        "summary_file_count": len(summaries),
        "mapped_source_count": len(mapped),
        "missing_sources": missing,
        "extra_sources": extra,
        "duplicate_sources": duplicates,
        "malformed_summaries": malformed,
        "ok": not (missing or extra or duplicates or malformed),
    }

    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"原文文件数: {report['novel_file_count']}")
        print(f"概括文件数: {report['summary_file_count']}")
        print(f"已映射原文数: {report['mapped_source_count']}")
        for key, label in (
            ("missing_sources", "缺少概括"),
            ("extra_sources", "指向不存在原文"),
            ("duplicate_sources", "重复映射"),
            ("malformed_summaries", "结构不完整"),
        ):
            values = report[key]
            print(f"{label}: {len(values)}")
            for value in values[:20]:
                print(f"  - {value}")
            if len(values) > 20:
                print(f"  ... 其余 {len(values) - 20} 项省略")
        print("结果: " + ("PASS" if report["ok"] else "FAIL"))

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
