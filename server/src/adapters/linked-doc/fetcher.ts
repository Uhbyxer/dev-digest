import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent } from 'undici';

/**
 * Fetches a PR-body-linked URL for the intent layer's linked-spec extraction
 * (decision #3 in docs/plans/intent-layer.md). Best-effort, defensive I/O:
 * ANY failure — rejected protocol, private/loopback host, timeout, oversized
 * body, disallowed content-type, network error — returns `undefined`, never
 * throws. This mirrors run-executor.ts's existing pattern for repoIntel
 * fallbacks: enrichment that degrades gracefully rather than failing the run.
 *
 * SSRF guard (basic, no allowlist — see docs/adr/0002-linked-doc-trust-tier.md):
 * only http(s) protocols, only public IPs (loopback/link-local/private ranges
 * rejected), redirects followed manually (max 3 hops) with the same checks
 * re-run per hop. This is the security skill's standard SSRF mitigation list,
 * not a design invented here — a full security review of it is out of scope
 * for this plan.
 *
 * DNS-rebinding TOCTOU fix: resolving `url.hostname` for the allowlist check
 * and then calling the global `fetch(url, ...)` with the bare hostname is
 * unsafe, because undici (both the `undici` package and Node's built-in
 * `fetch`) performs its OWN independent DNS resolution when opening the
 * socket — an attacker's DNS server can answer the validation lookup with a
 * safe public IP and the connection lookup (moments later) with a private/
 * cloud-metadata IP, bypassing the check entirely. The fix: resolve once via
 * `resolveAllowedAddresses`, validate those addresses, then PIN the actual
 * socket to those exact IPs via a per-request undici `Agent` whose `connect`
 * option overrides `lookup` (a standard `net`/`tls` connect option, forwarded
 * by undici's connector) to return only the pre-validated addresses — no
 * second, attacker-controllable resolution ever happens. The `Host` header
 * and TLS SNI are untouched (`lookup` only changes which IP the TCP socket
 * connects to), so this is transparent to the server being fetched. Every
 * redirect hop builds its own pinned `Agent` from that hop's own validated
 * addresses, closed after the hop completes.
 */

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 200 * 1024; // ~200KB
const MAX_REDIRECTS = 3;

export interface FetchedDoc {
  text: string;
}

function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true; // malformed → reject
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateOrLoopbackIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true; // loopback
  if (lower === '::') return true; // unspecified address
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local (fc00::/7)
  if (lower.startsWith('2002:')) return true; // 6to4 (2002::/16) — tunnels an embedded IPv4 address
  if (lower.startsWith('2001:0:') || lower.startsWith('2001:0000:') || lower.startsWith('2001::')) return true; // Teredo (2001::/32) — tunnels an embedded IPv4 address
  if (lower.startsWith('64:ff9b::')) return true; // NAT64 (64:ff9b::/96) — synthesizes an embedded IPv4 address
  if (lower.startsWith('ff')) return true; // multicast (ff00::/8)
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — check the embedded IPv4 address.
    const v4 = lower.slice('::ffff:'.length);
    if (isIP(v4) === 4) return isPrivateOrLoopbackIPv4(v4);
  }
  return false;
}

function isPrivateOrLoopback(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateOrLoopbackIPv4(ip);
  if (family === 6) return isPrivateOrLoopbackIPv6(ip);
  return true; // not a recognizable IP → reject defensively
}

interface ResolvedAddress {
  address: string;
  family: number;
}

/**
 * Reject non-http(s) protocols; resolve the hostname and reject it if ANY
 * resolved address is private/loopback/link-local/etc. Returns the resolved
 * addresses (to be pinned to the actual connection via `pinnedDispatcher`)
 * rather than a boolean — the caller must use these exact addresses for the
 * real connection, not re-resolve the hostname, or the check is a TOCTOU no-op.
 */
async function resolveAllowedAddresses(url: URL): Promise<ResolvedAddress[] | undefined> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0) return undefined;
    if (addresses.some((a) => isPrivateOrLoopback(a.address))) return undefined;
    return addresses;
  } catch {
    return undefined;
  }
}

/**
 * Builds a one-shot undici `Agent` whose actual TCP connection is forced to
 * `addresses` (the ones already validated by `resolveAllowedAddresses`) via a
 * custom `connect.lookup` — the same option `net.connect`/`tls.connect`
 * accept, forwarded through undici's connector. This is what pins the
 * connection: undici's default connector would otherwise re-run its own DNS
 * resolution against `url.hostname` at connect time, independent of (and
 * possibly answered differently than) the lookup above. The hostname itself
 * is untouched — it still drives the `Host` header and TLS SNI — only which
 * IP the socket physically connects to is overridden. Caller must `.close()`
 * this once the request (including body read) is done.
 */
const pinnedLookup =
  (addresses: ResolvedAddress[]): LookupFunction =>
  (_hostname, options, callback) => {
    if (options.all) {
      callback(null, addresses);
    } else {
      const [first] = addresses;
      callback(null, first?.address ?? '', first?.family);
    }
  };

function pinnedDispatcher(addresses: ResolvedAddress[]): Agent {
  return new Agent({ connect: { lookup: pinnedLookup(addresses) } });
}

/** Minimal, dependency-free HTML→text: strip tags/scripts/styles, collapse whitespace. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read the response body up to `MAX_BYTES`, aborting the stream once exceeded. */
async function readCappedBody(res: Response): Promise<string | undefined> {
  const reader = res.body?.getReader();
  if (!reader) return undefined;
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel().catch(() => undefined);
        return undefined; // oversized — bail rather than truncate silently mid-tag
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return undefined;
  }
}

async function fetchOnce(url: URL): Promise<{ next: URL } | { text: string } | undefined> {
  const addresses = await resolveAllowedAddresses(url);
  if (!addresses) return undefined;

  const dispatcher = pinnedDispatcher(addresses);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Cast: the installed `undici` package's `Agent` type and the global `fetch`
    // typings' `Dispatcher` type (sourced from the separate `undici-types`
    // package bundled with @types/node) are structurally near-identical but
    // pinned to different undici versions, so TS sees a nominal mismatch in
    // deeply-nested generic fields (e.g. `FormData`) that doesn't reflect an
    // actual runtime incompatibility — `Agent` implements the `Dispatcher`
    // interface `fetch` expects at runtime (verified: a custom `connect.lookup`
    // on this `Agent` does get used to pin the real connection).
    const res = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      dispatcher: dispatcher as unknown as NonNullable<RequestInit['dispatcher']>,
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return undefined;
      try {
        return { next: new URL(location, url) };
      } catch {
        return undefined;
      }
    }

    if (!res.ok) return undefined;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('text/')) return undefined;

    const body = await readCappedBody(res);
    if (body === undefined) return undefined;

    return { text: contentType.includes('html') ? htmlToText(body) : body };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
    await dispatcher.close().catch(() => undefined);
  }
}

export async function fetchLinkedDoc(url: string): Promise<FetchedDoc | undefined> {
  let current: URL;
  try {
    current = new URL(url);
  } catch {
    return undefined;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await fetchOnce(current);
    if (!result) return undefined;
    if ('text' in result) {
      return result.text.trim().length > 0 ? { text: result.text } : undefined;
    }
    current = result.next;
  }
  return undefined; // too many redirects
}
