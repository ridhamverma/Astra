"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { DashboardShell } from "./dashboard/shell";
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/simulator") return <>{children}</>;
  if (["/dashboard", "/projects", "/settings"].includes(pathname)) return <DashboardShell>{children}</DashboardShell>;
  return <><SiteHeader /><main className="min-h-[calc(100vh-73px)]">{children}</main></>;
}
