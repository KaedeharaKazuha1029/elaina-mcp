# elaina-mcp

基于 [elaina-skill](https://github.com/KaedeharaKazuha1029/elaina-skill) 的完整伊蕾娜 MCP 服务源码，适配 ChatGPT Sites / Cloudflare Workers、D1 和 R2。

公开仓库提供可审查的实现、四份人格文档、数据库迁移、测试、通用清单模板与清单生成器及完整 Python 参考实现。小说原文、摘要正文、SQLite 语料库、部署专用语料清单（含文件路径、哈希和存储键）、对话记忆、部署凭据和密钥不随本仓库公开；获授权的语料由部署者另行导入私有 D1/R2。

## 功能

- 四份完整人格文档：SOUL、IDENTITY、PERSONA_ELAINA、RUNTIME_GUARD。
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

人格指令受宿主规则约束；MCP 本身不会永久修改 ChatGPT 的系统指令，也无法撤回已生成的回复。

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

该记录描述已完成的私有部署；克隆这个公开仓库不会自动获得语料或私人记忆。上游清单中 592 个旧哈希已通过实际文件重新校验，原清单原件在私有存储中保留。

## 部署与导入

详见 [部署指南](docs/DEPLOYMENT.md) 与 [语料审计](docs/CORPUS_AUDIT.md)。`.openai/hosting.json` 是通用模板，没有个人 Site 的 `project_id`；创建新 Site 时持久化平台返回的真实 ID。保持站点所有者私有访问。

临时语料导入器在 `src/corpus-import.mjs` 中保留，最终服务不暴露导入路由。导入及验证完成后，移除临时路由和导入密钥。语料、秘密及运行数据不应提交到公开 Git。

## 许可证

MCP 适配实现及沿用的上游代码按 **AGPL-3.0-only** 发布；完整许可证见 [LICENSE](LICENSE)，来源说明见 [reference/NOTICE.md](reference/NOTICE.md)。依赖与保留模板适用各自许可证。软件许可证不授权第三方小说正文或角色素材的再分发。
