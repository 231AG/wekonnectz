"use client";

import * as React from "react";
import { Dialog } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Bottom sheet for member screens (photo options now; report / block in Phase 5). Radix Dialog gives
 * focus trapping, Escape to close and aria-modal; the sheet sits at phone width at the bottom.
 */
function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[430px] flex-col gap-4 rounded-t-3xl border border-b-0",
            "border-border bg-surface-1 px-5 pt-5 pb-8 focus:outline-none",
          )}
        >
          <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
          <Dialog.Title className="font-display text-lg font-bold">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="text-sm text-muted-foreground">{description}</Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Sheet };
