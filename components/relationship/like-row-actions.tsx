"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LikeResult } from "@/lib/relationship/actions";

/** Like back or pass on someone who liked you. A like back makes a match and opens the chat. */
function LikeRowActions({
  userId,
  name,
  like,
  pass,
}: {
  userId: string;
  name: string;
  like: (id: string) => Promise<LikeResult>;
  pass: (id: string) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="icon"
          aria-label={`Pass on ${name}`}
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await pass(userId);
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          <X className="size-5" strokeWidth={1.8} aria-hidden />
        </Button>
        <Button
          size="icon"
          className="bg-verified text-on-accent hover:opacity-90"
          aria-label={`Like ${name} back`}
          disabled={busy}
          onClick={() =>
            start(async () => {
              const r = await like(userId);
              if (r.error) setError(r.error);
              else if (r.matched && r.conversationId) router.push(`/messages/${r.conversationId}`);
              else router.refresh();
            })
          }
        >
          <Heart className="size-5" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { LikeRowActions };
