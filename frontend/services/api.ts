const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");

let csrfToken = "";
export function setCsrfToken(value: string) { csrfToken = value; }

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
  let response: Response;
  try {
    const headers = new Headers(options?.headers);
    if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(options?.method?.toUpperCase() ?? "GET")) headers.set("X-Astra-CSRF", csrfToken);
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: "include", cache: "no-store" });
  } catch {
    throw new ApiRequestError("Could not reach the Astra backend. Check that it is running.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const issues: ApiIssue[] = Array.isArray(body?.error?.details) ? body.error.details : [];
    if (response.status === 401 && path !== "/api/v1/auth/me" && typeof window !== "undefined") window.dispatchEvent(new Event("astra:unauthorized"));
    throw new ApiRequestError(body?.error?.message ?? `Request failed (${response.status})`, issues, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
