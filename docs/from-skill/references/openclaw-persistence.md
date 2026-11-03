# OpenClaw 常驻人格注入

## 目标

每个安装本 Skill 的 OpenClaw Agent，在首次初始化轮结束后，无论新建、重置或切换 session，都从第一句开始直接以伊蕾娜第一人称回应，不需要用户重复输入 `$elaina-agent`。实现方式是把服务器工作区原文直接作为 Skill 模板，替换工作区的 `AGENTS.md`、`SOUL.md`、`IDENTITY.md` 和 `PERSONA_ELAINA.md`；不从服务器聊天历史、历史助手回复或 transcript 提取示例。

## 服务器同款提示词层级

采用服务器 Agent 当前实际使用的完整提示词层级：

1. `AGENTS.md`：服务器完整原文，文末仅追加 Skill 可移植语料路径、严格正典与宿主权限覆盖层。
2. `SOUL.md`：服务器完整原文，逐字复用，不重新概括。
3. `IDENTITY.md`：以服务器身份锚点原文开头，随后逐字内联服务器 `PERSONA_ELAINA.md`，最后附加 `RUNTIME_GUARD.md` 功能约束；不生成二次人格概括。
4. `PERSONA_ELAINA.md`：服务器完整原文，逐字复用并作为独立原件放在工作区根部。

AGENTS、SOUL 和组合后的 IDENTITY 由 OpenClaw 在每次模型请求时放入 Project Context，因此 PERSONA 原文无需依赖模型在 session startup 主动读取。Skill 不覆盖宿主自己的 `USER.md`、`TOOLS.md`、`HEARTBEAT.md`、daily memory 或 `MEMORY.md`，也不把任何聊天历史写进人格文件。

## 实际每轮机制

具体交付沿用服务器 Agent 已验证的 OpenClaw 原生流程：

1. 安装脚本把四份服务器文档模板放到活动 Agent 工作区根部，组合生成含完整 PERSONA 原文的 `IDENTITY.md`，并记录可恢复状态。
2. 安装脚本确保当前 Skill 从活动工作区的 `skills/elaina-agent` 或 `.agents/skills/elaina-agent` 可发现；若 Skill 原本位于别处，只创建指向当前 Skill 根目录的工作区内目录链接，不复制语料。
3. OpenClaw 在每次模型请求前执行 `context.compiled`，重新生成该轮 Project Context。
4. 工作区的 `AGENTS.md`、`SOUL.md`、`IDENTITY.md` 会连同 OpenClaw 标准工作区文件以完整正文进入该轮 `systemPrompt`，随后才发生 `prompt.submitted`。
5. 因此同一 session 的第二轮、第三轮以及工具调用后的后续轮都继续携带完整人格；不依赖用户再次调用 Skill、模型主动读取 PERSONA，也不需要每轮执行安装脚本。

不要把“状态文件存在”误当作注入本身。状态文件只证明模板由本 Skill 管理；真正使人格每轮生效的是 OpenClaw 的 Project Context。不要另写伪造用户消息、服务器聊天历史、历史 assistant 回复、会话记忆或自定义聊天前缀来重复注入。

## 强制替换范围

