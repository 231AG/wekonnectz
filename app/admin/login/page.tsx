import { redirect } from "next/navigation";

import { AdminAuthFrame } from "@/components/admin/auth-frame";
import { StaffLoginForm } from "@/components/admin/staff-auth-forms";
import { staffSignIn } from "@/lib/auth/actions/staff";
import { getStaffSession } from "@/lib/auth/staff";

export const metadata = { title: "Staff sign-in" };

/** Spec §7 / OD-27: staff accounts sign in with email + password, then TOTP. Members use /login. */
export default async function StaffLoginPage() {
  const session = await getStaffSession();
  if (session?.role) redirect(session.aal === "aal2" ? "/admin" : "/admin/mfa");
  return (
    <AdminAuthFrame title="Staff sign-in" lead="For WeKonnectz staff accounts only.">
      <StaffLoginForm action={staffSignIn} />
    </AdminAuthFrame>
  );
}
