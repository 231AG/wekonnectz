import Link from "next/link";

import { Stat, titleCase } from "@/components/admin/console-ui";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/staff";
import { formatUsd } from "@/lib/domain/money";
import { timeAgo } from "@/lib/domain/time";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

type Figures = {
  users: number;
  users_active: number;
  users_verified: number;
  available_now: number;
  needs_refund: number;
  access_by_plan: { source: string; plan: string; members: number }[];
  revenue_30d: { source: string; amount: number }[];
  revenue_all: { source: string; amount: number }[];
};

const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
const bySource = (rows: { source: string; amount: number }[]) =>
  rows.length
    ? rows.map((r) => `${titleCase(r.source)} ${formatUsd(Number(r.amount))}`).join(" · ")
    : "No payments yet";

/**
 * Spec §21 Dashboard. Everyone sees the queues; admins also see members, access by plan, who is
 * available now and revenue by source (§7: analytics are ADMIN).
 */
export default async function AdminDashboardPage() {
  const staff = await requireStaff();
  const supabase = await createClient();
  const isAdmin = staff.role !== "MODERATOR";
  const figures = isAdmin ? ((await supabase.rpc("staff_dashboard")).data as Figures | null) : null;
  const { data } = await supabase.rpc("staff_queue_counts");
  const counts = (data ?? {}) as {
    photos_pending?: number;
    photos_oldest?: string | null;
    verifications_pending?: number;
    verifications_escalated?: number;
    verifications_oldest?: string | null;
    reports_open?: number;
    reports_high?: number;
    flags_open?: number;
    claims_pending?: number;
    claims_oldest?: string | null;
  };
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          {figures ? "Members, access, revenue and queues" : "Queues waiting for a decision"}
        </p>
      </div>
      {figures ? (
        <section aria-label="Figures" className="grid max-w-5xl grid-cols-2 gap-4 xl:grid-cols-4">
          <Stat
            label="Members"
            value={figures.users}
            note={`${figures.users_active} active · ${figures.users_verified} verified`}
            testId="users-total"
          />
          <Stat
            label="Casual access now"
            value={figures.access_by_plan.reduce((s, r) => s + r.members, 0)}
            note={
              figures.access_by_plan.length
                ? figures.access_by_plan.map((r) => `${r.plan} ${r.members}`).join(" · ")
                : "Nobody has a pass"
            }
            testId="access-now"
          />
          <Stat label="Available now" value={figures.available_now} note="In the Casual pool" testId="available-now" />
          <Stat
            label="Revenue, last 30 days"
            value={formatUsd(total(figures.revenue_30d))}
            note={`${bySource(figures.revenue_30d)} · all time ${formatUsd(total(figures.revenue_all))}`}
            testId="revenue-30d"
          />
          {figures.needs_refund ? (
            <Link
              href="/admin/transactions?refund=1"
              className="rounded-card focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Stat label="Card charges to refund" value={figures.needs_refund} note="Duplicate or late charges" />
            </Link>
          ) : null}
        </section>
      ) : null}
      <h2 className="font-display text-xl font-bold">Queues</h2>
      <div className="grid max-w-3xl grid-cols-2 gap-4">
        <Link href="/admin/verification" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex flex-col gap-1 hover:bg-surface-2">
            <span className="text-sm font-semibold text-muted-foreground">Verification selfies waiting</span>
            <span className="font-display text-[32px] font-bold" data-testid="verifications-pending">
              {counts.verifications_pending ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">
              {counts.verifications_oldest ? `Oldest ${timeAgo(counts.verifications_oldest)}` : "Nothing waiting"}
              {counts.verifications_escalated ? ` · ${counts.verifications_escalated} escalated` : ""}
            </span>
          </Card>
        </Link>
        <Link href="/admin/photos" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex flex-col gap-1 hover:bg-surface-2">
            <span className="text-sm font-semibold text-muted-foreground">Photos waiting</span>
            <span className="font-display text-[32px] font-bold" data-testid="photos-pending">
              {counts.photos_pending ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">
              {counts.photos_oldest ? `Oldest ${timeAgo(counts.photos_oldest)}` : "Nothing waiting"}
            </span>
          </Card>
        </Link>
        <Link href="/admin/reports" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex flex-col gap-1 hover:bg-surface-2">
            <span className="text-sm font-semibold text-muted-foreground">Open reports</span>
            <span className="font-display text-[32px] font-bold" data-testid="reports-open">
              {counts.reports_open ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">
              {counts.reports_high ? `${counts.reports_high} high priority` : "None high priority"}
            </span>
          </Card>
        </Link>
        <Link href="/admin/flags" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
          <Card className="flex flex-col gap-1 hover:bg-surface-2">
            <span className="text-sm font-semibold text-muted-foreground">Open flags</span>
            <span className="font-display text-[32px] font-bold" data-testid="flags-open">
              {counts.flags_open ?? 0}
            </span>
            <span className="text-sm text-muted-foreground">Automatic signals to check</span>
          </Card>
        </Link>
        {counts.claims_pending !== undefined ? (
          <Link href="/admin/payments" className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
            <Card className="flex flex-col gap-1 hover:bg-surface-2">
              <span className="text-sm font-semibold text-muted-foreground">Payment claims waiting</span>
              <span className="font-display text-[32px] font-bold" data-testid="claims-pending">
                {counts.claims_pending}
              </span>
              <span className="text-sm text-muted-foreground">
                {counts.claims_oldest ? `Oldest ${timeAgo(counts.claims_oldest)}` : "Nothing waiting"}
              </span>
            </Card>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
