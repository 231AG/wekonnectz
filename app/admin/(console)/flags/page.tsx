import Link from "next/link";

import { MemberActions } from "@/components/admin/member-actions";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { Badge } from "@/components/ui/badge";
import { resolveFlagAction } from "@/lib/admin/report-actions";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { accountRef } from "@/lib/safety/categories";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Flags" };

/** What each automatic signal means for the moderator (spec §17 behaviour signals; Q23). */
const REASONS: Record<string, { label: string; hint: string }> = {
  MANY_REPORTS: {
    label: "Many reports",
    hint: "Several members reported this account within 24 hours. Check the Reports queue.",
  },
  MONEY_TERMS: {
    label: "Money terms in a message",
    hint: "A message mentioned prices, payment or a money request. It was delivered. Message text is shown only through a member's report.",
  },
  AGE_DOUBT: {
    label: "Doubt about age",
    hint: "A selfie was rejected because the member may be under 18. Check the profile and photos.",
  },
};

/**
 * Spec §21 Flags queue: automatic signals waiting for a person. Flags never act on an account by
 * themselves (§17: no automatic ban from signals alone); resolving one is audited (BR-34).
 */
const RANK = { MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;

export default async function FlagsPage() {
  const staff = await requireStaff();
  const isAdmin = RANK[staff.role] >= RANK.ADMIN;
  const { data, error } = await (await createClient()).rpc("staff_flags_queue", { p_limit: 200 });
  const flags = error ? [] : (data ?? []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Flags</h1>
        <p className="text-muted-foreground">Automatic signals · oldest first · nothing happens without a person</p>
      </div>
      {error ? <p role="alert">The queue couldn’t load. Refresh to try again.</p> : null}
      {flags.length === 0 && !error ? <p className="text-muted-foreground">No open flags.</p> : null}
      <ul className="flex max-w-4xl flex-col gap-3">
        {flags.map((f) => {
          const reason = REASONS[f.reason] ?? { label: f.reason, hint: "" };
          return (
            <li key={f.flag_id} className="flex items-start gap-6 rounded-card border border-border bg-surface-1 p-5">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={f.reason === "AGE_DOUBT" ? "danger" : "pending"}>{reason.label}</Badge>
                  <span className="font-bold">
                    {f.account_id ? accountRef(f.account_id) : f.entity_type.toLowerCase()}
                  </span>
                  {f.display_name ? <span className="text-muted-foreground">{f.display_name}</span> : null}
                  {f.account_status ? (
                    <span className="text-sm text-muted-foreground">· {f.account_status.toLowerCase()}</span>
                  ) : null}
                  {f.hidden_reason ? <Badge tone="danger">Hidden</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {reason.hint} Raised {timeAgo(f.created_at)}.
                </p>
                {f.account_id ? (
                  <>
                    <Link
                      href={`/admin/reports?member=${f.account_id}&closed=1`}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center self-start text-sm font-semibold underline underline-offset-4"
                    >
                      Reports about this account
                    </Link>
                    {f.stored_status ? (
                      <div className="max-w-md">
                        <MemberActions
                          userId={f.account_id}
                          storedStatus={f.stored_status}
                          suspendedUntil={f.suspended_until}
                          hiddenReason={f.hidden_reason}
                          isAdmin={isAdmin}
                        />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
              <StaffForm action={resolveFlagAction} label={`Flag ${reason.label}`} className="shrink-0">
                <input type="hidden" name="flagId" value={f.flag_id} />
                <div className="flex gap-3">
                  <StaffSubmit name="outcome" value="dismiss" variant="outline">
                    Dismiss
                  </StaffSubmit>
                  <StaffSubmit name="outcome" value="resolve">
                    Resolve
                  </StaffSubmit>
                </div>
              </StaffForm>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
