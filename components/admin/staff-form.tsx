"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import type { StaffActionState } from "@/lib/admin/report-actions";
import { cn } from "@/lib/utils";

/** A staff decision form: posts to a server action and shows its error or confirmation. */
function StaffForm({
  action,
  children,
  className,
  label,
}: {
  action: (prev: StaffActionState, formData: FormData) => Promise<StaffActionState>;
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the form. */
  label: string;
}) {
  const [state, dispatch] = useActionState(action, {});
  return (
    <form action={dispatch} aria-label={label} className={cn("flex flex-col gap-3", className)}>
      {children}
      <FormError>{state.error}</FormError>
      {state.ok ? (
        <p role="status" className="text-sm font-semibold text-success">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}

/** Submit button that disables itself while its form is posting. */
function StaffSubmit({ children, ...props }: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" {...props} disabled={pending || props.disabled}>
      {children}
    </Button>
  );
}

export { StaffForm, StaffSubmit };
