const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

let csrfToken = "";
let sessionGeneration = 0;
export function setCsrfToken(value: string) {
  if (value !== csrfToken) sessionGeneration++;
  csrfToken = value;
}
export function getSessionGeneration() { return sessionGeneration; }

// Share only simultaneous identical mutations. Never retry a write: a network
// failure does not prove the server failed to commit it.
const mutations = new Map<string, Promise<unknown>>();

export interface ApiIssue {
  code: string;
  path: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly issues: ApiIssue[] = [], public readonly status = 0) {
    super(message);
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method?.toUpperCase() ?? "GET";
  const key = !["GET", "HEAD", "OPTIONS"].includes(method) && !options?.signal &&
    (options?.body == null || typeof options.body === "string")
    ? JSON.stringify([sessionGeneration, method, path, options?.body ?? "", Array.from(new Headers(options?.headers).entries())])
    : null;
  if (key && mutations.has(key)) return mutations.get(key) as Promise<T>;
  const pending = performRequest<T>(path, method, options);
  if (!key) return pending;
  mutations.set(key, pending);
  try { return await pending; }
  finally { if (mutations.get(key) === pending) mutations.delete(key); }
}

async function performRequest<T>(path: string, method: string, options?: RequestInit): Promise<T> {
  const generation = sessionGeneration;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), ["GET", "HEAD"].includes(method) ? 15_000 : 120_000);
  let response: Response;
  try {
    const headers = new Headers(options?.headers);
    if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-Astra-CSRF", csrfToken);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, signal, credentials: "include", cache: "no-store" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      if (timeout.signal.aborted || options?.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      const issues: ApiIssue[] = Array.isArray(body?.error?.details) ? body.error.details.filter((issue: unknown): issue is ApiIssue =>
        issue !== null && typeof issue === "object" && "code" in issue && typeof issue.code === "string" &&
        "path" in issue && typeof issue.path === "string" && "message" in issue && typeof issue.message === "string") : [];
      if (response.status === 401 && generation === sessionGeneration && path !== "/api/v1/auth/me" && typeof window !== "undefined") window.dispatchEvent(new Event("astra:unauthorized"));
      const message = typeof body?.error?.message === "string" ? body.error.message : `Request failed (${response.status})`;
      throw new ApiRequestError(message, issues, response.status);
    }
    if (response.status === 204) return undefined as T;
    try { return await response.json() as T; }
    catch {
      if (timeout.signal.aborted || options?.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
      throw new ApiRequestError("The Astra backend returned an unreadable response. Try again.", [], response.status);
    }
  } catch (cause) {
    if (cause instanceof ApiRequestError) throw cause;
    if (options?.signal?.aborted) throw cause;
    if (timeout.signal.aborted) throw new ApiRequestError("The Astra backend request timed out. Check the connection before trying again.");
    throw new ApiRequestError("Could not reach the Astra backend. Check that it is running.");
  } finally { clearTimeout(timer); }
}

export function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
