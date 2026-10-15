import 'dotenv/config'
import { type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createMockModel } from './mock-model.js'
import { createInterface } from 'readline'
// import { weatherTool } from './tools/utility-tools.js'
import { allTools } from './tools/index.js'
import { ToolRegistry, type ToolDefinition } from './tools/registry.js'
import { agentLoop, type BudgetState } from './agent/loop.js'
import { MCPClient } from './tools/mcp-client.js'
import { SessionStore } from './session/store.js'
import { PromptBuilder, coreRules, toolGuide, deferredTools, sessionContext, type PromptContext } from './context/prompt-builder.js'
import { estimateTokens } from './context/compressor.js'
import { estimateMessageTokens, applyDefense, TokenTracker } from './context/defense.js'
import { UsageTracker } from './usage/tracker.js'
import { createToolSearchTool } from './tools/tool-search.js'  // 注册 tool_search 元工具
import { MemoryStore } from './memory/store.js'  // 优化记忆存储
import { createDispatcher, type CommandContext } from './commands/index.js'
import { debugCommands } from './commands/debug.js'
import { memoryCommands } from './commands/memory.js'
import { contextCommands } from './commands/context.js'
import { ragCommands } from './commands/rag.js'
import { dreamCommands } from './commands/dream.js'
import { createMemoryTool } from './tools/memory-tools.js'
// import { VectorStore } from './rag/store.js'
import { SqliteVectorStore } from './rag/sqlite-store.js'
import { createDashScopeEmbedder, embed } from './rag/embedder.js'
import { createRagTools } from './tools/rag-tools.js'
import { ragContext, memoryContext } from './context/prompt-pipes.js'
import fs from 'node:fs';
import { chunkDocument } from './rag/chunker.js'
import { SkillLoader } from './skills/loader.js'
import { createSkillCommands } from './commands/skill.js'


// 创建 OpenAI 模型, 用于生成文本
const qwen = createOpenAI({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.DASHSCOPE_API_KEY ?? '',
})

const model = process.env.DASHSCOPE_API_KEY ? qwen.chat('qwen3.7-flash-2026-07-15') : createMockModel();

// ---------------- 注册工具 ------------------------
const registry = new ToolRegistry();
registry.register(...allTools);
registry.register(createToolSearchTool(registry));


// --------------- 连接github MCP服务器 ----------------
async function connectMCP() {
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

    let canSpawn = true;
    try {
        const { execSync } = await import('node:child_process');
        execSync('echo test', { stdio: 'ignore' });
    } catch {
        canSpawn = false;
    }

    if (githubToken && canSpawn) {
        console.log('\n连接 GitHub MCP Server...');
        try {
            const client = new MCPClient(
                'pnpm', ['dlx', '@modelcontextprotocol/server-github'],
                { GITHUB_PERSONAL_ACCESS_TOKEN: githubToken },
            );
            const tools = await registry.registerMCPServer('github', client);
            console.log(`  已注册 ${tools.length} 个 MCP 工具`);
            return;
        } catch (err) {
            console.log(`  MCP 连接失败: ${err instanceof Error ? err.message : err}`);
        }
    }
    if (!githubToken) {
        console.log('\n未配置 GITHUB_PERSONAL_ACCESS_TOKEN，无法连接 GitHub MCP Server。');
    }
}

// ------------------- Memory ------------------------
const memoryStore = new MemoryStore('.');
memoryStore.init();
registry.register(createMemoryTool(memoryStore));

// ------------------- Skills ------------------------
const skillLoader = new SkillLoader();  // skill 加载器
const loadedSkills = skillLoader.load();
const activeSkills = new Set<string>();

// ------------------- Command ------------------------
const dispatch = createDispatcher([
    ...debugCommands,
    ...memoryCommands,
    ...contextCommands,
    ...ragCommands,
    ...dreamCommands,
    ...createSkillCommands(skillLoader, activeSkills),
])

// ------------------- RAG ------------------------
// const vectorStore = new VectorStore();
const vectorStore = new SqliteVectorStore('knowledge.db');
const embedFn = createDashScopeEmbedder(process.env.DASHSCOPE_API_KEY as string);
registry.register(...createRagTools(vectorStore, embedFn));

