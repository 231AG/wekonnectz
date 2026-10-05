import { AdminShell } from "@/components/ui/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { assertUiKitEnabled } from "@/lib/dev/ui-kit";

export const metadata = { title: "UI kit · admin" };

export default async function UiKitAdminPage() {
  await assertUiKitEnabled();
  return (
    <AdminShell role="MODERATOR" staffName="Test Moderator" activeHref="/admin">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-[34px] font-bold">Admin shell</h1>
          <p className="text-muted-foreground">Phase 0 skeleton · moderator view hides Payments and Settings</p>
        </div>
        <Badge tone="pending">Sample data</Badge>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-4">
        {["Verification selfies waiting", "Photos waiting", "High-priority reports"].map((label) => (
          <Card key={label} className="flex items-center justify-between">
            <span className="font-semibold">{label}</span>
            <span className="text-pending">—</span>
          </Card>
        ))}
      </div>
      <div className="mt-8 flex max-w-sm gap-3">
        <Button variant="danger" size="md" className="flex-1">
          Reject
        </Button>
        <Button size="md" className="flex-1">
          Approve
        </Button>
      </div>
    </AdminShell>
  );
}
