import Link from "next/link";

import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/staff";
import { timeAgo } from "@/lib/domain/time";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

/** Phase 3: queue sizes that exist so far. The full dashboard (spec §21) arrives in Phase 10. */
export default async function AdminDashboardPage() {
  await requireStaff();
  const { data } = await (await createClient()).rpc("staff_queue_counts");
  const counts = (data ?? {}) as { photos_pending?: number; photos_oldest?: string | null };
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[34px] font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Queues waiting for a decision</p>
      </div>
      <div className="grid max-w-3xl grid-cols-2 gap-4">
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
      </div>
    </div>
  );
}
