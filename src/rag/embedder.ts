export type EmbeddingFn = (texts: string[]) => Promise<number[][]>;

const DIMS = 256;  // 嵌入维度（DashScope 仅支持 256/512/768/1024/1536/2048/2560）

export function createDashScopeEmbedder(apiKey: string): EmbeddingFn {
    return async (texts: string[]) => {
        const resp = await fetch(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'qwen3.7-text-embedding-flash',
                    input: texts,
                    dimensions: DIMS,
                }),
            },
        );
        const data = await resp.json() as any;
        if (!resp.ok || !Array.isArray(data.data)) {
            throw new Error(`嵌入接口调用失败 (${resp.status}): ${data.error?.message ?? JSON.stringify(data).slice(0, 300)}`);
        }
        return data.data.map((d: any) => d.embedding as number[]);
    };
}


// 相同的文本没必要重复做向量处理
const embedCache = new Map<string, number[]>();

export async function embed(fn: EmbeddingFn, texts: string[]): Promise<number[][]> {
    const results: number[][] = new Array(texts.length);
    const uncached: { idx: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        if (text === undefined) continue;
        const cached = embedCache.get(text);
        if (cached) {
            results[i] = cached;
        } else {
            uncached.push({ idx: i, text });
        }
    }

    if (uncached.length > 0) {
        const vectors = await fn(uncached.map(u => u.text));  // 批量处理未缓存的文本
        for (let i = 0; i < uncached.length; i++) {
            const u = uncached[i];
            const vector = vectors[i];
            if (!u || !vector) continue;
            results[u.idx] = vector;
            embedCache.set(u.text, vector);
        }
    }

    return results;
}


// 计算向量之间的余弦相似度  --- 两个向量“有多像”
export function cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        const x = a[i];
        const y = b[i];
        if (x === undefined || y === undefined) continue;
        dot += x * y;
        normA += x * x;
        normB += y * y;
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}


export { DIMS };