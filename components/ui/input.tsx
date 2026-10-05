import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-[52px] w-full rounded-control border-[1.5px] border-border bg-surface-1 px-4 text-base text-foreground placeholder:text-muted-foreground",
        "outline-none focus-visible:border-pending aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label data-slot="label" className={cn("text-[13px] font-semibold text-muted-foreground", className)} {...props} />
  );
}

export { Input, Label };
