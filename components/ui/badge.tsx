import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide uppercase", {
  variants: {
    tone: {
      approved: "bg-success text-on-success",
      pending: "bg-pending text-on-accent",
      relationship: "bg-relationship text-on-accent",
      casual: "bg-casual text-on-accent",
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
