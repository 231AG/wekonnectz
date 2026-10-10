import Link from "next/link";

import {
  Cell,
  controlClass,
  DataTable,
  FilterChip,
  PageHeader,
  Panel,
  Row,
  titleCase,
  when,
} from "@/components/admin/console-ui";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { extendSubscriptionAction } from "@/lib/admin/console-actions";
import { requireStaff } from "@/lib/auth/staff";
import { isRunningNow } from "@/lib/domain/time";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Subscriptions" };

type SubStatus = Database["public"]["Enums"]["subscription_status"];
const STATUSES: SubStatus[] = ["ACTIVE", "CANCELLED", "PAYMENT_FAILED", "EXPIRED", "SUSPENDED", "REFUNDED"];
const RUNNING: SubStatus[] = ["ACTIVE", "CANCELLED", "PAYMENT_FAILED"];

/**
 * Spec §21 Subscriptions: active, cancelled, payment failed, expired, suspended, refunded. Manual
 * extension with a reason (OD-30 caps it; audited). Extension never creates access: only a running
 * subscription can be extended.
 */
export default async function SubscriptionsPage({ searchParams }: PageProps<"/admin/subscriptions">) {
  await requireStaff("ADMIN");
  const supabase = await createClient();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const selectedId = typeof sp.id === "string" && /^[0-9a-f-]{36}$/i.test(sp.id) ? sp.id : undefined;
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase.rpc("staff_subscriptions", { p_status: status, p_limit: 200 }),
    supabase.rpc("staff_settings"),
  ]);
  const rows = data ?? [];
  const maxDays = settings?.find((s) => s.key === "subscriptions.manual_extension_max_days")?.value as
    number | null | undefined;
  // Linked from a member's page: the subscription may be outside this list's filter or page.
  const selected =
    rows.find((r) => r.subscription_id === selectedId) ??
    (selectedId ? (await supabase.rpc("staff_subscriptions", { p_id: selectedId, p_limit: 1 })).data?.[0] : undefined);
  const extendable =
    selected &&
    selected.source === "MOBILE_MONEY" &&
    RUNNING.includes(selected.status) &&
    isRunningNow(selected.starts_at, selected.expires_at);
  const href = (s?: SubStatus, id?: string) => {
    const q = new URLSearchParams();
    if (s) q.set("status", s);
    if (id) q.set("id", id);
    const str = q.toString();
    return str ? `/admin/subscriptions?${str}` : "/admin/subscriptions";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subscriptions"
        subtitle="Casual access from mobile money and card · extensions are audit-logged"
      />
      <nav aria-label="Filters" className="flex flex-wrap gap-2">
        <FilterChip href={href()} active={!status}>
          All
        </FilterChip>
        {STATUSES.map((s) => (
          <FilterChip key={s} href={href(s)} active={status === s}>
            {titleCase(s)}
          </FilterChip>
        ))}
      </nav>
      {error ? <p role="alert">The list couldn’t load. Refresh to try again.</p> : null}
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <DataTable
            label="Subscriptions"
            head={["Member", "Plan", "Status", "From", "Until"]}
            empty={rows.length === 0}
          >
            {rows.map((r) => (
              <Row key={r.subscription_id} selected={r.subscription_id === selectedId}>
                <Cell>
                  <Link href={`/admin/users/${r.user_id}`} className="underline-offset-4 hover:underline">
                    {r.display_name ?? "Deleted member"}
                  </Link>
                </Cell>
                <Cell>
                  <Link
                    href={href(status, r.subscription_id)}
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                    aria-current={r.subscription_id === selectedId ? "page" : undefined}
                  >
                    {r.plan} · {titleCase(r.source)}
                  </Link>
                </Cell>
                <Cell>
                  {titleCase(r.status)}
                  {r.cancel_at_period_end && r.status === "ACTIVE" ? (
                    <div className="text-sm text-muted-foreground">Ends at period end</div>
                  ) : null}
                </Cell>
                <Cell className="whitespace-nowrap">{when(r.starts_at)}</Cell>
                <Cell className="whitespace-nowrap">{when(r.expires_at)}</Cell>
              </Row>
            ))}
          </DataTable>
        </div>
        {selected ? (
          <Panel title="Extend" className="w-[340px] shrink-0">
            <p className="text-[15px]">
              {selected.display_name ?? "Deleted member"} · {selected.plan} · until {when(selected.expires_at)}
            </p>
            {extendable ? (
              <StaffForm action={extendSubscriptionAction} label="Extend subscription">
                <input type="hidden" name="subscriptionId" value={selected.subscription_id} />
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Days to add{maxDays ? ` (up to ${maxDays} in total per pass)` : ""}
                  <input
                    type="number"
                    name="days"
                    min={1}
                    max={maxDays ?? undefined}
                    defaultValue={1}
                    required
                    className={controlClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  Reason
                  <input
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                    placeholder="e.g. Outage on 12 Oct"
                    className={controlClass}
                  />
                </label>
                <StaffSubmit>Extend</StaffSubmit>
                {maxDays == null ? (
                  <p className="text-sm text-muted-foreground">
                    The extension limit (OD-30) isn’t set yet, so nothing can be extended.
                  </p>
                ) : null}
              </StaffForm>
            ) : selected.source === "CARD" ? (
              <p className="text-sm text-muted-foreground">Card plans are extended at the card processor, not here.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Only a pass that is running now can be extended.</p>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
