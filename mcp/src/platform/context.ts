import 'dotenv/config';
import { loadConfig, type AppConfig } from '@devdigest/server/platform/config.js';
import { createDb, type Db, type DbHandle } from '@devdigest/server/db/client.js';
import { Container, type ContainerOverrides } from '@devdigest/server/platform/container.js';

/**
 * The MCP server's own composition root — a `Container` built from its own
 * Postgres connection pool, independent of the API/web dev servers (they
 * don't need to be running). Built once per process; `container.auth`
 * (`LocalNoAuthProvider`) has no request object to key off, so the workspace
 * is resolved once here and reused, exactly as `getContext()` does per HTTP
 * request in the API.
 */
export interface McpContext {
  container: Container;
  workspaceId: string;
  close: () => Promise<void>;
}

export interface BuildMcpContextOptions {
  config?: AppConfig;
  /** Tests pass a testcontainers-backed db instead of the real DATABASE_URL. */
  db?: Db;
  overrides?: ContainerOverrides;
}

let cached: Promise<McpContext> | undefined;

async function build(opts: BuildMcpContextOptions): Promise<McpContext> {
  const config = opts.config ?? loadConfig();
  const handle: DbHandle | null = opts.db ? null : createDb(config.databaseUrl);
  const db = opts.db ?? handle!.db;
  const container = new Container(config, db, opts.overrides);
  // AuthProvider's interface takes a request object (for a future real auth
  // provider); LocalNoAuthProvider ignores it and MCP has no request to pass.
  const workspace = await container.auth.currentWorkspace(undefined);
  return {
    container,
    workspaceId: workspace.id,
    close: handle ? handle.close : async () => undefined,
  };
}

/**
 * Process-lifetime `Container` + resolved workspace id. Passing `db`/`config`/
 * `overrides` (tests, against a testcontainers Postgres) always builds a
 * fresh, uncached context; the real server (no options) builds once and
 * reuses it for every tool call.
 */
export async function buildMcpContext(opts: BuildMcpContextOptions = {}): Promise<McpContext> {
  if (opts.db || opts.config || opts.overrides) return build(opts);
  cached ??= build(opts);
  return cached;
}
