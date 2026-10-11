import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { buildWorkflow, GHA_WORKFLOW_PATH, WORKFLOW_PATHS } from './workflow.js';

const gha = (triggers: ('opened' | 'synchronize' | 'reopened')[] = ['opened', 'synchronize'], postAs: 'github_review' | 'pr_comment' | 'none' = 'github_review') =>
  buildWorkflow({ target: 'gha', triggers, postAs });

describe('GitHub Actions workflow security properties', () => {
  it('AC-4: default path', () => {
    expect(WORKFLOW_PATHS.gha).toBe('.github/workflows/devdigest-review.yml');
    expect(GHA_WORKFLOW_PATH).toBe(WORKFLOW_PATHS.gha);
  });

  it('is valid YAML', () => {
    expect(() => parse(gha())).not.toThrow();
  });

  it('AC-15: permissions are exactly contents:read + pull-requests:write', () => {
    expect(parse(gha()).permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
  });

  it('AC-18/AC-7: triggers only on pull_request with the chosen types, never comment events', () => {
    const wf = parse(gha(['opened', 'synchronize', 'reopened']));
    expect(Object.keys(wf.on)).toEqual(['pull_request']);
    expect(wf.on.pull_request.types).toEqual(['opened', 'synchronize', 'reopened']);
    expect(parse(gha(['opened'])).on.pull_request.types).toEqual(['opened']);
    const text = gha();
    expect(text).not.toMatch(/issue_comment|pull_request_review_comment|pull_request_target|workflow_run/);
  });

  it('AC-16: the key is referenced only via secrets.OPENROUTER_API_KEY', () => {
    const text = gha();
    expect(text).toContain('${{ secrets.OPENROUTER_API_KEY }}');
    expect(text).not.toMatch(/sk-or-|sk-[A-Za-z0-9]{8,}/);
    // No other secrets besides the key and the auto-provided token.
    const secretRefs = [...text.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]);
    expect(new Set(secretRefs)).toEqual(new Set(['OPENROUTER_API_KEY', 'GITHUB_TOKEN']));
  });

  it('AC-17: the keyed job does not run for fork PRs', () => {
    const wf = parse(gha());
    expect(wf.jobs.review.if).toBe(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  it('AC-19: runs the bundled runner, no marketplace review action', () => {
    const text = gha();
    expect(text).toContain('node .devdigest/runner/index.js');
    expect(text).not.toContain('devdigest/review-action');
    const uses = [...text.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    expect(uses.every((u) => u!.startsWith('actions/'))).toBe(true);
  });

  it('uploads the devdigest-result artifact even when the gate fails the step', () => {
    const wf = parse(gha());
    const upload = wf.jobs.review.steps.find((s: { uses?: string }) => s.uses?.startsWith('actions/upload-artifact'));
    expect(upload.if).toBe('always()');
    expect(upload.with).toMatchObject({ name: 'devdigest-result', path: 'devdigest-result.json' });
  });

  it.each(['github_review', 'pr_comment', 'none'] as const)('AC-7: post_as=%s flows into DEVDIGEST_POST_AS', (postAs) => {
    const wf = parse(gha(['opened'], postAs));
    const step = wf.jobs.review.steps.find((s: { run?: string }) => s.run?.includes('runner/index.js'));
    expect(step.env.DEVDIGEST_POST_AS).toBe(postAs);
  });
});

describe('non-GHA targets (download only)', () => {
  it.each(['circle', 'jenkins', 'cli'] as const)('%s config invokes the bundled runner and embeds no secret value', (target) => {
    const text = buildWorkflow({ target, triggers: ['opened'], postAs: 'none' });
    expect(text).toContain('.devdigest/runner/index.js');
    expect(text).toContain('none');
    expect(text).not.toMatch(/sk-or-/);
  });
});

describe('Jenkinsfile target repo', () => {
  it('embeds the validated repo, with a placeholder only when none is given', () => {
    const base = { target: 'jenkins' as const, triggers: ['opened' as const], postAs: 'github_review' as const };
    expect(buildWorkflow({ ...base, repo: 'acme/widgets' })).toContain("GITHUB_REPOSITORY = 'acme/widgets'");
    expect(buildWorkflow(base)).toContain("GITHUB_REPOSITORY = 'owner/name'");
    expect(buildWorkflow({ ...base, repo: 'acme/widgets' })).not.toContain('TODO');
  });
});
