import AdmZip from 'adm-zip';
import type { CiFile, CiPostAs, CiTarget, CiTrigger } from '@devdigest/shared';
import { buildManifest, skillFileBody } from './manifest.js';
import { buildWorkflow, WORKFLOW_PATHS, RUNNER_PATH } from './workflow.js';
import { assignSlugs } from './slug.js';
import type { AgentRow, SkillRow } from '../../db/rows.js';

export const MEMORY_PATH = '.devdigest/memory.jsonl';

export interface AssembleInput {
  agent: AgentRow;
  /** Skills linked to the agent, in link order. */
  linkedSkills: SkillRow[];
  /** All agents/skills in the workspace — slug disambiguation is workspace-wide so it stays stable. */
  allAgents: AgentRow[];
  allSkills: SkillRow[];
  target: CiTarget;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  /** Validated "owner/name" target repo (export); omitted at preview time. */
  repo?: string;
  /** Full contents of the built agent-runner. */
  runnerContents: string;
  /** User-edited workflow; replaces the generated one when set. */
  workflowOverride?: string;
}

/**
 * The shipped file set (AC-3): manifest, one file per linked skill, empty
 * memory, the read-only bundled runner, and the editable workflow — in that
 * order. The runner carries its real contents here (zip/commit need them);
 * `redactRunner` strips them for API responses.
 */
export function assembleCiFiles(input: AssembleInput): CiFile[] {
  const agentSlug = assignSlugs(input.allAgents, 'agent').get(input.agent.id) ?? 'agent';
  const skillSlugs = assignSlugs(input.allSkills, 'skill');
  const slugOf = (s: SkillRow) => skillSlugs.get(s.id) ?? 'skill';

  const files: CiFile[] = [
    {
      path: `.devdigest/agents/${agentSlug}.yaml`,
      contents: buildManifest(input.agent, input.linkedSkills.map(slugOf)),
      editable: false,
    },
    ...input.linkedSkills.map((s) => ({
      path: `.devdigest/skills/${slugOf(s)}.md`,
      contents: skillFileBody(s),
      editable: false,
    })),
    { path: MEMORY_PATH, contents: '', editable: false },
    { path: RUNNER_PATH, contents: input.runnerContents, editable: false },
    {
      path: WORKFLOW_PATHS[input.target],
      contents:
        input.workflowOverride ??
        buildWorkflow({
          target: input.target,
          triggers: input.triggers,
          postAs: input.postAs,
          ...(input.repo ? { repo: input.repo } : {}),
        }),
      editable: true,
    },
  ];
  return files.map((f) => ({ ...f, size_bytes: Buffer.byteLength(f.contents, 'utf8') }));
}

/** Drop the (huge) runner contents for API responses; keep its size for the placeholder. */
export function redactRunner(files: CiFile[]): CiFile[] {
  return files.map((f) => (f.path === RUNNER_PATH ? { ...f, contents: '' } : f));
}

/** Zip of exactly the shipped files (AC-13), base64-encoded. */
export function zipFiles(files: CiFile[]): string {
  const zip = new AdmZip();
  for (const f of files) zip.addFile(f.path, Buffer.from(f.contents, 'utf8'));
  return zip.toBuffer().toString('base64');
}
