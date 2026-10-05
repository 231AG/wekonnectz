import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-card border p-[18px]", {
  variants: {
    tone: {
      default: "border-border bg-surface-1",
      relationship: "border-relationship/30 bg-relationship/10",
      casual: "border-casual/30 bg-casual/10",
      notice: "border-pending/30 bg-pending/10",
      dashed: "border-dashed border-border bg-transparent",
    },
  },
  defaultVariants: { tone: "default" },
});

function Card({ className, tone, ...props }: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ tone, className }))} {...props} />;
}

export { Card, cardVariants };
