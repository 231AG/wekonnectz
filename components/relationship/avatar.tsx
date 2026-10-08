import { cn } from "@/lib/utils";

/** Round photo, or the first letter when the photo can't be shown. */
function Avatar({ url, name, className }: { url: string | null; name: string; className?: string }) {
  return url ? (
    // Short-lived signed URL (BR-11).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={cn("size-14 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-xl font-bold text-muted-foreground",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export { Avatar };
