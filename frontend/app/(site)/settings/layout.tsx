import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth-guard";
export default function SettingsLayout({ children }: { children: ReactNode }) { return <AuthGuard>{children}</AuthGuard>; }
