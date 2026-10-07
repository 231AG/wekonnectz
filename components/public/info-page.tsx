import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { MobileScreen, ScreenTitle } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Public information pages (spec §3 rule 9: reachable from anywhere). */
function InfoPage({
  title,
  draft = false,
  version,
  children,
}: {
  title: string;
  draft?: boolean;
  version?: string;
  children: React.ReactNode;
}) {
  return (
    <MobileScreen>
      <div className="flex min-h-11 items-center">
        <Button asChild variant="secondary" size="icon" aria-label="Back to start">
          <Link href="/">
            <ArrowLeft className="size-5" strokeWidth={1.8} />
          </Link>
        </Button>
      </div>
      <ScreenTitle>{title}</ScreenTitle>
      {draft ? (
        <Card tone="notice" className="p-3.5 text-sm font-semibold text-pending">
          DRAFT — NOT FOR USE. Final text follows legal review (owner task T-12).
        </Card>
      ) : null}
      {version ? <p className="text-xs text-muted-foreground">Version {version}</p> : null}
      <div className="flex flex-col gap-4 text-[15px] leading-[23px] text-muted-foreground [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
        {children}
      </div>
    </MobileScreen>
  );
}

export { InfoPage };
