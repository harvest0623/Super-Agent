import 'dotenv/config'
import { streamText, type ModelMessage, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createMockModel } from './mock-model.js'
import { createInterface } from 'readline'
// import { weatherTool } from './tools/utility-tools.js'
import { allTools } from './tools/tools.js'
import { ToolRegistry } from './tools/tool-registry.js'
import { agentLoop, type BudgetState } from './agent/loop.js'

// const tools = { get_weather: weatherTool }
const registry = new ToolRegistry();
registry.register(...allTools);
console.log(`已注册: ${registry.getAll().length} 个工具`);
for (const tool of registry.getAll()) {
    const flags = [
        tool.isConcurrencySafe ? '可并发' : '串行',
        tool.isReadOnly ? '只读' : '读写',
    ].join(', ');
    console.log(` -- ${tool.name}: ${flags}`);
}

const messages: ModelMessage[] = []
const rl = createInterface({  // 创建 readline 接口, 用于从命令行读取用户输入
    input: process.stdin,
    output: process.stdout,
})

const qwen = createOpenAI({  // 创建 OpenAI 模型, 用于生成文本
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.DASHSCOPE_API_KEY ?? '',
})
const model = process.env.DASHSCOPE_API_KEY ? qwen.chat('qwen3.8-27b') : createMockModel()

// async function main() {
//     const result = streamText({
//         model: model as any,
//         prompt: '用一句话介绍你自己',
//     })

//     for await (const chunk of result.textStream) {
//         process.stdout.write(chunk)
//     }

// }
// main()


// function ask() {
//     rl.question('\nYou: ', async (input) => {
//         const trimmed = input.trim();
//         if (!trimmed || trimmed === 'exit') {
//             console.log('Bye!');
//             rl.close();
//             return;
//         }

//         messages.push({ role: 'user', content: trimmed });

//         const result = streamText({
//             model: model as any,
//             system: '你是 Super Agent，一个有工具调用能力的 AI 助手。需要时主动使用工具获取信息，不要编造数据。',
//             tools,
//             messages,
//             stopWhen: stepCountIs(5),
//         });

//         process.stdout.write('Assistant: ');
//         let fullResponse = '';

//         for await (const part of result.fullStream) {
//             switch (part.type) {
//                 case 'text-delta':
//                     process.stdout.write(part.text);
//                     fullResponse += part.text;
//                     break;
//                 case 'tool-call':
//                     console.log(`\n  [调用工具: ${part.toolName}(${JSON.stringify(part.input)})]`);
//                     break;
//                 case 'tool-result':
//                     console.log(`  [工具返回: ${JSON.stringify(part.output)}]`);
//                     break;
//             }
//         }

//         console.log(); // 换行
//         messages.push({ role: 'assistant', content: fullResponse });

//         ask();
//     });
// }

const budget: BudgetState = { used: 0, limit: 150000 }  // token 预算

const SYSTEM = `你是 Super Agent，一个有工具调用能力的 AI 助手。
你有以下工具可用：read_file, write_file, list_directory, editFileTool, globTool, grepTool, bashTool。
需要查询信息或操作文件时，主动使用工具，不要编造数据。
可以同时调用多个互不冲突的工具来提高效率。
回答要简洁直接。`;

function ask() {
    rl.question('\nYou: ', async (input) => {
        const trimmed = input.trim();
        if (!trimmed || trimmed === 'exit') {
            console.log('Bye!');
            rl.close();
            return;
        }

        messages.push({ role: 'user', content: trimmed });

        await agentLoop(model, registry, messages, SYSTEM, budget);

        ask();
    });
}

console.log('Super Agent v0.3 — Agent Loop (type "exit" to quit)\n');
// console.log('试试输入："测试死循环"');

ask();