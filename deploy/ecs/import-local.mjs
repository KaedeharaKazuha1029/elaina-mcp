#!/usr/bin/env node
/**
 * Import locked corpus from repo files + memory/index.sqlite3 into local DB + filesystem bucket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import manifest from '../../src/corpus-manifest.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATA = process.env.ELAINA_DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = process.env.ELAINA_DB_PATH || path.join(DATA, 'elaina.sqlite3');
const BUCKET_DIR = process.env.ELAINA_BUCKET_DIR || path.join(DATA, 'bucket');
const INDEX_PATH = path.join(ROOT, 'memory/index.sqlite3');
const fields = ['id', 'doc_type', 'path', 'source_path', 'title', 'start_offset', 'end_offset', 'content'];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function resolveCorpusPath(rel) {
  const direct = path.join(ROOT, rel);
  if (fs.existsSync(direct)) return direct;
  if (rel.startsWith('scripts/') && !rel.startsWith('scripts/from-skill/')) {
    const alt = path.join(ROOT, 'scripts/from-skill', path.basename(rel));
    if (fs.existsSync(alt)) return alt;
  }
  throw new Error('Missing corpus file: ' + rel);
}

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BUCKET_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
for (const wal of [`${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
  if (fs.existsSync(wal)) fs.unlinkSync(wal);
}

const sqlite = new DatabaseSync(DB_PATH);
for (const name of fs.readdirSync(path.join(ROOT, 'drizzle')).filter((n) => n.endsWith('.sql')).sort()) {
  let sql = fs.readFileSync(path.join(ROOT, 'drizzle', name), 'utf8');
  sql = sql.replace(/--> statement-breakpoint/g, '');
  sqlite.exec(sql);
}

const src = new DatabaseSync(INDEX_PATH, { readOnly: true });
const rows = src.prepare(
  'SELECT id,doc_type,path,source_path,title,start_offset,end_offset,content,sha256 FROM documents ORDER BY id'
).all();
src.close();

const docMap = new Map(manifest.documents.map((d) => [d.id, d]));
if (rows.length !== manifest.documents.length) {
  throw new Error(`Document count mismatch: ${rows.length} vs ${manifest.documents.length}`);
}

const insertDoc = sqlite.prepare(
  'INSERT INTO documents(id,doc_type,path,source_path,title,start_offset,end_offset,content,sha256) VALUES(?,?,?,?,?,?,?,?,?)'
);
const hashes = [];
sqlite.exec('BEGIN');
for (const r of rows) {
  const meta = docMap.get(r.id);
  if (!meta) throw new Error('Unexpected document id ' + r.id);
  const rowHash = sha256(Buffer.from(JSON.stringify(fields.map((k) => r[k])), 'utf8'));
  if (rowHash !== meta.row_hash || r.sha256 !== meta.sha256) {
    throw new Error(`Checksum mismatch for document ${r.id}`);
  }
  hashes.push(rowHash);
  insertDoc.run(
    r.id, r.doc_type, r.path, r.source_path, r.title,
    r.start_offset, r.end_offset, r.content, r.sha256
  );
}
sqlite.exec('COMMIT');

const dataset = sha256(Buffer.from(JSON.stringify(hashes), 'utf8'));
if (dataset !== manifest.dataset_sha256) {
  throw new Error(`dataset_sha256 mismatch: ${dataset} vs ${manifest.dataset_sha256}`);
}

const insertFile = sqlite.prepare(
  'INSERT INTO corpus_files(path,sha256,byte_size,char_count,doc_type,source_path,title,r2_key,verified) VALUES(?,?,?,?,?,?,?,?,1)'
);
sqlite.exec('BEGIN');
for (const f of manifest.files) {
  const srcPath = resolveCorpusPath(f.path);
  const bytes = fs.readFileSync(srcPath);
  if (bytes.byteLength !== f.byte_size || sha256(bytes) !== f.sha256) {
    throw new Error('File integrity failed: ' + f.path);
  }
  const dest = path.join(BUCKET_DIR, f.r2_key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
  insertFile.run(f.path, f.sha256, f.byte_size, f.char_count, f.doc_type, f.source_path, f.title, f.r2_key);
}
sqlite.exec('COMMIT');

const receipt = {
  complete: true,
  source_repository: manifest.source_repository,
  source_commit: manifest.source_commit,
  document_counts: manifest.document_counts,
  raw_file_count: manifest.raw_file_count,
  summary_file_count: manifest.summary_file_count,
  total_original_characters: manifest.total_original_characters,
  verified_files: manifest.files.length,
  index_sha256: manifest.index_sha256,
  dataset_sha256: manifest.dataset_sha256,
  verified_at: new Date().toISOString(),
  upstream_manifest_stale_hashes: manifest.upstream_manifest_stale_hashes,
};
const upsert = sqlite.prepare(
  'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
);
upsert.run('query_aliases', JSON.stringify(manifest.aliases));
upsert.run('corpus_receipt', JSON.stringify(receipt));
upsert.run('upstream_metadata', JSON.stringify(manifest.upstream_metadata));
upsert.run('source_map', JSON.stringify(manifest.source_map));
upsert.run('corpus_import_sealed', manifest.source_commit);

sqlite.close();
console.log(JSON.stringify({
  ok: true,
  db: DB_PATH,
  bucket: BUCKET_DIR,
  documents: rows.length,
  files: manifest.files.length,
  dataset_sha256: dataset,
  source_commit: manifest.source_commit,
}, null, 2));
