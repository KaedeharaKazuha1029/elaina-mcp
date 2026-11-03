#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const VERSION = 8;
const LEGACY_START = "<!-- elaina-agent:persistent-persona:start -->";
const LEGACY_END = "<!-- elaina-agent:persistent-persona:end -->";
const STATE_RELATIVE_PATH = path.join(".elaina-agent", "openclaw-persona.json");
const BACKUP_RELATIVE_DIR = path.join(".elaina-agent", "original-md");
const TARGET_NAMES = ["AGENTS.md", "SOUL.md", "IDENTITY.md", "PERSONA_ELAINA.md"];
const EXPECTED_ARTICLE_COUNT = 296;
const CORPUS_DIR_NAMES = ["小说", "文章概括"];
const REQUIRED_MEMORY_FILES = [
  "article-index.md",
  "canon-manifest.json",
  "index.sqlite3",
  "persona-evidence.md",
  "query-aliases.json",
];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(SCRIPT_DIR, "..");
const TEMPLATE_DIR = path.join(SKILL_ROOT, "assets", "openclaw-workspace");
const RUNTIME_GUARD_NAME = "RUNTIME_GUARD.md";
const PERSONA_INLINE_START = "<!-- elaina-agent:server-persona-verbatim:start -->";
const PERSONA_INLINE_END = "<!-- elaina-agent:server-persona-verbatim:end -->";
const DISCOVERY_RELATIVE_PATHS = [
  path.join("skills", "elaina-agent"),
  path.join(".agents", "skills", "elaina-agent"),
];
const MODE = "openclaw-workspace-md-replacement";
const RUNTIME_DELIVERY = "openclaw-project-context-every-model-request";

function parseArgs(argv) {
  let action = "install";
  let workspace;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["install", "check", "remove"].includes(value)) {
      action = value;
    } else if (value === "--workspace") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("--workspace requires a path");
      }
      workspace = argv[index];
    } else if (value === "--force") {
      force = true;
    } else if (value === "--help" || value === "-h") {
      return { help: true };
    } else {
      throw new Error(`unknown argument: ${value}`);
    }
  }

  return { action, workspace, force, help: false };
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function resolveWorkspace(explicitWorkspace) {
  const candidate = explicitWorkspace
    ?? process.env.OPENCLAW_WORKSPACE_DIR
    ?? process.cwd();
  return path.resolve(expandHome(candidate));
}

function assertSafeWorkspace(workspace, force) {
  if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
    throw new Error(`workspace does not exist or is not a directory: ${workspace}`);
  }

  if (path.parse(workspace).root === workspace) {
    throw new Error("refusing to modify a filesystem root");
  }

  const indicators = [
    "AGENTS.md",
    "SOUL.md",
    "IDENTITY.md",
    path.join("skills", "elaina-agent", "SKILL.md"),
    path.join(".agents", "skills", "elaina-agent", "SKILL.md"),
  ];
  const looksLikeWorkspace = indicators.some((relativePath) =>
    fs.existsSync(path.join(workspace, relativePath)),
  );

  if (!looksLikeWorkspace && !force) {
    throw new Error(
      "target does not look like an OpenClaw agent workspace; pass --force only after verifying the path",
    );
  }
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

function loadTemplates() {
  const templates = {};
  for (const name of TARGET_NAMES) {
    const templatePath = path.join(TEMPLATE_DIR, name);
    if (!fs.existsSync(templatePath) || !fs.statSync(templatePath).isFile()) {
      throw new Error(`missing OpenClaw workspace template: ${templatePath}`);
    }
    templates[name] = fs.readFileSync(templatePath, "utf8");
  }
  const guardPath = path.join(TEMPLATE_DIR, RUNTIME_GUARD_NAME);
  if (!fs.existsSync(guardPath) || !fs.statSync(guardPath).isFile()) {
    throw new Error(`missing OpenClaw runtime guard: ${guardPath}`);
  }
  const identityVerbatim = templates["IDENTITY.md"].trimEnd();
  const personaVerbatim = templates["PERSONA_ELAINA.md"].trimEnd();
  const runtimeGuard = fs.readFileSync(guardPath, "utf8").trimEnd();
  templates["IDENTITY.md"] = [
    identityVerbatim,
    PERSONA_INLINE_START,
    personaVerbatim,
    PERSONA_INLINE_END,
    runtimeGuard,
    "",
  ].join("\n\n");
  return templates;
}

