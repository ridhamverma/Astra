"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { authApi } from "@/services/auth";
import { navigation } from "@/lib/navigation";

export function SiteHeader() {
  const { user, loading, setUser } = useAuth();
  const [error, setError] = useState("");
  async function logout() { try { await authApi.logout(); setUser(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out"); } }
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-[1720px] flex-wrap items-center gap-6 px-6 py-5">
        <Link href="/" className="text-xl font-bold tracking-tight text-indigo-700">Astra</Link>
        <div className="flex flex-wrap gap-5 text-sm text-slate-600">
          {navigation.map(({ href, label }) => (
            <Link className="hover:text-indigo-700" href={href} key={href}>{label}</Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4 text-sm">{!loading && (user ? <><span className="text-slate-600">{user.display_name ?? user.email}</span><button onClick={() => void logout()} className="font-semibold text-indigo-600">Sign out</button></> : <Link href="/login" className="font-semibold text-indigo-600">Sign in</Link>)}</div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </nav>
    </header>
  );
}
