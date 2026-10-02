"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authApi, type AuthUser } from "@/services/auth";
import { ApiRequestError, setCsrfToken } from "@/services/api";
interface AuthState { user: AuthUser | null; loading: boolean; error: string; setUser: (user: AuthUser | null) => void; refresh: () => Promise<void> }
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const version = useRef(0);
  const setUser = useCallback((next: AuthUser | null) => {
    version.current++; // Cancel older session reads when login/logout changes identity.
    updateUser(next); setLoading(false); setError("");
    if (!next) setCsrfToken("");
  }, []);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try {
      const data = await authApi.me();
      if (current !== version.current) return;
      updateUser(data.user); setCsrfToken(data.csrf_token); setError("");
    } catch (cause) {
      if (current !== version.current) return;
      updateUser(null); setCsrfToken("");
      setError(cause instanceof ApiRequestError && cause.status === 401 ? "" : "Could not verify your session. Check the backend and retry.");
    } finally { if (current === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
    const unauthorized = () => setUser(null);
    const focused = () => { void refresh(); };
    window.addEventListener("astra:unauthorized", unauthorized);
    window.addEventListener("focus", focused);
    // This is a request-generation counter, not a DOM ref; cleanup invalidates the latest request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { version.current++; window.removeEventListener("astra:unauthorized", unauthorized); window.removeEventListener("focus", focused); };
  }, [refresh, setUser]);
  return <Context.Provider value={{user, loading, error, setUser, refresh}}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("AuthProvider is missing"); return value; }
