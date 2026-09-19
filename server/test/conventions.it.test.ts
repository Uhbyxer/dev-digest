/**
 * Server-integration test for the Conventions feature (issue #19): drives the
 * full backend workflow — scan, dedupe, list, accept/reject/edit, create-skill
 * — against a real Postgres (testcontainers) and asserts on DB state + API
 * responses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILE_SELECTION_FIXTURE = {
  groups: [{ theme: 'async style', files: ['src/a.ts', 'src/b.ts'], rationale: 'both use async/await' }],
};

const EXTRACTION_FIXTURE = {
  candidates: [
    {
      rule: 'Always use async/await, never .then() chains',
      evidence_path: 'src/a.ts',
      evidence_snippet: 'export async function foo() {\n  await bar();\n  return 1;\n}',
      confidence: 0.9,
    },
  ],
};

function conventionsMockLlm() {
  return new MockLLMProvider('openai', {
    structuredBySchema: {
      ConventionFileSelection: FILE_SELECTION_FIXTURE,
      ConventionExtraction: EXTRACTION_FIXTURE,
    },
  });
}

d('Conventions — scan/dedupe/list/patch/create-skill (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let clonePath: string;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    clonePath = await mkdtemp(join(tmpdir(), 'devdigest-conventions-'));
    await mkdir(join(clonePath, 'src'), { recursive: true });
    await writeFile(
      join(clonePath, 'src', 'a.ts'),
      "export async function foo() {\n  await bar();\n  return 1;\n}\n",
    );
    await writeFile(
      join(clonePath, 'src', 'b.ts'),
      "export async function baz() {\n  await qux();\n  return 2;\n}\n",
    );

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'conventions-repo',
        fullName: 'acme/conventions-repo',
        clonePath,
      })
      .returning();
    repoId = repo!.id;

    await pg.handle.db.insert(t.fileRank).values([
      { repoId, filePath: 'src/a.ts', pagerank: 0.9, hotness: 0, rank: 0.9, percentile: 99 },
      { repoId, filePath: 'src/b.ts', pagerank: 0.8, hotness: 0, rank: 0.8, percentile: 95 },
    ]);
  });

  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  function appWith(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });
  }

  it('scans, dedupes on re-scan, lists, patches, suppresses a rejected match, and merges into a Skill', async () => {
    const app = await appWith(conventionsMockLlm());

    // ---- scan #1: inserts the one surviving candidate ----
    const scan1 = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(scan1.statusCode).toBe(200);
    const scan1Body = scan1.json();
    expect(scan1Body.inserted).toBe(1);
    expect(scan1Body.conventions).toHaveLength(1);
    expect(scan1Body.conventions[0]).toMatchObject({
      rule: 'Always use async/await, never .then() chains',
      evidence_path: 'src/a.ts',
      status: 'pending',
      repo_id: repoId,
    });
    const conventionId = scan1Body.conventions[0].id;

    // ---- scan #2: same fixture — dedupe against the just-inserted pending row ----
    const scan2 = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(scan2.statusCode).toBe(200);
    expect(scan2.json().inserted).toBe(0);

    // ---- GET list ----
    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.statusCode).toBe(200);
    const listBody = list.json();
    expect(listBody.conventions).toHaveLength(1);
    expect(typeof listBody.last_scanned_at).toBe('string');
    expect(Number.isNaN(Date.parse(listBody.last_scanned_at))).toBe(false);

    // ---- PATCH status → accepted ----
    const accept = await app.inject({
      method: 'PATCH',
      url: `/conventions/${conventionId}`,
      payload: { status: 'accepted' },
    });
    expect(accept.statusCode).toBe(200);
    const accepted = accept.json();
    expect(accepted.status).toBe('accepted');
    expect(accepted.rule).toBe('Always use async/await, never .then() chains');

    // ---- PATCH rule on the accepted row: rule changes, status stays accepted ----
    const editRule = await app.inject({
      method: 'PATCH',
      url: `/conventions/${conventionId}`,
      payload: { rule: 'edited text' },
    });
    expect(editRule.statusCode).toBe(200);
    const edited = editRule.json();
    expect(edited.rule).toBe('edited text');
    expect(edited.status).toBe('accepted');

    // ---- A rejected row (matching a would-be re-scan candidate) suppresses resurfacing ----
    const [rejectedRow] = await pg.handle.db
      .insert(t.conventions)
      .values({
        workspaceId,
        repoId,
        rule: 'Reject me: no semicolons at line ends',
        evidencePath: 'src/b.ts',
        evidenceSnippet: 'const x = 1',
        confidence: 0.5,
        status: 'rejected',
      })
      .returning();
    expect(rejectedRow).toBeDefined();

    const rejectFixtureLlm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionFileSelection: {
          groups: [{ theme: 'style', files: ['src/b.ts'], rationale: 'no trailing semicolons' }],
        },
        ConventionExtraction: {
          candidates: [
            {
              rule: 'Reject me: no semicolons at line ends',
              evidence_path: 'src/b.ts',
              evidence_snippet: 'await qux();',
              confidence: 0.5,
            },
          ],
        },
      },
    });
    const appReject = await appWith(rejectFixtureLlm);
    const rescanAfterReject = await appReject.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/scan`,
    });
    expect(rescanAfterReject.statusCode).toBe(200);
    expect(rescanAfterReject.json().inserted).toBe(0);
    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.rule, 'Reject me: no semicolons at line ends'));
    expect(rows).toHaveLength(1);
    await appReject.close();

    // ---- create-skill with zero accepted conventions on a fresh repo → 422 ----
    const [emptyRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'empty-repo', fullName: 'acme/empty-repo' })
      .returning();
    const emptyCreateSkill = await app.inject({
      method: 'POST',
      url: `/repos/${emptyRepo!.id}/conventions/create-skill`,
      payload: { name: 'x', description: 'y', body: 'z' },
    });
    expect(emptyCreateSkill.statusCode).toBe(422);

    // ---- create-skill with the accepted convention present → 201, verbatim fields ----
    const createSkill = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/create-skill`,
      payload: {
        name: 'Conventions Repo Style',
        description: 'House conventions',
        body: 'See src/a.ts for the async/await convention.',
      },
    });
    expect(createSkill.statusCode).toBe(201);
    const skill = createSkill.json();
    expect(skill).toMatchObject({
      name: 'Conventions Repo Style',
      description: 'House conventions',
      type: 'convention',
      source: 'extracted',
      body: 'See src/a.ts for the async/await convention.',
    });

    const getSkill = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(getSkill.statusCode).toBe(200);
    expect(getSkill.json().id).toBe(skill.id);

    await app.close();
  });
});
