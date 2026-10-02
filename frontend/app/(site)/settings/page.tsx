"use client";
import { useAuth } from "@/components/auth-provider";
import { Notifications } from "@/components/dashboard/notifications";
import styles from "@/components/dashboard/workspace.module.css";
export default function SettingsPage() {
  const { user } = useAuth();
  return <section className={styles.page}><header className={styles.pageHeader}><div><p className={styles.eyebrow}>YOUR WORKSPACE</p><h1>Settings</h1><p className={styles.subtitle}>Your Astra account and workspace.</p></div><Notifications /></header><section className={styles.settingsCard}><h2>Account</h2><dl><div><dt>Name</dt><dd>{user?.display_name || "Not provided"}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div></dl><p className={styles.muted}>Your projects and simulation history are private to your account.</p></section></section>;
}
