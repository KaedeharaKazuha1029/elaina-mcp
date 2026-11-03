# 从 elaina-skill 同步的上游副本

本目录与仓库根部的 `小说/`、`文章概括/`、`memory/`、`references/`、`evals/` 等，镜像自上游 [elaina-skill](https://github.com/KaedeharaKazuha1029/elaina-skill) 固定提交，供审查、离线对照与 MCP 运行时语料。

- **来源仓库**：`KaedeharaKazuha1029/elaina-skill`
- **锁定提交**：`b940fe08dec019807644f5bf5497d6299cf77ef6`（与 `reference/upstream.lock.json` 一致）
- **运行时 unknown 政策**：MCP 的 `prompts/HOST_RULES.md`、`src/host-rules.mjs`、`skills/elaina/SKILL.md` 与 `reference/retrieval-protocol.md` 已对齐 skill 的「高置信未知门槛」与「我也不知道 / 我不记得」最后降级收束（见 `references/answer-policy.md`）。
- **短版 MCP 说明**：`skills/elaina/SKILL.md` 保留 MCP 工具名与宿主适配；完整行为协议见本目录 `SKILL.md`。
- **Persona 四件套**：`persona/*` 与 skill OpenClaw 工作区 blob 一致时不在此重复；OpenClaw 模板见 `openclaw-workspace/` 与 `assets/`。

| 本仓库路径 | 上游路径 |
|---|---|
| `docs/from-skill/SKILL.md` | 根目录 `SKILL.md` |
| `docs/from-skill/references/*` | `references/*` |
| `docs/from-skill/openclaw-workspace/*` | `assets/openclaw-workspace/*` |
| `docs/from-skill/agents/openai.yaml` | `agents/openai.yaml` |
| `references/*`（仓库根） | `references/*` |
| `小说/`、`文章概括/`、`memory/` | 同名目录 |
| `scripts/from-skill/*` | `scripts/*` |
| `evals/` | `evals/` |

**说明**：按仓库所有者要求，296 篇原文、296 篇摘要与 `memory/index.sqlite3` 等现已纳入本公开 MCP 仓库（不再仅通过 `private-corpus/` 导入）。部署时仍可用 `scripts/prepare-corpus.py` / R2 导入，但 git 树内已含完整语料。

**PR #1**（`docs/import-missing-from-skill`）仅同步文档子集；本分支 supersede 该 PR 的语料策略与 unknown 运行时对齐。
