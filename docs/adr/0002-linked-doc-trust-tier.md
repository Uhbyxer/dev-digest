# A PR-body-linked URL's fetched content gets a quarantine step, not just a trust tier

`reviewer-core/src/prompt.ts` already treats untrusted content two ways: data
to analyze (diff, PR description, repo map, specs — delimiter-wrapped) or
directive-but-untrusted (an `imported_url`/`extracted`/`community` Skill,
per ADR-0001 — delimiter-wrapped but its guidance is still applied). The
Intent Layer's linked-spec fetch (a `http(s)://` URL found in a PR's body,
detected by `detectLinkedSpecUrl`) introduces a third kind of content this
codebase hasn't handled before: arbitrary third-party text that nobody in
the workspace authored, chose, or vetted — unlike a Skill, which a workspace
user deliberately imported.

We decided fetched linked-spec content is untrusted DATA, analogous to
ADR-0001's `imported_url` Skill tier in that it's delimiter-wrapped and never
treated as instructions. But we go one step further: before the fetched text
ever reaches the main intent-derivation prompt, it passes through a
*separate*, schema-constrained LLM call (`buildQuarantineExtractionPrompt`,
using the same cheap `review_intent` model) that reduces it to
`{ summary: string, key_requirements: string[] }`. Only that structured
result — never the raw fetched text — is passed forward, and even it is
still delimiter-wrapped as untrusted going into the main prompt (belt +
suspenders — a schema constraint narrows what a compromised extraction call
can smuggle through, but it doesn't make the content trusted).

**Why the extra step, when ADR-0001 didn't need one for Skills:** a Skill is
directive content a workspace user actively chose to bring in — the
workspace already exercises judgment over which skills get imported. A
linked spec is the opposite: it's whatever URL happens to appear in a PR
body, arbitrary third-party content that could originate from anyone who
can open a PR (including an external contributor). Feeding that much
unconstrained surface area straight into the same prompt that also sees the
diff and the injection guard's authority is a meaningfully larger attack
surface than a single delimiter wrap accounts for. The quarantine call
constrains what can flow through to a fixed, narrow shape before it's ever
seen alongside the rest of the review context.

**SSRF mitigations (the adapter-level counterpart to this prompt-level
decision):** `server/src/adapters/linked-doc/fetcher.ts` rejects non-http(s)
protocols, resolves the hostname and rejects loopback/link-local/private
ranges (basic guard, no allowlist for v1), enforces a hard timeout and a
hard byte cap read from the stream (not `Content-Length` alone), and
re-checks protocol + private-IP on every redirect hop (max 3) rather than
trusting `fetch`'s own redirect handling. These are the standard mitigations
for this class of vulnerability, not a novel design — see the `security`
skill's SSRF guidance. A dedicated security review of this adapter is
out of scope for the Intent Layer plan itself (tracked separately), but the
mitigations are implemented as specified, not deferred.

**Considered but rejected:** treating the fetched text as directive, the way
`manual` Skills are (i.e. giving its content authority over review scope).
Rejected outright — nothing about a URL appearing in a PR body implies the
workspace endorses its content; treating it as directive would let anyone
who can open a PR (or edit a page that URL points to) inject review-scope
instructions merely by adding a link.

**Considered but rejected:** skipping the quarantine call and wrapping the
raw fetched text directly with `wrapUntrusted`, matching the `specs`/`diff`
pattern. Rejected because those existing untrusted blocks are already
narrow in what a compromised source can achieve (code and PR text feed a
review whose actual authority — flagging real defects — cannot be talked
out of firing, per the injection guard). An arbitrary web page has far more
room to embed adversarial content (HTML, hidden text, very large payloads)
before hitting a human reader's attention; a schema-constrained extraction
step is a cheap additional narrowing of that surface.

**Consequence:** the intent layer costs an extra LLM call whenever a PR body
contains a candidate spec link, and that call's own output — while
schema-shaped — is still not implicitly trusted downstream. If a future
plan wants to escalate linked-spec content to directive status (e.g. to
drive a stricter conformance check), that would need its own ADR: this one
only covers PR-intent derivation.
