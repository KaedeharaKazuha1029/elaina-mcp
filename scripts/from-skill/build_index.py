#!/usr/bin/env python3
"""Build a portable SQLite index for article summaries and original text."""

from __future__ import annotations

import argparse
import hashlib
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_source_path(text: str, root: Path) -> str | None:
    match = re.search(r"(?m)^\-\s*source_path\s*:\s*(.+?)\s*$", text)
    if not match:
        return None
    value = match.group(1).strip().strip(chr(96))
    candidate = Path(value)
    if candidate.is_absolute():
        try:
            return candidate.resolve().relative_to(root).as_posix()
        except ValueError:
            pass
    return value.replace("\\", "/")


def title_for(path: Path, text: str) -> str:
    match = re.search(r"(?m)^#\s+(.+?)\s*$", text)
    return match.group(1).strip() if match else path.stem


def chunks(text: str, max_chars: int = 6000):
    start = 0
    length = len(text)
    while start < length:
        end = min(start + max_chars, length)
        if end < length:
            boundary = text.rfind("\n\n", start + max_chars // 2, end)
            if boundary > start:
                end = boundary
        content = text[start:end]
        if content.strip():
            yield start, end, content
        start = end


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(
        """
        DROP TABLE IF EXISTS documents;
        DROP TABLE IF EXISTS documents_fts;
        DROP TABLE IF EXISTS metadata;
        DROP TABLE IF EXISTS source_map;
        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE documents (
            id INTEGER PRIMARY KEY,
            doc_type TEXT NOT NULL,
            path TEXT NOT NULL,
            source_path TEXT,
            title TEXT NOT NULL,
            start_offset INTEGER,
            end_offset INTEGER,
            content TEXT NOT NULL,
            sha256 TEXT NOT NULL
        );
        CREATE VIRTUAL TABLE documents_fts USING fts5(
            doc_id UNINDEXED,
            title,
            content
        );
        CREATE TABLE source_map (
            source_path TEXT PRIMARY KEY,
            summary_path TEXT,
            raw_path TEXT
        );
        """
    )
    return conn


def add_document(
    conn: sqlite3.Connection,
    doc_type: str,
    path: str,
    source_path: str | None,
    title: str,
    start: int | None,
    end: int | None,
    content: str,
):
    digest = sha256_text(content)
    cursor = conn.execute(
        """
        INSERT INTO documents
          (doc_type, path, source_path, title, start_offset, end_offset, content, sha256)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (doc_type, path, source_path, title, start, end, content, digest),
    )
    doc_id = cursor.lastrowid
    conn.execute(
        "INSERT INTO documents_fts(doc_id, title, content) VALUES (?, ?, ?)",
        (doc_id, title, content),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=SKILL_ROOT)
    parser.add_argument("--novel-dir", type=Path, default=Path("小说"))
    parser.add_argument("--summary-dir", type=Path, default=Path("文章概括"))
    parser.add_argument("--out", type=Path, default=Path("memory/index.sqlite3"))
    parser.add_argument("--no-raw", action="store_true")
    args = parser.parse_args()

    root = args.root.resolve()
    novel_dir = (root / args.novel_dir).resolve()
    summary_dir = (root / args.summary_dir).resolve()
    db_path = (root / args.out).resolve()

    conn = connect(db_path)
    summary_count = 0
    raw_count = 0
    summary_sources: dict[str, str] = {}
    raw_sources: set[str] = set()

    if summary_dir.exists():
        for path in sorted(summary_dir.rglob("*.md")):
            text = path.read_text(encoding="utf-8", errors="replace")
            rel = path.relative_to(root).as_posix()
            source = parse_source_path(text, root)
            add_document(
                conn,
                "summary",
                rel,
                source,
                title_for(path, text),
                None,
                None,
                text,
            )
            if source:
                summary_sources[source] = rel
            summary_count += 1

    if not args.no_raw and novel_dir.exists():
        for path in sorted(novel_dir.rglob("*.txt")):
            text = path.read_text(encoding="utf-8", errors="replace")
            rel = path.relative_to(root).as_posix()
            title = path.stem
            for start, end, content in chunks(text):
                add_document(conn, "raw", rel, rel, title, start, end, content)
                raw_count += 1
            raw_sources.add(rel)

    for source in sorted(set(summary_sources) | raw_sources):
        conn.execute(
            "INSERT INTO source_map(source_path, summary_path, raw_path) VALUES (?, ?, ?)",
            (source, summary_sources.get(source), source if source in raw_sources else None),
        )

    conn.execute(
        "INSERT INTO metadata(key, value) VALUES (?, ?)",
        ("generated_at", datetime.now(timezone.utc).isoformat()),
    )
    conn.execute("INSERT INTO metadata(key, value) VALUES (?, ?)", ("summary_count", str(summary_count)))
    conn.execute("INSERT INTO metadata(key, value) VALUES (?, ?)", ("raw_chunk_count", str(raw_count)))
    conn.execute("INSERT INTO metadata(key, value) VALUES (?, ?)", ("root", "<skill-root>"))
    conn.commit()
    conn.close()

    print(f"index: {db_path}")
    print(f"summary_documents: {summary_count}")
    print(f"raw_chunks: {raw_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
