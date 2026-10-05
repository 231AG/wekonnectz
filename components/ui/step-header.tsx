import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Onboarding header: back button, "Step N of M", progress bar (mock-ups: onboarding 02–07). */
function StepHeader({ step, total, backHref }: { step: number; total: number; backHref?: string }) {
  const percent = Math.round((step / total) * 100);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-h-11 items-center">
        {backHref ? (
          <Button asChild variant="secondary" size="icon" aria-label="Back">
            <Link href={backHref}>
              <ArrowLeft className="size-5" strokeWidth={1.8} />
            </Link>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground">
          <span>
            Step {step} of {total}
          </span>
          <span>{percent}%</span>
        </div>
        <div
          className="h-1 rounded bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`Step ${step} of ${total}`}
          aria-label="Sign-up progress"
        >
          <div className="bg-primary-gradient h-1 rounded" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

export { StepHeader };