function hashText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function recursiveFiles(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return [];
  }
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  files.sort();
  return files;
}

function inspectBundledCorpus() {
  const errors = [];
  const digest = crypto.createHash("sha256");
  const counts = {};

  for (const directoryName of CORPUS_DIR_NAMES) {
    const directoryPath = path.join(SKILL_ROOT, directoryName);
    const files = recursiveFiles(directoryPath);
    counts[directoryName] = files.length;
    if (files.length !== EXPECTED_ARTICLE_COUNT) {
      errors.push(
        `${directoryName} expected ${EXPECTED_ARTICLE_COUNT} files but found ${files.length}`,
      );
    }
    for (const filePath of files) {
      const relative = path.relative(SKILL_ROOT, filePath).replace(/\\/g, "/");
      digest.update(relative, "utf8");
      digest.update("\0");
      digest.update(fs.readFileSync(filePath));
      digest.update("\0");
    }
  }

  const memoryHashes = {};
  for (const name of REQUIRED_MEMORY_FILES) {
    const filePath = path.join(SKILL_ROOT, "memory", name);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      errors.push(`missing bundled memory file: memory/${name}`);
      continue;
    }
    const contents = fs.readFileSync(filePath);
    const relative = `memory/${name}`;
    const fileHash = crypto.createHash("sha256").update(contents).digest("hex");
    memoryHashes[name] = fileHash;
    digest.update(relative, "utf8");
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }

  const manifestPath = path.join(SKILL_ROOT, "memory", "canon-manifest.json");
  let manifestValid = false;
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifestValid = manifest.novel_file_count === EXPECTED_ARTICLE_COUNT
        && manifest.summary_file_count === EXPECTED_ARTICLE_COUNT
        && manifest.missing_summary_count === 0
        && manifest.extra_summary_count === 0
        && manifest.duplicate_source_count === 0
        && manifest.malformed_summary_count === 0;
      if (!manifestValid) {
        errors.push("bundled canon manifest does not declare complete 296/296 coverage");
      }
    } catch {
      errors.push("bundled canon manifest is not valid JSON");
    }
  }

  return {
    valid: errors.length === 0 && manifestValid,
    skill_root: SKILL_ROOT,
    novel_file_count: counts["小说"] ?? 0,
    summary_file_count: counts["文章概括"] ?? 0,
    memory_file_count: Object.keys(memoryHashes).length,
    tree_hash: digest.digest("hex"),
    errors,
  };
}

function corpusState(corpus) {
  return {
    skill_root: corpus.skill_root,
    novel_file_count: corpus.novel_file_count,
    summary_file_count: corpus.summary_file_count,
    memory_file_count: corpus.memory_file_count,
    tree_hash: corpus.tree_hash,
  };
}

function readState(workspace) {
  const statePath = path.join(workspace, STATE_RELATIVE_PATH);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return null;
  }
}

