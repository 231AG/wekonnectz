import Link from "next/link";

import { ClaimEvidence } from "@/components/admin/claim-evidence";
import { StaffForm, StaffSubmit } from "@/components/admin/staff-form";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { approveClaimAction, needsInfoAction, openClaimEvidence, rejectClaimAction } from "@/lib/admin/claim-actions";
import { requireStaff } from "@/lib/auth/staff";
import { formatDuration, formatLiberiaTime, formatUsd } from "@/lib/domain/money";
import { timeAgo } from "@/lib/domain/time";
import { REJECTION_REASONS_STAFF } from "@/lib/payments/claims/labels";
import { accountRef } from "@/lib/safety/categories";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { PROVIDER_LABELS } from "@/lib/validation/payments";

export const metadata = { title: "Payment claims" };

type Detail = {
  claim_id: string;
  user_id: string | null;
  display_name: string | null;
  own_claim: boolean;
  plan_name: string;
  plan_price: number;
  duration_hours: number;
  provider: "ORANGE_MONEY" | "MTN_MOMO";
  wallet: string;
  reference_code: string;
  transaction_id: string;
  sender_phone: string;
  amount: number;
  currency: string;
  paid_at: string;
  status: "PENDING_REVIEW" | "NEEDS_INFO" | "APPROVED" | "REJECTED" | "CANCELLED";
  staff_question: string | null;
  member_note: string | null;
  has_evidence: boolean;
  created_at: string;
  access_until: string | null;
  flags: string[];
  earlier_claims: { status: string; amount: number; rejection_reason: string | null; created_at: string }[];
};

const FLAG_LABELS: Record<string, string> = {
  DUPLICATE_EVIDENCE: "Same screenshot used on another claim",
  REUSED_TRANSACTION: "Transaction ID used on an earlier claim",
  REPEATED_REJECTED_CLAIMS: "Member has several rejected claims",
};

const CHECKS = [
  ["foundInWallet", "Found this transaction ID in the merchant wallet’s own records"],
  ["amountMatches", "The wallet record shows exactly the plan price"],
  ["senderMatches", "The sender number matches the wallet record"],
  ["timeMatches", "The date and time match"],
] as const;

const select = "min-h-11 rounded-control border-[1.5px] border-border bg-background px-3 text-[15px]";

/**
 * Payment claims queue (spec §16, §21). ADMIN+ only; oldest first. A screenshot is never enough
 * (BR-38): the admin finds the payment in the wallet records, ticks the checks and approves.
 */
