import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, ChevronRight, Images, Pencil, Receipt, ShieldCheck, Sparkles, UserX } from "lucide-react";

import { MemberShell } from "@/components/layout/member-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signOut } from "@/lib/auth/actions/login";
import { nextStepFor, requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My profile" };

const LINKS = [
  { href: "/onboarding/about", label: "Name, area and what you’re looking for", icon: Pencil },
  { href: "/onboarding/interests", label: "Interests and bio", icon: Sparkles },
  { href: "/onboarding/photos", label: "Photos", icon: Images },
  { href: "/me/payments", label: "Subscription & payments", icon: Receipt },
  { href: "/account/blocked", label: "Blocked members", icon: UserX },
  { href: "/safety", label: "Staying safe", icon: ShieldCheck },
];

/** My profile (spec §20), the parts that exist so far. Editing reuses the onboarding steps. */
export default async function MePage() {
  const member = await requireMember();
  if (member.status !== "ACTIVE" && member.status !== "SUSPENDED") redirect(nextStepFor(member));
  const { data: profile } = await (
    await createClient()
  )
    .from("profiles")
    .select("display_name")
    .eq("user_id", member.id)
    .single();
  const links = member.status === "SUSPENDED" ? LINKS.slice(3) : LINKS;
  return (
    <MemberShell>
      <h1 className="flex items-center gap-2 font-display text-[34px] font-bold">
        {profile?.display_name ?? "My profile"}
        {member.onboarding.verification === "VERIFIED" ? (
          <BadgeCheck className="size-7 text-verified" strokeWidth={1.8} aria-label="Verified" role="img" />
        ) : null}
      </h1>
      <nav aria-label="Profile" className="flex flex-col gap-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="rounded-card focus-visible:outline-2 focus-visible:outline-ring">
            <Card className="flex items-center gap-3.5 hover:bg-surface-2">
              <Icon className="size-6 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
              <span className="flex-1 font-bold">{label}</span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Card>
          </Link>
        ))}
      </nav>
      <form action={signOut} className="mt-auto">
        <Button type="submit" variant="outline">
          Log out
        </Button>
      </form>
    </MemberShell>
  );
}
