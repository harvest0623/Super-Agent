import 'dotenv/config'
import { streamText, type ModelMessage, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createMockModel } from './mock-model.js'
import { createInterface } from 'readline'
import { weatherTool } from './tools/utility-tools.js'
import { agentLoop } from './agent/loop.js'

const tools = { get_weather: weatherTool }
const messages: ModelMessage[] = []
const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
})

const qwen = createOpenAI({
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

const system = '你是 Super Agent，一个有工具调用能力的 AI 助手。需要时主动使用工具获取信息，不要编造数据。'

function ask() {
    rl.question('\nYou: ', async (input) => {
        const trimmed = input.trim();
        if (!trimmed || trimmed === 'exit') {
            console.log('Bye!');
            rl.close();
            return;
        }

        messages.push({ role: 'user', content: trimmed });

        await agentLoop(model, tools, messages, system)

        ask()
    });
}

console.log('Super Agent v0.2 — Agent Loop (type "exit" to quit)\n');
ask();