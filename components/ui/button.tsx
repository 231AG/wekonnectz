import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans font-bold transition-[opacity,background-color,border-color] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary-gradient text-primary-foreground hover:opacity-90",
        casual: "bg-casual text-primary-foreground hover:opacity-90",
        relationship: "bg-relationship text-primary-foreground hover:opacity-90",
        outline: "border-[1.5px] border-border bg-transparent text-foreground hover:bg-surface-1",
        secondary: "border border-border bg-surface-2 text-foreground hover:bg-surface-1",
        danger: "border-[1.5px] border-danger/60 bg-transparent text-danger hover:bg-danger/10",
        ghost: "bg-transparent text-foreground hover:bg-surface-2",
        link: "bg-transparent text-pending underline underline-offset-4 hover:text-foreground",
      },
      size: {
        lg: "min-h-[52px] w-full rounded-control px-5 text-base",
        md: "min-h-11 rounded-control px-4 text-[15px]",
        sm: "min-h-11 rounded-full px-4 text-sm",
        icon: "size-11 rounded-full",
        "icon-lg": "size-16 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "lg" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
}

export { Button, buttonVariants };
