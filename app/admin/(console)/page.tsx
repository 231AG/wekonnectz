import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

/** Queue sizes that exist so far (photos, verification, reports, flags). The full dashboard (spec §21) arrives in Phase 10. */
export default async function AdminDashboardPage() {
  await requireStaff();
  const { data } = await (await createClient()).rpc("staff_queue_counts");
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
        <p className="text-muted-foreground">Queues waiting for a decision</p>
      </div>
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
