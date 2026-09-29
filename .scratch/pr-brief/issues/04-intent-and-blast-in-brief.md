# 04: Intent and Blast radius in the Brief

**What to build:** The Brief shows the PR's Intent and Blast radius next to the summary, and the model receives them as facts (Intent, Blast summary and a capped list of top callers). Blast callers also count as valid files for verification. If Intent or Blast radius is unavailable, the Brief still generates, tells the model the data is not available, records what was missing, and the card states which data was missing.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Intent and Blast radius blocks appear beside the summary when available
- [ ] Files from Blast callers are accepted as valid in Risk areas and Review focus
- [ ] No Intent and/or no Blast: Brief still generates and the card names the missing data
- [ ] Intent text is wrapped as untrusted in the model input
- [ ] Route tests (missing cases, callers allowed) and a component test for the missing-data notice
