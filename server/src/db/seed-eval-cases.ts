/**
 * Seed Eval cases for the General Reviewer (Eval Pipeline). Each case is a
 * small added-lines diff of one file from the seeded PR #482 plus one
 * expectation: `must_find` (a real issue) or `must_not_flag` (noise a reviewer
 * dismissed). Fixtures are self-contained — they don't read `pr_files`.
 */
import type { EvalExpectation } from '@devdigest/shared';

export interface SeedEvalCase {
  expectation: EvalExpectation;
  /** Added lines, first one lands on `expectation.start_line`. */
  lines: string[];
}

/** A unified diff that adds `lines` to `file`, the first on line `start`. */
export function addedLinesDiff(file: string, start: number, lines: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start - 1},0 +${start},${lines.length} @@`,
    ...lines.map((l) => `+${l}`),
  ].join('\n');
}

const exp = (
  type: EvalExpectation['type'],
  file: string,
  start_line: number,
  end_line: number,
  title: string,
): EvalExpectation => ({ type, file, start_line, end_line, title });

export const SEED_EVAL_CASES: SeedEvalCase[] = [
  {
    expectation: exp('must_find', 'src/config.ts', 12, 12, 'Hardcoded Stripe secret key'),
    // Split so secret scanners don't flag this deliberately fake key in the source.
    lines: [`  stripeSecretKey: '${'sk_' + 'live_'}51H8xExampleExampleExample',`],
  },
  {
    expectation: exp('must_find', 'src/api/users.ts', 45, 47, 'N+1 query in user list endpoint'),
    lines: [
      'for (const user of users) {',
      '  user.orders = await db.query.orders.findMany({ where: eq(orders.userId, user.id) });',
      '}',
    ],
  },
  {
    expectation: exp('must_find', 'src/api/public/webhooks.ts', 20, 21, 'Webhook payload used without signature check'),
    lines: [
      'const event = JSON.parse(req.body as string);',
      'await handleStripeEvent(event);',
    ],
  },
  {
    expectation: exp('must_find', 'src/middleware/ratelimit.ts', 30, 30, 'Token bucket refill never caps at capacity'),
    lines: ['bucket.tokens = bucket.tokens + elapsedSeconds * refillPerSecond;'],
  },
  {
    expectation: exp('must_not_flag', 'src/config.ts', 3, 3, 'Import ordering'),
    lines: ["import { z } from 'zod';"],
  },
  {
    expectation: exp('must_not_flag', 'src/api/users.ts', 10, 10, 'Variable rename'),
    lines: ['const activeUsers = users.filter((u) => u.active);'],
  },
  {
    expectation: exp('must_not_flag', 'src/middleware/ratelimit.ts', 5, 5, 'Added explanatory comment'),
    lines: ['// One bucket per client IP; buckets live in memory only.'],
  },
  {
    expectation: exp('must_not_flag', 'src/api/public/webhooks.ts', 5, 5, 'Template literal in log line'),
    lines: ['logger.info(`webhook received: ${req.id}`);'],
  },
];
