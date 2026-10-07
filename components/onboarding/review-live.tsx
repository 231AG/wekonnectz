"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** Refreshes the Under review screen while it is open, so outcomes appear without a reload. */
function ReviewAutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, everyMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, everyMs]);
  return null;
}

/** Spec §10 step 11: "User can edit while waiting." */
function EditWhileWaiting() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/onboarding/about", label: "About you" },
    { href: "/onboarding/interests", label: "Interests & bio" },
    { href: "/onboarding/photos", label: "Photos" },
  ];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Edit profile while you wait
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Edit your profile">
        <nav aria-label="Edit profile" className="flex flex-col gap-2">
          {links.map((l) => (
            <Button key={l.href} asChild variant="secondary">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
        </nav>
      </Sheet>
    </>
  );
}

export { EditWhileWaiting, ReviewAutoRefresh };
