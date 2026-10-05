"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, Heart, House, MessageCircle, User, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

const ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/relationship", label: "Relationship", icon: Heart },
  { href: "/casual", label: "Casual", icon: Flame },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/me", label: "Profile", icon: User },
];

/** Member bottom navigation (mock-ups: member 01–05). */
function BottomNav({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  const current = activeHref ?? pathname;
  return (
    <nav aria-label="Main" className="border-t border-border bg-background">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = current === href || current.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[68px] flex-col items-center justify-center gap-1 text-xs font-semibold",
                  active ? "text-pending" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={1.6} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { BottomNav };
