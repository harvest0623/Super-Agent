/**
 * 命令行向量导入：node/tsx 独立进程跑通 embedding 管线，结果持久化到 .rag/knowledge.json
 * 用法: pnpm exec tsx src/rag/ingest-cli.ts docs/api-design.md docs/deployment-guide.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { chunkDocument } from './chunker.js';
import { createDashScopeEmbedder, embed } from './embedder.js';
import type { StoredChunk } from './store.js';

const OUT = '.rag/knowledge.json';

async function main() {
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) throw new Error('缺少 DASHSCOPE_API_KEY');

    const targets = process.argv.slice(2);
    if (targets.length === 0) throw new Error('请指定要导入的文档路径');

    // 载入已有向量库，实现增量 / 覆盖
    const merged = new Map<string, StoredChunk>();
    if (fs.existsSync(OUT)) {
        for (const c of JSON.parse(fs.readFileSync(OUT, 'utf-8')) as StoredChunk[]) {
            merged.set(c.id, c);
        }
    }

    const fn = createDashScopeEmbedder(apiKey);

    for (const p of targets) {
        const text = fs.readFileSync(p, 'utf-8');
        const chunks = chunkDocument(p, text);
        const embeddings = await embed(fn, chunks.map(c => c.text));
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = embeddings[i];
            if (!chunk || !embedding) continue;
            merged.set(chunk.id, { ...chunk, embedding, addedAt: Date.now() });
        }
        console.log(`✓ ${p}: ${chunks.length} 个片段, ${text.length} 字符`);
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify([...merged.values()], null, 2));
    console.log(`已写入 ${OUT}，共 ${merged.size} 个片段，来源 ${new Set([...merged.values()].map(c => c.source)).size} 个文档`);
}

main().catch(e => {
    console.error('失败:', e.message, e.cause?.code ?? e.cause?.message ?? '');
    process.exit(1);
});