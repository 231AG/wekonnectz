import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PoolCard } from "@/components/casual/pool-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { savedList } from "@/lib/casual/server";

export const metadata = { title: "Saved" };

/** Saved profiles (spec §13): only members the viewer may still see in the pool are listed. */
export default async function SavedPage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE") redirect(nextStepFor(member));
  const saved = await savedList(member.id);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-5 px-5 pt-5 pb-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Back">
          <Link href="/casual">
            <ArrowLeft className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
        </Button>
        <h1 className="flex-1 text-center font-display text-[20px] font-bold">Saved</h1>
        <span className="size-11" aria-hidden />
      </header>
      {saved.length ? (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6" aria-label="Saved members available now">
          {saved.map((c) => (
            <li key={c.userId}>
              <PoolCard card={c} />
            </li>
          ))}
        </ul>
      ) : (
        <Card tone="dashed" data-testid="saved-empty">
          <p className="text-[15px] text-muted-foreground">
            No saved members are available right now. Saved members show here while they’re in the pool.
          </p>
        </Card>
      )}
    </div>
  );
}
