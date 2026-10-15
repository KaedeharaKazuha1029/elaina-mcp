# 部署与私有语料导入

## 创建服务

在支持 Sites 的 ChatGPT 环境中，使用 Sites 技能打开本源码并创建新站点。请使用平台返回的 project_id，保留 `.openai/hosting.json` 中 DB、BUCKET 和 mcp 声明。设置所有者私有访问。

通过 Sites 官方安装、构建、源码同步和发布助手执行部署。D1 的 `drizzle/` 迁移由发布流程应用；数据导入与迁移分开。不要重新应用已执行的迁移。

服务使用平台可信的 `oai-authenticated-user-id` 和邮箱身份，用户数据调用拒绝缺失身份的请求。模型输入、请求 JSON 和查询参数都不能指定记忆 owner。连接器 OAuth 与 Sites 的 service access 是不同权限；服务令牌不产生用户身份。

## 准备获授权的语料

仓库已包含完整 `src/corpus-manifest.json`，对应锁定提交的 601 个文件和 960 条索引记录，运行路由与导入器默认直接使用它。在本地准备与锁定提交匹配的 elaina-skill 工作目录。`prepare-corpus.py` 会审查原文、摘要、SQLite 记录及完整覆盖情况，生成只有哈希/路径的清单与含私有语料的导入批次。

```sh
python scripts/prepare-corpus.py --root /absolute/path/to/elaina-skill --out /absolute/path/outside-public-repository/private-corpus
```

对于锁定提交，生成的 manifest.json 应与仓库中 `src/corpus-manifest.json` 逐字节一致；变更语料版本时重新核验清单、代码和数据库。导入数据批次始终保留在公开仓库以外；原文、摘要、SQLite 及私人记忆不能变成公开静态资源。

## 临时导入窗口

由受信任部署者临时添加 `app/api/corpus/import/route.ts`，通过 `createCorpusImporter(manifest)` 创建处理器，把 POST/PUT 请求交给它。该模块只接受锁定清单中列出的文件和记录；不提供任意 SQL 或文件路径操作。

```ts
import { env } from 'cloudflare:workers';
import { createCorpusImporter } from '../../../../src/corpus-import.mjs';
import manifest from '../../../../src/corpus-manifest.json' with { type: 'json' };
const handleCorpusImport = createCorpusImporter(manifest);
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handleCorpusImport(request, env); }
export async function PUT(request: Request) { return handleCorpusImport(request, env); }
```

通过 Sites 秘密环境变量配置强随机的 CORPUS_IMPORT_TOKEN。保持私有 Site 的平台访问边界，导入客户端同时使用平台明确提供的服务访问令牌与独立导入令牌。

`scripts/upload-corpus.py` 是受保护 stdin 配置的 Linux 客户端，运行后等待一行 JSON；配置字段为 root、export、origin、site_token、import_token。令牌通过受保护 stdin 传递，不放在命令行、Git 文件或日志中。客户端上传索引和所有完整文件，读回所有对象核验哈希，然后请求最终校验。

最后，服务校验全部 D1 记录哈希及全部文件验证状态；成功后写入完成凭据，并封闭同版本的导入。elaina_status 只有在凭据、数量和版本一致时报告 corpus_ready=true。

MCP 运行路由 `app/mcp/route.ts` 的 `createCorpusStore({db: env.DB, bucket: env.BUCKET})` 默认使用仓库中完整清单。显式传入 manifest 参数可使用另一个已核验版本；数据库或文件未完成导入时仍报告未就绪。

## 收尾与连接

成功后删除临时导入 route.ts，撤销 CORPUS_IMPORT_TOKEN，重新构建和发布。最终应用只有受保护的主页与 `/mcp` 服务入口。

使用 Sites 返回的原有插件 ID 安装/连接，不重复创建插件。验证实际 `bootstrap_elaina`、`search_canon`、`search_original` 和 `read_evidence` 调用；完整文件读取使用 list_canon_files 和 read_canon_file 分页。无需公开站点即可公开代码仓库。
