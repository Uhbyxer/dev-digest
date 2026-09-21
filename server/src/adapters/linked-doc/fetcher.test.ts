/**
 * `fetchLinkedDoc` — SSRF-guarded, best-effort fetch of a PR-body-linked URL
 * (docs/plans/intent-layer.md, decision #3/#4; docs/adr/0002). Fully
 * hermetic: `node:dns/promises#lookup` and the global `fetch` are mocked —
 * no real network calls. Every failure mode must resolve to `undefined`,
 * never throw.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const lookupMock = vi.fn();
vi.mock('node:dns/promises', () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

// Captures the `connect` options (including the pinned `lookup` function)
// passed to the most recently constructed `Agent`, so tests can distinguish
// "the IP validated by `node:dns/promises#lookup`" from "the IP the actual
// connection would use" — the exact TOCTOU gap this fix closes. `fetch`
// itself is stubbed globally per-test (see `beforeEach` below), so mocking
// `undici`'s `Agent` here doesn't change any existing test's behavior; it
// only makes the pinned `connect.lookup` inspectable.
let lastAgentConnectOptions: { lookup?: (...args: unknown[]) => void } | undefined;
vi.mock('undici', () => {
  class FakeAgent {
    constructor(opts: { connect?: { lookup?: (...args: unknown[]) => void } }) {
      lastAgentConnectOptions = opts?.connect;
    }
    async close() {
      /* no-op */
    }
  }
  return { Agent: FakeAgent };
});

// Imported after the mocks so `fetcher.ts` picks up the mocked `lookup`/`Agent`.
const { fetchLinkedDoc } = await import('./fetcher.js');

function publicV4() {
  return [{ address: '93.184.216.34', family: 4 }];
}

/** A minimal Response-like stub the fetcher's `fetchOnce`/`readCappedBody` can operate on. */
function makeResponse(opts: {
  status?: number;
  ok?: boolean;
  headers?: Record<string, string>;
  chunks?: Uint8Array[];
}): Response {
  const status = opts.status ?? 200;
  const headers = new Map(Object.entries(opts.headers ?? {}));
  const chunks = opts.chunks ?? [];
  let i = 0;
  const body = {
    getReader() {
      return {
        async read() {
          if (i < chunks.length) {
            const value = chunks[i++];
            return { done: false, value };
          }
          return { done: true, value: undefined };
        },
        async cancel() {
          i = chunks.length;
        },
      };
    },
  };
  return {
    status,
    ok: opts.ok ?? (status >= 200 && status < 300),
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? headers.get(k) ?? null },
    body,
  } as unknown as Response;
}

function textChunks(text: string): Uint8Array[] {
  return [new TextEncoder().encode(text)];
}

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue(publicV4());
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchLinkedDoc — protocol allowlist', () => {
  it('rejects a non-http(s) protocol without ever calling fetch', async () => {
    const result = await fetchLinkedDoc('ftp://example.com/plan.md');
    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a malformed URL', async () => {
    const result = await fetchLinkedDoc('not a url');
    expect(result).toBeUndefined();
  });
});

describe('fetchLinkedDoc — DNS-resolved private/loopback IP rejection', () => {
  it('rejects a hostname resolving to a loopback IPv4 address', async () => {
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const result = await fetchLinkedDoc('http://example.com/plan.md');
    expect(result).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a hostname resolving to a private 10.0.0.0/8 IPv4 address', async () => {
    lookupMock.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    const result = await fetchLinkedDoc('http://internal.example.com/plan.md');
    expect(result).toBeUndefined();
  });

  it('rejects a hostname resolving to a link-local 169.254.0.0/16 IPv4 address', async () => {
    lookupMock.mockResolvedValue([{ address: '169.254.1.1', family: 4 }]);
    const result = await fetchLinkedDoc('http://metadata.example.com/plan.md');
    expect(result).toBeUndefined();
  });

  it('rejects a hostname resolving to a loopback IPv6 address (::1)', async () => {
    lookupMock.mockResolvedValue([{ address: '::1', family: 6 }]);
    const result = await fetchLinkedDoc('http://example.com/plan.md');
    expect(result).toBeUndefined();
  });

  it('rejects a hostname resolving to an IPv4-mapped IPv6 private address (::ffff:10.0.0.1)', async () => {
    lookupMock.mockResolvedValue([{ address: '::ffff:10.0.0.1', family: 6 }]);
    const result = await fetchLinkedDoc('http://example.com/plan.md');
    expect(result).toBeUndefined();
  });

  it('rejects when ANY resolved address (of multiple) is private, not just the first', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.1', family: 4 },
    ]);
    const result = await fetchLinkedDoc('http://example.com/plan.md');
    expect(result).toBeUndefined();
  });

  it('allows a hostname resolving only to public addresses', async () => {
    lookupMock.mockResolvedValue(publicV4());
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('hello world') }),
    );
    const result = await fetchLinkedDoc('http://example.com/plan.md');
    expect(result).toEqual({ text: 'hello world' });
  });
});

