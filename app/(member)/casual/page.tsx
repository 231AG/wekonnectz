import { Flame } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { Card } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/session";

export const metadata = { title: "Casual Connection" };

/** Casual Connection placeholder until passes (Phase 7) and the Available Now pool (Phase 9). */
export default async function CasualPage() {
  await requireMember();
  return (
    <MemberShell>
      <h1 className="font-display text-[34px] font-bold">Casual Connection</h1>
      <Card className="flex flex-col gap-3 border-casual/30 bg-casual/10">
        <Flame className="size-8 text-casual" strokeWidth={1.8} aria-hidden />
        <p className="font-bold">Coming in the next release</p>
        <p className="text-[15px] text-muted-foreground">
          Casual Connection needs a pass. You’ll be able to get one here soon, then meet verified members who are
          available now.
        </p>
      </Card>
    </MemberShell>
  );
}
