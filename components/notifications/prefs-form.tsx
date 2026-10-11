"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { PREF_CATEGORIES, type NotificationPrefs } from "@/lib/domain/notifications";
import { saveNotificationPrefs } from "@/lib/notifications/actions";

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      Save
    </Button>
  );
}

/** One switch per category. Account, review and payment notices are always sent. */
function PrefsForm({ prefs }: { prefs: NotificationPrefs }) {
  const [state, dispatch] = useActionState(saveNotificationPrefs, {});
  return (
    <form action={dispatch} className="flex flex-col gap-3" aria-label="Notification preferences">
      <ul className="flex flex-col gap-2.5">
        {PREF_CATEGORIES.map((c) => (
          <li key={c.key}>
            <label className="flex min-h-11 items-center gap-3.5 rounded-card border border-border bg-surface-1 p-4">
              <span className="flex flex-1 flex-col">
                <span className="font-bold">{c.label}</span>
                <span className="text-[13px] text-muted-foreground">{c.detail}</span>
              </span>
              <input
                type="checkbox"
                name={c.key}
                defaultChecked={prefs[c.key]}
                className="size-6 shrink-0 accent-pending"
                aria-label={c.label}
              />
            </label>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">
        Updates about your account, verification and payments are always sent.
      </p>
      <FormError>{state.error}</FormError>
      {state.ok ? (
        <p role="status" className="text-sm font-semibold text-success">
          {state.ok}
        </p>
      ) : null}
      <Save />
    </form>
  );
}

export { PrefsForm };
