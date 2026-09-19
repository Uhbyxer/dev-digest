import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Container } from '../../platform/container.js';
import type { ConventionCandidate, ConventionStatus, Skill } from '@devdigest/shared';
import {
  buildExtractionPrompt,
  buildFileSelectionPrompt,
  CONVENTION_EXTRACTION_SCHEMA_NAME,
  CONVENTION_FILE_SELECTION_SCHEMA_NAME,
  ConventionExtractionResult,
  ConventionFileSelectionResult,
  groundConventionCandidates,
  type ConventionFileSample,
} from '@devdigest/reviewer-core';
import { ConventionsRepository } from './repository.js';
import { RepoRepository } from '../repos/repository.js';
import { SkillsService } from '../skills/service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { toConventionDto } from './helpers.js';
import { dedupeNewCandidates, type DedupeCandidate } from './dedupe.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';

/**
 * Conventions service — orchestrates the two-step LLM detection flow
 * (file selection → per-group extraction), dedupe, persistence, and merging
 * accepted Conventions into a new Skill. Pure prompt-building/schemas live in
 * `@devdigest/reviewer-core`; all I/O (repo-intel samples, clone reads, LLM
 * calls, DB) lives here.
 */

/** Starting default file-sample count; tunable later (spec's open question). */
export const DEFAULT_SAMPLE_COUNT = 12;

export interface ScanResult {
  inserted: number;
  conventions: ConventionCandidate[];
  lastScannedAt: string | null;
}

export interface ListResult {
  conventions: ConventionCandidate[];
  lastScannedAt: string | null;
}

export interface UpdateConventionInput {
  rule?: string;
  status?: ConventionStatus;
}

export interface CreateSkillFromAcceptedInput {
  name: string;
  description: string;
  body: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private reposRepo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.reposRepo = new RepoRepository(container.db);
  }

  async scan(workspaceId: string, repoId: string): Promise<ScanResult> {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const inserted = await this.detectAndInsert(workspaceId, repoId, repo.clonePath);
    const current = await this.list(workspaceId, repoId);
    return { inserted, ...current };
  }

  /** Runs the two-step LLM detection + grounding + dedupe + insert; returns the count inserted. */
  private async detectAndInsert(
    workspaceId: string,
    repoId: string,
    clonePath: string | null,
  ): Promise<number> {
    if (!clonePath) return 0;
    const paths = await this.container.repoIntel.getConventionSamples(repoId, DEFAULT_SAMPLE_COUNT);
    if (paths.length === 0) return 0;

    const samples = await this.readSamples(clonePath, paths);
    if (samples.length === 0) return 0;

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'conventions');
    const llm = await this.container.llm(provider);

    const selection = await llm.completeStructured({
      model,
      schema: ConventionFileSelectionResult,
      schemaName: CONVENTION_FILE_SELECTION_SCHEMA_NAME,
      messages: buildFileSelectionPrompt(samples),
    });

    const extractions = await Promise.all(
      selection.data.groups.map((group) =>
        llm.completeStructured({
          model,
          schema: ConventionExtractionResult,
          schemaName: CONVENTION_EXTRACTION_SCHEMA_NAME,
          messages: buildExtractionPrompt(group, samples),
        }),
      ),
    );
    const extracted = extractions.flatMap((e) => e.data.candidates);

    // Mechanical grounding gate (mirrors reviewer-core's diff-finding
    // grounding): drop any candidate whose evidence_snippet was never
    // actually written by the model as a real quote from the file it cites.
    const { kept: detected } = groundConventionCandidates(extracted, samples);
    if (detected.length === 0) return 0;

    const existing = await this.repo.listAllStatusesForDedupe(workspaceId, repoId);
    // Index-tagged so survivors map back to their full detected row
    // (DedupeCandidate only carries rule+evidencePath).
    const candidates = detected.map((c, i) => ({
      rule: c.rule,
      evidencePath: c.evidence_path,
      i,
    })) satisfies (DedupeCandidate & { i: number })[];
    const survivors = dedupeNewCandidates(candidates, existing) as (DedupeCandidate & { i: number })[];
    const rows = survivors.map((s) => detected[s.i]!);

    // Insertion is the LAST step, after both LLM calls succeed — a failure
    // above never partially writes.
    await this.repo.insertMany(
      rows.map((c) => ({
        workspaceId,
        repoId,
        rule: c.rule,
        evidencePath: c.evidence_path,
        evidenceSnippet: c.evidence_snippet,
        confidence: c.confidence,
      })),
    );
    return rows.length;
  }

  async list(workspaceId: string, repoId: string): Promise<ListResult> {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const [conventions, lastScannedAt] = await Promise.all([
      this.repo.listByRepo(workspaceId, repoId),
      this.repo.lastScannedAt(workspaceId, repoId),
    ]);
    return {
      conventions: conventions.map(toConventionDto),
      lastScannedAt: lastScannedAt ? lastScannedAt.toISOString() : null,
    };
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionInput,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toConventionDto(row) : undefined;
  }

  async createSkillFromAccepted(
    workspaceId: string,
    repoId: string,
    input: CreateSkillFromAcceptedInput,
  ): Promise<Skill> {
    const repo = await this.reposRepo.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    // Acceptance is the actual selection mechanism, so it's still checked
    // server-side at persist time even though the client built the body: a
    // repo could have every accepted convention rejected between the client
    // loading the page and clicking Create.
    const accepted = await this.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new ValidationError('No accepted conventions to merge for this repo');
    }

    return new SkillsService(this.container).createFromImport(workspaceId, {
      name: input.name,
      description: input.description,
      type: 'convention',
      body: input.body,
      source: 'extracted',
    });
  }

  private async readSamples(clonePath: string, paths: string[]): Promise<ConventionFileSample[]> {
    const results = await Promise.all(
      paths.map(async (path) => {
        const content = await readClone(clonePath, path);
        return content !== null ? { path, content } : null;
      }),
    );
    return results.filter((s): s is ConventionFileSample => s !== null);
  }
}

async function readClone(clonePath: string, file: string): Promise<string | null> {
  return readFile(join(clonePath, file), 'utf8').catch(() => null);
}
