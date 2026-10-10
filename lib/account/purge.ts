import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const PHOTOS = "photos";
const VERIFICATION = "verification";
const QUARANTINE = "photos-quarantine";

/**
 * OD-7 purge: deleted accounts past the retention period lose their files and then their Auth
 * account (which removes every personal row; payments, claims and audit rows stay, unlinked).
 * Returns counts only; never logs ids or paths (§6 rule 7). Nothing runs while OD-7 is unset.
 */
export async function purgeDeletedAccounts(): Promise<{ purged: number; failed: number }> {
  const admin = createAdminClient();
  const { data: due, error } = await admin.rpc("accounts_due_for_purge", { p_limit: 50 });
  if (error) throw new Error("purge list unavailable");
  let purged = 0;
  let failed = 0;
  for (const account of due ?? []) {
    try {
      const { error: contentError } = await admin.rpc("purge_account_content", { p_user: account.user_id });
      if (contentError) throw new Error("content");
      if (account.photo_paths.length) {
        const { error: e } = await admin.storage.from(PHOTOS).remove(account.photo_paths);
        if (e) throw new Error("photos");
      }
      if (account.selfie_paths.length) {
        const { error: e } = await admin.storage.from(VERIFICATION).remove(account.selfie_paths);
        if (e) throw new Error("selfies");
      }
      // Unfinished uploads waiting in quarantine sit under the member's folder.
      const { data: leftovers } = await admin.storage.from(QUARANTINE).list(account.user_id, { limit: 100 });
      if (leftovers?.length) {
        await admin.storage.from(QUARANTINE).remove(leftovers.map((f) => `${account.user_id}/${f.name}`));
      }
      const { error: authError } = await admin.auth.admin.deleteUser(account.user_id);
      if (authError) throw new Error("auth");
      purged += 1;
    } catch {
      // Retried on the next run: the account stays DELETED (hidden) until every step succeeds.
      failed += 1;
    }
  }
  return { purged, failed };
}
