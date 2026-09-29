import { readFile, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

/** Skip anything bigger than this — a repo file worth sending is far smaller. */
const MAX_BYTES = 1_000_000;

/**
 * Read one file from a repo clone, staying inside it. The clone is untrusted:
 * a hostile repo can commit `README.md` as a symlink to a host file, and
 * following it would ship that file to the LLM provider. So the real path of
 * the target must resolve under the real path of the clone root, and be a
 * regular file. Anything else (missing, outside, directory, too big) → null.
 */
export async function readCloneFile(clonePath: string, rel: string): Promise<string | null> {
  try {
    const root = await realpath(clonePath);
    const target = await realpath(join(root, rel));
    if (target !== root && !target.startsWith(root + sep)) return null;
    const info = await stat(target);
    if (!info.isFile() || info.size > MAX_BYTES) return null;
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}
