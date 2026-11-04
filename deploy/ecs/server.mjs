#!/usr/bin/env node
/**
 * Lean ECS MCP runtime: Node HTTP + node:sqlite + filesystem corpus bucket.
 *
 * Private mode (default):
 *   Authorization: Bearer <ELAINA_BEARER_TOKEN> → fixed owner from env.
 *
 * Public memoryless mode (ELAINA_PUBLIC=1):
 *   No Bearer required. Chat-derived memory writes are disabled.
 *   Must set ELAINA_DATA_DIR to a directory that is NOT the private data dir.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createEngine } from '../../src/engine.mjs';
import { handleJsonRpc } from '../../src/protocol.mjs';
import { createCorpusStore } from '../../src/corpus-store.mjs';
import { HOST_RULES } from '../../src/host-rules.mjs';
import personaDocs from '../../src/persona-docs.json' with { type: 'json' };
import manifest from '../../src/corpus-manifest.json' with { type: 'json' };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const truthy = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());

const PUBLIC = truthy(process.env.ELAINA_PUBLIC);
const MEMORYLESS = PUBLIC || truthy(process.env.ELAINA_MEMORYLESS);
const HOST = process.env.ELAINA_HOST || '127.0.0.1';
const PORT = Number(process.env.ELAINA_PORT || (PUBLIC ? 3848 : 3847));
const OWNER = process.env.ELAINA_OWNER || (PUBLIC ? 'public-anon' : 'ecs-owner');
const TOKEN = process.env.ELAINA_BEARER_TOKEN || '';
const REVISION = process.env.ELAINA_REVISION || (PUBLIC ? 'elaina-ecs-public-2.0.0' : 'elaina-ecs-2.0.0');
const DB_READONLY = PUBLIC || truthy(process.env.ELAINA_DB_READONLY);

if (PUBLIC) {
  if (!process.env.ELAINA_DATA_DIR) {
    console.error('ELAINA_PUBLIC=1 requires ELAINA_DATA_DIR (must not share the private data directory)');
    process.exit(1);
  }
} else if (!TOKEN || TOKEN.length < 32) {
  console.error('ELAINA_BEARER_TOKEN must be set (>=32 chars) unless ELAINA_PUBLIC=1');
  process.exit(1);
}

const DATA = process.env.ELAINA_DATA_DIR || path.join(ROOT, 'data');
const DB_PATH = process.env.ELAINA_DB_PATH || path.join(DATA, 'elaina.sqlite3');
const BUCKET_DIR = process.env.ELAINA_BUCKET_DIR || path.join(DATA, 'bucket');

if (!PUBLIC) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(BUCKET_DIR, { recursive: true });
} else {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Public mode: DB missing at ${DB_PATH}. Run import-local.mjs with ELAINA_DATA_DIR first.`);
    process.exit(1);
  }
  if (!fs.existsSync(BUCKET_DIR)) {
    console.error(`Public mode: bucket missing at ${BUCKET_DIR}.`);
    process.exit(1);
  }
}

function openDb(dbPath, { readOnly = false } = {}) {
  const sqlite = new DatabaseSync(dbPath, readOnly ? { readOnly: true } : {});
  if (!readOnly) sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  else sqlite.exec('PRAGMA foreign_keys=ON;');
  return {
    sqlite,
    prepare(sql) {
      let args = [];
      return {
        bind(...v) { args = v; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const x = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(x.changes) } };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    },
  };
}

function createFsBucket(dir) {
  return {
    async put(key, body, _opts) {
      if (DB_READONLY || PUBLIC) {
        throw Object.assign(new Error('Public/read-only instance rejects bucket writes'), { code: 'readonly' });
      }
      const dest = path.join(dir, key);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const buf = body instanceof ArrayBuffer ? Buffer.from(body)
        : Buffer.isBuffer(body) ? body
        : body instanceof Uint8Array ? Buffer.from(body)
        : Buffer.from(body);
      fs.writeFileSync(dest, buf);
    },
    async get(key) {
      const dest = path.join(dir, key);
      if (!fs.existsSync(dest)) return null;
      const b = fs.readFileSync(dest);
      return {
        size: b.byteLength,
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      };
    },
  };
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function extractBearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1].trim();
  return '';
}

const db = openDb(DB_PATH, { readOnly: DB_READONLY });
const bucket = createFsBucket(BUCKET_DIR);
const corpusStore = createCorpusStore({ db, bucket, manifest });
const engine = createEngine({
  db,
  owner: OWNER,
  personaDocs,
  hostRules: HOST_RULES,
  deploymentRevision: REVISION,
  corpusStore,
  memoryless: MEMORYLESS,
});

function readBody(req, limit = 16000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { code: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  const payload = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, {
    'cache-control': 'no-store',
    ...(payload != null ? { 'content-type': 'application/json; charset=utf-8' } : {}),
    ...headers,
  });
  res.end(payload ?? undefined);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/healthz') {
      return send(res, 200, {
        ok: true,
        service: PUBLIC ? 'elaina-mcp-ecs-public' : 'elaina-mcp-ecs',
        public: PUBLIC,
        memoryless: MEMORYLESS,
      });
    }
    if (url.pathname !== '/mcp') {
      return send(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'POST') {
      return send(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
    }
    if (!PUBLIC) {
      const token = extractBearer(req);
      if (!token || !timingSafeEqualStr(token, TOKEN)) {
        return send(res, 401, { error: 'Unauthorized' });
      }
    }
    let raw;
    try {
      raw = await readBody(req, 16000);
    } catch (e) {
      return send(res, e.code === 413 ? 413 : 400, { error: e.message || 'Bad request' });
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: 'Invalid JSON' });
    }
    const result = await handleJsonRpc(payload, engine);
    if (result === undefined) {
      res.writeHead(202, { 'cache-control': 'no-store' });
      return res.end();
    }
    return send(res, 200, result);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `elaina-mcp listening on http://${HOST}:${PORT}/mcp (owner=${OWNER}, public=${PUBLIC}, memoryless=${MEMORYLESS}, readonly_db=${DB_READONLY})`,
  );
});
