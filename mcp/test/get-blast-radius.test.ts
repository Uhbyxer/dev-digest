import { describe, it, expect, vi } from 'vitest';
import type { Container } from '@devdigest/server/platform/container.js';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';

describe('get_blast_radius', () => {
  it('returns the not_implemented shape without touching repoIntel', async () => {
    const getBlastRadius = vi.fn();
    const container = { repoIntel: { getBlastRadius } } as unknown as Container;

    const result = await getBlastRadiusTool(container, 'ws-1', { repo: 'acme/whatever', pr_number: 1 });

    expect(result.text).toContain('not_implemented');
    expect(getBlastRadius).not.toHaveBeenCalled();
  });
});
