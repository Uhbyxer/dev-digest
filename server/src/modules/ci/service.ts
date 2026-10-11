import type {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiReadiness,
  CiRunRow,
  CiFile,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { AgentRow } from '../../db/rows.js';
import { CiRepository, type InstallationRow, type CiRunDbRow } from './repository.js';
import { assembleCiFiles, MEMORY_PATH, redactRunner, zipFiles } from './files.js';
import { WORKFLOW_VERSION } from './workflow.js';
import { verdictOf } from './verdict.js';

export const CI_BRANCH = 'devdigest/ci';
export const CI_PR_TITLE = 'Add DevDigest CI review';

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;

const PR_BODY = [
  'Adds the DevDigest review agent to this repository’s CI.',
  '',
  'Please review these files like code before merging:',
  '- `.devdigest/agents/*.yaml` and `.devdigest/skills/*.md`: the agent configuration',
  '- `.devdigest/runner/index.js`: the bundled review runner (no marketplace action is used)',
  '- the workflow: least-privilege permissions, the OpenRouter key only via `secrets.OPENROUTER_API_KEY`, never run for fork PRs, never triggered by comments',
  '',
  'Add `OPENROUTER_API_KEY` to the repository secrets before the workflow runs.',
].join('\n');

function toInstallationDto(
  row: InstallationRow,
  last?: { ranAt: Date; findingsCount: number | null; blockers: number | null },
): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
    status: row.status,
    workflow_version: row.workflowVersion,
    last_run_status: last ? verdictOf(last.findingsCount, last.blockers) : null,
    last_run_at: last ? last.ranAt.toISOString() : null,
  };
}

export function toCiRunRow(r: CiRunDbRow): CiRunRow {
  return {
    id: r.id,
    ran_at: r.ranAt.toISOString(),
    installation_id: r.installationId,
    agent_id: r.agentId,
    agent_name: r.agentName,
    repo: r.repo,
    pr_number: r.prNumber,
    status: r.status,
    verdict: verdictOf(r.findingsCount, r.blockers),
    findings_count: r.findingsCount,
    blockers: r.blockers,
    cost_usd: r.costUsd,
    duration_ms: r.durationMs,
    job_url: r.jobUrl,
  };
}

export class CiService {
  readonly repo: CiRepository;

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  /** Studio-local readiness only — never queries GitHub Secrets (AC-9). */
  async readiness(): Promise<CiReadiness> {
    const key = await this.container.secrets.get('OPENROUTER_API_KEY');
    return { openrouter_key_ready: Boolean(key) };
  }

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const files = await this.assemble(workspaceId, agentId, input);
    return { files: redactRunner(files) };
  }

  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    const repoRef = parseRepo(input.repo);
    if (!BRANCH_RE.test(input.base) || input.base.includes('..')) {
      throw new ValidationError('Invalid base branch name');
    }
    const files = await this.assemble(workspaceId, agentId, input, input.workflow_contents, input.repo);

    // Degraded path (AC-13): a zip of exactly the shipped files; no PR, no installation.
    if (input.action === 'files') {
      return {
        installation: null,
        files: redactRunner(files),
        pr_url: null,
        zip_base64: zipFiles(files),
      };
    }

    // Non-GHA targets are download-only (Q3).
    if (input.target !== 'gha') {
      throw new ValidationError('Opening a PR is only supported for GitHub Actions; download the files instead');
    }

    // v1: one agent per repo. Re-export for the same agent is allowed.
    const installed = await this.repo.findRepoInstallations(workspaceId, input.repo, input.target);
    const other = installed.find((i) => i.agentId !== agentId);
    if (other) {
      throw new ValidationError(
        `repo already has DevDigest CI installed for agent ${other.agentName}; one agent per repo in v1`,
      );
    }
    // Never overwrite memory accumulated on an already-installed repo.
    const alreadyInstalled = installed.length > 0;
    const commitList = alreadyInstalled ? files.filter((f) => f.path !== MEMORY_PATH) : files;

    const github = await this.container.github();
    let prUrl: string;
    try {
      await github.commitFiles(repoRef, {
        branch: CI_BRANCH,
        base: input.base,
        message: CI_PR_TITLE,
        files: commitList.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existing = await github.findOpenPr(repoRef, CI_BRANCH);
      prUrl = existing
        ? existing.url
        : (
            await github.openPullRequest(repoRef, {
              title: CI_PR_TITLE,
              head: CI_BRANCH,
              base: input.base,
              body: PR_BODY,
            })
          ).url;
    } catch (err) {
      // AC-14: nothing recorded when GitHub fails; retry is idempotent.
      throw new ExternalServiceError(
        `GitHub export failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Recorded only after GitHub succeeded (AC-12, AC-14).
    const installation = await this.repo.upsertInstallation({
      agentId,
      repo: input.repo,
      targetType: input.target,
      workflowVersion: WORKFLOW_VERSION,
    });
    return {
      installation: toInstallationDto(installation),
      files: redactRunner(files),
      pr_url: prUrl,
      zip_base64: null,
    };
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listInstallations(workspaceId, agentId);
    const last = await this.repo.lastRunByInstallation(rows.map((r) => r.id));
    return rows.map((r) => toInstallationDto(r, last.get(r.id)));
  }

  async listRuns(
    workspaceId: string,
    filter: { agentId?: string; installationId?: string } = {},
  ): Promise<CiRunRow[]> {
    if (filter.agentId) await this.requireAgent(workspaceId, filter.agentId);
    return (await this.repo.listCiRuns(workspaceId, filter)).map(toCiRunRow);
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<AgentRow> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async assemble(
    workspaceId: string,
    agentId: string,
    input: Pick<CiPreviewInput, 'target' | 'post_as' | 'triggers'>,
    workflowOverride?: string,
    repo?: string,
  ): Promise<CiFile[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const [linked, allAgents, allSkills, runnerContents] = await Promise.all([
      this.container.agentsRepo.linkedSkills(agentId),
      this.container.agentsRepo.list(workspaceId),
      this.repo.listSkills(workspaceId),
      this.container.runnerBundle.read(),
    ]);
    return assembleCiFiles({
      agent,
      linkedSkills: [...linked].sort((a, b) => a.order - b.order).map((l) => l.skill),
      allAgents,
      allSkills,
      target: input.target,
      triggers: input.triggers,
      postAs: input.post_as,
      ...(repo ? { repo } : {}),
      runnerContents,
      ...(workflowOverride !== undefined ? { workflowOverride } : {}),
    });
  }
}

function parseRepo(repo: string): { owner: string; name: string } {
  if (!REPO_RE.test(repo)) throw new ValidationError('repo must be "owner/name"');
  const [owner, name] = repo.split('/') as [string, string];
  return { owner, name };
}

export { parseRepo };
