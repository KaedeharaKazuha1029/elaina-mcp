# 从 elaina-skill 同步的缺失文档

本目录存放公开 `elaina-mcp` 原先缺少、但上游 [elaina-skill](https://github.com/KaedeharaKazuha1029/elaina-skill) 已有的**文档**副本，方便审查与对照。

- 来源仓库：`KaedeharaKazuha1029/elaina-skill`
- 同步策略：只拷贝文档与参考资料；**不包含** `小说/`、`文章概括/`、`memory/index.sqlite3` 等语料。
- `skills/elaina/SKILL.md`（短版 MCP 宿主说明）**未覆盖**；完整行为协议放在本目录的 `SKILL.md`。
- `persona/*` 四件套与 `reference/retrieval-protocol.md` 已与 skill 侧 blob 一致，本 PR 不重复改写。

| 路径 | 上游路径 |
|---|---|
| `SKILL.md` | 根目录 `SKILL.md` |
| `references/*` | `references/*` |
| `openclaw-workspace/AGENTS.md` | `assets/openclaw-workspace/AGENTS.md` |
| `agents/openai.yaml` | `agents/openai.yaml` |
