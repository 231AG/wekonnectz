import "server-only";

import { deliverPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";

/** Daily reminders (§16): a pass about to end, a card plan about to renew. Each is sent once. */
export async function sendReminders(): Promise<{ passExpiring: number; cardRenewals: number; pushed: number }> {
  const admin = createAdminClient();
  const [pass, card] = await Promise.all([
    admin.rpc("send_pass_expiry_warnings"),
    admin.rpc("send_card_renewal_reminders"),
  ]);
  if (pass.error || card.error) throw new Error("reminders failed");
  return { passExpiring: pass.data ?? 0, cardRenewals: card.data ?? 0, pushed: await deliverPush() };
}
