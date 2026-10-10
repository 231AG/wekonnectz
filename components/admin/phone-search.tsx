"use client";

import { useActionState } from "react";

import { controlClass } from "@/components/admin/console-ui";
import { StaffSubmit } from "@/components/admin/staff-form";
import { findByPhoneAction } from "@/lib/admin/console-actions";

/** Find a member by phone. Posted, so the number never appears in a URL (§6 rule 7). */
function PhoneSearch() {
  const [state, dispatch] = useActionState(findByPhoneAction, {});
  return (
    <form action={dispatch} aria-label="Find by phone" className="flex flex-wrap items-start gap-3">
      <input
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        aria-label="Phone number"
        placeholder="Phone, e.g. 0770 123 456"
        className={`${controlClass} w-64`}
      />
      <StaffSubmit variant="secondary">Find by phone</StaffSubmit>
      {state.error ? (
        <p role="alert" className="basis-full text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export { PhoneSearch };
