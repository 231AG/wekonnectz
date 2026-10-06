import Link from "next/link";

import { MobileScreen } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not eligible" };

/** Shown after an under-18 date of birth (BR-4). No account is created. */
export default function NotEligiblePage() {
  return (
    <MobileScreen
      className="justify-center text-center"
      footer={
        <Button asChild variant="outline">
          <Link href="/">Back to start</Link>
        </Button>
      }
    >
      <h1 className="font-display text-[28px] leading-[33px] font-bold">WeKonnectz is for adults only</h1>
      <p className="text-[15px] leading-[22px] text-muted-foreground">
        You must be 18 or older to use WeKonnectz. We haven’t created an account or kept your details.
      </p>
    </MobileScreen>
  );
}
