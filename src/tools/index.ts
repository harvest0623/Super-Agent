import type { ToolDefinition } from './registry.js'
import { readFileTool, writeFileTool, editFileTool, listDirectoryTool } from './file-tools.js'
import { globTool, grepTool } from './search-tools.js'
import { bashTool } from './shell-tools.js'
import { pickSearchTool, webFetchTool } from './web-search.js'

export const allTools: ToolDefinition[] = [
    readFileTool,
    writeFileTool,
    listDirectoryTool,
    editFileTool,
    globTool,
    grepTool,
    bashTool,
    pickSearchTool(),
    webFetchTool,
]

// 核心工具
export {
    readFileTool,
    writeFileTool,
    listDirectoryTool,
    editFileTool,
    globTool,
    grepTool,
    bashTool,
}