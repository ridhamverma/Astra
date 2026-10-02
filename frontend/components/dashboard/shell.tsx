"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { authApi } from "@/services/auth";
import { Icon } from "./icon";
import styles from "./workspace.module.css";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const { user, setUser } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true); setError("");
    try { await authApi.logout(); setUser(null); router.replace("/login"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out."); setBusy(false); }
  }
  const name = user?.display_name || user?.email || "Your workspace";
  return <div className={styles.shell}>
    <div className={styles.mobileBar}><Link href="/dashboard" className={styles.brand}><Image src="/astra-logo.png" alt="" width={28} height={28} />Astra</Link><button className={styles.iconButton} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="workspace-sidebar" onClick={() => setMobileOpen(!mobileOpen)}><Icon name={mobileOpen ? "close" : "menu"} /></button></div>
    <aside id="workspace-sidebar" className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
      <Link href="/dashboard" className={styles.brand}><Image src="/astra-logo.png" alt="Astra logo" width={34} height={34} />Astra</Link>
      <p className={styles.workspaceLabel}>WORKSPACE</p>
      <nav aria-label="Workspace navigation" className={styles.nav}>
        {([{ href: "/dashboard", label: "Recents", icon: "recent" }, { href: "/projects", label: "Projects", icon: "projects" }, { href: "/settings", label: "Settings", icon: "settings" }] as const).map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={pathname === item.href ? styles.active : ""} onClick={() => setMobileOpen(false)}><Icon name={item.icon} />{item.label}</Link>)}
      </nav>
      <div className={styles.sidebarBottom}><div className={styles.user}><span className={styles.avatar}>{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong><span title={user?.email}>{user?.email}</span></div></div><button className={styles.signOut} disabled={busy} onClick={() => void signOut()}><Icon name="logout" />{busy ? "Signing out…" : "Sign out"}</button>{error && <p role="alert" className={styles.errorText}>{error}</p>}</div>
    </aside>
    <main className={styles.main}>{children}</main>
  </div>;
}
