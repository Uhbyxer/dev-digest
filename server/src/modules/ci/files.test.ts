import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { assembleCiFiles, redactRunner, zipFiles } from './files.js';
import type { AgentRow, SkillRow } from '../../db/rows.js';

const mkAgent = (id: string, name: string, day: number): AgentRow =>
  ({
    id,
    name,
    provider: 'openrouter',
    model: 'm/x',
    systemPrompt: 'prompt',
    strategy: 'auto',
    ciFailOn: 'critical',
    createdAt: new Date(2026, 0, day),
  }) as unknown as AgentRow;
const mkSkill = (id: string, name: string, day: number): SkillRow =>
  ({ id, name, body: `body of ${name}`, createdAt: new Date(2026, 0, day) }) as unknown as SkillRow;

const agent = mkAgent('a1', 'Security Reviewer', 1);
const s1 = mkSkill('s1', 'SQL Injection', 1);
const s2 = mkSkill('s2', 'Secrets', 2);
const RUNNER = '// big runner\n'.repeat(100);

const base = {
  agent,
  linkedSkills: [s1, s2],
  allAgents: [agent],
  allSkills: [s1, s2],
  target: 'gha' as const,
  triggers: ['opened' as const, 'synchronize' as const],
  postAs: 'github_review' as const,
  runnerContents: RUNNER,
};

describe('assembleCiFiles (AC-3, AC-4)', () => {
  it('ships manifest, one file per skill, empty memory, read-only runner, editable workflow', () => {
    const files = assembleCiFiles(base);
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/sql-injection.md',
      '.devdigest/skills/secrets.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      '.github/workflows/devdigest-review.yml',
    ]);
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual([
      '.github/workflows/devdigest-review.yml',
    ]);
    expect(files.find((f) => f.path.endsWith('memory.jsonl'))!.contents).toBe('');
  });

  it('a zero-skill agent ships 4 files', () => {
    expect(assembleCiFiles({ ...base, linkedSkills: [] })).toHaveLength(4);
  });

  it('keeps the agent slug stable across re-exports', () => {
    const a = assembleCiFiles(base)[0]!.path;
    const b = assembleCiFiles({ ...base, linkedSkills: [] })[0]!.path;
    expect(a).toBe(b);
  });

  it('uses the user-edited workflow when provided', () => {
    const files = assembleCiFiles({ ...base, workflowOverride: '# edited\n' });
    expect(files.at(-1)!.contents).toBe('# edited\n');
  });

  it('no shipped file embeds a secret value', () => {
    for (const f of assembleCiFiles(base)) expect(f.contents).not.toMatch(/sk-or-/);
  });
});

describe('redactRunner / zipFiles', () => {
  it('redacts only the runner contents and keeps its byte size', () => {
    const files = redactRunner(assembleCiFiles(base));
    const runner = files.find((f) => f.path === '.devdigest/runner/index.js')!;
    expect(runner.contents).toBe('');
    expect(runner.size_bytes).toBe(Buffer.byteLength(RUNNER));
    expect(files.find((f) => f.path.endsWith('.yaml'))!.contents).not.toBe('');
  });

  it('AC-13: zip holds exactly the shipped files with full runner bytes', () => {
    const files = assembleCiFiles(base);
    const zip = new AdmZip(Buffer.from(zipFiles(files), 'base64'));
    const entries = zip.getEntries().map((e) => e.entryName).sort();
    expect(entries).toEqual(files.map((f) => f.path).sort());
    expect(zip.readAsText('.devdigest/runner/index.js')).toBe(RUNNER);
  });
});
