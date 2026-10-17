[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/) [![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=339933)](https://nodejs.org/) [![AI SDK](https://img.shields.io/badge/AI_SDK-7.x-000000?logo=vercel&logoColor=000000)](https://sdk.vercel.ai/) [![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=003B57)](https://www.sqlite.org/) [![Zod](https://img.shields.io/badge/Zod-4.x-3E67B1?logo=zod&logoColor=3E67B1)](https://zod.dev/) [![MCP](https://img.shields.io/badge/MCP-stdio-6E4AFF?logo=anthropic&logoColor=6E4AFF)](https://modelcontextprotocol.io/)

**本项目使用：**

[![pnpm](https://img.shields.io/badge/pnpm-12.11.2-F69220?logo=pnpm&logoColor=F69220)](https://pnpm.io/) [![AI SDK](https://img.shields.io/badge/ai-7.0.117-000000?logo=vercel&logoColor=000000)](https://sdk.vercel.ai/) [![OpenAI Compatible](https://img.shields.io/badge/%40ai--sdk%2Fopenai-4.0.78-412991?logo=openai&logoColor=412991)](https://sdk.vercel.ai/providers/ai-sdk-providers/openai) [![better-sqlite3](https://img.shields.io/badge/better--sqlite3-13.0.3-003B57?logo=sqlite&logoColor=003B57)](https://github.com/WiseLibs/better-sqlite3) [![sqlite-vec](https://img.shields.io/badge/sqlite--vec-0.1.9-4B8BBE?logo=sqlite&logoColor=4B8BBE)](https://github.com/asg017/sqlite-vec) [![Zod](https://img.shields.io/badge/zod-4.6.7-3E67B1?logo=zod&logoColor=3E67B1)](https://zod.dev/) [![Croner](https://img.shields.io/badge/croner-10.0.1-2C3E50?logo=clockify&logoColor=2C3E50)](https://github.com/hexagon/croner) [![dotenv](https://img.shields.io/badge/dotenv-18.0.4-ECD53F?logo=dotenv&logoColor=ECD53F)](https://github.com/motdotla/dotenv) [![Turndown](https://img.shields.io/badge/turndown-7.2.4-585858?logo=markdown&logoColor=585858)](https://github.com/mixmark-io/turndown)

> **一个从零手写的生产级 AI Agent 运行时**，把「能聊天」做到「能干活、跑不挂」。集成自主 Agent 循环、工具系统与读写锁、上下文工程、跨会话记忆、RAG、Skill / Plugin 扩展、权限与 Hook 管线、Cron 定时任务、Multi-Agent 并行等能力。

## ✨ 项目亮点

### 🤖 Agent 内核

#### 自主 Agent 循环

* 基于 `streamText` 手写 `think → act → observe` 循环，告别 SDK 内置循环的「不可定制」
* 在循环每一步之间可自由插入日志、缓存、错误处理、熔断等自定义逻辑
* 消费 `fullStream` 解析文本增量、工具调用、工具结果等多类事件
* 单轮最多 50 步，工具调用未结束时自动进入下一步

#### 死循环检测与熔断

* 对「工具名 + 参数」做确定性 JSON 序列化后哈希，生成调用指纹
* 滑动窗口比对最近若干轮的调用指纹与结果指纹，只有「输入相同 **且** 输出相同」才判定为无进展
* 覆盖通用循环、乒乓循环（两个工具交替且无进展）、轮询无进展三类场景
* 分级处置：警告阶段向模型注入系统提醒，危险阶段直接熔断退出

#### 三级容错重试

* 对错误分类：可重试错误（网络、限流、超时）才重试，业务错误快速失败
* 指数退避 + 随机抖动，避免重试风暴
* 单步最多重试 3 次，重试时重置本步状态，保证事件流干净

#### Token 预算控制

* 逐步累计四类 token（输入 / 输出 / 缓存读 / 缓存写）
* 达到预算 90% 时预警，超过预算强制停止循环
* 从源头上防止「烧钱式」无限循环

### 🛠️ 工具系统

#### 统一工具注册表 ToolRegistry

* 每种工具由三要素构成：**描述**（做什么、何时用）、**参数 Schema**（类型与必填性）、**执行函数**（真正的逻辑）
* 注册表解耦「工具定义」与「工具使用」，任何地方的工具都通过 `register()` 统一纳管
* 内置结果截断：超长工具结果按 6:4 做 head/tail 分割，避免单条结果撑爆上下文

#### 读写锁并发控制

* 模型一次回复中可声明调用多个工具，SDK 会并发执行所有带 `execute` 的工具
* 只读工具获取**共享锁**，可与其他只读工具并存；读写工具获取**独占锁**，需等待全部工具完成
* 用「独占标志 + 共享计数 + 等待队列」三状态实现一把读写锁，执行前先判安全、再抢锁、`finally` 释放

#### ToolSearch 延迟加载

* 低频工具标记 `shouldDefer: true`，其完整 Schema 不进入 Prompt，仅保留「名字 + 搜索关键词」
* 模型发现缺少工具时调用元工具 `tool_search`，按需发现并解锁完整定义
* 将 Prompt 中的工具数量从几十个压缩到几个，同时不损失 Agent 的执行能力
* 核心工具（read/write/edit/list_directory/glob/grep/bash）始终全量携带

#### MCP 协议接入

* 基于 JSON-RPC 2.0 + stdio 传输实现 MCP 客户端，启动子进程通过标准输入输出收发 JSON 消息
* 完整走通三步：**握手**（initialize）→ **发现工具**（tools/list）→ **调用工具**（tools/call）
* 已接入 GitHub MCP 服务器，工具以 `mcp__github__*` 前缀注册
* Windows 下自动用 `cmd.exe /c` 包装命令，子进程异常退出时立即 reject 所有 pending 请求，避免假超时

### 🧠 上下文工程

#### Prompt Pipe 系统提示词

* 将系统提示词拆成多个可插拔的 pipe，每个 pipe 只负责一件事
* 核心规则 → 工具引导 → 延迟工具摘要 → 记忆上下文 → RAG 上下文 → Skill 上下文 → 会话上下文
* 拼接顺序不可打乱：易变模块后置，让 LLM 的 KV Cache 前缀尽可能命中

#### 三层防御 + 摘要压缩

* **超大结果截断**：单条工具结果不超过上下文窗口的 50%
* **总量清理**：总上下文超过窗口 75% 时，从最老的 tool result 开始替换为占位符
* **TTL 时间衰减**：软修剪（5 分钟，保留首尾 1500 字符）与硬清除（10 分钟，整体替换为过期标记），出错的工具结果不修剪
* 三层防线之后，再判断是否触发 LLM 摘要压缩，大幅降低压缩压力

#### Prompt Cache 与成本追踪

* 规范化四类 token：`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`
* 内置模型价格表，逐步计算成本并支持命中率 / 节省成本统计
* 用量写入 `.usage/today.jsonl`，终端可用 `/usage` 查看累计花费

### 💾 记忆与 RAG

#### 跨会话记忆

* 用 Markdown 文件 + `MEMORY.md` 索引管理长期记忆，按 `user` / `feedback` / `project` / `reference` 分类
* 单文件上限 4000 字符、索引上限 200 行，超限自动淘汰最旧条目
* 记忆是「线索」而非「事实」——使用前先用工具验证

#### 生产级 RAG

* 完整管线：**分块 → 向量化 → 混合检索 → 结果注入**
* 分块按目标 token 切分，超长段落按句号 / 问号二次切分
* 混合检索：SQLite 向量搜索（70% 权重）+ FTS5 关键词搜索（30% 权重），归一化后加权合并
* 单文件存储：`chunks` 主表 + `chunks_vec` 向量索引 + `chunks_fts` 全文索引，`knowledge.db` 一个文件搞定
* 使用 MMR 去重，避免召回结果高度重复

#### 记忆体检

* 针对记忆污染、数据爆炸、过期、冲突四类「记忆变坏」问题
* `lint` 校验 + TTL 分级清理 + `dream` 自动整理（让 Agent 自己合并重复、清理垃圾）
* 明确不保存清单：代码能推导的、git 能查到的、文档已写的、临时性的内容

### 🧩 扩展机制

#### Skill 机制

* Skill 不是 Tool——它是一份 Markdown 格式的行为指导，注入 System Prompt 改变 Agent「怎么思考」
* YAML frontmatter 定义元信息（`name`、`description`、`whenToUse`），正文定义行为规范
* 未激活的 Skill 仅展示名字与适用场景，输入 `/skill load <name>` 激活
* 内置示例：`.skills/code-review/SKILL.md`

#### Plugin 机制

* 让别人可以给你的 Agent 写功能：定义一套稳定的插件接口契约
* `PluginDefinition`（你是谁 / 注册什么 / 何时清理）+ `PluginApi`（工具注册、配置读取、日志）
* 命名隔离：插件工具统一加 `插件名__工具名` 前缀，防止跨插件工具名冲突
* 生命周期管理：`load` / `activate` / `unload` / `destroy` 全程管控

### 🔐 安全与自动化

#### 角色权限

* `owner`：可使用全部工具（含 Bash）
* `collaborator`：大部分工具可用，但禁用 Bash
* `guest`：仅只读工具（读文件、列目录、glob、grep、rag_search）
* `/role` 命令可随时查询与切换，切换后可用工具数实时变化

#### Bash 风险检测

* 三级风险分级：`safe` / `moderate` / `dangerous`
* 拦截危险命令：`rm -rf`、`sudo`、`mkfs`、`dd of=/dev/*`、fork bomb、`chmod 777`、`curl | sh`、`eval`、覆写 `/etc/`
* 中等风险命令（`rm`、`mv`、`git push`、`npm publish` 等）打印安全警告

#### Hook 管线

* 在工具执行**前**与执行**后**插入自定义钩子，用于日志、审计、监控、权限检查
* 钩子可返回 `allow` / `block` / `modify`：拦截执行、或改写工具输入 / 输出
* 内置示例：写入 `write_file` / `edit_file` 的审计日志钩子、`bash` 结果的时间戳注入钩子

#### Cron 定时任务

* 支持三种调度表达式：固定 cron、固定间隔、一次性定时
* 任务持久化，重启后自动恢复；执行状态追踪（成功 / 失败 / 超时）
* 连续失败自动熔断禁用；支持崩溃恢复与 `/cron` 命令管理

### 👥 Multi-Agent

* 用**独立的上下文窗口**做探索，子 Agent 从零开始，不继承父 Agent 的上下文，压缩后只把结论传回父 Agent
* `spawn_agent` 单任务派生、`spawn_parallel` 基于 `Promise.all` 并行执行多个子 Agent
* 每步只取子 Agent 最后一条 assistant 消息作为父 Agent 的上下文，保持父上下文干净
* 两道保护机制：**嵌套深度**防递归、**并发上限**防资源耗尽
* 内置超时控制与部分结果兜底，同进程隔离，启动零开销

## 🚀 功能特性

### P1 - 核心能力

| 功能模块 | 描述 |
| ----- | ----- |
| 🔁 Agent 循环 | `think → act → observe` 自主循环，50 步上限，工具结果自动回填 |
| 🔧 工具系统 | 统一注册表、结果截断、读写锁并发控制、参数 Schema 校验 |
| 🧠 上下文工程 | Prompt Pipe、三层防御、TTL 修剪、LLM 摘要压缩、成本追踪 |
| 💬 会话持久化 | JSONL 格式会话存档，崩溃只丢最后一条，可读可调试 |

### P2 - 重要能力

| 功能模块 | 描述 |
| ----- | ----- |
| 🛡️ 熔断与容错 | 死循环检测、Token 预算、分类重试 + 指数退避 |
| 🔍 混合检索 RAG | 向量 + 关键词双路检索，MMR 去重，结果注入 Prompt |
| 🗂️ 跨会话记忆 | Markdown 记忆库 + 索引文件 + 记忆体检（lint / dream） |
| 🔌 MCP 接入 | stdio 协议接入 GitHub MCP，工具延迟加载 |

### P3 - 扩展能力

| 功能模块 | 描述 |
| ----- | ----- |
| 📜 Skill 机制 | Markdown 行为规范注入 System Prompt，按需激活 |
| 🧩 Plugin 机制 | 插件接口契约，工具注册 + 命名隔离 + 生命周期管理 |
| 👥 Multi-Agent | 独立上下文的子 Agent，支持并行派生与结果汇总 |
| ⏰ Cron 定时 | 多表达式调度、持久化、熔断禁用、崩溃恢复 |

### P4 - 安全与运维

| 功能模块 | 描述 |
| ----- | ----- |
| 🔐 角色权限 | owner / collaborator / guest 三级工具访问控制 |
| ⚠️ Bash 风险检测 | 危险命令拦截、中等风险告警 |
| 🪝 Hook 管线 | 工具执行前后拦截 / 改写，审计与监控 |
| 📊 成本面板 | `/context` 看上下文占用，`/usage` 看累计花费 |

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
| ----- | ----- | ----- |
| TypeScript | 7.0.2 | 语言与类型系统 |
| Node.js | >= 18 | 运行时 |
| tsx | 4.23.15 | TS 直接运行，免编译 |
| AI SDK (`ai`) | 7.0.117 | 模型调用与工具编排核心 |
| `@ai-sdk/openai` | 4.0.78 | OpenAI 兼容协议 Provider（接入 DashScope） |
| better-sqlite3 | 13.0.3 | 本地 SQLite 存储 |
| sqlite-vec | 0.1.9 | SQLite 向量检索扩展 |
| Zod | 4.6.7 | 配置 Schema 定义与校验 |
| croner | 10.0.1 | Cron 表达式解析与调度 |
| turndown | 7.2.4 | HTML → Markdown 转换（web_fetch） |
| fast-glob | 3.3.3 | 文件模式匹配（glob 工具） |
| dotenv | 18.0.4 | 环境变量加载 |
| `@modelcontextprotocol/server-github` | 2025.4.8 | GitHub MCP 服务器 |

### 外部服务

| 服务 | 用途 |
| ----- | ----- |
| DashScope（通义千问） | 对话模型 + 文本向量化（`text-embedding-v3`） |
| Tavily | AI 原生联网搜索（免费 1000 次/月） |
| Serper | Google 搜索代理（免费 2500 次/月） |
| GitHub MCP | 通过 MCP 协议访问 GitHub 能力 |

## 📁 项目结构

```
Super-Agent/
├── src/
│   ├── index.ts                  # 入口：解析 init 参数并启动 Agent
│   ├── main.ts                   # 装配根：模型、注册表、记忆、RAG、插件、Cron，启动交互循环
│   ├── mock-model.ts             # 无 API Key 时的本地 Mock 模型
│   ├── agents/                   # Agent 内核
│   │   ├── loop.ts               # 主循环 think-act-observe
│   │   ├── loop-detection.ts     # 死循环检测（指纹 + 滑动窗口）
│   │   ├── retry.ts              # 分类重试 + 指数退避 + 抖动
│   │   ├── spawn.ts              # 子 Agent 派生与并行执行
│   │   ├── registry.ts           # 子 Agent 运行注册表
│   │   └── types.ts
│   ├── tools/                    # 工具系统
│   │   ├── registry.ts           # ToolRegistry：注册、截断、读写锁、权限、Hook
│   │   ├── index.ts              # 内置工具集合
│   │   ├── file-tools.ts         # read_file / write_file / edit_file / list_directory
│   │   ├── search-tools.ts       # glob / grep
│   │   ├── shell-tools.ts        # bash
│   │   ├── web-search.ts         # Tavily / Serper 搜索 + web_fetch
│   │   ├── tool-search.ts        # tool_search 元工具（延迟加载）
│   │   ├── mcp-client.ts         # MCP stdio 客户端
│   │   ├── memory-tools.ts       # memory 工具
│   │   ├── rag-tools.ts          # rag_ingest / rag_search
│   │   ├── cron-tools.ts         # 定时任务工具
│   │   ├── spawn-tools.ts        # spawn_agent / spawn_parallel
│   │   └── utility-tools.ts
│   ├── context/                  # 上下文工程
│   │   ├── prompt-builder.ts     # Prompt Pipe 系统提示词
│   │   ├── prompt-pipes.ts       # memory / rag 上下文注入
│   │   ├── defense.ts            # 三层防线（截断 / 清理 / TTL 修剪）
│   │   ├── compressor.ts         # microcompact + LLM 摘要压缩
│   │   ├── view.ts               # /context /usage 终端面板
│   │   └── tool-result-output.ts
│   ├── memory/                   # 跨会话记忆
│   │   ├── store.ts              # .memory/*.md + MEMORY.md 索引
│   │   └── validator.ts          # 记忆体检 lint
│   ├── rag/                      # RAG 管线
│   │   ├── chunker.ts            # 文档分块
│   │   ├── embedder.ts           # DashScope 向量化 + Mock + 缓存
│   │   ├── sqlite-store.ts       # SQLite + sqlite-vec + FTS5 混合检索
│   │   ├── store.ts
│   │   ├── search.ts
│   │   └── ingest-cli.ts
│   ├── skills/loader.ts          # Skill 加载（YAML frontmatter）
│   ├── plugins/                  # Plugin 机制
│   │   ├── types.ts              # PluginDefinition / PluginApi
│   │   ├── manager.ts            # 插件生命周期管理
│   │   └── supabase-plugin.ts
│   ├── security/                 # 安全
│   │   ├── roles.ts              # 角色权限
│   │   ├── bash-classifier.ts    # Bash 风险分级
│   │   └── hook.ts               # Hook 管线
│   ├── cron/                     # 定时任务
│   │   ├── service.ts            # 调度 + 熔断 + 崩溃恢复
│   │   ├── store.ts
│   │   ├── parser.ts
│   │   └── types.ts
│   ├── commands/                 # 交互式命令调度
│   ├── session/store.ts          # JSONL 会话持久化
│   ├── usage/tracker.ts          # Token 用量与成本追踪
│   └── config/                   # 配置加载与校验
│       ├── schema.ts
│       ├── loader.ts
│       └── init.ts
├── .skills/code-review/SKILL.md  # 内置 Skill 示例
├── .memory/                      # 记忆库
├── docs/                         # 知识库文档（启动时自动导入 RAG）
├── app/                          # 可视化前端
├── super-agent.config.json       # 主配置文件
├── .env.example                  # 环境变量模板
├── package.json
└── README.md
```

## 🏃 快速开始

### 环境要求

* Node.js >= 18.0.0
* pnpm >= 8.0.0
* 一个 OpenAI 兼容协议的模型服务（默认 DashScope 通义千问）

### 1. 克隆项目

```bash
git clone https://github.com/harvest0623/Super-Agent.git
cd Super-Agent
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，按需填写：

```bash
# 模型与向量化（必填，否则使用本地 Mock 模型）
DASHSCOPE_API_KEY=Your_API_Key

# 联网搜索（二选一即可）
TAVILY_API_KEY=Your_API_Key
SERPER_API_KEY=Your_API_Key

# GitHub MCP（可选）
GITHUB_PERSONAL_ACCESS_TOKEN=Your_Github_Personal_Access_Token
```

### 4. 初始化配置

```bash
pnpm run init
```

生成 `super-agent.config.json`，可调整模型、记忆目录、RAG、Cron、子 Agent 并发等参数。配置文件支持 `${ENV_VAR}` 语法引用环境变量。

### 5. 启动 Agent

```bash
pnpm start
```

启动后进入交互式终端循环，直接输入自然语言指令即可，例如：

```
You: 帮我对比 Hono、Fastify 和 Express 的性能和生态
```

`docs/` 目录下的 Markdown 文档会在启动时自动分块、向量化并导入知识库。

### 6. 交互式命令

| 命令 | 说明 |
| ----- | ----- |
| `/memory` | 查看所有记忆 |
| `/memory search <关键词>` | 搜索记忆 |
| `/lint` | 记忆体检 |
| `/context` | 终端查看上下文占用矩阵 |
| `/usage` | 查看累计 token 用量与成本 |
| `/rag` | 查看知识库状态 |
| `ingest <path>` | 从文件导入知识 |
| `/agents` | 查看子 Agent 执行记录 |
| `/cron` | 查看与管理定时任务 |
| `/skill` | 查看 / 激活 Skill |
| `/plugin` | 查看已加载插件 |
| `/role` | 查看 / 切换角色权限 |
| `/hooks` | 查看已注册的 Hook |
| `/dream` | 触发记忆自动整理 |

## 🔍 核心实现原理

### 1. 手写 Agent 循环

不依赖 SDK 的内置循环，自己掌控每一步，方便在步骤之间插入熔断、重试、成本统计等逻辑。

```typescript
// src/agents/loop.ts
while (step < MAX_STEPS) {
    step++;
    for (let attempt = 1; ; attempt++) {
        try {
            const result = streamText({
                model, tools: registry.toAISDKFormat(), messages, system,
                maxRetries: 0,
                providerOptions: { openai: { parallelCalls: true } },
            });
            for await (const part of result.fullStream) {
                if (part.type === 'tool-call') {
                    const detection = detect(part.toolName, part.input);  // 死循环检测
                    if (detection.level === 'critical') shouldBreak = true;
                    recordCall(part.toolName, part.input);
                }
                if (part.type === 'tool-result') recordResult(/* 记录结果指纹 */);
            }
            stepUsage = await result.usage;
            break;
        } catch (error) {   // 分类重试 + 指数退避
            if (attempt > MAX_RETRIES || !isRetryable(error)) throw error;
            await sleep(calculateDelay(attempt));
        }
    }
    if (shouldBreak) break;                         // 熔断退出
    if (totalTokens > TOKEN_BUDGET) break;          // 预算耗尽退出
}
```

### 2. 读写锁并发控制

只读工具共享、读写工具独占，执行前判安全、抢锁，`finally` 里释放。

```typescript
// src/tools/registry.ts
private async acquireConcurrent(): Promise<void> {
    while (this.exclusiveLock) {
        await new Promise<void>(resolve => this.waitQueue.push(resolve));
    }
    this.concurrentCount++;
}

private async acquireExclusive(): Promise<void> {
    while (this.exclusiveLock || this.concurrentCount > 0) {
        await new Promise<void>(resolve => this.waitQueue.push(resolve));
    }
    this.exclusiveLock = true;
}

// execute 中按 isConcurrencySafe 抢锁
if (isSafe) await registry.acquireConcurrent();
else        await registry.acquireExclusive();
try { return await executeFn(input); }
finally { isSafe ? registry.releaseConcurrent() : registry.releaseExclusive(); }
```

### 3. 系统提示词 Prompt Pipe

把系统提示词拆成有序 pipe 拼接，易变模块后置以最大化 KV Cache 命中。

```typescript
// src/main.ts
const builder = new PromptBuilder()
    .pipe('coreRules', coreRules())
    .pipe('toolGuide', toolGuide())
    .pipe('deferredTools', deferredTools())
    .pipe('memoryContext', memoryContext(memoryStore))
    .pipe('ragContext', ragContext(vectorStore))
    .pipe('skillContext', () => skillLoader.buildPromptSection(activeSkills))
    .pipe('sessionContext', sessionContext());
```

### 4. 混合检索 RAG

SQLite 单文件内同时完成向量检索与全文检索，按 7:3 加权合并后做 MMR 去重。

```typescript
// src/rag/sqlite-store.ts
const [queryVec] = await embed(embedFn, [query]);
const vectorResults  = this.vectorSearch(queryVec, candidateCount);  // sqlite-vec KNN
const keywordResults = this.keywordSearch(query, candidateCount);     // FTS5 bm25

// 归一化后加权合并：向量 70% + 关键词 30%
candidates.set(id, { score: vecScores[i] * 0.7, ... });
existing.score += kwScores[i] * 0.3;

return mmrSelect(sorted, topK);   // MMR 去重，避免召回重复
```

### 5. 上下文三层防御

先截断超大结果、再清理历史总量、再按 TTL 修剪过期结果，最后才考虑 LLM 摘要。

```typescript
// src/context/defense.ts
export function applyDefense(messages, timestamps): DefenseResult {
    const trunc = truncateToolResult(messages);   // 单条超 50% 窗口 → head/tail 截断
    let result = trunc.messages;
    const prune = ttlPrune(result, timestamps);   // 5 分钟软修剪 / 10 分钟硬清除
    result = prune.messages;
    const tokenEstimate = estimateMessageTokens(result);
    return { messages: result, tokenEstimate, ... };
}
```

### 6. 死循环指纹检测

同一工具、相同参数、相同结果重复出现即判定「无进展」。

```typescript
// 概念示意
const callFingerprint   = hash(JSON.stringify({ name, input }));
const resultFingerprint = hash(JSON.stringify({ name, input, output }));
// 只有调用指纹与结果指纹都相同，才认为无进展
// 滑动窗口内查找重复 → 警告 / 熔断分级处置
```

### 7. Plugin 接口契约

插件通过 API 注册工具，命名自动加前缀隔离，走完整生命周期。

```typescript
// src/plugins/types.ts
export interface PluginDefinition {
    name: string;
    version: string;
    description: string;
    config?: PluginConfig;
    activate(api: PluginApi): Promise<void> | void;   // 注册工具
    destroy?(): Promise<void> | void;                 // 清理资源
}

// src/plugins/manager.ts — 命名隔离
const prefixedName = `${definition.name}__${tool.name}`;
```

### 8. MCP stdio 通信

通过标准输入输出与 MCP 服务器进程收发 JSON-RPC 消息。

```typescript
// src/tools/mcp-client.ts
await this.send('initialize', { protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'super-agent', version: '0.5.0' } });
this.process.stdin!.write(JSON.stringify({
    jsonrpc: '2.0', method: 'notifications/initialized',
}) + '\n');

// 三步走：tools/list 发现工具 → tools/call 调用工具
async listTools() { return (await this.send('tools/list', {})).tools || []; }
async callTool(name, args) { return (await this.send('tools/call', { name, arguments: args })); }
```

## 🧩 开发指南

### 添加一个新工具

1. 在 `src/tools/` 下定义工具对象，声明 `name`、`description`、`parameters`、`execute`
2. 按需设置 `isConcurrencySafe`（能否并行）、`isReadOnly`、`maxResultChars`、`shouldDefer`
3. 在 `src/tools/index.ts` 的 `allTools` 中导出，或在 `main.ts` 中通过 `registry.register(...)` 注册

```typescript
const myTool: ToolDefinition = {
    name: 'my_tool',
    description: '这个工具用来做什么，什么时候该用',
    parameters: { type: 'object', properties: { arg: { type: 'string' } }, required: ['arg'] },
    isConcurrencySafe: true,
    isReadOnly: true,
    execute: async ({ arg }) => `结果: ${arg}`,
};
```

### 添加一个新 Skill

1. 在 `.skills/<name>/` 下创建 `SKILL.md`
2. 顶部写 YAML frontmatter 声明元信息，正文写行为规范

```markdown
---
name: code-review
description: "以高级工程师的视角来审查代码变更"
whenToUse: 代码变更时
---

# code-review

## 审查流程
1. 从 git log 收集变更范围
2. 对变更内容逐项审查
```

### 添加一个新插件

1. 在 `src/plugins/` 下实现 `PluginDefinition`
2. 在 `activate(api)` 中通过 `api.registerTools([...])` 注册工具
3. 在 `main.ts` 的 `availablePlugins` 中登记插件

### 添加一个新命令

1. 在 `src/commands/` 下实现一个 `CommandHandler`
2. 在 `main.ts` 的 `createDispatcher([...])` 中挂载

## 📦 依赖说明

### 运行时依赖

* `ai`：模型调用与工具编排核心
* `@ai-sdk/openai`：OpenAI 兼容协议 Provider
* `better-sqlite3` + `sqlite-vec`：SQLite 主存储与向量检索
* `zod`：配置 Schema 定义与校验
* `croner`：Cron 表达式解析调度
* `turndown`：HTML 转 Markdown
* `fast-glob`：文件模式匹配
* `dotenv`：环境变量加载
* `@modelcontextprotocol/server-github`：GitHub MCP 服务器

### 开发依赖

* `typescript`：类型系统
* `tsx`：TypeScript 直接运行，免编译
* `@types/node`：Node.js 类型声明

## 🔄 运行环境

* **操作系统**：Windows / macOS / Linux
* **Node.js**：>= 18（推荐 20+）
* **模型服务**：任意 OpenAI 兼容协议接口；未配置 API Key 时自动降级为本地 Mock 模型，便于离线开发调试

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/YourFeature`
3. 提交更改：`git commit -m 'Add some YourFeature'`
4. 推送到分支：`git push origin feature/YourFeature`
5. 开启 Pull Request

## 📄 许可证

本项目采用 ISC 许可证，详见 [package.json](file:///d:/Coding/Super-Agent/package.json) 中的 `license` 字段。

## 📞 联系方式

* GitHub Issues：[提交问题](https://github.com/harvest0623/Super-Agent/issues)
* 邮箱：[3367741939@qq.com](mailto:3367741939@qq.com)

---

**如果这个项目对你有帮助，欢迎给一个 ⭐ Star！**

> 🤖 Super Agent：从「能聊天」到「能干活、跑不挂」，一步步搭建一个生产级的 AI Agent 运行时。
