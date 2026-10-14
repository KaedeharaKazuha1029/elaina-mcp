#!/usr/bin/env python3
"""Offline, explicit export of the reviewed upstream SQLite corpus into Site D1 SQL.

Never downloads, executes or modifies arbitrary repo files. It runs SELECT statements
against the user's local SQLite file using immutable read-only mode, verifies the
original retriever's locked blob, then exports documents in small SQL chunks.
The source corpus may be copyrighted. Keep generated SQL PRIVATE.
"""
from __future__ import annotations
import argparse, hashlib, json, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK = json.loads((ROOT / 'reference' / 'upstream.lock.json').read_text('utf-8'))
FIELDS = ('id', 'doc_type', 'path', 'source_path', 'title', 'start_offset', 'end_offset', 'content')


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def sql_value(val) -> str:
    if val is None: return 'NULL'
    if isinstance(val, int): return str(val)
    if isinstance(val, str): return "'" + val.replace("'", "''") + "'"
    raise ValueError(f'Unexpected SQL value {type(val)!r}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--skill-root', required=True, type=Path)
    p.add_argument('--out', type=Path, default=Path('private-export'))
    p.add_argument('--allow-corpus-export', action='store_true', help='Explicitly authorize export of novel-index contents')
    p.add_argument('--max-chunk-bytes', type=int, default=800_000)
    a = p.parse_args()
    skill = a.skill_root.resolve()
    script = skill / 'scripts/retrieve_memory.py'
    db = skill / 'memory/index.sqlite3'
    alias = skill / 'memory/query-aliases.json'
    for filename in [script, db, alias]:
        if not filename.is_file() or not filename.resolve().is_relative_to(skill):
            raise SystemExit(f'Required original skill file missing or symlink/outside: {filename}')
    expected = LOCK['files']['scripts/retrieve_memory.py']['git_blob_sha1']
    if git_blob_sha(script.read_bytes()) != expected:
        raise SystemExit('Original Python retriever does NOT match locked reviewed upstream version. Stop and inspect changes.')
    aliases = json.loads(alias.read_text('utf-8'))
    if not isinstance(aliases, dict): raise SystemExit('Malformed alias file')
    if not a.allow_corpus_export:
        print(f'Source validated: {skill}\nIndex size: {db.stat().st_size:,} bytes\n'
              'Dry run only. Add --allow-corpus-export to create PRIVATE D1 import SQL containing novel content.')
        return 0
    if a.max_chunk_bytes < 100_000 or a.max_chunk_bytes > 10_000_000:
        raise SystemExit('Invalid chunk size')
    out = a.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if out.is_relative_to(ROOT):
        print('WARNING: exporting into project tree. Do NOT commit/private corpus to Git.', file=sys.stderr)
    con = sqlite3.connect(db.as_uri() + '?mode=ro&immutable=1', uri=True)
    cursor = con.execute('SELECT id,doc_type,path,source_path,title,start_offset,end_offset,content FROM documents ORDER BY id')
    chunks, rows, size, n, counter = [], [], 0, 1, 0
    types = {}
    header = '-- PRIVATE novel corpus; generated from locked upstream. DO NOT PUBLISH\n'

    def flush():
        nonlocal n, size, rows
        if not rows: return
        path = out / f'canon-{n:04d}.sql'
        body = header + '\n'.join(rows) + '\n'
        path.write_text(body, encoding='utf-8')
        chunks.append({'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        size, rows = 0, []
        n += 1

    for row in cursor:
        if row[1] not in ('summary','raw'): raise SystemExit('Unexpected doc_type; schema may have changed')
        if not isinstance(row[0],int): raise SystemExit('Unexpected document ID')
        if not isinstance(row[-1],str): raise SystemExit('Unexpected document content type')
        typ = row[1]
        types[typ]=types.get(typ,0)+1
        line = 'INSERT INTO documents (id,doc_type,path,source_path,title,start_offset,end_offset,content) VALUES (' + ','.join(map(sql_value,row)) + ');'
        length = len(line.encode('utf-8'))
        if rows and size+length>a.max_chunk_bytes:flush()
        rows.append(line);size+=length;counter+=1
    flush()
    con.close()
    # No unreviewed Python command executed; original retrieval script remains available for local comparison.
    alias_sql = "INSERT INTO meta (key,value) VALUES ('query_aliases',"+sql_value(json.dumps(aliases,ensure_ascii=False))+ ") ON CONFLICT(key) DO UPDATE SET value=excluded.value;\n"
    (out/'aliases.sql').write_text(alias_sql,encoding='utf-8')
    manifest={'source_repository':LOCK['repository'],'source_commit':LOCK['commit'],
      'index_sha256':hashlib.sha256(db.read_bytes()).hexdigest(),'document_counts':types,'total_rows':counter,
      'import_order':['sql/schema.sql','aliases.sql',*[r['file'] for r in chunks]],'chunks':chunks,
      'private_corpus':True,'warning':'Contains original novel text; not for public deployment or source control'}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Exported {counter} documents into {len(chunks)} PRIVATE SQL chunks at {out}')
    return 0

if __name__=='__main__': raise SystemExit(main())
