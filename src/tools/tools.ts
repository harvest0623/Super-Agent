import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ToolDefinition } from './tool-registry.js'

export const readFileTool: ToolDefinition = {
    name: 'read_file',
    description: '读取指定路径的文件内容',
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: '文件路径',
            }
        },
        required: ['path'],
        additionalProperties: false
    },
    isConcurrencySafe: true,
    isReadOnly: true,
    maxResultChars: 500,
    execute: async ({ path }: { path: string }) => {
        return readFileSync(resolve(path), 'utf-8');
    },
}

export const writeFileTool: ToolDefinition = {
    name: 'write_file',
    description: '写入内容到指定文件',
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: '文件路径',
            },
            content: {
                type: 'string',
                description: '要写入的内容',
            }
        },
        required: ['path', 'content'],
        additionalProperties: false
    },
    isConcurrencySafe: false,  // 写入操作不能并发
    isReadOnly: false,
    execute: async ({ path, content }: { path: string, content: string }) => {
        writeFileSync(resolve(path), content, 'utf-8');
        return `已写入 ${content.length} 个字符到 ${path}`;
    }
}

export const listDirectoryTool: ToolDefinition = {
    name: 'list_directory',
    description: '列出指定目录下的文件和子目录',
    parameters: {
        type: 'object',
        properties: {
            path: { type: 'string', description: '目录路径，默认为当前目录' },
        },
        required: [],
        additionalProperties: false,
    },
    isConcurrencySafe: true,
    isReadOnly: true,
    execute: async ({ path = '.' }: { path?: string }) => {
        const resolved = resolve(path);
        const entries = readdirSync(resolved);
        return entries.map(name => {
            try {
                const stat = statSync(join(resolved, name));
                return `${stat.isDirectory() ? '[DIR]' : '[FILE]'} ${name}`;
            } catch {
                return `[?] ${name}`;
            }
        }).join('\n');
    },
};

export const allTools: ToolDefinition[] = [
    readFileTool,
    writeFileTool,
    listDirectoryTool,
];