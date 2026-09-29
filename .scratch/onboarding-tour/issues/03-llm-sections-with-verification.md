# 03 — LLM sections with untrusted input and path verification

Status: done
Blocked by: 01
Spec: ../spec.md
Decision record: ../../../docs/adr/0003-onboarding-tour-generation.md

## What to build

Fill the three LLM sections during generation: **Architecture overview**, **Guided reading path**, **First tasks** (each task with 1–3 anchor files). Input is a token-budgeted selection (top files by dependents, root manifests, README, top-two-level tree, truncated bodies), delimiter-wrapped as untrusted per ADR-0001/0002 conventions, with schema-constrained output through the existing LLM adapter. Every path in the output is checked against the index and unknown paths are dropped; a section left empty is marked not generated while the rest survive. Record how many files/tokens were sent. Keep the Tour out of agent prompts and MCP.

## Acceptance criteria

- [x] With the LLM stubbed, all five sections are populated on a prepared index.
- [x] A path missing from the index never appears in stored or returned output (AC-7).
- [x] A section that ends up empty or whose generation fails is flagged not generated; other sections are unaffected (AC-8).
- [x] Repo text sent to the LLM is delimiter-wrapped as untrusted (AC-11).
- [x] The Tour is not added to any agent prompt or MCP response (AC-12).
- [x] Covered by the server integration test through the HTTP routes with the shared LLM mock.

## Comments

- Pure parts live in `reviewer-core/src/onboarding/` (schema, prompt, path verification); the LLM call, clone reads and index lookups are in `server/src/modules/onboarding/service.ts`. Uses the existing `onboarding` feature model setting.
- Also fills the `role` of each critical path (only for real critical paths). Contract gained `llm_input { files, approx_tokens }` (approx = chars/4, not a real tokenizer — kept simple).
- "Exists in the index" = the path is in `file_rank` or is either end of a `file_edges` row.
- LLM input = critical paths + top-12 ranked files (4,000 chars each) + README.md + package.json. No repo map / tree (simplest).
- The IT test must inject an LLM: otherwise the container builds a real provider from local `.env` secrets and calls the network (this made the first run take 217 s).
