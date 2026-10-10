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
import { Badge } from "@/components/ui/badge";
import { recordRefundAction } from "@/lib/admin/console-actions";
import { requireStaff } from "@/lib/auth/staff";
import { formatUsd } from "@/lib/domain/money";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Payments & events" };

type Source = Database["public"]["Enums"]["payment_source"];
type Status = Database["public"]["Enums"]["payment_status"];
const SOURCES: Source[] = ["MOBILE_MONEY", "CARD"];
const STATUSES: Status[] = ["SUCCEEDED", "REFUNDED", "FAILED", "PENDING"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spec §21 Payments & events: every payment with source, provider, amount, status and its event
 * history, and the card webhook log. Refunds paid out by hand (wallet transfer or the processor's
 * dashboard; OD-13 decides when) are recorded here, which ends the access they paid for.
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/admin/transactions">) {
  await requireStaff("ADMIN");
  const supabase = await createClient();
  const sp = await searchParams;
  const view = sp.view === "webhooks" ? "webhooks" : "payments";
  const source = SOURCES.find((s) => s === sp.source);
  const status = STATUSES.find((s) => s === sp.status);
  const needsRefund = sp.refund === "1";
  const selectedId = typeof sp.id === "string" && UUID.test(sp.id) ? sp.id : undefined;

  const href = (next: {
    view?: string;
    source?: Source | null;
    status?: Status | null;
    refund?: boolean;
    id?: string;
  }) => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v === "webhooks") q.set("view", "webhooks");
    else {
      const s = next.source === undefined ? source : next.source;
      const st = next.status === undefined ? status : next.status;
      if (s) q.set("source", s);
      if (st) q.set("status", st);
      if (next.refund ?? needsRefund) q.set("refund", "1");
      if (next.id) q.set("id", next.id);
    }
    const str = q.toString();
    return str ? `/admin/transactions?${str}` : "/admin/transactions";
  };

  const tabs = (
    <nav aria-label="View" className="flex flex-wrap gap-2">
      <FilterChip href={href({ view: "payments" })} active={view === "payments"}>
        Payments
      </FilterChip>
      <FilterChip href={href({ view: "webhooks" })} active={view === "webhooks"}>
        Card webhook log
      </FilterChip>
    </nav>
  );

  if (view === "webhooks") {
    const { data, error } = await supabase.rpc("staff_webhook_log", { p_limit: 200 });
    const rows = data ?? [];
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Payments & events" subtitle="Every card webhook delivery, valid or not · newest first" />
        {tabs}
        {error ? <p role="alert">The log couldn’t load. Refresh to try again.</p> : null}
        <DataTable
          label="Card webhook log"
          head={["Received", "Processor", "Event", "Type", "Signature", "Details"]}
          empty={rows.length === 0}
        >
          {rows.map((r) => (
            <Row key={r.event_id}>
              <Cell className="whitespace-nowrap">{when(r.received_at)}</Cell>
              <Cell>{r.processor ?? "—"}</Cell>
              <Cell className="font-mono text-sm">{r.processor_event_id ?? "—"}</Cell>
              <Cell>{titleCase(r.type.replace(/^CARD_/, ""))}</Cell>
              <Cell>
                {r.signature_valid ? <Badge tone="approved">Valid</Badge> : <Badge tone="danger">Invalid</Badge>}
              </Cell>
              <Cell className="max-w-[360px] font-mono text-xs break-all text-muted-foreground">
                {JSON.stringify(r.payload)}
              </Cell>
            </Row>
          ))}
        </DataTable>
      </div>
    );
  }

  const { data, error } = await supabase.rpc("staff_payments", {
    p_source: source,
    p_status: status,
    p_needs_refund: needsRefund,
    p_limit: 200,
  });
  const rows = data ?? [];
  // Linked from a member's page: the payment may be outside this list's filter or page.
  const selected =
    rows.find((r) => r.payment_id === selectedId) ??
    (selectedId ? (await supabase.rpc("staff_payments", { p_id: selectedId, p_limit: 1 })).data?.[0] : undefined);
  const events = selected
    ? ((await supabase.rpc("staff_payment_events", { p_payment: selected.payment_id })).data ?? [])
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments & events" subtitle="Every payment and its history · refunds are audit-logged" />
      {tabs}
      <nav aria-label="Filters" className="flex flex-wrap gap-2">
        <FilterChip href={href({ source: null })} active={!source}>
          Any source
        </FilterChip>
        {SOURCES.map((s) => (
          <FilterChip key={s} href={href({ source: s })} active={source === s}>
            {titleCase(s)}
          </FilterChip>
        ))}
        <span className="mx-2 w-px bg-border" aria-hidden />
        <FilterChip href={href({ status: null })} active={!status}>
          Any status
        </FilterChip>
        {STATUSES.map((s) => (
          <FilterChip key={s} href={href({ status: s })} active={status === s}>
            {titleCase(s)}
          </FilterChip>
        ))}
        <span className="mx-2 w-px bg-border" aria-hidden />
        <FilterChip href={href({ refund: !needsRefund })} active={needsRefund}>
          Needs refund
        </FilterChip>
      </nav>
      {error ? <p role="alert">The list couldn’t load. Refresh to try again.</p> : null}
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <DataTable
            label="Payments"
            head={["Paid", "Member", "Plan", "Amount", "Provider", "Status"]}
            empty={rows.length === 0}
          >
            {rows.map((r) => (
              <Row key={r.payment_id} selected={r.payment_id === selectedId}>
                <Cell className="whitespace-nowrap">
                  <Link
                    href={href({ id: r.payment_id })}
                    aria-current={r.payment_id === selectedId ? "page" : undefined}
                    className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
                  >
                    {when(r.paid_at)}
                  </Link>
                </Cell>
                <Cell>
                  {r.user_id ? (
                    <Link href={`/admin/users/${r.user_id}`} className="underline-offset-4 hover:underline">
                      {r.display_name ?? "Member"}
                    </Link>
                  ) : (
                    "Purged account"
                  )}
                </Cell>
                <Cell>{r.plan}</Cell>
                <Cell>
                  {formatUsd(Number(r.amount))} {r.currency}
                </Cell>
                <Cell>{titleCase(r.provider)}</Cell>
                <Cell>
                  {titleCase(r.status)}
                  {r.needs_refund ? <div className="text-sm font-semibold text-danger">Needs refund</div> : null}
                </Cell>
              </Row>
            ))}
          </DataTable>
        </div>
        {selected ? (
          <Panel title="Payment" className="w-[380px] shrink-0">
            <dl className="grid grid-cols-2 gap-3 text-[15px]">
              <div>
                <dt className="text-sm text-muted-foreground">Amount</dt>
                <dd>
                  {formatUsd(Number(selected.amount))} {selected.currency}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>{titleCase(selected.status)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sm text-muted-foreground">Transaction</dt>
                <dd className="font-mono text-sm break-all">{selected.transaction_id}</dd>
              </div>
            </dl>
            <h3 className="font-semibold">History</h3>
            <ol className="flex flex-col gap-2 text-sm">
              {events.map((e) => (
                <li key={e.event_id}>
                  <span className="font-semibold">{titleCase(e.type)}</span> · {when(e.received_at)}
                  {e.actor ? ` · ${e.actor}` : ""}
                  <div className="font-mono text-xs break-all text-muted-foreground">{JSON.stringify(e.payload)}</div>
                </li>
              ))}
              {events.length === 0 ? <li className="text-muted-foreground">No events.</li> : null}
            </ol>
            {/* Kept mounted after the refund so its confirmation stays on screen. */}
            <StaffForm action={recordRefundAction} label="Record refund">
              {selected.status === "SUCCEEDED" ? (
                <>
                  <input type="hidden" name="paymentId" value={selected.payment_id} />
                  <h3 className="font-semibold">Record a refund</h3>
                  <p className="text-sm text-muted-foreground">
                    {selected.source === "CARD"
                      ? "Refund the charge in the card processor’s dashboard first, then record it here."
                      : "Send the money back from the merchant wallet first, then record it here."}{" "}
                    The access this payment bought ends.
                  </p>
                  <input
                    name="reason"
                    aria-label="Refund reason"
                    required
                    minLength={5}
                    maxLength={500}
                    placeholder="Reason"
                    className={controlClass}
                  />
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input type="checkbox" name="confirm" required className="size-5 accent-danger" />
                    The money has been sent back
                  </label>
                  <StaffSubmit variant="danger">Record refund</StaffSubmit>
                </>
              ) : null}
            </StaffForm>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
