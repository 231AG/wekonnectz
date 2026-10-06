import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { MobileScreen } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not available" };

/** Region blocked (spec §3 rule 8). Exact copy; no detail on how the check works. */
export default function RegionBlockedPage() {
  return (
    <MobileScreen
      className="items-center justify-center text-center"
      footer={
        <Button asChild variant="outline">
          <Link href="/">Back to start</Link>
        </Button>
      }
    >
      <LogoMark className="w-24" />
      <h1 className="font-display text-[26px] leading-[32px] font-bold">
        This platform is currently available only in Liberia.
      </h1>
    </MobileScreen>
  );
}
