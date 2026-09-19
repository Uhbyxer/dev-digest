# Skill bodies get a trust tier in prompt assembly, based on `source`

`reviewer-core/src/prompt.ts` already treats every other piece of prompt
content as either trusted (the agent's own `system` string) or untrusted
(diff, PR description, repo map, specs — all delimiter-wrapped with the
injection guard). Skills were the one exception: `assemblePrompt` concatenated
every linked skill's body straight into the trusted `## Skills / rules`
section regardless of where the skill came from, with only a code comment
flagging it as "trusted-ish."

We decided a Skill's `source` now determines its tier: `manual` (typed by the
workspace user in the Skill Editor) stays trusted and unwrapped, exactly as
before. `imported_url`, `extracted`, and `community` skills — content that
arrived from a file on disk, a URL, or (eventually) another workspace — are
now delimiter-wrapped as untrusted-but-directive, alongside the diff and repo
map, rather than folded into the trusted system content.

**Considered but rejected:** leaving all skills trusted regardless of source,
matching current behavior. Rejected because the Import feature makes it
trivial to bring an attacker-authored `.md` file (or archive) straight into
every review an agent runs, and the whole reason the injection-guard
machinery exists is to distrust exactly that class of content — an imported
file is not meaningfully different from a hostile PR description.

**Consequence:** a Skill's `source` is no longer purely a UI/provenance label
— changing a skill's `source` after the fact (e.g. `manual` → `community`)
changes how much the LLM trusts its own body on the next review. This is
deliberate, but worth remembering if `source` is ever exposed as something a
user can freely edit post-import.