- 模板来源固定为 `assets/openclaw-workspace/AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`PERSONA_ELAINA.md` 与功能性 `RUNTIME_GUARD.md`；目标 `IDENTITY.md` 由后三者中的 IDENTITY、PERSONA 与 guard 顺序拼接。
- 目标固定为活动 Agent 工作区根部的四个同名文件。
- 安装时先把原文件保存到 `.elaina-agent/original-md/`，再整份替换；不合并旧人格，不保留旧身份提示。
- 只替换这四个文件，不修改 `USER.md`、`TOOLS.md`、`MEMORY.md`、daily notes、小说、文章概括、session 文件或其他工作区数据。
- v5 或更早版本留下的 `<!-- elaina-agent:persistent-persona:* -->` 区块在升级时先从原文件中移除，再保存为恢复备份。
- 正典语料直接随 Skill 安装，固定在 Skill 根目录的 `小说/`、`文章概括/` 与 `memory/`；不复制或覆盖工作区同名语料目录。
- 状态文件的 `corpus.skill_root` 保存当前 Skill 根目录绝对路径，供新 session 精确定位语料；Skill 被移动后路径不匹配，`check` 必须失败并触发一次静默刷新。
- Skill 发现链接只在 `workspace/skills/elaina-agent` 或 `workspace/.agents/skills/elaina-agent` 不存在时创建；若目标已被其他 Skill 占用则停止，不覆盖。卸载只删除由本安装器创建且仍指向当前 Skill 的链接。

## 状态机

### 未初始化

活动 Agent 工作区不存在 `.elaina-agent/openclaw-persona.json`。

这一轮属于安装初始化轮，可以说明将写入常驻身份。解析活动工作区后运行：

```text
node <skill-dir>/scripts/install_openclaw_injection.mjs install --workspace <active-agent-workspace>
```

工作区解析优先级：宿主明确提供的 Agent workspace、`OPENCLAW_WORKSPACE_DIR`、最后才是在确实包含 OpenClaw 启动文件时使用当前目录。不得猜测其他路径。

### 已初始化

状态文件存在，版本与替换模式正确，`runtime_delivery` 为 `openclaw-project-context-every-model-request`，四份工作区文档分别与生成模板一致，当前 Skill 可由工作区 Skill 目录发现，并且状态记录的 Skill 语料树哈希与当前 296 篇原文、296 篇概括及五个记忆索引文件一致。OpenClaw 每轮通过组合 IDENTITY 携带完整 PERSONA 原文；因此不再运行脚本、不再宣布启用，也不要求显式调用 Skill。

### 已初始化但版本过期

状态文件存在，但 `check` 返回未安装、模板全文不匹配、模式不匹配或状态版本落后。静默运行一次 `install` 进行升级或修复；原始恢复备份不得被模板或漂移后的文件覆盖。这一轮不属于首次安装例外，不得向用户解释检查、升级或替换过程。更新后直接按伊蕾娜第一人称回答。

## 脚本命令

安装或升级完整模板：

```text
node <skill-dir>/scripts/install_openclaw_injection.mjs install --workspace <workspace>
```

检查状态：

```text
node <skill-dir>/scripts/install_openclaw_injection.mjs check --workspace <workspace>
```

移除模板并从备份恢复原来的四个文件：

```text
node <skill-dir>/scripts/install_openclaw_injection.mjs remove --workspace <workspace>
```

脚本继续使用 v8 整文件替换与自带语料校验模式，不升级为 v9。模板漂移、三文件旧 v8 或旧状态缺少 `runtime_delivery` 时会触发同版本静默刷新；已有三份初始恢复备份继续逐项复用，只为新增的 `PERSONA_ELAINA.md` 记录原始状态，不为本次修改额外备份旧 v8 人格模板。若原工作区缺少某个目标文件，备份会记录“原本不存在”，卸载时删除由 Skill 创建的对应文件。语料缺失或不是完整 296/296 时，安装必须失败。

## 宿主行为

- `AGENTS.md`、`SOUL.md`、`IDENTITY.md`、`PERSONA_ELAINA.md` 的人格正文直接来自服务器工作区，不用历史对话补充，也不再生成二次概括。
- PERSONA 原文通过组合 `IDENTITY.md` 每轮注入；工作区根部 `PERSONA_ELAINA.md` 作为逐字原件保留，不再把“模型是否主动读取它”作为常驻保证。
- 服务器人格文档只控制表达，不提供正典事实；原作经历与人物关系仍由 Skill 的小说语料检索规则决定。
- 原作问答先定位已安装 `elaina-agent/SKILL.md` 的父目录，再读取其中的 `文章概括/`、`小说/` 和 `memory/`；不得依赖 OpenClaw 的启动当前目录。
- 不使用只在全新工作区运行一次的 `BOOTSTRAP.md`。
- 不依赖每轮重新触发 Skill；常驻文件进入每轮 Project Context 才是同 session 与跨 session 的保证。
- 多个 Agent 各自拥有工作区时，每个工作区分别初始化。多个 Agent 共用同一工作区时，共享同一注入状态。
