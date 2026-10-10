import postgres from 'postgres';
import type { Finding } from '@devdigest/shared';

const sql = postgres(process.env.DATABASE_URL ?? '');

export async function loadCachedFindings(pullId: string): Promise<Finding[]> {
  const rows = await sql<{ payload: Finding }[]>`select payload from finding_cache where pull_id = ${pullId}`;
  return rows.map((r) => r.payload);
}
