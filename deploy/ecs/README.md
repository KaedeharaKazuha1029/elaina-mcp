# Elaina MCP — Aliyun ECS lean runtime（可选双模式）

同一套代码（`deploy/ecs/server.mjs` + `src/`），用**环境变量 / systemd 单元**选择部署方式。  
**可以只开一种，也可以两种并行**；两种互不覆盖、数据目录必须分开。

## 怎么选

| 选项 | 何时用 | 鉴权 | 会话记忆 | 本仓库默认？ |
|------|--------|------|----------|--------------|
| **A. 私有有记忆** | 仅自己/受信任客户端；要记住用户偏好与约定 | `Authorization: Bearer <token>` | 持久写入 SQLite（owner 隔离） | **是（先部署这个）** |
| **B. 公开无记忆** | 想给任何人用、避免令牌与用户数据风险 | 无 Bearer | **不**持久化聊天衍生记忆；写记忆工具隐藏/拒绝 | 可选并行 |

推荐：先按 **A** 跑通；需要对外分享人格/原作检索时再加 **B**，不要改掉 A。

## 线上示例（可并行）

| 模式 | URL | systemd | 端口 | 数据目录 |
|------|-----|---------|------|----------|
| A 私有 | `https://mcp.akiyamamizuki.cn/mcp` | `elaina-mcp.service` | `3847` | `/opt/elaina-mcp/data` |
| B 公开 | `https://mcp-public.akiyamamizuki.cn/mcp` | `elaina-mcp-public.service` | `3848` | `/opt/elaina-mcp/data-public` |

代码树共用 `/opt/elaina-mcp`；**禁止**让 B 指向 A 的 `ELAINA_DATA_DIR`。

## A — 私有有记忆（默认）

1. 复制环境（勿提交 Git）：
   ```bash
   # 自行创建 deploy/ecs/elaina.env（mode 600），至少包含：
   # ELAINA_HOST=127.0.0.1
   # ELAINA_PORT=3847
   # ELAINA_OWNER=ecs-owner
   # ELAINA_BEARER_TOKEN=<至少32字符随机串>
   # ELAINA_DATA_DIR=/opt/elaina-mcp/data
   # 不要设置 ELAINA_PUBLIC / ELAINA_MEMORYLESS
   ```
2. 导入语料并启动：
   ```bash
   . /root/.nvm/nvm.sh
   cd /opt/elaina-mcp
   ELAINA_DATA_DIR=/opt/elaina-mcp/data node deploy/ecs/import-local.mjs
   cp deploy/ecs/elaina-mcp.service /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now elaina-mcp
   ```
3. nginx：使用 `ashen-witch-mcp.conf` / `nginx-mcp.akiyamamizuki.cn.conf`（`server_name mcp.…` → `127.0.0.1:3847`）。
4. 客户端：`url` + `headers.Authorization: Bearer <token>`。

## B — 公开无记忆（可选并行）

1. 环境见 `elaina-public.env.example` → 写成 `elaina-public.env`（600）：
   - 必开：`ELAINA_PUBLIC=1`（免 Bearer；**必须**单独的 `ELAINA_DATA_DIR`）
   - 建议：`ELAINA_MEMORYLESS=1`、`ELAINA_DB_READONLY=1`、`ELAINA_PORT=3848`、`ELAINA_OWNER=public-anon`
2. 独立语料目录（与 A 分离）：
   ```bash
   ELAINA_DATA_DIR=/opt/elaina-mcp/data-public node deploy/ecs/import-local.mjs
   # 确保无会话记忆残留（无 sqlite3 CLI 时可用 node:sqlite DELETE）
   cp deploy/ecs/elaina-mcp-public.service /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now elaina-mcp-public
   ```
3. nginx：`ashen-witch-mcp-public.conf`（`mcp-public.…` → `3848`）。
4. Cloudflare：A 记录 `mcp-public` → ECS IP，代理开启；SSL Flexible 可与 A 相同。
5. 客户端只需 URL，无 token：
   ```json
   { "mcpServers": { "elaina-public": { "url": "https://mcp-public.akiyamamizuki.cn/mcp" } } }
   ```

### B 模式下引擎行为
- `tools/list` **不含** `remember_memory` / `update_memory` / `forget_memory`
- `recall_memory` / bootstrap 的会话记忆为空；`elaina_status.memory_mode=disabled`
- 人格文档与原作检索仍可用（只读产品语料，不是聊天记忆）

## 开关一览（server.mjs）

| 变量 | A（默认） | B |
|------|-----------|---|
| `ELAINA_PUBLIC` | 未设/0 | `1` |
| `ELAINA_MEMORYLESS` | 未设 | `1`（或由 PUBLIC 隐含） |
| `ELAINA_BEARER_TOKEN` | 必填 ≥32 | 不需要 |
| `ELAINA_DATA_DIR` | 私有目录 | **另一目录**（PUBLIC 时强制） |
| `ELAINA_DB_READONLY` | 可选 | 建议 `1` |
| `ELAINA_PORT` | `3847` | `3848` |

## 运维注意
- 升级代码后可 `systemctl restart elaina-mcp` 与/或 `elaina-mcp-public`；互不影响。
- 切勿把 `elaina.env` / `elaina-public.env` 提交进 Git。
- nginx 由 ashen-witch 托管时：`nginx -t -c /etc/nginx/ashen-witch/nginx.conf && kill -HUP $(cat /run/ashen-witch/nginx.pid)`
