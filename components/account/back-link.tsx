import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The round back button used at the top of account screens. */
function BackLink({ href, label = "Back" }: { href: string; label?: string }) {
  return (
    <div className="flex min-h-11 items-center">
      <Button asChild variant="secondary" size="icon" aria-label={label}>
        <Link href={href}>
          <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

export { BackLink };
