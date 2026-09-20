/**
 * T13 — server-integration tests for the Skills feature (real Postgres via
 * testcontainers, `buildApp()`): CRUD, agent linking (+ transactional
 * atomicity), import preview/confirm, and the control-experiment centerpiece
 * (spec issue #4, user stories #26-28).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { ContentAwareFakeLLMProvider } from '../src/adapters/content-aware-llm.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const TEST_QUALITY_SKILL_SNIPPET = 'missing corner-case coverage finding';
const API_CONTRACT_SKILL_SNIPPET = "breaking-change finding even when the PR description doesn't mention it.";

const APPROVE_REVIEW: Review = {
  verdict: 'approve',
  summary: 'Nothing to report.',
  score: 100,
  findings: [],
};

const CORNER_CASE_REVIEW: Review = {
  verdict: 'comment',
  summary: 'The diff only tests the happy path.',
  score: 80,
  findings: [
    {
      id: 'f-corner-case',
      severity: 'WARNING',
      category: 'bug',
      title: 'Missing corner-case coverage for the new error branch',
      file: 'src/thing.ts',
      start_line: 2,
      end_line: 2,
      rationale: 'The new error branch has no corresponding test.',
      suggestion: 'Add a test for the error branch.',
      confidence: 0.8,
      kind: 'finding',
    },
  ],
};

const BREAKING_CHANGE_REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'The route signature changed without updating callers.',
  score: 50,
  findings: [
    {
      id: 'f-breaking-change',
      severity: 'CRITICAL',
      category: 'bug',
      title: 'Breaking change to route signature',
      file: 'src/routes.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'The endpoint response shape changed.',
      suggestion: 'Version the endpoint or update all callers.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, diffPatch: string) {
  const name = `skills-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Skills control experiment PR',
      author: 'test',
      branch: 'feat/x',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: '',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/thing.ts',
    additions: 1,
    deletions: 0,
    patch: diffPatch,
  });
  return { repo: repo!, pr: pr! };
}

d('T13 — skills CRUD, linking, import, and control experiment (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: ContentAwareFakeLLMProvider, diff?: string) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(diff ? { diff } : {}),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });
  }

  // ---- CRUD -----------------------------------------------------------

  it('Skills CRUD round-trips through the Skill DTO shape, workspace-scoped', async () => {
    const app = await appWith(new ContentAwareFakeLLMProvider([], APPROVE_REVIEW));

    const created = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'CRUD Skill', description: 'A skill for CRUD testing.', type: 'custom', body: 'Body v1.' },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({
      name: 'CRUD Skill',
      type: 'custom',
      source: 'manual',
      body: 'Body v1.',
      enabled: true,
      version: 1,
    });

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);

    // A body edit bumps the version; editing only `enabled` does not (T1).
    const bodyUpdated = (
      await app.inject({ method: 'PATCH', url: `/skills/${skill.id}`, payload: { body: 'Body v2.' } })
    ).json();
    expect(bodyUpdated.version).toBe(2);

    const enabledToggled = (
      await app.inject({ method: 'PATCH', url: `/skills/${skill.id}`, payload: { enabled: false } })
    ).json();
    expect(enabledToggled.version).toBe(2);
    expect(enabledToggled.enabled).toBe(false);

    const deleted = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(deleted.statusCode).toBe(200);
    const afterDelete = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(afterDelete.statusCode).toBe(404);

    // Workspace-scoped 404: an unknown id in this workspace is a clean 404.
    const notFound = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-0000-0000-000000000000',
    });
    expect(notFound.statusCode).toBe(404);

    await app.close();
  });

  // ---- Agent linking + transactional atomicity (T3) --------------------

  it('setSkills sets/reorders links, and an injected FK failure leaves the original set intact', async () => {
    const app = await appWith(new ContentAwareFakeLLMProvider([], APPROVE_REVIEW));

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Link Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();

    const skillA = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'Link Skill A', description: 'd', type: 'custom', body: 'A' },
      })
    ).json();
    const skillB = (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'Link Skill B', description: 'd', type: 'custom', body: 'B' },
      })
    ).json();

    const setRes = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skillA.id, skillB.id] },
    });
    expect(setRes.statusCode).toBe(200);
    const links = setRes.json();
    expect(links).toEqual([
      { agent_id: agent.id, skill_id: skillA.id, order: 0 },
      { agent_id: agent.id, skill_id: skillB.id, order: 1 },
    ]);

    // Reorder: swap the two.
    const reordered = (
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [skillB.id, skillA.id] },
      })
    ).json();
    expect(reordered.map((l: { skill_id: string }) => l.skill_id)).toEqual([skillB.id, skillA.id]);

    // Inject a failure: a nonexistent skillId FK-violates on insert, mid-transaction.
    const badSet = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skillA.id, '00000000-0000-0000-0000-000000000000'] },
    });
    expect(badSet.statusCode).toBeGreaterThanOrEqual(500);

    // Atomicity (T3): the ORIGINAL link set survives, not an empty one.
    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(after.map((l: { skill_id: string }) => l.skill_id).sort()).toEqual(
      [skillA.id, skillB.id].sort(),
    );

    await app.close();
  });

  // ---- Import preview + confirm (T6) -----------------------------------

  it('preview persists nothing; confirm persists exactly one Skill with the right source', async () => {
    const app = await appWith(new ContentAwareFakeLLMProvider([], APPROVE_REVIEW));

    const md = `---\nname: imported-skill\ndescription: An imported skill.\n---\n\nImported body text.`;
    const form = new FormData();
    form.set('file', new Blob([md], { type: 'text/markdown' }), 'imported-skill.md');

    const before = (await app.inject({ method: 'GET', url: '/skills' })).json();

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: form,
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody).toMatchObject({
      name: 'imported-skill',
      description: 'An imported skill.',
      type: 'custom',
      source: 'imported_url',
    });

    // Nothing written to the DB by preview alone.
    const afterPreview = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(afterPreview).toHaveLength(before.length);

    const confirm = await app.inject({
      method: 'POST',
      url: '/skills/import/confirm',
      payload: previewBody,
    });
    expect(confirm.statusCode).toBe(201);
    const confirmed = confirm.json();
    expect(confirmed.source).toBe('imported_url');

    const afterConfirm = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(afterConfirm).toHaveLength(before.length + 1);
    expect(afterConfirm.some((s: { id: string }) => s.id === confirmed.id)).toBe(true);

    await app.close();
  });

  // ---- Control experiment (centerpiece: user stories #26-28) -----------

  describe('control experiment', () => {
    it('Scenario A (Test Quality skill): the corner-case finding appears only when the skill is enabled', async () => {
      const llm = new ContentAwareFakeLLMProvider(
        [{ contains: TEST_QUALITY_SKILL_SNIPPET, review: CORNER_CASE_REVIEW }],
        APPROVE_REVIEW,
      );
      const diff = `diff --git a/src/thing.ts b/src/thing.ts\n--- a/src/thing.ts\n+++ b/src/thing.ts\n@@ -1,3 +1,5 @@\n function thing() {\n+  if (bad) throw new Error('bad');\n   return 1;\n }`;
      const app = await appWith(llm, diff);
      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, diff);

      const [skillRow] = await pg.handle.db
        .select()
        .from(t.skills)
        .where(eq(t.skills.name, 'Test Quality Checklist'));
      expect(skillRow).toBeDefined();

      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'TQ Control Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
        })
      ).json();
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [skillRow!.id] },
      });

      // Run 1 — skill enabled (globally + linked).
      const runEnabled = (
        await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
      ).json();
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      const enabledReview = (
        await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
      ).json()[0];
      expect(enabledReview.findings).toHaveLength(1);
      expect(enabledReview.findings[0].title).toContain('Missing corner-case coverage');

      const enabledTrace = (
        await app.inject({ method: 'GET', url: `/runs/${runEnabled.runs[0].run_id}/trace` })
      ).json();
      expect(enabledTrace.prompt_assembly.skills).toBeTruthy();
      expect(enabledTrace.prompt_assembly.skills).toContain(TEST_QUALITY_SKILL_SNIPPET);

      // Disable the skill globally, then run again on a fresh PR (same repo).
      await app.inject({ method: 'PATCH', url: `/skills/${skillRow!.id}`, payload: { enabled: false } });
      try {
        const { pr: pr2 } = await setupRepoAndPr(pg.handle.db, workspaceId, diff);
        const runDisabled = (
          await app.inject({ method: 'POST', url: `/pulls/${pr2.id}/review`, payload: { agentId: agent.id } })
        ).json();
        await waitForPrRuns(pg.handle.db, pr2.id, { expected: 1 });
        const disabledReview = (
          await app.inject({ method: 'GET', url: `/pulls/${pr2.id}/reviews` })
        ).json()[0];
        expect(disabledReview.findings).toHaveLength(0);

        const disabledTrace = (
          await app.inject({ method: 'GET', url: `/runs/${runDisabled.runs[0].run_id}/trace` })
        ).json();
        expect(disabledTrace.prompt_assembly.skills ?? null).toBeNull();
      } finally {
        // Restore seed state for any test running after this one.
        await app.inject({ method: 'PATCH', url: `/skills/${skillRow!.id}`, payload: { enabled: true } });
      }

      await app.close();
    });

    it('Scenario B (API-contract skill): the breaking-change finding appears only when the skill is enabled', async () => {
      const llm = new ContentAwareFakeLLMProvider(
        [{ contains: API_CONTRACT_SKILL_SNIPPET, review: BREAKING_CHANGE_REVIEW }],
        APPROVE_REVIEW,
      );
      const diff = `diff --git a/src/routes.ts b/src/routes.ts\n--- a/src/routes.ts\n+++ b/src/routes.ts\n@@ -1,3 +1,3 @@\n-app.get('/users/:id', handler);\n+app.get('/users/:id', (req, res) => handler(req, res, extraArg));`;
      const app = await appWith(llm, diff);
      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, diff);

      const [skillRow] = await pg.handle.db
        .select()
        .from(t.skills)
        .where(eq(t.skills.name, 'API Contract Stability'));
      expect(skillRow).toBeDefined();
      expect(skillRow!.source).toBe('imported_url');

      const agent = (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: { name: 'API Control Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
        })
      ).json();
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [skillRow!.id] },
      });

      const runEnabled = (
        await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
      ).json();
      await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
      const enabledReview = (
        await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
      ).json()[0];
      expect(enabledReview.findings).toHaveLength(1);
      expect(enabledReview.findings[0].title).toContain('Breaking change');

      const enabledTrace = (
        await app.inject({ method: 'GET', url: `/runs/${runEnabled.runs[0].run_id}/trace` })
      ).json();
      // An 'imported_url'-source skill is untrusted-but-directive (ADR-0001):
      // its body is delimiter-wrapped in the trace, not verbatim-unwrapped.
      expect(enabledTrace.prompt_assembly.skills).toContain('<untrusted source="skill:imported_url">');
      expect(enabledTrace.prompt_assembly.skills).toContain(API_CONTRACT_SKILL_SNIPPET);

      await app.inject({ method: 'PATCH', url: `/skills/${skillRow!.id}`, payload: { enabled: false } });
      try {
        const { pr: pr2 } = await setupRepoAndPr(pg.handle.db, workspaceId, diff);
        const runDisabled = (
          await app.inject({ method: 'POST', url: `/pulls/${pr2.id}/review`, payload: { agentId: agent.id } })
        ).json();
        await waitForPrRuns(pg.handle.db, pr2.id, { expected: 1 });
        const disabledReview = (
          await app.inject({ method: 'GET', url: `/pulls/${pr2.id}/reviews` })
        ).json()[0];
        expect(disabledReview.findings).toHaveLength(0);

        const disabledTrace = (
          await app.inject({ method: 'GET', url: `/runs/${runDisabled.runs[0].run_id}/trace` })
        ).json();
        expect(disabledTrace.prompt_assembly.skills ?? null).toBeNull();
      } finally {
        await app.inject({ method: 'PATCH', url: `/skills/${skillRow!.id}`, payload: { enabled: true } });
      }

      await app.close();
    });
  });
});
