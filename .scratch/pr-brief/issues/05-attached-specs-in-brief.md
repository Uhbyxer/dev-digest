# 05: Attached specs inform the Brief

**What to build:** The specs attached to the repo's enabled agents (and their linked skills) are given to the model when generating the Brief, so risks reflect the project's own rules. Documents are deduplicated, read from the base branch, size-capped per document and in total, wrapped as untrusted, and the whole model input stays within the stated budget (about 6,000 estimated tokens) without ever including diff hunk bodies.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Attached specs from enabled agents/skills reach the model input, deduplicated
- [ ] Specs are untrusted-wrapped and capped per document and in total
- [ ] Total input stays within the budget; a large spec is truncated, not sent whole
- [ ] Missing/unreadable attached document is skipped, generation still succeeds
- [ ] No hunk bodies in the input
- [ ] Route tests assert the model input
