import type { Container } from '@devdigest/server/platform/container.js';
import { ConventionsService } from '@devdigest/server/modules/conventions/service.js';
import type { ConventionCandidate, ConventionStatus } from '@devdigest/shared';
import { resolveRepo } from '../resolvers/repo-pr.js';
import { errorResult, guard, type ToolResult } from './types.js';

export interface GetConventionsArgs {
  repo: string;
  status?: ConventionStatus;
}

export async function getConventionsTool(
  container: Container,
  workspaceId: string,
  args: GetConventionsArgs,
): Promise<ToolResult> {
  return guard(async () => {
    const resolved = await resolveRepo(container, workspaceId, args.repo);
    if (resolved.kind !== 'ok') {
      return errorResult(
        `Repo "${resolved.fullName}" is not added to this dev-digest workspace. Add it in the studio first.`,
      );
    }

    const conventionsService = new ConventionsService(container);
    let { conventions, lastScannedAt } = await conventionsService.list(workspaceId, resolved.repo.id);

    // First call on a never-scanned repo: scan synchronously so the tool
    // returns useful output on the very first call instead of an empty list.
    // A scan failure (clone error, no LLM key configured, …) is reported as a
    // friendly tool error rather than a raw protocol-level exception.
    if (lastScannedAt === null) {
      try {
        const scanned = await conventionsService.scan(workspaceId, resolved.repo.id);
        conventions = scanned.conventions;
      } catch (err) {
        return errorResult(
          `Scanning "${resolved.repo.fullName}" for conventions failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const status = args.status ?? 'accepted';
    const filtered = conventions.filter((c) => c.status === status);

    return { text: formatConventions(filtered, status) };
  });
}

function formatConventions(conventions: ConventionCandidate[], status: ConventionStatus): string {
  if (conventions.length === 0) return `No ${status} conventions for this repo.`;
  return conventions
    .map((c) => {
      const evidence = c.evidence_path ? ` (${c.evidence_path})` : '';
      const confidence = c.confidence != null ? ` — confidence ${c.confidence.toFixed(2)}` : '';
      return `- ${c.rule}${evidence}${confidence}`;
    })
    .join('\n');
}
