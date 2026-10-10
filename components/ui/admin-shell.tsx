"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BadgeCheck,
  Camera,
  ChartBar,
  ChartLine,
  CreditCard,
  Flag,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  ScrollText,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type StaffRole = "MODERATOR" | "ADMIN" | "SUPER_ADMIN";
type AdminNavItem = { href: string; label: string; icon: LucideIcon; minRole: StaffRole };

const RANK: Record<StaffRole, number> = { MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
const ROLE_LABEL: Record<StaffRole, string> = { MODERATOR: "Moderator", ADMIN: "Admin", SUPER_ADMIN: "Super admin" };

// Spec §7: moderators do not see payments or settings (owner decision Q9).
const NAV: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: ChartLine, minRole: "MODERATOR" },
  { href: "/admin/users", label: "Users", icon: Users, minRole: "MODERATOR" },
  { href: "/admin/verification", label: "Verification", icon: Camera, minRole: "MODERATOR" },
  { href: "/admin/photos", label: "Photos", icon: ImageIcon, minRole: "MODERATOR" },
  { href: "/admin/reports", label: "Reports", icon: Flag, minRole: "MODERATOR" },
  { href: "/admin/flags", label: "Flags", icon: Shield, minRole: "MODERATOR" },
  { href: "/admin/payments", label: "Payment claims", icon: CreditCard, minRole: "ADMIN" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: BadgeCheck, minRole: "ADMIN" },
  { href: "/admin/transactions", label: "Payments & events", icon: ArrowLeftRight, minRole: "ADMIN" },
  { href: "/admin/analytics", label: "Analytics", icon: ChartBar, minRole: "ADMIN" },
  { href: "/admin/audit", label: "Audit logs", icon: ScrollText, minRole: "ADMIN" },
  { href: "/admin/settings", label: "Settings", icon: Settings, minRole: "ADMIN" },
  { href: "/admin/staff", label: "Staff", icon: UserCog, minRole: "SUPER_ADMIN" },
];

/**
 * Admin console layout (mock-ups: admin 01–03). Navigation filtering is presentation only;
 * every admin route and action re-checks role + MFA on the server.
 */
function AdminShell({
  role,
  staffName,
  activeHref,
  signOut,
  children,
}: {
  role: StaffRole;
  staffName: string;
  /** Defaults to the current URL. */
  activeHref?: string;
  /** Server action that ends the staff session. */
  signOut?: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = activeHref ?? pathname;
  const items = NAV.filter((item) => RANK[role] >= RANK[item.minRole]);
  // Longest matching prefix wins, so /admin/photos highlights Photos, not Dashboard.
  const active = items
    .filter((i) => current === i.href || current.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-border bg-[#111116] px-4 py-6">
        <div className="px-2">
          <p className="font-display text-xl font-bold text-brand-gradient">WeKonnectz</p>
          <p className="text-xs text-muted-foreground">Admin console</p>
        </div>
        <nav aria-label="Admin" className="mt-6 flex-1">
          <ul className="flex flex-col gap-0.5">
            {items.map(({ href, label, icon: Icon }) => {
              const isActive = active === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px]",
                      isActive
                        ? "bg-surface-1 font-bold text-foreground"
                        : "text-muted-foreground hover:bg-surface-1 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="flex flex-col gap-1 border-t border-border px-2 pt-4 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <User className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0 flex-1 break-all">
              {staffName} · {ROLE_LABEL[role]}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/admin/account"
              className="flex min-h-11 flex-1 items-center gap-2 rounded-xl px-2 hover:bg-surface-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <KeyRound className="size-[18px]" strokeWidth={1.6} aria-hidden />
              Your account
            </Link>
            {signOut ? (
              <form action={signOut}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  className="flex size-11 items-center justify-center rounded-full hover:bg-surface-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <LogOut className="size-[18px]" strokeWidth={1.6} aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}

export { AdminShell, type StaffRole };
