#!/usr/bin/env python3
"""Write a machine-readable canon manifest and summary/source mapping."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


def normalize_source(value: str, root: Path) -> str:
    value = value.strip().strip("`").replace("\\", "/")
    candidate = Path(value)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root).as_posix()
        except ValueError:
            pass
    while value.startswith("./"):
        value = value[2:]
    return value


def parse_source(text: str, root: Path) -> str | None:
    match = re.search(r"(?m)^-\s*source_path\s*:\s*(.+?)\s*$", text)
    return normalize_source(match.group(1), root) if match else None


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def article_order(path: Path) -> int | None:
    match = re.search(r"_(\d+)(?:_|$)", path.stem)
    return int(match.group(1)) if match else None


def volume_order(path: Path) -> int | None:
    match = re.search(r"Vol(\d+)", path.parent.name)
    return int(match.group(1)) if match else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=SKILL_ROOT)
    parser.add_argument("--novel-dir", type=Path, default=Path("小说"))
    parser.add_argument("--summary-dir", type=Path, default=Path("文章概括"))
    parser.add_argument("--out", type=Path, default=Path("memory/canon-manifest.json"))
    parser.add_argument("--markdown-out", type=Path, default=Path("memory/article-index.md"))
    args = parser.parse_args()

    root = args.root.resolve()
    novel_dir = (root / args.novel_dir).resolve()
    summary_dir = (root / args.summary_dir).resolve()
    out = (root / args.out).resolve()
    markdown_out = (root / args.markdown_out).resolve()

    originals = {}
    for path in sorted(novel_dir.rglob("*.txt")) if novel_dir.exists() else []:
        rel = path.relative_to(root).as_posix()
        originals[rel] = {
            "path": rel,
            "volume": path.parent.name,
            "volume_order": volume_order(path),
            "article_order": article_order(path),
            "title": path.stem,
            "sha256": digest(path),
            "size_bytes": path.stat().st_size,
        }

    summaries = {}
    summary_files = []
    duplicate_sources = []
    malformed = []
    for path in sorted(summary_dir.rglob("*.md")) if summary_dir.exists() else []:
        rel = path.relative_to(root).as_posix()
        summary_files.append(rel)
        text = path.read_text(encoding="utf-8", errors="replace")
        source = parse_source(text, root)
        if not source:
            malformed.append(rel)
            continue
        if source in summaries:
            duplicate_sources.append(source)
        summaries[source] = {
            "path": rel,
            "sha256": digest(path),
            "size_bytes": path.stat().st_size,
        }

    missing = sorted(set(originals) - set(summaries))
    extra = sorted(set(summaries) - set(originals))
    entries = []
    for source in sorted(set(originals) | set(summaries)):
        entries.append(
            {
                "source_path": source,
                "summary_path": summaries.get(source, {}).get("path"),
                "volume": originals.get(source, {}).get("volume"),
                "volume_order": originals.get(source, {}).get("volume_order"),
                "article_order": originals.get(source, {}).get("article_order"),
                "title": originals.get(source, {}).get("title"),
                "source_sha256": originals.get(source, {}).get("sha256"),
                "summary_sha256": summaries.get(source, {}).get("sha256"),
                "status": (
                    "complete"
                    if source in originals and source in summaries
                    else "missing_summary"
                    if source in originals
                    else "extra_summary"
                ),
            }
        )

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary_first": True,
        "raw_fallback": "小说/",
        "novel_file_count": len(originals),
        "summary_file_count": len(summary_files),
        "missing_summary_count": len(missing),
        "extra_summary_count": len(extra),
        "duplicate_source_count": len(sorted(set(duplicate_sources))),
        "malformed_summary_count": len(malformed),
        "missing_summaries": missing,
        "extra_summaries": extra,
        "duplicate_sources": sorted(set(duplicate_sources)),
        "malformed_summaries": malformed,
        "entries": entries,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown = [
        "# 文章概括索引",
        "",
        f"- 原文文件：{len(originals)}",
        f"- 概括文件：{len(summary_files)}",
        f"- 已完成映射：{len(originals) - len(missing)}",
        f"- 缺少概括：{len(missing)}",
        "",
        "| 原文 | 概括 | 状态 |",
        "|---|---|---|",
    ]
    for item in entries:
        summary = item["summary_path"] or "（缺少）"
        markdown.append(f"| `{item['source_path']}` | `{summary}` | {item['status']} |")
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.write_text("\n".join(markdown) + "\n", encoding="utf-8")
    print(f"manifest: {out}")
    print(f"article_index: {markdown_out}")
    print(f"novel_files: {len(originals)}")
    print(f"summary_files: {len(summaries)}")
    print(f"complete_mappings: {len(originals) - len(missing)}")
    print(f"missing_summaries: {len(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
