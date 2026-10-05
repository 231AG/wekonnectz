import Link from "next/link";
import {
  Camera,
  ChartLine,
  CreditCard,
  Flag,
  Image as ImageIcon,
  LogOut,
  Settings,
  Shield,
  User,
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
  { href: "/admin/payments", label: "Payments", icon: CreditCard, minRole: "ADMIN" },
  { href: "/admin/settings", label: "Settings", icon: Settings, minRole: "ADMIN" },
];

/**
 * Admin console layout (mock-ups: admin 01–03). Navigation filtering is presentation only;
 * every admin route and action re-checks role + MFA on the server.
 */
function AdminShell({
  role,
  staffName,
  activeHref,
  children,
}: {
  role: StaffRole;
  staffName: string;
  activeHref: string;
  children: React.ReactNode;
}) {
  const items = NAV.filter((item) => RANK[role] >= RANK[item.minRole]);
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-border bg-[#111116] px-4 py-6">
        <div className="px-2">
          <p className="font-display text-xl font-bold text-brand-gradient">WeKonnectz</p>
          <p className="text-xs text-muted-foreground">Admin console</p>
        </div>
        <nav aria-label="Admin" className="mt-6 flex-1">
          <ul className="flex flex-col gap-1">
            {items.map(({ href, label, icon: Icon }) => {
              const active = activeHref === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px]",
                      active
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
        <div className="flex items-center gap-3 border-t border-border px-2 pt-4 text-xs text-muted-foreground">
          <User className="size-5" strokeWidth={1.6} aria-hidden />
          <span className="flex-1">
            {staffName} · {ROLE_LABEL[role]}
          </span>
          {/* Log out action arrives with staff auth (Phase 3). */}
          <LogOut className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  );
}

export { AdminShell, type StaffRole };
