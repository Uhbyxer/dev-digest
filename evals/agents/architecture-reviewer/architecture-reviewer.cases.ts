import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A diff whose violation sits in reviewer-core (the pure domain core): a filesystem import plus a
// read that has no injected port supplying the data.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO boundary (a pure local-variable rename inside a domain file, no new
// imports, no cross-layer edges). A grounded reviewer reports zero findings — this surfaces a
// reviewer that pads its output with judgment/best-practice findings.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// These practices describe the contract of THIS repo's `.claude/agents/architecture-reviewer.md`:
// a findings table (Severity | File:Line | Violating import/dependency | Rule violated), a
// `Summary: N finding(s).` line, a "Needs follow-up" section, and the explicit clean-diff statement
// "No boundary violations found." The agent has no PASS/FAIL gate and no named rule identifiers —
// it cites the rule from the onion-architecture skill in prose — so the practices do not demand them.
//
// Agent sessions on cheap models run long (20+ turns, a few minutes), so each case carries its own
// timeout instead of the suite-wide default.
const AGENT_TIMEOUT_MS = 420_000;

export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity, a rule reference and a summary count",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of the inward-only dependency rule between the domain layer and the HTTP framework",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      "fills the 'Rule violated' column for EVERY finding with a one-line reference to the rule (e.g. citing the onion-architecture skill), not leaving it empty or describing the problem only in free prose",
      "assigns a severity (High, Medium or Low) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "closes the findings table with a `Summary: N finding(s)` count line that matches the number of findings in the table",
    ],
    threshold: 1.0,
    maxTurns: 25,
    timeoutMs: AGENT_TIMEOUT_MS,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the Fastify import issue itself (no runtime bug/security finding fabricated as an architecture rule)",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
    timeoutMs: AGENT_TIMEOUT_MS,
  },
  {
    name: "flags the filesystem read in reviewer-core and cites the purity rule",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must not touch the filesystem; everything is injected by the caller)",
      "references the reviewer-core purity rule for that finding in the 'Rule violated' column (no filesystem/DB/HTTP access inside reviewer-core), rather than describing it only in free prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "closes the findings table with a `Summary: N finding(s)` count line that matches the number of findings in the table",
    ],
    threshold: 1.0,
    maxTurns: 25,
    timeoutMs: AGENT_TIMEOUT_MS,
  },
  {
    name: "does not fabricate a boundary violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no boundary violations for the benign rename (any 'Needs follow-up' note is non-blocking and no table row is rated as a finding) — it does not invent a High or Medium finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "states explicitly that no boundary violations were found (e.g. 'No boundary violations found.') or gives `Summary: 0 finding(s)`",
    ],
    threshold: 1.0,
    maxTurns: 25,
    timeoutMs: AGENT_TIMEOUT_MS,
  },
];
