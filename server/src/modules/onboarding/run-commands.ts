/**
 * "How to run locally" — commands are read from files in the repo, never
 * generated. Pure: the caller supplies `read` (returns file text, or null when
 * the file does not exist) so this is testable without a filesystem.
 */
export type ReadRepoFile = (relPath: string) => Promise<string | null>;

const LOCKFILES: Array<[file: string, manager: string]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

/** Scripts worth surfacing, in the order a newcomer needs them. */
const RUN_SCRIPTS = ['dev', 'start'];

export async function extractRunCommands(read: ReadRepoFile): Promise<string[]> {
  const pkgText = await read('package.json');
  if (pkgText === null) return [];

  let scripts: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(pkgText) as { scripts?: Record<string, unknown> };
    scripts = parsed.scripts ?? {};
  } catch {
    return [];
  }

  let manager = 'npm';
  for (const [file, name] of LOCKFILES) {
    if ((await read(file)) !== null) {
      manager = name;
      break;
    }
  }

  const commands = [`${manager} install`];
  if ((await read('.env.example')) !== null) commands.push('cp .env.example .env');
  for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    if ((await read(f)) !== null) {
      commands.push('docker compose up -d');
      break;
    }
  }
  const script = RUN_SCRIPTS.find((s) => typeof scripts[s] === 'string');
  if (script) commands.push(manager === 'npm' ? `npm run ${script}` : `${manager} ${script}`);
  return commands;
}