function writeState(workspace, state) {
  const statePath = path.join(workspace, STATE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return statePath;
}

function legacyManagedRange(text) {
  const normalized = normalizeNewlines(text);
  const startIndex = normalized.indexOf(LEGACY_START);
  const endIndex = normalized.indexOf(LEGACY_END);
  if ((startIndex === -1) !== (endIndex === -1) || endIndex < startIndex) {
    throw new Error("found an incomplete or malformed legacy elaina-agent managed block");
  }
  if (startIndex === -1) {
    return null;
  }
  return {
    normalized,
    startIndex,
    endIndex: endIndex + LEGACY_END.length,
  };
}

function stripLegacyBlock(text) {
  const range = legacyManagedRange(text);
  if (!range) {
    return text;
  }

  const cleaned = `${range.normalized.slice(0, range.startIndex)}${range.normalized.slice(range.endIndex)}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return cleaned.length > 0 ? `${cleaned}\n` : "";
}

function backupRecordIsUsable(workspace, name, record) {
  if (!record || typeof record.existed !== "boolean") {
    return false;
  }
  if (!record.existed) {
    return true;
  }
  if (typeof record.path !== "string") {
    return false;
  }
  const backupPath = path.resolve(workspace, record.path);
  const backupRoot = path.resolve(workspace, BACKUP_RELATIVE_DIR);
  return path.basename(backupPath) === name
    && backupPath.startsWith(`${backupRoot}${path.sep}`)
    && fs.existsSync(backupPath)
    && fs.statSync(backupPath).isFile();
}

function backupRecordsAreUsable(workspace, records) {
  if (!records || typeof records !== "object") {
    return false;
  }
  return TARGET_NAMES.every((name) =>
    backupRecordIsUsable(workspace, name, records[name]),
  );
}

function createOrReuseBackups(workspace, previousState) {
  const backupDir = path.join(workspace, BACKUP_RELATIVE_DIR);
  fs.mkdirSync(backupDir, { recursive: true });
  const records = {};
  const previousRecords = previousState?.mode === MODE
    && previousState.backups
    && typeof previousState.backups === "object"
    ? previousState.backups
    : {};
  let created = false;

  for (const name of TARGET_NAMES) {
    const previousRecord = previousRecords[name];
    if (backupRecordIsUsable(workspace, name, previousRecord)) {
      records[name] = previousRecord;
      continue;
    }

    created = true;
    const targetPath = path.join(workspace, name);
    const existed = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
    const backupPath = path.join(backupDir, name);

    if (existed) {
      const original = fs.readFileSync(targetPath, "utf8");
      fs.writeFileSync(backupPath, stripLegacyBlock(original), "utf8");
    } else if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { force: true });
    }

    records[name] = {
      existed,
      path: existed ? path.relative(workspace, backupPath) : null,
    };
  }

  return { records, created };
}

function sameRealPath(left, right) {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
}

function inspectSkillDiscovery(workspace) {
  for (const relativePath of DISCOVERY_RELATIVE_PATHS) {
    const candidate = path.join(workspace, relativePath);
    if (fs.existsSync(candidate) && sameRealPath(candidate, SKILL_ROOT)) {
      return {
        valid: true,
        path: relativePath,
        target: SKILL_ROOT,
      };
    }
  }
  return {
    valid: false,
    path: null,
    target: SKILL_ROOT,
  };
}

function ensureSkillDiscovery(workspace, previousState) {
  const current = inspectSkillDiscovery(workspace);
  if (current.valid) {
    const wasCreated = previousState?.discovery?.created === true
      && previousState.discovery.path === current.path;
    return { ...current, created: wasCreated };
  }

  for (const relativePath of DISCOVERY_RELATIVE_PATHS) {
    const candidate = path.join(workspace, relativePath);
    if (fs.existsSync(candidate)) {
      continue;
    }
    fs.mkdirSync(path.dirname(candidate), { recursive: true });
    fs.symlinkSync(SKILL_ROOT, candidate, process.platform === "win32" ? "junction" : "dir");
    if (!sameRealPath(candidate, SKILL_ROOT)) {
      fs.unlinkSync(candidate);
      throw new Error(`failed to create a valid OpenClaw skill discovery link: ${candidate}`);
    }
    return {
      valid: true,
      path: relativePath,
      target: SKILL_ROOT,
      created: true,
    };
  }

  throw new Error(
    "OpenClaw skill discovery paths are occupied by a different elaina-agent; refusing to overwrite them",
  );
}

function removeCreatedDiscoveryLink(workspace, record) {
  if (!record || record.created !== true || typeof record.path !== "string") {
    return false;
  }
  if (!DISCOVERY_RELATIVE_PATHS.includes(record.path)) {
    return false;
  }
  const candidate = path.join(workspace, record.path);
  if (!fs.existsSync(candidate) || !fs.lstatSync(candidate).isSymbolicLink()) {
    return false;
  }
  if (typeof record.target !== "string" || !sameRealPath(candidate, record.target)) {
    return false;
  }
  fs.unlinkSync(candidate);
  return true;
}

function checkInstallation(workspace, templates, corpus) {
  const files = {};
  let filesMatch = true;

  for (const [name, template] of Object.entries(templates)) {
    const targetPath = path.join(workspace, name);
    const matches = fs.existsSync(targetPath)
      && fs.statSync(targetPath).isFile()
      && fs.readFileSync(targetPath, "utf8") === template;
    files[name] = matches;
    filesMatch = filesMatch && matches;
  }

  const state = readState(workspace);
  const discovery = inspectSkillDiscovery(workspace);
  const stateMatches = Boolean(state)
    && state.installed === true
    && state.schema_version === VERSION
    && state.mode === MODE
    && state.runtime_delivery === RUNTIME_DELIVERY
    && discovery.valid
    && state.discovery?.path === discovery.path
    && state.discovery?.target === discovery.target
    && backupRecordsAreUsable(workspace, state.backups)
    && corpus.valid
    && state.corpus?.skill_root === corpus.skill_root
    && state.corpus?.novel_file_count === corpus.novel_file_count
    && state.corpus?.summary_file_count === corpus.summary_file_count
    && state.corpus?.memory_file_count === corpus.memory_file_count
    && state.corpus?.tree_hash === corpus.tree_hash
    && Object.entries(templates).every(
      ([name, template]) => state.files?.[name] === hashText(template),
    );

  return {
    installed: filesMatch && stateMatches,
    files,
    discovery,
    state: stateMatches,
    state_version: state?.schema_version ?? null,
    expected_state_version: VERSION,
    mode: state?.mode ?? null,
    expected_mode: MODE,
    runtime_delivery: state?.runtime_delivery ?? null,
    expected_runtime_delivery: RUNTIME_DELIVERY,
    corpus: {
      valid: corpus.valid,
      skill_root: corpus.skill_root,
      novel_file_count: corpus.novel_file_count,
      summary_file_count: corpus.summary_file_count,
      memory_file_count: corpus.memory_file_count,
      tree_hash: corpus.tree_hash,
      errors: corpus.errors,
    },
  };
}

function install(workspace, templates, corpus) {
  if (!corpus.valid) {
    throw new Error(`bundled canon corpus is incomplete: ${corpus.errors.join("; ")}`);
  }
  const previousCheck = checkInstallation(workspace, templates, corpus);
  const previousState = readState(workspace);
  const discovery = ensureSkillDiscovery(workspace, previousState);
  const backup = createOrReuseBackups(workspace, previousState);
  const files = Object.fromEntries(
    Object.entries(templates).map(([name, template]) => [name, hashText(template)]),
  );

  const pendingState = {
    schema_version: VERSION,
    installed: false,
    mode: MODE,
    runtime_delivery: RUNTIME_DELIVERY,
    files,
    backups: backup.records,
    discovery,
    corpus: corpusState(corpus),
  };
  const statePath = writeState(workspace, pendingState);

  const changed = [];
  for (const [name, template] of Object.entries(templates)) {
    const targetPath = path.join(workspace, name);
    const current = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
      ? fs.readFileSync(targetPath, "utf8")
      : null;
    if (current !== template) {
      fs.writeFileSync(targetPath, template, "utf8");
      changed.push(name);
    }
  }

  writeState(workspace, { ...pendingState, installed: true });

  return {
    ok: true,
    action: "install",
    workspace,
    mode: MODE,
    runtime_delivery: RUNTIME_DELIVERY,
    changed,
    replaced_files: TARGET_NAMES,
    already_installed: previousCheck.installed,
    backup_created: backup.created,
    backup_dir: path.join(workspace, BACKUP_RELATIVE_DIR),
    discovery,
    state_path: statePath,
    corpus: corpusState(corpus),
  };
}

function removeLegacyInstallation(workspace) {
  const changed = [];
  for (const name of TARGET_NAMES) {
    const targetPath = path.join(workspace, name);
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      continue;
    }
    const original = fs.readFileSync(targetPath, "utf8");
    const cleaned = stripLegacyBlock(original);
    if (cleaned !== original) {
      fs.writeFileSync(targetPath, cleaned, "utf8");
      changed.push(name);
    }
  }
  return changed;
}

function remove(workspace, templates) {
  const state = readState(workspace);
  const statePath = path.join(workspace, STATE_RELATIVE_PATH);

  if (state?.mode === MODE && backupRecordsAreUsable(workspace, state.backups)) {
    const restored = [];
    for (const name of TARGET_NAMES) {
      const targetPath = path.join(workspace, name);
      const record = state.backups[name];
      if (record.existed) {
        const backupPath = path.resolve(workspace, record.path);
        fs.writeFileSync(targetPath, fs.readFileSync(backupPath));
      } else if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true });
      }
      restored.push(name);
    }

    const discovery_link_removed = removeCreatedDiscoveryLink(workspace, state.discovery);

    if (fs.existsSync(statePath)) {
      fs.rmSync(statePath, { force: true });
    }
    const backupDir = path.join(workspace, BACKUP_RELATIVE_DIR);
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }

    return {
      ok: true,
      action: "remove",
      workspace,
      mode: MODE,
      restored,
      discovery_link_removed,
      used_backup: true,
      state_path: statePath,
    };
  }

  const templateFilesPresent = Object.entries(templates).some(([name, template]) => {
    const targetPath = path.join(workspace, name);
    return fs.existsSync(targetPath)
      && fs.statSync(targetPath).isFile()
      && fs.readFileSync(targetPath, "utf8") === template;
  });
  if (templateFilesPresent && !state) {
    throw new Error("replacement templates are present but restore state is missing; refusing to discard them without a backup record");
  }

  const changed = removeLegacyInstallation(workspace);
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true });
  }

  return {
    ok: true,
    action: "remove",
    workspace,
    mode: "legacy-managed-block-removal",
    restored: changed,
    used_backup: false,
    state_path: statePath,
  };
}

function usage() {
  return [
    "Usage:",
    "  node install_openclaw_injection.mjs install [--workspace PATH] [--force]",
    "  node install_openclaw_injection.mjs check   [--workspace PATH] [--force]",
    "  node install_openclaw_injection.mjs remove  [--workspace PATH] [--force]",
    "",
    "OpenClaw mode: replace workspace AGENTS.md, SOUL.md, IDENTITY.md, and PERSONA_ELAINA.md with server-derived templates.",
    "IDENTITY delivery: compose server IDENTITY + verbatim PERSONA + the functional runtime guard.",
    "Skill discovery: expose the current skill through workspace/skills or workspace/.agents/skills.",
    "Runtime delivery: OpenClaw recompiles standard workspace files into Project Context for every model request.",
    "Original files are backed up under .elaina-agent/original-md and restored on remove.",
    "Canon mode: require the bundled 296 novels, 296 summaries, and five memory index files.",
    "Workspace resolution: --workspace, then OPENCLAW_WORKSPACE_DIR, then cwd.",
  ].join("\n");
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }

    const workspace = resolveWorkspace(args.workspace);
    assertSafeWorkspace(workspace, args.force);
    const templates = loadTemplates();

    if (args.action === "install") {
      const corpus = inspectBundledCorpus();
      process.stdout.write(`${JSON.stringify(install(workspace, templates, corpus), null, 2)}\n`);
      return;
    }

    if (args.action === "remove") {
      process.stdout.write(`${JSON.stringify(remove(workspace, templates), null, 2)}\n`);
      return;
    }

    const corpus = inspectBundledCorpus();
    const result = {
      ok: true,
      action: "check",
      workspace,
      ...checkInstallation(workspace, templates, corpus),
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.installed) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

main();
