import type { EmbeddingFn } from './embedder.js';
import { embed, cosineSimilarity } from './embedder.js';
import type { StoredChunk, VectorStore } from './store.js';

export interface SearchResult {
    chunk: StoredChunk;
    score: number;
    vectorScore: number;
    keywordScore: number;
}

const VECTOR_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;
const CANDIDATE_MULTIPLIER = 4;  // 候选数量倍数
const MMR_LAMBDA = 0.7;  // MMR参数 70% 相关性 30% 多样性

export async function hybridSearch(   // 混合检索
    store: VectorStore,
    embedFn: EmbeddingFn,
    query: string,
    topK: number = 5
): Promise<SearchResult[]> {
    const all = store.getAll();  // 获取所有的向量数据
    const candidateCount = Math.min(topK * CANDIDATE_MULTIPLIER, all.length);

    // 路径1：向量检索
    const [queryVec] = await embed(embedFn, [query]);  // 先将查询语句转成向量
    if (!queryVec) return [];
    const vectorResults = all
        .map(chunk => ({ chunk, score: cosineSimilarity(queryVec, chunk.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, candidateCount)


    // 路径2：关键词检索 (BM25)
    const queryTerms = tokenize(query);  // 对查询语句进行分词
    const docCount = all.length;  // 文档数量
    const keywordResults = all
        .map(chunk => ({ chunk, score: bm25Score(queryTerms, chunk.text, docCount, all) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, candidateCount)


    // 归一化：不是两种分数的和
    const vecNorm = normalizeMinMax(vectorResults.map(r => r.score));
    const kwNorm = normalizeViaSigmoid(keywordResults.map(r => r.score));  // 因为BM25得到的分数可能是负数，也可能是几十

    // 合并结果
    const candidates = new Map<string, SearchResult>()


    for (let i = 0; i < vectorResults.length; i++) {
        const result = vectorResults[i];
        const score = vecNorm[i];
        if (!result || score === undefined) continue;
        const id = result.chunk.id;
        candidates.set(id, {
            chunk: result.chunk,
            score: score * VECTOR_WEIGHT,
            vectorScore: score,
            keywordScore: 0,
        })
    }

    for (let i = 0; i < keywordResults.length; i++) {
        const result = keywordResults[i];
        const score = kwNorm[i];
        if (!result || score === undefined) continue;
        const id = result.chunk.id;
        const existing = candidates.get(id);
        if (existing) {
            existing.keywordScore = score;
            existing.score += score * KEYWORD_WEIGHT;
        } else {
            candidates.set(id, {
                chunk: result.chunk,
                score: score * KEYWORD_WEIGHT,
                vectorScore: 0,
                keywordScore: score,
            })
        }
    }

    // 排序
    const sorted = [...candidates.values()].sort((a, b) => b.score - a.score);

    // 处理的相关性和多样性 （防止搜到的数据有重复）
    return mmrSelect(sorted, topK);

}



// BM25 算文本的匹配度
function tokenize(text: string): string[] {
    return text.toLowerCase()
        .replace(/[^\w一-鿿]+/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1);
}

function bm25Score(queryTerms: string[], docText: string, N: number, allDocs: StoredChunk[]): number {
    const k1 = 1.2;
    const b = 0.75;
    const docTokens = tokenize(docText);
    const avgDl = allDocs.reduce((s, d) => s + tokenize(d.text).length, 0) / (N || 1);
    const dl = docTokens.length;
    let score = 0;

    for (const term of queryTerms) {
        const tf = docTokens.filter(t => t === term).length;
        const df = allDocs.filter(d => tokenize(d.text).includes(term)).length;
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDl)));
        score += idf * tfNorm;
    }

    return score;
}


// 归一化操作
function normalizeMinMax(scores: number[]): number[] {
    if (scores.length === 0) return [];
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;
    return scores.map(s => (s - min) / range);
}

// 计算sigmoid函数的值，将分数映射到0到1之间，同时保持分数的相对顺序
function normalizeViaSigmoid(scores: number[]): number[] {
    return scores.map(s => 1 / (1 + Math.exp(-s)));
}


// MMR去重
function mmrSelect(results: SearchResult[], topK: number): SearchResult[] {
    if (results.length <= topK) return results;

    const first = results[0];
    if (!first) return [];
    const selected: SearchResult[] = [first];
    const remaining = results.slice(1);

    while (selected.length < topK && remaining.length > 0) {
        let bestIdx = 0;
        let bestMmr = -Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            if (!candidate) continue;
            const relevance = candidate.score;
            const maxSim = Math.max(...selected.map(s => jaccardSimilarity(s.chunk.text, candidate.chunk.text)));
            const mmr = MMR_LAMBDA * relevance - (1 - MMR_LAMBDA) * maxSim;
            if (mmr > bestMmr) {
                bestMmr = mmr;
                bestIdx = i;
            }
        }

        const best = remaining[bestIdx];
        if (!best) break;
        selected.push(best);
        remaining.splice(bestIdx, 1);
    }

    return selected;
}

function jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));
    const intersection = [...setA].filter(t => setB.has(t)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}