import type { WorkflowCase } from "../src/index.js";

/**
 * CLAUDE.md-driven workflow cases — what the repo's CLAUDE.md files (root + per package) promise an
 * agent: "Read when" routing, per-package conventions, gotchas, do-not-touch, skill activation.
 *
 * Each case below bundles several scenarios into ONE session (`trace` folds many assertions into a
 * single run), so the whole file costs 4 Claude sessions instead of ~15. The price is coarser
 * diagnostics: a failure names the missing item, not which sub-task derailed the agent. Keep each
 * bundle to ONE theme so the sub-tasks don't answer each other, and phrase prompts without file names
 * so the agent has to follow the routing rather than being told where to look.
 *
 * Answer language is pinned to English because `expectAnswerIncludes` is a substring check.
 */
export const cases: WorkflowCase[] = [
  // --- 1 session: root CLAUDE.md "Read when" + "Agent skills" routing ---------------------------
  {
    kind: "trace",
    name: "root CLAUDE.md routes testing strategy, ticket workflow and domain glossary to their docs",
    prompt:
      "Read-only task, change nothing. Following this repo's CLAUDE.md guidance on which documentation " +
      "to consult, do three things and actually open the documents: (1) find where the testing strategy " +
      "and CI workflows are described; (2) find how issue tickets are tracked in this repo; " +
      "(3) find the project's domain glossary. Then say in one line per item which file you used.",
    expectFilesRead: ["/TESTING.md", "docs/agents/issue-tracker.md", "/CONTEXT.md"],
    maxTurns: 14,
  },

  // --- 1 session: server/CLAUDE.md (nested) + root gotcha + do-not-touch ------------------------
  {
    kind: "trace",
    name: "working in server/ surfaces server conventions, the migrate gotcha, and skips server/clones",
    prompt:
      "Read-only task, change nothing. I am about to work inside the server/ package. Answer in English, " +
      "tersely: (a) how do I run its integration tests and what do they need; (b) a first run fails " +
      "with `relation ... does not exist` — what is the cause and fix; (c) read the documentation of " +
      "the codebase indexer (repo-intel) module and summarize it in one sentence.",
    expectFilesRead: ["server/src/modules/repo-intel/README.md"],
    expectAnswerIncludes: [".it.test", "testcontainers", "db:migrate"],
    expectNoFilesRead: ["server/clones/"],
    maxTurns: 14,
  },

  // --- 1 session: client/, reviewer-core/ and e2e/ nested CLAUDE.md conventions ------------------
  {
    kind: "trace",
    name: "nested CLAUDE.md conventions are known for client, reviewer-core and e2e",
    prompt:
      "Read-only task, change nothing. Answer in English, one or two sentences each, using this repo's " +
      "own conventions for each package: (1) in client/ I add a new button label — where must the text " +
      "live; (2) in reviewer-core/src/review I want to read a config file from disk — is that allowed, " +
      "and if not, how do I get the data in; (3) in e2e/ I want a scenario that asks an LLM to judge the " +
      "page — is that how these tests work.",
    expectAnswerIncludes: ["next-intl", "messages/en", "inject", "deterministic"],
    maxTurns: 12,
  },

  // --- 1 session: two project skills activate on a request that needs both -----------------------
  {
    kind: "trace",
    name: "architecture + dependency questions activate onion-architecture and dependency-checker",
    prompt:
      "Two things about this repo, read-only. First: is reviewer-core architecturally clean — does it " +
      "leak any infrastructure (fs, DB, HTTP) into the domain core? Second: give me a dependency " +
      "report — what depends on what across the packages, and what is heaviest.",
    expectSkills: ["onion-architecture", "dependency-checker"],
    maxTurns: 14,
  },
];
