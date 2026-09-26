# @devdigest/mcp

An MCP server (stdio transport) exposing dev-digest's review pipeline as
tools for an MCP-capable coding agent (e.g. Claude Code) — list configured
Agents, trigger a review on a PR and get findings back, read previously
persisted findings, and fetch a repo's Conventions. It talks to Postgres
directly through dev-digest's own `Container` (the same composition root the
API uses), so **it works without the API (`:3001`) or web (`:3000`) dev
servers running** — only Postgres needs to be up.

## Tools

| Tool | What it does |
|------|--------------|
| `list_agents` | List the reviewers configured in the workspace. |
| `run_review` | Run a review on a PR (`repo` + `pr_number`, optional `agent_name`) and return its findings directly. Blocks until done. |
| `get_findings` | Read a PR's already-persisted findings, without running a new review. |
| `get_conventions` | Fetch a repo's Conventions (defaults to `accepted`; auto-scans once if the repo has never been scanned). |
| `get_blast_radius` | Stub — returns `not_implemented`. Registered now with its final schema so the tool set is stable ahead of its real implementation. |

A repo/PR is addressed the way GitHub does — `owner/name` + a PR number, or a
full GitHub PR URL — never dev-digest's internal id. A repo or PR dev-digest
doesn't know about yet returns a specific error naming which step is missing
(add the repo / import the PR), rather than kicking off a slow clone or
import automatically.

## Setup

1. Postgres must be running and migrated (`cd ../server && pnpm db:migrate`).
2. Copy the values this server needs from `server/.env`:
   - `DATABASE_URL`
   - Whichever LLM provider key(s) your Agents use (`OPENAI_API_KEY` /
     `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`) — needed for `run_review`.
3. `pnpm install`
4. `pnpm dev` runs the server over stdio; point your MCP client at
   `tsx src/index.ts` in this directory (or `pnpm build && pnpm start` for
   the compiled `dist/index.js`).

## Known characteristic: live runs aren't visible in the web UI's SSE feed

`container.runBus` (the live "Live Log" / SSE stream the studio subscribes
to) is in-memory **per process**. A review started via this MCP server runs
in this process, not the API's, so the studio won't show it as an in-flight
run while it's executing. This is cosmetic, not a bug: `run_review` blocks
until the review completes and its findings are persisted to the same
Postgres database, so they appear in the studio (and via `get_findings`)
exactly like any other review as soon as the run finishes.
