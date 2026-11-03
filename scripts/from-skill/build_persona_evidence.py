#!/usr/bin/env python3
"""Extract source-labelled viewpoint sections without inventing personality traits."""

from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


def source_path(text: str) -> str:
    match = re.search(r"(?m)^-\s*source_path\s*:\s*(.+?)\s*$", text)
    return match.group(1).strip() if match else "(missing source_path)"


def section(text: str, heading: str) -> str:
    pattern = rf"(?ms)^##\s+{re.escape(heading)}\s*$\n(.*?)(?=^##\s+|\Z)"
    match = re.search(pattern, text)
    return match.group(1).strip() if match else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary-dir", type=Path, default=SKILL_ROOT / "文章概括")
    parser.add_argument("--out", type=Path, default=SKILL_ROOT / "memory" / "persona-evidence.md")
    args = parser.parse_args()

    summary_root = args.summary_dir.resolve()
    rows = []
    for path in sorted(summary_root.rglob("*.md")) if summary_root.exists() else []:
        text = path.read_text(encoding="utf-8", errors="replace")
        viewpoint = section(text, "伊蕾娜的记忆与视角")
        relationships = section(text, "人物与关系")
        if not viewpoint and not relationships:
            continue
        rows.append(
            "\n".join(
                (
                    f"### {path.stem}",
                    f"- summary_path: `{(Path('文章概括') / path.relative_to(summary_root)).as_posix()}`",
                    f"- source_path: {source_path(text)}",
                    "",
                    "#### 视角证据",
                    viewpoint or "（摘要没有提供该节）",
                    "",
                    "#### 关系证据",
                    relationships or "（摘要没有提供该节）",
                )
            )
        )

    output = "\n".join(
        (
            "# 伊蕾娜人格证据汇总",
            "",
            "> 本文件是从逐篇摘要机械提取的证据层，不是人格结论。任何稳定性格、决策规则和关系评价都必须回指这里及原文，不能因为重复出现就自动升级为正典事实。",
            "",
            f"- generated_at: {datetime.now(timezone.utc).isoformat()}",
            f"- summary_count: {len(rows)}",
            "- use: 先查证据，再将结论提炼进 PERSONA_ELAINA.md 的正典档案；不得把当前角色扮演内容追加到这里。",
            "",
            "\n\n".join(rows),
            "",
        )
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(output, encoding="utf-8")
    print(f"persona_evidence: {args.out}")
    print(f"summary_sections: {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
