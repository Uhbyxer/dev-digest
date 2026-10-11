import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { RunnerBundleProvider } from '@devdigest/shared';

/** `agent-runner/dist/index.js` relative to this file (server/src/adapters/runner-bundle). */
const DEFAULT_RUNNER_PATH = fileURLToPath(
  new URL('../../../../agent-runner/dist/index.js', import.meta.url),
);

/**
 * Reads the committed, ncc-built agent-runner from disk (plan: the committed
 * dist IS the artifact; nothing is rebuilt at export time). Read per call so a
 * rebuilt dist is picked up without restarting the server.
 */
export class FsRunnerBundleProvider implements RunnerBundleProvider {
  constructor(private readonly path: string = DEFAULT_RUNNER_PATH) {}

  async read(): Promise<string> {
    return readFile(this.path, 'utf8');
  }
}
