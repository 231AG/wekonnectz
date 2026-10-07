import { redirect } from "next/navigation";

import { AdminAuthFrame } from "@/components/admin/auth-frame";
import { CodeForm, TotpEnrolment } from "@/components/admin/staff-auth-forms";
import { Button } from "@/components/ui/button";
import { staffSignOut, startTotpEnrolment, verifyTotp } from "@/lib/auth/actions/staff";
import { getStaffSession } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Two-step check" };

/** Second step of staff sign-in (OD-27): every admin route and staff function needs aal2. */
export default async function StaffMfaPage() {
  const session = await getStaffSession();
  if (!session?.role) redirect("/admin/login");
  if (session.aal === "aal2") redirect("/admin");

  const { data: factors } = await (await createClient()).auth.mfa.listFactors();
  const enrolled = (factors?.totp.length ?? 0) > 0;
  return (
    <AdminAuthFrame
      title={enrolled ? "Enter your code" : "Set up two-step sign-in"}
      lead={
        enrolled
          ? "Open your authenticator app and enter the 6-digit code for WeKonnectz."
          : "Staff accounts need an authenticator app. You’ll use it every time you sign in."
      }
    >
      {enrolled ? (
        <CodeForm action={verifyTotp} label="6-digit code" />
      ) : (
        <TotpEnrolment start={startTotpEnrolment} verify={verifyTotp} />
      )}
      <form action={staffSignOut}>
        <Button type="submit" variant="ghost" size="md" className="w-full">
          Cancel and sign out
        </Button>
      </form>
    </AdminAuthFrame>
  );
}
