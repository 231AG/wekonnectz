"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Heart, MapPin, X } from "lucide-react";

import { FormError } from "@/components/layout/mobile-screen";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import type { LikeResult } from "@/lib/relationship/actions";
import type { MemberCard } from "@/lib/storage/relationship";

/** One profile at a time with Pass and Like (member mock-up 02). A mutual like opens a match sheet. */
function DiscoverCard({
  card,
  like,
  pass,
}: {
  card: MemberCard;
  like: (id: string) => Promise<LikeResult>;
  pass: (id: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  const [match, setMatch] = useState<string | null>(null);

  function act(kind: "like" | "pass") {
    start(async () => {
      setError(undefined);
      const result = kind === "like" ? await like(card.userId) : await pass(card.userId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (kind === "like" && (result as LikeResult).matched) {
        setMatch((result as LikeResult).conversationId ?? "");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <article
        aria-label={`${card.displayName}, ${card.age}`}
        className="relative overflow-hidden rounded-card border border-border bg-surface-1"
      >
        <Link href={`/m/${card.userId}`} className="block focus-visible:outline-2 focus-visible:outline-ring">
          {card.photoUrl ? (
            // Short-lived signed URL (BR-11).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.photoUrl}
              alt={`${card.displayName}’s main photo`}
              className="aspect-[350/400] w-full object-cover"
            />
          ) : (
            <div className="aspect-[350/400] w-full bg-surface-2" />
          )}
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-background/80 p-5 backdrop-blur-sm">
            <h2 className="flex items-center gap-2 font-display text-[28px] leading-tight font-bold">
              {card.displayName}, {card.age}
              {card.verified ? (
                <BadgeCheck className="size-6 text-verified" strokeWidth={1.8} aria-label="Verified" role="img" />
              ) : null}
            </h2>
            {card.area ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="size-[18px]" strokeWidth={1.8} aria-hidden />
                {card.area}
              </p>
            ) : null}
            {card.bio ? <p className="line-clamp-3 text-[16px]">{card.bio}</p> : null}
            {card.interests.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Interests">
                {card.interests.slice(0, 4).map((i) => (
                  <li key={i} className="rounded-full border border-border bg-surface-1 px-3.5 py-1.5 text-sm">
                    {i}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Link>
      </article>
      <FormError>{error}</FormError>
      <div className="flex justify-center gap-6">
        <Button
          variant="secondary"
          size="icon-lg"
          aria-label={`Pass on ${card.displayName}`}
          disabled={busy}
          onClick={() => act("pass")}
        >
          <X className="size-7" strokeWidth={1.8} aria-hidden />
        </Button>
        <Button
          size="icon-lg"
          className="bg-verified text-on-accent hover:opacity-90"
          aria-label={`Like ${card.displayName}`}
          disabled={busy}
          onClick={() => act("like")}
        >
          <Heart className="size-7" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>

      <Sheet
        open={match !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMatch(null);
            router.refresh();
          }
        }}
        title="It’s a match!"
        description={`You and ${card.displayName} like each other. Say hello — and never send money to someone you haven’t met.`}
      >
        {match ? (
          <Button asChild>
            <Link href={`/messages/${match}`}>Send a message</Link>
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={() => {
            setMatch(null);
            router.refresh();
          }}
        >
          Keep browsing
        </Button>
      </Sheet>
    </>
  );
}

export { DiscoverCard };
