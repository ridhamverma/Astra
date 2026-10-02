import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type TwScopeProps = {
  children: ReactNode;
  className?: string;
};

export function TwScope({ children, className }: TwScopeProps) {
  return <div className={cn("tw-scope", className)}>{children}</div>;
}
