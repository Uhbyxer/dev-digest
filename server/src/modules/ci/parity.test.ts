import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LLMProvider, Review, StructuredResult } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
// Cross-package on purpose: AC-36 needs the REAL runner entry point consuming the REAL export output.
import { runCi } from '../../../../agent-runner/src/run.js';
import { parseUnifiedDiff } from '../../../../agent-runner/src/diff.js';
import { assembleCiFiles } from './files.js';
import type { AgentRow, SkillRow } from '../../db/rows.js';

/**
 * AC-36 parity: a diff reviewed locally and the same diff reviewed in CI (from the
 * files the studio EXPORTS) produce the same grounded findings for the same model output.
 * Local path = `reviewPullRequest` as the studio executor calls it, fed from the DB-row
 * shape; CI path = `runCi` reading the exported `.devdigest/` files from disk.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 host: 'localhost',
+apiKey: 'sk_live_abcdef123456',
 port: 3000,
 timeout: 30,
`;

const finding = (id: string, severity: 'CRITICAL' | 'WARNING', line: number) => ({
  id,
  severity,
  category: 'security' as const,
  title: `finding ${id}`,
  file: 'src/config.ts',
  start_line: line,
  end_line: line,
  rationale: 'because',
  confidence: 0.9,
  kind: 'finding' as const,
});

// One grounded finding, one hallucinated (line 999 outside every hunk) the gate must drop.
const MODEL_OUTPUT: Review = {
  verdict: 'approve',
  summary: 's',
  score: 90,
  findings: [finding('g1', 'CRITICAL', 10), finding('h1', 'WARNING', 999)],
};

function stubLlm(review: Review): LLMProvider {
  return {
    id: 'openrouter',
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('unused');
    },
    async completeStructured<T>(): Promise<StructuredResult<T>> {
      return {
        data: review as unknown as T,
        model: 'm/x',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.001,
        raw: '{}',
        attempts: 1,
      };
    },
    async embed() {
      return [];
    },
  };
}

const agent = {
  id: 'a1',
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'm/x',
  systemPrompt: 'Review for security: "quotes", colons: ok.\nSecond line.',
  strategy: 'single-pass',
  ciFailOn: 'warning',
  createdAt: new Date(2026, 0, 1),
} as unknown as AgentRow;
const skill = { id: 's1', name: 'Secrets', body: 'Never commit secrets.', createdAt: new Date(2026, 0, 1) } as unknown as SkillRow;

describe('AC-36: local run findings == CI run findings (exported files -> runner)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-parity-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('the runner consuming the studio export yields the same grounded findings as a direct local run', async () => {
    // Write the exported manifest + skill files exactly as shipped to the repo.
    const files = assembleCiFiles({
      agent,
      linkedSkills: [skill],
      allAgents: [agent],
      allSkills: [skill],
      target: 'gha',
      triggers: ['opened'],
      postAs: 'none',
      runnerContents: '// runner',
    });
    for (const f of files.filter((f) => f.path.startsWith('.devdigest/agents/') || f.path.startsWith('.devdigest/skills/'))) {
      const abs = path.join(dir, f.path.replace(/^\.devdigest\//, ''));
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.contents);
    }
    const eventPath = path.join(dir, 'event.json');
    writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7, title: 'T', body: 'B', head: { repo: { fork: false } } } }));
    const resultPath = path.join(dir, 'result.json');

    const ci = await runCi({
      devdigestDir: dir,
      env: { GITHUB_REPOSITORY: 'acme/widgets', GITHUB_EVENT_PATH: eventPath },
      llm: stubLlm(MODEL_OUTPUT),
      postAs: 'none',
      resultPath,
      fetchDiff: async () => DIFF,
    });
    expect(ci.error).toBeUndefined();

    const local = await reviewPullRequest({
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      diff: parseUnifiedDiff(DIFF),
      llm: stubLlm(MODEL_OUTPUT),
      strategy: 'single-pass',
      skills: [{ body: skill.body, source: 'manual' }],
      prDescription: 'B',
      task: 'Review PR #7: T',
    });

    // Grounding dropped the hallucinated one in both paths.
    expect(local.review.findings.map((f) => f.id)).toEqual(['g1']);
    // The CI artifact (counts derived from the same grounded findings) matches the local findings.
    const artifact = JSON.parse(readFileSync(resultPath, 'utf8'));
    expect(artifact.findings_count).toBe(local.review.findings.length);
    expect(artifact.critical).toBe(local.review.findings.filter((f) => f.severity === 'CRITICAL').length);
    expect(artifact.warning).toBe(0);
    // The exported manifest carried ci_fail_on=warning (and the multiline prompt) through to the runner.
    expect(ci.blockers).toBe(1);
  });
});
