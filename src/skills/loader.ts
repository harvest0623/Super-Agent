import fs from 'node:fs'
import path from 'node:path'

export interface SkillDefinition {
    name: string
    description: string
    whenToUse?: string
    content: string
    dirPath: string
}

const SKILLS_DIR = '.skills';
const SKILL_FILE = 'SKILL.md';

export class SkillLoader {
    private readonly baseDir: string = '';
    private skills = new Map<string, SkillDefinition>()

    constructor(baseDir = '.') {
        this.baseDir = baseDir;
    }

    load(): SkillDefinition[] {
        this.skills.clear();

        const skillsDir = path.join(this.baseDir, SKILLS_DIR);  // 'xxx/xxx/.skills'
        if (!fs.existsSync(skillsDir)) return [];

        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue
            const skillFile = path.join(skillsDir, entry.name, SKILL_FILE)  // 'xxx/xxx/.skills/code-review/SKILL.md'
            if (!fs.existsSync(skillFile)) continue

            const raw = fs.readFileSync(skillFile, 'utf-8')
            const parsed = this.parseFrontmatter(raw)  // 解析Skill的Frontmatter

            if (!parsed) continue

            const definition: SkillDefinition = {
                name: entry.name,
                description: parsed.description,
                content: parsed.content,
                dirPath: path.join(skillsDir, entry.name),  // 'xxx/xxx/.skills/code-review'
            }
            if (parsed.whenToUse) definition.whenToUse = parsed.whenToUse
            this.skills.set(entry.name, definition)
        }

        return this.list()  // 得到所的Skill
    }

    list(): SkillDefinition[] {
        return Array.from(this.skills.values())
    }

    get(name: string): SkillDefinition | undefined {
        return this.skills.get(name)
    }

    buildPromptSection(activeSkills: Set<string>): string | null {
        if (this.skills.size === 0) return null

        const lines: string[] = []

        for (const name of activeSkills) {
            const skill = this.skills.get(name)
            if (!skill) continue
            lines.push(`[激活的 Skill：${skill.name}]`)
            lines.push(skill.content)
            lines.push('')
        }

        const available = this.list()
            .filter(s => !activeSkills.has(s.name))  // 过滤出未激活的Skill
            .map(s => {
                const hint = s.whenToUse ? `（适用场景： ${s.whenToUse}）` : '';
                return ` /${s.name} - ${s.description}${hint}`   // '/code-review - 以高级工程师的视角来审查代码变更（适用场景： 代码变更时）'
            })

        if (available.length > 0) {
            lines.push(`可用的 Skills（输入 /skill load <name> 激活）：`)
            lines.push(...available)
        }

        return lines.length > 0 ? lines.join('\n') : null

    }

    private parseFrontmatter(raw: string): { description: string; content: string; whenToUse?: string } | null {
        const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) return { description: '', content: raw };
        const frontmatter = match[1];
        const body = match[2];
        if (frontmatter === undefined || body === undefined) {
            return { description: '', content: raw };
        }
        const meta: Record<string, string> = {};
        for (const line of frontmatter.split('\n')) {  // ['name: code-review', 'description: "以高级工程师的视角来审查代码变更"']
            const idx = line.indexOf(':');
            if (idx > 0) {
                const key = line.slice(0, idx).trim();
                let value = line.slice(idx + 1).trim();
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                meta[key] = value;
            }
        }
        const parsed: { description: string; content: string; whenToUse?: string } = {
            description: meta.description || '',
            content: body.trim()
        };
        if (meta.whenToUse) parsed.whenToUse = meta.whenToUse;
        return parsed;
    }
}