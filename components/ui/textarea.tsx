import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-32 w-full resize-y rounded-control border-[1.5px] border-border bg-surface-1 px-4 py-3 text-base leading-6 text-foreground placeholder:text-muted-foreground",
        "focus-visible:border-pending focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-pending aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
