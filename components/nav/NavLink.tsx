"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavLinkProps {
  href: string;
  label: string;
  disabled?: boolean;
}

export function NavLink({ href, label, disabled }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  if (disabled) {
    return (
      <span className="px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors",
        "hover:text-foreground hover:bg-accent/50",
        isActive ? "text-foreground bg-accent/30 font-medium" : "text-muted-foreground",
      )}
    >
      {label}
      {isActive && <span className="absolute -bottom-px left-3 right-3 h-px bg-foreground" />}
    </Link>
  );
}
