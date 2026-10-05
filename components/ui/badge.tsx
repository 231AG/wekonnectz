import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide uppercase", {
  variants: {
    tone: {
      approved: "bg-success text-[#0E2A1B]",
      pending: "bg-pending text-[#17140E]",
      relationship: "bg-relationship text-[#17140E]",
      casual: "bg-casual text-[#17140E]",
      danger: "bg-danger/15 text-danger",
      neutral: "bg-surface-2 text-muted-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

function Badge({ className, tone, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, className }))} {...props} />;
}

export { Badge, badgeVariants };