async function main() {
    await connectMCP();

    // Session 持久化
    const store = new SessionStore('default');
    let messages: ModelMessage[] = [];
    const timestamps = new Map<number, number>(); // 消息索引 -> 时间戳映射
    const tracker = new UsageTracker('.usage/today.jsonl');  // 用于跟踪token用量

    // Prompt Pipe 组装 system prompt
    const builder = new PromptBuilder()
        .pipe('coreRules', coreRules())
        .pipe('toolGuide', toolGuide())
        .pipe('deferredTools', deferredTools())
        .pipe('memoryContext', memoryContext(memoryStore))  // 在历史消息中挑选有价值的上下文
        .pipe('ragContext', ragContext(vectorStore))
        .pipe('skillContext', () => skillLoader.buildPromptSection(activeSkills))
        .pipe('sessionContext', sessionContext());

    function makePromptCtx(): PromptContext {
        return {
            toolCount: registry.getActiveTools().length,  // 活跃工具数
            deferredToolSummary: registry.getDeferredToolSummary(),  // 延迟工具摘要
            sessionMessageCount: messages.length,
            sessionId: 'default'
        }
    }

    const rl = createInterface({   // 创建 readline 接口, 用于从命令行读取用户输入
        input: process.stdin,
        output: process.stdout,
    })

    function ask() {
        rl.question('\nYou: ', async (input) => {
            const trimmed = input.trim();
            if (!trimmed || trimmed === 'exit') {
                console.log('Bye!');
                await registry.closeAllMCP();  // 关闭子进程的 MCP 连接
                rl.close();
                return;
            }

            const ctx: CommandContext = {
                messages, timestamps, registry, builder, tracker,
                sessionStore: store, model, makePromptCtx, ask, memoryStore,
                vectorStore
            }
            const handled = dispatch(trimmed, ctx);  // 处理用户输入，如果是指令...
            if (handled === 'async') return;
            if (handled) {
                ask();
                return;
            }

            const userMsg: ModelMessage = { role: 'user', content: trimmed };
            messages.push(userMsg);
            timestamps.set(messages.length - 1, Date.now());
            store.append(userMsg);

            const currentSystem = builder.build(makePromptCtx());
            const beforeLen = messages.length;
            await agentLoop(model, registry, messages, currentSystem, tracker);

            // 持久化本轮新增加的消息 （包含Agent Loop 中会往messages里面push的消息）
            const newMessages = messages.slice(beforeLen);
            const now = Date.now()
            for (let i = beforeLen; i < messages.length; i++) timestamps.set(i, now)
            store.appendAll(newMessages);  // 追加的只有AgentLoop产生的消息
            console.log(` [Token] ~${estimateMessageTokens(messages)} tokens`);

            ask();
        });
    }
    console.log('Super Agent v0.11 — Memory System (type "exit" to quit)\n');
    console.log('快捷命令：');
    console.log(`  /memory            - 查看所有记忆`);
    console.log(`  /skill             - 查看所有 Skill`);
    console.log(`  /skill load <name> - 加载指定 Skill`);
    console.log(`  /skill unload <name> - 卸载已激活指定 Skill`);
    console.log(`  /code-review       - 激活并执行 code-review Skill`);
    console.log(`  /memory search     - 搜索记忆`);
    console.log(`  /context           - 终端里看 context 占用矩阵`);
    console.log(`  /usage             - 累计 token 用量和成本`);
    console.log(`  /rag               - 查看知识库状态`);
    console.log(`  ingest <path>      - 从文件导入知识`);
    console.log(`  status             - 当前消息数、token 和记忆数`);
    console.log('');
    console.log(` 已加载 ${memoryStore.list().length} 条历史记忆`);
    console.log('');

    if (loadedSkills.length > 0) {
        console.log(` 发现了 ${loadedSkills.length} 个 Skill`);
        for (const s of loadedSkills) {
            console.log(`  ${s.name} - ${s.description}`);
        }
        console.log('');
    }

    if (fs.existsSync('docs')) {
        const files = fs.readdirSync('docs').filter(f => f.endsWith('.md'));
        if (files.length > 0) {
            console.log(` 发现 ${files.length} 个文档， 自动导入知识库...`);
            for (const f of files) {
                const path = `docs/${f}`;
                const text = fs.readFileSync(path, 'utf-8');
                const chunks = chunkDocument(path, text);
                const embeddings = await embed(embedFn, chunks.map(c => c.text));
                const items = chunks.flatMap((c, i) => {
                    const embedding = embeddings[i];
                    return embedding ? [{ chunk: c, embedding }] : [];
                });
                vectorStore.addBatch(items);
                console.log(`  ${f} -> ${chunks.length} 个片段`);
            }
            console.log(` 知识库准备就绪， 共 ${vectorStore.size()} 个片段\n`);
        }
    }
    ask();
}
main().catch(console.error);