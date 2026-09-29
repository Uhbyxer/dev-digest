# 03 — LLM sections with untrusted input and path verification

Status: ready-for-agent
Blocked by: 01
Spec: ../spec.md
Decision record: ../../../docs/adr/0003-onboarding-tour-generation.md

## What to build

Fill the three LLM sections during generation: **Architecture overview**, **Guided reading path**, **First tasks** (each task with 1–3 anchor files). Input is a token-budgeted selection (top files by dependents, root manifests, README, top-two-level tree, truncated bodies), delimiter-wrapped as untrusted per ADR-0001/0002 conventions, with schema-constrained output through the existing LLM adapter. Every path in the output is checked against the index and unknown paths are dropped; a section left empty is marked not generated while the rest survive. Record how many files/tokens were sent. Keep the Tour out of agent prompts and MCP.

## Acceptance criteria

- [ ] With the LLM stubbed, all five sections are populated on a prepared index.
- [ ] A path missing from the index never appears in stored or returned output (AC-7).
- [ ] A section that ends up empty or whose generation fails is flagged not generated; other sections are unaffected (AC-8).
- [ ] Repo text sent to the LLM is delimiter-wrapped as untrusted (AC-11).
- [ ] The Tour is not added to any agent prompt or MCP response (AC-12).
- [ ] Covered by the server integration test through the HTTP routes with the shared LLM mock.
