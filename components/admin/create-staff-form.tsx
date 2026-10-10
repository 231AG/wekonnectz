"use client";

import { useActionState } from "react";

import { controlClass } from "@/components/admin/console-ui";
import { StaffSubmit } from "@/components/admin/staff-form";
import { FormError } from "@/components/layout/mobile-screen";
import { createStaffAction } from "@/lib/admin/console-actions";

/**
 * Creates a staff account (§7: SUPER_ADMIN). The temporary password is shown once, here only; the
 * new staff member signs in, sets up their authenticator app and then changes it under Your account.
 */
function CreateStaffForm() {
  const [state, dispatch] = useActionState(createStaffAction, {});
  return (
    <form action={dispatch} aria-label="Add staff" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input
          name="email"
          type="email"
          required
          aria-label="Work email"
          placeholder="Work email"
          className={`${controlClass} w-72`}
        />
        <select name="role" defaultValue="MODERATOR" aria-label="Role" className={controlClass}>
          <option value="MODERATOR">Moderator</option>
          <option value="ADMIN">Admin</option>
          <option value="SUPER_ADMIN">Super admin</option>
        </select>
        <StaffSubmit>Create account</StaffSubmit>
      </div>
      <FormError>{state.error}</FormError>
      {state.tempPassword ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-card border border-pending/50 bg-pending/10 p-4 text-[15px]"
        >
          <p className="font-semibold">
            {state.ok} Give {state.email} this temporary password privately. It isn’t shown again.
          </p>
          <code
            className="self-start rounded-md bg-background px-3 py-2 font-mono text-base select-all"
            data-testid="temp-password"
          >
            {state.tempPassword}
          </code>
          <p className="text-sm text-muted-foreground">
            They sign in at /admin/login, set up an authenticator app, then change the password under Your account.
          </p>
        </div>
      ) : null}
    </form>
  );
}

export { CreateStaffForm };
