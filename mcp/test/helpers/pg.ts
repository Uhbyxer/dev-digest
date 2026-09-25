// Reuses server-integration's own Testcontainers Postgres harness (spin up
// pgvector, run migrations, hand back a Drizzle client) rather than
// duplicating it — same real Postgres the API/web app use.
export { startPg, dockerAvailable, type PgFixture } from '../../../server/test/helpers/pg.js';
