# Spec: PR Brief (Why + Risk)

Glossary: `CONTEXT.md#pr-brief`. Decision: `docs/adr/0004-pr-brief-generation.md`.

## Contract (both copies of `brief.ts`)
- `PrBrief` gains `summary: string` and `review_focus: { file, line?: int, reason }[]` (max 5).
- `Risks.risks` max 5; each `file_refs` has ≥ 1 verified path.
- Stored JSON adds `head_sha`, `generated_at`, `missing: ('intent'|'blast')[]`.
- Model output schema is only `{ summary, risks, review_focus }`.

## Server (`server/src/modules/brief/`)
- `GET /pulls/:id/brief` → stored Brief + `stale: boolean`, or 404-as-empty.
- `POST /pulls/:id/brief` → generate/regenerate (overwrites `pr_brief`).
- Inputs: PR title/description, `getIntent`, blast `summary` + top-N callers, files with
  `additions/deletions/role`, changed line ranges, `finding_lines`, attached specs
  (union of enabled agents' effective sets, base branch, per-doc and total char caps).
- One `llm.completeStructured` call; model from `resolveFeatureModel(..., 'risk_brief')`.
- Untrusted wrapping for description, intent, specs. No hunk bodies. Input token budget: ≤ 6k est. (`ceil(chars/4)`).
- Post-verify: drop unknown-path risks/focus items; null out lines outside changed ranges.

## Client
- Overview: PR Brief card; empty state with **Generate brief**; refresh button; stale badge;
  `missing` notice; Intent + Blast radius side by side; VerdictBanner (P3) when a review exists.
- Risk areas: title + file, severity-coloured icon, expandable explanation (P3).
- Review focus: `file:line — reason`; click → `?tab=diff&file=<path>&line=<n>`;
  DiffTab expands the file and scrolls to the line when present.

## Acceptance (P1)
1. No Brief → Generate brief visible. 2. After generation: summary, Risk areas, Review focus,
Intent/Blast or explicit missing-data note. 3. No invented paths. 4. Click opens Files changed
on the file. 5. Reload shows the same Brief; refresh regenerates.
