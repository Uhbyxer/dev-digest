import { execSync } from 'node:child_process';

export function changedFiles(cwd: string, base: string, head: string): string[] {
  const out = execSync(`git diff --name-only ${base}...${head}`, { cwd, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}
