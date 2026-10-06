import { z } from 'zod';
import { FindingSchema, type Finding } from '@devdigest/shared';

const Envelope = z.object({ findings: z.array(FindingSchema) });

export function parseFindings(text: string): Finding[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return [];
  const result = Envelope.safeParse(JSON.parse(text.slice(start, end + 1)));
  return result.success ? result.data.findings : [];
}
