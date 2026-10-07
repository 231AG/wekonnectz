import "server-only";

import { redirect } from "next/navigation";

import type { StaffRole } from "@/components/ui/admin-shell";
import { createClient } from "@/lib/supabase/server";

/**
 * Staff sessions (spec §7, OD-27: email + password + TOTP). Read from Supabase Auth and the database
 * on every call. The database's is_staff() checks the same things again (role + aal2) inside every
 * staff function, so a page that forgot this call still could not read or change anything.
 */

export type Staff = { id: string; email: string; role: StaffRole };

const RANK: Record<StaffRole, number> = { MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

type StaffSession = { id: string; email: string; role: StaffRole | null; aal: "aal1" | "aal2" | null };

/** The signed-in account's staff role (null for members or restricted staff) and MFA level. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: role }, { data: aal }] = await Promise.all([
    supabase.rpc("current_staff_role"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  // A staff session must start with the password (email magic links and codes also exist once the
  // email provider is on; they never count). aal2 also needs a TOTP code in the same session.
  const methods = new Set((aal?.currentAuthenticationMethods ?? []).map((m) => (typeof m === "string" ? m : m.method)));
  const viaPassword = methods.has("password");
  return {
    id: user.id,
    email: user.email ?? "",
    role: viaPassword && role && role !== "USER" ? role : null,
    aal: !viaPassword ? null : aal?.currentLevel === "aal2" && methods.has("totp") ? "aal2" : "aal1",
  };
}

/** For admin pages and actions: a staff account at or above minRole, with a verified TOTP (aal2). */
export async function requireStaff(minRole: StaffRole = "MODERATOR"): Promise<Staff> {
  const session = await getStaffSession();
  if (!session?.role) redirect("/admin/login");
  if (session.aal !== "aal2") redirect("/admin/mfa");
  if (RANK[session.role] < RANK[minRole]) redirect("/admin");
  return { id: session.id, email: session.email, role: session.role };
}
