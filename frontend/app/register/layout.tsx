import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Sign up | Astra" };

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return <main>{children}</main>;
}