describe('fetchLinkedDoc — timeout', () => {
  it('resolves to undefined when the fetch is aborted (times out)', async () => {
    vi.useFakeTimers();
    try {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }),
      );
      const pending = fetchLinkedDoc('http://example.com/slow.md');
      await vi.advanceTimersByTimeAsync(5_000); // fires the ~5s AbortController timeout
      const result = await pending;
      expect(result).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchLinkedDoc — byte-cap enforcement', () => {
  it('aborts and returns undefined once the ~200KB stream cap is exceeded, ignoring Content-Length', async () => {
    const bigChunk = new Uint8Array(210 * 1024).fill(97); // 210KB of 'a', over the 200KB cap
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({
        // Lies about Content-Length to prove the cap isn't based on it.
        headers: { 'content-type': 'text/plain', 'content-length': '10' },
        chunks: [bigChunk],
      }),
    );
    const result = await fetchLinkedDoc('http://example.com/huge.md');
    expect(result).toBeUndefined();
  });

  it('accepts a body under the cap', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('a small doc') }),
    );
    const result = await fetchLinkedDoc('http://example.com/small.md');
    expect(result).toEqual({ text: 'a small doc' });
  });
});

describe('fetchLinkedDoc — redirect handling', () => {
  it('follows a redirect and re-checks protocol/IP-safety before fetching the target', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ status: 302, headers: { location: 'http://example.com/final.md' } }),
      )
      .mockResolvedValueOnce(
        makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('final content') }),
      );
    const result = await fetchLinkedDoc('http://example.com/start.md');
    expect(result).toEqual({ text: 'final content' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The DNS/private-IP check ran again for the redirect target.
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect whose target resolves to a private IP', async () => {
    lookupMock
      .mockResolvedValueOnce(publicV4()) // first hop: allowed
      .mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]); // redirect target: private
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      makeResponse({ status: 302, headers: { location: 'http://internal.example.com/secret.md' } }),
    );
    const result = await fetchLinkedDoc('http://example.com/start.md');
    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // never followed the unsafe redirect
  });

  it('rejects a redirect to a non-http(s) protocol', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      makeResponse({ status: 302, headers: { location: 'file:///etc/passwd' } }),
    );
    const result = await fetchLinkedDoc('http://example.com/start.md');
    expect(result).toBeUndefined();
  });

  it('follows up to 3 redirect hops and succeeds on the 4th fetch', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(makeResponse({ status: 302, headers: { location: 'http://example.com/1' } }))
      .mockResolvedValueOnce(makeResponse({ status: 302, headers: { location: 'http://example.com/2' } }))
      .mockResolvedValueOnce(makeResponse({ status: 302, headers: { location: 'http://example.com/3' } }))
      .mockResolvedValueOnce(
        makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('reached') }),
      );
    const result = await fetchLinkedDoc('http://example.com/0');
    expect(result).toEqual({ text: 'reached' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects once the redirect hop limit is exceeded', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    // 5 redirects in a row — exceeds the max of 3 hops.
    for (let i = 0; i < 6; i++) {
      fetchMock.mockResolvedValueOnce(
        makeResponse({ status: 302, headers: { location: `http://example.com/${i + 1}` } }),
      );
    }
    const result = await fetchLinkedDoc('http://example.com/0');
    expect(result).toBeUndefined();
  });
});

