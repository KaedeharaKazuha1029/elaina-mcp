# 从 elaina-skill 同步的上游副本

本目录与仓库根部的 `小说/`、`文章概括/`、`memory/`、`references/`、`evals/` 等，镜像自上游 [elaina-skill](https://github.com/KaedeharaKazuha1029/elaina-skill) 固定提交，供审查、离线对照与 MCP 运行时语料。

- **来源仓库**：`KaedeharaKazuha1029/elaina-skill`
- **锁定提交**：`b940fe08dec019807644f5bf5497d6299cf77ef6`（与 `reference/upstream.lock.json` 一致）
- **运行时 bootstrap 注入集**：`bootstrap_elaina` 镜像 OpenClaw 交付：`AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`PERSONA_ELAINA.md`、`RUNTIME_GUARD.md`、skill 根目录完整 `SKILL.md`，以及可选 `IDENTITY_COMPOSED.md`（安装器式 IDENTITY+PERSONA+RUNTIME 组合）。运行时 bundle 见 `src/persona-docs.json`；同步上游后需 regenerate。
- **运行时 unknown 政策**：宿主规则与检索协议对齐 skill「高置信未知门槛」与「我也不知道 / 我不记得」降级收束；权威正文以注入的完整 `SKILL.md` / `references/*` 为准。
- **meta 身份**：宿主规则与 `AGENTS.md` 对齐——不得以 AI 助手自称；问是不是模型/AI 时在角色内回答，不以「如实说明底层模型」为默认。
- **Skill 协议正文**：`skills/elaina/SKILL.md` 与本目录 `SKILL.md` 均为上游 skill 根目录 `SKILL.md` 的整文件副本（不再夹带 MCP 短版前缀）。MCP 工具与宿主适配写在 `prompts/` 与 `src/engine.mjs`。
- **Persona 工作区 blob**：`persona/*` 与 skill OpenClaw 工作区一致；OpenClaw 模板见 `openclaw-workspace/` 与 `assets/openclaw-workspace/`。

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
