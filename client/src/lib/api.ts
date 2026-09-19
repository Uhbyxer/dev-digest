/* api.ts — typed fetch client for the F1 Fastify engine (localhost:3001).
   All hooks build on `apiFetch`. Errors are normalized to ApiError so the
   error-UX taxonomy (toast/inline/full-screen) can branch on status. */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type ApiFetchInit = RequestInit & {
  /** Aborts the request after this many ms, rejecting with an ApiError(code: "timeout").
   *  Opt-in per call — most CRUD calls are fast enough to rely on the caller/browser
   *  giving up on their own; long-running synchronous endpoints (e.g. a scan that runs
   *  several LLM calls inline) need one so the caller doesn't hang indefinitely with no
   *  feedback. */
  timeoutMs?: number;
};

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      signal: controller?.signal ?? rest.signal,
      headers: {
        // Only declare a JSON body when one is actually sent — otherwise a
        // body-less POST/PUT (e.g. tour generate, refresh, reindex) trips
        // Fastify's "Body cannot be empty when content-type is application/json".
        // A FormData body (file upload) never gets this header — the browser
        // must set its own `multipart/form-data; boundary=...`.
        ...(rest.body != null && !(rest.body instanceof FormData)
          ? { "content-type": "application/json" }
          : {}),
        ...(rest.headers ?? {}),
      },
    });
  } catch (e) {
    if (controller?.signal.aborted) {
      throw new ApiError(
        "This is taking longer than expected. It may still finish in the background — try refreshing in a bit.",
        0,
        "timeout",
        e
      );
    }
    // network failure / API down → full-screen error candidate
    throw new ApiError(
      `Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`,
      0,
      "network_error",
      e
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let code: string | undefined;
    let message = `${res.status} ${res.statusText}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * A multipart form-data upload (the skill import flow's file upload). Never
 * JSON-encoded and never assigns its own `content-type` — the browser sets
 * the multipart boundary automatically when the body is a FormData instance.
 */
export async function apiFetchForm<T>(path: string, form: FormData): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: form });
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown, opts?: { timeoutMs?: number }) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: opts?.timeoutMs,
    }),
  postForm: <T>(path: string, form: FormData) => apiFetchForm<T>(path, form),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
