# elaina-mcp

基于 [elaina-skill](https://github.com/KaedeharaKazuha1029/elaina-skill) 的完整伊蕾娜 MCP 服务源码，适配 ChatGPT Sites / Cloudflare Workers、D1 和 R2。

公开仓库提供可审查的实现、与 OpenClaw 对齐的完整 skill 注入集（`AGENTS.md`、四份 openclaw 人格文档、完整 `SKILL.md`）、数据库迁移、测试、**完整 296 篇原文与 296 篇摘要**、`memory/` 索引、`references/` 协议文档，以及完整语料清单与清单生成器。对话记忆、部署凭据和密钥不随本仓库公开；获授权的用户对话记忆仍由部署者写入私有 D1。

本仓库现已包含实际部署使用的完整 `src/corpus-manifest.json`，锁定上游提交，列出 601 个文件和 960 条索引记录，包含完整路径、哈希、存储键、别名和来源映射。运行时与导入器直接使用此清单，无需替换模板；存储键是对象标识，不是访问凭据。清单中的路径均为语料库相对路径，源根目录已是 `<skill-root>` 占位符；不包含个人信息、聊天记忆或密钥。

## 功能

- 完整 skill 注入集：`bootstrap_elaina` 返回 AGENTS、SOUL、IDENTITY、PERSONA_ELAINA、RUNTIME_GUARD、完整 SKILL.md，以及 OpenClaw 式 `IDENTITY_COMPOSED` 组合交付。
- 原作摘要优先搜索、原文搜索、精确证据核验与 Unicode 字符分页。
- 完整原作/摘要文件的路径列表与分页读取，每次读取校验 SHA-256。
- 经用户明确授权的持久记忆：查询、保存、修正、删除；按真实用户身份隔离，使用版本检查防止覆盖。
- 私有部署、Sites 托管身份认证、持久 D1 数据库及 R2 文件存储。
- 锁定版本的完整性校验：逐条索引哈希、逐文件哈希、读回验证及完成凭据。

## MCP 工具

| 工具 | 用途 |
|---|---|
| `bootstrap_elaina` | 加载人格及已授权记忆 |
| `get_persona_document` | 分页读取人格文档 |
| `recall_memory` | 查询记忆 |
| `remember_memory` | 经授权保存记忆 |
| `update_memory` | 经授权修正记忆，要求版本匹配 |
| `forget_memory` | 经授权删除记忆，要求版本匹配 |
| `search_canon` | 摘要优先检索 |
| `search_original` | 原文检索 |
| `read_evidence` | 按索引 ID 和字符偏移读取证据 |
| `elaina_status` | 报告实际语料数量、完整性及记忆状态 |
| `list_canon_files` | 分页列出完整文件路径和哈希 |
| `read_canon_file` | 分页读取完整原文或摘要 |

跟随 `next_offset` 直到 `null` 可读取整篇文件，原有十个工具均保留。

## 技术实现

- Vinext / React / TypeScript，保留 Sites 构建集成。
- Cloudflare Workers 运行 JavaScript，D1 保存检索记录及授权记忆，R2 保存完整源文件。
- 无状态 HTTP JSON-RPC MCP，入口 `POST /mcp`。
- 原 Python 排名逻辑移植至 JavaScript，并进行差分验证；Python 代码另行保留，不声称 Workers 执行 Python。


## 快速检查

Node.js >=22.13、Python 3、pnpm：

```sh
pnpm install --frozen-lockfile
pnpm test
python -m unittest discover -s tests -p 'test_*.py' -v
```

不包含私有语料时，完整语料测试和 Python 差分测试会跳过。设置 `ELAINA_UPSTREAM_ROOT`、`ELAINA_PRIVATE_EXPORT`、`ELAINA_PARITY_FILE` 后可执行全量验证。

## 完整语料验证记录

锁定上游提交 `b940fe08dec019807644f5bf5497d6299cf77ef6`，受保护部署已完整导入并核验：

- 原文 296 篇，2,956,242 个 Unicode 字符。
- 摘要 296 篇。
- 索引 960 条：664 个原文片段和 296 条摘要。
- 私有存储 601 个原始对象，包括原始 SQLite / FTS 索引。
- 全部原文可由索引片段完整重建；全部文件上传后读回验证 SHA-256。
- 11 项 Node 测试及 1 项 Python 测试通过；28 组检索与原 Python 程序一致。

该记录描述已完成的私有部署验证；本仓库 git 树内现已包含与上游锁定提交一致的完整语料，克隆后可直接用于本地测试或再导入 R2/D1。上游清单中 592 个旧哈希已通过实际文件重新校验，原清单原件在私有存储中保留。

## 部署与导入

### ECS 精简运行时：两种可选部署（可并行）

同一仓库、同一 `deploy/ecs/server.mjs`，用环境变量选择：

| 模式 | 说明 | 典型 URL |
|------|------|----------|
| **A 私有有记忆（默认）** | Bearer 令牌；可持久保存经授权的用户记忆 | `https://mcp.akiyamamizuki.cn/mcp` |
| **B 公开无记忆（可选）** | 无令牌；不记录聊天衍生记忆，便于对外分享 | `https://mcp-public.akiyamamizuki.cn/mcp` |

**旧版私有服务不要覆盖**：加 B 时请用独立 systemd 端口与 `ELAINA_DATA_DIR`（见 `deploy/ecs/`）。完整步骤与开关表：[deploy/ecs/README.md](deploy/ecs/README.md)。

详见 [部署指南](docs/DEPLOYMENT.md) 与 [语料审计](docs/CORPUS_AUDIT.md)。`.openai/hosting.json` 是通用模板，没有个人 Site 的 `project_id`；创建新 Site 时持久化平台返回的真实 ID。保持站点所有者私有访问。

临时语料导入器在 `src/corpus-import.mjs` 中保留，最终服务不暴露导入路由。导入及验证完成后，移除临时路由和导入密钥。部署秘密及运行数据不应提交到公开 Git（语料正文已按所有者要求纳入仓库）。

## 许可证

MCP 适配实现及沿用的上游代码按 **AGPL-3.0-only** 发布；完整许可证见 [LICENSE](LICENSE)，来源说明见 [reference/NOTICE.md](reference/NOTICE.md)。依赖与保留模板适用各自许可证。
