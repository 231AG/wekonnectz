"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { deleteAccountAction } from "@/lib/account/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" disabled={pending}>
      {pending ? "Deleting…" : "Delete my account"}
    </Button>
  );
}

/** Asks the member to type DELETE, so an account is never deleted by a stray tap. */
function DeleteAccountForm() {
  const [state, dispatch] = useActionState(deleteAccountAction, {});
  return (
    <form action={dispatch} className="flex flex-col gap-3" aria-label="Delete account">
      <Label htmlFor="confirm">Type DELETE to confirm</Label>
      <Input
        id="confirm"
        name="confirm"
        autoComplete="off"
        autoCapitalize="characters"
        aria-describedby="delete-error"
      />
      <FormError id="delete-error">{state.error}</FormError>
      <Submit />
    </form>
  );
}

export { DeleteAccountForm };
