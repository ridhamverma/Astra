import { request, json, setCsrfToken } from "./api";
export interface AuthUser { id: string; email: string; display_name: string | null }
export interface AuthResponse { user: AuthUser; csrf_token: string }
async function accept(promise: Promise<AuthResponse>) {
  const data = await promise; setCsrfToken(data.csrf_token); return data.user;
}
export const authApi = {
  me: () => request<AuthResponse>("/api/v1/auth/me"),
  login: (email: string, password: string) => accept(request<AuthResponse>("/api/v1/auth/login", json({ email, password }))),
  register: (email: string, password: string, display_name: string) => accept(request<AuthResponse>("/api/v1/auth/register", json({ email, password, display_name }))),
  logout: async () => { await request<void>("/api/v1/auth/logout", { method: "POST" }); setCsrfToken(""); },
};
