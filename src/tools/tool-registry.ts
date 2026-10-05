import { jsonSchema } from "ai";

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (input: any) => Promise<unknown>;

    isConcurrencySafe?: boolean;  // 能否并行
    isReadOnly?: boolean;  // 是否只读
    maxResultChars?: number;  // 最大结果字符数
}

const DEFAULT_MAX_RESULT_CHARS = 3000; // 工具执行允许的最大输出字符数


export class ToolRegistry {
    private tools = new Map<string, ToolDefinition>();   // 工具列表

    register(...tools: ToolDefinition[]): void { // 将来在任何地方定义的工具，都直接通过register方法注册，被存入tools列表
        for (const tool of tools) {
            this.tools.set(tool.name, tool);
        }
    }

    get(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    getAll(): ToolDefinition[] {
        return [...this.tools.values()];
    }

    toAISDKFormat(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const [name, tool] of this.tools) {
            const maxChars = tool.maxResultChars;
            const executeFn = tool.execute;
            result[name] = {
                description: tool.description,
                inputSchema: jsonSchema(tool.parameters as any),
                execute: async (input: any) => {
                    const raw = await executeFn(input);
                    const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
                    return truncateResult(text, maxChars);
                },
            };
        }
        return result;
    }
}


export function truncateResult(text: string, maxChars: number = DEFAULT_MAX_RESULT_CHARS) {  // 截断
    if (text.length <= maxChars) return text;

    const headSize = Math.floor(maxChars * 0.6);  // 头部
    const tailSize = maxChars - headSize;  // 尾部
    const head = text.slice(0, headSize);
    const tail = text.slice(-tailSize);
    const dropped = text.length - headSize - tailSize;  // 被截断的字符数

    return `${head}\n\n... [省略${dropped}个字符] \n\n${tail}`;
}