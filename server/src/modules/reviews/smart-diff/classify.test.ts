/**
 * `classifyFile` — table-driven "path → role" coverage of the pattern table
 * from issue #26/#27, including the three disputed cases named there.
 */
import { describe, it, expect } from 'vitest';
import { classifyFile } from './classify.js';

describe('classifyFile — boilerplate', () => {
  const cases: string[] = [
    'yarn.lock',
    'pnpm-lock.yaml',
    'package-lock.json',
    'client/app.lock',
    'dist/index.js',
    'dist/nested/chunk.js',
    'build/main.js',
    'src/__snapshots__/Component.test.tsx.snap',
    'foo.snap',
    'src/config.generated.ts',
    'vendor.min.js',
  ];
  for (const path of cases) {
    it(`"${path}" → boilerplate`, () => {
      expect(classifyFile(path)).toBe('boilerplate');
    });
  }
});

describe('classifyFile — tests', () => {
  const cases: string[] = [
    'src/foo.test.ts',
    'src/Foo.test.tsx',
    'server/service.it.test.ts',
    'client/foo.spec.ts',
    'test/helpers.ts',
    'src/tests/fixture.ts',
    'src/__tests__/Component.tsx',
    'e2e/flows/login.ts',
  ];
  for (const path of cases) {
    it(`"${path}" → tests`, () => {
      expect(classifyFile(path)).toBe('tests');
    });
  }
});

describe('classifyFile — wiring', () => {
  const cases: string[] = [
    'src/index.ts',
    'client/src/components/index.js',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.build.json',
    '.eslintrc.js',
    '.env.local',
    'docker-compose.yml',
    'docker-compose.override.yml',
    '.github/workflows/ci.yml',
  ];
  for (const path of cases) {
    it(`"${path}" → wiring`, () => {
      expect(classifyFile(path)).toBe('wiring');
    });
  }
});

describe('classifyFile — docs', () => {
  const cases: string[] = [
    'README.md',
    'docs/architecture.md',
    'CHANGELOG.md',
    'LICENSE',
    'server/src/modules/repo-intel/README.md',
  ];
  for (const path of cases) {
    it(`"${path}" → docs`, () => {
      expect(classifyFile(path)).toBe('docs');
    });
  }
});

describe('classifyFile — core (catch-all)', () => {
  const cases: string[] = [
    'server/src/modules/reviews/service.ts',
    'client/src/app/page.tsx',
    'reviewer-core/src/intent/confidence.ts',
  ];
  for (const path of cases) {
    it(`"${path}" → core`, () => {
      expect(classifyFile(path)).toBe('core');
    });
  }
});

describe('classifyFile — disputed cases (priority order is the decision)', () => {
  it('a .snap file inside __tests__/ lands in boilerplate (snapshot rule outranks the tests rule)', () => {
    expect(classifyFile('src/components/__tests__/__snapshots__/Foo.test.tsx.snap')).toBe('boilerplate');
  });

  it('.claude/**/SKILL.md lands in wiring, not docs (agent-behavior markdown outranks the generic docs rule)', () => {
    expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
  });

  it('e2e/README.md lands in tests, not docs (the e2e/** rule outranks the generic docs rule)', () => {
    expect(classifyFile('e2e/README.md')).toBe('tests');
  });
});
