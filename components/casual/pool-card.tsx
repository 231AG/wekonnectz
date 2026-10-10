import Link from "next/link";
import { BadgeCheck, MapPin } from "lucide-react";

import { formatWindowTime } from "@/lib/domain/availability";
import type { PoolCard as PoolCardData } from "@/lib/casual/server";

/** One member in the Available Now grid (member mock-up 03). Photo is a short-lived signed URL (BR-11). */
function PoolCard({ card }: { card: PoolCardData }) {
  return (
    <Link
      href={`/casual/m/${card.userId}`}
      className="flex flex-col gap-2 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      data-testid="pool-card"
    >
      {card.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photoUrl} alt="" className="aspect-square w-full rounded-card object-cover" />
      ) : (
        <span className="aspect-square w-full rounded-card bg-surface-2" aria-hidden />
      )}
      <span className="flex items-center gap-1.5 font-display text-[17px] font-bold">
        {card.displayName}, {card.age}
        {card.verified ? (
          <BadgeCheck className="size-[18px] text-verified" strokeWidth={1.8} aria-label="Verified" role="img" />
        ) : null}
      </span>
      <span className="flex items-center gap-2 text-[14px] text-muted-foreground">
        <span className="size-2.5 rounded-full bg-success" aria-hidden />
        Until {formatWindowTime(card.availableUntil)}
      </span>
      {card.area ? (
        <span className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
          <MapPin className="size-4" strokeWidth={1.8} aria-hidden />
          {card.area}
        </span>
      ) : null}
    </Link>
  );
}

export { PoolCard };
