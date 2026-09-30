# PR Brief: computed facts in, one schema-constrained model call out, verified against the PR

A **PR Brief** needs facts (intent, blast radius, diff stats, changed line
ranges) and judgement (summary, risks, where to start reading). We decided the
facts are computed deterministically and passed to the model as data, and the
model is called **once** (one `completeStructured` call, model from the
`risk_brief` setting) to produce only `{summary, risks, review_focus}`. The
model never sees diff hunk bodies — only file paths, `+/-` counts, roles and
changed line *ranges* — so its input stays small and it cannot be steered by
code in the diff.

Because the model cannot see code, its output is verified rather than
trusted: every file must be in the PR's file list or the Blast radius
callers, otherwise the item is dropped (never shown, never re-asked); a
`line` is kept only if it lies in a changed range of that file. PR
description, Intent and attached specs are delimiter-wrapped as untrusted and
size-capped (per ADR-0001/0002/0003).

The stored JSON is a snapshot (facts + model output + `head_sha` +
`generated_at` + `missing`) in the existing `pr_brief` table. A Brief whose
`head_sha` differs from the PR's is shown as stale; regeneration is manual only.

**Considered but rejected:** (a) letting the model read the diff — larger
input, prompt-injection surface, and it would still hallucinate line numbers;
(b) auto-regenerating on a new commit — hidden LLM cost; (c) re-asking the
model when verification drops items — breaks the single-call guarantee; (d)
adding `head_sha` as a column — the table is `pr_id` + `json` and the SHA
belongs to the snapshot.

**Consequence:** "exactly one call" means one logical `completeStructured`
call; its internal schema-validation retries are not counted.
