# 01: Brief API and single-call generation

**What to build:** A client of the API can ask for a PR's Brief and generate one. Generating computes the PR's facts (title, description, files with additions/deletions and Smart Diff role, changed line ranges), makes exactly one structured model call using the model chosen for Risk Brief in Settings, and stores the result as the PR's single current Brief together with the head commit SHA and generation time. Reading returns the stored Brief or an empty result. The shared contract gains `summary` and `review_focus` (max 5), identically in both copies; risks are capped at 5.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Both copies of the shared Brief contract include `summary` and `review_focus` (`file`, optional `line`, `reason`) and are identical
- [ ] Reading a PR with no Brief returns an empty result
- [ ] Generating makes exactly one model call and the model comes from the Risk Brief setting, not code
- [ ] The description is wrapped as untrusted and no diff hunk bodies reach the model
- [ ] The stored Brief contains the head SHA and generation time; reading it again returns the same Brief with no model call
- [ ] Route integration tests (mock LLM, real Postgres) cover the above
