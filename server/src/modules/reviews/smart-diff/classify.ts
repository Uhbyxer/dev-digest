import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFICATION_RULES } from './constants.js';

/**
 * Convert one glob pattern (as given in constants.ts) into a RegExp.
 * `**` matches across path segments (including zero), `*` matches within one
 * segment. A pattern with no `/` is basename-only (matched at any depth) —
 * this repo has no glob-matching dependency, so this is deliberately small
 * and scoped to exactly the pattern shapes the rules above use.
 */
function globToRegExp(pattern: string): RegExp {
  const norm = pattern.includes('/') ? pattern : `**/${pattern}`;
  let re = '';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i]!;
    if (c === '*') {
      if (norm[i + 1] === '*') {
        i++;
        if (norm[i + 1] === '/') {
          re += '(?:.*/)?';
          i++;
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * Classify a file path into a Smart Diff role. Pure, no I/O — importable
 * independent of any route/HTTP context so it can later be reused as a
 * pre-prompt filter (L08) without depending on this feature's route.
 * Rule order in constants.ts is the decision: the first matching pattern
 * wins.
 */
export function classifyFile(path: string): SmartDiffRole {
  for (const { role, patterns } of CLASSIFICATION_RULES) {
    if (patterns.some((p) => globToRegExp(p).test(path))) return role;
  }
  return 'core';
}
