"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavLinkProps {
  href: string;
  label: string;
  icon?: IconSvgElement;
  disabled?: boolean;
}

export function NavLink({ href, label, icon, disabled }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  if (disabled) {
    return (
      <span className="px-3 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed inline-flex items-center gap-1.5">
        {icon && <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />}
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md transition-colors inline-flex items-center gap-1.5",
        "hover:text-foreground hover:bg-accent/50",
        isActive ? "text-foreground bg-accent/30 font-medium" : "text-muted-foreground",
      )}
    >
      {icon && <HugeiconsIcon icon={icon} size={14} strokeWidth={2} />}
      {label}
    </Link>
  );
}
