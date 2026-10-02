"use client";
import { useEffect, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading, error, refresh } = useAuth();
  const router = useRouter(); const pathname = usePathname();
  useEffect(() => { if (!loading && !user && !error) router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`); }, [loading, user, error, router, pathname]);
  if (loading || !user) return <section className="mx-auto max-w-xl p-12 text-slate-600">{error ? <><p role="alert">{error}</p><button onClick={() => void refresh()} className="mt-4 text-indigo-700">Retry</button></> : "Checking your session…"}</section>;
  return <div key={user.id}>{children}</div>;
}
