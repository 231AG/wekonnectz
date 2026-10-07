import { AdminShell } from "@/components/ui/admin-shell";
import { staffSignOut } from "@/lib/auth/actions/staff";
import { requireStaff } from "@/lib/auth/staff";

/**
 * Admin console frame. The layout check is a convenience: layouts don't re-run on every navigation,
 * so each page and action calls requireStaff() itself, and every staff database function checks
 * is_staff() (role + aal2) again.
 */
export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const staff = await requireStaff();
  return (
    <AdminShell role={staff.role} staffName={staff.email} signOut={staffSignOut}>
      {children}
    </AdminShell>
  );
}