describe('fetchLinkedDoc — DNS-rebinding TOCTOU pinning', () => {
  it('pins the real connection to the exact IP validated by the DNS check, rather than letting it re-resolve the hostname (which a rebinding attacker could answer differently)', async () => {
    // The validation lookup — the only DNS resolution that's supposed to
    // happen — resolves to a safe public IP.
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('ok') }),
    );

    const result = await fetchLinkedDoc('http://attacker-controlled-dns.example.com/plan.md');
    expect(result).toEqual({ text: 'ok' });

    // Exactly one DNS resolution ever happens. If the fix were missing, the
    // real connection would perform its OWN independent resolution — the
    // TOCTOU gap where an attacker's DNS server answers this second lookup
    // with a different (private/internal) IP than the one just validated.
    expect(lookupMock).toHaveBeenCalledTimes(1);

    // The dispatcher built for the real connection must carry a pinned
    // `connect.lookup`, not fall back to the connector's own DNS resolution
    // of `url.hostname`.
    expect(lastAgentConnectOptions?.lookup).toBeTypeOf('function');
    const pinnedLookupFn = lastAgentConnectOptions!.lookup!;

    // Prove the pin: even though nothing stops a *real* second DNS query for
    // this hostname from answering with a private IP (that's the whole
    // rebinding attack), the pinned lookup never asks — it always returns the
    // address that was already validated, regardless of what hostname/options
    // the connector calls it with.
    const singleCallback = vi.fn();
    pinnedLookupFn('attacker-controlled-dns.example.com', {}, singleCallback);
    expect(singleCallback).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    const allCallback = vi.fn();
    pinnedLookupFn('attacker-controlled-dns.example.com', { all: true }, allCallback);
    expect(allCallback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
  });

  it("pins each redirect hop to that hop's own validated IP, not the previous hop's", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]) // hop 0
      .mockResolvedValueOnce([{ address: '203.0.113.7', family: 4 }]); // redirect target
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ status: 302, headers: { location: 'http://example.com/final.md' } }),
      )
      .mockResolvedValueOnce(
        makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('final') }),
      );

    const result = await fetchLinkedDoc('http://example.com/start.md');
    expect(result).toEqual({ text: 'final' });

    // The dispatcher active for the LAST fetch call (the redirect target) must
    // be pinned to that hop's own validated address, not hop 0's.
    const callback = vi.fn();
    lastAgentConnectOptions!.lookup!('example.com', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '203.0.113.7', 4);
  });
});

describe('fetchLinkedDoc — content-type restriction', () => {
  it('rejects a non-text content type (e.g. application/octet-stream)', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({
        headers: { 'content-type': 'application/octet-stream' },
        chunks: textChunks('binary-ish'),
      }),
    );
    const result = await fetchLinkedDoc('http://example.com/file.bin');
    expect(result).toBeUndefined();
  });

  it('accepts text/markdown', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ headers: { 'content-type': 'text/markdown' }, chunks: textChunks('# Plan') }),
    );
    const result = await fetchLinkedDoc('http://example.com/plan.md');
    expect(result).toEqual({ text: '# Plan' });
  });
});

describe('fetchLinkedDoc — HTML-to-text stripping', () => {
  it('strips tags, scripts, styles, and comments, and decodes basic entities', async () => {
    const html =
      '<html><head><style>body{color:red}</style></head><body>' +
      '<script>alert(1)</script>' +
      '<!-- a comment -->' +
      '<h1>Plan &amp; Scope</h1><p>Do &lt;this&gt; and that.</p>' +
      '</body></html>';
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ headers: { 'content-type': 'text/html' }, chunks: textChunks(html) }),
    );
    const result = await fetchLinkedDoc('http://example.com/plan.html');
    expect(result?.text).toBe('Plan & Scope Do <this> and that.');
  });
});

describe('fetchLinkedDoc — failure returns undefined, never throws', () => {
  it('a thrown network error from fetch() resolves to undefined', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchLinkedDoc('http://example.com/plan.md')).resolves.toBeUndefined();
  });

  it('a non-ok HTTP status resolves to undefined', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ status: 404, ok: false, headers: { 'content-type': 'text/plain' } }),
    );
    await expect(fetchLinkedDoc('http://example.com/missing.md')).resolves.toBeUndefined();
  });

  it('an empty/whitespace-only body resolves to undefined', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeResponse({ headers: { 'content-type': 'text/plain' }, chunks: textChunks('   \n  ') }),
    );
    await expect(fetchLinkedDoc('http://example.com/blank.md')).resolves.toBeUndefined();
  });
});
