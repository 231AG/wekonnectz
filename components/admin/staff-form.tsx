"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import type { StaffActionState } from "@/lib/admin/report-actions";
import { cn } from "@/lib/utils";

const PendingContext = createContext(false);

/**
 * A staff decision form: posts to a server action and shows its error or confirmation. Submitted by
 * hand (not the `action` prop) so a refused form keeps what was typed — a reason, an edited setting —
 * and is cleared only after it succeeds.
 */
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
  const [state, dispatch, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form
      ref={form}
      // Before hydration a submit must still be a POST: a GET would put passwords or dates in the URL.
      method="post"
      aria-label={label}
      className={cn("flex flex-col gap-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        // Include the clicked button's name/value (e.g. Dismiss vs Resolve), as a native submit would.
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(data));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
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
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" size="md" {...props} disabled={pending || props.disabled}>
      {children}
    </Button>
  );
}

export { StaffForm, StaffSubmit };
