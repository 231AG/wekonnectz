"use server";

import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/session";
import { cancelCardSubscription } from "@/lib/payments/card/server";
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
  const admin = createAdminClient();
  const { data: card } = await admin.rpc("member_card_subscription", { p_user: member.id });
  const live = card?.[0];
  if (live && ["ACTIVE", "PAYMENT_FAILED", "CANCELLED"].includes(live.status) && !live.cancel_at_period_end) {
    if (!(await cancelCardSubscription(member.id))) {
      return { error: "We couldn’t stop your card plan renewing. Try again in a few minutes." };
    }
  }
  const { error } = await admin.rpc("member_delete_account", { p_user: member.id });
  if (error) return { error: "Couldn’t delete your account. Try again." };
  await (await createClient()).auth.signOut({ scope: "local" });
  redirect("/goodbye");
}
