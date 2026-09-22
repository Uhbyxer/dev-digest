import type { SmartDiffRole } from '@devdigest/shared';

export interface RolePatternRule {
  role: SmartDiffRole;
  patterns: string[];
}

/**
 * Classification rules, checked in THIS exact order — the first matching
 * pattern wins. The order is itself the decision (see the three disputed
 * cases in classify.test.ts): boilerplate is checked before tests (a `.snap`
 * inside `__tests__/` lands in boilerplate), and wiring is checked before
 * docs (`.claude/**\/SKILL.md` lands in wiring, since that markdown drives
 * agent behavior rather than documenting for humans).
 */
export const CLASSIFICATION_RULES: RolePatternRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      '*.lock',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'dist/**',
      'build/**',
      '**/__snapshots__/**',
      '*.snap',
      '*.generated.*',
      '*.min.js',
    ],
  },
  {
    role: 'tests',
    patterns: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      'e2e/**',
    ],
  },
  {
    role: 'wiring',
    patterns: [
      'index.ts',
      'index.js',
      '*.config.*',
      'tsconfig*.json',
      '.eslintrc*',
      '.env*',
      'docker-compose*.yml',
      '.github/**',
      '.claude/**',
    ],
  },
  {
    role: 'docs',
    patterns: ['**/*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
  },
];

/** Fixed order Smart Diff groups render in — core first, boilerplate last.
 *  `core` has no rule set above (it's the catch-all for anything unmatched). */
export const DISPLAY_ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];
