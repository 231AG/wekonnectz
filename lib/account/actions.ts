"use server";

import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { stopCardRenewals } from "@/lib/payments/card/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountState = { error?: string };

/**
 * Delete my account (spec §8: from any state except BANNED; hidden at once, data purged after OD-7).
 * A card plan is cancelled at the processor first so it can't renew. The account then leaves every
 * list (BR-7), its sessions end, and Auth refuses it. Payment and audit records are kept (OD-7).
 */
export async function deleteAccountAction(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const member = await requireMember();
  if (
    String(formData.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  ) {
    return { error: "Type DELETE to confirm." };
  }
  // Every card subscription with the processor is stopped first, whatever its state, so nothing can
  // renew on a deleted account. Open checkouts are closed by member_delete_account().
  if (!(await stopCardRenewals(member.id, true))) {
    return { error: "We couldn’t stop your card plan renewing. Try again in a few minutes." };
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc("member_delete_account", { p_user: member.id });
  if (error) return { error: "Couldn’t delete your account. Try again." };
  await (await createClient()).auth.signOut({ scope: "local" });
  redirect("/goodbye");
}
