import { controlClass, PageHeader, Panel } from "@/components/admin/console-ui";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { changeStaffPasswordAction } from "@/lib/admin/console-actions";
import { requireStaff } from "@/lib/auth/staff";

export const metadata = { title: "Your account" };

/** Your staff account: change the password (for example the temporary one a super admin gave you). */
export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Your account" subtitle={staff.email} />
      <Panel title="Change password" className="max-w-lg">
        <StaffForm action={changeStaffPasswordAction} label="Change password">
          <input type="email" name="username" autoComplete="username" defaultValue={staff.email} hidden readOnly />
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            aria-label="New password"
            placeholder="New password"
            required
            className={controlClass}
          />
          <input
            type="password"
            name="repeat"
            autoComplete="new-password"
            aria-label="Repeat new password"
            placeholder="Repeat new password"
            required
            className={controlClass}
          />
          <p className="text-sm text-muted-foreground">
            At least 12 characters, with upper and lower case letters and a digit.
          </p>
          <StaffSubmit className="self-start">Change password</StaffSubmit>
        </StaffForm>
      </Panel>
    </div>
  );
}
