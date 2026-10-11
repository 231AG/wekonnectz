import { WifiOff } from "lucide-react";

import { MobileScreen, ScreenLead, ScreenTitle } from "@/components/layout/mobile-screen";

export const metadata = { title: "You’re offline" };

/** Shown by the service worker when a page can't load without a connection. Holds no member data. */
export default function OfflinePage() {
  return (
    <MobileScreen>
      <div className="mt-16 flex flex-col items-center gap-4 text-center">
        <div className="flex size-[76px] items-center justify-center rounded-full bg-surface-2">
          <WifiOff className="size-9 text-muted-foreground" strokeWidth={1.8} aria-hidden />
        </div>
        <ScreenTitle>You’re offline</ScreenTitle>
        <ScreenLead>Check your data or Wi-Fi, then try again. Your messages are safe and will load when you’re back.</ScreenLead>
        <a href="/home" className="inline-flex min-h-11 items-center font-bold text-pending underline underline-offset-4">
          Try again
        </a>
      </div>
    </MobileScreen>
  );
}
