import Link from "next/link";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Account deleted" };

/** After deleting an account (spec §8). */
export default function GoodbyePage() {
  return (
    <MobileScreen>
      <ScreenTitle>Your account is deleted</ScreenTitle>
      <ScreenLead>Your profile is no longer visible to anyone. Thank you for using WeKonnectz.</ScreenLead>
      <Button asChild variant="outline">
        <Link href="/">Back to the start</Link>
      </Button>
    </MobileScreen>
  );
}
