#!/usr/bin/env python3
"""Retrieve summary-first memory candidates from the portable SQLite index."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


def terms(query: str) -> list[str]:
    parts = re.findall(r"[A-Za-z0-9_]+|[\u4e00-\u9fff]+", query)
    if not parts:
        return [query]
    return list(dict.fromkeys(parts))


def normalize_source(value: str, root: Path) -> str:
    value = value.strip().strip("`").replace("\\", "/")
    candidate = Path(value)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root.resolve()).as_posix()
        except ValueError:
            pass
    while value.startswith("./"):
        value = value[2:]
    return value


def load_aliases(path: Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {
        str(key): [str(value) for value in values]
        for key, values in data.items()
        if isinstance(values, list)
    }


def query_variants(query: str, aliases: dict[str, list[str]]) -> list[str]:
    variants = [query]
    query_lower = query.lower()
    for canonical, values in aliases.items():
        if any(value.lower() in query_lower for value in [canonical, *values]):
            variants.extend([canonical, *values])
    return list(dict.fromkeys(variants))


def score(query: str, title: str, content: str, aliases: dict[str, list[str]]) -> float:
    haystack = f"{title}\n{content}".lower()
    variants = query_variants(query, aliases)
    value = 0.0
    for index, variant in enumerate(variants):
        if variant.lower() in haystack:
            value += 100.0 if index == 0 else 60.0
        for term in terms(variant):
            count = haystack.count(term.lower())
            if count:
                value += min(count, 20) * (4.0 if len(term) > 1 else 1.0)
    return value


def retrieve_rows(
    conn: sqlite3.Connection,
    query: str,
    doc_type: str,
    limit: int,
    source_paths: list[str] | None = None,
    aliases: dict[str, list[str]] | None = None,
):
    sql = (
        "SELECT id, doc_type, path, source_path, title, start_offset, end_offset, content "
        "FROM documents WHERE doc_type = ?"
    )
    params: list[object] = [doc_type]
    if source_paths:
        placeholders = ",".join("?" for _ in source_paths)
        sql += f" AND source_path IN ({placeholders})"
        params.extend(source_paths)
    rows = conn.execute(sql, params).fetchall()
    scored = []
    for row in rows:
        value = score(query, row[4], row[7], aliases or {})
        if value > 0:
            scored.append((value, row))
    scored.sort(key=lambda item: (-item[0], item[1][2], item[1][5] or 0))
    result = []
    for value, row in scored[: max(limit, 1)]:
        result.append(
            {
                "score": round(value, 2),
                "doc_type": row[1],
                "path": row[2],
                "source_path": row[3],
                "title": row[4],
                "start_offset": row[5],
                "end_offset": row[6],
                "snippet": row[7][:800].replace("\n", " "),
            }
        )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--root", type=Path, default=SKILL_ROOT)
    parser.add_argument("--index", type=Path, default=Path("memory/index.sqlite3"))
    parser.add_argument("--alias-file", type=Path, default=Path("memory/query-aliases.json"))
    parser.add_argument("--mode", choices=("summary", "raw", "combined"), default="summary")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--fallback-raw", action="store_true")
    parser.add_argument(
        "--source-path",
        action="append",
        default=[],
        help="Restrict retrieval to one or more novel source paths; repeat for multiple paths.",
    )
    args = parser.parse_args()

    source_paths = [normalize_source(value, args.root) for value in args.source_path]
    alias_path = args.alias_file if args.alias_file.is_absolute() else args.root / args.alias_file
    aliases = load_aliases(alias_path.resolve())
    index_path = args.index if args.index.is_absolute() else args.root / args.index
    index_path = index_path.resolve()
    if not index_path.exists():
        raise SystemExit(f"memory index does not exist: {index_path}")
    conn = sqlite3.connect(f"{index_path.as_uri()}?mode=ro&immutable=1", uri=True)
    if args.mode == "summary":
        result = retrieve_rows(conn, args.query, "summary", args.limit, source_paths, aliases)
        if not result and args.fallback_raw:
            result = retrieve_rows(conn, args.query, "raw", args.limit, source_paths, aliases)
    elif args.mode == "raw":
        result = retrieve_rows(conn, args.query, "raw", args.limit, source_paths, aliases)
    else:
        result = retrieve_rows(conn, args.query, "summary", args.limit, source_paths, aliases)
        result += retrieve_rows(conn, args.query, "raw", args.limit, source_paths, aliases)
        result.sort(key=lambda item: -item["score"])
        result = result[: max(args.limit, 1)]
    conn.close()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
