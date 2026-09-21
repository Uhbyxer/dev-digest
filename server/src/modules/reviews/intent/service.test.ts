/**
 * `generateIntent` — the intent-generation orchestrator (decision #5/#6,
 * docs/plans/intent-layer.md). Modeled on ConventionsService.detectAndInsert:
 * all I/O lives here, prompt construction stays in reviewer-core. These are
 * unit tests — `container.llm`, `container.github`, `container.linkedDocFetcher`,
 * and `container.db` are all mocked/faked; no real network or Postgres.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import type { PullRow } from '../../../db/rows.js';
import * as t from '../../../db/schema.js';
import { MockLLMProvider, MockGitHubClient, MockLinkedDocFetcher } from '../../../adapters/mocks.js';
import { generateIntent } from './service.js';

// ---- fake db: only the shapes generateIntent's collaborators touch --------
// (resolveFeatureModel → t.settings, getCommitMessages → t.prCommits,
// upsertIntent → t.prIntent) — table identity decides which fixture a given
// select/insert call resolves to, mirroring drizzle's real chain shape
// (.select().from().where() / .insert().values().onConflictDoUpdate()).
function fakeDb(opts: { settingsRows?: unknown[]; commitRows?: { message: string }[] } = {}) {
  const upserts: unknown[] = [];
  const db = {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              if (table === t.settings) return Promise.resolve(opts.settingsRows ?? []);
              if (table === t.prCommits) return Promise.resolve(opts.commitRows ?? []);
              return Promise.resolve([]);
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(vals: unknown) {
          return {
            onConflictDoUpdate() {
              if (table === t.prIntent) upserts.push(vals);
              return Promise.resolve();
            },
          };
        },
      };
    },
  };
  return { db, upserts };
}

function makePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 42,
    title: 'Add rate limiting to public API endpoints',
    author: 'marisa.koch',
    branch: 'feat/rate-limit',
    base: 'main',
    headSha: 'a1b2c3d4',
    lastReviewedSha: null,
    additions: 10,
    deletions: 2,
    filesCount: 1,
    status: 'open',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

const repo = { id: 'repo-1', workspaceId: 'ws-1', owner: 'acme', name: 'widgets' } as typeof t.repos.$inferSelect;

const diff: UnifiedDiff = {
  raw: 'diff --git a/src/config.ts b/src/config.ts',
  files: [{ path: 'src/config.ts', additions: 4, deletions: 0, hunks: [] }],
};

const INTENT_FIXTURE = {
  intent: 'Adds rate limiting to public API endpoints.',
  in_scope: ['Add limiter middleware'],
  out_of_scope: ['Per-user rate tiers'],
};

function makeContainer(opts: {
  llm?: MockLLMProvider;
  github?: () => Promise<MockGitHubClient>;
  linkedDocFetcher?: MockLinkedDocFetcher;
  dbOpts?: Parameters<typeof fakeDb>[0];
}) {
  const { db, upserts } = fakeDb(opts.dbOpts);
  const llm = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { IntentGeneration: INTENT_FIXTURE } });
  const github = opts.github ?? (() => Promise.reject(new Error('ConfigError: no GitHub token configured')));
  const container = {
    db,
    llm: vi.fn().mockResolvedValue(llm),
    github: vi.fn(github),
    linkedDocFetcher: vi.fn().mockReturnValue(opts.linkedDocFetcher ?? new MockLinkedDocFetcher(undefined)),
  } as unknown as Container;
  return { container, llm, upserts };
}

describe('generateIntent — happy path', () => {
  it('resolves the feature model, generates intent from a substantive description, and persists it', async () => {
    const { container, llm, upserts } = makeContainer({});
    const pull = makePull({ body: 'This PR adds a token-bucket rate limiter to every public endpoint.' });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.intent).toBe(INTENT_FIXTURE.intent);
    expect(intent.in_scope).toEqual(INTENT_FIXTURE.in_scope);
    expect(intent.out_of_scope).toEqual(INTENT_FIXTURE.out_of_scope);
    expect(intent.confidence).toBe('stated');
    expect(intent.sources).toContain('description');
    expect(container.llm).toHaveBeenCalled();

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls.some((c) => (c.req as { schemaName: string }).schemaName === 'IntentGeneration')).toBe(
      true,
    );

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ prId: 'pr-1', confidence: 'stated' });
  });

  it('runs the quarantine extraction call before the main intent call when a linked spec is fetched', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        QuarantineExtraction: { summary: 'A plan doc.', key_requirements: ['Must support X'] },
        IntentGeneration: INTENT_FIXTURE,
      },
    });
    const linkedDocFetcher = new MockLinkedDocFetcher('# The Plan\n\nMust support X.');
    const { container } = makeContainer({ llm, linkedDocFetcher });
    const pull = makePull({
      body: 'Implements the plan at https://example.com/plan.md end to end.',
    });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.sources).toContain('linked_spec');
    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls.map((c) => (c.req as { schemaName: string }).schemaName)).toEqual([
      'QuarantineExtraction',
      'IntentGeneration',
    ]);
    // The raw fetched text must never reach the main intent prompt — only the
    // quarantined { summary, key_requirements } structured result does.
    const intentCall = structuredCalls[1]!.req as { messages: { content: string }[] };
    const intentPromptText = intentCall.messages.map((m) => m.content).join('\n');
    expect(intentPromptText).toContain('A plan doc.');
    expect(intentPromptText).toContain('Must support X');
  });
});

describe('generateIntent — low-confidence / inferred path', () => {
  it('marks the result "inferred" when the description is thin', async () => {
    const { container } = makeContainer({});
    const pull = makePull({ body: 'fix bug' });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.confidence).toBe('inferred');
  });

  it('marks the result "inferred" when there is no description at all', async () => {
    const { container } = makeContainer({});
    const pull = makePull({ body: null });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.confidence).toBe('inferred');
    expect(intent.sources).not.toContain('description');
  });
});

describe('generateIntent — linked_ticket signal', () => {
  it('resolves a same-repo issue reference via container.github().getIssue and includes it in sources', async () => {
    const ghInstance = new MockGitHubClient({});
    const getIssueSpy = vi.spyOn(ghInstance, 'getIssue');
    const { container } = makeContainer({ github: () => Promise.resolve(ghInstance) });
    const pull = makePull({ body: 'Closes #471. This resolves the ticket described there.' });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(getIssueSpy).toHaveBeenCalledWith({ owner: 'acme', name: 'widgets' }, 471);
    expect(intent.sources).toContain('linked_ticket');
  });
});

describe('generateIntent — linked_ticket failure path (non-blocking)', () => {
  it('swallows a container.github() failure (e.g. ConfigError, no token) and still succeeds without that signal', async () => {
    const { container } = makeContainer({
      github: () => Promise.reject(new Error('ConfigError: no GitHub token configured')),
    });
    const pull = makePull({ body: 'Closes #471. This resolves the ticket described there.' });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.sources).not.toContain('linked_ticket');
    expect(intent.intent).toBe(INTENT_FIXTURE.intent);
  });
});

describe('generateIntent — commit messages via the repository layer', () => {
  it('includes "commit_messages" in sources when the repo returns commit rows', async () => {
    const { container } = makeContainer({ dbOpts: { commitRows: [{ message: 'Add limiter' }] } });
    const pull = makePull({ body: 'This PR adds a token-bucket rate limiter to every public endpoint.' });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.sources).toContain('commit_messages');
  });

  it('omits "commit_messages" when the repository layer returns no rows', async () => {
    const { container } = makeContainer({ dbOpts: { commitRows: [] } });
    const pull = makePull({ body: 'This PR adds a token-bucket rate limiter to every public endpoint.' });

    const intent = await generateIntent(container, 'ws-1', pull, repo, diff);

    expect(intent.sources).not.toContain('commit_messages');
  });
});

describe('generateIntent — architecture guard: no raw drizzle/container.db calls in the service', () => {
  it('service.ts does not import drizzle-orm or call container.db.select/insert/update directly (queries stay in pull.repo.ts)', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(path.join(here, 'service.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"]drizzle-orm['"]/);
    // `container.db` is fine to pass THROUGH to a repository function
    // (e.g. `getCommitMessages(container.db, ...)`); it must never be the
    // receiver of a query-builder call itself.
    expect(source).not.toMatch(/container\.db\.(select|insert|update|delete)\(/);
  });
});
