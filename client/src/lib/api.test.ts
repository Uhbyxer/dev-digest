import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, ApiError } from "./api";

// A fetch stub that never settles until its AbortSignal fires, mirroring a
// stalled/slow backend request (see the conventions-scan hang: a synchronous
// endpoint that can legitimately take minutes, with no client-side timeout).
function hangingFetch(): typeof fetch {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        reject(err);
      });
    });
  }) as unknown as typeof fetch;
}

describe("apiFetch timeoutMs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects with a timeout ApiError once timeoutMs elapses on a request that never settles", async () => {
    vi.stubGlobal("fetch", hangingFetch());

    const pending = apiFetch("/repos/r1/conventions/scan", {
      method: "POST",
      timeoutMs: 1000,
    });
    // Attach a catch handler synchronously so the timer-driven rejection above
    // never surfaces as an unhandled rejection while fake timers are advanced.
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ApiError",
      code: "timeout",
    });

    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("does not time out a request that resolves before timeoutMs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await apiFetch("/repos/r1/conventions", { timeoutMs: 1000 });
    expect(result).toEqual({ ok: true });
  });
});
