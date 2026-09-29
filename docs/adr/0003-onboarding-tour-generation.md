# Onboarding Tour: deterministic skeleton + constrained LLM prose, stored in the DB

An **Onboarding Tour** needs facts (which files matter, how to run the repo)
and prose (architecture summary, reading order, first tasks). We decided to
build it as a hybrid: everything checkable is computed deterministically from
the repo index and manifests (critical paths ranked by dependents, run
commands read from `package.json` / `docker-compose` / README), and the LLM
only writes the architecture overview, the reading path and the first tasks.
Repo text sent to the LLM is untrusted (delimiter-wrapped, per ADR-0001/0002),
the output is schema-constrained, and every file path in it is verified
against the index — unknown paths are dropped, never shown.

The finished Tour is stored as one row per repo in the DB (not a
`.devdigest/` file): it is a generated artifact, not human-authored, so it
must not be mistaken for a **Context Document**. Regenerate overwrites it.

**Considered but rejected:** (a) pure-LLM generation — invents paths and
commands, unacceptable for "how to run" steps a newcomer will paste into a
terminal; (b) pure-deterministic — cannot explain architecture or propose
tasks; (c) storing the Tour as a file in the repo clone — blurs generated vs.
authored content and dirties the user's working tree.

**Consequence:** the Tour is never injected into agent prompts or exposed
over MCP in this version; if that changes, its text must be treated as
untrusted (it is LLM output derived from untrusted repo content).