export default async function PaymentClaimsPage({ searchParams }: PageProps<"/admin/payments">) {
  await requireStaff("ADMIN");
  const supabase = await createClient();
  const { id } = await searchParams;
  const selectedId = typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined;
  const { data: rows, error: queueError } = await supabase.rpc("staff_claims_queue", { p_limit: 100 });
  const queue = queueError ? [] : (rows ?? []);
  let detail: Detail | null = null;
  if (selectedId) {
    const { data } = await supabase.rpc("staff_claim_detail", { p_claim: selectedId });
    detail = (data as Detail | null) ?? null;
  }
  const decidable = detail?.status === "PENDING_REVIEW" && !detail.own_claim;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Payment claims</h1>
        <p className="text-muted-foreground">Oldest first · a screenshot is never enough · every action is logged</p>
      </div>
      {queueError ? <p role="alert">The queue couldn’t load. Refresh to try again.</p> : null}
      <div className="flex items-start gap-6">
        <nav aria-label="Claims" className="w-[320px] shrink-0 rounded-card border border-border bg-surface-1 p-3">
          {queue.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No payments waiting.</p> : null}
          <ul className="flex flex-col gap-1">
            {queue.map((q) => (
              <li key={q.claim_id}>
                <Link
                  href={`/admin/payments?id=${q.claim_id}`}
                  prefetch={false}
                  aria-current={q.claim_id === selectedId ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 flex-col rounded-xl px-3 py-2.5 hover:bg-surface-2",
                    q.claim_id === selectedId && "bg-surface-2",
                  )}
                >
                  <span className="font-bold">
                    {q.plan_name} · {formatUsd(Number(q.amount))}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {q.user_id ? accountRef(q.user_id) : "Deleted account"} ·{" "}
                    {PROVIDER_LABELS[q.provider as "MTN_MOMO"]} · {timeAgo(q.created_at)}
                  </span>
                  <span className="mt-1 flex gap-2">
                    {q.status === "NEEDS_INFO" ? <Badge tone="casual">Waiting for member</Badge> : null}
                    {Number(q.flags) ? <Badge tone="danger">Flagged</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-label="Claim" className="min-w-0 flex-1 rounded-card border border-border bg-surface-1 p-6">
          {!selectedId ? <p className="text-muted-foreground">Choose a claim to review.</p> : null}
          {selectedId && !detail ? <p role="alert">This claim doesn’t exist.</p> : null}
          {detail ? (
            <div className="grid grid-cols-[1fr_360px] gap-6">
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="font-display text-[24px] font-bold">
                    {detail.plan_name} · {formatUsd(Number(detail.amount))} {detail.currency}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {detail.user_id ? accountRef(detail.user_id) : "Deleted account"} ·{" "}
                    {detail.display_name ?? "Member"} · submitted {timeAgo(detail.created_at)}
                    {detail.access_until ? ` · access until ${formatLiberiaTime(detail.access_until)}` : ""}
                  </p>
                </div>
                {detail.flags.length ? (
                  <ul className="flex flex-wrap gap-2" aria-label="Flags">
                    {detail.flags.map((f) => (
                      <li key={f}>
                        <Badge tone="danger">{FLAG_LABELS[f] ?? f}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-[15px]">
                  <dt className="text-muted-foreground">Wallet</dt>
                  <dd>
                    {PROVIDER_LABELS[detail.provider]} · {detail.wallet}
                  </dd>
                  <dt className="text-muted-foreground">Transaction ID</dt>
                  <dd className="font-mono font-bold">{detail.transaction_id}</dd>
                  <dt className="text-muted-foreground">Sender number</dt>
                  <dd className="font-mono">{detail.sender_phone}</dd>
                  <dt className="text-muted-foreground">Paid at (GMT)</dt>
                  <dd>{formatLiberiaTime(detail.paid_at)}</dd>
                  <dt className="text-muted-foreground">Plan price</dt>
                  <dd>
                    {formatUsd(Number(detail.plan_price))} · {formatDuration(detail.duration_hours)}
                  </dd>
                  <dt className="text-muted-foreground">Reference code</dt>
                  <dd className="font-mono">{detail.reference_code}</dd>
                </dl>
                {detail.member_note ? (
                  <p className="rounded-control bg-background p-3 text-[15px]">
                    <span className="block text-[13px] font-semibold text-muted-foreground">Member’s answer</span>
                    {detail.member_note}
                  </p>
                ) : null}
                {detail.status === "NEEDS_INFO" ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Waiting for the member to answer: “{detail.staff_question}”
                  </p>
                ) : null}
                {detail.earlier_claims.length ? (
                  <div className="text-sm text-muted-foreground">
                    <p className="font-semibold">Earlier claims</p>
                    <ul>
                      {detail.earlier_claims.slice(0, 5).map((c, i) => (
                        <li key={i}>
                          {c.status.toLowerCase().replace("_", " ")} · {formatUsd(Number(c.amount))} ·{" "}
                          {timeAgo(c.created_at)}
                          {c.rejection_reason ? ` · ${c.rejection_reason.toLowerCase().replace(/_/g, " ")}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {detail.status === "APPROVED" || detail.status === "REJECTED" || detail.status === "CANCELLED" ? (
                  <p role="status" className="font-bold">
                    This claim is {detail.status.toLowerCase()}.
                  </p>
                ) : null}
                {detail.own_claim ? <p role="alert">This is your own account. Another admin must decide it.</p> : null}
                {decidable ? (
                  <>
                    <StaffForm action={approveClaimAction} label="Approve">
                      <input type="hidden" name="claimId" value={detail.claim_id} />
                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">
                          Before approving (BR-38)
                        </legend>
                        {CHECKS.map(([name, label]) => (
                          <label key={name} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
                            <input type="checkbox" name={name} className="size-5 accent-pending" />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                      <StaffSubmit>Approve and start the pass</StaffSubmit>
                    </StaffForm>
                    <StaffForm action={rejectClaimAction} label="Reject">
                      <input type="hidden" name="claimId" value={detail.claim_id} />
                      <div className="flex gap-3">
                        <select
                          name="reason"
                          aria-label="Rejection reason"
                          defaultValue=""
                          className={cn(select, "flex-1")}
                        >
                          <option value="">Rejection reason…</option>
                          {Object.entries(REJECTION_REASONS_STAFF).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <StaffSubmit variant="danger">Reject</StaffSubmit>
                      </div>
                    </StaffForm>
                    <StaffForm action={needsInfoAction} label="Ask the member">
                      <input type="hidden" name="claimId" value={detail.claim_id} />
                      <label htmlFor="question" className="text-[13px] font-semibold text-muted-foreground">
                        Ask the member (they see this)
                      </label>
                      <Textarea id="question" name="question" maxLength={300} className="min-h-16" />
                      <StaffSubmit variant="secondary">Ask for more information</StaffSubmit>
                    </StaffForm>
                  </>
                ) : null}
                {detail.status === "NEEDS_INFO" && !detail.own_claim ? (
                  <StaffForm action={rejectClaimAction} label="Reject">
                    <input type="hidden" name="claimId" value={detail.claim_id} />
                    <div className="flex gap-3">
                      <select
                        name="reason"
                        aria-label="Rejection reason"
                        defaultValue=""
                        className={cn(select, "flex-1")}
                      >
                        <option value="">Rejection reason…</option>
                        {Object.entries(REJECTION_REASONS_STAFF).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <StaffSubmit variant="danger">Reject</StaffSubmit>
                    </div>
                  </StaffForm>
                ) : null}
              </div>
              <div>
                {detail.has_evidence && !detail.own_claim ? (
                  <ClaimEvidence key={detail.claim_id} claimId={detail.claim_id} open={openClaimEvidence} />
                ) : (
                  <p className="text-sm text-muted-foreground">No screenshot available.</p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
